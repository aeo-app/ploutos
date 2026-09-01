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
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")
EIGENAI_AWS_ACCESS_KEY_ID = os.getenv("EIGENAI_AWS_ACCESS_KEY_ID")
EIGENAI_AWS_SECRET_ACCESS_KEY = os.getenv("EIGENAI_AWS_SECRET_ACCESS_KEY")
ROLE_ARN = os.getenv("MEDIA_UPLOAD_ROLE_ARN")

_s3 = None


class MediaUploadError(Exception):
    pass


def _get_s3_client():
    """Mirrors db.dynamo._get_table()'s connection logic (local vs. STS
    cross-account role) — same pattern used throughout this app."""
    global _s3
    if _s3 is None:
        endpoint = os.getenv("S3_ENDPOINT_URL")  # for local dev against a fake S3 (e.g. moto/localstack)
        if endpoint:
            _s3 = boto3.client("s3", region_name=AWS_REGION, endpoint_url=endpoint)
        else:
            sts = boto3.client(
                "sts", aws_access_key_id=EIGENAI_AWS_ACCESS_KEY_ID,
                aws_secret_access_key=EIGENAI_AWS_SECRET_ACCESS_KEY, region_name=AWS_REGION,
            )
            resp = sts.assume_role(RoleArn=ROLE_ARN, RoleSessionName="media-upload-session")
            creds = resp["Credentials"]
            _s3 = boto3.client(
                "s3", region_name=AWS_REGION,
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

    return f"https://{BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{key}"
