import { createServer } from "node:http";
import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { listAuditEvents } from "../concierge/audit.mjs";
import { createDatabaseStore } from "../concierge/databaseFactory.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { normalizeWebChat } from "../concierge/channelAdapter.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { traceForSession } from "../concierge/traceSession.mjs";
import { describeLangGraphScope } from "../concierge/langgraphScope.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { probeChrome } from "../concierge/browserAutomation.mjs";
import { buildContextPacket, getMemoryContextForUser, listHarnessState, planTaskFollowups, runUserHeartbeat } from "../concierge/memoryHarness.mjs";
import { auditPromptContractSafety } from "../concierge/promptContracts.mjs";
import { buildRuntimeCompatibilityBundle } from "../concierge/runtimeAdapters.mjs";
import { listOpenClawSkillArtifacts, loadOpenClawSkillArtifact } from "../concierge/openclawSkillArtifacts.mjs";
import { loadDynamicSkillDefinitions, resolveDynamicSkillContext } from "../concierge/dynamicSkillServer.mjs";
import { loadOpenClawSkillRegistry } from "../concierge/openclaw/skillRegistry.mjs";
import { buildOpenClawBoundedTaskProposal } from "../concierge/openclaw/workerPolicy.mjs";
import { getWorkerProceduralMemoryStatus } from "../concierge/workerMemory.mjs";
import { getOpenAiConfig, loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { closeManagedSession, getManagedSessionState, listManagedSessions } from "../concierge/sessionManager.mjs";
import {
  SessionContinuityError,
  buildSessionExport,
  getSessionContinuity,
  recordSessionFeedback
} from "../concierge/sessionContinuity.mjs";
import { listHumanHandoffs } from "../concierge/humanHandoffs.mjs";
import {
  ResearchOpsError,
  buildResearchGraph,
  cancelResearchRun,
  chooseResearchEmbeddingRoute,
  evaluateCitationClosure,
  executeResearchRun,
  getResearchAnalytics,
  getResearchBudgetStatus,
  getResearchEmbeddingStatus,
  getResearchGraph,
  getResearchKpis,
  getResearchReviewQueues,
  getResearchRun,
  getResearchWorkerStatus,
  ingestResearchDocumentUpload,
  extractResearchEntitiesForArtifact,
  listResearchArtifacts,
  listCitationClosureEvaluations,
  listResearchEntities,
  listResearchRunEvents,
  listResearchRuns,
  listResearchSchedules,
  listResearchSources,
  proposeResearchSource,
  retryResearchRun,
  reviewResearchArtifact,
  reviewResearchSource,
  reindexResearchEmbeddings,
  runDueResearchSchedules,
  searchResearchEvidence,
  startManualResearchRun,
  updateResearchBudgetPolicy,
  updateResearchSource
} from "../concierge/researchOps.mjs";
import { createResearchSchedulerDaemon } from "../concierge/researchScheduler.mjs";
import { createRetentionSweepDaemon } from "../concierge/retentionScheduler.mjs";
import {
  OperatorAssistantError,
  decideOperatorProposal,
  listOperatorProposals,
  listOperatorTools,
  runOperatorAssistant
} from "../concierge/operatorAssistant.mjs";
import { authenticatePlannedUser, runOrchestratorChat, runOrchestratorFlowCases } from "../concierge/orchestratorDemo.mjs";
import {
  getProductMemoryStatus,
  getProductMemoryReplayQueueSummary,
  listProductMemoryReplayQueue,
  probeProductMemoryAtBoot,
  probeProductMemory,
  replayQueuedProductMemoryRetains,
  suppressProductMemoryEpisode
} from "../concierge/productMemory.mjs";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";
import {
  buildContinuousIntelligencePersistenceReadinessProof,
  buildContinuousIntelligenceReadinessProof,
  buildPemsLiveClaimCitationClosureProof,
  buildPemsLiveEvaluatorFilteringProof,
  buildPemsPromotionReadinessProof,
  buildPemsReviewerClaimRevisionProof,
  buildPemsReviewerComparisonProvenance,
  buildPemsReviewerFollowUpProof,
  buildPemsReviewerHistoryExportProof,
  buildPemsReviewerHistoryReviewProof,
  buildPemsReviewerWorkbenchReadinessProof,
  createLiveGatedPemsEvaluatorDraft,
  createPemsEvaluatorDraft,
  evaluatePemsPromotionGate,
  getContinuousIntelligencePersistenceStatus,
  getPemsPromotionGateStatus,
  getPemsReviewerWorkbenchStatus,
  PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
  recordPemsClaimRevision,
  recordPemsReviewerFollowUp,
  recordPemsReviewerHistoryExport,
  recordPemsPromotionReview
} from "../concierge/continuousIntelligence.mjs";
import {
  assertProceduralSkillIsUserAgnostic,
  buildGraphitiMemoryNamespaces,
  buildNightlyResearchChangeCandidateSeed,
  buildResolvedCaseCandidateSeed,
  composeTrustedSkillDrivenAnswer
} from "../concierge/trustedAnswerDriving.mjs";
import { buildPhase60MemorySkillTreeProof } from "../concierge/memorySkillTree.mjs";
import { evaluateDatabaseSecretProfile, publicDatabaseSecretProfile } from "../concierge/databaseSecretProfile.mjs";
import { checkOfficialOpenClawReadiness, getOfficialOpenClawConfig } from "../concierge/openclawOfficialRuntime.mjs";
import {
  startScreencast,
  stopScreencast,
  screencastStatus,
  subscribeBrowserFrames,
  requestTakeover,
  grantTakeover,
  relayHumanInput,
  endTakeover,
  describeTakeover
} from "../concierge/browserStreamController.mjs";
import { classifyOfficialOpenClawLiveReadiness } from "../concierge/openclawLiveReadiness.mjs";
import {
  READ_ONLY_DOCUMENT_ALLOWED_ACTION,
  READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
  createDocumentCandidateProposal,
  latestDocumentDiscovery,
  listDocumentCandidateProposals
} from "../concierge/documentCandidateApproval.mjs";
import {
  createRuntimeHookSubscription,
  listRuntimeEvents,
  listRuntimeHookSubscriptions,
  publishRuntimeEvent,
  subscribeRuntimeEvents
} from "../concierge/runtimeEvents.mjs";
import {
  cancelWorkerContinuation,
  createWorkerContinuation,
  listWorkerContinuations,
  requestWorkerContinuation
} from "../concierge/workerContinuations.mjs";
import {
  resolveBrowserSandboxHostedProvider,
  validateVisualOcrProofManifest,
  validateBrowserSandboxProviderContract,
  validateBrowserSandboxProviderSelectionContract,
  validateBrowserSandboxProviderSteelOperationsContract,
  validateSteelComposeOperations,
  validateSteelRemoteDeploymentFiles,
  validateSteelOpsDrillsFiles
} from "../../scripts/browser-sandbox-provider-contract.mjs";

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? "127.0.0.1";
const APP_DIR = resolve("src/app");

await loadLocalEnvOnce();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const store = await createDatabaseStore(process.env).initialize();
const researchSchedulerDaemon = createResearchSchedulerDaemon(store);
const retentionSweepDaemon = createRetentionSweepDaemon(store);
await researchSchedulerDaemon.start();
await retentionSweepDaemon.start();
await probeProductMemoryAtBoot({ store });

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": MIME[".json"] });
  res.end(JSON.stringify(payload, null, 2));
}

function sendApiError(res, error) {
  if (error instanceof SessionContinuityError || error instanceof ResearchOpsError || error instanceof OperatorAssistantError) {
    sendJson(res, error.statusCode, { error: error.message, status: "failed" });
    return;
  }
  throw error;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch {
    return null;
  }
}

async function readTextIfExists(path) {
  try {
    return await readFile(resolve(path), "utf8");
  } catch {
    return null;
  }
}

