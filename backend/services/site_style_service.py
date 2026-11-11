"""Reads the customer's own website (HTML + linked CSS) and works out its brand colours and fonts,
so a generated page can be styled to match it. Public pages only; all fetching goes through aeo_service._safe_get."""
from __future__ import annotations

import base64
import colorsys
import logging
import re
import time
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_HEX = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})(?![0-9a-zA-Z])")
_RGB = re.compile(r"rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})")
_RULE = re.compile(r"([^{}@]+)\{([^{}]*)\}")
_GENERIC_FONTS = {"inherit", "initial", "unset", "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui",
                  "ui-sans-serif", "ui-serif", "ui-monospace", "-apple-system", "blinkmacsystemfont", "segoe ui",
                  "emoji", "apple color emoji", "segoe ui emoji", "noto color emoji", "var"}
_SERIF_NAMES = {"georgia", "times new roman", "times", "playfair display", "merriweather", "lora", "cambria", "garamond",
                "libre baskerville", "pt serif", "crimson text", "cormorant garamond", "eb garamond", "noto serif", "source serif pro"}
_BRAND_VAR = re.compile(r"(primary|brand|accent|main|theme|highlight|cta)", re.I)
_SECONDARY_VAR = re.compile(r"(secondary|second)", re.I)
_CTA_SEL = re.compile(r"(btn|button|cta|primary|brand|nav|header|badge)", re.I)

_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 3600
_MAX_SHEETS = 4


