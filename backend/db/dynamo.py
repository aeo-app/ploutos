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
import time
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from time import sleep, time

import boto3
from boto3.dynamodb.conditions import Attr, Key
from boto3.dynamodb.types import TypeDeserializer
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

MOVERSLY_AWS_ACCESS_KEY_ID = os.getenv("MOVERSLY_AWS_ACCESS_KEY_ID")
MOVERSLY_AWS_SECRET_ACCESS_KEY = os.getenv("MOVERSLY_AWS_SECRET_ACCESS_KEY")

# ── Singleton DynamoDB resource ────────────────────────────────────────────────
_dynamodb = None

_table = None


def _get_table():
    global _dynamodb, _table

    # Single AWS account for this service now — no more STS assume_role
    # cross-account hop, so there are no temporary credentials to expire
    # and refresh. Build the client once and cache it for the life of the
    # process, same as any other singleton client below.
    if _table is None:

        kwargs = dict(region_name=AWS_REGION)

        # ✅ 1. Local DynamoDB support
        endpoint = os.getenv("DYNAMODB_ENDPOINT_URL")
        if endpoint:
            kwargs["endpoint_url"] = endpoint
            # logger.info('[dynamo] Using local endpoint: {}', endpoint)

            _dynamodb = boto3.resource("dynamodb", **kwargs)

        else:
            # ✅ 2. Single AWS account, direct long-lived credentials
            _dynamodb = boto3.resource(
                "dynamodb",
                region_name=AWS_REGION,
                aws_access_key_id=MOVERSLY_AWS_ACCESS_KEY_ID,
                aws_secret_access_key=MOVERSLY_AWS_SECRET_ACCESS_KEY,
            )

            # logger.info("[dynamo] Using MOVERSLY AWS account")

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


# DynamoDB's low-level wire format for one attribute is a single-key dict
# naming its type, e.g. {"S": "hello"}, {"N": "3"}, {"M": {...}}. The
# resource API used everywhere in this module (table.get_item, etc.)
# deserializes this automatically — but a handful of rows in this table
# were written directly with the low-level client or typed into the AWS
# console's raw item editor before that was true (e.g. some social
# connections' `extra` map), so their nested values are still stuck in this
# wire format one or more levels deep instead of plain Python values. A
# dict with exactly one key matching a real DynamoDB type code is as close
# to unambiguous as this gets — legitimate application data essentially
# never takes this exact shape, so it's safe to treat it as an encoded
# AttributeValue rather than a real field.
_DYNAMO_TYPE_CODES = {"S", "N", "B", "BOOL", "NULL", "M", "L", "SS", "NS", "BS"}
_type_deserializer = TypeDeserializer()


def _is_raw_attribute_value(obj: Any) -> bool:
    return isinstance(obj, dict) and len(obj) == 1 and next(iter(obj)) in _DYNAMO_TYPE_CODES


def _from_dynamo(obj: Any) -> Any:
    """Recursively convert Decimal back to int/float, and defensively repair
    any value still in DynamoDB's raw wire format (see
    _is_raw_attribute_value above) instead of a plain Python value. Without
    this, a field like a social connection's extra.label comes back as
    {"S": "Acme Inc"} instead of "Acme Inc" — which then fails Pydantic
    validation outright ("Input should be a valid string") instead of
    returning the real value, taking down any endpoint that reads it."""
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    if _is_raw_attribute_value(obj):
        try:
            return _from_dynamo(_type_deserializer.deserialize(obj))
        except (TypeError, ValueError):
            pass  # not actually a raw AttributeValue after all — fall through and treat as a normal dict
    if isinstance(obj, dict):
        return {k: _from_dynamo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_from_dynamo(i) for i in obj]
    return obj


def _deserialize_json_field(value: Any, _max_attempts: int = 3) -> Any:
    """Parses a `result`/`request` field stored as a JSON string back into
    a dict/list. Handles two failure modes seen in migrated rows, on top of
    the normal case:

    1. Double-encoded JSON (`json.dumps()` called twice somewhere) — one
       `json.loads()` just returns another JSON string instead of the dict,
       so this loops (bounded) until it stops being a string.
    2. A field that went through a CSV export/import step as part of the
       AWS-account migration and came back with its CSV-quoting intact
       instead of stripped: the whole value is wrapped in an extra pair of
       literal `"` characters, and every embedded `"` was doubled to `""`
       per CSV's own escaping rule — e.g. `"{""company_name"": ""Acme""}"`.
       That's not valid JSON as-is (a bare `json.loads` raises), but
       stripping the outer quotes and collapsing `""` back to `"` recovers
       the original JSON text.

    Falls back to returning whatever it has (possibly still the original
    raw string) rather than raising, so one unparseable row's payload
    doesn't take down the request — same spirit as the plain `_from_dynamo`
    wire-format repair above, just for the JSON-text fields instead of the
    DynamoDB-typed ones."""
    for _ in range(_max_attempts):
        if not isinstance(value, str):
            return value
        text = value.strip()
        candidate = text
        if len(text) >= 2 and text[0] == '"' and text[-1] == '"' and '""' in text:
            candidate = text[1:-1].replace('""', '"')
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            return value  # not valid JSON (or not this mangled-CSV shape either) — give up as-is
    return value


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


