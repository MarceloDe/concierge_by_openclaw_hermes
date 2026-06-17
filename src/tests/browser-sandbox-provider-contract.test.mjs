import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
  validateBrowserSandboxProviderContract,
  validateBrowserSandboxProviderSelectionContract,
  runBrowserSandboxProviderContractSmoke,
  runBrowserSandboxProviderSelectionSmoke,
  runBrowserSandboxProviderLivePreflightSmoke,
  runBrowserSandboxProviderLiveVerificationSmoke,
  runBrowserSandboxAdapterHarnessSmoke,
  runBrowserSandboxProviderResolverSmoke,
  runBrowserSandboxProviderAdapterSmoke,
  runBrowserSandboxProviderHttpAdapterHarnessSmoke,
  runBrowserSandboxProviderLiveLifecycleHarnessSmoke
} from "../../scripts/browser-sandbox-provider-contract.mjs";

test("hosted browser sandbox provider contract validates the safe remote provider shape", async () => {
  const source = await readFile(new URL("../../scripts/browser-sandbox-provider-contract.mjs", import.meta.url), "utf8");
  assert.match(BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION, /browser-sandbox-provider/);
  const validation = await validateBrowserSandboxProviderContract();
  assert.equal(validation.ok, true);
  assert.equal(validation.sanitizedConfig.provider, "hosted_remote");
  assert.equal(validation.sanitizedConfig.sessionPolicy.recordFrames, false);
  assert.equal(validation.sanitizedConfig.approvalPolicy.agentCredentialEntryAllowed, false);
  for (const fragment of [
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY",
    "endpoint_ref_must_not_be_raw_url",
    "agent_credential_entry_must_be_blocked",
    "external_write_actions_must_be_blocked",
    "hosted_browser_sandbox_contract_valid_not_configured"
  ]) {
    assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("hosted browser sandbox smoke does not claim readiness from the example config", async () => {
  const result = await runBrowserSandboxProviderContractSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-contract-smoke-test.json",
    providerReady: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_contract_valid_not_configured");
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretFilePathWritten, false);
  assert.equal(result.safety.rawOcrTextReturned, false);
  assert.equal(result.safety.frameRecordingEnabled, false);
});

test("hosted browser sandbox provider selection contract is non-secret and separate from live readiness", async () => {
  const validation = await validateBrowserSandboxProviderSelectionContract();
  assert.equal(validation.ok, true);
  assert.equal(validation.sanitizedConfig.status, "selection_contract_only");
  assert.equal(validation.sanitizedConfig.candidateCount >= 3, true);
  assert.equal(validation.sanitizedConfig.selectionPolicy.privateConfigRequired, true);
  assert.equal(validation.sanitizedConfig.selectionPolicy.publicApiOnly, true);
  assert.equal(validation.sanitizedConfig.selectionPolicy.hostedRemoteScoreMustRemainBlockedUntilLive, true);
  assert.equal(validation.sanitizedConfig.visualProof.dashboardRequired, true);

  const result = await runBrowserSandboxProviderSelectionSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-selection-smoke-test.json",
    env: {}
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.providerSelectionContractReady, true);
  assert.equal(result.providerSelectionPreflightReady, false);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_selection_contract_ready");
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
  assert.doesNotMatch(serialized, /https?:\/\//);
  assert.doesNotMatch(serialized, /Bearer\s+|sk-[A-Za-z0-9]/);
});

test("hosted browser sandbox provider selection preflight can pass without overclaiming live provider", async () => {
  const result = await runBrowserSandboxProviderSelectionSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-selection-preflight-smoke-test.json",
    env: {
      WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: "custom_webrtc",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: "1"
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.providerSelectionContractReady, true);
  assert.equal(result.providerSelectionPreflightReady, true);
  assert.equal(result.selectedProviderKnown, true);
  assert.equal(result.selectedProviderKey, "custom_webrtc");
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_selection_preflight_ready");
  assert.equal(result.hostedRemoteScoreMayPassOnlyAfterLiveVerified, true);
  assert.deepEqual(result.requiredLiveProofBeforeHostedReady.includes("dashboard visual proof"), true);
});

test("hosted browser sandbox provider live preflight requires explicit private-config gate", async () => {
  const result = await runBrowserSandboxProviderLivePreflightSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-live-preflight-blocked-smoke-test.json",
    env: {}
  });
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderLivePreflightReady, false);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_live_preflight_blocked");
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
});

