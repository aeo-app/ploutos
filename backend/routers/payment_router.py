"""
routers/payment_router.py — Airwallex payment gating endpoints
==================================================================
These endpoints themselves require only authentication (get_current_user_id),
NOT payment — that would be circular, since they're how a user becomes
paid in the first place and how they check/see their own payment status
and history. Every OTHER endpoint in the app (seo_router, social_router)
requires core.security.require_paid_access instead.

Three plans (Starter/Growth/Scale) differ by price only for now — every
paid plan gets full access. Billing auto-renews by default (see
services/subscription_renewal_scheduler.py) using a saved payment consent
captured on the first payment — a user can turn this off via
/payment/cancel-auto-renew, which stops future automatic charges without
touching their current paid period.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

from core.security import get_real_user_id as get_current_user_id  # never "act as" a customer here
from db import (
    cancel_auto_renew,
    get_payment_intent,
    get_user_entitlement,
    get_user_id_by_customer_id,
    list_user_payments,
    save_payment_intent,
    set_renewal_status,
    set_user_paid,
    update_payment_intent_status,
    set_payment_details,
)
from db.dynamo import get_registered_user
from models.payment_models import CreatePaymentIntentRequest
from services.airwallex_service import (
    AirwallexError,
    PAID_ACCESS_DAYS,
    paid_access_delta,
    DEFAULT_CURRENCY,
    PAYMENT_CURRENCY,
    PLANS,
    currency_for_country,
    viewer_country_from_headers,
    get_plan,
    create_customer as awx_create_customer,
    create_payment_intent as awx_create_payment_intent,
    create_pass_intent as awx_create_pass_intent,
    get_payment_intent as awx_get_payment_intent,
    verify_webhook_signature,
)
from services.cognito_service import get_user_country_from_token
from core import starter_pass
from services import payment_outcome
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Payments"])

# Statuses Airwallex uses on a PaymentIntent (and in webhook event types)
# that we treat as "paid" / "not paid" respectively.
SUCCESS_STATUSES = {"SUCCEEDED"}
FAILURE_STATUSES = {"FAILED", "CANCELLED", "EXPIRED"}


def _country_from_authorization(authorization: str | None, access_token: str | None = None) -> str | None:
    """Read country from a valid Cognito access token when one is present."""
    if not access_token:
        return None
    try:
        return get_user_country_from_token(access_token)
    except Exception:
        return None


def _compute_paid_until(plan_id: str | None = None) -> str | None:
    delta = paid_access_delta(plan_id)
    if delta is None:
        return None
    return (datetime.now(timezone.utc) + delta).isoformat().replace("+00:00", "Z")


@router.get("/api/v1/payment/plans", summary="List available plans (Starter/Growth/Scale)")
async def list_plans(
    request: Request,
    country: str | None = Query(default=None, max_length=100),
    authorization: str | None = Header(default=None, alias="Authorization"),
    access_token: str | None = Header(default=None, alias="X-Access-Token"),
):
    """
    Public catalog — the landing page is accessible without login, and the
    pricing cards are designed to render for anonymous visitors as well.
    The response is still the single source of truth for both marketing and
    checkout pricing, so the UI and actual plan charges can never drift.
    """
    registered_country = _country_from_authorization(authorization, access_token)
    # Where the visitor is right now wins (CDN header, then the browser's hint); the registered country is the fallback.
    currency = currency_for_country(viewer_country_from_headers(request.headers) or country or registered_country)
    # Signed-out visitors (the landing page) always see the real price list; the autopay test
    # price (Starter = 1, 1 day) only appears for signed-in users, in the dashboard.
    marketing = not (authorization or access_token)
    try:
        localized_plans = _localized_plans(currency, marketing)
    except LookupError as exc:
        logger.warning("[payment] %s; falling back to %s", exc, DEFAULT_CURRENCY)
        currency = DEFAULT_CURRENCY
        localized_plans = _localized_plans(currency, marketing)
    return {
        "currency": currency,
        "billing_cycle_days": PAID_ACCESS_DAYS,
        "plans": localized_plans,
    }


def _localized_plans(currency: str, marketing: bool = False) -> list[dict]:
    return [
        {
            "plan_id": plan_id,
            "name": p["name"],
            "amount": get_plan(plan_id, currency, marketing)["amount"],
            "currency": currency,
            "blurb": p["blurb"],
            "prompts": p["prompts"],
            "features": p["features"],
            "highlight": p["highlight"],
            "billing_days": PAID_ACCESS_DAYS if marketing else ((paid_access_delta(plan_id).total_seconds() / 86400) if paid_access_delta(plan_id) else 0),
        }
        for plan_id, p in PLANS.items()
    ]


@router.post("/api/v1/payment/create-intent", summary="Create an Airwallex PaymentIntent for a chosen plan")
async def create_intent(
    request: Request,
    req: CreatePaymentIntentRequest,
    user_id: str = Depends(get_current_user_id),
    authorization: str = Header(..., alias="Authorization"),
    access_token: str | None = Header(default=None, alias="X-Access-Token"),
):
    """
    Called when the user picks a plan on the pricing/dashboard screen (or an
    unpaid user hits a protected feature and is routed to checkout). The
    PRICE for `plan_id` is looked up server-side (services.airwallex_service.PLANS)
    — never trust a client-supplied amount. Returns the client_secret the
    frontend needs to mount the Airwallex Drop-in Element.
    """
    try:
        currency = currency_for_country(viewer_country_from_headers(request.headers) or req.country or _country_from_authorization(authorization, access_token))
        plan = get_plan(req.plan_id, currency)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Unknown plan_id '{req.plan_id}'. Valid: {list(PLANS)}")
    except LookupError as exc:
        logger.warning("[payment] %s; falling back to %s", exc, DEFAULT_CURRENCY)
        currency = DEFAULT_CURRENCY
        plan = get_plan(req.plan_id, currency)

    # Reuse an existing Airwallex customer for this user if one already
    # exists (e.g. from a previous plan/renewal) — create_customer is
    # idempotent via merchant_customer_id, but checking first avoids an
    # unnecessary API round-trip on every checkout.
    existing_ent = get_user_entitlement(user_id)
    customer_id = existing_ent.get("airwallex_customer_id")
    if not customer_id:
        registered = get_registered_user(user_id) or {}
        try:
            customer = awx_create_customer(user_id, registered.get("email", ""))
            customer_id = customer["id"]
            # Linked immediately, BEFORE the payment even happens — the
            # payment_consent.verified webhook (fired only after a
            # successful first payment) needs this link to already exist
            # so it can reverse-lookup which user a given Airwallex
            # customer_id belongs to.
            set_user_paid(
                user_id=user_id, is_paid=existing_ent.get("is_paid", False), paid_until=existing_ent.get("paid_until"),
                plan=existing_ent.get("plan", "one_time"), airwallex_customer_id=customer_id,
            )
        except AirwallexError as e:
            logger.error(f"[payment] create_customer failed for user={user_id}: {e}")
            raise HTTPException(status_code=502, detail=f"Could not start payment: {e}")

    try:
        intent = awx_create_payment_intent(user_id, req.plan_id, currency, customer_id=customer_id, capture_consent=True)
    except AirwallexError as e:
        logger.error(f"[payment] create_intent failed for user={user_id} plan={req.plan_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Could not start payment: {e}")

    amount = plan["amount"]  # our own authoritative, correctly-formatted price string —
                              # don't derive it from Airwallex's response, which may
                              # echo the number back reformatted (e.g. "79.00" -> 79.0)
    currency = intent.get("currency", currency)
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
    payment = None
    if payment_intent_id:
        try:
            live = awx_get_payment_intent(payment_intent_id)
            live_status = live.get("status", "")
            record = update_payment_intent_status(payment_intent_id, live_status)
            if record and record.get("user_id") != user_id:
                record = None   # somebody else's payment: never report on it
            if record:
                # Why it failed / which card paid — kept on the record so history and receipts can show it.
                card = payment_outcome.card_of(live)
                outcome = payment_outcome.outcome_of(live, SUCCESS_STATUSES, FAILURE_STATUSES)
                reason = payment_outcome.failure_reason(live) if outcome == "failed" else None
                set_payment_details(payment_intent_id, failure_reason=reason, card_brand=card.get("brand"), card_last4=card.get("last4"))
                payment = {"payment_intent_id": payment_intent_id, "status": live_status,
                           "outcome": outcome,
                           "failure_reason": reason, "card": card,
                           "plan_id": record.get("plan_id"), "description": record.get("description"),
                           "amount": record.get("amount"), "currency": record.get("currency"),
                           "created_at": record.get("created_at"), "is_renewal": bool(record.get("is_renewal", False))}
            if record and live_status in SUCCESS_STATUSES and record.get("plan_id") == starter_pass.PASS_PLAN_ID:
                if record.get("user_id") == user_id:
                    starter_pass.grant_pass(user_id, payment_intent_id, str(record.get("amount")), str(record.get("currency")))
            elif record and live_status in SUCCESS_STATUSES:
                set_user_paid(
                    user_id=record["user_id"], is_paid=True,
                    paid_until=_compute_paid_until(record.get("plan_id") or "starter"), plan=record.get("plan_id") or "starter",
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

    if payment:
        # The receipt: only a SUCCEEDED payment ever shows access details.
        ok = payment["outcome"] == "succeeded"
        pass_state = starter_pass.public_state(user_id)
        is_pass = payment.get("plan_id") == starter_pass.PASS_PLAN_ID
        payment.update({
            "plan_name": starter_pass.PASS_NAME if is_pass else (PLANS.get(payment.get("plan_id"), {}).get("name") or payment.get("description")),
            "paid_at": (ent.get("updated_at") if ok and not is_pass else None) or payment.get("created_at") if ok else None,
            "access_until": (paid_until if ok and not is_pass else None),
            "auto_renew": bool(ent.get("auto_renew", False)) if ok and not is_pass else False,
            "card": payment.get("card") or (ent.get("payment_method_summary") if ok and not is_pass else None) or {},
            "is_pass": is_pass,
            "pass": pass_state if (ok and is_pass) else None,
        })

    from core.paywall import subscription_state
    sub = subscription_state(user_id)
    return {
        "payment": payment,
        "is_paid": is_paid,
        # Paid before and no active access now: paid actions are blocked until a plan is bought again.
        "lapsed": bool(sub["lapsed"]),
        "lapse_reason": sub["reason"],
        "ever_paid": bool(sub["ever_paid"]),
        "paid_until": paid_until,
        "plan": plan_id,
        "plan_name": PLANS.get(plan_id, {}).get("name") if plan_id else None,
        "auto_renew": bool(ent.get("auto_renew", False)),
        "payment_method_summary": ent.get("payment_method_summary"),
        "renewal_status": ent.get("renewal_status"),  # 'succeeded' | 'failed' | 'pending' | None (never attempted)
        "renewal_failure_reason": ent.get("renewal_failure_reason"),
        "last_renewal_attempt_at": ent.get("last_renewal_attempt_at"),
        "pass": starter_pass.public_state(user_id),
    }


class CreatePassIntentRequest(BaseModel):
    country: str | None = None      # the browser's hint, same as for the plans; the server decides the currency and amount


def _pass_currency(request: Request, country: str | None, authorization: str | None, access_token: str | None) -> str:
    """INR for India, SGD for Singapore (and for every other country, as the pass has just those two prices). Same country order as the plans."""
    c = currency_for_country(viewer_country_from_headers(request.headers) or country or _country_from_authorization(authorization, access_token))
    return c if c in starter_pass.PASS_PRICES else "SGD"


@router.get("/api/v1/payment/pass", summary="The one-time Starter Pass: price, whether this account can buy it, what is left")
async def pass_state(
    request: Request,
    country: str | None = Query(default=None, max_length=100),
    authorization: str | None = Header(default=None, alias="Authorization"),
    access_token: str | None = Header(default=None, alias="X-Access-Token"),
    user_id: str = Depends(get_current_user_id),
):
    cur = _pass_currency(request, country, authorization, access_token)
    return {**starter_pass.public_state(user_id), "currency": cur, "amount": starter_pass.PASS_PRICES[cur]}


@router.post("/api/v1/payment/pass/create-intent", summary="Create the payment for the one-time Starter Pass (free accounts only)")
async def create_pass_intent(
    req: CreatePassIntentRequest,
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    access_token: str | None = Header(default=None, alias="X-Access-Token"),
    user_id: str = Depends(get_current_user_id),
):
    currency = _pass_currency(request, req.country, authorization, access_token)
    st = starter_pass.public_state(user_id)
    if not st["eligible"]:
        raise HTTPException(status_code=409, detail="The Starter Pass is for free accounts, and can be bought once." if not st["bought"] else "You already have the Starter Pass.")
    amount = starter_pass.PASS_PRICES[currency]
    ent = get_user_entitlement(user_id)
    customer_id = ent.get("airwallex_customer_id")
    try:
        if not customer_id:
            registered = get_registered_user(user_id) or {}
            customer_id = awx_create_customer(user_id, registered.get("email", ""))["id"]
            set_user_paid(user_id=user_id, is_paid=ent.get("is_paid", False), paid_until=ent.get("paid_until"),
                          plan=ent.get("plan", "one_time"), airwallex_customer_id=customer_id)
        intent = awx_create_pass_intent(user_id, currency, amount, customer_id=customer_id)
    except AirwallexError as e:
        logger.error(f"[payment] pass intent failed for user={user_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Could not start payment: {e}")
    save_payment_intent(user_id=user_id, payment_intent_id=intent["id"], amount=amount, currency=currency,
                        status=intent.get("status", "CREATED"), description=starter_pass.PASS_NAME, plan_id=starter_pass.PASS_PLAN_ID)
    return {
        "payment_intent_id": intent["id"], "client_secret": intent["client_secret"], "plan_id": starter_pass.PASS_PLAN_ID,
        "plan_name": starter_pass.PASS_NAME, "amount": amount, "currency": currency,
        "description": starter_pass.PASS_NAME, "status": intent.get("status", "CREATED"),
    }


@router.post("/api/v1/payment/cancel-auto-renew", summary="Cancel automatic renewal — current access is unaffected")
async def cancel_auto_renew_endpoint(user_id: str = Depends(get_current_user_id)):
    """The actual 'Cancel subscription' action. Does NOT touch is_paid or
    paid_until — the user keeps whatever access they've already paid for
    until it naturally expires; this just stops the scheduler from ever
    attempting another automatic charge for them, exactly like cancelling
    a real-world subscription rather than an instant refund/revocation."""
    cancel_auto_renew(user_id)
    return {"auto_renew": False}


def _history_view(i: dict) -> dict:
    """One payment as the history list shows it. `credited` = the money was received (only a SUCCEEDED payment ever is)."""
    status = str(i.get("status") or "").upper()
    credited = status in SUCCESS_STATUSES
    failed = status in FAILURE_STATUSES or bool(i.get("failure_reason"))
    pid = i.get("plan_id")
    return {
        "payment_intent_id": i.get("payment_intent_id"),
        "plan_id": pid,
        "plan_name": starter_pass.PASS_NAME if pid == starter_pass.PASS_PLAN_ID else (PLANS.get(pid, {}).get("name") or i.get("description")),
        "amount": i.get("amount"),
        "currency": i.get("currency"),
        "status": i.get("status"),
        "outcome": "succeeded" if credited else ("failed" if failed else "pending"),
        "credited": credited,
        "description": i.get("description", ""),
        "created_at": i.get("created_at"),
        "updated_at": i.get("updated_at"),
        "is_renewal": bool(i.get("is_renewal", False)),
        "failure_reason": i.get("failure_reason") or (payment_outcome.GENERIC_FAILURE if failed and not credited else None),
        "card_brand": i.get("card_brand"),
        "card_last4": i.get("card_last4"),
    }


@router.get("/api/v1/payment/history", summary="Your payment transaction history")
async def payment_history(user_id: str = Depends(get_current_user_id)):
    """Real payments only — payments made while autopay testing was on are left out."""
    return {"items": [_history_view(i) for i in list_user_payments(user_id)]}


@router.get("/api/v1/payment/history/{payment_intent_id}", summary="Full details of one payment (credited or not, with the error)")
async def payment_detail(payment_intent_id: str, user_id: str = Depends(get_current_user_id)):
    """Everything known about one of your payments. Asks Airwallex for the live state so the status and the bank's
    error are current. Read-only: it never changes access (that only happens on a confirmed success)."""
    record = get_payment_intent(payment_intent_id)
    if not record or record.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Payment not found")
    live = None
    try:
        live = awx_get_payment_intent(payment_intent_id)
        live_status = live.get("status", "")
        if live_status and live_status != record.get("status"):
            update_payment_intent_status(payment_intent_id, live_status)
            record["status"] = live_status
        outcome = payment_outcome.outcome_of(live, SUCCESS_STATUSES, FAILURE_STATUSES)
        card = payment_outcome.card_of(live)
        reason = payment_outcome.failure_reason(live) if outcome == "failed" else None
        set_payment_details(payment_intent_id, failure_reason=reason, card_brand=card.get("brand"), card_last4=card.get("last4"))
        if reason:
            record["failure_reason"] = reason
        if card:
            record["card_brand"], record["card_last4"] = card.get("brand"), card.get("last4")
    except AirwallexError as e:
        logger.warning(f"[payment] detail live poll failed for {payment_intent_id}: {e}")
    view = _history_view(record)
    detail = payment_outcome.failure_detail(live) if (live and view["outcome"] == "failed") else {}
    ent = get_user_entitlement(user_id)
    view.update({
        "bank_error_code": detail.get("code"),
        "bank_error_message": detail.get("message"),
        "attempt_status": detail.get("attempt_status"),
        "access_granted": bool(view["credited"]),
        "access_until": ent.get("paid_until") if view["credited"] and record.get("plan_id") != starter_pass.PASS_PLAN_ID else None,
        "auto_renew": bool(ent.get("auto_renew", False)) if view["credited"] and record.get("plan_id") != starter_pass.PASS_PLAN_ID else False,
        "note": ("Payment received — your plan is active." if view["credited"]
                 else "Payment not received — no money was taken and your plan was not activated." if view["outcome"] == "failed"
                 else "Waiting for the bank to confirm — nothing has been charged or activated yet."),
    })
    return view


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
    obj = (event.get("data") or {}).get("object", {})

    # payment_consent.verified fires once, after the FIRST payment
    # completes with consent capture requested (see create_intent above) —
    # this is the actual moment a user's card becomes chargeable for
    # future auto-renewals with no shopper present. Handled as its own
    # event type, separate from the payment intent success handling
    # below, since Airwallex sends it as a distinct webhook event, not
    # embedded in the payment intent's own payload.
    if event_type == "payment_consent.verified":
        consent_id = obj.get("id")
        customer_id = obj.get("customer_id")
        card = (obj.get("payment_method") or {}).get("card") or {}
        summary = f"{card.get('brand', 'card').title()} •••• {card.get('last4', '')}".strip() if card else None
        # customer_id was already linked to a user_id at create_intent
        # time (see create_intent above) — BEFORE this webhook could ever
        # fire, since the customer has to exist before a payment attempt
        # can reference it. This is a reverse lookup back to that link,
        # not a fresh association being made here.
        user_id = get_user_id_by_customer_id(customer_id) if customer_id else None
        if user_id and consent_id:
            existing = get_user_entitlement(user_id)
            set_user_paid(
                user_id=user_id, is_paid=existing.get("is_paid", False), paid_until=existing.get("paid_until"),
                plan=existing.get("plan", "one_time"), currency=existing.get("currency"),
                airwallex_customer_id=customer_id, payment_consent_id=consent_id,
                payment_method_summary=summary, auto_renew=True,
            )
            logger.info(f"[payment] payment consent {consent_id} verified and saved for user={user_id} ({summary})")
        else:
            logger.warning(f"[payment] payment_consent.verified: no matching user_id found for customer_id={customer_id}")
        return {"received": True}

    payment_intent = obj
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

    is_renewal = record.get("is_renewal", False)

    if record.get("plan_id") == starter_pass.PASS_PLAN_ID:
        if status in SUCCESS_STATUSES:
            starter_pass.grant_pass(record["user_id"], payment_intent_id, str(record.get("amount")), str(record.get("currency")))
        return {"received": True}

    if status in SUCCESS_STATUSES:
        plan_id = record.get("plan_id") or "starter"
        set_user_paid(user_id=record["user_id"], is_paid=True, paid_until=_compute_paid_until(plan_id), plan=plan_id, currency=record.get("currency"))
        if is_renewal:
            set_renewal_status(record["user_id"], "succeeded")
        logger.info(f"[payment] user={record['user_id']} marked paid ({plan_id}) via webhook ({payment_intent_id}, renewal={is_renewal})")
    elif status in FAILURE_STATUSES:
        logger.info(f"[payment] payment {payment_intent_id} failed/cancelled for user={record['user_id']} (renewal={is_renewal})")
        set_payment_details(payment_intent_id, failure_reason=payment_outcome.failure_reason(payment_intent))
        if is_renewal:
            # A failed renewal does NOT immediately revoke access here —
            # paid_until simply continues counting down to its already-set
            # expiry, and the scheduler will keep retrying on subsequent
            # runs until it either succeeds or paid_until actually passes.
            # This avoids yanking access over a single transient decline.
            set_renewal_status(record["user_id"], "failed", reason=payment_intent.get("last_error", {}).get("message") or "Payment declined")

    return {"received": True}
