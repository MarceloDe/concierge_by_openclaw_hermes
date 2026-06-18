import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
  validateBrowserSandboxProviderContract,
  validateBrowserSandboxProviderSelectionContract,
  runBrowserSandboxProviderContractSmoke,
  runBrowserSandboxProviderSelectionSmoke,
  runBrowserSandboxProviderLivePreflightSmoke,
  runBrowserSandboxProviderLiveVerificationSmoke,
  runBrowserSandboxProviderWebrtcSignalingSmoke,
  runBrowserSandboxProviderVisualOcrReplaySmoke,
  runBrowserSandboxProviderLaunchReadinessSmoke,
  runBrowserSandboxProviderPrivateLaunchExecutionSmoke,
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

test("steel self-host provider strategy verifies local API, CDP, viewer, input, and teardown without leaking refs", async () => {
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeSteelWebSocket;
  try {
    const result = await runBrowserSandboxProviderLiveVerificationSmoke({
      artifactPath: "/tmp/brainsty-browser-sandbox-provider-steel-self-host-live-verification-smoke-test.json",
      env: {
        WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
        WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
        WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME: "steel-self-host",
        WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL: "http://127.0.0.1:3000",
        WEFELLA_BROWSER_SANDBOX_CDP_URL: "ws://127.0.0.1:9223",
        WEFELLA_BROWSER_SANDBOX_API_TOKEN: "local-dev-token-that-must-not-leak",
        WEFELLA_BROWSER_SANDBOX_VIEWER_URL: "http://127.0.0.1:5173",
        WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: "custom_webrtc",
        WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: "1",
        WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY: "1",
        WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY: "1"
      },
      fetchImpl: fakeSteelSelfHostFetch
    });
    const serialized = JSON.stringify(result);
    assert.equal(result.ok, true);
    assert.equal(result.hostedProviderLiveVerificationReady, true);
    assert.equal(result.hostedProviderReady, false);
    assert.equal(result.liveLifecycle.providerStrategy, "steel-self-host");
    assert.equal(result.liveLifecycle.createSession.steelHealthOk, true);
    assert.equal(result.liveLifecycle.createSession.cdpConnected, true);
    assert.equal(result.liveLifecycle.stream.frameRefPresent, true);
    assert.equal(result.liveLifecycle.stream.viewerUrlAvailable, true);
    assert.equal(result.liveLifecycle.screenshot.screenshotRefPresent, true);
    assert.equal(result.liveLifecycle.ocrCaption.captionRefPresent, true);
    assert.equal(result.liveLifecycle.takeover.approvalRequired, true);
    assert.equal(result.liveLifecycle.takeover.inputRelay, "approval_gated_human_only");
    assert.equal(result.liveLifecycle.input.inputAccepted, true);
    assert.equal(result.liveLifecycle.offsite.offsiteFailClosed, true);
    assert.equal(result.liveLifecycle.teardown.teardownComplete, true);
    assert.equal(result.safety.rawEndpointUrlWritten, false);
    assert.equal(result.safety.rawSecretReturned, false);
    assert.doesNotMatch(serialized, /127\.0\.0\.1|localhost|5173|9223|local-dev-token-that-must-not-leak|data:image|JFIF/i);
  } finally {
    if (originalWebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = originalWebSocket;
  }
});

test("hosted browser sandbox provider WebRTC signaling uses opaque refs and does not overclaim hosted readiness", async () => {
  const result = await runBrowserSandboxProviderWebrtcSignalingSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-webrtc-signaling-smoke-test.json",
    env: {
      WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
      WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL: "https://sandbox-provider.invalid/api",
      WEFELLA_BROWSER_SANDBOX_API_TOKEN: "test-token-that-must-not-leak",
      WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: "custom_webrtc",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY: "1"
    },
    fetchImpl: fakeLiveProviderFetch
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderWebrtcSignalingReady, true);
  assert.equal(result.hostedProviderLiveVerificationReady, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_webrtc_signaling_ready");
  assert.equal(result.signaling.providerNetworkCalled, true);
  assert.equal(result.signaling.localHarnessOnly, false);
  assert.equal(result.signaling.providerLiveConnected, true);
  assert.equal(result.signaling.offer.transport, "webrtc");
  assert.equal(result.signaling.offer.answerRefPresent, true);
  assert.equal(result.signaling.offer.iceServerRefsPresent, true);
  assert.equal(result.signaling.offer.rawSdpReturned, false);
  assert.equal(result.signaling.iceCandidate.candidateAccepted, true);
  assert.equal(result.signaling.iceCandidate.rawIceCandidateReturned, false);
  assert.equal(result.safety.rawSdpReturned, false);
  assert.equal(result.safety.rawIceCandidateReturned, false);
  assert.doesNotMatch(serialized, /sandbox-provider\.invalid/);
  assert.doesNotMatch(serialized, /test-token-that-must-not-leak/);
  assert.doesNotMatch(serialized, /v=0|candidate:|a=fingerprint|a=ice-ufrag|turn:|stun:|data:image|member id|subscriber id|typed-password/i);
});

test("hosted browser sandbox provider visual/OCR replay is blocked without private proof", async () => {
  const result = await runBrowserSandboxProviderVisualOcrReplaySmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-visual-ocr-replay-blocked-smoke-test.json",
    env: {}
  });
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderVisualOcrReplayReady, false);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_visual_ocr_replay_blocked");
  assert.equal(result.proofFile.present, false);
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
});

