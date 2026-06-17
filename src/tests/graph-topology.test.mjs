import test from "node:test";
import assert from "node:assert/strict";
import { describeBrainstyLangGraphTopology, routeAfterEvidenceObservation, routeAfterInputPolicy, routeAfterWorkflowRouter } from "../concierge/langgraphRunner.mjs";

test("LangGraph topology exposes conditional routing boundaries", () => {
  const topology = describeBrainstyLangGraphTopology();
  const conditionalFrom = topology.conditionalEdges.map((edge) => edge.from);
  assert.ok(conditionalFrom.includes("input_policy"));
  assert.ok(conditionalFrom.includes("workflow_router"));
  assert.ok(topology.conditionalEdges.some((edge) => edge.proves.includes("urgent_handoff")));
  assert.ok(topology.conditionalEdges.some((edge) => edge.proves.includes("journey_execution")));
  assert.ok(topology.conditionalEdges.some((edge) => edge.proves.includes("approval_pending")));
  assert.ok(topology.conditionalEdges.some((edge) => edge.proves.includes("evidence_blocked")));
  assert.ok(topology.conditionalEdges.some((edge) => edge.proves.includes("evidence_found")));
  assert.ok(topology.conditionalEdges.some((edge) => edge.proves.includes("answer_composition")));
  assert.notEqual(topology.finalResponseBranchingMechanism, "linear_final_response_short_circuit_only");
});

test("conditional edge guards route policy blocks and normal requests differently", () => {
  assert.equal(routeAfterInputPolicy({ policy_result: { allowed: false } }), "workflow_router");
  assert.equal(routeAfterInputPolicy({ policy_result: { allowed: true, urgentEscalationRequired: true } }), "workflow_router");
  assert.equal(routeAfterInputPolicy({ policy_result: { allowed: true } }), "recall_context");
  assert.equal(routeAfterWorkflowRouter({ policy_result: { allowed: false }, final_response: null }), "compose_response");
  assert.equal(routeAfterWorkflowRouter({ policy_result: { urgentEscalationRequired: true }, final_response: null }), "compose_response");
  assert.equal(routeAfterWorkflowRouter({ final_response: "blocked" }), "compose_response");
  assert.equal(routeAfterWorkflowRouter({ final_response: null }), "skill_resolver");
  assert.equal(routeAfterEvidenceObservation({ evidence_observation: { status: "blocked_no_authenticated_evidence" } }), "compose_response");
});
