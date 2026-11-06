"""
services/backlink_service.py — REAL backlink data for the customer's website
================================================================================
Everything here comes from a backlink index (DataForSEO's Backlinks API), never from the AI model:

  * summary   — how many backlinks / referring domains the site has, its authority rank, spam score
  * backlinks — real linking pages (URL, anchor text, follow/nofollow, source authority, first/last seen)
  * gap       — sites that link to the customer's competitors but not to the customer, each with a real page
                that links to a competitor — these are the outreach targets

Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD (the API credentials from the DataForSEO dashboard) to turn it on.
Without them `configured()` is False and the app says so instead of showing made-up data.

Ranks: DataForSEO's default rank scale is 0-1000; we show 0-100 (BACKLINK_RANK_DIVISOR=10).
"""
from __future__ import annotations

import base64
import logging
import os
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

LOGIN = os.getenv("DATAFORSEO_LOGIN", "")
PASSWORD = os.getenv("DATAFORSEO_PASSWORD", "")
API_BASE = os.getenv("DATAFORSEO_API_BASE", "https://api.dataforseo.com/v3")
RANK_DIVISOR = float(os.getenv("BACKLINK_RANK_DIVISOR", "10"))
TIMEOUT = float(os.getenv("BACKLINK_TIMEOUT_SECONDS", "60"))
MY_LIMIT = int(os.getenv("BACKLINK_MY_LIMIT", "100"))          # real linking pages shown for the customer
GAP_LIMIT = int(os.getenv("BACKLINK_GAP_LIMIT", "300"))        # rows fetched before ranking the gap
COMPETITOR_PAGES = int(os.getenv("BACKLINK_COMPETITOR_PAGE_LIMIT", "200"))
MAX_COMPETITORS = int(os.getenv("BACKLINK_MAX_COMPETITORS", "4"))
SPAM_CUTOFF = int(os.getenv("BACKLINK_SPAM_CUTOFF", "50"))


class BacklinkError(Exception):
    """Message is safe to show to the customer."""


def configured() -> bool:
    return bool(LOGIN and PASSWORD)


def domain_of(value: str) -> str:
    """'https://www.Acme.sg/about?x=1' -> 'acme.sg'."""
    v = (value or "").strip().lower()
    if not v:
        return ""
    if "//" not in v:
        v = "//" + v
    host = (urlparse(v).hostname or "").strip(".")
    return re.sub(r"^www\.", "", host)


def _rank(v) -> int | None:
    try:
        return int(round(float(v) / RANK_DIVISOR))
    except (TypeError, ValueError):
        return None


def _day(v) -> str:
    """'2019-11-15 12:57:46 +00:00' -> '2019-11-15'."""
    return str(v or "")[:10]


