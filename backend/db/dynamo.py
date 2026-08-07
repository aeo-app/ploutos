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
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from time import time

import boto3
from boto3.dynamodb.conditions import Attr, Key
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
    # Timestamp FIRST so an unfiltered query (PK only) sorts truly
    # chronologically across every analysis_type via native SK ordering —
    # previously this was "{analysis_type}#{ts}#{analysis_id}", which meant
    # an unfiltered list grouped everything by type name first and only
    # sorted by date *within* each type group, not globally. Type-filtering
    # now happens via a FilterExpression on the analysis_type attribute
    # instead of an SK prefix — see list_analyses.
    return f"{ts}#{analysis_type}#{analysis_id}"


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
    token_usage: Optional[dict] = None,
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
        # Bedrock token usage for this flow — see services.bedrock_service.TokenUsageTracker.
        # Stored inline (not JSON-encoded) since it's a small, flat dict —
        # this is what makes "measure token usage per flow" queryable later
        # (e.g. a stats scan summing input_tokens/output_tokens by analysis_type).
        "token_usage": token_usage or {
            "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "bedrock_call_count": 0,
        },
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
            f"[dynamo] saved analysis_id={analysis_id} type={analysis_type} user={user_id}"
        )
        return analysis_id
    except ClientError as e:
        logger.error(f"[dynamo] put_item failed: {e.response['Error']}")
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
        # This GSI is shared with payment transaction records (see the
        # module note above save_payment_intent) — a payment_intent_id could
        # theoretically be passed in here and match. Payment records have no
        # `analysis_type`, so reject anything that isn't a real analysis.
        if "analysis_type" not in item:
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
        logger.error(f"[dynamo] get_analysis failed: {e.response['Error']}")
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
            "industry, created_at, created_at_ts, #s, token_usage"
        ),
        "ExpressionAttributeNames": {
            "#u": "url",
            "#s": "status",
    },}

    # Always exclude payment/entitlement records — they share the same PK
    # (user_id) as analyses but have no `analysis_type` attribute at all.
    # Without this, an unfiltered ("All types") list would sweep them in.
    kwargs["FilterExpression"] = (
        Attr("analysis_type").eq(analysis_type) if analysis_type else Attr("analysis_type").exists()
    )

    if last_evaluated_key:
        kwargs["ExclusiveStartKey"] = last_evaluated_key

    try:
        if not analysis_type:
            # No filter beyond "is a real analysis" — DynamoDB's Limit caps
            # items scanned, which is also exactly how many can be returned
            # here (nothing is being filtered OUT except non-analysis
            # records, which are rare/absent in normal use), so a single
            # query call is correct and sufficient.
            resp = table.query(**kwargs)
            items = [_from_dynamo(i) for i in resp.get("Items", [])]
            return {
                "items": items,
                "count": resp.get("Count", len(items)),
                "last_evaluated_key": resp.get("LastEvaluatedKey"),
            }

        # With a specific analysis_type filter, DynamoDB's Limit caps how
        # many items are SCANNED before the FilterExpression is applied —
        # NOT how many MATCHING items are returned. A single query with
        # Limit=1 only finds a match if the single newest item overall
        # happens to already be that type; anything else silently returns
        # zero items, even if a matching one exists further back. Paginate
        # internally (bounded, so this can't run away) until `limit`
        # matching items are collected or we run out of data.
        MAX_PAGES = 10
        SCAN_PAGE_SIZE = 100  # items examined per underlying query, not returned count
        matched: list[dict] = []
        exclusive_start_key = kwargs.get("ExclusiveStartKey")
        final_last_evaluated_key = None

        for _ in range(MAX_PAGES):
            page_kwargs = dict(kwargs)
            page_kwargs["Limit"] = SCAN_PAGE_SIZE
            if exclusive_start_key:
                page_kwargs["ExclusiveStartKey"] = exclusive_start_key
            elif "ExclusiveStartKey" in page_kwargs:
                del page_kwargs["ExclusiveStartKey"]

            resp = table.query(**page_kwargs)
            matched.extend(_from_dynamo(i) for i in resp.get("Items", []))
            exclusive_start_key = resp.get("LastEvaluatedKey")
            final_last_evaluated_key = exclusive_start_key

            if len(matched) >= limit or not exclusive_start_key:
                break

        return {
            "items": matched[:limit],
            "count": len(matched[:limit]),
            # Only expose a "next page" cursor if we actually have more than
            # `limit` matched items still pending or DynamoDB has more pages —
            # keeps pagination behaviour sane for callers.
            "last_evaluated_key": final_last_evaluated_key if len(matched) > limit or exclusive_start_key else None,
        }
    except ClientError as e:
        logger.error(f"[dynamo] list_analyses failed: {e.response['Error']}")
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
        logger.info(f"[dynamo] deleted analysis_id={analysis_id} user={user_id}")
        return True
    except ClientError as e:
        logger.error(f"[dynamo] delete_item failed: {e.response['Error']}")
        raise