test("hosted browser sandbox provider visual/OCR replay validates private refs without overclaiming hosted readiness", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "brainsty-provider-visual-ocr-"));
  const proofPath = join(tmp, "provider-visual-ocr-proof.json");
  await writeFile(proofPath, JSON.stringify(validVisualOcrProofManifest(), null, 2));
  const result = await runBrowserSandboxProviderVisualOcrReplaySmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-visual-ocr-replay-smoke-test.json",
    env: {
      WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
      WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL: "https://sandbox-provider.invalid/api",
      WEFELLA_BROWSER_SANDBOX_API_TOKEN: "test-token-that-must-not-leak",
      WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: "custom_webrtc",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE: proofPath
    },
    fetchImpl: fakeLiveProviderFetch
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderVisualOcrReplayReady, true);
  assert.equal(result.hostedProviderWebrtcSignalingReady, true);
  assert.equal(result.hostedProviderLiveVerificationReady, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_visual_ocr_replay_ready");
  assert.equal(result.proofFile.outsideGit, true);
  assert.equal(result.proofFile.validation.ok, true);
  assert.equal(result.proofFile.validation.sanitizedProof.dashboardScreenshotRefPresent, true);
  assert.equal(result.proofFile.validation.sanitizedProof.mobileLiveBlockRefPresent, true);
  assert.equal(result.safety.rawFrameReturned, false);
  assert.equal(result.safety.rawImageReturned, false);
  assert.equal(result.safety.rawOcrTextReturned, false);
  assert.equal(result.safety.rawInputReturned, false);
  assert.doesNotMatch(serialized, /sandbox-provider\.invalid/);
  assert.doesNotMatch(serialized, /test-token-that-must-not-leak/);
  assert.doesNotMatch(serialized, /data:image|member id|subscriber id|typed-password|v=0|candidate:/i);
});

