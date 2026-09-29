"""
db/social_publishing_dynamo.py — Social media posting data, in its own
DynamoDB table
==================================================================================
Everything involved in getting a generated poster onto a social platform —
Canva OAuth connections (used to edit a poster's image), each social
platform's own OAuth connection (Facebook/Instagram/LinkedIn/Google
Business/YouTube), the scheduled-post queue, page/location connection
invites, and the generated posters themselves — used to live in the same
single table as SEO analyses and payments both. This module splits all of
it out into its own table (APAC_SOCIAL_PUBLISHING_TABLE), separate from
db/dynamo.py (SEO analyses, user registry, admin roles) and
db/payments_dynamo.py (billing) alike. Each of the three now has its own
connection, matching payments_dynamo.py's own precedent for why: any one
of them could in principle move to a different AWS account/region later
without touching the others' connections at all.

Same "one table, SK (or a fixed global PK) prefix distinguishes item kind"
design as db/dynamo.py, just a separate table:
  - Canva connection (one per user):   PK = user_id, SK = "CANVA_CONNECTION"
  - Canva PKCE (short-lived, per state): PK = user_id, SK = f"CANVA_PKCE#{state}"
  - Social connection (one per user+platform): PK = user_id, SK = f"SOCIAL_CONNECTION#{platform}"
  - Scheduled post (many, GLOBAL partition — see save_scheduled_post below):
      PK = "SCHEDULED_QUEUE", SK = f"{scheduled_time_iso}#{schedule_id}"
  - Page invite (many, GLOBAL partition): PK = "PAGE_INVITE", SK = invite_token
  - Poster (many, one per user+poster_id): PK = user_id, SK = f"POSTER#{poster_id}"

Needs its own GSI for the same reason payments_dynamo.py needed one: a
poster, scheduled post, or page invite is often looked up by its own id
alone (a router only has the poster_id/schedule_id/invite_token, not the
user_id or SK) — that can no longer piggyback on the analyses table's
gsi_analysis_id now that this is a separate table. Named gsi_lookup_id
with a plain lookup_id attribute here, deliberately NOT reusing the old
"analysis_id" name carried over from the shared-table version — a poster
or a page invite has nothing to do with an "analysis", and giving the
attribute an honest, generic name avoids that confusion for anyone
reading this table's items directly.
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from db.dynamo import _from_dynamo, _now_iso, _pk, _to_dynamo

load_dotenv()

logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────
TABLE_NAME = os.getenv("APAC_SOCIAL_PUBLISHING_TABLE", "apac_social_publishing")
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")
GSI_NAME = "gsi_lookup_id"

EIGENAI_AWS_ACCESS_KEY_ID = os.getenv("EIGENAI_AWS_ACCESS_KEY_ID")
EIGENAI_AWS_SECRET_ACCESS_KEY = os.getenv("EIGENAI_AWS_SECRET_ACCESS_KEY")
ROLE_ARN = os.getenv("ROLE_ARN")  # optional, for cross-account access

# ── Singleton DynamoDB resource — intentionally a SEPARATE connection from
# both db.dynamo's and db.payments_dynamo's, not shared. Mirrors their
# connection logic (local endpoint vs. STS cross-account role) exactly. ────
_dynamodb = None
_table = None
_creds_expiry = 0


def _get_social_publishing_table():
    global _dynamodb, _table, _creds_expiry

    # See db.dynamo._get_table()'s identical fix — a cached client whose
    # assumed-role credentials expire (commonly ~1 hour) and never refresh
    # fails every subsequent call with "The provided token has expired",
    # regardless of how long this process keeps running. This table backs
    # every social connection, scheduled post, and poster in the app, so
    # this bug alone could silently break every publish/schedule attempt
    # once credentials aged out.
    needs_refresh = _table is None or (_creds_expiry and time.time() > _creds_expiry - 60)
    if needs_refresh:
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
            response = sts.assume_role(RoleArn=ROLE_ARN, RoleSessionName="dynamodb-social-publishing-session")
            creds = response["Credentials"]
            _creds_expiry = creds["Expiration"].timestamp()
            _dynamodb = boto3.resource(
                "dynamodb",
                region_name=AWS_REGION,
                aws_access_key_id=creds["AccessKeyId"],
                aws_secret_access_key=creds["SecretAccessKey"],
                aws_session_token=creds["SessionToken"],
            )

        _table = _dynamodb.Table(TABLE_NAME)

    return _table


def _canva_connection_sk() -> str:
    return "CANVA_CONNECTION"


def _canva_pkce_sk(state: str) -> str:
    return f"CANVA_PKCE#{state}"


def _poster_sk(poster_id: str) -> str:
    return f"POSTER#{poster_id}"


# ── Canva PKCE + connection ──────────────────────────────────────────────────
def save_canva_pkce(user_id: str, state: str, code_verifier: str) -> None:
    """Short-lived — the code_verifier must survive the round-trip to Canva's
    authorize page and back to /callback, but isn't needed after that."""
    table = _get_social_publishing_table()
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
        logger.error(f"[social_publishing_dynamo] save_canva_pkce failed: {e.response['Error']}")
        raise


