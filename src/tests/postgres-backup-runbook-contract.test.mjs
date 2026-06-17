import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  POSTGRES_BACKUP_RUNBOOK_SMOKE_VERSION,
  validatePostgresBackupRunbook
} from "../../scripts/postgres-backup-runbook-smoke.mjs";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";

test("Postgres backup runbook smoke is versioned and validates the operator runbook", async () => {
  const source = await readFile(new URL("../../scripts/postgres-backup-runbook-smoke.mjs", import.meta.url), "utf8");
  assert.match(POSTGRES_BACKUP_RUNBOOK_SMOKE_VERSION, /postgres-backup-runbook/);
  const runbook = await validatePostgresBackupRunbook();
  assert.equal(runbook.ok, true);
  for (const fragment of [
    "POSTGRES_BACKUP_RUNBOOK_SMOKE_VERSION",
    "runPostgresBackupRunbookSmoke",
    "runPostgresProductionReadinessSmoke",
    "rawDatabaseUrlWritten",
    "BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY"
  ]) {
    assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("storage readiness reports backup runbook gate separately from database migration score", () => {
  const readiness = getStorageReadiness({
    deployment: {
      postgresRuntimeReady: true,
      postgresLiveReady: true,
      postgresAdapterRuntimeReady: true,
      postgresRuntimeSmokeReady: true,
      postgresProductionSmokeReady: true,
      postgresWorkerLeaseReady: true,
      postgresBackupRestoreReady: true,
      postgresBackupRunbookReady: true,
      postgresEndpointParityReady: true,
      databaseSecretProfileReady: true,
      postgresDefaultRolloutReady: true
    },
    env: {
      BRAINSTY_DB_DRIVER: "sqlite",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: "postgresql://brainsty:secret-password@postgres:5432/brainstyworkers?sslmode=disable"
    }
  });
  assert.equal(readiness.score, 95);
  assert.equal(readiness.postgres.backupRunbookReady, true);
  assert.equal(readiness.postgres.backupRunbookCommand, "npm run storage:postgres:backup-runbook-smoke");
  assert.equal(readiness.fullMigrationReady, false);
});
