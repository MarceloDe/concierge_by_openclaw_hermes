from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from typing import Any
from uuid import uuid4


SANDBOX_CONTRACT_VERSION = "browser-sandbox-provider.v1"
HOSTED_SANDBOX_CONTRACT_VERSION = "brainstyworkers.browser-sandbox-provider.v1"


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


class HostedRemoteBrowserSandboxProvider(BrowserSandboxProvider):
    provider_key = "hosted_remote"

    def __init__(self, *, config_path: str | None = None, ready: bool | None = None):
        self.config_path = config_path or os.environ.get(
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE",
            "project/deployment/browser-sandbox-provider.example.json"
        )
        self.ready = bool(ready if ready is not None else os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_READY") == "1")

    def describe(self) -> dict[str, Any]:
        return describe_browser_sandbox_provider_contract(config_path=self.config_path, ready=self.ready)

    async def create_session(
        self,
        *,
        node_client: Any,
        user_id: str,
        session_id: str,
        target_url: str | None = None,
        options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        contract = self.describe()
        if not contract["ready"]:
            raise BrowserSandboxError(
                "Hosted browser sandbox provider is not configured. "
                "Set WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE to a non-example provider config and "
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY=1 after hosted proof passes."
            )
        raise BrowserSandboxError("Hosted browser sandbox provider adapter is configured but not implemented in this local runtime.")

    async def request_takeover(self, *, node_client: Any, browser_session: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
        raise BrowserSandboxError("Hosted browser sandbox takeover is unavailable until the hosted adapter is implemented.")

    async def grant_takeover(self, *, node_client: Any, browser_session: dict[str, Any], takeover_id: str, approved_by: str | None = None) -> dict[str, Any]:
        raise BrowserSandboxError("Hosted browser sandbox takeover is unavailable until the hosted adapter is implemented.")

    async def end_takeover(self, *, node_client: Any, browser_session: dict[str, Any], takeover_id: str) -> dict[str, Any]:
        raise BrowserSandboxError("Hosted browser sandbox takeover is unavailable until the hosted adapter is implemented.")

    async def send_input(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        grant_token: str,
        input_payload: dict[str, Any]
    ) -> dict[str, Any]:
        raise BrowserSandboxError("Hosted browser sandbox input is unavailable until the hosted adapter is implemented.")


def describe_browser_sandbox_provider_contract(
    *,
    provider: str | None = None,
    config_path: str | None = None,
    ready: bool | None = None
) -> dict[str, Any]:
    selected_provider = provider or os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER", "local_cdp")
    selected_config_path = config_path or os.environ.get(
        "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE",
        "project/deployment/browser-sandbox-provider.example.json"
    )
    selected_ready = bool(ready if ready is not None else os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_READY") == "1")
    config = None
    config_ok = False
    failures: list[str] = []
    try:
        with open(selected_config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
    except Exception as exc:
        failures.append(f"config_unreadable:{exc}")
    if isinstance(config, dict):
        config_ok = (
            config.get("schemaVersion") == HOSTED_SANDBOX_CONTRACT_VERSION
            and config.get("provider") == "hosted_remote"
            and config.get("endpointRef")
            and not str(config.get("endpointRef")).startswith(("http://", "https://"))
            and config.get("approvalPolicy", {}).get("agentCredentialEntryAllowed") is False
            and config.get("approvalPolicy", {}).get("externalWriteActionsAllowed") is False
            and config.get("sessionPolicy", {}).get("recordFrames") is False
            and config.get("sessionPolicy", {}).get("persistRawOcrText") is False
        )
        if not config_ok:
            failures.append("config_contract_failed")
    return {
        "version": HOSTED_SANDBOX_CONTRACT_VERSION,
        "provider": selected_provider,
        "configPath": selected_config_path,
        "configOk": config_ok,
        "ready": bool(selected_provider == "hosted_remote" and selected_ready and config_ok and selected_config_path != "project/deployment/browser-sandbox-provider.example.json"),
        "status": (
            "hosted_browser_sandbox_provider_ready"
            if selected_provider == "hosted_remote" and selected_ready and config_ok and selected_config_path != "project/deployment/browser-sandbox-provider.example.json"
            else "local_cdp_default" if selected_provider == "local_cdp"
            else "hosted_browser_sandbox_contract_valid_not_configured" if config_ok
            else "hosted_browser_sandbox_contract_missing_or_invalid"
        ),
        "failures": failures,
        "safety": {
            "rawEndpointReturned": False,
            "rawOcrTextReturned": False,
            "agentCredentialEntryAllowed": False,
            "externalWriteActionsAllowed": False
        }
    }


def get_browser_sandbox_provider(provider: str | None) -> BrowserSandboxProvider:
    if provider in {None, "local_cdp"}:
        return LocalCdpBrowserSandboxProvider()
    if provider == "hosted_remote":
        return HostedRemoteBrowserSandboxProvider()
    raise BrowserSandboxError(f"Unsupported browser sandbox provider: {provider}")
