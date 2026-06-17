import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION = "2026-06-17.browser-sandbox-provider.v1";

const DEFAULT_CONFIG_PATH = "project/deployment/browser-sandbox-provider.example.json";
const ALLOWED_PROVIDERS = new Set(["hosted_remote", "vercel_sandbox", "browserbase", "custom_webrtc"]);
const ALLOWED_SECRET_SOURCES = new Set(["managed_env", "secret_file", "docker_secret"]);
const ALLOWED_ADAPTER_MODES = new Set(["contract_only", "contract_harness", "hosted_provider"]);

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
  const adapterMode = validation.sanitizedConfig.adapter.mode;
  const nonExampleConfig = configPath !== DEFAULT_CONFIG_PATH;
  const adapterHarnessReady = Boolean(providerReady && validation.ok && nonExampleConfig && adapterMode === "contract_harness");
  const hostedProviderReady = Boolean(providerReady && validation.ok && nonExampleConfig && adapterMode === "hosted_provider");
  const result = {
    ok: validation.ok,
    version: BROWSER_SANDBOX_PROVIDER_CONTRACT_VERSION,
    status: hostedProviderReady
      ? "hosted_browser_sandbox_provider_ready"
      : adapterHarnessReady
        ? "hosted_browser_sandbox_adapter_harness_ready"
        : "hosted_browser_sandbox_contract_valid_not_configured",
    hostedProviderReady,
    adapterHarnessReady,
    validation,
    dashboard: {
      readinessKey: "hosted_browser_sandbox_provider",
      scoreKey: "hosted_remote_browser_sandbox",
      providerEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER",
      readyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY",
      configFileEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE"
    },
    safety: {
      ...assertNoSecretLeak(validation),
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
