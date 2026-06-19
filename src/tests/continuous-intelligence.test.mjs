import assert from "node:assert/strict";
import test from "node:test";
import {
  CASE_STATE_SCHEMA_VERSION,
  PEMS_SCHEMA_VERSION,
  UNIVERSAL_CASE_GATES,
  buildCaseState,
  buildContinuousIntelligenceReadinessProof,
  buildContinuousIntelligenceShadow,
  evaluateUniversalCaseGates,
  scorePemsMaturity
} from "../concierge/continuousIntelligence.mjs";

test("CaseState is typed, sanitized, and keeps Cortex out of product memory", () => {
  const caseState = buildCaseState({
    userId: "user_123",
    sessionId: "session_456",
    graphTraceId: "trace_789",
    channel: "local_web_chat",
    userInput: "My member id is ABC123 and I need benefits help",
    contextPacket: {
      user: { id: "user_123" },
      portalAccount: {
        id: "portal_1",
        payer: "Aetna",
        status: "ready",
        portalUrl: "https://member.example.test/private/path"
      },
      workflowArchitecture: { routeCandidates: [{ workflowKey: "eligibility_check" }] },
      memoryItems: [{ id: "memory_1" }]
    },
    policyResult: { allowed: true },
    structuredIntent: { intent: "check_benefits", workflow: "eligibility_check", confidence: 0.91 },
    workflow: "eligibility_check",
    sourcePointers: [{ table: "eligibility_snapshots", id: "snap_1", sourceUrl: "https://member.example.test/private/path" }],
    productMemoryRecall: { adapter: "graphiti", facts: [{ uuid: "fact_1" }] }
  });

  assert.equal(caseState.schemaVersion, CASE_STATE_SCHEMA_VERSION);
  assert.equal(caseState.mode, "shadow_only");
  assert.equal(caseState.productionDrivingAllowed, false);
  assert.equal(caseState.intake.rawInputStored, false);
  assert.notEqual(caseState.intake.inputHash, "My member id is ABC123 and I need benefits help");
  assert.equal(caseState.context.cortexProductMemory, false);
  assert.equal(caseState.context.productMemoryAdapter, "graphiti");
  assert.equal(caseState.evidence.sourcePointerRefs[0].sourceHostHash.length, 16);
  assert.equal(JSON.stringify(caseState).includes("ABC123"), false);
  assert.equal(JSON.stringify(caseState).includes("/private/path"), false);
});

test("G0-G8 universal gates are evaluated in order and remain shadow-safe", () => {
  const shadow = buildContinuousIntelligenceShadow({
    userId: "user_123",
    sessionId: "session_456",
    graphTraceId: "trace_789",
    userInput: "Check benefits",
    contextPacket: { user: { id: "user_123" }, workflowArchitecture: { routeCandidates: [{ workflowKey: "eligibility_check" }] } },
    policyResult: { allowed: true },
    structuredIntent: { intent: "check_benefits", workflow: "eligibility_check", confidence: 0.9 },
    workflow: "eligibility_check",
    routeReason: "structured_intent_classifier",
    evidenceObservation: { status: "not_requested", actionsTaken: [] },
    workflowOutcome: "openclaw_skill_proposal_prepared",
    finalResponse: "proof only"
  });

  assert.deepEqual(
    shadow.gates.map((gate) => gate.id),
    UNIVERSAL_CASE_GATES.map((gate) => gate.id)
  );
  assert.equal(shadow.gates.find((gate) => gate.id === "G6").checks.reconstructionMode, "shadow_only");
  assert.equal(shadow.productionDrivingAllowed, false);
  assert.equal(shadow.safety.finalAnswerDecisioningChanged, false);
  assert.ok(shadow.gateSummary.score >= 70);
});

test("PEMS maturity blocks immature or unsafe procedural candidates", () => {
  const immature = scorePemsMaturity({
    candidateId: "skill_candidate",
    shadowRuns: 1,
    evidenceRefCount: 1,
    reviewerApprovals: 0,
    safetyIncidentCount: 0
  });
  assert.equal(immature.schemaVersion, PEMS_SCHEMA_VERSION);
  assert.equal(immature.trusted, false);
  assert.equal(immature.status, "shadow_or_review_required");

  const mature = scorePemsMaturity({
    candidateId: "skill_candidate",
    shadowRuns: 12,
    evidenceRefCount: 8,
    successfulOutcomeCount: 8,
    reviewerApprovals: 3,
    authorityCitationCount: 8,
    validatorPassCount: 8,
    safetyIncidentCount: 0,
    freshnessDays: 7
  });
  assert.equal(mature.trusted, true);

  const unsafe = scorePemsMaturity({
    candidateId: "skill_candidate",
    shadowRuns: 12,
    evidenceRefCount: 8,
    successfulOutcomeCount: 8,
    reviewerApprovals: 3,
    authorityCitationCount: 8,
    validatorPassCount: 8,
    safetyIncidentCount: 1,
    freshnessDays: 7
  });
  assert.equal(unsafe.trusted, false);
});

test("Phase 33 readiness proof passes only as shadow scaffold", () => {
  const proof = buildContinuousIntelligenceReadinessProof();
  assert.equal(proof.ok, true);
  assert.equal(proof.status, "phase33_shadow_scaffold_ready");
  assert.equal(proof.score, 60);
  assert.equal(proof.target, 60);
  assert.equal(proof.productionDrivingAllowed, false);
  assert.equal(proof.pemsTrusted, false);
  assert.deepEqual(proof.gateIds, ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"]);
  assert.ok(proof.schemas.includes(CASE_STATE_SCHEMA_VERSION));
  assert.ok(proof.schemas.includes(PEMS_SCHEMA_VERSION));
});

test("standalone gate evaluator marks missing intake as blocked", () => {
  const gates = evaluateUniversalCaseGates(buildCaseState({ userInput: "" }));
  assert.equal(gates.find((gate) => gate.id === "G0").status, "block");
});
