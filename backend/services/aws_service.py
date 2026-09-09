import base64
import hashlib
import hmac
import logging
import os
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
import time


load_dotenv()

ROLE_ARN = os.getenv("ROLE_ARN")
AWS_REGION = os.getenv("BEDROCK_AWS_REGION", "us-east-1")

_creds = None
_expiry = 0


def get_assumed_session():
    global _creds, _expiry

    now = time.time()

    if _creds is None or now > (_expiry - 120):
        sts = boto3.client("sts")  # 👈 uses EC2 role

        response = sts.assume_role(
            RoleArn=ROLE_ARN,
            RoleSessionName="cross-account-session",
        )

        _creds = response["Credentials"]
        _expiry = _creds["Expiration"].timestamp()

    return boto3.Session(
        aws_access_key_id=_creds["AccessKeyId"],
        aws_secret_access_key=_creds["SecretAccessKey"],
        aws_session_token=_creds["SessionToken"],
        region_name=AWS_REGION,
    )