def get_analysis(user_id: str, analysis_id: str, *, retries: int = 0) -> Optional[dict]:
    """
    Fetch a single analysis by user_id + analysis_id using the GSI.
    Returns the deserialised item dict, or None if not found.

    `retries`: GSIs in DynamoDB only support EVENTUALLY consistent reads —
    there is no ConsistentRead=True option for a GSI query, unlike the base
    table. That means a caller that just put_item'd a brand-new analysis and
    immediately turns around to query it back by analysis_id via this GSI
    can race the index's own propagation and get zero items back, even
    though the item is already durably in the table. Pass retries>0 (short
    backoff, a few hundred ms total) ONLY at call sites doing exactly that
    read-after-write; leave it at 0 (the default) for an ordinary "does this
    id exist" lookup, where a real miss should return None immediately
    rather than add latency to every genuine 404.
    """
    table = _get_table()
    try:
        attempt = 0
        while True:
            resp = table.query(
                IndexName=GSI_NAME,
                KeyConditionExpression=Key("analysis_id").eq(analysis_id),
            )
            items = resp.get("Items", [])
            if items or attempt >= retries:
                break
            sleep(0.3 * (attempt + 1))  # 0.3s, 0.6s, 0.9s, ...
            attempt += 1
        if not items:
            return None
        item = _from_dynamo(items[0])
        # Verify ownership
        if item.get("user_id") != user_id:
            return None
        # This GSI is shared with poster records (see the module note above
        # save_poster) — a poster_id could theoretically be passed in here
        # and match. Payment records used to share this GSI too, before
        # they moved to their own table (db/payments_dynamo.py). Poster
        # records have no `analysis_type`, so reject anything that isn't a
        # real analysis.
        if "analysis_type" not in item:
            return None
        # Deserialise JSON payload fields
        for key in ("result", "request"):
            if key in item and isinstance(item[key], str):
                item[key] = _deserialize_json_field(item[key])
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
        # Unlike list_analyses/get_analysis, this used the raw query response
        # directly — skipping _from_dynamo meant a token_usage value still
        # stuck in DynamoDB's raw wire format (e.g. {"N": "123"} instead of
        # 123, from a migrated row written outside the resource API) reached
        # int() below as a dict, not a number, raising a raw, cryptic
        # TypeError instead of just counting as 0. _from_dynamo repairs that.
        items = [_from_dynamo(i) for i in resp.get("Items", [])]
        counts: dict[str, int] = {}
        tokens_by_type: dict[str, dict] = {}
        totals = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "bedrock_call_count": 0}

        for item in items:
            t = item.get("analysis_type", "unknown")
            counts[t] = counts.get(t, 0) + 1

            usage = item.get("token_usage") or {}
            if not isinstance(usage, dict):
                usage = {}  # legacy/malformed row — count this item, but with zero token usage
            bucket = tokens_by_type.setdefault(
                t, {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "bedrock_call_count": 0}
            )
            for key in totals:
                try:
                    v = int(usage.get(key, 0) or 0)
                except (TypeError, ValueError):
                    v = 0  # still unparseable even after _from_dynamo — don't let one bad row 500 the whole stats endpoint
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


# ── Canva integration (connection + saved posters) ──────────────────────────
# Same single-table design again:
#   - Canva OAuth connection (one per user): SK = "CANVA_CONNECTION"
#   - PKCE state (short-lived, one per in-flight OAuth attempt):
#     SK = f"CANVA_PKCE#{state}" — a TTL'd item so an abandoned OAuth
#     attempt doesn't leave orphaned data around forever.
#   - Poster records (many per user): SK = f"POSTER#{ts}#{poster_id}"

def _canva_connection_sk() -> str:
    return "CANVA_CONNECTION"


def _canva_pkce_sk(state: str) -> str:
    return f"CANVA_PKCE#{state}"


def _poster_sk(poster_id: str) -> str:
    return f"POSTER#{poster_id}"


def save_canva_pkce(user_id: str, state: str, code_verifier: str) -> None:
    """Short-lived — the code_verifier must survive the round-trip to Canva's
    authorize page and back to /callback, but isn't needed after that."""
    table = _get_table()
    item = {
        "PK": _pk(user_id),
        "SK": _canva_pkce_sk(state),
        "user_id": user_id,
        "state": state,
        "code_verifier": code_verifier,
        "created_at": _now_iso(),
        "expires_at": int((datetime.now(timezone.utc) + timedelta(minutes=10)).timestamp()),
    }
    try:
        table.put_item(Item=_to_dynamo(item))
    except ClientError as e:
        logger.error(f"[dynamo] save_canva_pkce failed: {e.response['Error']}")
        raise


def get_canva_pkce(user_id: str, state: str) -> Optional[dict]:
    table = _get_table()
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _canva_pkce_sk(state)})
        item = resp.get("Item")
        return _from_dynamo(item) if item else None
    except ClientError as e:
        logger.error(f"[dynamo] get_canva_pkce failed: {e.response['Error']}")
        raise


