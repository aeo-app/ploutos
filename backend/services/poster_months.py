"""
services/poster_months.py - posters are created one month at a time
====================================================================
A customer's calendar is made of 4-week months (month 1 starts on `calendar_start`). The posters of a month can be created once:

  * the current month: once; after that the next poster generation opens on the first day of the next month;
  * a later month: only on or after its first day, and only for a paid, current subscription (payment confirmed);
  * a month that has ended: not at all.

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
from db.dynamo import get_aeo_content, get_aeo_state, save_aeo_content
from db.payments_dynamo import is_user_paid

logger = logging.getLogger(__name__)

MONTH_DAYS = 28
MAX_POSTERS_PER_MONTH = 12          # 3 posters a week x 4 weeks
KIND = "posterlock"
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


def _cycle_of(start0: date | None, day: date | None) -> int:
    if not start0 or not day:
        return 0
    return max(0, min(23, (day - start0).days // MONTH_DAYS))


def window(user_id: str, cycle: int) -> tuple[date, date]:
    """(first day of the month, first day of the next month) for one month of the customer's calendar."""
    start0 = _start0(user_id)
    if start0:
        return start0 + timedelta(days=MONTH_DAYS * cycle), start0 + timedelta(days=MONTH_DAYS * (cycle + 1))
    t = _today()                                   # no calendar start recorded yet: the calendar month
    first = t.replace(day=1)
    return first, (first + timedelta(days=32)).replace(day=1)


def current_cycle(user_id: str) -> int:
    return _cycle_of(_start0(user_id), _today())


def _fmt(d: date) -> str:
    return f"{d.day} {d.strftime('%b %Y')}"


def status(user_id: str, cycle: int | None = None) -> dict:
    cur = current_cycle(user_id)
    cycle = cur if cycle is None else max(0, min(23, int(cycle)))
    start, nxt = window(user_id, cycle)
    rec = get_aeo_content(user_id, KIND, f"c{cycle}") or {}
    dates = rec.get("dates") or []
    today = _today()
    generated = bool(dates)
    out = {"cycle": cycle, "current_cycle": cur, "generated": generated, "count": len(dates), "month_start": start.isoformat(),
           "next_available": nxt.isoformat() if generated else None, "can_generate": True, "needs_payment": False, "reason": ""}
    if cycle < cur:
        out.update(can_generate=False, reason="This month has ended. Posters can be created for the current month.")
    elif start > today:
        out.update(can_generate=False, needs_payment=cycle >= 1 and not is_user_paid(user_id),
                   reason=f"Posters for this month can be created from {_fmt(start)}.")
    if out["can_generate"] and cycle >= 1 and not is_user_paid(user_id):
        out.update(can_generate=False, needs_payment=True, reason="Posters for later months need an active paid plan.")
    return out


def check(user_id: str, day_date: str, acting: bool) -> None:
    """Raises (409 / 402) when a poster for this date may not be created now."""
    if acting:
        return
    day = _day_of(day_date)
    cycle = _cycle_of(_start0(user_id), day)
    cur = current_cycle(user_id)
    start, nxt = window(user_id, cycle)
    today = _today()
    if cycle < cur:
        raise HTTPException(status_code=409, detail="This month has ended. Posters can be created for the current month.")
    if start > today:
        raise HTTPException(status_code=409, detail=f"Posters for this month can be created from {_fmt(start)}.")
    if cycle >= 1:                                  # a later month: only after payment is confirmed
        raise_if_lapsed(user_id)
        if not is_user_paid(user_id):
            raise payment_required(user_id, "Posters for later months need an active paid plan.")
    rec = get_aeo_content(user_id, KIND, f"c{cycle}") or {}
    dates = rec.get("dates") or []
    iso = day.isoformat() if day else ""
    if iso and iso in dates:
        raise HTTPException(status_code=409, detail=f"This month's posters are already created. Your next poster generation will be available on {_fmt(nxt)}.")
    if len(dates) >= MAX_POSTERS_PER_MONTH:
        raise HTTPException(status_code=409, detail=f"You have created all the posters for this month. Your next poster generation will be available on {_fmt(nxt)}.")


def record(user_id: str, day_date: str, acting: bool) -> None:
    """Remember that the poster for this date was created (called after it succeeded)."""
    if acting:
        return
    day = _day_of(day_date)
    cycle = _cycle_of(_start0(user_id), day)
    with _lock:
        try:
            rec = get_aeo_content(user_id, KIND, f"c{cycle}") or {}
            dates = list(rec.get("dates") or [])
            if day and day.isoformat() not in dates:
                dates.append(day.isoformat())
            save_aeo_content(user_id, KIND, f"c{cycle}", {"cycle": cycle, "dates": dates, "first_at": rec.get("first_at") or datetime.now(timezone.utc).isoformat(timespec="seconds")})
        except Exception as e:  # noqa: BLE001 - never lose a poster over bookkeeping
            logger.error(f"[posters] could not record poster for {user_id}: {e}")
