"""
db/dynamo.py — DynamoDB persistence layer
==========================================

Single-table design
-------------------
Table name : APAC_SEO_TABLE (env var, default: apac_seo_analyses)
Region     : AWS_REGION (env var, default: ap-southeast-1)

Item layout
-----------
PK  : USER#<user_id>               — partition by user
SK  : ANALYSIS#<type>#<ts>#<id>    — sort by type then time

e.g.
  PK = USER#usr_abc
  SK = ANALYSIS#competitors#20250716T143022#f3a2c1d0

GSI (gsi_analysis_id)
  PK  = analysis_id                — direct lookup by ID
  SK  = user_id                    — who owns it

TTL field (optional): expires_at (Unix epoch int)
  Set ANALYSIS_TTL_DAYS env var to auto-expire old records.
  Leave unset (or 0) for no expiry.

Attributes stored per item
--------------------------
  user_id          str
  analysis_id      str   (UUID4)
  analysis_type    str   one of: competitors | keywords | profile | domain_authority |
                          full_report | content_strategy
  company_name     str
  url              str
  market           str
  industry         str
  created_at       str   ISO-8601 UTC
  created_at_ts    int   Unix epoch (for TTL / sorting)
  result           str   JSON-serialised analysis result
  request          str   JSON-serialised AnalyseRequest
  status           str   success | error
  error_message    str?  only when status=error
  expires_at       int?  Unix epoch (if TTL configured)
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from time import time

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
TABLE_NAME = os.getenv("APAC_SEO_TABLE", "apac_seo_analyses")

AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")

TTL_DAYS = int(os.getenv("ANALYSIS_TTL_DAYS", "0"))
   # 0 = no expiry
GSI_NAME = "gsi_analysis_id"

EIGENAI_AWS_ACCESS_KEY_ID = os.getenv("EIGENAI_AWS_ACCESS_KEY_ID")
EIGENAI_AWS_SECRET_ACCESS_KEY = os.getenv("EIGENAI_AWS_SECRET_ACCESS_KEY")
EIGENAI_AWS_SESSION_TOKEN = os.getenv("EIGENAI_AWS_SESSION_TOKEN")
ROLE_ARN = os.getenv("ROLE_ARN")  # optional, for cross-account access

# ── Singleton DynamoDB resource ────────────────────────────────────────────────
_dynamodb = None

_table = None

_creds_expiry = 0


def _get_table():
    global _dynamodb, _table, _creds_expiry

    if _table is None:

        kwargs = dict(region_name=AWS_REGION)

        # ✅ 1. Local DynamoDB support (NO STS)
        endpoint = os.getenv("DYNAMODB_ENDPOINT_URL")
        if endpoint:
            kwargs["endpoint_url"] = endpoint
            # logger.info('[dynamo] Using local endpoint: {}', endpoint)

            _dynamodb = boto3.resource("dynamodb", **kwargs)

        else:
            # ✅ 2. Cross-account access via STS
            sts = boto3.client(
                "sts",
                aws_access_key_id=EIGENAI_AWS_ACCESS_KEY_ID,
                aws_secret_access_key=EIGENAI_AWS_SECRET_ACCESS_KEY,
                region_name=AWS_REGION,
            )

            response = sts.assume_role(RoleArn=ROLE_ARN, RoleSessionName="dynamodb-session")

            creds = response["Credentials"]
            _creds_expiry = creds["Expiration"].timestamp()

            _dynamodb = boto3.resource(
                "dynamodb",
                region_name=AWS_REGION,
                aws_access_key_id=creds["AccessKeyId"],
                aws_secret_access_key=creds["SecretAccessKey"],
                aws_session_token=creds["SessionToken"],
            )

            # logger.info("[dynamo] Using cross-account role")

        _table = _dynamodb.Table(TABLE_NAME)

        # logger.info("[dynamo] Connected to table '{}' in {}", TABLE_NAME, AWS_REGION)

    return _table

# ── Key helpers ────────────────────────────────────────────────────────────────

def _pk(user_id: str) -> str:
    return f"{user_id}"


def _sk(analysis_type: str, ts: str, analysis_id: str) -> str:
    return f"{analysis_type}#{ts}#{analysis_id}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


# ── Float → Decimal (DynamoDB cannot store Python float) ──────────────────────
def _to_dynamo(obj: Any) -> Any:
    """Recursively convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _to_dynamo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_dynamo(i) for i in obj]
    return obj


