"""
services/ai_checks/answer.py — what every AI tool returns, plus small shared helpers
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse

MAX_ANSWER_CHARS = 8000

# Market → (ISO country code, Google Ads / DataForSEO location code).
_COUNTRIES = {
    "IN": ("IN", 2356), "INDIA": ("IN", 2356),
    "SG": ("SG", 2702), "SINGAPORE": ("SG", 2702),
    "AU": ("AU", 2036), "AUSTRALIA": ("AU", 2036),
    "US": ("US", 2840), "USA": ("US", 2840), "UNITED STATES": ("US", 2840),
    "GB": ("GB", 2826), "UK": ("GB", 2826), "UNITED KINGDOM": ("GB", 2826),
    "AE": ("AE", 2784), "UAE": ("AE", 2784), "UNITED ARAB EMIRATES": ("AE", 2784),
    "MY": ("MY", 2458), "MALAYSIA": ("MY", 2458),
    "PH": ("PH", 2608), "PHILIPPINES": ("PH", 2608),
    "ID": ("ID", 2360), "INDONESIA": ("ID", 2360),
    "HK": ("HK", 2344), "HONG KONG": ("HK", 2344),
    "CA": ("CA", 2124), "CANADA": ("CA", 2124),
    "NZ": ("NZ", 2554), "NEW ZEALAND": ("NZ", 2554),
}


@dataclass
class Source:
    url: str
    title: str = ""

    @property
    def host(self) -> str:
        return host_of(self.url)


@dataclass
class EngineAnswer:
    engine: str
    text: str = ""
    sources: list[Source] = field(default_factory=list)
    error: str = ""          # set when the tool could not be asked; the answer then counts as "not checked"
    note: str = ""           # e.g. "Google showed no AI Overview for this search"


def country_of(market: str) -> Optional[str]:
    """ISO country code for a market such as "IN" or "India"; None when unknown."""
    hit = _COUNTRIES.get((market or "").strip().upper())
    return hit[0] if hit else None


def location_code_of(market: str) -> Optional[int]:
    hit = _COUNTRIES.get((market or "").strip().upper())
    return hit[1] if hit else None


def host_of(url: str) -> str:
    value = (url or "").strip()
    if not value:
        return ""
    if "//" not in value:
        value = "https://" + value
    host = (urlparse(value).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def same_site(host: str, domain: str) -> bool:
    """True when `host` is `domain` or one of its subdomains."""
    host, domain = host_of(host), host_of(domain)
    return bool(host and domain) and (host == domain or host.endswith("." + domain))


def urls_in(text: str) -> list[str]:
    """Links written in an answer, in order, without duplicates."""
    seen, out = set(), []
    for url in re.findall(r"https?://[^\s)\]>\"']+", text or ""):
        url = url.rstrip(".,;:")
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def failed(engine: str, message: str) -> EngineAnswer:
    return EngineAnswer(engine=engine, error=message)
