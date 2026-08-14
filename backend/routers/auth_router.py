"""
routers/auth_router.py — Cognito authentication endpoints
==========================================================

POST /api/v1/auth/signup              Sign up with email + password + company_name + domain → sends OTP
POST /api/v1/auth/verify              Confirm email with 6-digit OTP
POST /api/v1/auth/resend-code         Resend OTP
POST /api/v1/auth/login               Email + password → access_token + refresh_token
POST /api/v1/auth/refresh             Refresh access token without password
POST /api/v1/auth/forgot-password     Send password reset code to email
POST /api/v1/auth/reset-password      Confirm new password with reset code
GET  /api/v1/auth/me                  Get current user (Bearer token required)
GET  /api/v1/auth/profile             Get company_name/domain + whether profile is complete
POST /api/v1/auth/profile             Set company_name/domain (existing users who signed up before this existed)
"""
import logging
import os

from fastapi import APIRouter, HTTPException, Request, status

from models.auth_models import (
    ConfirmForgotPasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    ProfileResponse,
    RefreshTokenRequest,
    RefreshTokenResponse,
    ResendCodeRequest,
    ResendCodeResponse,
    SetProfileRequest,
    SignUpRequest,
    SignUpResponse,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from services.cognito_service import (
    CognitoError,
    confirm_forgot_password,
    confirm_sign_up,
    forgot_password,
    get_user,
    login,
    refresh_tokens,
    resend_confirmation_code,
    sign_up,
    update_user_profile,
)
from db.dynamo import check_and_lock_domain, DomainMismatchError, register_user, set_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

# Comma-separated allowlist — any signup (or the very first login, as a
# fallback for accounts that existed before this) whose email matches gets
# auto-promoted to admin. Simple, explicit, ops-controlled — no separate
# "make someone an admin" UI needed for the very first admin account; after
# that, admins can promote others via POST /admin/users/{user_id}/set-admin.
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}

# ── Cognito error → HTTP status ────────────────────────────────────────────────
_STATUS = {
    "UsernameExistsException":       status.HTTP_409_CONFLICT,
    "UserNotFoundException":         status.HTTP_404_NOT_FOUND,
    "NotAuthorizedException":        status.HTTP_401_UNAUTHORIZED,
    "CodeMismatchException":         status.HTTP_400_BAD_REQUEST,
    "ExpiredCodeException":          status.HTTP_400_BAD_REQUEST,
    "LimitExceededException":        status.HTTP_429_TOO_MANY_REQUESTS,
    "TooManyRequestsException":      status.HTTP_429_TOO_MANY_REQUESTS,
    "UserNotConfirmedException":     status.HTTP_403_FORBIDDEN,
    "InvalidPasswordException":      status.HTTP_422_UNPROCESSABLE_ENTITY,
    "InvalidParameterException":     status.HTTP_422_UNPROCESSABLE_ENTITY,
    "AliasExistsException":          status.HTTP_409_CONFLICT,
}


def _err(e: CognitoError) -> HTTPException:
    return HTTPException(
        status_code=_STATUS.get(e.code, status.HTTP_400_BAD_REQUEST),
        detail={"code": e.code, "message": e.message},
    )


# ── POST /signup ───────────────────────────────────────────────────────────────
@router.post(
    "/signup",
    response_model=SignUpResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register with email + password — Cognito sends OTP to email",
)
async def signup(req: SignUpRequest):
    """
    Creates a new Cognito user account.

    Cognito immediately sends a **6-digit OTP** to the provided email via SES.
    The user must call **POST /verify** with that code to activate their account
    before they can sign in.

    Password policy (configurable in User Pool):
    - Minimum 8 characters
    - At least one uppercase, lowercase, digit, and special character

    **company_name** and **domain** are required and permanently locked to
    this account — every analysis endpoint validates its `url` against this
    domain (see db.dynamo.check_and_lock_domain). One domain per account.
    """
    try:
        result = sign_up(req.email, req.password, req.full_name, req.company_name, req.domain)
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Lock the domain immediately (not waiting for the first analysis call) —
    # user_sub is the Cognito user's permanent, stable identifier, same one
    # used as user_id everywhere else once they're logged in.
    try:
        check_and_lock_domain(result["user_sub"], req.domain, req.company_name)
    except DomainMismatchError:
        pass  # first signup for this sub — can't collide with itself
    except Exception as e:
        logger.error(f"[auth] failed to pre-lock domain at signup for {result['user_sub']}: {e}", exc_info=True)
        # Non-fatal — check_and_lock_domain will simply run again (and lock
        # correctly) on this user's first real analysis call instead.

    # Registry entry powers the admin panel's user list — best-effort, a
    # user isn't blocked from signing up if this write fails.
    try:
        register_user(
            user_id=result["user_sub"], email=req.email, full_name=req.full_name,
            company_name=req.company_name, domain=req.domain,
        )
    except Exception as e:
        logger.error(f"[auth] failed to register user in admin registry: {e}", exc_info=True)

    if req.email.strip().lower() in ADMIN_EMAILS:
        try:
            set_admin(result["user_sub"], True)
            logger.info(f"[auth] {req.email} auto-promoted to admin via ADMIN_EMAILS")
        except Exception as e:
            logger.error(f"[auth] failed to auto-promote admin: {e}", exc_info=True)
        try:
            from services.cognito_service import add_user_to_group
            add_user_to_group(req.email)
        except Exception as e:
            logger.warning(f"[auth] Cognito group sync at signup failed (non-fatal, DynamoDB still set): {e}")

    return SignUpResponse(**result)


