"""
services/site_contact_service.py — reads a company's own website for contact details
================================================================================
Used by the Brand kit: finds the phone number(s), email address(es), postal
address, social profiles and a likely logo, so the customer does not have to
type them and every generated image can carry the right contact details.

Reads the home page plus up to three "contact / about / reach us" pages it links
to. Uses aeo_service._safe_get so a user-supplied URL can never be used to reach
internal addresses. Never raises: an unreadable site simply returns empty lists.
"""
from __future__ import annotations

import html as _html
import json
import logging
import re
from urllib.parse import urljoin, urlparse

from services.aeo_service import _safe_get

logger = logging.getLogger(__name__)

_CONTACT_HINT = re.compile(r"contact|about|reach|support|location|find-us|get-in-touch|enquir|inquir", re.I)
_SOCIAL = {
    "facebook": re.compile(r"https?://(?:www\.)?facebook\.com/[^\s\"'<>?#]+", re.I),
    "instagram": re.compile(r"https?://(?:www\.)?instagram\.com/[^\s\"'<>?#]+", re.I),
    "linkedin": re.compile(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:company|in)/[^\s\"'<>?#]+", re.I),
    "youtube": re.compile(r"https?://(?:www\.)?youtube\.com/(?:@|channel/|c/|user/)[^\s\"'<>?#]+", re.I),
    "x": re.compile(r"https?://(?:www\.)?(?:twitter|x)\.com/[A-Za-z0-9_]{2,15}(?=[\"'<>?#\s/]|$)", re.I),
    "google_business": re.compile(r"https?://(?:g\.page/[^\s\"'<>?#]+|maps\.app\.goo\.gl/[^\s\"'<>?#]+|(?:www\.)?google\.[a-z.]{2,6}/maps/place/[^\s\"'<>]+|business\.google\.com/[^\s\"'<>?#]+)", re.I),
    "tiktok": re.compile(r"https?://(?:www\.)?tiktok\.com/@[A-Za-z0-9._]{2,40}", re.I),
    "pinterest": re.compile(r"https?://(?:[a-z]{2}\.)?pinterest\.[a-z.]{2,6}/[A-Za-z0-9_]{3,40}(?=[\"'<>?#\s/]|$)", re.I),
    "threads": re.compile(r"https?://(?:www\.)?threads\.net/@[A-Za-z0-9._]{2,40}", re.I),
    "whatsapp": re.compile(r"https?://(?:wa\.me/\+?\d{6,15}|api\.whatsapp\.com/send\?phone=\d{6,15}|chat\.whatsapp\.com/[A-Za-z0-9]+)", re.I),
}
# Links that are not an account: share buttons, tracking pixels, embedded posts, widgets, login pages.
_NOT_ACCOUNT = re.compile(r"sharer|share\.php|/share|/dialog|/plugins|/tr\?|/tr/|/intent/|/embed|/login|/policies|/help|/legal|/privacy|/terms|/hashtag/|/explore|/p/|/reel/|/reels/|/stories/|/watch|/status/|/events/|/photo|/videos/|/groups/|/pages/create|/home\?|/search", re.I)


def _good_social(url: str) -> bool:
    path = "/" + url.split("://", 1)[-1].split("/", 1)[-1]
    return bool(url) and len(url) < 200 and not _NOT_ACCOUNT.search(path)

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# International-looking numbers: optional +, 8-15 digits overall, separators allowed.
_PHONE = re.compile(r"(?<![\w.])(\+?\d[\d\s().\-]{6,20}\d)(?![\w])")
_BAD_EMAIL_PARTS = ("example.", "sentry", "wixpress", "domain.com", "email.com", "yourname", "@2x", "noreply", "no-reply")
_IMG_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js")


def _norm_url(url: str) -> str:
    u = (url or "").strip()
    if u and not u.startswith(("http://", "https://")):
        u = "https://" + u
    return u


