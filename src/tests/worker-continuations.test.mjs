import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
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
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

async function proposalFixture(store) {
  const { user, session } = await enrollDefaultMember(store);
  const proposal = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Do I still owe anything before insurance starts paying?",
    rawMessage: { source: "worker_continuation_test", useLiveModel: false, executeEvidenceObservation: false }
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

test("LangGraph blocks continuation dispatch without official OpenClaw worker flag before consuming approval", async () => {
  const store = await createStore();
  const { user, session, taskId } = await proposalFixture(store);
  const created = await createWorkerContinuation(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    reason: "Continuation requires official worker."
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
      source: "worker_continuation_requires_official_test",
      useLiveModel: false,
      executeEvidenceObservation: true,
      approvalToken: approval.approvalToken,
      approvalTaskId: taskId,
      workerContinuationId: created.continuation.id,
      browserSnapshot: {
        title: "Member Benefits",
        url: "https://health.aetna.com/member/benefits",
        text: "Benefits coverage deductible out-of-pocket claims",
        links: []
      }
    }
  });

  assert.equal(result.state.evidence_observation.status, "blocked_worker_continuation_requires_official_openclaw");
  assert.equal(result.state.approval_resume, null);
  assert.deepEqual(result.state.source_pointers, []);
  const gates = await store.list("approval_gates", { session_id: session.id });
  const details = JSON.parse(gates.at(-1).details);
  assert.equal(details.consumedAt, null);
  const continuation = (await listWorkerContinuations(store, { sessionId: session.id }))[0];
  assert.equal(continuation.status, "pending_async_followup");
});
