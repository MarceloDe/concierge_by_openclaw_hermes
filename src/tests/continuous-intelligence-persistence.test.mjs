import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import {
  buildCaseState,
  buildContinuousIntelligencePersistenceReadinessProof,
  buildContinuousIntelligenceShadow,
  getContinuousIntelligencePersistenceStatus,
  persistContinuousIntelligenceShadowRun
} from "../concierge/continuousIntelligence.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-ci-persistence-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function sourcedShadow({ sessionId = "session_1", graphTraceId = "trace_1" } = {}) {
  const caseState = buildCaseState({
    userId: "user_1",
    sessionId,
    graphTraceId,
    channel: "local_web_chat",
    userInput: "Explain the deductible from the reviewed source.",
    contextPacket: {
      user: { id: "user_1" },
      workflowArchitecture: { routeCandidates: [{ workflowKey: "eligibility_benefits_navigation" }] }
    },
    policyResult: { allowed: true },
    structuredIntent: { intent: "check_benefits", workflow: "eligibility_benefits_navigation", confidence: 0.9 },
    workflow: "eligibility_benefits_navigation",
    routeReason: "fixture_shadow_source_pointer",
    dynamicSkillContext: {
      selected: { executionSkillKey: "insurance_portal_browser", journeySkillKey: "benefits_journey" }
    },
    evidenceObservation: { status: "captured_trusted_research_evidence", actionsTaken: ["trusted_research_retrieved"] },
    sourcePointers: [
      {
        table: "research_artifacts",
        id: "artifact_1",
        sourceUrl: "https://example.com/benefits",
        contentHash: "content_hash",
        extractionHash: "extraction_hash"
      }
    ],
    workflowOutcome: "trusted_research_answered",
    finalResponse: "Safe sourced answer."
  });
  return buildContinuousIntelligenceShadow({ caseState });
}

test("continuous-intelligence persistence stores safe shadow rows and accumulates PEMS maturity", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);

  const first = await persistContinuousIntelligenceShadowRun(store, {
    user,
    session,
    graphTraceId: "trace_1",
    shadow: sourcedShadow({ sessionId: session.id, graphTraceId: "trace_1" })
  });
  const second = await persistContinuousIntelligenceShadowRun(store, {
    user,
    session,
    graphTraceId: "trace_2",
    shadow: sourcedShadow({ sessionId: session.id, graphTraceId: "trace_2" })
  });

  assert.equal(first.productionDrivingAllowed, false);
  assert.equal(second.aggregate.shadowRunCount, 2);
  assert.equal(second.maturity.trusted, false);
  assert.equal(second.maturity.inputs.reviewerApprovals, 0);

  const rows = await store.list("continuous_intelligence_shadow_runs", { session_id: session.id });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].production_driving_allowed, 0);
  assert.equal(rows[0].pems_trusted, 0);
  assert.equal(rows[0].source_pointer_count, 1);
  assert.equal(rows[0].shadow_json.includes("Explain the deductible"), false);
  assert.equal(rows[0].shadow_json.includes("https://example.com/benefits"), false);

  const maturity = await store.findOne("pems_candidate_maturity", { candidate_id: second.maturity.candidateId });
  assert.equal(maturity.shadow_run_count, 2);
  assert.equal(maturity.evidence_ref_count, 2);
  assert.equal(maturity.successful_outcome_count, 2);
  assert.equal(maturity.reviewer_approval_count, 0);
  assert.equal(maturity.trusted, 0);
  assert.equal(maturity.production_driving_allowed, 0);

  const status = await getContinuousIntelligencePersistenceStatus(store);
  assert.equal(status.status, "phase34_shadow_persistence_active");
  assert.equal(status.shadowRunCount, 2);
  assert.equal(status.candidateCount, 1);
  assert.equal(status.pemsTrusted, false);
  assert.equal(status.productionDrivingAllowed, false);

  const proof = buildContinuousIntelligencePersistenceReadinessProof(status);
  assert.equal(proof.status, "phase34_shadow_persistence_active");
  assert.equal(proof.score, 70);
  assert.equal(proof.target, 70);
});

test("real LangGraph run persists a final shadow trace without enabling procedural driving", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);

  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use my Aetna portal memory to check eligibility and benefits.",
    rawMessage: { source: "phase34_test", useLiveModel: false }
  });

  assert.equal(result.state.continuous_intelligence.mode, "shadow_only");
  assert.equal(result.state.continuous_intelligence.productionDrivingAllowed, false);
  assert.equal(result.state.continuous_intelligence_persistence.productionDrivingAllowed, false);
  assert.equal(result.state.continuous_intelligence_persistence.pemsTrusted, false);
  assert.ok(result.state.proof.some((item) => item.step === "continuous_intelligence_shadow_persistence"));

  const rows = await store.list("continuous_intelligence_shadow_runs", { session_id: session.id });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].final_response_prepared, 1);
  assert.equal(rows[0].production_driving_allowed, 0);
  assert.equal(rows[0].pems_trusted, 0);
  assert.equal(rows[0].shadow_json.includes("Use my Aetna portal memory"), false);

  const status = await getContinuousIntelligencePersistenceStatus(store);
  assert.equal(status.shadowRunCount, 1);
  assert.equal(status.latestRun.finalResponsePrepared, true);
  assert.equal(status.latestRun.productionDrivingAllowed, false);
  assert.equal(status.latestMaturity.trusted, false);
});