def save_canva_connection(
    *, user_id: str, access_token: str, refresh_token: str, expires_at: str, canva_user_id: str = "",
) -> None:
    table = _get_table()
    item = {
        "PK": _pk(user_id),
        "SK": _canva_connection_sk(),
        "user_id": user_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "canva_user_id": canva_user_id,
        "connected_at": _now_iso(),
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[dynamo] Canva connected for user={user_id}")
    except ClientError as e:
        logger.error(f"[dynamo] save_canva_connection failed: {e.response['Error']}")
        raise


def get_canva_connection(user_id: str) -> Optional[dict]:
    table = _get_table()
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _canva_connection_sk()})
        item = resp.get("Item")
        return _from_dynamo(item) if item else None
    except ClientError as e:
        logger.error(f"[dynamo] get_canva_connection failed: {e.response['Error']}")
        raise


def delete_canva_connection(user_id: str) -> None:
    table = _get_table()
    try:
        table.delete_item(Key={"PK": _pk(user_id), "SK": _canva_connection_sk()})
        logger.info(f"[dynamo] Canva disconnected for user={user_id}")
    except ClientError as e:
        logger.error(f"[dynamo] delete_canva_connection failed: {e.response['Error']}")
        raise


# ── Social publishing connections (Facebook, Instagram, LinkedIn, Google
# Business) — one generic set of functions instead of per-platform copies,
# since the shape is identical: an access/refresh token plus whatever
# "target" identifiers that platform needs to actually post (a Facebook
# Page ID, an Instagram Business Account ID, a LinkedIn organization URN,
# a Google Business account/location name). `extra` carries those
# platform-specific fields — see services/social_publish/*.py for what
# each platform stores there. ───────────────────────────────────────────────
VALID_SOCIAL_PLATFORMS = {"facebook", "instagram", "linkedin", "google_business", "youtube"}


def _social_connection_sk(platform: str) -> str:
    if platform not in VALID_SOCIAL_PLATFORMS:
        raise ValueError(f"Unknown social platform: {platform!r}")
    return f"SOCIAL_CONNECTION#{platform}"


def save_social_connection(
    *, user_id: str, platform: str, access_token: str, refresh_token: str = "",
    expires_at: str = "", extra: Optional[dict] = None,
) -> None:
    table = _get_table()
    item = {
        "PK": _pk(user_id),
        "SK": _social_connection_sk(platform),
        "user_id": user_id,
        "platform": platform,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "extra": extra or {},
        "connected_at": _now_iso(),
        # Explicitly reset on every (re)connect — this uses put_item (a full
        # overwrite), so a successful reconnect naturally clears whatever
        # needs_reconnect state existed before, without a separate update call.
        "needs_reconnect": False,
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[dynamo] {platform} connected for user={user_id}")
    except ClientError as e:
        logger.error(f"[dynamo] save_social_connection failed: {e.response['Error']}")
        raise


def get_social_connection(user_id: str, platform: str) -> Optional[dict]:
    table = _get_table()
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _social_connection_sk(platform)})
        item = resp.get("Item")
        return _from_dynamo(item) if item else None
    except ClientError as e:
        logger.error(f"[dynamo] get_social_connection failed: {e.response['Error']}")
        raise


def mark_connection_needs_reconnect(user_id: str, platform: str) -> None:
    """Flags an existing connection as needing reconnection — called when a
    publish/schedule attempt fails with an auth error specifically (expired,
    revoked, or invalid token), not any other kind of failure (rate limits,
    content policy violations, network errors). A partial update, not an
    overwrite — the stored token stays as-is (harmless, since it's already
    unusable) rather than being deleted, so get_social_connection still
    returns a record the frontend can show as "needs reconnect" rather than
    "never connected"."""
    table = _get_table()
    try:
        table.update_item(
            Key={"PK": _pk(user_id), "SK": _social_connection_sk(platform)},
            UpdateExpression="SET needs_reconnect = :true",
            ExpressionAttributeValues={":true": True},
        )
        logger.warning(f"[dynamo] {platform} connection for user={user_id} flagged as needs_reconnect")
    except ClientError as e:
        # Not fatal — the publish failure itself is already being reported
        # to the caller regardless; this is a best-effort status flag.
        logger.error(f"[dynamo] mark_connection_needs_reconnect failed: {e.response['Error']}")


def list_social_connections(user_id: str) -> list[dict]:
    """All connected platforms for this user (used for the status endpoint —
    one call instead of four)."""
    table = _get_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(_pk(user_id)) & Key("SK").begins_with("SOCIAL_CONNECTION#"),
        )
        return [_from_dynamo(i) for i in resp.get("Items", [])]
    except ClientError as e:
        logger.error(f"[dynamo] list_social_connections failed: {e.response['Error']}")
        raise


def delete_social_connection(user_id: str, platform: str) -> None:
    table = _get_table()
    try:
        table.delete_item(Key={"PK": _pk(user_id), "SK": _social_connection_sk(platform)})
        logger.info(f"[dynamo] {platform} disconnected for user={user_id}")
    except ClientError as e:
        logger.error(f"[dynamo] delete_social_connection failed: {e.response['Error']}")
        raise


