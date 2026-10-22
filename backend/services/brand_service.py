"""
services/brand_service.py — the customer's Brand kit (logo + contact details)
================================================================================
Stored inside the customer's AEO state under "brand" (server-owned: the generic
PUT /aeo/state cannot overwrite it). A logo and a contact phone number are
REQUIRED before any image or video is generated; the logo, phone, email and
website are then printed on every generated image/Short (see brand_overlay.py).
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import HTTPException

from db.dynamo import get_aeo_state, save_aeo_state
from models.aeo_models import AeoState
from services.media_upload_service import read_user_image

logger = logging.getLogger(__name__)

BRAND_FIELDS = ("logo_url", "phone", "email", "website", "address", "business", "socials", "detected_at")
_PHONE_OK = re.compile(r"^\+?[0-9][0-9 ()./\-]{5,28}$")
_EMAIL_OK = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")

MISSING_MESSAGE = "Add your company logo and a contact phone number first — they are printed on every image and Short we create."


def get_brand(user_id: str) -> dict:
    b = get_aeo_state(user_id).get("brand") or {}
    return b if isinstance(b, dict) else {}


def missing_fields(brand: dict) -> list[str]:
    out = []
    if not brand.get("logo_url"):
        out.append("logo")
    if not str(brand.get("phone") or "").strip():
        out.append("phone")
    return out


def save_brand(user_id: str, **fields) -> dict:
    state = get_aeo_state(user_id)
    brand = dict(state.get("brand") or {})
    for k, v in fields.items():
        if k in BRAND_FIELDS and v is not None:
            brand[k] = v
    brand["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    state["brand"] = brand
    save_aeo_state(user_id, AeoState(**state).model_dump())
    return brand


def clean_phone(raw: str) -> str:
    p = re.sub(r"\s+", " ", (raw or "").strip())
    digits = re.sub(r"\D", "", p)
    if not _PHONE_OK.match(p) or not (7 <= len(digits) <= 15):
        raise ValueError("Enter a valid contact phone number, for example +65 6123 4567.")
    return p


def clean_email(raw: str) -> str:
    e = (raw or "").strip().lower()
    if e and not _EMAIL_OK.match(e):
        raise ValueError("That email address doesn't look right.")
    return e[:120]


def clean_website(raw: str) -> str:
    w = (raw or "").strip()
    if not w:
        return ""
    w = re.sub(r"^https?://", "", w, flags=re.I).strip("/ ")
    if not re.match(r"^[A-Za-z0-9.\-]+\.[A-Za-z]{2,}(/.*)?$", w):
        raise ValueError("That website address doesn't look right.")
    return w[:120]


def load_logo(user_id: str, brand: dict) -> bytes | None:
    """Bytes of the customer's stored logo (None if there isn't one / it can't be read)."""
    url = brand.get("logo_url")
    if not url:
        return None
    try:
        got = read_user_image(url, user_id)
        return got[0] if got else None
    except Exception as e:  # noqa: BLE001
        logger.error(f"[brand] could not read logo for {user_id}: {e}")
        return None


def require_brand(user_id: str) -> tuple[dict, bytes]:
    """(brand, logo_bytes) or a clear 422 telling the user what to add."""
    brand = get_brand(user_id)
    if missing_fields(brand):
        raise HTTPException(status_code=422, detail=MISSING_MESSAGE)
    logo = load_logo(user_id, brand)
    if not logo:
        raise HTTPException(status_code=422, detail="We could not read your logo. Please upload it again in the Brand kit.")
    return brand, logo


def build_photo_prompt(company: str, industry: str, brand: dict, scene: str, keywords: list[str] | None = None, vertical: bool = False) -> str:
    """The scene description handed to the image model: what the business actually
    does (from its own website) + the scene to photograph. The realism style directive
    is added centrally by openai_image_service.realistic_prompt()."""
    biz = brand.get("business") or {}
    about = " ".join(x for x in (biz.get("title"), biz.get("description")) if x)[:420]
    parts = [f"A photograph for the social media of {company or 'a company'}" + (f", a {industry} business" if industry and industry != "General" else "") + "."]
    if about:
        parts.append(f"What the business does (from its own website): {about}")
    if keywords:
        parts.append("Topics it wants to be known for: " + ", ".join(keywords[:6]) + ".")
    parts.append(f"Scene to photograph: {scene.strip()[:700]}")
    parts.append("Show real, relevant people, places, products or services from this exact line of business — nothing generic or unrelated."
                 + (" Vertical 9:16 framing with the main subject in the upper two thirds." if vertical else
                    " Leave the bottom 15% of the frame uncluttered (a contact bar is added there)."))
    return "\n".join(parts)
