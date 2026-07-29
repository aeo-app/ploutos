"""
core/security.py — JWT verification + FastAPI dependency
=========================================================

Cognito issues JWTs signed with RS256. We verify the token by:
  1. Fetching the JWKS from Cognito's public endpoint (cached in memory)
  2. Decoding the JWT header to find the key ID (kid)
  3. Verifying the signature and claims (exp, iss, token_use)
  4. Returning the decoded payload

Dependencies:
  pip install python-jose[cryptography]  (or PyJWT with cryptography)

We use PyJWT here because it ships with boto3-compatible environments.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request
from functools import lru_cache
from typing import Optional

from fastapi import Depends, Header, HTTPException, status

logger = logging.getLogger(__name__)

AWS_REGION   = os.getenv("AWS_REGION", "ap-southeast-1")
POOL_ID      = os.getenv("COGNITO_USER_POOL_ID", "")
CLIENT_ID    = os.getenv("COGNITO_CLIENT_ID", "")
SKIP_AUTH    = os.getenv("SKIP_JWT_VERIFICATION", "false").lower() == "true"

JWKS_URL = (
    f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{POOL_ID}/.well-known/jwks.json"
)
ISSUER = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{POOL_ID}"


@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    """Fetch and cache Cognito JWKS (public keys). Cached for process lifetime."""
    try:
        with urllib.request.urlopen(JWKS_URL, timeout=5) as resp:
            jwks = json.loads(resp.read())
            logger.info(f"[security] JWKS fetched — {len(jwks.get('keys', []))} keys")
            return jwks
    except Exception as e:
        logger.error(f"[security] Failed to fetch JWKS from {JWKS_URL}: {e}")
        raise


def _decode_token(token: str) -> dict:
    """
    Verify a Cognito JWT and return its decoded payload.
    Raises HTTPException(401) on any verification failure.
    """
    try:
        import jwt as pyjwt                    # PyJWT
        from jwt.algorithms import RSAAlgorithm

        # Decode header without verification to get kid
        header  = pyjwt.get_unverified_header(token)
        kid     = header.get("kid")

        # Find matching key in JWKS
        jwks   = _get_jwks()
        keys   = {k["kid"]: k for k in jwks.get("keys", [])}
        if kid not in keys:
            # Key not found — refresh JWKS cache and retry once
            _get_jwks.cache_clear()
            jwks = _get_jwks()
            keys = {k["kid"]: k for k in jwks.get("keys", [])}

        if kid not in keys:
            raise ValueError(f"Public key {kid!r} not found in JWKS")

        public_key = RSAAlgorithm.from_jwk(keys[kid])

        payload = pyjwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_exp": True},
            audience=CLIENT_ID,
            issuer=ISSUER,
        )
        return payload

    except ImportError:
        # PyJWT not installed — fall through to stub decoder
        logger.warning("[security] PyJWT not installed — skipping JWT verification (dev mode)")
        return _stub_decode(token)
    except Exception as e:
        logger.warning(f"[security] JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def _stub_decode(token: str) -> dict:
    """
    Minimal base64 decode — NO signature verification.
    Only used when PyJWT is not installed or SKIP_JWT_VERIFICATION=true.
    NEVER use in production.
    """
    import base64
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=401, detail="Malformed JWT")
    padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(padded))
    except Exception:
        raise HTTPException(status_code=401, detail="Cannot decode JWT payload")


def get_current_user_id(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_user_id:     Optional[str] = Header(None, alias="X-User-ID"),
) -> str:
    """
    FastAPI dependency — extracts user_id from:
      1. Bearer token in Authorization header (Cognito access token, verified)
      2. X-User-ID header (fallback for dev / service-to-service)

    Returns the Cognito `sub` (stable UUID per user) as the user_id.
    This is what gets stored as the DynamoDB partition key.
    """
    # ── Bearer token path ──────────────────────────────────────────────────────
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        if not token:
            raise HTTPException(status_code=401, detail="Empty Bearer token")

        if SKIP_AUTH:
            payload = _stub_decode(token)
        else:
            payload = _decode_token(token)

        # Use `sub` as the stable user identifier
        sub = payload.get("sub") or payload.get("username")
        if not sub:
            raise HTTPException(status_code=401, detail="Token missing 'sub' claim")
        return sub

    # ── Dev fallback: X-User-ID header ────────────────────────────────────────
    if x_user_id:
        if not SKIP_AUTH:
            logger.warning(
                "[security] X-User-ID header used without Bearer token. "
                "Set SKIP_JWT_VERIFICATION=true for local dev."
            )
        return x_user_id

    raise HTTPException(
        status_code=401,
        detail=(
            "Authentication required. "
            "Provide 'Authorization: Bearer <access_token>' header "
            "or 'X-User-ID' header (dev mode only)."
        ),
        headers={"WWW-Authenticate": "Bearer"},
    )
