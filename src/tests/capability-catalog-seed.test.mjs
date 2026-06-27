// Step 2 proof (no mocks): seed the initial capability/process catalog into a real
// store, idempotently; FK resolution proves backing keys exist; graph_path subpaths
// are validated against the real LangGraph node registry (bad node fails the seed).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import {
  CAPABILITY_CATALOG,
  seedCapabilityCatalog,
  validateCatalogGraphNodes
} from "../concierge/capabilityCatalogSeed.mjs";

async function freshSqlite() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-catalog-seed-"));
  return new SqliteStore(join(dir, "c.sqlite")).initialize();
}

test("Step 2: seed inserts the catalog (FKs resolve to existing registry rows)", async () => {
  const store = await freshSqlite();
  const res = await seedCapabilityCatalog(store, { nowIso, createId });
  assert.equal(res.capabilities, CAPABILITY_CATALOG.capabilities.length);
  assert.equal(res.processes, CAPABILITY_CATALOG.processes.length);

  const caps = await store.all("SELECT capability_key, kind, status, lifecycle_state FROM capabilities;");
  assert.equal(caps.length, CAPABILITY_CATALOG.capabilities.length, "all capabilities inserted (FKs resolved)");
  // The portal browser skill and the eligibility workflow must be present.
  const keys = new Set(caps.map((c) => c.capability_key));
  assert.ok(keys.has("skill:insurance_portal_browser"));
  assert.ok(keys.has("workflow:eligibility_benefits_navigation"));

  const steps = await store.all("SELECT step_key, checkpoint_boundary FROM process_steps ORDER BY step_order;");
  const boundaries = steps.map((s) => s.checkpoint_boundary);
  assert.deepEqual(boundaries, ["after_policy_gate", "after_planner", "before_worker", "after_evidence", "after_response"], "spine checkpoint boundaries seeded in order");
});

test("Step 2: seed is idempotent (runs twice, no duplicates)", async () => {
  const store = await freshSqlite();
  await seedCapabilityCatalog(store, { nowIso, createId });
  await seedCapabilityCatalog(store, { nowIso, createId }); // must not throw on UNIQUE
  const caps = await store.all("SELECT COUNT(*) AS n FROM capabilities;");
  const procs = await store.all("SELECT COUNT(*) AS n FROM processes;");
  assert.equal(caps[0].n, CAPABILITY_CATALOG.capabilities.length, "no duplicate capabilities after re-seed");
  assert.equal(procs[0].n, CAPABILITY_CATALOG.processes.length, "no duplicate processes after re-seed");
});

test("Step 2: production select returns the seeded production set", async () => {
  const store = await freshSqlite();
  await seedCapabilityCatalog(store, { nowIso, createId });
  const rows = await store.all("SELECT capability_key FROM capabilities WHERE status='active' AND lifecycle_state='production' ORDER BY planner_score DESC;");
  assert.equal(rows.length, CAPABILITY_CATALOG.capabilities.length, "all seeded capabilities are active/production");
});

test("Step 2: an unknown graph node fails the seed (validated against the node registry)", () => {
  const badCatalog = {
    capabilities: [{ capability_key: "graph_path:bogus", kind: "graph_path", graph_subpath: ["input_policy", "this_node_does_not_exist"] }],
    processes: []
  };
  assert.throws(() => validateCatalogGraphNodes(badCatalog), /invalid_graph_nodes.*this_node_does_not_exist/);
  // The real catalog validates cleanly.
  assert.equal(validateCatalogGraphNodes(CAPABILITY_CATALOG), true);
});
