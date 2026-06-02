import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


DEFAULT_JWT_SECRET = "dev-only-change-me"
JWT_ALGORITHM = "HS256"
security = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class UserPrincipal:
    user_id: str
    claims: dict[str, Any]


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def jwt_secret() -> str:
    return os.getenv("WEFELLA_JWT_SECRET") or os.getenv("JWT_SECRET") or DEFAULT_JWT_SECRET


def create_access_token(user_id: str, *, expires_in_seconds: int = 24 * 60 * 60, extra_claims: dict[str, Any] | None = None) -> str:
    now = int(time.time())
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + expires_in_seconds,
        **(extra_claims or {})
    }
    signing_input = ".".join(
        [
            _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")),
            _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        ]
    )
    signature = hmac.new(jwt_secret().encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url_encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        header_raw, payload_raw, signature_raw = token.split(".")
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid bearer token.") from exc

    signing_input = f"{header_raw}.{payload_raw}"
    expected = hmac.new(jwt_secret().encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    actual = _b64url_decode(signature_raw)
    if not hmac.compare_digest(expected, actual):
        raise HTTPException(status_code=401, detail="Invalid bearer token signature.")

    try:
        header = json.loads(_b64url_decode(header_raw))
        payload = json.loads(_b64url_decode(payload_raw))
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid bearer token payload.") from exc

    if header.get("alg") != JWT_ALGORITHM:
        raise HTTPException(status_code=401, detail="Unsupported bearer token algorithm.")
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Bearer token is missing subject.")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Bearer token expired.")
    return payload


async def require_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> UserPrincipal:
    if not credentials:
        raise HTTPException(status_code=401, detail="Bearer token required.")
    claims = decode_access_token(credentials.credentials)
    return UserPrincipal(user_id=str(claims["sub"]), claims=claims)
