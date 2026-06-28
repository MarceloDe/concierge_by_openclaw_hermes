// Regression for the screenshot bug: when the planner wants to offer a process, the
// Type-II offer must fire EVEN IF the session carries tangential source_pointers
// (previously gated out by source_pointers===0). Locks the broadened-guard predicate.
import test from "node:test";
import assert from "node:assert/strict";
import { plannerWantsProcessOffer } from "../concierge/langgraphRunner.mjs";

test("plannerWantsProcessOffer: true when the planner decides to offer / cannot answer", () => {
  assert.equal(plannerWantsProcessOffer({ responseStrategy: "offer_process_and_ask" }), true);
  assert.equal(plannerWantsProcessOffer({ responseStrategy: "honest_capability_decline" }), true);
  assert.equal(plannerWantsProcessOffer({ capabilityAssessment: { canAnswerNow: false } }), true);
  assert.equal(plannerWantsProcessOffer({ offeredProcessIds: ["process:portal_readonly_lookup"] }), true);
  assert.equal(plannerWantsProcessOffer({ recommendedProcessId: "process:portal_readonly_lookup" }), true);
});

test("plannerWantsProcessOffer: false for a genuine evidence-grounded answer", () => {
  assert.equal(plannerWantsProcessOffer({ responseStrategy: "answer_from_evidence", capabilityAssessment: { canAnswerNow: true }, offeredProcessIds: [] }), false);
  assert.equal(plannerWantsProcessOffer(null), false);
  assert.equal(plannerWantsProcessOffer(undefined), false);
});
