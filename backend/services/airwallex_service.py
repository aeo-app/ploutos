"""
services/airwallex_service.py — Airwallex payment gateway integration
========================================================================
API reference confirmed against Airwallex's current docs (2026):
  - Auth:     POST {base}/api/v1/authentication/login
              headers: x-client-id, x-api-key
              -> {"token": "...", "expires_at": "<ISO>"}  (valid ~30 min,
              no refresh token — must re-authenticate; cache and reuse,
              same pattern as the Bedrock STS caching in bedrock_service.py)
  - Create:   POST {base}/api/v1/pa/payment_intents/create
              body: {request_id, amount, currency, merchant_order_id, ...}
              -> {"id", "client_secret", "status", ...}
  - Retrieve: GET  {base}/api/v1/pa/payment_intents/{id}
              -> current status (used for API-polling fallback alongside
              webhooks, since not every payment method confirms instantly)
  - Webhooks: signed via HMAC-SHA256 over `x-timestamp + raw_json_body`,
              using the webhook's own secret key, hex-encoded, compared to
              the `x-signature` header. MUST verify against the raw,
              unparsed body — see verify_webhook_signature below.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
import uuid

import requests

logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────
AIRWALLEX_ENV = os.getenv("AIRWALLEX_ENV", "demo")  # "demo" (sandbox) | "prod"
AIRWALLEX_BASE_URL = (
    "https://api.airwallex.com" if AIRWALLEX_ENV == "prod" else "https://api-demo.airwallex.com"
)
AIRWALLEX_CLIENT_ID = os.getenv("AIRWALLEX_CLIENT_ID", "")
AIRWALLEX_API_KEY = os.getenv("AIRWALLEX_API_KEY", "")
AIRWALLEX_WEBHOOK_SECRET = os.getenv("AIRWALLEX_WEBHOOK_SECRET", "")

# The price is fixed here (server-side), never trusted from the client.
# The price is fixed here (server-side) per plan, never trusted from the
# client — the client only selects WHICH plan_id to pay for, not the amount.
# Same currency across all plans (simplest, standard for a single-market
# SaaS product); add a per-plan currency override later if needed.
PAYMENT_CURRENCY = os.getenv("PAYMENT_CURRENCY", "USD")

PLANS: dict[str, dict] = {
    "starter": {
        "name": "Starter",
        "amount": os.getenv("PLAN_STARTER_PRICE", "29.00"),
        "blurb": "For founders putting AI search on the map.",
        "prompts": "10",
        "highlight": False,
        "features": [
            "1 domain · 10 tracked prompts",
            "Weekly visibility refresh",
            "Tracks 5 answer engines",
            "Monthly site audit",
            "AI agent · 10 messages / day",
            "Email support",
            "Weekly 2 posts on Facebook, Instagram, Google My Business & LinkedIn",
            "Monthly 2 videos",
        ],
    },
    "growth": {
        "name": "Growth",
        # Kept in sync with the marketing landing page's Pricing section
        # ("Simple pricing, priced by prompts") — was 79.00, mismatched.
        "amount": os.getenv("PLAN_GROWTH_PRICE", "99.00"),
        "blurb": "For marketing teams shipping content weekly.",
        "prompts": "50",
        "highlight": True,
        "features": [
            "3 domains · 50 tracked prompts",
            "Daily refresh · all engines",
            "Automated audit fixes",
            "Content engine + brand voice",
            "Unlimited AI agent + Slack alerts",
            "Competitor benchmarking (3 rivals)",
            "Priority support · 4h SLA",
            "Weekly 8 posts on Facebook, Instagram, Google My Business & LinkedIn",
            "Monthly 5 videos",
        ],
    },
    "scale": {
        "name": "Scale",
        # Kept in sync with the marketing landing page — was 199.00, mismatched.
        "amount": os.getenv("PLAN_SCALE_PRICE", "179.00"),
        "blurb": "For agencies and multi-brand portfolios.",
        "prompts": "100",
        "highlight": False,
        "features": [
            "10 domains · 100 tracked prompts",
            "Hourly refresh + custom engines",
            "Unlimited automations + pull requests",
            "White-label reports + client portal",
            "API, webhooks & Postgres mirror",
            "Dedicated AEO strategist · 1h SLA",
            "Weekly 15 posts on Facebook, Instagram, Google My Business & LinkedIn",
            "Monthly 8 videos",
        ],
    },
}
# IMPORTANT — these per-plan feature lists are marketing copy carried over
# verbatim from the landing page. The backend does NOT currently enforce any
# of these as usage caps or feature gates: every paid plan (any plan_id)
# grants identical full access via require_paid_access — see
# core/security.py. Only the PRICE differs today. If usage limits are ever
# enforced to match this copy, that's a separate quota-tracking subsystem,
# not something this catalog implies is already live.


def get_plan(plan_id: str) -> dict:
    """Raises KeyError (caller turns this into a 400) for an unknown plan_id —
    never silently falls back to a default price."""
    return PLANS[plan_id]

REQUEST_TIMEOUT = int(os.getenv("AIRWALLEX_TIMEOUT_SECONDS", "15"))


class AirwallexError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


# ── Token caching (mirrors the Bedrock STS-credential caching pattern) ───────
_token: str | None = None
_token_expiry: float = 0.0


def _get_access_token() -> str:
    global _token, _token_expiry

    if _token and time.time() < _token_expiry - 60:  # refresh 1 min before expiry
        return _token

    if not AIRWALLEX_CLIENT_ID or not AIRWALLEX_API_KEY:
        raise AirwallexError(
            "AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY are not configured. "
            "Set them from Developer > API keys in the Airwallex web app."
        )

    logger.info("[airwallex] refreshing access token...")
    resp = requests.post(
        f"{AIRWALLEX_BASE_URL}/api/v1/authentication/login",
        headers={"x-client-id": AIRWALLEX_CLIENT_ID, "x-api-key": AIRWALLEX_API_KEY},
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise AirwallexError(f"Airwallex auth failed: {resp.status_code} {resp.text}", resp.status_code)

    data = resp.json()
    _token = data["token"]
    # expires_at is an ISO timestamp; fall back to a conservative 25 min if
    # the field is ever missing/unparseable, rather than caching forever.
    try:
        from datetime import datetime
        expiry_dt = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        _token_expiry = expiry_dt.timestamp()
    except Exception:
        _token_expiry = time.time() + 25 * 60

    logger.info("[airwallex] token refreshed")
    return _token


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_get_access_token()}",
        "Content-Type": "application/json",
    }


def _request_with_retry(method: str, path: str, **kwargs) -> dict:
    """One retry on 401 (token might have just expired despite our cache
    check — clock skew, revoked key, etc.) before giving up."""
    url = f"{AIRWALLEX_BASE_URL}{path}"
    for attempt in (1, 2):
        resp = requests.request(method, url, headers=_headers(), timeout=REQUEST_TIMEOUT, **kwargs)
        if resp.status_code == 401 and attempt == 1:
            global _token
            _token = None  # force re-auth
            continue
        if not resp.ok:
            logger.error(f"[airwallex] {method} {path} -> {resp.status_code}: {resp.text}")
            raise AirwallexError(f"Airwallex API error ({resp.status_code}): {resp.text}", resp.status_code)
        return resp.json()
    raise AirwallexError("Airwallex API error: re-authentication did not resolve a 401")


# ── Payment Intents ──────────────────────────────────────────────────────────
def create_payment_intent(user_id: str, plan_id: str) -> dict:
    """
    Creates a PaymentIntent for the fixed, server-decided price of `plan_id`
    (looked up from PLANS — never trusted from the client). Returns the raw
    Airwallex response (contains `id`, `client_secret`, `status`, ...).

    Raises KeyError if plan_id isn't in PLANS — the router turns this into a
    400, not a 500 (it's a client input error, not a server failure).
    """
    plan = get_plan(plan_id)  # raises KeyError for an unknown plan_id
    body = {
        "request_id": str(uuid.uuid4()),  # idempotency key
        "amount": float(plan["amount"]),
        "currency": PAYMENT_CURRENCY,
        "merchant_order_id": f"user_{user_id}_{plan_id}_{uuid.uuid4().hex[:12]}",
        "descriptor": f"{plan['name']} plan"[:126],  # Airwallex caps descriptor length
    }
    return _request_with_retry("POST", "/api/v1/pa/payment_intents/create", json=body)


def get_payment_intent(payment_intent_id: str) -> dict:
    """Retrieve a PaymentIntent's current status directly from Airwallex —
    the API-polling fallback alongside webhooks (some payment methods don't
    confirm instantly, and webhook delivery can occasionally lag or drop)."""
    return _request_with_retry("GET", f"/api/v1/pa/payment_intents/{payment_intent_id}")


# ── Webhook signature verification ──────────────────────────────────────────
def verify_webhook_signature(raw_body: bytes, timestamp: str, signature: str) -> bool:
    """
    Airwallex's documented scheme: HMAC-SHA256(secret, timestamp + raw_body),
    hex digest, compared to the `x-signature` header. Must run against the
    RAW body — re-serialized/parsed JSON will not match.
    """
    if not AIRWALLEX_WEBHOOK_SECRET:
        logger.error("[airwallex] AIRWALLEX_WEBHOOK_SECRET is not configured — refusing to accept webhook")
        return False
    if not timestamp or not signature:
        return False

    value_to_digest = timestamp.encode("utf-8") + raw_body
    expected = hmac.new(
        AIRWALLEX_WEBHOOK_SECRET.encode("utf-8"), value_to_digest, hashlib.sha256
    ).hexdigest()
    # Constant-time comparison — avoid timing side-channels on signature checks.
    return hmac.compare_digest(expected, signature)
