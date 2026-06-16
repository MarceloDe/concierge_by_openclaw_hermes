import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POSTGRES_ENDPOINT_REGRESSION_SMOKE_VERSION } from "../../scripts/postgres-endpoint-regression-smoke.mjs";
import { POSTGRES_PRODUCTION_PROFILE_LIVE_SMOKE_VERSION } from "../../scripts/postgres-production-profile-live-smoke.mjs";

test("Postgres endpoint regression smoke is versioned and covers core runtime endpoints", async () => {
  const source = await readFile(new URL("../../scripts/postgres-endpoint-regression-smoke.mjs", import.meta.url), "utf8");
  assert.match(POSTGRES_ENDPOINT_REGRESSION_SMOKE_VERSION, /postgres-endpoint-regression/);
  for (const fragment of [
    "/api/health",
    "/api/proof/runs/postgres-endpoint-regression",
    "/api/openclaw/skills",
    "/api/orchestrator/auth-start",
    "/api/memory/context",
    "/api/chat",
    "/api/openclaw/skills/insurance_portal_browser/validate-envelope",
    "BRAINSTY_DB_DRIVER",
    "postgres_production_ready",
    "actionsTaken"
  ]) {
    assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Postgres production profile live smoke uses compose override and Docker-secret source", async () => {
  const source = await readFile(new URL("../../scripts/postgres-production-profile-live-smoke.mjs", import.meta.url), "utf8");
  assert.match(POSTGRES_PRODUCTION_PROFILE_LIVE_SMOKE_VERSION, /postgres-production-profile-live/);
  for (const fragment of [
    "compose.postgres.yaml",
    "BRAINSTY_DATABASE_URL_SECRET_FILE",
    "runPostgresDefaultRolloutSmoke",
    "node-runtime",
    "fastapi",
    "mobile-pwa",
    "/api/v1/health",
    "database_product_ready_architecture",
    "database_deployment_profile",
    "rawDatabaseUrlWritten"
  ]) {
    assert.match(source, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /console\.log\(.*database-url/i);
});
