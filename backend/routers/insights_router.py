"""
routers/insights_router.py — endpoints behind the Insights page
================================================================
  GET  /api/v1/aeo/insights/speed   Last speed test of the customer's website, with score history
  POST /api/v1/aeo/insights/speed   Run a new speed test (Google PageSpeed Insights, mobile + desktop)

Only the customer's own (locked) domain is ever tested, so these endpoints can't be used
to test other people's websites. Handlers are plain `def` because they block on Google's
API, and FastAPI runs plain `def` handlers in its thread pool.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from core.security import get_current_user_id
from db import get_insight, get_user_domain_lock, save_insight
from models.insights_models import SpeedResponse
from services.insights.speed_service import SpeedTestError, add_to_history, next_test_time, run_speed_test

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/aeo/insights", tags=["Insights"])

SPEED = "speed"   # saved-insight kind


def _own_website(user_id: str) -> str:
    lock = get_user_domain_lock(user_id)
    if not lock or not lock.get("domain"):
        raise HTTPException(status_code=409, detail="Run an analysis for your website first, then insights become available.")
    return f"https://{lock['domain']}/"


def _speed_response(saved: dict) -> SpeedResponse:
    return SpeedResponse(report=saved.get("report"), history=saved.get("history", []))


@router.get("/speed", response_model=SpeedResponse, summary="Last speed test of your website")
def get_speed(user_id: str = Depends(get_current_user_id)):
    return _speed_response(get_insight(user_id, SPEED) or {})


@router.post("/speed", response_model=SpeedResponse, summary="Run a new speed test of your website")
def run_speed(user_id: str = Depends(get_current_user_id)):
    url = _own_website(user_id)
    saved = get_insight(user_id, SPEED) or {}

    ready_at = next_test_time(saved.get("report"))
    if ready_at:
        minutes = math.ceil((ready_at - datetime.now(timezone.utc)).total_seconds() / 60)
        raise HTTPException(status_code=429, detail=f"Your website was just tested. You can test it again in {minutes} min.")

    try:
        report = run_speed_test(url)
    except SpeedTestError as e:
        raise HTTPException(status_code=502, detail=str(e))

    saved = {"report": report, "history": add_to_history(saved.get("history", []), report)}
    save_insight(user_id, SPEED, saved)
    logger.info(f"[insights] speed test saved for user={user_id}: mobile={report['mobile']['score']} desktop={report['desktop']['score']}")
    return _speed_response(saved)