test("hosted browser sandbox provider visual/OCR replay rejects raw OCR or screenshot payloads", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "brainsty-provider-visual-ocr-bad-"));
  const proofPath = join(tmp, "provider-visual-ocr-proof.json");
  await writeFile(proofPath, JSON.stringify({
    ...validVisualOcrProofManifest(),
    stream: { frameRefPresent: true, rawFrameReturned: true },
    ocrCaption: { captionRefPresent: true, rawOcrTextReturned: true, visualCaptionSafe: false, unsafeText: "member id 123" }
  }, null, 2));
  const result = await runBrowserSandboxProviderVisualOcrReplaySmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-visual-ocr-replay-invalid-smoke-test.json",
    env: {
      WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
      WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL: "https://sandbox-provider.invalid/api",
      WEFELLA_BROWSER_SANDBOX_API_TOKEN: "test-token-that-must-not-leak",
      WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: "custom_webrtc",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE: proofPath
    },
    fetchImpl: fakeLiveProviderFetch
  });
  assert.equal(result.ok, false);
  assert.equal(result.hostedProviderVisualOcrReplayReady, false);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_visual_ocr_replay_invalid");
  assert.equal(result.proofFile.validation.failures.includes("raw_frame_must_not_be_returned"), true);
  assert.equal(result.proofFile.validation.failures.includes("raw_ocr_text_must_not_be_returned"), true);
  assert.equal(result.proofFile.validation.failures.includes("raw_frame_ocr_or_credential_content_forbidden"), true);
});

test("hosted browser sandbox provider launch readiness publishes a safe operator runbook gate", async () => {
  const result = await runBrowserSandboxProviderLaunchReadinessSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-launch-readiness-default-smoke-test.json",
    env: {}
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderLaunchReadinessRunbookReady, true);
  assert.equal(result.hostedProviderPrivateProofChainReady, false);
  assert.equal(result.hostedProviderFinalEnablementAllowed, false);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_launch_runbook_ready");
  assert.equal(result.checklist.runbookPresent, true);
  assert.equal(result.checklist.envExamplePresent, true);
  assert.equal(result.checklist.missing.includes("provider_config_private"), true);
  assert.equal(result.dashboard.readinessKey, "hosted_browser_sandbox_provider_launch_readiness");
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
  assert.doesNotMatch(serialized, /Bearer\s+|sk-[A-Za-z0-9]/);
});

test("hosted browser sandbox provider launch readiness can prove private chain without final hosted enablement", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "brainsty-provider-launch-ready-"));
  const proofPath = join(tmp, "provider-visual-ocr-proof.json");
  const configPath = join(tmp, "browser-sandbox-provider.runtime.json");
  const config = JSON.parse(await readFile(new URL("../../project/deployment/browser-sandbox-provider.hosted-provider.example.json", import.meta.url), "utf8"));
  await writeFile(configPath, JSON.stringify(config, null, 2));
  await writeFile(proofPath, JSON.stringify(validVisualOcrProofManifest(), null, 2));
  const result = await runBrowserSandboxProviderLaunchReadinessSmoke({
    configPath,
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-launch-readiness-private-smoke-test.json",
    env: {
      WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
      WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL: "https://sandbox-provider.invalid/api",
      WEFELLA_BROWSER_SANDBOX_API_TOKEN: "test-token-that-must-not-leak",
      WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: "custom_webrtc",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE: proofPath,
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY: "1"
    },
    fetchImpl: fakeLiveProviderFetch
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderLaunchReadinessRunbookReady, true);
  assert.equal(result.hostedProviderPrivateProofChainReady, true);
  assert.equal(result.hostedProviderFinalEnablementAllowed, false);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_launch_waiting_final_enablement");
  assert.equal(result.liveProof.liveVerificationReady, true);
  assert.equal(result.liveProof.webrtcSignalingReady, true);
  assert.equal(result.liveProof.visualOcrReplayReady, true);
  assert.equal(result.checklist.configOutsideGit, true);
  assert.equal(result.checklist.proofOutsideGit, true);
  assert.equal(result.checklist.missing.includes("final_live_verified_switch"), true);
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
  assert.doesNotMatch(serialized, /sandbox-provider\.invalid/);
  assert.doesNotMatch(serialized, /test-token-that-must-not-leak/);
  assert.doesNotMatch(serialized, /data:image|member id|subscriber id|typed-password|v=0|candidate:/i);
});

