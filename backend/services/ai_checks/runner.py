"""
services/ai_checks/runner.py — ask every question to every ready AI tool, read the answers, total the results
"""
from __future__ import annotations

import json
import logging
import os
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Callable, Optional

from services.ai_checks import ai_overviews, chatgpt, claude, gemini
from services.ai_checks.answer import EngineAnswer, failed, host_of
from services.ai_checks.reader import Reading, name_key, is_customer_name, read_answer
from services.bedrock_service import TokenUsageTracker

logger = logging.getLogger(__name__)

ENGINES = ("ChatGPT", "Claude", "Gemini", "AI Overviews")    # column order on the dashboard
_TOOLS = {"ChatGPT": chatgpt, "Claude": claude, "Gemini": gemini, "AI Overviews": ai_overviews}
MAX_PARALLEL = int(os.getenv("AI_CHECKS_MAX_PARALLEL", "8"))
STORED_ANSWER_CHARS = 2000      # each saved answer is cut to this, so a full analysis fits one database item
STORED_SOURCES = 8
STORED_DOC_LIMIT = 300_000      # bytes; DynamoDB items cap at 400 KB


@dataclass
class Check:
    question: str
    engine: str
    answer: EngineAnswer
    reading: Optional[Reading] = None    # None when the tool could not be asked

    @property
    def cell(self) -> Optional[int]:
        return self.reading.cell if self.reading else None


@dataclass
class Rival:
    name: str
    domain: str = ""
    answers: int = 0                                   # answers that name it
    questions: set[str] = field(default_factory=set)   # questions where it appears
    engines: Counter = field(default_factory=Counter)


@dataclass
class Summary:
    cells: dict[str, list[Optional[int]]]   # question -> one cell per ENGINES column (None = not checked)
    checked_answers: int
    mentioned_answers: int
    linked_answers: int
    share_of_voice: int                     # % of all business mentions that are the customer
    rivals: list[dict]                      # businesses named instead, most named first
    platforms: list[tuple[str, int]]        # marketplaces / directories AI names, with counts
    source_sites: list[tuple[str, int]]     # websites AI used as sources, with counts
    engine_leaders: list[str]               # most-named business per ENGINES column


def ready_engines() -> list[str]:
    return [e for e in ENGINES if _TOOLS[e].is_ready()]


def run_checks(questions: list[str], company: str, domain: str, market: str,
               engines: Optional[list[str]] = None, usage_tracker: TokenUsageTracker | None = None,
               on_progress: Optional[Callable[[int, int], None]] = None) -> list[Check]:
    """Every question × every ready tool, in parallel. One tool failing never stops the others.
    `on_progress(done, total)` is called after each check."""
    use = [e for e in (engines or ENGINES) if e in _TOOLS and _TOOLS[e].is_ready()]

    def one(question: str, engine: str) -> Check:
        try:
            answer = _TOOLS[engine].ask(question, market)
            if answer.error:
                return Check(question, engine, answer)
            return Check(question, engine, answer, read_answer(question, answer, company, domain, usage_tracker))
        except Exception as e:  # noqa: BLE001
            logger.error(f"[ai-checks] {engine} check failed for {question!r}: {e}", exc_info=True)
            return Check(question, engine, failed(engine, "This AI tool could not be checked right now."))

    jobs = [(q, e) for q in questions for e in use]
    logger.info(f"[ai-checks] {company}: {len(questions)} questions x {use} = {len(jobs)} checks")
    results: list[Optional[Check]] = [None] * len(jobs)
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
        futures = {pool.submit(one, q, e): i for i, (q, e) in enumerate(jobs)}
        for done, future in enumerate(as_completed(futures), start=1):
            results[futures[future]] = future.result()
            if on_progress:
                on_progress(done, len(jobs))
    return [c for c in results if c]


def answers_doc(checks: list[Check]) -> dict:
    """The real answers in a compact form for saving: question -> engine -> answer, sources and result."""
    def doc(chars: int) -> dict:
        out: dict[str, dict] = defaultdict(dict)
        for c in checks:
            out[c.question][c.engine] = {
                "cell": c.cell,
                "text": c.answer.text[:chars],
                "sources": [{"url": s.url, "title": s.title} for s in c.answer.sources[:STORED_SOURCES]],
                "competitors": [b.name for b in c.reading.competitors][:8] if c.reading else [],
                "note": c.answer.note,
                "error": c.answer.error,
            }
        return dict(out)

    stored = doc(STORED_ANSWER_CHARS)
    if len(json.dumps(stored)) > STORED_DOC_LIMIT:      # very many questions: keep shorter extracts
        stored = doc(STORED_ANSWER_CHARS // 3)
    return stored


def summarize(checks: list[Check], company: str, domain: str) -> Summary:
    cells: dict[str, list[Optional[int]]] = defaultdict(lambda: [None] * len(ENGINES))
    rivals: dict[str, Rival] = {}
    platforms, sources = Counter(), Counter()
    per_engine: dict[str, Counter] = defaultdict(Counter)
    checked = mentioned = linked = mine = total = 0

    for c in checks:
        cells[c.question][ENGINES.index(c.engine)] = c.cell
        if not c.reading:
            continue
        checked += 1
        mentioned += c.reading.mentioned
        linked += c.reading.linked
        if c.reading.mentioned:
            mine += 1
            total += 1
        for s in c.answer.sources:
            if s.host:
                sources[s.host] += 1
        for b in c.reading.businesses:
            if b.kind == "platform":
                platforms[b.name] += 1
            if b.kind != "competitor" or is_customer_name(b.name, b.domain, company, domain):
                continue
            key = host_of(b.domain) or name_key(b.name)
            r = rivals.setdefault(key, Rival(name=b.name, domain=b.domain))
            r.answers += 1
            r.questions.add(c.question)
            r.engines[c.engine] += 1
            per_engine[c.engine][r.name] += 1
            total += 1

    ranked = sorted(rivals.values(), key=lambda r: -r.answers)
    return Summary(
        cells=dict(cells),
        checked_answers=checked,
        mentioned_answers=mentioned,
        linked_answers=linked,
        share_of_voice=round(100 * mine / total) if total else 0,
        rivals=[{"name": r.name, "domain": r.domain, "answers": r.answers, "questions": len(r.questions),
                 "share_of_voice": round(100 * r.answers / total) if total else 0,
                 "top_engine": r.engines.most_common(1)[0][0]} for r in ranked],
        platforms=platforms.most_common(10),
        source_sites=sources.most_common(10),
        engine_leaders=[(per_engine[e].most_common(1) or [("", 0)])[0][0] for e in ENGINES],
    )