def _from_dynamo(obj: Any) -> Any:
    """Recursively convert Decimal back to int/float."""
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    if isinstance(obj, dict):
        return {k: _from_dynamo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_dynamo(i) for i in obj]
    return obj


# ── Public API ─────────────────────────────────────────────────────────────────

def save_analysis(
    *,
    user_id: str,
    analysis_type: str,
    company_name: str,
    url: str,
    market: str,
    industry: str,
    result: dict,
    request_data: dict,
    status: str = "success",
    error_message: Optional[str] = None,
) -> str:
    """
    Persist one analysis result to DynamoDB.

    Returns the generated analysis_id (UUID4).
    Raises DynamoDBError on failure (caller decides whether to propagate).
    """
    table = _get_table()

    analysis_id = str(uuid.uuid4())
    now_iso = _now_iso()
    now_ts = _now_ts()
    # Compact timestamp for SK (sortable, URL-safe)
    ts_compact = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")

    item: dict[str, Any] = {
        # Keys
        "PK": _pk(user_id),
        "SK": _sk(analysis_type, ts_compact, analysis_id),
        # GSI keys
        "analysis_id": analysis_id,
        "user_id": user_id,
        # Metadata
        "analysis_type": analysis_type,
        "company_name": company_name,
        "url": url,
        "market": market,
        "industry": industry,
        "created_at": now_iso,
        "created_at_ts": now_ts,
        "status": status,
        # Payload (stored as JSON string to avoid Decimal issues with deep nesting)
        "result": json.dumps(result, default=str),
        "request": json.dumps(request_data, default=str),
    }

    if error_message:
        item["error_message"] = error_message

    if TTL_DAYS > 0:
        item["expires_at"] = int(
            (datetime.now(timezone.utc) + timedelta(days=TTL_DAYS)).timestamp()
        )

    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(
            '[dynamo] saved analysis_id={} type={} user={}', analysis_id, analysis_type, user_id
        )
        return analysis_id
    except ClientError as e:
        logger.error('[dynamo] put_item failed: {}', e.response['Error'])
        raise


def get_analysis(user_id: str, analysis_id: str) -> Optional[dict]:
    """
    Fetch a single analysis by user_id + analysis_id using the GSI.
    Returns the deserialised item dict, or None if not found.
    """
    table = _get_table()
    try:
        resp = table.query(
            IndexName=GSI_NAME,
            KeyConditionExpression=Key("analysis_id").eq(analysis_id),
        )
        items = resp.get("Items", [])
        if not items:
            return None
        item = _from_dynamo(items[0])
        # Verify ownership
        if item.get("user_id") != user_id:
            return None
        # Deserialise JSON payload fields
        for key in ("result", "request"):
            if key in item and isinstance(item[key], str):
                try:
                    item[key] = json.loads(item[key])
                except json.JSONDecodeError:
                    pass
        return item
    except ClientError as e:
        logger.error('[dynamo] get_analysis failed: {}', e.response['Error'])
        raise


