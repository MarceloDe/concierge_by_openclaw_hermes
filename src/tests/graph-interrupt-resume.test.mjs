import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import {
  getBrainstyLangGraphCheckpointState,
  runLangGraphOrchestration
} from "../concierge/langgraphRunner.mjs";
import { FileBackedMemorySaver } from "../concierge/graphCheckpointer.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-hitl-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

// Phase 84: routing is decision-first — the run is driven by a replayed planner
// decision (the classifier fallback is deleted). The interrupt payload string and
// approval_pending_interrupt outcome stay byte-compatible (plan §4.3/Phase 88 arm).
const PORTAL_DECISION_REPLAY = {
  workflow: "payer_portal_read_only_extraction",
  intent: "deductible_balance_lookup",
  confidence: 0.9,
  rationale: "The user asked for their live deductible balance behind the portal.",
  requiredEvidence: ["authenticated_portal_page"],
  missingEvidence: ["authenticated_portal_page"],
  approvalRequired: true,
  approvalScope: "read_only_observation",
  workerGoal: "Observe the deductible balance on the authenticated Aetna portal (read-only).",
  responseStrategy: "offer_process_and_ask",
  userFacingNextQuestion: ""
};

test("LangGraph native interrupt pauses read-only observation until an approved token resumes it", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const message = "Use my Aetna portal to check whether my deductible has remaining balance.";

  const proposalRun = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: message,
    rawMessage: { source: "phase55_hitl", useLiveModel: false, executeEvidenceObservation: false, llmOrchestrationDecisionReplay: PORTAL_DECISION_REPLAY }
  });
  const taskId = proposalRun.state.openclaw_skill_proposal.task.id;

  const pausedRun = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: message,
    rawMessage: {
      source: "phase55_hitl",
      useLiveModel: false,
      approvalTaskId: taskId,
      llmOrchestrationDecisionReplay: PORTAL_DECISION_REPLAY,
      browserSnapshot: {
        title: "Should Pause Before Capture",
        url: "https://health.aetna.com/member/benefits",
        text: "Benefits coverage deductible",
        links: []
      }
    }
  });

  assert.equal(pausedRun.state.approval_interrupt.status, "interrupted");
  assert.equal(pausedRun.state.workflow_outcome, "approval_pending_interrupt");
  assert.equal(pausedRun.state.evidence_observation.status, "missing_approval_token");
  assert.equal(pausedRun.state.evidence_observation.nativeLangGraphInterrupt, true);
  assert.equal(pausedRun.state.browser_result, null);
  assert.deepEqual(pausedRun.state.source_pointers, []);
  const checkpoint = await getBrainstyLangGraphCheckpointState({ threadId: session.langgraph_thread_id });
  assert.ok(checkpoint.tasks.some((task) => task.interrupts?.length));

  const approval = await createReadOnlyObservationApproval(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    decision: "approved",
    expiresInMinutes: 15
  });

  const resumedRun = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: message,
    rawMessage: {
      source: "phase55_hitl",
      useLiveModel: false,
      approvalToken: approval.approvalToken,
      approvalTaskId: taskId,
      browserSnapshot: {
        title: "Approved Member Benefits",
        url: "https://health.aetna.com/member/benefits",
        text: "Benefits coverage Deductible $600 $558.72 Spent $41.28 Remaining",
        links: []
      }
    }
  });

  assert.equal(resumedRun.state.approval_interrupt.status, "resumed");
  assert.equal(resumedRun.state.approval_resume.status, "approved_consumed");
  assert.equal(resumedRun.state.evidence_observation.status, "captured_visible_page");
  assert.equal(resumedRun.state.source_pointers[0].table, "eligibility_snapshots");
  assert.equal((await store.list("eligibility_snapshots", { session_id: session.id })).length, 1);
});

test("file-backed checkpointer restores an interrupted LangGraph thread for Command resume", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-checkpointer-"));
  const checkpointPath = join(dir, "checkpoints.json");
  const encryptionKey = Buffer.from("phase56-test-key-phase56-test-key").subarray(0, 32);
  const ToyState = Annotation.Root({
    value: Annotation({
      reducer: (_, value) => value,
      default: () => null
    })
  });
  const buildToyGraph = (checkpointer) =>
    new StateGraph(ToyState)
      .addNode("pause", () => {
        const resumed = interrupt({ type: "toy_approval" });
        return { value: resumed };
      })
      .addEdge(START, "pause")
      .addEdge("pause", END)
      .compile({ checkpointer });

  const config = { configurable: { thread_id: "phase55-thread", checkpoint_ns: "phase55" } };
  const first = buildToyGraph(new FileBackedMemorySaver({ path: checkpointPath, encryptionKey }));
  const paused = await first.invoke({ value: "initial" }, config);
  assert.ok(paused.__interrupt__);

  const rawCheckpoint = await readFile(checkpointPath, "utf8");
  assert.match(rawCheckpoint, /"encrypted": true/);
  assert.match(rawCheckpoint, /"cipher": "aes-256-gcm"/);
  assert.doesNotMatch(rawCheckpoint, /initial|toy_approval|approved-token/);

  const second = buildToyGraph(new FileBackedMemorySaver({ path: checkpointPath, encryptionKey }));
  const resumed = await second.invoke(new Command({ resume: "approved-token" }), config);
  assert.equal(resumed.value, "approved-token");

  const finalCheckpoint = await readFile(checkpointPath, "utf8");
  assert.doesNotMatch(finalCheckpoint, /approved-token/);
});
