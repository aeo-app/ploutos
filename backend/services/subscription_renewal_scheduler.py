"""
services/subscription_renewal_scheduler.py — automatic subscription renewal
================================================================================
Called periodically by main.py's APScheduler job (same pattern as
services/social_publish/scheduler.py). This is the actual mechanism that
makes billing recurring instead of one-time: finds every user whose paid
access is due to expire (or already has), who has NOT cancelled
(auto_renew=True — see db.payments_dynamo.cancel_auto_renew) and has a
verified saved payment method, and charges them automatically with no
shopper present — an Airwallex merchant-initiated transaction (MIT).

Pricing for the renewal charge comes from get_plan_price(plan_id,
currency) — the SAME Airwallex Product Catalog lookup used for the
original checkout (see services/airwallex_service.py) — using the
CURRENCY THE USER ORIGINALLY PAID IN, not a global default. A renewal
charged in a different currency than the original purchase would be a
real, visible discrepancy for the customer.

A failed renewal charge does NOT immediately revoke access — paid_until
keeps counting down on its own, and this job simply retries on every
subsequent run until it either succeeds or paid_until actually passes (at
which point is_user_paid() naturally starts returning False on its own,
same as it always has for anyone who never renews at all). This avoids
yanking access over a single transient card decline.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from db import list_users_due_for_renewal, save_payment_intent, set_renewal_status, set_user_paid
from services.airwallex_service import (
    AirwallexError,
    PAID_ACCESS_DAYS,
    PAYMENT_CURRENCY,
    PLANS,
    confirm_renewal_with_consent,
    create_payment_intent,
    get_plan_price,
)

logger = logging.getLogger(__name__)

RENEWAL_SUCCESS_STATUSES = {"SUCCEEDED"}


def _compute_next_paid_until() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=PAID_ACCESS_DAYS)).isoformat().replace("+00:00", "Z")


def process_due_renewals() -> int:
    """Returns how many renewal attempts were made this run (successes
    and failures both count — this is a "how much work happened" metric
    for logging/monitoring, not a health signal on its own)."""
    due = list_users_due_for_renewal(within_hours=24)
    if not due:
        return 0

    for entitlement in due:
        user_id = entitlement["user_id"]
        plan_id = entitlement.get("plan") or "starter"
        customer_id = entitlement.get("airwallex_customer_id")
        consent_id = entitlement.get("payment_consent_id")
        currency = (entitlement.get("currency") or PAYMENT_CURRENCY).upper()

        if plan_id not in PLANS:
            logger.warning(f"[renewal] user={user_id} has unknown plan_id={plan_id!r}, skipping")
            continue

        logger.info(f"[renewal] processing due renewal for user={user_id} plan={plan_id} currency={currency}")
        try:
            # Price resolved from the SAME Airwallex Product Catalog
            # lookup the original checkout used, for the currency this
            # specific user actually paid in — not a hardcoded amount and
            # not a different currency than their original purchase.
            amount = get_plan_price(plan_id, currency)

            # Two-step, matching Airwallex's documented MIT flow exactly:
            # create an intent for the plan's price, then confirm it
            # against the saved, verified consent — this is the step that
            # actually charges the card with no shopper present.
            intent = create_payment_intent(user_id, plan_id, currency=currency, customer_id=customer_id)
            result = confirm_renewal_with_consent(intent["id"], customer_id, consent_id)
            status = result.get("status", "")

            save_payment_intent(
                user_id=user_id, payment_intent_id=intent["id"], amount=amount,
                currency=result.get("currency", currency), status=status,
                description=f"{PLANS[plan_id]['name']} plan (auto-renewal)", plan_id=plan_id, is_renewal=True,
            )

            if status in RENEWAL_SUCCESS_STATUSES:
                set_user_paid(user_id=user_id, is_paid=True, paid_until=_compute_next_paid_until(), plan=plan_id, currency=currency)
                set_renewal_status(user_id, "succeeded")
                logger.info(f"[renewal] user={user_id} renewed successfully, plan={plan_id}, {amount} {currency}")
            else:
                # Not immediately a failure — some payment methods need an
                # extra async step before settling. The webhook (same
                # payment.succeeded/payment.failed handling as any other
                # intent) is the actual source of truth for anything that
                # doesn't resolve synchronously here; this just records
                # what we know right now.
                set_renewal_status(user_id, "pending", reason=f"Payment status: {status}")
                logger.info(f"[renewal] user={user_id} renewal intent created, awaiting webhook confirmation (status={status})")

        except (AirwallexError, LookupError) as e:
            set_renewal_status(user_id, "failed", reason=str(e))
            logger.error(f"[renewal] renewal charge failed for user={user_id}: {e}")
        except Exception as e:
            set_renewal_status(user_id, "failed", reason="Unexpected error — please contact support if this persists")
            logger.error(f"[renewal] unexpected error processing renewal for user={user_id}: {e}", exc_info=True)

    return len(due)