# ── POST /verify ───────────────────────────────────────────────────────────────
@router.post(
    "/verify",
    response_model=VerifyEmailResponse,
    summary="Verify email address with 6-digit OTP",
)
async def verify(req: VerifyEmailRequest):
    """
    Activates the user account by confirming the OTP sent to their email.

    - **code**: exactly 6 digits, received from Cognito after signup
    - OTP expires after 24 hours — use **POST /resend-code** to get a new one
    - Once verified, the user can sign in via **POST /login**
    """
    try:
        return VerifyEmailResponse(**confirm_sign_up(req.email, req.code))
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── POST /resend-code ──────────────────────────────────────────────────────────
@router.post(
    "/resend-code",
    response_model=ResendCodeResponse,
    summary="Resend email verification OTP",
)
async def resend_code(req: ResendCodeRequest):
    """
    Sends a new OTP to the email. Use when:
    - The original code expired (24-hour default)
    - The email was not received (check spam)

    Subject to Cognito rate limits (typically 5 resends/hour per user).
    """
    try:
        return ResendCodeResponse(**resend_confirmation_code(req.email))
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── POST /login ────────────────────────────────────────────────────────────────
@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate → returns access_token, id_token, refresh_token",
)
async def login_endpoint(req: LoginRequest):
    """
    Authenticates via Cognito **USER_PASSWORD_AUTH** flow.

    Token lifetimes (configurable in User Pool):
    - **access_token**: 1 hour — send as `Authorization: Bearer <token>`
    - **id_token**: 1 hour — contains email, name, sub claims
    - **refresh_token**: 30 days — use **POST /refresh** to get new access tokens

    The user must have verified their email before logging in.
    Unconfirmed users receive `HTTP 403 UserNotConfirmedException`.
    """
    try:
        tokens = login(req.email, req.password)
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    # Backfill for accounts that existed before the admin/registry feature —
    # signup already does this for new accounts, this just catches anyone
    # who signed up earlier. Best-effort, never blocks login.
    try:
        import base64, json as _json
        parts = tokens["id_token"].split(".")
        padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
        claims = _json.loads(base64.urlsafe_b64decode(padded))
        sub = claims.get("sub")
        if sub:
            register_user(
                user_id=sub, email=claims.get("email", req.email),
                full_name=claims.get("name", ""), company_name=claims.get("custom:company_name", ""),
                domain=claims.get("custom:domain", ""),
            )
            if req.email.strip().lower() in ADMIN_EMAILS:
                set_admin(sub, True)
                try:
                    from services.cognito_service import add_user_to_group
                    add_user_to_group(req.email)
                except Exception as ge:
                    logger.warning(f"[auth] Cognito group sync at login failed (non-fatal, DynamoDB still set): {ge}")
    except Exception as e:
        logger.warning(f"[auth] registry/admin backfill at login failed (non-fatal): {e}")

    return TokenResponse(**tokens)


