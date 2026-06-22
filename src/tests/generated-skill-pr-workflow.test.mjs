import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGeneratedSkillPrWorkflow,
  buildPhase61GeneratedSkillPrProof,
  evaluateGeneratedSkillPrGate
} from "../concierge/generatedSkillPrWorkflow.mjs";
import { buildConsolidationCandidateFromCase } from "../concierge/memorySkillTree.mjs";

function matureCandidate(overrides = {}) {
  return buildConsolidationCandidateFromCase({
    caseState: {
      decision: { workflow: "non_standard_plan_document_review" },
      evidence: {
        sourcePointerCount: 2,
        sourcePointerRefs: [
          { table: "uploaded_document_extractions", id: "upload_phase61_a" },
          { table: "research_artifacts", id: "artifact_phase61_b" }
        ]
      }
    },
    dynamicSkillContext: {
      contextSummary: { workflow: "non_standard_plan_document_review", payer: "New Plan" },
      selected: { executionSkillKey: "insurance_portal_browser" }
    },
    productMemoryRecall: {
      adapter: "graphiti",
      enabled: true,
      facts: [{ uuid: "fact_phase61", fact: "Use the plan-specific exception procedure from cited cases only." }]
    },
    aggregate: {
      shadowRuns: 10,
      evidenceRefCount: 4,
      successfulOutcomeCount: 8,
      reviewerApprovals: 2,
      authorityCitationCount: 4,
      validatorPassCount: 2,
      safetyIncidentCount: 0,
      freshnessDays: 1
    },
    user: { id: "user_phase61", name: "Generated Skill User", email: "skill-user@example.com" },
    allowWorktreeWrite: true,
    reviewerApproved: true,
    ...overrides
  });
}

function passingReviews() {
  return [
    { reviewType: "human_review", decision: "approved", actorUserId: "reviewer_1" },
    { reviewType: "human_review", decision: "approved", actorUserId: "reviewer_2" },
    { reviewType: "validator_evaluation", decision: "pass", actorUserId: "validator" },
    { reviewType: "citation_evaluation", decision: "pass", actorUserId: "citation" }
  ];
}

test("generated skill PR gate blocks mature memory candidates until reviewer, validator, and citation checks pass", () => {
  const candidate = matureCandidate();
  const blocked = evaluateGeneratedSkillPrGate({
    candidate,
    reviews: [{ reviewType: "human_review", decision: "approved", actorUserId: "reviewer_1" }]
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, "generated_skill_pr_gate_blocked");
  assert.equal(blocked.checks.humanReviewerApproved, false);
  assert.equal(blocked.checks.validatorPassed, false);
  assert.equal(blocked.checks.citationsPassed, false);
});

test("reviewer-approved generated skill workflow produces a PR package without executing side effects", () => {
  const candidate = matureCandidate();
  const workflow = buildGeneratedSkillPrWorkflow({
    candidate,
    reviews: passingReviews(),
    allowWorktreeWrite: true,
    reviewerApprovedWorktreeWrite: true
  });

  assert.equal(workflow.status, "phase61_generated_skill_pr_ready");
  assert.equal(workflow.ok, true);
  assert.equal(workflow.score, 100);
  assert.equal(workflow.gate.ok, true);
  assert.equal(workflow.artifactPackage.validation.valid, true, workflow.artifactPackage.validation.issues.join("; "));
  assert.equal(workflow.artifactPackage.proceduralSafety.ok, true);
  assert.equal(workflow.artifactPackage.fileCount, 3);
  assert.match(workflow.pullRequest.branchName, /^generated-skill\//);
  assert.equal(workflow.pullRequest.autoMergeAllowed, false);
  assert.equal(workflow.sideEffects.filesWritten, false);
  assert.equal(workflow.sideEffects.pullRequestOpened, false);
  assert.equal(workflow.sideEffects.worktreeWriteAllowed, true);
  assert.equal(workflow.safety.productionDrivingAllowed, false);
});

test("generated skill package remains blocked from worktree writes without explicit reviewer write approval", () => {
  const workflow = buildGeneratedSkillPrWorkflow({
    candidate: matureCandidate(),
    reviews: passingReviews(),
    allowWorktreeWrite: true,
    reviewerApprovedWorktreeWrite: false
  });

  assert.equal(workflow.ok, false);
  assert.equal(workflow.checks.worktreeWriteRequiresReviewerApproval, false);
  assert.equal(workflow.sideEffects.worktreeWriteAllowed, false);
  assert.equal(workflow.safety.autoMergeAllowed, false);
  assert.equal(workflow.safety.productionDrivingAllowed, false);
});

test("Phase 61 dashboard proof exposes reviewer-gated generated-skill PR readiness", () => {
  const proof = buildPhase61GeneratedSkillPrProof();

  assert.equal(proof.status, "phase61_generated_skill_pr_workflow_ready");
  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.gate.reviewCounts.humanApprovals, 2);
  assert.equal(proof.artifactPackage.fileCount, 3);
  assert.equal(proof.artifactPackage.validation.valid, true);
  assert.equal(proof.pullRequest.autoMergeAllowed, false);
  assert.equal(proof.safety.productionDrivingAllowed, false);
});
