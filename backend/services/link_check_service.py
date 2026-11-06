"""
services/link_check_service.py — checks that a backlink really exists
================================================================================
The customer pastes the address of a page where they got a link. We fetch that page and look for a link to their own
website: found or not, the anchor text, and whether it is nofollow.

The address is typed by a user, so the fetch is locked down: http/https on the normal ports only, every address the
host resolves to (and every redirect hop) must be a public internet address, small size and time limits.
"""
from __future__ import annotations

import ipaddress
import logging
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests

logger = logging.getLogger(__name__)

MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 4
TIMEOUT = 12
UA = "Mozilla/5.0 (compatible; AEO-LinkCheck/1.0; +https://aeo-app.com)"


class LinkCheckError(Exception):
    """Message is safe to show to the customer."""


def _public_host(host: str) -> None:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise LinkCheckError("We could not find that website. Check the address.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global:
            raise LinkCheckError("That address can't be checked.")


def _check_url(url: str) -> str:
    p = urlparse((url or "").strip())
    if p.scheme not in ("http", "https") or not p.hostname:
        raise LinkCheckError("Paste the full address of the page, starting with https://")
    if p.port not in (None, 80, 443):
        raise LinkCheckError("That address can't be checked.")
    if p.username or p.password:
        raise LinkCheckError("That address can't be checked.")
    _public_host(p.hostname)
    return p.geturl()


def fetch_page(url: str) -> tuple[str, str, int]:
    """(final_url, html, status). Follows a few redirects, re-checking every hop."""
    cur = _check_url(url)
    for _ in range(MAX_REDIRECTS + 1):
        try:
            r = requests.get(cur, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"},
                             timeout=TIMEOUT, allow_redirects=False, stream=True)
        except requests.RequestException:
            raise LinkCheckError("We could not open that page. Check the address and try again.")
        if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("Location"):
            cur = _check_url(urljoin(cur, r.headers["Location"]))
            r.close()
            continue
        ctype = (r.headers.get("Content-Type") or "").lower()
        if r.status_code >= 400:
            r.close()
            raise LinkCheckError(f"That page answered with an error ({r.status_code}). Check the address.")
        if ctype and "html" not in ctype and "xml" not in ctype and "text" not in ctype:
            r.close()
            raise LinkCheckError("That address is not a web page.")
        data = b""
        for chunk in r.iter_content(65536):
            data += chunk
            if len(data) > MAX_BYTES:
                break
        r.close()
        enc = r.encoding or "utf-8"
        return cur, data[:MAX_BYTES].decode(enc, errors="replace"), r.status_code
    raise LinkCheckError("That page redirects too many times.")


class _Links(HTMLParser):
    def __init__(self, base: str):
        super().__init__(convert_charrefs=True)
        self.base, self.links, self._open = base, [], None

    def handle_starttag(self, tag, attrs):
        if tag == "base":
            href = dict(attrs).get("href")
            if href:
                self.base = urljoin(self.base, href)
        elif tag == "a":
            a = dict(attrs)
            href = (a.get("href") or "").strip()
            if href and not href.lower().startswith(("javascript:", "mailto:", "tel:", "#")):
                self._open = {"href": urljoin(self.base, href), "rel": (a.get("rel") or "").lower(), "text": ""}
                self.links.append(self._open)

    def handle_data(self, data):
        if self._open is not None:
            self._open["text"] += data

    def handle_endtag(self, tag):
        if tag == "a":
            self._open = None


def _host(url: str) -> str:
    h = (urlparse(url).hostname or "").lower()
    return h[4:] if h.startswith("www.") else h


def check_link(page_url: str, my_domain: str) -> dict:
    """{found, final_url, href, anchor, nofollow, rel, count} — found=False when the page has no link to my_domain."""
    my = (my_domain or "").lower().removeprefix("www.")
    if not my:
        raise LinkCheckError("Add your website in your profile first.")
    final, html, _ = fetch_page(page_url)
    if _host(final) == my or _host(final).endswith("." + my):
        raise LinkCheckError("That is a page on your own website. Paste the page on the other site that links to you.")
    parser = _Links(final)
    try:
        parser.feed(html)
    except Exception:  # noqa: BLE001 — malformed HTML: use whatever was parsed
        pass
    mine = [l for l in parser.links if _host(l["href"]) == my or _host(l["href"]).endswith("." + my)]
    if not mine:
        return {"found": False, "final_url": final, "count": 0}
    best = next((l for l in mine if not any(t in l["rel"] for t in ("nofollow", "sponsored", "ugc"))), mine[0])
    return {
        "found": True, "final_url": final, "href": best["href"][:500], "anchor": " ".join(best["text"].split())[:120],
        "rel": best["rel"][:80], "nofollow": any(t in best["rel"] for t in ("nofollow", "sponsored", "ugc")), "count": len(mine),
    }
