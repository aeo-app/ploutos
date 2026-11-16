"""
services/analysis_jobs.py — runs the AEO analysis in the background
================================================================================
A real analysis asks every tracked question to several AI tools, which takes a few
minutes, longer than a web request should stay open. The endpoint starts a job and
returns its id straight away, and the screen polls for progress and the result
(same pattern as services/short_jobs.py). One job per customer at a time; its state
lives in DynamoDB (db.save_insight) so it works across several server processes.
"""
from __future__ import annotations

import json
import logging
import time
import uuid

from db import get_insight, save_analysis, save_insight
from models.aeo_models import AeoPromptsRequest
from services.aeo_service import run_aeo_analysis
from services.bedrock_service import TokenUsageTracker

logger = logging.getLogger(__name__)

JOB = "analysis_job"          # the customer's current analysis job
ANSWERS = "ai_answers"        # the real AI answers behind the latest analysis
SITE_STRENGTH = "site_strength"   # real website strength (customer + competitors) from the latest analysis
STALE_AFTER_SECONDS = 20 * 60
PROGRESS_EVERY_SECONDS = 3


def start_job(user_id: str) -> tuple[str, bool]:
    """(job_id, is_new). A job already running for this customer is reused instead of starting a second one."""
    current = get_insight(user_id, JOB) or {}
    if current.get("status") == "running" and time.time() - float(current.get("started") or 0) < STALE_AFTER_SECONDS:
        return current["job_id"], False
    job_id = uuid.uuid4().hex
    save_insight(user_id, JOB, {"job_id": job_id, "status": "running", "started": time.time(), "done": 0, "total": 0})
    return job_id, True


def run_job(user_id: str, job_id: str, req: AeoPromptsRequest, is_paid: bool) -> None:
    started, last_saved = time.time(), 0.0

    def progress(done: int, total: int) -> None:
        nonlocal last_saved
        if done == total or time.time() - last_saved >= PROGRESS_EVERY_SECONDS:
            last_saved = time.time()
            save_insight(user_id, JOB, {"job_id": job_id, "status": "running", "started": started, "done": done, "total": total})

    try:
        tracker = TokenUsageTracker()
        result, answers = run_aeo_analysis(req, usage_tracker=tracker, is_paid=is_paid, on_progress=progress)
        data = json.loads(result.model_dump_json())
        token_usage = tracker.as_dict()
        try:
            analysis_id = save_analysis(
                user_id=user_id, analysis_type="aeo_prompts", company_name=req.company_name, url=req.url,
                market=req.market, industry=req.industry, result=data, request_data=req.model_dump(),
                status="success", token_usage=token_usage,
            )
        except Exception as e:  # noqa: BLE001 — the customer still gets the result on screen
            logger.error(f"[analysis] saving analysis failed for user={user_id}: {e}", exc_info=True)
            analysis_id = "save-failed"
        save_insight(user_id, ANSWERS, {"analysis_id": analysis_id, "checked_at": result.checked_at, "answers": answers})
        if result.website:   # the domain authority plan starts from these real numbers
            save_insight(user_id, SITE_STRENGTH, {
                "checked_at": result.checked_at, "website": result.website.model_dump(),
                "competitors": [{"name": c.name, "score": c.domain_authority} for c in result.competitors
                                if not c.is_you and c.domain_authority is not None],
            })
        data["_meta"] = {"analysis_id": analysis_id, "user_id": user_id, "token_usage": token_usage}
        save_insight(user_id, JOB, {"job_id": job_id, "status": "done", "started": started, "result": data})
        logger.info(f"[analysis] job {job_id} done for user={user_id} in {time.time() - started:.0f}s")
    except Exception as e:  # noqa: BLE001
        logger.error(f"[analysis] job {job_id} failed for user={user_id}: {e}", exc_info=True)
        save_insight(user_id, JOB, {"job_id": job_id, "status": "error", "started": started,
                                    "error": "We could not finish your analysis. Please try again in a few minutes."})


def job_status(user_id: str, job_id: str) -> dict:
    job = get_insight(user_id, JOB) or {}
    if job.get("job_id") != job_id:
        return {"status": "error", "error": "We could not find that analysis. Please run it again."}
    if job.get("status") == "running" and time.time() - float(job.get("started") or 0) > STALE_AFTER_SECONDS:
        return {"status": "error", "error": "The analysis took too long. Please run it again."}
    return {k: job[k] for k in ("status", "done", "total", "error", "result") if k in job}


def answers_for(user_id: str, prompt: str) -> dict:
    """The real answers each AI tool gave to one question in the latest analysis: {engine: answer}."""
    saved = get_insight(user_id, ANSWERS) or {}
    return {"checked_at": saved.get("checked_at", ""), "answers": (saved.get("answers") or {}).get(prompt, {})}


def measured_strength(user_id: str) -> dict | None:
    """Real website strength from the latest analysis: {"website": {...}, "competitors": [...]}, or None."""
    try:
        saved = get_insight(user_id, SITE_STRENGTH) or {}
    except Exception as e:  # noqa: BLE001 — the domain authority plan then works as before
        logger.warning(f"[analysis] could not read website strength for user={user_id}: {e}")
        return None
    return saved if saved.get("website") else None
