import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConsolidationCandidateFromCase,
  buildPhase60MemorySkillTreeProof,
  buildRalphLoopProcedure,
  selectMemorySkillTree
} from "../concierge/memorySkillTree.mjs";
import { buildLlmOrchestrationDecisionPayload } from "../concierge/llmOrchestrationDecision.mjs";

function phase60Fixture(overrides = {}) {
  const user = {
    id: "user_phase60",
    name: "Memory Skill User",
    email: "memory-skill@example.com",
    payer: "New Plan"
  };
  const state = {
    user_id: user.id,
    session_id: "session_phase60",
    workflow: "non_standard_plan_document_review",
    user_input: "This is a new insurance plan design. Can you explain the imaging exception?",
    raw_message: { newDemandSignals: ["new_plan_design"] },
    context_packet: {
      user,
      currentSession: { id: "session_phase60", channel: "local_web_chat" },
      dbPointers: [{ table: "uploaded_document_extractions", id: "upload_phase60", summary: "safe extracted source pointer" }]
    },
    source_pointers: [{ table: "uploaded_document_extractions", id: "upload_phase60", summary: "safe extracted source pointer" }],
    product_memory_recall: {
      adapter: "graphiti",
      enabled: true,
      facts: [
        {
          uuid: "fact_phase60",
          fact: "Memory Skill User had a prior exception pattern, but memory-skill@example.com must never be stored raw."
        }
      ]
    }
  };
  const dynamicSkillContext = {
    contextSummary: {
      userId: user.id,
      sessionId: state.session_id,
      workflow: state.workflow,
      payer: "New Plan"
    },
    selected: { insuranceSkillKey: null, journeySkillKey: null, executionSkillKey: "insurance_portal_browser" },
    matches: [{ skillKey: "insurance_portal_browser", skillKind: "execution_specific", fit: { score: 20 } }]
  };
  const caseState = {
    decision: { workflow: state.workflow },
    evidence: {
      sourcePointerCount: 1,
      sourcePointerRefs: [{ table: "uploaded_document_extractions", id: "upload_phase60" }]
    }
  };
  const aggregate = {
    shadowRuns: 10,
    evidenceRefCount: 4,
    successfulOutcomeCount: 8,
    reviewerApprovals: 2,
    authorityCitationCount: 4,
    validatorPassCount: 2,
    safetyIncidentCount: 0,
    freshnessDays: 2
  };
  return { user, state, dynamicSkillContext, caseState, aggregate, ...overrides };
}

test("memory skill-tree selector keeps DB authoritative and Graphiti advisory for non-standard journeys", () => {
  const { user, state, dynamicSkillContext, caseState, aggregate } = phase60Fixture();
  const selected = selectMemorySkillTree({
    state,
    dynamicSkillContext,
    productMemoryRecall: state.product_memory_recall,
    caseState,
    aggregate,
    user
  });

  assert.equal(selected.status, "phase60_memory_skill_tree_ready");
  assert.equal(selected.dbAuthority.graphitiMayOverrideDb, false);
  assert.equal(selected.dbAuthority.sessionControlInGraphiti, false);
  assert.equal(selected.memoryUsePolicy.graphitiRole, "advisory_retrieval_and_consolidation_signal");
  assert.equal(selected.selectedProcedureMemory.nonStandardDemand, true);
  assert.equal(selected.selectedProcedureMemory.sourcePointerRefs[0].sourcePointerId, "uploaded_document_extractions/upload_phase60");
  assert.ok(selected.selectedProcedureMemory.productMemoryFactRefs.includes("fact_phase60"));
  assert.equal(selected.safety.productionDrivingAllowed, false);
});

test("RALPH loop procedure exposes engineering gates, sensors, verifier, and pass/fail restart policy", () => {
  const loop = buildRalphLoopProcedure({
    caseKey: "case_phase60",
    workflow: "claim_status_navigation",
    selectedSkillKey: "claim_journey_temporary",
    tools: ["memory_skill_tree_selector"],
    extractors: ["portal_source_pointer_extractor"],
    verifiers: ["deterministic_claim_source_validator"],
    sensors: ["mvp_visual_smoke"],
    controllers: ["langgraph_orchestrator"]
  });

  assert.equal(loop.loopStyle, "ralph_rigg_sequential_goal_loop");
  assert.deepEqual(loop.steps.map((step) => step.id), [
    "requirements",
    "target_plan",
    "implementation",
    "testing",
    "visual_sensor",
    "agentic_goal_evaluation",
    "decision"
  ]);
  assert.equal(loop.passDecision.ifNo, "repeat_current_case_loop_with_more_evidence");
  assert.equal(loop.passDecision.automaticProductionPromotion, false);
});

test("consolidation candidate can mature from memory but cannot write a skill or drive production without reviewer gate", () => {
  const { user, state, dynamicSkillContext, caseState, aggregate } = phase60Fixture();
  const candidate = buildConsolidationCandidateFromCase({
    caseState,
    dynamicSkillContext,
    productMemoryRecall: state.product_memory_recall,
    aggregate,
    user,
    allowWorktreeWrite: true,
    reviewerApproved: false
  });

  assert.equal(candidate.status, "ready_for_reviewer_skill_candidate");
  assert.equal(candidate.readyForReviewer, true);
  assert.equal(candidate.worktreeWriteAllowed, false);
  assert.equal(candidate.productionDrivingAllowed, false);
  assert.equal(candidate.skillServerDraft.safety.reviewer_approval_required, true);
  assert.equal(candidate.skillServerDraft.safety.production_driving_allowed, false);
  assert.doesNotMatch(JSON.stringify(candidate), /Memory Skill User|memory-skill@example\.com/);
});

test("LLM orchestration payload receives bounded memory skill-tree instructions", () => {
  const { user, state, dynamicSkillContext, caseState, aggregate } = phase60Fixture();
  const memorySkillTree = selectMemorySkillTree({
    state,
    dynamicSkillContext,
    productMemoryRecall: state.product_memory_recall,
    caseState,
    aggregate,
    user
  });
  const payload = buildLlmOrchestrationDecisionPayload({
    ...state,
    dynamic_skill_context: dynamicSkillContext,
    memory_skill_tree: memorySkillTree,
    policy_result: { allowed: true, approvalRequired: false, checks: [] },
    structured_intent: { intent: "benefits_question", workflow: state.workflow }
  });

  assert.equal(payload.memorySkillTree.selectedProcedureMemory.nonStandardDemand, true);
  assert.equal(payload.memorySkillTree.dbAuthority.graphitiMayOverrideDb, false);
  assert.equal(payload.memorySkillTree.consolidationCandidate.worktreeWriteAllowed, false);
  assert.equal(payload.memorySkillTree.consolidationCandidate.productionDrivingAllowed, false);
  assert.ok(payload.memorySkillTree.ralphLoop.stepIds.includes("decision"));
});

test("Phase 60 dashboard proof scores the memory skill-tree selector at target", () => {
  const proof = buildPhase60MemorySkillTreeProof();

  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.target, 100);
  assert.equal(proof.checks.dbAuthoritative, true);
  assert.equal(proof.checks.graphitiAdvisory, true);
  assert.equal(proof.checks.candidateGeneratedButNotWritten, true);
  assert.equal(proof.safety.productionDrivingAllowed, false);
});
