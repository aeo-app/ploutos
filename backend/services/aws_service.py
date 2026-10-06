import base64
import hashlib
import hmac
import logging
import os
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv


load_dotenv()

AWS_REGION = os.getenv("BEDROCK_AWS_REGION", "us-east-1")

MOVERSLY_AWS_ACCESS_KEY_ID = os.getenv("MOVERSLY_AWS_ACCESS_KEY_ID")
MOVERSLY_AWS_SECRET_ACCESS_KEY = os.getenv("MOVERSLY_AWS_SECRET_ACCESS_KEY")

_session = None


def get_assumed_session():
    """Kept for backward compatibility with any caller still importing this
    name, but there's no cross-account assume_role hop anymore — this is a
    single AWS account for this service, so it just returns a plain boto3
    Session built from MOVERSLY_AWS_ACCESS_KEY_ID / MOVERSLY_AWS_SECRET_ACCESS_KEY,
    cached for the life of the process."""
    global _session

    if _session is None:
        _session = boto3.Session(
            aws_access_key_id=MOVERSLY_AWS_ACCESS_KEY_ID,
            aws_secret_access_key=MOVERSLY_AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION,
        )

    return _session