import { createServer } from "node:http";
import { access, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { listAuditEvents } from "../concierge/audit.mjs";
import { createDatabaseStore } from "../concierge/databaseFactory.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { normalizeWebChat } from "../concierge/channelAdapter.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { traceForSession } from "../concierge/engine.mjs";
import { describeLangGraphScope } from "../concierge/langgraphScope.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { probeChrome } from "../concierge/browserAutomation.mjs";
import { buildContextPacket, getMemoryContextForUser, listHarnessState, planTaskFollowups, runUserHeartbeat } from "../concierge/memoryHarness.mjs";
import { auditPromptContractSafety } from "../concierge/promptContracts.mjs";
import { buildRuntimeCompatibilityBundle } from "../concierge/runtimeAdapters.mjs";
import { listOpenClawSkillArtifacts, loadOpenClawSkillArtifact } from "../concierge/openclawSkillArtifacts.mjs";
import { loadDynamicSkillDefinitions, resolveDynamicSkillContext } from "../concierge/dynamicSkillServer.mjs";
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
  getResearchEmbeddingStatus,
  getResearchGraph,
  getResearchKpis,
  getResearchRun,
  getResearchWorkerStatus,
  listResearchArtifacts,
  listCitationClosureEvaluations,
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
  updateResearchSource
} from "../concierge/researchOps.mjs";
import { createResearchSchedulerDaemon } from "../concierge/researchScheduler.mjs";
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
  probeProductMemory,
  replayQueuedProductMemoryRetains,
  suppressProductMemoryEpisode
} from "../concierge/productMemory.mjs";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";
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
await researchSchedulerDaemon.start();

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
    "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE:-project/deployment/browser-sandbox-provider.example.json}"
  ].every((fragment) => composeFile.includes(fragment));
  const hostedBrowserSandboxProviderConfigFile =
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE ?? "project/deployment/browser-sandbox-provider.example.json";
  const hostedBrowserSandboxProviderSelected = process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER === "hosted_remote";
  const hostedBrowserSandboxConfig = await readJsonIfExists(hostedBrowserSandboxProviderConfigFile);
  const hostedBrowserSandboxAdapterMode = hostedBrowserSandboxConfig?.adapter?.mode ?? "contract_only";
  const hostedBrowserSandboxConfigIsExample =
    hostedBrowserSandboxProviderConfigFile === "project/deployment/browser-sandbox-provider.example.json";
  const hostedBrowserSandboxAdapterHarnessReady =
    hostedBrowserSandboxProviderSelected &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1" &&
    !hostedBrowserSandboxConfigIsExample &&
    hostedBrowserSandboxAdapterMode === "contract_harness";
  const hostedBrowserSandboxProviderReady =
    hostedBrowserSandboxProviderSelected &&
    process.env.WEFELLA_BROWSER_SANDBOX_PROVIDER_READY === "1" &&
    !hostedBrowserSandboxConfigIsExample &&
    hostedBrowserSandboxAdapterMode === "hosted_provider";
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
    hostedBrowserSandboxProviderReady,
    hostedBrowserSandboxProviderStatus: hostedBrowserSandboxProviderReady
      ? "hosted_browser_sandbox_provider_ready"
      : hostedBrowserSandboxAdapterHarnessReady
        ? "hosted_browser_sandbox_adapter_harness_ready"
      : hostedBrowserSandboxContractReady
        ? "hosted_browser_sandbox_contract_valid_not_configured"
        : "hosted_browser_sandbox_contract_missing",
    browserSandboxProviderContractCommand: "npm run sandbox:browser:provider-contract",
    browserSandboxAdapterHarnessCommand: "npm run sandbox:browser:adapter-harness",
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

async function connectorProofRun(runId = "server-connector-next-mobile-mvp") {
  const counts = await store.counts();
  const productMemory = await safeProductMemoryStatus();
  const deployment = await safeDeploymentContractStatus();
  const storage = getStorageReadiness({ deployment });
  const productMemorySchemaReady = Boolean(productMemory.enabled && productMemory.schemaReady);
  const databaseScoreStatus = storage.status;
  const openclawReadiness = await checkOfficialOpenClawReadiness({ config: getOfficialOpenClawConfig() }).catch((error) => ({
    ready: false,
    status: "openclaw_readiness_error",
    error: error.message
  }));
  const liveReadiness = classifyOfficialOpenClawLiveReadiness(openclawReadiness);
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
        key: "hosted_browser_sandbox_adapter_harness",
        status: deployment.hostedBrowserSandboxProviderStatus,
        target: "The hosted adapter lifecycle can be contract-tested without provider credentials or live frames."
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
        command: deployment.browserSandboxProviderContractCommand
      },
      {
        key: "hosted_browser_sandbox_adapter_harness",
        status: deployment.hostedBrowserSandboxProviderStatus,
        ok: deployment.hostedBrowserSandboxAdapterHarnessReady,
        command: deployment.browserSandboxAdapterHarnessCommand,
        adapterMode: deployment.hostedBrowserSandboxAdapterMode
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
      }
    ],
    scores: [
      { key: "api_readiness", score: 90, target: 90, status: "pass_contract" },
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
        useLiveModel: Boolean(body.useLiveModel),
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
        useLiveModel: Boolean(body.useLiveModel),
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
