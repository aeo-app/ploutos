"""
services/short_jobs.py — runs YouTube Short generation in the background
================================================================================
Making a Short (several AI photographs + video encoding) takes one to two minutes —
longer than a normal web request should stay open — so the endpoint starts a job and
returns its id straight away, and the screen polls for the result. Job state lives in
DynamoDB (db.dynamo.save_short_job) so it works across several server processes.
"""
from __future__ import annotations

import logging
import time
import uuid
from typing import Callable, Optional

from db.dynamo import get_short_job, save_short_job
from services import brand_service as brand_svc
from services.media_upload_service import signed_view_url, upload_image, upload_video
from services.openai_image_service import OpenAIImageError
from services.shorts_service import ShortError, generate_short

logger = logging.getLogger(__name__)
STALE_AFTER_SECONDS = 12 * 60


def start_job(user_id: str, params: dict) -> str:
    """Validates the brand kit (422 if the logo/phone are missing), records the job and returns its id."""
    brand_svc.require_brand(user_id)
    job_id = uuid.uuid4().hex
    save_short_job(user_id, job_id, {"status": "running", "started": time.time(), "params": {k: params.get(k) for k in ("key",)}})
    return job_id


def run_job(user_id: str, job_id: str, params: dict, on_done: Optional[Callable[[dict], None]] = None) -> None:
    started = time.time()
    try:
        brand, logo = brand_svc.require_brand(user_id)
        res = generate_short(
            user_id, params.get("company_name") or "", params.get("industry") or "", brand, logo,
            params.get("title") or "", params.get("visual") or params.get("text") or "", params.get("keywords") or [],
        )
        video_url = upload_video(res["video"], user_id)
        thumb_url = upload_image(res["thumbnail"], "short-thumb.jpg", user_id)
        done = {"status": "done", "video_url": video_url, "thumb_url": thumb_url, "duration": res["duration"], "started": started}
        if on_done:
            on_done(done)
        save_short_job(user_id, job_id, done)
        logger.info(f"[shorts] job {job_id} done for user={user_id} in {time.time() - started:.0f}s")
    except (ShortError, OpenAIImageError) as e:
        logger.error(f"[shorts] job {job_id} failed for user={user_id}: {e}")
        save_short_job(user_id, job_id, {"status": "error", "error": f"Could not create the video: {e}", "started": started})
    except Exception as e:  # noqa: BLE001
        logger.error(f"[shorts] job {job_id} crashed for user={user_id}: {e}", exc_info=True)
        save_short_job(user_id, job_id, {"status": "error", "error": "Something went wrong while creating the video. Please try again.", "started": started})


def job_status(user_id: str, job_id: str) -> dict:
    job = get_short_job(user_id, job_id)
    if not job:
        return {"status": "error", "error": "We could not find that video job. Please start it again."}
    if job.get("status") == "running" and time.time() - float(job.get("started") or 0) > STALE_AFTER_SECONDS:
        return {"status": "error", "error": "Creating the video took too long. Please try again."}
    out = {k: job.get(k) for k in ("status", "error", "video_url", "thumb_url", "duration")}
    if job.get("status") == "done":
        out["video_view_url"] = signed_view_url(job["video_url"], user_id) or job["video_url"]
        out["thumb_view_url"] = signed_view_url(job["thumb_url"], user_id) or job["thumb_url"]
    return out