# ── POST /refresh ──────────────────────────────────────────────────────────────
@router.post(
    "/refresh",
    response_model=RefreshTokenResponse,
    summary="Get a new access token using the refresh token",
)
async def refresh(req: RefreshTokenRequest):
    """
    Issues a new **access_token** and **id_token** without requiring the password.

    The refresh_token from the most recent **POST /login** or **/refresh** must be
    provided along with the user's email (required for the SECRET_HASH calculation).

    Refresh tokens are single-use by default in Cognito — each call returns a
    new one. The refresh token is valid for 30 days.
    """
    try:
        return RefreshTokenResponse(**refresh_tokens(req.refresh_token, req.email))
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── POST /forgot-password ──────────────────────────────────────────────────────
@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Send a password reset code to email",
)
async def forgot_password_endpoint(req: ForgotPasswordRequest):
    """
    Sends a 6-digit reset code to the user's verified email.
    Pass the code to **POST /reset-password** with the new password.

    Only works for confirmed users. Unconfirmed users should use **POST /resend-code**.
    """
    try:
        result = forgot_password(req.email)
        return MessageResponse(message=result["message"])
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── POST /reset-password ───────────────────────────────────────────────────────
@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password using the reset code from email",
)
async def reset_password(req: ConfirmForgotPasswordRequest):
    """
    Completes the password reset.

    - **code**: 6-digit code from the forgot-password email
    - **new_password**: must satisfy the User Pool password policy

    After successful reset, the user can sign in with the new password via **POST /login**.
    """
    try:
        result = confirm_forgot_password(req.email, req.code, req.new_password)
        return MessageResponse(message=result["message"])
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── GET /me ────────────────────────────────────────────────────────────────────
@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile",
)
async def get_me(request: Request):
    """
    Returns the logged-in user's Cognito attributes.

    Requires `Authorization: Bearer <access_token>` header.
    The access_token is obtained from **POST /login**.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authorization: Bearer <access_token> header required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty Bearer token")
    try:
        return UserResponse(**get_user(token))
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


def _bearer_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authorization: Bearer <access_token> header required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty Bearer token")
    return token


# ── GET /profile ─────────────────────────────────────────────────────────────
@router.get(
    "/profile",
    response_model=ProfileResponse,
    summary="Get company_name/domain, and whether the user must complete their profile",
)
async def get_profile(request: Request):
    """
    `has_profile=False` means this account signed up before company_name/
    domain were required (or something went wrong at signup) — the frontend
    should block everything except this profile-completion step until
    **POST /profile** is called successfully.
    """
    token = _bearer_token(request)
    try:
        user = get_user(token)
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    company_name = user.get("custom:company_name") or None
    domain = user.get("custom:domain") or None
    sub = user.get("sub")

    # Admin status: check BOTH mechanisms, matching core.security.require_admin
    # exactly — Cognito Groups is canonical (this endpoint already holds the
    # access token, which carries the cognito:groups claim, so no extra
    # network call needed), DynamoDB is the fallback. Previously this only
    # checked DynamoDB, which meant a user added to the "Admins" Cognito
    # group directly (e.g. via the AWS Console, bypassing this app's own
    # promote/demote endpoint) would pass require_admin on every actual
    # admin API call, yet still get routed to the regular user screen at
    # login — inconsistent with what they actually have access to.
    from db.dynamo import is_admin as _is_admin
    admin_flag = bool(_is_admin(sub)) if sub else False
    if not admin_flag:
        try:
            import base64, json as _json
            token = _bearer_token(request)
            parts = token.split(".")
            padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
            claims = _json.loads(base64.urlsafe_b64decode(padded))
            admin_flag = "Admins" in (claims.get("cognito:groups") or [])
        except Exception as e:
            logger.warning(f"[auth] could not read cognito:groups from access token (non-fatal): {e}")

    return ProfileResponse(company_name=company_name, domain=domain, has_profile=bool(domain), is_admin=admin_flag)


# ── POST /profile ────────────────────────────────────────────────────────────
@router.post(
    "/profile",
    response_model=ProfileResponse,
    summary="Set company_name/domain — for existing users completing their profile once",
)
async def set_profile(req: SetProfileRequest, request: Request):
    """
    One-time completion step for accounts that signed up before company_name/
    domain existed. Sets both as Cognito custom attributes AND locks the
    domain in the one-to-one user<->domain mapping (db.dynamo) in the same
    call — a domain already locked to this account (or attempted domain
    already used and mismatched) is rejected with 403, same as any other
    analysis endpoint.
    """
    token = _bearer_token(request)
    try:
        user = get_user(token)
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Could not resolve user identity from token")

    try:
        check_and_lock_domain(user_id, req.domain, req.company_name)
    except DomainMismatchError as e:
        raise HTTPException(status_code=403, detail=str(e))

    try:
        update_user_profile(token, req.company_name, req.domain)
    except CognitoError as e:
        raise _err(e)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return ProfileResponse(company_name=req.company_name, domain=req.domain, has_profile=True)
