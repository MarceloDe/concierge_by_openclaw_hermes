import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { checkOfficialOpenClawReadiness, getOfficialOpenClawConfig } from "../concierge/openclawOfficialRuntime.mjs";
import { createWorkerContinuation, listWorkerContinuations, requestWorkerContinuation } from "../concierge/workerContinuations.mjs";
import { listRuntimeEvents } from "../concierge/runtimeEvents.mjs";

test("official OpenClaw config uses the dedicated project profile by default", () => {
  const config = getOfficialOpenClawConfig({});
  assert.equal(config.profile, "brainstyworkers");
  assert.equal(config.agentId, "brainstyworkers-insurance-browser");
  assert.equal(config.browserProfile, "openclaw");
  assert.equal(config.gatewayPort, 19789);
  assert.match(config.stateDir, /\.openclaw-brainstyworkers$/);
  assert.ok(config.allowedActions.includes("snapshot_accessibility_tree"));
  assert.ok(config.allowedActions.includes("screenshot_capture"));
  assert.ok(config.allowedActions.includes("local_ocr"));
  assert.ok(config.blockedActions.includes("credential_entry"));
  assert.ok(config.blockedActions.includes("form_submission"));
});

test("official OpenClaw readiness and read-only dispatch fail closed on public payer marketing content", {
  skip:
    process.env.BRAINSTY_OPENCLAW_OFFICIAL_LIVE === "1"
      ? false
      : "Set BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1 after the dedicated brainstyworkers OpenClaw gateway is running."
}, async () => {
  process.env.BRAINSTY_PORTAL_LIVE = "1";
  const readiness = await checkOfficialOpenClawReadiness();
  assert.equal(readiness.ready, true, JSON.stringify(readiness, null, 2));
  assert.equal(readiness.config.profile, "brainstyworkers");
  assert.equal(readiness.checks.personalSkillsExcluded, true);
  assert.equal(readiness.checks.ocrLocalReady, true);

  const dir = await mkdtemp(join(tmpdir(), "brainsty-official-openclaw-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store, {
    name: "Official OpenClaw Test Member",
    email: `official-openclaw-${crypto.randomUUID()}@example.com`,
    payer: "Aetna",
    portalUrl: "https://www.aetna.com/"
  });

  const proposalRun = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use the official OpenClaw browser worker in read-only mode to check benefits.",
    rawMessage: { source: "official_openclaw_test", executeEvidenceObservation: false, useLiveModel: false }
  });
  const taskId = proposalRun.state.openclaw_skill_proposal.task.id;
  const continuation = await createWorkerContinuation(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    correlationId: proposalRun.state.graph_trace_id,
    reason: "Official live OpenClaw proof may take longer than the current chat turn."
  });
  assert.equal(continuation.ok, true);
  const continued = await requestWorkerContinuation(store, {
    continuationId: continuation.continuation.id,
    sessionId: session.id,
    userId: user.id
  });
  assert.equal(continued.ok, true);
  const approval = await createReadOnlyObservationApproval(store, {
    taskId,
    sessionId: session.id,
    userId: user.id,
    decision: "approved",
    expiresInMinutes: 10
  });

  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use the official OpenClaw browser worker in read-only mode to check benefits.",
    rawMessage: {
      source: "official_openclaw_test",
      executeEvidenceObservation: true,
      useOfficialOpenClawWorker: true,
      requireLivePortalProof: true,
      approvalToken: approval.approvalToken,
      approvalTaskId: taskId,
      workerContinuationId: continuation.continuation.id,
      officialOpenClawTargetUrl: "https://www.aetna.com/",
      useLiveModel: false
    }
  });

  assert.equal(result.state.approval_resume.status, "approved_consumed");
  assert.equal(result.state.evidence_observation.status, "blocked_live_portal_verification_failed");
  assert.match(result.state.evidence_observation.reason, /public Aetna marketing content|not an approved authenticated member portal/i);
  assert.ok(result.state.evidence_observation.actionsTaken.includes("openclaw_browser_start"));
  assert.ok(result.state.evidence_observation.actionsTaken.includes("openclaw_browser_open_url"));
  assert.ok(result.state.evidence_observation.actionsTaken.includes("openclaw_browser_snapshot_aria"));
  assert.ok(result.state.evidence_observation.actionsTaken.includes("openclaw_browser_screenshot_cdp"));
  assert.ok(result.state.evidence_observation.actionsTaken.includes("openclaw_browser_visual_ocr_local"));
  assert.ok(result.state.evidence_observation.actionsTaken.includes("verify_authenticated_member_portal"));
  assert.equal(result.state.worker_continuation.status, "blocked");
  assert.equal(result.state.worker_continuation.continuation.terminalOutcome, "not_possible_insurance_or_portal_block");
  assert.ok(result.state.worker_continuation.continuation.actionsTaken.includes("openclaw_browser_snapshot_aria"));
  assert.deepEqual(result.state.source_pointers, []);
  assert.equal((await store.list("eligibility_snapshots", { session_id: session.id })).length, 0);
  const continuations = await listWorkerContinuations(store, { sessionId: session.id });
  assert.equal(continuations[0].status, "blocked");
  const events = await listRuntimeEvents(store, { sessionId: session.id, limit: 80 });
  assert.ok(events.some((event) => event.eventType === "worker.followup.dispatching"));
  assert.ok(events.some((event) => event.eventType === "worker.followup.blocked"));
});
