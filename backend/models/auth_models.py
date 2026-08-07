"""
models/auth_models.py — Pydantic schemas for Cognito auth endpoints
"""
from __future__ import annotations
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import re


# ── Validators ─────────────────────────────────────────────────────────────────

def _validate_email(v: str) -> str:
    v = v.strip().lower()
    if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v):
        raise ValueError("Invalid email address")
    return v


def _validate_password(v: str) -> str:
    """
    Cognito default policy: min 8 chars, upper, lower, digit, symbol.
    Adjust to match your User Pool's actual password policy.
    """
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?]", v):
        raise ValueError("Password must contain at least one special character")
    return v


def _validate_otp(v: str) -> str:
    v = v.strip()
    if not re.match(r"^\d{6}$", v):
        raise ValueError("Verification code must be exactly 6 digits")
    return v


# ── Request schemas ────────────────────────────────────────────────────────────

class SignUpRequest(BaseModel):
    email:        str = Field(..., example="jane@company.com")
    password:     str = Field(..., example="Str0ng!Pass", min_length=8)
    full_name:    str = Field(..., example="Jane Smith", min_length=2, max_length=100)
    company_name: str = Field(..., example="Acme Relocation", min_length=1, max_length=200)
    domain:       str = Field(..., example="acmerelocation.com", min_length=1, max_length=253,
                               description="The company's website/domain — locked to this account permanently (one domain per account).")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v): return _validate_email(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v): return _validate_password(v)

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Full name is required")
        return v

    @field_validator("company_name")
    @classmethod
    def validate_company_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Company name is required")
        return v

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Domain is required")
        return v


class VerifyEmailRequest(BaseModel):
    email: str = Field(..., example="jane@company.com")
    code:  str = Field(..., example="123456", min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v): return _validate_email(v)

    @field_validator("code")
    @classmethod
    def validate_code(cls, v): return _validate_otp(v)


class ResendCodeRequest(BaseModel):
    email: str = Field(..., example="jane@company.com")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v): return _validate_email(v)


class LoginRequest(BaseModel):
    email:    str = Field(..., example="jane@company.com")
    password: str = Field(..., example="Str0ng!Pass")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v): return _validate_email(v)


class RefreshTokenRequest(BaseModel):
    email:         str = Field(..., example="jane@company.com")
    refresh_token: str = Field(..., description="Refresh token from previous login response")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v): return _validate_email(v)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., example="jane@company.com")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v): return _validate_email(v)


class ConfirmForgotPasswordRequest(BaseModel):
    email:        str = Field(..., example="jane@company.com")
    code:         str = Field(..., example="123456")
    new_password: str = Field(..., example="NewStr0ng!Pass")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v): return _validate_email(v)

    @field_validator("code")
    @classmethod
    def validate_code(cls, v): return _validate_otp(v)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v): return _validate_password(v)


# ── Response schemas ───────────────────────────────────────────────────────────

class SignUpResponse(BaseModel):
    user_sub:  str
    confirmed: bool
    delivery:  str
    message:   str


class VerifyEmailResponse(BaseModel):
    confirmed: bool
    message:   str


class ResendCodeResponse(BaseModel):
    delivery: str
    message:  str


class TokenResponse(BaseModel):
    access_token:  str
    id_token:      str
    refresh_token: str
    token_type:    str = "Bearer"
    expires_in:    int


class RefreshTokenResponse(BaseModel):
    access_token: str
    id_token:     str
    token_type:   str = "Bearer"
    expires_in:   int


class UserResponse(BaseModel):
    username: str
    email:    str
    name:     str
    sub:      str


class MessageResponse(BaseModel):
    message: str


class AuthErrorResponse(BaseModel):
    error:   str
    code:    str
    message: str


# ── Profile (company_name / domain) ─────────────────────────────────────────
# Every new signup captures these (see SignUpRequest above). Users who signed
# up before this existed have neither attribute set in Cognito — the
# frontend treats a missing `domain` as "must complete profile before doing
# anything else" and calls SetProfileRequest exactly once (this is also the
# one-to-one user<->domain lock — see db.dynamo.check_and_lock_domain, which
# validates every analysis request's URL against whatever is stored here).

class ProfileResponse(BaseModel):
    company_name: Optional[str] = None
    domain:       Optional[str] = None
    has_profile:  bool  # False = must complete profile before using the app


class SetProfileRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200)
    domain:       str = Field(..., min_length=1, max_length=253)

    @field_validator("company_name")
    @classmethod
    def validate_company_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Company name is required")
        return v

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Domain is required")
        return v
