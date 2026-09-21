"""
services/openai_image_service.py — poster image generation via OpenAI
================================================================================
This is now the PRIMARY poster-generation mechanism, replacing the old
Canva Brand-Template + Autofill pipeline (see routers/canva_router.py's
_auto_generate_poster, left in place but no longer called from the new
"Create Poster" flow — see generate_poster in canva_router.py).

For a regular user, the image this generates IS the poster directly —
there is no Canva design, autofill, or template involved at all anymore.
Canva only re-enters the picture as a separate, admin-only step for
editing an already-generated image (see edit_poster_in_canva in
canva_router.py and services/canva_service.py's create_design_with_asset).

Deliberately mirrors services/image_generation_service.py's
generate_image_from_prompt(prompt, *, width=None, height=None) -> bytes
signature — same shape, different backend — so callers didn't need to
change their own calling convention when this replaced it for posters.
"""
from __future__ import annotations

import base64
import logging
import os

import requests

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-1")
OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"
_REQUEST_TIMEOUT = 60.0  # image generation is genuinely slow; a short timeout would fail normal, successful calls


class OpenAIImageError(Exception):
    pass


def _closest_supported_size(width: int | None, height: int | None) -> str:
    """gpt-image-1 only accepts a fixed set of sizes — maps an arbitrary
    requested width/height to the closest one rather than failing the
    whole request over an unsupported exact size. Defaults to square,
    the normal case for a social media poster."""
    if not width or not height:
        return "1024x1024"
    ratio = width / height
    if ratio > 1.2:
        return "1536x1024"  # landscape
    if ratio < 0.83:
        return "1024x1536"  # portrait
    return "1024x1024"  # square


def generate_image_from_prompt(prompt: str, *, width: int | None = None, height: int | None = None) -> bytes:
    """Generates one image from a text prompt (e.g. a calendar post's
    visual_suggestion — unchanged from before, this function's only job
    is to turn that same text into an image differently) and returns the
    raw image bytes.

    Raises OpenAIImageError on any failure (missing API key, request
    failure, unexpected response shape) — callers should catch this
    specifically, same pattern as ImageGenerationError from the Bedrock
    service this replaces for posters.
    """
    if not OPENAI_API_KEY:
        raise OpenAIImageError(
            "OPENAI_API_KEY is not configured — set it as an environment variable before generating posters."
        )

    size = _closest_supported_size(width, height)
    body = {
        "model": OPENAI_IMAGE_MODEL,
        "prompt": prompt,
        "size": size,
        "n": 1,
    }
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}

    try:
        resp = requests.post(OPENAI_IMAGES_URL, json=body, headers=headers, timeout=_REQUEST_TIMEOUT)
    except requests.RequestException as e:
        raise OpenAIImageError(f"Could not reach OpenAI's image API: {e}")

    if resp.status_code != 200:
        detail = ""
        try:
            detail = resp.json().get("error", {}).get("message", "")
        except ValueError:
            detail = resp.text[:300]
        raise OpenAIImageError(f"OpenAI image generation failed (status {resp.status_code}): {detail}")

    try:
        data = resp.json()["data"][0]
    except (KeyError, IndexError, ValueError) as e:
        raise OpenAIImageError(f"Unexpected response shape from OpenAI's image API: {e}")

    # gpt-image-1 returns base64-encoded image data directly (b64_json);
    # some other OpenAI image models instead return a temporary "url" to
    # download from — support both rather than assuming one.
    if "b64_json" in data and data["b64_json"]:
        try:
            return base64.b64decode(data["b64_json"])
        except Exception as e:
            raise OpenAIImageError(f"Could not decode OpenAI's base64 image data: {e}")

    if "url" in data and data["url"]:
        try:
            img_resp = requests.get(data["url"], timeout=_REQUEST_TIMEOUT)
            img_resp.raise_for_status()
            return img_resp.content
        except requests.RequestException as e:
            raise OpenAIImageError(f"Could not download the generated image from OpenAI: {e}")

    raise OpenAIImageError("OpenAI's image API response contained neither b64_json nor url data.")
