"""
services/poster_weeks.py - posters and reels are created one week at a time
===========================================================================
A customer's calendar is made of 4-week months (month 1 starts on `calendar_start`); this module works in weeks, counted from that date
(week 0, 1, 2 ...). What a week may hold depends on the plan (core/plan_limits): Starter 3 posters + 2 reels, Growth 5 + 2, Scale 7 + 2.

  * the current week: posters and reels can be created until the plan's numbers are reached;
  * the very first week of a calendar can be created right away (the calendar starts on the next Monday);
  * a later week: only on or after its first day, and from the second month on only with an active paid subscription;
  * a week that has ended: not at all.

The record lives in the content store (not in the editable dashboard state), so the customer cannot reset it. An admin working inside a
customer's account is never blocked.
"""
from __future__ import annotations

import logging
import re
import threading
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

from core.paywall import payment_required, raise_if_lapsed
from core import starter_pass
from core.plan_limits import plan_id_of, weekly_limits
from db.dynamo import get_aeo_content, get_aeo_state, save_aeo_content
from db.payments_dynamo import is_user_paid

logger = logging.getLogger(__name__)

WEEKS = 96                       # 24 months
WEEKS_PER_CYCLE = 4
KIND = "posterweek"
_lock = threading.Lock()


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _start0(user_id: str) -> date | None:
    try:
        return datetime.strptime(str(get_aeo_state(user_id).get("calendar_start") or ""), "%Y-%m-%d").date()
    except ValueError:
        return None


def _day_of(day_date: str) -> date | None:
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", day_date or "")
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None
    except (AttributeError, ValueError):
        return None


def week_of(start0: date | None, day: date | None) -> int:
    """Week number (0 = the first week) that a date falls in."""
    if not start0 or not day:
        return 0
    return max(0, min(WEEKS - 1, (day - start0).days // 7))


def current_week(user_id: str) -> int:
    return week_of(_start0(user_id), _today())


def week_start(user_id: str, week: int) -> date:
    start0 = _start0(user_id)
    if start0:
        return start0 + timedelta(days=7 * week)
    t = _today()
    return t - timedelta(days=t.weekday()) + timedelta(days=7 * week)


def _fmt(d: date) -> str:
    return f"{d.day} {d.strftime('%b %Y')}"


def _rec(user_id: str, week: int) -> dict:
    return get_aeo_content(user_id, KIND, f"w{week}") or {}


def _gate(user_id: str, week: int) -> tuple[str, str]:
    """('', '') when this week may be created now, else (code, reason). code: ended | early | pay."""
    cur = current_week(user_id)
    start = week_start(user_id, week)
    if week < cur:
        return "ended", "This week has ended. Posters and reels can be created for the current week."
    if week > cur or (week > 0 and start > _today()):
        return ("pay" if week >= WEEKS_PER_CYCLE and not is_user_paid(user_id) else "early"), f"The next week's posters and reels can be created from {_fmt(start)}."
    if week >= WEEKS_PER_CYCLE and not is_user_paid(user_id):
        return "pay", "Posters and reels for later months need an active paid plan."
    return "", ""


def status(user_id: str, week: int | None = None) -> dict:
    cur = current_week(user_id)
    week = cur if week is None else max(0, min(WEEKS - 1, int(week)))
    posters, reels = weekly_limits(user_id)
    rec = _rec(user_id, week)
    made, rmade = list(rec.get("dates") or []), list(rec.get("reels") or [])
    start = week_start(user_id, week)
    nxt = start + timedelta(days=7)
    code, reason = _gate(user_id, week)
    # A Starter Pass adds one poster and one reel on top of the free allowance, and works past the first month.
    prec = starter_pass.active_pass(user_id)
    pr = starter_pass.remaining(prec) if prec else {}
    pass_poster = bool(pr.get("poster")) and code in ("", "pay")
    pass_reel = bool(pr.get("reel")) and code in ("", "pay")
    return {
        "week": week, "current_week": cur, "week_start": start.isoformat(), "plan": plan_id_of(user_id),
        "poster_limit": posters, "posters_made": len(made), "reel_limit": reels, "reels_made": len(rmade),
        "can_generate": (not code and len(made) < posters) or pass_poster, "can_generate_reels": (not code and len(rmade) < reels) or pass_reel,
        "pass_remaining": pr or None,
        "next_available": nxt.isoformat() if (len(made) >= posters) else None,
        "needs_payment": code == "pay" and not (pass_poster or pass_reel), "reason": reason if (code and not (pass_poster or pass_reel)) else "",
    }


def _check(user_id: str, day_date: str, acting: bool, field: str, limit_idx: int, noun: str) -> None:
    if acting:
        return
    day = _day_of(day_date)
    week = week_of(_start0(user_id), day)
    kind = "poster" if field == "dates" else "reel"
    code, reason = _gate(user_id, week)
    if code == "pay":
        if starter_pass.can_use(user_id, kind):
            return      # the Starter Pass covers it
        raise_if_lapsed(user_id)
        raise payment_required(user_id, "Posters and reels for later months need an active paid plan.")
    if code:
        raise HTTPException(status_code=409, detail=reason)
    limit = weekly_limits(user_id)[limit_idx]
    made = list(_rec(user_id, week).get(field) or [])
    iso = day.isoformat() if day else ""
    nxt = week_start(user_id, week) + timedelta(days=7)
    if iso and iso in made:
        if field == "dates":
            return      # this day's poster slot is already paid for: an empty poster (another platform, or an image the customer removed) can still get its image
        raise HTTPException(status_code=409, detail=f"This {noun} is already created for this week. Your next generation will be available on {_fmt(nxt)}.")
    if len(made) >= limit:
        if starter_pass.can_use(user_id, kind):
            return      # the Starter Pass covers one more
        raise HTTPException(status_code=409, detail=f"Your plan includes {limit} {noun}s a week and they are all created. Your next generation will be available on {_fmt(nxt)}.")


def check(user_id: str, day_date: str, acting: bool) -> None:
    """Raises (409 / 402) when a poster for this date may not be created now."""
    _check(user_id, day_date, acting, "dates", 0, "poster")


def check_reel(user_id: str, day_date: str, acting: bool) -> None:
    _check(user_id, day_date, acting, "reels", 1, "reel")


def _record(user_id: str, day_date: str, acting: bool, field: str) -> None:
    if acting:
        return
    day = _day_of(day_date)
    week = week_of(_start0(user_id), day)
    with _lock:
        try:
            rec = _rec(user_id, week)
            items = list(rec.get(field) or [])
            if day and day.isoformat() not in items:
                # Past the plan's own allowance (or beyond the first month), this one is paid for by the Starter Pass.
                if len(items) >= weekly_limits(user_id)[0 if field == "dates" else 1] or week >= WEEKS_PER_CYCLE:
                    starter_pass.consume(user_id, "poster" if field == "dates" else "reel")
                items.append(day.isoformat())
            save_aeo_content(user_id, KIND, f"w{week}", {**rec, "week": week, field: items, "first_at": rec.get("first_at") or datetime.now(timezone.utc).isoformat(timespec="seconds")})
        except Exception as e:  # noqa: BLE001 - never lose a poster over bookkeeping
            logger.error(f"[posters] could not record {field} for {user_id}: {e}")


def record(user_id: str, day_date: str, acting: bool) -> None:
    _record(user_id, day_date, acting, "dates")


def record_reel(user_id: str, day_date: str, acting: bool) -> None:
    _record(user_id, day_date, acting, "reels")
