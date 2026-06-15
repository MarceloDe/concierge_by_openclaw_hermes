from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


SANDBOX_CONTRACT_VERSION = "browser-sandbox-provider.v1"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class BrowserSandboxError(RuntimeError):
    pass


class BrowserSandboxProvider:
    provider_key = "abstract"

    async def create_session(
        self,
        *,
        node_client: Any,
        user_id: str,
        session_id: str,
        target_url: str | None = None,
        options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def request_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        reason: str | None = None
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def grant_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        approved_by: str | None = None
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def end_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def send_input(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        grant_token: str,
        input_payload: dict[str, Any]
    ) -> dict[str, Any]:
        raise NotImplementedError


class LocalCdpBrowserSandboxProvider(BrowserSandboxProvider):
    provider_key = "local_cdp"

    async def create_session(
        self,
        *,
        node_client: Any,
        user_id: str,
        session_id: str,
        target_url: str | None = None,
        options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        screencast = await node_client.post_json(
            "/api/runtime/browser/screencast/start",
            {
                "sessionId": session_id,
                "userId": user_id,
                "targetUrl": target_url,
                "options": options or {}
            }
        )
        screencast_probe = await node_client.get_json(
            "/api/runtime/browser/screencast/status",
            params={"sessionId": session_id, "userId": user_id}
        )
        readiness = await node_client.get_json("/api/openclaw/official/status")
        current_tab = readiness.get("tabs", {}).get("currentTab") if isinstance(readiness.get("tabs"), dict) else None
        live = readiness.get("liveReadiness") if isinstance(readiness.get("liveReadiness"), dict) else {}
        return {
            "browser_session_id": f"browser_{uuid4()}",
            "contract_version": SANDBOX_CONTRACT_VERSION,
            "provider": self.provider_key,
            "session_id": session_id,
            "user_id": user_id,
            "target_url": target_url,
            "created_at": now_iso(),
            "takeover_state": "not_requested",
            "readiness": {
                "status": live.get("status") or readiness.get("status") or "unknown",
                "ready": bool(readiness.get("ready")),
                "userActionRequired": live.get("userActionRequired"),
                "nextAction": live.get("nextAction"),
                "safetyBoundary": live.get("safetyBoundary", "read_only_approval_required")
            },
            "current_url": current_tab.get("url") if isinstance(current_tab, dict) else None,
            "current_title": current_tab.get("title") if isinstance(current_tab, dict) else None,
            "ocr_caption": {
                "status": "visual_frame_available" if screencast_probe.get("hasFrame") else "pending_visual_frame",
                "requiredForEvidence": True,
                "rawOcrTextReturned": False,
                "frameSource": screencast_probe.get("frameSource"),
                "lastFrameAt": screencast_probe.get("lastFrameAt")
            },
            "screencast": {**screencast, "status_probe": screencast_probe}
        }

    async def request_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        reason: str | None = None
    ) -> dict[str, Any]:
        return await node_client.post_json(
            "/api/runtime/browser/takeover/request",
            {
                "sessionId": browser_session["session_id"],
                "userId": browser_session["user_id"],
                "reason": reason or "user_password_or_captcha"
            }
        )

    async def grant_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        approved_by: str | None = None
    ) -> dict[str, Any]:
        return await node_client.post_json(
            "/api/runtime/browser/takeover/grant",
            {
                "takeoverId": takeover_id,
                "sessionId": browser_session["session_id"],
                "userId": browser_session["user_id"],
                "approvedBy": approved_by or "user"
            }
        )

    async def end_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str
    ) -> dict[str, Any]:
        return await node_client.post_json(
            "/api/runtime/browser/takeover/end",
            {
                "takeoverId": takeover_id,
                "sessionId": browser_session["session_id"],
                "userId": browser_session["user_id"]
            }
        )

    async def send_input(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        grant_token: str,
        input_payload: dict[str, Any]
    ) -> dict[str, Any]:
        return await node_client.post_json(
            "/api/runtime/browser/takeover/input",
            {
                "takeoverId": takeover_id,
                "grantToken": grant_token,
                "sessionId": browser_session["session_id"],
                "userId": browser_session["user_id"],
                "input": input_payload
            }
        )


def get_browser_sandbox_provider(provider: str | None) -> BrowserSandboxProvider:
    if provider in {None, "local_cdp"}:
        return LocalCdpBrowserSandboxProvider()
    raise BrowserSandboxError(f"Unsupported browser sandbox provider: {provider}")