test("hosted browser sandbox provider live preflight can pass without enabling hosted remote browser", async () => {
  const result = await runBrowserSandboxProviderLivePreflightSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-live-preflight-smoke-test.json",
    env: {
      WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
      WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL: "https://sandbox-provider.invalid/api",
      WEFELLA_BROWSER_SANDBOX_API_TOKEN: "test-token-that-must-not-leak",
      WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: "custom_webrtc",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY: "1"
    }
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderLivePreflightReady, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_live_preflight_ready");
  assert.equal(result.resolver.resolverReady, true);
  assert.equal(result.selection.providerSelectionPreflightReady, true);
  assert.equal(result.providerHealthProbe.attempted, false);
  assert.equal(result.hostedRemoteScoreMayPassOnlyAfterLiveVerified, true);
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
  assert.doesNotMatch(serialized, /sandbox-provider\.invalid/);
  assert.doesNotMatch(serialized, /test-token-that-must-not-leak/);
});

test("hosted browser sandbox provider live verification proves selected provider lifecycle without leaking secrets", async () => {
  const result = await runBrowserSandboxProviderLiveVerificationSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-live-verification-smoke-test.json",
    env: {
      WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
      WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL: "https://sandbox-provider.invalid/api",
      WEFELLA_BROWSER_SANDBOX_API_TOKEN: "test-token-that-must-not-leak",
      WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: "custom_webrtc",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY: "1"
    },
    fetchImpl: fakeLiveProviderFetch
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderLiveVerificationReady, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_live_verified");
  assert.equal(result.liveLifecycle.providerNetworkCalled, true);
  assert.equal(result.liveLifecycle.localHarnessOnly, false);
  assert.equal(result.liveLifecycle.providerLiveConnected, true);
  assert.equal(result.liveLifecycle.stream.frameRefPresent, true);
  assert.equal(result.liveLifecycle.screenshot.screenshotRefPresent, true);
  assert.equal(result.liveLifecycle.ocrCaption.captionRefPresent, true);
  assert.equal(result.liveLifecycle.takeover.approvalRequired, true);
  assert.equal(result.liveLifecycle.takeover.inputRelay, "approval_gated_human_only");
  assert.equal(result.liveLifecycle.input.rawInputReturned, false);
  assert.equal(result.liveLifecycle.offsite.offsiteFailClosed, true);
  assert.equal(result.liveLifecycle.teardown.teardownComplete, true);
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
  assert.equal(result.safety.rawFrameReturned, false);
  assert.equal(result.safety.rawOcrTextReturned, false);
  assert.doesNotMatch(serialized, /sandbox-provider\.invalid/);
  assert.doesNotMatch(serialized, /test-token-that-must-not-leak/);
  assert.doesNotMatch(serialized, /data:image|member id|subscriber id|typed-password/i);
});

test("hosted browser sandbox provider readiness requires live verification gate even when live verified is set", async () => {
  const previousProvider = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER;
  const previousEndpoint = process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL;
  const previousToken = process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN;
  const previousLive = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED;
  const previousLiveVerification = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY;
  try {
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER = "hosted_remote";
    process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL = "https://sandbox-provider.invalid/api";
    process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN = "test-token-that-must-not-leak";
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED = "1";
    delete process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY;
    const result = await runBrowserSandboxProviderContractSmoke({
      configPath: "project/deployment/browser-sandbox-provider.hosted-provider.example.json",
      artifactPath: "/tmp/brainsty-browser-sandbox-provider-live-verification-required-test.json",
      providerReady: true
    });
    assert.equal(result.hostedProviderResolverReady, true);
    assert.equal(result.hostedProviderReady, false);
    assert.equal(result.hostedProviderResolver.ready, false);
    assert.equal(result.hostedProviderResolver.liveVerified, true);
    assert.equal(result.hostedProviderResolver.liveVerificationReady, false);
  } finally {
    restoreEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER", previousProvider);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL", previousEndpoint);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_API_TOKEN", previousToken);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED", previousLive);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY", previousLiveVerification);
  }
});

