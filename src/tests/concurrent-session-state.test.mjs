import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { checkpointSession, getManagedSessionState } from "../concierge/sessionManager.mjs";

test("concurrent same-session checkpoints advance state_version without collisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-concurrent-session-"));
  const store = await new SqliteStore(join(dir, "test.sqlite")).initialize();
  const { session } = await enrollDefaultMember(store, {
    name: "Concurrent State User",
    email: "concurrent-state@example.invalid"
  });

  const results = await Promise.all([
    checkpointSession(store, {
      session,
      stepName: "concurrent_step_a",
      statePatch: { workflow: { lastIntent: "a" } }
    }),
    checkpointSession(store, {
      session,
      stepName: "concurrent_step_b",
      statePatch: { workflow: { lastIntent: "b" } }
    })
  ]);

  const versions = results.map((result) => result.stateVersion).sort((a, b) => a - b);
  assert.deepEqual(versions, [2, 3]);

  const current = await getManagedSessionState(store, session.id);
  assert.equal(current.session.state_version, 3);
  assert.equal(current.state.state_version, 3);
  assert.equal(current.checkpoints.length, 2);
  assert.ok(current.events.filter((event) => event.event_type === "session_checkpointed").length >= 2);
});
