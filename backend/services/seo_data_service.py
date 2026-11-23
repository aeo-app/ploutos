"""
services/seo_data_service.py — real Google data for one keyword (DataForSEO)

For the SEO Strategy page. Everything returned here comes from DataForSEO, never from the AI model:
  * monthly searches, competition and cost per click  (Google Ads data)
  * keyword difficulty, 0-100                          (DataForSEO Labs)
  * related keywords with their own searches           (DataForSEO Labs)
  * the pages ranking on Google right now, and where the customer's own site is (Google results)

Uses the same DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD as the backlink and AI-answer checks. Every call is best effort:
a failure or a missing number just leaves that part out, and the strategy is still written from the website alone.
"""
from __future__ import annotations

import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests

from services.ai_checks.answer import location_code_of

logger = logging.getLogger(__name__)

API_BASE = os.getenv("DATAFORSEO_API_BASE", "https://api.dataforseo.com/v3")
TIMEOUT = float(os.getenv("SEO_DATA_TIMEOUT_SECONDS", "60"))
SERP_DEPTH = int(os.getenv("SEO_SERP_DEPTH", "20"))      # results read, so we can tell if the customer is on page 1 or 2
SOURCE = "DataForSEO"

# Sites that are directories, social networks or marketplaces rather than a business's own pages.
_DIRECTORIES = ("facebook.", "instagram.", "linkedin.", "youtube.", "yelp.", "tripadvisor.", "reddit.", "quora.", "pinterest.",
                "wikipedia.", "carousell.", "yellowpages", "sulekha.", "justdial.", "indeed.", "glassdoor.", "tiktok.")


