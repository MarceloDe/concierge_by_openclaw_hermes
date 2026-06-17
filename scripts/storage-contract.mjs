import { execFile } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assertPostgresProductionProfileContract } from "./postgres-production-profile-contract.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const STORAGE_CONTRACT_VERSION = "2026-06-15.postgres-storage-profile.v1";

const REQUIRED_FILES = [
  "compose.yaml",
  "project/db/postgres-init/001_storage_readiness.sql",
  "src/concierge/databaseFactory.mjs",
  "src/concierge/databaseSecretProfile.mjs",
  "src/concierge/postgresStore.mjs",
  "src/concierge/workerLeases.mjs",
  "src/concierge/storageReadiness.mjs",
  "scripts/postgres-runtime-smoke.mjs",
  "scripts/postgres-production-readiness-smoke.mjs",
  "scripts/postgres-default-rollout-smoke.mjs",
  "scripts/postgres-production-profile-contract.mjs",
  "scripts/postgres-endpoint-regression-smoke.mjs",
  "scripts/postgres-production-profile-live-smoke.mjs",
  "scripts/postgres-backup-runbook-smoke.mjs",
  "docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md",
  "compose.postgres.yaml",
  "project/deployment/secrets/README.md",
  "project/deployment/secrets/database-url.example",
  "src/tests/postgres-store-contract.test.mjs",
  "src/tests/postgres-production-readiness-contract.test.mjs",
  "src/tests/postgres-production-profile-contract.test.mjs",
  "src/tests/postgres-production-profile-live-contract.test.mjs",
  "src/tests/postgres-backup-runbook-contract.test.mjs",
  "src/tests/worker-leases.test.mjs",
  "src/tests/deployment-storage.test.mjs"
];

const COMPOSE_FRAGMENTS = [
  "postgres:",
  "postgres:16-alpine",
  "POSTGRES_DB: ${BRAINSTY_POSTGRES_DB:-brainstyworkers}",
  "POSTGRES_USER: ${BRAINSTY_POSTGRES_USER:-brainsty}",
  "POSTGRES_PASSWORD: ${BRAINSTY_POSTGRES_PASSWORD:-brainsty-dev-only}",
  "${BRAINSTY_COMPOSE_POSTGRES_PORT:-55432}:5432",
  "./project/db/postgres-init:/docker-entrypoint-initdb.d:ro",
  "pg_isready -U \"$$POSTGRES_USER\" -d \"$$POSTGRES_DB\"",
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
  "BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: ${BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY:-0}",
  "BRAINSTY_DATABASE_SECRET_PROFILE_READY: ${BRAINSTY_DATABASE_SECRET_PROFILE_READY:-0}",
  "BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: ${BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY:-0}",
  "postgres_data:"
];

const PROFILE_COMPOSE_FRAGMENTS = [
  "BRAINSTY_DB_DRIVER: postgres",
  "BRAINSTY_DATABASE_URL_FILE: /run/secrets/brainsty_database_url",
  "BRAINSTY_DATABASE_SECRET_SOURCE: docker_secret",
  "BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: ${BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY:-0}",
  "source: brainsty_database_url"
];

function assertIncludes(body, fragments, label) {
  const missing = fragments.filter((fragment) => !body.includes(fragment));
  if (missing.length) throw new Error(`${label} is missing required fragments: ${missing.join(", ")}`);
}