def list_analyses(
    user_id: str,
    *,
    analysis_type: Optional[str] = None,
    limit: int = 20,
    last_evaluated_key: Optional[dict] = None,
) -> dict:
    """
    List analyses for a user, newest first, with optional type filter.
    Supports pagination via last_evaluated_key.

    Returns:
        {
          "items": [...],
          "count": int,
          "last_evaluated_key": dict | None   # pass back to get next page
        }
    """
    table = _get_table()
    kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("PK").eq(_pk(user_id)),
        "ScanIndexForward": False,  # newest first
        "Limit": limit,
        "ProjectionExpression": (
            "analysis_id, analysis_type, company_name, #u, market, "
            "industry, created_at, created_at_ts, #s"
        ),
        "ExpressionAttributeNames": {
            "#u": "url",
            "#s": "status",
    },}

    if analysis_type:
        kwargs["KeyConditionExpression"] = Key("PK").eq(_pk(user_id)) & Key("SK").begins_with(
            f"ANALYSIS#{analysis_type}#"
        )

    if last_evaluated_key:
        kwargs["ExclusiveStartKey"] = last_evaluated_key

    try:
        resp = table.query(**kwargs)
        items = [_from_dynamo(i) for i in resp.get("Items", [])]
        return {
            "items": items,
            "count": resp.get("Count", len(items)),
            "last_evaluated_key": resp.get("LastEvaluatedKey"),
        }
    except ClientError as e:
        logger.error('[dynamo] list_analyses failed: {}', e.response['Error'])
        raise


def delete_analysis(user_id: str, analysis_id: str) -> bool:
    """
    Delete a specific analysis. Verifies ownership first.
    Returns True if deleted, False if not found.
    """
    item = get_analysis(user_id, analysis_id)
    if not item:
        return False

    table = _get_table()
    try:
        table.delete_item(
            Key={
                "PK": item["PK"],
                "SK": item["SK"],
        })
        logger.info('[dynamo] deleted analysis_id={} user={}', analysis_id, user_id)
        return True
    except ClientError as e:
        logger.error('[dynamo] delete_item failed: {}', e.response['Error'])
        raise


def get_user_stats(user_id: str) -> dict:
    """
    Count analyses by type for a user (lightweight summary).
    """
    table = _get_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(_pk(user_id)),
            ProjectionExpression="analysis_type, #s",
            ExpressionAttributeNames={"#s": "status"},
        )
        items = resp.get("Items", [])
        counts: dict[str, int] = {}
        for item in items:
            t = item.get("analysis_type", "unknown")
            counts[t] = counts.get(t, 0) + 1
        return {
            "user_id": user_id,
            "total": len(items),
            "by_type": counts,
        }
    except ClientError as e:
        logger.error('[dynamo] get_user_stats failed: {}', e.response['Error'])
        raise


# ── Table bootstrap (for local dev / CI) ──────────────────────────────────────

def create_table_if_not_exists() -> None:
    """
    Create the DynamoDB table + GSI if they don't exist.
    Safe to call on startup when DYNAMODB_ENDPOINT_URL is set (local dev).
    In production use Terraform / CDK / CloudFormation instead.
    """
    if not os.getenv("DYNAMODB_ENDPOINT_URL"):
        logger.warning("[dynamo] create_table_if_not_exists() skipped — not in local mode")
        return

    client = boto3.client(
        "dynamodb",
        region_name=AWS_REGION,
        endpoint_url=os.getenv("DYNAMODB_ENDPOINT_URL"),
    )
    existing = client.list_tables().get("TableNames", [])
    if TABLE_NAME in existing:
        logger.info("[dynamo] Table '{}' already exists", TABLE_NAME)
        return

    client.create_table(
        TableName=TABLE_NAME,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
            {"AttributeName": "analysis_id", "AttributeType": "S"},
            {"AttributeName": "user_id", "AttributeType": "S"},
        ],
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        GlobalSecondaryIndexes=[{
            "IndexName": GSI_NAME,
            "KeySchema": [
                {"AttributeName": "analysis_id", "KeyType": "HASH"},
                {"AttributeName": "user_id", "KeyType": "RANGE"},
            ],
            "Projection": {"ProjectionType": "ALL"},
    }],)

    # Enable TTL if configured
    if TTL_DAYS > 0:
        client.update_time_to_live(
            TableName=TABLE_NAME,
            TimeToLiveSpecification={
                "Enabled": True,
                "AttributeName": "expires_at",
        },)
        logger.info("[dynamo] TTL enabled on 'expires_at' ({} days)", TTL_DAYS)

    logger.info("[dynamo] Table '{}' created with GSI '{}'", TABLE_NAME, GSI_NAME)