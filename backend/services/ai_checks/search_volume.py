"""
services/ai_checks/search_volume.py — real monthly Google searches (Google Ads data via DataForSEO)

Google only counts searches for short keywords, not for whole questions, so every question carries
a short keyword ("hire react developer") and this returns how many times a month people in the
market search it on Google (average of the last 12 months). One request covers all the keywords.
A keyword Google has no number for (too few searches) is left out, and the dashboard shows "—".
"""
from __future__ import annotations

import logging
import os
import re

import requests

from services.ai_checks.answer import location_code_of

logger = logging.getLogger(__name__)

URL = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live"
TIMEOUT_SECONDS = 120
MAX_WORDS = 10      # Google Ads rejects longer keywords
MAX_CHARS = 80


def is_ready() -> bool:
    return bool(os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD"))


def clean_keyword(text: str) -> str:
    """A keyword in the form Google Ads accepts: lower case, no symbols, at most 10 words / 80 characters."""
    words = re.sub(r"[^\w\s.'&-]", " ", (text or "").lower()).split()
    return " ".join(words[:MAX_WORDS])[:MAX_CHARS].strip()


def monthly_searches(keywords: list[str], market: str) -> dict[str, int]:
    """{clean keyword: average monthly Google searches in the market}. Empty when it cannot be read."""
    wanted = list(dict.fromkeys(k for k in map(clean_keyword, keywords) if k))
    if not wanted or not is_ready():
        return {}
    task: dict = {"keywords": wanted, "language_code": "en"}
    code = location_code_of(market)
    if code:
        task["location_code"] = code      # unknown market: Google's worldwide numbers
    try:
        resp = requests.post(URL, auth=(os.getenv("DATAFORSEO_LOGIN", ""), os.getenv("DATAFORSEO_PASSWORD", "")),
                             json=[task], timeout=TIMEOUT_SECONDS)
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning(f"[ai-checks] search volume request failed: {e}")
        return {}
    if not isinstance(data, dict):
        return {}

    t = (data.get("tasks") or [{}])[0]
    if data.get("status_code") != 20000 or t.get("status_code") != 20000:
        logger.warning(f"[ai-checks] search volume DataForSEO {data.get('status_code')}/{t.get('status_code')}: "
                       f"{data.get('status_message')} / {t.get('status_message')}")
        return {}
    return {str(r.get("keyword", "")).lower(): r["search_volume"]
            for r in t.get("result") or [] if isinstance(r.get("search_volume"), int) and r["search_volume"] > 0}
