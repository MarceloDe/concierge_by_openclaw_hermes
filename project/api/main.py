import asyncio
import json
import os
from uuid import uuid4
from typing import Any

from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .auth import PROVIDER_AUTH_MODES, UserPrincipal, auth_metadata, auth_mode, create_access_token, local_auth_enabled, require_operator, require_user
from .browser_sandbox import (
    BrowserSandboxError,
    describe_browser_sandbox_provider_contract,
    get_browser_sandbox_provider,
    hosted_browser_sandbox_harness_stream,
    hosted_browser_sandbox_provider_stream
)
from .hardening import RateLimitExceeded, RateLimiter, source_grounding_config, summarize_source_grounding
from .models import (
    ChatAcceptedResponse,
    ChatRequest,
    FeedbackRequest,
    HealthResponse,
    LocalSessionAuthRequest,
    LocalSessionAuthResponse,
    ReadinessResponse,
    TaskStatusResponse,
    UploadExtractionResponse,
    UploadRequest,
    UploadResponse,
    V1ApprovalRequest,
    V1BrowserInputRequest,
    V1BrowserSessionRequest,
    V1BrowserSessionResponse,
    V1BrowserTakeoverRequest,
    V1ProofRunResponse,
    V1SessionRequest,
    V1SessionResponse,
    V1TaskAcceptedResponse,
    V1TaskProposal,
    V1TaskRequest,
    V1TaskStatusResponse
)
from .node_client import NodeRuntimeClient
from .observability import observability_metadata, record_chat_task_event
from .task_registry import TaskRegistry
from .uploads import UploadStore, UploadStoreError


VERSION = "0.1.0-phase10s-ai2ui-modes"
LOCAL_AUTH_TOKEN_SECONDS = 24 * 60 * 60


def allowed_origins() -> list[str]:
    raw = os.getenv("WEFELLA_ALLOWED_ORIGINS")
    if raw is None and auth_mode() in PROVIDER_AUTH_MODES:
        return []
    raw = raw or "http://localhost:3000,http://127.0.0.1:4173,http://127.0.0.1:8000"
    return [item.strip() for item in raw.split(",") if item.strip()]


def cors_metadata() -> dict[str, Any]:
    origins = allowed_origins()
    explicitly_configured = "WEFELLA_ALLOWED_ORIGINS" in os.environ
    return {
        "allowed_origins": origins,
        "explicitly_configured": explicitly_configured,
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "PATCH", "OPTIONS"],
        "allow_headers": ["authorization", "content-type", "x-request-id"],
        "production_safe": "*" not in origins and (auth_mode() not in PROVIDER_AUTH_MODES or explicitly_configured)
    }


