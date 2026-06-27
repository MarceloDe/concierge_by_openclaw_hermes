// Step 3 proof (no mocks): hydrateCapabilityPointer dereferences a pointer to its HOW
// only after verification, and the BACKING TABLE WINS — a disabled tool_registry row
// makes hydration refuse even though the capabilities row is still active.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { hydrateCapabilityPointer, parseCapabilityPointer } from "../concierge/capabilityCatalog.mjs";

async function seededStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-hydrate-"));
  const store = await new SqliteStore(join(dir, "h.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

async function setToolStatus(store, toolKey, status) {
  await store.update("tool_registry", { integration_status: status }, { tool_key: toolKey });
}

test("Step 3: pointer parses both bare and cacheKey#key forms", () => {
  assert.equal(parseCapabilityPointer("tool:payer_portal_reader"), "tool:payer_portal_reader");
  assert.equal(parseCapabilityPointer("brainsty:capability-portfolio:s1#tool:payer_portal_reader"), "tool:payer_portal_reader");
});

test("Step 3: happy-path hydrate resolves HOW and bumps the deref counter", async () => {
  const store = await seededStore();
  await setToolStatus(store, "payer_portal_reader", "enabled_local");
  const r = await hydrateCapabilityPointer(store, { pointer: "x#tool:payer_portal_reader" });
  assert.equal(r.resolved, true, r.reason);
  assert.equal(r.kind, "tool");
  assert.equal(r.hydrate.toolKey, "payer_portal_reader");
  assert.equal(r.traceEvent, "hydrate");
  const cap = await store.findOne("capabilities", { capability_key: "tool:payer_portal_reader" });
  assert.equal(cap.hydrate_count, 1, "hydrate bumps the deref counter (proves read-back, not write-only)");
  assert.ok(cap.last_hydrated_at, "last_hydrated_at set");
});

test("Step 3: BACKING TABLE WINS — a disabled tool refuses hydration despite active capability", async () => {
  const store = await seededStore();
  await setToolStatus(store, "payer_portal_reader", "disabled");
  const before = await store.findOne("capabilities", { capability_key: "tool:payer_portal_reader" });
  assert.equal(before.status, "active", "capability row is still active");
  const r = await hydrateCapabilityPointer(store, { pointer: "tool:payer_portal_reader" });
  assert.equal(r.resolved, false, "must refuse when backing tool is disabled");
  assert.match(r.reason, /backing_tool/);
  assert.equal(r.traceEvent, "verify_fail");
});

test("Step 3: unknown pointer refuses with capability_not_found", async () => {
  const store = await seededStore();
  const r = await hydrateCapabilityPointer(store, { pointer: "tool:__does_not_exist__" });
  assert.equal(r.resolved, false);
  assert.equal(r.reason, "capability_not_found");
});

test("Step 3: non-production / quarantined capability refuses hydration", async () => {
  const store = await seededStore();
  await store.update("capabilities", { lifecycle_state: "shadow" }, { capability_key: "workflow:eligibility_benefits_navigation" });
  const shadow = await hydrateCapabilityPointer(store, { pointer: "workflow:eligibility_benefits_navigation" });
  assert.equal(shadow.resolved, false);
  assert.equal(shadow.reason, "capability_not_production");

  await store.update("capabilities", { status: "quarantined" }, { capability_key: "workflow:claim_status_navigation" });
  const quar = await hydrateCapabilityPointer(store, { pointer: "workflow:claim_status_navigation" });
  assert.equal(quar.resolved, false);
  assert.equal(quar.reason, "capability_quarantined");
});
