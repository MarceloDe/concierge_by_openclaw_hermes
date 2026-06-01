from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    user_id: str = Field(min_length=1)
    session_id: str | None = None
    member: dict[str, Any] | None = None
    use_live_model: bool = False
    resume_latest_session: bool = False
    payload_mode: str = "phi_allowed_identifier_masked_reasoning"
    execute_evidence_observation: bool = False
    require_live_portal_proof: bool = False
    use_official_openclaw_worker: bool = False
    official_openclaw_use_current_tab: bool = False
    official_openclaw_multi_page: bool = False
    approval_token: str | None = None
    approval_task_id: str | None = None
    worker_continuation_id: str | None = None
    approval_scope: str | None = None
    allowed_action: str | None = None
    approved_document_candidate_id: str | None = None


class LocalSessionAuthRequest(BaseModel):
    member: dict[str, Any]
    session_id: str | None = None
    resume_latest_session: bool = False


class LocalSessionAuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user_id: str
    session_id: str | None
    enrollment: dict[str, Any]


class ChatAcceptedResponse(BaseModel):
    session_id: str | None
    task_id: str
    status: Literal["queued", "running", "completed", "failed"]


class TaskStatusResponse(BaseModel):
    task_id: str
    session_id: str | None
    status: Literal["queued", "running", "completed", "failed"]
    result: dict[str, Any] | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str
    node_runtime_url: str
    node_runtime_ok: bool
