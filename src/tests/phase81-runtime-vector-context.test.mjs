import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildLlmOrchestrationDecisionMessages } from "../concierge/llmOrchestrationDecision.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { loadRuntimeVectorIndex, runtimeVectorIndexKey } from "../concierge/runtimeVectorIndex.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-phase81-vector-context-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("Phase 81 vector context retrieves pharmacy capability pointers for medication copay questions", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "What is my copayment for Wegovy medication?",
    rawMessage: { source: "phase81_medication_vector", useLiveModel: false, executeEvidenceObservation: false }
  });
  const vector = result.state.context_packet.runtimeVectorIndex;

  assert.equal(vector.cacheKey, runtimeVectorIndexKey(session.id));
  assert.equal(vector.method, "deterministic_lexical_term_vector");
  assert.ok(vector.topMatches.some((match) => match.pointer.includes("workflow:pharmacy_formulary")));
  assert.ok(vector.topMatches.some((match) => match.kind === "capability_portfolio"));

  const hydrated = await loadRuntimeVectorIndex(session.id);
  assert.equal(hydrated.status, "ok");
  assert.ok(hydrated.index.docs.some((doc) => doc.docId === "portfolio:workflow:pharmacy_formulary"));
});

test("Phase 81 vector context retrieves claim workflow pointers for claim questions", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "What about my claim and EOB?",
    rawMessage: { source: "phase81_claim_vector", useLiveModel: false, executeEvidenceObservation: false }
  });

  assert.ok(result.state.context_packet.runtimeVectorIndex.topMatches.some((match) => match.pointer.includes("workflow:claim_status_navigation")));
});

test("Phase 81 planner payload receives vector matches as pointers and hashes only", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Can you compare a medication copay with my claims?",
    rawMessage: { source: "phase81_payload_vector", useLiveModel: false, executeEvidenceObservation: false }
  });
  const messages = buildLlmOrchestrationDecisionMessages(result.state);
  const payload = JSON.parse(messages.find((message) => message.role === "user").content);
  const serialized = JSON.stringify(payload.runtimeVectorContext);

  assert.equal(payload.runtimeVectorContext.cacheKey, runtimeVectorIndexKey(session.id));
  assert.ok(payload.runtimeVectorContext.topMatches.length > 0);
  assert.ok(payload.runtimeVectorContext.topMatches.every((match) => match.pointer && match.textHash));
  assert.equal(serialized.includes("What is my"), false);
  assert.equal(serialized.includes("Can you compare"), false);
});
