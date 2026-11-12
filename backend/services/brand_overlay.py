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

import colorsys
import hashlib
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


# ── Poster designs: a different layout, colour accent and photo style for every poster ───────────────────────
# Nothing here is a fixed template. A seed made of the customer and the post picks one of several layouts, one accent colour
# (taken from the customer's own logo when it has one) and one photographic direction, so two posters of the same customer differ,
# and the same post looks different for another customer. The words are always drawn here with Pillow, never by the image model.
LAYOUTS = (
    ("top-panel",    "Keep the top 32% of the frame calm and uncluttered; a heading is placed there."),
    ("left-column",  "Keep the left 45% of the frame calm and uncluttered; put the subject on the right side. A heading column is placed on the left."),
    ("bottom-card",  "Keep the lower-left of the frame, just above the bottom 15%, calm and uncluttered; the subject sits in the upper part. A heading card is placed there."),
    ("top-fade",     "Keep the top 40% of the frame darker and uncluttered; a heading is placed over it."),
    ("center-frame", "Compose the subject with plenty of simple space around the centre; a heading is placed in the middle of the frame."),
    ("top-banner",   "Keep the top 28% of the frame uncluttered; a heading banner is placed across it."),
)
PHOTO_STYLES = (
    "wide establishing shot in warm golden-hour light",
    "intimate close-up with shallow depth of field and soft natural window light",
    "clean overhead view with tidy geometry and a calm colour palette",
    "candid lifestyle moment with natural expressions and slight motion",
    "bold minimal composition with strong negative space and one clear subject",
    "dynamic low-angle shot with crisp daylight and strong perspective",
    "bright airy high-key look with pastel tones",
    "rich, moody, contrasty look with deep shadows and a single warm light source",
)


def _h(seed: str, n: int, salt: str = "") -> int:
    return int(hashlib.sha256(f"{salt}|{seed}".encode()).hexdigest()[:8], 16) % n


def design_for(seed: str, customer: str = "", day: str = "") -> dict:
    """The layout and photo style for one poster. Posters on different days of one customer walk through the layouts and photo styles in a
    customer-specific order, so neighbouring posters never look alike; the starting point differs per customer. Without a date it falls back
    to a hash of `seed`."""
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", day or "")
    if m and customer:
        try:
            from datetime import date as _d
            n = _d(int(m.group(1)), int(m.group(2)), int(m.group(3))).toordinal() // 2
            step = (1, 5)[_h(customer, 2, "step")]
            name, space = LAYOUTS[(_h(customer, len(LAYOUTS), "off") + n * step) % len(LAYOUTS)]
            style = PHOTO_STYLES[(_h(customer, len(PHOTO_STYLES), "soff") + n * 3) % len(PHOTO_STYLES)]
            return {"layout": name, "space": space, "style": style,
                    # 6 footer looks x 8 footer wordings: the pair only repeats after 24 posters, so a month never repeats a footer
                    "footer": (_h(customer, 6, "foff") + n * 1) % 6, "footer_text": (_h(customer, 8, "toff") + n * 3) % 8}
        except ValueError:
            pass
    name, space = LAYOUTS[_h(seed, len(LAYOUTS), "layout")]
    return {"layout": name, "space": space, "style": PHOTO_STYLES[_h(seed, len(PHOTO_STYLES), "style")],
            "footer": _h(seed, 6, "footer"), "footer_text": _h(seed, 8, "ftext")}


def accent_for(seed: str, logo_bytes: bytes | None = None) -> tuple[int, int, int]:
    """A deep accent colour: the most characteristic colour of the customer's logo, else a hue taken from the seed.
    Always dark enough for white text."""
    rgb = None
    if logo_bytes:
        try:
            im = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
            im.thumbnail((64, 64))
            best = 0.0
            for r, g, b, a in im.getdata():
                if a < 200:
                    continue
                hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
                score = ss * (1 - abs(ll - 0.5) * 1.6)
                if ll > 0.9 or ll < 0.1 or score <= best:
                    continue
                best, rgb = score, (r, g, b)
            if best < 0.15:
                rgb = None
        except Exception:  # noqa: BLE001
            rgb = None
    if rgb is None:
        r, g, b = colorsys.hls_to_rgb(_h(seed, 360, "hue") / 360, 0.34, 0.62)
        rgb = (int(r * 255), int(g * 255), int(b * 255))
    hh, ll, ss = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    r, g, b = colorsys.hls_to_rgb(hh, min(ll, 0.36), max(ss, 0.45))
    return int(r * 255), int(g * 255), int(b * 255)


def _lighten(c, k=0.55):
    return tuple(int(v + (255 - v) * k) for v in c)


