from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from website_analyzer.auth import verify_token

security_scheme = HTTPBearer()


async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> dict:
    try:
        payload = verify_token(credentials.credentials)
        return payload
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


async def require_auth_raw(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> str:
    try:
        verify_token(credentials.credentials)
        return credentials.credentials
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
