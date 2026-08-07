"""
services/cognito_service.py — AWS Cognito authentication layer
==============================================================

User Pool flow
--------------
1. sign_up()           → creates unconfirmed user, sends OTP via SES
2. confirm_sign_up()   → verifies the OTP, activates account
3. resend_confirmation_code() → new OTP to email
4. login()             → InitiateAuth → returns AccessToken + RefreshToken + IdToken
5. refresh_tokens()    → new access token from refresh token (no password)
6. get_user()          → decode access token, return user attributes
7. forgot_password()   → sends reset code (bonus endpoint)
8. confirm_forgot_password() → resets password with code

Environment variables required
-------------------------------
COGNITO_USER_POOL_ID   e.g. ap-southeast-1_AbCdEfGhI
COGNITO_CLIENT_ID      App client ID (no secret = public client; with secret = confidential)
COGNITO_CLIENT_SECRET  Optional — only if app client has a secret
AWS_REGION             e.g. ap-southeast-1

Cognito User Pool must be configured with:
  - Email as username (or username + email alias)
  - Email verification required
  - SES or Cognito built-in email for OTP delivery
  - Auth flows: ALLOW_USER_PASSWORD_AUTH + ALLOW_REFRESH_TOKEN_AUTH
"""

from __future__ import annotations

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

logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")

CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")

CLIENT_SECRET = os.getenv("COGNITO_CLIENT_SECRET", "")   # optional
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")

EIGENAI_AWS_ACCESS_KEY_ID = os.getenv("EIGENAI_AWS_ACCESS_KEY_ID")
EIGENAI_AWS_SECRET_ACCESS_KEY = os.getenv("EIGENAI_AWS_SECRET_ACCESS_KEY")
EIGENAI_AWS_SESSION_TOKEN = os.getenv("EIGENAI_AWS_SESSION_TOKEN")
ROLE_ARN = os.getenv("ROLE_ARN")  # optional, for cross-account access

# ── Singleton client ───────────────────────────────────────────────────────────
_idp: Any = None


def _get_client():
    global _idp

    if _idp is None:
        # 1. Create STS client (uses Account A credentials automatically)
        sts = boto3.client(
            "sts",
            aws_access_key_id=EIGENAI_AWS_ACCESS_KEY_ID,
            aws_secret_access_key=EIGENAI_AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION,
        )

        # 2. Assume role in Account
        response = sts.assume_role(RoleArn=ROLE_ARN, RoleSessionName="cognito-session")

        creds = response["Credentials"]
        

        # 3. Create Cognito client using temporary credentials
        _idp = boto3.client(
            "cognito-idp",
            region_name=AWS_REGION,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
        )

        logger.info(f"[cognito] cross-account client ready — pool={POOL_ID} region={AWS_REGION}")

    return _idp


def _require_config():
    """Raise if pool/client IDs are not configured."""
    if not POOL_ID or not CLIENT_ID:
        raise RuntimeError(
            "COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set. "
            "See .env.example for configuration."
        )


# ── SECRET_HASH helper ────────────────────────────────────────────────────────
def _secret_hash(username: str) -> Optional[str]:
    """
    Compute the SECRET_HASH required when the App Client has a client secret.
    Returns None if CLIENT_SECRET is not set (public client).
    """
    if not CLIENT_SECRET:
        return None
    msg = username + CLIENT_ID
    digest = hmac.new(
        CLIENT_SECRET.encode("utf-8"),
        msg.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(digest).decode()


def _auth_params(username: str, extra: dict) -> dict:
    """Build AuthParameters dict, injecting SECRET_HASH if needed."""
    params = {"USERNAME": username, **extra}
    sh = _secret_hash(username)
    if sh:
        params["SECRET_HASH"] = sh
    return params


# ── Error mapper ──────────────────────────────────────────────────────────────
class CognitoError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _map_error(e: ClientError) -> CognitoError:
    code = e.response["Error"]["Code"]
    msg = e.response["Error"]["Message"]
    logger.warning(f"[cognito] ClientError: {code} — {msg}")
    return CognitoError(code, msg)


# ── Public API ────────────────────────────────────────────────────────────────

def sign_up(email: str, password: str, full_name: str, company_name: str, domain: str) -> dict:
    """
    Register a new user with email + password + company_name + domain.
    Cognito sends a 6-digit OTP to the email address. company_name/domain
    are stored as custom attributes — the source of truth for which
    domain this account is permanently linked to (one domain per account;
    see db.dynamo.check_and_lock_domain, which validates every analysis
    request against this).

    Returns:
        {"user_sub": str, "confirmed": bool, "delivery": str}
    """
    _require_config()
    client = _get_client()
    try:
        resp = client.sign_up(
            ClientId=CLIENT_ID,
            Username=email,
            Password=password,
            SecretHash=_secret_hash(email) or "",
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "name", "Value": full_name},
                {"Name": "custom:company_name", "Value": company_name},
                {"Name": "custom:domain", "Value": domain},
        ],)
        destination = resp.get("CodeDeliveryDetails", {}).get("Destination", email)
        logger.info(f"[cognito] sign_up OK — sub={resp['UserSub']} email={email} domain={domain}")
        return {
            "user_sub": resp["UserSub"],
            "confirmed": resp["UserConfirmed"],
            "delivery": destination,
            "message": f"Verification code sent to {destination}",
        }
    except ClientError as e:
        raise _map_error(e)


def confirm_sign_up(email: str, code: str) -> dict:
    """
    Confirm email with the OTP received after sign_up().

    Returns:
        {"confirmed": True, "message": str}
    """
    _require_config()
    client = _get_client()
    try:
        client.confirm_sign_up(
            ClientId=CLIENT_ID,
            Username=email,
            ConfirmationCode=code,
            SecretHash=_secret_hash(email) or "",
        )
        logger.info(f"[cognito] confirm_sign_up OK — {email}")
        return {"confirmed": True, "message": "Email verified. You can now sign in."}
    except ClientError as e:
        raise _map_error(e)


