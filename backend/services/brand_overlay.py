"""
services/brand_overlay.py — puts the company logo + contact details on every generated image
================================================================================
AI image models can't be trusted to draw a real logo or spell a phone number
correctly, so the photo is generated WITHOUT text and the brand bar is composited
on afterwards with Pillow. That makes the logo and contact details exact, every time.

  apply_brand_bar(image_bytes, brand, logo_bytes)      -> PNG bytes, bar along the bottom
  brand_bar_layer(width, height, brand, logo_bytes)    -> RGBA layer (for video frames)
"""
from __future__ import annotations

import io
import os
import re

from PIL import Image, ImageDraw, ImageFont, ImageOps

_FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts")
_FONT_FALLBACKS = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
)


def font(size: int, weight: str = "Bold") -> ImageFont.ImageFont:
    for path in (os.path.join(_FONT_DIR, f"Poppins-{weight}.ttf"), *_FONT_FALLBACKS):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def contact_lines(brand: dict) -> list[str]:
    """The lines printed on the bar, most important first: phone, email, website, address."""
    lines = []
    phone = str(brand.get("phone") or "").strip()
    if phone:
        lines.append(phone)
    email = str(brand.get("email") or "").strip()
    if email:
        lines.append(email)
    site = re.sub(r"^https?://(www\.)?", "", str(brand.get("website") or "").strip()).rstrip("/")
    if site:
        lines.append(site)
    addr = str(brand.get("address") or "").strip()
    if addr and len(addr) <= 64:
        lines.append(addr)
    return lines[:3]   # phone first; the address only appears when the email or website is missing


def _fit(draw: ImageDraw.ImageDraw, text: str, max_w: int, size: int, weight: str, min_size: int = 14):
    while size > min_size:
        f = font(size, weight)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return font(min_size, weight)


def _open_logo(logo_bytes: bytes | None) -> Image.Image | None:
    if not logo_bytes:
        return None
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(logo_bytes)))
        return img.convert("RGBA")
    except Exception:  # noqa: BLE001 — a broken logo must never block image generation
        return None


