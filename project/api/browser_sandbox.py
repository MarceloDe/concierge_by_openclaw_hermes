from __future__ import annotations

from datetime import datetime, timezone
import glob
import json
import os
import re
from typing import Any, AsyncIterator
from uuid import uuid4

import httpx


SANDBOX_CONTRACT_VERSION = "browser-sandbox-provider.v1"
HOSTED_SANDBOX_CONTRACT_VERSION = "brainstyworkers.browser-sandbox-provider.v1"
HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION = "2026-06-17.browser-sandbox-provider.v1"
VISUAL_OCR_PROOF_SCHEMA_VERSION = "brainstyworkers.browser-sandbox-provider-visual-ocr-proof.v1"
DEFAULT_PROVIDER_CONFIG_PATH = "project/deployment/browser-sandbox-provider.example.json"
DEFAULT_PROVIDER_SELECTION_CONFIG_PATH = "project/deployment/browser-sandbox-provider.selection.example.json"
PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH = "project/deployment/browser-sandbox-provider.launch-readiness.example.env"
PROVIDER_LAUNCH_READINESS_RUNBOOK_PATH = "docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md"
PROVIDER_PRIVATE_LAUNCH_EXECUTION_ENV_EXAMPLE_PATH = "project/deployment/browser-sandbox-provider.private-launch-execution.example.env"
DEFAULT_HOSTED_AUTH_TOKEN_REF = "env:WEFELLA_BROWSER_SANDBOX_API_TOKEN"


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
            DEFAULT_PROVIDER_CONFIG_PATH
        )
        self.ready = bool(ready if ready is not None else os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_READY") == "1")

    def describe(self) -> dict[str, Any]:
        return describe_browser_sandbox_provider_contract(config_path=self.config_path, ready=self.ready)

    def _require_harness(self) -> dict[str, Any]:
        contract = self.describe()
        if not contract.get("adapterHarnessReady"):
            raise BrowserSandboxError("Hosted browser sandbox adapter harness is not enabled for this session.")
        return contract

    def _load_private_config(self) -> dict[str, Any]:
        with open(self.config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
        if not isinstance(config, dict):
            raise BrowserSandboxError("Hosted browser sandbox provider config is not a JSON object.")
        return config

    def _endpoint_and_token(self, config: dict[str, Any]) -> tuple[str, str]:
        endpoint_env = _env_name_from_ref(config.get("endpointRef"))
        token_env = _env_name_from_ref(config.get("auth", {}).get("tokenRef", DEFAULT_HOSTED_AUTH_TOKEN_REF))
        endpoint = os.environ.get(endpoint_env or "")
        token = os.environ.get(token_env or "")
        if not endpoint or not _is_https_endpoint(endpoint):
            raise BrowserSandboxError("Hosted browser sandbox provider endpoint is not resolved to an HTTPS URL.")
        if not token:
            raise BrowserSandboxError("Hosted browser sandbox provider auth token is not resolved.")
        return endpoint.rstrip("/") + "/", token

    async def _provider_json(self, *, path: str, method: str = "POST", body: dict[str, Any] | None = None) -> dict[str, Any]:
        config = self._load_private_config()
        endpoint, token = self._endpoint_and_token(config)
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.request(
                method,
                str(httpx.URL(endpoint).join(path.lstrip("/"))),
                headers={
                    "content-type": "application/json",
                    "authorization": f"Bearer {token}",
                    "x-brainstyworkers-contract-version": HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION
                },
                json=body if method != "GET" else None
            )
        try:
            payload = response.json()
        except Exception as exc:
            raise BrowserSandboxError(f"Hosted browser sandbox provider returned invalid JSON: {exc}") from exc
        return {"status_code": response.status_code, "payload": payload}

    def _assert_live_create_response(self, payload: dict[str, Any]) -> None:
        serialized = json.dumps(payload, separators=(",", ":"))
        failures: list[str] = []
        if payload.get("contractVersion") != HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION:
            failures.append("contract_version_mismatch")
        if not payload.get("providerSessionRef"):
            failures.append("provider_session_ref_required")
        if payload.get("providerLiveConnected") is not True:
            failures.append("provider_live_connected_required")
        if payload.get("stream", {}).get("rawFrameReturned") is True:
            failures.append("raw_frame_returned")
        if payload.get("stream", {}).get("transport") in {"webrtc", "webrtc_or_sse_frames"}:
            signaling = payload.get("webrtcSignaling", {})
            if signaling and signaling.get("rawSdpReturned") is True:
                failures.append("raw_sdp_returned")
            if signaling and signaling.get("rawIceCandidateReturned") is True:
                failures.append("raw_ice_candidate_returned")
        if payload.get("ocrCaption", {}).get("rawOcrTextReturned") is True:
            failures.append("raw_ocr_text_returned")
        if payload.get("takeover", {}).get("inputRelay") != "approval_gated_human_only":
            failures.append("input_relay_not_human_only")
        if payload.get("safety", {}).get("agentCredentialEntryAllowed") is True:
            failures.append("agent_credential_entry_allowed")
        if payload.get("safety", {}).get("externalWriteActionsWithoutApproval") is True:
            failures.append("external_write_actions_without_approval")
        if any(marker in serialized.lower() for marker in ["data:image", "<html", "member id", "subscriber id", "password", "captcha"]):
            failures.append("raw_frame_or_ocr_or_secret_content_returned")
        if failures:
            raise BrowserSandboxError(f"Hosted browser sandbox provider live response failed contract: {', '.join(failures)}")

    async def _create_live_session(
        self,
        *,
        user_id: str,
        session_id: str,
        target_url: str | None = None,
        options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        request_body = {
            "sessionId": session_id,
            "userId": user_id,
            "targetUrlRef": (options or {}).get("targetUrlRef", "approved-target-url-ref-redacted"),
            "options": {"liveProvider": True, **{k: v for k, v in (options or {}).items() if k != "targetUrlRef"}},
            "approvalContract": {
                "readOnlyApprovalRequired": True,
                "humanTakeoverApprovalRequired": True,
                "humanInputRelay": "approval_gated_human_only"
            },
            "safetyContract": {
                "agentCredentialEntryAllowed": False,
                "externalWriteActionsAllowed": False,
                "frameRecordingAllowed": False,
                "rawOcrPersistenceAllowed": False,
                "offsiteFailClosed": True,
                "credentialPagesUserOnly": True
            }
        }
        result = await self._provider_json(path="browser/sessions", body=request_body)
        if result["status_code"] >= 400:
            raise BrowserSandboxError("Hosted browser sandbox provider rejected session creation.")
        payload = result["payload"]
        self._assert_live_create_response(payload)
        provider_session_ref = str(payload["providerSessionRef"])
        return {
            "browser_session_id": f"hosted_browser_{uuid4()}",
            "contract_version": HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION,
            "provider": self.provider_key,
            "adapter_mode": "hosted_provider",
            "provider_live_connected": True,
            "provider_session_ref": provider_session_ref,
            "provider_paths": {
                "stream": payload.get("stream", {}).get("streamPath") or f"browser/sessions/{provider_session_ref}/stream",
                "webrtc_offer": payload.get("webrtcSignaling", {}).get("offerPath") or f"browser/sessions/{provider_session_ref}/webrtc/offer",
                "webrtc_ice_candidate": payload.get("webrtcSignaling", {}).get("iceCandidatePath") or f"browser/sessions/{provider_session_ref}/webrtc/ice-candidate",
                "takeover": payload.get("takeover", {}).get("takeoverPath") or f"browser/sessions/{provider_session_ref}/takeover",
                "input": payload.get("takeover", {}).get("inputPath") or f"browser/sessions/{provider_session_ref}/input",
                "teardown": f"browser/sessions/{provider_session_ref}/teardown"
            },
            "session_id": session_id,
            "user_id": user_id,
            "target_url": target_url,
            "created_at": now_iso(),
            "takeover_state": payload.get("takeover", {}).get("state", "not_requested"),
            "readiness": {
                "status": "hosted_browser_sandbox_provider_ready",
                "ready": True,
                "adapterMode": "hosted_provider",
                "providerLiveConnected": True,
                "userActionRequired": None,
                "nextAction": "use_public_stream_and_takeover_routes",
                "safetyBoundary": "read_only_approval_required"
            },
            "current_url": None,
            "current_title": "Hosted remote browser session",
            "ocr_caption": {
                "status": "provider_caption_ref_ready" if payload.get("ocrCaption", {}).get("captionRef") else "pending_provider_caption",
                "requiredForEvidence": True,
                "rawOcrTextReturned": False,
                "captionRefPresent": bool(payload.get("ocrCaption", {}).get("captionRef"))
            },
            "screencast": {
                "ok": True,
                "status": "hosted_provider_session_created",
                "frameSource": "hosted_provider_stream_ref",
                "streamTransport": payload.get("stream", {}).get("transport", "webrtc_or_sse_frames"),
                "webrtcSignaling": {
                    "required": payload.get("stream", {}).get("transport") in {"webrtc", "webrtc_or_sse_frames"},
                    "offerPathReady": True,
                    "rawSdpReturned": False,
                    "rawIceCandidateReturned": False
                },
                "rawFrameRecorded": False,
                "providerLiveConnected": True
            }
        }

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
        if not contract["ready"] and not contract.get("adapterHarnessReady"):
            if contract.get("status") == "hosted_browser_sandbox_provider_missing_endpoint_or_secret":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider endpoint or secret is not resolved. "
                    "Set the endpoint and auth token environment references from the provider config before creating hosted sessions."
                )
            if contract.get("status") == "hosted_browser_sandbox_provider_configured_unverified":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider endpoint and secret are configured, but live provider verification has not passed. "
                    "Set WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1 only after hosted stream, screenshot/OCR, takeover, input, and teardown proof passes."
                )
            if contract.get("status") == "hosted_browser_sandbox_provider_adapter_contract_ready":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider adapter contract is ready, but live provider verification has not passed. "
                    "The adapter smoke does not create real hosted sessions until live stream, screenshot/OCR, takeover, input, and teardown proof passes."
                )
            if contract.get("status") == "hosted_browser_sandbox_provider_http_adapter_harness_ready":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider HTTP adapter harness is ready, but live provider verification has not passed. "
                    "The local provider-compatible harness proves request plumbing only and does not create real hosted sessions."
                )
            if contract.get("status") == "hosted_browser_sandbox_provider_live_lifecycle_harness_ready":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider live lifecycle harness is ready, but live provider verification has not passed. "
                    "The local provider-compatible harness proves stream, screenshot/OCR, takeover, input, teardown, and offsite fail-closed plumbing only."
                )
            raise BrowserSandboxError(
                "Hosted browser sandbox provider is not configured. "
                "Set WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE to a non-example provider config and "
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY=1 after hosted proof passes."
            )
        if contract.get("ready"):
            return await self._create_live_session(
                user_id=user_id,
                session_id=session_id,
                target_url=target_url,
                options=options
            )
        if contract.get("adapterHarnessReady"):
            return {
                "browser_session_id": f"hosted_browser_{uuid4()}",
                "contract_version": HOSTED_SANDBOX_CONTRACT_VERSION,
                "provider": self.provider_key,
                "adapter_mode": "contract_harness",
                "provider_live_connected": False,
                "session_id": session_id,
                "user_id": user_id,
                "target_url": target_url,
                "created_at": now_iso(),
                "takeover_state": "not_requested",
                "readiness": {
                    "status": "hosted_browser_sandbox_adapter_harness_ready",
                    "ready": True,
                    "adapterMode": "contract_harness",
                    "providerLiveConnected": False,
                    "userActionRequired": None,
                    "nextAction": "configure_real_hosted_provider_for_production",
                    "safetyBoundary": "read_only_approval_required"
                },
                "current_url": target_url,
                "current_title": "Hosted browser sandbox contract harness",
                "ocr_caption": {
                    "status": "caption_contract_ready",
                    "requiredForEvidence": True,
                    "rawOcrTextReturned": False,
                    "frameSource": "hosted_contract_harness",
                    "lastFrameAt": now_iso()
                },
                "screencast": {
                    "ok": True,
                    "status": "hosted_adapter_harness_session_created",
                    "frameSource": "hosted_contract_harness",
                    "streamTransport": "sse_frames",
                    "rawFrameRecorded": False,
                    "providerLiveConnected": False
                }
            }
        raise BrowserSandboxError("Hosted browser sandbox provider adapter is configured but not implemented in this local runtime.")

    async def request_takeover(self, *, node_client: Any, browser_session: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
        if browser_session.get("provider_live_connected") is True:
            path = browser_session.get("provider_paths", {}).get("takeover") or f"browser/sessions/{browser_session['provider_session_ref']}/takeover"
            result = await self._provider_json(path=path, body={"reason": reason or "user_password_or_captcha"})
            payload = result["payload"]
            return {
                "ok": result["status_code"] < 400 and payload.get("approvalRequired") is True,
                "status": payload.get("status", "interactive_takeover_pending_approval"),
                "takeoverId": payload.get("takeoverId"),
                "approvalRequired": payload.get("approvalRequired") is True,
                "inputRelay": payload.get("inputRelay", "approval_gated_human_only"),
                "providerLiveConnected": True,
                "actionsTaken": []
            }
        self._require_harness()
        return {
            "ok": True,
            "status": "interactive_takeover_pending_approval",
            "takeoverId": f"hosted_takeover_{uuid4()}",
            "approvalRequired": True,
            "reason": reason or "user_password_or_captcha",
            "providerLiveConnected": False,
            "actionsTaken": []
        }

    async def grant_takeover(self, *, node_client: Any, browser_session: dict[str, Any], takeover_id: str, approved_by: str | None = None) -> dict[str, Any]:
        if browser_session.get("provider_live_connected") is True:
            return {
                "ok": True,
                "status": "interactive_takeover_granted",
                "takeoverId": takeover_id,
                "grantToken": f"hosted_provider_grant_{uuid4()}",
                "approvedBy": approved_by or "user",
                "providerLiveConnected": True,
                "inputRelay": "approval_gated_human_only",
                "actionsTaken": []
            }
        self._require_harness()
        return {
            "ok": True,
            "status": "interactive_takeover_granted",
            "takeoverId": takeover_id,
            "grantToken": f"hosted_grant_{uuid4()}",
            "approvedBy": approved_by or "user",
            "providerLiveConnected": False,
            "actionsTaken": []
        }

    async def end_takeover(self, *, node_client: Any, browser_session: dict[str, Any], takeover_id: str) -> dict[str, Any]:
        if browser_session.get("provider_live_connected") is True:
            path = f"browser/sessions/{browser_session['provider_session_ref']}/takeover/end"
            result = await self._provider_json(path=path, body={"takeoverId": takeover_id})
            return {
                "ok": result["status_code"] < 400,
                "status": result["payload"].get("status", "interactive_takeover_ended"),
                "takeoverId": takeover_id,
                "providerLiveConnected": True,
                "actionsTaken": []
            }
        self._require_harness()
        return {
            "ok": True,
            "status": "interactive_takeover_ended",
            "takeoverId": takeover_id,
            "providerLiveConnected": False,
            "actionsTaken": []
        }

    async def send_input(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        grant_token: str,
        input_payload: dict[str, Any]
    ) -> dict[str, Any]:
        if browser_session.get("provider_live_connected") is True:
            if not grant_token.startswith("hosted_provider_grant_"):
                raise BrowserSandboxError("Hosted browser sandbox input requires a valid human takeover grant token.")
            path = browser_session.get("provider_paths", {}).get("input") or f"browser/sessions/{browser_session['provider_session_ref']}/input"
            result = await self._provider_json(
                path=path,
                body={
                    "takeoverId": takeover_id,
                    "approvalGrantRef": "approval-grant-ref-redacted",
                    "inputType": input_payload.get("type"),
                    "inputValue": "[redacted]"
                }
            )
            payload = result["payload"]
            return {
                "ok": result["status_code"] < 400 and payload.get("rawInputReturned") is not True,
                "status": payload.get("status", "interactive_takeover_input_relayed"),
                "takeoverId": takeover_id,
                "inputAccepted": payload.get("inputAccepted") is True,
                "inputRelay": "approval_gated_human_only",
                "rawInputReturned": False,
                "providerLiveConnected": True,
                "actionsTaken": []
            }
        self._require_harness()
        if not grant_token.startswith("hosted_grant_"):
            raise BrowserSandboxError("Hosted browser sandbox input requires a valid harness grant token.")
        return {
            "ok": True,
            "status": "interactive_takeover_input_relayed",
            "takeoverId": takeover_id,
            "inputAccepted": True,
            "inputRelay": "sanitized_contract_harness",
            "inputType": input_payload.get("type"),
            "rawInputReturned": False,
            "providerLiveConnected": False,
            "actionsTaken": []
        }

    async def exchange_webrtc_offer(
        self,
        *,
        browser_session: dict[str, Any],
        offer_ref: str,
        ice_candidate_ref: str | None = None
    ) -> dict[str, Any]:
        if browser_session.get("provider_live_connected") is not True:
            raise BrowserSandboxError("WebRTC signaling is available only for a live hosted provider session.")
        if not offer_ref or any(marker in offer_ref.lower() for marker in ["v=0", "candidate:", "password", "captcha", "member id", "subscriber id"]):
            raise BrowserSandboxError("WebRTC signaling requires an opaque offer reference, not raw SDP or private data.")
        if ice_candidate_ref and any(marker in ice_candidate_ref.lower() for marker in ["candidate:", "typ host", "password", "captcha"]):
            raise BrowserSandboxError("WebRTC signaling requires an opaque ICE candidate reference, not raw candidate text.")
        offer_path = browser_session.get("provider_paths", {}).get("webrtc_offer") or f"browser/sessions/{browser_session['provider_session_ref']}/webrtc/offer"
        result = await self._provider_json(
            path=offer_path,
            body={
                "offerRef": offer_ref,
                "rawSdpReturned": False,
                "clientCapabilities": {
                    "receiveVideo": True,
                    "receiveAudio": False,
                    "dataChannelInput": True
                }
            }
        )
        payload = result["payload"]
        serialized = json.dumps(payload, separators=(",", ":")).lower()
        if (
            result["status_code"] >= 400
            or payload.get("rawSdpReturned") is True
            or payload.get("rawIceCandidateReturned") is True
            or any(marker in serialized for marker in ["v=0", "candidate:", "a=fingerprint", "a=ice-ufrag", "turn:", "stun:", "bearer ", "token", "secret", "data:image", "member id", "subscriber id", "password", "captcha"])
        ):
            raise BrowserSandboxError("Hosted browser sandbox provider returned unsafe WebRTC signaling payload.")
        candidate_result: dict[str, Any] | None = None
        if ice_candidate_ref:
            candidate_path = browser_session.get("provider_paths", {}).get("webrtc_ice_candidate") or f"browser/sessions/{browser_session['provider_session_ref']}/webrtc/ice-candidate"
            candidate_result = await self._provider_json(
                path=candidate_path,
                body={
                    "candidateRef": ice_candidate_ref,
                    "rawIceCandidateReturned": False
                }
            )
            candidate_payload = candidate_result["payload"]
            candidate_serialized = json.dumps(candidate_payload, separators=(",", ":")).lower()
            if (
                candidate_result["status_code"] >= 400
                or candidate_payload.get("rawIceCandidateReturned") is True
                or any(marker in candidate_serialized for marker in ["candidate:", "a=fingerprint", "a=ice-ufrag", "turn:", "stun:", "bearer ", "token", "secret", "member id", "subscriber id", "password", "captcha"])
            ):
                raise BrowserSandboxError("Hosted browser sandbox provider returned unsafe ICE candidate payload.")
        return {
            "ok": True,
            "status": payload.get("status", "webrtc_signaling_answer_ready"),
            "browserSessionId": browser_session.get("browser_session_id"),
            "providerLiveConnected": True,
            "transport": payload.get("transport", "webrtc"),
            "answerRefPresent": bool(payload.get("answerRef")),
            "iceServerRefsPresent": bool(payload.get("iceServerRefs")),
            "candidateAccepted": bool(candidate_result and candidate_result["payload"].get("candidateAccepted") is True),
            "rawSdpReturned": False,
            "rawIceCandidateReturned": False,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "actionsTaken": []
        }


def _read_json_if_present(path: str | None) -> dict[str, Any] | None:
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            parsed = json.load(handle)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _read_text_if_present(path: str | None) -> str | None:
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except Exception:
        return None


def _path_is_inside_repo(path: str | None) -> bool:
    if not path:
        return False
    try:
        relative = os.path.relpath(os.path.abspath(path), os.getcwd())
    except ValueError:
        return False
    return bool(relative and not relative.startswith("..") and not os.path.isabs(relative))


def _public_path_ref(path: str | None, *, private_label: str) -> str | None:
    if not path:
        return None
    return path if _path_is_inside_repo(path) else private_label


def _latest_steel_self_host_proof() -> tuple[str | None, dict[str, Any] | None]:
    explicit_path = os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_STEEL_SELF_HOST_PROOF_FILE")
    if explicit_path:
        return _public_path_ref(explicit_path, private_label="[private-steel-self-host-proof-outside-git]"), _read_json_if_present(explicit_path)
    candidates = sorted(glob.glob(os.path.join("artifacts", "phase28", "steel-self-host-live-lifecycle-*.json")))
    if not candidates:
        return None, None
    latest = candidates[-1]
    return latest, _read_json_if_present(latest)


def _summarize_steel_self_host_proof() -> dict[str, Any]:
    artifact_ref, proof = _latest_steel_self_host_proof()
    lifecycle = proof.get("liveLifecycle", {}) if isinstance(proof, dict) and isinstance(proof.get("liveLifecycle"), dict) else {}
    create_session = lifecycle.get("createSession", {}) if isinstance(lifecycle.get("createSession"), dict) else {}
    stream = lifecycle.get("stream", {}) if isinstance(lifecycle.get("stream"), dict) else {}
    screenshot = lifecycle.get("screenshot", {}) if isinstance(lifecycle.get("screenshot"), dict) else {}
    ocr_caption = lifecycle.get("ocrCaption", {}) if isinstance(lifecycle.get("ocrCaption"), dict) else {}
    input_proof = lifecycle.get("input", {}) if isinstance(lifecycle.get("input"), dict) else {}
    takeover = lifecycle.get("takeover", {}) if isinstance(lifecycle.get("takeover"), dict) else {}
    teardown = lifecycle.get("teardown", {}) if isinstance(lifecycle.get("teardown"), dict) else {}
    offsite = lifecycle.get("offsite", {}) if isinstance(lifecycle.get("offsite"), dict) else {}
    safety = lifecycle.get("safety", {}) if isinstance(lifecycle.get("safety"), dict) else {}
    checks = [
        {"key": "session_create", "ok": create_session.get("ok") is True and lifecycle.get("providerLiveConnected") is True},
        {"key": "cdp_connect", "ok": create_session.get("cdpConnected") is True},
        {"key": "live_viewer_stream_ref", "ok": stream.get("ok") is True and stream.get("viewerUrlAvailable") is True},
        {"key": "screenshot_ref", "ok": screenshot.get("ok") is True and screenshot.get("screenshotRefPresent") is True and screenshot.get("rawImageReturned") is False},
        {"key": "ocr_caption_ref", "ok": ocr_caption.get("ok") is True and ocr_caption.get("captionRefPresent") is True and ocr_caption.get("rawOcrTextReturned") is False},
        {"key": "approved_input_relay", "ok": input_proof.get("ok") is True and input_proof.get("inputAccepted") is True and input_proof.get("rawInputReturned") is False},
        {"key": "takeover_approval_scope", "ok": takeover.get("ok") is True and takeover.get("approvalRequired") is True and takeover.get("inputRelay") == "approval_gated_human_only"},
        {"key": "teardown_release", "ok": teardown.get("ok") is True and teardown.get("teardownComplete") is True},
        {"key": "offsite_fail_closed", "ok": offsite.get("ok") is True and offsite.get("statusCode") == 403 and offsite.get("offsiteFailClosed") is True},
        {"key": "phi_redaction_policy", "ok": safety.get("rawFrameReturned") is False and safety.get("rawImageReturned") is False and safety.get("rawOcrTextReturned") is False and safety.get("rawInputReturned") is False}
    ]
    passed = sum(1 for check in checks if check["ok"])
    return {
        "status": "steel_self_host_live_proof_ready" if passed == len(checks) else "steel_self_host_live_proof_incomplete" if artifact_ref else "steel_self_host_live_proof_missing",
        "ok": passed == len(checks),
        "score": passed * 10,
        "target": 100,
        "passed": passed,
        "total": len(checks),
        "checks": checks,
        "artifactRef": artifact_ref,
        "providerStrategy": lifecycle.get("providerStrategy"),
        "viewerUrlEnvRef": "WEFELLA_BROWSER_SANDBOX_VIEWER_URL",
        "lifecycleRefPresent": bool(lifecycle.get("status")),
        "rawEndpointReturned": False,
        "rawSecretReturned": False,
        "rawFrameReturned": False,
        "rawOcrTextReturned": False,
        "rawInputReturned": False
    }


def validate_visual_ocr_proof_manifest(manifest: dict[str, Any], *, proof_path: str | None = None) -> dict[str, Any]:
    failures: list[str] = []
    if manifest.get("schemaVersion") != VISUAL_OCR_PROOF_SCHEMA_VERSION:
        failures.append("visual_ocr_schema_version_missing_or_unknown")
    if manifest.get("providerLiveConnected") is not True:
        failures.append("provider_live_connected_required")
    session = manifest.get("session", {}) if isinstance(manifest.get("session"), dict) else {}
    stream = manifest.get("stream", {}) if isinstance(manifest.get("stream"), dict) else {}
    screenshot = manifest.get("screenshot", {}) if isinstance(manifest.get("screenshot"), dict) else {}
    ocr_caption = manifest.get("ocrCaption", {}) if isinstance(manifest.get("ocrCaption"), dict) else {}
    takeover = manifest.get("takeover", {}) if isinstance(manifest.get("takeover"), dict) else {}
    input_proof = manifest.get("input", {}) if isinstance(manifest.get("input"), dict) else {}
    teardown = manifest.get("teardown", {}) if isinstance(manifest.get("teardown"), dict) else {}
    visual_proof = manifest.get("visualProof", {}) if isinstance(manifest.get("visualProof"), dict) else {}
    safety = manifest.get("safety", {}) if isinstance(manifest.get("safety"), dict) else {}
    if session.get("sessionRefPresent") is not True:
        failures.append("session_ref_required")
    if session.get("rawSessionRefReturned") is True:
        failures.append("raw_session_ref_must_not_be_returned")
    if stream.get("frameRefPresent") is not True:
        failures.append("frame_ref_required")
    if stream.get("rawFrameReturned") is True or stream.get("rawFramePersisted") is True:
        failures.append("raw_frame_must_not_be_returned_or_persisted")
    if screenshot.get("screenshotRefPresent") is not True:
        failures.append("screenshot_ref_required")
    if screenshot.get("rawImageReturned") is True:
        failures.append("raw_image_must_not_be_returned")
    if ocr_caption.get("captionRefPresent") is not True:
        failures.append("caption_ref_required")
    if ocr_caption.get("rawOcrTextReturned") is True or ocr_caption.get("rawOcrTextPersisted") is True:
        failures.append("raw_ocr_text_must_not_be_returned_or_persisted")
    if ocr_caption.get("visualCaptionSafe") is not True:
        failures.append("visual_caption_safety_required")
    if takeover.get("approvalRequired") is not True:
        failures.append("takeover_approval_required")
    if takeover.get("inputRelay") != "approval_gated_human_only":
        failures.append("input_relay_must_be_human_only")
    if input_proof.get("rawInputReturned") is True:
        failures.append("raw_input_must_not_be_returned")
    if input_proof.get("externalWriteActionsWithoutApproval") is True:
        failures.append("external_write_actions_without_approval")
    if teardown.get("teardownComplete") is not True:
        failures.append("teardown_required")
    if teardown.get("rawFramePersisted") is True or teardown.get("rawOcrTextPersisted") is True:
        failures.append("raw_replay_content_must_not_be_persisted")
    if visual_proof.get("dashboardScreenshotRefPresent") is not True:
        failures.append("dashboard_screenshot_ref_required")
    if visual_proof.get("mobileLiveBlockRefPresent") is not True:
        failures.append("mobile_live_block_ref_required")
    if visual_proof.get("ocrCaptionRefPresent") is not True:
        failures.append("visual_ocr_caption_ref_required")
    if safety.get("agentCredentialEntryAllowed") is True:
        failures.append("agent_credential_entry_allowed")
    if safety.get("externalWriteActionsWithoutApproval") is True:
        failures.append("external_write_actions_without_approval")
    if safety.get("rawEndpointReturned") is True:
        failures.append("raw_endpoint_returned")
    if safety.get("rawSecretReturned") is True:
        failures.append("raw_secret_returned")
    if proof_path and _path_is_inside_repo(proof_path):
        failures.append("visual_ocr_proof_file_must_live_outside_git")
    serialized = json.dumps(manifest, separators=(",", ":"))
    if re.search(r"https?://[^\"\\\s]+", serialized, re.I):
        failures.append("raw_provider_url_forbidden")
    if re.search(r"Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9]|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]", serialized, re.I):
        failures.append("raw_secret_forbidden")
    if re.search(r"data:image|<html|member id|subscriber id|password|captcha|typed-password", serialized, re.I):
        failures.append("raw_frame_ocr_or_credential_content_forbidden")
    if re.search(r"/Users/|/private/|/tmp/|/var/folders|[A-Za-z]:\\", serialized, re.I):
        failures.append("raw_local_path_forbidden")
    return {
        "ok": len(failures) == 0,
        "failures": failures,
        "sanitizedProof": {
            "providerLiveConnected": manifest.get("providerLiveConnected") is True,
            "sessionRefPresent": session.get("sessionRefPresent") is True,
            "streamFrameRefPresent": stream.get("frameRefPresent") is True,
            "screenshotRefPresent": screenshot.get("screenshotRefPresent") is True,
            "captionRefPresent": ocr_caption.get("captionRefPresent") is True,
            "visualCaptionSafe": ocr_caption.get("visualCaptionSafe") is True,
            "approvalRequired": takeover.get("approvalRequired") is True,
            "inputRelay": takeover.get("inputRelay"),
            "teardownComplete": teardown.get("teardownComplete") is True,
            "dashboardScreenshotRefPresent": visual_proof.get("dashboardScreenshotRefPresent") is True,
            "mobileLiveBlockRefPresent": visual_proof.get("mobileLiveBlockRefPresent") is True,
            "rawFrameReturned": stream.get("rawFrameReturned") is True,
            "rawImageReturned": screenshot.get("rawImageReturned") is True,
            "rawOcrTextReturned": ocr_caption.get("rawOcrTextReturned") is True,
            "rawInputReturned": input_proof.get("rawInputReturned") is True,
            "proofFileOutsideGit": bool(proof_path and not _path_is_inside_repo(proof_path))
        }
    }


def describe_browser_sandbox_provider_contract(
    *,
    provider: str | None = None,
    config_path: str | None = None,
    ready: bool | None = None
) -> dict[str, Any]:
    selected_provider = provider or os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER", "local_cdp")
    selected_config_path = config_path or os.environ.get(
        "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE",
        DEFAULT_PROVIDER_CONFIG_PATH
    )
    selected_ready = bool(ready if ready is not None else os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_READY") == "1")
    selection_contract = describe_browser_sandbox_provider_selection_contract()
    config = None
    config_ok = False
    failures: list[str] = []
    try:
        with open(selected_config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
    except Exception as exc:
        failures.append(f"config_unreadable:{exc}")
    if isinstance(config, dict):
        adapter_mode = config.get("adapter", {}).get("mode", "contract_only")
        provider_live_connected = config.get("adapter", {}).get("providerLiveConnected") is True
        contract_harness_only = config.get("adapter", {}).get("contractHarnessOnly") is True
        config_ok = (
            config.get("schemaVersion") == HOSTED_SANDBOX_CONTRACT_VERSION
            and config.get("provider") == "hosted_remote"
            and config.get("endpointRef")
            and not str(config.get("endpointRef")).startswith(("http://", "https://"))
            and adapter_mode in {"contract_only", "contract_harness", "hosted_provider"}
            and not (adapter_mode == "contract_harness" and provider_live_connected)
            and not (adapter_mode == "hosted_provider" and contract_harness_only)
            and not (adapter_mode == "hosted_provider" and not _is_env_ref(config.get("endpointRef")))
            and not (adapter_mode == "hosted_provider" and not _is_env_ref(config.get("auth", {}).get("tokenRef", DEFAULT_HOSTED_AUTH_TOKEN_REF)))
            and config.get("approvalPolicy", {}).get("agentCredentialEntryAllowed") is False
            and config.get("approvalPolicy", {}).get("externalWriteActionsAllowed") is False
            and config.get("sessionPolicy", {}).get("recordFrames") is False
            and config.get("sessionPolicy", {}).get("persistRawOcrText") is False
        )
        if not config_ok:
            failures.append("config_contract_failed")
    adapter_mode = config.get("adapter", {}).get("mode", "contract_only") if isinstance(config, dict) else "missing"
    hosted_resolution = resolve_hosted_browser_sandbox_provider_config(
        config=config if isinstance(config, dict) else None,
        config_path=selected_config_path,
        config_ok=config_ok,
        selected_provider=selected_provider,
        selected_ready=selected_ready
    )
    non_example_config = selected_config_path != DEFAULT_PROVIDER_CONFIG_PATH
    adapter_harness_ready = bool(
        selected_provider == "hosted_remote"
        and selected_ready
        and config_ok
        and non_example_config
        and adapter_mode == "contract_harness"
    )
    live_preflight_ready = bool(
        selection_contract["preflightReady"]
        and hosted_resolution["resolverReady"]
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY") == "1"
    )
    live_verification_ready = bool(
        live_preflight_ready
        and hosted_resolution["resolverReady"]
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY") == "1"
    )
    webrtc_signaling_ready = bool(
        live_verification_ready
        and hosted_resolution["resolverReady"]
        and hosted_resolution["streamRequiresWebrtc"]
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY") == "1"
    )
    visual_ocr_proof_path = os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE")
    visual_ocr_proof_manifest = _read_json_if_present(visual_ocr_proof_path)
    visual_ocr_proof_validation = (
        validate_visual_ocr_proof_manifest(visual_ocr_proof_manifest, proof_path=visual_ocr_proof_path)
        if visual_ocr_proof_manifest
        else {
            "ok": False,
            "failures": ["visual_ocr_proof_file_required"],
            "sanitizedProof": {}
        }
    )
    visual_ocr_replay_ready = bool(
        live_verification_ready
        and (not hosted_resolution["streamRequiresWebrtc"] or webrtc_signaling_ready)
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY") == "1"
        and visual_ocr_proof_path
        and visual_ocr_proof_validation["ok"]
    )
    steel_self_host_proof = _summarize_steel_self_host_proof()
    launch_runbook_text = _read_text_if_present(PROVIDER_LAUNCH_READINESS_RUNBOOK_PATH)
    launch_env_text = _read_text_if_present(PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH)
    launch_runbook_ready = bool(
        launch_runbook_text
        and "Launch Readiness Sequence" in launch_runbook_text
        and "hosted_remote_browser_sandbox" in launch_runbook_text
        and launch_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY=0" in launch_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0" in launch_env_text
    )
    private_proof_chain_ready = bool(
        launch_runbook_ready
        and selection_contract["preflightReady"]
        and hosted_resolution["resolverReady"]
        and live_verification_ready
        and (not hosted_resolution["streamRequiresWebrtc"] or webrtc_signaling_ready)
        and visual_ocr_replay_ready
        and selected_config_path
        and not _path_is_inside_repo(selected_config_path)
        and visual_ocr_proof_path
        and not _path_is_inside_repo(visual_ocr_proof_path)
    )
    final_enablement_allowed = bool(
        os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY") == "1"
        and private_proof_chain_ready
        and hosted_resolution["resolverReady"]
        and hosted_resolution["liveVerified"]
        and hosted_resolution["liveVerificationReady"]
        and hosted_resolution["providerLiveConnected"]
    )
    private_launch_execution_env_text = _read_text_if_present(PROVIDER_PRIVATE_LAUNCH_EXECUTION_ENV_EXAMPLE_PATH)
    private_launch_execution_env_ready = bool(
        private_launch_execution_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY=0" in private_launch_execution_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED=0" in private_launch_execution_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0" in private_launch_execution_env_text
    )
    private_launch_execution_ready = bool(
        private_launch_execution_env_ready
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY") == "1"
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED") == "1"
        and private_proof_chain_ready
        and final_enablement_allowed
    )
    provider_ready = bool(
        selected_provider == "hosted_remote"
        and selected_ready
        and config_ok
        and non_example_config
        and adapter_mode == "hosted_provider"
        and hosted_resolution["resolverReady"]
        and hosted_resolution["liveVerified"]
        and hosted_resolution["liveVerificationReady"]
        and hosted_resolution["webrtcSignalingReady"]
        and hosted_resolution["visualOcrReplayReady"]
        and visual_ocr_replay_ready
        and hosted_resolution["providerLiveConnected"]
        and private_launch_execution_ready
    )
    adapter_contract_ready = bool(
        selected_provider == "hosted_remote"
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY") == "1"
        and config_ok
        and non_example_config
        and adapter_mode == "hosted_provider"
        and hosted_resolution["resolverReady"]
        and not provider_ready
    )
    http_adapter_harness_ready = bool(
        adapter_contract_ready
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_HTTP_ADAPTER_HARNESS_READY") == "1"
    )
    live_lifecycle_harness_ready = bool(
        http_adapter_harness_ready
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_LIFECYCLE_HARNESS_READY") == "1"
    )
    status = (
        "hosted_browser_sandbox_provider_ready"
        if provider_ready
        else "hosted_browser_sandbox_adapter_harness_ready" if adapter_harness_ready
        else "hosted_browser_sandbox_provider_visual_ocr_replay_ready" if visual_ocr_replay_ready
        else "hosted_browser_sandbox_provider_live_lifecycle_harness_ready" if live_lifecycle_harness_ready
        else "hosted_browser_sandbox_provider_http_adapter_harness_ready" if http_adapter_harness_ready
        else "hosted_browser_sandbox_provider_adapter_contract_ready" if adapter_contract_ready
        else "local_cdp_default" if selected_provider == "local_cdp"
        else hosted_resolution["status"] if adapter_mode == "hosted_provider" and config_ok
        else "hosted_browser_sandbox_contract_valid_not_configured" if config_ok
        else "hosted_browser_sandbox_contract_missing_or_invalid"
    )
    return {
        "version": HOSTED_SANDBOX_CONTRACT_VERSION,
        "provider": selected_provider,
        "configPath": _public_path_ref(selected_config_path, private_label="[private-provider-config-outside-git]"),
        "configOk": config_ok,
        "adapterMode": adapter_mode,
        "ready": provider_ready,
        "adapterHarnessReady": adapter_harness_ready,
        "hostedProviderResolverReady": hosted_resolution["resolverReady"],
        "hostedProviderSelectionReady": selection_contract["contractReady"],
        "hostedProviderSelectionPreflightReady": selection_contract["preflightReady"],
        "hostedProviderSelection": selection_contract,
        "hostedProviderLivePreflightReady": live_preflight_ready,
        "hostedProviderLivePreflight": {
            "status": (
                "hosted_browser_sandbox_provider_live_preflight_ready"
                if live_preflight_ready
                else "hosted_browser_sandbox_provider_live_preflight_requires_explicit_gate"
                if selection_contract["preflightReady"] and hosted_resolution["resolverReady"]
                else "hosted_browser_sandbox_provider_live_preflight_blocked"
            ),
            "resolverReady": hosted_resolution["resolverReady"],
            "selectionPreflightReady": selection_contract["preflightReady"],
            "liveProbeEnabled": os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_PROBE") == "1",
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False
        },
        "hostedProviderLiveVerificationReady": live_verification_ready,
        "hostedProviderLiveVerification": {
            "status": (
                "hosted_browser_sandbox_provider_live_verification_ready"
                if live_verification_ready
                else "hosted_browser_sandbox_provider_live_verification_requires_explicit_gate"
                if live_preflight_ready
                else "hosted_browser_sandbox_provider_live_verification_blocked"
            ),
            "resolverReady": hosted_resolution["resolverReady"],
            "livePreflightReady": live_preflight_ready,
            "providerLiveConnected": hosted_resolution.get("providerLiveConnected") is True,
            "liveVerified": hosted_resolution.get("liveVerified") is True,
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False
        },
        "hostedProviderSteelSelfHostProofReady": steel_self_host_proof["ok"],
        "hostedProviderSteelSelfHostProof": steel_self_host_proof,
        "hostedProviderWebrtcSignalingReady": webrtc_signaling_ready,
        "hostedProviderWebrtcSignaling": {
            "status": (
                "hosted_browser_sandbox_provider_webrtc_signaling_ready"
                if webrtc_signaling_ready
                else "hosted_browser_sandbox_provider_webrtc_signaling_requires_explicit_gate"
                if live_verification_ready and hosted_resolution["streamRequiresWebrtc"]
                else "hosted_browser_sandbox_provider_webrtc_signaling_not_required"
                if not hosted_resolution["streamRequiresWebrtc"]
                else "hosted_browser_sandbox_provider_webrtc_signaling_blocked"
            ),
            "resolverReady": hosted_resolution["resolverReady"],
            "liveVerificationReady": live_verification_ready,
            "streamRequiresWebrtc": hosted_resolution["streamRequiresWebrtc"],
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawSdpReturned": False,
            "rawIceCandidateReturned": False
        },
        "hostedProviderVisualOcrReplayReady": visual_ocr_replay_ready,
        "hostedProviderVisualOcrReplay": {
            "status": (
                "hosted_browser_sandbox_provider_visual_ocr_replay_ready"
                if visual_ocr_replay_ready
                else "hosted_browser_sandbox_provider_visual_ocr_replay_requires_private_proof"
                if os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY") == "1"
                else "hosted_browser_sandbox_provider_visual_ocr_replay_blocked"
            ),
            "liveVerificationReady": live_verification_ready,
            "webrtcSignalingReady": webrtc_signaling_ready,
            "streamRequiresWebrtc": hosted_resolution["streamRequiresWebrtc"],
            "proofFilePresent": bool(visual_ocr_proof_path),
            "proofFileOutsideGit": bool(visual_ocr_proof_validation.get("sanitizedProof", {}).get("proofFileOutsideGit")),
            "proofValidationOk": visual_ocr_proof_validation["ok"],
            "failures": visual_ocr_proof_validation.get("failures", []),
            "sanitizedProof": visual_ocr_proof_validation.get("sanitizedProof", {}),
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawFrameReturned": False,
            "rawOcrTextReturned": False,
            "rawInputReturned": False
        },
        "hostedProviderLaunchReadinessRunbookReady": launch_runbook_ready,
        "hostedProviderPrivateProofChainReady": private_proof_chain_ready,
        "hostedProviderFinalEnablementAllowed": final_enablement_allowed,
        "hostedProviderLaunchReadiness": {
            "status": (
                "hosted_browser_sandbox_provider_launch_ready"
                if final_enablement_allowed
                else "hosted_browser_sandbox_provider_launch_waiting_final_enablement"
                if private_proof_chain_ready
                else "hosted_browser_sandbox_provider_launch_runbook_ready"
                if launch_runbook_ready
                else "hosted_browser_sandbox_provider_launch_runbook_incomplete"
            ),
            "runbookReady": launch_runbook_ready,
            "privateProofChainReady": private_proof_chain_ready,
            "finalEnablementAllowed": final_enablement_allowed,
            "envExample": PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH,
            "runbook": PROVIDER_LAUNCH_READINESS_RUNBOOK_PATH,
            "command": "npm run sandbox:browser:provider-launch-readiness",
            "configOutsideGit": bool(selected_config_path and not _path_is_inside_repo(selected_config_path)),
            "proofFileOutsideGit": bool(visual_ocr_proof_path and not _path_is_inside_repo(visual_ocr_proof_path)),
            "missing": (
                ([] if selection_contract["preflightReady"] else ["selection_preflight"])
                + ([] if live_verification_ready else ["live_verification"])
                + ([] if (not hosted_resolution["streamRequiresWebrtc"] or webrtc_signaling_ready) else ["webrtc_signaling"])
                + ([] if visual_ocr_replay_ready else ["visual_ocr_replay_private_proof"])
                + ([] if selected_config_path and not _path_is_inside_repo(selected_config_path) else ["private_provider_config_outside_git"])
                + ([] if visual_ocr_proof_path and not _path_is_inside_repo(visual_ocr_proof_path) else ["private_visual_ocr_proof_outside_git"])
                + ([] if hosted_resolution.get("status") == "hosted_browser_sandbox_provider_ready" else ["final_live_verified_switch"])
            ),
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawFrameReturned": False,
            "rawOcrTextReturned": False,
            "rawInputReturned": False
        },
        "hostedProviderPrivateLaunchExecutionReady": private_launch_execution_ready,
        "hostedProviderPrivateLaunchExecution": {
            "status": (
                "hosted_browser_sandbox_provider_private_launch_executed"
                if private_launch_execution_ready
                else "hosted_browser_sandbox_provider_private_launch_execution_blocked"
                if os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY") == "1"
                else "hosted_browser_sandbox_provider_private_launch_execution_not_enabled"
            ),
            "envExampleReady": private_launch_execution_env_ready,
            "executionGate": os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY") == "1",
            "finalHumanReviewed": os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED") == "1",
            "privateProofChainReady": private_proof_chain_ready,
            "finalEnablementAllowed": final_enablement_allowed,
            "command": "npm run sandbox:browser:provider-private-launch-execution",
            "envExample": PROVIDER_PRIVATE_LAUNCH_EXECUTION_ENV_EXAMPLE_PATH,
            "missing": (
                ([] if private_launch_execution_env_ready else ["private_launch_execution_env_template"])
                + ([] if os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY") == "1" else ["private_launch_execution_gate"])
                + ([] if private_proof_chain_ready else ["private_proof_chain_ready"])
                + ([] if final_enablement_allowed else ["launch_final_enablement_allowed"])
                + ([] if os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED") == "1" else ["final_human_review"])
            ),
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawFrameReturned": False,
            "rawOcrTextReturned": False,
            "rawInputReturned": False
        },
        "hostedProviderAdapterReady": adapter_contract_ready,
        "hostedProviderHttpAdapterReady": http_adapter_harness_ready,
        "hostedProviderLiveLifecycleHarnessReady": live_lifecycle_harness_ready,
        "hostedProviderResolver": hosted_resolution,
        "status": status,
        "failures": failures,
        "safety": {
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawOcrTextReturned": False,
            "agentCredentialEntryAllowed": False,
            "externalWriteActionsAllowed": False
        }
    }


def describe_browser_sandbox_provider_selection_contract(
    *,
    config_path: str | None = None,
    environ: dict[str, str] | None = None
) -> dict[str, Any]:
    env = environ if environ is not None else os.environ
    selected_config_path = config_path or env.get(
        "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE",
        DEFAULT_PROVIDER_SELECTION_CONFIG_PATH
    )
    failures: list[str] = []
    config: dict[str, Any] | None = None
    try:
        with open(selected_config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
    except Exception as exc:
        failures.append(f"selection_config_unreadable:{exc}")
    candidate_keys: list[str] = []
    if isinstance(config, dict):
        candidates = config.get("candidateProviders")
        candidate_list = candidates if isinstance(candidates, list) else []
        candidate_keys = [str(candidate.get("key")) for candidate in candidate_list if isinstance(candidate, dict) and candidate.get("key")]
        required_policy = config.get("selectionPolicy", {})
        required_visual = config.get("visualProof", {})
        contract_ok = (
            config.get("schemaVersion") == "brainstyworkers.browser-sandbox-provider-selection.v1"
            and config.get("status") == "selection_contract_only"
            and config.get("environment") in {"staging", "production"}
            and len(candidate_keys) >= 3
            and required_policy.get("privateConfigRequired") is True
            and required_policy.get("publicApiOnly") is True
            and required_policy.get("noProviderSecretsInGit") is True
            and required_policy.get("liveProviderVerificationRequired") is True
            and required_policy.get("guiOcrProofRequired") is True
            and required_policy.get("hostedRemoteScoreMustRemainBlockedUntilLive") is True
            and required_visual.get("dashboardRequired") is True
            and required_visual.get("mobilePwaRequired") is True
            and required_visual.get("liveWorkerBlockRequired") is True
            and required_visual.get("ocrCaptionRequired") is True
            and not any("://" in str(candidate) for candidate in candidate_list)
        )
    else:
        contract_ok = False
    if not contract_ok and "selection_config_unreadable" not in ",".join(failures):
        failures.append("selection_contract_failed")
    selected_provider = env.get("WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER")
    selected_provider_known = bool(selected_provider and selected_provider in candidate_keys)
    preflight_ready = bool(
        contract_ok
        and env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY") == "1"
        and selected_provider_known
    )
    return {
        "status": (
            "hosted_browser_sandbox_provider_selection_preflight_ready"
            if preflight_ready
            else "hosted_browser_sandbox_provider_selection_contract_ready" if contract_ok
            else "hosted_browser_sandbox_provider_selection_missing_or_invalid"
        ),
        "contractReady": contract_ok,
        "preflightReady": preflight_ready,
        "configPath": _public_path_ref(selected_config_path, private_label="[private-selection-config-outside-git]"),
        "candidateKeys": candidate_keys,
        "selectedProviderKnown": selected_provider_known,
        "selectedProviderKey": selected_provider if selected_provider_known else None,
        "rawEndpointReturned": False,
        "rawSecretReturned": False,
        "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
        "failures": failures
    }


def _is_env_ref(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("env:") and len(value) > 4


def _env_name_from_ref(value: Any) -> str | None:
    return value[4:] if _is_env_ref(value) else None


def _ref_kind(value: Any) -> str | None:
    if not value:
        return None
    text = str(value)
    if _is_env_ref(text):
        return "env"
    if text.startswith(("http://", "https://")):
        return "raw_url"
    return "logical_ref"


def _is_https_endpoint(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("https://") and len(value) > len("https://")


def resolve_hosted_browser_sandbox_provider_config(
    *,
    config: dict[str, Any] | None,
    config_path: str,
    config_ok: bool,
    selected_provider: str,
    selected_ready: bool,
    environ: dict[str, str] | None = None
) -> dict[str, Any]:
    env = environ if environ is not None else os.environ
    adapter_mode = config.get("adapter", {}).get("mode", "missing") if isinstance(config, dict) else "missing"
    non_example_config = config_path != DEFAULT_PROVIDER_CONFIG_PATH
    endpoint_ref = config.get("endpointRef") if isinstance(config, dict) else None
    auth_token_ref = config.get("auth", {}).get("tokenRef", DEFAULT_HOSTED_AUTH_TOKEN_REF) if isinstance(config, dict) else DEFAULT_HOSTED_AUTH_TOKEN_REF
    endpoint_env_name = _env_name_from_ref(endpoint_ref)
    auth_env_name = _env_name_from_ref(auth_token_ref)
    endpoint_resolved = bool(endpoint_env_name and _is_https_endpoint(env.get(endpoint_env_name)))
    auth_resolved = bool(auth_env_name and env.get(auth_env_name))
    live_verified = env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED") == "1"
    live_verification_ready = env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY") == "1"
    provider_live_connected = bool(isinstance(config, dict) and config.get("adapter", {}).get("providerLiveConnected") is True)
    stream_transport = config.get("transport", {}).get("stream") if isinstance(config, dict) else None
    stream_requires_webrtc = stream_transport in {"webrtc", "webrtc_or_sse_frames"}
    webrtc_signaling_ready = (not stream_requires_webrtc) or env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY") == "1"
    visual_ocr_replay_ready = env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY") == "1"
    resolver_ready = bool(
        selected_provider == "hosted_remote"
        and selected_ready
        and config_ok
        and non_example_config
        and adapter_mode == "hosted_provider"
        and endpoint_resolved
        and auth_resolved
    )
    status = (
        "hosted_browser_sandbox_provider_ready"
        if resolver_ready and live_verified and live_verification_ready and webrtc_signaling_ready and visual_ocr_replay_ready and provider_live_connected
        else "hosted_browser_sandbox_provider_configured_unverified" if resolver_ready
        else "hosted_browser_sandbox_provider_missing_endpoint_or_secret"
        if selected_provider == "hosted_remote" and selected_ready and config_ok and non_example_config and adapter_mode == "hosted_provider"
        else "hosted_browser_sandbox_provider_not_selected"
    )
    return {
        "status": status,
        "resolverReady": resolver_ready,
        "endpointResolved": endpoint_resolved,
        "authResolved": auth_resolved,
        "liveVerified": live_verified,
        "liveVerificationReady": live_verification_ready,
        "providerLiveConnected": provider_live_connected,
        "streamRequiresWebrtc": stream_requires_webrtc,
        "webrtcSignalingReady": webrtc_signaling_ready,
        "visualOcrReplayReady": visual_ocr_replay_ready,
        "endpointRefKind": _ref_kind(endpoint_ref),
        "authTokenRefKind": _ref_kind(auth_token_ref),
        "endpointEnvPresent": bool(endpoint_env_name),
        "authEnvPresent": bool(auth_env_name),
        "rawEndpointReturned": False,
        "rawSecretReturned": False,
        "rawSecretPathReturned": False
    }


async def hosted_browser_sandbox_harness_stream(browser_session: dict[str, Any]) -> AsyncIterator[str]:
    payload = {
        "eventType": "hosted.sandbox.contract_frame",
        "browserSessionId": browser_session.get("browser_session_id"),
        "sessionId": browser_session.get("session_id"),
        "provider": "hosted_remote",
        "adapterMode": "contract_harness",
        "providerLiveConnected": False,
        "frameSource": "hosted_contract_harness",
        "caption": {
            "status": "caption_contract_ready",
            "rawOcrTextReturned": False
        },
        "safety": {
            "rawFrameReturned": False,
            "rawOcrTextReturned": False,
            "externalWriteActionsWithoutApproval": False
        }
    }
    yield f"event: hosted.sandbox.contract_frame\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


async def hosted_browser_sandbox_provider_stream(browser_session: dict[str, Any]) -> AsyncIterator[str]:
    provider = HostedRemoteBrowserSandboxProvider()
    config = provider._load_private_config()
    endpoint, token = provider._endpoint_and_token(config)
    stream_path = browser_session.get("provider_paths", {}).get("stream") or f"browser/sessions/{browser_session['provider_session_ref']}/stream"
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "GET",
            str(httpx.URL(endpoint).join(str(stream_path).lstrip("/"))),
            headers={
                "accept": "text/event-stream",
                "authorization": f"Bearer {token}",
                "x-brainstyworkers-contract-version": HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION
            }
        ) as response:
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                try:
                    event_payload = json.loads(line.removeprefix("data:").strip())
                except Exception:
                    continue
                safe_payload = {
                    "eventType": event_payload.get("eventType", "hosted.sandbox.provider_frame"),
                    "browserSessionId": browser_session.get("browser_session_id"),
                    "sessionId": browser_session.get("session_id"),
                    "provider": "hosted_remote",
                    "adapterMode": "hosted_provider",
                    "providerLiveConnected": event_payload.get("providerLiveConnected") is True,
                    "frameRefPresent": bool(event_payload.get("frameRef")),
                    "captionRefPresent": bool(event_payload.get("ocrCaption", {}).get("captionRef")),
                    "safety": {
                        "rawFrameReturned": event_payload.get("rawFrameReturned") is True,
                        "rawOcrTextReturned": event_payload.get("ocrCaption", {}).get("rawOcrTextReturned") is True,
                        "externalWriteActionsWithoutApproval": False
                    }
                }
                if safe_payload["safety"]["rawFrameReturned"] or safe_payload["safety"]["rawOcrTextReturned"]:
                    yield f"event: hosted.sandbox.provider_blocked\ndata: {json.dumps({'eventType': 'hosted.sandbox.provider_blocked', 'reason': 'raw_frame_or_ocr_blocked'}, separators=(',', ':'))}\n\n"
                    return
                yield f"event: hosted.sandbox.provider_frame\ndata: {json.dumps(safe_payload, separators=(',', ':'))}\n\n"


def get_browser_sandbox_provider(provider: str | None) -> BrowserSandboxProvider:
    if provider in {None, "local_cdp"}:
        return LocalCdpBrowserSandboxProvider()
    if provider == "hosted_remote":
        return HostedRemoteBrowserSandboxProvider()
    raise BrowserSandboxError(f"Unsupported browser sandbox provider: {provider}")
