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
  buildPemsLiveClaimCitationClosureProof,
  buildPemsLiveEvaluatorFilteringProof,
  buildPemsReviewerClaimRevisionProof,
  buildPemsReviewerComparisonProvenance,
  buildPemsReviewerFollowUpProof,
  buildPemsReviewerHistoryExportProof,
  buildPemsReviewerWorkbenchReadinessProof,
  buildPemsReviewerHistorySnapshot,
  createLiveGatedPemsEvaluatorDraft,
  createPemsEvaluatorDraft,
  getPemsReviewerWorkbenchStatus,
  persistContinuousIntelligenceShadowRun,
  recordPemsClaimRevision,
  recordPemsReviewerFollowUp,
  recordPemsReviewerHistoryExport,
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
          citationClosure: ["artifact_phase39"],
          claimCitationClosure: [
            {
              claim: "The cited source pointer supports a validator review.",
              status: "supported",
              sourcePointerIds: ["artifact_phase39"],
              confidence: 0.92
            }
          ]
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

test("Phase 40 claim citation closure labels unsupported live evaluator claims and keeps approval advisory-only", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);

  const generated = await createLiveGatedPemsEvaluatorDraft(
    store,
    {
      candidateId,
      actorUserId: "phase40_test",
      sourcePointerIds: ["artifact_phase40"],
      modelConfig: { configured: true, model: "gpt-5-mini", baseURL: "https://api.openai.com/v1" }
    },
    {
      llmInvoker: async () =>
        JSON.stringify({
          advisoryNote: "One claim is supported. The deductible is definitely waived is unsupported and must be edited.",
          suggestedReviewType: "validator_evaluation",
          suggestedDecision: "pass",
          citationClosure: ["artifact_phase40"],
          claimCitationClosure: [
            {
              claim: "The cited source pointer supports a validator review.",
              status: "supported",
              sourcePointerIds: ["artifact_phase40"],
              confidence: 0.93
            },
            {
              claim: "The deductible is definitely waived.",
              status: "unsupported",
              sourcePointerIds: ["artifact_not_allowed"],
              confidence: 0.12,
              suggestedEdit: "Remove the deductible waiver claim unless a cited source pointer supports it."
            }
          ]
        })
    }
  );

  assert.equal(generated.status, "phase39_live_evaluator_mocked_output_not_proof");
  assert.equal(generated.productionDrivingAllowed, false);

  const status = await getPemsReviewerWorkbenchStatus(store, {
    evaluatorMode: "llm_assisted_advisory",
    draftStatus: "needs_reviewer_attention"
  });
  assert.equal(status.latestClaimCitationClosure.version, "2026-06-20.phase40-live-claim-citation-closure.v1");
  assert.equal(status.latestDraft.status, "needs_reviewer_attention");
  assert.equal(status.latestClaimCitationClosure.claimCount, 2);
  assert.equal(status.latestClaimCitationClosure.supportedCount, 1);
  assert.equal(status.latestClaimCitationClosure.unsupportedCount, 1);
  assert.equal(status.latestClaimCitationClosure.reviewerEditRequired, true);
  assert.deepEqual(status.latestClaimCitationClosure.claims[1].sourcePointerIds, []);
  assert.equal(status.latestClaimCitationClosure.claims[1].requiresReviewerEdit, true);
  assert.equal(status.latestClaimCitationClosure.safety.rawClaimStored, false);
  assert.equal(status.latestClaimCitationClosure.safety.rawSourceStored, false);

  const proof = buildPemsLiveClaimCitationClosureProof(status);
  assert.equal(proof.status, "phase40_claim_citation_closure_veto_visible");
  assert.equal(proof.score, 94);
  assert.equal(proof.target, 94);
  assert.equal(proof.unsupportedCount, 1);
  assert.equal(proof.reviewerEditRequired, true);
  assert.equal(proof.sourcePointerBounded, true);
  assert.equal(proof.safety.claimLabelsCreateEvidence, false);
  assert.equal(proof.safety.unsupportedClaimsVetoApproval, true);
  assert.equal(proof.productionDrivingAllowed, false);
});