# ── Scheduled social posts ──────────────────────────────────────────────────
# Facebook has native API scheduling (published=false + scheduled_publish_
# time — Meta does the waiting), but Instagram's Content Publishing API has
# NO scheduling parameter at all — "Instagram schedulers" all work by
# holding the post themselves and calling publish at the right moment. To
# keep one consistent code path for both platforms (and make it trivial to
# add LinkedIn/Google Business scheduling later), this app runs its own
# scheduler for both — see main.py's APScheduler job, which polls this
# queue and calls services/social_publish/scheduler.py's execution logic.
#
# Deliberately a GLOBAL partition (PK is fixed, not per-user) rather than
# per-user like everything else in this file — the background worker's core
# operation is "find every post whose time has come, across every user",
# which needs to be one cheap query, not one Scan or N per-user queries.
SCHEDULED_QUEUE_PK = "SCHEDULED_QUEUE"


def _scheduled_post_sk(scheduled_time_iso: str, schedule_id: str) -> str:
    return f"{scheduled_time_iso}#{schedule_id}"


def save_scheduled_post(
    *, schedule_id: str, user_id: str, day_date: str, platforms: list[str],
    caption: str, image_url: str, cta_url: str = "", scheduled_time_iso: str,
    status: str = "pending", results: Optional[list] = None, post_number: Optional[int] = None,
) -> None:
    table = _get_table()
    item = {
        "PK": SCHEDULED_QUEUE_PK,
        "SK": _scheduled_post_sk(scheduled_time_iso, schedule_id),
        "analysis_id": schedule_id,  # GSI hash key — same shared-GSI pattern as get_poster/get_analysis
        "schedule_id": schedule_id,
        "user_id": user_id,
        "day_date": day_date,
        "post_number": post_number,
        "platforms": platforms,
        "caption": caption,
        "image_url": image_url,
        "cta_url": cta_url,
        "scheduled_time": scheduled_time_iso,
        "status": status,  # pending | posted | partial | failed | cancelled
        "results": results or [],
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[dynamo] scheduled post {schedule_id} for user={user_id} at {scheduled_time_iso}")
    except ClientError as e:
        logger.error(f"[dynamo] save_scheduled_post failed: {e.response['Error']}")
        raise


def get_scheduled_post(schedule_id: str) -> Optional[dict]:
    """Looked up via the shared GSI (same pattern as get_analysis/get_poster)
    — callers only know the schedule_id, not its SK."""
    table = _get_table()
    try:
        resp = table.query(IndexName=GSI_NAME, KeyConditionExpression=Key("analysis_id").eq(schedule_id))
        items = resp.get("Items", [])
        return _from_dynamo(items[0]) if items else None
    except ClientError as e:
        logger.error(f"[dynamo] get_scheduled_post failed: {e.response['Error']}")
        raise


def _all_scheduled_posts(limit: int = 500) -> list[dict]:
    table = _get_table()
    try:
        resp = table.query(KeyConditionExpression=Key("PK").eq(SCHEDULED_QUEUE_PK), Limit=limit)
        return [_from_dynamo(i) for i in resp.get("Items", [])]
    except ClientError as e:
        logger.error(f"[dynamo] _all_scheduled_posts failed: {e.response['Error']}")
        raise


def list_due_scheduled_posts(now_iso: str) -> list[dict]:
    """Every still-pending post whose scheduled_time has passed — this is
    what the background worker polls. SK is time-prefixed so this is a
    genuine range query, not a full-partition scan-and-filter."""
    table = _get_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(SCHEDULED_QUEUE_PK) & Key("SK").lte(now_iso + "~"),
        )
        items = [_from_dynamo(i) for i in resp.get("Items", [])]
        return [i for i in items if i.get("status") == "pending"]
    except ClientError as e:
        logger.error(f"[dynamo] list_due_scheduled_posts failed: {e.response['Error']}")
        raise


def list_scheduled_posts_for_user(user_id: str) -> list[dict]:
    """All of one user's scheduled posts (any status), newest-scheduled
    first — for the "my scheduled posts" view. Filters the global queue in
    Python rather than a separate per-user index; fine at the volume a
    single social-posting queue actually reaches."""
    items = [i for i in _all_scheduled_posts() if i.get("user_id") == user_id]
    items.sort(key=lambda i: i.get("scheduled_time", ""), reverse=True)
    return items


def update_scheduled_post_status(schedule_id: str, status: str, results: Optional[list] = None) -> None:
    post = get_scheduled_post(schedule_id)
    if not post:
        return
    table = _get_table()
    try:
        table.update_item(
            Key={"PK": SCHEDULED_QUEUE_PK, "SK": post["SK"]},
            UpdateExpression="SET #s = :s, updated_at = :u, results = :r",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": status, ":u": _now_iso(), ":r": results or []},
        )
    except ClientError as e:
        logger.error(f"[dynamo] update_scheduled_post_status failed: {e.response['Error']}")
        raise


def cancel_scheduled_post(schedule_id: str, user_id: str) -> bool:
    """Returns False if not found, not owned by this user, or already past
    'pending' (already posted/failed/cancelled)."""
    post = get_scheduled_post(schedule_id)
    if not post or post.get("user_id") != user_id or post.get("status") != "pending":
        return False
    update_scheduled_post_status(schedule_id, "cancelled")
    return True


