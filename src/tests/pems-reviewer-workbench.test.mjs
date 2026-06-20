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
  buildPemsLiveEvaluatorFilteringProof,
  buildPemsReviewerComparisonProvenance,
  buildPemsReviewerWorkbenchReadinessProof,
  createLiveGatedPemsEvaluatorDraft,
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

test("Phase 39 live-gated evaluator generation remains ref-only and filters drafts without mocked proof", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);

  const blocked = await createLiveGatedPemsEvaluatorDraft(store, {
    candidateId,
    sourcePointerIds: [],
    modelConfig: { configured: true, model: "gpt-5-mini", baseURL: "https://api.openai.com/v1" }
  });
  assert.equal(blocked.status, "phase39_live_evaluator_blocked_missing_source_pointers");
  assert.equal(blocked.liveProofClaimed, false);

  const generated = await createLiveGatedPemsEvaluatorDraft(
    store,
    {
      candidateId,
      actorUserId: "phase39_test",
      sourcePointerIds: ["artifact_phase39"],
      modelConfig: { configured: true, model: "gpt-5-mini", baseURL: "https://api.openai.com/v1" }
    },
    {
      llmInvoker: async () =>
        JSON.stringify({
          advisoryNote: "The cited source pointer supports a validator review, but this remains advisory only.",
          suggestedReviewType: "validator_evaluation",
          suggestedDecision: "pass",
          citationClosure: ["artifact_phase39"]
        })
    }
  );

  assert.equal(generated.version, "2026-06-20.phase39-live-evaluator-generation-filtering.v1");
  assert.equal(generated.status, "phase39_live_evaluator_mocked_output_not_proof");
  assert.equal(generated.ok, true);
  assert.equal(generated.liveProofClaimed, false);
  assert.equal(generated.safety.rawPromptStored, false);
  assert.equal(generated.safety.rawCompletionStored, false);
  assert.equal(generated.productionDrivingAllowed, false);

  const filtered = await getPemsReviewerWorkbenchStatus(store, {
    evaluatorMode: "llm_assisted_advisory",
    draftStatus: "draft_ready_for_human_review",
    liveOnly: true
  });
  assert.equal(filtered.appliedFilters.evaluatorMode, "llm_assisted_advisory");
  assert.equal(filtered.appliedFilters.draftStatus, "draft_ready_for_human_review");
  assert.equal(filtered.appliedFilters.liveOnly, true);
  assert.equal(filtered.liveGeneratedDraftCount, 1);
  assert.equal(filtered.liveProofDraftCount, 0);
  assert.equal(filtered.mockedDraftCount, 1);
  assert.equal(filtered.filteredDraftCount, 0);
  assert.equal(filtered.draftQueue.length, 0);

  const allDrafts = await getPemsReviewerWorkbenchStatus(store, {
    evaluatorMode: "llm_assisted_advisory",
    draftStatus: "draft_ready_for_human_review"
  });
  assert.equal(allDrafts.filteredDraftCount, 1);
  assert.equal(allDrafts.draftQueue.length, 1);
  assert.equal(allDrafts.draftQueue[0].metadata.rawPromptStored, false);
  assert.equal(allDrafts.draftQueue[0].metadata.rawCompletionStored, false);

  const proof = buildPemsLiveEvaluatorFilteringProof(filtered, { openAiConfigured: true });
  assert.equal(proof.status, "phase39_live_evaluator_filtering_ready_no_live_draft");
  assert.equal(proof.score, 90);
  assert.equal(proof.target, 92);
  assert.equal(proof.liveProofClaimed, false);
  assert.equal(proof.safety.mockedLlmOutputCountsAsProof, false);

  const liveProof = buildPemsLiveEvaluatorFilteringProof({ ...filtered, filteredDraftCount: 1, liveProofDraftCount: 1 }, { openAiConfigured: true });
  assert.equal(liveProof.status, "phase39_live_evaluator_filtering_ready");
  assert.equal(liveProof.score, 92);
  assert.equal(liveProof.liveProofClaimed, true);
  assert.equal(liveProof.productionDrivingAllowed, false);
});