def _fetch(url: str) -> str:
    try:
        r = _safe_get(url, timeout=7.0)
        if r.ok and "text" in (r.headers.get("content-type", "text/html")).lower():
            return r.text[:700_000]
    except Exception as e:  # noqa: BLE001
        logger.info(f"[site-contact] could not read {url}: {e}")
    return ""


def _clean_phone(raw: str) -> str:
    s = re.sub(r"\s+", " ", raw.strip(" .-()"))
    digits = re.sub(r"\D", "", s)
    if not (8 <= len(digits) <= 15):
        return ""
    # Skip things that look like dates, years or IDs rather than phone numbers.
    if re.fullmatch(r"(19|20)\d{2}[\s.\-]\d{1,2}[\s.\-]\d{1,2}", s) or re.fullmatch(r"\d{4}\s?-\s?\d{4}", s):
        return ""
    if len(set(digits)) <= 2:
        return ""
    return s


def _jsonld_blocks(html: str) -> list:
    out = []
    for m in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            data = json.loads(m.group(1).strip())
        except Exception:  # noqa: BLE001
            continue
        stack = [data]
        while stack:
            cur = stack.pop()
            if isinstance(cur, list):
                stack.extend(cur)
            elif isinstance(cur, dict):
                out.append(cur)
                for v in cur.values():
                    if isinstance(v, (dict, list)):
                        stack.append(v)
    return out


def _address_from_ld(node: dict) -> str:
    a = node.get("address")
    if isinstance(a, str):
        return re.sub(r"\s+", " ", a).strip()
    if isinstance(a, dict):
        parts = [a.get(k) for k in ("streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry")]
        parts = [p.get("name") if isinstance(p, dict) else p for p in parts]
        return ", ".join(str(p).strip() for p in parts if p)
    return ""