# ── Page connection invitations ─────────────────────────────────────────────
# The person approving a connection (a page/profile admin) may have no
# account on this platform at all — they just click a link, authorize with
# Facebook/LinkedIn/Google directly, and pick a page. So this can't be
# keyed under the requester's user_id the way everything else in this file
# is; it needs its own globally-addressable-by-token storage, same
# architectural reason as the scheduled-posts queue above.
INVITE_PK = "PAGE_INVITE"
INVITE_TTL_DAYS = 7


def save_page_invite(
    *, invite_token: str, platform: str, requested_by_user_id: str, requested_by_label: str,
    status: str = "pending", available_pages: Optional[list] = None,
    oauth_access_token: str = "", oauth_refresh_token: str = "",
    selected_page: Optional[dict] = None, return_to_app: bool = False,
) -> None:
    table = _get_table()
    now = _now_iso()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)).isoformat().replace("+00:00", "Z")
    item = {
        "PK": INVITE_PK,
        "SK": invite_token,
        "analysis_id": invite_token,  # shared GSI hash key, same pattern as scheduled posts/posters
        "invite_token": invite_token,
        "platform": platform,
        "requested_by_user_id": requested_by_user_id,
        "requested_by_label": requested_by_label,
        "status": status,  # pending | pages_ready | approved | expired | cancelled
        "available_pages": available_pages or [],
        "oauth_access_token": oauth_access_token,
        "oauth_refresh_token": oauth_refresh_token,
        "selected_page": selected_page or {},
        "return_to_app": return_to_app,
        "created_at": now,
        "expires_at": expires_at,
        "approved_at": None,
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[dynamo] page invite {invite_token} created for platform={platform} by user={requested_by_user_id}")
    except ClientError as e:
        logger.error(f"[dynamo] save_page_invite failed: {e.response['Error']}")
        raise


def get_page_invite(invite_token: str) -> Optional[dict]:
    table = _get_table()
    try:
        resp = table.get_item(Key={"PK": INVITE_PK, "SK": invite_token})
        item = resp.get("Item")
        if not item:
            return None
        invite = _from_dynamo(item)
        # Lazily expire — cheaper than a scheduled sweep for something with
        # no functional cost to checking at read time.
        if invite.get("status") == "pending" and invite.get("expires_at"):
            try:
                if datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
                    invite["status"] = "expired"
                    update_page_invite(invite_token, status="expired")
            except (ValueError, AttributeError):
                pass
        return invite
    except ClientError as e:
        logger.error(f"[dynamo] get_page_invite failed: {e.response['Error']}")
        raise


def list_page_invites_for_user(user_id: str, limit: int = 100) -> list[dict]:
    """All invites a given account has SENT (not received — the receiver
    doesn't need an account). Scans the global invite partition and filters
    in Python, same trade-off as list_scheduled_posts_for_user — fine at
    the volume a single team's invite history actually reaches."""
    table = _get_table()
    try:
        resp = table.query(KeyConditionExpression=Key("PK").eq(INVITE_PK), Limit=limit)
        items = [_from_dynamo(i) for i in resp.get("Items", [])]
        items = [i for i in items if i.get("requested_by_user_id") == user_id]
        items.sort(key=lambda i: i.get("created_at", ""), reverse=True)
        return items
    except ClientError as e:
        logger.error(f"[dynamo] list_page_invites_for_user failed: {e.response['Error']}")
        raise


def update_page_invite(invite_token: str, **fields) -> None:
    """Generic partial update — status transitions, storing the OAuth
    token once the admin authorizes, storing available_pages once fetched,
    recording the final selected_page once approved."""
    table = _get_table()
    if not fields:
        return
    set_parts, values, names = [], {}, {}
    for i, (k, v) in enumerate(fields.items()):
        set_parts.append(f"#f{i} = :v{i}")
        names[f"#f{i}"] = k
        values[f":v{i}"] = v
    if "status" in fields and fields["status"] == "approved":
        set_parts.append("approved_at = :approved_at")
        values[":approved_at"] = _now_iso()
    try:
        table.update_item(
            Key={"PK": INVITE_PK, "SK": invite_token},
            UpdateExpression="SET " + ", ".join(set_parts),
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )
    except ClientError as e:
        logger.error(f"[dynamo] update_page_invite failed: {e.response['Error']}")
        raise


def save_poster(
    *,
    user_id: str,
    poster_id: str,
    day_date: str,
    post_number: int,
    source: str = "openai",
    poster_image_url: Optional[str] = None,
    brand_template_id: Optional[str] = None,
    design_id: Optional[str] = None,
    edit_url: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    image_field_values: Optional[dict] = None,
    text_field_values: Optional[dict] = None,
) -> None:
    """Create (first generation) or overwrite (regeneration, or an admin's
    "edit in Canva" step updating the same poster_id with design_id/edit_url)
    a saved poster record.

    All the Canva-specific fields are optional now — the normal case
    (source="openai") is just poster_image_url with nothing else, since
    there is no Canva design involved at all for a poster that hasn't
    been sent to Canva for editing. Uses preserve-on-None semantics for
    every field below (matching the pattern in payments_dynamo.set_user_paid)
    so the admin-only "edit in Canva" step, which only knows about the
    Canva fields, doesn't have to re-supply (and can't accidentally wipe)
    poster_image_url/caption/etc. it never touched.
    """
    table = _get_table()
    now_iso = _now_iso()
    existing = get_poster(user_id, poster_id) or {}
    item = {
        "PK": _pk(user_id),
        "SK": _poster_sk(poster_id),
        "analysis_id": poster_id,  # GSI hash key — see get_poster below
        "user_id": user_id,
        "poster_id": poster_id,
        "day_date": day_date,
        "post_number": post_number,
        "source": source if source is not None else existing.get("source", "openai"),
        "poster_image_url": poster_image_url if poster_image_url is not None else existing.get("poster_image_url"),
        "brand_template_id": brand_template_id if brand_template_id is not None else existing.get("brand_template_id"),
        "design_id": design_id if design_id is not None else existing.get("design_id"),
        "edit_url": edit_url if edit_url is not None else existing.get("edit_url"),
        "thumbnail_url": thumbnail_url if thumbnail_url is not None else existing.get("thumbnail_url"),
        "image_field_values": image_field_values if image_field_values is not None else existing.get("image_field_values", {}),
        "text_field_values": text_field_values if text_field_values is not None else existing.get("text_field_values", {}),
        "created_at": existing.get("created_at", now_iso),
        "updated_at": now_iso,
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[dynamo] saved poster={poster_id} user={user_id} source={item['source']}")
    except ClientError as e:
        logger.error(f"[dynamo] save_poster failed: {e.response['Error']}")
        raise


def get_poster(user_id: str, poster_id: str, *, retries: int = 0) -> Optional[dict]:
    """Looks up a poster by its poster_id via the shared GSI (same pattern as
    get_analysis) — the router only knows the poster_id, not its SK.

    `retries`: same eventual-consistency caveat as get_analysis — this GSI
    query can briefly miss a row that was just put_item'd in the same
    request. Pass retries>0 only at call sites reading back a poster they
    just saved; leave at 0 for an ordinary lookup."""
    table = _get_table()
    try:
        attempt = 0
        while True:
            resp = table.query(
                IndexName=GSI_NAME,
                KeyConditionExpression=Key("analysis_id").eq(poster_id),
            )
            items = resp.get("Items", [])
            if items or attempt >= retries:
                break
            sleep(0.3 * (attempt + 1))
            attempt += 1
        if not items:
            return None
        item = _from_dynamo(items[0])
        if item.get("user_id") != user_id or "poster_id" not in item:
            return None
        return item
    except ClientError as e:
        logger.error(f"[dynamo] get_poster failed: {e.response['Error']}")
        raise


def list_posters(user_id: str, limit: int = 50) -> list[dict]:
    """All saved posters for a user, newest-updated first. SK is stable per
    poster_id (not timestamp-prefixed — see save_poster's upsert-on-regenerate
    behaviour), so unlike list_analyses this sorts in Python rather than
    relying on native SK ordering. Fine at this scale (posters per user is a
    much smaller set than analyses)."""
    table = _get_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(_pk(user_id)) & Key("SK").begins_with("POSTER#"),
        )
        items = [_from_dynamo(i) for i in resp.get("Items", [])]
        items.sort(key=lambda i: i.get("updated_at", ""), reverse=True)
        return items[:limit]
    except ClientError as e:
        logger.error(f"[dynamo] list_posters failed: {e.response['Error']}")
        raise


# ── User registry + admin role ──────────────────────────────────────────────
# DynamoDB has no native "list all partition keys" operation — a registry
# item written once at signup is how /admin/users can enumerate every user
# without an expensive full-table Scan. Same single-table design, but under
# a FIXED partition key ("REGISTRY") shared by all users, since the whole
# point is to look them up together rather than per-user.
#   Registry entries: PK = "REGISTRY", SK = f"USER#{user_id}"
#   Admin role:       PK = user_id,    SK = "ADMIN_ROLE"  (per-user, like everything else)

_REGISTRY_PK = "REGISTRY"


def _registry_sk(user_id: str) -> str:
    return f"USER#{user_id}"


def _admin_role_sk() -> str:
    return "ADMIN_ROLE"


def register_user(*, user_id: str, email: str, full_name: str, company_name: str, domain: str) -> None:
    """Called at signup (always) and at login (as a backfill for accounts
    that existed before this registry did) — safe to call repeatedly,
    preserves the original created_at rather than bumping it on every login.
    Non-fatal if it fails — the user can still use the app, they just won't
    show up in /admin/users until this is retried (there's no other
    consequence, this registry is read-only bookkeeping)."""
    table = _get_table()
    existing = None
    try:
        resp = table.get_item(Key={"PK": _REGISTRY_PK, "SK": _registry_sk(user_id)})
        raw = resp.get("Item")
        existing = _from_dynamo(raw) if raw else None
    except ClientError:
        pass  # fine to proceed as if it's new — put_item below still succeeds
    item = {
        "PK": _REGISTRY_PK,
        "SK": _registry_sk(user_id),
        "user_id": user_id,
        "email": email,
        "full_name": full_name,
        "company_name": company_name,
        "domain": domain,
        "created_at": existing["created_at"] if existing else _now_iso(),
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[dynamo] registered user={user_id} email={email}")
    except ClientError as e:
        logger.error(f"[dynamo] register_user failed: {e.response['Error']}")
        raise


def get_registered_user(user_id: str) -> Optional[dict]:
    """Single-user lookup against the same registry register_user writes
    to — used where only a lightweight local read is needed (e.g. email
    for Airwallex customer creation) and a full Cognito round-trip would
    be unnecessary overhead."""
    table = _get_table()
    try:
        resp = table.get_item(Key={"PK": _REGISTRY_PK, "SK": _registry_sk(user_id)})
        item = resp.get("Item")
        return _from_dynamo(item) if item else None
    except ClientError as e:
        logger.error(f"[dynamo] get_registered_user failed: {e.response['Error']}")
        return None


def list_all_users(limit: int = 200) -> list[dict]:
    """Every registered user, for the admin panel. Simple PK-only query
    against the shared REGISTRY partition — no Scan needed. Newest
    signups first."""
    table = _get_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(_REGISTRY_PK),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [_from_dynamo(i) for i in resp.get("Items", [])]
    except ClientError as e:
        logger.error(f"[dynamo] list_all_users failed: {e.response['Error']}")
        raise


def is_admin(user_id: str) -> bool:
    table = _get_table()
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _admin_role_sk()})
        item = resp.get("Item")
        return bool(item and item.get("is_admin"))
    except ClientError as e:
        logger.error(f"[dynamo] is_admin failed: {e.response['Error']}")
        raise


