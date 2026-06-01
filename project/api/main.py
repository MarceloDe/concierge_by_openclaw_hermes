import asyncio
import json
import os
from typing import Any

from fastapi import Body, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .auth import UserPrincipal, create_access_token, require_user
from .models import ChatAcceptedResponse, ChatRequest, HealthResponse, LocalSessionAuthRequest, LocalSessionAuthResponse, TaskStatusResponse
from .node_client import NodeRuntimeClient
from .task_registry import TaskRegistry


VERSION = "0.1.0-phase9c-fastapi-mvp-proxies"
LOCAL_AUTH_TOKEN_SECONDS = 24 * 60 * 60


def allowed_origins() -> list[str]:
    raw = os.getenv("WEFELLA_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:4173,http://127.0.0.1:8000")
    return [item.strip() for item in raw.split(",") if item.strip()]


def create_app(*, inline_tasks: bool = False) -> FastAPI:
    app = FastAPI(title="Wefella Concierge API", version=VERSION)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )
    app.state.registry = TaskRegistry()
    app.state.node_client = NodeRuntimeClient()

    @app.get("/api/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        node_ok = await app.state.node_client.health()
        return HealthResponse(status="ok", version=VERSION, node_runtime_url=app.state.node_client.base_url, node_runtime_ok=node_ok)

    @app.post("/api/auth/local-session", response_model=LocalSessionAuthResponse)
    async def local_session(request: LocalSessionAuthRequest) -> LocalSessionAuthResponse:
        if os.getenv("WEFELLA_ENABLE_LOCAL_AUTH", "1") not in {"1", "true", "TRUE", "yes", "YES"}:
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

    @app.post("/api/chat", response_model=ChatAcceptedResponse)
    async def chat(request: ChatRequest, principal: UserPrincipal = Depends(require_user)) -> ChatAcceptedResponse:
        if principal.user_id != request.user_id:
            raise HTTPException(status_code=403, detail="JWT subject must match request user_id.")
        task = await app.state.registry.create(user_id=principal.user_id, session_id=request.session_id)
        if inline_tasks:
            await run_chat_task(app, task["task_id"], request)
        else:
            asyncio.create_task(run_chat_task(app, task["task_id"], request))
        return ChatAcceptedResponse(session_id=request.session_id, task_id=task["task_id"], status="queued")

    @app.get("/api/chat/status/{task_id}", response_model=TaskStatusResponse)
    async def chat_status(task_id: str, principal: UserPrincipal = Depends(require_user)) -> TaskStatusResponse:
        task = await task_for_user(app, task_id, principal)
        return TaskStatusResponse(**task)

    @app.get("/api/chat/stream/{task_id}")
    async def chat_stream(task_id: str, principal: UserPrincipal = Depends(require_user)) -> StreamingResponse:
        await task_for_user(app, task_id, principal)
        return StreamingResponse(task_event_stream(app.state.registry, task_id), media_type="text/event-stream")

    @app.post("/api/orchestrator/approve")
    async def approve(body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json("/api/orchestrator/approve", scoped_body)

    @app.get("/api/openclaw/official/status")
    async def openclaw_status(_: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        return await app.state.node_client.get_json("/api/openclaw/official/status")

    @app.get("/api/runtime/events")
    async def runtime_events(request: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        params = query_for_user(request, principal)
        return await app.state.node_client.get_json("/api/runtime/events", params=params)

    @app.get("/api/runtime/events/stream")
    async def runtime_events_stream(request: Request, principal: UserPrincipal = Depends(require_user)) -> StreamingResponse:
        params = query_for_user(request, principal)
        return StreamingResponse(node_stream(app, "/api/runtime/events/stream", params), media_type="text/event-stream")

    @app.get("/api/worker-continuations")
    async def worker_continuations(request: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        params = query_for_user(request, principal)
        return await app.state.node_client.get_json("/api/worker-continuations", params=params)

    @app.post("/api/worker-continuations")
    async def create_worker_continuation(body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json("/api/worker-continuations", scoped_body)

    @app.post("/api/worker-continuations/{continuation_id}/cancel")
    async def cancel_worker_continuation(continuation_id: str, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json(f"/api/worker-continuations/{continuation_id}/cancel", scoped_body)

    @app.post("/api/worker-continuations/{continuation_id}/continue")
    async def continue_worker_continuation(continuation_id: str, body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json(f"/api/worker-continuations/{continuation_id}/continue", scoped_body)

    @app.get("/api/document-candidates")
    async def document_candidates(request: Request, principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        params = query_for_user(request, principal)
        return await app.state.node_client.get_json("/api/document-candidates", params=params)

    @app.post("/api/document-candidates/propose")
    async def propose_document_candidate(body: dict[str, Any] = Body(...), principal: UserPrincipal = Depends(require_user)) -> dict[str, Any]:
        scoped_body = body_for_user(body, principal)
        return await app.state.node_client.post_json("/api/document-candidates/propose", scoped_body)

    return app


async def run_chat_task(app: FastAPI, task_id: str, request: ChatRequest) -> None:
    await app.state.registry.update(task_id, status="running", event="runtime_started")
    try:
        result = await app.state.node_client.chat(request)
        session_id = result.get("session", {}).get("id") or request.session_id
        await app.state.registry.update(task_id, status="completed", session_id=session_id, result=result, event="runtime_completed")
    except Exception as exc:
        await app.state.registry.update(task_id, status="failed", error=str(exc), event="runtime_failed")


async def task_for_user(app: FastAPI, task_id: str, principal: UserPrincipal) -> dict[str, Any]:
    task = await app.state.registry.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    if task.get("user_id") != principal.user_id:
        raise HTTPException(status_code=403, detail="Task does not belong to this user.")
    return task


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
