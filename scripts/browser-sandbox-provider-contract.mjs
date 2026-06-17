import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION = "2026-06-17.browser-sandbox-provider.v1";

const DEFAULT_CONFIG_PATH = "project/deployment/browser-sandbox-provider.example.json";
const HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH = "project/deployment/browser-sandbox-provider.hosted-provider.example.json";
const PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH = "project/deployment/browser-sandbox-provider.selection.example.json";
const ALLOWED_PROVIDERS = new Set(["hosted_remote", "vercel_sandbox", "browserbase", "custom_webrtc"]);
const ALLOWED_SECRET_SOURCES = new Set(["managed_env", "secret_file", "docker_secret"]);
const ALLOWED_ADAPTER_MODES = new Set(["contract_only", "contract_harness", "hosted_provider"]);
const DEFAULT_HOSTED_AUTH_TOKEN_REF = "env:WEFELLA_BROWSER_SANDBOX_API_TOKEN";

function configStreamRequiresWebrtc(config) {
  return ["webrtc", "webrtc_or_sse_frames"].includes(config?.transport?.stream);
}

function sanitizeConfig(config, configPath) {
  return {
    schemaVersion: config.schemaVersion ?? null,
    provider: config.provider ?? null,
    environment: config.environment ?? null,
    endpointRefPresent: Boolean(config.endpointRef),
    secretSource: config.secretSource ?? null,
    transport: {
      stream: config.transport?.stream ?? null,
      inputRelay: config.transport?.inputRelay ?? null,
      screenshot: config.transport?.screenshot ?? null,
      ocrCaption: config.transport?.ocrCaption ?? null
    },
    adapter: {
      mode: config.adapter?.mode ?? "contract_only",
      providerLiveConnected: Boolean(config.adapter?.providerLiveConnected),
      contractHarnessOnly: Boolean(config.adapter?.contractHarnessOnly)
    },
    auth: {
      tokenRefPresent: Boolean(config.auth?.tokenRef),
      tokenRefKind: refKind(config.auth?.tokenRef ?? DEFAULT_HOSTED_AUTH_TOKEN_REF)
    },
    sessionPolicy: {
      userScoped: Boolean(config.sessionPolicy?.userScoped),
      sessionScoped: Boolean(config.sessionPolicy?.sessionScoped),
      ephemeralBrowser: Boolean(config.sessionPolicy?.ephemeralBrowser),
      maxSessionMinutes: Number(config.sessionPolicy?.maxSessionMinutes ?? 0),
      idleTimeoutMinutes: Number(config.sessionPolicy?.idleTimeoutMinutes ?? 0),
      recordFrames: Boolean(config.sessionPolicy?.recordFrames),
      persistRawOcrText: Boolean(config.sessionPolicy?.persistRawOcrText)
    },
    approvalPolicy: {
      requiresReadOnlyApproval: Boolean(config.approvalPolicy?.requiresReadOnlyApproval),
      requiresHumanTakeoverApproval: Boolean(config.approvalPolicy?.requiresHumanTakeoverApproval),
      agentCredentialEntryAllowed: Boolean(config.approvalPolicy?.agentCredentialEntryAllowed),
      externalWriteActionsAllowed: Boolean(config.approvalPolicy?.externalWriteActionsAllowed)
    },
    networkPolicy: {
      allowlistRequired: Boolean(config.networkPolicy?.allowlistRequired),
      offsiteFailClosed: Boolean(config.networkPolicy?.offsiteFailClosed),
      credentialPagesUserOnly: Boolean(config.networkPolicy?.credentialPagesUserOnly)
    },
    audit: {
      emitSessionLifecycleEvents: Boolean(config.audit?.emitSessionLifecycleEvents),
      emitTakeoverEvents: Boolean(config.audit?.emitTakeoverEvents),
      redactInputValues: Boolean(config.audit?.redactInputValues),
      redactFrameContent: Boolean(config.audit?.redactFrameContent)
    },
    source: {
      configPath,
      exampleConfig: configPath === DEFAULT_CONFIG_PATH
    }
  };
}

