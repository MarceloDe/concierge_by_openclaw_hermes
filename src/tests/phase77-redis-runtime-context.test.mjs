import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildLlmOrchestrationDecisionMessages } from "../concierge/llmOrchestrationDecision.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import {
  RUNTIME_CONTEXT_CACHE_VERSION,
  createRuntimeContextCache,
  loadRuntimeContextForSession,
  runtimeContextKey
} from "../concierge/runtimeContextCache.mjs";

// Hermetic precondition: this suite verifies the no-Redis in-memory fallback path.
// Pin it explicitly so it is independent of ambient .env.local (which now sets
// BRAINSTY_REDIS_URL for the running app). Empty (defined) values keep
// loadLocalEnvOnce from repopulating them.
process.env.BRAINSTY_REDIS_URL = "";
process.env.REDIS_URL = "";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-phase77-runtime-context-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("Phase 77 runtime context cache defaults to a fast in-memory adapter when Redis is not configured", () => {
  const cache = createRuntimeContextCache({ env: {} });

  assert.equal(cache.version, RUNTIME_CONTEXT_CACHE_VERSION);
  assert.equal(cache.backend, "memory");
  assert.equal(cache.urlHash, null);
});

test("Phase 77 injects achieved checkpoint pointers into the next chat context", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const first = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Please help me understand my Aetna benefits.",
    rawMessage: { source: "phase77_first_chat", useLiveModel: false, executeEvidenceObservation: false }
  });

  assert.equal(first.state.runtime_context_cache.stored, true);
  assert.equal(first.state.runtime_context_cache.backend, "memory");
  assert.ok(first.state.runtime_context_cache.checkpointId);

  const second = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "What about my claim now?",
    rawMessage: { source: "phase77_second_chat", useLiveModel: false, executeEvidenceObservation: false }
  });
  const runtimeContext = second.state.context_packet.runtimeContext;

  assert.equal(runtimeContext.cacheBackend, "memory");
  assert.equal(runtimeContext.cacheStatus, "hit");
  assert.equal(runtimeContext.cacheKey, runtimeContextKey(session.id));
  assert.ok(runtimeContext.achievedCheckpoints.length >= 1);
  assert.ok(runtimeContext.priorDecisionPointers.some((pointer) => pointer.workflow));
  assert.equal(runtimeContext.promptCompaction.strategy, "short_pointer_manifest_with_hydratable_cache_payload");
  assert.equal(typeof runtimeContext.promptCompaction.userInputHash, "string");
  assert.equal("compactUserInput" in runtimeContext.promptCompaction, false);
  assert.equal(second.state.runtime_context_cache.stored, true);
});

test("Phase 77 planner payload receives checkpoint pointers without raw prior chat text", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "My secret prior note says Blue code 777 but just check benefits.",
    rawMessage: { source: "phase77_sensitive_prior_chat", useLiveModel: false, executeEvidenceObservation: false }
  });
  const second = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "What about my claim?",
    rawMessage: { source: "phase77_payload_chat", useLiveModel: false, executeEvidenceObservation: false }
  });
  const messages = buildLlmOrchestrationDecisionMessages(second.state);
  const payload = JSON.parse(messages.find((message) => message.role === "user").content);
  const serialized = JSON.stringify(payload.runtimeContext);

  assert.equal(payload.runtimeContext.cacheKey, runtimeContextKey(session.id));
  assert.ok(payload.runtimeContext.achievedCheckpoints.length >= 1);
  assert.doesNotMatch(serialized, /Blue code 777/);
  assert.doesNotMatch(serialized, /secret prior note/i);

  const runtimeLoad = await loadRuntimeContextForSession(session);
  assert.equal(runtimeLoad.status, "hit");
  assert.ok(runtimeLoad.previous.achievedCheckpoints.length >= 1);
});
