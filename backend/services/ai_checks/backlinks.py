"""
services/ai_checks/backlinks.py — real website strength and link opportunities (DataForSEO Backlinks API)

* site_strength(domains): for each website, DataForSEO's rank (0-1000, shown as a 0-100 score), how many
  websites link to it and how many links it has. Three bulk requests cover every website at once.
* link_opportunities(you, rivals): real websites that link to at least one competitor but not to the
  customer, strongest first. Spammy sites, link shorteners and bare IP addresses are left out.

Same DataForSEO login as AI Overviews and search volume. Nothing here ever breaks an analysis: when
DataForSEO cannot be read, the result is simply empty and the dashboard falls back to "not measured".
"""
from __future__ import annotations

import ipaddress
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import requests

from services.ai_checks.answer import host_of

logger = logging.getLogger(__name__)

API = "https://api.dataforseo.com/v3/backlinks/"
TIMEOUT_SECONDS = 90
MAX_TARGETS = 20             # domain_intersection accepts up to 20 competitor websites
MAX_SPAM_SCORE = 30          # DataForSEO spam score (0-100) above which a linking site is left out
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "is.gd"}


@dataclass
class Strength:
    score: int               # 0-100 (DataForSEO rank / 10)
    linking_sites: int       # different websites that link to it
    backlinks: int           # links in total


@dataclass
class LinkOpportunity:
    site: str
    score: int               # the linking website's own strength, 0-100
    links_to: list[str] = field(default_factory=list)   # competitor websites it links to


def is_ready() -> bool:
    return bool(os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD"))


def _post(path: str, body: dict) -> dict | None:
    """One Backlinks API request; its first result, or None when it fails."""
    try:
        resp = requests.post(API + path, auth=(os.getenv("DATAFORSEO_LOGIN", ""), os.getenv("DATAFORSEO_PASSWORD", "")),
                             json=[body], timeout=TIMEOUT_SECONDS)
        data = resp.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning(f"[backlinks] {path} request failed: {e}")
        return None
    if not isinstance(data, dict):
        return None
    t = (data.get("tasks") or [{}])[0]
    if data.get("status_code") != 20000 or t.get("status_code") != 20000:
        logger.warning(f"[backlinks] {path} DataForSEO {data.get('status_code')}/{t.get('status_code')}: "
                       f"{data.get('status_message')} / {t.get('status_message')}")
        return None
    return ((t.get("result") or [None])[0]) or {}


def _score(rank) -> int:
    return round((rank or 0) / 10) if isinstance(rank, (int, float)) else 0


def _is_ip(host: str) -> bool:
    """A bare server address (e.g. 62.72.26.17) is not a website anyone can ask for a link."""
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


def site_strength(domains: list[str]) -> dict[str, Strength]:
    """{website: Strength} for every website DataForSEO knows; empty when it cannot be read."""
    targets = list(dict.fromkeys(h for h in map(host_of, domains) if h))[:1000]
    if not targets or not is_ready():
        return {}
    paths = ("bulk_ranks/live", "bulk_referring_domains/live", "bulk_backlinks/live")
    with ThreadPoolExecutor(max_workers=len(paths)) as pool:
        ranks, sites, links = pool.map(lambda p: _post(p, {"targets": targets}), paths)
    if ranks is None:
        return {}

    def by_target(res: dict | None, key: str) -> dict:
        return {host_of(i.get("target")): i.get(key) for i in (res or {}).get("items") or [] if isinstance(i, dict)}

    rank, linking, total = by_target(ranks, "rank"), by_target(sites, "referring_main_domains"), by_target(links, "backlinks")
    return {t: Strength(score=_score(rank[t]), linking_sites=int(linking.get(t) or 0), backlinks=int(total.get(t) or 0))
            for t in targets if t in rank}


def link_opportunities(you: str, rivals: list[str], limit: int = 15) -> tuple[list[LinkOpportunity], int]:
    """Websites linking to at least one competitor but not to you, strongest first, and how many DataForSEO found."""
    mine = host_of(you)
    comps = list(dict.fromkeys(h for h in map(host_of, rivals) if h and h != mine))[:MAX_TARGETS]
    if not comps or not is_ready():
        return [], 0
    body = {"targets": {str(i + 1): c for i, c in enumerate(comps)}, "intersection_mode": "partial",
            "exclude_internal_backlinks": True, "limit": 100}
    if mine:
        body["exclude_targets"] = [mine]
    res = _post("domain_intersection/live", body)
    if res is None:
        return [], 0

    out = []
    for item in res.get("items") or []:
        per = {k: v for k, v in ((item or {}).get("domain_intersection") or {}).items() if isinstance(v, dict)}
        if not per:
            continue
        first = next(iter(per.values()))
        site = host_of(first.get("target"))
        spam = max(int(v.get("backlinks_spam_score") or 0) for v in per.values())
        if not site or site in SHORTENERS or _is_ip(site) or spam > MAX_SPAM_SCORE:
            continue
        linked = [comps[int(k) - 1] for k in per if k.isdigit() and 0 < int(k) <= len(comps)]
        out.append(LinkOpportunity(site=site, score=_score(first.get("rank")), links_to=linked))
    out.sort(key=lambda o: (len(o.links_to), o.score), reverse=True)
    return out[:limit], int(res.get("total_count") or len(out))