test("hosted browser sandbox provider private launch execution is disabled by default", async () => {
  const result = await runBrowserSandboxProviderPrivateLaunchExecutionSmoke({
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-private-launch-execution-default-smoke-test.json",
    env: {}
  });
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderPrivateLaunchExecutionReady, false);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "hosted_browser_sandbox_provider_private_launch_execution_not_enabled");
  assert.equal(result.executionGate, false);
  assert.equal(result.finalHumanReviewed, false);
  assert.equal(result.missing.includes("private_launch_execution_gate"), true);
  assert.equal(result.dashboard.readinessKey, "hosted_browser_sandbox_provider_private_launch_execution");
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
});

test("hosted browser sandbox provider private launch execution requires private proof and final review", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "brainsty-provider-private-launch-ready-"));
  const proofPath = join(tmp, "provider-visual-ocr-proof.json");
  const configPath = join(tmp, "browser-sandbox-provider.runtime.json");
  const config = JSON.parse(await readFile(new URL("../../project/deployment/browser-sandbox-provider.hosted-provider.example.json", import.meta.url), "utf8"));
  config.adapter.providerLiveConnected = true;
  await writeFile(configPath, JSON.stringify(config, null, 2));
  await writeFile(proofPath, JSON.stringify(validVisualOcrProofManifest(), null, 2));
  const result = await runBrowserSandboxProviderPrivateLaunchExecutionSmoke({
    configPath,
    artifactPath: "/tmp/brainsty-browser-sandbox-provider-private-launch-execution-ready-smoke-test.json",
    env: {
      WEFELLA_BROWSER_SANDBOX_PROVIDER: "hosted_remote",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: "1",
      WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL: "https://sandbox-provider.invalid/api",
      WEFELLA_BROWSER_SANDBOX_API_TOKEN: "test-token-that-must-not-leak",
      WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: "custom_webrtc",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE: proofPath,
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY: "1",
      WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED: "1"
    },
    fetchImpl: fakeLiveProviderFetch
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderPrivateLaunchExecutionReady, true);
  assert.equal(result.hostedProviderReady, true);
  assert.equal(result.status, "hosted_browser_sandbox_provider_private_launch_executed");
  assert.equal(result.launchReadiness.privateProofChainReady, true);
  assert.equal(result.launchReadiness.finalEnablementAllowed, true);
  assert.equal(result.executionGate, true);
  assert.equal(result.finalHumanReviewed, true);
  assert.equal(result.missing.length, 0);
  assert.equal(result.safety.rawEndpointUrlWritten, false);
  assert.equal(result.safety.rawSecretReturned, false);
  assert.doesNotMatch(serialized, /sandbox-provider\.invalid/);
  assert.doesNotMatch(serialized, /test-token-that-must-not-leak/);
  assert.doesNotMatch(serialized, /data:image|member id|subscriber id|typed-password|v=0|candidate:/i);
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

function validVisualOcrProofManifest() {
  return {
    schemaVersion: "brainstyworkers.browser-sandbox-provider-visual-ocr-proof.v1",
    providerLiveConnected: true,
    session: {
      sessionRefPresent: true,
      rawSessionRefReturned: false
    },
    stream: {
      frameRefPresent: true,
      rawFrameReturned: false,
      rawFramePersisted: false
    },
    screenshot: {
      screenshotRefPresent: true,
      rawImageReturned: false
    },
    ocrCaption: {
      captionRefPresent: true,
      rawOcrTextReturned: false,
      rawOcrTextPersisted: false,
      visualCaptionSafe: true
    },
    takeover: {
      approvalRequired: true,
      inputRelay: "approval_gated_human_only"
    },
    input: {
      rawInputReturned: false,
      externalWriteActionsWithoutApproval: false
    },
    teardown: {
      teardownComplete: true,
      rawFramePersisted: false,
      rawOcrTextPersisted: false
    },
    visualProof: {
      dashboardScreenshotRefPresent: true,
      mobileLiveBlockRefPresent: true,
      ocrCaptionRefPresent: true
    },
    safety: {
      agentCredentialEntryAllowed: false,
      externalWriteActionsWithoutApproval: false,
      rawEndpointReturned: false,
      rawSecretReturned: false
    }
  };
}

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
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/webrtc/offer") {
    return json({
      status: "webrtc_signaling_answer_ready",
      transport: "webrtc",
      answerRef: "provider-sdp-answer-ref-redacted",
      iceServerRefs: ["provider-ice-server-ref-redacted"],
      rawSdpReturned: false,
      rawIceCandidateReturned: false,
      frameRecordingEnabled: false,
      providerLiveConnected: true
    });
  }
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/webrtc/ice-candidate") {
    return json({
      status: "webrtc_ice_candidate_relayed",
      candidateAccepted: true,
      rawIceCandidateReturned: false,
      providerLiveConnected: true
    });
  }
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/navigate") {
    return json({ status: "offsite_navigation_blocked", offsiteFailClosed: true, rawTargetUrlReturned: false, providerLiveConnected: true }, 403);
  }
  if (options.method === "POST" && path === "/browser/sessions/provider-live-session-ref-redacted/teardown") {
    return json({ status: "session_torn_down", teardownComplete: true, rawFramePersisted: false, rawOcrTextPersisted: false, providerLiveConnected: true });
  }
  return json({ status: "not_found" }, 404);
}

