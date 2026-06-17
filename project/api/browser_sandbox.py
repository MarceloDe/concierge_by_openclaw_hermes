from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from typing import Any, AsyncIterator
from uuid import uuid4


SANDBOX_CONTRACT_VERSION = "browser-sandbox-provider.v1"
HOSTED_SANDBOX_CONTRACT_VERSION = "brainstyworkers.browser-sandbox-provider.v1"
DEFAULT_PROVIDER_CONFIG_PATH = "project/deployment/browser-sandbox-provider.example.json"
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
            raise BrowserSandboxError(
                "Hosted browser sandbox provider is not configured. "
                "Set WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE to a non-example provider config and "
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY=1 after hosted proof passes."
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
    status = (
        "hosted_browser_sandbox_provider_ready"
        if provider_ready
        else "hosted_browser_sandbox_adapter_harness_ready" if adapter_harness_ready
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
        "hostedProviderAdapterReady": adapter_contract_ready,
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
    provider_live_connected = bool(isinstance(config, dict) and config.get("adapter", {}).get("providerLiveConnected") is True)
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
        if resolver_ready and live_verified and provider_live_connected
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
        "providerLiveConnected": provider_live_connected,
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


def get_browser_sandbox_provider(provider: str | None) -> BrowserSandboxProvider:
    if provider in {None, "local_cdp"}:
        return LocalCdpBrowserSandboxProvider()
    if provider == "hosted_remote":
        return HostedRemoteBrowserSandboxProvider()
    raise BrowserSandboxError(f"Unsupported browser sandbox provider: {provider}")