def brand_bar_layer(width: int, height: int, brand: dict, logo_bytes: bytes | None,
                    bar_height: int | None = None, bottom_margin: int = 0) -> Image.Image:
    """A transparent width x height layer with the brand bar drawn at the bottom
    (lifted by bottom_margin, which keeps it out of a Short's player controls)."""
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    lines = contact_lines(brand)
    logo = _open_logo(logo_bytes)
    if not lines and not logo:
        return layer

    unit = min(width, height)
    bh = bar_height or max(int(unit * 0.16), 96)
    pad = int(bh * 0.18)
    top = height - bottom_margin - bh
    draw = ImageDraw.Draw(layer)
    # Soft-edged dark bar so white text is readable on any photo.
    draw.rectangle([0, top, width, top + bh], fill=(14, 16, 32, 214))
    draw.rectangle([0, top, width, top + max(3, bh // 28)], fill=(79, 70, 229, 255))

    x = pad
    inner_h = bh - 2 * pad
    if logo:
        # Logo sits on a white rounded tile so dark or transparent logos stay visible.
        lw, lh = logo.size
        max_w, max_h = int(width * 0.30), inner_h
        scale = min((max_w - 2 * 10) / lw, (max_h - 2 * 10) / lh)
        scale = max(scale, 0.01)
        nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
        tile_w, tile_h = nw + 20, nh + 20
        tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
        ImageDraw.Draw(tile).rounded_rectangle([0, 0, tile_w - 1, tile_h - 1], radius=max(8, tile_h // 8), fill=(255, 255, 255, 255))
        tile.alpha_composite(logo.resize((nw, nh), Image.LANCZOS), (10, 10))
        layer.alpha_composite(tile, (x, top + (bh - tile_h) // 2))
        x += tile_w + pad

    if lines:
        avail = width - x - pad
        n = len(lines)
        line_h = inner_h / max(n, 1)
        base = int(min(line_h * 0.74, unit * 0.07))
        ys = []
        fonts = []
        for i, t in enumerate(lines):
            f = _fit(draw, t, avail, int(base * 1.12) if i == 0 else int(base * 0.86), "Bold" if i == 0 else "Medium")
            fonts.append(f)
        total = sum(f.size * 1.25 for f in fonts)
        y = top + (bh - total) / 2
        for t, f in zip(lines, fonts):
            tw = draw.textlength(t, font=f)
            # Right-align when there's a logo (text block hugs the right edge), else left.
            tx = width - pad - tw if logo else x
            draw.text((tx, y), t, font=f, fill=(255, 255, 255, 255))
            y += f.size * 1.25
    return layer


def apply_brand_bar(image_bytes: bytes, brand: dict, logo_bytes: bytes | None) -> bytes:
    """Returns a PNG of the image with the brand bar along the bottom edge."""
    base = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGBA")
    layer = brand_bar_layer(base.width, base.height, brand, logo_bytes)
    out = Image.alpha_composite(base, layer).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def validate_logo(logo_bytes: bytes) -> tuple[bool, str, tuple[int, int]]:
    """(ok, message, (w, h)) — a logo must be a readable image that is big enough to stay sharp."""
    try:
        img = Image.open(io.BytesIO(logo_bytes))
        img.load()
    except Exception:  # noqa: BLE001
        return False, "That file isn't a readable image. Upload a PNG, JPG or WebP logo.", (0, 0)
    w, h = img.size
    if min(w, h) < 60 or max(w, h) < 240:
        return False, f"That logo is too small ({w}×{h}px) to stay sharp. Upload one at least 240px wide.", (w, h)
    if max(w, h) / max(min(w, h), 1) > 8:
        return False, "That image is too long and thin to be a logo. Upload your logo mark or full logo.", (w, h)
    return True, "", (w, h)


def normalise_logo(logo_bytes: bytes, max_side: int = 800) -> bytes:
    """Downscales a very large logo and returns PNG (keeps transparency)."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(logo_bytes))).convert("RGBA")
    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ── Optional heading + subheading ────────────────────────────────────────────
# Like the brand bar, the words are drawn here with Pillow (never by the image model, which misspells), so
# whatever the customer typed appears exactly as typed in the final image and in every scene of a reel.
def _wrap_px(draw: ImageDraw.ImageDraw, text: str, f, max_w: int) -> list[str]:
    lines: list[str] = []
    for para in str(text).split("\n"):
        cur = ""
        for word in para.split():
            trial = f"{cur} {word}".strip()
            if draw.textlength(trial, font=f) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = word
        lines.append(cur)
    return [ln for ln in lines if ln]


def _fit_block(draw, text: str, max_w: int, start: int, min_size: int, weight: str, max_lines: int):
    """Largest font (>= min_size) at which `text` wraps into <= max_lines lines that all fit max_w."""
    size = start
    while True:
        f = font(size, weight)
        lines = _wrap_px(draw, text, f, max_w)
        fits = len(lines) <= max_lines and all(draw.textlength(ln, font=f) <= max_w for ln in lines)
        if fits or size <= min_size:
            if len(lines) > max_lines:                      # still too long at the smallest size: trim with an ellipsis
                lines = lines[:max_lines]
                while lines[-1] and draw.textlength(lines[-1] + "…", font=f) > max_w:
                    lines[-1] = lines[-1][:-1]
                lines[-1] = lines[-1].rstrip() + "…"
            return f, lines
        size -= 2


def headline_layer(width: int, height: int, heading: str = "", subheading: str = "", top: int | None = None) -> Image.Image:
    """Transparent layer with the heading (large) and subheading (smaller) centred near the top on a soft dark panel.
    `top` is the y of the panel; default sits in the upper part of the frame, clear of the brand bar at the bottom."""
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    heading, subheading = (heading or "").strip(), (subheading or "").strip()
    if not heading and not subheading:
        return layer
    draw = ImageDraw.Draw(layer)
    margin = int(width * 0.075)
    max_w = width - 2 * margin
    pad = int(width * 0.04)
    inner_w = max_w - 2 * pad
    hf, hl = (None, [])
    sf, sl = (None, [])
    if heading:
        hf, hl = _fit_block(draw, heading, inner_w, int(width * 0.092), int(width * 0.045), "Bold", 3)
    if subheading:
        sf, sl = _fit_block(draw, subheading, inner_w, int(width * 0.043), int(width * 0.026), "Medium" if os.path.exists(os.path.join(_FONT_DIR, "Poppins-Medium.ttf")) else "Regular", 3)
    h_lh = int(hf.size * 1.2) if hf else 0
    s_lh = int(sf.size * 1.32) if sf else 0
    gap = int(width * 0.018) if (hl and sl) else 0
    block_h = h_lh * len(hl) + gap + s_lh * len(sl)
    panel_h = block_h + 2 * pad
    y0 = top if top is not None else int(height * 0.055)
    panel = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle([margin, y0, width - margin, y0 + panel_h], radius=int(width * 0.03), fill=(10, 12, 28, 178))
    layer.alpha_composite(panel)
    y = y0 + pad
    for ln in hl:
        tw = draw.textlength(ln, font=hf)
        draw.text(((width - tw) / 2, y), ln, font=hf, fill=(255, 255, 255, 255))
        y += h_lh
    y += gap
    for ln in sl:
        tw = draw.textlength(ln, font=sf)
        draw.text(((width - tw) / 2, y), ln, font=sf, fill=(226, 232, 255, 255))
        y += s_lh
    return layer


def apply_headline(image_bytes: bytes, heading: str = "", subheading: str = "") -> bytes:
    """PNG of the image with the heading/subheading on it (unchanged when both are empty)."""
    if not (heading or "").strip() and not (subheading or "").strip():
        return image_bytes
    base = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGBA")
    out = Image.alpha_composite(base, headline_layer(base.width, base.height, heading, subheading)).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
