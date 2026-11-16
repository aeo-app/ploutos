"""
services/ai_checks/ai_overviews.py — Google AI Overviews, read from a real Google search (DataForSEO SERP API)

Google has no API for its search results, so DataForSEO runs the search for us and returns the
AI Overview box with its source links. A search without an AI Overview is a real result too:
the answer is then empty with a note, and counts as "not mentioned".
"""
from __future__ import annotations

import logging
import os

import requests

from services.ai_checks.answer import MAX_ANSWER_CHARS, EngineAnswer, Source, failed, location_code_of

logger = logging.getLogger(__name__)

ENGINE = "AI Overviews"
URL = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced"
TIMEOUT_SECONDS = 120


def is_ready() -> bool:
    return bool(os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD"))


def ask(question: str, market: str) -> EngineAnswer:
    task = {"keyword": question, "language_code": "en", "device": "desktop", "load_async_ai_overview": True}
    code = location_code_of(market)
    if code:
        task["location_code"] = code
    else:
        task["location_name"] = "United States"
    try:
        resp = requests.post(URL, auth=(os.getenv("DATAFORSEO_LOGIN", ""), os.getenv("DATAFORSEO_PASSWORD", "")),
                             json=[task], timeout=TIMEOUT_SECONDS)
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning(f"[ai-checks] AI Overviews request failed: {e}")
        return failed(ENGINE, "Google search could not be read in time.")

    t = (data.get("tasks") or [{}])[0]
    if data.get("status_code") != 20000 or t.get("status_code") != 20000:
        logger.warning(f"[ai-checks] DataForSEO {data.get('status_code')}/{t.get('status_code')}: "
                       f"{data.get('status_message')} / {t.get('status_message')}")
        return failed(ENGINE, "Google search could not be read right now.")

    items = ((t.get("result") or [{}])[0] or {}).get("items") or []
    overview = next((i for i in items if i.get("type") == "ai_overview"), None)
    if not overview:
        return EngineAnswer(engine=ENGINE, note="Google showed no AI Overview for this search.")

    text = overview.get("markdown") or " ".join(
        str(e.get("text") or "") for e in overview.get("items") or [] if isinstance(e, dict))
    sources = [Source(url=r["url"], title=r.get("title") or r.get("source") or "")
               for r in overview.get("references") or [] if r.get("url")]
    return EngineAnswer(engine=ENGINE, text=text[:MAX_ANSWER_CHARS], sources=sources)
