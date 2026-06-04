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
    uploaded_document_ids: list[str] = Field(default_factory=list)


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
    auth: dict[str, Any]
    cors: dict[str, Any]
    task_registry: dict[str, Any]
    rate_limit: dict[str, Any]
    source_grounding: dict[str, Any]
    observability: dict[str, Any]
    uploads: dict[str, Any]


class ReadinessResponse(BaseModel):
    status: Literal["ready", "degraded"]
    version: str
    checks: dict[str, Any]


class UploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=240)
    content_type: str = Field(min_length=1, max_length=120)
    content_base64: str = Field(min_length=1)
    session_id: str | None = None
    document_kind: str | None = Field(default=None, max_length=80)


class UploadResponse(BaseModel):
    upload_id: str
    session_id: str | None
    status: Literal["stored", "rejected"]
    filename: str
    content_type: str
    byte_size: int
    sha256: str
    extraction: dict[str, Any]


class UploadExtractionResponse(BaseModel):
    upload_id: str
    session_id: str | None
    filename: str
    content_type: str
    byte_size: int
    sha256: str
    extraction: dict[str, Any]


class FeedbackRequest(BaseModel):
    session_id: str = Field(min_length=1)
    message_id: str | None = None
    task_id: str | None = None
    answer_hash: str | None = None
    rating: Literal["useful", "not_useful", "needs_follow_up", "unsafe_or_wrong"]
    comment: str = Field(default="", max_length=2000)
    metadata: dict[str, Any] = Field(default_factory=dict)
