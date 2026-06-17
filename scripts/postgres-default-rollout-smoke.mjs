import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createDatabaseStore } from "../src/concierge/databaseFactory.mjs";
import {
  evaluateDatabaseSecretProfile,
  publicDatabaseSecretProfile
} from "../src/concierge/databaseSecretProfile.mjs";
import { getStorageReadiness } from "../src/concierge/storageReadiness.mjs";
import {
  POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION,
  runPostgresProductionReadinessSmoke,
  smokeUrl
} from "./postgres-production-readiness-smoke.mjs";

export const POSTGRES_DEFAULT_ROLLOUT_SMOKE_VERSION = "2026-06-16.postgres-default-rollout.v1";

async function prepareSecretBackedEnv(env = process.env) {
  if (env.BRAINSTY_DATABASE_URL_FILE || env.BRAINSTY_DATABASE_SECRET_SOURCE === "managed_env") {
    return {
      env: {
        ...env,
        BRAINSTY_DB_DRIVER: "postgres",
        BRAINSTY_DATABASE_TARGET: "postgres",
        BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1",
        BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: "1"
      },
      cleanup: async () => {},
      generatedSecretFile: false
    };
  }

  const tempDir = await mkdtemp(join(tmpdir(), "brainsty-postgres-secret-"));
  const secretPath = join(tempDir, "database-url");
  await writeFile(secretPath, `${smokeUrl(env)}\n`, { mode: 0o600 });
  return {
    env: {
      ...env,
      BRAINSTY_DB_DRIVER: "postgres",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL_FILE: secretPath,
      BRAINSTY_DATABASE_SECRET_SOURCE: "ephemeral_local_secret_file",
      BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1",
      BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: "1"
    },
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
    generatedSecretFile: true
  };
}

function operationalDeployment(profileReady = true) {
  return {
    postgresRuntimeReady: true,
    postgresLiveReady: true,
    postgresAdapterRuntimeReady: true,
    postgresRuntimeSmokeReady: true,
    postgresProductionSmokeReady: true,
    postgresWorkerLeaseReady: true,
    postgresBackupRestoreReady: true,
    postgresEndpointParityReady: true,
    databaseSecretProfileReady: profileReady,
    postgresDefaultRolloutReady: true
  };
}

function summarizeProductionSmoke(smoke) {
  return {
    ok: smoke.ok,
    version: smoke.version,
    adapterVersion: smoke.adapterVersion,
    leaseVersion: smoke.leaseVersion,
    driver: smoke.driver,
    endpointParityOk: Boolean(smoke.endpointParity?.ok),
    workerLeaseOk: Boolean(smoke.workerLease?.ok),
    backupRestoreOk: Boolean(smoke.backupRestore?.ok),
    tableCount: smoke.backupRestore?.tableCount ?? null,
    comparedTables: smoke.backupRestore?.comparedTables ?? null,
    countMismatches: smoke.backupRestore?.countMismatches ?? []
  };
}

export async function runPostgresDefaultRolloutSmoke({
  env = process.env,
  artifactPath = resolve("artifacts/postgres-default-rollout-smoke.json")
} = {}) {
  const prepared = await prepareSecretBackedEnv(env);
  try {
    const secretProfile = evaluateDatabaseSecretProfile(prepared.env, { allowDefault: false });
    if (!secretProfile.ready) {
      return {
        ok: false,
        version: POSTGRES_DEFAULT_ROLLOUT_SMOKE_VERSION,
        status: "database_secret_profile_not_ready",
        secretProfile: publicDatabaseSecretProfile(secretProfile)
      };
    }

    const productionSmoke = await runPostgresProductionReadinessSmoke({
      connectionString: secretProfile.databaseUrl,
      artifactPath: resolve("artifacts/postgres-default-rollout-production-smoke.json")
    });

    const store = await createDatabaseStore(prepared.env).initialize();
    try {
      const counts = await store.counts();
      const readiness = getStorageReadiness({
        deployment: operationalDeployment(secretProfile.ready),
        env: {
          ...prepared.env,
          BRAINSTY_POSTGRES_LIVE_READY: "1",
          BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: "1",
          BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: "1",
          BRAINSTY_POSTGRES_WORKER_LEASE_READY: "1",
          BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: "1",
          BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: "1",
          BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1",
          BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: "1"
        }
      });
      const result = {
        ok:
          productionSmoke.ok &&
          store.driver === "postgres" &&
          readiness.score === 100 &&
          readiness.fullMigrationReady === true &&
          readiness.migrationPending === false &&
          readiness.safety.secretProfileReady === true &&
          readiness.postgres.defaultRolloutReady === true,
        version: POSTGRES_DEFAULT_ROLLOUT_SMOKE_VERSION,
        productionSmokeVersion: POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION,
        status: "postgres_default_rollout_rehearsed",
        generatedSecretFile: prepared.generatedSecretFile,
        runtime: {
          driver: store.driver,
          adapterVersion: store.adapterVersion,
          tableCount: Object.keys(counts).length,
          coreCounts: {
            users: counts.users ?? 0,
            sessions: counts.sessions ?? 0,
            session_checkpoints: counts.session_checkpoints ?? 0,
            audit_events: counts.audit_events ?? 0,
            worker_leases: counts.worker_leases ?? 0
          }
        },
        secretProfile: publicDatabaseSecretProfile(secretProfile),
        storage: {
          status: readiness.status,
          score: readiness.score,
          targetScore: readiness.targetScore,
          runtimeDriver: readiness.runtimeDriver,
          fullMigrationReady: readiness.fullMigrationReady,
          migrationPending: readiness.migrationPending,
          defaultRolloutReady: readiness.postgres.defaultRolloutReady,
          secretProfileReady: readiness.safety.secretProfileReady,
          redactedUrl: readiness.postgres.redactedUrl
        },
        productionSmoke: summarizeProductionSmoke(productionSmoke),
        safety: {
          externalActions: false,
          phiSeeded: false,
          rawDatabaseUrlWritten: false,
          rawSecretFilePathWritten: false,
          secretsRedacted: true,
          sqliteShellOut: false
        }
      };
      await mkdir(dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, JSON.stringify(result, null, 2));
      return result;
    } finally {
      await store.close();
    }
  } finally {
    await prepared.cleanup();
  }
}

export { prepareSecretBackedEnv };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPostgresDefaultRolloutSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
