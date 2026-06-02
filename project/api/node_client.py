import os
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .models import ChatRequest, LocalSessionAuthRequest


class NodeRuntimeClient:
    def __init__(self, base_url: str | None = None, timeout_seconds: float = 240.0) -> None:
        self.base_url = (base_url or os.getenv("WEFELLA_NODE_RUNTIME_URL") or "http://127.0.0.1:4173").rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/health")
            return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def get_json(self, path: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(f"{self.base_url}{path}", params=params)
        response.raise_for_status()
        return response.json()

    async def post_json(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(f"{self.base_url}{path}", json=body)
        response.raise_for_status()
        return response.json()

    async def stream_text(self, path: str, *, params: dict[str, Any] | None = None) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("GET", f"{self.base_url}{path}", params=params) as response:
                response.raise_for_status()
                async for chunk in response.aiter_text():
                    if chunk:
                        yield chunk

    async def chat(self, request: ChatRequest) -> dict[str, Any]:
        body: dict[str, Any] = {
            "message": request.message,
            "member": request.member or {},
            "sessionId": request.session_id,
            "resumeLatestSession": request.resume_latest_session,
            "useLiveModel": request.use_live_model,
            "payloadMode": request.payload_mode,
            "executeEvidenceObservation": request.execute_evidence_observation,
            "requireLivePortalProof": request.require_live_portal_proof,
            "useOfficialOpenClawWorker": request.use_official_openclaw_worker,
            "officialOpenClawUseCurrentTab": request.official_openclaw_use_current_tab,
            "officialOpenClawMultiPage": request.official_openclaw_multi_page,
            "approvalToken": request.approval_token,
            "approvalTaskId": request.approval_task_id,
            "workerContinuationId": request.worker_continuation_id,
            "approvalScope": request.approval_scope,
            "allowedAction": request.allowed_action,
            "approvedDocumentCandidateId": request.approved_document_candidate_id,
            "source": "wefella_fastapi_facade"
        }
        return await self.post_json("/api/chat", body)

    async def auth_start(self, request: LocalSessionAuthRequest) -> dict[str, Any]:
        body: dict[str, Any] = {
            "member": request.member,
            "sessionId": request.session_id,
            "resumeLatestSession": request.resume_latest_session
        }
        return await self.post_json("/api/orchestrator/auth-start", body)
