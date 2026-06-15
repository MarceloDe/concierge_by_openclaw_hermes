import test from "node:test";
import assert from "node:assert/strict";
import { assertStorageContract } from "../../scripts/storage-contract.mjs";
import { getStorageReadiness } from "../concierge/storageReadiness.mjs";

test("storage contract defines a Postgres deployment target while preserving SQLite runtime", async () => {
  const result = await assertStorageContract({ verifyLivePostgres: false });
  assert.equal(result.ok, true);
  assert.equal(result.runtimeDriverDefault, "sqlite");
  assert.equal(result.productionTarget, "postgres");
  assert.equal(result.appRuntimeMigratedToPostgres, false);
  assert.deepEqual(result.services, ["postgres"]);
  assert.equal(result.livePostgres.checked, false);
});

test("storage readiness redacts database URLs and does not overstate runtime migration", () => {
  const readiness = getStorageReadiness({
    deployment: { postgresRuntimeReady: true, postgresLiveReady: false },
    env: {
      BRAINSTY_DB_DRIVER: "sqlite",
      BRAINSTY_DB_PATH: "/tmp/brainsty.sqlite",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: "postgresql://brainsty:secret-password@postgres:5432/brainstyworkers?sslmode=disable"
    }
  });
  assert.equal(readiness.ok, true);
  assert.equal(readiness.status, "postgres_compose_profile_present_sqlite_runtime");
  assert.equal(readiness.runtimeDriver, "sqlite");
  assert.equal(readiness.appRuntimeMigratedToPostgres, false);
  assert.equal(readiness.migrationPending, true);
  assert.match(readiness.postgres.redactedUrl, /redacted:redacted@postgres/);
  assert.equal(readiness.sqlite.sqliteShellOut, false);
  assert.equal(readiness.safety.phiSeeded, false);
});
