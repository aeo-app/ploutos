"""
services/photo_service.py — the customer's own photos, used to make images and reels
================================================================================
A photo is uploaded once (POST /aeo/photos): checked, turned upright, shrunk to a sensible size and stored under the
customer's own prefix. Generating an image or a reel then refers to the stored photos by link, so the generation
request itself stays small and a customer can never name someone else's file.
"""
from __future__ import annotations

import io
import logging

from PIL import Image, ImageOps

from services.media_upload_service import MediaUploadError, read_user_image, signed_view_url, upload_image

logger = logging.getLogger(__name__)

MAX_PHOTOS = 5
MAX_PHOTO_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 40_000_000
MAX_SIDE = 2048
MIN_SIDE = 240


class PhotoError(Exception):
    """Message is safe to show to the customer."""


def prepare_photo(data: bytes) -> bytes:
    """Validates a photo and returns it as an upright JPEG no larger than 2048 px on its longest side."""
    if not data:
        raise PhotoError("That file is empty.")
    if len(data) > MAX_PHOTO_BYTES:
        raise PhotoError("That photo is over 15 MB. Choose a smaller one.")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:  # noqa: BLE001
        raise PhotoError("We could not read that file. Upload a JPG, PNG or WebP photo.")
    if img.width * img.height > MAX_PIXELS:
        raise PhotoError("That photo is too large to process. Choose one under 40 megapixels.")
    img = ImageOps.exif_transpose(img)
    if min(img.size) < MIN_SIDE:
        raise PhotoError("That photo is too small. Use one at least 240 pixels on each side.")
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88, optimize=True)
    return buf.getvalue()


def store_photo(data: bytes, user_id: str) -> dict:
    """Prepares and stores one photo. Returns {url, view_url, width, height}."""
    jpg = prepare_photo(data)
    with Image.open(io.BytesIO(jpg)) as im:
        w, h = im.size
    try:
        url = upload_image(jpg, "photo.jpg", user_id)
    except MediaUploadError as e:
        raise PhotoError(str(e))
    return {"url": url, "view_url": signed_view_url(url, user_id) or url, "width": w, "height": h}


def load_photos(urls: list[str] | None, user_id: str, limit: int = MAX_PHOTOS) -> list[bytes]:
    """Bytes of the customer's own stored photos, in the order given. Anything that is not theirs is refused."""
    urls = [u for u in (urls or []) if u]
    if not urls:
        return []
    if len(urls) > limit:
        raise PhotoError(f"Use at most {limit} photos.")
    out: list[bytes] = []
    for u in urls:
        try:
            got = read_user_image(str(u)[:600], user_id)
        except Exception as e:  # noqa: BLE001
            logger.error(f"[photos] could not read {u!r}: {e}")
            raise PhotoError("We could not read one of your photos. Please upload it again.")
        if not got:
            raise PhotoError("One of the photos is no longer available. Please upload it again.")
        out.append(got[0])
    return out
