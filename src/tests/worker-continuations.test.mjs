import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { listRuntimeEvents } from "../concierge/runtimeEvents.mjs";
import {
  cancelWorkerContinuation,
  consumeWorkerContinuationForApprovedDispatch,
  createWorkerContinuation,
  finalizeWorkerContinuationDispatch,
  listWorkerContinuations,
  requestWorkerContinuation,
  validateWorkerContinuationForDispatch
} from "../concierge/workerContinuations.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-worker-continuations-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  // Decision-first runtime (Phase 84): seed the catalog so allowedWorkflows is non-empty.
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

// Injected recorded planner decision (v1 flat; the normalizer lifts it) — no classifier fallback.
const eligibilityReplay = {
  workflow: "eligibility_benefits_navigation",
  intent: "eligibility_benefits_question",
  confidence: 0.9,
  rationale: "Deterministic replay decision fixture for worker continuations.",
  approvalRequired: true,
  approvalScope: "read_only_observation",
  workerGoal: "Read-only benefits observation worker goal."
};

async function proposalFixture(store) {
  const { user, session } = await enrollDefaultMember(store);
  const proposal = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Do I still owe anything before insurance starts paying?",
    rawMessage: {
      source: "worker_continuation_test",
      useLiveModel: false,
      executeEvidenceObservation: false,
      llmOrchestrationDecisionReplay: eligibilityReplay
    }
  });
  return { user, session, proposal, taskId: proposal.state.openclaw_skill_proposal.task.id };
}

test("worker continuation persists async follow-up with task/session/user/scope binding", async () => {
  const store = await createStore();
  const { user, session, proposal, taskId } = await proposalFixture(store);
  const result = await createWorkerContinuation(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    correlationId: proposal.state.graph_trace_id,
    reason: "Worker needs a longer read-only portal check.",
    reportEverySeconds: 30
  });

  assert.equal(result.ok, true);
  assert.equal(result.continuation.taskId, taskId);
  assert.equal(result.continuation.sessionId, session.id);
  assert.equal(result.continuation.userId, user.id);
  assert.equal(result.continuation.workflow, "eligibility_benefits_navigation");
  assert.equal(result.continuation.approvalScope, "read_only_observation");
  assert.equal(result.continuation.allowedAction, "read_only_observation");
  assert.equal(result.continuation.terminalOutcome, "needs_long_running_followup");
  assert.deepEqual(result.continuation.actionsTaken, []);
  assert.equal(result.scheduledJob.job_type, "worker_async_followup_status_check");
  assert.equal(result.scheduledJob.approval_status, "read_only_scope_bound");

  const rows = await listWorkerContinuations(store, { sessionId: session.id });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, result.continuation.id);

  const events = await listRuntimeEvents(store, { sessionId: session.id, limit: 20 });
  assert.ok(events.some((event) => event.eventType === "worker.followup.scheduled"));

  const task = await store.findOne("agent_tasks", { id: taskId });
  assert.equal(task.status, "async_followup_pending");
  const audit = await store.findOne("audit_events", { event_type: "worker_async_followup_scheduled" });
  assert.ok(audit);
});

test("worker continuation listing binds hostile-looking filters literally", async () => {
  const store = await createStore();
  const { user, session, proposal, taskId } = await proposalFixture(store);
  const created = await createWorkerContinuation(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    correlationId: `${proposal.state.graph_trace_id}' OR 1=1 --`,
    reason: "Worker needs a longer read-only portal check."
  });

  const hostileSession = await listWorkerContinuations(store, {
    sessionId: `${session.id}' OR 1=1 --`,
    limit: "1 OR 1=1"
  });
  const hostileStatus = await listWorkerContinuations(store, {
    userId: user.id,
    status: "pending_async_followup' OR 1=1 --"
  });
  const valid = await listWorkerContinuations(store, { sessionId: session.id, userId: user.id });

  assert.equal(hostileSession.length, 0);
  assert.equal(hostileStatus.length, 0);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].id, created.continuation.id);
});

test("worker continuation can request status continuation and then cancel without worker actions", async () => {
  const store = await createStore();
  const { user, session, taskId } = await proposalFixture(store);
  const created = await createWorkerContinuation(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    reason: "Worker may take longer."
  });

  const continued = await requestWorkerContinuation(store, {
    continuationId: created.continuation.id,
    sessionId: session.id,
    userId: user.id
  });
  assert.equal(continued.ok, true);
  assert.equal(continued.status, "continue_requested");
  assert.deepEqual(continued.actionsTaken, []);

  const cancelled = await cancelWorkerContinuation(store, {
    continuationId: created.continuation.id,
    sessionId: session.id,
    userId: user.id,
    reason: "User stopped waiting."
  });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.continuation.terminalOutcome, "not_possible_policy_or_approval_block");
  assert.deepEqual(cancelled.actionsTaken, []);

  const events = await listRuntimeEvents(store, { sessionId: session.id, limit: 30 });
  assert.ok(events.some((event) => event.eventType === "worker.followup.continue_requested"));
  assert.ok(events.some((event) => event.eventType === "worker.followup.cancelled"));
});

test("worker continuation rejects non-read-only scopes", async () => {
  const store = await createStore();
  const { user, session, taskId } = await proposalFixture(store);
  const result = await createWorkerContinuation(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    approvalScope: "payer_contact",
    allowedAction: "send_external_message"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "unsupported_action_scope");
  assert.deepEqual(result.actionsTaken, []);
  assert.equal((await listWorkerContinuations(store, { sessionId: session.id })).length, 0);
});

