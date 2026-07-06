import logging
import os
import secrets
import string

import boto3
import requests
from dotenv import load_dotenv
from jose import jwk, jwt
from jose.constants import Algorithms

load_dotenv()

logger = logging.getLogger("ploutos.auth")


def _cognito():
    return boto3.client("cognito-idp", region_name=_region())


def _region() -> str:
    return os.getenv("COGNITO_REGION", "us-east-1")


def _pool_id() -> str:
    pid = os.getenv("COGNITO_USER_POOL_ID")
    if not pid:
        raise RuntimeError("COGNITO_USER_POOL_ID not set")
    return pid


def _client_id() -> str:
    cid = os.getenv("COGNITO_CLIENT_ID")
    if not cid:
        raise RuntimeError("COGNITO_CLIENT_ID not set")
    return cid


_pending_passwords: dict[str, str] = {}


def _generate_password() -> str:
    pw = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
    ]
    chars = string.ascii_letters + string.digits
    pw.extend(secrets.choice(chars) for _ in range(9))
    secrets.SystemRandom().shuffle(pw)
    return "".join(pw)


def register_user(name: str, email: str) -> dict:
    try:
        password = _generate_password()
        _cognito().sign_up(
            ClientId=_client_id(),
            Username=email,
            Password=password,
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "name", "Value": name},
            ],
        )
        _pending_passwords[email] = password
        return {"message": "Verification code sent to email.", "email": email}
    except _cognito().exceptions.UsernameExistsException:
        raise ValueError("An account with this email already exists.")
    except Exception as e:
        raise RuntimeError(f"Registration failed: {e}")


def verify_user(email: str, code: str) -> dict:
    try:
        _cognito().confirm_sign_up(
            ClientId=_client_id(),
            Username=email,
            ConfirmationCode=code,
        )
        password = _pending_passwords.pop(email, None)
        if password:
            response = _cognito().initiate_auth(
                ClientId=_client_id(),
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={"USERNAME": email, "PASSWORD": password},
            )
            auth = response["AuthenticationResult"]
            return {
                "access_token": auth["AccessToken"],
                "refresh_token": auth["RefreshToken"],
                "id_token": auth["IdToken"],
                "expires_in": auth["ExpiresIn"],
                "token_type": "Bearer",
            }
        return {"message": "Email verified successfully.", "email": email}
    except _cognito().exceptions.CodeMismatchException:
        raise ValueError("Invalid verification code.")
    except _cognito().exceptions.ExpiredCodeException:
        raise ValueError("Verification code has expired.")
    except Exception as e:
        raise RuntimeError(f"Verification failed: {e}")


def request_otp(email: str) -> dict:
    try:
        _cognito().forgot_password(
            ClientId=_client_id(),
            Username=email,
        )
        return {"message": "OTP sent to email.", "email": email}
    except _cognito().exceptions.UserNotFoundException:
        raise ValueError("No account found with this email.")
    except Exception as e:
        raise RuntimeError(f"Failed to request OTP: {e}")


def verify_otp(email: str, code: str) -> dict:
    try:
        one_time_password = _generate_password()
        _cognito().confirm_forgot_password(
            ClientId=_client_id(),
            Username=email,
            ConfirmationCode=code,
            Password=one_time_password,
        )
        response = _cognito().initiate_auth(
            ClientId=_client_id(),
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": email,
                "PASSWORD": one_time_password,
            },
        )
        auth = response["AuthenticationResult"]
        return {
            "access_token": auth["AccessToken"],
            "refresh_token": auth["RefreshToken"],
            "id_token": auth["IdToken"],
            "expires_in": auth["ExpiresIn"],
            "token_type": "Bearer",
        }
    except _cognito().exceptions.CodeMismatchException:
        raise ValueError("Invalid OTP code.")
    except _cognito().exceptions.ExpiredCodeException:
        raise ValueError("OTP code has expired.")
    except _cognito().exceptions.NotAuthorizedException as e:
        raise ValueError(f"OTP verification failed: {e}")
    except Exception as e:
        raise RuntimeError(f"OTP verification failed: {e}")


_jwks_cache: dict[str, list[dict]] = {}