def resend_confirmation_code(email: str) -> dict:
    """
    Resend the OTP to the email address for account confirmation.

    Returns:
        {"delivery": str, "message": str}
    """
    _require_config()
    client = _get_client()
    try:
        resp = client.resend_confirmation_code(
            ClientId=CLIENT_ID,
            Username=email,
            SecretHash=_secret_hash(email) or "",
        )
        destination = resp.get("CodeDeliveryDetails", {}).get("Destination", email)
        logger.info(f"[cognito] resend_code OK — {email}")
        return {
            "delivery": destination,
            "message": f"New verification code sent to {destination}",
        }
    except ClientError as e:
        raise _map_error(e)


def login(email: str, password: str) -> dict:
    """
    Authenticate with email + password via USER_PASSWORD_AUTH flow.

    Returns:
        {
          "access_token":  str,
          "id_token":      str,
          "refresh_token": str,
          "token_type":    "Bearer",
          "expires_in":    int,  # seconds
        }
    """
    _require_config()
    client = _get_client()
    try:
        resp = client.initiate_auth(
            AuthFlow="USER_PASSWORD_AUTH",
            ClientId=CLIENT_ID,
            AuthParameters=_auth_params(email, {"PASSWORD": password}),
        )
        result = resp.get("AuthenticationResult", {})
        logger.info(f"[cognito] login OK — {email}")
        return {
            "access_token": result["AccessToken"],
            "id_token": result["IdToken"],
            "refresh_token": result["RefreshToken"],
            "token_type": result.get("TokenType", "Bearer"),
            "expires_in": result.get("ExpiresIn", 3600),
        }
    except ClientError as e:
        raise _map_error(e)


def refresh_tokens(refresh_token: str, email: str) -> dict:
    """
    Get a new access token using a refresh token. No password required.

    Returns same shape as login() but without refresh_token.
    """
    _require_config()
    client = _get_client()
    try:
        resp = client.initiate_auth(
            AuthFlow="REFRESH_TOKEN_AUTH",
            ClientId=CLIENT_ID,
            AuthParameters=_auth_params(email, {"REFRESH_TOKEN": refresh_token}),
        )
        result = resp.get("AuthenticationResult", {})
        logger.info(f"[cognito] refresh_tokens OK — {email}")
        return {
            "access_token": result["AccessToken"],
            "id_token": result["IdToken"],
            "token_type": result.get("TokenType", "Bearer"),
            "expires_in": result.get("ExpiresIn", 3600),
        }
    except ClientError as e:
        raise _map_error(e)


def get_user(access_token: str) -> dict:
    """
    Get user attributes from a valid access token.

    Returns:
        {"username": str, "email": str, "name": str, "sub": str, ...}
    """
    _require_config()
    client = _get_client()
    try:
        resp = client.get_user(AccessToken=access_token)
        attrs = {a["Name"]: a["Value"] for a in resp.get("UserAttributes", [])}
        return {
            "username": resp.get("Username", attrs.get("email", "")),
            "email": attrs.get("email", ""),
            "name": attrs.get("name", ""),
            "sub": attrs.get("sub", ""),
            **{k: v for k, v in attrs.items() if k not in ("email", "name", "sub")},
        }
    except ClientError as e:
        raise _map_error(e)


def update_user_profile(access_token: str, company_name: str, domain: str) -> dict:
    """
    Sets custom:company_name / custom:domain for the CURRENTLY authenticated
    user (via their own access token — no admin credentials needed). Used
    for the one-time profile-completion flow: existing users who signed up
    before these attributes existed are prompted once to fill them in
    (frontend gates on ProfileResponse.has_profile being False).

    Note: this only sets the Cognito attributes. The actual one-to-one
    domain enforcement happens in db.dynamo.check_and_lock_domain, called
    separately by the router right after this succeeds, so both stay
    in sync.
    """
    _require_config()
    client = _get_client()
    try:
        client.update_user_attributes(
            AccessToken=access_token,
            UserAttributes=[
                {"Name": "custom:company_name", "Value": company_name},
                {"Name": "custom:domain", "Value": domain},
            ],
        )
        logger.info(f"[cognito] update_user_profile OK — domain={domain}")
        return {"company_name": company_name, "domain": domain}
    except ClientError as e:
        raise _map_error(e)


def forgot_password(email: str) -> dict:
    """
    Initiate the forgot-password flow — sends a reset code to email.

    Returns:
        {"delivery": str, "message": str}
    """
    _require_config()
    client = _get_client()
    try:
        resp = client.forgot_password(
            ClientId=CLIENT_ID,
            Username=email,
            SecretHash=_secret_hash(email) or "",
        )
        destination = resp.get("CodeDeliveryDetails", {}).get("Destination", email)
        logger.info(f"[cognito] forgot_password OK — {email}")
        return {
            "delivery": destination,
            "message": f"Password reset code sent to {destination}",
        }
    except ClientError as e:
        raise _map_error(e)


def confirm_forgot_password(email: str, code: str, new_password: str) -> dict:
    """
    Complete the forgot-password flow with the reset code and new password.

    Returns:
        {"message": str}
    """
    _require_config()
    client = _get_client()
    try:
        client.confirm_forgot_password(
            ClientId=CLIENT_ID,
            Username=email,
            ConfirmationCode=code,
            Password=new_password,
            SecretHash=_secret_hash(email) or "",
        )
        logger.info(f"[cognito] confirm_forgot_password OK — {email}")
        return {"message": "Password reset successfully. You can now sign in."}
    except ClientError as e:
        raise _map_error(e)