test("hosted browser sandbox adapter harness proves lifecycle shape without claiming live provider", async () => {
  const result = await runBrowserSandboxAdapterHarnessSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-adapter-harness-smoke-test.json"
  });
  assert.equal(result.ok, true);
  assert.equal(result.adapterHarnessReady, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_adapter_harness_ready");
  assert.equal(result.validation.sanitizedConfig.adapter.mode, "contract_harness");
  assert.equal(result.lifecycle.streamFrames, "contract_harness_sse_event_available");
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawOcrTextReturned, false);
});

test("hosted browser sandbox provider resolver is safe and separate from live readiness", async () => {
  const previousProvider = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER;
  const previousEndpoint = process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL;
  const previousToken = process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN;
  const previousLive = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED;
  try {
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER = "hosted_remote";
    process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL = "https://sandbox-provider.invalid/api";
    process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN = "test-token-that-must-not-leak";
    delete process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED;
    const result = await runBrowserSandboxProviderResolverSmoke({
      artifactPath: "/tmp/brainsty-browser-sandbox-provider-resolver-smoke-test.json"
    });
    const serialized = JSON.stringify(result);
    assert.equal(result.ok, true);
    assert.equal(result.hostedProviderResolverReady, true);
    assert.equal(result.hostedProviderReady, false);
    assert.equal(result.status, "hosted_browser_sandbox_provider_configured_unverified");
    assert.equal(result.hostedProviderResolver.endpointResolved, true);
    assert.equal(result.hostedProviderResolver.authResolved, true);
    assert.equal(result.hostedProviderResolver.liveVerified, false);
    assert.equal(result.hostedProviderResolver.rawEndpointReturned, false);
    assert.equal(result.hostedProviderResolver.rawSecretReturned, false);
    assert.doesNotMatch(serialized, /sandbox-provider\.invalid/);
    assert.doesNotMatch(serialized, /test-token-that-must-not-leak/);
  } finally {
    restoreEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER", previousProvider);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL", previousEndpoint);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_API_TOKEN", previousToken);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED", previousLive);
  }
});

test("hosted browser sandbox provider adapter smoke proves request and response shape without live provider", async () => {
  const previousProvider = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER;
  const previousEndpoint = process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL;
  const previousToken = process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN;
  const previousAdapter = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY;
  try {
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER = "hosted_remote";
    process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL = "https://sandbox-provider.invalid/api";
    process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN = "test-token-that-must-not-leak";
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY = "1";
    const result = await runBrowserSandboxProviderAdapterSmoke({
      artifactPath: "/tmp/brainsty-browser-sandbox-provider-adapter-smoke-test.json"
    });
    const serialized = JSON.stringify(result);
    assert.equal(result.ok, true);
    assert.equal(result.hostedProviderAdapterReady, true);
    assert.equal(result.hostedProviderReady, false);
    assert.equal(result.status, "hosted_browser_sandbox_provider_adapter_contract_ready");
    assert.equal(result.adapterContract.providerNetworkCalled, false);
    assert.equal(result.adapterContract.responseValidation.ok, true);
    assert.equal(result.adapterContract.response.providerLiveConnected, false);
    assert.equal(result.adapterContract.request.auth.authorizationHeader, "[redacted]");
    assert.equal(result.adapterContract.request.endpoint.rawEndpointReturned, false);
    assert.equal(result.adapterContract.response.ocrCaption.rawOcrTextReturned, false);
    assert.equal(result.adapterContract.response.stream.rawFrameReturned, false);
    assert.doesNotMatch(serialized, /sandbox-provider\.invalid/);
    assert.doesNotMatch(serialized, /test-token-that-must-not-leak/);
    assert.doesNotMatch(serialized, /https?:\/\//);
  } finally {
    restoreEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER", previousProvider);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL", previousEndpoint);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_API_TOKEN", previousToken);
    restoreEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY", previousAdapter);
  }
});

