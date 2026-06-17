from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from typing import Any, AsyncIterator
from uuid import uuid4

import httpx


SANDBOX_CONTRACT_VERSION = "browser-sandbox-provider.v1"
HOSTED_SANDBOX_CONTRACT_VERSION = "brainstyworkers.browser-sandbox-provider.v1"
HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION = "2026-06-17.browser-sandbox-provider.v1"
DEFAULT_PROVIDER_CONFIG_PATH = "project/deployment/browser-sandbox-provider.example.json"
DEFAULT_PROVIDER_SELECTION_CONFIG_PATH = "project/deployment/browser-sandbox-provider.selection.example.json"
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
        and hosted_resolution["providerLiveConnected"]
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
    status = (
        "hosted_browser_sandbox_provider_ready"
        if provider_ready
        else "hosted_browser_sandbox_adapter_harness_ready" if adapter_harness_ready
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
        "configPath": selected_config_path,
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
        "configPath": selected_config_path,
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
        if resolver_ready and live_verified and live_verification_ready and webrtc_signaling_ready and provider_live_connected
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
