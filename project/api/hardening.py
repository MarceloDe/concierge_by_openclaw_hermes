import asyncio
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def env_truthy(name: str, *, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, *, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    reset_at: str | None


class RateLimitExceeded(Exception):
    def __init__(self, decision: RateLimitDecision) -> None:
        self.decision = decision
        super().__init__("Rate limit exceeded.")


class RateLimiter:
    def __init__(self, *, limit_per_minute: int | None = None, enabled: bool | None = None) -> None:
        self.limit_per_minute = limit_per_minute if limit_per_minute is not None else env_int("WEFELLA_RATE_LIMIT_PER_MINUTE", default=120)
        self.enabled = enabled if enabled is not None else not env_truthy("WEFELLA_RATE_LIMIT_DISABLED", default=False)
        self._events: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    def metadata(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "limit_per_minute": self.limit_per_minute,
            "window_seconds": 60
        }

    async def check(self, key: str) -> RateLimitDecision:
        if not self.enabled or self.limit_per_minute <= 0:
            return RateLimitDecision(allowed=True, limit=self.limit_per_minute, remaining=-1, reset_at=None)

        now = time.time()
        window_start = now - 60
        async with self._lock:
            events = [stamp for stamp in self._events.get(key, []) if stamp > window_start]
            if len(events) >= self.limit_per_minute:
                reset_at = now_iso_from_timestamp(events[0] + 60)
                self._events[key] = events
                return RateLimitDecision(allowed=False, limit=self.limit_per_minute, remaining=0, reset_at=reset_at)
            events.append(now)
            self._events[key] = events
            remaining = max(self.limit_per_minute - len(events), 0)
            reset_at = now_iso_from_timestamp(events[0] + 60)
            return RateLimitDecision(allowed=True, limit=self.limit_per_minute, remaining=remaining, reset_at=reset_at)


def now_iso_from_timestamp(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z")


def source_grounding_config() -> dict[str, Any]:
    return {
        "enforced": env_truthy("WEFELLA_ENFORCE_SOURCE_GROUNDING", default=False),
        "policy": "final healthcare answers require source pointers, an approval blocker, or an explicit observation blocker"
    }


def summarize_source_grounding(result: dict[str, Any]) -> dict[str, Any]:
    graph = result.get("graphRun") if isinstance(result.get("graphRun"), dict) else {}
    state = graph.get("state") if isinstance(graph.get("state"), dict) else {}
    evidence = state.get("evidence_observation") if isinstance(state.get("evidence_observation"), dict) else {}
    proposal = state.get("openclaw_skill_proposal") or state.get("openclaw_skill_invocation_proposal")
    proposal = proposal if isinstance(proposal, dict) else {}

    source_pointers = first_list(
        result.get("sourcePointers"),
        result.get("source_pointers"),
        state.get("source_pointers"),
        state.get("sourcePointers"),
        evidence.get("sourcePointers"),
        evidence.get("source_pointers")
    )
    evidence_status = safe_str(evidence.get("status") or result.get("evidenceStatus"))
    workflow = safe_str(state.get("workflow") or result.get("workflow"))
    final_response_present = bool(result.get("finalResponse") or state.get("final_response") or state.get("response"))
    blocker = first_string(
        evidence.get("blocker"),
        evidence.get("reason"),
        evidence.get("error"),
        result.get("blocker"),
        result.get("error")
    )
    approval_status = safe_str((state.get("approval_resume") or {}).get("status") if isinstance(state.get("approval_resume"), dict) else None)
    proposal_status = safe_str(proposal.get("status"))

    source_pointer_count = len(source_pointers)
    if source_pointer_count > 0:
        status = "grounded"
        ok = True
    elif blocker or evidence_status in {"blocked", "blocked_no_authenticated_evidence", "missing_approval_token", "not_authenticated", "failed"}:
        status = "blocked_or_approval_needed"
        ok = True
    elif approval_status in {"pending_approval", "missing_approval_token"} or proposal_status in {"pending_approval", "pending_integration"}:
        status = "blocked_or_approval_needed"
        ok = True
    elif workflow or final_response_present:
        status = "needs_source_or_blocker"
        ok = False
    else:
        status = "not_applicable"
        ok = True

    return {
        "ok": ok,
        "status": status,
        "sourcePointerCount": source_pointer_count,
        "workflow": workflow or None,
        "evidenceStatus": evidence_status or None,
        "approvalStatus": approval_status or None,
        "proposalStatus": proposal_status or None,
        "blocker": blocker,
        "checkedAt": now_iso()
    }


def first_list(*values: Any) -> list[Any]:
    for value in values:
        if isinstance(value, list):
            return value
    return []


def first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def safe_str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""
