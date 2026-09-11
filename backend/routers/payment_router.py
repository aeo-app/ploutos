"""
routers/payment_router.py — Airwallex payment gating endpoints
==================================================================
These endpoints themselves require only authentication (get_current_user_id),
NOT payment — that would be circular, since they're how a user becomes
paid in the first place and how they check/see their own payment status
and history. Every OTHER endpoint in the app (seo_router, social_router)
requires core.security.require_paid_access instead.

Three plans (Starter/Growth/Scale) differ by price only for now — every
paid plan gets full access. Billing is manual-renewal (the user pays again
each month), not auto-recurring — see PAID_ACCESS_DAYS below.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from core.security import get_current_user_id
from db import (
    get_user_entitlement,
    list_user_payments,
    save_payment_intent,
    set_user_paid,
    update_payment_intent_status,
)
from models.payment_models import CreatePaymentIntentRequest
from services.airwallex_service import (
    AirwallexError,
    PAYMENT_CURRENCY,
    PLANS,
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

# How long a successful payment grants access for. Billing here is
# MANUAL-RENEWAL, not auto-recurring: the user pays again each cycle (no
# card is stored on file, no automatic re-charge). 30 days is "monthly" in
# the sense the plans are priced and marketed — set to 0 for one-time-forever
# access instead, or change the number of days for a different cycle length.
PAID_ACCESS_DAYS = int(os.getenv("PAID_ACCESS_DAYS", "30"))


def _compute_paid_until() -> str | None:
    if PAID_ACCESS_DAYS <= 0:
        return None
    return (datetime.now(timezone.utc) + timedelta(days=PAID_ACCESS_DAYS)).isoformat().replace("+00:00", "Z")


@router.get("/api/v1/payment/plans", summary="List available plans (Starter/Growth/Scale)")
async def list_plans():
    """
    Public catalog — the landing page is accessible without login, and the
    pricing cards are designed to render for anonymous visitors as well.
    The response is still the single source of truth for both marketing and
    checkout pricing, so the UI and actual plan charges can never drift.
    """
    return {
        "currency": PAYMENT_CURRENCY,
        "billing_cycle_days": PAID_ACCESS_DAYS,
        "plans": [
            {
                "plan_id": plan_id,
                "name": p["name"],
                "amount": p["amount"],
                "currency": PAYMENT_CURRENCY,
                "blurb": p["blurb"],
                "prompts": p["prompts"],
                "features": p["features"],
                "highlight": p["highlight"],
            }
            for plan_id, p in PLANS.items()
        ],
    }


@router.post("/api/v1/payment/create-intent", summary="Create an Airwallex PaymentIntent for a chosen plan")
async def create_intent(
    req: CreatePaymentIntentRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Called when the user picks a plan on the pricing/dashboard screen (or an
    unpaid user hits a protected feature and is routed to checkout). The
    PRICE for `plan_id` is looked up server-side (services.airwallex_service.PLANS)
    — never trust a client-supplied amount. Returns the client_secret the
    frontend needs to mount the Airwallex Drop-in Element.
    """
    try:
        plan = PLANS[req.plan_id]
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Unknown plan_id '{req.plan_id}'. Valid: {list(PLANS)}")

    try:
        intent = awx_create_payment_intent(user_id, req.plan_id)
    except AirwallexError as e:
        logger.error(f"[payment] create_intent failed for user={user_id} plan={req.plan_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Could not start payment: {e}")

    amount = plan["amount"]  # our own authoritative, correctly-formatted price string —
                              # don't derive it from Airwallex's response, which may
                              # echo the number back reformatted (e.g. "79.00" -> 79.0)
    currency = intent.get("currency", PAYMENT_CURRENCY)
    description = f"{plan['name']} plan"  # clean receipt/transaction text — the
                                            # marketing blurb ("For founders...")
                                            # is exposed separately via /payment/plans

    save_payment_intent(
        user_id=user_id,
        payment_intent_id=intent["id"],
        amount=amount,
        currency=currency,
        status=intent.get("status", "CREATED"),
        description=description,
        plan_id=req.plan_id,
    )

    return {
        "payment_intent_id": intent["id"],
        "client_secret": intent["client_secret"],
        "plan_id": req.plan_id,
        "plan_name": plan["name"],
        "amount": amount,
        "currency": currency,
        "description": description,
        "status": intent.get("status", "CREATED"),
    }