def set_admin(user_id: str, is_admin_flag: bool) -> None:
    table = _get_table()
    try:
        table.put_item(Item=_to_dynamo({
            "PK": _pk(user_id),
            "SK": _admin_role_sk(),
            "user_id": user_id,
            "is_admin": is_admin_flag,
            "updated_at": _now_iso(),
        }))
        logger.info(f"[dynamo] set_admin user={user_id} -> {is_admin_flag}")
    except ClientError as e:
        logger.error(f"[dynamo] set_admin failed: {e.response['Error']}")
        raise


def update_analysis_result(user_id: str, analysis_id: str, new_result: dict) -> Optional[dict]:
    """Overwrites the saved `result` payload of an EXISTING analysis record
    in place (used by the admin panel to edit a user's saved relocation
    calendar — swap a caption, fix a day, etc.) — everything else about the
    record (type, company, timestamps, token usage) is left untouched.
    Returns the updated record, or None if no such analysis exists."""
    item = get_analysis(user_id, analysis_id)
    if not item:
        return None
    table = _get_table()
    pk = _pk(user_id)
    # get_analysis doesn't return the raw SK, so recompute it the same way
    # save_analysis does — same construction, so this always matches.
    try:
        resp = table.query(
            IndexName=GSI_NAME,
            KeyConditionExpression=Key("analysis_id").eq(analysis_id),
        )
        raw_items = resp.get("Items", [])
        if not raw_items:
            return None
        sk = raw_items[0]["SK"]
        table.update_item(
            Key={"PK": pk, "SK": sk},
            UpdateExpression="SET #r = :r, updated_at = :u",
            ExpressionAttributeNames={"#r": "result"},
            ExpressionAttributeValues={":r": json.dumps(new_result, default=str), ":u": _now_iso()},
        )
    except ClientError as e:
        logger.error(f"[dynamo] update_analysis_result failed: {e.response['Error']}")
        raise
    item["result"] = new_result
    return item


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

