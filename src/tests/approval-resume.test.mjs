import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { consumeReadOnlyObservationApproval, createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-approval-resume-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("approval resume blocks expired approvals and preserves no-action state", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const proposalRun = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use my Aetna portal memory to check eligibility and benefits.",
    rawMessage: { source: "test", executeEvidenceObservation: false, useLiveModel: false }
  });
  const approval = await createReadOnlyObservationApproval(store, {
    taskId: proposalRun.state.openclaw_skill_proposal.task.id,
    sessionId: session.id,
    userId: user.id,
    decision: "approved",
    expiresInMinutes: -1
  });

  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use my Aetna portal memory to check eligibility and benefits.",
    rawMessage: {
      source: "test",
      approvalToken: approval.approvalToken,
      approvalTaskId: proposalRun.state.openclaw_skill_proposal.task.id,
      browserSnapshot: {
        title: "Expired Approval Should Not Capture",
        url: "https://health.aetna.com/member/benefits",
        text: "Benefits coverage deductible",
        links: []
      }
    }
  });

  assert.equal(result.state.approval_resume.status, "approval_expired");
  assert.deepEqual(result.state.approval_resume.actionsTaken, []);
  assert.equal(result.state.evidence_observation.status, "approval_expired");
  assert.deepEqual(result.state.evidence_observation.actionsTaken, []);
  assert.equal(result.state.browser_result, null);
  assert.equal((await store.list("eligibility_snapshots", { session_id: session.id })).length, 0);
});

test("orchestrator approval API binds proposal task and enables one read-only graph resume", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-approval-api-"));
  process.env.BRAINSTY_DB_PATH = join(dir, "test.sqlite");
  const { server } = await import("../server/server.mjs");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const member = {
      name: "Approval API Member",
      email: "approval-api@example.com",
      payer: "Aetna",
      portalUrl: "https://www.aetna.com/"
    };
    const proposalResponse = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        member,
        message: "Use my Aetna portal memory to check eligibility and benefits.",
        executeEvidenceObservation: false,
        useLiveModel: false
      })
    });
    const proposalPayload = await proposalResponse.json();
    const taskId = proposalPayload.graphRun.state.openclaw_skill_proposal.task.id;

    const approvalResponse = await fetch(`http://127.0.0.1:${port}/api/orchestrator/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId,
        sessionId: proposalPayload.session.id,
        userId: proposalPayload.user.id,
        approvalScope: "read_only_observation",
        allowedAction: "read_only_observation",
        expiresInMinutes: 15
      })
    });
    const approvalPayload = await approvalResponse.json();
    assert.equal(approvalResponse.status, 200, JSON.stringify(approvalPayload));
    assert.equal(approvalPayload.approval.taskId, taskId);
    assert.equal(approvalPayload.approval.sessionId, proposalPayload.session.id);
    assert.equal(approvalPayload.approval.userId, proposalPayload.user.id);
    assert.equal(approvalPayload.approval.allowedAction, "read_only_observation");
    assert.deepEqual(approvalPayload.approval.actionsTaken, []);
    const approvalEventsResponse = await fetch(
      `http://127.0.0.1:${port}/api/runtime/events?sessionId=${encodeURIComponent(proposalPayload.session.id)}&limit=10`
    );
    const approvalEventsPayload = await approvalEventsResponse.json();
    assert.ok(approvalEventsPayload.events.some((event) => event.eventType === "approval.recorded"));

    const resumeResponse = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        member,
        sessionId: proposalPayload.session.id,
        message: "Use my Aetna portal memory to check eligibility and benefits.",
        approvalToken: approvalPayload.approvalToken,
        approvalTaskId: taskId,
        browserSnapshot: {
          title: "Approved Benefits",
          url: "https://health.aetna.com/member/benefits",
          text: "Benefits coverage deductible out-of-pocket",
          links: []
        },
        useLiveModel: false
      })
    });
    const resumePayload = await resumeResponse.json();
    assert.equal(resumeResponse.status, 200, JSON.stringify(resumePayload));
    assert.equal(resumePayload.graphRun.state.approval_resume.status, "approved_consumed");
    assert.equal(resumePayload.graphRun.state.evidence_observation.status, "captured_visible_page");
    assert.deepEqual(resumePayload.graphRun.state.evidence_observation.actionsTaken, ["read_only_visible_text_extracted"]);
    assert.equal(resumePayload.graphRun.state.source_pointers[0].table, "eligibility_snapshots");
    const resumeEventsResponse = await fetch(
      `http://127.0.0.1:${port}/api/runtime/events?sessionId=${encodeURIComponent(proposalPayload.session.id)}&limit=20`
    );
    const resumeEventsPayload = await resumeEventsResponse.json();
    assert.ok(resumeEventsPayload.events.some((event) => event.eventType === "approval.consumed"));
    assert.ok(
      resumeEventsPayload.events.some(
        (event) => event.eventType === "worker.status.updated" && event.payload.terminalOutcome === "completed_with_sourced_result"
      )
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("approval consumption binds hostile-looking session ids literally", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const proposalRun = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use my Aetna portal memory to check eligibility and benefits.",
    rawMessage: { source: "test", executeEvidenceObservation: false, useLiveModel: false }
  });
  const taskId = proposalRun.state.openclaw_skill_proposal.task.id;
  const approval = await createReadOnlyObservationApproval(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    decision: "approved",
    expiresInMinutes: 15
  });

  const hostile = await consumeReadOnlyObservationApproval(store, {
    approvalToken: approval.approvalToken,
    taskId,
    sessionId: `${session.id}' OR 1=1 --`,
    userId: user.id,
    workflow: "eligibility_benefits_navigation"
  });
  assert.equal(hostile.ok, false);
  assert.equal(hostile.status, "approval_not_found");

  const valid = await consumeReadOnlyObservationApproval(store, {
    approvalToken: approval.approvalToken,
    taskId,
    sessionId: session.id,
    userId: user.id,
    workflow: "eligibility_benefits_navigation"
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.status, "approved_consumed");
});