@router.get("/api/v1/payment/status", summary="Check current payment/entitlement status")
async def payment_status(
    payment_intent_id: str | None = None,
    user_id: str = Depends(get_current_user_id),
):
    """
    Always returns the user's current entitlement (including which plan is
    active). If `payment_intent_id` is provided, ALSO actively polls
    Airwallex directly first (the API-polling fallback alongside webhooks)
    in case the webhook hasn't arrived yet — e.g. right after the frontend's
    Drop-in reports success, before Airwallex's webhook has landed.
    """
    if payment_intent_id:
        try:
            live = awx_get_payment_intent(payment_intent_id)
            live_status = live.get("status", "")
            record = update_payment_intent_status(payment_intent_id, live_status)
            if record and live_status in SUCCESS_STATUSES:
                set_user_paid(
                    user_id=record["user_id"], is_paid=True,
                    paid_until=_compute_paid_until(), plan=record.get("plan_id") or "starter",
                )
        except AirwallexError as e:
            # Don't fail the whole status check just because the live poll
            # failed — fall back to whatever we already know from webhooks/DB.
            logger.warning(f"[payment] live poll failed for {payment_intent_id}: {e}")

    ent = get_user_entitlement(user_id)
    plan_id = ent.get("plan")

    # Previously this returned ent.get("is_paid", False) directly — the
    # raw, stored flag, which is only ever changed by an explicit
    # set_user_paid() call and never re-evaluated against the current
    # date. That meant a user's actual access correctly got blocked once
    # paid_until passed (is_user_paid(), used everywhere else, DOES check
    # expiry) — but this status endpoint kept reporting is_paid: true
    # forever, so the Billing page showed "✓ Plan active" indefinitely
    # even after the user was already locked out and needed to repay.
    # Same expiry check as is_user_paid(), without its admin-bypass
    # clause — this endpoint reports the entitlement's own true status,
    # not "does this account have access" (admins reach the billing page
    # rarely to never, since Sidebar.js hides it for them, and they have
    # no plan of their own to report on regardless).
    is_paid = bool(ent.get("is_paid", False))
    paid_until = ent.get("paid_until")
    if is_paid and paid_until:
        try:
            is_paid = datetime.fromisoformat(paid_until.replace("Z", "+00:00")) > datetime.now(timezone.utc)
        except (ValueError, AttributeError):
            logger.warning(f"[payment] unparseable paid_until={paid_until!r} for user={user_id} in status check; reporting as expired")
            is_paid = False

    return {
        "is_paid": is_paid,
        "paid_until": paid_until,
        "plan": plan_id,
        "plan_name": PLANS.get(plan_id, {}).get("name") if plan_id else None,
    }


@router.get("/api/v1/payment/history", summary="Your payment transaction history")
async def payment_history(user_id: str = Depends(get_current_user_id)):
    items = list_user_payments(user_id)
    return {
        "items": [
            {
                "payment_intent_id": i.get("payment_intent_id"),
                "plan_id": i.get("plan_id"),
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
        plan_id = record.get("plan_id") or "starter"
        set_user_paid(user_id=record["user_id"], is_paid=True, paid_until=_compute_paid_until(), plan=plan_id)
        logger.info(f"[payment] user={record['user_id']} marked paid ({plan_id}) via webhook ({payment_intent_id})")
    elif status in FAILURE_STATUSES:
        logger.info(f"[payment] payment {payment_intent_id} failed/cancelled for user={record['user_id']}")

    return {"received": True}