# ── AEO dashboard: saved state + generated content ───────────────────────────
# Two kinds of per-user item, both under the user's own PK and deliberately
# WITHOUT `analysis_id` / `analysis_type` attributes, so they never appear in
# the analysis GSI, history lists or stats:
#   SK = "AEO_STATE"                      one small document — custom prompts and
#                                         competitors, selected prompts, manual
#                                         social links, blog/post approvals
#   SK = "AEO_CONTENT#<kind>#<digest>"    one generated asset per (kind, prompt),
#                                         stored as a JSON string — strategy,
#                                         blog drafts, social posts — so reloading
#                                         the page doesn't re-run Bedrock
# DynamoDB items cap at 400 KB; the state document is size-checked before it is
# written rather than left to fail with a cryptic ValidationException.

AEO_STATE_MAX_BYTES = 300_000
_AEO_DEFAULT_STATE = {
    "custom_prompts": [], "custom_competitors": [], "hidden_competitors": [], "hidden_prompts": [], "selected_prompts": [],
    "social_links": {}, "blog_state": {}, "post_state": {},
    "brand": {}, "calendar_keywords": [],
}


class AeoStateTooLargeError(ValueError):
    pass


def _aeo_state_sk() -> str:
    return "AEO_STATE"


def _aeo_content_sk(kind: str, key: str) -> str:
    import hashlib
    if not re.fullmatch(r"[a-z_]{1,30}", kind):
        raise ValueError(f"Invalid AEO content kind: {kind!r}")
    return f"AEO_CONTENT#{kind}#{hashlib.sha1(key.strip().lower().encode('utf-8')).hexdigest()[:20]}"


