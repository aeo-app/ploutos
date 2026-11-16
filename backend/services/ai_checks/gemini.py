"""
services/ai_checks/gemini.py — ask Gemini (Gemini API with Grounding with Google Search)
"""
from __future__ import annotations

import logging
import os

import requests

from services.ai_checks.answer import MAX_ANSWER_CHARS, EngineAnswer, Source, failed

logger = logging.getLogger(__name__)

ENGINE = "Gemini"
MODEL = os.getenv("GEMINI_SEARCH_MODEL", "gemini-flash-latest")
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
TIMEOUT_SECONDS = 120
_REDIRECT_HOST = "vertexaisearch.cloud.google.com"


def is_ready() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def ask(question: str, market: str) -> EngineAnswer:
    try:
        resp = requests.post(
            URL,
            headers={"x-goog-api-key": os.getenv("GEMINI_API_KEY", "")},
            json={"contents": [{"parts": [{"text": question}]}], "tools": [{"google_search": {}}]},
            timeout=TIMEOUT_SECONDS,
        )
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning(f"[ai-checks] Gemini request failed: {e}")
        return failed(ENGINE, "Gemini did not answer in time.")
    if resp.status_code != 200:
        logger.warning(f"[ai-checks] Gemini {resp.status_code}: {str(data.get('error'))[:300]}")
        return failed(ENGINE, "Gemini could not be asked right now.")

    candidate = (data.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in (candidate.get("content") or {}).get("parts") or [])
    sources = []
    for chunk in (candidate.get("groundingMetadata") or {}).get("groundingChunks") or []:
        web = chunk.get("web") or {}
        uri, title = web.get("uri") or "", web.get("title") or ""
        # Google returns redirect links; the title is the source website (e.g. "upwork.com").
        if _REDIRECT_HOST in uri and "." in title and " " not in title:
            uri = "https://" + title
        if uri:
            sources.append(Source(url=uri, title=title))
    return EngineAnswer(engine=ENGINE, text=text[:MAX_ANSWER_CHARS], sources=sources)
