"""
services/insights/speed_service.py — website speed test (audit tasks A5 + A6)
================================================================================
Runs Google PageSpeed Insights for one page on mobile and desktop, and reduces the
large Lighthouse response to a short report the dashboard shows as-is:

  score   Google's 0-100 performance score for this test run
  lab     the main timings measured during this test run
  field   what real Chrome visitors experienced over the last 28 days (Chrome UX
          Report). Small websites often have too few visitors, so it can be empty.
  fixes   the changes Google expects to help most

PageSpeed Insights is free (25,000 tests a day per Google Cloud project) but needs an
API key in PAGESPEED_API_KEY. Without one, requests share Google's tiny anonymous
quota and usually fail.
"""
from __future__ import annotations

import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests

logger = logging.getLogger(__name__)

PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
PAGESPEED_API_KEY = os.getenv("PAGESPEED_API_KEY", "")
TIMEOUT_SECONDS = 90                      # one Lighthouse run can take close to a minute
DEVICES = ("mobile", "desktop")
MAX_FIXES = 3
HISTORY_LIMIT = 26                        # one point per day tested; about six months of weekly tests
RECHECK_COOLDOWN = timedelta(minutes=5)   # a new test straight after the last one gives the same result

# Lab timings from this test run: (Lighthouse audit id, label, good up to, needs work up to).
# The limits are Google's published Core Web Vitals thresholds (ms, except layout shift).
_LAB_METRICS = (
    ("largest-contentful-paint", "Main content visible", 2500, 4000),
    ("first-contentful-paint", "First content visible", 1800, 3000),
    ("total-blocking-time", "Time the page is frozen", 200, 600),
    ("cumulative-layout-shift", "Layout shifting", 0.1, 0.25),
)

# Real-visitor data: (Chrome UX Report metric, label). Google already rates each one.
_FIELD_METRICS = (
    ("LARGEST_CONTENTFUL_PAINT_MS", "Main content visible"),
    ("INTERACTION_TO_NEXT_PAINT", "Response to taps and clicks"),
    ("CUMULATIVE_LAYOUT_SHIFT_SCORE", "Layout shifting"),
)
_FIELD_STATUS = {"FAST": "good", "AVERAGE": "warn", "SLOW": "bad"}

# Lighthouse groups that hold improvement items. Lighthouse 13 uses "insights" + "diagnostics";
# older versions use "load-opportunities" + "diagnostics" (and hide their insights, so nothing repeats).
_FIX_GROUPS = {"insights", "load-opportunities", "diagnostics"}

# Google's improvement items in plain words: audit id -> (what's wrong, what to do).
# Items not listed here fall back to Google's own title.
_FIX_PLAIN = {
    "render-blocking-insight": ("Some files stop the page from showing until they load",
                                "Load these files later, or put the most important styles straight into the page."),
    "image-delivery-insight": ("Images are bigger than they need to be",
                               "Compress images and use modern formats like WebP or AVIF."),
    "lcp-discovery-insight": ("The main image is found late",
                              "Load the main image first: preload it and don't lazy-load it."),
    "document-latency-insight": ("The server is slow to send the page",
                                 "Check the hosting, turn on caching and avoid redirects."),
    "cache-insight": ("Returning visitors download the same files again",
                      "Set longer cache times so browsers keep files they already have."),
    "font-display-insight": ("Text stays hidden while fonts load",
                             "Show a standard font until the custom font has loaded."),
    "legacy-javascript-insight": ("The site sends extra code for very old browsers",
                                  "Stop building the website's code for very old browsers."),
    "duplicated-javascript-insight": ("The same code is loaded more than once",
                                      "Remove duplicate copies of the same code library."),
    "modern-http-insight": ("Files are sent over an older, slower connection type",
                            "Ask the hosting provider to turn on HTTP/2 or HTTP/3."),
    "unused-javascript": ("The page loads code it doesn't use",
                          "Remove code this page doesn't need, or load it only when it's needed."),
    "unused-css-rules": ("The page loads styles it doesn't use",
                         "Remove styles this page doesn't need."),
    "unminified-javascript": ("Code files aren't compressed",
                              "Turn on minification in the website's build settings."),
    "unminified-css": ("Style files aren't compressed",
                       "Turn on minification in the website's build settings."),
    "total-byte-weight": ("The page is heavy to download",
                          "Make images, videos and code files smaller."),
    "bootup-time": ("The browser spends a long time running code",
                    "Reduce or delay heavy scripts."),
    "mainthread-work-breakdown": ("The browser is kept busy while the page loads",
                                  "Reduce or delay heavy scripts and effects."),
    "unsized-images": ("Images have no set size, so the page jumps while loading",
                       "Give every image a width and a height."),
}