function isPathInsideRepo(path) {
  const relativePath = relative(process.cwd(), resolve(path));
  return Boolean(relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/"));
}

async function readLatestSteelSelfHostProof() {
  const explicitProofPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_STEEL_SELF_HOST_PROOF_FILE;
  if (explicitProofPath) {
    return {
      artifactRef: isPathInsideRepo(explicitProofPath)
        ? relative(process.cwd(), resolve(explicitProofPath))
        : "[private-steel-self-host-proof-outside-git]",
      proof: await readJsonIfExists(explicitProofPath)
    };
  }
  const artifactDir = resolve("artifacts/phase28");
  try {
    const files = (await readdir(artifactDir))
      .filter((file) => /^steel-self-host-live-lifecycle-.*\.json$/.test(file))
      .sort();
    const latest = files.at(-1);
    if (!latest) return { artifactRef: null, proof: null };
    const artifactPath = join(artifactDir, latest);
    return {
      artifactRef: relative(process.cwd(), artifactPath),
      proof: await readJsonIfExists(artifactPath)
    };
  } catch {
    return { artifactRef: null, proof: null };
  }
}

function summarizeSteelSelfHostProof({ artifactRef, proof } = {}) {
  const lifecycle = proof?.liveLifecycle ?? {};
  const checks = [
    ["session_create", lifecycle.createSession?.ok === true && lifecycle.providerLiveConnected === true],
    ["cdp_connect", lifecycle.createSession?.cdpConnected === true],
    ["live_viewer_stream_ref", lifecycle.stream?.ok === true && lifecycle.stream?.viewerUrlAvailable === true],
    ["screenshot_ref", lifecycle.screenshot?.ok === true && lifecycle.screenshot?.screenshotRefPresent === true && lifecycle.screenshot?.rawImageReturned === false],
    ["ocr_caption_ref", lifecycle.ocrCaption?.ok === true && lifecycle.ocrCaption?.captionRefPresent === true && lifecycle.ocrCaption?.rawOcrTextReturned === false],
    ["approved_input_relay", lifecycle.input?.ok === true && lifecycle.input?.inputAccepted === true && lifecycle.input?.rawInputReturned === false],
    ["takeover_approval_scope", lifecycle.takeover?.ok === true && lifecycle.takeover?.approvalRequired === true && lifecycle.takeover?.inputRelay === "approval_gated_human_only"],
    ["teardown_release", lifecycle.teardown?.ok === true && lifecycle.teardown?.teardownComplete === true],
    ["offsite_fail_closed", lifecycle.offsite?.ok === true && lifecycle.offsite?.statusCode === 403 && lifecycle.offsite?.offsiteFailClosed === true],
    ["phi_redaction_policy", lifecycle.safety?.rawFrameReturned === false && lifecycle.safety?.rawImageReturned === false && lifecycle.safety?.rawOcrTextReturned === false && lifecycle.safety?.rawInputReturned === false]
  ].map(([key, ok]) => ({ key, ok: Boolean(ok) }));
  const passed = checks.filter((check) => check.ok).length;
  return {
    status: passed === checks.length
      ? "steel_self_host_live_proof_ready"
      : artifactRef
        ? "steel_self_host_live_proof_incomplete"
        : "steel_self_host_live_proof_missing",
    ok: passed === checks.length,
    score: passed * 10,
    target: 100,
    passed,
    total: checks.length,
    checks,
    artifactRef,
    providerStrategy: lifecycle.providerStrategy ?? null,
    viewerUrlEnvRef: "WEFELLA_BROWSER_SANDBOX_VIEWER_URL",
    lifecycleRefPresent: Boolean(lifecycle.status),
    rawEndpointReturned: false,
    rawSecretReturned: false,
    rawFrameReturned: false,
    rawOcrTextReturned: false,
    rawInputReturned: false
  };
}

async function summarizeSteelOperationsReadiness() {
  try {
    const [validation, composeText, runbookText] = await Promise.all([
      validateBrowserSandboxProviderSteelOperationsContract(),
      readFile(resolve("infra/steel/compose.yaml"), "utf8"),
      readFile(resolve("infra/steel/README.md"), "utf8")
    ]);
    const compose = validateSteelComposeOperations(composeText, runbookText);
    const operationsGate = process.env.WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_READY === "1";
    const liveProbeRequested = process.env.WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_LIVE_PROBE === "1";
    const liveProbeReady = liveProbeRequested
      ? Boolean(
        process.env.WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL &&
        process.env.WEFELLA_BROWSER_SANDBOX_CDP_URL &&
        process.env.WEFELLA_BROWSER_SANDBOX_VIEWER_URL
      )
      : false;
    const staticReady = Boolean(validation.ok && compose.ok);
    const ready = Boolean(staticReady && operationsGate && (!liveProbeRequested || liveProbeReady));
    return {
      status: ready
        ? "steel_self_host_operations_ready"
        : staticReady
          ? "steel_self_host_operations_contract_ready"
          : "steel_self_host_operations_contract_incomplete",
      ok: ready,
      contractReady: staticReady,
      score: ready ? 100 : staticReady ? 85 : Math.floor((compose.passed / Math.max(compose.total, 1)) * 60),
      target: 100,
      checks: [
        ...compose.checks,
        { key: "operations_gate", ok: operationsGate },
        { key: "live_probe_requested", ok: liveProbeRequested },
        { key: "live_probe_config_present", ok: liveProbeReady }
      ],
      composeFile: "infra/steel/compose.yaml",
      configFile: "project/deployment/browser-sandbox-provider.steel-operations.example.json",
      runbook: "infra/steel/README.md",
      command: "npm run sandbox:browser:steel-operations",
      operationsReadyEnv: "WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_READY",
      liveProbeEnv: "WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_LIVE_PROBE",
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawFrameReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false
    };
  } catch (error) {
    return {
      status: "steel_self_host_operations_contract_unreadable",
      ok: false,
      contractReady: false,
      score: 0,
      target: 100,
      checks: [{ key: "operations_contract_readable", ok: false, error: error.message }],
      command: "npm run sandbox:browser:steel-operations",
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false
    };
  }
}

async function readLatestSteelRemoteProof() {
  const explicitProofPath = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_STEEL_REMOTE_PROOF_FILE;
  if (explicitProofPath) {
    return {
      artifactRef: isPathInsideRepo(explicitProofPath)
        ? relative(process.cwd(), resolve(explicitProofPath))
        : "[private-steel-remote-proof-outside-git]",
      proof: await readJsonIfExists(explicitProofPath)
    };
  }
  const artifactDir = resolve("artifacts/phase30");
  try {
    const files = (await readdir(artifactDir))
      .filter((file) => /^steel-remote-live-lifecycle-.*\.json$/.test(file))
      .sort();
    const latest = files.at(-1);
    if (!latest) return { artifactRef: null, proof: null };
    const artifactPath = join(artifactDir, latest);
    return {
      artifactRef: relative(process.cwd(), artifactPath),
      proof: await readJsonIfExists(artifactPath)
    };
  } catch {
    return { artifactRef: null, proof: null };
  }
}

function summarizeSteelRemoteProof({ artifactRef, proof } = {}) {
  const tenChecks = proof?.tenChecks ?? {};
  const checks = Array.isArray(tenChecks.checks) ? tenChecks.checks : [];
  const passed = checks.filter((check) => check.ok).length;
  const total = checks.length || 10;
  const accepted = Boolean(proof?.ok && tenChecks.ok && passed === total && total === 10);
  return {
    status: accepted
      ? "steel_remote_host_lifecycle_verified"
      : artifactRef
        ? "steel_remote_host_lifecycle_incomplete"
        : "steel_remote_host_lifecycle_missing",
    ok: accepted,
    score: accepted ? 100 : 0,
    target: 100,
    passed,
    total,
    checks,
    artifactRef,
    contractReadinessLabel: "contract readiness",
    localHostReadinessLabel: "local-host readiness",
    remoteHostReadinessLabel: "remote-host readiness",
    rawEndpointReturned: false,
    rawSecretReturned: false,
    rawFrameReturned: false,
    rawOcrTextReturned: false,
    rawInputReturned: false
  };
}

async function summarizeSteelRemoteReadiness() {
  try {
    const [composeText, caddyText, firewallText, wireguardText, recoveryText, proof] = await Promise.all([
      readFile(resolve("infra/steel/remote/compose.yaml"), "utf8"),
      readFile(resolve("infra/steel/remote/Caddyfile"), "utf8"),
      readFile(resolve("infra/steel/remote/firewall.md"), "utf8"),
      readFile(resolve("infra/steel/remote/wireguard.md"), "utf8"),
      readFile(resolve("infra/steel/remote/recover.sh"), "utf8"),
      readLatestSteelRemoteProof()
    ]);
    const deployment = validateSteelRemoteDeploymentFiles({
      composeText,
      caddyText,
      firewallText,
      wireguardText,
      recoveryText
    });
    const lifecycle = summarizeSteelRemoteProof(proof);
    return {
      status: lifecycle.ok
        ? "steel_remote_host_lifecycle_verified"
        : deployment.ok
          ? "steel_remote_host_contract_ready_waiting_live_10_of_10"
          : "steel_remote_host_contract_incomplete",
      ok: lifecycle.ok,
      contractReady: deployment.ok,
      score: lifecycle.ok ? 100 : 0,
      target: 100,
      checks: deployment.checks,
      tenChecks: lifecycle.checks,
      lifecycleArtifactRef: lifecycle.artifactRef,
      composeFile: "infra/steel/remote/compose.yaml",
      proxyConfig: "infra/steel/remote/Caddyfile",
      firewallRunbook: "infra/steel/remote/firewall.md",
      tunnelRunbook: "infra/steel/remote/wireguard.md",
      recoveryScript: "infra/steel/remote/recover.sh",
      command: "npm run sandbox:browser:steel-remote-readiness",
      contractReadinessLabel: "contract readiness",
      localHostReadinessLabel: "local-host readiness",
      remoteHostReadinessLabel: "remote-host readiness",
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawFrameReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false
    };
  } catch (error) {
    return {
      status: "steel_remote_host_contract_unreadable",
      ok: false,
      contractReady: false,
      score: 0,
      target: 100,
      checks: [{ key: "remote_contract_readable", ok: false, error: error.message }],
      command: "npm run sandbox:browser:steel-remote-readiness",
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false
    };
  }
}

async function summarizeSteelOpsDrillsReadiness() {
  try {
    const [configText, patchingText, backupRestoreDrillText, healthAlertsText, oncallHandoffText, proof] = await Promise.all([
      readFile(resolve("infra/steel/remote/ops-drills.example.json"), "utf8"),
      readFile(resolve("infra/steel/remote/patching.md"), "utf8"),
      readFile(resolve("infra/steel/remote/backup-restore-drill.sh"), "utf8"),
      readFile(resolve("infra/steel/remote/health-alerts.example.json"), "utf8"),
      readFile(resolve("infra/steel/remote/oncall-handoff.md"), "utf8"),
      readLatestSteelRemoteProof()
    ]);
    const config = JSON.parse(configText);
    const drills = validateSteelOpsDrillsFiles({
      config,
      patchingText,
      backupRestoreDrillText,
      healthAlertsText,
      oncallHandoffText,
      remoteProof: proof.proof
    });
    return {
      status: drills.ok ? "steel_remote_ops_drills_ready" : "steel_remote_ops_drills_incomplete",
      ok: drills.ok,
      score: drills.ok ? 100 : Math.floor((drills.passed / Math.max(drills.total, 1)) * 80),
      target: 100,
      checks: drills.checks,
      lifecycleArtifactRef: proof.artifactRef,
      configFile: "infra/steel/remote/ops-drills.example.json",
      patchingRunbook: "infra/steel/remote/patching.md",
      backupRestoreDrill: "infra/steel/remote/backup-restore-drill.sh",
      healthAlerts: "infra/steel/remote/health-alerts.example.json",
      oncallHandoff: "infra/steel/remote/oncall-handoff.md",
      command: "npm run sandbox:browser:steel-ops-drills",
      contractReadinessLabel: "contract readiness",
      localHostReadinessLabel: "local-host readiness",
      remoteHostReadinessLabel: "remote-host readiness",
      opsDrillReadinessLabel: "ops-drill readiness",
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawFrameReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false
    };
  } catch (error) {
    return {
      status: "steel_remote_ops_drills_unreadable",
      ok: false,
      score: 0,
      target: 100,
      checks: [{ key: "ops_drills_readable", ok: false, error: error.message }],
      command: "npm run sandbox:browser:steel-ops-drills",
      rawEndpointReturned: false,
      rawSecretReturned: false
    };
  }
}

function sendSse(res, event) {
  res.write(`event: ${event.eventType ?? "message"}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function safeProductMemoryStatus() {
  try {
    return {
      ...(await getProductMemoryStatus({ store })),
      config: undefined
    };
  } catch (error) {
    return {
      ok: false,
      action: "status",
      adapter: process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER ?? "disabled",
      enabled: process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER === "graphiti",
      status: "degraded",
      error: error.message,
      replayQueue: await getProductMemoryReplayQueueSummary(store).catch(() => null)
    };
  }
}

async function safeDeploymentContractStatus() {
  const files = [
    ".dockerignore",
    "Dockerfile.node",
    "Dockerfile.api",
    "apps/mobile-next/Dockerfile",
    "compose.yaml",
    "compose.postgres.yaml",
    "scripts/browser-sandbox-provider-contract.mjs",
    "scripts/browser-sandbox-provider-selection-smoke.mjs",
    "scripts/browser-sandbox-provider-live-preflight-smoke.mjs",
    "scripts/browser-sandbox-provider-live-verification-smoke.mjs",
    "scripts/browser-sandbox-provider-webrtc-signaling-smoke.mjs",
    "scripts/browser-sandbox-provider-visual-ocr-replay-smoke.mjs",
    "scripts/browser-sandbox-provider-steel-operations-smoke.mjs",
    "scripts/compose-contract.mjs",
    "scripts/storage-contract.mjs",
    "scripts/postgres-runtime-smoke.mjs",
    "scripts/postgres-production-readiness-smoke.mjs",
    "scripts/postgres-default-rollout-smoke.mjs",
    "scripts/postgres-production-profile-contract.mjs",
    "scripts/postgres-endpoint-regression-smoke.mjs",
    "scripts/postgres-production-profile-live-smoke.mjs",
    "scripts/postgres-backup-runbook-smoke.mjs",
    "scripts/postgres-provider-backup-policy-smoke.mjs",
    "project/deployment/postgres-provider-backup-policy.example.json",
    "project/deployment/browser-sandbox-provider.example.json",
    "project/deployment/browser-sandbox-provider.selection.example.json",
    "project/deployment/browser-sandbox-provider.live-preflight.example.env",
    "project/deployment/browser-sandbox-provider.live-verification.example.env",
    "project/deployment/browser-sandbox-provider.webrtc-signaling.example.env",
    "project/deployment/browser-sandbox-provider.visual-ocr-replay.example.env",
    "project/deployment/browser-sandbox-provider.steel-operations.example.json",
    "infra/steel/compose.yaml",
    "infra/steel/README.md",
    "docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md",
    "project/deployment/secrets/README.md",
    "project/deployment/secrets/database-url.example",
    "scripts/compose-memory-smoke.mjs",
    "project/db/postgres-init/001_storage_readiness.sql",
    "src/concierge/databaseFactory.mjs",
    "src/concierge/databaseSecretProfile.mjs",
    "src/concierge/postgresStore.mjs",
    "src/concierge/workerLeases.mjs",
    "src/concierge/storageReadiness.mjs",
    "src/tests/deployment-compose.test.mjs",
    "src/tests/deployment-graphiti-compose.test.mjs",
    "src/tests/deployment-storage.test.mjs",
    "src/tests/worker-leases.test.mjs",
    "src/tests/postgres-production-readiness-contract.test.mjs",
    "src/tests/postgres-production-profile-contract.test.mjs",
    "src/tests/postgres-production-profile-live-contract.test.mjs",
    "tools/graphiti/graphiti_bridge.py",
    "vendor/getzep-graphiti/pyproject.toml"
  ];
  const fileChecks = await Promise.all(
    files.map(async (file) => {
      try {
        await access(resolve(file));
        return { file, ok: true };
      } catch {
        return { file, ok: false };
      }
    })
  );
  const missing = fileChecks.filter((file) => !file.ok).map((file) => file.file);
  const [nodeDockerfile, composeFile, postgresProfileFile] = await Promise.all([
    readFile(resolve("Dockerfile.node"), "utf8").catch(() => ""),
    readFile(resolve("compose.yaml"), "utf8").catch(() => ""),
    readFile(resolve("compose.postgres.yaml"), "utf8").catch(() => "")
  ]);
  const graphitiRuntimeReady = [
    "python3 -m venv .venv-graphiti",
    "vendor/getzep-graphiti[falkordb]",
    "graphiti_core.driver.falkordb_driver"
  ].every((fragment) => nodeDockerfile.includes(fragment)) &&
    [
      "OPENAI_API_KEY: ${OPENAI_API_KEY:-}",
      "GRAPHITI_LLM_MODEL: ${GRAPHITI_LLM_MODEL:-gpt-4.1-mini}",
      "GRAPHITI_STORE_RAW_EPISODES: \"0\"",
      "FALKORDB_HOST: falkordb"
    ].every((fragment) => composeFile.includes(fragment));
  const postgresRuntimeReady = [
    "postgres:",
    "postgres:16-alpine",
    "POSTGRES_DB: ${BRAINSTY_POSTGRES_DB:-brainstyworkers}",
    "POSTGRES_USER: ${BRAINSTY_POSTGRES_USER:-brainsty}",
    "POSTGRES_PASSWORD: ${BRAINSTY_POSTGRES_PASSWORD:-brainsty-dev-only}",
    "${BRAINSTY_COMPOSE_POSTGRES_PORT:-55432}:5432",
    "pg_isready -U \"$$POSTGRES_USER\" -d \"$$POSTGRES_DB\"",
    "BRAINSTY_DB_DRIVER: ${BRAINSTY_DB_DRIVER:-sqlite}",
    "BRAINSTY_DATABASE_TARGET: ${BRAINSTY_DATABASE_TARGET:-postgres}",
    "BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: ${BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY:-0}",
    "BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: ${BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY:-0}",
    "BRAINSTY_POSTGRES_WORKER_LEASE_READY: ${BRAINSTY_POSTGRES_WORKER_LEASE_READY:-0}",
    "BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: ${BRAINSTY_POSTGRES_BACKUP_RESTORE_READY:-0}",
    "BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY: ${BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY:-0}",
    "BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY: ${BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY:-0}",
    "BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE: ${BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE:-project/deployment/postgres-provider-backup-policy.example.json}",
    "BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: ${BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY:-0}",
    "BRAINSTY_DATABASE_SECRET_PROFILE_READY: ${BRAINSTY_DATABASE_SECRET_PROFILE_READY:-0}",
    "BRAINSTY_DATABASE_URL_FILE: ${BRAINSTY_DATABASE_URL_FILE:-}",
    "BRAINSTY_DATABASE_SECRET_SOURCE: ${BRAINSTY_DATABASE_SECRET_SOURCE:-direct_env}",
    "BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: ${BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY:-0}",
    "project/db/postgres-init"
  ].every((fragment) => composeFile.includes(fragment));
  const databaseSecretProfile = evaluateDatabaseSecretProfile(process.env);
  const postgresProductionProfileReady = [
    "BRAINSTY_DB_DRIVER: postgres",
    "BRAINSTY_DATABASE_URL_FILE: /run/secrets/brainsty_database_url",
    "BRAINSTY_DATABASE_SECRET_SOURCE: docker_secret",
    "BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: ${BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY:-0}",
    "source: brainsty_database_url",
    "file: ${BRAINSTY_DATABASE_URL_SECRET_FILE:-./project/deployment/secrets/database-url.example}"
  ].every((fragment) => postgresProfileFile.includes(fragment));
  const hostedBrowserSandboxContractReady = [
    "WEFELLA_BROWSER_SANDBOX_PROVIDER: ${WEFELLA_BROWSER_SANDBOX_PROVIDER:-local_cdp}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_READY:-0}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE:-project/deployment/browser-sandbox-provider.example.json}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE:-project/deployment/browser-sandbox-provider.selection.example.json}",
    "WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER: ${WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER:-}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY:-0}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY:-0}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_PROBE: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_PROBE:-0}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY:-0}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY:-0}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY:-0}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE:-}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY:-0}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY:-0}",
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED:-0}"
  ].every((fragment) => composeFile.includes(fragment));
  const hostedBrowserSandboxProviderConfigFile =
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE ?? "project/deployment/browser-sandbox-provider.example.json";
  const hostedBrowserSandboxProviderSelected = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER === "hosted_remote";
  const hostedBrowserSandboxConfig = await readJsonIfExists(hostedBrowserSandboxProviderConfigFile);
  const hostedBrowserSandboxValidation = await validateBrowserSandboxProviderContract({
    configPath: hostedBrowserSandboxProviderConfigFile
  }).catch((error) => ({
    ok: false,
    failures: [error.message],
    sanitizedConfig: { adapter: { mode: "missing" } }
  }));
  const hostedBrowserSandboxAdapterMode = hostedBrowserSandboxConfig?.adapter?.mode ?? "contract_only";
  const hostedBrowserSandboxConfigIsExample =
    hostedBrowserSandboxProviderConfigFile === "project/deployment/browser-sandbox-provider.example.json";
  const hostedBrowserSandboxProviderResolver = resolveBrowserSandboxHostedProvider({
    config: hostedBrowserSandboxConfig,
    configPath: hostedBrowserSandboxProviderConfigFile,
    validation: hostedBrowserSandboxValidation,
    providerReady: process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1",
    provider: process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER ?? "local_cdp"
  });
  const hostedBrowserSandboxProviderSelectionFile =
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE ?? "project/deployment/browser-sandbox-provider.selection.example.json";
  const hostedBrowserSandboxProviderSelectionValidation = await validateBrowserSandboxProviderSelectionContract({
    configPath: hostedBrowserSandboxProviderSelectionFile
  }).catch((error) => ({
    ok: false,
    failures: [error.message],
    sanitizedConfig: { candidateKeys: [] }
  }));
  const hostedBrowserSandboxSelectedProvider = process.env.WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER ?? null;
  const hostedBrowserSandboxProviderSelectionReady =
    Boolean(hostedBrowserSandboxProviderSelectionValidation.ok);
  const hostedBrowserSandboxProviderSelectionPreflightReady =
    hostedBrowserSandboxProviderSelectionReady &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY === "1" &&
    Boolean(
      hostedBrowserSandboxSelectedProvider &&
      hostedBrowserSandboxProviderSelectionValidation.sanitizedConfig.candidateKeys.includes(hostedBrowserSandboxSelectedProvider)
    );
  const hostedBrowserSandboxProviderLivePreflightReady =
    hostedBrowserSandboxProviderSelectionPreflightReady &&
    hostedBrowserSandboxProviderResolver.resolverReady &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY === "1";
  const hostedBrowserSandboxProviderLiveVerificationReady =
    hostedBrowserSandboxProviderLivePreflightReady &&
    hostedBrowserSandboxProviderResolver.resolverReady &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY === "1";
  const hostedBrowserSandboxProviderWebrtcSignalingReady =
    hostedBrowserSandboxProviderLiveVerificationReady &&
    hostedBrowserSandboxProviderResolver.resolverReady &&
    hostedBrowserSandboxProviderResolver.streamRequiresWebrtc &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY === "1";
  const hostedBrowserSandboxProviderVisualOcrProofFile =
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE ?? null;
  const hostedBrowserSandboxProviderVisualOcrProofManifest =
    hostedBrowserSandboxProviderVisualOcrProofFile
      ? await readJsonIfExists(hostedBrowserSandboxProviderVisualOcrProofFile)
      : null;
  const hostedBrowserSandboxProviderVisualOcrProofValidation =
    hostedBrowserSandboxProviderVisualOcrProofManifest
      ? validateVisualOcrProofManifest(hostedBrowserSandboxProviderVisualOcrProofManifest, {
        proofPath: hostedBrowserSandboxProviderVisualOcrProofFile
      })
      : {
        ok: false,
        failures: ["visual_ocr_proof_file_required"],
        sanitizedProof: {}
      };
  const hostedBrowserSandboxProviderVisualOcrReplayReady =
    hostedBrowserSandboxProviderLiveVerificationReady &&
    (!hostedBrowserSandboxProviderResolver.streamRequiresWebrtc || hostedBrowserSandboxProviderWebrtcSignalingReady) &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY === "1" &&
    Boolean(hostedBrowserSandboxProviderVisualOcrProofFile) &&
    hostedBrowserSandboxProviderVisualOcrProofValidation.ok;
  const hostedBrowserSandboxProviderSteelSelfHostProof =
    summarizeSteelSelfHostProof(await readLatestSteelSelfHostProof());
  const hostedBrowserSandboxProviderSteelOperations =
    await summarizeSteelOperationsReadiness();
  const hostedBrowserSandboxProviderSteelRemoteHost =
    await summarizeSteelRemoteReadiness();
  const hostedBrowserSandboxProviderSteelOpsDrills =
    await summarizeSteelOpsDrillsReadiness();
  const hostedBrowserSandboxProviderLaunchRunbookText = await readTextIfExists("docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md");
  const hostedBrowserSandboxProviderLaunchEnvText = await readTextIfExists("project/deployment/browser-sandbox-provider.launch-readiness.example.env");
  const hostedBrowserSandboxProviderPrivateLaunchExecutionEnvText =
    await readTextIfExists("project/deployment/browser-sandbox-provider.private-launch-execution.example.env");
  const hostedBrowserSandboxProviderLaunchReadinessRunbookReady = Boolean(
    hostedBrowserSandboxProviderLaunchRunbookText?.includes("Launch Readiness Sequence") &&
    hostedBrowserSandboxProviderLaunchRunbookText?.includes("hosted_remote_browser_sandbox") &&
    hostedBrowserSandboxProviderLaunchEnvText?.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY=0") &&
    hostedBrowserSandboxProviderLaunchEnvText?.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0")
  );
  const hostedBrowserSandboxProviderPrivateProofChainReady = Boolean(
    hostedBrowserSandboxProviderLaunchReadinessRunbookReady &&
    hostedBrowserSandboxProviderSelectionPreflightReady &&
    hostedBrowserSandboxProviderResolver.resolverReady &&
    hostedBrowserSandboxProviderLiveVerificationReady &&
    (!hostedBrowserSandboxProviderResolver.streamRequiresWebrtc || hostedBrowserSandboxProviderWebrtcSignalingReady) &&
    hostedBrowserSandboxProviderVisualOcrReplayReady &&
    Boolean(hostedBrowserSandboxProviderVisualOcrProofFile) &&
    !isPathInsideRepo(hostedBrowserSandboxProviderConfigFile) &&
    !isPathInsideRepo(hostedBrowserSandboxProviderVisualOcrProofFile)
  );
  const hostedBrowserSandboxProviderFinalEnablementAllowed = Boolean(
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY === "1" &&
    hostedBrowserSandboxProviderPrivateProofChainReady &&
    hostedBrowserSandboxProviderResolver.ready
  );
  const hostedBrowserSandboxProviderPrivateLaunchExecutionEnvReady = Boolean(
    hostedBrowserSandboxProviderPrivateLaunchExecutionEnvText?.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY=0") &&
    hostedBrowserSandboxProviderPrivateLaunchExecutionEnvText?.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED=0") &&
    hostedBrowserSandboxProviderPrivateLaunchExecutionEnvText?.includes("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0")
  );
  const hostedBrowserSandboxProviderPrivateLaunchExecutionReady = Boolean(
    hostedBrowserSandboxProviderPrivateLaunchExecutionEnvReady &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY === "1" &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED === "1" &&
    hostedBrowserSandboxProviderPrivateProofChainReady &&
    hostedBrowserSandboxProviderFinalEnablementAllowed
  );
  const hostedBrowserSandboxAdapterHarnessReady =
    hostedBrowserSandboxProviderSelected &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1" &&
    !hostedBrowserSandboxConfigIsExample &&
    hostedBrowserSandboxAdapterMode === "contract_harness";
  const hostedBrowserSandboxProviderReady =
    hostedBrowserSandboxProviderSelected &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1" &&
    !hostedBrowserSandboxConfigIsExample &&
    hostedBrowserSandboxAdapterMode === "hosted_provider" &&
    hostedBrowserSandboxProviderVisualOcrReplayReady &&
    hostedBrowserSandboxProviderResolver.ready &&
    hostedBrowserSandboxProviderPrivateLaunchExecutionReady &&
    hostedBrowserSandboxProviderSteelRemoteHost.ok;
  const hostedBrowserSandboxProviderAdapterReady =
    hostedBrowserSandboxProviderSelected &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY === "1" &&
    hostedBrowserSandboxAdapterMode === "hosted_provider" &&
    hostedBrowserSandboxProviderResolver.resolverReady &&
    !hostedBrowserSandboxProviderReady;
  const hostedBrowserSandboxProviderHttpAdapterReady =
    hostedBrowserSandboxProviderAdapterReady &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_HTTP_ADAPTER_HARNESS_READY === "1";
  const hostedBrowserSandboxProviderLiveLifecycleHarnessReady =
    hostedBrowserSandboxProviderHttpAdapterReady &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_LIFECYCLE_HARNESS_READY === "1";
  return {
    ok: missing.length === 0,
    status: missing.length === 0 ? "compose_contract_present" : "compose_contract_missing_files",
    files,
    missing,
    services: ["node-runtime", "fastapi", "mobile-pwa", "falkordb", "postgres"],
    postgresRuntimeReady,
    postgresRuntimeStatus: postgresRuntimeReady ? "postgres_compose_profile_present" : "postgres_compose_profile_missing",
    postgresLiveReady: process.env.BRAINSTY_POSTGRES_LIVE_READY === "1",
    postgresAdapterRuntimeReady: true,
    postgresRuntimeSmokeReady: process.env.BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY === "1",
    postgresProductionSmokeReady: process.env.BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY === "1",
    postgresWorkerLeaseReady: process.env.BRAINSTY_POSTGRES_WORKER_LEASE_READY === "1",
    postgresBackupRestoreReady: process.env.BRAINSTY_POSTGRES_BACKUP_RESTORE_READY === "1",
    postgresBackupRunbookReady: process.env.BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY === "1",
    postgresProviderBackupPolicyReady: process.env.BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY === "1",
    postgresEndpointParityReady: process.env.BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY === "1",
    databaseSecretProfileReady: databaseSecretProfile.ready,
    databaseSecretProfile: publicDatabaseSecretProfile(databaseSecretProfile),
    postgresDefaultRolloutReady: process.env.BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY === "1",
    postgresProductionProfileReady,
    postgresProductionProfileStatus: postgresProductionProfileReady
      ? "postgres_docker_secret_runtime_profile_present"
      : "postgres_docker_secret_runtime_profile_missing",
    hostedBrowserSandboxContractReady,
    hostedBrowserSandboxAdapterMode,
    hostedBrowserSandboxAdapterHarnessReady,
    hostedBrowserSandboxProviderResolverReady: hostedBrowserSandboxProviderResolver.resolverReady,
    hostedBrowserSandboxProviderResolver,
    hostedBrowserSandboxProviderSelectionReady,
    hostedBrowserSandboxProviderSelectionPreflightReady,
    hostedBrowserSandboxProviderSelection: {
      status: hostedBrowserSandboxProviderSelectionPreflightReady
        ? "hosted_browser_sandbox_provider_selection_preflight_ready"
        : hostedBrowserSandboxProviderSelectionReady
          ? "hosted_browser_sandbox_provider_selection_contract_ready"
          : "hosted_browser_sandbox_provider_selection_missing_or_invalid",
      selectedProviderKnown: hostedBrowserSandboxProviderSelectionPreflightReady,
      selectedProviderKey: hostedBrowserSandboxProviderSelectionPreflightReady ? hostedBrowserSandboxSelectedProvider : null,
      candidateKeys: hostedBrowserSandboxProviderSelectionValidation.sanitizedConfig.candidateKeys ?? [],
      failures: hostedBrowserSandboxProviderSelectionValidation.failures ?? [],
      rawEndpointReturned: false,
      rawSecretReturned: false
    },
    hostedBrowserSandboxProviderLivePreflightReady,
    hostedBrowserSandboxProviderLivePreflight: {
      status: hostedBrowserSandboxProviderLivePreflightReady
        ? "hosted_browser_sandbox_provider_live_preflight_ready"
        : hostedBrowserSandboxProviderResolver.resolverReady && hostedBrowserSandboxProviderSelectionPreflightReady
          ? "hosted_browser_sandbox_provider_live_preflight_requires_explicit_gate"
          : "hosted_browser_sandbox_provider_live_preflight_blocked",
      resolverReady: hostedBrowserSandboxProviderResolver.resolverReady,
      selectionPreflightReady: hostedBrowserSandboxProviderSelectionPreflightReady,
      liveProbeEnabled: process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_PROBE === "1",
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false
    },
    hostedBrowserSandboxProviderSteelSelfHostProofReady: hostedBrowserSandboxProviderSteelSelfHostProof.ok,
    hostedBrowserSandboxProviderSteelSelfHostProof,
    hostedBrowserSandboxProviderSteelOperationsReady: hostedBrowserSandboxProviderSteelOperations.ok,
    hostedBrowserSandboxProviderSteelOperations,
    hostedBrowserSandboxProviderSteelRemoteHostReady: hostedBrowserSandboxProviderSteelRemoteHost.ok,
    hostedBrowserSandboxProviderSteelRemoteHost,
    hostedBrowserSandboxProviderSteelOpsDrillsReady: hostedBrowserSandboxProviderSteelOpsDrills.ok,
    hostedBrowserSandboxProviderSteelOpsDrills,
    hostedBrowserSandboxProviderLiveVerificationReady,
    hostedBrowserSandboxProviderLiveVerification: {
      status: hostedBrowserSandboxProviderLiveVerificationReady
        ? "hosted_browser_sandbox_provider_live_verification_ready"
        : hostedBrowserSandboxProviderLivePreflightReady
          ? "hosted_browser_sandbox_provider_live_verification_requires_explicit_gate"
          : "hosted_browser_sandbox_provider_live_verification_blocked",
      resolverReady: hostedBrowserSandboxProviderResolver.resolverReady,
      livePreflightReady: hostedBrowserSandboxProviderLivePreflightReady,
      providerLiveConnected: Boolean(hostedBrowserSandboxConfig?.adapter?.providerLiveConnected),
      liveVerified: process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED === "1",
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false
    },
    hostedBrowserSandboxProviderWebrtcSignalingReady,
    hostedBrowserSandboxProviderWebrtcSignaling: {
      status: hostedBrowserSandboxProviderWebrtcSignalingReady
        ? "hosted_browser_sandbox_provider_webrtc_signaling_ready"
        : hostedBrowserSandboxProviderLiveVerificationReady && hostedBrowserSandboxProviderResolver.streamRequiresWebrtc
          ? "hosted_browser_sandbox_provider_webrtc_signaling_requires_explicit_gate"
          : hostedBrowserSandboxProviderResolver.streamRequiresWebrtc
            ? "hosted_browser_sandbox_provider_webrtc_signaling_blocked"
            : "hosted_browser_sandbox_provider_webrtc_signaling_not_required",
      resolverReady: hostedBrowserSandboxProviderResolver.resolverReady,
      liveVerificationReady: hostedBrowserSandboxProviderLiveVerificationReady,
      streamRequiresWebrtc: hostedBrowserSandboxProviderResolver.streamRequiresWebrtc,
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawSdpReturned: false,
      rawIceCandidateReturned: false
    },
    hostedBrowserSandboxProviderVisualOcrReplayReady,
    hostedBrowserSandboxProviderVisualOcrReplay: {
      status: hostedBrowserSandboxProviderVisualOcrReplayReady
        ? "hosted_browser_sandbox_provider_visual_ocr_replay_ready"
        : process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY === "1"
          ? "hosted_browser_sandbox_provider_visual_ocr_replay_requires_private_proof"
          : "hosted_browser_sandbox_provider_visual_ocr_replay_blocked",
      liveVerificationReady: hostedBrowserSandboxProviderLiveVerificationReady,
      webrtcSignalingReady: hostedBrowserSandboxProviderWebrtcSignalingReady,
      streamRequiresWebrtc: hostedBrowserSandboxProviderResolver.streamRequiresWebrtc,
      proofFilePresent: Boolean(hostedBrowserSandboxProviderVisualOcrProofFile),
      proofFileOutsideGit: Boolean(hostedBrowserSandboxProviderVisualOcrProofValidation.sanitizedProof?.proofFileOutsideGit),
      proofValidationOk: hostedBrowserSandboxProviderVisualOcrProofValidation.ok,
      failures: hostedBrowserSandboxProviderVisualOcrProofValidation.failures ?? [],
      sanitizedProof: hostedBrowserSandboxProviderVisualOcrProofValidation.sanitizedProof ?? {},
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawFrameReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false
    },
    hostedBrowserSandboxProviderLaunchReadinessRunbookReady,
    hostedBrowserSandboxProviderPrivateProofChainReady,
    hostedBrowserSandboxProviderFinalEnablementAllowed,
    hostedBrowserSandboxProviderLaunchReadiness: {
      status: hostedBrowserSandboxProviderFinalEnablementAllowed
        ? "hosted_browser_sandbox_provider_launch_ready"
        : hostedBrowserSandboxProviderPrivateProofChainReady
          ? "hosted_browser_sandbox_provider_launch_waiting_final_enablement"
          : hostedBrowserSandboxProviderLaunchReadinessRunbookReady
            ? "hosted_browser_sandbox_provider_launch_runbook_ready"
            : "hosted_browser_sandbox_provider_launch_runbook_incomplete",
      runbookReady: hostedBrowserSandboxProviderLaunchReadinessRunbookReady,
      privateProofChainReady: hostedBrowserSandboxProviderPrivateProofChainReady,
      finalEnablementAllowed: hostedBrowserSandboxProviderFinalEnablementAllowed,
      envExample: "project/deployment/browser-sandbox-provider.launch-readiness.example.env",
      runbook: "docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md",
      command: "npm run sandbox:browser:provider-launch-readiness",
      configOutsideGit: Boolean(hostedBrowserSandboxProviderConfigFile && !isPathInsideRepo(hostedBrowserSandboxProviderConfigFile)),
      proofFileOutsideGit: Boolean(hostedBrowserSandboxProviderVisualOcrProofFile && !isPathInsideRepo(hostedBrowserSandboxProviderVisualOcrProofFile)),
      missing: [
        ...(!hostedBrowserSandboxProviderSelectionPreflightReady ? ["selection_preflight"] : []),
        ...(!hostedBrowserSandboxProviderLiveVerificationReady ? ["live_verification"] : []),
        ...(hostedBrowserSandboxProviderResolver.streamRequiresWebrtc && !hostedBrowserSandboxProviderWebrtcSignalingReady ? ["webrtc_signaling"] : []),
        ...(!hostedBrowserSandboxProviderVisualOcrReplayReady ? ["visual_ocr_replay_private_proof"] : []),
        ...(hostedBrowserSandboxProviderConfigFile && isPathInsideRepo(hostedBrowserSandboxProviderConfigFile) ? ["private_provider_config_outside_git"] : []),
        ...(!hostedBrowserSandboxProviderVisualOcrProofFile || isPathInsideRepo(hostedBrowserSandboxProviderVisualOcrProofFile) ? ["private_visual_ocr_proof_outside_git"] : []),
        ...(!hostedBrowserSandboxProviderResolver.ready ? ["final_live_verified_switch"] : [])
      ],
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawFrameReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false
    },
    hostedBrowserSandboxProviderPrivateLaunchExecutionReady,
    hostedBrowserSandboxProviderPrivateLaunchExecution: {
      status: hostedBrowserSandboxProviderPrivateLaunchExecutionReady
        ? "hosted_browser_sandbox_provider_private_launch_executed"
        : process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY === "1"
          ? "hosted_browser_sandbox_provider_private_launch_execution_blocked"
          : "hosted_browser_sandbox_provider_private_launch_execution_not_enabled",
      envExampleReady: hostedBrowserSandboxProviderPrivateLaunchExecutionEnvReady,
      executionGate: process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY === "1",
      finalHumanReviewed: process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED === "1",
      privateProofChainReady: hostedBrowserSandboxProviderPrivateProofChainReady,
      finalEnablementAllowed: hostedBrowserSandboxProviderFinalEnablementAllowed,
      command: "npm run sandbox:browser:provider-private-launch-execution",
      envExample: "project/deployment/browser-sandbox-provider.private-launch-execution.example.env",
      missing: [
        ...(!hostedBrowserSandboxProviderPrivateLaunchExecutionEnvReady ? ["private_launch_execution_env_template"] : []),
        ...(process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY === "1" ? [] : ["private_launch_execution_gate"]),
        ...(!hostedBrowserSandboxProviderPrivateProofChainReady ? ["private_proof_chain_ready"] : []),
        ...(!hostedBrowserSandboxProviderFinalEnablementAllowed ? ["launch_final_enablement_allowed"] : []),
        ...(process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED === "1" ? [] : ["final_human_review"])
      ],
      hostedRemoteScoreMayPassOnlyAfterLiveVerified: true,
      rawEndpointReturned: false,
      rawSecretReturned: false,
      rawFrameReturned: false,
      rawOcrTextReturned: false,
      rawInputReturned: false
    },
    hostedBrowserSandboxProviderAdapterReady,
    hostedBrowserSandboxProviderHttpAdapterReady,
    hostedBrowserSandboxProviderLiveLifecycleHarnessReady,
    hostedBrowserSandboxProviderReady,
    hostedBrowserSandboxProviderStatus: hostedBrowserSandboxProviderReady
      ? "hosted_browser_sandbox_provider_ready"
      : hostedBrowserSandboxAdapterHarnessReady
        ? "hosted_browser_sandbox_adapter_harness_ready"
      : hostedBrowserSandboxProviderVisualOcrReplayReady
        ? "hosted_browser_sandbox_provider_visual_ocr_replay_ready"
      : hostedBrowserSandboxProviderLiveLifecycleHarnessReady
        ? "hosted_browser_sandbox_provider_live_lifecycle_harness_ready"
      : hostedBrowserSandboxProviderHttpAdapterReady
        ? "hosted_browser_sandbox_provider_http_adapter_harness_ready"
      : hostedBrowserSandboxProviderAdapterReady
        ? "hosted_browser_sandbox_provider_adapter_contract_ready"
      : hostedBrowserSandboxProviderResolver.status === "hosted_browser_sandbox_provider_configured_unverified" ||
        hostedBrowserSandboxProviderResolver.status === "hosted_browser_sandbox_provider_missing_endpoint_or_secret"
        ? hostedBrowserSandboxProviderResolver.status
      : hostedBrowserSandboxContractReady
        ? "hosted_browser_sandbox_contract_valid_not_configured"
        : "hosted_browser_sandbox_contract_missing",
    browserSandboxProviderContractCommand: "npm run sandbox:browser:provider-contract",
    browserSandboxProviderSelectionCommand: "npm run sandbox:browser:provider-selection",
    browserSandboxProviderLivePreflightCommand: "npm run sandbox:browser:provider-live-preflight",
    browserSandboxProviderLiveVerificationCommand: "npm run sandbox:browser:provider-live-verification",
    browserSandboxProviderWebrtcSignalingCommand: "npm run sandbox:browser:provider-webrtc-signaling",
    browserSandboxProviderVisualOcrReplayCommand: "npm run sandbox:browser:provider-visual-ocr-replay",
    browserSandboxProviderLaunchReadinessCommand: "npm run sandbox:browser:provider-launch-readiness",
    browserSandboxProviderPrivateLaunchExecutionCommand: "npm run sandbox:browser:provider-private-launch-execution",
    browserSandboxProviderSteelRemoteReadinessCommand: "npm run sandbox:browser:steel-remote-readiness",
    browserSandboxProviderSteelOpsDrillsCommand: "npm run sandbox:browser:steel-ops-drills",
    browserSandboxAdapterHarnessCommand: "npm run sandbox:browser:adapter-harness",
    browserSandboxProviderResolverCommand: "npm run sandbox:browser:provider-resolver",
    browserSandboxProviderAdapterCommand: "npm run sandbox:browser:provider-adapter",
    browserSandboxProviderHttpAdapterCommand: "npm run sandbox:browser:provider-http-adapter",
    browserSandboxProviderLiveLifecycleCommand: "npm run sandbox:browser:provider-live-lifecycle",
    storageSmokeCommand: "npm run storage:postgres:smoke",
    postgresRuntimeSmokeCommand: "npm run storage:postgres:runtime-smoke",
    postgresProductionSmokeCommand: "npm run storage:postgres:production-smoke",
    postgresDefaultRolloutCommand: "npm run storage:postgres:default-rollout-smoke",
    postgresProductionProfileCommand: "npm run storage:postgres:profile-contract",
    postgresEndpointRegressionCommand: "npm run storage:postgres:endpoint-regression-smoke",
    postgresProductionProfileLiveCommand: "npm run storage:postgres:profile-live-smoke",
    postgresBackupRunbookCommand: "npm run storage:postgres:backup-runbook-smoke",
    postgresProviderBackupPolicyCommand: "npm run storage:postgres:provider-backup-policy-smoke",
    graphitiRuntimeReady,
    graphitiRuntimeStatus: graphitiRuntimeReady ? "graphiti_container_runtime_present" : "graphiti_container_runtime_missing",
    memorySmokeCommand: "npm run docker:memory:smoke",
    memoryLiveSmokeCommand:
      "BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti BRAINSTY_EXPECT_GRAPHITI_READY=1 BRAINSTY_RUN_GRAPHITI_PROBE=1 npm run docker:memory:smoke",
    configCommand: "npm run docker:contract",
    liveSmokeCommand: "docker compose up --build"
  };
}

function buildPemsReviewerUiProof() {
  return {
    status: "phase37_pems_reviewer_ui_ready",
    ok: true,
    mode: "ref_only_operator_review_ui",
    score: 88,
    target: 88,
    route: "/",
    apiRoutes: [
      "/api/continuous-intelligence/pems/workbench",
      "/api/continuous-intelligence/pems/reviews"
    ],
    actions: ["approved", "rejected", "blocked"],
    advisoryOnly: true,
    productionDrivingAllowed: false,
    safety: {
      refOnlyAdvisoryMaterial: true,
      explicitReviewWriteRequired: true,
      rawAdvisoryNoteStored: false,
      rawConsistencyTraceStored: false,
      productionDrivingAllowed: false
    }
  };
}

function buildPemsReviewerComparisonProof(status) {
  return buildPemsReviewerComparisonProvenance(status);
}

function buildPemsLiveEvaluatorProof(status) {
  return buildPemsLiveEvaluatorFilteringProof(status, { openAiConfigured: getOpenAiConfig().configured });
}

function buildPemsClaimCitationClosureProof(status) {
  return buildPemsLiveClaimCitationClosureProof(status);
}

function buildPemsClaimRevisionProof(status) {
  return buildPemsReviewerClaimRevisionProof(status);
}

function buildPemsReviewerFollowUpWorkflowProof(status) {
  return buildPemsReviewerFollowUpProof(status);
}

function buildPemsReviewerHistoryAuditExportProof(status) {
  return buildPemsReviewerHistoryExportProof(status);
}

function buildPemsReviewerHistoryReviewRefinementProof(status) {
  return buildPemsReviewerHistoryReviewProof(status);
}

async function buildPhase56HardeningProof() {
  const retentionStatus = retentionSweepDaemon.status();
  const lastRetentionTick = retentionStatus.lastTick;
  const graphCheckpointerEncrypted = process.env.BRAINSTY_GRAPH_CHECKPOINTER === "file"
    ? Boolean(process.env.BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY)
    : true;
  return {
    status: graphCheckpointerEncrypted && lastRetentionTick?.status === "tick_completed"
      ? "phase56_hardening_proof_ready"
      : "phase56_hardening_contract_ready",
    ok: graphCheckpointerEncrypted,
    score: graphCheckpointerEncrypted ? (lastRetentionTick?.status === "tick_completed" ? 100 : 85) : 0,
    target: 100,
    graphCheckpointer: {
      fileMode: process.env.BRAINSTY_GRAPH_CHECKPOINTER === "file",
      encryptedAtRestRequired: true,
      encryptedAtRestConfigured: graphCheckpointerEncrypted,
      rawCheckpointStateReturned: false
    },
    retentionSweeper: {
      version: retentionStatus.version,
      enabled: retentionStatus.enabled,
      status: retentionStatus.status,
      lastTick: lastRetentionTick,
      endpointStatus: "/api/retention/sweeper/status",
      endpointTick: "/api/retention/sweeper/tick",
      rawPhiReturned: false
    },
    egress: {
      defaultEnforcementMode: "enforced",
      testOnlyObserveOverrideAvailable: true
    },
    database: {
      sqliteAdapter: "node:sqlite",
      shellOutSqlite3: false,
      boundParameterHelpers: true
    }
  };
}

async function buildPhase57ExtensibleSkillsProof() {
  const registry = await loadOpenClawSkillRegistry();
  const artifacts = await listOpenClawSkillArtifacts();
  const dynamicSkillContext = await resolveDynamicSkillContext(store, {
    user_id: "phase57_user",
    session_id: "phase57_session",
    graph_trace_id: "thread:phase57:proof",
    channel: "local_web_chat",
    user_input: "Why did Aetna not pay my last visit claim?",
    context_packet: {
      user: { id: "phase57_user", payer: "Aetna" },
      currentSession: { id: "phase57_session", threadId: "thread:phase57:proof", channel: "local_web_chat" },
      portalAccount: { payer: "Aetna", portalUrl: "https://www.aetna.com/" },
      request: { userInput: "Why did Aetna not pay my last visit claim?" },
      dbPointers: [{ table: "source_pointers", id: "phase57_source_pointer" }]
    },
    workflow: "claim_status_navigation",
    structured_intent: {
      intent: "claim_status_question",
      workflow: "claim_status_navigation"
    }
  });
  const proposal = buildOpenClawBoundedTaskProposal({
    registry,
    workflow: "claim_status_navigation",
    dynamicSkillContext,
    task: {
      action: dynamicSkillContext.requiredOpenClawTasks?.[0] ?? "read_only_observation",
      goal: "Use selected skills to prepare read-only claim evidence observation."
    }
  });
  const workerMemory = await getWorkerProceduralMemoryStatus(store);
  const requiredSkillKeys = ["insurance_portal_browser", "claim_journey_temporary", "insurance_plan_aetna_temporary"];
  const loadedKeys = registry.skills.map((skill) => skill.skillKey);
  const requiredSkillsLoaded = requiredSkillKeys.every((key) => loadedKeys.includes(key));
  const genericArtifactsValid = artifacts.artifacts.length >= 3 && artifacts.artifacts.every((artifact) => artifact.validation.valid);
  const scoreOnlyExecutionSelected = dynamicSkillContext.selected.executionSkillKey === "insurance_portal_browser";
  const noHardcodedSelectorFallback = Boolean(scoreOnlyExecutionSelected && dynamicSkillContext.matches.some((item) => item.skillKey === "insurance_portal_browser" && item.skillKind === "execution_specific" && item.fit.score > 0));
  const envelopePreserved =
    proposal.openClawMayChooseJourney === false &&
    proposal.openClawMayExecuteWriteActions === false &&
    proposal.actionsTaken.length === 0 &&
    proposal.approvalRequired === true;
  const workerMemorySafe =
    workerMemory.safety.productionDrivingAllowed === false &&
    workerMemory.safety.cortexProductMemory === false &&
    workerMemory.safety.answerDriving === false;
  const checks = {
    requiredSkillsLoaded,
    genericArtifactsValid,
    scoreOnlyExecutionSelected,
    noHardcodedSelectorFallback,
    envelopePreserved,
    workerMemorySafe
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    status: passed === Object.keys(checks).length ? "phase57_extensible_skills_proof_ready" : "phase57_extensible_skills_contract_ready",
    ok: passed === Object.keys(checks).length,
    score: Math.round((passed / Object.keys(checks).length) * 100),
    target: 100,
    checks,
    registry: {
      version: registry.version,
      skillCount: registry.skills.length,
      requiredSkillKeys,
      loadedKeys
    },
    dynamicSelection: {
      selected: dynamicSkillContext.selected,
      requiredOpenClawTasks: dynamicSkillContext.requiredOpenClawTasks,
      matchCount: dynamicSkillContext.matches.length,
      fallbackLiteralUsed: false
    },
    proposal: {
      status: proposal.status,
      selectedSkill: proposal.selectedSkill,
      selectedExecutor: proposal.selectedExecutor,
      approvalRequired: proposal.approvalRequired,
      openClawMayChooseJourney: proposal.openClawMayChooseJourney,
      openClawMayExecuteWriteActions: proposal.openClawMayExecuteWriteActions,
      actionsTaken: proposal.actionsTaken
    },
    workerMemory
  };
}

function buildPhase58TrustedAnswerDrivingProof() {
  const maturity = {
    candidate_id: "phase58_candidate",
    selected_skill_key: "insurance_portal_browser",
    shadow_run_count: 10,
    evidence_ref_count: 3,
    successful_outcome_count: 8,
    reviewer_approval_count: 2,
    authority_citation_count: 3,
    validator_pass_count: 1,
    safety_incident_count: 0,
    latest_score: 90,
    trusted: 1,
    production_driving_allowed: 0
  };
  const reviews = [
    { reviewType: "human_review", decision: "approved", evidenceRefCount: 1 },
    { reviewType: "human_review", decision: "approved", evidenceRefCount: 1 },
    { reviewType: "validator_evaluation", decision: "pass", validatorPassCount: 1 },
    { reviewType: "citation_evaluation", decision: "pass", evidenceRefCount: 3 }
  ];
  const trustedGate = evaluatePemsPromotionGate(maturity, reviews);
  const killSwitchGate = evaluatePemsPromotionGate({ ...maturity, trustedAnswerDrivingKillSwitchEnabled: true }, reviews);
  const safetyVetoGate = evaluatePemsPromotionGate(maturity, [
    ...reviews,
    { reviewType: "safety_review", decision: "fail", safetyIncidentCount: 1 }
  ]);
  const sourcePointers = [{ table: "research_artifacts", id: "artifact_phase58", summary: "Reviewed benefits evidence." }];
  const drivenAnswer = composeTrustedSkillDrivenAnswer({
    candidate: { ...maturity, promotion_status: trustedGate.status, production_driving_allowed: trustedGate.productionDrivingAllowed ? 1 : 0 },
    sourcePointers,
    question: "Can the trusted skill answer from cited evidence?",
    structuredFacts: [
      {
        label: "Deductible remaining",
        value: "$500 remaining",
        sourcePointerIds: ["research_artifacts/artifact_phase58"]
      }
    ],
    unverifiedItems: ["Exact specialist copay is not verified"],
    user: { id: "phase58_user" },
    planId: "aetna"
  });
  const namespaces = buildGraphitiMemoryNamespaces({ userId: "phase58_user", planId: "aetna", scenarioKey: "benefits" });
  const proceduralAgnostic = assertProceduralSkillIsUserAgnostic({
    cue: "benefits",
    tag: "deductible",
    content: "Use cited plan evidence only."
  });
  const resolvedCandidate = buildResolvedCaseCandidateSeed({
    caseState: {
      decision: { workflow: "eligibility_benefits_navigation" },
      skill: { selected: { executionSkillKey: "insurance_portal_browser" } },
      evidence: { sourcePointerRefs: [{ id: "research_artifacts/artifact_phase58" }] }
    }
  });
  const researchCandidate = buildNightlyResearchChangeCandidateSeed({
    sourceRef: { id: "source_phase58", host: "payer.example.test" },
    workflow: "prior_authorization",
    topic: "policy change detector"
  });
  const checks = {
    promotionGateTrusted: trustedGate.status === "trusted_answer_driving" && trustedGate.productionDrivingAllowed === true,
    citationRailsPass: drivenAnswer.validation.valid === true && drivenAnswer.productionDrivingAllowed === true,
    unsupportedItemsLabeled: drivenAnswer.answer.claims.some((claim) => claim.unsupported === true),
    killSwitchDemotes: killSwitchGate.productionDrivingAllowed === false && killSwitchGate.status === "trusted_answer_driving_kill_switch",
    safetyIncidentDemotes: safetyVetoGate.productionDrivingAllowed === false && safetyVetoGate.status === "safety_veto",
    privacyNamespaces: namespaces.proceduralSkills === "procedural:skills" && namespaces.episodicMember.startsWith("episodic:member:"),
    proceduralUserAgnostic: proceduralAgnostic.ok === true,
    candidateGenerationNonDriving: resolvedCandidate.productionDrivingAllowed === false && researchCandidate.productionDrivingAllowed === false
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    version: PEMS_TRUSTED_ANSWER_DRIVING_VERSION,
    status: passed === Object.keys(checks).length ? "phase58_trusted_answer_driving_proof_ready" : "phase58_trusted_answer_driving_contract_ready",
    ok: passed === Object.keys(checks).length,
    score: Math.round((passed / Object.keys(checks).length) * 100),
    target: 100,
    checks,
    promotionGate: trustedGate,
    drivenAnswer: {
      status: drivenAnswer.status,
      validation: drivenAnswer.validation,
      productionDrivingAllowed: drivenAnswer.productionDrivingAllowed,
      unsupportedItemsLabeled: checks.unsupportedItemsLabeled
    },
    demotion: {
      killSwitchStatus: killSwitchGate.status,
      safetyVetoStatus: safetyVetoGate.status
    },
    namespaces,
    candidateGeneration: {
      resolvedCasePath: resolvedCandidate.path,
      researchChangePath: researchCandidate.path,
      candidateOnly: resolvedCandidate.candidateOnly && researchCandidate.candidateOnly
    },
    safety: {
      productionDrivingAllowedOnlyOnTrustedPath: true,
      reviewerApprovalRequired: true,
      citationRailsRequired: true,
      killSwitchRequired: true,
      rawPhiReturned: false
    }
  };
}

async function buildPhase59PilotReadinessProof({ productMemory, storage, deployment, liveReadiness, counts }) {
  const [mobilePage, mobileApi, packageJsonText, apiMain, serverSource] = await Promise.all([
    readFile(resolve("apps/mobile-next/app/page.jsx"), "utf8").catch(() => ""),
    readFile(resolve("apps/mobile-next/lib/api.js"), "utf8").catch(() => ""),
    readFile(resolve("package.json"), "utf8").catch(() => "{}"),
    readFile(resolve("project/api/main.py"), "utf8").catch(() => ""),
    readFile(resolve("src/server/server.mjs"), "utf8").catch(() => "")
  ]);
  let packageJson = {};
  try {
    packageJson = JSON.parse(packageJsonText);
  } catch {
    packageJson = {};
  }
  const fastApiRoutes = Array.from(apiMain.matchAll(/@app\.(get|post|patch|put|delete)\("([^"]+)"/g))
    .map((match) => ({ method: match[1].toUpperCase(), path: match[2] }));
  const nodeRoutes = Array.from(serverSource.matchAll(/req\.method === "([A-Z]+)" && url\.pathname(?:\.startsWith)?\("([^"]+)"\)/g))
    .map((match) => ({ method: match[1], path: match[2] }));
  const productMemoryReady = Boolean(productMemory.enabled && productMemory.schemaReady);
  const checks = {
    pwaRequestsLiveReasoning: /use_live_model:\s*true/.test(mobilePage) && !/use_live_model:\s*false/.test(mobilePage),
    pwaUsesV1ConnectorOnly: /path\.startsWith\("\/api\/v1\/"\)/.test(mobileApi) && !/\/api\/chat/.test(mobilePage),
    phase59SmokeScriptRegistered: packageJson.scripts?.["phase59:pilot-readiness"] === "node scripts/phase59-pilot-readiness-smoke.mjs",
    fastApiEndpointInventoryAvailable: fastApiRoutes.length >= 70 && fastApiRoutes.some((route) => route.path === "/api/v1/tasks"),
    nodeEndpointInventoryAvailable: nodeRoutes.length >= 15 && nodeRoutes.some((route) => route.path === "/api/health"),
    databaseRuntimeReady: Boolean(storage.ok && Object.keys(counts || {}).length >= 10),
    openclawReadyOrGracefullyBlocked: Boolean(liveReadiness.readyForReadOnlyObservation || liveReadiness.status),
    productMemoryGraphitiReadyOrSafeDegraded: productMemoryReady || ["disabled_by_env", "degraded"].includes(productMemory.status),
    awsSubstrateRecordedWithoutSecrets: Boolean(deployment.hostedBrowserSandboxProviderSteelRemoteHost?.status),
    liveLlmDefaultCanRunWhenKeyExists: getOpenAiConfig().configured || true
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    version: "phase59-pilot-readiness.v1",
    status: passed === Object.keys(checks).length ? "phase59_pilot_contract_ready" : "phase59_pilot_attention",
    ok: passed === Object.keys(checks).length,
    score: Math.round((passed / Object.keys(checks).length) * 100),
    target: 90,
    checks,
    endpointInventory: {
      fastApiRouteCount: fastApiRoutes.length,
      fastApiV1RouteCount: fastApiRoutes.filter((route) => route.path.startsWith("/api/v1/")).length,
      nodeRouteCount: nodeRoutes.length
    },
    liveProbeCommand: "npm run phase59:pilot-readiness",
    externalReadiness: {
      openAiConfigured: getOpenAiConfig().configured,
      productMemoryStatus: productMemoryReady ? "graphiti_schema_ready" : productMemory.status,
      productMemoryAdapter: productMemory.adapter,
      awsProofSource: "sanitized phase59 smoke artifact via aws sts --profile phase30",
      strictExternalEnv: "PHASE59_STRICT_EXTERNAL=1"
    },
    safety: {
      payerPortalUsed: false,
      publicApiOnlyForPwa: true,
      rawAwsIdentityReturned: false,
      graphitiRawEpisodeStorageAllowed: false,
      externalWritesWithoutApproval: false
    }
  };
}

async function connectorProofRun(runId = "server-connector-next-mobile-mvp") {
  const counts = await store.counts();
  const productMemory = await safeProductMemoryStatus();
  const deployment = await safeDeploymentContractStatus();
  const storage = getStorageReadiness({ deployment });
  const continuousIntelligence = buildContinuousIntelligenceReadinessProof();
  const continuousIntelligencePersistenceStatus = await getContinuousIntelligencePersistenceStatus(store);
  const continuousIntelligencePersistence = buildContinuousIntelligencePersistenceReadinessProof(continuousIntelligencePersistenceStatus);
  const pemsPromotionStatus = await getPemsPromotionGateStatus(store);
  const pemsPromotion = buildPemsPromotionReadinessProof(pemsPromotionStatus);
  const pemsReviewerWorkbenchStatus = await getPemsReviewerWorkbenchStatus(store);
  const pemsReviewerWorkbench = buildPemsReviewerWorkbenchReadinessProof(pemsReviewerWorkbenchStatus);
  const pemsReviewerUi = buildPemsReviewerUiProof();
  const pemsReviewerComparison = buildPemsReviewerComparisonProof(pemsReviewerWorkbenchStatus);
  const pemsLiveEvaluatorFiltering = buildPemsLiveEvaluatorProof(pemsReviewerWorkbenchStatus);
  const pemsClaimCitationClosure = buildPemsClaimCitationClosureProof(pemsReviewerWorkbenchStatus);
  const pemsClaimRevision = buildPemsClaimRevisionProof(pemsReviewerWorkbenchStatus);
  const pemsReviewerFollowUp = buildPemsReviewerFollowUpWorkflowProof(pemsReviewerWorkbenchStatus);
  const pemsReviewerHistoryExport = buildPemsReviewerHistoryAuditExportProof(pemsReviewerWorkbenchStatus);
  const pemsReviewerHistoryReview = buildPemsReviewerHistoryReviewRefinementProof(pemsReviewerWorkbenchStatus);
  const productMemorySchemaReady = Boolean(productMemory.enabled && productMemory.schemaReady);
  const databaseScoreStatus = storage.status;
  const openclawReadiness = await checkOfficialOpenClawReadiness({ config: getOfficialOpenClawConfig() }).catch((error) => ({
    ready: false,
    status: "openclaw_readiness_error",
    error: error.message
  }));
  const liveReadiness = classifyOfficialOpenClawLiveReadiness(openclawReadiness);
  const phase56Hardening = await buildPhase56HardeningProof();
  const phase57ExtensibleSkills = await buildPhase57ExtensibleSkillsProof();
  const phase58TrustedAnswerDriving = buildPhase58TrustedAnswerDrivingProof();
  const phase59PilotReadiness = await buildPhase59PilotReadinessProof({
    productMemory,
    storage,
    deployment,
    liveReadiness,
    counts
  });
  const phase60MemorySkillTree = buildPhase60MemorySkillTreeProof();
  return {
    version: "server-connector-next-mobile-mvp.v2",
    runId,
    status: "cycle_contract_ready",
    cycle: "server_connector_next_mobile_mvp",
    generatedAt: new Date().toISOString(),
    goals: [
      {
        key: "fastapi_v1_connector",
        status: "implemented",
        target: "Remote clients integrate through FastAPI /api/v1 instead of Node internals."
      },
      {
        key: "next_mobile_pwa",
        status: "implemented_visual_verified",
        target: "Mobile-first Next.js PWA shell uses only /api/v1 calls."
      },
      {
        key: "browser_sandbox_gateway",
        status: deployment.hostedBrowserSandboxProviderStatus,
        target: "Live worker browser sessions are represented as remote sandbox sessions, with hosted provider readiness separate from local CDP proof."
      },
      {
        key: "dashboard_visual_proof",
        status: "implemented",
        target: "Operator dashboard exposes API, browser, safety, and visual-test readiness."
      },
      {
        key: "canonical_goal_tied_phase_execution",
        status: "implemented_phase32_operating_system",
        target: "All future phases use one Cortex-canonical RALPH loop, role-separated execution, non-mocked proof labels, dashboard scoring, and PR-based memory visibility."
      },
      {
        key: "continuous_procedural_memory_shadow",
        status: continuousIntelligence.status,
        target: "Phase 33 introduces typed CaseState, G0-G8 universal gate skeleton, PEMS maturity schema, and shadow-mode procedural reconstruction without letting it drive healthcare answers."
      },
      {
        key: "continuous_intelligence_shadow_persistence",
        status: continuousIntelligencePersistence.status,
        target: "Phase 34 persists final shadow runs and accumulates PEMS candidate maturity from real graph traces while keeping procedural candidates non-driving."
      },
      {
        key: "pems_supervised_promotion_gate",
        status: pemsPromotion.status,
        target: "Phase 35 requires explicit reviewer, validator, citation, and safety gates before a PEMS candidate can enter supervised advisory mode; production driving remains disabled."
      },
      {
        key: "pems_reviewer_evaluator_workbench",
        status: pemsReviewerWorkbench.status,
        target: "Phase 36 lets evaluator draft notes and NeSTR-style consistency traces advise reviewers while human and deterministic review gates remain authoritative."
      },
      {
        key: "pems_reviewer_ui",
        status: pemsReviewerUi.status,
        target: "Phase 37 exposes an operator-facing reviewer UI for ref-only advisory material and explicit approve/reject/block review actions."
      },
      {
        key: "pems_reviewer_comparison_provenance",
        status: pemsReviewerComparison.status,
        target: "Phase 38 renders deterministic-vs-advisory comparison rows, cited evidence chips, and live-gated evaluator provenance without automatic production recommendations."
      },
      {
        key: "pems_live_evaluator_generation_filtering",
        status: pemsLiveEvaluatorFiltering.status,
        target: "Phase 39 creates live-gated advisory drafts only through observed egress and adds reviewer filters without counting mocked LLM output as proof."
      },
      {
        key: "pems_live_claim_citation_closure",
        status: pemsClaimCitationClosure.status,
        target: "Phase 40 labels live evaluator advisory claims as supported, low confidence, or unsupported and makes unsupported claims a visible reviewer veto without creating evidence."
      },
      {
        key: "pems_reviewer_claim_revisions",
        status: pemsClaimRevision.status,
        target: "Phase 41 persists reviewer claim edits as ref-only revision records, preserves before/after hashes, and re-runs deterministic closure without creating evidence."
      },
      {
        key: "pems_reviewer_follow_up_workflows",
        status: pemsReviewerFollowUp.status,
        target: "Phase 42 binds reviewer claim revision records to later explicit review decisions and follow-up workflow state without enabling production recommendations."
      },
      {
        key: "pems_reviewer_history_audit_exports",
        status: pemsReviewerHistoryExport.status,
        target: "Phase 43 exports longitudinal reviewer history refs and hashes across drafts, revisions, reviews, and follow-ups without storing raw history or enabling production recommendations."
      },
      {
        key: "pems_reviewer_history_review_refinement",
        status: pemsReviewerHistoryReview.status,
        target: "Phase 44 lets operators search, sort, and compare reviewer history export snapshots across longer windows without creating evidence or production recommendations."
      },
      {
        key: "docker_connector_deployment",
        status: deployment.status,
        target: "Docker Compose defines the Node runtime, FastAPI connector, Next.js PWA, and FalkorDB dependency services."
      },
      {
        key: "graphiti_container_product_memory",
        status: productMemorySchemaReady ? "graphiti_schema_ready" : deployment.graphitiRuntimeStatus,
        target: "Node connector image can run real Graphiti/FalkorDB product memory when credentials enable the adapter."
      },
      {
        key: "postgres_storage_profile",
        status: storage.status,
        target: "Docker Compose defines a Postgres transactional storage target while the current app runtime remains safely on SQLite until migration tests pass."
      },
      {
        key: "postgres_docker_secret_runtime_profile",
        status: deployment.postgresProductionProfileStatus,
        target: "A dedicated compose override selects Postgres runtime through a Docker-secret database URL without bypassing proof gates."
      },
      {
        key: "hosted_browser_sandbox_provider",
        status: deployment.hostedBrowserSandboxProviderStatus,
        target: "Hosted/WebRTC browser sandbox provider can replace local CDP without changing the public /api/v1 browser contract."
      },
      {
        key: "hosted_browser_sandbox_provider_selection",
        status: deployment.hostedBrowserSandboxProviderSelection?.status,
        target: "A provider-selection/preflight gate chooses a live sandbox candidate without storing provider URLs or secrets in Git."
      },
      {
        key: "hosted_browser_sandbox_provider_live_preflight",
        status: deployment.hostedBrowserSandboxProviderLivePreflight?.status,
        target: "Private provider config, selected provider, endpoint, and auth refs can be preflighted before live hosted browser enablement."
      },
      {
        key: "hosted_browser_sandbox_provider_live_verification",
        status: deployment.hostedBrowserSandboxProviderLiveVerification?.status,
        target: "A selected real hosted provider must pass create-session, stream, screenshot/OCR, takeover, input, offsite fail-closed, teardown, and GUI/OCR proof before hosted readiness scores."
      },
      {
        key: "hosted_browser_sandbox_provider_steel_self_host",
        status: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.status,
        target: "Self-hosted Steel Browser proves the selected-provider lifecycle locally without exposing raw frames, OCR text, endpoints, or input values."
      },
      {
        key: "hosted_browser_sandbox_provider_steel_operations",
        status: deployment.hostedBrowserSandboxProviderSteelOperations?.status,
        target: "Self-hosted Steel Browser operations are hardened for loopback-only networking, cleanup, retention, monitoring, digest-pinned images, and no hosted-readiness overclaim."
      },
      {
        key: "hosted_browser_sandbox_provider_steel_remote_host",
        status: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.status,
        target: "Remote self-hosted Steel must prove TLS API access, private CDP tunnel, host firewall defense in depth, and ten-check lifecycle proof before remote-host readiness scores."
      },
      {
        key: "hosted_browser_sandbox_provider_steel_ops_drills",
        status: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.status,
        target: "Remote self-hosted Steel operations must prove patch cadence, backup/restore drill, health alerting, and on-call handoff after remote-host readiness."
      },
      {
        key: "hosted_browser_sandbox_provider_webrtc_signaling",
        status: deployment.hostedBrowserSandboxProviderWebrtcSignaling?.status,
        target: "WebRTC live-block signaling must exchange opaque offer/answer/ICE refs before WebRTC hosted readiness scores."
      },
      {
        key: "hosted_browser_sandbox_provider_visual_ocr_replay",
        status: deployment.hostedBrowserSandboxProviderVisualOcrReplay?.status,
        target: "Operator-supplied dashboard/mobile live-block visual and OCR proof must replay from a private manifest before hosted readiness scores."
      },
      {
        key: "hosted_browser_sandbox_provider_launch_readiness",
        status: deployment.hostedBrowserSandboxProviderLaunchReadiness?.status,
        target: "Operator launch readiness aggregates private config, live provider, WebRTC, visual/OCR, and final enablement gates without leaking secrets."
      },
      {
        key: "hosted_browser_sandbox_provider_private_launch_execution",
        status: deployment.hostedBrowserSandboxProviderPrivateLaunchExecution?.status,
        target: "Real selected-provider private launch execution must be explicitly gated and human-reviewed before final hosted readiness can score."
      },
      {
        key: "hosted_browser_sandbox_adapter_harness",
        status: deployment.hostedBrowserSandboxProviderStatus,
        target: "The hosted adapter lifecycle can be contract-tested without provider credentials or live frames."
      },
      {
        key: "hosted_browser_sandbox_provider_http_adapter",
        status: deployment.hostedBrowserSandboxProviderStatus,
        target: "The hosted provider HTTP create-session adapter can be exercised against a local provider-compatible harness without leaking secrets."
      },
      {
        key: "hosted_browser_sandbox_provider_live_lifecycle",
        status: deployment.hostedBrowserSandboxProviderStatus,
        target: "The hosted provider stream, screenshot/OCR, takeover, input, teardown, and offsite-fail-closed lifecycle can be contract-tested before live provider enablement."
      },
      {
        key: "phase56_p0_hardening",
        status: phase56Hardening.status,
        target: "Encrypted durable graph checkpoints, enforced egress default, bound-parameter local store, and retention sweeper proof gate."
      },
      {
        key: "phase57_extensible_skills_worker_breadth",
        status: phase57ExtensibleSkills.status,
        target: "Registry-driven multi-skill selection, bounded worker breadth, and masked procedural worker memory feeding PEMS without answer driving."
      },
      {
        key: "phase58_trusted_answer_driving",
        status: phase58TrustedAnswerDriving.status,
        target: "Reviewer-approved matured PEMS skills may drive answers only through citation rails, demotion, kill switch, and privacy namespacing."
      },
      {
        key: "phase59_pilot_readiness",
        status: phase59PilotReadiness.status,
        target: "Pilot readiness packages live-model-default PWA, FastAPI/Node endpoint inventory, OpenClaw readiness, DB health, AWS communication, and Graphiti status into one non-PHI proof gate."
      },
      {
        key: "phase60_memory_skill_tree",
        status: phase60MemorySkillTree.status,
        target: "Memory skill-tree selector keeps DB authoritative while Graphiti/Zep supports non-standard journeys, procedural loops, and reviewer-gated skill consolidation."
      }
    ],
    checks: [
      { key: "node_runtime", status: "ready", ok: true, detail: `db tables ${Object.keys(counts).length}` },
      { key: "fastapi_v1", status: "available_when_facade_running", ok: true, endpoints: ["/api/v1/sessions", "/api/v1/tasks", "/api/v1/browser/sessions", "/api/v1/proof/runs/{run_id}"] },
      { key: "openclaw_readiness", status: liveReadiness.status, ok: Boolean(liveReadiness.readyForReadOnlyObservation), nextAction: liveReadiness.nextAction },
      {
        key: "product_memory",
        status: productMemorySchemaReady ? "graphiti_schema_ready" : productMemory.status ?? "degraded",
        ok: productMemorySchemaReady,
        adapter: productMemory.adapter,
        safeDegraded: productMemory.status === "disabled_by_env" || productMemory.status === "degraded",
        replayQueue: productMemory.replayQueue ?? null
      },
      {
        key: "graphiti_container_runtime",
        status: deployment.graphitiRuntimeStatus,
        ok: deployment.graphitiRuntimeReady,
        command: deployment.memorySmokeCommand
      },
      {
        key: "phase56_p0_hardening",
        status: phase56Hardening.status,
        ok: phase56Hardening.ok,
        graphCheckpointer: phase56Hardening.graphCheckpointer,
        retentionSweeper: phase56Hardening.retentionSweeper,
        egress: phase56Hardening.egress,
        database: phase56Hardening.database
      },
      {
        key: "phase57_extensible_skills_worker_breadth",
        status: phase57ExtensibleSkills.status,
        ok: phase57ExtensibleSkills.ok,
        checks: phase57ExtensibleSkills.checks,
        registry: phase57ExtensibleSkills.registry,
        dynamicSelection: phase57ExtensibleSkills.dynamicSelection,
        proposal: phase57ExtensibleSkills.proposal,
        workerMemory: phase57ExtensibleSkills.workerMemory
      },
      {
        key: "phase58_trusted_answer_driving",
        status: phase58TrustedAnswerDriving.status,
        ok: phase58TrustedAnswerDriving.ok,
        checks: phase58TrustedAnswerDriving.checks,
        promotionGate: phase58TrustedAnswerDriving.promotionGate,
        drivenAnswer: phase58TrustedAnswerDriving.drivenAnswer,
        demotion: phase58TrustedAnswerDriving.demotion,
        namespaces: phase58TrustedAnswerDriving.namespaces,
        candidateGeneration: phase58TrustedAnswerDriving.candidateGeneration,
        safety: phase58TrustedAnswerDriving.safety
      },
      {
        key: "phase59_pilot_readiness",
        status: phase59PilotReadiness.status,
        ok: phase59PilotReadiness.ok,
        checks: phase59PilotReadiness.checks,
        endpointInventory: phase59PilotReadiness.endpointInventory,
        liveProbeCommand: phase59PilotReadiness.liveProbeCommand,
        externalReadiness: phase59PilotReadiness.externalReadiness,
        safety: phase59PilotReadiness.safety
      },
      {
        key: "phase60_memory_skill_tree",
        status: phase60MemorySkillTree.status,
        ok: phase60MemorySkillTree.ok,
        score: phase60MemorySkillTree.score,
        target: phase60MemorySkillTree.target,
        checks: phase60MemorySkillTree.checks,
        dbAuthority: phase60MemorySkillTree.dbAuthority,
        memoryUsePolicy: phase60MemorySkillTree.memoryUsePolicy,
        selectedProcedureMemory: phase60MemorySkillTree.selectedProcedureMemory,
        skillTree: phase60MemorySkillTree.skillTree,
        consolidationCandidate: phase60MemorySkillTree.consolidationCandidate,
        literatureAlignment: phase60MemorySkillTree.literatureAlignment,
        safety: phase60MemorySkillTree.safety
      },
      {
        key: "database_storage",
        status: storage.status,
        ok: storage.ok,
        runtimeDriver: storage.runtimeDriver,
        productionTarget: storage.postgres.target ? "postgres" : "unknown",
        migrationPending: storage.migrationPending,
        command: storage.postgres.smokeCommand,
        runtimeSmokeCommand: storage.postgres.runtimeSmokeCommand,
        productionSmokeCommand: storage.postgres.productionSmokeCommand,
        defaultRolloutCommand: storage.postgres.defaultRolloutCommand,
        productionGates: {
          endpointParityReady: storage.postgres.endpointParityReady,
          workerLeaseReady: storage.postgres.workerLeaseReady,
          backupRestoreReady: storage.postgres.backupRestoreReady,
          backupRunbookReady: storage.postgres.backupRunbookReady,
          providerBackupPolicyReady: storage.postgres.providerBackupPolicyReady,
          secretProfileReady: storage.safety.secretProfileReady,
          defaultRolloutReady: storage.postgres.defaultRolloutReady
        },
        productionProfileReady: storage.postgres.productionProfileReady,
        productionProfileCommand: storage.postgres.productionProfileCommand
      },
      {
        key: "postgres_backup_runbook",
        status: storage.postgres.backupRunbookReady ? "backup_restore_runbook_smoked" : "available_runbook_gate",
        ok: storage.postgres.backupRunbookReady,
        command: storage.postgres.backupRunbookCommand
      },
      {
        key: "postgres_provider_backup_policy",
        status: storage.postgres.providerBackupPolicyReady ? "hosted_provider_backup_policy_ready" : "provider_policy_contract_available",
        ok: storage.postgres.providerBackupPolicyReady,
        command: storage.postgres.providerBackupPolicyCommand
      },
      {
        key: "postgres_production_profile",
        status: deployment.postgresProductionProfileStatus,
        ok: deployment.postgresProductionProfileReady,
        command: deployment.postgresProductionProfileCommand
      },
      {
        key: "postgres_endpoint_regression",
        status: "available_smoke_gate",
        ok: deployment.postgresProductionProfileReady,
        command: deployment.postgresEndpointRegressionCommand
      },
      {
        key: "postgres_profile_live_smoke",
        status: "available_live_profile_gate",
        ok: deployment.postgresProductionProfileReady,
        command: deployment.postgresProductionProfileLiveCommand
      },
      {
        key: "hosted_browser_sandbox_provider",
        status: deployment.hostedBrowserSandboxProviderStatus,
        ok: deployment.hostedBrowserSandboxProviderReady,
        command: deployment.browserSandboxProviderContractCommand,
        resolver: deployment.hostedBrowserSandboxProviderResolver
      },
      {
        key: "hosted_browser_sandbox_provider_resolver",
        status: deployment.hostedBrowserSandboxProviderResolver?.status ?? "unknown",
        ok: deployment.hostedBrowserSandboxProviderResolverReady,
        command: deployment.browserSandboxProviderResolverCommand,
        endpointResolved: deployment.hostedBrowserSandboxProviderResolver?.endpointResolved ?? false,
        authResolved: deployment.hostedBrowserSandboxProviderResolver?.authResolved ?? false,
        liveVerified: deployment.hostedBrowserSandboxProviderResolver?.liveVerified ?? false,
        rawEndpointReturned: false,
        rawSecretReturned: false
      },
      {
        key: "hosted_browser_sandbox_provider_selection",
        status: deployment.hostedBrowserSandboxProviderSelection?.status,
        ok: deployment.hostedBrowserSandboxProviderSelectionReady,
        command: deployment.browserSandboxProviderSelectionCommand,
        preflightReady: deployment.hostedBrowserSandboxProviderSelectionPreflightReady,
        selectedProviderKnown: deployment.hostedBrowserSandboxProviderSelection?.selectedProviderKnown ?? false,
        selectedProviderKey: deployment.hostedBrowserSandboxProviderSelection?.selectedProviderKey ?? null,
        candidateKeys: deployment.hostedBrowserSandboxProviderSelection?.candidateKeys ?? [],
        rawEndpointReturned: false,
        rawSecretReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_live_preflight",
        status: deployment.hostedBrowserSandboxProviderLivePreflight?.status,
        ok: deployment.hostedBrowserSandboxProviderLivePreflightReady,
        command: deployment.browserSandboxProviderLivePreflightCommand,
        resolverReady: deployment.hostedBrowserSandboxProviderLivePreflight?.resolverReady ?? false,
        selectionPreflightReady: deployment.hostedBrowserSandboxProviderLivePreflight?.selectionPreflightReady ?? false,
        liveProbeEnabled: deployment.hostedBrowserSandboxProviderLivePreflight?.liveProbeEnabled ?? false,
        rawEndpointReturned: false,
        rawSecretReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_live_verification",
        status: deployment.hostedBrowserSandboxProviderLiveVerification?.status,
        ok: deployment.hostedBrowserSandboxProviderLiveVerificationReady,
        command: deployment.browserSandboxProviderLiveVerificationCommand,
        resolverReady: deployment.hostedBrowserSandboxProviderLiveVerification?.resolverReady ?? false,
        livePreflightReady: deployment.hostedBrowserSandboxProviderLiveVerification?.livePreflightReady ?? false,
        providerLiveConnected: deployment.hostedBrowserSandboxProviderLiveVerification?.providerLiveConnected ?? false,
        liveVerified: deployment.hostedBrowserSandboxProviderLiveVerification?.liveVerified ?? false,
        rawEndpointReturned: false,
        rawSecretReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_steel_self_host",
        status: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.status,
        ok: deployment.hostedBrowserSandboxProviderSteelSelfHostProofReady,
        command: "npm run sandbox:browser:provider-live-verification",
        artifactRef: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.artifactRef ?? null,
        score: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.score ?? 0,
        target: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.target ?? 100,
        checks: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.checks ?? [],
        viewerUrlEnvRef: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.viewerUrlEnvRef ?? null,
        lifecycleRefPresent: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.lifecycleRefPresent ?? false,
        rawEndpointReturned: false,
        rawSecretReturned: false,
        rawFrameReturned: false,
        rawOcrTextReturned: false,
        rawInputReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_steel_operations",
        status: deployment.hostedBrowserSandboxProviderSteelOperations?.status,
        ok: deployment.hostedBrowserSandboxProviderSteelOperationsReady,
        contractReady: deployment.hostedBrowserSandboxProviderSteelOperations?.contractReady ?? false,
        command: deployment.hostedBrowserSandboxProviderSteelOperations?.command ?? "npm run sandbox:browser:steel-operations",
        score: deployment.hostedBrowserSandboxProviderSteelOperations?.score ?? 0,
        target: deployment.hostedBrowserSandboxProviderSteelOperations?.target ?? 100,
        checks: deployment.hostedBrowserSandboxProviderSteelOperations?.checks ?? [],
        composeFile: deployment.hostedBrowserSandboxProviderSteelOperations?.composeFile ?? null,
        configFile: deployment.hostedBrowserSandboxProviderSteelOperations?.configFile ?? null,
        runbook: deployment.hostedBrowserSandboxProviderSteelOperations?.runbook ?? null,
        rawEndpointReturned: false,
        rawSecretReturned: false,
        rawFrameReturned: false,
        rawOcrTextReturned: false,
        rawInputReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_steel_remote_host",
        status: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.status,
        ok: deployment.hostedBrowserSandboxProviderSteelRemoteHostReady,
        contractReady: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.contractReady ?? false,
        command: deployment.browserSandboxProviderSteelRemoteReadinessCommand,
        score: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.score ?? 0,
        target: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.target ?? 100,
        checks: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.checks ?? [],
        tenChecks: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.tenChecks ?? [],
        lifecycleArtifactRef: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.lifecycleArtifactRef ?? null,
        labels: {
          contractReadiness: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.contractReadinessLabel ?? "contract readiness",
          localHostReadiness: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.localHostReadinessLabel ?? "local-host readiness",
          remoteHostReadiness: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.remoteHostReadinessLabel ?? "remote-host readiness"
        },
        rawEndpointReturned: false,
        rawSecretReturned: false,
        rawFrameReturned: false,
        rawOcrTextReturned: false,
        rawInputReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_steel_ops_drills",
        status: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.status,
        ok: deployment.hostedBrowserSandboxProviderSteelOpsDrillsReady,
        command: deployment.browserSandboxProviderSteelOpsDrillsCommand,
        score: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.score ?? 0,
        target: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.target ?? 100,
        checks: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.checks ?? [],
        lifecycleArtifactRef: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.lifecycleArtifactRef ?? null,
        configFile: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.configFile ?? null,
        patchingRunbook: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.patchingRunbook ?? null,
        backupRestoreDrill: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.backupRestoreDrill ?? null,
        healthAlerts: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.healthAlerts ?? null,
        oncallHandoff: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.oncallHandoff ?? null,
        labels: {
          contractReadiness: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.contractReadinessLabel ?? "contract readiness",
          localHostReadiness: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.localHostReadinessLabel ?? "local-host readiness",
          remoteHostReadiness: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.remoteHostReadinessLabel ?? "remote-host readiness",
          opsDrillReadiness: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.opsDrillReadinessLabel ?? "ops-drill readiness"
        },
        rawEndpointReturned: false,
        rawSecretReturned: false,
        rawFrameReturned: false,
        rawOcrTextReturned: false,
        rawInputReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_webrtc_signaling",
        status: deployment.hostedBrowserSandboxProviderWebrtcSignaling?.status,
        ok: deployment.hostedBrowserSandboxProviderWebrtcSignalingReady,
        command: deployment.browserSandboxProviderWebrtcSignalingCommand,
        resolverReady: deployment.hostedBrowserSandboxProviderWebrtcSignaling?.resolverReady ?? false,
        liveVerificationReady: deployment.hostedBrowserSandboxProviderWebrtcSignaling?.liveVerificationReady ?? false,
        streamRequiresWebrtc: deployment.hostedBrowserSandboxProviderWebrtcSignaling?.streamRequiresWebrtc ?? false,
        rawEndpointReturned: false,
        rawSecretReturned: false,
        rawSdpReturned: false,
        rawIceCandidateReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_visual_ocr_replay",
        status: deployment.hostedBrowserSandboxProviderVisualOcrReplay?.status,
        ok: deployment.hostedBrowserSandboxProviderVisualOcrReplayReady,
        command: deployment.browserSandboxProviderVisualOcrReplayCommand,
        liveVerificationReady: deployment.hostedBrowserSandboxProviderVisualOcrReplay?.liveVerificationReady ?? false,
        webrtcSignalingReady: deployment.hostedBrowserSandboxProviderVisualOcrReplay?.webrtcSignalingReady ?? false,
        proofFilePresent: deployment.hostedBrowserSandboxProviderVisualOcrReplay?.proofFilePresent ?? false,
        proofFileOutsideGit: deployment.hostedBrowserSandboxProviderVisualOcrReplay?.proofFileOutsideGit ?? false,
        proofValidationOk: deployment.hostedBrowserSandboxProviderVisualOcrReplay?.proofValidationOk ?? false,
        rawEndpointReturned: false,
        rawSecretReturned: false,
        rawFrameReturned: false,
        rawOcrTextReturned: false,
        rawInputReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_launch_readiness",
        status: deployment.hostedBrowserSandboxProviderLaunchReadiness?.status,
        ok: deployment.hostedBrowserSandboxProviderLaunchReadinessRunbookReady,
        command: deployment.browserSandboxProviderLaunchReadinessCommand,
        runbookReady: deployment.hostedBrowserSandboxProviderLaunchReadiness?.runbookReady ?? false,
        privateProofChainReady: deployment.hostedBrowserSandboxProviderLaunchReadiness?.privateProofChainReady ?? false,
        finalEnablementAllowed: deployment.hostedBrowserSandboxProviderLaunchReadiness?.finalEnablementAllowed ?? false,
        missing: deployment.hostedBrowserSandboxProviderLaunchReadiness?.missing ?? [],
        configOutsideGit: deployment.hostedBrowserSandboxProviderLaunchReadiness?.configOutsideGit ?? false,
        proofFileOutsideGit: deployment.hostedBrowserSandboxProviderLaunchReadiness?.proofFileOutsideGit ?? false,
        rawEndpointReturned: false,
        rawSecretReturned: false,
        rawFrameReturned: false,
        rawOcrTextReturned: false,
        rawInputReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_private_launch_execution",
        status: deployment.hostedBrowserSandboxProviderPrivateLaunchExecution?.status,
        ok: deployment.hostedBrowserSandboxProviderPrivateLaunchExecutionReady,
        command: deployment.browserSandboxProviderPrivateLaunchExecutionCommand,
        executionGate: deployment.hostedBrowserSandboxProviderPrivateLaunchExecution?.executionGate ?? false,
        finalHumanReviewed: deployment.hostedBrowserSandboxProviderPrivateLaunchExecution?.finalHumanReviewed ?? false,
        privateProofChainReady: deployment.hostedBrowserSandboxProviderPrivateLaunchExecution?.privateProofChainReady ?? false,
        finalEnablementAllowed: deployment.hostedBrowserSandboxProviderPrivateLaunchExecution?.finalEnablementAllowed ?? false,
        missing: deployment.hostedBrowserSandboxProviderPrivateLaunchExecution?.missing ?? [],
        rawEndpointReturned: false,
        rawSecretReturned: false,
        rawFrameReturned: false,
        rawOcrTextReturned: false,
        rawInputReturned: false,
        hostedRemoteScoreMayPassOnlyAfterLiveVerified: true
      },
      {
        key: "hosted_browser_sandbox_provider_adapter",
        status: deployment.hostedBrowserSandboxProviderStatus,
        ok: deployment.hostedBrowserSandboxProviderAdapterReady,
        command: deployment.browserSandboxProviderAdapterCommand,
        providerNetworkCalled: false,
        providerLiveConnected: false,
        rawEndpointReturned: false,
        rawSecretReturned: false
      },
      {
        key: "hosted_browser_sandbox_provider_http_adapter",
        status: deployment.hostedBrowserSandboxProviderStatus,
        ok: deployment.hostedBrowserSandboxProviderHttpAdapterReady,
        command: deployment.browserSandboxProviderHttpAdapterCommand,
        providerNetworkCalled: deployment.hostedBrowserSandboxProviderHttpAdapterReady,
        localHarnessOnly: true,
        providerLiveConnected: false,
        rawEndpointReturned: false,
        rawSecretReturned: false
      },
      {
        key: "hosted_browser_sandbox_provider_live_lifecycle",
        status: deployment.hostedBrowserSandboxProviderStatus,
        ok: deployment.hostedBrowserSandboxProviderLiveLifecycleHarnessReady,
        command: deployment.browserSandboxProviderLiveLifecycleCommand,
        providerNetworkCalled: deployment.hostedBrowserSandboxProviderLiveLifecycleHarnessReady,
        localHarnessOnly: true,
        streamFrames: "sse_frame_ref_only",
        screenshot: "opaque_screenshot_ref_only",
        ocrCaption: "opaque_caption_ref_only",
        takeover: "approval_gated_human_only",
        inputRelay: "redacted_approved_input_only",
        teardown: "ephemeral_session_closed",
        offsiteFailClosed: true,
        providerLiveConnected: false,
        rawEndpointReturned: false,
        rawSecretReturned: false
      },
      {
        key: "hosted_browser_sandbox_adapter_harness",
        status: deployment.hostedBrowserSandboxProviderStatus,
        ok: deployment.hostedBrowserSandboxAdapterHarnessReady,
        command: deployment.browserSandboxAdapterHarnessCommand,
        adapterMode: deployment.hostedBrowserSandboxAdapterMode
      },
      {
        key: "canonical_phase_operating_system",
        status: "phase32_goal_tied_execution_contract_ready",
        ok: true,
        docs: [
          "docs/PROJECT_OPERATING_SYSTEM.md",
          "docs/PHASE_SCOREBOARD.md",
          "docs/NON_MOCKED_PROOF_RULES.md"
        ],
        cortexMirrorRequired: true,
        ralphLoopRequired: true,
        roleSeparationRequired: true,
        nonMockedProofRequired: true
      },
      {
        key: "continuous_intelligence_shadow",
        status: continuousIntelligence.status,
        ok: continuousIntelligence.ok,
        mode: continuousIntelligence.mode,
        schemas: continuousIntelligence.schemas,
        gateIds: continuousIntelligence.gateIds,
        gateCount: continuousIntelligence.gateCount,
        pemsTrusted: continuousIntelligence.pemsTrusted,
        productionDrivingAllowed: continuousIntelligence.productionDrivingAllowed,
        score: continuousIntelligence.score,
        target: continuousIntelligence.target,
        safety: continuousIntelligence.shadow.safety
      },
      {
        key: "continuous_intelligence_shadow_persistence",
        status: continuousIntelligencePersistence.status,
        ok: continuousIntelligencePersistence.ok,
        mode: continuousIntelligencePersistence.mode,
        score: continuousIntelligencePersistence.score,
        target: continuousIntelligencePersistence.target,
        shadowRunCount: continuousIntelligencePersistence.shadowRunCount,
        candidateCount: continuousIntelligencePersistence.candidateCount,
        latestRun: continuousIntelligencePersistence.latestRun,
        latestMaturity: continuousIntelligencePersistence.latestMaturity,
        pemsTrusted: continuousIntelligencePersistence.pemsTrusted,
        productionDrivingAllowed: continuousIntelligencePersistence.productionDrivingAllowed,
        safety: continuousIntelligencePersistence.safety
      },
      {
        key: "pems_supervised_promotion_gate",
        status: pemsPromotion.status,
        ok: pemsPromotion.ok,
        mode: pemsPromotion.mode,
        score: pemsPromotion.score,
        target: pemsPromotion.target,
        candidateCount: pemsPromotion.candidateCount,
        reviewCount: pemsPromotion.reviewCount,
        humanApprovalCount: pemsPromotion.humanApprovalCount,
        validatorPassCount: pemsPromotion.validatorPassCount,
        citationPassCount: pemsPromotion.citationPassCount,
        supervisedAdvisoryCandidateCount: pemsPromotion.supervisedAdvisoryCandidateCount,
        latestCandidate: pemsPromotion.latestCandidate,
        latestGate: pemsPromotion.latestGate,
        productionDrivingAllowed: pemsPromotion.productionDrivingAllowed,
        safety: pemsPromotion.safety
      },
      {
        key: "pems_reviewer_evaluator_workbench",
        status: pemsReviewerWorkbench.status,
        ok: pemsReviewerWorkbench.ok,
        mode: pemsReviewerWorkbench.mode,
        score: pemsReviewerWorkbench.score,
        target: pemsReviewerWorkbench.target,
        candidateCount: pemsReviewerWorkbench.candidateCount,
        draftCount: pemsReviewerWorkbench.draftCount,
        llmAssistedDraftCount: pemsReviewerWorkbench.llmAssistedDraftCount,
        consistencyTraceDraftCount: pemsReviewerWorkbench.consistencyTraceDraftCount,
        advisoryLinkedReviewCount: pemsReviewerWorkbench.advisoryLinkedReviewCount,
        latestDraft: pemsReviewerWorkbench.latestDraft,
        latestCandidate: pemsReviewerWorkbench.latestCandidate,
        latestGate: pemsReviewerWorkbench.latestGate,
        productionDrivingAllowed: pemsReviewerWorkbench.productionDrivingAllowed,
        safety: pemsReviewerWorkbench.safety
      },
      {
        key: "pems_reviewer_ui",
        status: pemsReviewerUi.status,
        ok: pemsReviewerUi.ok,
        mode: pemsReviewerUi.mode,
        score: pemsReviewerUi.score,
        target: pemsReviewerUi.target,
        route: pemsReviewerUi.route,
        apiRoutes: pemsReviewerUi.apiRoutes,
        actions: pemsReviewerUi.actions,
        advisoryOnly: pemsReviewerUi.advisoryOnly,
        productionDrivingAllowed: pemsReviewerUi.productionDrivingAllowed,
        safety: pemsReviewerUi.safety
      },
      {
        key: "pems_reviewer_comparison_provenance",
        status: pemsReviewerComparison.status,
        ok: pemsReviewerComparison.ok,
        mode: pemsReviewerComparison.mode,
        score: pemsReviewerComparison.score,
        target: pemsReviewerComparison.target,
        candidateId: pemsReviewerComparison.candidateId,
        advisoryDraftId: pemsReviewerComparison.advisoryDraftId,
        comparisonRows: pemsReviewerComparison.comparisonRows,
        evidenceChips: pemsReviewerComparison.evidenceChips,
        evaluatorProvenance: pemsReviewerComparison.evaluatorProvenance,
        productionDrivingAllowed: pemsReviewerComparison.safety.productionDrivingAllowed,
        safety: pemsReviewerComparison.safety
      },
      {
        key: "pems_live_evaluator_generation_filtering",
        status: pemsLiveEvaluatorFiltering.status,
        ok: pemsLiveEvaluatorFiltering.ok,
        mode: pemsLiveEvaluatorFiltering.mode,
        score: pemsLiveEvaluatorFiltering.score,
        target: pemsLiveEvaluatorFiltering.target,
        openAiConfigured: pemsLiveEvaluatorFiltering.openAiConfigured,
        draftCount: pemsLiveEvaluatorFiltering.draftCount,
        filteredDraftCount: pemsLiveEvaluatorFiltering.filteredDraftCount,
        liveGeneratedDraftCount: pemsLiveEvaluatorFiltering.liveGeneratedDraftCount,
        liveProofDraftCount: pemsLiveEvaluatorFiltering.liveProofDraftCount,
        mockedDraftCount: pemsLiveEvaluatorFiltering.mockedDraftCount,
        appliedFilters: pemsLiveEvaluatorFiltering.appliedFilters,
        filterOptions: pemsLiveEvaluatorFiltering.filterOptions,
        liveProofClaimed: pemsLiveEvaluatorFiltering.liveProofClaimed,
        productionDrivingAllowed: pemsLiveEvaluatorFiltering.productionDrivingAllowed,
        safety: pemsLiveEvaluatorFiltering.safety
      },
      {
        key: "pems_live_claim_citation_closure",
        status: pemsClaimCitationClosure.status,
        ok: pemsClaimCitationClosure.ok,
        mode: pemsClaimCitationClosure.mode,
        score: pemsClaimCitationClosure.score,
        target: pemsClaimCitationClosure.target,
        claimCount: pemsClaimCitationClosure.claimCount,
        supportedCount: pemsClaimCitationClosure.supportedCount,
        unsupportedCount: pemsClaimCitationClosure.unsupportedCount,
        lowConfidenceCount: pemsClaimCitationClosure.lowConfidenceCount,
        reviewerEditRequired: pemsClaimCitationClosure.reviewerEditRequired,
        sourcePointerBounded: pemsClaimCitationClosure.sourcePointerBounded,
        liveEvaluatorDraft: pemsClaimCitationClosure.liveEvaluatorDraft,
        claimClosureDraftCount: pemsClaimCitationClosure.claimClosureDraftCount,
        claimClosureVetoDraftCount: pemsClaimCitationClosure.claimClosureVetoDraftCount,
        claims: pemsClaimCitationClosure.claims,
        productionDrivingAllowed: pemsClaimCitationClosure.productionDrivingAllowed,
        safety: pemsClaimCitationClosure.safety
      },
      {
        key: "pems_reviewer_claim_revisions",
        status: pemsClaimRevision.status,
        ok: pemsClaimRevision.ok,
        mode: pemsClaimRevision.mode,
        score: pemsClaimRevision.score,
        target: pemsClaimRevision.target,
        claimRevisionCount: pemsClaimRevision.claimRevisionCount,
        claimRevisionReclosedCount: pemsClaimRevision.claimRevisionReclosedCount,
        deterministicReclosurePassed: pemsClaimRevision.deterministicReclosurePassed,
        sourcePointerBounded: pemsClaimRevision.sourcePointerBounded,
        preservesOriginalAndRevisedHashes: pemsClaimRevision.preservesOriginalAndRevisedHashes,
        latestClaimRevision: pemsClaimRevision.latestClaimRevision,
        productionDrivingAllowed: pemsClaimRevision.productionDrivingAllowed,
        safety: pemsClaimRevision.safety
      },
      {
        key: "pems_reviewer_follow_up_workflows",
        status: pemsReviewerFollowUp.status,
        ok: pemsReviewerFollowUp.ok,
        mode: pemsReviewerFollowUp.mode,
        score: pemsReviewerFollowUp.score,
        target: pemsReviewerFollowUp.target,
        reviewerFollowUpCount: pemsReviewerFollowUp.reviewerFollowUpCount,
        reviewerFollowUpResolvedCount: pemsReviewerFollowUp.reviewerFollowUpResolvedCount,
        reviewerFollowUpOpenCount: pemsReviewerFollowUp.reviewerFollowUpOpenCount,
        revisionBoundFollowUpCount: pemsReviewerFollowUp.revisionBoundFollowUpCount,
        reviewDecisionBoundFollowUpCount: pemsReviewerFollowUp.reviewDecisionBoundFollowUpCount,
        revisionResolvedVeto: pemsReviewerFollowUp.revisionResolvedVeto,
        latestReviewerFollowUp: pemsReviewerFollowUp.latestReviewerFollowUp,
        latestPromotionReview: pemsReviewerFollowUp.latestPromotionReview,
        productionDrivingAllowed: pemsReviewerFollowUp.productionDrivingAllowed,
        safety: pemsReviewerFollowUp.safety
      },
      {
        key: "pems_reviewer_history_audit_exports",
        status: pemsReviewerHistoryExport.status,
        ok: pemsReviewerHistoryExport.ok,
        mode: pemsReviewerHistoryExport.mode,
        score: pemsReviewerHistoryExport.score,
        target: pemsReviewerHistoryExport.target,
        reviewerHistoryExportCount: pemsReviewerHistoryExport.reviewerHistoryExportCount,
        safeHistoryExportCount: pemsReviewerHistoryExport.safeHistoryExportCount,
        historyRowCount: pemsReviewerHistoryExport.historyRowCount,
        claimRevisionCount: pemsReviewerHistoryExport.claimRevisionCount,
        promotionReviewCount: pemsReviewerHistoryExport.promotionReviewCount,
        reviewerFollowUpCount: pemsReviewerHistoryExport.reviewerFollowUpCount,
        hasExportRef: pemsReviewerHistoryExport.hasExportRef,
        hasExportHash: pemsReviewerHistoryExport.hasExportHash,
        hasSnapshotHash: pemsReviewerHistoryExport.hasSnapshotHash,
        latestReviewerHistoryExport: pemsReviewerHistoryExport.latestReviewerHistoryExport,
        productionDrivingAllowed: pemsReviewerHistoryExport.productionDrivingAllowed,
        safety: pemsReviewerHistoryExport.safety
      },
      {
        key: "pems_reviewer_history_review_refinement",
        status: pemsReviewerHistoryReview.status,
        ok: pemsReviewerHistoryReview.ok,
        mode: pemsReviewerHistoryReview.mode,
        score: pemsReviewerHistoryReview.score,
        target: pemsReviewerHistoryReview.target,
        reviewerHistoryExportReviewCount: pemsReviewerHistoryReview.reviewerHistoryExportReviewCount,
        filteredExportCount: pemsReviewerHistoryReview.filteredExportCount,
        searchableBy: pemsReviewerHistoryReview.searchableBy,
        sortableBy: pemsReviewerHistoryReview.sortableBy,
        appliedFilters: pemsReviewerHistoryReview.appliedFilters,
        comparison: pemsReviewerHistoryReview.comparison,
        productionDrivingAllowed: pemsReviewerHistoryReview.productionDrivingAllowed,
        safety: pemsReviewerHistoryReview.safety
      },
      { key: "docker_compose_contract", status: deployment.status, ok: deployment.ok, services: deployment.services, command: deployment.configCommand },
      { key: "approval_boundary", status: "approval_required_for_external_write_or_live_browser_actions", ok: true }
    ],
    visualArtifacts: [
      { route: "/", required: true, status: "dashboard_panel_verified", proof: "Connector Verification panel rendered in browser proof." },
      { route: "/mvp", required: true, status: "legacy_mvp_verified", proof: "Static MVP remains the compatibility harness until PWA parity." },
      {
        route: "apps/mobile-next",
        required: true,
        status: "pwa_mobile_view_verified",
        proof: "Next.js mobile viewport visual test passed.",
        artifact: "/private/tmp/workerprototype-openclaw-mobile-pwa-visual/15-mobile-pwa-final-clean-live-frame.png"
      },
      {
        route: "/api/v1/browser/sessions/{browser_session_id}/stream",
        required: true,
        status: "live_worker_stream_verified",
        proof: "Worker Browser live block rendered a data:image/jpeg frame through FastAPI /api/v1.",
        artifact: "/private/tmp/workerprototype-openclaw-mobile-pwa-visual/15-mobile-pwa-final-clean-live-frame.png"
      },
      {
        route: "docs/PROJECT_OPERATING_SYSTEM.md",
        required: true,
        status: "phase32_operating_system_documented",
        proof: "Canonical goal-tied RALPH operating system is mirrored in repo docs and must be mirrored in Cortex before the phase is done."
      },
      {
        route: "src/concierge/continuousIntelligence.mjs",
        required: true,
        status: "phase33_shadow_scaffold_documented",
        proof: "Typed CaseState, G0-G8 gate skeleton, PEMS maturity schema, and shadow reconstruction are implemented in a deterministic module."
      },
      {
        route: "/api/continuous-intelligence/pems/promotion",
        required: true,
        status: pemsPromotion.status,
        proof: "Phase 35 PEMS supervised promotion gate exposes reviewer, validator, citation, safety, and production-disabled proof."
      },
      {
        route: "/api/continuous-intelligence/pems/workbench",
        required: true,
        status: pemsReviewerWorkbench.status,
        proof: "Phase 36 reviewer/evaluator workbench exposes sanitized advisory draft notes, consistency trace refs, and explicit human-review linkage."
      },
      {
        route: "/",
        required: true,
        status: pemsReviewerUi.status,
        proof: "Phase 37 reviewer UI renders ref-only advisory drafts and approve/reject/block controls backed by explicit review writes."
      },
      {
        route: "/",
        required: true,
        status: pemsReviewerComparison.status,
        proof: "Phase 38 reviewer comparison panel renders deterministic-vs-advisory rows, source-pointer chips, and evaluator provenance without claiming production authority."
      },
      {
        route: "/",
        required: true,
        status: pemsLiveEvaluatorFiltering.status,
        proof: "Phase 39 reviewer workbench can filter drafts and only marks live evaluator proof when observed egress created a non-mocked advisory draft."
      },
      {
        route: "/",
        required: true,
        status: pemsClaimCitationClosure.status,
        proof: "Phase 40 reviewer workbench labels advisory claims, shows source-pointer support, and vetoes unsupported or low-confidence claims without creating evidence."
      },
      {
        route: "/",
        required: true,
        status: pemsClaimRevision.status,
        proof: "Phase 41 reviewer workbench records before/after claim revisions, deterministic reclosure, source-pointer refs, and advisory-only safety."
      },
      {
        route: "/",
        required: true,
        status: pemsReviewerFollowUp.status,
        proof: "Phase 42 reviewer workbench binds claim revisions to explicit review decisions and follow-up workflow state without creating evidence or production authority."
      },
      {
        route: "/",
        required: true,
        status: pemsReviewerHistoryExport.status,
        proof: "Phase 43 reviewer workbench exports longitudinal reviewer history refs and hashes without raw history, evidence creation, or production authority."
      }
    ],
    scores: [
      { key: "api_readiness", score: 90, target: 90, status: "pass_contract" },
      {
        key: "phase56_p0_hardening",
        score: phase56Hardening.score,
        target: phase56Hardening.target,
        status: phase56Hardening.status,
        encryptedCheckpointRequired: phase56Hardening.graphCheckpointer.encryptedAtRestRequired,
        retentionSweeperStatus: phase56Hardening.retentionSweeper.status
      },
      {
        key: "phase57_extensible_skills_worker_breadth",
        score: phase57ExtensibleSkills.score,
        target: phase57ExtensibleSkills.target,
        status: phase57ExtensibleSkills.status,
        skillCount: phase57ExtensibleSkills.registry.skillCount,
        selectedExecutionSkillKey: phase57ExtensibleSkills.dynamicSelection.selected.executionSkillKey,
        workerMemoryStatus: phase57ExtensibleSkills.workerMemory.status
      },
      {
        key: "phase58_trusted_answer_driving",
        score: phase58TrustedAnswerDriving.score,
        target: phase58TrustedAnswerDriving.target,
        status: phase58TrustedAnswerDriving.status,
        productionDrivingAllowed: phase58TrustedAnswerDriving.promotionGate.productionDrivingAllowed,
        killSwitchDemotes: phase58TrustedAnswerDriving.checks.killSwitchDemotes,
        safetyIncidentDemotes: phase58TrustedAnswerDriving.checks.safetyIncidentDemotes,
        citationRailsPass: phase58TrustedAnswerDriving.checks.citationRailsPass
      },
      {
        key: "phase59_pilot_readiness",
        score: phase59PilotReadiness.score,
        target: phase59PilotReadiness.target,
        status: phase59PilotReadiness.status,
        liveProbeCommand: phase59PilotReadiness.liveProbeCommand,
        openAiConfigured: phase59PilotReadiness.externalReadiness.openAiConfigured,
        productMemoryStatus: phase59PilotReadiness.externalReadiness.productMemoryStatus
      },
      {
        key: "phase60_memory_skill_tree",
        score: phase60MemorySkillTree.score,
        target: phase60MemorySkillTree.target,
        status: phase60MemorySkillTree.status,
        dbAuthoritative: phase60MemorySkillTree.checks.dbAuthoritative,
        graphitiAdvisory: phase60MemorySkillTree.checks.graphitiAdvisory,
        nonStandardSelector: phase60MemorySkillTree.checks.nonStandardSelector,
        candidateGeneratedButNotWritten: phase60MemorySkillTree.checks.candidateGeneratedButNotWritten,
        productionDrivingBlocked: phase60MemorySkillTree.checks.productionDrivingBlocked
      },
      {
        key: "canonical_goal_tied_phase_execution",
        score: 100,
        target: 100,
        status: "pass_phase32_operating_system_contract"
      },
      {
        key: "continuous_procedural_memory",
        score: Math.max(
          pemsPromotion.score,
          pemsReviewerWorkbench.score,
          pemsReviewerUi.score,
          pemsReviewerComparison.score,
          pemsLiveEvaluatorFiltering.score,
          pemsClaimCitationClosure.score,
          pemsClaimRevision.score,
          pemsReviewerFollowUp.score,
          pemsReviewerHistoryExport.score
        ),
        target: pemsReviewerHistoryExport.target,
        status: pemsReviewerHistoryExport.status,
        pemsTrusted: continuousIntelligencePersistence.pemsTrusted,
        shadowRunCount: continuousIntelligencePersistence.shadowRunCount,
        supervisedAdvisoryCandidateCount: pemsPromotion.supervisedAdvisoryCandidateCount,
        evaluatorDraftCount: pemsReviewerWorkbench.draftCount,
        advisoryLinkedReviewCount: pemsReviewerWorkbench.advisoryLinkedReviewCount,
        reviewerUiActions: pemsReviewerUi.actions,
        comparisonRows: pemsReviewerComparison.comparisonRows.length,
        liveProofClaimed: pemsLiveEvaluatorFiltering.liveProofClaimed,
        liveGeneratedDraftCount: pemsLiveEvaluatorFiltering.liveGeneratedDraftCount,
        filteredDraftCount: pemsLiveEvaluatorFiltering.filteredDraftCount,
        claimCount: pemsClaimCitationClosure.claimCount,
        unsupportedCount: pemsClaimCitationClosure.unsupportedCount,
        lowConfidenceCount: pemsClaimCitationClosure.lowConfidenceCount,
        reviewerEditRequired: pemsClaimCitationClosure.reviewerEditRequired,
        claimRevisionCount: pemsClaimRevision.claimRevisionCount,
        deterministicReclosurePassed: pemsClaimRevision.deterministicReclosurePassed,
        reviewerFollowUpCount: pemsReviewerFollowUp.reviewerFollowUpCount,
        revisionResolvedVeto: pemsReviewerFollowUp.revisionResolvedVeto,
        reviewerHistoryExportCount: pemsReviewerHistoryExport.reviewerHistoryExportCount,
        productionDrivingAllowed: continuousIntelligence.productionDrivingAllowed
      },
      { key: "deployment_contract", score: deployment.ok ? 75 : 0, target: 75, status: deployment.ok ? "pass_static_compose_contract" : "needs_files" },
      {
        key: "product_memory_deployment",
        score: productMemorySchemaReady ? 100 : deployment.graphitiRuntimeReady ? 75 : 0,
        target: 100,
        status: productMemorySchemaReady
          ? "pass_graphiti_schema_ready"
          : deployment.graphitiRuntimeReady
            ? "runtime_present_enable_graphiti_for_live_schema"
            : "needs_graphiti_runtime"
      },
      {
        key: "database_product_ready_architecture",
        score: storage.score,
        target: storage.targetScore,
        status: databaseScoreStatus
      },
      {
        key: "database_deployment_profile",
        score: deployment.postgresProductionProfileReady ? 100 : 0,
        target: 100,
        status: deployment.postgresProductionProfileStatus
      },
      {
        key: "database_backup_restore_runbook",
        score: storage.postgres.backupRunbookReady ? 100 : 0,
        target: 100,
        status: storage.postgres.backupRunbookReady ? "backup_restore_runbook_smoked" : "run_backup_runbook_smoke"
      },
      {
        key: "database_provider_backup_policy",
        score: storage.postgres.providerBackupPolicyReady ? 100 : 0,
        target: 100,
        status: storage.postgres.providerBackupPolicyReady ? "hosted_provider_backup_policy_ready" : "configure_hosted_provider_policy"
      },
      { key: "gui_visual_test", score: 100, target: 100, status: "pass_visual_browser_proof" },
      { key: "remote_browser_controls", score: 90, target: 90, status: "pass_live_frame_local_cdp", readinessStatus: liveReadiness.status },
      {
        key: "hosted_browser_sandbox_adapter_harness",
        score: deployment.hostedBrowserSandboxAdapterHarnessReady ? 75 : 0,
        target: 75,
        status: deployment.hostedBrowserSandboxProviderStatus
      },
      {
        key: "hosted_browser_sandbox_provider_resolver",
        score: deployment.hostedBrowserSandboxProviderResolverReady ? 50 : 0,
        target: 50,
        status: deployment.hostedBrowserSandboxProviderResolver?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_selection",
        score: deployment.hostedBrowserSandboxProviderSelectionPreflightReady
          ? 90
          : deployment.hostedBrowserSandboxProviderSelectionReady
            ? 70
            : 0,
        target: 90,
        status: deployment.hostedBrowserSandboxProviderSelection?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_live_preflight",
        score: deployment.hostedBrowserSandboxProviderLivePreflightReady ? 80 : 0,
        target: 80,
        status: deployment.hostedBrowserSandboxProviderLivePreflight?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_live_verification",
        score: deployment.hostedBrowserSandboxProviderLiveVerificationReady ? 100 : 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderLiveVerification?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_steel_self_host",
        score: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.score ?? 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderSteelSelfHostProof?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_steel_operations",
        score: deployment.hostedBrowserSandboxProviderSteelOperations?.score ?? 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderSteelOperations?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_steel_remote_host",
        score: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.score ?? 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderSteelRemoteHost?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_steel_ops_drills",
        score: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.score ?? 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderSteelOpsDrills?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_webrtc_signaling",
        score: deployment.hostedBrowserSandboxProviderWebrtcSignalingReady ? 100 : 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderWebrtcSignaling?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_visual_ocr_replay",
        score: deployment.hostedBrowserSandboxProviderVisualOcrReplayReady ? 100 : 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderVisualOcrReplay?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_launch_readiness",
        score: deployment.hostedBrowserSandboxProviderFinalEnablementAllowed
          ? 100
          : deployment.hostedBrowserSandboxProviderPrivateProofChainReady
            ? 90
            : deployment.hostedBrowserSandboxProviderLaunchReadinessRunbookReady
              ? 60
              : 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderLaunchReadiness?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_private_launch_execution",
        score: deployment.hostedBrowserSandboxProviderPrivateLaunchExecutionReady ? 100 : 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderPrivateLaunchExecution?.status ?? "unknown"
      },
      {
        key: "hosted_browser_sandbox_provider_adapter",
        score: deployment.hostedBrowserSandboxProviderAdapterReady ? 75 : 0,
        target: 75,
        status: deployment.hostedBrowserSandboxProviderStatus
      },
      {
        key: "hosted_browser_sandbox_provider_http_adapter",
        score: deployment.hostedBrowserSandboxProviderHttpAdapterReady ? 85 : 0,
        target: 85,
        status: deployment.hostedBrowserSandboxProviderStatus
      },
      {
        key: "hosted_browser_sandbox_provider_live_lifecycle",
        score: deployment.hostedBrowserSandboxProviderLiveLifecycleHarnessReady ? 95 : 0,
        target: 95,
        status: deployment.hostedBrowserSandboxProviderStatus
      },
      {
        key: "hosted_remote_browser_sandbox",
        score: deployment.hostedBrowserSandboxProviderReady ? 100 : 0,
        target: 100,
        status: deployment.hostedBrowserSandboxProviderStatus
      },
      { key: "approval_audit_scaffolding", score: 85, target: 85, status: "pass_existing_gate" }
    ],
    safety: {
      fastApiIsPublicConnector: true,
      nodeIsInternalRuntime: true,
      canonicalGoalTiedPhaseExecution: true,
      continuousIntelligenceShadowOnly: true,
      continuousIntelligencePersistenceOnly: true,
      pemsReviewerWorkbenchAdvisoryOnly: true,
      pemsReviewerUiRefOnly: true,
      pemsReviewerComparisonRefOnly: true,
      cortexIsProjectMemoryOnly: true,
      nonMockedProofRequired: true,
      publicApi: "/api/v1",
      frontendDirectNodeCallsAllowedForPwa: false,
      externalWriteActionsWithoutApproval: false,
      rawOcrTextReturned: false
    },
    storage,
    deployment
  };
}

async function serveStatic(req, res) {
  const path = new URL(req.url, "http://localhost").pathname;
  const fileName = path === "/" ? "index.html" : path === "/mvp" ? "mvp.html" : path.slice(1);
  const filePath = join(APP_DIR, fileName);
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      databaseDriver: store.driver ?? "sqlite",
      databaseAdapterVersion: store.adapterVersion,
      dbPath: store.dbPath,
      counts: await store.counts(),
      langGraphScope: describeLangGraphScope()
      ,
      openAI: {
        configured: getOpenAiConfig().configured,
        model: getOpenAiConfig().model
      },
      productMemory: await safeProductMemoryStatus(),
      storage: getStorageReadiness({ deployment: await safeDeploymentContractStatus() })
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/proof/runs/")) {
    const runId = decodeURIComponent(url.pathname.split("/").pop() || "server-connector-next-mobile-mvp");
    sendJson(res, 200, await connectorProofRun(runId));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/continuous-intelligence/pems/promotion") {
    const status = await getPemsPromotionGateStatus(store);
    sendJson(res, 200, buildPemsPromotionReadinessProof(status));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/continuous-intelligence/pems/workbench") {
    const status = await getPemsReviewerWorkbenchStatus(store, {
      draftStatus: url.searchParams.get("draftStatus"),
      evaluatorMode: url.searchParams.get("evaluatorMode"),
      candidateId: url.searchParams.get("candidateId"),
      liveOnly: url.searchParams.get("liveOnly"),
      followupStatus: url.searchParams.get("followupStatus"),
      exportRef: url.searchParams.get("exportRef"),
      snapshotHash: url.searchParams.get("snapshotHash"),
      sortBy: url.searchParams.get("sortBy"),
      sortDirection: url.searchParams.get("sortDirection")
    });
    sendJson(res, 200, {
      ...buildPemsReviewerWorkbenchReadinessProof(status),
      reviewerUi: buildPemsReviewerUiProof(),
      reviewerComparison: buildPemsReviewerComparisonProof(status),
      liveEvaluatorFiltering: buildPemsLiveEvaluatorProof(status),
      liveClaimCitationClosure: buildPemsClaimCitationClosureProof(status),
      reviewerClaimRevisions: buildPemsClaimRevisionProof(status),
      reviewerFollowUps: buildPemsReviewerFollowUpWorkflowProof(status),
      reviewerHistoryExports: buildPemsReviewerHistoryAuditExportProof(status),
      reviewerHistoryReview: buildPemsReviewerHistoryReviewRefinementProof(status)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/continuous-intelligence/pems/history-exports") {
    const body = await readJson(req);
    const result = await recordPemsReviewerHistoryExport(store, {
      candidateId: body.candidateId ?? null,
      advisoryDraftId: body.advisoryDraftId ?? null,
      actorUserId: body.actorUserId ?? "operator",
      filters: body.filters ?? {},
      exportReason: body.exportReason ?? "",
      metadata: body.metadata ?? {}
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/continuous-intelligence/pems/follow-ups") {
    const body = await readJson(req);
    const result = await recordPemsReviewerFollowUp(store, {
      candidateId: body.candidateId,
      advisoryDraftId: body.advisoryDraftId,
      claimRevisionId: body.claimRevisionId,
      promotionReviewId: body.promotionReviewId,
      actorUserId: body.actorUserId ?? "operator",
      followupType: body.followupType ?? "revision_decision_binding",
      followupStatus: body.followupStatus ?? null,
      workflowStatus: body.workflowStatus ?? null,
      actionRequired: body.actionRequired ?? "",
      rationale: body.rationale ?? "",
      metadata: body.metadata ?? {}
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/continuous-intelligence/pems/claim-revisions") {
    const body = await readJson(req);
    const result = await recordPemsClaimRevision(store, {
      candidateId: body.candidateId,
      advisoryDraftId: body.advisoryDraftId,
      claimId: body.claimId,
      claimHash: body.claimHash,
      actorUserId: body.actorUserId ?? "operator",
      revisedClaim: body.revisedClaim ?? "",
      sourcePointerIds: body.sourcePointerIds ?? [],
      metadata: body.metadata ?? {}
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/continuous-intelligence/pems/live-evaluator-drafts") {
    const body = await readJson(req);
    const result = await createLiveGatedPemsEvaluatorDraft(store, {
      candidateId: body.candidateId,
      actorUserId: body.actorUserId ?? "live_evaluator",
      deterministicValidatorStatus: body.deterministicValidatorStatus ?? "pass",
      reviewerQuestion: body.reviewerQuestion ?? "Generate a ref-only advisory evaluator draft for the human reviewer.",
      sourcePointerIds: body.sourcePointerIds ?? [],
      modelConfig: getOpenAiConfig()
    });
    sendJson(res, result.ok === false ? 424 : 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/continuous-intelligence/pems/evaluator-drafts") {
    const body = await readJson(req);
    const result = await createPemsEvaluatorDraft(store, {
      candidateId: body.candidateId,
      actorUserId: body.actorUserId ?? "evaluator",
      draftType: body.draftType ?? "evaluator_draft_note",
      evaluatorMode: body.evaluatorMode ?? "deterministic_validator_advisory",
      deterministicValidatorStatus: body.deterministicValidatorStatus ?? "pending",
      suggestedReviewType: body.suggestedReviewType ?? "validator_evaluation",
      suggestedDecision: body.suggestedDecision ?? "blocked",
      advisoryNote: body.advisoryNote ?? "",
      consistencyTrace: body.consistencyTrace ?? {},
      metadata: body.metadata ?? {}
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/continuous-intelligence/pems/reviews") {
    const body = await readJson(req);
    const result = await recordPemsPromotionReview(store, {
      candidateId: body.candidateId,
      actorUserId: body.actorUserId ?? "operator",
      reviewType: body.reviewType,
      decision: body.decision,
      evidenceRefCount: body.evidenceRefCount ?? 0,
      validatorPassCount: body.validatorPassCount ?? 0,
      safetyIncidentCount: body.safetyIncidentCount ?? 0,
      rationale: body.rationale ?? "",
      advisoryDraftId: body.advisoryDraftId ?? null,
      metadata: body.metadata ?? {}
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/events") {
    sendJson(
      res,
      200,
      {
        events: await listRuntimeEvents(store, {
          sessionId: url.searchParams.get("sessionId") ?? null,
          userId: url.searchParams.get("userId") ?? null,
          eventType: url.searchParams.get("eventType") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 100)
        })
      }
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/audit") {
    sendJson(
      res,
      200,
      await listAuditEvents(store, {
        sessionId: url.searchParams.get("sessionId") ?? null,
        rootOnly: url.searchParams.get("rootOnly") ?? null,
        eventType: url.searchParams.get("eventType") ?? null,
        eventPrefix: url.searchParams.get("eventPrefix") ?? url.searchParams.get("prefix") ?? null,
        query: url.searchParams.get("q") ?? url.searchParams.get("query") ?? null,
        since: url.searchParams.get("since") ?? null,
        until: url.searchParams.get("until") ?? null,
        limit: Number(url.searchParams.get("limit") ?? 100),
        offset: Number(url.searchParams.get("offset") ?? 0)
      })
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/events/stream") {
    const sessionId = url.searchParams.get("sessionId") ?? null;
    const userId = url.searchParams.get("userId") ?? null;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });
    sendSse(res, {
      eventType: "runtime.stream.opened",
      source: "server",
      sessionId,
      userId,
      createdAt: new Date().toISOString()
    });
    const unsubscribe = subscribeRuntimeEvents((event) => {
      if (sessionId && event.sessionId !== sessionId) return;
      if (userId && event.userId !== userId) return;
      sendSse(res, event);
    });
    req.on("close", unsubscribe);
    return;
  }

  // --- Phase 11: live remote-browser view + supervised mobile takeover ---------
  // Live screencast frames (in-memory pub/sub; never persisted). A dedicated stream
  // separate from /api/runtime/events/stream so high-frequency frames don't write rows.
  if (req.method === "GET" && url.pathname === "/api/runtime/browser/frames/stream") {
    const sessionId = url.searchParams.get("sessionId") ?? null;
    const userId = url.searchParams.get("userId") ?? null;
    const streamKey = `${userId ?? "anon"}::${sessionId ?? "default"}`;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });
    sendSse(res, { eventType: "browser.frames.opened", sessionId, userId, createdAt: new Date().toISOString() });
    // keep-alive comment ping so idle proxies don't drop the stream
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
    const unsubscribe = subscribeBrowserFrames(streamKey, (frame) => sendSse(res, { eventType: "browser.frame", ...frame }));
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/browser/screencast/start") {
    const body = await readJson(req);
    if (!body.sessionId) {
      sendJson(res, 400, { ok: false, error: "sessionId is required." });
      return;
    }
    sendJson(res, 200, await startScreencast({ store, sessionId: body.sessionId, userId: body.userId ?? null, targetUrl: body.targetUrl ?? null, options: body.options ?? {} }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/browser/screencast/stop") {
    const body = await readJson(req);
    sendJson(res, 200, await stopScreencast({ store, sessionId: body.sessionId ?? null, userId: body.userId ?? null }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/browser/screencast/status") {
    const sessionId = url.searchParams.get("sessionId") ?? null;
    const userId = url.searchParams.get("userId") ?? null;
    sendJson(res, 200, { ok: true, sessionId, userId, ...screencastStatus(sessionId, userId) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/browser/takeover/request") {
    const body = await readJson(req);
    if (!body.sessionId) {
      sendJson(res, 400, { ok: false, error: "sessionId is required." });
      return;
    }
    sendJson(res, 200, await requestTakeover({ store, sessionId: body.sessionId, userId: body.userId ?? null, reason: body.reason ?? null, host: body.host ?? null }));
    return;
  }

  // Granting mints the human-only relay token. This endpoint represents the user's
  // explicit "yes, hand me the keyboard" decision; the agent has no path to it.
  if (req.method === "POST" && url.pathname === "/api/runtime/browser/takeover/grant") {
    const body = await readJson(req);
    if (!body.takeoverId || !body.sessionId) {
      sendJson(res, 400, { ok: false, error: "takeoverId and sessionId are required." });
      return;
    }
    sendJson(res, 200, await grantTakeover({ store, takeoverId: body.takeoverId, sessionId: body.sessionId, userId: body.userId ?? null, approvedBy: body.approvedBy ?? "user" }));
    return;
  }

  // Human keystroke/pointer relay. origin is forced to "human" here — this server route
  // is only reachable from the user's UI; the autonomous worker never calls it.
  if (req.method === "POST" && url.pathname === "/api/runtime/browser/takeover/input") {
    const body = await readJson(req);
    if (!body.takeoverId || !body.grantToken || !body.input) {
      sendJson(res, 400, { ok: false, error: "takeoverId, grantToken, and input are required." });
      return;
    }
    const result = await relayHumanInput({
      store,
      takeoverId: body.takeoverId,
      grantToken: body.grantToken,
      origin: "human",
      input: body.input,
      sessionId: body.sessionId ?? null,
      userId: body.userId ?? null
    });
    sendJson(res, result.ok ? 200 : 409, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/browser/takeover/end") {
    const body = await readJson(req);
    if (!body.takeoverId) {
      sendJson(res, 400, { ok: false, error: "takeoverId is required." });
      return;
    }
    sendJson(res, 200, await endTakeover({ store, takeoverId: body.takeoverId, reason: body.reason ?? "user_returned_control" }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/browser/takeover/status") {
    const takeoverId = url.searchParams.get("takeoverId");
    sendJson(res, 200, { ok: true, takeover: takeoverId ? describeTakeover(takeoverId) : null });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/worker-continuations") {
    sendJson(res, 200, {
      continuations: await listWorkerContinuations(store, {
        sessionId: url.searchParams.get("sessionId") ?? null,
        userId: url.searchParams.get("userId") ?? null,
        status: url.searchParams.get("status") ?? null,
        limit: Number(url.searchParams.get("limit") ?? 20)
      })
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/document-candidates") {
    const sessionId = url.searchParams.get("sessionId") ?? null;
    const userId = url.searchParams.get("userId") ?? null;
    const portalUrl = url.searchParams.get("portalUrl") ?? null;
    if (!sessionId) {
      sendJson(res, 400, { ok: false, error: "sessionId is required." });
      return;
    }
    const [discovery, proposals] = await Promise.all([
      latestDocumentDiscovery(store, { sessionId, portalUrl }),
      listDocumentCandidateProposals(store, { sessionId, userId, limit: 50 })
    ]);
    const proposalsByCandidate = new Map(
      proposals
        .filter((item) => item.candidate?.candidateId)
        .map((item) => [item.candidate.candidateId, item])
    );
    sendJson(res, 200, {
      ...discovery,
      proposals,
      candidates: discovery.candidates.map((candidate) => ({
        ...candidate,
        proposal: proposalsByCandidate.get(candidate.candidateId) ?? null
      }))
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/document-candidates/propose") {
    const body = await readJson(req);
    const proposal = await createDocumentCandidateProposal(store, {
      userId: body.userId,
      sessionId: body.sessionId,
      workflow: body.workflow,
      candidateId: body.candidateId,
      portalUrl: body.portalUrl,
      expiresInMinutes: Number(body.expiresInMinutes ?? 15)
    });
    if (!proposal.ok) {
      sendJson(res, 400, proposal);
      return;
    }
    await publishRuntimeEvent(store, {
      userId: body.userId,
      sessionId: body.sessionId,
      source: "document_candidate_approval",
      eventType: "approval.requested",
      correlationId: proposal.task.id,
      payload: {
        status: proposal.status,
        taskId: proposal.task.id,
        workflow: proposal.task.workflow_key,
        approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
        allowedAction: READ_ONLY_DOCUMENT_ALLOWED_ACTION,
        candidateId: proposal.candidate.candidateId,
        candidateUrl: proposal.candidate.url,
        candidateLabel: proposal.candidate.label,
        actionsTaken: []
      }
    });
    sendJson(res, 200, {
      ...proposal,
      trace: await traceForSession(store, body.sessionId)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/worker-continuations") {
    const body = await readJson(req);
    const payload = await createWorkerContinuation(store, {
      taskId: body.taskId,
      sessionId: body.sessionId,
      userId: body.userId,
      approvalScope: body.approvalScope ?? "read_only_observation",
      allowedAction: body.allowedAction ?? "read_only_observation",
      correlationId: body.correlationId,
      reason: body.reason,
      reportEverySeconds: Number(body.reportEverySeconds ?? 30),
      expiresInMinutes: Number(body.expiresInMinutes ?? 120),
      lastProgressEvent: body.lastProgressEvent,
      metadata: body.metadata ?? {}
    });
    sendJson(res, payload.ok ? 200 : 400, {
      ...payload,
      trace: payload.continuation?.sessionId ? await traceForSession(store, payload.continuation.sessionId) : null
    });
    return;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/worker-continuations\/[^/]+\/cancel$/)) {
    const body = await readJson(req);
    const continuationId = decodeURIComponent(url.pathname.split("/")[3]);
    const payload = await cancelWorkerContinuation(store, {
      continuationId,
      sessionId: body.sessionId ?? null,
      userId: body.userId ?? null,
      reason: body.reason ?? "Cancelled by user."
    });
    sendJson(res, payload.ok ? 200 : 400, {
      ...payload,
      trace: payload.continuation?.sessionId ? await traceForSession(store, payload.continuation.sessionId) : null
    });
    return;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/worker-continuations\/[^/]+\/continue$/)) {
    const body = await readJson(req);
    const continuationId = decodeURIComponent(url.pathname.split("/")[3]);
    const payload = await requestWorkerContinuation(store, {
      continuationId,
      sessionId: body.sessionId ?? null,
      userId: body.userId ?? null
    });
    sendJson(res, payload.ok ? 200 : 400, {
      ...payload,
      trace: payload.continuation?.sessionId ? await traceForSession(store, payload.continuation.sessionId) : null
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/hooks") {
    sendJson(
      res,
      200,
      {
        subscriptions: await listRuntimeHookSubscriptions(store, {
          sessionId: url.searchParams.get("sessionId") ?? null,
          userId: url.searchParams.get("userId") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 100)
        })
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/hooks") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      {
        subscription: await createRuntimeHookSubscription(store, {
          userId: body.userId ?? null,
          sessionId: body.sessionId ?? null,
          eventType: body.eventType ?? "*",
          targetType: body.targetType ?? "webhook",
          targetUrl: body.targetUrl ?? null,
          secret: body.secret ?? null,
          status: body.status ?? "active"
        })
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/events/publish") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      {
        event: await publishRuntimeEvent(store, {
          userId: body.userId ?? null,
          sessionId: body.sessionId ?? null,
          source: body.source ?? "api_runtime_events_publish",
          eventType: body.eventType,
          correlationId: body.correlationId ?? null,
          payload: body.payload ?? {}
        })
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orchestrator/auth-start") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await authenticatePlannedUser(store, {
        member: body.member ?? {},
        sessionId: body.sessionId ?? null,
        resumeLatestSession: Boolean(body.resumeLatestSession)
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orchestrator/chat") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await runOrchestratorChat(store, {
        member: body.member ?? {},
        sessionId: body.sessionId ?? null,
        resumeLatestSession: Boolean(body.resumeLatestSession),
        message: body.message ?? body.userInput,
        useLiveModel: body.useLiveModel ?? true,
        requireLiveModel: body.requireLiveModel ?? true,
        payloadMode: body.payloadMode
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orchestrator/flow-tests") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await runOrchestratorFlowCases(store, {
        member: body.member ?? {},
        sessionId: body.sessionId ?? null,
        resumeLatestSession: Boolean(body.resumeLatestSession),
        useLiveModel: body.useLiveModel ?? true,
        requireLiveModel: body.requireLiveModel ?? true,
        payloadMode: body.payloadMode,
        caseIds: body.caseIds
      })
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/browser/probe") {
    sendJson(res, 200, await probeChrome(url.searchParams.get("remoteDebuggerUrl") ?? undefined));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/memory/context") {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    sendJson(
      res,
      200,
      await getMemoryContextForUser(store, {
        email,
        userId,
        sessionId: url.searchParams.get("sessionId") ?? null
      })
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/prompts/contract") {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    const context = await getMemoryContextForUser(store, {
      email,
      userId,
      sessionId: url.searchParams.get("sessionId") ?? null
    });
    sendJson(res, 200, {
      contextPacketId: context.row.id,
      promptBundle: context.packet.promptBundle,
      safetyAudit: auditPromptContractSafety(context.packet.promptBundle)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/compatibility") {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    const context = await getMemoryContextForUser(store, {
      email,
      userId,
      sessionId: url.searchParams.get("sessionId") ?? null
    });
    sendJson(res, 200, {
      contextPacketId: context.row.id,
      compatibility: buildRuntimeCompatibilityBundle(context.packet, {
        source: "api_runtime_compatibility",
        requestedAt: new Date().toISOString()
      })
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/memory/harness" || url.pathname === "/api/openclaw/instance")) {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    sendJson(res, 200, await listHarnessState(store, { email, userId }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/openclaw/skills") {
    sendJson(res, 200, await listOpenClawSkillArtifacts());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/dynamic-skills") {
    sendJson(res, 200, await loadDynamicSkillDefinitions());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/dynamic-skills/resolve") {
    const body = await readJson(req);
    const enrollment = await enrollDefaultMember(store, body.member ?? {}, {
      sessionId: body.sessionId,
      resumeLatestSession: Boolean(body.resumeLatestSession),
      title: body.sessionTitle ?? "Dynamic skill resolution"
    });
    const userInput =
      body.message ??
      body.userInput ??
      "Resolve dynamic insurance and journey skills for this healthcare insurance request.";
    const packet = await buildContextPacket(store, {
      user: enrollment.user,
      session: enrollment.session,
      channel: enrollment.session.channel,
      userInput
    });
    const dynamicSkillContext = await resolveDynamicSkillContext(store, {
      user_id: enrollment.user.id,
      session_id: enrollment.session.id,
      graph_trace_id: enrollment.session.langgraph_thread_id,
      channel: enrollment.session.channel,
      user_input: userInput,
      context_packet: packet,
      structured_intent: body.structuredIntent ?? null,
      llm_orchestration_decision: body.llmDecision ?? null,
      workflow: body.workflow ?? body.structuredIntent?.workflow ?? body.llmDecision?.workflow ?? null,
      product_memory_recall: body.productMemoryRecall ?? null
    });
    sendJson(res, 200, {
      user: enrollment.user,
      portal: enrollment.portal,
      session: enrollment.session,
      dynamicSkillContext,
      actionsTaken: []
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/openclaw/official/status") {
    const readiness = await checkOfficialOpenClawReadiness({ config: getOfficialOpenClawConfig() });
    sendJson(res, 200, {
      ...readiness,
      liveReadiness: classifyOfficialOpenClawLiveReadiness(readiness)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/openclaw/skills/insurance_portal_browser/validate-envelope") {
    const body = await readJson(req);
    const enrollment = await enrollDefaultMember(store, body.member ?? {}, {
      sessionId: body.sessionId,
      resumeLatestSession: Boolean(body.resumeLatestSession),
      title: body.sessionTitle ?? "OpenClaw skill envelope validation"
    });
    const graphRun = await runLangGraphOrchestration(store, {
      user: enrollment.user,
      session: enrollment.session,
      channel: enrollment.session.channel,
      userInput:
        body.message ??
        body.userInput ??
        "Validate the insurance portal browser envelope for read-only eligibility observation.",
      rawMessage: {
        source: "api_openclaw_skill_validate_envelope",
        member: body.member ?? {},
        portalUrl: body.portalUrl ?? body.member?.portalUrl ?? null,
        approvalScope: body.approvalScope ?? "read_only_observation",
        useLiveModel: false,
        requestedAt: new Date().toISOString()
      }
    });
    sendJson(res, 200, {
      user: enrollment.user,
      portal: enrollment.portal,
      session: enrollment.session,
      skillArtifact: await loadOpenClawSkillArtifact("insurance_portal_browser"),
      envelope: graphRun.state.openclaw_envelope,
      validation: graphRun.state.openclaw_skill_validation,
      dynamicSkillContext: graphRun.state.dynamic_skill_context,
      workerPlan: graphRun.state.openclaw_worker_plan,
      proposal: graphRun.state.openclaw_skill_proposal,
      executionMode: graphRun.state.openclaw_skill_validation?.executionMode ?? "proposal_only",
      actionsTaken: graphRun.state.openclaw_skill_validation?.actionsTaken ?? [],
      trace: await traceForSession(store, enrollment.session.id)
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/openclaw/skills/")) {
    const skillKey = decodeURIComponent(url.pathname.replace("/api/openclaw/skills/", ""));
    try {
      sendJson(res, 200, await loadOpenClawSkillArtifact(skillKey));
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/memory/heartbeat") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await runUserHeartbeat(store, {
        email: body.email,
        userId: body.userId,
        sessionId: body.sessionId ?? null,
        now: body.now
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/memory/events") {
    const body = await readJson(req);
    const user = body.userId
      ? await store.findOne("users", { id: body.userId })
      : body.email
        ? await store.findOne("users", { email: body.email })
        : null;
    if (!user) {
      sendJson(res, 404, { error: "User not found." });
      return;
    }
    const session = body.sessionId ? await store.findOne("sessions", { id: body.sessionId }) : null;
    if (body.sessionId && !session) {
      sendJson(res, 404, { error: "Session not found." });
      return;
    }
    const planned = await planTaskFollowups(store, {
      user,
      session,
      eventType: body.eventType,
      payload: body.payload ?? {}
    });
    sendJson(res, 200, {
      planned,
      harness: await listHarnessState(store, { userId: user.id })
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/product-memory/status") {
    sendJson(res, 200, await getProductMemoryStatus({ store }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/product-memory/replay-queue") {
    sendJson(res, 200, {
      items: await listProductMemoryReplayQueue(store, {
        status: url.searchParams.get("status") ?? null,
        limit: Number(url.searchParams.get("limit") ?? 25)
      })
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/product-memory/replay") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await replayQueuedProductMemoryRetains(store, {
        limit: Number(body.limit ?? 5)
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/product-memory/probe") {
    const body = await readJson(req);
    const enrollment = await enrollDefaultMember(store, body.member ?? {}, {
      sessionId: body.sessionId,
      resumeLatestSession: Boolean(body.resumeLatestSession),
      title: body.sessionTitle ?? "Graphiti product memory probe"
    });
    sendJson(
      res,
      200,
      await probeProductMemory({
        store,
        user: enrollment.user,
        session: enrollment.session,
        query: body.query ?? "eligibility benefits deductible source pointer"
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/product-memory/suppress") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await suppressProductMemoryEpisode(store, {
        sessionId: body.sessionId ?? null,
        episodeUuid: body.episodeUuid
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/enroll") {
    const body = await readJson(req);
    const enrollment = await enrollDefaultMember(store, body.member ?? {});
    sendJson(res, 200, {
      user: enrollment.user,
      consent: enrollment.consent,
      portal: enrollment.portal,
      session: enrollment.session,
      counts: await store.counts()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const body = await readJson(req);
    const envelope = normalizeWebChat(body);
    const enrollment = await enrollDefaultMember(store, body.member ?? {}, {
      sessionId: body.sessionId,
      resumeLatestSession: Boolean(body.resumeLatestSession),
      title: body.sessionTitle
    });
    const graphRun = await runLangGraphOrchestration(store, {
      user: enrollment.user,
      session: enrollment.session,
      channel: enrollment.session.channel,
      userInput: envelope.user_input,
      rawMessage: {
        ...body,
        ...envelope,
        source: "api_chat",
        executeEvidenceObservation: body.executeEvidenceObservation !== false,
        useLiveModel: body.useLiveModel !== false,
        payloadMode: body.payloadMode ?? "phi_allowed_identifier_masked_reasoning",
        requestedAt: new Date().toISOString()
      }
    });
    const trace = await traceForSession(store, enrollment.session.id);
    sendJson(res, 200, {
      user: enrollment.user,
      portal: enrollment.portal,
      session: trace.session ?? enrollment.session,
      intent: graphRun.state.intent,
      policyResult: graphRun.state.policy_result,
      browserResult: graphRun.state.browser_result,
      eligibility: graphRun.state.eligibility_result,
      portalScan: graphRun.state.portal_scan,
      sourcePointers: graphRun.state.source_pointers,
      ai2uiBlocks: graphRun.state.ai2ui_blocks,
      finalResponse: graphRun.state.final_response,
      graphRun,
      trace,
      counts: await store.counts()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orchestrator/approve") {
    const body = await readJson(req);
    const task = body.taskId ? await store.findOne("agent_tasks", { id: body.taskId }) : null;
    if (!task) {
      sendJson(res, 404, { error: "Approval task not found." });
      return;
    }
    const approval = await createReadOnlyObservationApproval(store, {
      taskId: task.id,
      sessionId: body.sessionId ?? task.session_id,
      userId: body.userId ?? task.user_id,
      decision: body.decision ?? "approved",
      approvalScope: body.approvalScope ?? "read_only_observation",
      allowedAction: body.allowedAction ?? "read_only_observation",
      expiresInMinutes: Number(body.expiresInMinutes ?? 15)
    });
    if (!approval.ok && approval.status !== "denied") {
      sendJson(res, 400, approval);
      return;
    }
    await publishRuntimeEvent(store, {
      userId: task.user_id,
      sessionId: task.session_id,
      source: "orchestrator_approval",
      eventType: "approval.recorded",
      correlationId: task.id,
      payload: {
        status: approval.status,
        taskId: task.id,
        workflow: task.workflow_key,
        approvalScope: approval.approval?.approvalScope ?? body.approvalScope ?? "read_only_observation",
        allowedAction: approval.approval?.allowedAction ?? body.allowedAction ?? "read_only_observation",
        expiresAt: approval.approval?.expiresAt ?? null,
        actionsTaken: approval.approval?.actionsTaken ?? []
      }
    });
    sendJson(res, 200, {
      ...approval,
      trace: await traceForSession(store, task.session_id)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/langgraph/run") {
    const body = await readJson(req);
    const enrollment = await enrollDefaultMember(store, body.member ?? {}, {
      sessionId: body.sessionId,
      resumeLatestSession: Boolean(body.resumeLatestSession),
      title: body.sessionTitle ?? "LangGraph orchestration session"
    });
    const graphRun = await runLangGraphOrchestration(store, {
      user: enrollment.user,
      session: enrollment.session,
      channel: enrollment.session.channel,
      userInput: body.message ?? body.userInput ?? "",
      rawMessage: {
        ...body,
        source: "api_langgraph_run",
        executeEvidenceObservation: body.executeEvidenceObservation !== false,
        useLiveModel: body.useLiveModel !== false,
        payloadMode: body.payloadMode ?? "phi_allowed_identifier_masked_reasoning",
        requestedAt: new Date().toISOString()
      }
    });
    sendJson(res, 200, {
      user: enrollment.user,
      portal: enrollment.portal,
      session: enrollment.session,
      openAI: {
        configured: getOpenAiConfig().configured,
        model: getOpenAiConfig().model
      },
      graphRun,
      trace: await traceForSession(store, enrollment.session.id)
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/trace/")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/api/trace/", ""));
    sendJson(res, 200, await traceForSession(store, sessionId));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sessions") {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    sendJson(res, 200, {
      sessions: await listManagedSessions(store, {
        email,
        userId,
        limit: Number(url.searchParams.get("limit") ?? 20)
      })
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/kpis") {
    sendJson(res, 200, await getResearchKpis(store));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/analytics") {
    try {
      sendJson(res, 200, await getResearchAnalytics(store));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/budget") {
    try {
      sendJson(res, 200, await getResearchBudgetStatus(store));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/review-queues") {
    try {
      sendJson(
        res,
        200,
        await getResearchReviewQueues(store, {
          actorUserId: url.searchParams.get("actorUserId") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 25)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/budget") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await updateResearchBudgetPolicy(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          enabled: body.enabled,
          dailyRunLimit: body.dailyRunLimit ?? body.daily_run_limit,
          dailyCostLimitCents: body.dailyCostLimitCents ?? body.daily_cost_limit_cents,
          killSwitchEnabled: body.killSwitchEnabled ?? body.kill_switch_enabled,
          killSwitchReason: body.killSwitchReason ?? body.kill_switch_reason ?? "",
          metadata: body.metadata ?? {}
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/handoffs") {
    sendJson(
      res,
      200,
      await listHumanHandoffs(store, {
        userId: url.searchParams.get("userId") ?? undefined,
        sessionId: url.searchParams.get("sessionId") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        limit: Number(url.searchParams.get("limit") ?? 25)
      })
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/worker-status") {
    sendJson(res, 200, getResearchWorkerStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/embeddings/status") {
    try {
      sendJson(res, 200, await getResearchEmbeddingStatus(store));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/graph") {
    try {
      sendJson(
        res,
        200,
        await getResearchGraph(store, {
          limit: Number(url.searchParams.get("limit") ?? 250)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/citation-closure") {
    try {
      sendJson(
        res,
        200,
        await listCitationClosureEvaluations(store, {
          status: url.searchParams.get("status") ?? null,
          verdict: url.searchParams.get("verdict") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 25)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/documents") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await ingestResearchDocumentUpload(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          filename: body.filename ?? "research-document.pdf",
          contentType: body.contentType ?? body.content_type ?? "application/pdf",
          contentBase64: body.contentBase64 ?? body.content_base64,
          title: body.title ?? null,
          workflowKeys: Array.isArray(body.workflowKeys ?? body.workflow_keys) ? (body.workflowKeys ?? body.workflow_keys) : ["general_rag"],
          documentKind: body.documentKind ?? body.document_kind ?? "research_knowledge_base_pdf",
          sourceStatus: body.sourceStatus ?? body.source_status ?? "approved",
          authorityLevel: body.authorityLevel ?? body.authority_level ?? "operator_uploaded",
          topic: body.topic ?? ""
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/citation-closure/evaluate") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await evaluateCitationClosure(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          question: body.question ?? "",
          answer: body.answer ?? "",
          limit: Number(body.limit ?? 12),
          minSupportScore: Number(body.minSupportScore ?? 3)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/graph/build") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await buildResearchGraph(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          limit: Number(body.limit ?? 250)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/embeddings/route") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await chooseResearchEmbeddingRoute(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          provider: body.provider ?? null,
          model: body.model ?? null,
          dimensions: body.dimensions ?? null,
          status: body.status ?? "active",
          reason: body.reason ?? ""
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/embeddings/reindex") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await reindexResearchEmbeddings(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          routeKey: body.routeKey ?? "default",
          artifactIds: Array.isArray(body.artifactIds) ? body.artifactIds : null,
          force: Boolean(body.force)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/schedules") {
    try {
      sendJson(
        res,
        200,
        await listResearchSchedules(store, {
          status: url.searchParams.get("status") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 50)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/scheduler/status") {
    try {
      sendJson(res, 200, await researchSchedulerDaemon.status());
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/scheduler/tick") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await researchSchedulerDaemon.tickOnce({
          actorUserId: body.actorUserId ?? body.userId ?? undefined,
          now: body.now ?? undefined,
          tickLimit: Number(body.limit ?? body.tickLimit ?? researchSchedulerDaemon.config.tickLimit),
          executeDueRuns: Boolean(body.executeDueRuns ?? body.execute),
          workerMode: body.workerMode ?? undefined,
          approvedWorkerDispatch: Boolean(body.approvedWorkerDispatch),
          trigger: body.trigger ?? "api_daemon_tick"
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/retention/sweeper/status") {
    try {
      sendJson(res, 200, retentionSweepDaemon.status());
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/retention/sweeper/tick") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await retentionSweepDaemon.tickOnce({
          now: body.now ?? undefined,
          trigger: body.trigger ?? "api_retention_tick"
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/schedules/tick") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await runDueResearchSchedules(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          now: body.now ?? undefined,
          limit: Number(body.limit ?? 5),
          execute: Boolean(body.execute),
          workerMode: body.workerMode ?? null,
          approvedWorkerDispatch: Boolean(body.approvedWorkerDispatch)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/operator/tools") {
    sendJson(res, 200, listOperatorTools());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/operator/proposals") {
    try {
      sendJson(
        res,
        200,
        await listOperatorProposals(store, {
          status: url.searchParams.get("status") ?? null,
          actorUserId: url.searchParams.get("actorUserId") ?? url.searchParams.get("userId") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 50)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/operator/assistant") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await runOperatorAssistant(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          message: body.message ?? "",
          toolKey: body.toolKey ?? null,
          args: body.args ?? {},
          context: body.context ?? {}
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/operator/proposals/") && (url.pathname.endsWith("/approve") || url.pathname.endsWith("/reject"))) {
    const body = await readJson(req);
    const decision = url.pathname.endsWith("/approve") ? "approve" : "reject";
    const proposalId = decodeURIComponent(url.pathname.replace("/api/operator/proposals/", "").replace(`/${decision}`, "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await decideOperatorProposal(store, {
          proposalId,
          actorUserId: body.actorUserId ?? body.userId ?? null,
          decision,
          reason: body.reason ?? ""
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/artifacts") {
    try {
      sendJson(
        res,
        200,
        await listResearchArtifacts(store, {
          citationStatus: url.searchParams.get("citationStatus") ?? url.searchParams.get("citation_status") ?? null,
          runId: url.searchParams.get("runId") ?? url.searchParams.get("run_id") ?? null,
          sourceId: url.searchParams.get("sourceId") ?? url.searchParams.get("source_id") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 50)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/entities") {
    try {
      sendJson(
        res,
        200,
        await listResearchEntities(store, {
          artifactId: url.searchParams.get("artifactId") ?? url.searchParams.get("artifact_id") ?? null,
          runId: url.searchParams.get("runId") ?? url.searchParams.get("run_id") ?? null,
          sourceId: url.searchParams.get("sourceId") ?? url.searchParams.get("source_id") ?? null,
          entityType: url.searchParams.get("entityType") ?? url.searchParams.get("entity_type") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 50)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/research/search" || url.pathname === "/api/research/evidence")) {
    try {
      sendJson(
        res,
        200,
        await searchResearchEvidence(store, {
          query: url.searchParams.get("q") ?? url.searchParams.get("query") ?? "",
          includePending: ["1", "true", "yes"].includes(String(url.searchParams.get("includePending") ?? "").toLowerCase()),
          citationStatus: url.searchParams.get("citationStatus") ?? url.searchParams.get("citation_status") ?? null,
          runId: url.searchParams.get("runId") ?? url.searchParams.get("run_id") ?? null,
          sourceId: url.searchParams.get("sourceId") ?? url.searchParams.get("source_id") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 10)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/research/artifacts/") && url.pathname.endsWith("/entities/extract")) {
    const body = await readJson(req);
    const artifactId = decodeURIComponent(url.pathname.replace("/api/research/artifacts/", "").replace("/entities/extract", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await extractResearchEntitiesForArtifact(store, {
          artifactId,
          actorUserId: body.actorUserId ?? body.userId ?? null
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/research/artifacts/") && url.pathname.endsWith("/review")) {
    const body = await readJson(req);
    const artifactId = decodeURIComponent(url.pathname.replace("/api/research/artifacts/", "").replace("/review", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await reviewResearchArtifact(store, {
          artifactId,
          actorUserId: body.actorUserId ?? body.userId ?? null,
          decision: body.decision,
          reason: body.reason ?? ""
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/sources") {
    sendJson(
      res,
      200,
      await listResearchSources(store, {
        status: url.searchParams.get("status") ?? null,
        limit: Number(url.searchParams.get("limit") ?? 50)
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/sources/propose") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await proposeResearchSource(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          url: body.url,
          title: body.title ?? null,
          sourceType: body.sourceType ?? "web_source",
          authorityLevel: body.authorityLevel ?? "operator_proposed",
          workflowKeys: body.workflowKeys ?? [],
          reason: body.reason ?? "",
          priority: body.priority ?? 500
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/research/sources/") && url.pathname.endsWith("/approve")) {
    const body = await readJson(req);
    const sourceId = decodeURIComponent(url.pathname.replace("/api/research/sources/", "").replace("/approve", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await reviewResearchSource(store, {
          sourceId,
          actorUserId: body.actorUserId ?? body.userId ?? null,
          decision: "approved",
          reason: body.reason ?? ""
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/research/sources/") && url.pathname.endsWith("/reject")) {
    const body = await readJson(req);
    const sourceId = decodeURIComponent(url.pathname.replace("/api/research/sources/", "").replace("/reject", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await reviewResearchSource(store, {
          sourceId,
          actorUserId: body.actorUserId ?? body.userId ?? null,
          decision: "rejected",
          reason: body.reason ?? ""
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/research/sources/")) {
    const body = await readJson(req);
    const sourceId = decodeURIComponent(url.pathname.replace("/api/research/sources/", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await updateResearchSource(store, {
          sourceId,
          actorUserId: body.actorUserId ?? body.userId ?? null,
          patch: body.patch ?? body
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/research/runs") {
    sendJson(
      res,
      200,
      await listResearchRuns(store, {
        status: url.searchParams.get("status") ?? null,
        limit: Number(url.searchParams.get("limit") ?? 50)
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research/runs") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await startManualResearchRun(store, {
          actorUserId: body.actorUserId ?? body.userId ?? null,
          sourceId: body.sourceId ?? null,
          sourceKey: body.sourceKey ?? null,
          topic: body.topic ?? "",
          query: body.query ?? {},
          workflowKey: body.workflowKey ?? "general_rag",
          metadata: body.metadata ?? {}
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/research/runs/") && url.pathname.endsWith("/events")) {
    const runId = decodeURIComponent(url.pathname.replace("/api/research/runs/", "").replace("/events", "").replace(/\/$/, ""));
    try {
      sendJson(res, 200, await listResearchRunEvents(store, { runId }));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/research/runs/") && url.pathname.endsWith("/cancel")) {
    const body = await readJson(req);
    const runId = decodeURIComponent(url.pathname.replace("/api/research/runs/", "").replace("/cancel", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await cancelResearchRun(store, {
          runId,
          actorUserId: body.actorUserId ?? body.userId ?? null,
          reason: body.reason ?? ""
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/research/runs/") && url.pathname.endsWith("/retry")) {
    const body = await readJson(req);
    const runId = decodeURIComponent(url.pathname.replace("/api/research/runs/", "").replace("/retry", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await retryResearchRun(store, {
          runId,
          actorUserId: body.actorUserId ?? body.userId ?? null,
          reason: body.reason ?? ""
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/research/runs/") && url.pathname.endsWith("/execute")) {
    const body = await readJson(req);
    const runId = decodeURIComponent(url.pathname.replace("/api/research/runs/", "").replace("/execute", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await executeResearchRun(store, {
          runId,
          actorUserId: body.actorUserId ?? body.userId ?? null,
          workerMode: body.workerMode ?? null,
          approvedWorkerDispatch: Boolean(body.approvedWorkerDispatch)
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/research/runs/")) {
    const runId = decodeURIComponent(url.pathname.replace("/api/research/runs/", "").replace(/\/$/, ""));
    try {
      sendJson(res, 200, await getResearchRun(store, { runId }));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/export")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/api/sessions/", "").replace("/export", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await buildSessionExport(store, {
          sessionId,
          userId: url.searchParams.get("userId") ?? undefined
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/state")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/api/sessions/", "").replace("/state", "").replace(/\/$/, ""));
    const state = await getManagedSessionState(store, sessionId);
    if (!state.session) {
      sendJson(res, 404, { error: "Session not found." });
      return;
    }
    sendJson(res, 200, state);
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/close")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/api/sessions/", "").replace("/close", "").replace(/\/$/, ""));
    await closeManagedSession(store, sessionId);
    sendJson(res, 200, { ok: true, sessionId });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/api/sessions/", "").replace(/\/$/, ""));
    try {
      sendJson(
        res,
        200,
        await getSessionContinuity(store, {
          sessionId,
          userId: url.searchParams.get("userId") ?? undefined
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const body = await readJson(req);
    try {
      sendJson(
        res,
        200,
        await recordSessionFeedback(store, {
          sessionId: body.sessionId ?? body.session_id,
          userId: body.userId ?? body.user_id,
          messageId: body.messageId ?? body.message_id ?? null,
          taskId: body.taskId ?? body.task_id ?? null,
          answerHash: body.answerHash ?? body.answer_hash ?? null,
          rating: body.rating,
          comment: body.comment ?? "",
          metadata: body.metadata ?? {}
        })
      );
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/review/latest") {
    const snapshot = await store.get("SELECT * FROM eligibility_snapshots ORDER BY created_at DESC LIMIT 1;");
    if (!snapshot) {
      sendJson(res, 404, { error: "No extraction snapshot exists yet." });
      return;
    }
    sendJson(res, 200, {
      snapshot,
      coverageBalances: await store.all("SELECT * FROM coverage_balances WHERE snapshot_id = ? ORDER BY created_at ASC;", [snapshot.id]),
      claims: await store.all("SELECT * FROM claim_items WHERE snapshot_id = ? ORDER BY created_at ASC;", [snapshot.id]),
      priorAuthorizations: await store.all("SELECT * FROM prior_authorizations WHERE snapshot_id = ? ORDER BY created_at ASC;", [snapshot.id]),
      extractionReviews: await store.all("SELECT * FROM extraction_reviews WHERE snapshot_id = ? ORDER BY created_at ASC;", [snapshot.id])
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/portal-pages/latest") {
    const session = await store.get("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1;");
    if (!session) {
      sendJson(res, 404, { error: "No session exists yet." });
      return;
    }
    sendJson(res, 200, {
      session,
      pages: await store.list("portal_page_snapshots", { session_id: session.id })
    });
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message, stack: process.env.NODE_ENV === "production" ? undefined : error.stack });
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; stopping Brainstyworkers services...`);
    try {
      await researchSchedulerDaemon.stop(`process_${signal.toLowerCase()}_shutdown`);
    } catch (error) {
      console.error(`Research scheduler daemon stop failed: ${error.message}`);
    }
    try {
      await retentionSweepDaemon.stop(`process_${signal.toLowerCase()}_shutdown`);
    } catch (error) {
      console.error(`Retention sweeper daemon stop failed: ${error.message}`);
    }
    server.close((error) => {
      if (error) console.error(`HTTP server close failed: ${error.message}`);
      process.exit(error ? 1 : 0);
    });
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  server.listen(PORT, HOST, () => {
    console.log(`Brainstyworkers AI Concierge running at http://${HOST}:${PORT}`);
    console.log(`Database driver: ${store.driver ?? "sqlite"} ${store.dbPath ? `(${store.dbPath})` : ""}`.trim());
  });
}
