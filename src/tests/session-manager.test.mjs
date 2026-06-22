import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runConciergeSlice, traceForSession } from "../concierge/langgraphCompatibility.mjs";
import { getManagedSessionState, listManagedSessions, resolveManagedSession } from "../concierge/sessionManager.mjs";

async function testStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-session-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("chat runs create LangChain-ready session state and checkpoints", async () => {
  const store = await testStore();
  const result = await runConciergeSlice(store, {
    message: "Review my Aetna benefits from this browser snapshot.",
    browserSnapshot: {
      title: "Home - Aetna",
      url: "https://health.aetna.com/",
      text: "Welcome, Marcelo Benefits Medical Coverage Deductible – $600 $558.72 Spent $41.28 Remaining Claims",
      links: []
    }
  });
  const managed = await getManagedSessionState(store, result.session.id);

  assert.equal(managed.session.id, result.session.id);
  assert.equal(managed.state.state.langchain.configurable.thread_id, result.session.langgraph_thread_id);
  assert.equal(managed.state.state.langchain.configurable.checkpoint_ns, "brainstyworkers");
  assert.ok(managed.checkpoints.length >= 1);
  assert.ok(managed.checkpoints.some((checkpoint) => checkpoint.step_name === "langgraph_run_completed"));
  assert.equal(managed.session.current_step, "langgraph_run_completed");
});

test("chat can resume an existing managed session by session id", async () => {
  const store = await testStore();
  const first = await runConciergeSlice(store, {
    message: "Start an Aetna eligibility session.",
    browserSnapshot: {
      title: "Home - Aetna",
      url: "https://health.aetna.com/",
      text: "Welcome, Marcelo Benefits Claims",
      links: []
    }
  });
  const second = await runConciergeSlice(store, {
    sessionId: first.session.id,
    message: "Continue this same session and keep the same thread.",
    browserSnapshot: {
      title: "Home - Aetna",
      url: "https://health.aetna.com/",
      text: "Welcome, Marcelo Benefits Claims",
      links: []
    }
  });
  const trace = await traceForSession(store, first.session.id);

  assert.equal(second.session.id, first.session.id);
  assert.equal(second.session.langgraph_thread_id, first.session.langgraph_thread_id);
  assert.ok(trace.messages.length >= 4);
  assert.ok(trace.managedSession.checkpoints.length >= 2);
  assert.ok(trace.managedSession.checkpoints.every((checkpoint) => checkpoint.step_name === "langgraph_run_completed"));
});

test("session list returns active sessions for a member", async () => {
  const store = await testStore();
  const result = await runConciergeSlice(store, {
    message: "Create a stateful session.",
    browserSnapshot: {
      title: "Home - Aetna",
      url: "https://health.aetna.com/",
      text: "Welcome, Marcelo Benefits Claims",
      links: []
    }
  });
  const sessions = await listManagedSessions(store, { email: "mocfelix@gmail.com" });

  assert.equal(sessions[0].id, result.session.id);
  assert.equal(sessions[0].status, "active");
  assert.match(sessions[0].langgraph_thread_id, /^thread:/);
});

test("session list binds hostile email and user id filters", async () => {
  const store = await testStore();
  const enrollment = await enrollDefaultMember(store, {
    name: "Session Filter User",
    email: "session-filter@example.com",
    payer: "Aetna",
    portalUrl: "https://www.aetna.com/"
  });

  const normal = await listManagedSessions(store, { email: "session-filter@example.com" });
  assert.equal(normal.length, 1);
  assert.equal(normal[0].id, enrollment.session.id);

  const hostileEmail = await listManagedSessions(store, { email: "session-filter@example.com' OR 1=1 --" });
  assert.equal(hostileEmail.length, 0);

  const hostileUserId = await listManagedSessions(store, { userId: `${enrollment.user.id}' OR 1=1 --` });
  assert.equal(hostileUserId.length, 0);
});

test("resume latest session uses bound user and channel values", async () => {
  const store = await testStore();
  const enrollment = await enrollDefaultMember(store, {
    name: "Resume Latest User",
    email: "resume-latest@example.com",
    payer: "Aetna",
    portalUrl: "https://www.aetna.com/"
  });
  const resolved = await resolveManagedSession(store, {
    user: enrollment.user,
    portal: enrollment.portal,
    resumeLatestSession: true,
    channel: enrollment.session.channel
  });

  assert.equal(resolved.resumed, true);
  assert.equal(resolved.session.id, enrollment.session.id);
});
