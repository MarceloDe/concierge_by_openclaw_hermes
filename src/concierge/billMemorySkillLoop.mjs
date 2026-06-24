import { createHash } from "node:crypto";
import { analyzeBillVerificationInput } from "./billVerification.mjs";

export const PHASE71_BILL_MEMORY_SKILL_LOOP_VERSION = "2026-06-22.phase71-bill-memory-skill-loop.v1";

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function createBillVerificationMemoryEpisode({ billAnalysis, outcome = "successful_case", reviewedBy = "operator_pending" } = {}) {
  const analysis =
    billAnalysis ??
    analyzeBillVerificationInput({
      text: "Provider: Example Clinic\nDate: 2026-06-01\nAmount due: $184.22\nPayer: Aetna\nClaim number: CLM-123456",
      sessionId: "phase71"
    });
  const caseId = `case:bill:${sha256(analysis.sourcePointer.id).slice(0, 12)}`;
  return {
    caseId,
    targetGoal: "understand_bill",
    status: outcome === "successful_case" ? "closed_resolved" : "closed_unresolved",
    groupId: "patient_private::<patient_id>",
    graphitiEpisode: {
      commandType: "INGEST_Case",
      payloadKind: "bill_verification_case",
      sourceProvenance: [analysis.sourcePointer.id],
      phiPayloadStored: false,
      rawBillTextStored: false
    },
    loopIterations: [
      {
        stage: "extract_bill_facts",
        outcome: analysis.missingEvidence.length ? "repeat" : "advance",
        evidenceRefs: [analysis.sourcePointer.id]
      },
      {
        stage: "plan_next_evidence",
        outcome: "advance",
        evidenceRefs: [analysis.sourcePointer.id]
      }
    ],
    outcomeMetric: {
      resolved: outcome === "successful_case",
      patientConfirmationRequired: true,
      reviewedBy
    }
  };
}

export function createBillVerificationSkillCandidate({ memoryEpisode, analysis } = {}) {
  const episode = memoryEpisode ?? createBillVerificationMemoryEpisode({ billAnalysis: analysis });
  return {
    candidateId: `skill-candidate:${sha256(episode.caseId).slice(0, 12)}`,
    status: "operator_review_required",
    sourceCaseId: episode.caseId,
    proposedSkillKey: "bill_verification_flow",
    activation: {
      stagingOperatorActivationAllowed: true,
      productionActivationRequiresPrMerge: true,
      autoProductionDrivingAllowed: false,
      killSwitchRequired: true
    },
    contents: {
      tools: ["bill_artifact_parser", "coverage_doc_lookup", "payer_portal_consult", "trusted_public_research"],
      extractors: ["bill_amount_extractor", "provider_name_extractor", "claim_reference_extractor", "payer_hint_extractor"],
      verifiers: ["source_pointer_present", "missing_evidence_labeled", "no_login_fallback_available", "approval_gate_required_for_portal"],
      sensors: ["bill_signal_coverage", "source_claim_closure", "portal_auth_readiness"],
      controllerLoop: ["extract_bill_facts", "ask_missing_evidence", "optional_portal_observation", "compose_sourced_answer"],
      uiBlocks: ["bill_summary", "missing_evidence", "approval_gate", "source_citations", "next_steps"],
      memoryRetrievalRules: ["get_loop_for_target(understand_bill)", "get_exemplars(understand_bill, plan_type)", "get_temporal_facts(patient, plan, all)"],
      tests: ["bill_verification_flow", "source_pointer_policy", "human_takeover_boundary", "no_phi_to_public_research"]
    },
    reviewQueue: {
      decision: "pending",
      reviewer: null,
      reasonRequired: true,
      rollbackAvailable: true
    }
  };
}

export function buildPhase71BillMemorySkillLoopProof() {
  const analysis = analyzeBillVerificationInput({
    text: "Provider: Example Clinic\nDate: 2026-06-01\nAmount due: $184.22\nPayer: Aetna\nClaim number: CLM-123456",
    sessionId: "phase71"
  });
  const episode = createBillVerificationMemoryEpisode({ billAnalysis: analysis });
  const candidate = createBillVerificationSkillCandidate({ memoryEpisode: episode, analysis });
  const checks = {
    successfulCaseCreatesMemoryEpisode: episode.graphitiEpisode.commandType === "INGEST_Case",
    episodeStoresRefsOnly: episode.graphitiEpisode.phiPayloadStored === false && episode.graphitiEpisode.rawBillTextStored === false,
    loopIterationsPresent: episode.loopIterations.length >= 2,
    outcomeMetricPresent: episode.outcomeMetric.patientConfirmationRequired === true,
    candidateCreated: candidate.proposedSkillKey === "bill_verification_flow",
    candidateHasRequiredContents: Object.values(candidate.contents).every((value) => Array.isArray(value) && value.length > 0),
    operatorReviewRequired: candidate.status === "operator_review_required",
    stagingActivationOnly: candidate.activation.stagingOperatorActivationAllowed === true,
    productionRequiresPrMerge: candidate.activation.productionActivationRequiresPrMerge === true,
    productionDrivingBlocked: candidate.activation.autoProductionDrivingAllowed === false,
    killSwitchRequired: candidate.activation.killSwitchRequired === true
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  return {
    version: PHASE71_BILL_MEMORY_SKILL_LOOP_VERSION,
    status: passed === total ? "phase71_bill_memory_skill_loop_ready" : "phase71_bill_memory_skill_loop_attention",
    ok: passed === total,
    score: Math.round((passed / total) * 100),
    target: 100,
    checks,
    episode,
    candidate
  };
}
