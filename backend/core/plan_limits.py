"""
core/plan_limits.py - what each subscription plan includes each week
=====================================================================
Posters and reels are created one week at a time, and the numbers depend on the plan:

    Starter  3 posters + 2 reels a week
    Growth   5 posters + 2 reels a week
    Scale    7 posters + 2 reels a week

A customer without a paid plan gets the free preview (1 poster, 1 reel). A paid account whose plan is not recorded counts as Starter.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

PLAN_WEEKLY: dict[str, tuple[int, int]] = {"starter": (3, 2), "growth": (5, 2), "scale": (7, 2)}
FREE_WEEKLY = (1, 1)


def plan_id_of(user_id: str) -> str | None:
    """'starter' | 'growth' | 'scale' for a paid customer, None for a free one."""
    from db.payments_dynamo import get_user_entitlement, is_user_paid
    from db.dynamo import is_admin
    try:
        if is_admin(user_id):
            return "scale"
        if not is_user_paid(user_id):
            return None
        plan = str(get_user_entitlement(user_id).get("plan") or "").lower()
        return plan if plan in PLAN_WEEKLY else "starter"
    except Exception as e:  # noqa: BLE001 - never block content over a lookup; fall back to the smallest paid plan
        logger.warning(f"[plan] could not read the plan of {user_id}: {e}")
        return "starter"


def weekly_limits(user_id: str) -> tuple[int, int]:
    """(posters per week, reels per week) for this customer."""
    pid = plan_id_of(user_id)
    return PLAN_WEEKLY[pid] if pid else FREE_WEEKLY