def get_canva_pkce(user_id: str, state: str) -> Optional[dict]:
    table = _get_social_publishing_table()
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _canva_pkce_sk(state)})
        item = resp.get("Item")
        return _from_dynamo(item) if item else None
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] get_canva_pkce failed: {e.response['Error']}")
        raise


def save_canva_connection(
    *, user_id: str, access_token: str, refresh_token: str, expires_at: str, canva_user_id: str = "",
) -> None:
    table = _get_social_publishing_table()
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
        logger.info(f"[social_publishing_dynamo] Canva connected for user={user_id}")
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] save_canva_connection failed: {e.response['Error']}")
        raise


def get_canva_connection(user_id: str) -> Optional[dict]:
    table = _get_social_publishing_table()
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _canva_connection_sk()})
        item = resp.get("Item")
        return _from_dynamo(item) if item else None
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] get_canva_connection failed: {e.response['Error']}")
        raise


def delete_canva_connection(user_id: str) -> None:
    table = _get_social_publishing_table()
    try:
        table.delete_item(Key={"PK": _pk(user_id), "SK": _canva_connection_sk()})
        logger.info(f"[social_publishing_dynamo] Canva disconnected for user={user_id}")
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] delete_canva_connection failed: {e.response['Error']}")
        raise


# ── Social publishing connections (Facebook, Instagram, LinkedIn, Google
# Business, YouTube) — one generic set of functions instead of per-platform
# copies, since the shape is identical: an access/refresh token plus
# whatever "target" identifiers that platform needs to actually post (a
# Facebook Page ID, an Instagram Business Account ID, a LinkedIn
# organization URN, a Google Business account/location name, a YouTube
# channel id). `extra` carries those platform-specific fields — see
# services/social_publish/*.py for what each platform stores there. ───────
VALID_SOCIAL_PLATFORMS = {"facebook", "instagram", "linkedin", "google_business", "youtube"}


def _social_connection_sk(platform: str) -> str:
    if platform not in VALID_SOCIAL_PLATFORMS:
        raise ValueError(f"Unknown social platform: {platform!r}")
    return f"SOCIAL_CONNECTION#{platform}"


def save_social_connection(
    *, user_id: str, platform: str, access_token: str, refresh_token: str = "",
    expires_at: str = "", extra: Optional[dict] = None,
) -> None:
    table = _get_social_publishing_table()
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
        "needs_reconnect": False,
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[social_publishing_dynamo] {platform} connected for user={user_id}")
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] save_social_connection failed: {e.response['Error']}")
        raise


