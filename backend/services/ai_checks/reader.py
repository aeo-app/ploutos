"""
services/ai_checks/reader.py — read one real answer: which businesses it names, and is the customer there

Finding names in free text needs reading, so our Claude (Bedrock) lists the businesses the answer
itself names. It may only copy from the answer, never add or guess. Whether the customer is
mentioned or linked is then decided by plain matching against the customer's name and website.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Optional

from services.ai_checks.answer import EngineAnswer, host_of, same_site, urls_in
from services.bedrock_service import TokenUsageTracker, _converse, _parse_json

logger = logging.getLogger(__name__)

READ_CHARS = 6000
_LEGAL_SUFFIXES = ("privatelimited", "pvtltd", "pteltd", "limited", "ltd", "llc", "inc", "pte", "corp", "company", "co")

_SYSTEM = "You read an answer that an AI assistant gave to a question. Respond with ONLY valid JSON."


KINDS = ("competitor", "platform", "other")


@dataclass
class Business:
    name: str
    domain: str = ""
    kind: str = "competitor"    # one of KINDS: offers what the question asks for / marketplace or directory / anything else


@dataclass
class Reading:
    businesses: list[Business]
    mentioned: bool
    linked: bool
    position: Optional[int] = None    # the customer's place among the competitors named, 1 = first

    @property
    def competitors(self) -> list[Business]:
        return [b for b in self.businesses if b.kind == "competitor"]

    @property
    def cell(self) -> int:
        """Dashboard convention: n > 0 linked at position n, -1 mentioned but not linked, 0 absent."""
        if self.linked:
            return self.position or len(self.competitors) + 1
        return -1 if self.mentioned else 0


def read_answer(question: str, answer: EngineAnswer, company: str, domain: str,
                usage_tracker: TokenUsageTracker | None = None) -> Reading:
    businesses = _names_in(question, answer, usage_tracker) if answer.text.strip() else []
    rivals = [b for b in businesses if b.kind == "competitor"]
    position = next((i + 1 for i, b in enumerate(rivals) if _is_customer(b, company, domain)), None)
    mentioned = position is not None or any(_is_customer(b, company, domain) for b in businesses) \
        or (bool(domain) and domain.lower() in answer.text.lower())
    linked = any(same_site(s.url, domain) for s in answer.sources) or any(same_site(u, domain) for u in urls_in(answer.text))
    return Reading(businesses=businesses, mentioned=mentioned, linked=linked, position=position)


def is_customer_name(name: str, business_domain: str, company: str, domain: str) -> bool:
    return _is_customer(Business(name=name, domain=business_domain), company, domain)


def _names_in(question: str, answer: EngineAnswer, usage_tracker: TokenUsageTracker | None) -> list[Business]:
    links = [s.url for s in answer.sources][:15]
    prompt = f"""Question: {question}

Answer:
\"\"\"{answer.text[:READ_CHARS]}\"\"\"

Links the answer cited: {json.dumps(links)}

List every business, company, organisation, person or website that the answer names as an option or
recommendation, in the order they first appear. Copy names exactly as written. Do not add anything that is
not in the answer.
For each give: "name"; "domain" (its website if the answer or its links show it, else ""); and "kind":
- "competitor": it offers the kind of product or service the question is looking for (a company, agency,
  freelancer, shop or professional the reader could choose instead);
- "platform": a marketplace, directory, review or listing site, job board, social network, or news/blog site;
- "other": anything else, such as software tools, employers, organisations or products that are not what the
  question asks for.

Return: {{"names": [{{"name": "...", "domain": "...", "kind": "competitor"}}]}}  (use [] if it names none)"""
    try:
        data = _parse_json(_converse(_SYSTEM, prompt, max_tokens=1500, usage_tracker=usage_tracker))
    except Exception as e:  # noqa: BLE001 — an unreadable answer counts as naming nobody, not as a failed check
        logger.warning(f"[ai-checks] could not read a {answer.engine} answer: {e}")
        return []
    out, seen = [], set()
    for row in data.get("names") or []:
        name = str(row.get("name") or "").strip()[:120]
        key = name_key(name)
        if not name or key in seen:
            continue
        seen.add(key)
        kind = row.get("kind") if row.get("kind") in KINDS else "other"
        out.append(Business(name=name, domain=host_of(str(row.get("domain") or "")), kind=kind))
    return out


def name_key(name: str) -> str:
    """Comparable form of a business name: lower-case letters and digits, without "Pvt Ltd", "Inc" and so on."""
    core = re.sub(r"[^a-z0-9]", "", (name or "").lower())
    changed = True
    while changed:
        changed = False
        for suffix in _LEGAL_SUFFIXES:
            if core.endswith(suffix) and len(core) > len(suffix) + 2:
                core, changed = core[: -len(suffix)], True
    return core


def _is_customer(b: Business, company: str, domain: str) -> bool:
    if b.domain and domain and same_site(b.domain, domain):
        return True
    name, mine = name_key(b.name), name_key(company)
    if len(mine) >= 3 and (name == mine or (len(mine) >= 5 and mine in name)):
        return True
    site = name_key(host_of(domain).split(".")[0]) if domain else ""
    return len(site) >= 5 and site in name