def designed_headline_layer(width: int, height: int, heading: str, subheading: str, layout: str, accent: tuple[int, int, int]) -> Image.Image:
    """The heading and subheading in one of the LAYOUTS, in the given accent. Everything stays clear of the brand bar along the bottom."""
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    heading, subheading = (heading or "").strip(), (subheading or "").strip()
    if not heading and not subheading:
        return layer
    draw = ImageDraw.Draw(layer)
    W, H = width, height
    sub_w = "Medium" if os.path.exists(os.path.join(_FONT_DIR, "Poppins-Medium.ttf")) else "Regular"
    white, soft, navy = (255, 255, 255, 255), (232, 236, 255, 255), (16, 20, 44, 255)

    def block(max_w, h_start, s_start, hmax=3, smax=3):
        hf, hl = _fit_block(draw, heading, max_w, int(W * h_start), int(W * 0.042), "Bold", hmax) if heading else (None, [])
        sf, sl = _fit_block(draw, subheading, max_w, int(W * s_start), int(W * 0.026), sub_w, smax) if subheading else (None, [])
        hlh, slh = (int(hf.size * 1.18) if hf else 0), (int(sf.size * 1.32) if sf else 0)
        gap = int(W * 0.02) if (hl and sl) else 0
        return hf, hl, sf, sl, hlh, slh, gap, hlh * len(hl) + gap + slh * len(sl)

    def put(x, y, hf, hl, sf, sl, hlh, slh, gap, hcol, scol, align="left", box_w=0):
        for ln in hl:
            tx = x + (box_w - draw.textlength(ln, font=hf)) / 2 if align == "center" else x
            draw.text((tx, y), ln, font=hf, fill=hcol); y += hlh
        y += gap
        for ln in sl:
            tx = x + (box_w - draw.textlength(ln, font=sf)) / 2 if align == "center" else x
            draw.text((tx, y), ln, font=sf, fill=scol); y += slh

    m = int(W * 0.07)
    if layout == "left-column":
        cw = int(W * 0.46); pad = int(W * 0.04)
        hf, hl, sf, sl, hlh, slh, gap, bh = block(cw - 2 * pad, 0.082, 0.04, 4, 4)
        top = int(H * 0.5 - (bh + 2 * pad) / 2 - H * 0.04)
        top = max(int(H * 0.06), min(top, int(H * 0.82) - bh - 2 * pad))
        layer.alpha_composite(_rect(W, H, [m * 0.6, top, m * 0.6 + cw, top + bh + 2 * pad], accent + (222,), int(W * 0.025)))
        bar = _lighten(accent, 0.6) + (255,)
        draw.rectangle([m * 0.6 + pad, top + pad * 0.55, m * 0.6 + pad + int(W * 0.09), top + pad * 0.55 + 5], fill=bar)
        put(m * 0.6 + pad, top + pad, hf, hl, sf, sl, hlh, slh, gap, white, soft)
    elif layout == "bottom-card":
        cw = int(W * 0.84); pad = int(W * 0.04)
        hf, hl, sf, sl, hlh, slh, gap, bh = block(cw - 2 * pad - int(W * 0.03), 0.07, 0.036, 2, 2)
        bottom = int(H * 0.835); top = bottom - bh - 2 * pad
        x0 = (W - cw) // 2
        layer.alpha_composite(_rect(W, H, [x0, top, x0 + cw, bottom], (255, 255, 255, 240), int(W * 0.03)))
        draw.rounded_rectangle([x0, top, x0 + int(W * 0.018), bottom], radius=int(W * 0.009), fill=accent + (255,))
        put(x0 + pad + int(W * 0.012), top + pad, hf, hl, sf, sl, hlh, slh, gap, navy, accent + (255,))
    elif layout == "top-fade":
        grad = Image.new("RGBA", (W, H), (0, 0, 0, 0)); gd = ImageDraw.Draw(grad); fh = int(H * 0.5)
        for y in range(fh):
            gd.line([(0, y), (W, y)], fill=(8, 10, 24, int(205 * (1 - y / fh) ** 1.4)))
        layer.alpha_composite(grad)
        hf, hl, sf, sl, hlh, slh, gap, bh = block(W - 2 * m, 0.098, 0.042, 3, 2)
        y = int(H * 0.07)
        put(m, y, hf, hl, sf, sl, hlh, slh, gap, white, soft)
        yb = y + bh + int(W * 0.015)
        draw.rounded_rectangle([m, yb, m + int(W * 0.14), yb + 7], radius=3, fill=_lighten(accent, 0.45) + (255,))
    elif layout == "center-frame":
        tint = Image.new("RGBA", (W, H), (8, 10, 24, 92)); layer.alpha_composite(tint)
        b = int(W * 0.045); draw.rectangle([b, b, W - b, int(H * 0.86) - b], outline=(255, 255, 255, 215), width=3)
        cw = int(W * 0.72)
        hf, hl, sf, sl, hlh, slh, gap, bh = block(cw, 0.088, 0.04, 3, 3)
        y = int(H * 0.43 - bh / 2)
        put((W - cw) // 2, y, hf, hl, sf, sl, hlh, slh, gap + int(W * 0.012), white, soft, "center", cw)
        draw.rectangle([W / 2 - int(W * 0.05), y + hlh * len(hl) + int(W * 0.004), W / 2 + int(W * 0.05), y + hlh * len(hl) + int(W * 0.004) + 4], fill=_lighten(accent, 0.5) + (255,))
    elif layout == "top-banner":
        pad = int(W * 0.04)
        hf, hl, sf, sl, hlh, slh, gap, bh = block(W - 2 * m, 0.085, 0.038, 2, 2)
        hh = hlh * len(hl) + 2 * pad
        layer.alpha_composite(_rect(W, H, [0, int(H * 0.05), W, int(H * 0.05) + hh], accent + (236,), 0))
        y = int(H * 0.05) + pad
        for ln in hl:
            draw.text((m, y), ln, font=hf, fill=white); y += hlh
        sh = slh * len(sl) + int(W * 0.03)
        layer.alpha_composite(_rect(W, H, [0, int(H * 0.05) + hh, W, int(H * 0.05) + hh + sh], (10, 12, 28, 205), 0))
        y = int(H * 0.05) + hh + int(W * 0.015)
        for ln in sl:
            draw.text((m, y), ln, font=sf, fill=soft); y += slh
    else:  # top-panel
        return headline_layer(width, height, heading, subheading)
    return layer


def _rect(W, H, box, fill, radius):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if radius:
        d.rounded_rectangle([int(v) for v in box], radius=int(radius), fill=fill)
    else:
        d.rectangle([int(v) for v in box], fill=fill)
    return im


def apply_designed_headline(image_bytes: bytes, heading: str, subheading: str, layout: str, accent: tuple[int, int, int]) -> bytes:
    base = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGBA")
    out = Image.alpha_composite(base, designed_headline_layer(base.width, base.height, heading, subheading, layout, accent)).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ── Poster footers: a different look and different wording on every poster ───────────────────────────────────
_TAGS = ("Call us today", "Get a free quote", "Talk to us", "Get in touch", "Ready when you are")
# (tagline index or None, contact items in order). The phone number is always among them; missing items are skipped.
_FOOTER_TEXT = (
    (0, ("phone", "website")), (None, ("phone", "email")), (None, ("website", "phone")), (1, ("phone", "email")),
    (None, ("phone", "address", "website")), (2, ("website", "phone")), (3, ("phone", "address", "email")), (None, ("email", "phone", "website")),
)


def footer_lines(brand: dict, mode: int) -> list[tuple[str, str]]:
    """[(text, kind)] for one footer wording. kind is 'tag' (small lead line), 'main' (the first contact item) or 'sub'."""
    items = {}
    items["phone"] = str(brand.get("phone") or "").strip()
    items["email"] = str(brand.get("email") or "").strip()
    items["website"] = re.sub(r"^https?://(www\.)?", "", str(brand.get("website") or "").strip()).rstrip("/")
    addr = str(brand.get("address") or "").strip()
    items["address"] = addr if 0 < len(addr) <= 64 else ""
    tag, order = _FOOTER_TEXT[mode % len(_FOOTER_TEXT)]
    out: list[tuple[str, str]] = []
    if tag is not None:
        out.append((_TAGS[tag], "tag"))
    got = [items[k] for k in order if items.get(k)]
    if not any(items.get(k) for k in ("phone",)):   # no phone on file: fall back to whatever exists
        got = [v for v in items.values() if v]
    got = got[:2] if tag is not None else got[:3]
    for i, t in enumerate(got):
        out.append((t, "main" if i == 0 else "sub"))
    return out


def designed_footer_layer(width: int, height: int, brand: dict, logo_bytes: bytes | None, style: int, mode: int, accent: tuple[int, int, int]) -> Image.Image:
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    lines = footer_lines(brand, mode)
    logo = _open_logo(logo_bytes)
    if not lines and not logo:
        return layer
    unit = min(width, height)
    bh = max(int(unit * 0.16), 96)
    top = height - bh
    draw = ImageDraw.Draw(layer)
    dark, white, navy = (14, 16, 32, 218), (255, 255, 255, 255), (18, 22, 48, 255)
    light_acc = _lighten(accent, 0.5) + (255,)
    pad = int(bh * 0.18)
    on_light = style == 1
    text_main = navy if on_light else white
    text_sub = (70, 78, 110, 255) if on_light else (226, 230, 250, 255)
    text_tag = accent + (255,) if on_light else light_acc

    # background
    x_left = pad
    if style == 0:
        draw.rectangle([0, top, width, height], fill=dark); draw.rectangle([0, top, width, top + max(3, bh // 28)], fill=accent + (255,))
    elif style == 1:
        draw.rectangle([0, top, width, height], fill=(255, 255, 255, 244)); draw.rectangle([0, top, width, top + max(5, bh // 16)], fill=accent + (255,))
    elif style == 2:
        draw.rectangle([0, top, width, height], fill=accent + (240,))
    elif style == 3:
        m = int(width * 0.03)
        top = height - bh + int(bh * 0.1); bot = height - int(bh * 0.1)
        draw.rounded_rectangle([m, top, width - m, bot], radius=(bot - top) // 2 if (bot - top) < width * 0.2 else 40, fill=(14, 16, 32, 228), outline=accent + (255,), width=3)
        x_left = m + pad
    elif style == 4:
        draw.rectangle([0, top, width, height], fill=dark)
    else:
        draw.rectangle([0, top, width, height], fill=(12, 14, 30, 222)); draw.rectangle([0, top, int(width * 0.012), height], fill=light_acc)

    inner_top = top + pad if style != 3 else top + int(bh * 0.18)
    inner_h = (height - top) - 2 * pad if style != 3 else (bot - top) - int(bh * 0.2)
    x = x_left
    if logo:
        lw, lh = logo.size
        max_w, max_h = int(width * 0.27), max(inner_h, 20)
        sc = max(min((max_w - 20) / lw, (max_h - 20) / lh), 0.01)
        nw, nh = max(1, int(lw * sc)), max(1, int(lh * sc))
        tile_w, tile_h = nw + 20, nh + 20
        tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
        ImageDraw.Draw(tile).rounded_rectangle([0, 0, tile_w - 1, tile_h - 1], radius=max(8, tile_h // (8 if style != 3 else 2)), fill=(255, 255, 255, 255))
        tile.alpha_composite(logo.resize((nw, nh), Image.LANCZOS), (10, 10))
        ty = inner_top + (inner_h - tile_h) // 2 if style != 4 else top + (bh - tile_h) // 2
        if style == 4:   # logo on a white panel that reaches the edge of the poster
            draw.rectangle([0, top, tile_w + 2 * pad, height], fill=(255, 255, 255, 255)); layer.alpha_composite(tile, (pad, ty)); x = tile_w + 3 * pad
        else:
            layer.alpha_composite(tile, (x, ty)); x += tile_w + pad
    if lines:
        right_edge = (width - x_left) if style != 3 else (width - x_left)
        avail = right_edge - x
        n = len(lines)
        base = int(min(inner_h / max(n, 1) * 0.74, unit * 0.068))
        fonts = []
        for t, k in lines:
            if k == "tag":
                fonts.append(_fit(draw, t.upper() if style in (2, 5) else t, avail, int(base * 0.74), "Bold", 12))
            elif k == "main":
                fonts.append(_fit(draw, t, avail, int(base * 1.12), "Bold"))
            else:
                fonts.append(_fit(draw, t, avail, int(base * 0.86), "Medium"))
        total = sum(f.size * 1.25 for f in fonts)
        y = (inner_top if style != 4 else top) + ((inner_h if style != 4 else bh) - total) / 2
        align = {0: "right", 1: "left", 2: "center", 3: "right", 4: "left", 5: "center"}[style] if logo else ("center" if style in (2, 5) else "left")
        for (t, k), f in zip(lines, fonts):
            tt = t.upper() if (k == "tag" and style in (2, 5)) else t
            tw = draw.textlength(tt, font=f)
            tx = x + (avail - tw) / 2 if align == "center" else (right_edge - tw if align == "right" else x)
            draw.text((tx, y), tt, font=f, fill=text_tag if k == "tag" else text_main if k == "main" else text_sub)
            y += f.size * 1.25
    return layer


def apply_designed_footer(image_bytes: bytes, brand: dict, logo_bytes: bytes | None, style: int, mode: int, accent: tuple[int, int, int]) -> bytes:
    base = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGBA")
    out = Image.alpha_composite(base, designed_footer_layer(base.width, base.height, brand, logo_bytes, style, mode, accent)).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
