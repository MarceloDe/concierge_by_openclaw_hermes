import { execFile } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const STORAGE_CONTRACT_VERSION = "2026-06-15.postgres-storage-profile.v1";

const REQUIRED_FILES = [
  "compose.yaml",
  "project/db/postgres-init/001_storage_readiness.sql",
  "src/concierge/databaseFactory.mjs",
  "src/concierge/postgresStore.mjs",
  "src/concierge/workerLeases.mjs",
  "src/concierge/storageReadiness.mjs",
  "scripts/postgres-runtime-smoke.mjs",
  "scripts/postgres-production-readiness-smoke.mjs",
  "src/tests/postgres-store-contract.test.mjs",
  "src/tests/postgres-production-readiness-contract.test.mjs",
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
  "BRAINSTY_POSTGRES_LIVE_READY: ${BRAINSTY_POSTGRES_LIVE_READY:-0}",
  "BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: ${BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY:-0}",
  "BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: ${BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY:-0}",
  "BRAINSTY_POSTGRES_WORKER_LEASE_READY: ${BRAINSTY_POSTGRES_WORKER_LEASE_READY:-0}",
  "BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: ${BRAINSTY_POSTGRES_BACKUP_RESTORE_READY:-0}",
  "BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: ${BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY:-0}",
  "BRAINSTY_DATABASE_SECRET_PROFILE_READY: ${BRAINSTY_DATABASE_SECRET_PROFILE_READY:-0}",
  "postgres_data:"
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

  const [compose, storageModule, initSql, postgresStore, workerLeases, runtimeSmoke, productionSmoke] = await Promise.all([
    readFile(resolve(REPO_ROOT, "compose.yaml"), "utf8"),
    readFile(resolve(REPO_ROOT, "src/concierge/storageReadiness.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "project/db/postgres-init/001_storage_readiness.sql"), "utf8"),
    readFile(resolve(REPO_ROOT, "src/concierge/postgresStore.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "src/concierge/workerLeases.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "scripts/postgres-runtime-smoke.mjs"), "utf8"),
    readFile(resolve(REPO_ROOT, "scripts/postgres-production-readiness-smoke.mjs"), "utf8")
  ]);

  assertIncludes(compose, COMPOSE_FRAGMENTS, "compose.yaml");
  assertIncludes(
    storageModule,
    [
      "DATABASE_ADAPTER_VERSION",
      "POSTGRES_ADAPTER_VERSION",
      "runtimeSmokeReady",
      "productionSmokeReady",
      "workerLeaseReady",
      "backupRestoreReady",
      "endpointParityReady",
      "secretProfileReady",
      "productionSmokeCommand",
      "fullMigrationReady"
    ],
    "storageReadiness.mjs"
  );
  assertIncludes(postgresStore, ["from \"pg\"", "POSTGRES_ADAPTER_VERSION", "toPostgresSql", "BEGIN;", "ROLLBACK;"], "postgresStore.mjs");
  assertIncludes(workerLeases, ["WORKER_LEASES_VERSION", "acquireWorkerLease", "heartbeatWorkerLease", "releaseWorkerLease", "expireWorkerLeases"], "workerLeases.mjs");
  assertIncludes(runtimeSmoke, ["PostgresStore", "enrollDefaultMember", "checkpointSession", "postgres_runtime_smoke_completed"], "postgres-runtime-smoke.mjs");
  assertIncludes(
    productionSmoke,
    ["runPostgresProductionReadinessSmoke", "seedEndpointParityPath", "proveWorkerLease", "restoreSnapshot", "temporaryDatabases"],
    "postgres-production-readiness-smoke.mjs"
  );
  assertIncludes(initSql, ["brainsty_storage_readiness", STORAGE_CONTRACT_VERSION, "ON CONFLICT"], "Postgres init SQL");

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
    appRuntimeMigratedToPostgres: false,
    runtimeSmokeCommand: "npm run storage:postgres:runtime-smoke",
    productionSmokeCommand: "npm run storage:postgres:production-smoke",
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
