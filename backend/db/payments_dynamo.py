"""
db/payments_dynamo.py — Payment & entitlement data, in its own DynamoDB table
==================================================================================
Payment transaction records (Airwallex PaymentIntents) and entitlements
(is_paid / plan / paid_until per user) used to live in the same single table
as SEO analyses, sharing its GSI. This module splits them out into their own
table (APAC_PAYMENTS_TABLE) — payment/billing data and application/analysis
data are now fully separate, including their own connection and GSI.

Same "one table, SK prefix distinguishes item kind" design as db/dynamo.py,
just a separate table:
  - Entitlement (one per user):  PK = user_id, SK = "ENTITLEMENT"
  - Payment transaction (many):  PK = user_id, SK = f"PAYMENT#{ts}#{payment_intent_id}"

Needs its own GSI (gsi_payment_intent_id) for the webhook handler's "which
user does this payment_intent_id belong to" lookup — it can no longer
piggyback on the analyses table's gsi_analysis_id now that they're separate
tables, so this uses a plainly-named payment_intent_id GSI key instead of
the polymorphic analysis_id-reuse trick the old shared-table version needed.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from db.dynamo import _from_dynamo, _now_iso, _pk, _to_dynamo

load_dotenv()

logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────
TABLE_NAME = os.getenv("APAC_PAYMENTS_TABLE", "apac_payments")
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")
GSI_NAME = "gsi_payment_intent_id"

EIGENAI_AWS_ACCESS_KEY_ID = os.getenv("EIGENAI_AWS_ACCESS_KEY_ID")
EIGENAI_AWS_SECRET_ACCESS_KEY = os.getenv("EIGENAI_AWS_SECRET_ACCESS_KEY")
ROLE_ARN = os.getenv("ROLE_ARN")  # optional, for cross-account access

# ── Singleton DynamoDB resource — intentionally a SEPARATE connection from
# db.dynamo's, not shared. Mirrors its connection logic (local endpoint vs.
# STS cross-account role) exactly, so the payments table could in principle
# live in a different AWS account/region later without touching the
# analyses table's connection at all. ───────────────────────────────────────
_dynamodb = None
_table = None


def _get_payments_table():
    global _dynamodb, _table

    if _table is None:
        kwargs = dict(region_name=AWS_REGION)

        endpoint = os.getenv("DYNAMODB_ENDPOINT_URL")
        if endpoint:
            kwargs["endpoint_url"] = endpoint
            _dynamodb = boto3.resource("dynamodb", **kwargs)
        else:
            sts = boto3.client(
                "sts",
                aws_access_key_id=EIGENAI_AWS_ACCESS_KEY_ID,
                aws_secret_access_key=EIGENAI_AWS_SECRET_ACCESS_KEY,
                region_name=AWS_REGION,
            )
            response = sts.assume_role(RoleArn=ROLE_ARN, RoleSessionName="dynamodb-payments-session")
            creds = response["Credentials"]
            _dynamodb = boto3.resource(
                "dynamodb",
                region_name=AWS_REGION,
                aws_access_key_id=creds["AccessKeyId"],
                aws_secret_access_key=creds["SecretAccessKey"],
                aws_session_token=creds["SessionToken"],
            )

        _table = _dynamodb.Table(TABLE_NAME)

    return _table


def _entitlement_sk() -> str:
    return "ENTITLEMENT"


def _payment_sk(ts: str, payment_intent_id: str) -> str:
    return f"PAYMENT#{ts}#{payment_intent_id}"


# ── Payment transactions ─────────────────────────────────────────────────────
def save_payment_intent(
    *,
    user_id: str,
    payment_intent_id: str,
    amount: str,
    currency: str,
    status: str,
    description: str = "",
    plan_id: Optional[str] = None,
) -> None:
    """Create (or overwrite, on retry) the transaction record for one
    Airwallex PaymentIntent."""
    table = _get_payments_table()
    now_iso = _now_iso()
    ts_compact = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    item = {
        "PK": _pk(user_id),
        "SK": _payment_sk(ts_compact, payment_intent_id),
        "payment_intent_id": payment_intent_id,  # GSI hash key on this table
        "user_id": user_id,
        "plan_id": plan_id,
        "amount": amount,
        "currency": currency,
        "status": status,
        "description": description,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[payments_dynamo] saved payment_intent={payment_intent_id} user={user_id} plan={plan_id} status={status}")
    except ClientError as e:
        logger.error(f"[payments_dynamo] save_payment_intent failed: {e.response['Error']}")
        raise


def get_payment_intent(payment_intent_id: str) -> Optional[dict]:
    """Look up a payment transaction record by Airwallex payment_intent_id
    via this table's own GSI — used by the webhook handler (which only
    knows the Airwallex ID, not which user_id/SK it belongs to) and by
    status polling."""
    table = _get_payments_table()
    try:
        resp = table.query(
            IndexName=GSI_NAME,
            KeyConditionExpression=Key("payment_intent_id").eq(payment_intent_id),
        )
        items = resp.get("Items", [])
        return _from_dynamo(items[0]) if items else None
    except ClientError as e:
        logger.error(f"[payments_dynamo] get_payment_intent failed: {e.response['Error']}")
        raise


def update_payment_intent_status(payment_intent_id: str, status: str) -> Optional[dict]:
    """Update a payment transaction's status in place. Returns the updated
    item (so the caller can read user_id off it), or None if not found."""
    item = get_payment_intent(payment_intent_id)
    if not item:
        return None
    table = _get_payments_table()
    try:
        table.update_item(
            Key={"PK": item["PK"], "SK": item["SK"]},
            UpdateExpression="SET #s = :s, updated_at = :u",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": status, ":u": _now_iso()},
        )
        item["status"] = status
        return item
    except ClientError as e:
        logger.error(f"[payments_dynamo] update_payment_intent_status failed: {e.response['Error']}")
        raise


def list_user_payments(user_id: str, limit: int = 20) -> list[dict]:
    """Payment transaction history for a user, newest first."""
    table = _get_payments_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(_pk(user_id)) & Key("SK").begins_with("PAYMENT#"),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [_from_dynamo(i) for i in resp.get("Items", [])]
    except ClientError as e:
        logger.error(f"[payments_dynamo] list_user_payments failed: {e.response['Error']}")
        raise


# ── Entitlement ──────────────────────────────────────────────────────────────
def set_user_paid(
    *,
    user_id: str,
    is_paid: bool,
    paid_until: Optional[str] = None,
    plan: str = "one_time",
) -> None:
    """Upsert the user's entitlement record. `paid_until=None` means access
    never expires (a true one-time-forever unlock); set it to an ISO
    timestamp for subscription-style, renewable access."""
    table = _get_payments_table()
    item = {
        "PK": _pk(user_id),
        "SK": _entitlement_sk(),
        "user_id": user_id,
        "is_paid": is_paid,
        "paid_until": paid_until,
        "plan": plan,
        "updated_at": _now_iso(),
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[payments_dynamo] entitlement updated user={user_id} is_paid={is_paid} paid_until={paid_until}")
    except ClientError as e:
        logger.error(f"[payments_dynamo] set_user_paid failed: {e.response['Error']}")
        raise


def get_user_entitlement(user_id: str) -> dict:
    """Fetch the user's entitlement record. Returns a default 'not paid'
    shape (never raises) if the user has never paid."""
    table = _get_payments_table()
    default = {"user_id": user_id, "is_paid": False, "paid_until": None, "plan": None, "updated_at": None}
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _entitlement_sk()})
        item = resp.get("Item")
        return _from_dynamo(item) if item else default
    except ClientError as e:
        logger.error(f"[payments_dynamo] get_user_entitlement failed: {e.response['Error']}")
        raise


def is_user_paid(user_id: str) -> bool:
    """True if the user has active paid access right now (handles
    subscription expiry — paid_until in the past means access lapsed).

    Admins always pass this check, regardless of entitlement — they need
    full, unlocked access to review/edit every user's content (see
    routers/admin_router.py), not the free-preview experience regular
    unpaid users get. Checked first, before touching the entitlement table
    at all."""
    from db.dynamo import is_admin
    if is_admin(user_id):
        return True

    ent = get_user_entitlement(user_id)
    if not ent.get("is_paid"):
        return False
    paid_until = ent.get("paid_until")
    if paid_until is None:
        return True  # one-time-forever unlock, no expiry
    try:
        return datetime.fromisoformat(paid_until.replace("Z", "+00:00")) > datetime.now(timezone.utc)
    except (ValueError, AttributeError):
        # Malformed timestamp — fail closed (treat as not paid) rather than
        # silently granting access on bad data.
        logger.warning(f"[payments_dynamo] unparseable paid_until={paid_until!r} for user={user_id}; denying access")
        return False


# ── Table bootstrap (for local dev / CI) ─────────────────────────────────────
def create_payments_table_if_not_exists() -> None:
    """Creates the payments table (with its GSI) if it doesn't already
    exist. Mirrors db.dynamo.create_table_if_not_exists — called
    separately at startup since this is now a distinct table."""
    table = _get_payments_table()
    try:
        table.load()
        logger.info(f"[payments_dynamo] Table '{TABLE_NAME}' already exists")
        return
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise

    _dynamodb.create_table(
        TableName=TABLE_NAME,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
            {"AttributeName": "payment_intent_id", "AttributeType": "S"},
        ],
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        GlobalSecondaryIndexes=[{
            "IndexName": GSI_NAME,
            "KeySchema": [{"AttributeName": "payment_intent_id", "KeyType": "HASH"}],
            "Projection": {"ProjectionType": "ALL"},
        }],
    )
    _get_payments_table().wait_until_exists()
    logger.info(f"[payments_dynamo] Table '{TABLE_NAME}' created with GSI '{GSI_NAME}'")
