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
PAYMENT_AMOUNT = os.getenv("PAYMENT_AMOUNT", "49.00")
PAYMENT_CURRENCY = os.getenv("PAYMENT_CURRENCY", "USD")
PAYMENT_DESCRIPTION = os.getenv("PAYMENT_DESCRIPTION", "APAC SEO Platform — full access")

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
def create_payment_intent(user_id: str) -> dict:
    """
    Creates a PaymentIntent for the fixed, server-decided price. Returns the
    raw Airwallex response (contains `id`, `client_secret`, `status`, ...).
    """
    body = {
        "request_id": str(uuid.uuid4()),  # idempotency key
        "amount": float(PAYMENT_AMOUNT),
        "currency": PAYMENT_CURRENCY,
        "merchant_order_id": f"user_{user_id}_{uuid.uuid4().hex[:12]}",
        "descriptor": PAYMENT_DESCRIPTION[:126],  # Airwallex caps descriptor length
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
