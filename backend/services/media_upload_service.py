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
import time
import uuid

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

BUCKET_NAME = os.getenv("MEDIA_UPLOAD_BUCKET", "aeo-app-media-uploads")
MEDIA_UPLOAD_REGION = os.getenv("MEDIA_UPLOAD_REGION", "ap-southeast-2")
EIGENAI_AWS_ACCESS_KEY_ID = os.getenv("EIGENAI_AWS_ACCESS_KEY_ID")
EIGENAI_AWS_SECRET_ACCESS_KEY = os.getenv("EIGENAI_AWS_SECRET_ACCESS_KEY")
ROLE_ARN = os.getenv("MEDIA_UPLOAD_ROLE_ARN")

_s3 = None
_s3_creds_expiry = 0


class MediaUploadError(Exception):
    pass


def _get_s3_client():
    """Mirrors db.dynamo._get_table()'s connection logic (local vs. STS
    cross-account role), including the actual expiry check that logic
    relies on — a cached client whose assumed-role credentials expire
    (commonly ~1 hour) and never refresh fails every subsequent call with
    "The provided token has expired", regardless of how long this process
    keeps running."""
    global _s3, _s3_creds_expiry
    needs_refresh = _s3 is None or (_s3_creds_expiry and time.time() > _s3_creds_expiry - 60)
    if needs_refresh:
        endpoint = os.getenv("S3_ENDPOINT_URL")  # for local dev against a fake S3 (e.g. moto/localstack)
        if endpoint:
            _s3 = boto3.client("s3", region_name=MEDIA_UPLOAD_REGION, endpoint_url=endpoint)
        else:
            sts = boto3.client(
                "sts", aws_access_key_id=EIGENAI_AWS_ACCESS_KEY_ID,
                aws_secret_access_key=EIGENAI_AWS_SECRET_ACCESS_KEY, region_name=MEDIA_UPLOAD_REGION,
            )
            resp = sts.assume_role(RoleArn=ROLE_ARN, RoleSessionName="media-upload-session")
            creds = resp["Credentials"]
            _s3_creds_expiry = creds["Expiration"].timestamp()
            _s3 = boto3.client(
                "s3", region_name=MEDIA_UPLOAD_REGION,
                aws_access_key_id=creds["AccessKeyId"], aws_secret_access_key=creds["SecretAccessKey"],
                aws_session_token=creds["SessionToken"],
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
        logger.error(f"[media_upload] S3 put_object failed: {e.response['Error']}")
        raise MediaUploadError(f"Could not upload image: {e.response['Error'].get('Message', e)}")

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
        logger.error(f"[media_upload] S3 delete_object failed: {e.response['Error']}")
        raise MediaUploadError(f"Could not delete image: {e.response['Error'].get('Message', e)}")