async function fakeSteelSelfHostFetch(url, options = {}) {
  const parsed = new URL(String(url));
  const path = parsed.pathname;
  const method = options.method ?? "GET";
  const json = (payload, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
    async arrayBuffer() {
      return Buffer.from(JSON.stringify(payload));
    }
  });
  if (method === "GET" && path === "/v1/health") {
    return json({ status: "ok" });
  }
  if (method === "POST" && path === "/v1/sessions") {
    const body = JSON.parse(String(options.body ?? "{}"));
    return json({
      id: body.sessionId,
      status: "idle",
      websocketUrl: "ws://localhost:3000/",
      debugUrl: "http://localhost:3000/v1/sessions/debug",
      sessionViewerUrl: "http://localhost:3000/",
      dimensions: { width: 1280, height: 720 }
    });
  }
  if (method === "GET" && path === "/json/version") {
    return json({
      Browser: "Chrome/148.0.0.0",
      webSocketDebuggerUrl: "ws://127.0.0.1/devtools/browser/fake"
    });
  }
  if (method === "GET" && path === "/json/list") {
    return json([
      {
        type: "page",
        title: "Example Domain",
        webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/fake"
      }
    ]);
  }
  if (method === "GET" && /^\/v1\/sessions\/[^/]+\/live-details$/.test(path)) {
    return json({
      pages: [{ id: "page-ref", title: "Example Domain" }],
      browserState: { status: "idle" },
      websocketUrl: "ws://localhost:3000/",
      sessionViewerUrl: "http://localhost:3000/"
    });
  }
  if (method === "POST" && path === "/v1/sessions/screenshot") {
    return {
      ok: true,
      status: 200,
      async json() {
        return {};
      },
      async text() {
        return "[binary-redacted]";
      },
      async arrayBuffer() {
        return Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      }
    };
  }
  if (method === "POST" && /^\/v1\/sessions\/[^/]+\/release$/.test(path)) {
    return json({ success: true });
  }
  return json({ error: "not_found", path }, 404);
}

class FakeSteelWebSocket {
  constructor() {
    this.listeners = new Map();
    queueMicrotask(() => this.emit("open", {}));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(message) {
    const request = JSON.parse(String(message));
    const result = request.method === "Runtime.evaluate"
      ? { result: { value: "Example Domain" } }
      : {};
    queueMicrotask(() => this.emit("message", { data: JSON.stringify({ id: request.id, result }) }));
  }

  close() {
    this.emit("close", {});
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}