def _norm(c: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % c


def _parse_hex(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _colors_in(value: str) -> list[tuple[int, int, int]]:
    out = [_parse_hex(m.group(0)) for m in _HEX.finditer(value)]
    for m in _RGB.finditer(value):
        r, g, b = (int(x) for x in m.groups())
        if max(r, g, b) <= 255:
            out.append((r, g, b))
    return out


def _hls(c):
    h, l, s = colorsys.rgb_to_hls(c[0] / 255, c[1] / 255, c[2] / 255)
    return h * 360, l, s


def _brand_like(c) -> bool:
    _, l, s = _hls(c)
    return s >= 0.25 and 0.12 <= l <= 0.85


def _dist(a, b) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def _families(value: str) -> list[str]:
    out = []
    for part in re.split(r",(?![^(]*\))", value):
        name = part.strip().strip("'\"").strip()
        name = re.sub(r"\s*!important$", "", name).strip("'\" ")
        if name and name.lower() not in _GENERIC_FONTS and not name.lower().startswith("var(") and len(name) < 50:
            out.append(name)
    return out


def _decls(body: str):
    for d in body.split(";"):
        if ":" in d:
            k, v = d.split(":", 1)
            yield k.strip().lower(), v.strip()


def extract_style(html: str, css_texts: list[str]) -> dict:
    """Pure function: HTML + CSS text in, style dict out (see SiteStyleResponse)."""
    score: dict[tuple[int, int, int], float] = {}
    secondary_hint: dict[tuple[int, int, int], float] = {}
    body_text, body_font, head_font = None, None, None
    fonts_seen: dict[str, int] = {}

    def add(c, w):
        score[c] = score.get(c, 0) + w

    soup = BeautifulSoup(html or "", "html.parser")
    for m in soup.find_all("meta", attrs={"name": re.compile(r"^(theme-color|msapplication-TileColor)$", re.I)}):
        for c in _colors_in(m.get("content", "")):
            if _brand_like(c):
                add(c, 15)
    sheets = list(css_texts) + [t.get_text() for t in soup.find_all("style")]
    inline = " ".join(f"x{{{t.get('style')}}}" for t in soup.find_all(style=True))
    for link in soup.find_all("link", href=re.compile(r"fonts\.googleapis\.com", re.I)):
        for fam in re.findall(r"family=([^&:]+)", link.get("href", "")):
            name = fam.replace("+", " ").replace("%20", " ").strip()
            if name:
                fonts_seen[name] = fonts_seen.get(name, 0) + 2
    sheets.append(inline)

    for css in sheets:
        css = re.sub(r"/\*.*?\*/", "", css or "", flags=re.S)
        for sel, body in _RULE.findall(css):
            sel = sel.strip().lower()
            for prop, val in _decls(body):
                if prop.startswith("--"):
                    for c in _colors_in(val):
                        if _SECONDARY_VAR.search(prop):
                            secondary_hint[c] = secondary_hint.get(c, 0) + 8
                            add(c, 4)
                        elif _BRAND_VAR.search(prop):
                            add(c, 20)
                        else:
                            add(c, 0.5)
                    if "font" in prop:
                        fams = _families(val)
                        if fams:
                            fonts_seen[fams[0]] = fonts_seen.get(fams[0], 0) + 3
                    continue
                if prop in ("background", "background-color", "border-color", "fill", "color", "border", "outline"):
                    for c in _colors_in(val):
                        if prop == "color":
                            if re.fullmatch(r"(html|body|:root)(\s*,\s*(html|body))*", sel) and body_text is None:
                                body_text = c
                            if re.search(r"(^|[\s,])a(\b|:)", sel):
                                add(c, 3)
                            else:
                                add(c, 0.7)
                        elif prop.startswith("background") and _CTA_SEL.search(sel):
                            add(c, 6)
                        else:
                            add(c, 1)
                if prop == "font-family":
                    fams = _families(val)
                    if not fams:
                        continue
                    if re.fullmatch(r"(html|body|:root)(\s*,\s*(html|body))*", sel):
                        body_font = body_font or fams[0]
                    elif re.search(r"(^|[\s,])h[1-3]\b", sel):
                        head_font = head_font or fams[0]
                    fonts_seen[fams[0]] = fonts_seen.get(fams[0], 0) + 1

    # Merge near-identical colours, keeping only brand-like ones.
    merged: list[list] = []
    for c, w in sorted(score.items(), key=lambda kv: -kv[1]):
        if not _brand_like(c):
            continue
        for m in merged:
            if _dist(m[0], c) < 40:
                m[1] += w
                break
        else:
            merged.append([c, w])
    merged.sort(key=lambda m: -m[1])
    palette = [_norm(m[0]) for m in merged[:6]]

    primary = merged[0][0] if merged else None
    secondary = None
    if primary:
        hints = [m for m in merged[1:] if secondary_hint.get(m[0])]
        for m in (hints or merged[1:]):
            if _dist(m[0], primary) > 90:
                secondary = m[0]
                break

    text = None
    if body_text is not None and _hls(body_text)[1] < 0.35:
        text = _norm(body_text)

    font = body_font or (max(fonts_seen, key=fonts_seen.get) if fonts_seen else "")
    heading = head_font or ""
    kind_src = (heading or font).lower()
    kind = "serif" if kind_src in _SERIF_NAMES else "sans"
    found = bool(primary) or bool(font)
    return {
        "found": found, "primary": _norm(primary) if primary else "", "secondary": _norm(secondary) if secondary else "",
        "palette": palette, "text": text or "", "font": font, "heading_font": heading, "font_kind": kind,
        "note": "" if primary else "We could not find a clear brand colour on your website. Pick one of the colours below instead.",
    }


def detect_site_style(url: str) -> dict:
    """Fetches the homepage and up to four of its stylesheets, then runs extract_style. Never raises."""
    from services.aeo_service import _safe_get, _site_root  # local import: avoids a circular import at module load
    root = _site_root(url)
    hit = _CACHE.get(root)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    try:
        page = _safe_get(root, timeout=8.0)
        html = page.text if page.ok else ""
        css: list[str] = []
        if html:
            soup = BeautifulSoup(html, "html.parser")
            for link in soup.find_all("link"):
                rel = link.get("rel") or []
                if "stylesheet" not in ([rel] if isinstance(rel, str) else [x.lower() for x in rel]):
                    continue
                href = urljoin(page.url, link.get("href", ""))
                if not href or "fonts.googleapis.com" in href or urlparse(href).scheme not in ("http", "https"):
                    continue
                try:
                    r = _safe_get(href, timeout=6.0)
                    if r.ok:
                        css.append(r.text)
                except Exception as e:  # noqa: BLE001 — one bad stylesheet must not stop the rest
                    logger.info(f"[site-style] stylesheet skipped {href}: {e}")
                if len(css) >= _MAX_SHEETS:
                    break
        out = extract_style(html, css) if html else {
            "found": False, "primary": "", "secondary": "", "palette": [], "text": "", "font": "", "heading_font": "", "font_kind": "sans",
            "note": "We could not open your website to read its style. Pick a colour below instead."}
    except Exception as e:  # noqa: BLE001
        logger.info(f"[site-style] {root}: {e}")
        out = {"found": False, "primary": "", "secondary": "", "palette": [], "text": "", "font": "", "heading_font": "", "font_kind": "sans",
               "note": "We could not read your website's style. Pick a colour below instead."}
    _CACHE[root] = (time.time(), out)
    return out


# ── Company profile: logo + contact details, read from the same website ──────────────────────
_PROFILE_CACHE: dict[str, tuple[float, dict]] = {}
_LOGO_MAX_BYTES = 200_000
_EMPTY_PROFILE = {"logo": "", "phone": "", "email": "", "address": "", "socials": {}}


def _logo_data_uri(candidates: list[str]) -> str:
    """First candidate that downloads as a small image, as a data: URI so the downloaded page never depends on the
    customer's site (hotlinking, expiring URLs). Falls back to the plain URL for a larger image."""
    from services.aeo_service import _safe_get
    fallback = ""
    for u in candidates[:5]:
        try:
            r = _safe_get(u, timeout=6.0)
            ctype = (r.headers.get("content-type", "") or "").split(";")[0].strip().lower()
            if not r.ok or not ctype.startswith("image/") or ctype in ("image/x-icon", "image/vnd.microsoft.icon"):
                continue
            data = r.content
            if not data:
                continue
            if len(data) <= _LOGO_MAX_BYTES:
                return f"data:{ctype};base64,{base64.b64encode(data).decode()}"
            fallback = fallback or u
        except Exception as e:  # noqa: BLE001 — try the next candidate
            logger.info(f"[site-profile] logo skipped {u}: {e}")
    return fallback


def detect_site_profile(url: str, saved: dict | None = None) -> dict:
    """Logo + phone + email + address (+ social links) found on the website. Anything not found is left empty — never
    guessed. `saved` is the customer's Brand kit: values they typed or confirmed there win over a fresh read."""
    from services.aeo_service import _site_root
    from services.site_contact_service import analyse_site
    root = _site_root(url)
    hit = _PROFILE_CACHE.get(root)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        out = dict(hit[1])
    else:
        out = dict(_EMPTY_PROFILE)
        try:
            found = analyse_site(root)
            out["phone"] = (found.get("phones") or [""])[0]
            out["email"] = (found.get("emails") or [""])[0]
            out["address"] = (found.get("address") or "")[:200]
            out["socials"] = dict(found.get("socials") or {})
            out["logo"] = _logo_data_uri(list(found.get("logo_candidates") or []))
        except Exception as e:  # noqa: BLE001
            logger.info(f"[site-profile] {root}: {e}")
        _PROFILE_CACHE[root] = (time.time(), dict(out))
    for k in ("phone", "email", "address"):
        v = str((saved or {}).get(k) or "").strip()
        if v:
            out[k] = v
    return out
