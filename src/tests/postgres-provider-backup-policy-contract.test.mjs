import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  POSTGRES_PROVIDER_BACKUP_POLICY_SMOKE_VERSION,
  validatePostgresProviderBackupPolicy,
  runPostgresProviderBackupPolicySmoke
} from "../../scripts/postgres-provider-backup-policy-smoke.mjs";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";

test("Postgres provider backup policy smoke validates a sanitized hosted-provider contract", async () => {
  const source = await readFile(new URL("../../scripts/postgres-provider-backup-policy-smoke.mjs", import.meta.url), "utf8");
  assert.match(POSTGRES_PROVIDER_BACKUP_POLICY_SMOKE_VERSION, /postgres-provider-backup-policy/);
  const validation = await validatePostgresProviderBackupPolicy();
  assert.equal(validation.ok, true);
  assert.equal(validation.sanitizedPolicy.source.examplePolicy, true);
  assert.equal(validation.sanitizedPolicy.backupPolicy.pitrEnabled, true);
  assert.equal(validation.sanitizedPolicy.restoreRehearsal.requiresEndpointRegression, true);
  for (const fragment of [
    "BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY",
    "BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE",
    "database_url_ref_must_not_be_raw_url",
    "destructive_production_restore_must_not_be_allowed"
  ]) {
    assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("provider backup policy smoke does not claim hosted readiness from the example file", async () => {
  const result = await runPostgresProviderBackupPolicySmoke({
    artifactPath: "/tmp/brainsty-postgres-provider-backup-policy-smoke-test.json",
    providerReady: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.hostedProviderReady, false);
  assert.equal(result.status, "provider_policy_contract_valid_not_hosted");
  assert.equal(result.safety.rawDatabaseUrlWritten, false);
  assert.equal(result.safety.rawSecretFilePathWritten, false);
  assert.equal(result.safety.destructiveProductionRestore, false);
});

test("storage readiness reports provider backup policy separately from runbook and migration score", () => {
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
      postgresProviderBackupPolicyReady: true,
      postgresEndpointParityReady: true,
      databaseSecretProfileReady: true,
      postgresDefaultRolloutReady: true
    },
    env: {
      BRAINSTY_DB_DRIVER: "sqlite",
      BRAINSTY_DATABASE_TARGET: "postgres"
    }
  });
  assert.equal(readiness.score, 95);
  assert.equal(readiness.postgres.backupRunbookReady, true);
  assert.equal(readiness.postgres.providerBackupPolicyReady, true);
  assert.equal(readiness.postgres.providerBackupPolicyCommand, "npm run storage:postgres:provider-backup-policy-smoke");
  assert.equal(readiness.fullMigrationReady, false);
});