def configured() -> bool:
    return bool(os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD"))


def _clean(keyword: str) -> str:
    """Google Ads accepts lower-case words only, up to 10 words / 80 characters."""
    words = re.sub(r"[^\w\s.'&-]", " ", (keyword or "").lower()).split()
    return " ".join(words[:10])[:80].strip()


def _host(url_or_domain: str) -> str:
    v = (url_or_domain or "").strip().lower()
    if not v:
        return ""
    if "//" not in v:
        v = "//" + v
    return re.sub(r"^www\.", "", (urlparse(v).hostname or "").strip("."))


def _post(path: str, task: dict) -> list:
    """One DataForSEO call; returns the task's result list, or [] when it cannot be read (logged, never raised)."""
    try:
        resp = requests.post(f"{API_BASE}{path}", json=[task], timeout=TIMEOUT,
                             auth=(os.getenv("DATAFORSEO_LOGIN", ""), os.getenv("DATAFORSEO_PASSWORD", "")))
        body = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning(f"[seo-data] {path} request failed: {e}")
        return []
    t = ((body or {}).get("tasks") or [{}])[0] if isinstance(body, dict) else {}
    if t.get("status_code") != 20000:
        logger.warning(f"[seo-data] {path} -> {t.get('status_code')} {t.get('status_message')}")
        return []
    return t.get("result") or []


def _volume(kw: str, loc: int) -> dict:
    """Monthly searches, competition and cost per click from Google Ads data."""
    res = _post("/keywords_data/google_ads/search_volume/live", {"keywords": [kw], "location_code": loc, "language_code": "en"})
    r = (res or [{}])[0] or {}
    out: dict = {}
    if isinstance(r.get("search_volume"), int):
        out["monthly_searches"] = r["search_volume"]
    if r.get("competition"):
        out["competition"] = str(r["competition"]).title()           # Low / Medium / High
    try:
        if r.get("cpc") is not None:
            out["cpc"] = round(float(r["cpc"]), 2)
    except (TypeError, ValueError):
        pass
    months = sorted((m for m in (r.get("monthly_searches") or []) if isinstance(m, dict) and isinstance(m.get("search_volume"), int)),
                    key=lambda m: (m.get("year") or 0, m.get("month") or 0))
    if months:
        out["trend"] = [m["search_volume"] for m in months][-12:]           # oldest first, last 12 months
    return out


def _difficulty(kw: str, loc: int) -> int | None:
    res = _post("/dataforseo_labs/google/bulk_keyword_difficulty/live", {"keywords": [kw], "location_code": loc, "language_code": "en"})
    for item in ((res or [{}])[0] or {}).get("items") or []:
        d = item.get("keyword_difficulty")
        if isinstance(d, (int, float)):
            return int(round(d))
    return None


def _related(kw: str, loc: int, limit: int = 10) -> list[dict]:
    res = _post("/dataforseo_labs/google/keyword_suggestions/live", {
        "keyword": kw, "location_code": loc, "language_code": "en", "limit": limit,
        "order_by": ["keyword_info.search_volume,desc"], "include_seed_keyword": False,
    })
    out = []
    for it in ((res or [{}])[0] or {}).get("items") or []:
        k = str(it.get("keyword", "")).strip()
        info = it.get("keyword_info") or {}
        vol = info.get("search_volume")
        if k and k.lower() != kw.lower() and isinstance(vol, int) and vol > 0:
            diff = (it.get("keyword_properties") or {}).get("keyword_difficulty")
            out.append({"keyword": k, "monthly_searches": vol, "difficulty": int(diff) if isinstance(diff, (int, float)) else None})
    return out[:limit]


def _page_type(host: str, url: str, title: str) -> str:
    if any(d in host for d in _DIRECTORIES):
        return "Directory or social"
    text = f"{url} {title}".lower()
    if re.search(r"\b(blog|guide|how-to|how to|what is|tips|checklist|ultimate|learn)\b", text):
        return "Guide or article"
    if re.search(r"\b(price|pricing|cost|quote|rates|packages)\b", text):
        return "Pricing page"
    if re.search(r"\b(best|top \d*|vs|compare|reviews?)\b", text):
        return "Comparison or list"
    return "Service or home page"


def _serp(kw: str, loc: int, my_host: str) -> tuple[list[dict], int | None]:
    res = _post("/serp/google/organic/live/regular", {
        "keyword": kw, "location_code": loc, "language_code": "en", "device": "desktop", "depth": SERP_DEPTH,
    })
    rows, mine = [], None
    for it in ((res or [{}])[0] or {}).get("items") or []:
        if it.get("type") != "organic":
            continue
        pos = it.get("rank_group")
        url, title = str(it.get("url", "")), str(it.get("title", "")).strip()
        host = _host(it.get("domain") or url)
        if not (isinstance(pos, int) and url and host):
            continue
        if my_host and mine is None and (host == my_host or host.endswith("." + my_host)):
            mine = pos
        rows.append({"position": pos, "title": title[:140], "url": url[:300], "domain": host, "page_type": _page_type(host, url, title)})
    return rows[:10], mine


def gather(keyword: str, market: str, site_url: str, related: bool = True) -> dict:
    """Real Google data for a keyword in the customer's market. {} when DataForSEO is off or the market is unknown.
    Never raises: each piece that cannot be read is simply missing."""
    kw = _clean(keyword)
    loc = location_code_of(market)
    if not (kw and loc and configured()):
        return {}
    my_host = _host(site_url)
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            f_vol = pool.submit(_volume, kw, loc)
            f_diff = pool.submit(_difficulty, kw, loc)
            f_serp = pool.submit(_serp, kw, loc, my_host)
            f_rel = pool.submit(_related, kw, loc) if related else None
            vol, diff, (serp, mine) = f_vol.result(), f_diff.result(), f_serp.result()
            rel = f_rel.result() if f_rel else []
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[seo-data] gather failed for {kw!r}: {e}")
        return {}
    data = {**vol, "difficulty": diff, "related": rel, "serp": serp, "your_position": mine, "your_site": my_host}
    if not (vol or diff is not None or rel or serp):
        return {}
    data["source"] = SOURCE
    data["market"] = market
    data["checked_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    return data


def prompt_block(d: dict, keyword: str) -> str:
    """The real figures as text for the strategy prompt (so the plan is built on them, and the model may quote only these)."""
    if not d:
        return ""
    lines = [f"REAL GOOGLE DATA for \"{keyword}\" in {d.get('market', 'the market')} (from DataForSEO, use these exact figures, never invent others):"]
    if d.get("monthly_searches") is not None:
        lines.append(f"- Monthly searches: {d['monthly_searches']}")
    if d.get("difficulty") is not None:
        lines.append(f"- Keyword difficulty: {d['difficulty']}/100 ({'easy' if d['difficulty'] < 30 else 'moderate' if d['difficulty'] < 60 else 'hard'})")
    if d.get("competition"):
        lines.append(f"- Advertiser competition: {d['competition']}")
    if d.get("serp"):
        lines.append("- Pages ranking on Google now:")
        lines += [f"  {r['position']}. {r['domain']} — \"{r['title']}\" ({r['page_type']})" for r in d["serp"]]
    if d.get("your_site"):
        pos = d.get("your_position")
        lines.append(f"- The customer's site ({d['your_site']}) ranks at position {pos}." if pos else f"- The customer's site ({d['your_site']}) is not in Google's top {SERP_DEPTH} for this keyword.")
    if d.get("related"):
        lines.append("- Related searches people really make: " + "; ".join(f"{r['keyword']} ({r['monthly_searches']}/mo)" for r in d["related"][:8]))
    lines.append("Use this to choose the page types the top results use, to say what the customer's pages must do better, and to pick "
                 "realistic long-tail targets when the keyword is hard. If the keyword is hard (60+), lead with the easier related searches.")
    return "\n".join(lines)
