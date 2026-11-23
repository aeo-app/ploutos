from __future__ import annotations

import logging
import math
import os
import re
import time

import requests

from services.bedrock_service import _converse

logger = logging.getLogger(__name__)

VOICES = {
    "en-US-AriaNeural-Female": "US English · female",
    "en-US-AndrewNeural-Male": "US English · male",
    "en-GB-SoniaNeural-Female": "UK English · female",
    "en-GB-RyanNeural-Male": "UK English · male",
    "en-IN-NeerjaNeural-Female": "Indian English · female",
    "en-IN-PrabhatNeural-Male": "Indian English · male",
    "en-SG-LunaNeural-Female": "Singapore English · female",
    "en-SG-WayneNeural-Male": "Singapore English · male",
    "en-AU-NatashaNeural-Female": "Australian English · female",
    "en-AU-WilliamNeural-Male": "Australian English · male",
}
DEFAULT_VOICE = "en-US-AriaNeural-Female"

ENGINE_TIMEOUT_SECONDS = int(os.getenv("REELS_ENGINE_TIMEOUT_SECONDS", "480"))
POLL_SECONDS = 4
MAX_POLL_FAILURES = 3
STATE_FAILED, STATE_COMPLETE = -1, 1

WORDS_PER_SECOND = 2.5
MIN_CLIP_SECONDS = 3
MIN_SCRIPT_WORDS = 15
MAX_SCRIPT_WORDS = 110
# Subtitles sit between the heading and the contact bar that are drawn over the engine's video afterwards.
SUBTITLE_TOP_PERCENT = 66
SUBTITLE_FONT = "BeVietnamPro-Bold.ttf"

UNREACHABLE = "The video service is not reachable right now. Please try again in a few minutes."
FAILED = "The video service could not make this reel. Please try again."

_SCRIPT_SYSTEM = "You write voiceover scripts for short vertical social videos (Instagram Reels, YouTube Shorts) for real businesses."


class ReelsEngineError(Exception):
    pass


def configured() -> bool:
    return bool(_base())


def _base() -> str:
    return os.getenv("REELS_ENGINE_URL", "").strip().rstrip("/")


def _headers() -> dict:
    key = os.getenv("REELS_ENGINE_KEY", "").strip()
    return {"x-api-key": key} if key else {}


def _call(method: str, path: str, timeout: float, **kwargs) -> requests.Response:
    url = path if path.startswith(("http://", "https://")) else f"{_base()}{path}"
    try:
        r = requests.request(method, url, headers=_headers(), timeout=timeout, **kwargs)
    except requests.RequestException as e:
        logger.error(f"[reels-engine] {method} {path} failed: {type(e).__name__}")
        raise ReelsEngineError(UNREACHABLE)
    if r.status_code >= 400:
        logger.error(f"[reels-engine] {method} {path} -> {r.status_code}: {r.text[:300]}")
        raise ReelsEngineError(FAILED)
    return r


def _data(r: requests.Response) -> dict:
    try:
        body = r.json()
    except ValueError:
        logger.error(f"[reels-engine] not JSON: {r.text[:200]}")
        raise ReelsEngineError(FAILED)
    if not isinstance(body, dict):
        return {}
    return body.get("data") or {}


def _upload_scene(jpg: bytes, n: int) -> str:
    r = _call("POST", "/api/v1/video_materials", 60, files={"file": (f"scene-{n}.jpg", jpg, "image/jpeg")})
    name = str(_data(r).get("file") or "")
    if not name:
        raise ReelsEngineError(FAILED)
    return name


def clip_seconds(script: str, scenes: int) -> int:
    spoken = len(script.split()) / WORDS_PER_SECOND + 1
    return max(MIN_CLIP_SECONDS, math.ceil(spoken / max(scenes, 1)))


def _start(materials: list[str], script: str, title: str, voice: str, music: bool) -> str:
    params = {
        "video_subject": (title or "Reel")[:200],
        "video_script": script,
        "video_language": "en-US",
        "video_source": "local",
        "video_materials": [{"provider": "local", "url": m} for m in materials],
        "video_aspect": "9:16",
        "video_fit_mode": "cover",
        "image_motion": "zoom",
        "video_concat_mode": "sequential",
        "video_transition_mode": "FadeIn",
        "video_clip_duration": clip_seconds(script, len(materials)),
        "video_count": 1,
        "voice_name": voice if voice in VOICES else DEFAULT_VOICE,
        "voice_rate": 1.0,
        "voice_volume": 1.0,
        "bgm_type": "random" if music else "",
        "bgm_volume": 0.15,
        "subtitle_enabled": True,
        "subtitle_position": "custom",
        "custom_position": SUBTITLE_TOP_PERCENT,
        "font_name": SUBTITLE_FONT,
        "font_size": 64,
        "text_fore_color": "#FFFFFF",
        "stroke_color": "#000000",
        "stroke_width": 3,
    }
    task_id = str(_data(_call("POST", "/api/v1/videos", 30, json=params)).get("task_id") or "")
    if not task_id:
        raise ReelsEngineError(FAILED)
    return task_id


