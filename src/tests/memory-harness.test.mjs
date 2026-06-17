import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createId, nowIso, SqliteStore, DEFAULT_DB_PATH } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runConciergeSlice, traceForSession } from "../concierge/engine.mjs";
import { getMemoryContextForUser, listHarnessState, planTaskFollowups, runUserHeartbeat } from "../concierge/memoryHarness.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-memory-harness-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

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
  const store = await createStore();
  const { user, session, portal } = await enrollDefaultMember(store, {
    email: "memory-heartbeat@example.test",
    name: "Memory Harness Test"
  });
  const time = nowIso();
  const snapshot = {
    id: createId("eligibility"),
    user_id: user.id,
    session_id: session.id,
    portal_account_id: portal.id,
    source_url: portal.portal_url,
    summary: "Fixture claim source pointer for heartbeat followup planning.",
    raw_text: "Claim detail fixture with no external message sent.",
    created_at: time
  };
  await store.insert("eligibility_snapshots", snapshot);
  const claim = {
    id: createId("claim"),
    snapshot_id: snapshot.id,
    description: "Fixture office visit claim",
    member_name: null,
    service_date: "2026-05-01",
    share_amount: 42.5,
    raw_text: "Fixture office visit claim",
    source: "fixture_claim_for_heartbeat",
    created_at: time
  };
  await store.insert("claim_items", claim);

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

test("memory harness uses bound parameters for hostile-looking user and source identifiers", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store, {
    email: "memory-bind-one@example.test",
    name: "Memory Bind One"
  });
  const other = await enrollDefaultMember(store, {
    email: "memory-bind-two@example.test",
    name: "Memory Bind Two"
  });
  const time = nowIso();
  await store.insert("memory_items", {
    id: createId("mem"),
    user_id: other.user.id,
    session_id: other.session.id,
    memory_scope: "semantic",
    memory_type: "cross_user_secret",
    content: "OTHER USER SECRET SHOULD NOT APPEAR",
    metadata_json: "{}",
    source_table: "manual_fixture",
    source_id: "other_user",
    source_url: null,
    sensitivity: "test_phi",
    retention_policy: "test_only",
    adapter_status: "fixture",
    occurred_at: time,
    valid_from_at: time,
    valid_until_at: null,
    last_verified_at: time,
    temporal_metadata_json: "{}",
    confidence: 1,
    created_at: time,
    updated_at: time
  });

  await assert.rejects(
    () => getMemoryContextForUser(store, { userId: `${user.id}' OR 1=1 --` }),
    /User not found/
  );

  const hostileClaimId = "claim_x' OR 1=1 --";
  const firstPlan = await planTaskFollowups(store, {
    user,
    session,
    eventType: "claim_submitted",
    payload: {
      sourceTable: "claim_items",
      sourceId: hostileClaimId,
      claimId: hostileClaimId
    }
  });
  const secondPlan = await planTaskFollowups(store, {
    user,
    session,
    eventType: "claim_submitted",
    payload: {
      sourceTable: "claim_items",
      sourceId: hostileClaimId,
      claimId: hostileClaimId
    }
  });
  const tasks = await store.all("SELECT * FROM agent_tasks WHERE user_id = ? AND source_id = ? ORDER BY created_at ASC;", [
    user.id,
    hostileClaimId
  ]);
  const state = await listHarnessState(store, { userId: user.id });

  assert.equal(tasks.length, 2);
  assert.deepEqual(
    firstPlan.planned.filter((item) => item.type === "task").map((item) => item.id),
    secondPlan.planned.filter((item) => item.type === "task").map((item) => item.id)
  );
  assert.ok(state.tasks.every((task) => task.user_id === user.id));
  assert.doesNotMatch(JSON.stringify(state), /OTHER USER SECRET SHOULD NOT APPEAR/);
});
