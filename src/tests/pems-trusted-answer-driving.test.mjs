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
  evaluatePemsPromotionGate,
  getPemsPromotionGateStatus,
  persistContinuousIntelligenceShadowRun,
  recordPemsPromotionReview,
  setPemsTrustedAnswerDrivingKillSwitch
} from "../concierge/continuousIntelligence.mjs";
import {
  assertProceduralSkillIsUserAgnostic,
  buildGraphitiMemoryNamespaces,
  buildNightlyResearchChangeCandidateSeed,
  buildResolvedCaseCandidateSeed,
  composeTrustedSkillDrivenAnswer
} from "../concierge/trustedAnswerDriving.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-pems-trusted-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function sourcedShadow({ sessionId, graphTraceId }) {
  const caseState = buildCaseState({
    userId: "trusted_user",
    sessionId,
    graphTraceId,
    channel: "local_web_chat",
    userInput: "Can the trusted reviewer-approved skill answer with citations?",
    contextPacket: {
      user: { id: "trusted_user" },
      workflowArchitecture: { routeCandidates: [{ workflowKey: "eligibility_benefits_navigation" }] }
    },
    policyResult: { allowed: true },
    structuredIntent: { intent: "check_benefits", workflow: "eligibility_benefits_navigation", confidence: 0.94 },
    workflow: "eligibility_benefits_navigation",
    routeReason: "fixture_phase58_trusted_answer_driving",
    dynamicSkillContext: {
      selected: { executionSkillKey: "insurance_portal_browser", journeySkillKey: "benefits_journey" }
    },
    evidenceObservation: { status: "captured_trusted_research_evidence", actionsTaken: ["trusted_research_retrieved"] },
    sourcePointers: [
      {
        table: "research_artifacts",
        id: "artifact_phase58",
        sourceUrl: "https://example.com/private/member/benefits",
        contentHash: "content_hash_phase58",
        extractionHash: "extraction_hash_phase58"
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
      graphTraceId: `trace_phase58_${index}`,
      shadow: sourcedShadow({ sessionId: session.id, graphTraceId: `trace_phase58_${index}` })
    });
  }
  return { user, session, candidateId: latest.maturity.candidateId };
}

async function approveTrustedCandidate(store, candidateId) {
  for (const review of [
    { reviewType: "human_review", decision: "approved", actorUserId: "reviewer_1" },
    { reviewType: "human_review", decision: "approved", actorUserId: "reviewer_2" },
    { reviewType: "validator_evaluation", decision: "pass", actorUserId: "validator", validatorPassCount: 1 },
    { reviewType: "citation_evaluation", decision: "pass", actorUserId: "citation", evidenceRefCount: 2 }
  ]) {
    await recordPemsPromotionReview(store, { candidateId, rationale: "safe cited review", ...review });
  }
}

test("trusted answer-driving is impossible until every review, citation, maturity, and safety gate passes", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);
  const initial = await store.findOne("pems_candidate_maturity", { candidate_id: candidateId });
  const missingReviews = evaluatePemsPromotionGate(initial, []);
  assert.equal(missingReviews.productionDrivingAllowed, false);
  assert.equal(missingReviews.trustedAnswerDrivingAllowed, false);

  await approveTrustedCandidate(store, candidateId);

  const status = await getPemsPromotionGateStatus(store);
  assert.equal(status.latestGate.status, "trusted_answer_driving");
  assert.equal(status.latestGate.supervisedAdvisoryAllowed, true);
  assert.equal(status.latestGate.trustedAnswerDrivingAllowed, true);
  assert.equal(status.productionDrivingAllowed, true);
  assert.equal(status.latestCandidate.productionDrivingAllowed, true);

  const candidate = await store.findOne("pems_candidate_maturity", { candidate_id: candidateId });
  assert.equal(candidate.promotion_status, "trusted_answer_driving");
  assert.equal(candidate.production_driving_allowed, 1);
});

