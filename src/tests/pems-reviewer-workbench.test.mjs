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
  buildPemsReviewerComparisonProvenance,
  buildPemsReviewerWorkbenchReadinessProof,
  createPemsEvaluatorDraft,
  getPemsReviewerWorkbenchStatus,
  persistContinuousIntelligenceShadowRun,
  recordPemsPromotionReview
} from "../concierge/continuousIntelligence.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-pems-workbench-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function sourcedShadow({ sessionId, graphTraceId }) {
  const caseState = buildCaseState({
    userId: "user_1",
    sessionId,
    graphTraceId,
    channel: "local_web_chat",
    userInput: "Explain the benefit using cited pointers.",
    contextPacket: {
      user: { id: "user_1" },
      workflowArchitecture: { routeCandidates: [{ workflowKey: "eligibility_benefits_navigation" }] }
    },
    policyResult: { allowed: true },
    structuredIntent: { intent: "check_benefits", workflow: "eligibility_benefits_navigation", confidence: 0.94 },
    workflow: "eligibility_benefits_navigation",
    routeReason: "fixture_phase36_pems_workbench",
    dynamicSkillContext: {
      selected: { executionSkillKey: "insurance_portal_browser", journeySkillKey: "benefits_journey" }
    },
    evidenceObservation: { status: "captured_trusted_research_evidence", actionsTaken: ["trusted_research_retrieved"] },
    sourcePointers: [
      {
        table: "research_artifacts",
        id: "artifact_phase36",
        sourceUrl: "https://example.com/private/member/benefits",
        contentHash: "content_hash_phase36",
        extractionHash: "extraction_hash_phase36"
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
      graphTraceId: `trace_phase36_${index}`,
      shadow: sourcedShadow({ sessionId: session.id, graphTraceId: `trace_phase36_${index}` })
    });
  }
  return { user, session, candidateId: latest.maturity.candidateId };
}

test("PEMS reviewer workbench stores sanitized evaluator drafts without changing promotion authority", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);

  const created = await createPemsEvaluatorDraft(store, {
    candidateId,
    actorUserId: "evaluator_1",
    draftType: "nestr_consistency_trace",
    evaluatorMode: "llm_assisted_advisory",
    deterministicValidatorStatus: "pass",
    suggestedReviewType: "validator_evaluation",
    suggestedDecision: "pass",
    advisoryNote:
      "Draft: approve after checking source refs. Do not leak member email patient@example.com, SSN 123-45-6789, or https://example.com/private/member.",
    consistencyTrace: {
      traceKind: "nestr_consistency_trace",
      sourceUrl: "https://example.com/private/member",
      claim: "Coverage explanation matches source pointer artifact_phase36.",
      rawFrameText: "never store this raw trace text"
    },
    metadata: {
      evaluatorModelRef: "private-model-ref",
      modelProviderRef: "observed-egress-provider",
      egressTraceRef: "egress_trace_phase38",
      sourcePointerIds: ["artifact_phase36"],
      liveLlmEvaluatorUsed: true,
      egressObserved: true,
      mockedLlmOutput: true
    }
  });

  assert.equal(created.version, "2026-06-18.phase36-pems-reviewer-evaluator-workbench.v1");
  assert.equal(created.advisoryOnly, true);
  assert.equal(created.productionDrivingAllowed, false);
  assert.equal(created.draft.status, "draft_ready_for_human_review");
  assert.equal(created.draft.advisory_note_preview.includes("patient@example.com"), false);
  assert.equal(created.draft.advisory_note_preview.includes("123-45-6789"), false);
  assert.equal(created.draft.advisory_note_preview.includes("https://example.com/private/member"), false);
  assert.equal(created.draft.consistency_trace_preview.includes("https://example.com/private/member"), false);

  const draftRows = await store.list("pems_candidate_evaluator_drafts", { candidate_id: candidateId });
  assert.equal(draftRows.length, 1);
  assert.equal(draftRows[0].metadata_json.includes("rawAdvisoryNoteStored"), true);
  assert.equal(draftRows[0].metadata_json.includes("rawConsistencyTraceStored"), true);

  const beforeReview = buildPemsReviewerWorkbenchReadinessProof(await getPemsReviewerWorkbenchStatus(store));
  assert.equal(beforeReview.status, "phase36_reviewer_evaluator_workbench_active");
  assert.equal(beforeReview.score, 83);
  assert.equal(beforeReview.advisoryLinkedReviewCount, 0);
  assert.equal(beforeReview.latestGate.supervisedAdvisoryAllowed, false);

  await recordPemsPromotionReview(store, {
    candidateId,
    actorUserId: "validator",
    reviewType: "validator_evaluation",
    decision: "pass",
    validatorPassCount: 1,
    advisoryDraftId: created.draft.id,
    rationale: "Validator reviewed advisory material by ref only."
  });

  const afterReview = buildPemsReviewerWorkbenchReadinessProof(await getPemsReviewerWorkbenchStatus(store));
  assert.equal(afterReview.score, 85);
  assert.equal(afterReview.target, 85);
  assert.equal(afterReview.advisoryLinkedReviewCount, 1);
  assert.equal(afterReview.productionDrivingAllowed, false);

  const comparison = buildPemsReviewerComparisonProvenance(afterReview);
  assert.equal(comparison.version, "2026-06-19.phase38-pems-reviewer-comparison-provenance.v1");
  assert.equal(comparison.status, "phase38_reviewer_comparison_provenance_ready");
  assert.equal(comparison.score, 90);
  assert.equal(comparison.target, 90);
  assert.equal(comparison.comparisonRows.length, 4);
  assert.ok(comparison.comparisonRows.some((row) => row.key === "validator_decision"));
  assert.deepEqual(comparison.evidenceChips, [{ id: "artifact_phase36", kind: "source_pointer_ref", rawSourceStored: false }]);
  assert.equal(comparison.evaluatorProvenance.liveLlmEvaluation, true);
  assert.equal(comparison.evaluatorProvenance.egressObserved, true);
  assert.equal(comparison.evaluatorProvenance.liveProofClaimed, false);
  assert.equal(comparison.evaluatorProvenance.mockedLlmOutputCountsAsProof, false);
  assert.equal(comparison.evaluatorProvenance.rawPromptStored, false);
  assert.equal(comparison.evaluatorProvenance.rawCompletionStored, false);
  assert.equal(comparison.safety.automaticProductionRecommendation, false);
  assert.equal(comparison.safety.productionDrivingAllowed, false);

  const reviews = await store.list("pems_candidate_promotion_reviews", { candidate_id: candidateId });
  assert.equal(reviews.length, 1);
  assert.match(reviews[0].metadata_json, new RegExp(created.draft.id));
  assert.match(reviews[0].metadata_json, /"advisoryOnly":true/);
});
