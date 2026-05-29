import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { ORCHESTRATOR_FLOW_CASES, runOrchestratorFlowCases } from "../concierge/orchestratorDemo.mjs";
import {
  createRuntimeHookSubscription,
  listRuntimeEvents,
  publishRuntimeEvent,
  registerRuntimeCodeHook
} from "../concierge/runtimeEvents.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-runtime-events-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("runtime event bus records events and in-process code hooks", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const seen = [];
  const unregister = registerRuntimeCodeHook("worker.status", (event) => {
    seen.push(event);
  });
  try {
    const event = await publishRuntimeEvent(store, {
      userId: user.id,
      sessionId: session.id,
      source: "test",
      eventType: "worker.status",
      correlationId: "corr_test",
      payload: { currentSubtask: "read portal", status: "working" }
    });

    assert.equal(event.eventType, "worker.status");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].payload.currentSubtask, "read portal");

    const events = await listRuntimeEvents(store, { sessionId: session.id });
    assert.equal(events[0].eventType, "worker.status");
    assert.equal(events[0].payload.status, "working");
  } finally {
    unregister();
  }
});

test("webhook subscriptions are dry-run blocked unless explicitly enabled", async () => {
  const previous = process.env.BRAINSTY_ENABLE_OUTBOUND_WEBHOOKS;
  delete process.env.BRAINSTY_ENABLE_OUTBOUND_WEBHOOKS;
  try {
    const store = await createStore();
    const { user, session } = await enrollDefaultMember(store);
    const subscription = await createRuntimeHookSubscription(store, {
      userId: user.id,
      sessionId: session.id,
      eventType: "workflow.routed",
      targetType: "webhook",
      targetUrl: "https://example.invalid/hook"
    });

    assert.ok(subscription.id);
    await publishRuntimeEvent(store, {
      userId: user.id,
      sessionId: session.id,
      source: "test",
      eventType: "workflow.routed",
      payload: { workflow: "eligibility_benefits_navigation" }
    });

    const deliveries = await store.list("runtime_hook_deliveries", { subscription_id: subscription.id });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].status, "dry_run_blocked");
  } finally {
    if (previous === undefined) delete process.env.BRAINSTY_ENABLE_OUTBOUND_WEBHOOKS;
    else process.env.BRAINSTY_ENABLE_OUTBOUND_WEBHOOKS = previous;
  }
});

test("LangGraph publishes Phase 8 lifecycle events", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Do I still owe anything before insurance starts paying?",
    rawMessage: { source: "runtime_events_test", useLiveModel: false, executeEvidenceObservation: false }
  });

  assert.equal(result.state.workflow, "eligibility_benefits_navigation");
  const events = await listRuntimeEvents(store, { sessionId: session.id, limit: 20 });
  const eventTypes = events.map((event) => event.eventType);
  assert.ok(eventTypes.includes("workflow.classified"));
  assert.ok(eventTypes.includes("workflow.routed"));
  assert.ok(eventTypes.includes("worker.plan.prepared"));
  assert.ok(eventTypes.includes("approval.requested"));
  assert.ok(eventTypes.includes("final.answer.created"));
  assert.ok(eventTypes.includes("memory.retained"));
});

test("LangGraph publishes approval consumption and worker status events during resume", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const proposal = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use my portal in read-only mode to check benefits.",
    rawMessage: { source: "runtime_events_resume_test", useLiveModel: false, executeEvidenceObservation: false }
  });
  const taskId = proposal.state.openclaw_skill_proposal.task.id;
  const approval = await createReadOnlyObservationApproval(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    workflow: proposal.state.workflow
  });

  const resume = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use my portal in read-only mode to check benefits.",
    rawMessage: {
      source: "runtime_events_resume_test",
      useLiveModel: false,
      executeEvidenceObservation: true,
      approvalToken: approval.approvalToken,
      approvalTaskId: taskId,
      browserSnapshot: {
        title: "Approved Benefits",
        url: "https://health.aetna.com/member/benefits",
        text: "Benefits coverage deductible total $600 spent $558.72 remaining $41.28 out-of-pocket max total $9,000 spent $1,476.98 remaining $7,523.02",
        links: []
      }
    }
  });

  assert.equal(resume.state.approval_resume.status, "approved_consumed");
  assert.equal(resume.state.evidence_observation.status, "captured_visible_page");
  const events = await listRuntimeEvents(store, { sessionId: session.id, limit: 30 });
  const eventTypes = events.map((event) => event.eventType);
  assert.ok(eventTypes.includes("approval.consumed"));
  assert.ok(eventTypes.includes("worker.status.updated"));
  assert.ok(events.some((event) => event.eventType === "worker.status.updated" && event.payload.terminalOutcome === "completed_with_sourced_result"));
  assert.ok(events.some((event) => event.eventType === "worker.status.updated" && event.payload.structuredBenefitCount === 2));
});

test("repeated orchestrator flow cases keep context packets compact", async () => {
  const store = await createStore();
  const result = await runOrchestratorFlowCases(store, {
    member: {
      name: "Packet Size User",
      email: "packet-size@example.invalid",
      payer: "Aetna",
      portalUrl: "https://www.aetna.com/"
    },
    useLiveModel: false,
    requireLiveModel: false
  });

  assert.equal(result.cases.length, ORCHESTRATOR_FLOW_CASES.length);
  const row = await store.get("SELECT MAX(LENGTH(packet_json)) AS max_packet_size FROM context_packets;");
  assert.ok(Number(row.max_packet_size) < 250000, `context packet too large: ${row.max_packet_size}`);
});
