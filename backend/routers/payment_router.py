"""
routers/payment_router.py — Airwallex payment gating endpoints
==================================================================
These endpoints themselves require only authentication (get_current_user_id),
NOT payment — that would be circular, since they're how a user becomes
paid in the first place and how they check/see their own payment status
and history. Every OTHER endpoint in the app (seo_router, social_router)
requires core.security.require_paid_access instead.
"""
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from core.security import get_current_user_id
from db.dynamo import (
    get_payment_intent as db_get_payment_intent,
    get_user_entitlement,
    list_user_payments,
    save_payment_intent,
    set_user_paid,
    update_payment_intent_status,
)
from services.airwallex_service import (
    AirwallexError,
    PAYMENT_AMOUNT,
    PAYMENT_CURRENCY,
    PAYMENT_DESCRIPTION,
    create_payment_intent as awx_create_payment_intent,
    get_payment_intent as awx_get_payment_intent,
    verify_webhook_signature,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Payments"])

# Statuses Airwallex uses on a PaymentIntent (and in webhook event types)
# that we treat as "paid" / "not paid" respectively.
SUCCESS_STATUSES = {"SUCCEEDED"}
FAILURE_STATUSES = {"FAILED", "CANCELLED", "EXPIRED"}

# How long a successful payment grants access for. None (or 0) = forever
# (true one-time purchase); set PAID_ACCESS_DAYS for subscription-style,
# renewable access instead — see business-logic note in set_user_paid.
PAID_ACCESS_DAYS = int(os.getenv("PAID_ACCESS_DAYS", "0"))


def _compute_paid_until() -> str | None:
    if PAID_ACCESS_DAYS <= 0:
        return None
    return (datetime.now(timezone.utc) + timedelta(days=PAID_ACCESS_DAYS)).isoformat().replace("+00:00", "Z")


@router.post("/api/v1/payment/create-intent", summary="Create an Airwallex PaymentIntent to unlock access")
async def create_intent(user_id: str = Depends(get_current_user_id)):
    """
    Called when an unpaid user hits a protected feature (or the checkout
    page loads). Amount/currency are fixed server-side — never trust a
    client-supplied price. Returns the client_secret the frontend needs to
    mount the Airwallex Drop-in Element.
    """
    try:
        intent = awx_create_payment_intent(user_id)
    except AirwallexError as e:
        logger.error(f"[payment] create_intent failed for user={user_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Could not start payment: {e}")

    save_payment_intent(
        user_id=user_id,
        payment_intent_id=intent["id"],
        amount=str(intent.get("amount", PAYMENT_AMOUNT)),
        currency=intent.get("currency", PAYMENT_CURRENCY),
        status=intent.get("status", "CREATED"),
        description=PAYMENT_DESCRIPTION,
    )

    return {
        "payment_intent_id": intent["id"],
        "client_secret": intent["client_secret"],
        "amount": str(intent.get("amount", PAYMENT_AMOUNT)),
        "currency": intent.get("currency", PAYMENT_CURRENCY),
        "description": PAYMENT_DESCRIPTION,
        "status": intent.get("status", "CREATED"),
    }


@router.get("/api/v1/payment/status", summary="Check current payment/entitlement status")
async def payment_status(
    payment_intent_id: str | None = None,
    user_id: str = Depends(get_current_user_id),
):
    """
    Always returns the user's current entitlement. If `payment_intent_id`
    is provided, ALSO actively polls Airwallex directly first (the
    API-polling fallback the spec asks for, alongside webhooks) in case the
    webhook hasn't arrived yet — e.g. right after the frontend's Drop-in
    reports success, before Airwallex's webhook has landed.
    """
    if payment_intent_id:
        try:
            live = awx_get_payment_intent(payment_intent_id)
            live_status = live.get("status", "")
            record = update_payment_intent_status(payment_intent_id, live_status)
            if record and live_status in SUCCESS_STATUSES:
                set_user_paid(user_id=record["user_id"], is_paid=True, paid_until=_compute_paid_until())
        except AirwallexError as e:
            # Don't fail the whole status check just because the live poll
            # failed — fall back to whatever we already know from webhooks/DB.
            logger.warning(f"[payment] live poll failed for {payment_intent_id}: {e}")

    ent = get_user_entitlement(user_id)
    return {
        "is_paid": ent.get("is_paid", False),
        "paid_until": ent.get("paid_until"),
        "plan": ent.get("plan"),
    }


@router.get("/api/v1/payment/history", summary="Your payment transaction history")
async def payment_history(user_id: str = Depends(get_current_user_id)):
    items = list_user_payments(user_id)
    return {
        "items": [
            {
                "payment_intent_id": i.get("payment_intent_id"),
                "amount": i.get("amount"),
                "currency": i.get("currency"),
                "status": i.get("status"),
                "description": i.get("description", ""),
                "created_at": i.get("created_at"),
                "updated_at": i.get("updated_at"),
            }
            for i in items
        ]
    }


@router.post("/api/v1/payment/webhook", summary="Airwallex webhook receiver")
async def airwallex_webhook(request: Request):
    """
    No auth dependency here — Airwallex calls this directly, with no user
    session. Its security boundary is the HMAC signature instead (see
    verify_webhook_signature). MUST read the raw body for signature
    verification before any JSON parsing — re-serialized JSON will not
    match the signature Airwallex computed over the original bytes.
    """
    raw_body = await request.body()
    timestamp = request.headers.get("x-timestamp", "")
    signature = request.headers.get("x-signature", "")

    if not verify_webhook_signature(raw_body, timestamp, signature):
        logger.warning("[payment] webhook signature verification failed — rejecting")
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Malformed webhook payload")

    event_type = event.get("name", "")
    payment_intent = (event.get("data") or {}).get("object", {})
    payment_intent_id = payment_intent.get("id")
    status = payment_intent.get("status", "")

    if not payment_intent_id:
        logger.warning(f"[payment] webhook event without a payment_intent id: {event_type}")
        return {"received": True}

    record = update_payment_intent_status(payment_intent_id, status)
    if not record:
        # Could be a payment_intent we didn't create (shouldn't normally
        # happen) — log and ack anyway so Airwallex doesn't keep retrying.
        logger.warning(f"[payment] webhook for unknown payment_intent_id={payment_intent_id}")
        return {"received": True}

    if status in SUCCESS_STATUSES:
        set_user_paid(user_id=record["user_id"], is_paid=True, paid_until=_compute_paid_until())
        logger.info(f"[payment] user={record['user_id']} marked paid via webhook ({payment_intent_id})")
    elif status in FAILURE_STATUSES:
        logger.info(f"[payment] payment {payment_intent_id} failed/cancelled for user={record['user_id']}")

    return {"received": True}
