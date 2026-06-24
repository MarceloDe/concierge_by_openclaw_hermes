from __future__ import annotations

import os
from pathlib import Path


_LOADED_PATHS: set[str] = set()


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _parse_env_line(line: str) -> tuple[str, str] | None:
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in stripped:
        return None
    key, value = stripped.split("=", 1)
    key = key.strip()
    value = value.strip()
    if not key:
        return None
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        value = value[1:-1]
    return key, value


def load_local_env_once(path: str | None = None) -> dict[str, object]:
    """Load local facade/runtime config without overriding explicit process env.

    The Node runtime already loads `.env.local`; FastAPI needs the same local
    behavior so the default facade can reach the configured Steel sandbox. This
    loader is intentionally small and conservative: explicit env wins, missing
    local files are ignored, and secret values are never returned.
    """

    env_path = Path(path or os.environ.get("WEFELLA_FACADE_LOCAL_ENV_FILE") or (_repo_root() / ".env.local"))
    env_path = env_path.expanduser()
    if not env_path.is_absolute():
        env_path = (_repo_root() / env_path).resolve()
    cache_key = str(env_path)
    if cache_key in _LOADED_PATHS:
        return {"loaded": False, "path": cache_key, "reason": "already_loaded", "applied_keys": []}
    _LOADED_PATHS.add(cache_key)
    if not env_path.exists():
        return {"loaded": False, "path": cache_key, "reason": "missing", "applied_keys": []}

    applied: list[str] = []
    for line in env_path.read_text(encoding="utf-8").splitlines():
        parsed = _parse_env_line(line)
        if parsed is None:
            continue
        key, value = parsed
        if key in os.environ:
            continue
        os.environ[key] = value
        applied.append(key)
    return {"loaded": True, "path": cache_key, "applied_keys": applied}


def load_local_env_if_enabled() -> dict[str, object]:
    if os.environ.get("WEFELLA_FACADE_LOAD_LOCAL_ENV") != "1":
        return {"loaded": False, "reason": "disabled", "applied_keys": []}
    return load_local_env_once()