def _get_jwk(token: str) -> dict:
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    if not kid:
        raise ValueError("Token is missing 'kid' header")

    jwks_url = f"https://cognito-idp.{_region()}.amazonaws.com/{_pool_id()}/.well-known/jwks.json"

    if jwks_url not in _jwks_cache:
        resp = requests.get(jwks_url, timeout=10)
        resp.raise_for_status()
        _jwks_cache[jwks_url] = resp.json()["keys"]

    for key in _jwks_cache[jwks_url]:
        if key["kid"] == kid:
            return key

    _jwks_cache.pop(jwks_url, None)
    resp = requests.get(jwks_url, timeout=10)
    resp.raise_for_status()
    for key in resp.json()["keys"]:
        if key["kid"] == kid:
            return key

    raise ValueError("No matching signing key found for token")


def verify_token(token: str) -> dict:
    try:
        key = _get_jwk(token)
        public_key = jwk.construct(key)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=[Algorithms.RS256],
            audience=_client_id(),
            issuer=f"https://cognito-idp.{_region()}.amazonaws.com/{_pool_id()}",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired.")
    except jwt.JWTError as e:
        raise ValueError(f"Invalid token: {e}")


def refresh_access_token(refresh_token: str) -> dict:
    try:
        response = _cognito().initiate_auth(
            ClientId=_client_id(),
            AuthFlow="REFRESH_TOKEN_AUTH",
            AuthParameters={"REFRESH_TOKEN": refresh_token},
        )
        auth = response["AuthenticationResult"]
        result = {
            "access_token": auth["AccessToken"],
            "expires_in": auth["ExpiresIn"],
            "token_type": "Bearer",
        }
        if "IdToken" in auth:
            result["id_token"] = auth["IdToken"]
        return result
    except Exception as e:
        raise RuntimeError(f"Token refresh failed: {e}")


def login_with_password(email: str, password: str) -> dict:
    try:
        response = _cognito().initiate_auth(
            ClientId=_client_id(),
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": email, "PASSWORD": password},
        )
        auth = response["AuthenticationResult"]
        return {
            "access_token": auth["AccessToken"],
            "refresh_token": auth["RefreshToken"],
            "id_token": auth["IdToken"],
            "expires_in": auth["ExpiresIn"],
            "token_type": "Bearer",
        }
    except _cognito().exceptions.NotAuthorizedException:
        raise ValueError("Invalid email or password.")
    except _cognito().exceptions.UserNotFoundException:
        raise ValueError("No account found with this email.")
    except _cognito().exceptions.UserNotConfirmedException:
        raise ValueError("Account not verified. Please check your email for the verification code.")
    except Exception as e:
        raise RuntimeError(f"Login failed: {e}")


def forgot_password(email: str) -> dict:
    try:
        _cognito().forgot_password(
            ClientId=_client_id(),
            Username=email,
        )
        return {"message": "Reset code sent to email.", "email": email}
    except _cognito().exceptions.UserNotFoundException:
        raise ValueError("No account found with this email.")
    except Exception as e:
        raise RuntimeError(f"Failed to send reset code: {e}")


def reset_password(email: str, code: str, new_password: str) -> dict:
    try:
        _cognito().confirm_forgot_password(
            ClientId=_client_id(),
            Username=email,
            ConfirmationCode=code,
            Password=new_password,
        )
        response = _cognito().initiate_auth(
            ClientId=_client_id(),
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={"USERNAME": email, "PASSWORD": new_password},
        )
        auth = response["AuthenticationResult"]
        return {
            "access_token": auth["AccessToken"],
            "refresh_token": auth["RefreshToken"],
            "id_token": auth["IdToken"],
            "expires_in": auth["ExpiresIn"],
            "token_type": "Bearer",
        }
    except _cognito().exceptions.CodeMismatchException:
        raise ValueError("Invalid reset code.")
    except _cognito().exceptions.ExpiredCodeException:
        raise ValueError("Reset code has expired.")
    except _cognito().exceptions.InvalidPasswordException as e:
        raise ValueError(f"Invalid password: {e}")
    except Exception as e:
        raise RuntimeError(f"Password reset failed: {e}")


def change_password(access_token: str, current_password: str, new_password: str) -> dict:
    try:
        _cognito().change_password(
            AccessToken=access_token,
            PreviousPassword=current_password,
            ProposedPassword=new_password,
        )
        return {"message": "Password changed successfully."}
    except _cognito().exceptions.NotAuthorizedException:
        raise ValueError("Current password is incorrect.")
    except _cognito().exceptions.InvalidPasswordException as e:
        raise ValueError(f"Invalid new password: {e}")
    except _cognito().exceptions.LimitExceededException:
        raise ValueError("Too many attempts. Try again later.")
    except Exception as e:
        raise RuntimeError(f"Password change failed: {e}")
