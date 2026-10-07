"""
services/media_upload_service.py — S3-backed uploads for user-provided images
================================================================================
Facebook and Instagram's posting APIs take an image by URL (`url` /
`image_url`), not raw bytes — Canva posters already have a public URL for
free (Canva hosts the export), but a poster a user uploads directly from
their own device doesn't have one until we host it somewhere. This bucket
is that "somewhere".

Objects are public-read (this is publishing content the user is about to
post publicly anyway, so there's no confidentiality requirement — the same
image is about to be visible on Facebook/Instagram regardless).
"""
from __future__ import annotations

import logging
import mimetypes
import os
import uuid

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

BUCKET_NAME = os.getenv("MEDIA_UPLOAD_BUCKET", "aeo-app-media-uploads")
MEDIA_UPLOAD_REGION = os.getenv("MEDIA_UPLOAD_REGION", "ap-southeast-2")
MOVERSLY_AWS_ACCESS_KEY_ID = os.getenv("MOVERSLY_AWS_ACCESS_KEY_ID")
MOVERSLY_AWS_SECRET_ACCESS_KEY = os.getenv("MOVERSLY_AWS_SECRET_ACCESS_KEY")

_s3 = None


class MediaUploadError(Exception):
    pass


# Error codes S3 returns when the problem is the BUCKET's own account, not
# this request — a suspended/closed AWS account, a bucket that's been
# disabled, or ownership moved elsewhere. These never clear on retry (valid
# credentials for a perfectly healthy AWS account still get this if the
# bucket itself lives in a disabled one), so they're worth telling apart
# from an ordinary transient failure or a bad request.
_BUCKET_LEVEL_ERROR_CODES = {"AllAccessDisabled", "NoSuchBucket", "InvalidAccessKeyId"}


def _raise_clean_upload_error(action: str, e: ClientError) -> None:
    """Logs the full AWS error (for whoever reads the server logs) and
    raises a MediaUploadError with a short, non-technical message safe to
    show a user — never the raw boto3/AWS text, which leaks internal
    infrastructure details (bucket names, account state, S3 error codes)
    into a product UI and reads as a cryptic, unactionable error to anyone
    who isn't an AWS admin."""
    error = e.response.get("Error", {})
    code = error.get("Code", "")
    logger.error(
        f"[media_upload] S3 {action} failed: {error} "
        f"(bucket={BUCKET_NAME!r} region={MEDIA_UPLOAD_REGION!r})"
    )
    if code in _BUCKET_LEVEL_ERROR_CODES:
        # Almost always means MEDIA_UPLOAD_BUCKET points at a bucket whose
        # owning AWS account is no longer reachable — e.g. after rotating
        # which AWS account this app's services use (see
        # MOVERSLY_AWS_ACCESS_KEY_ID above), a bucket created under the
        # OLD account doesn't move with the credentials; it has to be
        # recreated (or its contents copied) under the new one and
        # MEDIA_UPLOAD_BUCKET/MEDIA_UPLOAD_REGION updated to match.
        logger.critical(
            f"[media_upload] '{code}' is an account/bucket-level failure, not a transient "
            "one — retrying will not help. Check that MEDIA_UPLOAD_BUCKET "
            f"({BUCKET_NAME!r} in {MEDIA_UPLOAD_REGION!r}) still exists and is owned by "
            "the AWS account MOVERSLY_AWS_ACCESS_KEY_ID authenticates as."
        )
        raise MediaUploadError(
            "Image storage is temporarily unavailable. Please try again shortly — "
            "if this keeps happening, contact support."
        )
    raise MediaUploadError(error.get("Message") or str(e))


def _get_s3_client():
    """Mirrors db.dynamo._get_table()'s connection logic (local vs. single
    AWS account). Single account for this service now — no more STS
    assume_role cross-account hop, so there are no temporary credentials to
    expire and refresh; the client is built once and cached for the life of
    the process."""
    global _s3
    if _s3 is None:
        endpoint = os.getenv("S3_ENDPOINT_URL")  # for local dev against a fake S3 (e.g. moto/localstack)
        if endpoint:
            _s3 = boto3.client("s3", region_name=MEDIA_UPLOAD_REGION, endpoint_url=endpoint)
        else:
            _s3 = boto3.client(
                "s3", region_name=MEDIA_UPLOAD_REGION,
                aws_access_key_id=MOVERSLY_AWS_ACCESS_KEY_ID,
                aws_secret_access_key=MOVERSLY_AWS_SECRET_ACCESS_KEY,
            )
    return _s3


def upload_image(image_bytes: bytes, filename: str, user_id: str) -> str:
    """Uploads an image and returns its public URL. Keyed under the user's
    id so files are trivially attributable/cleanable per account."""
    ext = os.path.splitext(filename)[1] or ".jpg"
    content_type = mimetypes.guess_type(filename)[0] or "image/jpeg"
    key = f"uploads/{user_id}/{uuid.uuid4()}{ext}"

    client = _get_s3_client()
    try:
        client.put_object(
            Bucket=BUCKET_NAME, Key=key, Body=image_bytes,
            ContentType=content_type, ACL="public-read",
        )
    except ClientError as e:
        _raise_clean_upload_error("put_object", e)

    return f"https://{BUCKET_NAME}.s3.{MEDIA_UPLOAD_REGION}.amazonaws.com/{key}"


def _key_from_url(image_url: str) -> str | None:
    """Extracts the S3 key from a URL this service generated — returns
    None for anything that doesn't match (a Canva-hosted URL, someone
    else's bucket, a malformed value), so callers can reject deletion of
    anything this service doesn't actually own."""
    prefix = f"https://{BUCKET_NAME}.s3.{MEDIA_UPLOAD_REGION}.amazonaws.com/"
    if not image_url.startswith(prefix):
        return None
    return image_url[len(prefix):]


def delete_image(image_url: str, user_id: str) -> None:
    """Deletes an uploaded image — but ONLY one this user actually owns
    (checked via the key's uploads/{user_id}/ prefix, not just trusting
    whatever URL the caller provides) and only one this service actually
    hosts (a Canva-hosted poster URL, or anything not matching this
    bucket, is silently a no-op — there's nothing here to delete, and the
    caller has no business asking this service to touch someone else's
    storage). Callers are responsible for the SEPARATE check of whether
    the image is still referenced by a successfully published post — see
    routers/social_publish_router.py's delete_upload endpoint."""
    key = _key_from_url(image_url)
    if not key:
        return  # not one of ours — nothing to do
    if not key.startswith(f"uploads/{user_id}/"):
        raise MediaUploadError("This image does not belong to your account.")

    client = _get_s3_client()
    try:
        client.delete_object(Bucket=BUCKET_NAME, Key=key)
        logger.info(f"[media_upload] deleted {key} for user={user_id}")
    except ClientError as e:
        _raise_clean_upload_error("delete_object", e)
