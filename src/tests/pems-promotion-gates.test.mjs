import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  buildCaseState,
  buildContinuousIntelligenceShadow,
  buildPemsPromotionReadinessProof,
  evaluatePemsPromotionGate,
  getPemsPromotionGateStatus,
  persistContinuousIntelligenceShadowRun,
  recordPemsPromotionReview
} from "../concierge/continuousIntelligence.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-pems-promotion-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function sourcedShadow({ sessionId, graphTraceId }) {
  const caseState = buildCaseState({
    userId: "user_1",
    sessionId,
    graphTraceId,
    channel: "local_web_chat",
    userInput: "Use the cited source pointer to explain coverage.",
    contextPacket: {
      user: { id: "user_1" },
      workflowArchitecture: { routeCandidates: [{ workflowKey: "eligibility_benefits_navigation" }] }
    },
    policyResult: { allowed: true },
    structuredIntent: { intent: "check_benefits", workflow: "eligibility_benefits_navigation", confidence: 0.93 },
    workflow: "eligibility_benefits_navigation",
    routeReason: "fixture_phase35_pems_gate",
    dynamicSkillContext: {
      selected: { executionSkillKey: "insurance_portal_browser", journeySkillKey: "benefits_journey" }
    },
    evidenceObservation: { status: "captured_trusted_research_evidence", actionsTaken: ["trusted_research_retrieved"] },
    sourcePointers: [
      {
        table: "research_artifacts",
        id: "artifact_phase35",
        sourceUrl: "https://example.com/private/member/benefits",
        contentHash: "content_hash_phase35",
        extractionHash: "extraction_hash_phase35"
      }
    ],
    workflowOutcome: "trusted_research_answered",
    finalResponse: "Safe sourced answer."
  });
  return buildContinuousIntelligenceShadow({ caseState });
}

async function createMatureCandidate(store) {
  const { user, session } = await enrollDefaultMember(store);
  let latest;
  for (let index = 0; index < 10; index += 1) {
    latest = await persistContinuousIntelligenceShadowRun(store, {
      user,
      session,
      graphTraceId: `trace_phase35_${index}`,
      shadow: sourcedShadow({ sessionId: session.id, graphTraceId: `trace_phase35_${index}` })
    });
  }
  return { user, session, candidateId: latest.maturity.candidateId };
}

test("PEMS promotion gate requires reviewer, validator, citation, and safety checks before supervised advisory", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);
  const initial = await store.findOne("pems_candidate_maturity", { candidate_id: candidateId });

  const missingReviews = evaluatePemsPromotionGate(initial, []);
  assert.equal(missingReviews.supervisedAdvisoryAllowed, false);
  assert.equal(missingReviews.productionDrivingAllowed, false);
  assert.equal(missingReviews.requirements.find((item) => item.key === "human_reviewer_approvals").ok, false);

  await recordPemsPromotionReview(store, {
    candidateId,
    actorUserId: "reviewer_1",
    reviewType: "human_review",
    decision: "approved",
    rationale: "Reviewer 1 approved; member SSN 123-45-6789 and https://example.com/private/path must not leak."
  });
  await recordPemsPromotionReview(store, {
    candidateId,
    actorUserId: "reviewer_2",
    reviewType: "human_review",
    decision: "approved",
    rationale: "Reviewer 2 approved with source refs only."
  });
  await recordPemsPromotionReview(store, {
    candidateId,
    actorUserId: "validator",
    reviewType: "validator_evaluation",
    decision: "pass",
    validatorPassCount: 1,
    rationale: "Validator found the candidate internally consistent."
  });
  const beforeCitation = await getPemsPromotionGateStatus(store);
  assert.equal(beforeCitation.latestGate.supervisedAdvisoryAllowed, false);
  assert.equal(beforeCitation.latestGate.requirements.find((item) => item.key === "citation_evaluation_passes").ok, false);

  const promoted = await recordPemsPromotionReview(store, {
    candidateId,
    actorUserId: "citation_reviewer",
    reviewType: "citation_evaluation",
    decision: "pass",
    evidenceRefCount: 3,
    rationale: "Cited source pointer IDs close the factual claims."
  });
  assert.equal(promoted.gate.supervisedAdvisoryAllowed, true);
  assert.equal(promoted.productionDrivingAllowed, false);

  const mature = await store.findOne("pems_candidate_maturity", { candidate_id: candidateId });
  assert.equal(mature.supervised_advisory_allowed, 1);
  assert.equal(mature.promotion_status, "supervised_advisory_allowed");
  assert.equal(mature.production_driving_allowed, 0);

  const proof = buildPemsPromotionReadinessProof(await getPemsPromotionGateStatus(store));
  assert.equal(proof.status, "phase35_supervised_promotion_gate_active");
  assert.equal(proof.score, 80);
  assert.equal(proof.target, 80);
  assert.equal(proof.productionDrivingAllowed, false);
  assert.equal(proof.supervisedAdvisoryCandidateCount, 1);

  const reviews = await store.list("pems_candidate_promotion_reviews", { candidate_id: candidateId });
  assert.equal(reviews.length, 4);
  assert.equal(reviews[0].rationale_preview.includes("123-45-6789"), false);
  assert.equal(reviews[0].rationale_preview.includes("https://example.com/private/path"), false);
  assert.equal(reviews[0].metadata_json.includes("rawRationaleStored"), true);
});

test("safety incident review vetoes a previously supervised advisory candidate without production driving", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);
  for (const review of [
    { reviewType: "human_review", decision: "approved", actorUserId: "reviewer_1" },
    { reviewType: "human_review", decision: "approved", actorUserId: "reviewer_2" },
    { reviewType: "validator_evaluation", decision: "pass", actorUserId: "validator", validatorPassCount: 1 },
    { reviewType: "citation_evaluation", decision: "pass", actorUserId: "citation", evidenceRefCount: 2 }
  ]) {
    await recordPemsPromotionReview(store, { candidateId, rationale: "safe review", ...review });
  }

  assert.equal((await getPemsPromotionGateStatus(store)).latestGate.supervisedAdvisoryAllowed, true);

  await recordPemsPromotionReview(store, {
    candidateId,
    actorUserId: "safety_reviewer",
    reviewType: "safety_review",
    decision: "fail",
    safetyIncidentCount: 1,
    rationale: "Safety reviewer found a boundary issue."
  });

  const status = await getPemsPromotionGateStatus(store);
  assert.equal(status.latestGate.status, "safety_veto");
  assert.equal(status.latestGate.supervisedAdvisoryAllowed, false);
  assert.equal(status.latestCandidate.supervisedAdvisoryAllowed, false);
  assert.equal(status.latestCandidate.productionDrivingAllowed, false);
});
