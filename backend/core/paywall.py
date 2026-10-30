"""
core/paywall.py — lapsed-subscriber paywall
===========================================

A customer who has paid at least once and whose paid access has since ended (the paid period ran out, they
cancelled and the period ended, or automatic renewal failed and the period ended) may not run any paid action.
They get HTTP 402 with `code: "subscription_required"`; the app answers by showing the pricing plans, and when
the payment is confirmed it repeats the action the person asked for.

Never-paid (free) customers are NOT affected by anything in this file — they keep the existing free-plan rules.
Admins, and admins working inside a customer's account, are never blocked.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import Depends, HTTPException

from core.security import get_current_user_id, get_real_user_id

logger = logging.getLogger(__name__)

SKIP_PAYMENT_VERIFICATION = os.getenv("SKIP_PAYMENT_VERIFICATION", "false").lower() == "true"
SUCCESS_STATUSES = {"SUCCEEDED", "SUCCESS", "PAID"}

REASON_TEXT = {
    "expired": "Your subscription has expired.",
    "cancelled": "Your subscription was cancelled and its paid period has ended.",
    "renewal_failed": "We could not renew your subscription because the automatic payment failed.",
}


class SubscriptionRequired(HTTPException):
    """402 whose JSON body carries `code` and `reason` (see the handler in main.py)."""

    def __init__(self, reason: str = "expired", feature: Optional[str] = None):
        msg = f"{REASON_TEXT.get(reason, REASON_TEXT['expired'])} Choose a plan to continue."
        super().__init__(status_code=402, detail=msg)
        self.reason = reason
        self.feature = feature


def _ever_paid(user_id: str, ent: dict) -> bool:
    """True when this account has completed at least one successful payment."""
    if ent.get("is_paid") or ent.get("paid_since"):
        return True        # the stored flag stays true after expiry; paid_since is set on the first payment
    try:
        from db.payments_dynamo import list_user_payments
        for p in list_user_payments(user_id, limit=50):
            if str(p.get("status", "")).upper() in SUCCESS_STATUSES:
                return True
    except Exception as e:      # never lock someone out because the history lookup failed
        logger.warning(f"[paywall] payment history lookup failed for {user_id}: {e}")
    return False


def subscription_state(user_id: str) -> dict:
    """
    {"ever_paid", "active", "lapsed", "reason"} for one account.
    lapsed = paid before, and has no active paid access now.
    """
    from db import is_user_paid
    from db.dynamo import is_admin
    from db.payments_dynamo import get_user_entitlement

    out = {"ever_paid": False, "active": False, "lapsed": False, "reason": None}
    try:
        if is_admin(user_id):
            out.update(active=True)
            return out
        ent = get_user_entitlement(user_id)
        if is_user_paid(user_id):
            out.update(ever_paid=True, active=True)
            return out
        if not _ever_paid(user_id, ent):
            return out
        if str(ent.get("renewal_status") or "").lower() == "failed":
            reason = "renewal_failed"
        elif ent.get("auto_renew") is False:
            reason = "cancelled"
        else:
            reason = "expired"
        out.update(ever_paid=True, lapsed=True, reason=reason)
    except Exception as e:      # fail open: a database hiccup must not block paying customers
        logger.error(f"[paywall] subscription_state failed for {user_id}: {e}", exc_info=True)
    return out


def raise_if_lapsed(user_id: str, feature: Optional[str] = None) -> None:
    if SKIP_PAYMENT_VERIFICATION:
        return
    st = subscription_state(user_id)
    if st["lapsed"]:
        raise SubscriptionRequired(st["reason"], feature)


def paywall_guard(
    real: str = Depends(get_real_user_id),
    current: str = Depends(get_current_user_id),
) -> None:
    """Route dependency: `@router.post(..., dependencies=[Depends(paywall_guard)])`."""
    if real != current:         # a verified admin working inside a customer's account is never blocked
        return
    raise_if_lapsed(real)


def payment_required(user_id: str, message: str) -> HTTPException:
    """
    The 402 for 'this needs a paid plan': the lapsed-subscriber flavour when the person has paid before,
    otherwise the ordinary message (free customers see no change).
    """
    st = subscription_state(user_id)
    if st["lapsed"]:
        return SubscriptionRequired(st["reason"])
    return HTTPException(status_code=402, detail=message)
