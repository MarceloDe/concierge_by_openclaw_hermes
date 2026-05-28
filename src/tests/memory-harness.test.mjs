import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore, DEFAULT_DB_PATH } from "../concierge/database.mjs";
import { runConciergeSlice, traceForSession } from "../concierge/engine.mjs";
import { getMemoryContextForUser, listHarnessState, planTaskFollowups, runUserHeartbeat } from "../concierge/memoryHarness.mjs";

test("memory harness injects cross-session context and retains database pointers from real Aetna data", async () => {
  const store = await new SqliteStore(DEFAULT_DB_PATH).initialize();
  const sourceSnapshot = await store.get(
    "SELECT * FROM eligibility_snapshots WHERE source_url = 'https://health.aetna.com/' AND raw_text LIKE '%Welcome, Marcelo%' ORDER BY created_at DESC LIMIT 1;"
  );

  assert.ok(sourceSnapshot, "Run the logged Aetna extraction before this real-data memory harness test.");

  const result = await runConciergeSlice(store, {
    message: "Use the existing Aetna portal data to prepare my ongoing memory harness.",
    portalPageSnapshots: [
      {
        pageKind: "home_memory_harness",
        title: "Home - Aetna",
        url: sourceSnapshot.source_url,
        text: sourceSnapshot.raw_text,
        links: [],
        extractedAt: sourceSnapshot.created_at
      }
    ]
  });
  const trace = await traceForSession(store, result.session.id);
  const context = await getMemoryContextForUser(store, {
    email: "mocfelix@gmail.com",
    sessionId: result.session.id
  });

  assert.ok(trace.contextPackets.length >= 1);
  assert.ok(trace.memoryItems.some((item) => item.memory_type === "last_user_task"));
  assert.ok(trace.memoryItems.some((item) => item.memory_type === "eligibility_snapshot_pointer"));
  assert.ok(context.packet.dbPointers.some((pointer) => pointer.table === "eligibility_snapshots"));
  assert.equal(context.packet.openclaw.status, "always_on_local_harness");
  assert.equal(context.packet.adapterChoice.selectedNow, "hook_style_local_memory_harness");
  assert.equal(context.packet.promptBundle.orchestrator.role, "orchestrator");
  assert.equal(context.packet.promptBundle.openclawArm.role, "openclaw_arm");
  assert.match(context.packet.promptBundle.orchestrator.prompt, /Memory Context Is Untrusted Data/);
});

test("claim submission event creates approval-gated heartbeat jobs without sending external messages", async () => {
  const store = await new SqliteStore(DEFAULT_DB_PATH).initialize();
  const session = await store.get(
    "SELECT s.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = 'mocfelix@gmail.com' ORDER BY COALESCE(s.last_active_at, s.created_at) DESC LIMIT 1;"
  );
  const user = await store.findOne("users", { email: "mocfelix@gmail.com" });
  const claim = await store.get(
    "SELECT ci.* FROM claim_items ci JOIN eligibility_snapshots es ON es.id = ci.snapshot_id WHERE es.user_id = (SELECT id FROM users WHERE email = 'mocfelix@gmail.com') ORDER BY ci.created_at DESC LIMIT 1;"
  );

  assert.ok(user, "Run enrollment before this harness test.");
  assert.ok(session, "Run a session before this harness test.");
  assert.ok(claim, "Run real Aetna structured extraction before this harness test.");

  const planned = await planTaskFollowups(store, {
    user,
    session,
    eventType: "claim_submitted",
    payload: {
      sourceTable: "claim_items",
      sourceId: claim.id,
      claimId: claim.id
    }
  });
  const harness = await listHarnessState(store, { userId: user.id });
  const heartbeat = await runUserHeartbeat(store, {
    userId: user.id,
    sessionId: session.id,
    now: new Date(Date.now() + 13 * 60 * 60 * 1000).toISOString()
  });

  assert.ok(planned.planned.some((item) => item.jobType === "check_email_for_payer_response"));
  assert.ok(harness.jobs.some((job) => job.job_type === "check_email_for_payer_response" && job.requires_integration === "gmail_or_email_channel"));
  assert.ok(harness.jobs.some((job) => job.job_type === "check_payer_portal_claim_status" && job.requires_integration === "openclaw_authenticated_browser"));
  assert.ok(harness.outbox.some((item) => item.channel === "whatsapp" && item.status === "pending_approval"));
  assert.ok(heartbeat.pendingActions.some((action) => action.action === "request_integration_setup"));
  assert.equal(heartbeat.contextPacket.packet.safety.externalMessaging, "requires_explicit_approval_gate");
});