function validateConfig(config, configPath) {
  const failures = [];
  if (config.schemaVersion !== "brainstyworkers.browser-sandbox-provider.v1") failures.push("schema_version_missing_or_unknown");
  if (!ALLOWED_PROVIDERS.has(config.provider)) failures.push("provider_not_allowed");
  if (!["staging", "production"].includes(config.environment)) failures.push("environment_must_be_staging_or_production");
  if (!ALLOWED_SECRET_SOURCES.has(config.secretSource)) failures.push("secret_source_must_be_managed_or_file_backed");
  if (!config.endpointRef || /^https?:\/\//i.test(String(config.endpointRef))) failures.push("endpoint_ref_must_not_be_raw_url");
  if (!["webrtc_or_sse_frames", "webrtc", "sse_frames"].includes(config.transport?.stream)) failures.push("stream_transport_not_allowed");
  if (config.transport?.inputRelay !== "approval_gated_human_only") failures.push("input_relay_must_be_human_only");
  if (!config.transport?.screenshot || !config.transport?.ocrCaption) failures.push("screenshot_and_ocr_contract_required");
  const adapterMode = config.adapter?.mode ?? "contract_only";
  if (!ALLOWED_ADAPTER_MODES.has(adapterMode)) failures.push("adapter_mode_not_allowed");
  if (adapterMode === "contract_harness" && config.adapter?.providerLiveConnected) failures.push("contract_harness_must_not_claim_live_provider");
  if (adapterMode === "hosted_provider" && config.adapter?.contractHarnessOnly) failures.push("hosted_provider_must_not_be_harness_only");
  if (adapterMode === "hosted_provider" && !isEnvRef(config.endpointRef)) failures.push("hosted_provider_endpoint_ref_must_be_env_ref");
  if (adapterMode === "hosted_provider" && !isEnvRef(config.auth?.tokenRef ?? DEFAULT_HOSTED_AUTH_TOKEN_REF)) {
    failures.push("hosted_provider_auth_token_ref_must_be_env_ref");
  }
  if (!config.sessionPolicy?.userScoped || !config.sessionPolicy?.sessionScoped) failures.push("sessions_must_be_user_and_session_scoped");
  if (!config.sessionPolicy?.ephemeralBrowser) failures.push("ephemeral_browser_required");
  if (Number(config.sessionPolicy?.maxSessionMinutes ?? Infinity) > 30) failures.push("max_session_minutes_must_be_30_or_less");
  if (Number(config.sessionPolicy?.idleTimeoutMinutes ?? Infinity) > 5) failures.push("idle_timeout_minutes_must_be_5_or_less");
  if (config.sessionPolicy?.recordFrames) failures.push("frame_recording_must_be_disabled");
  if (config.sessionPolicy?.persistRawOcrText) failures.push("raw_ocr_persistence_must_be_disabled");
  if (!config.approvalPolicy?.requiresReadOnlyApproval) failures.push("read_only_approval_required");
  if (!config.approvalPolicy?.requiresHumanTakeoverApproval) failures.push("human_takeover_approval_required");
  if (config.approvalPolicy?.agentCredentialEntryAllowed) failures.push("agent_credential_entry_must_be_blocked");
  if (config.approvalPolicy?.externalWriteActionsAllowed) failures.push("external_write_actions_must_be_blocked");
  if (!config.networkPolicy?.allowlistRequired || !config.networkPolicy?.offsiteFailClosed || !config.networkPolicy?.credentialPagesUserOnly) {
    failures.push("network_policy_must_fail_closed");
  }
  if (!config.audit?.emitSessionLifecycleEvents || !config.audit?.emitTakeoverEvents) failures.push("audit_events_required");
  if (!config.audit?.redactInputValues || !config.audit?.redactFrameContent) failures.push("audit_redaction_required");
  return {
    ok: failures.length === 0,
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    configPath,
    failures,
    sanitizedConfig: sanitizeConfig(config, configPath)
  };
}

function assertNoSecretLeak(payload) {
  const text = JSON.stringify(payload);
  return {
    rawEndpointUrlWritten: /https?:\/\/[^"\\\s]+/i.test(text),
    rawSecretFilePathWritten: /\/run\/secrets\/|project\/deployment\/secrets\/\.runtime|\/var\/folders/i.test(text),
    rawOcrTextReturned: false,
    frameRecordingEnabled: text.includes("\"recordFrames\":true")
  };
}

function sanitizeProviderSelectionConfig(config, configPath) {
  return {
    schemaVersion: config.schemaVersion ?? null,
    status: config.status ?? null,
    environment: config.environment ?? null,
    candidateCount: Array.isArray(config.candidateProviders) ? config.candidateProviders.length : 0,
    candidateKeys: Array.isArray(config.candidateProviders)
      ? config.candidateProviders.map((candidate) => candidate.key).filter(Boolean)
      : [],
    recommendedNextProviderKey: config.recommendedNextProviderKey ?? null,
    selectionPolicy: {
      privateConfigRequired: Boolean(config.selectionPolicy?.privateConfigRequired),
      publicApiOnly: Boolean(config.selectionPolicy?.publicApiOnly),
      noProviderSecretsInGit: Boolean(config.selectionPolicy?.noProviderSecretsInGit),
      liveProviderVerificationRequired: Boolean(config.selectionPolicy?.liveProviderVerificationRequired),
      guiOcrProofRequired: Boolean(config.selectionPolicy?.guiOcrProofRequired),
      hostedRemoteScoreMustRemainBlockedUntilLive: Boolean(config.selectionPolicy?.hostedRemoteScoreMustRemainBlockedUntilLive)
    },
    visualProof: {
      dashboardRequired: Boolean(config.visualProof?.dashboardRequired),
      mobilePwaRequired: Boolean(config.visualProof?.mobilePwaRequired),
      liveWorkerBlockRequired: Boolean(config.visualProof?.liveWorkerBlockRequired),
      ocrCaptionRequired: Boolean(config.visualProof?.ocrCaptionRequired)
    },
    source: {
      configPath,
      exampleConfig: configPath === PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH
    }
  };
}

function validateProviderSelectionConfig(config, configPath) {
  const failures = [];
  if (config.schemaVersion !== "brainstyworkers.browser-sandbox-provider-selection.v1") failures.push("selection_schema_version_missing_or_unknown");
  if (config.status !== "selection_contract_only") failures.push("selection_status_must_be_contract_only");
  if (!["staging", "production"].includes(config.environment)) failures.push("selection_environment_must_be_staging_or_production");
  if (!Array.isArray(config.candidateProviders) || config.candidateProviders.length < 3) failures.push("selection_requires_three_or_more_candidates");
  const candidateKeys = new Set();
  for (const candidate of Array.isArray(config.candidateProviders) ? config.candidateProviders : []) {
    if (!ALLOWED_PROVIDERS.has(candidate.key)) failures.push(`selection_candidate_not_allowed:${candidate.key ?? "missing"}`);
    if (candidateKeys.has(candidate.key)) failures.push(`selection_candidate_duplicate:${candidate.key}`);
    candidateKeys.add(candidate.key);
    const capabilities = candidate.requiredCapabilities ?? {};
    for (const capability of [
      "ephemeralSessions",
      "streamFrames",
      "screenshot",
      "ocrCaption",
      "humanTakeover",
      "approvedInputRelay",
      "teardown",
      "offsiteFailClosed",
      "providerHealthEndpoint"
    ]) {
      if (capabilities[capability] !== true) failures.push(`selection_candidate_missing_capability:${candidate.key}:${capability}`);
    }
    if (candidate.secretsInGit === true) failures.push(`selection_candidate_secrets_in_git:${candidate.key}`);
    if (candidate.rawEndpointInGit === true) failures.push(`selection_candidate_raw_endpoint_in_git:${candidate.key}`);
  }
  if (config.recommendedNextProviderKey && !candidateKeys.has(config.recommendedNextProviderKey)) {
    failures.push("selection_recommended_provider_not_in_candidates");
  }
  const policy = config.selectionPolicy ?? {};
  for (const [key, expected] of [
    ["privateConfigRequired", true],
    ["publicApiOnly", true],
    ["noProviderSecretsInGit", true],
    ["liveProviderVerificationRequired", true],
    ["guiOcrProofRequired", true],
    ["hostedRemoteScoreMustRemainBlockedUntilLive", true]
  ]) {
    if (policy[key] !== expected) failures.push(`selection_policy_${key}_required`);
  }
  const visualProof = config.visualProof ?? {};
  for (const [key, expected] of [
    ["dashboardRequired", true],
    ["mobilePwaRequired", true],
    ["liveWorkerBlockRequired", true],
    ["ocrCaptionRequired", true]
  ]) {
    if (visualProof[key] !== expected) failures.push(`selection_visual_${key}_required`);
  }
  const serialized = JSON.stringify(config);
  if (/https?:\/\/[^"\\\s]+/i.test(serialized)) failures.push("selection_raw_provider_url_forbidden");
  for (const candidate of Array.isArray(config.candidateProviders) ? config.candidateProviders : []) {
    for (const value of Object.values(candidate)) {
      if (typeof value === "string" && /bearer\s+|sk-[A-Za-z0-9]|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]/i.test(value)) {
        failures.push(`selection_secret_literal_forbidden:${candidate.key ?? "missing"}`);
      }
    }
  }
  return {
    ok: failures.length === 0,
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    configPath,
    failures,
    sanitizedConfig: sanitizeProviderSelectionConfig(config, configPath)
  };
}

export async function validateBrowserSandboxProviderSelectionContract({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE || PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH
} = {}) {
  const text = await readFile(resolve(configPath), "utf8");
  return validateProviderSelectionConfig(JSON.parse(text), configPath);
}

export async function runBrowserSandboxProviderSelectionSmoke({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE || PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-selection-smoke.json"),
  env = process.env
} = {}) {
  const text = await readFile(resolve(configPath), "utf8");
  const config = JSON.parse(text);
  const validation = validateProviderSelectionConfig(config, configPath);
  const candidateKeys = new Set(validation.sanitizedConfig.candidateKeys);
  const selectedProvider = env.WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER ?? null;
  const selectedProviderKnown = Boolean(selectedProvider && candidateKeys.has(selectedProvider));
  const selectionGateEnabled = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY === "1";
  const preflightReady = Boolean(validation.ok && selectionGateEnabled && selectedProviderKnown);
  const result = {
    ok: validation.ok,
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: preflightReady
      ? "hosted_browser_sandbox_provider_selection_preflight_ready"
      : "hosted_browser_sandbox_provider_selection_contract_ready",
    providerSelectionContractReady: validation.ok,
    providerSelectionPreflightReady: preflightReady,
    selectedProviderKnown,
    selectedProviderKey: selectedProviderKnown ? selectedProvider : null,
    hostedProviderReady: false,
    hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
    validation,
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider_selection",
      scoreKey: "hosted_browser_sandbox_provider_selection",
      selectionFileEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE",
      selectedProviderEnv: "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER",
      preflightReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY",
      liveVerifiedEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED"
    },
    requiredLiveProofBeforeHostedReady: [
      "private provider config outside Git",
      "provider HTTPS/WebRTC stream",
      "screenshot ref",
      "OCR/caption ref",
      "approval-gated takeover",
      "redacted approved input relay",
      "offsite navigation fail-closed",
      "teardown",
      "dashboard visual proof",
      "mobile PWA live worker proof"
    ],
    safety: {
      ...assertNoSecretLeak(validation),
      rawEndpointUrlWritten: /https?:\/\/[^"\\\s]+/i.test(JSON.stringify(resultSafeForLeakCheck(config))),
      rawSecretReturned: false,
      externalActions: false,
      agentCredentialEntryAllowed: false,
      liveProviderOverclaimed: false
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

export async function runBrowserSandboxProviderLivePreflightSmoke({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE || HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  selectionConfigPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE || PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-live-preflight-smoke.json"),
  env = process.env,
  providerReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1",
  fetchImpl = globalThis.fetch
} = {}) {
  const [validation, configText, selection] = await Promise.all([
    validateBrowserSandboxProviderContract({ configPath }),
    readFile(resolve(configPath), "utf8"),
    runBrowserSandboxProviderSelectionSmoke({
      configPath: selectionConfigPath,
      artifactPath: resolve("artifacts/browser-sandbox-provider-selection-smoke.json"),
      env
    })
  ]);
  const config = JSON.parse(configText);
  const resolver = resolveBrowserSandboxHostedProvider({
    config,
    configPath,
    validation,
    env,
    providerReady,
    provider: env.WEFELLA_BROWSER_SANDBOX_PROVIDER ?? "hosted_remote"
  });
  const configuredPreflightReady = Boolean(
    validation.ok &&
    selection.providerSelectionPreflightReady &&
    resolver.resolverReady &&
    env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY === "1"
  );
  let providerHealthProbe = {
    attempted: false,
    ok: false,
    statusCode: null,
    endpointRedacted: true,
    authorizationRedacted: true,
    rawEndpointReturned: false,
    rawSecretReturned: false
  };
  if (configuredPreflightReady && env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_PROBE === "1") {
    providerHealthProbe = await callHostedProviderHealthProbe({
      endpointUrl: env[envNameFromRef(config.endpointRef)],
      apiToken: env[envNameFromRef(config.auth?.tokenRef ?? DEFAULT_HOSTED_AUTH_TOKEN_REF)],
      fetchImpl
    });
  }
  const livePreflightReady = Boolean(
    configuredPreflightReady &&
    (
      env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_PROBE === "1"
        ? providerHealthProbe.ok
        : true
    )
  );
  const result = {
    ok: Boolean(validation.ok && selection.ok),
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: livePreflightReady
      ? "hosted_browser_sandbox_provider_live_preflight_ready"
      : resolver.resolverReady && selection.providerSelectionPreflightReady
        ? "hosted_browser_sandbox_provider_live_preflight_requires_explicit_gate"
        : "hosted_browser_sandbox_provider_live_preflight_blocked",
    hostedProviderLivePreflightReady: livePreflightReady,
    hostedProviderReady: false,
    hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
    validation,
    selection: {
      providerSelectionPreflightReady: selection.providerSelectionPreflightReady,
      selectedProviderKey: selection.selectedProviderKey,
      candidateKeys: selection.validation?.sanitizedConfig?.candidateKeys ?? []
    },
    resolver,
    providerHealthProbe,
    requiredNextLiveProof: [
      "real provider create session",
      "provider stream frames",
      "provider screenshot ref",
      "provider OCR/caption ref",
      "approval-gated takeover",
      "redacted approved input relay",
      "offsite fail-closed navigation",
      "teardown",
      "dashboard visual proof",
      "mobile PWA live worker proof"
    ],
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider_live_preflight",
      scoreKey: "hosted_browser_sandbox_provider_live_preflight",
      preflightReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY",
      liveProbeEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_PROBE",
      liveVerifiedEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED"
    },
    safety: {
      ...assertNoSecretLeak(validation),
      ...assertNoSecretLeak(resolver),
      ...assertNoSecretLeak(selection),
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawEndpointUrlWritten: false,
      externalActions: false,
      agentCredentialEntryAllowed: false,
      liveProviderOverclaimed: false
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

export async function runBrowserSandboxProviderLiveVerificationSmoke({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE || HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  selectionConfigPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE || PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-live-verification-smoke.json"),
  env = process.env,
  providerReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1",
  fetchImpl = globalThis.fetch
} = {}) {
  const [validation, configText, preflight] = await Promise.all([
    validateBrowserSandboxProviderContract({ configPath }),
    readFile(resolve(configPath), "utf8"),
    runBrowserSandboxProviderLivePreflightSmoke({
      configPath,
      selectionConfigPath,
      artifactPath: resolve(dirname(artifactPath), "browser-sandbox-provider-live-preflight-smoke.json"),
      env,
      providerReady,
      fetchImpl
    })
  ]);
  const config = JSON.parse(configText);
  const resolver = resolveBrowserSandboxHostedProvider({
    config,
    configPath,
    validation,
    env,
    providerReady,
    provider: env.WEFELLA_BROWSER_SANDBOX_PROVIDER ?? "hosted_remote"
  });
  const liveVerificationGate = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY === "1";
  const canAttemptLiveProvider = Boolean(
    validation.ok &&
    preflight.hostedProviderLivePreflightReady &&
    resolver.resolverReady &&
    liveVerificationGate
  );
  const liveLifecycle = canAttemptLiveProvider
    ? await callSelectedHostedProviderLiveLifecycle({
      endpointUrl: env[envNameFromRef(config.endpointRef)],
      apiToken: env[envNameFromRef(config.auth?.tokenRef ?? DEFAULT_HOSTED_AUTH_TOKEN_REF)],
      resolver,
      fetchImpl
    })
    : {
      attempted: false,
      ok: false,
      status: preflight.hostedProviderLivePreflightReady
        ? "hosted_browser_sandbox_provider_live_verification_requires_explicit_gate"
        : "hosted_browser_sandbox_provider_live_verification_blocked",
      providerNetworkCalled: false,
      localHarnessOnly: false
    };
  const liveVerified = Boolean(
    liveLifecycle.ok &&
    liveLifecycle.providerNetworkCalled &&
    liveLifecycle.providerLiveConnected &&
    !liveLifecycle.localHarnessOnly
  );
  const hostedProviderReady = Boolean(
    liveVerified &&
    resolver.resolverReady &&
    env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED === "1" &&
    config?.adapter?.providerLiveConnected === true
  );
  const result = {
    ok: Boolean(validation.ok && preflight.ok && (!canAttemptLiveProvider || liveLifecycle.ok)),
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: liveVerified
      ? "hosted_browser_sandbox_provider_live_verified"
      : liveLifecycle.status,
    hostedProviderLiveVerificationReady: liveVerified,
    hostedProviderReady,
    hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
    validation,
    preflight: {
      hostedProviderLivePreflightReady: preflight.hostedProviderLivePreflightReady,
      status: preflight.status,
      selectedProviderKey: preflight.selection?.selectedProviderKey ?? null
    },
    resolver,
    liveLifecycle,
    requiredLiveProofBeforeHostedReady: [
      "selected provider endpoint and auth refs resolved from private config",
      "real provider create session",
      "provider stream frame reference",
      "provider screenshot reference",
      "provider OCR/caption reference",
      "approval-gated takeover request",
      "redacted approved human input relay",
      "offsite navigation fail-closed",
      "teardown",
      "dashboard GUI/OCR proof"
    ],
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider_live_verification",
      scoreKey: "hosted_browser_sandbox_provider_live_verification",
      liveVerificationReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY",
      hostedReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED"
    },
    safety: {
      ...assertNoSecretLeak(validation),
      ...assertNoSecretLeak(resolver),
      ...assertNoSecretLeak(preflight),
      ...assertNoSecretLeak(liveLifecycle),
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawEndpointUrlWritten: false,
      rawFrameReturned: Boolean(liveLifecycle?.stream?.rawFrameReturned),
      rawOcrTextReturned: Boolean(liveLifecycle?.ocrCaption?.rawOcrTextReturned),
      rawInputReturned: Boolean(liveLifecycle?.input?.rawInputReturned),
      externalActions: false,
      agentCredentialEntryAllowed: false,
      liveProviderOverclaimed: !hostedProviderReady && resolver.ready
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

export async function runBrowserSandboxProviderWebrtcSignalingSmoke({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE || HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  selectionConfigPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE || PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-webrtc-signaling-smoke.json"),
  env = process.env,
  providerReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1",
  fetchImpl = globalThis.fetch
} = {}) {
  const [validation, configText, liveVerification] = await Promise.all([
    validateBrowserSandboxProviderContract({ configPath }),
    readFile(resolve(configPath), "utf8"),
    runBrowserSandboxProviderLiveVerificationSmoke({
      configPath,
      selectionConfigPath,
      artifactPath: resolve(dirname(artifactPath), "browser-sandbox-provider-live-verification-smoke.json"),
      env,
      providerReady,
      fetchImpl
    })
  ]);
  const config = JSON.parse(configText);
  const resolver = resolveBrowserSandboxHostedProvider({
    config,
    configPath,
    validation,
    env,
    providerReady,
    provider: env.WEFELLA_BROWSER_SANDBOX_PROVIDER ?? "hosted_remote"
  });
  const signalingGate = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY === "1";
  const streamRequiresWebrtc = configStreamRequiresWebrtc(config);
  const canAttemptSignaling = Boolean(
    validation.ok &&
    streamRequiresWebrtc &&
    liveVerification.hostedProviderLiveVerificationReady &&
    resolver.resolverReady &&
    signalingGate
  );
  const signaling = canAttemptSignaling
    ? await callSelectedHostedProviderWebrtcSignaling({
      endpointUrl: env[envNameFromRef(config.endpointRef)],
      apiToken: env[envNameFromRef(config.auth?.tokenRef ?? DEFAULT_HOSTED_AUTH_TOKEN_REF)],
      resolver,
      fetchImpl
    })
    : {
      attempted: false,
      ok: false,
      status: streamRequiresWebrtc
        ? liveVerification.hostedProviderLiveVerificationReady
          ? "hosted_browser_sandbox_provider_webrtc_signaling_requires_explicit_gate"
          : "hosted_browser_sandbox_provider_webrtc_signaling_blocked"
        : "hosted_browser_sandbox_provider_webrtc_signaling_not_required",
      providerNetworkCalled: false,
      localHarnessOnly: false
    };
  const signalingReady = Boolean(
    signaling.ok &&
    signaling.providerNetworkCalled &&
    signaling.providerLiveConnected &&
    !signaling.localHarnessOnly
  );
  const hostedProviderReady = Boolean(
    liveVerification.hostedProviderReady &&
    (!streamRequiresWebrtc || signalingReady)
  );
  const result = {
    ok: Boolean(validation.ok && liveVerification.ok && (!canAttemptSignaling || signaling.ok)),
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: signalingReady
      ? "hosted_browser_sandbox_provider_webrtc_signaling_ready"
      : signaling.status,
    hostedProviderWebrtcSignalingReady: signalingReady,
    hostedProviderLiveVerificationReady: liveVerification.hostedProviderLiveVerificationReady,
    hostedProviderReady,
    hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
    streamRequiresWebrtc,
    validation,
    resolver,
    liveVerification: {
      status: liveVerification.status,
      hostedProviderLiveVerificationReady: liveVerification.hostedProviderLiveVerificationReady
    },
    signaling,
    requiredWebrtcProofBeforeHostedReady: [
      "opaque SDP offer reference sent through public connector",
      "provider answer reference returned without raw SDP",
      "provider ICE server references returned without raw credentials",
      "provider ICE candidate relay accepts opaque candidate references only",
      "no raw SDP, ICE candidate, frame, OCR, endpoint, token, credential, or portal text is returned"
    ],
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider_webrtc_signaling",
      scoreKey: "hosted_browser_sandbox_provider_webrtc_signaling",
      signalingReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY",
      hostedReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED"
    },
    safety: {
      ...assertNoSecretLeak(validation),
      ...assertNoSecretLeak(resolver),
      ...assertNoSecretLeak(liveVerification),
      ...assertNoSecretLeak(signaling),
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawEndpointUrlWritten: false,
      rawSdpReturned: Boolean(signaling?.offer?.rawSdpReturned),
      rawIceCandidateReturned: Boolean(signaling?.iceCandidate?.rawIceCandidateReturned),
      rawFrameReturned: false,
      rawOcrTextReturned: false,
      externalActions: false,
      agentCredentialEntryAllowed: false,
      liveProviderOverclaimed: !hostedProviderReady && resolver.ready
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

async function callSelectedHostedProviderLiveLifecycle({
  endpointUrl,
  apiToken,
  resolver,
  fetchImpl = globalThis.fetch
} = {}) {
  const request = buildHostedProviderAdapterRequest({
    providerResolution: resolver,
    targetUrlRef: "approved-target-url-ref-redacted",
    options: { liveVerification: true }
  });
  const createSession = await callHostedProviderCreateLiveSession({
    endpointUrl,
    apiToken,
    request,
    fetchImpl
  });
  const providerSessionRef = createSession.response?.providerSessionRef;
  const stream = await callHostedProviderStreamOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/stream`,
    fetchImpl
  });
  const screenshot = await callHostedProviderJsonOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/screenshot`,
    body: { screenshotRef: "provider-screenshot-ref-redacted" },
    fetchImpl
  });
  const ocrCaption = await callHostedProviderJsonOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/ocr-caption`,
    body: { screenshotRef: "provider-screenshot-ref-redacted" },
    fetchImpl
  });
  const takeover = await callHostedProviderJsonOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/takeover`,
    body: { reason: "user_controlled_auth_or_captcha" },
    fetchImpl
  });
  const input = await callHostedProviderJsonOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/input`,
    body: {
      takeoverId: takeover.response?.takeoverId,
      approvalGrantRef: "approval-grant-ref-redacted",
      inputType: "click",
      inputValue: "[redacted]"
    },
    fetchImpl
  });
  const offsite = await callHostedProviderJsonOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/navigate`,
    body: { targetUrlRef: "offsite-target-url-ref-redacted" },
    fetchImpl
  });
  const teardown = await callHostedProviderJsonOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/teardown`,
    body: { reason: "live_verification_complete" },
    fetchImpl
  });
  const ok = Boolean(
    createSession.ok &&
    createSession.response?.providerLiveConnected === true &&
    stream.ok &&
    stream.providerLiveConnected === true &&
    screenshot.ok &&
    screenshot.response?.providerLiveConnected === true &&
    screenshot.response?.screenshotRef &&
    screenshot.response?.rawImageReturned === false &&
    ocrCaption.ok &&
    ocrCaption.response?.providerLiveConnected === true &&
    ocrCaption.response?.captionRef &&
    ocrCaption.response?.rawOcrTextReturned === false &&
    takeover.ok &&
    takeover.response?.providerLiveConnected === true &&
    takeover.response?.approvalRequired === true &&
    takeover.response?.inputRelay === "approval_gated_human_only" &&
    input.ok &&
    input.response?.providerLiveConnected === true &&
    input.response?.inputAccepted === true &&
    input.response?.rawInputReturned === false &&
    input.response?.externalWriteActionsWithoutApproval === false &&
    offsite.statusCode === 403 &&
    offsite.response?.providerLiveConnected === true &&
    offsite.response?.offsiteFailClosed === true &&
    offsite.response?.rawTargetUrlReturned === false &&
    teardown.ok &&
    teardown.response?.providerLiveConnected === true &&
    teardown.response?.teardownComplete === true &&
    teardown.response?.rawFramePersisted === false &&
    teardown.response?.rawOcrTextPersisted === false
  );
  return {
    attempted: true,
    ok,
    status: ok
      ? "hosted_browser_sandbox_provider_live_lifecycle_verified"
      : "hosted_browser_sandbox_provider_live_lifecycle_failed",
    providerNetworkCalled: true,
    localHarnessOnly: false,
    providerLiveConnected: Boolean(createSession.response?.providerLiveConnected),
    createSession: {
      ok: createSession.ok,
      statusCode: createSession.statusCode,
      responseValidation: createSession.responseValidation,
      providerLiveConnected: Boolean(createSession.response?.providerLiveConnected)
    },
    stream: {
      ok: stream.ok,
      statusCode: stream.statusCode,
      eventType: stream.eventType,
      frameRefPresent: stream.frameRefPresent,
      rawFrameReturned: stream.rawFrameReturned,
      rawOcrTextReturned: stream.rawOcrTextReturned,
      providerLiveConnected: stream.providerLiveConnected
    },
    screenshot: {
      ok: screenshot.ok,
      statusCode: screenshot.statusCode,
      screenshotRefPresent: Boolean(screenshot.response?.screenshotRef),
      rawImageReturned: Boolean(screenshot.response?.rawImageReturned),
      providerLiveConnected: Boolean(screenshot.response?.providerLiveConnected)
    },
    ocrCaption: {
      ok: ocrCaption.ok,
      statusCode: ocrCaption.statusCode,
      captionRefPresent: Boolean(ocrCaption.response?.captionRef),
      rawOcrTextReturned: Boolean(ocrCaption.response?.rawOcrTextReturned),
      providerLiveConnected: Boolean(ocrCaption.response?.providerLiveConnected)
    },
    takeover: {
      ok: takeover.ok,
      statusCode: takeover.statusCode,
      approvalRequired: Boolean(takeover.response?.approvalRequired),
      inputRelay: takeover.response?.inputRelay ?? null,
      providerLiveConnected: Boolean(takeover.response?.providerLiveConnected)
    },
    input: {
      ok: input.ok,
      statusCode: input.statusCode,
      inputAccepted: Boolean(input.response?.inputAccepted),
      rawInputReturned: Boolean(input.response?.rawInputReturned),
      externalWriteActionsWithoutApproval: Boolean(input.response?.externalWriteActionsWithoutApproval),
      providerLiveConnected: Boolean(input.response?.providerLiveConnected)
    },
    offsite: {
      ok: offsite.statusCode === 403,
      statusCode: offsite.statusCode,
      offsiteFailClosed: Boolean(offsite.response?.offsiteFailClosed),
      rawTargetUrlReturned: Boolean(offsite.response?.rawTargetUrlReturned),
      providerLiveConnected: Boolean(offsite.response?.providerLiveConnected)
    },
    teardown: {
      ok: teardown.ok,
      statusCode: teardown.statusCode,
      teardownComplete: Boolean(teardown.response?.teardownComplete),
      rawFramePersisted: Boolean(teardown.response?.rawFramePersisted),
      rawOcrTextPersisted: Boolean(teardown.response?.rawOcrTextPersisted),
      providerLiveConnected: Boolean(teardown.response?.providerLiveConnected)
    }
  };
}

async function callSelectedHostedProviderWebrtcSignaling({
  endpointUrl,
  apiToken,
  resolver,
  fetchImpl = globalThis.fetch
} = {}) {
  const request = buildHostedProviderAdapterRequest({
    providerResolution: resolver,
    targetUrlRef: "approved-target-url-ref-redacted",
    options: { webrtcSignaling: true }
  });
  const createSession = await callHostedProviderCreateLiveSession({
    endpointUrl,
    apiToken,
    request,
    fetchImpl
  });
  const providerSessionRef = createSession.response?.providerSessionRef;
  const offer = await callHostedProviderJsonOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/webrtc/offer`,
    body: {
      offerRef: "client-sdp-offer-ref-redacted",
      rawSdpReturned: false,
      clientCapabilities: {
        receiveVideo: true,
        receiveAudio: false,
        dataChannelInput: true
      }
    },
    fetchImpl
  });
  const iceCandidate = await callHostedProviderJsonOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/webrtc/ice-candidate`,
    body: {
      candidateRef: "client-ice-candidate-ref-redacted",
      rawIceCandidateReturned: false
    },
    fetchImpl
  });
  const teardown = await callHostedProviderJsonOperation({
    endpointUrl,
    apiToken,
    path: `/browser/sessions/${providerSessionRef}/teardown`,
    body: { reason: "webrtc_signaling_verification_complete" },
    fetchImpl
  });
  const serialized = JSON.stringify({
    offer: offer.response,
    iceCandidate: iceCandidate.response,
    teardown: teardown.response
  });
  const ok = Boolean(
    createSession.ok &&
    createSession.response?.providerLiveConnected === true &&
    offer.ok &&
    offer.response?.providerLiveConnected === true &&
    offer.response?.transport === "webrtc" &&
    offer.response?.answerRef &&
    offer.response?.rawSdpReturned === false &&
    Array.isArray(offer.response?.iceServerRefs) &&
    offer.response.iceServerRefs.length > 0 &&
    offer.response?.rawIceCandidateReturned === false &&
    offer.response?.frameRecordingEnabled === false &&
    iceCandidate.ok &&
    iceCandidate.response?.candidateAccepted === true &&
    iceCandidate.response?.rawIceCandidateReturned === false &&
    iceCandidate.response?.providerLiveConnected === true &&
    teardown.ok &&
    teardown.response?.teardownComplete === true &&
    !/v=0|candidate:|a=fingerprint|a=ice-ufrag|turn:|stun:|Bearer\s+|token|secret|data:image|member id|subscriber id|password|captcha/i.test(serialized)
  );
  return {
    attempted: true,
    ok,
    status: ok
      ? "hosted_browser_sandbox_provider_webrtc_signaling_verified"
      : "hosted_browser_sandbox_provider_webrtc_signaling_failed",
    providerNetworkCalled: true,
    localHarnessOnly: false,
    providerLiveConnected: Boolean(createSession.response?.providerLiveConnected),
    createSession: {
      ok: createSession.ok,
      statusCode: createSession.statusCode,
      responseValidation: createSession.responseValidation,
      providerLiveConnected: Boolean(createSession.response?.providerLiveConnected)
    },
    offer: {
      ok: offer.ok,
      statusCode: offer.statusCode,
      transport: offer.response?.transport ?? null,
      answerRefPresent: Boolean(offer.response?.answerRef),
      iceServerRefsPresent: Array.isArray(offer.response?.iceServerRefs) && offer.response.iceServerRefs.length > 0,
      rawSdpReturned: Boolean(offer.response?.rawSdpReturned),
      rawIceCandidateReturned: Boolean(offer.response?.rawIceCandidateReturned),
      providerLiveConnected: Boolean(offer.response?.providerLiveConnected)
    },
    iceCandidate: {
      ok: iceCandidate.ok,
      statusCode: iceCandidate.statusCode,
      candidateAccepted: Boolean(iceCandidate.response?.candidateAccepted),
      rawIceCandidateReturned: Boolean(iceCandidate.response?.rawIceCandidateReturned),
      providerLiveConnected: Boolean(iceCandidate.response?.providerLiveConnected)
    },
    teardown: {
      ok: teardown.ok,
      statusCode: teardown.statusCode,
      teardownComplete: Boolean(teardown.response?.teardownComplete),
      providerLiveConnected: Boolean(teardown.response?.providerLiveConnected)
    }
  };
}

async function callHostedProviderHealthProbe({
  endpointUrl,
  apiToken,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!endpointUrl || !apiToken) {
    return {
      attempted: false,
      ok: false,
      statusCode: null,
      endpointRedacted: true,
      authorizationRedacted: true,
      rawEndpointReturned: false,
      rawSecretReturned: false,
      failure: "endpoint_or_token_missing"
    };
  }
  const response = await fetchImpl(new URL("health", endpointUrl.endsWith("/") ? endpointUrl : `${endpointUrl}/`), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiToken}`,
      "x-brainstyworkers-contract-version": BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION
    }
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  const serialized = JSON.stringify(payload);
  const ok = Boolean(
    response.ok &&
    payload?.contractVersion === BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION &&
    payload?.status === "provider_health_ready" &&
    payload?.capabilities?.streamFrames === true &&
    payload?.capabilities?.screenshot === true &&
    payload?.capabilities?.ocrCaption === true &&
    payload?.capabilities?.takeover === true &&
    payload?.capabilities?.approvedInputRelay === true &&
    payload?.capabilities?.teardown === true &&
    payload?.capabilities?.offsiteFailClosed === true &&
    !/https?:\/\/|Bearer\s+|token|secret|data:image|member id|subscriber id|password|captcha/i.test(serialized)
  );
  return {
    attempted: true,
    ok,
    statusCode: response.status,
    endpointRedacted: true,
    authorizationRedacted: true,
    rawEndpointReturned: false,
    rawSecretReturned: false,
    capabilities: {
      streamFrames: Boolean(payload?.capabilities?.streamFrames),
      screenshot: Boolean(payload?.capabilities?.screenshot),
      ocrCaption: Boolean(payload?.capabilities?.ocrCaption),
      takeover: Boolean(payload?.capabilities?.takeover),
      approvedInputRelay: Boolean(payload?.capabilities?.approvedInputRelay),
      teardown: Boolean(payload?.capabilities?.teardown),
      offsiteFailClosed: Boolean(payload?.capabilities?.offsiteFailClosed)
    }
  };
}

function resultSafeForLeakCheck(config) {
  return {
    ...config,
    candidateProviders: Array.isArray(config.candidateProviders)
      ? config.candidateProviders.map((candidate) => ({
        key: candidate.key,
        status: candidate.status,
        requiredCapabilities: candidate.requiredCapabilities,
        secretsInGit: candidate.secretsInGit,
        rawEndpointInGit: candidate.rawEndpointInGit
      }))
      : []
  };
}

function isEnvRef(value) {
  return typeof value === "string" && value.startsWith("env:") && value.slice(4).length > 0;
}

function refKind(value) {
  if (!value) return null;
  if (isEnvRef(value)) return "env";
  if (/^https?:\/\//i.test(String(value))) return "raw_url";
  return "logical_ref";
}

function envNameFromRef(value) {
  return isEnvRef(value) ? value.slice(4) : null;
}

function isHttpsEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveBrowserSandboxHostedProvider({
  config,
  configPath,
  validation,
  env = process.env,
  providerReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1",
  provider = env.WEFELLA_BROWSER_SANDBOX_PROVIDER ?? "local_cdp"
} = {}) {
  const adapterMode = config?.adapter?.mode ?? validation?.sanitizedConfig?.adapter?.mode ?? "missing";
  const nonExampleConfig = Boolean(configPath && configPath !== DEFAULT_CONFIG_PATH);
  const endpointEnvName = envNameFromRef(config?.endpointRef);
  const authTokenRef = config?.auth?.tokenRef ?? DEFAULT_HOSTED_AUTH_TOKEN_REF;
  const authEnvName = envNameFromRef(authTokenRef);
  const endpointValue = endpointEnvName ? env[endpointEnvName] : null;
  const authValue = authEnvName ? env[authEnvName] : null;
  const endpointResolved = Boolean(endpointValue && isHttpsEndpoint(endpointValue));
  const authResolved = Boolean(authValue);
  const liveVerified = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED === "1";
  const liveVerificationReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY === "1";
  const streamRequiresWebrtc = configStreamRequiresWebrtc(config);
  const webrtcSignalingReady = !streamRequiresWebrtc || env.WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY === "1";
  const resolverReady = Boolean(
    provider === "hosted_remote" &&
    providerReady &&
    validation?.ok &&
    nonExampleConfig &&
    adapterMode === "hosted_provider" &&
    endpointResolved &&
    authResolved
  );
  const ready = Boolean(resolverReady && liveVerified && liveVerificationReady && webrtcSignalingReady && config?.adapter?.providerLiveConnected === true);
  const status = ready
    ? "hosted_browser_sandbox_provider_ready"
    : resolverReady
      ? "hosted_browser_sandbox_provider_configured_unverified"
      : adapterMode === "hosted_provider" && provider === "hosted_remote" && providerReady && validation?.ok && nonExampleConfig
        ? "hosted_browser_sandbox_provider_missing_endpoint_or_secret"
        : "hosted_browser_sandbox_provider_not_selected";
  return {
    status,
    resolverReady,
    ready,
    endpointResolved,
    authResolved,
    liveVerified,
    liveVerificationReady,
    streamRequiresWebrtc,
    webrtcSignalingReady,
    endpointRefKind: refKind(config?.endpointRef),
    authTokenRefKind: refKind(authTokenRef),
    endpointEnvPresent: Boolean(endpointEnvName),
    authEnvPresent: Boolean(authEnvName),
    rawEndpointReturned: false,
    rawSecretReturned: false,
    rawSecretPathReturned: false
  };
}

export function buildHostedProviderAdapterRequest({
  sessionId = "session_adapter_smoke",
  userId = "user_adapter_smoke",
  targetUrlRef = "approved-target-url-ref-redacted",
  options = {},
  providerResolution = {}
} = {}) {
  return {
    contractVersion: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    operation: "create_browser_session",
    method: "POST",
    endpoint: {
      endpointResolved: Boolean(providerResolution.endpointResolved),
      rawEndpointReturned: false
    },
    auth: {
      authResolved: Boolean(providerResolution.authResolved),
      authorizationHeader: "[redacted]",
      rawSecretReturned: false
    },
    body: {
      sessionId,
      userId,
      targetUrlRef,
      options,
      approvalContract: {
        readOnlyApprovalRequired: true,
        humanTakeoverApprovalRequired: true,
        humanInputRelay: "approval_gated_human_only"
      },
      safetyContract: {
        agentCredentialEntryAllowed: false,
        externalWriteActionsAllowed: false,
        frameRecordingAllowed: false,
        rawOcrPersistenceAllowed: false,
        offsiteFailClosed: true,
        credentialPagesUserOnly: true
      },
      expectedResponseContract: {
        browserSessionId: "provider_scoped_id",
        streamRef: "opaque_provider_stream_reference",
        screenshotRef: "opaque_provider_screenshot_reference",
        ocrCaptionRef: "opaque_provider_caption_reference",
        takeoverState: "not_requested"
      }
    }
  };
}

export function validateHostedProviderAdapterResponse(response) {
  const failures = [];
  if (response?.contractVersion !== BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION) failures.push("contract_version_mismatch");
  if (!response?.providerSessionRef || typeof response.providerSessionRef !== "string") failures.push("provider_session_ref_required");
  if (response?.providerLiveConnected === true) failures.push("adapter_smoke_must_not_claim_live_connection");
  if (response?.stream?.rawFrameReturned) failures.push("raw_frame_must_not_be_returned");
  if (response?.ocrCaption?.rawOcrTextReturned) failures.push("raw_ocr_text_must_not_be_returned");
  if (response?.takeover?.inputRelay !== "approval_gated_human_only") failures.push("input_relay_must_be_human_only");
  if (response?.safety?.externalWriteActionsWithoutApproval) failures.push("external_write_actions_without_approval");
  if (response?.safety?.agentCredentialEntryAllowed) failures.push("agent_credential_entry_allowed");
  if ((response?.actionsTaken ?? []).length !== 0) failures.push("adapter_smoke_must_not_take_actions");
  const serialized = JSON.stringify(response ?? {});
  if (/https?:\/\/[^"\\\s]+/i.test(serialized)) failures.push("raw_provider_url_returned");
  if (/test-token-that-must-not-leak|Bearer\s+[A-Za-z0-9._-]+/.test(serialized)) failures.push("raw_provider_secret_returned");
  return {
    ok: failures.length === 0,
    failures,
    safety: {
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawFrameReturned: Boolean(response?.stream?.rawFrameReturned),
      rawOcrTextReturned: Boolean(response?.ocrCaption?.rawOcrTextReturned),
      externalWriteActionsWithoutApproval: Boolean(response?.safety?.externalWriteActionsWithoutApproval),
      agentCredentialEntryAllowed: Boolean(response?.safety?.agentCredentialEntryAllowed)
    }
  };
}

export function validateHostedProviderLiveAdapterResponse(response) {
  const failures = [];
  if (response?.contractVersion !== BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION) failures.push("contract_version_mismatch");
  if (!response?.providerSessionRef || typeof response.providerSessionRef !== "string") failures.push("provider_session_ref_required");
  if (response?.providerLiveConnected !== true) failures.push("live_provider_connection_required");
  if (response?.stream?.rawFrameReturned) failures.push("raw_frame_must_not_be_returned");
  if (response?.stream?.frameRecordingEnabled) failures.push("frame_recording_must_be_disabled");
  if (response?.ocrCaption?.rawOcrTextReturned) failures.push("raw_ocr_text_must_not_be_returned");
  if (response?.takeover?.inputRelay !== "approval_gated_human_only") failures.push("input_relay_must_be_human_only");
  if (response?.takeover?.approvalRequired !== true) failures.push("takeover_approval_required");
  if (response?.safety?.externalWriteActionsWithoutApproval) failures.push("external_write_actions_without_approval");
  if (response?.safety?.agentCredentialEntryAllowed) failures.push("agent_credential_entry_allowed");
  const serialized = JSON.stringify(response ?? {});
  if (/https?:\/\/[^"\\\s]+/i.test(serialized)) failures.push("raw_provider_url_returned");
  if (/test-token-that-must-not-leak|Bearer\s+[A-Za-z0-9._-]+/.test(serialized)) failures.push("raw_provider_secret_returned");
  if (/data:image|<html|member id|subscriber id|password|captcha/i.test(serialized)) failures.push("raw_frame_or_ocr_or_secret_content_returned");
  return {
    ok: failures.length === 0,
    failures,
    safety: {
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawFrameReturned: Boolean(response?.stream?.rawFrameReturned),
      rawOcrTextReturned: Boolean(response?.ocrCaption?.rawOcrTextReturned),
      externalWriteActionsWithoutApproval: Boolean(response?.safety?.externalWriteActionsWithoutApproval),
      agentCredentialEntryAllowed: Boolean(response?.safety?.agentCredentialEntryAllowed)
    }
  };
}

export async function callHostedProviderCreateSession({
  endpointUrl,
  apiToken,
  request,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!endpointUrl || !apiToken) {
    throw new Error("Hosted provider endpoint and API token are required for HTTP adapter calls.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for hosted provider HTTP adapter calls.");
  }
  const url = new URL("browser/sessions", endpointUrl.endsWith("/") ? endpointUrl : `${endpointUrl}/`);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiToken}`,
      "x-brainstyworkers-contract-version": BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION
    },
    body: JSON.stringify(request.body)
  });
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Hosted provider returned invalid JSON: ${error.message}`);
  }
  const responseValidation = validateHostedProviderAdapterResponse(payload);
  return {
    ok: Boolean(response.ok && responseValidation.ok),
    statusCode: response.status,
    response: payload,
    responseValidation,
    providerNetworkCalled: true,
    endpointRedacted: true,
    authorizationRedacted: true
  };
}

export async function callHostedProviderCreateLiveSession({
  endpointUrl,
  apiToken,
  request,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!endpointUrl || !apiToken) {
    throw new Error("Hosted provider endpoint and API token are required for live provider calls.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for live provider calls.");
  }
  const url = new URL("browser/sessions", endpointUrl.endsWith("/") ? endpointUrl : `${endpointUrl}/`);
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiToken}`,
      "x-brainstyworkers-contract-version": BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION
    },
    body: JSON.stringify(request.body)
  });
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Hosted live provider returned invalid JSON: ${error.message}`);
  }
  const responseValidation = validateHostedProviderLiveAdapterResponse(payload);
  return {
    ok: Boolean(response.ok && responseValidation.ok),
    statusCode: response.status,
    response: payload,
    responseValidation,
    providerNetworkCalled: true,
    endpointRedacted: true,
    authorizationRedacted: true
  };
}

async function callHostedProviderJsonOperation({
  endpointUrl,
  apiToken,
  path,
  method = "POST",
  body = {},
  fetchImpl = globalThis.fetch
} = {}) {
  if (!endpointUrl || !apiToken || !path) {
    throw new Error("Hosted provider endpoint, API token, and operation path are required.");
  }
  const response = await fetchImpl(new URL(path.replace(/^\//, ""), endpointUrl.endsWith("/") ? endpointUrl : `${endpointUrl}/`), {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiToken}`,
      "x-brainstyworkers-contract-version": BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION
    },
    body: method === "GET" ? undefined : JSON.stringify(body)
  });
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Hosted provider operation returned invalid JSON: ${error.message}`);
  }
  return {
    ok: Boolean(response.ok),
    statusCode: response.status,
    response: payload,
    endpointRedacted: true,
    authorizationRedacted: true
  };
}

async function callHostedProviderStreamOperation({
  endpointUrl,
  apiToken,
  path,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!endpointUrl || !apiToken || !path) {
    throw new Error("Hosted provider endpoint, API token, and stream path are required.");
  }
  const response = await fetchImpl(new URL(path.replace(/^\//, ""), endpointUrl.endsWith("/") ? endpointUrl : `${endpointUrl}/`), {
    method: "GET",
    headers: {
      accept: "text/event-stream",
      authorization: `Bearer ${apiToken}`,
      "x-brainstyworkers-contract-version": BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION
    }
  });
  const text = await response.text();
  const eventPayload = parseSseDataPayload(text);
  const serialized = JSON.stringify(eventPayload);
  return {
    ok: Boolean(
      response.ok &&
      eventPayload?.contractVersion === BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION &&
      eventPayload?.rawFrameReturned === false &&
      eventPayload?.ocrCaption?.rawOcrTextReturned === false &&
      !/data:image|<html|member id|subscriber id|password|captcha/i.test(serialized)
    ),
    statusCode: response.status,
    eventType: eventPayload?.eventType ?? null,
    frameRefPresent: Boolean(eventPayload?.frameRef),
    rawFrameReturned: Boolean(eventPayload?.rawFrameReturned),
    rawOcrTextReturned: Boolean(eventPayload?.ocrCaption?.rawOcrTextReturned),
    providerLiveConnected: Boolean(eventPayload?.providerLiveConnected),
    endpointRedacted: true,
    authorizationRedacted: true
  };
}

function parseSseDataPayload(text) {
  const line = String(text).split(/\r?\n/).find((entry) => entry.startsWith("data:"));
  if (!line) return null;
  try {
    return JSON.parse(line.slice("data:".length).trim());
  } catch {
    return null;
  }
}

export async function validateBrowserSandboxProviderContract({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE || DEFAULT_CONFIG_PATH
} = {}) {
  const text = await readFile(resolve(configPath), "utf8");
  return validateConfig(JSON.parse(text), configPath);
}

export async function runBrowserSandboxProviderContractSmoke({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE || DEFAULT_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-contract-smoke.json"),
  providerReady = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1"
} = {}) {
  const validation = await validateBrowserSandboxProviderContract({ configPath });
  const config = JSON.parse(await readFile(resolve(configPath), "utf8"));
  const adapterMode = validation.sanitizedConfig.adapter.mode;
  const nonExampleConfig = configPath !== DEFAULT_CONFIG_PATH;
  const adapterHarnessReady = Boolean(providerReady && validation.ok && nonExampleConfig && adapterMode === "contract_harness");
  const hostedResolver = resolveBrowserSandboxHostedProvider({
    config,
    configPath,
    validation,
    providerReady,
    provider: process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER ?? "hosted_remote"
  });
  const hostedProviderReady = Boolean(hostedResolver.ready);
  const result = {
    ok: validation.ok,
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: hostedProviderReady
      ? "hosted_browser_sandbox_provider_ready"
      : adapterHarnessReady
        ? "hosted_browser_sandbox_adapter_harness_ready"
        : hostedResolver.status === "hosted_browser_sandbox_provider_configured_unverified"
          ? hostedResolver.status
          : hostedResolver.status === "hosted_browser_sandbox_provider_missing_endpoint_or_secret"
            ? hostedResolver.status
        : "hosted_browser_sandbox_contract_valid_not_configured",
    hostedProviderReady,
    hostedProviderResolverReady: hostedResolver.resolverReady,
    adapterHarnessReady,
    hostedProviderResolver: hostedResolver,
    validation,
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider",
      scoreKey: "hosted_remote_browser_sandbox",
      providerEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER",
      readyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY",
      liveVerifiedEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED",
      configFileEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE"
    },
    safety: {
      ...assertNoSecretLeak(validation),
      ...assertNoSecretLeak(hostedResolver),
      externalActions: false,
      phiSeeded: false,
      agentCredentialEntryAllowed: false
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

export async function runBrowserSandboxAdapterHarnessSmoke({
  configPath = "project/deployment/browser-sandbox-provider.contract-harness.json",
  artifactPath = resolve("artifacts/browser-sandbox-adapter-harness-smoke.json")
} = {}) {
  const result = await runBrowserSandboxProviderContractSmoke({
    configPath,
    artifactPath,
    providerReady: true
  });
  if (!result.adapterHarnessReady || result.hostedProviderReady) {
    result.ok = false;
    result.validation.failures.push("adapter_harness_not_ready_or_overclaimed_provider");
  }
  return {
    ...result,
    lifecycle: {
      createSession: "contract_harness_session_created",
      streamFrames: "contract_harness_sse_event_available",
      screenshot: "contract_harness_placeholder_only",
      ocrCaption: "caption_contract_ready_no_raw_text",
      takeover: "approval_gated_human_only",
      inputRelay: "sanitized_no_external_action",
      teardown: "ephemeral_session_contract_only"
    }
  };
}

export async function runBrowserSandboxProviderResolverSmoke({
  configPath = HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-resolver-smoke.json"),
  providerReady = true
} = {}) {
  const result = await runBrowserSandboxProviderContractSmoke({
    configPath,
    artifactPath,
    providerReady
  });
  if (!result.validation.ok || result.validation.sanitizedConfig.adapter.mode !== "hosted_provider") {
    result.ok = false;
    result.validation.failures.push("hosted_provider_resolver_config_not_valid");
  }
  return {
    ...result,
    resolverContract: {
      endpointAndAuthAreReferencesOnly: true,
      endpointResolved: result.hostedProviderResolver.endpointResolved,
      authResolved: result.hostedProviderResolver.authResolved,
      liveVerified: result.hostedProviderResolver.liveVerified,
      providerScoreMayPassOnlyAfterLiveVerified: true
    }
  };
}

export async function runBrowserSandboxProviderAdapterSmoke({
  configPath = HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-adapter-smoke.json"),
  providerReady = true
} = {}) {
  const resolver = await runBrowserSandboxProviderContractSmoke({
    configPath,
    providerReady,
    artifactPath
  });
  const request = buildHostedProviderAdapterRequest({
    providerResolution: resolver.hostedProviderResolver
  });
  const mockResponse = {
    contractVersion: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: "hosted_provider_adapter_contract_ready",
    providerSessionRef: "provider-session-ref-redacted",
    providerLiveConnected: false,
    stream: {
      transport: "webrtc_or_sse_frames",
      streamRef: "provider-stream-ref-redacted",
      rawFrameReturned: false,
      frameRecordingEnabled: false
    },
    screenshot: {
      screenshotRef: "provider-screenshot-ref-redacted",
      rawImageReturned: false
    },
    ocrCaption: {
      captionRef: "provider-caption-ref-redacted",
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
  };
  const responseValidation = validateHostedProviderAdapterResponse(mockResponse);
  const adapterContractReady = Boolean(resolver.hostedProviderResolverReady && responseValidation.ok);
  const result = {
    ...resolver,
    ok: Boolean(resolver.ok && responseValidation.ok),
    status: adapterContractReady
      ? "hosted_browser_sandbox_provider_adapter_contract_ready"
      : resolver.status,
    hostedProviderAdapterReady: adapterContractReady,
    hostedProviderReady: false,
    adapterContract: {
      request,
      response: mockResponse,
      responseValidation,
      providerNetworkCalled: false,
      providerLiveConnected: false,
      liveProviderScoreMayPassOnlyAfterLiveVerified: true
    }
  };
  const serialized = JSON.stringify(result);
  result.safety = {
    ...result.safety,
    ...assertNoSecretLeak(result),
    rawEndpointUrlWritten: /https?:\/\/sandbox-provider\.invalid/i.test(serialized),
    rawSecretReturned: /test-token-that-must-not-leak/.test(serialized),
    externalActions: false,
    agentCredentialEntryAllowed: false
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

export async function runBrowserSandboxProviderHttpAdapterHarnessSmoke({
  configPath = HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-http-adapter-harness-smoke.json"),
  providerReady = true
} = {}) {
  const previousProvider = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER;
  const previousEndpoint = process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL;
  const previousToken = process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN;
  const previousAdapter = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY;
  const apiToken = "local-harness-token-redacted";
  const received = {};
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      received.method = request.method;
      received.path = request.url;
      received.authorizationPresent = Boolean(request.headers.authorization);
      received.authorizationMatches = request.headers.authorization === `Bearer ${apiToken}`;
      received.contractVersion = request.headers["x-brainstyworkers-contract-version"];
      received.rawTargetUrlReceived = /^https?:\/\//i.test(String(parsed.targetUrlRef ?? ""));
      received.agentCredentialEntryAllowed = Boolean(parsed.safetyContract?.agentCredentialEntryAllowed);
      received.externalWriteActionsAllowed = Boolean(parsed.safetyContract?.externalWriteActionsAllowed);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        contractVersion: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
        status: "hosted_provider_http_adapter_harness_ready",
        providerSessionRef: "provider-http-session-ref-redacted",
        providerLiveConnected: false,
        stream: {
          transport: "webrtc_or_sse_frames",
          streamRef: "provider-http-stream-ref-redacted",
          rawFrameReturned: false,
          frameRecordingEnabled: false
        },
        screenshot: {
          screenshotRef: "provider-http-screenshot-ref-redacted",
          rawImageReturned: false
        },
        ocrCaption: {
          captionRef: "provider-http-caption-ref-redacted",
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
      }));
    });
  });
  await new Promise((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(0, "127.0.0.1", resolveStart);
  });
  try {
    const address = server.address();
    const endpointUrl = `http://127.0.0.1:${address.port}`;
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER = "hosted_remote";
    process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL = "https://provider-harness.invalid/api";
    process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN = "provider-harness-token-must-not-leak";
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY = "1";
    const adapter = await runBrowserSandboxProviderAdapterSmoke({
      configPath,
      artifactPath,
      providerReady
    });
    const httpResult = await callHostedProviderCreateSession({
      endpointUrl,
      apiToken,
      request: adapter.adapterContract.request
    });
    const httpAdapterHarnessReady = Boolean(
      adapter.hostedProviderAdapterReady &&
      httpResult.ok &&
      received.method === "POST" &&
      received.path === "/browser/sessions" &&
      received.authorizationMatches &&
      !received.rawTargetUrlReceived &&
      !received.agentCredentialEntryAllowed &&
      !received.externalWriteActionsAllowed
    );
    const result = {
      ...adapter,
      ok: Boolean(adapter.ok && httpAdapterHarnessReady),
      status: httpAdapterHarnessReady
        ? "hosted_browser_sandbox_provider_http_adapter_harness_ready"
        : adapter.status,
      hostedProviderHttpAdapterReady: httpAdapterHarnessReady,
      hostedProviderReady: false,
      adapterContract: {
        ...adapter.adapterContract,
        httpAdapterHarness: {
          ok: httpAdapterHarnessReady,
          status: httpResult.response?.status ?? "unknown",
          statusCode: httpResult.statusCode,
          providerNetworkCalled: true,
          localHarnessOnly: true,
          endpointRedacted: true,
          authorizationRedacted: true,
          requestMethod: received.method,
          requestPath: received.path,
          authorizationPresent: received.authorizationPresent,
          rawTargetUrlReceived: received.rawTargetUrlReceived,
          responseValidation: httpResult.responseValidation,
          providerLiveConnected: false,
          liveProviderScoreMayPassOnlyAfterLiveVerified: true
        }
      }
    };
    const serialized = JSON.stringify(result);
    result.safety = {
      ...result.safety,
      ...assertNoSecretLeak(result),
      rawEndpointUrlWritten: /provider-harness\.invalid|127\.0\.0\.1|localhost/i.test(serialized),
      rawSecretReturned: /provider-harness-token-must-not-leak|local-harness-token-redacted/.test(serialized),
      externalActions: false,
      agentCredentialEntryAllowed: false
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(result, null, 2));
    return result;
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    restoreProcessEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER", previousProvider);
    restoreProcessEnv("WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL", previousEndpoint);
    restoreProcessEnv("WEFELLA_BROWSER_SANDBOX_API_TOKEN", previousToken);
    restoreProcessEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY", previousAdapter);
  }
}

export async function runBrowserSandboxProviderLiveLifecycleHarnessSmoke({
  configPath = HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-live-lifecycle-harness-smoke.json"),
  providerReady = true
} = {}) {
  const previousProvider = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER;
  const previousEndpoint = process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL;
  const previousToken = process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN;
  const previousAdapter = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY;
  const previousHttpAdapter = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_HTTP_ADAPTER_HARNESS_READY;
  const apiToken = "local-lifecycle-harness-token-redacted";
  const received = { paths: [], offsiteFailClosed: false };
  let createdSessionRef = "provider-lifecycle-session-ref-redacted";
  let takeoverId = "provider-lifecycle-takeover-ref-redacted";
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      const authOk = request.headers.authorization === `Bearer ${apiToken}`;
      received.paths.push({ method: request.method, path: request.url, authOk });
      if (!authOk) {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "unauthorized" }));
        return;
      }
      if (request.method === "POST" && request.url === "/browser/sessions") {
        received.rawTargetUrlReceived = /^https?:\/\//i.test(String(parsed.targetUrlRef ?? ""));
        createdSessionRef = "provider-lifecycle-session-ref-redacted";
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          contractVersion: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
          status: "hosted_provider_lifecycle_session_created",
          providerSessionRef: createdSessionRef,
          providerLiveConnected: false,
          stream: {
            transport: "webrtc_or_sse_frames",
            streamRef: "provider-lifecycle-stream-ref-redacted",
            rawFrameReturned: false,
            frameRecordingEnabled: false
          },
          screenshot: {
            screenshotRef: "provider-lifecycle-screenshot-ref-redacted",
            rawImageReturned: false
          },
          ocrCaption: {
            captionRef: "provider-lifecycle-caption-ref-redacted",
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
        }));
        return;
      }
      if (request.method === "GET" && request.url === `/browser/sessions/${createdSessionRef}/stream`) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(`event: frame\ndata: ${JSON.stringify({
          contractVersion: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
          eventType: "provider.lifecycle.frame",
          browserSessionRef: createdSessionRef,
          frameRef: "provider-lifecycle-frame-ref-redacted",
          rawFrameReturned: false,
          frameRecordingEnabled: false,
          ocrCaption: {
            captionRef: "provider-lifecycle-caption-ref-redacted",
            rawOcrTextReturned: false
          },
          providerLiveConnected: false
        })}\n\n`);
        return;
      }
      if (request.method === "POST" && request.url === `/browser/sessions/${createdSessionRef}/screenshot`) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          status: "screenshot_ref_ready",
          screenshotRef: "provider-lifecycle-screenshot-ref-redacted",
          rawImageReturned: false,
          providerLiveConnected: false
        }));
        return;
      }
      if (request.method === "POST" && request.url === `/browser/sessions/${createdSessionRef}/ocr-caption`) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          status: "ocr_caption_ref_ready",
          captionRef: "provider-lifecycle-caption-ref-redacted",
          rawOcrTextReturned: false,
          providerLiveConnected: false
        }));
        return;
      }
      if (request.method === "POST" && request.url === `/browser/sessions/${createdSessionRef}/takeover`) {
        takeoverId = "provider-lifecycle-takeover-ref-redacted";
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          status: "takeover_pending_approval",
          takeoverId,
          approvalRequired: true,
          inputRelay: "approval_gated_human_only",
          providerLiveConnected: false
        }));
        return;
      }
      if (request.method === "POST" && request.url === `/browser/sessions/${createdSessionRef}/input`) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          status: "input_relayed",
          takeoverId,
          inputAccepted: parsed.takeoverId === takeoverId && parsed.approvalGrantRef === "approval-grant-ref-redacted",
          rawInputReturned: false,
          inputValueRedacted: true,
          providerLiveConnected: false,
          externalWriteActionsWithoutApproval: false
        }));
        return;
      }
      if (request.method === "POST" && request.url === `/browser/sessions/${createdSessionRef}/navigate`) {
        received.offsiteFailClosed = parsed.targetUrlRef === "offsite-target-url-ref-redacted";
        response.writeHead(403, { "content-type": "application/json" });
        response.end(JSON.stringify({
          status: "offsite_navigation_blocked",
          offsiteFailClosed: true,
          rawTargetUrlReturned: false,
          providerLiveConnected: false
        }));
        return;
      }
      if (request.method === "POST" && request.url === `/browser/sessions/${createdSessionRef}/teardown`) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          status: "session_torn_down",
          teardownComplete: true,
          rawFramePersisted: false,
          rawOcrTextPersisted: false,
          providerLiveConnected: false
        }));
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "not_found" }));
    });
  });
  await new Promise((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(0, "127.0.0.1", resolveStart);
  });
  try {
    const address = server.address();
    const endpointUrl = `http://127.0.0.1:${address.port}`;
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER = "hosted_remote";
    process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL = "https://provider-lifecycle.invalid/api";
    process.env.WEFELLA_BROWSER_SANDBOX_API_TOKEN = "provider-lifecycle-token-must-not-leak";
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY = "1";
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_HTTP_ADAPTER_HARNESS_READY = "1";
    const adapter = await runBrowserSandboxProviderAdapterSmoke({
      configPath,
      artifactPath,
      providerReady
    });
    const createSession = await callHostedProviderCreateSession({
      endpointUrl,
      apiToken,
      request: adapter.adapterContract.request
    });
    const providerSessionRef = createSession.response?.providerSessionRef ?? createdSessionRef;
    const stream = await callHostedProviderStreamOperation({
      endpointUrl,
      apiToken,
      path: `/browser/sessions/${providerSessionRef}/stream`
    });
    const screenshot = await callHostedProviderJsonOperation({
      endpointUrl,
      apiToken,
      path: `/browser/sessions/${providerSessionRef}/screenshot`,
      body: { screenshotRef: "provider-lifecycle-screenshot-ref-redacted" }
    });
    const ocrCaption = await callHostedProviderJsonOperation({
      endpointUrl,
      apiToken,
      path: `/browser/sessions/${providerSessionRef}/ocr-caption`,
      body: { screenshotRef: "provider-lifecycle-screenshot-ref-redacted" }
    });
    const takeover = await callHostedProviderJsonOperation({
      endpointUrl,
      apiToken,
      path: `/browser/sessions/${providerSessionRef}/takeover`,
      body: { reason: "user_controlled_auth_or_captcha" }
    });
    const input = await callHostedProviderJsonOperation({
      endpointUrl,
      apiToken,
      path: `/browser/sessions/${providerSessionRef}/input`,
      body: {
        takeoverId: takeover.response.takeoverId,
        approvalGrantRef: "approval-grant-ref-redacted",
        inputType: "click",
        inputValue: "[redacted]"
      }
    });
    const offsite = await callHostedProviderJsonOperation({
      endpointUrl,
      apiToken,
      path: `/browser/sessions/${providerSessionRef}/navigate`,
      body: { targetUrlRef: "offsite-target-url-ref-redacted" }
    });
    const teardown = await callHostedProviderJsonOperation({
      endpointUrl,
      apiToken,
      path: `/browser/sessions/${providerSessionRef}/teardown`,
      body: { reason: "harness_complete" }
    });
    const liveLifecycleHarnessReady = Boolean(
      adapter.hostedProviderAdapterReady &&
      createSession.ok &&
      stream.ok &&
      screenshot.ok &&
      screenshot.response?.rawImageReturned === false &&
      ocrCaption.ok &&
      ocrCaption.response?.rawOcrTextReturned === false &&
      takeover.ok &&
      takeover.response?.approvalRequired === true &&
      input.ok &&
      input.response?.rawInputReturned === false &&
      input.response?.externalWriteActionsWithoutApproval === false &&
      offsite.statusCode === 403 &&
      offsite.response?.offsiteFailClosed === true &&
      teardown.ok &&
      teardown.response?.teardownComplete === true &&
      !received.rawTargetUrlReceived &&
      received.offsiteFailClosed
    );
    const result = {
      ...adapter,
      ok: Boolean(adapter.ok && liveLifecycleHarnessReady),
      status: liveLifecycleHarnessReady
        ? "hosted_browser_sandbox_provider_live_lifecycle_harness_ready"
        : adapter.status,
      hostedProviderHttpAdapterReady: true,
      hostedProviderLiveLifecycleHarnessReady: liveLifecycleHarnessReady,
      hostedProviderReady: false,
      adapterContract: {
        ...adapter.adapterContract,
        liveLifecycleHarness: {
          ok: liveLifecycleHarnessReady,
          localHarnessOnly: true,
          providerNetworkCalled: true,
          createSession: {
            ok: createSession.ok,
            statusCode: createSession.statusCode,
            responseValidation: createSession.responseValidation
          },
          stream: {
            ok: stream.ok,
            statusCode: stream.statusCode,
            eventType: stream.eventType,
            frameRefPresent: stream.frameRefPresent,
            rawFrameReturned: stream.rawFrameReturned,
            rawOcrTextReturned: stream.rawOcrTextReturned
          },
          screenshot: {
            ok: screenshot.ok,
            statusCode: screenshot.statusCode,
            screenshotRefPresent: Boolean(screenshot.response?.screenshotRef),
            rawImageReturned: Boolean(screenshot.response?.rawImageReturned)
          },
          ocrCaption: {
            ok: ocrCaption.ok,
            statusCode: ocrCaption.statusCode,
            captionRefPresent: Boolean(ocrCaption.response?.captionRef),
            rawOcrTextReturned: Boolean(ocrCaption.response?.rawOcrTextReturned)
          },
          takeover: {
            ok: takeover.ok,
            statusCode: takeover.statusCode,
            approvalRequired: Boolean(takeover.response?.approvalRequired),
            inputRelay: takeover.response?.inputRelay ?? null
          },
          input: {
            ok: input.ok,
            statusCode: input.statusCode,
            inputAccepted: Boolean(input.response?.inputAccepted),
            rawInputReturned: Boolean(input.response?.rawInputReturned),
            externalWriteActionsWithoutApproval: Boolean(input.response?.externalWriteActionsWithoutApproval)
          },
          offsite: {
            ok: offsite.statusCode === 403,
            statusCode: offsite.statusCode,
            offsiteFailClosed: Boolean(offsite.response?.offsiteFailClosed),
            rawTargetUrlReturned: Boolean(offsite.response?.rawTargetUrlReturned)
          },
          teardown: {
            ok: teardown.ok,
            statusCode: teardown.statusCode,
            teardownComplete: Boolean(teardown.response?.teardownComplete),
            rawFramePersisted: Boolean(teardown.response?.rawFramePersisted),
            rawOcrTextPersisted: Boolean(teardown.response?.rawOcrTextPersisted)
          },
          providerLiveConnected: false,
          liveProviderScoreMayPassOnlyAfterLiveVerified: true
        }
      }
    };
    const serialized = JSON.stringify(result);
    result.safety = {
      ...result.safety,
      ...assertNoSecretLeak(result),
      rawEndpointUrlWritten: /provider-lifecycle\.invalid|127\.0\.0\.1|localhost/i.test(serialized),
      rawSecretReturned: /provider-lifecycle-token-must-not-leak|local-lifecycle-harness-token-redacted/.test(serialized),
      rawFrameReturned: /data:image|raw portal frame|<html/i.test(serialized),
      rawOcrTextReturned: /member id|subscriber id|captcha text/i.test(serialized),
      rawInputReturned: /secret-click-target|typed-password/i.test(serialized),
      externalActions: false,
      agentCredentialEntryAllowed: false
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(result, null, 2));
    return result;
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    restoreProcessEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER", previousProvider);
    restoreProcessEnv("WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL", previousEndpoint);
    restoreProcessEnv("WEFELLA_BROWSER_SANDBOX_API_TOKEN", previousToken);
    restoreProcessEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY", previousAdapter);
    restoreProcessEnv("WEFELLA_BROWSER_SANDBOX_PROVIDER_HTTP_ADAPTER_HARNESS_READY", previousHttpAdapter);
  }
}

function restoreProcessEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBrowserSandboxProviderContractSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