async function checkPostgresLive() {
  const sql = `
    CREATE TABLE IF NOT EXISTS brainsty_storage_readiness (
      id TEXT PRIMARY KEY,
      contract_version TEXT NOT NULL,
      service_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO brainsty_storage_readiness (id, contract_version, service_name)
    VALUES ('brainstyworkers-postgres-live-smoke', '${STORAGE_CONTRACT_VERSION}', 'postgres')
    ON CONFLICT (id)
    DO UPDATE SET contract_version = EXCLUDED.contract_version, service_name = EXCLUDED.service_name, updated_at = now();
    SELECT id, contract_version, service_name FROM brainsty_storage_readiness WHERE id = 'brainstyworkers-postgres-live-smoke';
  `;
  const commandSql = sql.replace(/\s+/g, " ").trim();
  const command = `PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At -F '|' -c ${JSON.stringify(commandSql)}`;
  const { stdout } = await execFileAsync("docker", ["compose", "exec", "-T", "postgres", "sh", "-lc", command], {
    cwd: REPO_ROOT,
    timeout: 30000,
    maxBuffer: 1024 * 1024
  });
  const line = stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith("brainstyworkers-postgres-live-smoke|"));
  if (!line) throw new Error(`Postgres readiness row was not returned: ${stdout}`);
  const [id, contractVersion, serviceName] = line.split("|");
  return {
    checked: true,
    ok: contractVersion === STORAGE_CONTRACT_VERSION && serviceName === "postgres",
    id,
    contractVersion,
    serviceName
  };
}

