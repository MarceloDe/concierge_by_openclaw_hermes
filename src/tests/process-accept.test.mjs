// Type-II Phase C proof (no mocks): accepting an offered process hydrates its graph
// subpath + worker skill, enforces a read-only scope, and dispatches once (idempotent
// -> no second portal session). validateCapabilityAnswer is the deterministic guard.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { hydrateProcess, validateCapabilityAnswer, acceptProcessOffer } from "../concierge/capabilityCatalog.mjs";

async function seededStoreWithRun() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-pc-"));
  const store = await new SqliteStore(join(dir, "pc.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  const { user, session } = await enrollDefaultMember(store);
  const runId = createId("run");
  await store.insert("workflow_runs", { id: runId, user_id: user.id, session_id: session.id, workflow_key: "eligibility_benefits_navigation", journey_stage: "coverage_understanding", status: "started", route_reason: "test", started_at: nowIso(), created_at: nowIso(), updated_at: nowIso() });
  return { store, runId, sessionId: session.id };
}

test("Phase C: hydrateProcess returns the graph subpath + worker skill + read-only scope", async () => {
  const { store } = await seededStoreWithRun();
  const h = await hydrateProcess(store, "process:portal_readonly_lookup");
  assert.equal(h.ok, true);
  assert.equal(h.approvalScope, "read_only_observation");
  assert.equal(h.workerSkillKey, "insurance_portal_browser");
  assert.ok(h.graphSubpath.includes("observe_evidence") && h.graphSubpath.includes("compose_response"));
  assert.ok(h.steps.length >= 5);
  const missing = await hydrateProcess(store, "process:__nope__");
  assert.equal(missing.ok, false);
});

test("Phase C: validateCapabilityAnswer enforces real process + read-only + no unsourced coverage number", async () => {
  const { store } = await seededStoreWithRun();
  const ok = await validateCapabilityAnswer(store, { offeredProcessIds: ["process:portal_readonly_lookup"], answer: "I can offer a read-only portal lookup.", sourcePointers: [] });
  assert.equal(ok.valid, true, ok.issues.join(";"));
  const invented = await validateCapabilityAnswer(store, { offeredProcessIds: ["process:make_believe"], answer: "ok" });
  assert.equal(invented.valid, false);
  assert.ok(invented.issues.some((i) => i.startsWith("offered_process_invalid")));
  const coverage = await validateCapabilityAnswer(store, { offeredProcessIds: ["process:portal_readonly_lookup"], answer: "Your deductible is $1,250.", sourcePointers: [] });
  assert.equal(coverage.valid, false, "coverage number without a source pointer must fail");
  assert.ok(coverage.issues.includes("coverage_number_without_source_pointer"));
});

test("Phase C: accepting a process dispatches once; accepting again is idempotent (no second portal session)", async () => {
  const { store, runId, sessionId } = await seededStoreWithRun();
  let realDispatches = 0;
  const dispatchFn = async () => { realDispatches += 1; return { resultPointer: "portal-observe-1" }; };

  const first = await acceptProcessOffer(store, { sessionId, processKey: "process:portal_readonly_lookup", workflowRunId: runId }, dispatchFn);
  assert.equal(first.accepted, true);
  assert.equal(first.approvalScope, "read_only_observation");
  assert.equal(first.workerSkillKey, "insurance_portal_browser");
  assert.equal(first.dispatch.dispatched, true);
  assert.equal(realDispatches, 1);

  const second = await acceptProcessOffer(store, { sessionId, processKey: "process:portal_readonly_lookup", workflowRunId: runId }, dispatchFn);
  assert.equal(second.dispatch.duplicatePrevented, true, "second accept prevented");
  assert.equal(realDispatches, 1, "no second portal session");
});