def get_aeo_state(user_id: str) -> dict:
    table = _get_table()
    try:
        item = table.get_item(Key={"PK": _pk(user_id), "SK": _aeo_state_sk()}).get("Item")
        state = _from_dynamo(item.get("state")) if item else None
        return {**{k: (v.copy() if hasattr(v, "copy") else v) for k, v in _AEO_DEFAULT_STATE.items()}, **(state or {})}
    except ClientError as e:
        logger.error(f"[dynamo] get_aeo_state failed: {e.response['Error']}")
        raise


def save_aeo_state(user_id: str, state: dict) -> dict:
    if len(json.dumps(state, default=str)) > AEO_STATE_MAX_BYTES:
        raise AeoStateTooLargeError("Saved dashboard data is too large — remove some items and try again.")
    table = _get_table()
    try:
        table.put_item(Item=_to_dynamo({
            "PK": _pk(user_id), "SK": _aeo_state_sk(), "user_id": user_id,
            "state": state, "updated_at": _now_iso(),
        }))
        return state
    except ClientError as e:
        logger.error(f"[dynamo] save_aeo_state failed: {e.response['Error']}")
        raise


def get_aeo_content(user_id: str, kind: str, key: str) -> Optional[dict]:
    table = _get_table()
    try:
        item = table.get_item(Key={"PK": _pk(user_id), "SK": _aeo_content_sk(kind, key)}).get("Item")
        if not item:
            return None
        raw = item.get("data")
        return json.loads(raw) if isinstance(raw, str) else None
    except ClientError as e:
        logger.error(f"[dynamo] get_aeo_content failed: {e.response['Error']}")
        raise
    except json.JSONDecodeError:
        return None


def save_aeo_content(user_id: str, kind: str, key: str, data: dict) -> None:
    table = _get_table()
    try:
        table.put_item(Item={
            "PK": _pk(user_id), "SK": _aeo_content_sk(kind, key), "user_id": user_id,
            "content_kind": kind, "data": json.dumps(data, default=str), "updated_at": _now_iso(),
        })
    except ClientError as e:
        logger.error(f"[dynamo] save_aeo_content failed: {e.response['Error']}")
        raise


# ── AEO content — admin (team) access ────────────────────────────────────────
_AEO_CONTENT_PREFIX = "AEO_CONTENT#"


def list_aeo_content(user_id: str) -> list[dict]:
    """Every generated/edited AEO asset for one user: [{sk, kind, data, updated_at}]."""
    table = _get_table()
    out: list[dict] = []
    try:
        kwargs = {"KeyConditionExpression": Key("PK").eq(_pk(user_id)) & Key("SK").begins_with(_AEO_CONTENT_PREFIX)}
        while True:
            resp = table.query(**kwargs)
            for it in resp.get("Items", []):
                try:
                    data = json.loads(it.get("data")) if isinstance(it.get("data"), str) else None
                except json.JSONDecodeError:
                    data = None
                if data is not None:
                    out.append({"sk": it["SK"], "kind": it.get("content_kind", ""), "data": data, "updated_at": it.get("updated_at", "")})
            if "LastEvaluatedKey" not in resp or len(out) >= 400:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        return out
    except ClientError as e:
        logger.error(f"[dynamo] list_aeo_content failed: {e.response['Error']}")
        raise


def save_aeo_content_by_sk(user_id: str, sk: str, kind: str, data: dict) -> None:
    if not sk.startswith(_AEO_CONTENT_PREFIX) or not re.fullmatch(r"[a-z_]{1,30}", kind):
        raise ValueError("Invalid AEO content reference")
    table = _get_table()
    try:
        table.put_item(Item={
            "PK": _pk(user_id), "SK": sk, "user_id": user_id,
            "content_kind": kind, "data": json.dumps(data, default=str), "updated_at": _now_iso(),
        })
    except ClientError as e:
        logger.error(f"[dynamo] save_aeo_content_by_sk failed: {e.response['Error']}")
        raise


# ── YouTube Short generation jobs (a Short takes a minute or two, so it runs in the background) ─────
def _short_job_sk(job_id: str) -> str:
    return f"AEO_SHORTJOB#{job_id}"


def save_short_job(user_id: str, job_id: str, data: dict) -> None:
    table = _get_table()
    try:
        table.put_item(Item={
            "PK": _pk(user_id), "SK": _short_job_sk(job_id), "user_id": user_id,
            "data": json.dumps(data, default=str), "updated_at": _now_iso(),
            "ttl": int(time.time()) + 3 * 24 * 3600,   # honoured if the table has TTL enabled on "ttl"
        })
    except ClientError as e:
        logger.error(f"[dynamo] save_short_job failed: {e.response['Error']}")
        raise


def get_short_job(user_id: str, job_id: str) -> Optional[dict]:
    table = _get_table()
    try:
        item = table.get_item(Key={"PK": _pk(user_id), "SK": _short_job_sk(job_id)}).get("Item")
        raw = item.get("data") if item else None
        return json.loads(raw) if isinstance(raw, str) else None
    except ClientError as e:
        logger.error(f"[dynamo] get_short_job failed: {e.response['Error']}")
        raise
    except json.JSONDecodeError:
        return None
