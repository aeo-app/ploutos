"""
core/starter_pass.py - the one-time Starter Pass for free accounts
===================================================================
A free account can pay ONCE (INR 700 or SGD 10) for a small, fixed bundle:

    * the full audit (nothing locked)
    * up to 5 selected prompts
    * 1 content strategy page   ("page")
    * 1 blog
    * 1 week of posters and reels: 3 posters and 2 reels

It is kept apart from subscriptions: it lives in its own record (SK "PASS#STARTER") next to the entitlement
record and never touches is_paid / paid_until / auto-renew. A subscriber (an active paid plan) does not need it; an account
that has a pass and later subscribes simply gets the plan's rules. The pass has no expiry; its counters are lifetime.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

PASS_PLAN_ID = "starter_pass"
PASS_NAME = "Starter Pass"
PASS_PRICES: dict[str, str] = {
    "INR": os.getenv("STARTER_PASS_PRICE_INR", "700.00"),
    "SGD": os.getenv("STARTER_PASS_PRICE_SGD", "10.00"),
}
# What one pass includes. Keys are the counters kept per account.
# One week of posters and reels = the Starter plan's weekly amount (3 posters + 2 reels), see core/plan_limits.py.
PASS_LIMITS: dict[str, int] = {"prompts": 5, "page": 1, "blog": 1, "poster": 3, "reel": 2}
COUNTED = ("page", "blog", "poster", "reel")      # "prompts" is a selection cap, not a counter

_lock = threading.Lock()


def _sk() -> str:
    return "PASS#STARTER"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _table():
    from db.payments_dynamo import _get_payments_table
    return _get_payments_table()


def get_pass(user_id: str) -> dict:
    """The stored pass record ({} when the account never bought one). Never raises."""
    try:
        from db.dynamo import _from_dynamo, _pk
        item = _table().get_item(Key={"PK": _pk(user_id), "SK": _sk()}).get("Item")
        return _from_dynamo(item) if item else {}
    except Exception as e:      # a lookup problem must not lock anyone out of what they already have
        logger.warning(f"[pass] could not read the pass of {user_id}: {e}")
        return {}


def _subscribed(user_id: str) -> bool:
    from db.payments_dynamo import is_user_paid
    return bool(is_user_paid(user_id))      # admins count as full access too


def has_pass(user_id: str) -> bool:
    return bool(get_pass(user_id).get("paid_at"))


def active_pass(user_id: str) -> Optional[dict]:
    """The pass record while it is the account's access level (bought, and no subscription/admin on top). Else None."""
    rec = get_pass(user_id)
    if not rec.get("paid_at") or _subscribed(user_id):
        return None
    return rec


def remaining(rec: dict) -> dict[str, int]:
    used = rec.get("used") or {}
    return {k: max(0, PASS_LIMITS[k] - int(used.get(k, 0) or 0)) for k in COUNTED}


def full_access(user_id: str) -> bool:
    """Subscription (or admin) OR a bought pass: the full, unlocked analysis."""
    return _subscribed(user_id) or bool(get_pass(user_id).get("paid_at"))


def can_use(user_id: str, kind: str) -> bool:
    rec = active_pass(user_id)
    return bool(rec) and remaining(rec).get(kind, 0) > 0


def consume(user_id: str, kind: str) -> bool:
    """Spend one unit of the pass. True when a unit was spent. Atomic in DynamoDB, so two quick requests cannot spend the same unit."""
    if kind not in COUNTED:
        return False
    try:
        from botocore.exceptions import ClientError
        from db.dynamo import _pk
        with _lock:
            rec = active_pass(user_id)
            if not rec:
                return False
            try:
                _table().update_item(
                    Key={"PK": _pk(user_id), "SK": _sk()},
                    UpdateExpression="SET used.#k = if_not_exists(used.#k, :z) + :one, updated_at = :u",
                    ConditionExpression="attribute_exists(paid_at) AND (attribute_not_exists(used.#k) OR used.#k < :lim)",
                    ExpressionAttributeNames={"#k": kind},
                    ExpressionAttributeValues={":z": 0, ":one": 1, ":lim": PASS_LIMITS[kind], ":u": _now()},
                )
                return True
            except ClientError as e:
                if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                    return False
                raise
    except Exception as e:  # noqa: BLE001 - never lose a generated result over bookkeeping
        logger.error(f"[pass] could not record {kind} for {user_id}: {e}")
        return False


def grant_pass(user_id: str, payment_intent_id: str, amount: str, currency: str) -> bool:
    """Record a successful pass payment. Idempotent: the same payment (webhook + status poll) is only applied once."""
    try:
        from botocore.exceptions import ClientError
        from db.dynamo import _pk, _to_dynamo
        item = {
            "PK": _pk(user_id), "SK": _sk(), "user_id": user_id, "paid_at": _now(), "pass_intent_id": payment_intent_id,   # NOT "payment_intent_id": that attribute is the payments GSI key
            "amount": amount, "currency": currency, "used": {k: 0 for k in COUNTED}, "updated_at": _now(),
        }
        try:
            _table().put_item(Item=_to_dynamo(item), ConditionExpression="attribute_not_exists(PK)")
            logger.info(f"[pass] starter pass granted to {user_id} ({amount} {currency}, {payment_intent_id})")
            return True
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return False        # already granted (a duplicate webhook / poll)
            raise
    except Exception as e:  # noqa: BLE001
        logger.error(f"[pass] could not grant the pass to {user_id}: {e}", exc_info=True)
        raise


def public_state(user_id: str) -> dict:
    """What the app shows: can this account buy the pass, does it hold one, what is left."""
    rec = get_pass(user_id)
    bought = bool(rec.get("paid_at"))
    subscribed = _subscribed(user_id)
    out = {
        "eligible": (not bought) and (not subscribed) and not ever_paid_for_pass_eligibility(user_id),
        "active": bought and not subscribed,
        "bought": bought,
        "limits": PASS_LIMITS,
        "prices": PASS_PRICES,
        "remaining": remaining(rec) if bought else dict(PASS_LIMITS, prompts=PASS_LIMITS["prompts"]),
    }
    out["remaining"] = {k: v for k, v in out["remaining"].items() if k in COUNTED}
    out["prompts"] = PASS_LIMITS["prompts"]
    return out


def ever_paid_for_pass_eligibility(user_id: str) -> bool:
    """A lapsed subscriber (paid before) is not a free account: they are shown the plans, not the pass."""
    from core.paywall import subscription_state
    return bool(subscription_state(user_id).get("ever_paid"))
