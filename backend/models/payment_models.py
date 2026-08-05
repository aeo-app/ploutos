"""
models/payment_models.py — Airwallex payment gating
======================================================
Everything else in this app requires payment; only auth endpoints
(login/signup/forgot-password) are exempt — see core/security.py's
require_paid_access dependency and its use across seo_router.py /
social_router.py.

Three plans (Starter/Growth/Scale) differ by price only for now — every
paid plan gets full platform access. See services/airwallex_service.py's
PLANS dict for the actual prices (single source of truth — the /payment/plans
endpoint reads from there too, so the dashboard pricing UI can never drift
out of sync with what a payment actually charges).
"""

from pydantic import BaseModel, Field
from typing import Literal, Optional

PlanId = Literal["starter", "growth", "scale"]


class PlanInfo(BaseModel):
    """One row of the plan catalog — what GET /payment/plans returns, so the
    dashboard pricing cards are always sourced from the same prices AND
    marketing copy a payment will actually charge/reflect, never hardcoded
    twice. `features`/`blurb`/`prompts` are display copy only — see the
    module note above services.airwallex_service.PLANS: no usage limits are
    actually enforced per plan yet, every paid plan gets full access."""
    plan_id:   str
    name:      str
    amount:    str
    currency:  str
    blurb:     str
    prompts:   str
    features:  list[str]
    highlight: bool = False


class PlanCatalogResponse(BaseModel):
    currency: str
    billing_cycle_days: int
    plans: list[PlanInfo]


class CreatePaymentIntentRequest(BaseModel):
    # The client selects WHICH plan, never the amount — the price for that
    # plan_id is looked up server-side (services.airwallex_service.PLANS),
    # so a malicious client can't alter what they're charged. See Airwallex's
    # own integration guidance: "Always decide how much to charge on the server."
    plan_id: PlanId = Field(..., example="growth")


class PaymentIntentResponse(BaseModel):
    payment_intent_id: str
    client_secret: str
    plan_id: str
    plan_name: str
    amount: str
    currency: str
    description: str
    status: str


class EntitlementStatus(BaseModel):
    is_paid: bool
    paid_until: Optional[str] = None
    plan: Optional[str] = None       # plan_id of the active plan, e.g. "growth"
    plan_name: Optional[str] = None  # display name, e.g. "Growth"


class PaymentTransaction(BaseModel):
    payment_intent_id: str
    plan_id: Optional[str] = None
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
