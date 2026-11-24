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
                cta_url=post.get("cta_url") or None, video_url=post.get("video_url") or None, title=post.get("title") or None,
            )
            successes = sum(1 for r in results if r["success"])
            overall_status = "posted" if successes == len(results) else ("partial" if successes > 0 else "failed")
            update_scheduled_post_status(schedule_id, overall_status, results=results)
            if overall_status == "posted":
                mark_calendar_published(post["user_id"], post.get("post_key"))
        except Exception as e:
            logger.error(f"[scheduler] unexpected error processing {schedule_id}: {e}", exc_info=True)
            update_scheduled_post_status(schedule_id, "failed", results=[{"platform": "unknown", "success": False, "error": str(e)}])

    return len(due)


def mark_calendar_published(user_id: str, post_key: str | None) -> None:
    """Shows a scheduled calendar post as published in the customer's calendar once it has gone out. Never raises:
    the post itself is already live, so a failure here only means the calendar label is updated a little later."""
    if not post_key:
        return
    try:
        from db import get_aeo_state, save_aeo_state
        st = get_aeo_state(user_id)
        cur = dict((st.get("post_state") or {}).get(post_key) or {})
        if cur.get("published"):
            return
        cur.update({"approved": True, "published": True, "pub_at": _now_iso(), "sched_id": "", "sched_at": ""})
        st.setdefault("post_state", {})[post_key] = cur
        save_aeo_state(user_id, st)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[scheduler] could not mark calendar post {post_key!r} published for {user_id}: {e}")


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
