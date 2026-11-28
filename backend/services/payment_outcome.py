"""
services/payment_outcome.py — turns an Airwallex PaymentIntent into something a customer can read.

Two jobs:
  * `failure_reason(live)`  — a plain-language reason a payment did not go through (the bank's own reason when
    Airwallex gives one, otherwise a clear generic line).
  * `card_of(live)`         — the card that was used (brand + last 4), for the receipt.
Neither touches access: whether a plan is active is decided only by a SUCCEEDED status (see payment_router).
"""
from __future__ import annotations

# Airwallex / issuer failure codes → what the customer should read. Anything not listed falls back to the generic line.
_FRIENDLY = {
    "insufficient_funds": "The card has insufficient funds.",
    "card_declined": "The card was declined by the bank.",
    "do_not_honor": "The bank declined the payment (do not honor). Please contact your bank or use another card.",
    "expired_card": "The card has expired.",
    "invalid_card_number": "The card number is not valid.",
    "incorrect_card_number": "The card number is not valid.",
    "invalid_cvc": "The security code (CVC) is incorrect.",
    "incorrect_cvc": "The security code (CVC) is incorrect.",
    "invalid_expiry": "The expiry date is not valid.",
    "authentication_failed": "The bank's verification (3D Secure / OTP) was not completed.",
    "3ds_failed": "The bank's verification (3D Secure / OTP) was not completed.",
    "authentication_required": "The bank needs extra verification (3D Secure / OTP) for this payment.",
    "transaction_not_allowed": "This card is not allowed to make this kind of payment (for example international or online use is switched off).",
    "restricted_card": "The card is restricted by the bank.",
    "lost_card": "The bank blocked the card.",
    "stolen_card": "The bank blocked the card.",
    "suspected_fraud": "The bank flagged the payment as suspicious and declined it.",
    "risk_declined": "The payment was declined by a risk check.",
    "limit_exceeded": "The card's limit was exceeded.",
    "processing_error": "The bank could not process the payment. Please try again.",
}

GENERIC_FAILURE = "Your bank or card issuer did not approve the payment. No money was taken and your plan was not activated. Please try another card."


def _pick(d, *keys):
    for k in keys:
        v = (d or {}).get(k)
        if v:
            return v
    return None


def failure_reason(live: dict | None) -> str:
    """Best available reason for a failed / cancelled payment. Never empty."""
    live = live or {}
    att = live.get("latest_payment_attempt") or {}
    err = live.get("last_payment_error") or live.get("last_error") or {}
    code = str(_pick(att, "failure_code") or _pick(err, "code") or "").strip().lower()
    message = _pick(err, "message") or _pick(att, "failure_message", "failure_reason", "message")
    friendly = _FRIENDLY.get(code)
    if friendly:
        return friendly
    if message:
        text = str(message).strip()
        return text if text.endswith((".", "!", "?")) else text + "."
    if str(live.get("status", "")).upper() == "CANCELLED":
        return "The payment was cancelled before it was completed. No money was taken."
    return GENERIC_FAILURE


def card_of(live: dict | None) -> dict:
    """{'brand': 'visa', 'last4': '4242'} when Airwallex tells us, else {}."""
    att = (live or {}).get("latest_payment_attempt") or {}
    pm = att.get("payment_method") or {}
    card = pm.get("card") or {}
    brand = card.get("brand") or card.get("card_brand")
    last4 = card.get("last4") or card.get("card_last4")
    if not (brand or last4):
        return {}
    return {"brand": str(brand or "").title(), "last4": str(last4 or "")}


def outcome_of(live: dict | None, success: set, failure: set) -> str:
    """'succeeded' | 'failed' | 'pending'.

    A declined card does not always end the intent: Airwallex often leaves it REQUIRES_PAYMENT_METHOD (so the shopper
    can try another card) while its latest attempt is FAILED. For the customer that IS a failure, so it counts as one."""
    live = live or {}
    s = str(live.get("status", "")).upper()
    if s in success:
        return "succeeded"
    if s in failure:
        return "failed"
    att = live.get("latest_payment_attempt") or {}
    if s in ("REQUIRES_PAYMENT_METHOD", "REQUIRES_CUSTOMER_ACTION") and (
            str(att.get("status", "")).upper() in ("FAILED", "CANCELLED", "EXPIRED") or att.get("failure_code")):
        return "failed"
    return "pending"


def failure_detail(live: dict | None) -> dict:
    """The raw error Airwallex / the bank reported, for the 'full details' view: {'code', 'message', 'attempt_status'}."""
    live = live or {}
    att = live.get("latest_payment_attempt") or {}
    err = live.get("last_payment_error") or live.get("last_error") or {}
    return {
        "code": _pick(att, "failure_code") or _pick(err, "code"),
        "message": _pick(err, "message") or _pick(att, "failure_message", "failure_reason", "message"),
        "attempt_status": att.get("status"),
    }