def get_user_stats(user_id: str) -> dict:
    """
    Count analyses by type for a user, plus Bedrock token usage aggregated
    per flow (per analysis_type) — see services.bedrock_service.TokenUsageTracker
    for where token_usage is measured, and save_analysis for where it's stored.

    Filtered to actual analysis records only: payment transactions and the
    entitlement record share the same PK (user_id) as analyses but have no
    `analysis_type` attribute — a plain PK-only query would otherwise sweep
    them in and miscount them as an "unknown" analysis type.
    """
    table = _get_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(_pk(user_id)),
            FilterExpression=Attr("analysis_type").exists(),
            ProjectionExpression="analysis_type, #s, token_usage",
            ExpressionAttributeNames={"#s": "status"},
        )
        items = resp.get("Items", [])
        counts: dict[str, int] = {}
        tokens_by_type: dict[str, dict] = {}
        totals = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "bedrock_call_count": 0}

        for item in items:
            t = item.get("analysis_type", "unknown")
            counts[t] = counts.get(t, 0) + 1

            usage = item.get("token_usage") or {}
            bucket = tokens_by_type.setdefault(
                t, {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "bedrock_call_count": 0}
            )
            for key in totals:
                v = int(usage.get(key, 0) or 0)
                bucket[key] += v
                totals[key] += v

        return {
            "user_id": user_id,
            "total": len(items),
            "by_type": counts,
            "token_usage_by_type": tokens_by_type,
            "token_usage_total": totals,
        }
    except ClientError as e:
        logger.error(f"[dynamo] get_user_stats failed: {e.response['Error']}")
        raise


# ── Payments / entitlements ─────────────────────────────────────────────────
# Same single-table design as analyses above (PK=user_id), with two new
# "kinds" of item distinguished by their SK prefix:
#   - Entitlement (one per user):  SK = "ENTITLEMENT"
#   - Payment transaction (many):  SK = f"PAYMENT#{ts}#{payment_intent_id}"
# The GSI (gsi_analysis_id) is reused for payment lookups too — a payment
# transaction item's `analysis_id` attribute is set to the Airwallex
# payment_intent_id, letting the webhook handler look up "which user does
# this payment_intent_id belong to" the same way get_analysis() does, with
# no new index/infra needed. This is a standard single-table-design pattern
# (polymorphic items sharing one GSI keyed by a generically-named attribute),
# not a semantic overload — just don't confuse a payment_intent_id with a
# real analysis_id when reading `analysis_id` back off a payment item.

def _entitlement_sk() -> str:
    return "ENTITLEMENT"


def _payment_sk(ts: str, payment_intent_id: str) -> str:
    return f"PAYMENT#{ts}#{payment_intent_id}"


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
    table = _get_table()
    now_iso = _now_iso()
    ts_compact = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    item = {
        "PK": _pk(user_id),
        "SK": _payment_sk(ts_compact, payment_intent_id),
        "analysis_id": payment_intent_id,   # GSI hash key — see module note above
        "user_id": user_id,
        "payment_intent_id": payment_intent_id,
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
        logger.info(f"[dynamo] saved payment_intent={payment_intent_id} user={user_id} plan={plan_id} status={status}")
    except ClientError as e:
        logger.error(f"[dynamo] save_payment_intent failed: {e.response['Error']}")
        raise


def get_payment_intent(payment_intent_id: str) -> Optional[dict]:
    """Look up a payment transaction record by Airwallex payment_intent_id
    via the shared GSI — used by the webhook handler (which only knows the
    Airwallex ID, not which user_id/SK it belongs to) and by status polling."""
    table = _get_table()
    try:
        resp = table.query(
            IndexName=GSI_NAME,
            KeyConditionExpression=Key("analysis_id").eq(payment_intent_id),
        )
        items = resp.get("Items", [])
        return _from_dynamo(items[0]) if items else None
    except ClientError as e:
        logger.error(f"[dynamo] get_payment_intent failed: {e.response['Error']}")
        raise


def update_payment_intent_status(payment_intent_id: str, status: str) -> Optional[dict]:
    """Update a payment transaction's status in place. Returns the updated
    item (so the caller can read user_id off it), or None if not found."""
    item = get_payment_intent(payment_intent_id)
    if not item:
        return None
    table = _get_table()
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
        logger.error(f"[dynamo] update_payment_intent_status failed: {e.response['Error']}")
        raise


def list_user_payments(user_id: str, limit: int = 20) -> list[dict]:
    """Payment transaction history for a user, newest first."""
    table = _get_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(_pk(user_id)) & Key("SK").begins_with("PAYMENT#"),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [_from_dynamo(i) for i in resp.get("Items", [])]
    except ClientError as e:
        logger.error(f"[dynamo] list_user_payments failed: {e.response['Error']}")
        raise


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
    table = _get_table()
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
        logger.info(f"[dynamo] entitlement updated user={user_id} is_paid={is_paid} paid_until={paid_until}")
    except ClientError as e:
        logger.error(f"[dynamo] set_user_paid failed: {e.response['Error']}")
        raise


def get_user_entitlement(user_id: str) -> dict:
    """Fetch the user's entitlement record. Returns a default 'not paid'
    shape (never raises) if the user has never paid."""
    table = _get_table()
    default = {"user_id": user_id, "is_paid": False, "paid_until": None, "plan": None, "updated_at": None}
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _entitlement_sk()})
        item = resp.get("Item")
        return _from_dynamo(item) if item else default
    except ClientError as e:
        logger.error(f"[dynamo] get_user_entitlement failed: {e.response['Error']}")
        raise