def analyse_site(url: str) -> dict:
    """Returns {phones, emails, address, socials, logo_candidates, title, description, pages_read}."""
    base = _norm_url(url)
    result = {"phones": [], "emails": [], "address": "", "socials": {}, "logo_candidates": [],
              "title": "", "description": "", "pages_read": []}
    if not base:
        return result

    pages: dict[str, str] = {}
    home = _fetch(base)
    if home:
        pages[base] = home
    host = (urlparse(base).hostname or "").lower().removeprefix("www.")
    # Follow a few contact-like links on the same site.
    if home:
        seen = {base.rstrip("/")}
        for m in re.finditer(r'<a[^>]+href=["\']([^"\'#]+)["\']', home, re.I):
            href = urljoin(base, _html.unescape(m.group(1)))
            p = urlparse(href)
            if p.scheme not in ("http", "https") or (p.hostname or "").lower().removeprefix("www.") != host:
                continue
            if not _CONTACT_HINT.search(p.path or ""):
                continue
            key = href.split("#")[0].rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            pages[href] = ""
            if len(pages) >= 4:
                break
    for u in list(pages):
        if not pages[u]:
            pages[u] = _fetch(u)
    pages = {u: h for u, h in pages.items() if h}
    result["pages_read"] = list(pages)

    phone_score: dict[str, int] = {}
    email_score: dict[str, int] = {}
    logos: list[str] = []

    def add_phone(raw: str, w: int):
        p = _clean_phone(_html.unescape(raw))
        if p:
            phone_score[p] = phone_score.get(p, 0) + w

    def add_email(raw: str, w: int):
        e = _html.unescape(raw).strip().strip(".,;:").lower()
        if e.endswith(_IMG_EXT) or any(b in e for b in _BAD_EMAIL_PARTS):
            return
        email_score[e] = email_score.get(e, 0) + w

    for u, h in pages.items():
        body = re.sub(r"<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
        # 1) Structured data — the most reliable.
        for node in _jsonld_blocks(h):
            t = node.get("telephone") or node.get("phone")
            if isinstance(t, str):
                add_phone(t, 10)
            e = node.get("email")
            if isinstance(e, str):
                add_email(e.replace("mailto:", ""), 10)
            addr = _address_from_ld(node)
            if addr and not result["address"]:
                result["address"] = addr
            for sa in (node.get("sameAs") if isinstance(node.get("sameAs"), list) else []):
                for k, rx in _SOCIAL.items():
                    if isinstance(sa, str) and rx.match(sa) and _good_social(sa) and k not in result["socials"]:
                        result["socials"][k] = sa.rstrip("/")
            lg = node.get("logo")
            if isinstance(lg, dict):
                lg = lg.get("url")
            if isinstance(lg, str) and lg:
                logos.append(urljoin(u, lg))
        # 2) tel: / mailto: links.
        for m in re.finditer(r'href=["\']tel:([^"\']+)["\']', h, re.I):
            add_phone(m.group(1).replace("%20", " "), 8)
        for m in re.finditer(r'href=["\']mailto:([^"\'?]+)', h, re.I):
            add_email(m.group(1), 8)
        # 3) Plain text near "call / phone / tel / whatsapp / contact".
        for m in re.finditer(r"(?:call|phone|tel|mobile|whatsapp|contact|hotline)[^0-9+]{0,25}(\+?\d[\d\s().\-]{6,20}\d)", body, re.I):
            add_phone(m.group(1), 4)
        for m in _EMAIL.finditer(body):
            add_email(m.group(0), 2)
        if not result["address"]:
            m = re.search(r"<address[^>]*>(.*?)</address>", h, re.S | re.I)
            if m:
                a = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", _html.unescape(m.group(1)))).strip()
                if 8 <= len(a) <= 200:
                    result["address"] = a
        for k, rx in _SOCIAL.items():
            if k not in result["socials"]:
                for m in rx.finditer(_html.unescape(h)):          # first link that is a real account, not a share button
                    if _good_social(m.group(0)):
                        result["socials"][k] = m.group(0).rstrip("/\"'")
                        break
        # Logo hints.
        for m in re.finditer(r'<img[^>]+>', h, re.I):
            tag = m.group(0)
            if re.search(r'logo', tag, re.I):
                s = re.search(r'(?:data-src|src)=["\']([^"\']+)["\']', tag, re.I)
                if s and not s.group(1).startswith("data:"):
                    logos.append(urljoin(u, _html.unescape(s.group(1))))
        if u == base or u.rstrip("/") == base.rstrip("/"):
            t = re.search(r"<title[^>]*>(.*?)</title>", h, re.S | re.I)
            if t:
                result["title"] = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", t.group(1)))).strip()[:160]
            d = re.search(r'<meta[^>]+name=["\']description["\'][^>]*content=["\'](.*?)["\']', h, re.S | re.I) \
                or re.search(r'<meta[^>]+property=["\']og:description["\'][^>]*content=["\'](.*?)["\']', h, re.S | re.I)
            if d:
                result["description"] = re.sub(r"\s+", " ", _html.unescape(d.group(1))).strip()[:400]
            og = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]*content=["\'](.*?)["\']', h, re.I)
            if og:
                logos.append(urljoin(u, _html.unescape(og.group(1))))

    phones, seen_digits = [], set()
    for p_, _ in sorted(phone_score.items(), key=lambda kv: (-kv[1], -len(kv[0]))):   # nicest-formatted copy wins
        d = re.sub(r"\D", "", p_)
        if d not in seen_digits:
            seen_digits.add(d)
            phones.append(p_)
    result["phones"] = phones[:5]
    result["emails"] = [e for e, _ in sorted(email_score.items(), key=lambda kv: (-kv[1], len(kv[0])))][:5]
    seen_l = []
    for l in logos:
        if l.startswith("http") and l not in seen_l and not l.lower().endswith(".svg"):  # raster only — svg needs conversion
            seen_l.append(l)
    result["logo_candidates"] = seen_l[:4]
    return result
