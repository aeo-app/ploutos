"""
services/social_publish/youtube_service.py — posting to YouTube
================================================================================
YouTube has no official API for posting a plain image (Community Posts have
no public create endpoint at all — verified by searching specifically for
one; every result was a third-party SCRAPER for reading existing posts,
never an official way to create one). The only real, supported write path
is uploading an actual video via videos.insert. So a poster becomes a
YouTube Short here by wrapping the still image in a short, silent MP4 —
never by "posting the image directly", which YouTube doesn't support.

Two things this deliberately does NOT use, both confirmed against Google's
current docs before writing any of this:

  1. An API key. A key only ever authorizes read-only, public operations
     (search, public channel stats) — Google requires OAuth 2.0 with the
     youtube.upload scope for anything that writes to a specific channel,
     with no exception. The YOUTUBE_API_KEY some deployments may already
     have set (e.g. for other, read-only features) is irrelevant here.

  2. The Python googleapiclient library. Uploads go through the RAW HTTP
     resumable-upload protocol instead (verified against
     developers.google.com/youtube/v3/guides/using_resumable_upload_protocol),
     matching this codebase's existing plain-`requests` style for every
     other platform (meta_service.py, linkedin_service.py,
     google_business_service.py) rather than introducing a different
     dependency and calling convention for just this one.

  OAuth (standard Google OAuth2 — same token endpoints as Google Business
  Profile, different scope):
    Authorize: GET  https://accounts.google.com/o/oauth2/v2/auth
    Token:     POST https://oauth2.googleapis.com/token
    Scope:     https://www.googleapis.com/auth/youtube.upload

  Upload (resumable protocol, single-request body since these are short,
  small still-image videos — chunking is "rarely necessary" per Google's
  own guide and only helps on genuinely unstable connections):
    POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
      -> 200 OK with a Location header (the upload session URI)
    PUT  <that Location URI>, body = the raw MP4 bytes
      -> 201 Created with the video resource (id, snippet, status)

  Video generation (ffmpeg, confirmed present on this deployment):
    A poster is already 1080x1080 (square) — YouTube classifies square
    (1:1) videos as Shorts, not just vertical 9:16 (verified: "square or
    taller" qualifies), so the existing poster image is used AS-IS with
    no cropping, letterboxing, or reformatting at all. Wrapped into a
    ~12 second silent MP4 (H.264 video + a silent AAC track — a valid
    audio stream is included for broad player compatibility, even though
    there's nothing to hear, rather than shipping a video-only file that
    some clients handle inconsistently).
"""
from __future__ import annotations

import logging
import os
import subprocess
import tempfile

import requests

logger = logging.getLogger(__name__)

YOUTUBE_CLIENT_ID = os.getenv("YOUTUBE_CLIENT_ID", "")
YOUTUBE_CLIENT_SECRET = os.getenv("YOUTUBE_CLIENT_SECRET", "")
YOUTUBE_REDIRECT_URI = os.getenv("YOUTUBE_REDIRECT_URI", "http://localhost:8000/api/v1/social-publish/youtube/callback")

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"

SCOPES = "https://www.googleapis.com/auth/youtube.upload"

REQUEST_TIMEOUT = int(os.getenv("SOCIAL_PUBLISH_TIMEOUT_SECONDS", "20"))
UPLOAD_TIMEOUT = int(os.getenv("YOUTUBE_UPLOAD_TIMEOUT_SECONDS", "120"))  # a real video upload needs more than the standard 20s
SHORT_DURATION_SECONDS = int(os.getenv("YOUTUBE_SHORT_DURATION_SECONDS", "12"))


class YouTubeError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _require_config() -> None:
    if not YOUTUBE_CLIENT_ID or not YOUTUBE_CLIENT_SECRET:
        raise YouTubeError(
            "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are not configured. "
            "These are an OAuth 2.0 Client's credentials, NOT the API key from Google Cloud Console — "
            "an API key alone cannot authorize uploading to a channel. Create an OAuth Client ID "
            "(Web application type) in the same Cloud Console project, with the "
            "youtube.upload scope enabled on its consent screen."
        )


def build_authorize_url(state: str) -> str:
    _require_config()
    params = {
        "client_id": YOUTUBE_CLIENT_ID, "redirect_uri": YOUTUBE_REDIRECT_URI,
        "response_type": "code", "scope": SCOPES, "state": state,
        "access_type": "offline", "prompt": "consent",  # ensures a refresh_token comes back
    }
    query = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{AUTHORIZE_URL}?{query}"