def get_social_connection(user_id: str, platform: str) -> Optional[dict]:
    table = _get_social_publishing_table()
    try:
        resp = table.get_item(Key={"PK": _pk(user_id), "SK": _social_connection_sk(platform)})
        item = resp.get("Item")
        return _from_dynamo(item) if item else None
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] get_social_connection failed: {e.response['Error']}")
        raise


def mark_connection_needs_reconnect(user_id: str, platform: str) -> None:
    """Flags an existing connection as needing reconnection — called when a
    publish/schedule attempt fails with an auth error specifically."""
    table = _get_social_publishing_table()
    try:
        table.update_item(
            Key={"PK": _pk(user_id), "SK": _social_connection_sk(platform)},
            UpdateExpression="SET needs_reconnect = :true",
            ExpressionAttributeValues={":true": True},
        )
        logger.warning(f"[social_publishing_dynamo] {platform} connection for user={user_id} flagged as needs_reconnect")
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] mark_connection_needs_reconnect failed: {e.response['Error']}")


def list_social_connections(user_id: str) -> list[dict]:
    """All connected platforms for this user (used for the status endpoint)."""
    table = _get_social_publishing_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(_pk(user_id)) & Key("SK").begins_with("SOCIAL_CONNECTION#"),
        )
        return [_from_dynamo(i) for i in resp.get("Items", [])]
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] list_social_connections failed: {e.response['Error']}")
        raise


def delete_social_connection(user_id: str, platform: str) -> None:
    table = _get_social_publishing_table()
    try:
        table.delete_item(Key={"PK": _pk(user_id), "SK": _social_connection_sk(platform)})
        logger.info(f"[social_publishing_dynamo] {platform} disconnected for user={user_id}")
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] delete_social_connection failed: {e.response['Error']}")
        raise


# ── Scheduled social posts — deliberately a GLOBAL partition (PK is fixed,
# not per-user), same reasoning as db/dynamo.py's original: the background
# worker's core operation is "find every post whose time has come, across
# every user", which needs to be one cheap query, not N per-user queries.
SCHEDULED_QUEUE_PK = "SCHEDULED_QUEUE"


def _scheduled_post_sk(scheduled_time_iso: str, schedule_id: str) -> str:
    return f"{scheduled_time_iso}#{schedule_id}"


def save_scheduled_post(
    *, schedule_id: str, user_id: str, day_date: str, platforms: list[str],
    caption: str, image_url: str, cta_url: str = "", scheduled_time_iso: str,
    status: str = "pending", results: Optional[list] = None, post_number: Optional[int] = None,
) -> None:
    table = _get_social_publishing_table()
    item = {
        "PK": SCHEDULED_QUEUE_PK,
        "SK": _scheduled_post_sk(scheduled_time_iso, schedule_id),
        "lookup_id": schedule_id,  # GSI hash key — same shared-GSI pattern as get_poster/get_page_invite
        "schedule_id": schedule_id,
        "user_id": user_id,
        "day_date": day_date,
        "post_number": post_number,
        "platforms": platforms,
        "caption": caption,
        "image_url": image_url,
        "cta_url": cta_url,
        "scheduled_time": scheduled_time_iso,
        "status": status,
        "results": results or [],
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    try:
        table.put_item(Item=_to_dynamo(item))
        logger.info(f"[social_publishing_dynamo] scheduled post {schedule_id} for user={user_id} at {scheduled_time_iso}")
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] save_scheduled_post failed: {e.response['Error']}")
        raise


def get_scheduled_post(schedule_id: str) -> Optional[dict]:
    """Looked up via the shared GSI — callers only know the schedule_id, not its SK."""
    table = _get_social_publishing_table()
    try:
        resp = table.query(IndexName=GSI_NAME, KeyConditionExpression=Key("lookup_id").eq(schedule_id))
        items = resp.get("Items", [])
        return _from_dynamo(items[0]) if items else None
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] get_scheduled_post failed: {e.response['Error']}")
        raise


