#!/usr/bin/env node
// Erase the prior process catalog and reseed the canonical 8 processes (one per workflow), so no
// residual/stale process drives the runtime. Runs against the LIVE database (createDatabaseStore),
// FK-safe and idempotent. Fail-loud: throws on connect failure; refuses prod unless explicitly
// allowed. Usage: node scripts/reset-process-catalog.mjs --confirm
import { loadLocalEnvOnce } from "../src/concierge/secrets.mjs";
import { createDatabaseStore, isProductionDatabaseProfile, resolveDatabaseDriver } from "../src/concierge/databaseFactory.mjs";
import { createId, nowIso } from "../src/concierge/database.mjs";
import { seedCapabilityCatalog, CAPABILITY_CATALOG } from "../src/concierge/capabilityCatalogSeed.mjs";

async function main() {
  await loadLocalEnvOnce();
  const confirm = process.argv.includes("--confirm");
  if (!confirm) {
    console.error("Refusing to run without --confirm. Usage: node scripts/reset-process-catalog.mjs --confirm");
    process.exit(1);
  }
  if (isProductionDatabaseProfile() && process.env.BRAINSTY_ALLOW_CATALOG_RESET !== "1") {
    console.error("Refusing to reset the process catalog on a production profile. Set BRAINSTY_ALLOW_CATALOG_RESET=1 to override.");
    process.exit(1);
  }

  const driver = resolveDatabaseDriver();
  const store = createDatabaseStore();
  await store.initialize(); // fail-loud on connect; applies migrations incl. processes.workflow_key

  const before = await store.get("SELECT COUNT(*) AS n FROM processes;");
  console.log(`[reset] driver=${driver} processes before=${before?.n ?? 0}`);

  // FK-safe erase. processes is referenced by: workflow_runs.process_id, process_steps.process_id,
  // capability_provenance.process_id, workflow_checkpoint_runs.process_id. process_step_id has NO FK,
  // so we leave it (avoids any UNIQUE(workflow_run_id, process_step_id) collision). Null the FK refs,
  // delete process-scoped provenance, then delete steps, then processes.
  await store.exec("UPDATE workflow_runs SET process_id = NULL WHERE process_id IS NOT NULL;");
  await store.exec("UPDATE workflow_checkpoint_runs SET process_id = NULL WHERE process_id IS NOT NULL;");
  await store.exec("DELETE FROM capability_provenance WHERE process_id IS NOT NULL;");
  await store.exec("DELETE FROM process_steps;");
  await store.exec("DELETE FROM processes;");
  console.log("[reset] erased prior processes + process_steps (FK refs nulled; no residual fallback)");

  // Reseed the canonical catalog (idempotent upserts; deterministic proc:*/pstep:*/cap:* ids).
  const res = await seedCapabilityCatalog(store, { nowIso, createId });
  const after = await store.all("SELECT process_key, workflow_key FROM processes ORDER BY display_order;");
  console.log(`[reset] reseeded ${res.processes} processes / ${res.capabilities} capabilities`);
  for (const p of after) console.log(`  - ${p.process_key}  ->  ${p.workflow_key}`);

  const unbound = after.filter((p) => !p.workflow_key);
  if (after.length !== CAPABILITY_CATALOG.processes.length || unbound.length) {
    throw new Error(`reset verification failed: expected ${CAPABILITY_CATALOG.processes.length} bound processes, got ${after.length} (${unbound.length} unbound)`);
  }
  console.log("[reset] OK");
  await store.close?.();
}

main().catch((err) => {
  console.error("[reset] FAILED:", err?.message ?? err);
  process.exit(1);
});
