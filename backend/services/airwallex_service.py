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
import json
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
AIRWALLEX_PRODUCTS_PATH = os.getenv("AIRWALLEX_PRODUCTS_PATH", "/api/v1/products")
AIRWALLEX_CATALOG_CACHE_SECONDS = int(os.getenv("AIRWALLEX_CATALOG_CACHE_SECONDS", "300"))

# The price is fixed here (server-side), never trusted from the client.
# The price is fixed here (server-side) per plan, never trusted from the
# client — the client only selects WHICH plan_id to pay for, not the amount.
# Default currency and prices used when no currency-specific catalog is
# configured. Currency-specific prices should be supplied by the Airwallex
# product catalog configuration below, rather than calculated with FX rates.
PAYMENT_CURRENCY = "SGD"

COUNTRY_CURRENCIES = {
    "SG": "SGD", "Singapore": "SGD",
    "IN": "INR", "India": "INR",
    "US": "USD", "United States": "USD", "United States of America": "USD",
    "GB": "GBP", "United Kingdom": "GBP",
    "AU": "AUD", "Australia": "AUD",
    "NZ": "NZD", "New Zealand": "NZD",
    "CA": "CAD", "Canada": "CAD",
    "AE": "AED", "United Arab Emirates": "AED",
    "MY": "MYR", "Malaysia": "MYR",
    "ID": "IDR", "Indonesia": "IDR",
    "PH": "PHP", "Philippines": "PHP",
    "TH": "THB", "Thailand": "THB",
    "JP": "JPY", "Japan": "JPY",
    "CN": "CNY", "China": "CNY",
    "HK": "HKD", "Hong Kong": "HKD",
    "CH": "CHF", "Switzerland": "CHF",
}


def currency_for_country(country: str | None) -> str:
    """Resolve a registered country to its payment currency."""
    value = (country or "").strip()
    return COUNTRY_CURRENCIES.get(value) or PAYMENT_CURRENCY

PLANS: dict[str, dict] = {
    "starter": {
        "name": "Starter",
        "amount": "50.00",
        "blurb": "For founders putting AI search on the map.",
        "prompts": "5",
        "highlight": False,
        "features": [
                  '1 domain · 5 tracked prompts',
      'Weekly 3 posts on Facebook, Instagram, LinkedIn & Google My Business',
      'Monthly AEO / SEO audit',
      'Technical site audit',
      'Competitor analysis',
        ],
    },
    "growth": {
        "name": "Growth",
        "amount": "150.00",
        "blurb": "For marketing teams shipping content weekly.",
        "prompts": "15",
        "highlight": True,
        "features": [
            '1 domain · 15 tracked prompts',
      'Weekly 7 posts on Facebook, Instagram, LinkedIn & Google My Business',
      'Competitor analysis',
      'Technical site audit',
      'Automated audit fixes on site',
      'Monthly 2 videos / reels',
      'Weekly 2 blogs',
        ],
    },
    "scale": {
        "name": "Scale",
        "amount": "500.00",
        "blurb": "For agencies and multi-brand portfolios.",
        "prompts": "15",
        "highlight": False,
        "features": [
            '4 domains · 15 tracked prompts',
      'Weekly 7 posts on Facebook, Instagram, LinkedIn & Google My Business',
      'Competitor analysis',
      'Technical site audit',
      'Automated audit fixes on site',
      'Monthly 2 videos / reels',
      'Weekly 2 blogs',
        ],
    },
}


def _load_currency_prices() -> dict[str, dict[str, str]]:
    """Load Airwallex product prices keyed by plan and ISO currency code."""
    raw = os.getenv("AIRWALLEX_PRODUCT_PRICES_JSON", "").strip()
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("AIRWALLEX_PRODUCT_PRICES_JSON must be valid JSON") from exc
    if not isinstance(value, dict):
        raise RuntimeError("AIRWALLEX_PRODUCT_PRICES_JSON must be an object")
    return {
        str(plan_id): {str(currency).upper(): str(amount) for currency, amount in prices.items()}
        for plan_id, prices in value.items()
        if isinstance(prices, dict)
    }


