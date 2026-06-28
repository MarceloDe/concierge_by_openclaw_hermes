// go-live 3/3 (real Postgres, no mocks, no SQLite): the full capability/process stack
// runs against a live Postgres (driver=postgres). Requires BRAINSTY_PG_PARITY=1 and a
// reachable BRAINSTY_DATABASE_URL.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PostgresStore } from "../concierge/postgresStore.mjs";
import { createId, nowIso } from "../concierge/database.mjs";
import { verifyAuditChain } from "../concierge/audit.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import {
  loadSessionPortfolio, buildSessionPortfolioFromPostgres, hydrateCapabilityPointer,
  quarantineCapability, catalogPortfolioKey, ingestMaturedCapability,
  hydrateProcess, acceptProcessOffer, validateCapabilityAnswer
} from "../concierge/capabilityCatalog.mjs";
import { dispatchOnce, computeDispatchIdempotencyKey, workerPlanSignature } from "../concierge/dispatchIdempotency.mjs";
import { resumeRun, RUN_LEDGER_BOUNDARIES } from "../concierge/checkpointRunLedger.mjs";

const RUN = process.env.BRAINSTY_PG_PARITY === "1";
const URL = process.env.BRAINSTY_DATABASE_URL;

async function pgStore() {
  const store = new PostgresStore(URL);
  await store.initialize();
  for (const f of ["001_storage_readiness.sql", "002_capability_portfolio.sql"]) {
    try { await store.exec(await readFile(new URL(`../../project/db/postgres-init/${f}`, import.meta.url), "utf8")); } catch { /* idempotent */ }
  }
  return store;
}
async function freshRun(store) {
  const { user, session } = await enrollDefaultMember(store);
  const runId = createId("run");
  await store.insert("workflow_runs", { id: runId, user_id: user.id, session_id: session.id, workflow_key: "eligibility_benefits_navigation", journey_stage: "coverage_understanding", status: "started", route_reason: "pg_test", started_at: nowIso(), created_at: nowIso(), updated_at: nowIso() });
  return { userId: user.id, sessionId: session.id, runId };
}
const prodKeys = async (store, sessionId) => new Set((await buildSessionPortfolioFromPostgres(store, sessionId)).promptTable.map((r) => r.portfolioId));

test("PG parity: full capability/process stack on real Postgres", { skip: RUN && URL ? false : "set BRAINSTY_PG_PARITY=1 + BRAINSTY_DATABASE_URL" }, async () => {
  const store = await pgStore();
  try {
    await seedCapabilityCatalog(store, { nowIso, createId });
    const { userId, sessionId, runId } = await freshRun(store);

    // 1. portfolio build (SELECT + JSON) + hydrate (backing precedence)
    const portfolio = await loadSessionPortfolio(store, { sessionId });
    const keys = new Set(portfolio.manifest.promptTable.map((r) => r.portfolioId));
    assert.ok(keys.has("skill:insurance_portal_browser") && keys.has("process:portal_readonly_lookup"), "catalog present");
    const h = await hydrateCapabilityPointer(store, { pointer: `${catalogPortfolioKey(sessionId)}#skill:insurance_portal_browser` });
    assert.equal(h.resolved, true, "pointer hydrated from PG backing");

    // 2. quarantine -> status flip + hash-chained provenance + audit + removed from select
    const q = await quarantineCapability(store, { capabilityId: "cap:workflow:pharmacy_formulary", reason: "pg_test", safetyClass: "answer_safety", sessionIds: [sessionId] });
    assert.equal(q.toStatus, "quarantined");
    assert.ok(!(await prodKeys(store, sessionId)).has("workflow:pharmacy_formulary"), "quarantined gone from select");
    assert.equal((await verifyAuditChain(store, {})).valid, true, "audit chain valid on PG");

    // 3. idempotent dispatch (UNIQUE(idempotency_key) is the rejecter)
    const key = computeDispatchIdempotencyKey({ runId, beforeWorkerCheckpointId: "ckA", workerPlanSignature: workerPlanSignature(["skill:insurance_portal_browser"]) });
    let dispatches = 0;
    const fn = async () => { dispatches += 1; return { resultPointer: "obs-1" }; };
    const d1 = await dispatchOnce(store, { workflowRunId: runId, idempotencyKey: key }, fn);
    const d2 = await dispatchOnce(store, { workflowRunId: runId, idempotencyKey: key }, fn);
    assert.equal(d1.dispatched, true); assert.equal(d2.duplicatePrevented, true); assert.equal(dispatches, 1, "exactly-once on PG");

    // 4. resume only unfinished boundary
    for (const [i, b] of RUN_LEDGER_BOUNDARIES.slice(0, 4).entries()) {
      await store.insert("workflow_checkpoint_runs", { id: `ckpt:${runId}:${b}`, workflow_run_id: runId, process_step_id: `step:adhoc:${b}`, checkpoint_boundary: b, step_order: i, status: "completed", effect_stage: "after_effect", created_at: nowIso(), updated_at: nowIso() });
    }
    const r = await resumeRun(store, runId, { selectedCapabilityKeys: [] });
    assert.equal(r.resumeTarget, "after_response"); assert.deepEqual(r.toReplay, ["after_response"]);

    // 5. continuous-learning feed: matured candidate -> ingest -> appears in select
    const candidateId = createId("cand"), reviewId = createId("rev");
    await store.insert("pems_candidate_maturity", { candidate_id: candidateId, selected_skill_key: "insurance_portal_browser", promotion_status: "production", production_driving_allowed: 1, trusted: 1, created_at: nowIso(), updated_at: nowIso() });
    await store.insert("generated_skill_review_queue", { id: reviewId, candidate_id: candidateId, skill_key: "learned_x", package_hash: "h", status: "approved", requested_action: "create_skill", gate_status: "passed", review_decision: "approved", pr_branch_name: "b", pr_title: "t", package_json: "{}", executor_json: "{}", safety_json: "{}", created_at: nowIso(), updated_at: nowIso() });
    const ing = await ingestMaturedCapability(store, { candidateId, skillReviewQueueId: reviewId, capabilityKey: "workflow:learned_pg", kind: "workflow", rawMetadata: { shortDescription: "learned (SSN 123-45-6789)", whenToUse: "x", whyUse: "y" }, hydratePayload: { steps: ["a"] } });
    assert.equal(ing.ingested, true);
    const ingested = await store.findOne("capabilities", { capability_key: "workflow:learned_pg" });
    assert.equal(ingested.metadata_phi_cleared, 1, "phi_cleared stored as 1 on PG");
    assert.doesNotMatch(ingested.short_description, /123-45-6789/, "SSN masked");
    assert.ok((await prodKeys(store, sessionId)).has("workflow:learned_pg"), "ingested capability in planner select on PG");

    // 6. process accept (hydrate process graph subpath + idempotent dispatch) + validate
    const hp = await hydrateProcess(store, "process:portal_readonly_lookup");
    assert.equal(hp.approvalScope, "read_only_observation");
    assert.ok(hp.graphSubpath.includes("observe_evidence"));
    const v = await validateCapabilityAnswer(store, { offeredProcessIds: ["process:portal_readonly_lookup"], answer: "read-only offer", sourcePointers: [] });
    assert.equal(v.valid, true, v.issues.join(";"));
  } finally {
    await store.close();
  }
});
