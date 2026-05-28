import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";

test("live authenticated portal proof captures verified source pointer from user-authenticated browser", async () => {
  assert.equal(
    process.env.BRAINSTY_PORTAL_LIVE,
    "1",
    "Set BRAINSTY_PORTAL_LIVE=1 only when Chrome is already authenticated to the member portal."
  );

  const dir = await mkdtemp(join(tmpdir(), "brainsty-live-portal-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store, {
    name: process.env.BRAINSTY_PORTAL_MEMBER_NAME ?? "Live Portal Member",
    email: process.env.BRAINSTY_PORTAL_MEMBER_EMAIL ?? `live-portal-${crypto.randomUUID()}@example.com`,
    payer: process.env.BRAINSTY_PORTAL_PAYER ?? "Aetna",
    portalUrl: process.env.BRAINSTY_PORTAL_URL ?? "https://health.aetna.com/"
  });

  const proposalRun = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use my authenticated portal to check benefits and cite the source pointer.",
    rawMessage: { source: "live_portal_test", executeEvidenceObservation: false, useLiveModel: false }
  });
  const approval = await createReadOnlyObservationApproval(store, {
    taskId: proposalRun.state.openclaw_skill_proposal.task.id,
    sessionId: session.id,
    userId: user.id,
    decision: "approved",
    expiresInMinutes: 10
  });

  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Use my authenticated portal to check benefits and cite the source pointer.",
    rawMessage: {
      source: "live_portal_test",
      requireLivePortalProof: true,
      approvalToken: approval.approvalToken,
      approvalTaskId: proposalRun.state.openclaw_skill_proposal.task.id,
      remoteDebuggerUrl: process.env.BRAINSTY_PORTAL_REMOTE_DEBUGGER ?? "http://127.0.0.1:9222",
      useLiveModel: false
    }
  });

  assert.equal(result.state.approval_resume.status, "approved_consumed");
  assert.equal(result.state.evidence_observation.status, "captured_visible_page", result.state.evidence_observation.reason);
  assert.equal(result.state.evidence_observation.livePortalProof, "verified");
  assert.equal(result.state.browser_result.connected, true);
  const verifiedPointer = result.state.source_pointers.find((item) => item.table === "extraction_artifacts");
  assert.ok(verifiedPointer, "Expected verified live portal source pointer artifact.");
  assert.match(verifiedPointer.domHash, /^[a-f0-9]{64}$/);
  assert.match(verifiedPointer.extractionHash, /^[a-f0-9]{64}$/);
  assert.equal((await store.list("eligibility_snapshots", { session_id: session.id })).length, 1);
});