test("hosted browser sandbox provider HTTP adapter harness makes a redacted provider-style call", async () => {
  const result = await runBrowserSandboxProviderHttpAdapterHarnessSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-http-adapter-harness-smoke-test.json"
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderAdapterReady, true);
  assert.equal(result.hostedProviderHttpAdapterReady, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_http_adapter_harness_ready");
  assert.equal(result.adapterContract.httpAdapterHarness.providerNetworkCalled, true);
  assert.equal(result.adapterContract.httpAdapterHarness.localHarnessOnly, true);
  assert.equal(result.adapterContract.httpAdapterHarness.endpointRedacted, true);
  assert.equal(result.adapterContract.httpAdapterHarness.authorizationRedacted, true);
  assert.equal(result.adapterContract.httpAdapterHarness.requestMethod, "POST");
  assert.equal(result.adapterContract.httpAdapterHarness.requestPath, "/browser/sessions");
  assert.equal(result.adapterContract.httpAdapterHarness.providerLiveConnected, false);
  assert.equal(result.adapterContract.httpAdapterHarness.responseValidation.ok, true);
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
  assert.doesNotMatch(serialized, /provider-harness\.invalid/);
  assert.doesNotMatch(serialized, /provider-harness-token-must-not-leak/);
  assert.doesNotMatch(serialized, /local-harness-token-redacted/);
  assert.doesNotMatch(serialized, /127\.0\.0\.1|localhost/);
});

