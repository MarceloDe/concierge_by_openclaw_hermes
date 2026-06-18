import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assertPostgresProductionProfileContract } from "./postgres-production-profile-contract.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const REQUIRED_FILES = [
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
  "scripts/browser-sandbox-provider-launch-readiness-smoke.mjs",
  "scripts/browser-sandbox-provider-private-launch-execution-smoke.mjs",
  "scripts/browser-sandbox-provider-steel-operations-smoke.mjs",
  "scripts/browser-sandbox-provider-steel-remote-readiness-smoke.mjs",
  "scripts/browser-sandbox-adapter-harness.mjs",
  "scripts/browser-sandbox-provider-resolver.mjs",
  "scripts/browser-sandbox-provider-adapter-smoke.mjs",
  "scripts/browser-sandbox-provider-http-adapter-harness-smoke.mjs",
  "scripts/browser-sandbox-provider-live-lifecycle-harness-smoke.mjs",
  "scripts/storage-contract.mjs",
  "scripts/postgres-runtime-smoke.mjs",
  "scripts/postgres-production-readiness-smoke.mjs",
  "scripts/postgres-default-rollout-smoke.mjs",
  "scripts/postgres-production-profile-contract.mjs",
  "scripts/postgres-endpoint-regression-smoke.mjs",
  "scripts/postgres-production-profile-live-smoke.mjs",
  "scripts/postgres-backup-runbook-smoke.mjs",
  "scripts/postgres-provider-backup-policy-smoke.mjs",
  "docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md",
  "docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md",
  "project/deployment/postgres-provider-backup-policy.example.json",
  "project/deployment/browser-sandbox-provider.example.json",
  "project/deployment/browser-sandbox-provider.selection.example.json",
  "project/deployment/browser-sandbox-provider.live-preflight.example.env",
  "project/deployment/browser-sandbox-provider.live-verification.example.env",
  "project/deployment/browser-sandbox-provider.webrtc-signaling.example.env",
  "project/deployment/browser-sandbox-provider.visual-ocr-replay.example.env",
  "project/deployment/browser-sandbox-provider.launch-readiness.example.env",
  "project/deployment/browser-sandbox-provider.private-launch-execution.example.env",
  "project/deployment/browser-sandbox-provider.steel-operations.example.json",
  "project/deployment/browser-sandbox-provider.contract-harness.json",
  "project/deployment/browser-sandbox-provider.hosted-provider.example.json",
  "project/deployment/secrets/README.md",
  "project/deployment/secrets/database-url.example",
  "project/db/postgres-init/001_storage_readiness.sql",
  "src/concierge/databaseFactory.mjs",
  "src/concierge/databaseSecretProfile.mjs",
  "src/concierge/postgresStore.mjs",
  "src/concierge/workerLeases.mjs",
  "src/concierge/storageReadiness.mjs",
  "src/tests/deployment-storage.test.mjs",
  "src/tests/browser-sandbox-provider-contract.test.mjs",
  "src/tests/postgres-production-profile-contract.test.mjs",
  "src/tests/postgres-production-profile-live-contract.test.mjs",
  "src/tests/postgres-backup-runbook-contract.test.mjs",
  "src/tests/postgres-provider-backup-policy-contract.test.mjs",
  "src/tests/postgres-production-readiness-contract.test.mjs",
  "src/tests/worker-leases.test.mjs",
  "scripts/compose-memory-smoke.mjs",
  "tools/graphiti/graphiti_bridge.py",
  "vendor/getzep-graphiti/pyproject.toml",
  "src/tests/deployment-graphiti-compose.test.mjs"
  ,
  "infra/steel/remote/compose.yaml",
  "infra/steel/remote/Caddyfile",
  "infra/steel/remote/firewall.md",
  "infra/steel/remote/wireguard.md",
  "infra/steel/remote/recover.sh"
];