test("Phase 41 reviewer claim revisions persist before and after hashes with deterministic reclosure", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);

  await createLiveGatedPemsEvaluatorDraft(
    store,
    {
      candidateId,
      actorUserId: "phase41_test",
      sourcePointerIds: ["artifact_phase41"],
      modelConfig: { configured: true, model: "gpt-5-mini", baseURL: "https://api.openai.com/v1" }
    },
    {
      llmInvoker: async () =>
        JSON.stringify({
          advisoryNote: "The unsupported claim needs reviewer revision before approval.",
          suggestedReviewType: "validator_evaluation",
          suggestedDecision: "pass",
          citationClosure: ["artifact_phase41"],
          claimCitationClosure: [
            {
              claim: "The cited source pointer supports a validator review.",
              status: "supported",
              sourcePointerIds: ["artifact_phase41"],
              confidence: 0.93
            },
            {
              claim: "The deductible is definitely waived.",
              status: "unsupported",
              sourcePointerIds: [],
              confidence: 0.12,
              suggestedEdit: "Revise to say the deductible waiver is not supported by the cited source pointer."
            }
          ]
        })
    }
  );

  const before = await getPemsReviewerWorkbenchStatus(store, {
    evaluatorMode: "llm_assisted_advisory",
    draftStatus: "needs_reviewer_attention"
  });
  const unsupportedClaim = before.latestClaimCitationClosure.claims.find((claim) => claim.status === "unsupported");
  assert.ok(unsupportedClaim);

  const revision = await recordPemsClaimRevision(store, {
    candidateId,
    advisoryDraftId: before.latestDraft.id,
    claimId: unsupportedClaim.id,
    actorUserId: "human_reviewer",
    revisedClaim: "The cited source pointer does not support a deductible waiver.",
    sourcePointerIds: ["artifact_phase41"],
    metadata: { reviewerUiAction: "record_claim_revision" }
  });

  assert.equal(revision.version, "2026-06-20.phase41-reviewer-claim-revision-records.v1");
  assert.equal(revision.status, "revision_reclosure_passed");
  assert.equal(revision.deterministicReclosure.status, "phase41_revision_reclosure_passed");
  assert.equal(revision.revision.sourcePointerIds[0], "artifact_phase41");
  assert.notEqual(revision.revision.originalClaimHash, revision.revision.revisedClaimHash);
  assert.equal(revision.safety.rawOriginalClaimStored, false);
  assert.equal(revision.safety.rawSuggestedEditStored, false);
  assert.equal(revision.safety.rawRevisedClaimStored, false);
  assert.equal(revision.safety.rawSourceStored, false);
  assert.equal(revision.safety.revisionCreatesEvidence, false);
  assert.equal(revision.productionDrivingAllowed, false);

  const after = await getPemsReviewerWorkbenchStatus(store, {
    evaluatorMode: "llm_assisted_advisory",
    draftStatus: "needs_reviewer_attention"
  });
  assert.equal(after.claimRevisionCount, 1);
  assert.equal(after.claimRevisionReclosedCount, 1);
  assert.equal(after.latestClaimRevision.originalClaimHash, unsupportedClaim.claimHash);
  assert.equal(after.latestClaimRevision.deterministicReclosure.sourcePointerBounded, true);
  assert.equal(after.latestClaimRevision.safety.revisionCreatesEvidence, false);

  const proof = buildPemsReviewerClaimRevisionProof(after);
  assert.equal(proof.status, "phase41_reviewer_claim_revision_ready");
  assert.equal(proof.score, 96);
  assert.equal(proof.target, 96);
  assert.equal(proof.deterministicReclosurePassed, true);
  assert.equal(proof.sourcePointerBounded, true);
  assert.equal(proof.preservesOriginalAndRevisedHashes, true);
  assert.equal(proof.safety.revisionCreatesEvidence, false);
  assert.equal(proof.safety.revisionBypassesHumanReview, false);
  assert.equal(proof.productionDrivingAllowed, false);
});