test("hosted browser sandbox provider live lifecycle harness proves full lifecycle without live provider", async () => {
  const result = await runBrowserSandboxProviderLiveLifecycleHarnessSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-live-lifecycle-harness-smoke-test.json"
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderAdapterReady, true);
  assert.equal(result.hostedProviderHttpAdapterReady, true);
  assert.equal(result.hostedProviderLiveLifecycleHarnessReady, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_live_lifecycle_harness_ready");
  assert.equal(result.adapterContract.liveLifecycleHarness.localHarnessOnly, true);
  assert.equal(result.adapterContract.liveLifecycleHarness.providerNetworkCalled, true);
  assert.equal(result.adapterContract.liveLifecycleHarness.createSession.responseValidation.ok, true);
  assert.equal(result.adapterContract.liveLifecycleHarness.stream.ok, true);
  assert.equal(result.adapterContract.liveLifecycleHarness.stream.frameRefPresent, true);
  assert.equal(result.adapterContract.liveLifecycleHarness.stream.rawFrameReturned, false);
  assert.equal(result.adapterContract.liveLifecycleHarness.stream.rawOcrTextReturned, false);
  assert.equal(result.adapterContract.liveLifecycleHarness.screenshot.rawImageReturned, false);
  assert.equal(result.adapterContract.liveLifecycleHarness.ocrCaption.rawOcrTextReturned, false);
  assert.equal(result.adapterContract.liveLifecycleHarness.takeover.approvalRequired, true);
  assert.equal(result.adapterContract.liveLifecycleHarness.takeover.inputRelay, "approval_gated_human_only");
  assert.equal(result.adapterContract.liveLifecycleHarness.input.rawInputReturned, false);
  assert.equal(result.adapterContract.liveLifecycleHarness.input.externalWriteActionsWithoutApproval, false);
  assert.equal(result.adapterContract.liveLifecycleHarness.offsite.statusCode, 403);
  assert.equal(result.adapterContract.liveLifecycleHarness.offsite.offsiteFailClosed, true);
  assert.equal(result.adapterContract.liveLifecycleHarness.teardown.teardownComplete, true);
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
  assert.equal(result.safety.rawFrameReturned, false);
  assert.equal(result.safety.rawOcrTextReturned, false);
  assert.equal(result.safety.rawInputReturned, false);
  assert.doesNotMatch(serialized, /provider-lifecycle\.invalid/);
  assert.doesNotMatch(serialized, /provider-lifecycle-token-must-not-leak/);
  assert.doesNotMatch(serialized, /local-lifecycle-harness-token-redacted/);
  assert.doesNotMatch(serialized, /127\.0\.0\.1|localhost/);
  assert.doesNotMatch(serialized, /data:image|member id|subscriber id|typed-password/i);
});

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function fakeLiveProviderFetch(url, options = {}) {
  const parsed = new URL(String(url));
  const path = parsed.pathname.replace(/^\/api/, "");
  const json = (payload, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  });
  const liveBase = {
    contractVersion: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    providerLiveConnected: true
  };
  if (options.method === "POST" && path === "/browser/sessions") {
    return json({
      ...liveBase,
      status: "hosted_provider_live_session_created",
      providerSessionRef: "provider-live-session-ref-redacted",
      stream: {
        transport: "webrtc_or_sse_frames",
        streamRef: "provider-live-stream-ref-redacted",
        rawFrameReturned: false,
        frameRecordingEnabled: false
      },
      screenshot: {
        screenshotRef: "provider-live-screenshot-ref-redacted",
        rawImageReturned: false
      },
      ocrCaption: {
        captionRef: "provider-live-caption-ref-redacted",
        rawOcrTextReturned: false
      },
      takeover: {
        state: "not_requested",
        approvalRequired: true,
        inputRelay: "approval_gated_human_only"
      },
      safety: {
        agentCredentialEntryAllowed: false,
        externalWriteActionsWithoutApproval: false,
        offsiteFailClosed: true,
        credentialPagesUserOnly: true
      },
      actionsTaken: []
    });
  }
  if (options.method === "GET" && path === "/browser/sessions/provider-live-session-ref-redacted/stream") {
    const payload = {
      ...liveBase,
      eventType: "provider.live.frame",
      frameRef: "provider-live-frame-ref-redacted",
      rawFrameReturned: false,
      ocrCaption: {
        captionRef: "provider-live-caption-ref-redacted",
        rawOcrTextReturned: false
      }
    };
    return {
      ok: true,
      status: 200,
      async json() {
        return payload;
      },
      async text() {
        return `event: frame\ndata: ${JSON.stringify(payload)}\n\n`;
      }
    };
  }
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/screenshot") {
    return json({ status: "screenshot_ref_ready", screenshotRef: "provider-live-screenshot-ref-redacted", rawImageReturned: false, providerLiveConnected: true });
  }
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/ocr-caption") {
    return json({ status: "ocr_caption_ref_ready", captionRef: "provider-live-caption-ref-redacted", rawOcrTextReturned: false, providerLiveConnected: true });
  }
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/takeover") {
    return json({ status: "takeover_pending_approval", takeoverId: "provider-live-takeover-ref-redacted", approvalRequired: true, inputRelay: "approval_gated_human_only", providerLiveConnected: true });
  }
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/input") {
    return json({ status: "input_relayed", inputAccepted: true, rawInputReturned: false, inputValueRedacted: true, providerLiveConnected: true, externalWriteActionsWithoutApproval: false });
  }
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/navigate") {
    return json({ status: "offsite_navigation_blocked", offsiteFailClosed: true, rawTargetUrlReturned: false, providerLiveConnected: true }, 403);
  }
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/teardown") {
    return json({ status: "session_torn_down", teardownComplete: true, rawFramePersisted: false, rawOcrTextPersisted: false, providerLiveConnected: true });
  }
  return json({ status: "not_found" }, 404);
}