AIRWALLEX_PRODUCT_PRICES = _load_currency_prices()
_catalog_prices: dict[str, dict[str, str]] = {}
_catalog_loaded_at = 0.0


def get_plan_price(plan_id: str, currency: str | None = None) -> str:
    """Return the configured product price for a plan and currency."""
    global _catalog_prices, _catalog_loaded_at
    plan = PLANS[plan_id]
    currency_code = (currency or PAYMENT_CURRENCY).upper()
    now = time.time()
    if now - _catalog_loaded_at >= AIRWALLEX_CATALOG_CACHE_SECONDS:
        try:
            _catalog_prices = _fetch_catalog_prices()
            _catalog_loaded_at = now
        except (AirwallexError, ValueError, TypeError) as exc:
            logger.warning("[airwallex] product catalog fetch failed: %s", exc)

    configured_price = (
        _catalog_prices.get(plan_id, {}).get(currency_code)
        or AIRWALLEX_PRODUCT_PRICES.get(plan_id, {}).get(currency_code)
    )
    if configured_price is not None:
        return configured_price
    if currency_code == PAYMENT_CURRENCY:
        return plan["amount"]
    raise LookupError(f"No Airwallex product price configured for {plan_id}/{currency_code}")


def _fetch_catalog_prices() -> dict[str, dict[str, str]]:
    """Fetch product prices from Airwallex and map product names to plan IDs."""
    response = _request_with_retry("GET", AIRWALLEX_PRODUCTS_PATH)
    products = response.get("items") or response.get("data") or response.get("products") or []
    if not isinstance(products, list):
        raise ValueError("Airwallex product catalog response has no product list")

    prices: dict[str, dict[str, str]] = {}
    plan_names = {plan["name"].casefold(): plan_id for plan_id, plan in PLANS.items()}
    for product in products:
        if not isinstance(product, dict):
            continue
        product_name = str(product.get("name") or product.get("display_name") or "").casefold()
        plan_id = plan_names.get(product_name)
        if not plan_id:
            continue
        product_prices = product.get("prices") or product.get("price") or []
        if isinstance(product_prices, dict):
            product_prices = [product_prices]
        for price in product_prices:
            if not isinstance(price, dict):
                continue
            currency = str(price.get("currency") or "").upper()
            amount = price.get("amount", price.get("unit_amount", price.get("unit_amount_decimal")))
            if currency and amount is not None:
                prices.setdefault(plan_id, {})[currency] = str(amount)
    return prices


def get_plan(plan_id: str, currency: str | None = None) -> dict:
    """Return plan metadata with the price for the requested currency."""
    plan = PLANS[plan_id]
    return {**plan, "amount": get_plan_price(plan_id, currency)}

# IMPORTANT — these per-plan feature lists are marketing copy carried over
# verbatim from the landing page. The backend does NOT currently enforce any
# of these as usage caps or feature gates: every paid plan (any plan_id)
# grants identical full access via require_paid_access — see
# core/security.py. Only the PRICE and marketing copy differ today. If usage limits are ever
# enforced to match this copy, that's a separate quota-tracking subsystem,
# not something this catalog implies is already live.


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
def create_payment_intent(user_id: str, plan_id: str, currency: str | None = None) -> dict:
    """
    Creates a PaymentIntent for the fixed, server-decided price of `plan_id`
    (looked up from PLANS — never trusted from the client). Returns the raw
    Airwallex response (contains `id`, `client_secret`, `status`, ...).

    Raises KeyError if plan_id isn't in PLANS — the router turns this into a
    400, not a 500 (it's a client input error, not a server failure).
    """
    resolved_currency = (currency or PAYMENT_CURRENCY).upper()
    plan = get_plan(plan_id, resolved_currency)  # raises KeyError for an unknown plan_id
    body = {
        "request_id": str(uuid.uuid4()),  # idempotency key
        "amount": float(plan["amount"]),
        "currency": resolved_currency,
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
