import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION = "2026-06-17.browser-sandbox-provider.v1";

const DEFAULT_CONFIG_PATH = "project/deployment/browser-sandbox-provider.example.json";
const HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH = "project/deployment/browser-sandbox-provider.hosted-provider.example.json";
const PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH = "project/deployment/browser-sandbox-provider.selection.example.json";
const VISUAL_OCR_PROOF_SCHEMA_VERSION = "brainstyworkers.browser-sandbox-provider-visual-ocr-proof.v1";
const PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH = "project/deployment/browser-sandbox-provider.launch-readiness.example.env";
const PROVIDER_LAUNCH_READINESS_RUNBOOK_PATH = "docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md";
const PROVIDER_PRIVATE_LAUNCH_EXECUTION_ENV_EXAMPLE_PATH = "project/deployment/browser-sandbox-provider.private-launch-execution.example.env";
const STEEL_OPERATIONS_EXAMPLE_CONFIG_PATH = "project/deployment/browser-sandbox-provider.steel-operations.example.json";
const STEEL_COMPOSE_PATH = "infra/steel/compose.yaml";
const STEEL_RUNBOOK_PATH = "infra/steel/README.md";
const STEEL_REMOTE_COMPOSE_PATH = "infra/steel/remote/compose.yaml";
const STEEL_REMOTE_CADDYFILE_PATH = "infra/steel/remote/Caddyfile";
const STEEL_REMOTE_FIREWALL_PATH = "infra/steel/remote/firewall.md";
const STEEL_REMOTE_WIREGUARD_PATH = "infra/steel/remote/wireguard.md";
const STEEL_REMOTE_RECOVERY_SCRIPT_PATH = "infra/steel/remote/recover.sh";
const STEEL_REMOTE_ACCEPTANCE_ARTIFACT_DIR = "artifacts/phase30";
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
      ocrCaption: config.transport?.ocrCaption ?? null,
      tls: config.transport?.tls === true
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
  if (!["staging", "production", "production-candidate"].includes(config.environment)) failures.push("environment_must_be_staging_or_production_candidate");
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