const COMPOSE_FRAGMENTS = [
  "node-runtime:",
  "fastapi:",
  "mobile-pwa:",
  "falkordb:",
  "postgres:",
  "postgres:16-alpine",
  "WEFELLA_NODE_RUNTIME_URL: http://node-runtime:4173",
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
  "WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED: ${WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED:-0}",
  "BRAINSTY_CONNECTOR_API_BASE: http://fastapi:8000",
  "BRAINSTY_DB_DRIVER: ${BRAINSTY_DB_DRIVER:-sqlite}",
  "BRAINSTY_DATABASE_TARGET: ${BRAINSTY_DATABASE_TARGET:-postgres}",
  "BRAINSTY_DATABASE_URL: ${BRAINSTY_DATABASE_URL:-postgresql://brainsty:brainsty-dev-only@postgres:5432/brainstyworkers?sslmode=disable}",
  "BRAINSTY_DATABASE_URL_FILE: ${BRAINSTY_DATABASE_URL_FILE:-}",
  "BRAINSTY_DATABASE_SECRET_SOURCE: ${BRAINSTY_DATABASE_SECRET_SOURCE:-direct_env}",
  "BRAINSTY_POSTGRES_LIVE_READY: ${BRAINSTY_POSTGRES_LIVE_READY:-0}",
  "BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: ${BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY:-0}",
  "BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: ${BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY:-0}",
  "BRAINSTY_POSTGRES_WORKER_LEASE_READY: ${BRAINSTY_POSTGRES_WORKER_LEASE_READY:-0}",
  "BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: ${BRAINSTY_POSTGRES_BACKUP_RESTORE_READY:-0}",
  "BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY: ${BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY:-0}",
  "BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY: ${BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY:-0}",
  "BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE: ${BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE:-project/deployment/postgres-provider-backup-policy.example.json}",
  "BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: ${BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY:-0}",
  "BRAINSTY_DATABASE_SECRET_PROFILE_READY: ${BRAINSTY_DATABASE_SECRET_PROFILE_READY:-0}",
  "BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: ${BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY:-0}",
  "BRAINSTY_PRODUCT_MEMORY_ADAPTER: ${BRAINSTY_PRODUCT_MEMORY_ADAPTER:-disabled}",
  "OPENAI_API_KEY: ${OPENAI_API_KEY:-}",
  "GRAPHITI_LLM_MODEL: ${GRAPHITI_LLM_MODEL:-gpt-4.1-mini}",
  "GRAPHITI_EMBEDDING_MODEL: ${GRAPHITI_EMBEDDING_MODEL:-text-embedding-3-small}",
  "FALKORDB_HOST: falkordb",
  "/api/v1/health",
  "/api/health",
  "condition: service_healthy",
  "node_runtime_data:",
  "fastapi_data:",
  "falkordb_data:",
  "postgres_data:"
];

const DOCKERIGNORE_FRAGMENTS = [
  ".env",
  ".env.*",
  "node_modules",
  "**/node_modules",
  ".venv-graphiti",
  "data",
  "artifacts",
  "project/deployment/secrets"
];

