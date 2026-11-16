"""
services/shorts_service.py — real YouTube Shorts (vertical 9:16 video), generated or uploaded
================================================================================
Generate:  several realistic, business-relevant photographs (see openai_image_service) become
           a ~20 second vertical video with slow camera moves, cross-fades, on-screen captions
           and the brand bar (logo + phone + email + website) kept inside the Shorts safe zone.
           Built with Pillow (text/logo) + ffmpeg (motion/encoding) — no extra video service.
Upload:    a user's own Short is checked (a real video, vertical or square, <= 3 minutes,
           <= 120 MB) and a thumbnail is taken from it.
"""
from __future__ import annotations

import io
import json
import re
import shutil
import logging
import os
import subprocess
import tempfile
import textwrap
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageDraw, ImageFilter, ImageOps

from services import brand_service as brand_svc
from services.brand_overlay import brand_bar_layer, font, headline_layer
from services.openai_image_service import OpenAIImageError, generate_image_from_prompt

logger = logging.getLogger(__name__)

W, H = 1080, 1920
FPS = 30
SCENES = int(os.getenv("SHORTS_SCENES", "3"))
SECONDS_PER_SCENE = float(os.getenv("SHORTS_SECONDS_PER_SCENE", "6"))
XFADE = 0.6
MAX_UPLOAD_BYTES = 120 * 1024 * 1024
MAX_UPLOAD_SECONDS = 180
BAR_HEIGHT, BAR_LIFT = 190, 250        # keeps the contact bar clear of the Shorts player controls
FFMPEG_TIMEOUT = int(os.getenv("SHORTS_FFMPEG_TIMEOUT_SECONDS", "240"))


class ShortError(Exception):
    pass


def _bin(name: str) -> str | None:
    """The system binary, else (ffmpeg only) the one bundled with the imageio-ffmpeg pip package."""
    found = shutil.which(name)
    if found or name != "ffmpeg":
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return None


def _run(cmd: list[str], what: str, timeout: int = FFMPEG_TIMEOUT, ok_codes: tuple = ()) -> subprocess.CompletedProcess:
    exe = _bin(cmd[0])
    if not exe:
        raise ShortError("ffmpeg is not installed on this server — it is required to create YouTube Shorts.")
    cmd = [exe] + list(cmd[1:])
    try:
        return subprocess.run(cmd, check=True, capture_output=True, timeout=timeout)
    except FileNotFoundError:
        raise ShortError("ffmpeg is not installed on this server — it is required to create YouTube Shorts.")
    except subprocess.TimeoutExpired:
        raise ShortError(f"{what} took too long. Please try again.")
    except subprocess.CalledProcessError as e:
        if e.returncode in ok_codes:
            return subprocess.CompletedProcess(e.cmd, e.returncode, e.stdout, e.stderr)
        tail = (e.stderr or b"").decode("utf-8", errors="replace")[-600:]
        raise ShortError(f"{what} failed: {tail}")


# ── Uploaded Shorts ──────────────────────────────────────────────────────────
def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):      # ffprobe prints "N/A" for unknown values
        return 0.0


def _probe_with_ffmpeg(path: str) -> dict:
    """Same answer without ffprobe: read what `ffmpeg -i` prints about the file."""
    r = _run(["ffmpeg", "-hide_banner", "-i", path], "Reading the video", timeout=60, ok_codes=(1,))
    t = (r.stderr or b"").decode("utf-8", errors="replace")
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", t)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
    v = re.search(r"Video:\s*([a-z0-9_]+).*?,\s*(\d{2,5})x(\d{2,5})", t)
    w, h = (int(v.group(2)), int(v.group(3))) if v else (0, 0)
    rot = re.search(r"rotate\s*:\s*(-?\d+)", t) or re.search(r"displaymatrix:\s*rotation of\s*(-?[\d.]+)", t)
    if rot and int(abs(float(rot.group(1)))) % 180 == 90:
        w, h = h, w
    return {"width": w, "height": h, "duration": dur, "codec": v.group(1) if v else ""}