def _all_scheduled_posts(limit: int = 500) -> list[dict]:
    table = _get_social_publishing_table()
    try:
        resp = table.query(KeyConditionExpression=Key("PK").eq(SCHEDULED_QUEUE_PK), Limit=limit)
        return [_from_dynamo(i) for i in resp.get("Items", [])]
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] _all_scheduled_posts failed: {e.response['Error']}")
        raise


def list_due_scheduled_posts(now_iso: str) -> list[dict]:
    """Every still-pending post whose scheduled_time has passed — this is
    what the background worker polls."""
    table = _get_social_publishing_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(SCHEDULED_QUEUE_PK) & Key("SK").lte(now_iso + "~"),
        )
        items = [_from_dynamo(i) for i in resp.get("Items", [])]
        return [i for i in items if i.get("status") == "pending"]
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] list_due_scheduled_posts failed: {e.response['Error']}")
        raise


def list_scheduled_posts_for_user(user_id: str) -> list[dict]:
    """All of one user's scheduled posts (any status), newest-scheduled first."""
    items = [i for i in _all_scheduled_posts() if i.get("user_id") == user_id]
    items.sort(key=lambda i: i.get("scheduled_time", ""), reverse=True)
    return items


def update_scheduled_post_status(schedule_id: str, status: str, results: Optional[list] = None) -> None:
    post = get_scheduled_post(schedule_id)
    if not post:
        return
    table = _get_social_publishing_table()
    try:
        table.update_item(
            Key={"PK": SCHEDULED_QUEUE_PK, "SK": post["SK"]},
            UpdateExpression="SET #s = :s, updated_at = :u, results = :r",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": status, ":u": _now_iso(), ":r": results or []},
        )
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] update_scheduled_post_status failed: {e.response['Error']}")
        raise


def cancel_scheduled_post(schedule_id: str, user_id: str) -> bool:
    """Returns False if not found, not owned by this user, or already past 'pending'."""
    post = get_scheduled_post(schedule_id)
    if not post or post.get("user_id") != user_id or post.get("status") != "pending":
        return False
    update_scheduled_post_status(schedule_id, "cancelled")
    return True


# ── Page connection invitations — same global-partition reasoning as the
# scheduled-posts queue above (the approver may have no account at all).
INVITE_PK = "PAGE_INVITE"
INVITE_TTL_DAYS = 7


def save_page_invite(
    *, invite_token: str, platform: str, requested_by_user_id: str, requested_by_label: str,
    status: str = "pending", available_pages: Optional[list] = None,
    oauth_access_token: str = "", oauth_refresh_token: str = "",
    selected_page: Optional[dict] = None, return_to_app: bool = False,
) -> None:
    table = _get_social_publishing_table()
    now = _now_iso()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)).isoformat().replace("+00:00", "Z")
    item = {
        "PK": INVITE_PK,
        "SK": invite_token,
        "lookup_id": invite_token,  # shared GSI hash key, same pattern as scheduled posts/posters
        "invite_token": invite_token,
        "platform": platform,
        "requested_by_user_id": requested_by_user_id,
        "requested_by_label": requested_by_label,
        "status": status,
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
        logger.info(f"[social_publishing_dynamo] page invite {invite_token} created for platform={platform} by user={requested_by_user_id}")
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] save_page_invite failed: {e.response['Error']}")
        raise


def get_page_invite(invite_token: str) -> Optional[dict]:
    table = _get_social_publishing_table()
    try:
        resp = table.get_item(Key={"PK": INVITE_PK, "SK": invite_token})
        item = resp.get("Item")
        if not item:
            return None
        invite = _from_dynamo(item)
        if invite.get("status") == "pending" and invite.get("expires_at"):
            try:
                if datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
                    invite["status"] = "expired"
                    update_page_invite(invite_token, status="expired")
            except (ValueError, AttributeError):
                pass
        return invite
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] get_page_invite failed: {e.response['Error']}")
        raise