test("trusted skill driven answers still pass citation rails and label unverified items", async () => {
  const result = composeTrustedSkillDrivenAnswer({
    candidate: {
      candidate_id: "candidate_phase58",
      selected_skill_key: "insurance_portal_browser",
      promotion_status: "trusted_answer_driving",
      production_driving_allowed: 1,
      proceduralFragments: [{ cue: "benefits", tag: "deductible", content: "Use cited plan evidence only." }]
    },
    user: { id: "user_trusted", name: "Trusted User", email: "trusted@example.com" },
    question: "What deductible did the reviewer-approved skill find?",
    sourcePointers: [{ table: "research_artifacts", id: "artifact_phase58", summary: "Deductible evidence." }],
    structuredFacts: [
      {
        label: "Deductible remaining",
        value: "$500 remaining",
        sourcePointerIds: ["research_artifacts/artifact_phase58"]
      }
    ],
    unverifiedItems: ["The exact copay is still missing"]
  });

  assert.equal(result.status, "trusted_answer_driving_validated");
  assert.equal(result.productionDrivingAllowed, true);
  assert.equal(result.validation.valid, true, result.validation.issues.join("; "));
  assert.ok(result.finalResponse.includes("Reviewer-approved skill"));
  assert.equal(result.answer.claims[0].source_pointer_ids[0], "research_artifacts/artifact_phase58");
  assert.equal(result.answer.claims[1].unsupported, true);
  assert.equal(JSON.stringify(result).includes("trusted@example.com"), false);
});

test("safety incident and global kill switch demote trusted answer-driving", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);
  await approveTrustedCandidate(store, candidateId);
  assert.equal((await getPemsPromotionGateStatus(store)).productionDrivingAllowed, true);

  await recordPemsPromotionReview(store, {
    candidateId,
    actorUserId: "safety_reviewer",
    reviewType: "safety_review",
    decision: "fail",
    safetyIncidentCount: 1,
    rationale: "Safety incident demotes trusted use."
  });
  let status = await getPemsPromotionGateStatus(store);
  assert.equal(status.latestGate.status, "safety_veto");
  assert.equal(status.productionDrivingAllowed, false);
  assert.equal(status.latestCandidate.productionDrivingAllowed, false);

  const killSwitchStore = await createStore();
  const { candidateId: killSwitchCandidateId } = await createMatureCandidate(killSwitchStore);
  await approveTrustedCandidate(killSwitchStore, killSwitchCandidateId);
  assert.equal((await getPemsPromotionGateStatus(killSwitchStore)).productionDrivingAllowed, true);
  const killSwitch = await setPemsTrustedAnswerDrivingKillSwitch(killSwitchStore, {
    enabled: true,
    actorUserId: "operator",
    reason: "Emergency stop while reviewing safety signal."
  });
  assert.equal(killSwitch.demotedCount >= 1, true);
  status = await getPemsPromotionGateStatus(killSwitchStore);
  assert.equal(status.trustedAnswerDrivingControl.killSwitchEnabled, true);
  assert.equal(status.productionDrivingAllowed, false);
  assert.equal(status.latestGate.productionDrivingAllowed, false);
});

test("memory namespacing keeps procedural skills user-agnostic and candidates non-driving by default", () => {
  const namespaces = buildGraphitiMemoryNamespaces({ userId: "member_123456789", planId: "aetna_gold", scenarioKey: "mri" });
  assert.equal(namespaces.proceduralSkills, "procedural:skills");
  assert.match(namespaces.episodicMember, /^episodic:member:[a-f0-9]{16}$/);
  assert.equal(namespaces.episodicMember.includes("member_123456789"), false);

  assert.deepEqual(assertProceduralSkillIsUserAgnostic({ cue: "mri", tag: "prior-auth", content: "Use current cited plan evidence." }).issues, []);
  assert.throws(
    () => assertProceduralSkillIsUserAgnostic({ cue: "bad", userId: "member_123456789", content: "leaky procedural skill" }),
    /not user-agnostic/
  );

  const resolvedCaseSeed = buildResolvedCaseCandidateSeed({
    caseState: {
      decision: { workflow: "eligibility_benefits_navigation" },
      skill: { selected: { executionSkillKey: "insurance_portal_browser" } },
      evidence: { sourcePointerRefs: [{ id: "artifact_phase58" }] }
    }
  });
  const researchSeed = buildNightlyResearchChangeCandidateSeed({
    sourceRef: { id: "ks_1", host: "payer.example.test" },
    workflow: "prior_authorization",
    topic: "MRI policy change"
  });
  assert.equal(resolvedCaseSeed.candidateOnly, true);
  assert.equal(resolvedCaseSeed.productionDrivingAllowed, false);
  assert.equal(researchSeed.candidateOnly, true);
  assert.equal(researchSeed.productionDrivingAllowed, false);
});
