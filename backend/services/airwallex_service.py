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
# Airwallex's real Billing API — verified against current docs (2026):
# Products and Prices are genuinely SEPARATE objects/endpoints, joined only
# by product_id. A previous version of this integration assumed prices
# came back embedded inside each product (they don't) and pointed at
# /api/v1/products (not a real endpoint — the actual path is under
# /api/v1/billing/). That silently failed on every call, was caught by
# get_plan_price's own exception handling, and fell back to the hardcoded
# local `amount` above without ever surfacing that the "integration" never
# actually worked. Fixed to the real, documented shape below.
AIRWALLEX_PRODUCTS_PATH = os.getenv("AIRWALLEX_PRODUCTS_PATH", "/api/v1/billing/products")
AIRWALLEX_PRICES_PATH = os.getenv("AIRWALLEX_PRICES_PATH", "/api/v1/billing/prices")
AIRWALLEX_CATALOG_CACHE_SECONDS = int(os.getenv("AIRWALLEX_CATALOG_CACHE_SECONDS", "300"))

# The price is fixed here (server-side), never trusted from the client.
# The price is fixed here (server-side) per plan, never trusted from the
# client — the client only selects WHICH plan_id to pay for, not the amount.
# Default currency and prices used when no currency-specific catalog is
# configured. Currency-specific prices should be supplied by the Airwallex
# product catalog configuration below, rather than calculated with FX rates.
PAYMENT_CURRENCY = "SGD"

# How long a successful payment (initial checkout OR auto-renewal) grants
# access for. 30 days is "monthly" in the sense the plans are priced and
# marketed. Set to 0 for one-time-forever access instead (which also
# means that account is never eligible for auto-renewal — there's
# nothing to renew — see db.payments_dynamo.list_users_due_for_renewal's
# own check for this). Lives here, not in routers/payment_router.py,
# since services/subscription_renewal_scheduler.py (a service module)
# needs the SAME value for renewal charges — a router module is the
# wrong place for a constant a service module also depends on.
PAID_ACCESS_DAYS = int(os.getenv("PAID_ACCESS_DAYS", "30"))

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
        # Set via env so this can be filled in per-deployment without a
        # code change once the corresponding Product is actually created
        # in the Airwallex dashboard (or via scripts/sync_airwallex_catalog.py).
        # Empty string means "no catalog product linked yet" — falls back
        # to name-based matching, then to the hardcoded amount above.
        "airwallex_product_id": os.getenv("AIRWALLEX_PRODUCT_ID_STARTER", ""),
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
        "airwallex_product_id": os.getenv("AIRWALLEX_PRODUCT_ID_GROWTH", ""),
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
        "airwallex_product_id": os.getenv("AIRWALLEX_PRODUCT_ID_SCALE", ""),
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
    """Return the configured product price for a plan and currency.
    Tries, in order: (1) the LIVE Airwallex catalog, (2) AIRWALLEX_PRODUCT_PRICES_JSON
    as a manual override/fallback, (3) the hardcoded local amount for the
    default currency only. Logs which source actually won, at INFO level,
    every time — this was previously silent, which made it impossible to
    tell whether the live catalog integration was actually being hit at
    all versus just reading the env fallback the whole time."""
    global _catalog_prices, _catalog_loaded_at
    plan = PLANS[plan_id]
    currency_code = (currency or PAYMENT_CURRENCY).upper()
    now = time.time()
    catalog_fetch_failed = False
    if now - _catalog_loaded_at >= AIRWALLEX_CATALOG_CACHE_SECONDS:
        try:
            _catalog_prices = _fetch_catalog_prices()
            _catalog_loaded_at = now
            logger.info(f"[airwallex] catalog refreshed — {len(_catalog_prices)} plan(s) resolved: {list(_catalog_prices.keys())}")
        except (AirwallexError, ValueError, TypeError) as exc:
            catalog_fetch_failed = True
            logger.warning(f"[airwallex] product catalog fetch failed: {exc}")

    live_price = _catalog_prices.get(plan_id, {}).get(currency_code)
    if live_price is not None:
        logger.info(f"[airwallex] {plan_id}/{currency_code} = {live_price} (source: LIVE Airwallex catalog)")
        return live_price

    # Live catalog reachable but has NOTHING for this plan/currency — most
    # likely means the corresponding Product/Price hasn't actually been
    # created in the real Airwallex account yet (or airwallex_product_id
    # isn't set for this plan — see PLANS above), not a code bug. Distinct
    # from catalog_fetch_failed (the API call itself errored) — logged
    # differently so the two causes aren't confused with each other.
    if not catalog_fetch_failed and plan_id not in _catalog_prices:
        logger.warning(
            f"[airwallex] live catalog has NO product/price for plan_id={plan_id!r} — "
            f"check that a Product exists in Airwallex with this plan's airwallex_product_id "
            f"(currently {plan.get('airwallex_product_id') or 'NOT SET'!r}) or matching name {plan['name']!r}, "
            f"and that it has an active Price in {currency_code}."
        )

    env_price = AIRWALLEX_PRODUCT_PRICES.get(plan_id, {}).get(currency_code)
    if env_price is not None:
        logger.warning(f"[airwallex] {plan_id}/{currency_code} = {env_price} (source: AIRWALLEX_PRODUCT_PRICES_JSON fallback — NOT the live catalog)")
        return env_price

    if currency_code == PAYMENT_CURRENCY:
        logger.warning(f"[airwallex] {plan_id}/{currency_code} = {plan['amount']} (source: hardcoded local PLANS default — NOT the live catalog)")
        return plan["amount"]
    raise LookupError(f"No Airwallex product price configured for {plan_id}/{currency_code}")


