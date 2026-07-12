import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { runConciergeSlice } from "../concierge/langgraphCompatibility.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { getMemoryContextForUser } from "../concierge/memoryHarness.mjs";
import {
  buildRuntimeCompatibilityBundle,
  MEMORY_LAYER_AUTHORITY,
  toGraphitiRetainCandidates,
  toLangChainConfig,
  toLangGraphAgentState,
  toOpenClawChannelEnvelope,
  toOpenClawHeartbeatEnvelope,
  validateRuntimeCompatibility
} from "../concierge/runtimeAdapters.mjs";

async function testStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-runtime-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  // Decision-first runtime (Phase 84): seed the catalog so allowedWorkflows is non-empty.
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

// Injected recorded planner decision (v1 flat; spreads into rawMessage via runConciergeSlice).
const eligibilityReplay = {
  workflow: "eligibility_benefits_navigation",
  intent: "eligibility_benefits_question",
  confidence: 0.9,
  rationale: "Deterministic replay decision fixture for runtime adapters.",
  approvalRequired: true,
  approvalScope: "read_only_observation",
  workerGoal: "Read-only benefits observation worker goal."
};

test("runtime adapters map context packet to LangChain and LangGraph shapes", async () => {
  const store = await testStore();
  const result = await runConciergeSlice(store, {
    message: "Use the already open Aetna Chrome tab to review my benefits.",
    llmOrchestrationDecisionReplay: eligibilityReplay,
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
  assert.equal(channelEnvelope.memory_authority.longTermProductMemory.runtime, "zep_graphiti");
  assert.equal(channelEnvelope.memory_authority.longTermProductMemory.owner, "langgraph");
  assert.equal(channelEnvelope.memory_authority.workflowMemory.runtime, "langgraph_checkpointer_and_database");
  assert.equal(channelEnvelope.memory_authority.workerMemory.productMemoryWriteAuthority, false);
  assert.equal(heartbeatEnvelope.envelope_type, "openclaw_heartbeat");
  assert.equal(heartbeatEnvelope.action_mode, "inspect_and_propose_only");
  assert.equal(heartbeatEnvelope.instance.status, "always_on_local_harness");
});

test("runtime bundle exposes Graphiti retain candidates under LangGraph authority", async () => {
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
  const candidates = toGraphitiRetainCandidates(context.packet);
  const bundle = buildRuntimeCompatibilityBundle(context.packet, { source: "test" });

  assert.ok(candidates.length >= 1);
  assert.ok(candidates.every((candidate) => candidate.user_id === result.user.id));
  assert.ok(candidates.every((candidate) => candidate.adapter === "graphiti"));
  assert.ok(candidates.every((candidate) => candidate.provider === "zep_graphiti"));
  assert.ok(candidates.every((candidate) => candidate.owner === "langgraph"));
  assert.ok(candidates.every((candidate) => candidate.metadata.source_table));
  assert.equal(bundle.validation.compatible, true);
  assert.equal(bundle.graphiti.retainCandidates.length, candidates.length);
  assert.equal(bundle.graphiti.owner, "langgraph");
  assert.equal(bundle.memoryAuthority, MEMORY_LAYER_AUTHORITY);
  assert.equal("hindsight" in bundle, false);
});