def probe(path: str) -> dict:
    if not _bin("ffprobe"):
        return _probe_with_ffmpeg(path)
    """Width/height as the viewer sees them (rotation applied) and the duration in seconds."""
    r = _run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
              "stream=width,height,duration,codec_type:stream_tags=rotate:stream_side_data=rotation:format=duration",
              "-of", "json", path], "Reading the video", timeout=60)
    d = json.loads(r.stdout or b"{}")
    st = (d.get("streams") or [{}])[0]
    w, h = int(_num(st.get("width"))), int(_num(st.get("height")))
    rot = _num((st.get("tags") or {}).get("rotate"))
    for sd in st.get("side_data_list") or []:
        rot = rot or _num(sd.get("rotation"))
    if int(abs(rot)) % 180 == 90:        # phones record sideways and flag the rotation
        w, h = h, w
    dur = _num((d.get("format") or {}).get("duration")) or _num(st.get("duration"))
    return {"width": w, "height": h, "duration": dur}


_UNREADABLE = "That doesn't look like a video we can read. Upload an MP4 or MOV file."


def check_uploaded_short(data: bytes) -> dict:
    """Validates a user's own Short and returns {duration, width, height, thumbnail(jpg bytes)}."""
    if not data:
        raise ShortError("That file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ShortError("That video is over 120 MB. Export a smaller file and try again.")
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "in.bin")
        with open(src, "wb") as f:
            f.write(data)
        try:
            info = probe(src)
        except ShortError as e:
            msg = str(e)
            # Only a genuinely unreadable file gets the "not a video" message; a server problem is reported as such.
            if "not installed" in msg or "took too long" in msg:
                logger.error("[shorts] probe failed (server): %s", msg)
                raise
            logger.warning("[shorts] ffprobe could not read upload: %s", msg[-300:])
            raise ShortError(_UNREADABLE)
        except (ValueError, KeyError) as e:
            logger.warning("[shorts] ffprobe output unreadable: %s", e)
            raise ShortError(_UNREADABLE)
        if not info["width"] or not info["height"]:
            raise ShortError(_UNREADABLE)
        if info["duration"] <= 0:
            # some containers carry no duration header — count the frames instead
            try:
                r = _run(["ffmpeg", "-v", "error", "-i", src, "-f", "null", "-"], "Reading the video", timeout=FFMPEG_TIMEOUT)
                m = re.findall(rb"time=(\d+):(\d+):([\d.]+)", r.stderr or b"")
                if m:
                    hh, mm, ss = m[-1]
                    info["duration"] = int(hh) * 3600 + int(mm) * 60 + float(ss)
            except ShortError:
                pass
            if info["duration"] <= 0:
                info["duration"] = 1.0
        if info["duration"] > MAX_UPLOAD_SECONDS:
            raise ShortError(f"That video is {int(info['duration'])} seconds. YouTube Shorts can be up to 3 minutes — trim it and try again.")
        if info["width"] > info["height"]:
            raise ShortError("That video is landscape. YouTube Shorts must be vertical (9:16) or square — export it that way and try again.")
        thumb = os.path.join(tmp, "t.jpg")
        _run(["ffmpeg", "-y", "-ss", str(min(0.5, info["duration"] / 2)), "-i", src, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "3", thumb],
             "Making a preview image", timeout=60)
        with open(thumb, "rb") as f:
            info["thumbnail"] = f.read()
        return info


def to_mp4(data: bytes) -> bytes:
    """MOV/WebM/odd MP4s are re-encoded to a plain H.264/AAC MP4 that YouTube and every browser accept.
    An already-plain MP4 (H.264) is returned untouched."""
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = os.path.join(tmp, "in.bin"), os.path.join(tmp, "out.mp4")
        with open(src, "wb") as f:
            f.write(data)
        if _bin("ffprobe"):
            r = _run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", src], "Reading the video", timeout=30)
            codecs = (r.stdout or b"").decode().split()
        else:
            codecs = [_probe_with_ffmpeg(src)["codec"]]
        if data[4:8] == b"ftyp" and "h264" in codecs and not any(c in codecs for c in ("hevc", "vp9", "av1")):
            return data
        _run(["ffmpeg", "-y", "-i", src, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
              "-c:a", "aac", "-movflags", "+faststart", dst], "Converting the video")
        with open(dst, "rb") as f:
            return f.read()


