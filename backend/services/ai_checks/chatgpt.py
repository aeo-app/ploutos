"""
services/ai_checks/chatgpt.py — ask ChatGPT (OpenAI Responses API with web search)
"""
from __future__ import annotations

import logging
import os

import requests

from services.ai_checks.answer import MAX_ANSWER_CHARS, EngineAnswer, Source, country_of, failed

logger = logging.getLogger(__name__)

ENGINE = "ChatGPT"
URL = "https://api.openai.com/v1/responses"
MODEL = os.getenv("OPENAI_SEARCH_MODEL", "gpt-5.4-mini")
TIMEOUT_SECONDS = 120


def is_ready() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def ask(question: str, market: str) -> EngineAnswer:
    tool: dict = {"type": "web_search"}
    country = country_of(market)
    if country:
        tool["user_location"] = {"type": "approximate", "country": country}
    try:
        resp = requests.post(
            URL,
            headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY', '')}"},
            json={"model": MODEL, "tools": [tool], "input": question},
            timeout=TIMEOUT_SECONDS,
        )
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning(f"[ai-checks] ChatGPT request failed: {e}")
        return failed(ENGINE, "ChatGPT did not answer in time.")
    if resp.status_code != 200:
        logger.warning(f"[ai-checks] ChatGPT {resp.status_code}: {str(data.get('error'))[:300]}")
        return failed(ENGINE, "ChatGPT could not be asked right now.")

    text, sources, seen = "", [], set()
    for item in data.get("output") or []:
        if item.get("type") != "message":
            continue
        for part in item.get("content") or []:
            text += part.get("text") or ""
            for a in part.get("annotations") or []:
                url = a.get("url")
                if a.get("type") == "url_citation" and url and url not in seen:
                    seen.add(url)
                    sources.append(Source(url=url, title=a.get("title") or ""))
    return EngineAnswer(engine=ENGINE, text=text[:MAX_ANSWER_CHARS], sources=sources)