def _post(path: str, task: dict, cost: list[float]) -> list:
    """One DataForSEO call. Returns the task's `result` list; raises BacklinkError with a clean message."""
    if not configured():
        raise BacklinkError("Real backlink data is not connected yet.")
    token = base64.b64encode(f"{LOGIN}:{PASSWORD}".encode()).decode()
    try:
        resp = requests.post(f"{API_BASE}{path}", json=[task], timeout=TIMEOUT,
                             headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"})
    except requests.RequestException as e:
        logger.error(f"[backlinks] request to {path} failed: {e}")
        raise BacklinkError("We could not reach the backlink service. Please try again in a few minutes.")
    if resp.status_code in (401, 403):
        logger.error(f"[backlinks] provider rejected the credentials ({resp.status_code})")
        raise BacklinkError("The backlink service is not set up correctly yet. Our team has been notified.")
    try:
        body = resp.json()
    except ValueError:
        raise BacklinkError("The backlink service sent an unreadable answer. Please try again.")
    tasks = body.get("tasks") or []
    t = tasks[0] if tasks else {}
    code = t.get("status_code") or body.get("status_code")
    if code != 20000:
        msg = t.get("status_message") or body.get("status_message") or f"status {code}"
        logger.error(f"[backlinks] {path} -> {code} {msg}")
        if code in (40200, 40201, 40202):        # payment / balance problems on OUR account
            raise BacklinkError("Backlink data is temporarily unavailable. Our team has been notified.")
        raise BacklinkError("The backlink service could not complete this request. Please try again later.")
    try:
        cost.append(float(t.get("cost") or 0))
    except (TypeError, ValueError):
        pass
    return t.get("result") or []


# ── the three data pulls ─────────────────────────────────────────────────────
def fetch_summary(domain: str, cost: list[float]) -> dict:
    res = _post("/backlinks/summary/live", {"target": domain, "include_subdomains": True, "backlinks_status_type": "live"}, cost)
    r = (res or [{}])[0] or {}
    return {
        "rank": _rank(r.get("rank")), "backlinks": int(r.get("backlinks") or 0),
        "referring_domains": int(r.get("referring_domains") or 0), "referring_main_domains": int(r.get("referring_main_domains") or 0),
        "referring_domains_nofollow": int(r.get("referring_domains_nofollow") or 0),
        "broken_backlinks": int(r.get("broken_backlinks") or 0), "spam_score": r.get("backlinks_spam_score"),
        "first_seen": _day(r.get("first_seen")),
    }


def _norm_backlink(it: dict) -> dict:
    return {
        "page_url": it.get("url_from") or "", "page_title": (it.get("page_from_title") or "")[:160],
        "domain": domain_of(it.get("domain_from") or it.get("url_from") or ""), "target_url": it.get("url_to") or "",
        "anchor": (it.get("anchor") or "")[:120], "dofollow": bool(it.get("dofollow")),
        "authority": _rank(it.get("domain_from_rank")), "type": it.get("item_type") or "anchor",
        "first_seen": _day(it.get("first_seen")), "last_seen": _day(it.get("last_seen")), "lost": bool(it.get("is_lost")),
        "spam": it.get("backlink_spam_score"),
    }


def fetch_backlinks(domain: str, limit: int, cost: list[float], status: str = "all") -> list[dict]:
    res = _post("/backlinks/backlinks/live", {
        "target": domain, "mode": "one_per_domain", "limit": limit, "backlinks_status_type": status,
        "order_by": ["domain_from_rank,desc"],
    }, cost)
    items = ((res or [{}])[0] or {}).get("items") or []
    return [b for b in (_norm_backlink(i) for i in items) if b["page_url"]]


def fetch_gap_domains(domain: str, competitors: list[str], limit: int, cost: list[float]) -> list[dict]:
    """Referring domains that link to at least one competitor but not to `domain`."""
    res = _post("/backlinks/domain_intersection/live", {
        "targets": {str(i + 1): c for i, c in enumerate(competitors)}, "exclude_targets": [domain],
        "intersection_mode": "partial", "limit": limit,
    }, cost)
    items = ((res or [{}])[0] or {}).get("items") or []
    out = []
    for it in items:
        inter = it.get("domain_intersection") or {}
        links, ref, rank, spam = [], "", None, 0
        for k, v in inter.items():
            if not isinstance(v, dict):
                continue
            ref = ref or domain_of(v.get("target") or "")
            r = _rank(v.get("rank"))
            rank = max(rank or 0, r or 0) if r is not None else rank
            try:
                spam = max(spam, int(v.get("backlinks_spam_score") or 0))
            except (TypeError, ValueError):
                pass
            try:
                idx = int(k) - 1
            except ValueError:
                continue
            if 0 <= idx < len(competitors):
                links.append({"competitor": competitors[idx], "backlinks": int(v.get("backlinks") or 0)})
        if ref and links:
            out.append({"domain": ref, "authority": rank, "links_to": links, "spam": spam})
    return out


def build_report(domain: str, competitors: list[str], full: bool) -> dict:
    """The whole backlink report for one customer. `full=False` (free plan): summary + a few real backlinks only."""
    domain = domain_of(domain)
    if not domain:
        raise BacklinkError("Add your website in your profile first.")
    comps = []
    for c in competitors or []:
        d = domain_of(c)
        if d and d != domain and d not in comps:
            comps.append(d)
    comps = comps[:MAX_COMPETITORS]
    cost: list[float] = []
    summary = fetch_summary(domain, cost)
    mine = fetch_backlinks(domain, MY_LIMIT if full else 5, cost)
    gap: list[dict] = []
    gap_note = ""
    if full:
        if not comps:
            gap_note = "Add or keep at least one competitor on your Competitors page to see where they are linked and you are not."
        else:
            have = {b["domain"] for b in mine if not b["lost"]}
            rows = [g for g in fetch_gap_domains(domain, comps, GAP_LIMIT, cost)
                    if g["domain"] not in have and g["domain"] != domain and g["domain"] not in comps and g["spam"] < SPAM_CUTOFF]
            rows.sort(key=lambda g: (len(g["links_to"]), g["authority"] or 0), reverse=True)
            rows = rows[:50]
            # A real page that links to a competitor, for each of those sites (one call per competitor).
            pages: dict[str, dict] = {}
            for c in comps:
                try:
                    for b in fetch_backlinks(c, COMPETITOR_PAGES, cost, status="live"):
                        if not b["lost"]:
                            pages.setdefault(b["domain"], {**b, "competitor": c})
                except BacklinkError as e:       # one competitor failing must not lose the whole report
                    logger.warning(f"[backlinks] competitor pages for {c} failed: {e}")
            for g in rows:
                p = pages.get(g["domain"])
                g["example"] = ({"page_url": p["page_url"], "title": p["page_title"], "anchor": p["anchor"], "competitor": p["competitor"], "dofollow": p["dofollow"]} if p else None)
                g["site_url"] = f"https://{g['domain']}"
                g.pop("spam", None)
            gap = rows
    return {
        "domain": domain, "competitors": comps, "fetched_at": datetime.now(timezone.utc).isoformat(),
        "limited": not full, "summary": summary, "backlinks": mine, "gap": gap, "gap_note": gap_note,
        "cost_usd": round(sum(cost), 4), "source": "DataForSEO Backlinks",
    }