def is_user_paid(user_id: str) -> bool:
    """True if the user has active paid access right now (handles
    subscription expiry — paid_until in the past means access lapsed)."""
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
        logger.warning(f"[dynamo] unparseable paid_until={paid_until!r} for user={user_id}; denying access")
        return False


# ── One-to-one user <-> domain lock ─────────────────────────────────────────
# Same single-table design again: SK = "DOMAIN_LOCK" (one per user). The
# FIRST domain a user successfully analyzes becomes permanently theirs —
# every analysis endpoint (competitors/keywords/profile/domain-authority/
# full-report/content-strategy/relocation-calendar) calls
# check_and_lock_domain() before doing any real work.

def _domain_lock_sk() -> str:
    return "DOMAIN_LOCK"


def normalize_domain(url: str) -> str:
    """
    Reduce a URL down to a bare, comparable domain: strip scheme, leading
    'www.', path/query/fragment, port, and lowercase everything. So
    "https://WWW.Example.com/foo?x=1" and "example.com:8080" both normalize
    to "example.com" for comparison purposes.
    """
    if not url:
        return ""
    u = url.strip().lower()
    u = re.sub(r"^[a-z]+://", "", u)       # strip scheme (http://, https://, ftp://...)
    u = re.sub(r"^www\.", "", u)           # strip leading www.
    u = u.split("/")[0]                     # drop path/query/fragment
    u = u.split("?")[0].split("#")[0]       # belt-and-suspenders if no leading slash
    u = u.split(":")[0]                     # drop port
    return u.rstrip(".")


def get_user_domain_lock(user_id: str) -> Optional[dict]:
    """Returns {"domain": ..., "company_name": ..., "locked_at": ...} or None
    if this user hasn't locked in a domain yet."""
    table = _get_table()
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _domain_lock_sk()})
        item = resp.get("Item")
        return _from_dynamo(item) if item else None
    except ClientError as e:
        logger.error(f"[dynamo] get_user_domain_lock failed: {e.response['Error']}")
        raise


def _set_user_domain_lock(user_id: str, domain: str, company_name: str) -> None:
    table = _get_table()
    item = {
        "PK": _pk(user_id),
        "SK": _domain_lock_sk(),
        "user_id": user_id,
        "domain": domain,
        "company_name": company_name,
        "locked_at": _now_iso(),
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[dynamo] domain locked for user={user_id}: {domain}")
    except ClientError as e:
        logger.error(f"[dynamo] _set_user_domain_lock failed: {e.response['Error']}")
        raise


class DomainMismatchError(Exception):
    """Raised when a user tries to analyze a different domain than the one
    already locked to their account. Routers turn this into a 403."""
    def __init__(self, locked_domain: str, attempted_domain: str):
        self.locked_domain = locked_domain
        self.attempted_domain = attempted_domain
        super().__init__(
            f"This account is linked to '{locked_domain}'. Each account can only "
            f"analyze one domain — '{attempted_domain}' doesn't match."
        )


def check_and_lock_domain(user_id: str, url: str, company_name: str) -> None:
    """
    Enforces a strict one-to-one user<->domain mapping:
      - No URL given (e.g. an optional website field left blank) -> no-op,
        nothing to check or lock.
      - First time this user analyzes ANY domain -> that domain is locked
        to their account permanently.
      - Same domain as already locked -> fine, proceeds silently.
      - Different domain than already locked -> raises DomainMismatchError.
    """
    domain = normalize_domain(url)
    if not domain:
        return
    existing = get_user_domain_lock(user_id)
    if existing is None:
        _set_user_domain_lock(user_id, domain, company_name)
        return
    if existing["domain"] != domain:
        raise DomainMismatchError(existing["domain"], domain)


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
        logger.info(f"[dynamo] Table '{TABLE_NAME}' already exists")
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
        logger.info(f"[dynamo] TTL enabled on 'expires_at' ({TTL_DAYS} days)")

    logger.info(f"[dynamo] Table '{TABLE_NAME}' created with GSI '{GSI_NAME}'")