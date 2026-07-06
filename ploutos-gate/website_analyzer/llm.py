import os
import time

import boto3
from dotenv import load_dotenv
from langchain_aws import ChatBedrock

load_dotenv()

_bedrock_client = None
_bedrock_client_expires_at = 0.0
_EXPIRY_BUFFER = 300  # refresh 5 minutes early


def _get_bedrock_client():
    global _bedrock_client, _bedrock_client_expires_at
    if _bedrock_client is not None and time.time() < _bedrock_client_expires_at:
        return _bedrock_client

    region = os.getenv("AWS_REGION", "us-east-1")
    role_arn = os.getenv("BEDROCK_ASSUME_ROLE_ARN")

    if role_arn:
        sts = boto3.client("sts", region_name=region)
        resp = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName="ploutos-bedrock",
            DurationSeconds=3600,
        )
        creds = resp["Credentials"]
        _bedrock_client = boto3.client(
            "bedrock-runtime",
            region_name=region,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
        )
        _bedrock_client_expires_at = creds["Expiration"].timestamp() - _EXPIRY_BUFFER
    else:
        _bedrock_client = boto3.client("bedrock-runtime", region_name=region)
        _bedrock_client_expires_at = float("inf")

    return _bedrock_client


def build_llm():
    model_id = os.getenv("BEDROCK_MODEL", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
    region = os.getenv("AWS_REGION", "us-east-1")
    client = _get_bedrock_client()
    return ChatBedrock(
        model_id=model_id,
        client=client,
        region_name=region,
        temperature=0,
        max_tokens=None,
    )