export async function assertStorageContract({ verifyLivePostgres = false } = {}) {
  const missingFiles = [];
  for (const file of REQUIRED_FILES) {
    try {
      await access(resolve(REPO_ROOT, file));
    } catch {
      missingFiles.push(file);
    }
  }
  if (missingFiles.length) throw new Error(`Missing storage contract files: ${missingFiles.join(", ")}`);

  const [
    compose,
    profileCompose,
    storageModule,
    initSql,
    postgresStore,
    secretProfile,
    workerLeases,
    runtimeSmoke,
    productionSmoke,
    defaultRolloutSmoke,
    endpointRegressionSmoke,
    profileLiveSmoke,
    backupRunbookSmoke,
    backupRunbook
  ] = await Promise.all([
    readFile(resolve(REPO_ROOT, "compose.yaml"), "utf8"),
    readFile(resolve(REPO_ROOT, "compose.postgres.yaml"), "utf8"),
    readFile(resolve(REPO_ROOT, "src/concierge/storageReadiness.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "project/db/postgres-init/001_storage_readiness.sql"), "utf8"),
    readFile(resolve(REPO_ROOT, "src/concierge/postgresStore.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "src/concierge/databaseSecretProfile.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "src/concierge/workerLeases.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "scripts/postgres-runtime-smoke.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "scripts/postgres-production-readiness-smoke.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "scripts/postgres-default-rollout-smoke.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "scripts/postgres-endpoint-regression-smoke.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "scripts/postgres-production-profile-live-smoke.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "scripts/postgres-backup-runbook-smoke.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md"), "utf8")
  ]);

  assertIncludes(compose, COMPOSE_FRAGMENTS, "compose.yaml");
  assertIncludes(profileCompose, PROFILE_COMPOSE_FRAGMENTS, "compose.postgres.yaml");
  assertIncludes(
    storageModule,
    [
      "DATABASE_ADAPTER_VERSION",
      "POSTGRES_ADAPTER_VERSION",
      "runtimeSmokeReady",
      "productionSmokeReady",
      "workerLeaseReady",
      "backupRestoreReady",
      "backupRunbookReady",
      "endpointParityReady",
      "secretProfileReady",
      "defaultRolloutReady",
      "productionSmokeCommand",
      "backupRunbookCommand",
      "defaultRolloutCommand",
      "fullMigrationReady"
    ],
    "storageReadiness.mjs"
  );
  assertIncludes(postgresStore, ["from \"pg\"", "POSTGRES_ADAPTER_VERSION", "toPostgresSql", "BEGIN;", "ROLLBACK;"], "postgresStore.mjs");
  assertIncludes(secretProfile, ["DATABASE_SECRET_PROFILE_VERSION", "BRAINSTY_DATABASE_URL_FILE", "publicDatabaseSecretProfile", "redactDatabaseUrl"], "databaseSecretProfile.mjs");
  assertIncludes(workerLeases, ["WORKER_LEASES_VERSION", "acquireWorkerLease", "heartbeatWorkerLease", "releaseWorkerLease", "expireWorkerLeases"], "workerLeases.mjs");
  assertIncludes(runtimeSmoke, ["PostgresStore", "enrollDefaultMember", "checkpointSession", "postgres_runtime_smoke_completed"], "postgres-runtime-smoke.mjs");
  assertIncludes(
    productionSmoke,
    ["runPostgresProductionReadinessSmoke", "seedEndpointParityPath", "proveWorkerLease", "restoreSnapshot", "temporaryDatabases"],
    "postgres-production-readiness-smoke.mjs"
  );
  assertIncludes(
    defaultRolloutSmoke,
    ["POSTGRES_DEFAULT_ROLLOUT_SMOKE_VERSION", "runPostgresDefaultRolloutSmoke", "BRAINSTY_DB_DRIVER", "BRAINSTY_DATABASE_URL_FILE"],
    "postgres-default-rollout-smoke.mjs"
  );
  assertIncludes(
    endpointRegressionSmoke,
    ["POSTGRES_ENDPOINT_REGRESSION_SMOKE_VERSION", "runPostgresEndpointRegressionSmoke", "/api/chat", "postgres_production_ready"],
    "postgres-endpoint-regression-smoke.mjs"
  );
  assertIncludes(
    profileLiveSmoke,
    ["POSTGRES_PRODUCTION_PROFILE_LIVE_SMOKE_VERSION", "runPostgresProductionProfileLiveSmoke", "compose.postgres.yaml", "/api/v1/health"],
    "postgres-production-profile-live-smoke.mjs"
  );
  assertIncludes(
    backupRunbookSmoke,
    ["POSTGRES_BACKUP_RUNBOOK_SMOKE_VERSION", "runPostgresBackupRunbookSmoke", "validatePostgresBackupRunbook", "runPostgresProductionReadinessSmoke"],
    "postgres-backup-runbook-smoke.mjs"
  );
  assertIncludes(
    backupRunbook,
    ["Backup Schedule", "Restore Rehearsal", "Incident Restore", "RPO target", "RTO target", "Acceptance Gate"],
    "POSTGRES_BACKUP_RESTORE_RUNBOOK.md"
  );
  assertIncludes(initSql, ["brainsty_storage_readiness", STORAGE_CONTRACT_VERSION, "ON CONFLICT"], "Postgres init SQL");
  const postgresProductionProfile = await assertPostgresProductionProfileContract({ verifyDockerConfig: false });

  const livePostgres = verifyLivePostgres
    ? await checkPostgresLive()
    : { checked: false, ok: null };

  if (livePostgres.checked && !livePostgres.ok) {
    throw new Error("Postgres live smoke returned an unexpected readiness row.");
  }

  return {
    ok: true,
    version: STORAGE_CONTRACT_VERSION,
    files: REQUIRED_FILES,
    services: ["postgres"],
    runtimeDriverDefault: "sqlite",
    productionTarget: "postgres",
    postgresAdapterReady: true,
    postgresProductionReadinessReady: true,
    postgresDefaultRolloutReady: true,
    postgresProductionProfileReady: postgresProductionProfile.ok,
    appRuntimeMigratedToPostgres: false,
    runtimeSmokeCommand: "npm run storage:postgres:runtime-smoke",
    productionSmokeCommand: "npm run storage:postgres:production-smoke",
    defaultRolloutCommand: "npm run storage:postgres:default-rollout-smoke",
    productionProfileCommand: "npm run storage:postgres:profile-contract",
    endpointRegressionCommand: "npm run storage:postgres:endpoint-regression-smoke",
    productionProfileLiveCommand: "npm run storage:postgres:profile-live-smoke",
    backupRunbookCommand: "npm run storage:postgres:backup-runbook-smoke",
    postgresProductionProfile,
    livePostgres
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verifyLivePostgres = process.argv.includes("--live");
  assertStorageContract({ verifyLivePostgres })
    .then((result) => {
      console.log(JSON.stringify({ ...result, mode: verifyLivePostgres ? "live_postgres" : "static_contract" }, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