def list_page_invites_for_user(user_id: str, limit: int = 100) -> list[dict]:
    """All invites a given account has SENT (not received)."""
    table = _get_social_publishing_table()
    try:
        resp = table.query(KeyConditionExpression=Key("PK").eq(INVITE_PK), Limit=limit)
        items = [_from_dynamo(i) for i in resp.get("Items", [])]
        items = [i for i in items if i.get("requested_by_user_id") == user_id]
        items.sort(key=lambda i: i.get("created_at", ""), reverse=True)
        return items
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] list_page_invites_for_user failed: {e.response['Error']}")
        raise


def update_page_invite(invite_token: str, **fields) -> None:
    """Generic partial update — status transitions, storing the OAuth
    token once the admin authorizes, storing available_pages once fetched,
    recording the final selected_page once approved."""
    table = _get_social_publishing_table()
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
        logger.error(f"[social_publishing_dynamo] update_page_invite failed: {e.response['Error']}")
        raise


# ── Generated posters ────────────────────────────────────────────────────────
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
    "edit in Canva" step) a saved poster record. Uses preserve-on-None
    semantics for every field below (matching payments_dynamo.set_user_paid)
    so a step that only knows about SOME fields can't accidentally wipe
    the others it never touched."""
    table = _get_social_publishing_table()
    now_iso = _now_iso()
    existing = get_poster(user_id, poster_id) or {}
    item = {
        "PK": _pk(user_id),
        "SK": _poster_sk(poster_id),
        "lookup_id": poster_id,  # GSI hash key — see get_poster below
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
        logger.info(f"[social_publishing_dynamo] saved poster={poster_id} user={user_id} source={item['source']}")
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] save_poster failed: {e.response['Error']}")
        raise


def get_poster(user_id: str, poster_id: str) -> Optional[dict]:
    """Looks up a poster by its poster_id via the shared GSI — the router
    only knows the poster_id, not its SK."""
    table = _get_social_publishing_table()
    try:
        resp = table.query(
            IndexName=GSI_NAME,
            KeyConditionExpression=Key("lookup_id").eq(poster_id),
        )
        items = resp.get("Items", [])
        if not items:
            return None
        item = _from_dynamo(items[0])
        if item.get("user_id") != user_id or "poster_id" not in item:
            return None
        return item
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] get_poster failed: {e.response['Error']}")
        raise


def list_posters(user_id: str, limit: int = 50) -> list[dict]:
    """All saved posters for a user, newest-updated first."""
    table = _get_social_publishing_table()
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(_pk(user_id)) & Key("SK").begins_with("POSTER#"),
        )
        items = [_from_dynamo(i) for i in resp.get("Items", [])]
        items.sort(key=lambda i: i.get("updated_at", ""), reverse=True)
        return items[:limit]
    except ClientError as e:
        logger.error(f"[social_publishing_dynamo] list_posters failed: {e.response['Error']}")
        raise


def create_social_publishing_table_if_not_exists() -> None:
    """Creates the social-publishing table (with its GSI) if it doesn't
    already exist. Mirrors db.dynamo.create_table_if_not_exists and
    db.payments_dynamo.create_payments_table_if_not_exists — called
    separately at startup since this is a third, distinct table."""
    table = _get_social_publishing_table()
    try:
        table.load()
        logger.info(f"[social_publishing_dynamo] Table '{TABLE_NAME}' already exists")
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
            {"AttributeName": "lookup_id", "AttributeType": "S"},
        ],
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        GlobalSecondaryIndexes=[{
            "IndexName": GSI_NAME,
            "KeySchema": [{"AttributeName": "lookup_id", "KeyType": "HASH"}],
            "Projection": {"ProjectionType": "ALL"},
        }],
    )
    _get_social_publishing_table().wait_until_exists()
    logger.info(f"[social_publishing_dynamo] Table '{TABLE_NAME}' created with GSI '{GSI_NAME}'")
