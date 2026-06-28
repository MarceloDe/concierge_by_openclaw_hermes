// GATE (LLM output index): an indexed output is pointer-addressable in REAL Redis, hydrates
// cross-turn, and is USED by the planner (surfaced into the decision payload so it can be
// cited via priorLlmOutputPointersUsed). No mocks.
import test from "node:test";
import assert from "node:assert/strict";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { createId } from "../concierge/database.mjs";
import { indexLlmOutput, loadLlmOutputIndex, llmOutputIndexKey } from "../concierge/llmOutputIndex.mjs";
import { createRuntimeContextCache } from "../concierge/runtimeContextCache.mjs";
import { buildLlmOrchestrationDecisionPayload } from "../concierge/llmOrchestrationDecision.mjs";

await loadLocalEnvOnce();
const URL = process.env.BRAINSTY_REDIS_URL;

test("GATE LLM output index: real-Redis, cross-turn hydrate, used by the planner payload", { skip: URL ? false : "BRAINSTY_REDIS_URL required" }, async () => {
  const sid = createId("llmidx");
  // TURN 1: index a real LLM output (pointer-addressable in Redis).
  const w = await indexLlmOutput({ sessionId: sid, step: "llm_orchestration_decision", model: "gpt-4.1", mode: "openai_chatopenai_invoked", content: '{"workflow":"eligibility_benefits_navigation","confidence":0.9}', parsed: { workflow: "eligibility_benefits_navigation" } });
  assert.equal(w.ok, true);
  const writer = createRuntimeContextCache();
  assert.equal(writer.backend, "redis", "real Redis backend");
  assert.ok(await writer.adapter.get(llmOutputIndexKey(sid)), "index physically present in Redis");

  // TURN 2 (fresh cache = next turn): hydrate the index from Redis.
  const idx = await loadLlmOutputIndex(sid);
  assert.ok(idx.entries.length >= 1, "cross-turn hydrate");
  const entry = idx.entries[0];
  assert.equal(entry.model, "gpt-4.1");
  assert.ok(entry.pointer?.startsWith(llmOutputIndexKey(sid) + "#"), "entry is pointer-addressable");

  // BEHAVIOR: the hydrated index is surfaced into the planner decision payload
  // (so the planner can consult/cite prior outputs via priorLlmOutputPointersUsed).
  const payload = buildLlmOrchestrationDecisionPayload({
    user_input: "follow-up question",
    context_packet: { llmOutputIndex: { ...idx, cacheBackend: "redis", cacheKey: llmOutputIndexKey(sid), status: "hit", latestOutputId: entry.outputId } }
  });
  assert.ok(payload.llmOutputIndex, "llm output index reaches the planner payload");
  assert.ok(payload.llmOutputIndex.entries.some((e) => e.outputId === entry.outputId), "the indexed output is consultable by the planner");
  assert.ok(payload.expectedJsonShape.priorLlmOutputPointersUsed, "contract lets the planner cite consulted output pointers");
});
