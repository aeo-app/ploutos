"""
services/social_publish/scheduler.py — executes due scheduled posts
================================================================================
Called periodically by main.py's APScheduler job. Facebook could rely on
Meta's own native scheduling instead, but Instagram has no equivalent at
all (see the module docstring in db/dynamo.py's scheduled-posts section) —
using this same in-app scheduler for both keeps one consistent code path
and status model, and makes it trivial to add LinkedIn/Google Business
scheduling later without inventing a second mechanism.
"""
from __future__ import annotations

import logging

from db import list_due_scheduled_posts, update_scheduled_post_status
from services.social_publish.publish_service import publish_to_platforms

logger = logging.getLogger(__name__)


def process_due_scheduled_posts() -> int:
    """Returns how many posts were processed (posted or failed) this run."""
    now_iso_placeholder = _now_iso()
    due = list_due_scheduled_posts(now_iso_placeholder)
    if not due:
        return 0

    for post in due:
        schedule_id = post["schedule_id"]
        logger.info(f"[scheduler] processing due scheduled post {schedule_id} for user={post['user_id']}")
        try:
            results = publish_to_platforms(
                post["user_id"], post["platforms"], post["image_url"], post["caption"],
                cta_url=post.get("cta_url") or None,
            )
            overall_status = "posted" if all(r["success"] for r in results) else "failed"
            update_scheduled_post_status(schedule_id, overall_status, results=results)
        except Exception as e:
            logger.error(f"[scheduler] unexpected error processing {schedule_id}: {e}", exc_info=True)
            update_scheduled_post_status(schedule_id, "failed", results=[{"platform": "unknown", "success": False, "error": str(e)}])

    return len(due)


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