export async function assertDeploymentComposeContract({ verifyDockerConfig = false } = {}) {
  const missingFiles = [];
  for (const file of REQUIRED_FILES) {
    try {
      await access(resolve(REPO_ROOT, file));
    } catch {
      missingFiles.push(file);
    }
  }
  if (missingFiles.length) {
    throw new Error(`Missing deployment files: ${missingFiles.join(", ")}`);
  }

  const compose = await readFile(resolve(REPO_ROOT, "compose.yaml"), "utf8");
  const dockerignore = await readFile(resolve(REPO_ROOT, ".dockerignore"), "utf8");
  const nodeDockerfile = await readFile(resolve(REPO_ROOT, "Dockerfile.node"), "utf8");
  const apiDockerfile = await readFile(resolve(REPO_ROOT, "Dockerfile.api"), "utf8");
  const mobileDockerfile = await readFile(resolve(REPO_ROOT, "apps/mobile-next/Dockerfile"), "utf8");

  const missingComposeFragments = COMPOSE_FRAGMENTS.filter((fragment) => !compose.includes(fragment));
  if (missingComposeFragments.length) {
    throw new Error(`compose.yaml is missing required fragments: ${missingComposeFragments.join(", ")}`);
  }

  const missingIgnoreFragments = DOCKERIGNORE_FRAGMENTS.filter((fragment) => !dockerignore.includes(fragment));
  if (missingIgnoreFragments.length) {
    throw new Error(`.dockerignore is missing required fragments: ${missingIgnoreFragments.join(", ")}`);
  }

  for (const [name, body, expected] of [
    [
      "Dockerfile.node",
      nodeDockerfile,
      [
        "npm ci --omit=dev",
        "HOST=0.0.0.0",
        "python3 -m venv .venv-graphiti",
        "vendor/getzep-graphiti[falkordb]",
        "graphiti_core.driver.falkordb_driver",
        "USER node",
        "HEALTHCHECK",
        "/api/health",
        "BRAINSTY_DB_DRIVER",
        "compose.postgres.yaml"
      ]
    ],
    ["Dockerfile.api", apiDockerfile, ["python:3.12-slim", "project/requirements.txt", "USER app", "HEALTHCHECK", "/api/v1/health", "WEFELLA_BROWSER_SANDBOX_PROVIDER"]],
    ["apps/mobile-next/Dockerfile", mobileDockerfile, ["npm run build", "BRAINSTY_CONNECTOR_API_BASE=http://fastapi:8000", "USER node", "HEALTHCHECK", "server.js"]]
  ]) {
    const missing = expected.filter((fragment) => !body.includes(fragment));
    if (missing.length) {
      throw new Error(`${name} is missing required fragments: ${missing.join(", ")}`);
    }
  }

  if (!compose.includes("externalWriteActionsWithoutApproval") && !compose.includes("WEFELLA_NODE_RUNTIME_URL")) {
    throw new Error("Deployment contract does not visibly preserve the FastAPI-to-Node connector boundary.");
  }

  const postgresProductionProfile = await assertPostgresProductionProfileContract({ verifyDockerConfig: false });

  let dockerConfig = { checked: false, ok: null, error: null };
  if (verifyDockerConfig) {
    try {
      const { stdout } = await execFileAsync("docker", ["compose", "config"], {
        cwd: REPO_ROOT,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 4
      });
      dockerConfig = {
        checked: true,
        ok: stdout.includes("node-runtime") && stdout.includes("fastapi") && stdout.includes("mobile-pwa") && stdout.includes("postgres"),
        error: null
      };
      if (!dockerConfig.ok) {
        throw new Error("docker compose config output did not include required services.");
      }
    } catch (error) {
      dockerConfig = { checked: true, ok: false, error: error.message };
      throw new Error(`docker compose config failed: ${error.message}`);
    }
  }

  return {
    ok: true,
    files: REQUIRED_FILES,
    services: ["node-runtime", "fastapi", "mobile-pwa", "falkordb", "postgres"],
    storageRuntime: {
      runtimeDriverDefault: "sqlite",
      productionTarget: "postgres",
      composeService: "postgres",
      smokeCommand: "npm run storage:postgres:smoke",
      runtimeSmokeCommand: "npm run storage:postgres:runtime-smoke",
      productionSmokeCommand: "npm run storage:postgres:production-smoke",
      defaultRolloutCommand: "npm run storage:postgres:default-rollout-smoke",
      productionProfileCommand: "npm run storage:postgres:profile-contract",
      endpointRegressionCommand: "npm run storage:postgres:endpoint-regression-smoke",
      productionProfileLiveCommand: "npm run storage:postgres:profile-live-smoke",
      backupRunbookCommand: "npm run storage:postgres:backup-runbook-smoke",
      providerBackupPolicyCommand: "npm run storage:postgres:provider-backup-policy-smoke"
    },
    browserSandbox: {
      defaultProvider: "local_cdp",
      hostedProviderContract: "project/deployment/browser-sandbox-provider.example.json",
      providerSelectionContract: "project/deployment/browser-sandbox-provider.selection.example.json",
      providerLivePreflightEnvExample: "project/deployment/browser-sandbox-provider.live-preflight.example.env",
      providerLiveVerificationEnvExample: "project/deployment/browser-sandbox-provider.live-verification.example.env",
      providerWebrtcSignalingEnvExample: "project/deployment/browser-sandbox-provider.webrtc-signaling.example.env",
      providerVisualOcrReplayEnvExample: "project/deployment/browser-sandbox-provider.visual-ocr-replay.example.env",
      providerLaunchReadinessEnvExample: "project/deployment/browser-sandbox-provider.launch-readiness.example.env",
      providerPrivateLaunchExecutionEnvExample: "project/deployment/browser-sandbox-provider.private-launch-execution.example.env",
      providerSteelOperationsContract: "project/deployment/browser-sandbox-provider.steel-operations.example.json",
      providerSteelRemoteCompose: "infra/steel/remote/compose.yaml",
      providerSteelRemoteProxyConfig: "infra/steel/remote/Caddyfile",
      providerSteelRemoteFirewallRunbook: "infra/steel/remote/firewall.md",
      providerSteelRemoteTunnelRunbook: "infra/steel/remote/wireguard.md",
      providerSteelRemoteRecoveryScript: "infra/steel/remote/recover.sh",
      providerLaunchReadinessRunbook: "docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md",
      adapterHarnessContract: "project/deployment/browser-sandbox-provider.contract-harness.json",
      providerResolverContract: "project/deployment/browser-sandbox-provider.hosted-provider.example.json",
      providerContractCommand: "npm run sandbox:browser:provider-contract",
      providerSelectionCommand: "npm run sandbox:browser:provider-selection",
      providerLivePreflightCommand: "npm run sandbox:browser:provider-live-preflight",
      providerLiveVerificationCommand: "npm run sandbox:browser:provider-live-verification",
      providerWebrtcSignalingCommand: "npm run sandbox:browser:provider-webrtc-signaling",
      providerVisualOcrReplayCommand: "npm run sandbox:browser:provider-visual-ocr-replay",
      providerLaunchReadinessCommand: "npm run sandbox:browser:provider-launch-readiness",
      providerPrivateLaunchExecutionCommand: "npm run sandbox:browser:provider-private-launch-execution",
      providerSteelOperationsCommand: "npm run sandbox:browser:steel-operations",
      providerSteelRemoteReadinessCommand: "npm run sandbox:browser:steel-remote-readiness",
      adapterHarnessCommand: "npm run sandbox:browser:adapter-harness",
      providerResolverCommand: "npm run sandbox:browser:provider-resolver",
      providerAdapterCommand: "npm run sandbox:browser:provider-adapter",
      providerHttpAdapterCommand: "npm run sandbox:browser:provider-http-adapter",
      providerLiveLifecycleCommand: "npm run sandbox:browser:provider-live-lifecycle",
      readyEnv: "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY"
    },
    postgresProductionProfile,
    graphitiRuntime: {
      dockerfileReady: true,
      bridge: "tools/graphiti/graphiti_bridge.py",
      packageSource: "vendor/getzep-graphiti",
      backend: "falkordb",
      smokeCommand: "npm run docker:memory:smoke"
    },
    dockerConfig
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const staticOnly = process.argv.includes("--static-only");
  assertDeploymentComposeContract({ verifyDockerConfig: !staticOnly })
    .then((result) => {
      console.log(JSON.stringify({ ...result, mode: staticOnly ? "static_only" : "docker_compose_config" }, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
