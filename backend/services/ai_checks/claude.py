"""
services/ai_checks/claude.py — ask Claude (Amazon Bedrock) with live web search

Anthropic's built-in web search is not offered on Bedrock, so Claude gets a `web_search` tool
that we fulfil with AWS's own search (Bedrock AgentCore Web Search): Claude decides what to
search, we run the search, and Claude answers from the results, like Claude with search on.
Needs IAM `bedrock-agentcore:InvokeWebSearch` and a boto3 with the `bedrock-agentcore` client.
"""
from __future__ import annotations

import logging
import os

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from services.ai_checks.answer import MAX_ANSWER_CHARS, EngineAnswer, Source, failed, urls_in
from services.bedrock_service import (
    MODEL_ID,
    MOVERSLY_AWS_ACCESS_KEY_ID,
    MOVERSLY_AWS_SECRET_ACCESS_KEY,
    _converse_with_retry,
    _get_client,
)

logger = logging.getLogger(__name__)

ENGINE = "Claude"
SEARCH_REGION = os.getenv("AGENTCORE_SEARCH_REGION", "us-east-1")   # Web Search isn't offered in every region
MAX_SEARCH_ROUNDS = 4
RESULTS_PER_SEARCH = 8
RESULT_TEXT_CHARS = 1500

_SYSTEM = "You are a helpful assistant. Search the web when it helps answer the question, and cite the links you used."
_TOOLS = {"tools": [{"toolSpec": {
    "name": "web_search",
    "description": "Search the web for current information. Returns result titles, URLs and text extracts.",
    "inputSchema": {"json": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
}}]}

_search_client = None


def is_ready() -> bool:
    return bool(MOVERSLY_AWS_ACCESS_KEY_ID and MOVERSLY_AWS_SECRET_ACCESS_KEY)


def _searcher():
    global _search_client
    if _search_client is None:
        _search_client = boto3.client(
            "bedrock-agentcore", region_name=SEARCH_REGION,
            aws_access_key_id=MOVERSLY_AWS_ACCESS_KEY_ID, aws_secret_access_key=MOVERSLY_AWS_SECRET_ACCESS_KEY,
        )
    return _search_client


def _search(query: str) -> list[dict]:
    resp = _searcher().invoke_web_search(webSearchId="web-search.v1", searchQuery=query, maxResults=RESULTS_PER_SEARCH)
    return [{"title": r.get("title", ""), "url": r.get("url", ""), "text": (r.get("text") or "")[:RESULT_TEXT_CHARS]}
            for r in resp.get("results") or []]


def ask(question: str, market: str) -> EngineAnswer:
    messages = [{"role": "user", "content": [{"text": question}]}]
    found: dict[str, Source] = {}
    try:
        for _ in range(MAX_SEARCH_ROUNDS + 1):
            resp = _converse_with_retry(lambda: _get_client().converse(
                modelId=MODEL_ID, system=[{"text": _SYSTEM}], messages=messages, toolConfig=_TOOLS,
                inferenceConfig={"maxTokens": 2000},
            ))
            message = resp["output"]["message"]
            messages.append(message)
            if resp.get("stopReason") != "tool_use":
                break
            tool_results = []
            for block in message["content"]:
                if "toolUse" not in block:
                    continue
                results = _search(str(block["toolUse"]["input"].get("query") or question))
                for r in results:
                    if r["url"]:
                        found.setdefault(r["url"], Source(url=r["url"], title=r["title"]))
                tool_results.append({"toolResult": {"toolUseId": block["toolUse"]["toolUseId"],
                                                    "content": [{"json": {"results": results}}]}})
            messages.append({"role": "user", "content": tool_results})
    except (ClientError, BotoCoreError) as e:
        logger.warning(f"[ai-checks] Claude request failed: {e}")
        return failed(ENGINE, "Claude could not be asked right now.")

    text = "".join(block.get("text", "") for block in messages[-1].get("content", []) if isinstance(block, dict))
    # Sources = links Claude actually put in its answer (titles taken from the search results when known).
    sources = [found.get(url) or Source(url=url) for url in urls_in(text)]
    return EngineAnswer(engine=ENGINE, text=text[:MAX_ANSWER_CHARS], sources=sources)