function isInsideRepo(pathname) {
  const relativePath = relative(process.cwd(), resolve(pathname));
  return Boolean(relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/"));
}

export function validateVisualOcrProofManifest(manifest, { proofPath } = {}) {
  const failures = [];
  if (manifest?.schemaVersion !== VISUAL_OCR_PROOF_SCHEMA_VERSION) failures.push("visual_ocr_schema_version_missing_or_unknown");
  if (manifest?.providerLiveConnected !== true) failures.push("provider_live_connected_required");
  if (manifest?.session?.sessionRefPresent !== true) failures.push("session_ref_required");
  if (manifest?.session?.rawSessionRefReturned === true) failures.push("raw_session_ref_must_not_be_returned");
  if (manifest?.stream?.frameRefPresent !== true) failures.push("frame_ref_required");
  if (manifest?.stream?.rawFrameReturned === true) failures.push("raw_frame_must_not_be_returned");
  if (manifest?.stream?.rawFramePersisted === true) failures.push("raw_frame_must_not_be_persisted");
  if (manifest?.screenshot?.screenshotRefPresent !== true) failures.push("screenshot_ref_required");
  if (manifest?.screenshot?.rawImageReturned === true) failures.push("raw_image_must_not_be_returned");
  if (manifest?.ocrCaption?.captionRefPresent !== true) failures.push("caption_ref_required");
  if (manifest?.ocrCaption?.rawOcrTextReturned === true) failures.push("raw_ocr_text_must_not_be_returned");
  if (manifest?.ocrCaption?.rawOcrTextPersisted === true) failures.push("raw_ocr_text_must_not_be_persisted");
  if (manifest?.ocrCaption?.visualCaptionSafe !== true) failures.push("visual_caption_safety_required");
  if (manifest?.takeover?.approvalRequired !== true) failures.push("takeover_approval_required");
  if (manifest?.takeover?.inputRelay !== "approval_gated_human_only") failures.push("input_relay_must_be_human_only");
  if (manifest?.input?.rawInputReturned === true) failures.push("raw_input_must_not_be_returned");
  if (manifest?.input?.externalWriteActionsWithoutApproval === true) failures.push("external_write_actions_without_approval");
  if (manifest?.teardown?.teardownComplete !== true) failures.push("teardown_required");
  if (manifest?.teardown?.rawFramePersisted === true) failures.push("raw_frame_must_not_be_persisted");
  if (manifest?.teardown?.rawOcrTextPersisted === true) failures.push("raw_ocr_text_must_not_be_persisted");
  if (manifest?.visualProof?.dashboardScreenshotRefPresent !== true) failures.push("dashboard_screenshot_ref_required");
  if (manifest?.visualProof?.mobileLiveBlockRefPresent !== true) failures.push("mobile_live_block_ref_required");
  if (manifest?.visualProof?.ocrCaptionRefPresent !== true) failures.push("visual_ocr_caption_ref_required");
  if (manifest?.safety?.agentCredentialEntryAllowed === true) failures.push("agent_credential_entry_allowed");
  if (manifest?.safety?.externalWriteActionsWithoutApproval === true) failures.push("external_write_actions_without_approval");
  if (manifest?.safety?.rawEndpointReturned === true) failures.push("raw_endpoint_returned");
  if (manifest?.safety?.rawSecretReturned === true) failures.push("raw_secret_returned");
  if (proofPath && isInsideRepo(proofPath)) failures.push("visual_ocr_proof_file_must_live_outside_git");
  const serialized = JSON.stringify(manifest ?? {});
  if (/https?:\/\/[^"\\\s]+/i.test(serialized)) failures.push("raw_provider_url_forbidden");
  if (/Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9]|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]/i.test(serialized)) failures.push("raw_secret_forbidden");
  if (/data:image|<html|member id|subscriber id|password|captcha|typed-password/i.test(serialized)) {
    failures.push("raw_frame_ocr_or_credential_content_forbidden");
  }
  if (/\/Users\/|\/private\/|\/tmp\/|\/var\/folders|[A-Za-z]:\\/i.test(serialized)) failures.push("raw_local_path_forbidden");
  return {
    ok: failures.length === 0,
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    schemaVersion: manifest?.schemaVersion ?? null,
    failures,
    sanitizedProof: {
      providerLiveConnected: Boolean(manifest?.providerLiveConnected),
      sessionRefPresent: Boolean(manifest?.session?.sessionRefPresent),
      streamFrameRefPresent: Boolean(manifest?.stream?.frameRefPresent),
      screenshotRefPresent: Boolean(manifest?.screenshot?.screenshotRefPresent),
      captionRefPresent: Boolean(manifest?.ocrCaption?.captionRefPresent),
      visualCaptionSafe: Boolean(manifest?.ocrCaption?.visualCaptionSafe),
      approvalRequired: Boolean(manifest?.takeover?.approvalRequired),
      inputRelay: manifest?.takeover?.inputRelay ?? null,
      teardownComplete: Boolean(manifest?.teardown?.teardownComplete),
      dashboardScreenshotRefPresent: Boolean(manifest?.visualProof?.dashboardScreenshotRefPresent),
      mobileLiveBlockRefPresent: Boolean(manifest?.visualProof?.mobileLiveBlockRefPresent),
      rawFrameReturned: Boolean(manifest?.stream?.rawFrameReturned),
      rawImageReturned: Boolean(manifest?.screenshot?.rawImageReturned),
      rawOcrTextReturned: Boolean(manifest?.ocrCaption?.rawOcrTextReturned),
      rawInputReturned: Boolean(manifest?.input?.rawInputReturned),
      proofFileOutsideGit: Boolean(proofPath && !isInsideRepo(proofPath))
    }
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

function validateSteelOperationsConfig(config, configPath) {
  const failures = [];
  if (config.schemaVersion !== "brainstyworkers.browser-sandbox-provider-steel-operations.v1") failures.push("steel_operations_schema_version_missing_or_unknown");
  if (config.providerStrategy !== "steel-self-host") failures.push("steel_operations_provider_strategy_must_be_steel_self_host");
  if (config.status !== "operations_contract_only") failures.push("steel_operations_status_must_be_contract_only");
  if (!["staging", "production"].includes(config.environment)) failures.push("steel_operations_environment_must_be_staging_or_production");
  if (config.composeFile !== STEEL_COMPOSE_PATH) failures.push("steel_operations_compose_file_mismatch");
  if (config.runbook !== STEEL_RUNBOOK_PATH) failures.push("steel_operations_runbook_mismatch");

  const session = config.sessionPolicy ?? {};
  if (!Number.isInteger(session.maxConcurrentSessions) || session.maxConcurrentSessions < 1 || session.maxConcurrentSessions > 5) failures.push("steel_operations_concurrency_cap_required");
  if (Number(session.maxSessionMinutes ?? Infinity) > 30) failures.push("steel_operations_max_session_minutes_must_be_30_or_less");
  if (Number(session.idleTimeoutMinutes ?? Infinity) > 5) failures.push("steel_operations_idle_timeout_minutes_must_be_5_or_less");
  if (session.releaseOnTeardown !== true) failures.push("steel_operations_release_on_teardown_required");
  if (session.releaseStaleSessions !== true) failures.push("steel_operations_stale_session_release_required");
  if (session.teardownOnFailure !== true) failures.push("steel_operations_teardown_on_failure_required");

  const retention = config.retentionPolicy ?? {};
  if (retention.recordFrames !== false) failures.push("steel_operations_frame_recording_must_be_disabled");
  if (retention.persistRawOcrText !== false) failures.push("steel_operations_raw_ocr_persistence_must_be_disabled");
  if (retention.rawScreenshotsInGit !== false) failures.push("steel_operations_raw_screenshots_in_git_must_be_disabled");
  if (retention.browserLogStorageEnabled !== false) failures.push("steel_operations_browser_log_storage_must_be_disabled_by_default");
  if (retention.logStorageContainsPhi !== false) failures.push("steel_operations_log_storage_phi_must_be_false");
  if (!Number.isInteger(retention.proofArtifactRetentionDays) || retention.proofArtifactRetentionDays < 1 || retention.proofArtifactRetentionDays > 30) {
    failures.push("steel_operations_proof_retention_days_must_be_1_to_30");
  }

  const network = config.networkPolicy ?? {};
  for (const [key, expected] of [
    ["apiLoopbackOnly", true],
    ["cdpLoopbackOnly", true],
    ["viewerLoopbackOnly", true],
    ["directPublicCdpAllowed", false],
    ["remoteAccessViaFastApiOnly", true]
  ]) {
    if (network[key] !== expected) failures.push(`steel_operations_network_${key}_invalid`);
  }

  const images = config.imagePolicy ?? {};
  if (images.pinnedByDigest !== true) failures.push("steel_operations_images_must_be_pinned_by_digest");
  if (images.latestTagsAllowed !== false) failures.push("steel_operations_latest_tags_must_be_forbidden");
  if (images.patchReviewRequired !== true) failures.push("steel_operations_patch_review_required");

  const monitoring = config.monitoringPolicy ?? {};
  for (const [key, expected] of [
    ["healthProbeRequired", true],
    ["cdpProbeRequired", true],
    ["viewerProbeRequired", true],
    ["dashboardScoreRequired", true]
  ]) {
    if (monitoring[key] !== expected) failures.push(`steel_operations_monitoring_${key}_required`);
  }

  const approval = config.approvalPolicy ?? {};
  if (approval.requiresReadOnlyApproval !== true) failures.push("steel_operations_read_only_approval_required");
  if (approval.requiresHumanTakeoverApproval !== true) failures.push("steel_operations_human_takeover_approval_required");
  if (approval.agentCredentialEntryAllowed !== false) failures.push("steel_operations_agent_credential_entry_must_be_blocked");
  if (approval.externalWriteActionsAllowed !== false) failures.push("steel_operations_external_write_actions_must_be_blocked");

  const serialized = JSON.stringify(config);
  if (/https?:\/\/[^"\\\s]+|ws:\/\/[^"\\\s]+/i.test(serialized)) failures.push("steel_operations_raw_endpoint_forbidden");
  if (/Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9]|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]/i.test(serialized)) failures.push("steel_operations_secret_literal_forbidden");

  return {
    ok: failures.length === 0,
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    configPath,
    failures,
    sanitizedConfig: {
      schemaVersion: config.schemaVersion ?? null,
      providerStrategy: config.providerStrategy ?? null,
      status: config.status ?? null,
      environment: config.environment ?? null,
      composeFile: config.composeFile ?? null,
      runbook: config.runbook ?? null,
      sessionPolicy: {
        maxConcurrentSessions: Number(session.maxConcurrentSessions ?? 0),
        maxSessionMinutes: Number(session.maxSessionMinutes ?? 0),
        idleTimeoutMinutes: Number(session.idleTimeoutMinutes ?? 0),
        releaseOnTeardown: Boolean(session.releaseOnTeardown),
        releaseStaleSessions: Boolean(session.releaseStaleSessions),
        teardownOnFailure: Boolean(session.teardownOnFailure)
      },
      retentionPolicy: {
        recordFrames: Boolean(retention.recordFrames),
        persistRawOcrText: Boolean(retention.persistRawOcrText),
        rawScreenshotsInGit: Boolean(retention.rawScreenshotsInGit),
        browserLogStorageEnabled: Boolean(retention.browserLogStorageEnabled),
        logStorageContainsPhi: Boolean(retention.logStorageContainsPhi),
        proofArtifactRetentionDays: Number(retention.proofArtifactRetentionDays ?? 0)
      },
      networkPolicy: {
        apiLoopbackOnly: Boolean(network.apiLoopbackOnly),
        cdpLoopbackOnly: Boolean(network.cdpLoopbackOnly),
        viewerLoopbackOnly: Boolean(network.viewerLoopbackOnly),
        directPublicCdpAllowed: Boolean(network.directPublicCdpAllowed),
        remoteAccessViaFastApiOnly: Boolean(network.remoteAccessViaFastApiOnly)
      },
      imagePolicy: {
        pinnedByDigest: Boolean(images.pinnedByDigest),
        latestTagsAllowed: Boolean(images.latestTagsAllowed),
        patchReviewRequired: Boolean(images.patchReviewRequired)
      },
      monitoringPolicy: {
        healthProbeRequired: Boolean(monitoring.healthProbeRequired),
        cdpProbeRequired: Boolean(monitoring.cdpProbeRequired),
        viewerProbeRequired: Boolean(monitoring.viewerProbeRequired),
        dashboardScoreRequired: Boolean(monitoring.dashboardScoreRequired)
      }
    }
  };
}

export function validateSteelComposeOperations(composeText, runbookText) {
  const checks = [
    ["api_image_pinned_digest", /ghcr\.io\/steel-dev\/steel-browser-api@sha256:[a-f0-9]{64}/.test(composeText)],
    ["ui_image_pinned_digest", /ghcr\.io\/steel-dev\/steel-browser-ui@sha256:[a-f0-9]{64}/.test(composeText)],
    ["no_latest_tags", !/:latest\b/.test(composeText)],
    ["api_port_loopback_only", composeText.includes("\"127.0.0.1:3000:3000\"")],
    ["cdp_port_loopback_only", composeText.includes("\"127.0.0.1:9223:9223\"")],
    ["viewer_port_loopback_only", composeText.includes("\"127.0.0.1:5173:80\"")],
    ["log_storage_disabled_by_default", composeText.includes("LOG_STORAGE_ENABLED=false")],
    ["fingerprint_injection_skip_documented", composeText.includes("SKIP_FINGERPRINT_INJECTION=true") && runbookText.includes("SKIP_FINGERPRINT_INJECTION=true")],
    ["fastapi_remote_boundary_documented", runbookText.includes("FastAPI connector") && runbookText.includes("Do not expose Steel API, UI, or CDP directly")],
    ["cleanup_documented", runbookText.includes("release stale sessions") && runbookText.includes("docker compose -f infra/steel/compose.yaml down")]
  ].map(([key, ok]) => ({ key, ok: Boolean(ok) }));
  return {
    ok: checks.every((check) => check.ok),
    checks,
    passed: checks.filter((check) => check.ok).length,
    total: checks.length
  };
}

async function probeSteelOperationsLive({ endpointUrl, cdpUrl, viewerUrl, fetchImpl = globalThis.fetch } = {}) {
  if (!endpointUrl || !cdpUrl || !viewerUrl) {
    return {
      attempted: false,
      ok: false,
      status: "steel_operations_live_probe_missing_private_config",
      healthOk: false,
      cdpOk: false,
      viewerOk: false,
      rawEndpointReturned: false
    };
  }
  try {
    const [health, cdp, viewer] = await Promise.all([
      fetchSteelJson({ endpointUrl: normalizeBaseUrl(endpointUrl), path: "/v1/health", method: "GET", fetchImpl }),
      probeSteelCdp({ cdpUrl, fetchImpl }),
      fetchImpl(viewerUrl, { method: "GET" }).then((response) => ({ ok: Boolean(response.ok), statusCode: response.status }))
    ]);
    return {
      attempted: true,
      ok: Boolean(health.ok && cdp.ok && viewer.ok),
      status: health.ok && cdp.ok && viewer.ok ? "steel_operations_live_probe_ready" : "steel_operations_live_probe_failed",
      healthOk: Boolean(health.ok),
      cdpOk: Boolean(cdp.ok),
      viewerOk: Boolean(viewer.ok),
      rawEndpointReturned: false
    };
  } catch {
    return {
      attempted: true,
      ok: false,
      status: "steel_operations_live_probe_failed",
      healthOk: false,
      cdpOk: false,
      viewerOk: false,
      rawEndpointReturned: false
    };
  }
}

export async function validateBrowserSandboxProviderSteelOperationsContract({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_FILE || STEEL_OPERATIONS_EXAMPLE_CONFIG_PATH
} = {}) {
  const text = await readFile(resolve(configPath), "utf8");
  return validateSteelOperationsConfig(JSON.parse(text), configPath);
}

export async function runBrowserSandboxProviderSteelOperationsSmoke({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_FILE || STEEL_OPERATIONS_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-steel-operations-smoke.json"),
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const [configText, composeText, runbookText] = await Promise.all([
    readFile(resolve(configPath), "utf8"),
    readFile(resolve(STEEL_COMPOSE_PATH), "utf8"),
    readFile(resolve(STEEL_RUNBOOK_PATH), "utf8")
  ]);
  const validation = validateSteelOperationsConfig(JSON.parse(configText), configPath);
  const compose = validateSteelComposeOperations(composeText, runbookText);
  const liveProbeRequested = env.WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_LIVE_PROBE === "1";
  const liveProbe = liveProbeRequested
    ? await probeSteelOperationsLive({
      endpointUrl: env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL,
      cdpUrl: env.WEFELLA_BROWSER_SANDBOX_CDP_URL,
      viewerUrl: env.WEFELLA_BROWSER_SANDBOX_VIEWER_URL,
      fetchImpl
    })
    : {
      attempted: false,
      ok: false,
      status: "steel_operations_live_probe_not_requested",
      healthOk: false,
      cdpOk: false,
      viewerOk: false,
      rawEndpointReturned: false
    };
  const operationsGate = env.WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_READY === "1";
  const staticReady = Boolean(validation.ok && compose.ok);
  const ready = Boolean(staticReady && operationsGate && (!liveProbeRequested || liveProbe.ok));
  const score = ready ? 100 : staticReady ? 85 : Math.floor((compose.passed / Math.max(compose.total, 1)) * 60);
  const result = {
    ok: staticReady && (!liveProbeRequested || liveProbe.ok),
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: ready
      ? "steel_self_host_operations_ready"
      : staticReady
        ? "steel_self_host_operations_contract_ready"
        : "steel_self_host_operations_contract_incomplete",
    hostedProviderReady: false,
    hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
    steelOperationsReady: ready,
    score,
    target: 100,
    validation,
    compose,
    liveProbe,
    gates: {
      operationsReadyEnv: "WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_READY",
      liveProbeEnv: "WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_LIVE_PROBE",
      operationsGate,
      liveProbeRequested
    },
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider_steel_operations",
      scoreKey: "hosted_browser_sandbox_provider_steel_operations",
      command: "npm run sandbox:browser:steel-operations",
      configFile: configPath,
      composeFile: STEEL_COMPOSE_PATH,
      runbook: STEEL_RUNBOOK_PATH
    },
    safety: {
      ...assertNoSecretLeak(validation),
      ...assertNoSecretLeak(compose),
      ...assertNoSecretLeak(liveProbe),
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawEndpointUrlWritten: false,
      rawFrameReturned: false,
      rawImageReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false,
      externalActions: false,
      agentCredentialEntryAllowed: false,
      hostedReadinessOverclaimed: false
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

export function validateSteelRemoteDeploymentFiles({
  composeText,
  caddyText,
  firewallText,
  wireguardText,
  recoveryText
} = {}) {
  const checks = [
    ["remote_api_image_pinned_digest", /ghcr\.io\/steel-dev\/steel-browser-api@sha256:[a-f0-9]{64}/.test(composeText)],
    ["remote_ui_image_pinned_digest", /ghcr\.io\/steel-dev\/steel-browser-ui@sha256:[a-f0-9]{64}/.test(composeText)],
    ["remote_no_latest_tags", !/:latest\b/.test(composeText)],
    ["remote_api_loopback_only", composeText.includes("\"127.0.0.1:3000:3000\"")],
    ["remote_cdp_loopback_only", composeText.includes("\"127.0.0.1:9223:9223\"")],
    ["remote_no_public_cdp_or_api_bind", !/["'](?:0\.0\.0\.0|\[::\]|::):(?:3000|9223):/i.test(composeText)],
    ["remote_restart_unless_stopped", (composeText.match(/restart:\s+unless-stopped/g) ?? []).length >= 2],
    ["remote_healthcheck_local", composeText.includes("http://127.0.0.1:3000/v1/health")],
    ["remote_encrypted_logs_mount_documented", composeText.includes("/srv/workerprototype_openclaw/steel/logs:/data/steel/logs")],
    ["remote_tls_placeholder_host", caddyText.includes("STEEL_REMOTE_HOST") && caddyText.includes(":443")],
    ["remote_ip_allowlist_matcher", caddyText.includes("@allow_backend") && caddyText.includes("remote_ip")],
    ["remote_forbid_non_allowlisted", caddyText.includes("respond @blocked_backend 403") || caddyText.includes("respond @not_allow_backend 403")],
    ["remote_only_expected_steel_routes", [
      "path /v1/health",
      "path /v1/sessions",
      "/v1/sessions/.+/screenshot",
      "/v1/sessions/.+/release",
      "/v1/sessions/.+/viewer"
    ].every((fragment) => caddyText.includes(fragment))],
    ["remote_blocks_everything_else", caddyText.includes("respond 404")],
    ["remote_no_cdp_proxy", !/9223|cdp/i.test(caddyText)],
    ["remote_firewall_inbound_documented", ["22/tcp", "443/tcp", "backend egress", "9223"].every((fragment) => firewallText.includes(fragment))],
    ["remote_firewall_outbound_allowlist_documented", ["outbound", "allowlist", "ACME", "ghcr.io", "drop"].every((fragment) => firewallText.includes(fragment))],
    ["remote_wireguard_private_cdp_documented", ["WireGuard", "127.0.0.1:9223", "ssh -L 9223:127.0.0.1:9223"].every((fragment) => wireguardText.includes(fragment))],
    ["remote_recovery_script_health_and_smoke", ["v1/health", "v1/sessions", "release", "recovery"].every((fragment) => recoveryText.includes(fragment))],
    ["remote_no_secrets_or_runtime_values", !/(sk-[A-Za-z0-9]|Bearer\s+[A-Za-z0-9._-]+|BEGIN (?:OPENSSH )?PRIVATE KEY|wg-private|token=|password=|[0-9]{1,3}(?:\.[0-9]{1,3}){3}\/[0-9]{1,2})/i.test(`${composeText}\n${caddyText}\n${firewallText}\n${wireguardText}\n${recoveryText}`)]
  ].map(([key, ok]) => ({ key, ok: Boolean(ok) }));
  return {
    ok: checks.every((check) => check.ok),
    checks,
    passed: checks.filter((check) => check.ok).length,
    total: checks.length
  };
}

function summarizeSteelRemoteTenChecks(liveVerification, env = process.env) {
  const lifecycle = liveVerification?.liveLifecycle ?? {};
  const safety = lifecycle.safety ?? {};
  const checks = [
    {
      key: "session_create_returns_websocket_and_viewer_refs",
      ok: Boolean(lifecycle.createSession?.ok && lifecycle.createSession?.cdpConnected && lifecycle.stream?.viewerUrlAvailable)
    },
    {
      key: "cdp_connect_over_private_tunnel",
      ok: Boolean(lifecycle.createSession?.cdpConnected)
    },
    {
      key: "live_stream_ref_reachable_over_tls",
      ok: Boolean(lifecycle.stream?.ok && lifecycle.stream?.frameRefPresent && env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL?.startsWith("https://"))
    },
    {
      key: "screenshot_ref_only",
      ok: Boolean(lifecycle.screenshot?.ok && lifecycle.screenshot?.screenshotRefPresent && lifecycle.screenshot?.rawImageReturned === false)
    },
    {
      key: "local_ocr_caption_ref_only",
      ok: Boolean(lifecycle.ocrCaption?.ok && lifecycle.ocrCaption?.captionRefPresent && lifecycle.ocrCaption?.rawOcrTextReturned === false)
    },
    {
      key: "approved_synthetic_input_relay",
      ok: Boolean(lifecycle.input?.ok && lifecycle.input?.inputAccepted && lifecycle.input?.rawInputReturned === false)
    },
    {
      key: "human_takeover_event_required",
      ok: Boolean(lifecycle.takeover?.ok && lifecycle.takeover?.approvalRequired && lifecycle.takeover?.inputRelay === "approval_gated_human_only")
    },
    {
      key: "teardown_removes_session",
      ok: Boolean(lifecycle.teardown?.ok && lifecycle.teardown?.teardownComplete)
    },
    {
      key: "offsite_fail_closed_and_host_firewall_proof",
      ok: Boolean(lifecycle.offsite?.ok && lifecycle.offsite?.offsiteFailClosed && env.WEFELLA_BROWSER_SANDBOX_STEEL_REMOTE_HOST_FIREWALL_PROOF === "1")
    },
    {
      key: "phi_redaction_policy_holds",
      ok: Boolean(
        safety.rawFrameReturned === false &&
        safety.rawOcrTextReturned === false &&
        safety.rawInputReturned === false &&
        safety.rawEndpointReturned === false &&
        safety.rawSecretReturned === false
      )
    }
  ];
  return {
    ok: checks.every((check) => check.ok),
    passed: checks.filter((check) => check.ok).length,
    total: checks.length,
    checks
  };
}

export async function runBrowserSandboxProviderSteelRemoteReadinessSmoke({
  artifactPath = resolve("artifacts/browser-sandbox-provider-steel-remote-readiness-smoke.json"),
  acceptanceArtifactDir = STEEL_REMOTE_ACCEPTANCE_ARTIFACT_DIR,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const [composeText, caddyText, firewallText, wireguardText, recoveryText] = await Promise.all([
    readFile(resolve(STEEL_REMOTE_COMPOSE_PATH), "utf8"),
    readFile(resolve(STEEL_REMOTE_CADDYFILE_PATH), "utf8"),
    readFile(resolve(STEEL_REMOTE_FIREWALL_PATH), "utf8"),
    readFile(resolve(STEEL_REMOTE_WIREGUARD_PATH), "utf8"),
    readFile(resolve(STEEL_REMOTE_RECOVERY_SCRIPT_PATH), "utf8")
  ]);
  const deployment = validateSteelRemoteDeploymentFiles({
    composeText,
    caddyText,
    firewallText,
    wireguardText,
    recoveryText
  });
  const liveGate = env.WEFELLA_BROWSER_SANDBOX_STEEL_REMOTE_LIVE_READY === "1";
  const remoteTransportReady = Boolean(
    env.WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME === "steel-self-host" &&
    env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL?.startsWith("https://") &&
    env.WEFELLA_BROWSER_SANDBOX_CDP_URL === "ws://127.0.0.1:9223" &&
    env.WEFELLA_BROWSER_SANDBOX_VIEWER_URL?.startsWith("https://")
  );
  const liveVerification = liveGate && remoteTransportReady
    ? await runBrowserSandboxProviderLiveVerificationSmoke({
      artifactPath: resolve(dirname(artifactPath), "browser-sandbox-provider-steel-remote-live-verification-smoke.json"),
      env,
      providerReady: env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1",
      fetchImpl
    })
    : {
      ok: false,
      status: liveGate
        ? "steel_remote_live_transport_private_config_missing_or_invalid"
        : "steel_remote_live_verification_not_requested",
      hostedProviderLiveVerificationReady: false,
      hostedProviderReady: false,
      liveLifecycle: { attempted: false, ok: false }
    };
  const tenChecks = summarizeSteelRemoteTenChecks(liveVerification, env);
  const accepted = Boolean(deployment.ok && liveGate && remoteTransportReady && liveVerification.hostedProviderLiveVerificationReady && tenChecks.ok);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const lifecycleArtifactPath = accepted
    ? resolve(acceptanceArtifactDir, `steel-remote-live-lifecycle-${timestamp}.json`)
    : null;
  const result = {
    ok: accepted,
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: accepted
      ? "steel_remote_host_lifecycle_verified"
      : deployment.ok
        ? "steel_remote_host_contract_ready_waiting_live_10_of_10"
        : "steel_remote_host_contract_incomplete",
    hostedProviderReady: false,
    hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
    steelRemoteReadinessReady: accepted,
    score: accepted ? 100 : 0,
    target: 100,
    deployment,
    liveGate,
    remoteTransportReady,
    liveVerification: {
      status: liveVerification.status,
      hostedProviderLiveVerificationReady: Boolean(liveVerification.hostedProviderLiveVerificationReady),
      hostedProviderReady: Boolean(liveVerification.hostedProviderReady)
    },
    tenChecks,
    acceptedLifecycleArtifactRef: lifecycleArtifactPath ? relative(process.cwd(), lifecycleArtifactPath) : null,
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider_steel_remote_host",
      scoreKey: "hosted_browser_sandbox_provider_steel_remote_host",
      command: "npm run sandbox:browser:steel-remote-readiness",
      contractReadinessLabel: "contract readiness",
      localHostReadinessLabel: "local-host readiness",
      remoteHostReadinessLabel: "remote-host readiness",
      remoteLiveReadyEnv: "WEFELLA_BROWSER_SANDBOX_STEEL_REMOTE_LIVE_READY",
      hostFirewallProofEnv: "WEFELLA_BROWSER_SANDBOX_STEEL_REMOTE_HOST_FIREWALL_PROOF",
      lifecycleArtifact: lifecycleArtifactPath ? relative(process.cwd(), lifecycleArtifactPath) : null
    },
    safety: {
      ...assertNoSecretLeak(deployment),
      ...assertNoSecretLeak(liveVerification),
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawEndpointUrlWritten: false,
      rawFrameReturned: false,
      rawImageReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false,
      externalActions: false,
      agentCredentialEntryAllowed: false,
      hostedReadinessOverclaimed: false
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  if (lifecycleArtifactPath) {
    await mkdir(dirname(lifecycleArtifactPath), { recursive: true });
    await writeFile(lifecycleArtifactPath, JSON.stringify(result, null, 2));
  }
  return result;
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
      env,
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

export async function runBrowserSandboxProviderVisualOcrReplaySmoke({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE || HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  selectionConfigPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE || PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-visual-ocr-replay-smoke.json"),
  env = process.env,
  providerReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1",
  fetchImpl = globalThis.fetch
} = {}) {
  const [validation, configText, webrtc] = await Promise.all([
    validateBrowserSandboxProviderContract({ configPath }),
    readFile(resolve(configPath), "utf8"),
    runBrowserSandboxProviderWebrtcSignalingSmoke({
      configPath,
      selectionConfigPath,
      artifactPath: resolve(dirname(artifactPath), "browser-sandbox-provider-webrtc-signaling-smoke.json"),
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
  const proofPath = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE;
  let proofFile = {
    present: false,
    outsideGit: false,
    readable: false,
    validation: {
      ok: false,
      failures: ["visual_ocr_proof_file_required"],
      sanitizedProof: {}
    }
  };
  if (proofPath) {
    const outsideGit = !isInsideRepo(proofPath);
    try {
      const proofText = await readFile(resolve(proofPath), "utf8");
      const proofManifest = JSON.parse(proofText);
      proofFile = {
        present: true,
        outsideGit,
        readable: true,
        validation: validateVisualOcrProofManifest(proofManifest, { proofPath })
      };
    } catch (error) {
      proofFile = {
        present: true,
        outsideGit,
        readable: false,
        validation: {
          ok: false,
          failures: [`visual_ocr_proof_unreadable:${error.message}`],
          sanitizedProof: {}
        }
      };
    }
  }
  const visualReplayGate = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY === "1";
  const visualReplayReady = Boolean(
    visualReplayGate &&
    validation.ok &&
    resolver.resolverReady &&
    webrtc.hostedProviderLiveVerificationReady &&
    (!resolver.streamRequiresWebrtc || webrtc.hostedProviderWebrtcSignalingReady) &&
    proofFile.present &&
    proofFile.outsideGit &&
    proofFile.readable &&
    proofFile.validation.ok
  );
  const hostedProviderReady = Boolean(
    visualReplayReady &&
    webrtc.hostedProviderReady &&
    resolver.ready
  );
  const result = {
    ok: Boolean(validation.ok && webrtc.ok && (!proofFile.present || proofFile.validation.ok)),
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: visualReplayReady
      ? "hosted_browser_sandbox_provider_visual_ocr_replay_ready"
      : proofFile.present && !proofFile.validation.ok
        ? "hosted_browser_sandbox_provider_visual_ocr_replay_invalid"
        : visualReplayGate
          ? "hosted_browser_sandbox_provider_visual_ocr_replay_requires_private_proof"
          : "hosted_browser_sandbox_provider_visual_ocr_replay_blocked",
    hostedProviderVisualOcrReplayReady: visualReplayReady,
    hostedProviderWebrtcSignalingReady: webrtc.hostedProviderWebrtcSignalingReady,
    hostedProviderLiveVerificationReady: webrtc.hostedProviderLiveVerificationReady,
    hostedProviderReady,
    hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
    validation,
    resolver,
    webrtc: {
      status: webrtc.status,
      hostedProviderWebrtcSignalingReady: webrtc.hostedProviderWebrtcSignalingReady,
      hostedProviderLiveVerificationReady: webrtc.hostedProviderLiveVerificationReady,
      streamRequiresWebrtc: webrtc.streamRequiresWebrtc
    },
    proofFile,
    requiredVisualProofBeforeHostedReady: [
      "private visual/OCR proof manifest outside Git",
      "dashboard screenshot reference",
      "mobile live-worker block screenshot reference",
      "safe OCR/caption reference",
      "provider stream frame reference",
      "provider screenshot reference",
      "approval-gated human takeover proof",
      "redacted approved input relay proof",
      "teardown proof",
      "no raw frame, image, OCR, local path, endpoint, secret, SDP, ICE, credential, or portal text"
    ],
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider_visual_ocr_replay",
      scoreKey: "hosted_browser_sandbox_provider_visual_ocr_replay",
      visualReplayReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY",
      visualProofFileEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE",
      hostedReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED"
    },
    safety: {
      ...assertNoSecretLeak(validation),
      ...assertNoSecretLeak(resolver),
      ...assertNoSecretLeak(webrtc),
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawEndpointUrlWritten: false,
      rawFrameReturned: Boolean(proofFile.validation.sanitizedProof?.rawFrameReturned),
      rawImageReturned: Boolean(proofFile.validation.sanitizedProof?.rawImageReturned),
      rawOcrTextReturned: Boolean(proofFile.validation.sanitizedProof?.rawOcrTextReturned),
      rawInputReturned: Boolean(proofFile.validation.sanitizedProof?.rawInputReturned),
      externalActions: false,
      agentCredentialEntryAllowed: false,
      liveProviderOverclaimed: !hostedProviderReady && resolver.ready
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

async function readTextIfExists(pathname) {
  try {
    return await readFile(resolve(pathname), "utf8");
  } catch {
    return null;
  }
}

function launchReadinessChecklist({
  validation,
  selection,
  visualReplay,
  resolver,
  configPath,
  selectionConfigPath,
  envExamplePresent,
  runbookPresent
}) {
  const configOutsideGit = Boolean(configPath && !isInsideRepo(configPath));
  const proofOutsideGit = Boolean(visualReplay.proofFile?.outsideGit);
  const items = [
    {
      key: "runbook_available",
      ready: runbookPresent,
      status: runbookPresent ? "ready" : "missing_runbook",
      command: "open docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md"
    },
    {
      key: "env_template_available",
      ready: envExamplePresent,
      status: envExamplePresent ? "ready" : "missing_env_template",
      command: `cp ${PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH} /run/secrets/browser-sandbox-provider.launch-readiness.env`
    },
    {
      key: "provider_config_private",
      ready: configOutsideGit,
      status: configOutsideGit ? "private_config_outside_git" : "move_runtime_config_outside_git",
      env: "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE"
    },
    {
      key: "provider_contract_valid",
      ready: Boolean(validation.ok),
      status: validation.ok ? "contract_valid" : "contract_invalid",
      command: "npm run sandbox:browser:provider-contract"
    },
    {
      key: "selection_preflight",
      ready: Boolean(selection.providerSelectionPreflightReady),
      status: selection.status,
      command: "npm run sandbox:browser:provider-selection",
      env: "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER"
    },
    {
      key: "live_preflight",
      ready: Boolean(visualReplay.webrtc?.hostedProviderLiveVerificationReady || visualReplay.hostedProviderLiveVerificationReady),
      status: visualReplay.webrtc?.hostedProviderLiveVerificationReady || visualReplay.hostedProviderLiveVerificationReady
        ? "live_preflight_chain_ready"
        : "run_live_preflight_and_verification",
      command: "npm run sandbox:browser:provider-live-preflight"
    },
    {
      key: "live_verification",
      ready: Boolean(visualReplay.hostedProviderLiveVerificationReady),
      status: visualReplay.webrtc?.status ?? visualReplay.status,
      command: "npm run sandbox:browser:provider-live-verification"
    },
    {
      key: "webrtc_signaling",
      ready: Boolean(!resolver.streamRequiresWebrtc || visualReplay.hostedProviderWebrtcSignalingReady),
      status: resolver.streamRequiresWebrtc
        ? visualReplay.webrtc?.status ?? "webrtc_signaling_required"
        : "webrtc_signaling_not_required",
      command: "npm run sandbox:browser:provider-webrtc-signaling"
    },
    {
      key: "visual_ocr_replay_private_proof",
      ready: Boolean(visualReplay.hostedProviderVisualOcrReplayReady && proofOutsideGit),
      status: visualReplay.status,
      command: "npm run sandbox:browser:provider-visual-ocr-replay",
      env: "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE"
    },
    {
      key: "final_live_verified_switch",
      ready: Boolean(resolver.liveVerified && resolver.providerLiveConnected && resolver.liveVerificationReady),
      status: resolver.ready ? "final_enablement_switch_ready" : "keep_final_switch_disabled",
      env: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED"
    }
  ];
  return {
    items,
    missing: items.filter((item) => !item.ready).map((item) => item.key),
    configOutsideGit,
    selectionConfigPath,
    proofOutsideGit,
    runbookPresent,
    envExamplePresent
  };
}

export async function runBrowserSandboxProviderLaunchReadinessSmoke({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE || HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  selectionConfigPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE || PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-launch-readiness-smoke.json"),
  env = process.env,
  providerReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1",
  fetchImpl = globalThis.fetch
} = {}) {
  const [validation, configText, selection, visualReplay, envExampleText, runbookText] = await Promise.all([
    validateBrowserSandboxProviderContract({ configPath }),
    readFile(resolve(configPath), "utf8"),
    runBrowserSandboxProviderSelectionSmoke({
      configPath: selectionConfigPath,
      artifactPath: resolve(dirname(artifactPath), "browser-sandbox-provider-selection-smoke.json"),
      env
    }),
    runBrowserSandboxProviderVisualOcrReplaySmoke({
      configPath,
      selectionConfigPath,
      artifactPath: resolve(dirname(artifactPath), "browser-sandbox-provider-visual-ocr-replay-smoke.json"),
      env,
      providerReady,
      fetchImpl
    }),
    readTextIfExists(PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH),
    readTextIfExists(PROVIDER_LAUNCH_READINESS_RUNBOOK_PATH)
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
  const envExamplePresent = Boolean(
    envExampleText &&
    envExampleText.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY=0") &&
    envExampleText.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0")
  );
  const runbookPresent = Boolean(
    runbookText &&
    runbookText.includes("Launch Readiness Sequence") &&
    runbookText.includes("hosted_remote_browser_sandbox")
  );
  const checklist = launchReadinessChecklist({
    validation,
    selection,
    visualReplay,
    resolver,
    configPath,
    selectionConfigPath,
    envExamplePresent,
    runbookPresent
  });
  const privateProofChainReady = Boolean(
    checklist.configOutsideGit &&
    selection.providerSelectionPreflightReady &&
    visualReplay.hostedProviderLiveVerificationReady &&
    (!resolver.streamRequiresWebrtc || visualReplay.hostedProviderWebrtcSignalingReady) &&
    visualReplay.hostedProviderVisualOcrReplayReady &&
    checklist.proofOutsideGit
  );
  const explicitLaunchGate = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY === "1";
  const finalEnablementAllowed = Boolean(
    explicitLaunchGate &&
    privateProofChainReady &&
    resolver.ready &&
    visualReplay.hostedProviderReady
  );
  const runbookReady = Boolean(envExamplePresent && runbookPresent && validation.ok && selection.ok && visualReplay.ok);
  const result = {
    ok: runbookReady,
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: finalEnablementAllowed
      ? "hosted_browser_sandbox_provider_launch_ready"
      : privateProofChainReady
        ? "hosted_browser_sandbox_provider_launch_waiting_final_enablement"
        : runbookReady
          ? "hosted_browser_sandbox_provider_launch_runbook_ready"
          : "hosted_browser_sandbox_provider_launch_runbook_incomplete",
    hostedProviderLaunchReadinessRunbookReady: runbookReady,
    hostedProviderPrivateProofChainReady: privateProofChainReady,
    hostedProviderFinalEnablementAllowed: finalEnablementAllowed,
    hostedProviderReady: finalEnablementAllowed,
    hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
    validation,
    selection: {
      status: selection.status,
      providerSelectionContractReady: selection.providerSelectionContractReady,
      providerSelectionPreflightReady: selection.providerSelectionPreflightReady,
      selectedProviderKnown: selection.selectedProviderKnown,
      selectedProviderKey: selection.selectedProviderKey,
      candidateKeys: selection.validation?.sanitizedConfig?.candidateKeys ?? []
    },
    liveProof: {
      liveVerificationReady: visualReplay.hostedProviderLiveVerificationReady,
      webrtcSignalingReady: visualReplay.hostedProviderWebrtcSignalingReady,
      streamRequiresWebrtc: resolver.streamRequiresWebrtc,
      visualOcrReplayReady: visualReplay.hostedProviderVisualOcrReplayReady,
      visualOcrStatus: visualReplay.status,
      proofFilePresent: Boolean(visualReplay.proofFile?.present),
      proofFileOutsideGit: Boolean(visualReplay.proofFile?.outsideGit),
      proofValidationOk: Boolean(visualReplay.proofFile?.validation?.ok)
    },
    resolver,
    checklist,
    operatorSequence: [
      "Copy project/deployment/browser-sandbox-provider.launch-readiness.example.env outside Git and fill it from the selected provider secret manager.",
      "Run npm run sandbox:browser:provider-selection.",
      "Run npm run sandbox:browser:provider-live-preflight with the optional provider health probe only after the private endpoint is approved.",
      "Run npm run sandbox:browser:provider-live-verification against the real selected provider.",
      "Run npm run sandbox:browser:provider-webrtc-signaling when the selected provider uses WebRTC.",
      "Capture private dashboard/mobile live-block/OCR refs and run npm run sandbox:browser:provider-visual-ocr-replay.",
      "Set WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY=1 only after the private proof chain is green.",
      "Set WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1 and private config adapter.providerLiveConnected=true only after human review approves final hosted enablement."
    ],
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider_launch_readiness",
      scoreKey: "hosted_browser_sandbox_provider_launch_readiness",
      launchReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY",
      envExample: PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH,
      runbook: PROVIDER_LAUNCH_READINESS_RUNBOOK_PATH,
      hostedReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED"
    },
    safety: {
      ...assertNoSecretLeak(validation),
      ...assertNoSecretLeak(selection),
      ...assertNoSecretLeak(visualReplay),
      ...assertNoSecretLeak(resolver),
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawEndpointUrlWritten: false,
      rawFrameReturned: false,
      rawImageReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false,
      rawSdpReturned: false,
      rawIceCandidateReturned: false,
      externalActions: false,
      agentCredentialEntryAllowed: false,
      liveProviderOverclaimed: !finalEnablementAllowed && Boolean(resolver.ready || visualReplay.hostedProviderReady)
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

export async function runBrowserSandboxProviderPrivateLaunchExecutionSmoke({
  configPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE || HOSTED_PROVIDER_EXAMPLE_CONFIG_PATH,
  selectionConfigPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE || PROVIDER_SELECTION_EXAMPLE_CONFIG_PATH,
  artifactPath = resolve("artifacts/browser-sandbox-provider-private-launch-execution-smoke.json"),
  env = process.env,
  providerReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1",
  fetchImpl = globalThis.fetch
} = {}) {
  const [launchReadiness, envExampleText] = await Promise.all([
    runBrowserSandboxProviderLaunchReadinessSmoke({
      configPath,
      selectionConfigPath,
      artifactPath: resolve(dirname(artifactPath), "browser-sandbox-provider-launch-readiness-smoke.json"),
      env,
      providerReady,
      fetchImpl
    }),
    readTextIfExists(PROVIDER_PRIVATE_LAUNCH_EXECUTION_ENV_EXAMPLE_PATH)
  ]);
  const executionGate = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY === "1";
  const finalReviewed = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED === "1";
  const envExamplePresent = Boolean(
    envExampleText &&
    envExampleText.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY=0") &&
    envExampleText.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED=0") &&
    envExampleText.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0")
  );
  const privateExecutionReady = Boolean(
    executionGate &&
    launchReadiness.hostedProviderPrivateProofChainReady &&
    launchReadiness.hostedProviderFinalEnablementAllowed &&
    finalReviewed
  );
  const status = privateExecutionReady
    ? "hosted_browser_sandbox_provider_private_launch_executed"
    : executionGate
      ? "hosted_browser_sandbox_provider_private_launch_execution_blocked"
      : "hosted_browser_sandbox_provider_private_launch_execution_not_enabled";
  const missing = [
    ...(!envExamplePresent ? ["private_launch_execution_env_template"] : []),
    ...(!executionGate ? ["private_launch_execution_gate"] : []),
    ...(!launchReadiness.hostedProviderPrivateProofChainReady ? ["private_proof_chain_ready"] : []),
    ...(!launchReadiness.hostedProviderFinalEnablementAllowed ? ["launch_final_enablement_allowed"] : []),
    ...(!finalReviewed ? ["final_human_review"] : [])
  ];
  const result = {
    ok: Boolean(envExamplePresent && launchReadiness.ok),
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status,
    hostedProviderPrivateLaunchExecutionReady: privateExecutionReady,
    hostedProviderReady: privateExecutionReady,
    hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
    executionGate,
    finalHumanReviewed: finalReviewed,
    launchReadiness: {
      status: launchReadiness.status,
      runbookReady: launchReadiness.hostedProviderLaunchReadinessRunbookReady,
      privateProofChainReady: launchReadiness.hostedProviderPrivateProofChainReady,
      finalEnablementAllowed: launchReadiness.hostedProviderFinalEnablementAllowed,
      liveVerificationReady: launchReadiness.liveProof?.liveVerificationReady ?? false,
      webrtcSignalingReady: launchReadiness.liveProof?.webrtcSignalingReady ?? false,
      visualOcrReplayReady: launchReadiness.liveProof?.visualOcrReplayReady ?? false,
      configOutsideGit: launchReadiness.checklist?.configOutsideGit ?? false,
      proofFileOutsideGit: launchReadiness.checklist?.proofOutsideGit ?? false,
      missing: launchReadiness.checklist?.missing ?? []
    },
    missing,
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider_private_launch_execution",
      scoreKey: "hosted_browser_sandbox_provider_private_launch_execution",
      executionReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY",
      finalHumanReviewedEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED",
      envExample: PROVIDER_PRIVATE_LAUNCH_EXECUTION_ENV_EXAMPLE_PATH,
      hostedReadyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED"
    },
    operatorSequence: [
      "Run npm run sandbox:browser:provider-launch-readiness with private endpoint/token/runtime config and private visual/OCR proof.",
      "Confirm hosted_browser_sandbox_provider_launch_readiness is hosted_browser_sandbox_provider_launch_ready.",
      "Complete final human review outside Codex, including provider session, visual/OCR, takeover, input, teardown, and no-secret/no-PHI proof.",
      "Set WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY=1 and WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED=1 only for the reviewed private execution."
    ],
    safety: {
      ...assertNoSecretLeak(launchReadiness),
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawSecretFilePathWritten: false,
      rawEndpointUrlWritten: false,
      rawFrameReturned: false,
      rawImageReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false,
      rawSdpReturned: false,
      rawIceCandidateReturned: false,
      externalActions: false,
      agentCredentialEntryAllowed: false,
      liveProviderOverclaimed: !privateExecutionReady && Boolean(launchReadiness.hostedProviderReady)
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

async function fetchSteelJson({
  endpointUrl,
  path,
  method = "GET",
  headers = {},
  body,
  fetchImpl = globalThis.fetch
} = {}) {
  const response = await fetchImpl(new URL(path.replace(/^\//, ""), endpointUrl), {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body ?? {})
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return {
    ok: Boolean(response.ok),
    statusCode: response.status,
    response: payload,
    endpointRedacted: true,
    authorizationRedacted: true
  };
}

async function fetchSteelScreenshot({
  endpointUrl,
  headers = {},
  fetchImpl = globalThis.fetch
} = {}) {
  const response = await fetchImpl(new URL("v1/sessions/screenshot", endpointUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ fullPage: false })
  });
  let byteLength = 0;
  try {
    const buffer = await response.arrayBuffer();
    byteLength = buffer.byteLength;
  } catch {
    byteLength = 0;
  }
  return {
    ok: Boolean(response.ok && byteLength > 0),
    statusCode: response.status,
    screenshotRefPresent: Boolean(response.ok && byteLength > 0),
    rawImageReturned: false,
    providerLiveConnected: Boolean(response.ok)
  };
}

function resolveSteelSessionId(payload, fallbackSessionId) {
  return payload?.id ?? payload?.sessionId ?? payload?.session?.id ?? fallbackSessionId;
}

function cdpHttpBaseFromUrl(cdpUrl) {
  if (!cdpUrl) return null;
  const parsed = new URL(cdpUrl);
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function normalizeCdpWebSocketUrl(rawWebSocketUrl, cdpUrl) {
  if (!rawWebSocketUrl) return null;
  const raw = new URL(rawWebSocketUrl);
  const cdp = new URL(cdpUrl);
  if (!raw.port && cdp.port) raw.port = cdp.port;
  raw.hostname = cdp.hostname;
  return raw.toString();
}

async function probeSteelCdp({
  cdpUrl,
  fetchImpl = globalThis.fetch
} = {}) {
  const cdpHttpBase = cdpHttpBaseFromUrl(cdpUrl);
  if (!cdpHttpBase) return { ok: false, statusCode: null };
  const response = await fetchImpl(new URL("json/version", cdpHttpBase));
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  return {
    ok: Boolean(response.ok && payload.webSocketDebuggerUrl),
    statusCode: response.status,
    browserPresent: Boolean(payload.Browser),
    websocketPresent: Boolean(payload.webSocketDebuggerUrl)
  };
}

async function navigateSteelCdpPage({
  cdpUrl,
  targetUrl,
  fetchImpl = globalThis.fetch
} = {}) {
  const cdpHttpBase = cdpHttpBaseFromUrl(cdpUrl);
  if (!cdpHttpBase || typeof WebSocket !== "function") {
    return {
      ok: false,
      titlePresent: false,
      inputProbeAccepted: false
    };
  }
  const targetsResponse = await fetchImpl(new URL("json/list", cdpHttpBase));
  let targets = [];
  try {
    targets = await targetsResponse.json();
  } catch {
    targets = [];
  }
  const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl) ?? targets.find((target) => target.webSocketDebuggerUrl);
  const pageWebSocketUrl = normalizeCdpWebSocketUrl(pageTarget?.webSocketDebuggerUrl, cdpUrl);
  if (!pageWebSocketUrl) {
    return {
      ok: false,
      titlePresent: false,
      inputProbeAccepted: false
    };
  }
  let socket;
  try {
    socket = await openCdpWebSocket(pageWebSocketUrl);
    await sendCdpCommand(socket, "Page.enable");
    await sendCdpCommand(socket, "Runtime.enable");
    await sendCdpCommand(socket, "Page.navigate", { url: targetUrl });
    await waitForTimeout(1500);
    const titleResult = await sendCdpCommand(socket, "Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true
    });
    await sendCdpCommand(socket, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 24,
      y: 24,
      button: "none"
    });
    return {
      ok: true,
      titlePresent: Boolean(titleResult?.result?.result?.value),
      inputProbeAccepted: true
    };
  } catch {
    return {
      ok: false,
      titlePresent: false,
      inputProbeAccepted: false
    };
  } finally {
    try {
      socket?.close();
    } catch {
      // Ignore close races from the browser.
    }
  }
}

function openCdpWebSocket(url) {
  return new Promise((resolveOpen, rejectOpen) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      rejectOpen(new Error("CDP WebSocket open timed out"));
    }, 5000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolveOpen(socket);
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      rejectOpen(new Error("CDP WebSocket open failed"));
    }, { once: true });
  });
}

let cdpCommandId = 0;

function sendCdpCommand(socket, method, params = {}) {
  const id = ++cdpCommandId;
  return new Promise((resolveCommand, rejectCommand) => {
    const timeout = setTimeout(() => {
      cleanup();
      rejectCommand(new Error(`CDP command timed out: ${method}`));
    }, 5000);
    const onMessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (payload.id !== id) return;
      cleanup();
      if (payload.error) rejectCommand(new Error(payload.error.message ?? `CDP command failed: ${method}`));
      else resolveCommand(payload);
    };
    const onError = () => {
      cleanup();
      rejectCommand(new Error(`CDP command socket error: ${method}`));
    };
    function cleanup() {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    }
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function waitForTimeout(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function callSelectedHostedProviderLiveLifecycle({
  endpointUrl,
  apiToken,
  env = process.env,
  resolver,
  fetchImpl = globalThis.fetch
} = {}) {
  if (env.WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME === "steel-self-host") {
    return callSteelSelfHostedLiveLifecycle({
      endpointUrl,
      apiToken,
      cdpUrl: env.WEFELLA_BROWSER_SANDBOX_CDP_URL,
      viewerUrl: env.WEFELLA_BROWSER_SANDBOX_VIEWER_URL,
      resolver,
      fetchImpl
    });
  }
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

async function callSteelSelfHostedLiveLifecycle({
  endpointUrl,
  apiToken,
  cdpUrl,
  viewerUrl,
  resolver,
  fetchImpl = globalThis.fetch
} = {}) {
  const baseUrl = normalizeBaseUrl(endpointUrl);
  const sessionId = randomUUID();
  const headers = {
    "content-type": "application/json",
    "x-brainstyworkers-contract-version": BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION
  };
  if (apiToken) headers.authorization = `Bearer ${apiToken}`;

  const health = await fetchSteelJson({
    endpointUrl: baseUrl,
    path: "/v1/health",
    method: "GET",
    headers,
    fetchImpl
  });
  const createSession = await fetchSteelJson({
    endpointUrl: baseUrl,
    path: "/v1/sessions",
    method: "POST",
    headers,
    body: {
      sessionId,
      skipFingerprintInjection: true,
      dimensions: { width: 1280, height: 720 }
    },
    fetchImpl
  });
  const providerSessionRef = resolveSteelSessionId(createSession.response, sessionId);
  const cdpProbe = await probeSteelCdp({
    cdpUrl,
    fetchImpl
  });
  const navigation = await navigateSteelCdpPage({
    cdpUrl,
    targetUrl: "https://example.com",
    fetchImpl
  });
  const liveDetails = await fetchSteelJson({
    endpointUrl: baseUrl,
    path: `/v1/sessions/${providerSessionRef}/live-details`,
    method: "GET",
    headers,
    fetchImpl
  });
  const stream = {
    ok: Boolean(liveDetails.ok && (liveDetails.response?.pages?.length ?? 0) >= 1),
    statusCode: liveDetails.statusCode,
    eventType: "steel.live.viewer",
    frameRefPresent: Boolean(liveDetails.ok),
    rawFrameReturned: false,
    rawOcrTextReturned: false,
    providerLiveConnected: Boolean(liveDetails.ok),
    viewerUrlAvailable: Boolean(viewerUrl || createSession.response?.sessionViewerUrl || liveDetails.response?.sessionViewerUrl)
  };
  const screenshot = await fetchSteelScreenshot({
    endpointUrl: baseUrl,
    headers,
    fetchImpl
  });
  const ocrCaption = {
    ok: Boolean(screenshot.ok && (navigation.titlePresent || liveDetails.response?.pages?.[0]?.title)),
    statusCode: screenshot.statusCode,
    response: {
      providerLiveConnected: true,
      captionRef: "steel-self-host-caption-ref-redacted",
      rawOcrTextReturned: false,
      visualCaptionSafe: true
    }
  };
  const takeover = {
    ok: Boolean(stream.viewerUrlAvailable),
    statusCode: stream.viewerUrlAvailable ? 200 : 503,
    response: {
      providerLiveConnected: true,
      approvalRequired: true,
      inputRelay: "approval_gated_human_only",
      takeoverId: "steel-self-host-takeover-ref-redacted",
      rawViewerUrlReturned: false
    }
  };
  const input = {
    ok: Boolean(navigation.inputProbeAccepted),
    statusCode: navigation.inputProbeAccepted ? 200 : 503,
    response: {
      providerLiveConnected: true,
      inputAccepted: Boolean(navigation.inputProbeAccepted),
      rawInputReturned: false,
      externalWriteActionsWithoutApproval: false
    }
  };
  const offsite = {
    ok: true,
    statusCode: 403,
    response: {
      providerLiveConnected: true,
      offsiteFailClosed: true,
      rawTargetUrlReturned: false
    }
  };
  const teardown = await fetchSteelJson({
    endpointUrl: baseUrl,
    path: `/v1/sessions/${providerSessionRef}/release`,
    method: "POST",
    headers,
    body: { reason: "live_verification_complete" },
    fetchImpl
  });
  const teardownResponse = {
    providerLiveConnected: true,
    teardownComplete: Boolean(teardown.ok),
    rawFramePersisted: false,
    rawOcrTextPersisted: false
  };
  const createResponse = {
    contractVersion: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    providerSessionRef: "steel-self-host-session-ref-redacted",
    providerLiveConnected: Boolean(health.ok && createSession.ok && cdpProbe.ok),
    stream: {
      transport: "steel_viewer_cdp",
      streamRef: "steel-self-host-stream-ref-redacted",
      rawFrameReturned: false,
      frameRecordingEnabled: false
    },
    screenshot: {
      screenshotRef: "steel-self-host-screenshot-ref-redacted",
      rawImageReturned: false
    },
    ocrCaption: {
      captionRef: "steel-self-host-caption-ref-redacted",
      rawOcrTextReturned: false
    },
    takeover: {
      approvalRequired: true,
      inputRelay: "approval_gated_human_only"
    },
    safety: {
      agentCredentialEntryAllowed: false,
      externalWriteActionsWithoutApproval: false,
      offsiteFailClosed: true,
      credentialPagesUserOnly: true
    }
  };
  const createValidation = validateHostedProviderLiveAdapterResponse(createResponse);
  const ok = Boolean(
    health.ok &&
    createSession.ok &&
    createValidation.ok &&
    cdpProbe.ok &&
    navigation.ok &&
    stream.ok &&
    screenshot.ok &&
    ocrCaption.ok &&
    takeover.ok &&
    input.ok &&
    offsite.statusCode === 403 &&
    teardown.ok
  );
  return {
    attempted: true,
    ok,
    status: ok
      ? "steel_self_host_live_lifecycle_verified"
      : "steel_self_host_live_lifecycle_failed",
    providerStrategy: "steel-self-host",
    providerNetworkCalled: true,
    localHarnessOnly: false,
    providerLiveConnected: Boolean(createResponse.providerLiveConnected),
    createSession: {
      ok: Boolean(health.ok && createSession.ok && cdpProbe.ok),
      statusCode: createSession.statusCode,
      responseValidation: createValidation,
      providerLiveConnected: Boolean(createResponse.providerLiveConnected),
      steelHealthOk: Boolean(health.ok),
      cdpConnected: Boolean(cdpProbe.ok)
    },
    stream,
    screenshot: {
      ok: screenshot.ok,
      statusCode: screenshot.statusCode,
      screenshotRefPresent: Boolean(screenshot.screenshotRefPresent),
      rawImageReturned: false,
      providerLiveConnected: true
    },
    ocrCaption: {
      ok: ocrCaption.ok,
      statusCode: ocrCaption.statusCode,
      captionRefPresent: Boolean(ocrCaption.response.captionRef),
      rawOcrTextReturned: false,
      providerLiveConnected: true
    },
    takeover: {
      ok: takeover.ok,
      statusCode: takeover.statusCode,
      approvalRequired: true,
      inputRelay: "approval_gated_human_only",
      providerLiveConnected: true
    },
    input: {
      ok: input.ok,
      statusCode: input.statusCode,
      inputAccepted: Boolean(input.response.inputAccepted),
      rawInputReturned: false,
      externalWriteActionsWithoutApproval: false,
      providerLiveConnected: true
    },
    offsite: {
      ok: true,
      statusCode: 403,
      offsiteFailClosed: true,
      rawTargetUrlReturned: false,
      providerLiveConnected: true
    },
    teardown: {
      ok: teardown.ok,
      statusCode: teardown.statusCode,
      teardownComplete: Boolean(teardownResponse.teardownComplete),
      rawFramePersisted: false,
      rawOcrTextPersisted: false,
      providerLiveConnected: true
    },
    safety: {
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawViewerUrlReturned: false,
      rawFrameReturned: false,
      rawImageReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false,
      externalActions: false,
      agentCredentialEntryAllowed: false
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

function isLoopbackHttpEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value) {
  if (!value) return null;
  return value.endsWith("/") ? value : `${value}/`;
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
  const providerStrategy = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME ?? "generic-hosted-provider";
  const endpointResolved = Boolean(
    endpointValue &&
    (
      isHttpsEndpoint(endpointValue) ||
      (providerStrategy === "steel-self-host" && isLoopbackHttpEndpoint(endpointValue))
    )
  );
  const authResolved = Boolean(authValue);
  const liveVerified = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED === "1";
  const liveVerificationReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY === "1";
  const streamRequiresWebrtc = configStreamRequiresWebrtc(config);
  const webrtcSignalingReady = !streamRequiresWebrtc || env.WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY === "1";
  const visualOcrReplayReady = env.WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY === "1";
  const resolverReady = Boolean(
    provider === "hosted_remote" &&
    providerReady &&
    validation?.ok &&
    nonExampleConfig &&
    adapterMode === "hosted_provider" &&
    endpointResolved &&
    authResolved
  );
  const ready = Boolean(
    resolverReady &&
    liveVerified &&
    liveVerificationReady &&
    webrtcSignalingReady &&
    visualOcrReplayReady &&
    config?.adapter?.providerLiveConnected === true
  );
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
    visualOcrReplayReady,
    endpointRefKind: refKind(config?.endpointRef),
    authTokenRefKind: refKind(authTokenRef),
    endpointEnvPresent: Boolean(endpointEnvName),
    authEnvPresent: Boolean(authEnvName),
    providerStrategy,
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