def exchange_code_for_token(code: str) -> dict:
    _require_config()
    resp = requests.post(
        TOKEN_URL,
        data={
            "code": code, "client_id": YOUTUBE_CLIENT_ID, "client_secret": YOUTUBE_CLIENT_SECRET,
            "redirect_uri": YOUTUBE_REDIRECT_URI, "grant_type": "authorization_code",
        },
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise YouTubeError(f"YouTube token exchange failed: {resp.status_code} {resp.text}", resp.status_code)
    return resp.json()  # {"access_token", "refresh_token", "expires_in", ...}


def refresh_access_token(refresh_token: str) -> dict:
    _require_config()
    resp = requests.post(
        TOKEN_URL,
        data={
            "refresh_token": refresh_token, "client_id": YOUTUBE_CLIENT_ID,
            "client_secret": YOUTUBE_CLIENT_SECRET, "grant_type": "refresh_token",
        },
        timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise YouTubeError(f"YouTube token refresh failed: {resp.status_code} {resp.text}", resp.status_code)
    return resp.json()


def get_own_channel(access_token: str) -> dict:
    """Confirms the connection is valid and gets a human-readable label
    (the channel title) for the connected-accounts UI — mirrors what the
    Meta/LinkedIn/Google Business connect flows already show."""
    resp = requests.get(
        CHANNELS_URL, params={"part": "snippet", "mine": "true"},
        headers={"Authorization": f"Bearer {access_token}"}, timeout=REQUEST_TIMEOUT,
    )
    if not resp.ok:
        raise YouTubeError(f"Could not fetch the connected YouTube channel: {resp.status_code} {resp.text}", resp.status_code)
    items = resp.json().get("items", [])
    if not items:
        raise YouTubeError("This Google account has no YouTube channel to post to.")
    channel = items[0]
    return {"channel_id": channel["id"], "title": channel.get("snippet", {}).get("title", "")}


def generate_short_video_from_image(image_bytes: bytes, duration_seconds: int = SHORT_DURATION_SECONDS) -> bytes:
    """Wraps a still image into a short, silent MP4 via ffmpeg — this is
    the actual "poster becomes a Short" mechanism. The poster's existing
    1080x1080 square framing is kept exactly as-is (see module docstring:
    square qualifies as a Short, same as vertical) rather than
    cropping/padding into 9:16, so this never touches or reinterprets
    what the poster actually looks like.

    Raises YouTubeError (not a raw subprocess exception) on any ffmpeg
    failure, with ffmpeg's own stderr included, so a broken/corrupt
    source image produces a clear, catchable error rather than a bare
    CalledProcessError leaking a whole subprocess traceback to callers
    that don't know what ffmpeg is.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        image_path = os.path.join(tmp_dir, "poster.png")
        video_path = os.path.join(tmp_dir, "short.mp4")
        with open(image_path, "wb") as f:
            f.write(image_bytes)

        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", image_path,                          # still image, looped
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",  # silent audio track
            "-t", str(duration_seconds),
            "-vf", "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
            "-c:a", "aac", "-shortest",
            video_path,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=UPLOAD_TIMEOUT)
        except subprocess.CalledProcessError as e:
            stderr = e.stderr.decode("utf-8", errors="replace")[-1000:] if e.stderr else ""
            raise YouTubeError(f"Could not generate a video from this poster (ffmpeg failed): {stderr}")
        except subprocess.TimeoutExpired:
            raise YouTubeError("Video generation timed out.")
        except FileNotFoundError:
            raise YouTubeError("ffmpeg is not installed on this server — required to convert a poster image into a YouTube Short.")

        with open(video_path, "rb") as f:
            return f.read()


def upload_video(access_token: str, video_bytes: bytes, title: str, description: str, privacy_status: str = "public") -> str:
    """Uploads `video_bytes` (an MP4, e.g. from generate_short_video_from_image
    above) as a new video on the connected channel and returns its video ID.
    Implements the resumable protocol's two real HTTP calls directly (see
    module docstring) — a single-request body upload, not chunked, since
    these are short still-image videos, not large files needing the
    multi-request chunking path.
    """
    body = {
        "snippet": {"title": title[:100], "description": description[:5000], "categoryId": "22"},  # 22 = People & Blogs
        "status": {"privacyStatus": privacy_status, "selfDeclaredMadeForKids": False},
    }

    init_resp = requests.post(
        UPLOAD_URL,
        params={"uploadType": "resumable", "part": "snippet,status"},
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": str(len(video_bytes)),
            "X-Upload-Content-Type": "video/mp4",
        },
        json=body, timeout=REQUEST_TIMEOUT,
    )
    if not init_resp.ok:
        raise YouTubeError(f"Could not start the YouTube upload session: {init_resp.status_code} {init_resp.text}", init_resp.status_code)

    session_uri = init_resp.headers.get("Location")
    if not session_uri:
        raise YouTubeError("YouTube did not return an upload session URI — cannot continue.")

    upload_resp = requests.put(
        session_uri,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Length": str(len(video_bytes)),
            "Content-Type": "video/mp4",
        },
        data=video_bytes, timeout=UPLOAD_TIMEOUT,
    )
    if not upload_resp.ok:
        raise YouTubeError(f"YouTube video upload failed: {upload_resp.status_code} {upload_resp.text}", upload_resp.status_code)

    video_id = upload_resp.json().get("id")
    if not video_id:
        raise YouTubeError(f"Video uploaded but YouTube returned no video id: {upload_resp.json()}")
    return video_id
