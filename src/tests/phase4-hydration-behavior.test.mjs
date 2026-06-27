// Phase 4 proof: hydrated capabilities (read back from Redis) concretely change
// the OpenClaw dispatch, and the named Langfuse spans fire. NO live LLM (replay
// decision) and NO mocked DB/context — real SQLite, real context build, real Redis.
// A span-capturing Langfuse client proves span emission deterministically.
// Requires BRAINSTY_REDIS_URL. Run via `npm run test:redis:phase4`.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildContextPacket } from "../concierge/memoryHarness.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { buildRuntimeContextManifest } from "../concierge/runtimeContextCache.mjs";
import { resetLangfuseForTests, setLangfuseClientForTests } from "../observability/langfuseClient.mjs";

await loadLocalEnvOnce();

function capturingLangfuseClient(spans) {
  const span = (args) => {
    if (args?.name) spans.push(args.name);
    return { update() {}, end() {} };
  };
  return {
    __noop: false,
    trace: () => ({ id: "t", traceId: "t", span, generation: () => ({ update() {}, end() {} }), event: () => null, update: () => null, getTraceUrl: () => null }),
    span,
    event: () => null,
    flush: () => null,
    shutdown: () => null,
    async flushAsync() {},
    async shutdownAsync() {}
  };
}

test("Phase 4: hydrated capabilities change the dispatch and named spans fire (real Redis, replay decision)", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required");
  const spans = [];
  setLangfuseClientForTests(capturingLangfuseClient(spans));
  try {
    const dir = await mkdtemp(join(tmpdir(), "brainsty-p4-behavior-"));
    const store = await new SqliteStore(join(dir, "p4b.sqlite")).initialize();
    const { user, session } = await enrollDefaultMember(store);

    // Real context build stores the portfolio to Redis; pick real pointers.
    const context = await buildContextPacket(store, { user, session, channel: session.channel, userInput: "can you check my eligibility and benefits?" });
    const table = context.packet.capabilityPortfolio.promptTable;
    const skillRow = table.find((row) => row.kind === "skill") ?? table[0];
    const selectedCapabilityPointers = [skillRow.pointer, table[0].pointer].filter(Boolean);

    const result = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "can you check my eligibility and benefits?",
      rawMessage: {
        source: "phase4_behavior_test",
        useLiveModel: false,
        llmOrchestrationDecisionReplay: {
          workflow: "eligibility_benefits_navigation",
          intent: "benefits_eligibility",
          confidence: 0.9,
          rationale: "Replay decision for Phase 4 hydration behavior proof.",
          workerGoal: "Read-only eligibility and benefits observation.",
          selectedCapabilityPortfolioIds: [skillRow.portfolioId],
          selectedCapabilityPointers
        }
      }
    });

    // Read-back proven: hydration resolved the selected pointers from Redis.
    const hydration = result.state.hydrated_capabilities;
    assert.ok(hydration, "hydrated_capabilities must be present");
    assert.equal(hydration.cacheBackend, "redis", "hydration must read from redis");
    assert.ok(hydration.resolvedCount >= 1, "at least one selected pointer must hydrate");

    // Behavior change proven: the dispatch toolCall carries the planner-hydrated capabilities.
    const dispatchCall = (result.state.tool_calls ?? []).find((call) => Array.isArray(call.plannerHydratedCapabilities));
    assert.ok(dispatchCall, "a dispatch tool call must exist");
    assert.ok(dispatchCall.plannerHydratedCapabilities.length >= 1, "dispatch must include planner-hydrated capabilities (read-back changed behavior)");
    assert.equal(dispatchCall.plannerCapabilitySource.cacheBackend, "redis");

    // Named spans fired.
    for (const name of ["memory.read", "capability.hydrate", "source_pointer.validation"]) {
      assert.ok(spans.includes(name), `expected Langfuse span "${name}" to fire; got: ${[...new Set(spans)].join(", ")}`);
    }
  } finally {
    resetLangfuseForTests();
  }
});

test("Phase 4 Gap 3: runtime context manifest merges prior checkpoints instead of rebuilding", () => {
  const session = { id: "session_x", langgraph_thread_id: "thread_x" };
  const contextPacket = { generatedAt: "2026-06-27T00:00:00.000Z", workflowArchitecture: { routeCandidates: [] }, request: { userInput: "hi" }, currentSession: {} };
  // managedSession provides only checkpoint B; previous cache has A (older) not in managedSession.
  const managedSession = { checkpoints: [{ checkpoint_id: "ckpt_B", step_name: "planner_decided", created_at: "2026-06-27T00:00:02.000Z", state: { langgraph: { workflow: "claim_status_navigation" } } }] };
  const previous = { manifestHash: "prevhash", achievedCheckpoints: [{ checkpointId: "ckpt_A", stepName: "chat_received", createdAt: "2026-06-27T00:00:01.000Z", workflow: "eligibility_benefits_navigation" }] };

  const manifest = buildRuntimeContextManifest({ session, contextPacket, managedSession, previous });
  const ids = manifest.achievedCheckpoints.map((checkpoint) => checkpoint.checkpointId);
  assert.ok(ids.includes("ckpt_B"), "current checkpoint must be present");
  assert.ok(ids.includes("ckpt_A"), "prior cached checkpoint must be merged in, not lost");
  assert.equal(manifest.mergedFromPreviousCount, 1, "exactly one prior checkpoint merged");
});
