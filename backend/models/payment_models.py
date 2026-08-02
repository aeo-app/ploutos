"""
models/payment_models.py — Airwallex payment gating
======================================================
Everything else in this app requires payment; only auth endpoints
(login/signup/forgot-password) are exempt — see core/security.py's
require_paid_access dependency and its use across seo_router.py /
social_router.py.
"""

from pydantic import BaseModel, Field
from typing import Optional


class CreatePaymentIntentRequest(BaseModel):
    # Deliberately takes no amount/currency from the client — the price is
    # decided server-side (PAYMENT_AMOUNT/PAYMENT_CURRENCY env vars) so a
    # malicious client can't alter what they're charged. See Airwallex's own
    # integration guidance: "Always decide how much to charge on the server."
    pass


class PaymentIntentResponse(BaseModel):
    payment_intent_id: str
    client_secret: str
    amount: str
    currency: str
    description: str
    status: str


class EntitlementStatus(BaseModel):
    is_paid: bool
    paid_until: Optional[str] = None
    plan: Optional[str] = None


class PaymentTransaction(BaseModel):
    payment_intent_id: str
    amount: str
    currency: str
    status: str
    description: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PaymentHistoryResponse(BaseModel):
    items: list[PaymentTransaction]


class WebhookAck(BaseModel):
    received: bool = True
