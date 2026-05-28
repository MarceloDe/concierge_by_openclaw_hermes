import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { runConciergeSlice, traceForSession } from "../concierge/engine.mjs";
import { getManagedSessionState, listManagedSessions } from "../concierge/sessionManager.mjs";

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
  assert.ok(managed.checkpoints.length >= 3);
  assert.ok(managed.checkpoints.some((checkpoint) => checkpoint.step_name === "intent_classified"));
  assert.equal(managed.session.current_step, "response_composed");
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
  assert.ok(trace.managedSession.checkpoints.length >= 6);
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
