import hashlib
import json
import os
from pathlib import Path
from typing import Any

from .hardening import env_truthy, now_iso
from .models import ChatRequest


def observability_metadata() -> dict[str, Any]:
    events_path = os.getenv("WEFELLA_OBSERVABILITY_EVENTS_PATH")
    return {
        "event_export": "jsonl" if events_path else "disabled",
        "events_path_configured": bool(events_path),
        "langsmith_tracing_enabled": env_truthy("LANGSMITH_TRACING", default=False) or env_truthy("LANGCHAIN_TRACING_V2", default=False),
        "langsmith_project_configured": bool(os.getenv("LANGSMITH_PROJECT") or os.getenv("LANGCHAIN_PROJECT")),
        "payload_policy": "hashes_and_safe_status_only"
    }


def record_chat_task_event(
    *,
    event_type: str,
    task_id: str,
    request: ChatRequest,
    status: str,
    source_grounding: dict[str, Any] | None = None,
    error: Exception | str | None = None
) -> dict[str, Any] | None:
    path = os.getenv("WEFELLA_OBSERVABILITY_EVENTS_PATH")
    if not path:
        return None

    payload: dict[str, Any] = {
        "event_type": event_type,
        "created_at": now_iso(),
        "task_id": task_id,
        "status": status,
        "user_id_hash": hash_text(request.user_id),
        "session_id_hash": hash_text(request.session_id or ""),
        "session_id_present": bool(request.session_id),
        "message_hash": hash_text(request.message),
        "message_length": len(request.message),
        "workflow_scope": "healthcare_concierge_facade",
        "source_grounding": source_grounding
    }
    if error is not None:
        error_text = str(error)
        payload["error_type"] = error.__class__.__name__ if isinstance(error, Exception) else "RuntimeError"
        payload["error_hash"] = hash_text(error_text)

    write_jsonl_event(path, payload)
    return payload


def write_jsonl_event(path: str, payload: dict[str, Any]) -> None:
    target = Path(path).expanduser()
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True, separators=(",", ":")))
        handle.write("\n")


def hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
