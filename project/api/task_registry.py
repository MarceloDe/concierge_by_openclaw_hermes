import asyncio
import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4


TaskStatus = Literal["queued", "running", "completed", "failed"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class TaskRegistry:
    def __init__(self, *, storage_path: str | None = None) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}
        self._storage_path = Path(storage_path).expanduser() if storage_path else None
        self._load_error: str | None = None
        self._load_from_disk()
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
            self._save_locked()
        return copy.deepcopy(task)

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
            self._save_locked()
            return copy.deepcopy(task)

    async def get(self, task_id: str) -> dict[str, Any] | None:
        async with self._lock:
            task = self._tasks.get(task_id)
            return copy.deepcopy(task) if task else None

    async def metadata(self) -> dict[str, Any]:
        async with self._lock:
            return {
                "backend": "json_file" if self._storage_path else "memory",
                "path": str(self._storage_path) if self._storage_path else None,
                "task_count": len(self._tasks),
                "load_error": self._load_error
            }

    def _load_from_disk(self) -> None:
        if not self._storage_path or not self._storage_path.exists():
            return
        try:
            raw = json.loads(self._storage_path.read_text(encoding="utf-8"))
            tasks = raw.get("tasks", raw) if isinstance(raw, dict) else {}
            if not isinstance(tasks, dict):
                raise ValueError("task registry storage must contain a task object map")
            self._tasks = {str(task_id): task for task_id, task in tasks.items() if isinstance(task, dict)}
        except Exception as exc:
            self._load_error = str(exc)
            self._tasks = {}

    def _save_locked(self) -> None:
        if not self._storage_path:
            return
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._storage_path.with_name(f"{self._storage_path.name}.tmp")
        payload = {"saved_at": now_iso(), "tasks": self._tasks}
        tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp_path.replace(self._storage_path)