test("Phase 42 reviewer follow-ups bind revised claims to explicit review decisions", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);

  await createLiveGatedPemsEvaluatorDraft(
    store,
    {
      candidateId,
      actorUserId: "phase42_test",
      sourcePointerIds: ["artifact_phase42"],
      modelConfig: { configured: true, model: "gpt-5-mini", baseURL: "https://api.openai.com/v1" }
    },
    {
      llmInvoker: async () =>
        JSON.stringify({
          advisoryNote: "The reviewer must revise unsupported advisory text before any explicit decision.",
          suggestedReviewType: "human_review",
          suggestedDecision: "approved",
          citationClosure: ["artifact_phase42"],
          claimCitationClosure: [
            {
              claim: "The cited source pointer supports manual review.",
              status: "supported",
              sourcePointerIds: ["artifact_phase42"],
              confidence: 0.93
            },
            {
              claim: "Automatic enrollment is guaranteed.",
              status: "unsupported",
              sourcePointerIds: [],
              confidence: 0.1,
              suggestedEdit: "Revise to say automatic enrollment is not supported by the cited source pointer."
            }
          ]
        })
    }
  );

  const before = await getPemsReviewerWorkbenchStatus(store, {
    evaluatorMode: "llm_assisted_advisory",
    draftStatus: "needs_reviewer_attention"
  });
  const unsupportedClaim = before.latestClaimCitationClosure.claims.find((claim) => claim.status === "unsupported");
  assert.ok(unsupportedClaim);

  const revision = await recordPemsClaimRevision(store, {
    candidateId,
    advisoryDraftId: before.latestDraft.id,
    claimId: unsupportedClaim.id,
    actorUserId: "human_reviewer",
    revisedClaim: "The cited source pointer does not support automatic enrollment without consent.",
    sourcePointerIds: ["artifact_phase42"],
    metadata: { reviewerUiAction: "record_claim_revision" }
  });
  assert.equal(revision.status, "revision_reclosure_passed");

  const review = await recordPemsPromotionReview(store, {
    candidateId,
    actorUserId: "human_reviewer",
    reviewType: "human_review",
    decision: "approved",
    advisoryDraftId: before.latestDraft.id,
    rationale: "Approved advisory material after revision reclosure and human review.",
    metadata: {
      phase: 42,
      claimRevisionId: revision.revision.id,
      advisoryOnly: true,
      rawRationaleStored: false,
      productionDrivingAllowed: false
    }
  });
  assert.equal(review.review.decision, "approved");
  assert.equal(review.productionDrivingAllowed, false);

  const followUp = await recordPemsReviewerFollowUp(store, {
    candidateId,
    advisoryDraftId: before.latestDraft.id,
    claimRevisionId: revision.revision.id,
    promotionReviewId: review.review.id,
    actorUserId: "human_reviewer",
    rationale: "Bound the revised claim to the explicit human review decision.",
    actionRequired: "No advisory follow-up remains open after revision and human decision.",
    metadata: { reviewerUiAction: "record_reviewer_follow_up" }
  });

  assert.equal(followUp.version, "2026-06-20.phase42-reviewer-follow-up-workflows.v1");
  assert.equal(followUp.status, "phase42_reviewer_follow_up_resolved");
  assert.equal(followUp.followUp.followupStatus, "resolved");
  assert.equal(followUp.followUp.workflowStatus, "advisory_closed");
  assert.equal(followUp.followUp.claimRevisionId, revision.revision.id);
  assert.equal(followUp.followUp.promotionReviewId, review.review.id);
  assert.equal(followUp.safety.followUpCreatesEvidence, false);
  assert.equal(followUp.safety.followUpBypassesHumanReview, false);
  assert.equal(followUp.productionDrivingAllowed, false);

  const after = await getPemsReviewerWorkbenchStatus(store, {
    evaluatorMode: "llm_assisted_advisory",
    draftStatus: "needs_reviewer_attention"
  });
  assert.equal(after.reviewerFollowUpCount, 1);
  assert.equal(after.reviewerFollowUpResolvedCount, 1);
  assert.equal(after.revisionBoundFollowUpCount, 1);
  assert.equal(after.reviewDecisionBoundFollowUpCount, 1);
  assert.equal(after.latestReviewerFollowUp.claimRevisionId, revision.revision.id);
  assert.equal(after.latestPromotionReview.id, review.review.id);
  assert.equal(after.latestReviewerFollowUp.safety.followUpCreatesEvidence, false);

  const proof = buildPemsReviewerFollowUpProof(after);
  assert.equal(proof.status, "phase42_reviewer_follow_up_workflow_ready");
  assert.equal(proof.score, 98);
  assert.equal(proof.target, 98);
  assert.equal(proof.bindsRevision, true);
  assert.equal(proof.bindsReviewDecision, true);
  assert.equal(proof.revisionResolvedVeto, true);
  assert.equal(proof.safety.followUpCreatesEvidence, false);
  assert.equal(proof.safety.followUpBypassesHumanReview, false);
  assert.equal(proof.productionDrivingAllowed, false);
});

