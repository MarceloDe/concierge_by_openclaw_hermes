import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { runConciergeSlice } from "../concierge/langgraphCompatibility.mjs";
import { getMemoryContextForUser } from "../concierge/memoryHarness.mjs";
import {
  buildRuntimeCompatibilityBundle,
  toHindsightRetainCandidates,
  toLangChainConfig,
  toLangGraphAgentState,
  toOpenClawChannelEnvelope,
  toOpenClawHeartbeatEnvelope,
  validateRuntimeCompatibility
} from "../concierge/runtimeAdapters.mjs";

async function testStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-runtime-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("runtime adapters map context packet to LangChain and LangGraph shapes", async () => {
  const store = await testStore();
  const result = await runConciergeSlice(store, {
    message: "Use the already open Aetna Chrome tab to review my benefits.",
    browserSnapshot: {
      title: "Home - Aetna",
      url: "https://health.aetna.com/",
      text: "Welcome, Marcelo Benefits Deductible $600 Claims",
      links: []
    }
  });
  const context = await getMemoryContextForUser(store, {
    email: "mocfelix@gmail.com",
    sessionId: result.session.id
  });
  const config = toLangChainConfig(context.packet);
  const state = toLangGraphAgentState(context.packet, { source: "test" });
  const validation = validateRuntimeCompatibility(context.packet);

  assert.equal(config.configurable.thread_id, result.session.langgraph_thread_id);
  assert.equal(config.configurable.checkpoint_ns, "brainstyworkers");
  assert.equal(state.user_id, result.user.id);
  assert.equal(state.session_id, result.session.id);
  assert.equal(state.langchain_config.configurable.thread_id, result.session.langgraph_thread_id);
  assert.match(state.memory_context, /untrusted context/);
  assert.ok(state.case_metadata.db_pointers.length >= 1);
  assert.equal(validation.compatible, true);
});

test("runtime adapters map context packet to OpenClaw envelopes", async () => {
  const store = await testStore();
  const result = await runConciergeSlice(store, {
    message: "Review my Aetna claims from this portal page.",
    browserSnapshot: {
      title: "Claims - Aetna",
      url: "https://health.aetna.com/manage/claims",
      text: "Welcome, Marcelo Claims Private Apr 14, 2026",
      links: []
    }
  });
  const context = await getMemoryContextForUser(store, {
    email: "mocfelix@gmail.com",
    sessionId: result.session.id
  });
  const channelEnvelope = toOpenClawChannelEnvelope(context.packet, { source: "test" });
  const heartbeatEnvelope = toOpenClawHeartbeatEnvelope(context.packet);

  assert.equal(channelEnvelope.envelope_type, "openclaw_channel_task");
  assert.equal(channelEnvelope.session_id, result.session.id);
  assert.equal(channelEnvelope.approval_policy.credential_entry, "user_only");
  assert.ok(channelEnvelope.allowed_tasks.includes("extract_observations_with_source_pointers"));
  assert.ok(channelEnvelope.allowed_tasks.includes("decompose_delegated_task_into_subtasks"));
  assert.ok(channelEnvelope.allowed_tasks.includes("run_task_scoped_status_subagent"));
  assert.ok(Array.isArray(channelEnvelope.prior_sessions));
  assert.ok("product_memory" in channelEnvelope);
  assert.equal(heartbeatEnvelope.envelope_type, "openclaw_heartbeat");
  assert.equal(heartbeatEnvelope.action_mode, "inspect_and_propose_only");
  assert.equal(heartbeatEnvelope.instance.status, "always_on_local_harness");
});

test("runtime bundle includes future Hindsight retain candidates without calling Hindsight", async () => {
  const store = await testStore();
  const result = await runConciergeSlice(store, {
    message: "Prepare my Aetna memory for future sessions.",
    browserSnapshot: {
      title: "Home - Aetna",
      url: "https://health.aetna.com/",
      text: "Welcome, Marcelo Benefits Claims",
      links: []
    }
  });
  const context = await getMemoryContextForUser(store, {
    email: "mocfelix@gmail.com",
    sessionId: result.session.id
  });
  const candidates = toHindsightRetainCandidates(context.packet);
  const bundle = buildRuntimeCompatibilityBundle(context.packet, { source: "test" });

  assert.ok(candidates.length >= 1);
  assert.ok(candidates.every((candidate) => candidate.user_id === result.user.id));
  assert.ok(candidates.every((candidate) => candidate.metadata.source_table));
  assert.equal(bundle.validation.compatible, true);
  assert.equal(bundle.hindsight.retainCandidates.length, candidates.length);
});