class SpeedTestError(Exception):
    """Message is safe to show to the customer."""


# ── Public API ────────────────────────────────────────────────────────────────

def run_speed_test(url: str) -> dict:
    """Test one page on mobile and desktop (in parallel). Shape: models.insights_models.SpeedReport.

    One device failing is reported inside that device's result; both failing raises
    SpeedTestError so nothing half-empty gets saved.
    """
    with ThreadPoolExecutor(max_workers=len(DEVICES)) as pool:
        results = dict(zip(DEVICES, pool.map(lambda device: _test_device(url, device), DEVICES)))
    if all(r["error"] for r in results.values()):
        raise SpeedTestError(results["mobile"]["error"])
    return {"url": url, "checked_at": _now_iso(), **results}


def add_to_history(history: list[dict], report: dict) -> list[dict]:
    """Append this report's scores, oldest first. A second test on the same day replaces that day's point."""
    day = report["checked_at"][:10]
    point = {"date": day, "mobile": report["mobile"]["score"], "desktop": report["desktop"]["score"]}
    kept = [p for p in history if p.get("date") != day]
    return (kept + [point])[-HISTORY_LIMIT:]


def next_test_time(report: Optional[dict]) -> Optional[datetime]:
    """When the website can be tested again, or None if it can be tested now."""
    if not report:
        return None
    try:
        last = datetime.fromisoformat(report["checked_at"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None
    ready = last + RECHECK_COOLDOWN
    return ready if ready > datetime.now(timezone.utc) else None


# ── One device ────────────────────────────────────────────────────────────────

def _test_device(url: str, device: str) -> dict:
    params = {"url": url, "strategy": device, "category": "performance"}
    if PAGESPEED_API_KEY:
        params["key"] = PAGESPEED_API_KEY
    try:
        resp = requests.get(PSI_URL, params=params, timeout=TIMEOUT_SECONDS)
    except requests.RequestException as e:
        logger.warning(f"[speed] PageSpeed request failed for {url} ({device}): {e}")
        return _failed("Google's speed test did not answer in time. Please try again.")
    try:
        data = resp.json()
    except ValueError:
        logger.warning(f"[speed] PageSpeed returned non-JSON for {url} ({device}), status {resp.status_code}")
        return _failed("Google's speed test is not available right now. Please try again later.")

    if resp.status_code != 200:
        message = (data.get("error") or {}).get("message", "")
        logger.warning(f"[speed] PageSpeed {resp.status_code} for {url} ({device}): {message[:300]}")
        if resp.status_code == 429:
            return _failed("Google's speed test is busy right now. Please try again in a few minutes.")
        return _failed("Google could not load your website for the test. Check that it opens in a browser, then try again.")

    lighthouse = data.get("lighthouseResult") or {}
    raw_score = ((lighthouse.get("categories") or {}).get("performance") or {}).get("score")
    score = round(raw_score * 100) if isinstance(raw_score, (int, float)) else None
    field, field_scope = _field_metrics(data)
    return {
        "score": score,
        "status": _score_status(score),
        "lab": _lab_metrics(lighthouse),
        "field": field,
        "field_scope": field_scope,
        "fixes": _top_fixes(lighthouse),
        "error": None,
    }


def _failed(message: str) -> dict:
    return {"score": None, "status": "info", "lab": [], "field": [], "field_scope": "none", "fixes": [], "error": message}


# ── Reading the PageSpeed response ────────────────────────────────────────────

def _lab_metrics(lighthouse: dict) -> list[dict]:
    audits = lighthouse.get("audits") or {}
    out = []
    for audit_id, label, good, needs_work in _LAB_METRICS:
        audit = audits.get(audit_id) or {}
        value = audit.get("numericValue")
        if not isinstance(value, (int, float)):
            continue
        is_shift = audit_id == "cumulative-layout-shift"
        out.append({
            "key": audit_id,
            "label": label,
            "value": f"{value:.2f}" if is_shift else _format_ms(value),
            "status": "good" if value <= good else "warn" if value <= needs_work else "bad",
        })
    return out


def _field_metrics(data: dict) -> tuple[list[dict], str]:
    """Real-visitor metrics and whether they describe this page or the whole website.

    PageSpeed puts page-level data in `loadingExperience`; when the page has too few
    visits it substitutes the whole website's data there and sets `origin_fallback`.
    """
    page = data.get("loadingExperience") or {}
    site = data.get("originLoadingExperience") or {}
    if page.get("metrics"):
        source, scope = page, ("site" if page.get("origin_fallback") else "page")
    elif site.get("metrics"):
        source, scope = site, "site"
    else:
        return [], "none"

    out = []
    for metric, label in _FIELD_METRICS:
        m = source["metrics"].get(metric) or {}
        value = m.get("percentile")
        if not isinstance(value, (int, float)):
            continue
        is_shift = metric == "CUMULATIVE_LAYOUT_SHIFT_SCORE"
        out.append({
            "key": metric.lower(),
            "label": label,
            # Chrome UX Report sends layout shift multiplied by 100 (5 means 0.05).
            "value": f"{value / 100:.2f}" if is_shift else _format_ms(value),
            "status": _FIELD_STATUS.get(m.get("category"), "info"),
        })
    return out, (scope if out else "none")


def _top_fixes(lighthouse: dict) -> list[dict]:
    """The failing improvement items, largest estimated time saving first.

    Only items Google scores by savings ("metricSavings") are real fixes; the rest
    (e.g. "LCP breakdown", "Network dependency tree") are information notes.
    """
    audits = lighthouse.get("audits") or {}
    refs = ((lighthouse.get("categories") or {}).get("performance") or {}).get("auditRefs") or []

    found = []
    for ref in refs:
        audit_id = ref.get("id")
        audit = audits.get(audit_id) or {}
        score = audit.get("score")
        google_title = _plain(audit.get("title", ""))
        if (ref.get("group") not in _FIX_GROUPS or audit.get("scoreDisplayMode") != "metricSavings"
                or not google_title or not isinstance(score, (int, float)) or score >= 0.9):
            continue
        savings = audit.get("metricSavings") or {}
        saved_ms = sum(savings.get(k) or 0 for k in ("LCP", "FCP", "TBT", "INP"))
        title, action = _FIX_PLAIN.get(audit_id, (google_title, ""))
        found.append((saved_ms, score, {
            "title": title,
            "action": action,
            "google_title": google_title if title != google_title else "",
            "detail": re.sub(r"^Est savings of\s+", "Could save about ", _plain(audit.get("displayValue", ""))),
        }))

    found.sort(key=lambda f: (-f[0], f[1]))
    return [fix for _, _, fix in found[:MAX_FIXES]]


# ── Small helpers ─────────────────────────────────────────────────────────────

def _score_status(score: Optional[int]) -> str:
    """Google's score bands: 90-100 good, 50-89 needs work, 0-49 poor."""
    if score is None:
        return "info"
    return "good" if score >= 90 else "warn" if score >= 50 else "bad"


def _format_ms(ms: float) -> str:
    return f"{ms / 1000:.1f} s" if ms >= 1000 else f"{round(ms)} ms"


def _plain(text: str) -> str:
    """Lighthouse text can contain markdown: [link text](url) and `code`."""
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", str(text or ""))
    return text.replace("`", "").replace(" ", " ").strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