def _fetch_catalog_prices() -> dict[str, dict[str, str]]:
    """Fetch the real Airwallex Billing catalog and resolve it into
    {plan_id: {currency: amount}}.

    Products and Prices are fetched as two separate API calls and joined
    locally by product_id — Airwallex does not return prices embedded
    inside a product object; a Product can have many Prices (one per
    currency/cadence), each a standalone object referencing its product
    via product_id (see /api/v1/billing/prices, /api/v1/billing/products).
    """
    products_resp = _request_with_retry("GET", AIRWALLEX_PRODUCTS_PATH)
    products = products_resp.get("items") or products_resp.get("data") or []
    if not isinstance(products, list):
        raise ValueError("Airwallex product catalog response has no product list")

    prices_resp = _request_with_retry("GET", AIRWALLEX_PRICES_PATH)
    all_prices = prices_resp.get("items") or prices_resp.get("data") or []
    if not isinstance(all_prices, list):
        raise ValueError("Airwallex price catalog response has no price list")

    # Prefer matching by the explicitly-configured airwallex_product_id
    # (set per plan via env — see PLANS above) since it's exact and can't
    # silently break the way name-matching can if a product gets renamed
    # in the Airwallex dashboard. Falls back to matching by product name
    # (case-insensitive) only for a plan with no product_id configured yet.
    product_id_to_plan_id: dict[str, str] = {
        plan["airwallex_product_id"]: plan_id
        for plan_id, plan in PLANS.items()
        if plan.get("airwallex_product_id")
    }
    plan_names_by_product_id: dict[str, str] = {}
    unmatched_plan_names = {
        plan["name"].casefold(): plan_id
        for plan_id, plan in PLANS.items()
        if not plan.get("airwallex_product_id")
    }
    if unmatched_plan_names:
        for product in products:
            if not isinstance(product, dict):
                continue
            pid = product.get("id")
            name = str(product.get("name") or "").casefold()
            matched_plan_id = unmatched_plan_names.get(name)
            if pid and matched_plan_id:
                plan_names_by_product_id[pid] = matched_plan_id

    product_id_to_plan_id.update(plan_names_by_product_id)
    if not product_id_to_plan_id:
        return {}

    prices: dict[str, dict[str, str]] = {}
    for price in all_prices:
        if not isinstance(price, dict):
            continue
        product_id = price.get("product_id")
        plan_id = product_id_to_plan_id.get(product_id)
        if not plan_id:
            continue
        if price.get("active") is False:
            continue
        currency = str(price.get("currency") or "").upper()
        # flat_amount is the correct field for a FLAT pricing_model price
        # (a fixed subscription price, which is what a plan like this is) —
        # unit_amount only applies to PER_UNIT/VOLUME/GRADUATED models.
        # Checked in that order since FLAT is the expected case here, not
        # treated as interchangeable with unit_amount.
        amount = price.get("flat_amount")
        if amount is None:
            amount = price.get("unit_amount")
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
def create_customer(user_id: str, email: str) -> dict:
    """Creates an Airwallex Customer — required before a PaymentConsent can
    be attached for future merchant-initiated (off-session) charges.
    Idempotent via merchant_customer_id: calling this again for the same
    user_id returns the SAME customer rather than creating a duplicate,
    since Airwallex's create-customer endpoint treats merchant_customer_id
    as a dedup key."""
    body = {
        "request_id": str(uuid.uuid4()),
        "merchant_customer_id": user_id,
        "email": email,
    }
    return _request_with_retry("POST", "/api/v1/pa/customers/create", json=body)


def create_payment_intent(
    user_id: str, plan_id: str, currency: str | None = None,
    customer_id: str | None = None, capture_consent: bool = False,
) -> dict:
    """
    Creates a PaymentIntent for the fixed, server-decided price of `plan_id`
    (looked up from PLANS/the Airwallex Product Catalog via get_plan —
    never trusted from the client). Returns the raw Airwallex response
    (contains `id`, `client_secret`, `status`, ...).

    `customer_id` + `capture_consent=True` is what makes this the FIRST
    payment of a subscription rather than a one-off: it tells Airwallex
    to save the payment method as a verified PaymentConsent for
    merchant-initiated renewal charges later (see
    confirm_renewal_with_consent below) — the actual consent capture
    happens client-side, in the Drop-in Element's own configuration,
    keyed off this same customer_id.

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
    if customer_id:
        body["customer_id"] = customer_id
    if capture_consent:
        body["payment_consent"] = {"next_triggered_by": "merchant", "merchant_trigger_reason": "scheduled"}
    return _request_with_retry("POST", "/api/v1/pa/payment_intents/create", json=body)


def confirm_renewal_with_consent(intent_id: str, customer_id: str, payment_consent_id: str) -> dict:
    """Charges a saved payment method with NO shopper present — this is
    the actual auto-renewal mechanism. Airwallex calls this pattern a
    merchant-initiated transaction (MIT); triggered_by=merchant here is
    what distinguishes it from a normal customer-present checkout."""
    body = {
        "request_id": str(uuid.uuid4()),
        "customer_id": customer_id,
        "payment_consent_id": payment_consent_id,
        "triggered_by": "merchant",
    }
    return _request_with_retry("POST", f"/api/v1/pa/payment_intents/{intent_id}/confirm", json=body)


def get_payment_consent(payment_consent_id: str) -> dict:
    """Retrieve a PaymentConsent's current status (VERIFIED, DISABLED,
    etc.) — used to confirm a consent is actually usable before attempting
    a renewal charge against it, and to show the saved card's brand/last4
    in the billing UI."""
    return _request_with_retry("GET", f"/api/v1/pa/payment_consents/{payment_consent_id}")


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