test("Phase 43 reviewer history exports persist audit refs without raw history", async () => {
  const store = await createStore();
  const { candidateId } = await createMatureCandidate(store);

  await createLiveGatedPemsEvaluatorDraft(
    store,
    {
      candidateId,
      actorUserId: "phase43_test",
      sourcePointerIds: ["artifact_phase43"],
      modelConfig: { configured: true, model: "gpt-5-mini", baseURL: "https://api.openai.com/v1" }
    },
    {
      llmInvoker: async () =>
        JSON.stringify({
          advisoryNote: "The reviewer must revise unsupported advisory text and preserve the audit history.",
          suggestedReviewType: "human_review",
          suggestedDecision: "approved",
          citationClosure: ["artifact_phase43"],
          claimCitationClosure: [
            {
              claim: "The cited source pointer supports manual review.",
              status: "supported",
              sourcePointerIds: ["artifact_phase43"],
              confidence: 0.94
            },
            {
              claim: "Production approval can happen automatically.",
              status: "unsupported",
              sourcePointerIds: [],
              confidence: 0.1,
              suggestedEdit: "Revise to say production approval remains disabled."
            }
          ]
        })
    }
  );

  const before = await getPemsReviewerWorkbenchStatus(store, {
    evaluatorMode: "llm_assisted_advisory",
    draftStatus: "needs_reviewer_attention"
  });
  const unsupportedClaim = before.latestClaimCitationClosure.claims.find((claim) => claim.status === "unsupported");
  assert.ok(unsupportedClaim);

  const revision = await recordPemsClaimRevision(store, {
    candidateId,
    advisoryDraftId: before.latestDraft.id,
    claimId: unsupportedClaim.id,
    actorUserId: "human_reviewer",
    revisedClaim: "The cited source pointer does not support production approval; production driving remains disabled.",
    sourcePointerIds: ["artifact_phase43"],
    metadata: { reviewerUiAction: "record_claim_revision" }
  });
  const review = await recordPemsPromotionReview(store, {
    candidateId,
    actorUserId: "human_reviewer",
    reviewType: "human_review",
    decision: "approved",
    advisoryDraftId: before.latestDraft.id,
    rationale: "Approved advisory material after deterministic revision reclosure.",
    metadata: {
      phase: 43,
      claimRevisionId: revision.revision.id,
      advisoryOnly: true,
      rawRationaleStored: false,
      productionDrivingAllowed: false
    }
  });
  await recordPemsReviewerFollowUp(store, {
    candidateId,
    advisoryDraftId: before.latestDraft.id,
    claimRevisionId: revision.revision.id,
    promotionReviewId: review.review.id,
    actorUserId: "human_reviewer",
    rationale: "Closed advisory follow-up after revision and explicit review.",
    metadata: { reviewerUiAction: "record_reviewer_follow_up" }
  });

  const snapshot = await buildPemsReviewerHistorySnapshot(store, {
    candidateId,
    advisoryDraftId: before.latestDraft.id
  });
  assert.equal(snapshot.version, "2026-06-20.phase43-reviewer-history-audit-exports.v1");
  assert.equal(snapshot.counts.claimRevisionCount, 1);
  assert.equal(snapshot.counts.promotionReviewCount, 1);
  assert.equal(snapshot.counts.reviewerFollowUpCount, 1);
  assert.equal(snapshot.safety.rawHistoryStored, false);
  assert.equal(snapshot.safety.exportCreatesEvidence, false);
  assert.equal(snapshot.productionDrivingAllowed, false);

  const recorded = await recordPemsReviewerHistoryExport(store, {
    candidateId,
    advisoryDraftId: before.latestDraft.id,
    actorUserId: "human_reviewer",
    exportReason: "Export reviewer history refs for audit. Do not store raw notes, PHI, prompts, completions, OCR, or source text.",
    filters: { candidateId, advisoryDraftId: before.latestDraft.id, followupStatus: "all", reviewDecision: "all" },
    metadata: { reviewerUiAction: "record_reviewer_history_export" }
  });

  assert.equal(recorded.version, "2026-06-20.phase43-reviewer-history-audit-exports.v1");
  assert.equal(recorded.status, "phase43_reviewer_history_audit_export_recorded");
  assert.ok(recorded.export.exportRef.startsWith("pems_review_history_export_"));
  assert.ok(recorded.export.exportHash);
  assert.ok(recorded.export.historySnapshotHash);
  assert.equal(recorded.export.historySnapshotPreview.counts.claimRevisionCount, 1);
  assert.equal(recorded.export.historySnapshotPreview.counts.promotionReviewCount, 1);
  assert.equal(recorded.export.historySnapshotPreview.counts.reviewerFollowUpCount, 1);
  assert.equal(recorded.export.safety.rawHistoryStored, false);
  assert.equal(recorded.export.safety.rawRevisionStored, false);
  assert.equal(recorded.export.safety.rawReviewStored, false);
  assert.equal(recorded.export.safety.rawSourceStored, false);
  assert.equal(recorded.export.safety.exportCreatesEvidence, false);
  assert.equal(recorded.export.safety.exportBypassesHumanReview, false);
  assert.equal(recorded.productionDrivingAllowed, false);

  const rows = await store.list("pems_candidate_review_history_exports", { candidate_id: candidateId });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metadata_json.includes("rawHistoryStored"), true);
  assert.equal(rows[0].metadata_json.includes("rawSourceStored"), true);
  assert.equal(rows[0].metadata_json.includes("patient@example.com"), false);
  assert.equal(rows[0].history_snapshot_preview_json.includes("Production approval can happen automatically"), false);

  const after = await getPemsReviewerWorkbenchStatus(store, {
    evaluatorMode: "llm_assisted_advisory",
    draftStatus: "needs_reviewer_attention"
  });
  assert.equal(after.reviewerHistoryExportCount, 1);
  assert.equal(after.safeHistoryExportCount, 1);
  assert.equal(after.latestReviewerHistoryExport.exportRef, recorded.export.exportRef);

  const proof = buildPemsReviewerHistoryExportProof(after);
  assert.equal(proof.status, "phase43_reviewer_history_audit_export_ready");
  assert.equal(proof.score, 99);
  assert.equal(proof.target, 99);
  assert.equal(proof.hasExportRef, true);
  assert.equal(proof.hasExportHash, true);
  assert.equal(proof.hasSnapshotHash, true);
  assert.equal(proof.claimRevisionCount, 1);
  assert.equal(proof.promotionReviewCount, 1);
  assert.equal(proof.reviewerFollowUpCount, 1);
  assert.equal(proof.safety.exportCreatesEvidence, false);
  assert.equal(proof.safety.exportBypassesHumanReview, false);
  assert.equal(proof.productionDrivingAllowed, false);
});
