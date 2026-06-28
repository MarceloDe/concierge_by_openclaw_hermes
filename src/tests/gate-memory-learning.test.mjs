// GATE (Memory learning): a successful case produces a candidate (episode/PEMS row), a
// reviewer PROMOTES it, and the NEXT similar case USES the promoted procedure. Proven by
// behavior change: absent from the planner surface BEFORE promotion -> present AND used by
// a worker/tool plan AFTER. No mocks (real DB read-back drives behavior).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { buildSessionPortfolioFromPostgres, ingestMaturedCapability, evaluateCapabilityPromotionGate, catalogPortfolioKey } from "../concierge/capabilityCatalog.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

const KEY = "workflow:learned_appeal_helper";
const prodKeys = async (store, sid) => new Set((await buildSessionPortfolioFromPostgres(store, sid)).promptTable.map((r) => r.portfolioId));

test("GATE Memory learning: promote a learned procedure -> next case uses it (behavior change)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-gate-mem-"));
  const store = await new SqliteStore(join(dir, "g.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  const { user, session } = await enrollDefaultMember(store);

  // BEFORE: the learned procedure is not in the planner surface.
  assert.ok(!(await prodKeys(store, session.id)).has(KEY), "procedure absent before promotion");

  // Successful case -> candidate (PEMS maturity row = the episode) + reviewer queue.
  const candidateId = createId("cand"), reviewId = createId("rev");
  await store.insert("pems_candidate_maturity", { candidate_id: candidateId, selected_skill_key: "insurance_portal_browser", promotion_status: "shadow_review_required", production_driving_allowed: 0, trusted: 0, created_at: nowIso(), updated_at: nowIso() });
  await store.insert("generated_skill_review_queue", { id: reviewId, candidate_id: candidateId, skill_key: "learned_appeal_helper", package_hash: "h", status: "pending", requested_action: "create_skill", gate_status: "pending", review_decision: null, pr_branch_name: "b", pr_title: "t", package_json: "{}", executor_json: "{}", safety_json: "{}", created_at: nowIso(), updated_at: nowIso() });

  // Gate must REFUSE before the reviewer approves (no silent auto-promote).
  const preGate = await evaluateCapabilityPromotionGate(store, { candidateId, skillReviewQueueId: reviewId });
  assert.equal(preGate.passed, false, "unreviewed candidate must not promote");

  // Reviewer PROMOTES: approve the queue + mark maturity production.
  await store.update("generated_skill_review_queue", { status: "approved", review_decision: "approved", gate_status: "passed" }, { id: reviewId });
  await store.update("pems_candidate_maturity", { promotion_status: "production", production_driving_allowed: 1, trusted: 1 }, { candidate_id: candidateId });
  const ing = await ingestMaturedCapability(store, { candidateId, skillReviewQueueId: reviewId, capabilityKey: KEY, kind: "workflow", rawMetadata: { shortDescription: "assemble appeal support (learned)", whenToUse: "denied claim appeal", whyUse: "matured from prior cases" }, hydratePayload: { steps: ["gather_denial", "cite_policy"] } });
  assert.equal(ing.ingested, true, "reviewer-approved candidate promotes");

  // AFTER (next similar case): a NEW session sees the promoted procedure...
  const next = await enrollDefaultMember(store);
  assert.ok((await prodKeys(store, next.session.id)).has(KEY), "next case sees the promoted procedure");

  // ...and actually USES it in a worker/tool plan.
  const pointer = `${catalogPortfolioKey(next.session.id)}#${KEY}`;
  const run = await runLangGraphOrchestration(store, {
    user: next.user, session: next.session, channel: next.session.channel, userInput: "help me appeal a denied claim",
    rawMessage: { source: "gate_mem", useLiveModel: false, executeEvidenceObservation: false,
      llmOrchestrationDecisionReplay: { workflow: "eligibility_benefits_navigation", intent: "appeal_support", confidence: 0.9, rationale: "replay", workerGoal: "appeal", selectedCapabilityPointers: [pointer] } }
  });
  assert.ok(run.state.hydrated_capabilities?.resolved?.some((r) => r.portfolioId === KEY), "promoted procedure hydrated for the next case");
  assert.ok((run.state.tool_calls ?? [])[0]?.plannerHydratedCapabilities?.some((c) => c.portfolioId === KEY), "next case's worker plan USES the promoted procedure");
});
