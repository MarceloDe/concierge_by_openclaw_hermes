from __future__ import annotations

import os
from pathlib import Path


_LOADED_PATHS: set[str] = set()
_APPLIED_ENV_PRIORITIES: dict[str, int] = {}


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

    applied = _apply_env_file(env_path, explicit_keys=set(os.environ), priority=10)
    return {"loaded": True, "path": cache_key, "applied_keys": applied}


def _default_private_env_paths() -> list[Path]:
    configured = os.environ.get("WEFELLA_FACADE_PRIVATE_ENV_FILE")
    if configured:
        return [Path(configured).expanduser()]
    return [
        Path.home() / ".config/workerprototype_openclaw/phase30/phase30-remote.env",
        Path.home() / ".config/workerprototype_openclaw/phase28/phase28.env",
    ]


def _resolve_path(path: str | Path) -> Path:
    env_path = Path(path).expanduser()
    if not env_path.is_absolute():
        env_path = (_repo_root() / env_path).resolve()
    return env_path


def _apply_env_file(env_path: Path, *, explicit_keys: set[str], priority: int) -> list[str]:
    applied: list[str] = []
    for line in env_path.read_text(encoding="utf-8").splitlines():
        parsed = _parse_env_line(line)
        if parsed is None:
            continue
        key, value = parsed
        if key in explicit_keys:
            continue
        current_priority = _APPLIED_ENV_PRIORITIES.get(key)
        if current_priority is not None and current_priority > priority:
            continue
        if key in os.environ and current_priority is None:
            continue
        if key in os.environ and current_priority == priority:
            continue
        os.environ[key] = value
        _APPLIED_ENV_PRIORITIES[key] = priority
        applied.append(key)
    return applied


def _apply_steel_self_host_aliases(*, explicit_keys: set[str], priority: int) -> list[str]:
    applied: list[str] = []
    provider_name = os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME")
    endpoint = os.environ.get("WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL")
    if provider_name != "steel-self-host" or not endpoint:
        return applied

    steel_api_key = "WEFELLA_BROWSER_SANDBOX_STEEL_API_URL"
    if steel_api_key in explicit_keys:
        return applied
    current_priority = _APPLIED_ENV_PRIORITIES.get(steel_api_key)
    if current_priority is not None and current_priority > priority:
        return applied
    if os.environ.get(steel_api_key) == endpoint and current_priority == priority:
        return applied
    if steel_api_key in os.environ and current_priority is None:
        return applied
    os.environ[steel_api_key] = endpoint
    _APPLIED_ENV_PRIORITIES[steel_api_key] = priority
    applied.append(steel_api_key)
    return applied


def load_facade_env_once(
    *,
    local_path: str | None = None,
    private_env_paths: list[str | Path] | None = None,
) -> dict[str, object]:
    """Load default facade runtime env from repo-local and private Steel config.

    Explicit process env always wins. Values loaded from the repo `.env.local`
    are useful for local OpenAI/Node defaults, but private Steel config under
    `~/.config/workerprototype_openclaw/` is the canonical source for the
    selected provider. The returned metadata names files and keys only; it never
    includes secret values.
    """

    explicit_keys = set(os.environ)
    local_result = load_local_env_once(local_path)
    private_results: list[dict[str, object]] = []
    private_paths = private_env_paths if private_env_paths is not None else _default_private_env_paths()
    private_loaded = False
    for candidate in private_paths:
        env_path = _resolve_path(candidate)
        cache_key = str(env_path)
        if private_loaded:
            private_results.append({"loaded": False, "path": cache_key, "reason": "not_selected", "applied_keys": []})
            continue
        if cache_key in _LOADED_PATHS:
            private_results.append({"loaded": False, "path": cache_key, "reason": "already_loaded", "applied_keys": []})
            continue
        _LOADED_PATHS.add(cache_key)
        if not env_path.exists():
            private_results.append({"loaded": False, "path": cache_key, "reason": "missing", "applied_keys": []})
            continue
        applied = _apply_env_file(env_path, explicit_keys=explicit_keys, priority=20)
        private_loaded = True
        alias_applied = _apply_steel_self_host_aliases(explicit_keys=explicit_keys, priority=20)
        private_results.append({"loaded": True, "path": cache_key, "applied_keys": applied + alias_applied})

    return {
        "loaded": bool(local_result.get("loaded") or private_loaded),
        "local": local_result,
        "private": private_results,
        "applied_keys": list(dict.fromkeys(
            list(local_result.get("applied_keys") or [])
            + [key for item in private_results for key in (item.get("applied_keys") or [])]
        )),
    }


def load_local_env_if_enabled() -> dict[str, object]:
    if os.environ.get("WEFELLA_FACADE_LOAD_LOCAL_ENV") != "1":
        return {"loaded": False, "reason": "disabled", "applied_keys": []}
    return load_facade_env_once()


def reset_local_env_loader_for_tests() -> None:
    _LOADED_PATHS.clear()
    _APPLIED_ENV_PRIORITIES.clear()
