import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


DEFAULT_JWT_SECRET = "dev-only-change-me"
JWT_ALGORITHM = "HS256"
PROVIDER_AUTH_MODES = {"provider", "production", "external"}
security = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class UserPrincipal:
    user_id: str
    claims: dict[str, Any]
    roles: set[str] = field(default_factory=lambda: {"user"})

    def has_role(self, *required: str) -> bool:
        return bool(self.roles.intersection(required))


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def jwt_secret() -> str:
    return os.getenv("WEFELLA_JWT_SECRET") or os.getenv("JWT_SECRET") or DEFAULT_JWT_SECRET


def _env_truthy(value: str | None) -> bool:
    return str(value or "").strip() in {"1", "true", "TRUE", "yes", "YES", "on", "ON"}


def auth_mode() -> str:
    return (os.getenv("WEFELLA_AUTH_MODE") or "local").strip().lower()


def provider_claims_required() -> bool:
    return auth_mode() in PROVIDER_AUTH_MODES or bool(required_issuer() or required_audience())


def required_issuer() -> str | None:
    return (os.getenv("WEFELLA_JWT_ISSUER") or os.getenv("JWT_ISSUER") or "").strip() or None


def required_audience() -> str | None:
    return (os.getenv("WEFELLA_JWT_AUDIENCE") or os.getenv("JWT_AUDIENCE") or "").strip() or None


def local_auth_enabled() -> bool:
    configured = os.getenv("WEFELLA_ENABLE_LOCAL_AUTH")
    if configured is not None:
        return _env_truthy(configured)
    return auth_mode() not in PROVIDER_AUTH_MODES


def auth_metadata() -> dict[str, Any]:
    return {
        "mode": auth_mode(),
        "algorithm": JWT_ALGORITHM,
        "provider_claims_required": provider_claims_required(),
        "issuer_configured": bool(required_issuer()),
        "audience_configured": bool(required_audience()),
        "local_auth_enabled": local_auth_enabled(),
        "rbac": {
            "enabled": True,
            "default_role": "user",
            "operator_roles": ["operator", "admin"],
            "supported_claims": ["roles", "role", "groups", "permissions", "scope", "scp"]
        }
    }


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


def _token_audiences(payload: dict[str, Any]) -> set[str]:
    value = payload.get("aud")
    if value is None:
        return set()
    if isinstance(value, str):
        return {value}
    if isinstance(value, list):
        return {str(item) for item in value}
    return {str(value)}


def validate_registered_claims(payload: dict[str, Any]) -> None:
    now = int(time.time())
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Bearer token is missing subject.")
    if int(payload.get("exp", 0)) < now:
        raise HTTPException(status_code=401, detail="Bearer token expired.")
    if payload.get("nbf") is not None and int(payload.get("nbf", 0)) > now:
        raise HTTPException(status_code=401, detail="Bearer token is not active yet.")

    issuer = required_issuer()
    audience = required_audience()
    if auth_mode() in PROVIDER_AUTH_MODES and not (issuer and audience):
        raise HTTPException(status_code=500, detail="JWT provider auth is missing issuer or audience configuration.")
    if issuer and payload.get("iss") != issuer:
        raise HTTPException(status_code=401, detail="Bearer token issuer is not trusted.")
    if audience and audience not in _token_audiences(payload):
        raise HTTPException(status_code=401, detail="Bearer token audience is not allowed.")


def principal_roles(claims: dict[str, Any]) -> set[str]:
    roles: set[str] = {"user"}
    for key in ("roles", "role", "groups", "permissions"):
        value = claims.get(key)
        if isinstance(value, str):
            roles.update(part.strip().lower() for part in value.replace(",", " ").split() if part.strip())
        elif isinstance(value, list):
            roles.update(str(item).strip().lower() for item in value if str(item).strip())
    for key in ("scope", "scp"):
        value = claims.get(key)
        if isinstance(value, str):
            roles.update(part.strip().lower() for part in value.split() if part.strip())
        elif isinstance(value, list):
            roles.update(str(item).strip().lower() for item in value if str(item).strip())
    return roles


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
    validate_registered_claims(payload)
    return payload


async def require_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> UserPrincipal:
    if not credentials:
        raise HTTPException(status_code=401, detail="Bearer token required.")
    claims = decode_access_token(credentials.credentials)
    return UserPrincipal(user_id=str(claims["sub"]), claims=claims, roles=principal_roles(claims))


async def require_operator(principal: UserPrincipal = Depends(require_user)) -> UserPrincipal:
    if not principal.has_role("operator", "admin"):
        raise HTTPException(status_code=403, detail="Operator role required.")
    return principal


async def require_admin(principal: UserPrincipal = Depends(require_user)) -> UserPrincipal:
    if not principal.has_role("admin"):
        raise HTTPException(status_code=403, detail="Admin role required.")
    return principal
