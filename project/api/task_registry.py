import asyncio
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4


TaskStatus = Literal["queued", "running", "completed", "failed"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class TaskRegistry:
    def __init__(self) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def create(self, *, user_id: str, session_id: str | None = None) -> dict[str, Any]:
        task_id = f"task_{uuid4()}"
        task = {
            "task_id": task_id,
            "user_id": user_id,
            "session_id": session_id,
            "status": "queued",
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "result": None,
            "error": None,
            "events": [{"event": "queued", "created_at": now_iso()}]
        }
        async with self._lock:
            self._tasks[task_id] = task
        return task.copy()

    async def update(self, task_id: str, *, status: TaskStatus | None = None, session_id: str | None = None, result: dict[str, Any] | None = None, error: str | None = None, event: str | None = None) -> dict[str, Any] | None:
        async with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            if status:
                task["status"] = status
            if session_id:
                task["session_id"] = session_id
            if result is not None:
                task["result"] = result
            if error is not None:
                task["error"] = error
            task["updated_at"] = now_iso()
            if event or status:
                task["events"].append({"event": event or status, "created_at": now_iso()})
            return task.copy()

    async def get(self, task_id: str) -> dict[str, Any] | None:
        async with self._lock:
            task = self._tasks.get(task_id)
            return task.copy() if task else None