def create_app(*, inline_tasks: bool = False) -> FastAPI:
    app = FastAPI(title="Wefella Concierge API", version=VERSION)
    origins = allowed_origins()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["authorization", "content-type", "x-request-id"]
    )
    app.state.registry = TaskRegistry(storage_path=os.getenv("WEFELLA_TASK_REGISTRY_PATH") or None)
    app.state.node_client = NodeRuntimeClient()
    app.state.rate_limiter = RateLimiter()
    app.state.upload_store = UploadStore()
    app.state.browser_sessions = {}

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or f"req_{uuid4()}"
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        headers = {"Retry-After": "60"}
        if exc.decision.reset_at:
            headers["x-ratelimit-reset"] = exc.decision.reset_at
        return error_response(
            request,
            status_code=429,
            code="rate_limited",
            message="Rate limit exceeded.",
            details={"limit": exc.decision.limit, "remaining": exc.decision.remaining, "reset_at": exc.decision.reset_at},
            headers=headers
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        details = exc.detail if isinstance(exc.detail, dict) else None
        return error_response(
            request,
            status_code=exc.status_code,
            code=http_error_code(exc.status_code),
            message=message,
            details=details,
            headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(
            request,
            status_code=422,
            code="validation_error",
            message="Request validation failed.",
            details={"errors": safe_validation_errors(exc)}
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return error_response(
            request,
            status_code=500,
            code="internal_error",
            message="Internal server error.",
            details={"type": exc.__class__.__name__}
        )

    @app.get("/api/health", response_model=HealthResponse)
    async def health(request_context: Request) -> HealthResponse:
        await enforce_rate_limit(app, request_context, scope="health")
        node_ok = await app.state.node_client.health()
        return HealthResponse(
            status="ok",
            version=VERSION,
            node_runtime_url=app.state.node_client.base_url,
            node_runtime_ok=node_ok,
            auth=auth_metadata(),
            cors=cors_metadata(),
            task_registry=await app.state.registry.metadata(),
            rate_limit=app.state.rate_limiter.metadata(),
            source_grounding=source_grounding_config(),
            observability=observability_metadata(),
            uploads=app.state.upload_store.metadata()
        )

    @app.get("/api/readiness", response_model=ReadinessResponse)
    async def readiness(request_context: Request) -> ReadinessResponse:
        await enforce_rate_limit(app, request_context, scope="readiness")
        node_ok = await app.state.node_client.health()
        checks = await readiness_checks(app, node_ok=node_ok)
        degraded = any(not check.get("ok", False) and check.get("severity") == "error" for check in checks.values())
        return ReadinessResponse(
            status="degraded" if degraded else "ready",
            version=VERSION,
            checks=checks
        )

    @app.post("/api/auth/local-session", response_model=LocalSessionAuthResponse)
    async def local_session(request_context: Request, request: LocalSessionAuthRequest) -> LocalSessionAuthResponse:
        await enforce_rate_limit(app, request_context, scope="auth")
        if not local_auth_enabled():
            raise HTTPException(status_code=403, detail="Local facade auth is disabled.")
        enrollment = await app.state.node_client.auth_start(request)
        user_id = enrollment.get("user", {}).get("id")
        if not user_id:
            raise HTTPException(status_code=502, detail="Node runtime did not return a user id.")
        session_id = enrollment.get("session", {}).get("id")
        token = create_access_token(str(user_id), expires_in_seconds=LOCAL_AUTH_TOKEN_SECONDS, extra_claims={"auth_mode": "local_mvp_facade"})
        return LocalSessionAuthResponse(
            access_token=token,
            expires_in=LOCAL_AUTH_TOKEN_SECONDS,
            user_id=str(user_id),
            session_id=session_id,
            enrollment=enrollment
        )

    @app.get("/api/v1/health", response_model=HealthResponse)
    async def v1_health(request_context: Request) -> HealthResponse:
        await enforce_rate_limit(app, request_context, scope="health")
        node_ok = await app.state.node_client.health()
        return HealthResponse(
            status="ok",
            version=VERSION,
            node_runtime_url=app.state.node_client.base_url,
            node_runtime_ok=node_ok,
            auth=auth_metadata(),
            cors=cors_metadata(),
            task_registry=await app.state.registry.metadata(),
            rate_limit=app.state.rate_limiter.metadata(),
            source_grounding=source_grounding_config(),
            observability=observability_metadata(),
            uploads=app.state.upload_store.metadata()
        )

    @app.get("/api/v1/readiness", response_model=ReadinessResponse)
    async def v1_readiness(request_context: Request) -> ReadinessResponse:
        await enforce_rate_limit(app, request_context, scope="readiness")
        node_ok = await app.state.node_client.health()
        checks = await readiness_checks(app, node_ok=node_ok)
        degraded = any(not check.get("ok", False) and check.get("severity") == "error" for check in checks.values())
        return ReadinessResponse(status="degraded" if degraded else "ready", version=VERSION, checks=checks)

    @app.post("/api/v1/sessions", response_model=V1SessionResponse)
    async def v1_create_session(request_context: Request, request: V1SessionRequest) -> V1SessionResponse:
        await enforce_rate_limit(app, request_context, scope="auth")
        if not local_auth_enabled():
            raise HTTPException(status_code=403, detail="Local facade auth is disabled.")
        enrollment = await app.state.node_client.auth_start(
            LocalSessionAuthRequest(
                member=request.member,
                session_id=request.session_id,
                resume_latest_session=request.resume_latest_session
            )
        )
        user_id = enrollment.get("user", {}).get("id")
        if not user_id:
            raise HTTPException(status_code=502, detail="Node runtime did not return a user id.")
        session_id = enrollment.get("session", {}).get("id")
        token = create_access_token(str(user_id), expires_in_seconds=LOCAL_AUTH_TOKEN_SECONDS, extra_claims={"auth_mode": "local_v1_connector"})
        return V1SessionResponse(
            version=VERSION,
            access_token=token,
            expires_in=LOCAL_AUTH_TOKEN_SECONDS,
            user_id=str(user_id),
            session_id=session_id,
            enrollment=enrollment
        )

    @app.post("/api/v1/tasks", response_model=V1TaskAcceptedResponse)
    async def v1_create_task(request_context: Request, request: V1TaskRequest, principal: UserPrincipal = Depends(require_user)) -> V1TaskAcceptedResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_tasks")
        chat_request = chat_request_from_v1_task(request, principal)
        uploaded_documents = upload_documents_for_chat(app, chat_request, principal)
        task = await app.state.registry.create(user_id=principal.user_id, session_id=request.session_id)
        if inline_tasks:
            await run_chat_task(app, task["task_id"], chat_request, uploaded_documents=uploaded_documents)
        else:
            asyncio.create_task(run_chat_task(app, task["task_id"], chat_request, uploaded_documents=uploaded_documents))
        return V1TaskAcceptedResponse(
            version=VERSION,
            task_id=task["task_id"],
            session_id=request.session_id,
            status="queued",
            links=v1_task_links(task["task_id"])
        )

    @app.get("/api/v1/tasks/{task_id}", response_model=V1TaskStatusResponse)
    async def v1_task_status(task_id: str, request_context: Request, principal: UserPrincipal = Depends(require_user)) -> V1TaskStatusResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_task_status")
        task = await task_for_user(app, task_id, principal)
        return v1_task_status_from_registry_task(task)

    @app.get("/api/v1/tasks/{task_id}/events")
    async def v1_task_events(task_id: str, request_context: Request, principal: UserPrincipal = Depends(require_user)) -> StreamingResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_task_events")
        await task_for_user(app, task_id, principal)
        return StreamingResponse(task_event_stream(app.state.registry, task_id), media_type="text/event-stream")

    @app.post("/api/v1/tasks/{task_id}/approvals")
    async def v1_task_approval(task_id: str, request_context: Request, request: V1ApprovalRequest, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_approvals")
        task = await task_for_user(app, task_id, principal)
        approval_task_id = request.approval_task_id or approval_task_id_from_task(task)
        if not approval_task_id:
            raise HTTPException(status_code=409, detail="Task has no pending approval proposal.")
        scoped_body = {
            "taskId": approval_task_id,
            "approvalTaskId": approval_task_id,
            "decision": request.decision,
            "approvalScope": request.scope,
            "allowedAction": request.action_type,
            "evidenceSummary": request.evidence_summary,
            "expiresAt": request.expires_at,
            "reason": request.reason,
            "userId": principal.user_id
        }
        result = await app.state.node_client.post_json("/api/orchestrator/approve", scoped_body)
        return {"version": VERSION, "task_id": task_id, "approval_task_id": approval_task_id, **result}

    @app.post("/api/v1/documents", response_model=UploadResponse)
    async def v1_create_document(request_context: Request, request: UploadRequest, principal: UserPrincipal = Depends(require_user)) -> UploadResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_documents")
        try:
            payload = app.state.upload_store.create_upload(user_id=principal.user_id, request=request)
        except UploadStoreError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        return UploadResponse(**payload)

    @app.get("/api/v1/openclaw/readiness")
    async def v1_openclaw_readiness(request_context: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_openclaw_readiness")
        return await app.state.node_client.get_json("/api/openclaw/official/status")

    @app.post("/api/v1/browser/sessions", response_model=V1BrowserSessionResponse)
    async def v1_create_browser_session(request_context: Request, request: V1BrowserSessionRequest, principal: UserPrincipal = Depends(require_user)) -> V1BrowserSessionResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_browser")
        try:
            provider = get_browser_sandbox_provider(request.provider)
            session = await provider.create_session(
                node_client=app.state.node_client,
                user_id=principal.user_id,
                session_id=request.session_id,
                target_url=request.target_url,
                options=request.options
            )
        except BrowserSandboxError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        app.state.browser_sessions[session["browser_session_id"]] = session
        return V1BrowserSessionResponse(
            version=VERSION,
            browser_session_id=session["browser_session_id"],
            provider=session["provider"],
            session_id=session["session_id"],
            user_id=session["user_id"],
            stream_url=f"/api/v1/browser/sessions/{session['browser_session_id']}/stream",
            takeover_state=session["takeover_state"],
            current_url=session.get("current_url"),
            current_title=session.get("current_title"),
            readiness=session.get("readiness") or {},
            ocr_caption=session.get("ocr_caption") or {},
            screencast=session.get("screencast") or {}
        )

    @app.get("/api/v1/browser/sessions/{browser_session_id}/stream")
    async def v1_browser_stream(browser_session_id: str, request_context: Request, principal: UserPrincipal = Depends(require_user)) -> StreamingResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_browser_stream")
        browser_session = browser_session_for_user(app, browser_session_id, principal)
        if browser_session.get("provider") == "hosted_remote" and browser_session.get("adapter_mode") == "contract_harness":
            return StreamingResponse(hosted_browser_sandbox_harness_stream(browser_session), media_type="text/event-stream")
        if browser_session.get("provider") == "hosted_remote" and browser_session.get("provider_live_connected") is True:
            return StreamingResponse(hosted_browser_sandbox_provider_stream(browser_session), media_type="text/event-stream")
        params = {"sessionId": browser_session["session_id"], "userId": principal.user_id}
        return StreamingResponse(node_stream(app, "/api/runtime/browser/frames/stream", params), media_type="text/event-stream")

    @app.post("/api/v1/browser/sessions/{browser_session_id}/webrtc/offer")
    async def v1_browser_webrtc_offer(browser_session_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_browser_webrtc_offer")
        browser_session = browser_session_for_user(app, browser_session_id, principal)
        if browser_session.get("provider") != "hosted_remote":
            raise HTTPException(status_code=400, detail="WebRTC signaling is available only for hosted remote browser sessions.")
        provider = get_browser_sandbox_provider(browser_session["provider"])
        try:
            result = await provider.exchange_webrtc_offer(
                browser_session=browser_session,
                offer_ref=str(body.get("offer_ref") or body.get("offerRef") or ""),
                ice_candidate_ref=body.get("ice_candidate_ref") or body.get("iceCandidateRef")
            )
        except BrowserSandboxError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"version": VERSION, **result}

    @app.post("/api/v1/browser/sessions/{browser_session_id}/input")
    async def v1_browser_input(browser_session_id: str, request_context: Request, request: V1BrowserInputRequest, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_browser_input")
        browser_session = browser_session_for_user(app, browser_session_id, principal)
        provider = get_browser_sandbox_provider(browser_session["provider"])
        return await provider.send_input(
            node_client=app.state.node_client,
            browser_session=browser_session,
            takeover_id=request.takeover_id,
            grant_token=request.grant_token,
            input_payload=request.input
        )

    @app.post("/api/v1/browser/sessions/{browser_session_id}/takeover")
    async def v1_browser_takeover(browser_session_id: str, request_context: Request, request: V1BrowserTakeoverRequest, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_browser_takeover")
        browser_session = browser_session_for_user(app, browser_session_id, principal)
        provider = get_browser_sandbox_provider(browser_session["provider"])
        if request.mode == "request":
            result = await provider.request_takeover(node_client=app.state.node_client, browser_session=browser_session, reason=request.reason)
        elif request.mode == "grant":
            if not request.takeover_id:
                raise HTTPException(status_code=400, detail="takeover_id is required for grant mode.")
            result = await provider.grant_takeover(node_client=app.state.node_client, browser_session=browser_session, takeover_id=request.takeover_id, approved_by=request.approved_by)
        else:
            if not request.takeover_id:
                raise HTTPException(status_code=400, detail="takeover_id is required for end mode.")
            result = await provider.end_takeover(node_client=app.state.node_client, browser_session=browser_session, takeover_id=request.takeover_id)
        return {"version": VERSION, "browser_session_id": browser_session_id, **result}

    @app.get("/api/v1/proof/runs/{run_id}", response_model=V1ProofRunResponse)
    async def v1_proof_run(run_id: str, request_context: Request, principal: UserPrincipal = Depends(require_user)) -> V1ProofRunResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="v1_proof")
        node_ok = await app.state.node_client.health()
        checks = await readiness_checks(app, node_ok=node_ok)
        return V1ProofRunResponse(**build_connector_proof_run(run_id, checks=checks, actor_user_id=principal.user_id))

    @app.post("/api/chat", response_model=ChatAcceptedResponse)
    async def chat(request_context: Request, request: ChatRequest, principal: UserPrincipal = Depends(require_user)) -> ChatAcceptedResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="chat")
        if principal.user_id != request.user_id:
            raise HTTPException(status_code=403, detail="JWT subject must match request user_id.")
        uploaded_documents = upload_documents_for_chat(app, request, principal)
        task = await app.state.registry.create(user_id=principal.user_id, session_id=request.session_id)
        if inline_tasks:
            await run_chat_task(app, task["task_id"], request, uploaded_documents=uploaded_documents)
        else:
            asyncio.create_task(run_chat_task(app, task["task_id"], request, uploaded_documents=uploaded_documents))
        return ChatAcceptedResponse(session_id=request.session_id, task_id=task["task_id"], status="queued")

    @app.get("/api/chat/status/{task_id}", response_model=TaskStatusResponse)
    async def chat_status(task_id: str, request_context: Request, principal: UserPrincipal = Depends(require_user)) -> TaskStatusResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="chat_status")
        task = await task_for_user(app, task_id, principal)
        return TaskStatusResponse(**task)

    @app.get("/api/chat/stream/{task_id}")
    async def chat_stream(task_id: str, request_context: Request, principal: UserPrincipal = Depends(require_user)) -> StreamingResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="chat_stream")
        await task_for_user(app, task_id, principal)
        return StreamingResponse(task_event_stream(app.state.registry, task_id), media_type="text/event-stream")

    @app.post("/api/orchestrator/approve")
    async def approve(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="approve")
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json("/api/orchestrator/approve", scoped_body)

    @app.get("/api/openclaw/official/status")
    async def openclaw_status(request_context: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="openclaw_status")
        return await app.state.node_client.get_json("/api/openclaw/official/status")

    @app.get("/api/runtime/events")
    async def runtime_events(request: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="runtime_events")
        params = query_for_user(request, principal)
        return await app.state.node_client.get_json("/api/runtime/events", params=params)

    @app.get("/api/runtime/events/stream")
    async def runtime_events_stream(request: Request, principal: UserPrincipal = Depends(require_user)) -> StreamingResponse:
        await enforce_rate_limit(app, request, principal=principal, scope="runtime_events_stream")
        params = query_for_user(request, principal)
        return StreamingResponse(node_stream(app, "/api/runtime/events/stream", params), media_type="text/event-stream")

    @app.get("/api/worker-continuations")
    async def worker_continuations(request: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="worker_continuations")
        params = query_for_user(request, principal)
        return await app.state.node_client.get_json("/api/worker-continuations", params=params)

    @app.get("/api/handoffs")
    async def handoffs(request: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="handoffs")
        params = query_for_user(request, principal)
        return await app.state.node_client.get_json("/api/handoffs", params=params)

    @app.post("/api/worker-continuations")
    async def create_worker_continuation(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="worker_continuations")
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json("/api/worker-continuations", scoped_body)

    @app.post("/api/worker-continuations/{continuation_id}/cancel")
    async def cancel_worker_continuation(continuation_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="worker_continuations")
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json(f"/api/worker-continuations/{continuation_id}/cancel", scoped_body)

    @app.post("/api/worker-continuations/{continuation_id}/continue")
    async def continue_worker_continuation(continuation_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="worker_continuations")
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json(f"/api/worker-continuations/{continuation_id}/continue", scoped_body)

    @app.get("/api/document-candidates")
    async def document_candidates(request: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="document_candidates")
        params = query_for_user(request, principal)
        return await app.state.node_client.get_json("/api/document-candidates", params=params)

    @app.post("/api/document-candidates/propose")
    async def propose_document_candidate(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="document_candidates")
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json("/api/document-candidates/propose", scoped_body)

    @app.post("/api/uploads", response_model=UploadResponse)
    async def create_upload(request_context: Request, request: UploadRequest, principal: UserPrincipal = Depends(require_user)) -> UploadResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="uploads")
        try:
            payload = app.state.upload_store.create_upload(user_id=principal.user_id, request=request)
        except UploadStoreError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        return UploadResponse(**payload)

    @app.get("/api/uploads/{upload_id}/extraction", response_model=UploadExtractionResponse)
    async def get_upload_extraction(upload_id: str, request_context: Request, principal: UserPrincipal = Depends(require_user)) -> UploadExtractionResponse:
        await enforce_rate_limit(app, request_context, principal=principal, scope="uploads")
        try:
            payload = app.state.upload_store.get_extraction(upload_id=upload_id, user_id=principal.user_id)
        except UploadStoreError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        return UploadExtractionResponse(**payload)

    @app.get("/api/sessions/{session_id}")
    async def session_history(session_id: str, request_context: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="sessions")
        return await app.state.node_client.get_json(f"/api/sessions/{session_id}", params={"userId": principal.user_id})

    @app.get("/api/sessions/{session_id}/export")
    async def session_export(session_id: str, request_context: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="sessions")
        return await app.state.node_client.get_json(f"/api/sessions/{session_id}/export", params={"userId": principal.user_id})

    @app.post("/api/feedback")
    async def submit_feedback(request_context: Request, request: FeedbackRequest, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="feedback")
        body = {
            "userId": principal.user_id,
            "sessionId": request.session_id,
            "messageId": request.message_id,
            "taskId": request.task_id,
            "answerHash": request.answer_hash,
            "rating": request.rating,
            "comment": request.comment,
            "metadata": request.metadata
        }
        return await app.state.node_client.post_json("/api/feedback", body)

    @app.get("/api/research/kpis")
    async def research_kpis(request_context: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/kpis", params={"actorUserId": principal.user_id})

    @app.get("/api/research/analytics")
    async def research_analytics(request_context: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/analytics", params={"actorUserId": principal.user_id})

    @app.get("/api/research/budget")
    async def research_budget(request_context: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/budget", params={"actorUserId": principal.user_id})

    @app.post("/api/research/budget")
    async def update_research_budget(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/budget", body_for_actor(body, principal))

    @app.get("/api/research/worker-status")
    async def research_worker_status(request_context: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/worker-status", params={"actorUserId": principal.user_id})

    @app.get("/api/research/embeddings/status")
    async def research_embedding_status(request_context: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/embeddings/status", params={"actorUserId": principal.user_id})

    @app.get("/api/research/graph")
    async def research_graph(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/graph", params=query_for_actor(request, principal))

    @app.post("/api/research/graph/build")
    async def build_research_graph(request_context: Request, body: dict[str, Any] = Body(default_factory=dict), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/graph/build", body_for_actor(body, principal))

    @app.get("/api/research/citation-closure")
    async def research_citation_closure(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/citation-closure", params=query_for_actor(request, principal))

    @app.post("/api/research/documents")
    async def upload_research_document(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/documents", body_for_actor(body, principal))

    @app.post("/api/research/citation-closure/evaluate")
    async def evaluate_research_citation_closure(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/citation-closure/evaluate", body_for_actor(body, principal))

    @app.post("/api/research/embeddings/route")
    async def choose_research_embedding_route(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/embeddings/route", body_for_actor(body, principal))

    @app.post("/api/research/embeddings/reindex")
    async def reindex_research_embeddings(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/embeddings/reindex", body_for_actor(body, principal))

    @app.get("/api/research/schedules")
    async def research_schedules(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/schedules", params=query_for_actor(request, principal))

    @app.get("/api/research/scheduler/status")
    async def research_scheduler_status(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/scheduler/status", params=query_for_actor(request, principal))

    @app.get("/api/audit")
    async def audit_log(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="operator")
        return await app.state.node_client.get_json("/api/audit", params=query_for_actor(request, principal))

    @app.post("/api/research/scheduler/tick")
    async def tick_research_scheduler_daemon(request_context: Request, body: dict[str, Any] = Body(default_factory=dict), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/scheduler/tick", body_for_actor(body, principal))

    @app.post("/api/research/schedules/tick")
    async def tick_research_schedules(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/schedules/tick", body_for_actor(body, principal))

    @app.get("/api/operator/tools")
    async def operator_tools(request_context: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="operator")
        return await app.state.node_client.get_json("/api/operator/tools", params={"actorUserId": principal.user_id})

    @app.get("/api/operator/proposals")
    async def operator_proposals(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="operator")
        return await app.state.node_client.get_json("/api/operator/proposals", params=query_for_actor(request, principal))

    @app.post("/api/operator/assistant")
    async def operator_assistant(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="operator")
        return await app.state.node_client.post_json("/api/operator/assistant", body_for_actor(body, principal))

    @app.post("/api/operator/proposals/{proposal_id}/approve")
    async def approve_operator_proposal(proposal_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="operator")
        return await app.state.node_client.post_json(f"/api/operator/proposals/{proposal_id}/approve", body_for_actor(body, principal))

    @app.post("/api/operator/proposals/{proposal_id}/reject")
    async def reject_operator_proposal(proposal_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="operator")
        return await app.state.node_client.post_json(f"/api/operator/proposals/{proposal_id}/reject", body_for_actor(body, principal))

    @app.get("/api/research/artifacts")
    async def research_artifacts(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/artifacts", params=query_for_actor(request, principal))

    @app.post("/api/research/artifacts/{artifact_id}/review")
    async def review_research_artifact(artifact_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json(f"/api/research/artifacts/{artifact_id}/review", body_for_actor(body, principal))

    @app.get("/api/research/search")
    async def research_search(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/search", params=query_for_actor(request, principal))

    @app.get("/api/research/evidence")
    async def research_evidence(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/evidence", params=query_for_actor(request, principal))

    @app.get("/api/research/runs")
    async def research_runs(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/runs", params=query_for_actor(request, principal))

    @app.post("/api/research/runs")
    async def start_research_run(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/runs", body_for_actor(body, principal))

    @app.get("/api/research/runs/{run_id}")
    async def research_run_detail(run_id: str, request_context: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.get_json(f"/api/research/runs/{run_id}", params={"actorUserId": principal.user_id})

    @app.get("/api/research/runs/{run_id}/events")
    async def research_run_events(run_id: str, request_context: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.get_json(f"/api/research/runs/{run_id}/events", params={"actorUserId": principal.user_id})

    @app.post("/api/research/runs/{run_id}/cancel")
    async def cancel_research_run(run_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json(f"/api/research/runs/{run_id}/cancel", body_for_actor(body, principal))

    @app.post("/api/research/runs/{run_id}/retry")
    async def retry_research_run(run_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json(f"/api/research/runs/{run_id}/retry", body_for_actor(body, principal))

    @app.post("/api/research/runs/{run_id}/execute")
    async def execute_research_run(run_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json(f"/api/research/runs/{run_id}/execute", body_for_actor(body, principal))

    @app.get("/api/research/sources")
    async def research_sources(request: Request, principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request, principal=principal, scope="research")
        return await app.state.node_client.get_json("/api/research/sources", params=query_for_actor(request, principal))

    @app.post("/api/research/sources/propose")
    async def propose_research_source(request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json("/api/research/sources/propose", body_for_actor(body, principal))

    @app.post("/api/research/sources/{source_id}/approve")
    async def approve_research_source(source_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json(f"/api/research/sources/{source_id}/approve", body_for_actor(body, principal))

    @app.post("/api/research/sources/{source_id}/reject")
    async def reject_research_source(source_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.post_json(f"/api/research/sources/{source_id}/reject", body_for_actor(body, principal))

    @app.patch("/api/research/sources/{source_id}")
    async def patch_research_source(source_id: str, request_context: Request, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_operator)) -> dict[str, Any]:
        await enforce_rate_limit(app, request_context, principal=principal, scope="research")
        return await app.state.node_client.patch_json(f"/api/research/sources/{source_id}", body_for_actor(body, principal))

    return app


async def run_chat_task(app: FastAPI, task_id: str, request: ChatRequest, *, uploaded_documents: list[dict[str, Any]] | None = None) -> None:
    await app.state.registry.update(task_id, status="running", event="runtime_started")
    record_chat_task_event(event_type="facade.chat_task.started", task_id=task_id, request=request, status="running")
    try:
        result = await app.state.node_client.chat(request, uploaded_documents=uploaded_documents)
        grounding = summarize_source_grounding(result)
        facade = result.get("facade") if isinstance(result.get("facade"), dict) else {}
        result = {**result, "facade": {**facade, "sourceGrounding": grounding, "version": VERSION}}
        if source_grounding_config()["enforced"] and not grounding["ok"]:
            raise RuntimeError(f"Source grounding failed: {grounding['status']}")
        session_id = result.get("session", {}).get("id") or request.session_id
        record_chat_task_event(event_type="facade.chat_task.completed", task_id=task_id, request=request, status="completed", source_grounding=grounding)
        await app.state.registry.update(task_id, status="completed", session_id=session_id, result=result, event="runtime_completed")
    except Exception as exc:
        record_chat_task_event(event_type="facade.chat_task.failed", task_id=task_id, request=request, status="failed", error=exc)
        await app.state.registry.update(task_id, status="failed", error=str(exc), event="runtime_failed")


def upload_documents_for_chat(app: FastAPI, request: ChatRequest, principal: UserPrincipal) -> list[dict[str, Any]]:
    upload_ids = list(dict.fromkeys(request.uploaded_document_ids or []))
    if len(upload_ids) > 5:
        raise HTTPException(status_code=400, detail="At most five uploaded documents can be attached to one chat request.")
    uploaded_documents = []
    for upload_id in upload_ids:
        try:
            payload = app.state.upload_store.get_extraction(upload_id=upload_id, user_id=principal.user_id)
        except UploadStoreError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        uploaded_documents.append(safe_uploaded_document_for_langgraph(payload))
    return uploaded_documents


def safe_uploaded_document_for_langgraph(payload: dict[str, Any]) -> dict[str, Any]:
    extraction = payload.get("extraction") if isinstance(payload.get("extraction"), dict) else {}
    return {
        "uploadId": payload.get("upload_id"),
        "sessionId": payload.get("session_id"),
        "filename": payload.get("filename"),
        "contentType": payload.get("content_type"),
        "byteSize": payload.get("byte_size"),
        "sha256": payload.get("sha256"),
        "extraction": {
            "status": extraction.get("status"),
            "method": extraction.get("method"),
            "extractedAt": extraction.get("extracted_at"),
            "textHash": extraction.get("text_hash"),
            "safeTextPreview": extraction.get("safe_text_preview"),
            "fields": extraction.get("fields") if isinstance(extraction.get("fields"), list) else [],
            "sourceSpans": extraction.get("source_spans") if isinstance(extraction.get("source_spans"), list) else [],
            "blockers": extraction.get("blockers") if isinstance(extraction.get("blockers"), list) else [],
            "pageCount": extraction.get("page_count"),
            "confidence": extraction.get("confidence")
        }
    }


def chat_request_from_v1_task(request: V1TaskRequest, principal: UserPrincipal) -> ChatRequest:
    client_context = request.client_context if isinstance(request.client_context, dict) else {}
    member = request.member or client_context.get("member") or {}
    return ChatRequest(
        message=request.message,
        user_id=principal.user_id,
        session_id=request.session_id,
        member=member,
        use_live_model=bool(request.use_live_model or client_context.get("useLiveModel")),
        payload_mode=str(client_context.get("payloadMode") or "phi_allowed_identifier_masked_reasoning"),
        execute_evidence_observation=bool(request.execute_evidence_observation or client_context.get("executeEvidenceObservation")),
        require_live_portal_proof=bool(request.require_live_portal_proof or client_context.get("requireLivePortalProof")),
        use_official_openclaw_worker=bool(request.use_official_openclaw_worker or client_context.get("useOfficialOpenClawWorker")),
        official_openclaw_use_current_tab=bool(request.official_openclaw_use_current_tab or client_context.get("officialOpenClawUseCurrentTab")),
        official_openclaw_multi_page=bool(request.official_openclaw_multi_page or client_context.get("officialOpenClawMultiPage")),
        approval_token=request.approval_token,
        approval_task_id=request.approval_task_id,
        worker_continuation_id=request.worker_continuation_id,
        approval_scope=request.approval_scope,
        allowed_action=request.allowed_action,
        uploaded_document_ids=request.evidence_ids
    )


def v1_task_links(task_id: str) -> dict[str, str]:
    return {
        "self": f"/api/v1/tasks/{task_id}",
        "events": f"/api/v1/tasks/{task_id}/events",
        "approvals": f"/api/v1/tasks/{task_id}/approvals"
    }


def graph_state_from_result(result: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(result, dict):
        return {}
    graph_run = result.get("graphRun")
    if isinstance(graph_run, dict) and isinstance(graph_run.get("state"), dict):
        return graph_run["state"]
    return {}


def source_pointers_from_result(result: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(result, dict):
        return []
    pointers = result.get("sourcePointers")
    if isinstance(pointers, list):
        return [item for item in pointers if isinstance(item, dict)]
    state_pointers = graph_state_from_result(result).get("source_pointers")
    if isinstance(state_pointers, list):
        return [item for item in state_pointers if isinstance(item, dict)]
    return []


def ai2ui_blocks_from_result(result: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(result, dict):
        return []
    blocks = result.get("ai2uiBlocks")
    if isinstance(blocks, list):
        return [item for item in blocks if isinstance(item, dict)]
    state_blocks = graph_state_from_result(result).get("ai2ui_blocks")
    if isinstance(state_blocks, list):
        return [item for item in state_blocks if isinstance(item, dict)]
    return []


def v1_task_proposal_from_result(result: dict[str, Any] | None) -> V1TaskProposal | None:
    state = graph_state_from_result(result)
    task_proposal = state.get("openclaw_task_proposal") if isinstance(state.get("openclaw_task_proposal"), dict) else {}
    worker_plan = state.get("openclaw_worker_plan") if isinstance(state.get("openclaw_worker_plan"), dict) else {}
    skill_proposal = state.get("openclaw_skill_proposal") if isinstance(state.get("openclaw_skill_proposal"), dict) else {}
    if not task_proposal and not worker_plan and not skill_proposal:
        return None
    worker_jobs = worker_plan.get("workerJobs") if isinstance(worker_plan.get("workerJobs"), list) else []
    first_job = worker_jobs[0] if worker_jobs and isinstance(worker_jobs[0], dict) else {}
    approval = first_job.get("approval") if isinstance(first_job.get("approval"), dict) else {}
    selected_skill = task_proposal.get("selectedSkill") if isinstance(task_proposal.get("selectedSkill"), dict) else {}
    selected_executor = task_proposal.get("selectedExecutor") if isinstance(task_proposal.get("selectedExecutor"), dict) else {}
    fallback_path = task_proposal.get("fallbackPath") or first_job.get("fallbackPath") or skill_proposal.get("fallbackPath") or []
    blocked_actions = task_proposal.get("blockedActions") or first_job.get("blockedActions") or []
    required_evidence = task_proposal.get("requiredEvidence") or first_job.get("requiredEvidence") or []
    subtasks = task_proposal.get("proposedSubtasks") or first_job.get("subtasks") or first_job.get("steps") or []
    terminal_outcome = task_proposal.get("terminalOutcome") or first_job.get("terminalOutcome") or skill_proposal.get("terminalOutcome")
    approval_task = skill_proposal.get("task") if isinstance(skill_proposal.get("task"), dict) else {}
    return V1TaskProposal(
        proposed_subtasks=[str(item) for item in subtasks if item is not None],
        required_evidence=[str(item) for item in required_evidence if item is not None],
        selected_skill=selected_skill.get("skillKey") or selected_skill.get("key") or first_job.get("skillKey"),
        selected_executor=selected_executor.get("executorKey") or selected_executor.get("key") or first_job.get("executorKey"),
        approval_requirement={
            "required": bool(approval or approval_task),
            "scope": approval.get("scope") or approval_task.get("approval_scope") or "read_only_observation",
            "taskId": approval_task.get("id"),
            "status": approval_task.get("status")
        },
        blocked_actions=[str(item) for item in blocked_actions if item is not None],
        fallback_path=[str(item) for item in fallback_path if item is not None],
        terminal_outcome=terminal_outcome
    )


def approval_task_id_from_task(task: dict[str, Any]) -> str | None:
    result = task.get("result") if isinstance(task.get("result"), dict) else None
    state = graph_state_from_result(result)
    evidence = state.get("evidence_observation") if isinstance(state.get("evidence_observation"), dict) else {}
    worker_continuation = evidence.get("workerContinuation") if isinstance(evidence.get("workerContinuation"), dict) else {}
    if worker_continuation.get("taskId"):
        return str(worker_continuation["taskId"])
    skill_proposal = state.get("openclaw_skill_proposal") if isinstance(state.get("openclaw_skill_proposal"), dict) else {}
    proposal_task = skill_proposal.get("task") if isinstance(skill_proposal.get("task"), dict) else {}
    if proposal_task.get("id"):
        return str(proposal_task["id"])
    return None


def v1_lifecycle_status(task: dict[str, Any]) -> str:
    raw_status = task.get("status")
    result = task.get("result") if isinstance(task.get("result"), dict) else None
    state = graph_state_from_result(result)
    if raw_status in {"queued", "running"}:
        return raw_status
    if raw_status == "failed":
        return "failed"
    if state.get("urgent_handoff") or state.get("refusal"):
        return "refused"
    evidence = state.get("evidence_observation") if isinstance(state.get("evidence_observation"), dict) else {}
    evidence_status = str(evidence.get("status") or "")
    if "waiting_for_approval" in evidence_status or "missing_approval" in evidence_status or approval_task_id_from_task(task):
        if not source_pointers_from_result(result):
            return "approval_pending"
    if "blocked" in evidence_status or "not_possible" in evidence_status:
        if not source_pointers_from_result(result):
            return "evidence_blocked"
    return "completed"


def v1_task_status_from_registry_task(task: dict[str, Any]) -> V1TaskStatusResponse:
    result = task.get("result") if isinstance(task.get("result"), dict) else None
    return V1TaskStatusResponse(
        version=VERSION,
        task_id=task["task_id"],
        session_id=task.get("session_id"),
        status=v1_lifecycle_status(task),
        raw_status=str(task.get("status")),
        answer=result.get("finalResponse") if isinstance(result, dict) else None,
        proposal=v1_task_proposal_from_result(result),
        source_pointers=source_pointers_from_result(result),
        ai2ui_blocks=ai2ui_blocks_from_result(result),
        events=task.get("events") if isinstance(task.get("events"), list) else [],
        error=task.get("error"),
        result=result
    )


def browser_session_for_user(app: FastAPI, browser_session_id: str, principal: UserPrincipal) -> dict[str, Any]:
    browser_session = app.state.browser_sessions.get(browser_session_id)
    if not browser_session:
        raise HTTPException(status_code=404, detail="Browser session not found.")
    if browser_session.get("user_id") != principal.user_id:
        raise HTTPException(status_code=403, detail="Browser session does not belong to this user.")
    return browser_session


def build_connector_proof_run(run_id: str, *, checks: dict[str, Any], actor_user_id: str) -> dict[str, Any]:
    node_ready = bool(checks.get("node_runtime", {}).get("ok"))
    auth_ready = bool(checks.get("auth", {}).get("ok"))
    cors_ready = bool(checks.get("cors", {}).get("ok"))
    uploads_ready = bool(checks.get("uploads", {}).get("ok"))
    browser_sandbox_contract = describe_browser_sandbox_provider_contract()
    status = "passing" if node_ready and auth_ready and cors_ready and uploads_ready else "blocked"
    return {
        "version": VERSION,
        "run_id": run_id,
        "status": status,
        "cycle": "server_connector_next_mobile_mvp",
        "goals": [
            {"key": "fastapi_v1_connector", "status": "implemented", "target": "FastAPI owns the public remote-app contract."},
            {"key": "node_internal_runtime", "status": "preserved", "target": "Node remains the LangGraph/OpenClaw runtime."},
            {"key": "browser_sandbox_interface", "status": "implemented_local_cdp_adapter", "target": "Remote browser sessions flow through a provider-neutral boundary."},
            {
                "key": "hosted_browser_sandbox_provider_selection",
                "status": browser_sandbox_contract.get("hostedProviderSelection", {}).get("status"),
                "target": "Provider selection/preflight is explicit before live hosted remote browser enablement."
            },
            {
                "key": "hosted_browser_sandbox_provider_live_preflight",
                "status": browser_sandbox_contract.get("hostedProviderLivePreflight", {}).get("status"),
                "target": "Selected provider, endpoint, auth, and private config readiness are preflighted before live hosted browser enablement."
            },
            {
                "key": "hosted_browser_sandbox_provider_live_verification",
                "status": browser_sandbox_contract.get("hostedProviderLiveVerification", {}).get("status"),
                "target": "A selected real hosted provider must pass lifecycle and GUI/OCR proof before hosted readiness can score."
            },
            {
                "key": "hosted_browser_sandbox_provider_steel_self_host",
                "status": browser_sandbox_contract.get("hostedProviderSteelSelfHostProof", {}).get("status"),
                "target": "Self-hosted Steel Browser proves the selected-provider lifecycle locally without leaking raw browser content."
            },
            {
                "key": "hosted_browser_sandbox_provider_steel_operations",
                "status": browser_sandbox_contract.get("hostedProviderSteelOperations", {}).get("status"),
                "target": "Self-hosted Steel Browser operations prove loopback-only networking, cleanup, retention, monitoring, digest-pinned images, and no hosted-readiness overclaim."
            },
            {
                "key": "hosted_browser_sandbox_provider_steel_remote_host",
                "status": browser_sandbox_contract.get("hostedProviderSteelRemoteHost", {}).get("status"),
                "target": "Remote self-hosted Steel must prove TLS API, private debugger tunnel, host firewall defense in depth, and ten-check lifecycle proof before hosted readiness scores."
            },
            {
                "key": "hosted_browser_sandbox_provider_webrtc_signaling",
                "status": browser_sandbox_contract.get("hostedProviderWebrtcSignaling", {}).get("status"),
                "target": "WebRTC live-block signaling must exchange opaque refs only before WebRTC hosted readiness can score."
            },
            {
                "key": "hosted_browser_sandbox_provider_visual_ocr_replay",
                "status": browser_sandbox_contract.get("hostedProviderVisualOcrReplay", {}).get("status"),
                "target": "Operator-supplied dashboard/mobile live-block visual and OCR proof must replay from a private manifest before hosted readiness can score."
            },
            {
                "key": "hosted_browser_sandbox_provider_launch_readiness",
                "status": browser_sandbox_contract.get("hostedProviderLaunchReadiness", {}).get("status"),
                "target": "Operator launch readiness aggregates private config, live provider, WebRTC, visual/OCR, and final enablement gates without leaking secrets."
            },
            {
                "key": "hosted_browser_sandbox_provider_private_launch_execution",
                "status": browser_sandbox_contract.get("hostedProviderPrivateLaunchExecution", {}).get("status"),
                "target": "Real selected-provider private launch execution must be explicitly gated and human-reviewed before final hosted readiness can score."
            },
            {"key": "next_mobile_pwa", "status": "scaffolded", "target": "Next.js PWA uses only /api/v1."},
            {"key": "visual_dashboard_proof", "status": "dashboard_contract_ready", "target": "Dashboard renders connector cycle status and visual test checklist."}
        ],
        "checks": [
            {"key": "node_runtime", **checks.get("node_runtime", {})},
            {"key": "auth", **checks.get("auth", {})},
            {"key": "cors", **checks.get("cors", {})},
            {"key": "uploads", **checks.get("uploads", {})},
            {"key": "source_grounding", **checks.get("source_grounding", {})},
            {"key": "hosted_browser_sandbox_provider", **browser_sandbox_contract},
            {"key": "hosted_browser_sandbox_provider_selection", **browser_sandbox_contract.get("hostedProviderSelection", {})},
            {"key": "hosted_browser_sandbox_provider_live_preflight", **browser_sandbox_contract.get("hostedProviderLivePreflight", {})},
            {"key": "hosted_browser_sandbox_provider_live_verification", **browser_sandbox_contract.get("hostedProviderLiveVerification", {})},
            {"key": "hosted_browser_sandbox_provider_steel_self_host", **browser_sandbox_contract.get("hostedProviderSteelSelfHostProof", {})},
            {"key": "hosted_browser_sandbox_provider_steel_operations", **browser_sandbox_contract.get("hostedProviderSteelOperations", {})},
            {"key": "hosted_browser_sandbox_provider_steel_remote_host", **browser_sandbox_contract.get("hostedProviderSteelRemoteHost", {})},
            {"key": "hosted_browser_sandbox_provider_webrtc_signaling", **browser_sandbox_contract.get("hostedProviderWebrtcSignaling", {})},
            {"key": "hosted_browser_sandbox_provider_visual_ocr_replay", **browser_sandbox_contract.get("hostedProviderVisualOcrReplay", {})},
            {"key": "hosted_browser_sandbox_provider_launch_readiness", **browser_sandbox_contract.get("hostedProviderLaunchReadiness", {})},
            {"key": "hosted_browser_sandbox_provider_private_launch_execution", **browser_sandbox_contract.get("hostedProviderPrivateLaunchExecution", {})}
        ],
        "visual_artifacts": [
            {"route": "/", "required": True, "proof": "operator dashboard connector cycle panel"},
            {"route": "/mvp", "required": True, "proof": "legacy static MVP remains available during migration"},
            {"route": "apps/mobile-next", "required": True, "proof": "Next.js PWA scaffold for mobile visual tests"},
            {"route": "/api/v1/browser/sessions/{id}/stream", "required": True, "proof": "remote worker live block stream contract"},
            {"route": "/api/v1/browser/sessions/{id}/webrtc/offer", "required": True, "proof": "hosted provider WebRTC signaling uses opaque offer/answer refs"},
            {"route": "private visual/OCR proof manifest", "required": True, "proof": "hosted provider visual/OCR replay uses only opaque screenshot and caption refs"}
        ],
        "scores": [
            {"key": "api_readiness", "score": 90 if node_ready and auth_ready else 50, "target": 90},
            {"key": "database_product_ready_architecture", "score": 100 if uploads_ready else 75, "target": 100},
            {"key": "gui_visual_test_required", "score": 0, "target": 100, "status": "must_run_after_server_start"},
            {"key": "remote_browser_controls", "score": 90 if node_ready else 40, "target": 90},
            {
                "key": "hosted_browser_sandbox_adapter_harness",
                "score": 75 if browser_sandbox_contract.get("adapterHarnessReady") else 0,
                "target": 75,
                "status": browser_sandbox_contract.get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_resolver",
                "score": 50 if browser_sandbox_contract.get("hostedProviderResolverReady") else 0,
                "target": 50,
                "status": browser_sandbox_contract.get("hostedProviderResolver", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_adapter",
                "score": 75 if browser_sandbox_contract.get("hostedProviderAdapterReady") else 0,
                "target": 75,
                "status": browser_sandbox_contract.get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_http_adapter",
                "score": 85 if browser_sandbox_contract.get("hostedProviderHttpAdapterReady") else 0,
                "target": 85,
                "status": browser_sandbox_contract.get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_live_lifecycle",
                "score": 95 if browser_sandbox_contract.get("hostedProviderLiveLifecycleHarnessReady") else 0,
                "target": 95,
                "status": browser_sandbox_contract.get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_selection",
                "score": 90 if browser_sandbox_contract.get("hostedProviderSelectionPreflightReady") else 70 if browser_sandbox_contract.get("hostedProviderSelectionReady") else 0,
                "target": 90,
                "status": browser_sandbox_contract.get("hostedProviderSelection", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_live_preflight",
                "score": 80 if browser_sandbox_contract.get("hostedProviderLivePreflightReady") else 0,
                "target": 80,
                "status": browser_sandbox_contract.get("hostedProviderLivePreflight", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_live_verification",
                "score": 100 if browser_sandbox_contract.get("hostedProviderLiveVerificationReady") else 0,
                "target": 100,
                "status": browser_sandbox_contract.get("hostedProviderLiveVerification", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_steel_self_host",
                "score": browser_sandbox_contract.get("hostedProviderSteelSelfHostProof", {}).get("score", 0),
                "target": 100,
                "status": browser_sandbox_contract.get("hostedProviderSteelSelfHostProof", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_steel_operations",
                "score": browser_sandbox_contract.get("hostedProviderSteelOperations", {}).get("score", 0),
                "target": 100,
                "status": browser_sandbox_contract.get("hostedProviderSteelOperations", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_steel_remote_host",
                "score": browser_sandbox_contract.get("hostedProviderSteelRemoteHost", {}).get("score", 0),
                "target": 100,
                "status": browser_sandbox_contract.get("hostedProviderSteelRemoteHost", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_webrtc_signaling",
                "score": 100 if browser_sandbox_contract.get("hostedProviderWebrtcSignalingReady") else 0,
                "target": 100,
                "status": browser_sandbox_contract.get("hostedProviderWebrtcSignaling", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_visual_ocr_replay",
                "score": 100 if browser_sandbox_contract.get("hostedProviderVisualOcrReplayReady") else 0,
                "target": 100,
                "status": browser_sandbox_contract.get("hostedProviderVisualOcrReplay", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_launch_readiness",
                "score": (
                    100 if browser_sandbox_contract.get("hostedProviderFinalEnablementAllowed")
                    else 90 if browser_sandbox_contract.get("hostedProviderPrivateProofChainReady")
                    else 60 if browser_sandbox_contract.get("hostedProviderLaunchReadinessRunbookReady")
                    else 0
                ),
                "target": 100,
                "status": browser_sandbox_contract.get("hostedProviderLaunchReadiness", {}).get("status")
            },
            {
                "key": "hosted_browser_sandbox_provider_private_launch_execution",
                "score": 100 if browser_sandbox_contract.get("hostedProviderPrivateLaunchExecutionReady") else 0,
                "target": 100,
                "status": browser_sandbox_contract.get("hostedProviderPrivateLaunchExecution", {}).get("status")
            },
            {
                "key": "hosted_remote_browser_sandbox",
                "score": 100 if browser_sandbox_contract.get("ready") else 0,
                "target": 100,
                "status": browser_sandbox_contract.get("status")
            }
        ],
        "safety": {
            "actorUserId": actor_user_id,
            "publicApi": "/api/v1",
            "frontendDirectNodeCallsAllowed": False,
            "externalWriteActionsWithoutApproval": False,
            "rawOcrTextReturned": False
        }
    }


async def task_for_user(app: FastAPI, task_id: str, principal: UserPrincipal) -> dict[str, Any]:
    task = await app.state.registry.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    if task.get("user_id") != principal.user_id:
        raise HTTPException(status_code=403, detail="Task does not belong to this user.")
    return task


async def enforce_rate_limit(app: FastAPI, request: Request, *, principal: UserPrincipal | None = None, scope: str) -> None:
    client_host = request.client.host if request.client else "unknown"
    subject = f"user:{principal.user_id}" if principal else f"ip:{client_host}"
    decision = await app.state.rate_limiter.check(f"{scope}:{subject}")
    request.state.rate_limit = decision
    if not decision.allowed:
        raise RateLimitExceeded(decision)


def error_response(request: Request, *, status_code: int, code: str, message: str, details: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or f"req_{uuid4()}"
    content = {
        "detail": message,
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
            "details": details or {}
        }
    }
    response_headers = {"x-request-id": request_id, **(headers or {})}
    return JSONResponse(status_code=status_code, content=content, headers=response_headers)


async def readiness_checks(app: FastAPI, *, node_ok: bool) -> dict[str, Any]:
    auth = auth_metadata()
    cors = cors_metadata()
    registry = await app.state.registry.metadata()
    rate_limit = app.state.rate_limiter.metadata()
    grounding = source_grounding_config()
    observability = observability_metadata()
    uploads = app.state.upload_store.readiness()

    provider_configured = auth["mode"] not in PROVIDER_AUTH_MODES or (auth["issuer_configured"] and auth["audience_configured"])
    return {
        "node_runtime": {
            "ok": node_ok,
            "severity": "error",
            "status": "connected" if node_ok else "unreachable",
            "url": app.state.node_client.base_url
        },
        "auth": {
            "ok": provider_configured,
            "severity": "error",
            "mode": auth["mode"],
            "provider_claims_required": auth["provider_claims_required"],
            "issuer_configured": auth["issuer_configured"],
            "audience_configured": auth["audience_configured"],
            "local_auth_enabled": auth["local_auth_enabled"]
        },
        "cors": {
            "ok": bool(cors["production_safe"]),
            "severity": "error",
            "allowed_origin_count": len(cors["allowed_origins"]),
            "explicitly_configured": cors["explicitly_configured"],
            "production_safe": cors["production_safe"]
        },
        "task_registry": {
            "ok": registry.get("load_error") is None,
            "severity": "error",
            "backend": registry.get("backend"),
            "path_configured": bool(registry.get("path")),
            "task_count": registry.get("task_count"),
            "load_error": registry.get("load_error")
        },
        "rate_limit": {
            "ok": bool(rate_limit["enabled"]),
            "severity": "warn",
            "enabled": rate_limit["enabled"],
            "limit_per_minute": rate_limit["limit_per_minute"]
        },
        "source_grounding": {
            "ok": bool(grounding["enforced"]),
            "severity": "warn",
            "enforced": grounding["enforced"],
            "policy": grounding["policy"]
        },
        "observability": {
            "ok": bool(observability["events_path_configured"] or observability["langsmith_tracing_enabled"]),
            "severity": "warn",
            **observability
        },
        "uploads": {
            **uploads
        }
    }


def safe_validation_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    errors = []
    for error in exc.errors():
        errors.append({
            "loc": error.get("loc", []),
            "msg": error.get("msg", "Validation error."),
            "type": error.get("type", "validation_error")
        })
    return errors


def http_error_code(status_code: int) -> str:
    if status_code == 401:
        return "unauthorized"
    if status_code == 403:
        return "forbidden"
    if status_code == 404:
        return "not_found"
    if status_code == 429:
        return "rate_limited"
    if 400 <= status_code < 500:
        return "bad_request"
    return "upstream_or_server_error"


def query_for_user(request: Request, principal: UserPrincipal) -> dict[str, Any]:
    params = dict(request.query_params)
    requested_user_id = params.get("userId") or params.get("user_id")
    if requested_user_id and requested_user_id != principal.user_id:
        raise HTTPException(status_code=403, detail="Query user id must match JWT subject.")
    params["userId"] = principal.user_id
    params.pop("user_id", None)
    return params


def body_for_user(body: dict[str, Any], principal: UserPrincipal) -> dict[str, Any]:
    scoped_body = dict(body)
    requested_user_id = scoped_body.get("userId") or scoped_body.get("user_id")
    if requested_user_id and requested_user_id != principal.user_id:
        raise HTTPException(status_code=403, detail="Body user id must match JWT subject.")
    scoped_body["userId"] = principal.user_id
    scoped_body.pop("user_id", None)
    return scoped_body


def query_for_actor(request: Request, principal: UserPrincipal) -> dict[str, Any]:
    params = dict(request.query_params)
    requested_actor = params.get("actorUserId") or params.get("actor_user_id")
    if requested_actor and requested_actor != principal.user_id:
        raise HTTPException(status_code=403, detail="Actor user id must match JWT subject.")
    params["actorUserId"] = principal.user_id
    params.pop("actor_user_id", None)
    return params


def body_for_actor(body: dict[str, Any], principal: UserPrincipal) -> dict[str, Any]:
    scoped_body = dict(body)
    requested_actor = scoped_body.get("actorUserId") or scoped_body.get("actor_user_id")
    if requested_actor and requested_actor != principal.user_id:
        raise HTTPException(status_code=403, detail="Actor user id must match JWT subject.")
    scoped_body["actorUserId"] = principal.user_id
    scoped_body.pop("actor_user_id", None)
    return scoped_body


async def node_stream(app: FastAPI, path: str, params: dict[str, Any]):
    try:
        async for chunk in app.state.node_client.stream_text(path, params=params):
            yield chunk
    except Exception as exc:
        yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"


async def task_event_stream(registry: TaskRegistry, task_id: str):
    last_event_count = 0
    while True:
        task = await registry.get(task_id)
        if not task:
            yield "event: error\ndata: {\"error\":\"Task not found\"}\n\n"
            return
        events = task.get("events", [])
        for event in events[last_event_count:]:
            yield f"event: {event['event']}\ndata: {json.dumps({'task_id': task_id, **event})}\n\n"
        last_event_count = len(events)
        if task["status"] in {"completed", "failed"}:
            payload: dict[str, Any] = {"task_id": task_id, "status": task["status"], "session_id": task.get("session_id")}
            if task["status"] == "failed":
                payload["error"] = task.get("error")
            else:
                payload["result"] = task.get("result")
            yield f"event: done\ndata: {json.dumps(payload)}\n\n"
            return
        await asyncio.sleep(0.2)


app = create_app()