# ── Generated Shorts ─────────────────────────────────────────────────────────
def _cover(img: Image.Image, w: int, h: int) -> Image.Image:
    return ImageOps.fit(img.convert("RGB"), (w, h), Image.LANCZOS, centering=(0.5, 0.4))


HEADLINE_TOP = 250     # below the Shorts player's own top controls


def _caption_layer(text: str, brand: dict, logo: bytes | None, heading: str = "", subheading: str = "") -> Image.Image:
    """Transparent 1080x1920 layer: the optional heading + subheading near the top, a big caption in the middle-lower
    third, and the brand bar in the safe zone."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if (heading or "").strip() or (subheading or "").strip():
        layer.alpha_composite(headline_layer(W, H, heading, subheading, top=HEADLINE_TOP))
    draw = ImageDraw.Draw(layer)
    if text.strip():
        f = font(70, "Bold")
        lines = textwrap.wrap(text.strip(), width=19)[:4]
        lh = int(f.size * 1.22)
        box_h = lh * len(lines) + 64
        top = int(H * 0.60) - box_h // 2
        shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shade).rounded_rectangle([50, top, W - 50, top + box_h], radius=36, fill=(10, 12, 28, 170))
        layer.alpha_composite(shade.filter(ImageFilter.GaussianBlur(0.5)))
        y = top + 32
        for ln in lines:
            tw = draw.textlength(ln, font=f)
            draw.text(((W - tw) / 2, y), ln, font=f, fill=(255, 255, 255, 255))
            y += lh
    layer.alpha_composite(brand_bar_layer(W, H, brand, logo, bar_height=BAR_HEIGHT, bottom_margin=BAR_LIFT))
    return layer


def _scene_prompts(visual: str, n: int) -> list[str]:
    beats = [
        "Opening wide establishing shot that immediately shows the business in action.",
        "Close-up detail shot of the service, product or craft, showing real quality.",
        "Shot of a happy real customer or the finished result.",
        "Final shot: a welcoming, professional scene that invites the viewer to get in touch.",
    ]
    return [f"{visual.strip()}\nThis is scene {i + 1} of {n} of a short video. {beats[min(i, len(beats) - 1)]}" for i in range(n)]


def _captions(title: str, keywords: list[str], n: int, has_heading: bool = False) -> list[str]:
    caps = [("" if has_heading else (title.strip() or (keywords[0] if keywords else "")))]
    for k in (keywords or [])[:max(n - 2, 0)]:
        caps.append(k.strip().title())
    while len(caps) < n - 1:
        caps.append("")
    caps = caps[:n - 1]
    caps.append("Get in touch today")
    return caps


MAX_PHOTO_SCENES = 5


def photo_scene_seconds(n: int) -> float:
    """Few photos stay on screen longer so the reel is not over in a blink: 1-2 photos 8 s each, 5 photos 5 s each."""
    return min(8.0, max(5.0, 16.0 / max(n, 1)))


def generate_short(user_id: str, company: str, industry: str, brand: dict, logo: bytes, title: str,
                   visual: str, keywords: list[str] | None = None, photos: list[bytes] | None = None,
                   heading: str = "", subheading: str = "") -> dict:
    """Returns {video(mp4 bytes), thumbnail(jpg bytes), duration}. Raises ShortError / OpenAIImageError.
    With `photos` (up to 5 of the customer's own) they become the scenes; without, the scenes are generated."""
    keywords = keywords or []
    has_heading = bool((heading or "").strip() or (subheading or "").strip())
    if photos:
        photos = photos[:MAX_PHOTO_SCENES]
        return compose_short(photos, brand, logo, _captions(title, keywords, len(photos), has_heading),
                             heading=heading, subheading=subheading, seconds=photo_scene_seconds(len(photos)), real_photos=True)
    n = max(2, min(SCENES, 4))
    prompts = [brand_svc.build_photo_prompt(company, industry, brand, sc, keywords, vertical=True)
               for sc in _scene_prompts(visual or title or company, n)]

    def one(p: str) -> bytes:
        return generate_image_from_prompt(p, width=1080, height=1920)

    with ThreadPoolExecutor(max_workers=n) as pool:
        photos = list(pool.map(one, prompts))
    return compose_short(photos, brand, logo, _captions(title, keywords, n, has_heading), heading=heading, subheading=subheading)


def _scene_from_photo(img: Image.Image, w: int, h: int) -> Image.Image:
    """A real photo as a vertical scene. Tall photos fill the frame; wide ones are shown whole over a soft blurred
    copy of themselves, so people and products are not cropped out."""
    img = img.convert("RGB")
    if img.width / img.height <= 0.72:
        return _cover(img, w, h)
    bg = ImageOps.fit(img, (w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(36))
    bg = Image.blend(bg, Image.new("RGB", (w, h), (12, 14, 30)), 0.35)
    fg = img.resize((w, max(1, round(img.height * w / img.width))), Image.LANCZOS)
    bg.paste(fg, (0, int((h - fg.height) * 0.42)))
    return bg


def compose_short(photos: list[bytes], brand: dict, logo: bytes | None, captions: list[str],
                  heading: str = "", subheading: str = "", seconds: float | None = None, real_photos: bool = False) -> dict:
    n = len(photos)
    d = seconds or SECONDS_PER_SCENE
    frames = int((d + XFADE) * FPS)
    total = n * d + XFADE
    with tempfile.TemporaryDirectory() as tmp:
        scene_paths, overlay_paths = [], []
        for i, raw in enumerate(photos):
            src = Image.open(io.BytesIO(raw))
            src = ImageOps.exif_transpose(src)
            sw, sh = int(W * 1.12), int(H * 1.12)                                         # headroom for the zoom
            base = _scene_from_photo(src, sw, sh) if real_photos else _cover(src, sw, sh)
            sp = os.path.join(tmp, f"s{i}.png")
            base.save(sp)
            scene_paths.append(sp)
            op = os.path.join(tmp, f"o{i}.png")
            _caption_layer(captions[i] if i < len(captions) else "", brand, logo, heading, subheading).save(op)
            overlay_paths.append(op)

        cmd = ["ffmpeg", "-y"]
        for sp in scene_paths:
            cmd += ["-i", sp]
        for op in overlay_paths:
            cmd += ["-i", op]
        cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"]
        fc = []
        for i in range(n):
            # Slow push-in, alternating the drift direction scene to scene.
            x = "iw/2-(iw/zoom/2)" if i % 2 == 0 else "(iw-iw/zoom)*on/%d" % frames
            fc.append(f"[{i}:v]zoompan=z='min(1+0.0009*on,1.2)':x='{x}':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS},setsar=1,format=yuv420p[v{i}]")
        last = "v0"
        for i in range(1, n):
            fc.append(f"[{last}][v{i}]xfade=transition=fade:duration={XFADE}:offset={i * d}[x{i}]")
            last = f"x{i}"
        for i in range(n):
            start = i * d - (XFADE if i else 0)
            end = (i + 1) * d + (0 if i == n - 1 else 0)
            if i == n - 1:
                end = total
            fc.append(f"[{last}][{n + i}:v]overlay=0:0:enable='between(t,{max(start, 0):.2f},{end:.2f})'[o{i}]")
            last = f"o{i}"
        out = os.path.join(tmp, "short.mp4")
        cmd += ["-filter_complex", ";".join(fc), "-map", f"[{last}]", "-map", f"{2 * n}:a",
                "-t", f"{total:.2f}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                "-r", str(FPS), "-c:a", "aac", "-shortest", "-movflags", "+faststart", out]
        _run(cmd, "Building the video")
        with open(out, "rb") as f:
            video = f.read()

        first = _cover(Image.open(io.BytesIO(photos[0])), W, H).convert("RGBA")
        first.alpha_composite(Image.open(overlay_paths[0]))
        buf = io.BytesIO()
        first.convert("RGB").resize((540, 960), Image.LANCZOS).save(buf, format="JPEG", quality=85)
    return {"video": video, "thumbnail": buf.getvalue(), "duration": round(total, 1)}