def _wait(task_id: str) -> str:
    deadline = time.time() + ENGINE_TIMEOUT_SECONDS
    failures = 0
    while time.time() < deadline:
        time.sleep(POLL_SECONDS)
        try:
            task = _data(_call("GET", f"/api/v1/tasks/{task_id}", 20))
        except ReelsEngineError:
            failures += 1
            if failures >= MAX_POLL_FAILURES:
                raise
            continue
        failures = 0
        if task.get("state") == STATE_FAILED:
            logger.error(f"[reels-engine] task {task_id} failed at {task.get('failed_stage')}: {task.get('error')}")
            raise ReelsEngineError(FAILED)
        videos = task.get("videos") or []
        if task.get("state") == STATE_COMPLETE and videos:
            return str(videos[0])
    raise ReelsEngineError("Making the reel took too long. Please try again.")


def _forget(task_id: str) -> None:
    try:
        _call("DELETE", f"/api/v1/tasks/{task_id}", 20)
    except ReelsEngineError:
        logger.warning(f"[reels-engine] could not delete task {task_id} on the engine")


def make_video(scenes: list[bytes], script: str, title: str, voice: str, music: bool) -> bytes:
    if not configured():
        raise ReelsEngineError(UNREACHABLE)
    started = time.time()
    materials = [_upload_scene(jpg, i) for i, jpg in enumerate(scenes)]
    task_id = _start(materials, script, title, voice, music)
    try:
        video = _call("GET", _wait(task_id), 180).content
    finally:
        _forget(task_id)
    logger.info(f"[reels-engine] task {task_id}: {len(scenes)} scenes, {len(video) // 1024} KB in {time.time() - started:.0f}s")
    return video


def _clean_script(raw: str) -> str:
    text = (raw or "").replace("’", "'").replace("‘", "'").replace("—", ", ").replace("–", ", ")
    text = re.sub(r"https?://\S+|www\.\S+|#\w+|\[[^\]]*\]|\([^)]*\)", " ", text)
    text = re.sub(r"[*_\"“”]|^\s*(voiceover|script)\s*:", " ", text, flags=re.IGNORECASE | re.MULTILINE)
    text = "".join(ch for ch in text if ch.isascii() or ch.isalpha())
    words = " ".join(text.split()).split(" ")
    if len(words) <= MAX_SCRIPT_WORDS:
        return " ".join(words).strip()
    cut = " ".join(words[:MAX_SCRIPT_WORDS])
    end = max(cut.rfind("."), cut.rfind("!"), cut.rfind("?"))
    return (cut[:end + 1] if end > 0 else cut).strip()


def _fallback_script(company: str, title: str, text: str) -> str:
    body = _clean_script(f"{title}. {text}")
    words = body.split()[:70]
    closing = f"Get in touch with {company} today." if company else "Get in touch with us today."
    return f"{' '.join(words).rstrip('.')}. {closing}"


def write_script(company: str, industry: str, title: str, text: str, keywords: list[str]) -> str:
    prompt = f"""Write the voiceover for a 25 to 30 second vertical reel.

Business: {company or "the business"}{f" ({industry})" if industry else ""}
Topic: {title}
Post it goes with: {text[:1500]}
Keywords: {", ".join(keywords[:8])}

Rules:
- 55 to 75 words of plain spoken English. Keep every sentence to 12 words or fewer, because each sentence becomes one on-screen subtitle.
- Open with a hook, give two or three useful points from the post, and end by inviting the viewer to contact {company or "the business"}.
- Do not number the points or start sentences with "First", "Second", "Next" or "Finally".
- No hashtags, emojis, links, phone numbers, email addresses, stage directions, headings or quotation marks. The contact details are already shown on screen.
- Only use facts from the post. Do not invent prices, numbers, awards or guarantees.

Reply with the script text only."""
    try:
        script = _clean_script(_converse(_SCRIPT_SYSTEM, prompt, max_tokens=400))
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[reels-engine] script writing failed, using the post text instead: {type(e).__name__}: {e}")
        script = ""
    if len(script.split()) < MIN_SCRIPT_WORDS:
        script = _fallback_script(company, title, text)
    return script
