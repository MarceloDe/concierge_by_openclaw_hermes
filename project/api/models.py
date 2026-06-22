from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    user_id: str = Field(min_length=1)
    session_id: str | None = None
    member: dict[str, Any] | None = None
    use_live_model: bool = True
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


V1TaskLifecycleStatus = Literal[
    "queued",
    "running",
    "approval_pending",
    "evidence_blocked",
    "completed",
    "refused",
    "failed"
]


class V1SessionRequest(BaseModel):
    member: dict[str, Any]
    session_id: str | None = None
    resume_latest_session: bool = False
    client_context: dict[str, Any] = Field(default_factory=dict)


class V1SessionResponse(BaseModel):
    version: str
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user_id: str
    session_id: str | None
    public_api_base: Literal["/api/v1"] = "/api/v1"
    enrollment: dict[str, Any]


class V1TaskRequest(BaseModel):
    journey: str = Field(default="general_rag", min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=8000)
    session_id: str | None = None
    evidence_ids: list[str] = Field(default_factory=list, max_length=5)
    client_context: dict[str, Any] = Field(default_factory=dict)
    member: dict[str, Any] | None = None
    use_live_model: bool = True
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


class V1TaskProposal(BaseModel):
    proposed_subtasks: list[str] = Field(default_factory=list)
    required_evidence: list[str] = Field(default_factory=list)
    selected_skill: str | None = None
    selected_executor: str | None = None
    approval_requirement: dict[str, Any] = Field(default_factory=dict)
    blocked_actions: list[str] = Field(default_factory=list)
    fallback_path: list[str] = Field(default_factory=list)
    terminal_outcome: str | None = None


class V1TaskAcceptedResponse(BaseModel):
    version: str
    task_id: str
    session_id: str | None
    status: Literal["queued"]
    links: dict[str, str]


class V1TaskStatusResponse(BaseModel):
    version: str
    task_id: str
    session_id: str | None
    status: V1TaskLifecycleStatus
    raw_status: str
    answer: str | None = None
    proposal: V1TaskProposal | None = None
    source_pointers: list[dict[str, Any]] = Field(default_factory=list)
    ai2ui_blocks: list[dict[str, Any]] = Field(default_factory=list)
    events: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None
    result: dict[str, Any] | None = None


class V1ApprovalRequest(BaseModel):
    decision: Literal["approved", "rejected"] = "approved"
    action_type: str = Field(default="read_only_observation", min_length=1, max_length=160)
    scope: str = Field(default="read_only_observation", min_length=1, max_length=160)
    approval_task_id: str | None = None
    evidence_summary: dict[str, Any] = Field(default_factory=dict)
    expires_at: str | None = None
    reason: str | None = Field(default=None, max_length=2000)


class V1BrowserSessionRequest(BaseModel):
    session_id: str = Field(min_length=1)
    target_url: str | None = None
    provider: Literal["local_cdp", "hosted_remote"] = "local_cdp"
    options: dict[str, Any] = Field(default_factory=dict)


class V1BrowserSessionResponse(BaseModel):
    version: str
    browser_session_id: str
    provider: Literal["local_cdp", "hosted_remote"]
    session_id: str
    user_id: str
    stream_url: str
    takeover_state: str
    current_url: str | None = None
    current_title: str | None = None
    readiness: dict[str, Any] = Field(default_factory=dict)
    ocr_caption: dict[str, Any] = Field(default_factory=dict)
    screencast: dict[str, Any] = Field(default_factory=dict)


class V1BrowserInputRequest(BaseModel):
    takeover_id: str = Field(min_length=1)
    grant_token: str = Field(min_length=1)
    input: dict[str, Any]


class V1BrowserTakeoverRequest(BaseModel):
    mode: Literal["request", "grant", "end"] = "request"
    takeover_id: str | None = None
    grant_token: str | None = None
    reason: str | None = Field(default="user_password_or_captcha", max_length=400)
    approved_by: str | None = Field(default="user", max_length=120)


class V1ProofRunResponse(BaseModel):
    version: str
    run_id: str
    status: Literal["passing", "failing", "blocked", "not_run"]
    cycle: str
    goals: list[dict[str, Any]]
    checks: list[dict[str, Any]]
    visual_artifacts: list[dict[str, Any]]
    scores: list[dict[str, Any]]
    safety: dict[str, Any]


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