test("worker continuation consumes approved dispatch and finalizes official read-only result", async () => {
  const store = await createStore();
  const { user, session, taskId } = await proposalFixture(store);
  const created = await createWorkerContinuation(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    reason: "Run official worker when approved."
  });

  const ready = await validateWorkerContinuationForDispatch(store, {
    continuationId: created.continuation.id,
    sessionId: session.id,
    userId: user.id,
    taskId,
    workflow: "eligibility_benefits_navigation"
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.status, "ready_for_approved_dispatch");

  const dispatching = await consumeWorkerContinuationForApprovedDispatch(store, {
    continuationId: created.continuation.id,
    sessionId: session.id,
    userId: user.id,
    taskId,
    workflow: "eligibility_benefits_navigation",
    approvalGateId: "gate_test"
  });
  assert.equal(dispatching.ok, true);
  assert.equal(dispatching.status, "dispatching_official_openclaw");
  assert.equal(dispatching.continuation.metadata.runtime, "official_openclaw");
  assert.deepEqual(dispatching.actionsTaken, []);

  const finalized = await finalizeWorkerContinuationDispatch(store, {
    continuationId: created.continuation.id,
    sessionId: session.id,
    userId: user.id,
    resultStatus: "captured_official_openclaw_read_only_observation",
    terminalOutcome: "completed_with_sourced_result",
    browserRunId: "browser_test",
    sourcePointerCount: 2,
    structuredBenefitCount: 1,
    actionsTaken: ["openclaw_browser_start", "openclaw_browser_snapshot_aria", "verify_authenticated_member_portal"]
  });
  assert.equal(finalized.ok, true);
  assert.equal(finalized.status, "completed");
  assert.equal(finalized.continuation.terminalOutcome, "completed_with_sourced_result");
  assert.deepEqual(finalized.continuation.actionsTaken, [
    "openclaw_browser_start",
    "openclaw_browser_snapshot_aria",
    "verify_authenticated_member_portal"
  ]);

  const rows = await listWorkerContinuations(store, { sessionId: session.id });
  assert.equal(rows[0].status, "completed");
  assert.equal(rows[0].metadata.sourcePointerCount, 2);
  const task = await store.findOne("agent_tasks", { id: taskId });
  assert.equal(task.status, "official_worker_completed");
  const events = await listRuntimeEvents(store, { sessionId: session.id, limit: 40 });
  assert.ok(events.some((event) => event.eventType === "worker.followup.dispatching"));
  assert.ok(events.some((event) => event.eventType === "worker.followup.completed"));
});

test("worker continuation treats partial sourced results as completed with blockers", async () => {
  const store = await createStore();
  const { user, session, taskId } = await proposalFixture(store);
  const created = await createWorkerContinuation(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    reason: "Run official worker when approved."
  });
  await consumeWorkerContinuationForApprovedDispatch(store, {
    continuationId: created.continuation.id,
    sessionId: session.id,
    userId: user.id,
    taskId,
    workflow: "eligibility_benefits_navigation",
    approvalGateId: "gate_partial"
  });

  const finalized = await finalizeWorkerContinuationDispatch(store, {
    continuationId: created.continuation.id,
    sessionId: session.id,
    userId: user.id,
    resultStatus: "captured_official_openclaw_multi_page_read_only_observation",
    terminalOutcome: "partial_result_with_blockers",
    reason: "Some optional portal pages were blocked, but verified source pointers were created.",
    browserRunId: "browser_partial",
    sourcePointerCount: 1,
    structuredBenefitCount: 1,
    actionsTaken: ["openclaw_browser_start", "record_verified_source_pointer"]
  });

  assert.equal(finalized.ok, true);
  assert.equal(finalized.status, "completed");
  assert.equal(finalized.continuation.terminalOutcome, "partial_result_with_blockers");
  const task = await store.findOne("agent_tasks", { id: taskId });
  assert.equal(task.status, "official_worker_completed");
  const events = await listRuntimeEvents(store, { sessionId: session.id, limit: 40 });
  assert.ok(events.some((event) => event.eventType === "worker.followup.completed"));
});

// Phase 87 (§7): the flag veto is DELETED — a bound ACTIVE continuation is SUFFICIENT
// on its own. A "continue" turn carrying only workerContinuationId (no planner
// openclaw selection, NO client flag) validates via validateWorkerContinuationForDispatch
// and DISPATCHES instead of being silently stranded.
test("LangGraph dispatches a bound continuation with NO client flag (continuation-resume arm)", async () => {
  const store = await createStore();
  const { user, session, taskId } = await proposalFixture(store);
  const created = await createWorkerContinuation(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    reason: "Continuation resumes without any client flag."
  });
  const approval = await createReadOnlyObservationApproval(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    decision: "approved",
    expiresInMinutes: 15
  });

  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Do I still owe anything before insurance starts paying?",
    rawMessage: {
      source: "worker_continuation_no_flag_test",
      useLiveModel: false,
      // NO executeEvidenceObservation, NO legacy worker flag — the continuation is the trigger.
      llmOrchestrationDecisionReplay: eligibilityReplay,
      approvalToken: approval.approvalToken,
      approvalTaskId: taskId,
      workerContinuationId: created.continuation.id
    }
  });

  const status = result.state.evidence_observation?.status ?? "";
  assert.notEqual(status, "blocked_worker_continuation_requires_official_openclaw", "the deleted flag must not strand the resume");
  assert.ok(result.state.evidence_observation, "evidence node must run on the continuation trigger");
  // The continuation VALIDATED and the dispatch path was entered (no live portal in
  // this hermetic arm, so the observation reports a classified non-stranded status).
  assert.ok(!/requires_official_openclaw/.test(status), `continuation must not require the deleted flag; got ${status}`);
});
