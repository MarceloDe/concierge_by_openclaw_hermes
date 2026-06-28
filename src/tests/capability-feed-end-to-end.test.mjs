// Step 10 proof (no mocks): the continuous-learning feed. A PEMS-matured + reviewer-
// approved candidate is ingested into the catalog and appears in the planner select;
// a later PEMS demotion is projected back out (write -> read-back -> affects planner).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { verifyAuditChain } from "../concierge/audit.mjs";
import {
  ingestMaturedCapability,
  evaluateCapabilityPromotionGate,
  syncCapabilityLifecycleFromPems,
  buildSessionPortfolioFromPostgres
} from "../concierge/capabilityCatalog.mjs";

async function seededStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-feed-"));
  const store = await new SqliteStore(join(dir, "f.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

async function maturedCandidate(store, { promotion = "production", driving = 1, decision = "approved" } = {}) {
  const candidateId = createId("cand");
  const reviewId = createId("rev");
  await store.insert("pems_candidate_maturity", { candidate_id: candidateId, selected_skill_key: "insurance_portal_browser", promotion_status: promotion, production_driving_allowed: driving, trusted: 1, created_at: nowIso(), updated_at: nowIso() });
  await store.insert("generated_skill_review_queue", {
    id: reviewId, candidate_id: candidateId, skill_key: "learned_appeal_helper", package_hash: "pkg_hash_1",
    status: decision, requested_action: "create_skill", gate_status: "passed", review_decision: decision,
    pr_branch_name: "skills/learned-appeal-helper", pr_title: "Add learned appeal helper",
    package_json: "{}", executor_json: "{}", safety_json: "{}", created_at: nowIso(), updated_at: nowIso()
  });
  return { candidateId, reviewId };
}

async function productionKeys(store, sessionId) {
  const m = await buildSessionPortfolioFromPostgres(store, sessionId);
  return new Set(m.promptTable.map((r) => r.portfolioId));
}

test("Step 10: gate refuses an unapproved / immature candidate", async () => {
  const store = await seededStore();
  const notApproved = await maturedCandidate(store, { decision: "rejected" });
  const g1 = await evaluateCapabilityPromotionGate(store, { candidateId: notApproved.candidateId, skillReviewQueueId: notApproved.reviewId });
  assert.equal(g1.passed, false, "unapproved review must fail the gate");
  const immature = await maturedCandidate(store, { promotion: "shadow_review_required", driving: 0 });
  const g2 = await evaluateCapabilityPromotionGate(store, { candidateId: immature.candidateId, skillReviewQueueId: immature.reviewId });
  assert.equal(g2.passed, false, "immature candidate must fail the gate");
});

test("Step 10: matured+approved candidate is ingested, masked, appears in planner select, audit-chained", async () => {
  const store = await seededStore();
  const sessionId = createId("feed");
  const { candidateId, reviewId } = await maturedCandidate(store);
  const capabilityKey = "workflow:learned_appeal_helper";

  const res = await ingestMaturedCapability(store, {
    candidateId, skillReviewQueueId: reviewId, capabilityKey, kind: "workflow",
    rawMetadata: { shortDescription: "Help assemble appeal support (learned). member SSN 123-45-6789", whenToUse: "denied claim needs appeal support", whyUse: "matured from prior cases" },
    hydratePayload: { steps: ["gather_denial", "cite_policy"] },
    sourcePointerIds: ["claim_items/abc"]
  });
  assert.equal(res.ingested, true);

  // Appears in the production planner select.
  assert.ok((await productionKeys(store, sessionId)).has(capabilityKey), "ingested capability is in the planner surface");

  // Metadata was PHI-masked before reaching planner columns.
  const cap = await store.findOne("capabilities", { capability_key: capabilityKey });
  assert.doesNotMatch(cap.short_description, /123-45-6789/, "SSN masked out of planner metadata");
  assert.equal(cap.metadata_phi_cleared, 1);

  // Provenance + hash-chained audit recorded.
  const prov = await store.findOne("capability_provenance", { capability_id: `cap:${capabilityKey}` });
  assert.ok(prov && prov.event_hash, "provenance row hash-chained");
  assert.equal((await verifyAuditChain(store, {})).valid, true);

  // Read-back: flip PEMS promotion to demoted -> sync removes it from the planner surface.
  await store.update("pems_candidate_maturity", { promotion_status: "demoted", production_driving_allowed: 0 }, { candidate_id: candidateId });
  const sync = await syncCapabilityLifecycleFromPems(store, { capabilityId: `cap:${capabilityKey}`, candidateId });
  assert.equal(sync.toStatus, "quarantined");
  assert.ok(!(await productionKeys(store, sessionId)).has(capabilityKey), "demoted capability removed from the planner surface (read-back proven)");
});
