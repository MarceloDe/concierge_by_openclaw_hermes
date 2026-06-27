// Step 7 proof (no mocks): a real read-only orchestration in shadow ledger mode writes
// exactly the 5 checkpoint-boundary rows with non-null session_checkpoint_id; the ledger
// is gated (off by default writes nothing) and never affects the run.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { RUN_LEDGER_BOUNDARIES } from "../concierge/checkpointRunLedger.mjs";

async function freshStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-ledger-"));
  return new SqliteStore(join(dir, "l.sqlite")).initialize();
}

const replayRaw = {
  source: "ledger_test",
  useLiveModel: false,
  executeEvidenceObservation: false,
  llmOrchestrationDecisionReplay: { workflow: "eligibility_benefits_navigation", intent: "benefits_eligibility", confidence: 0.9, rationale: "replay", workerGoal: "read-only" }
};

test("Step 7: shadow ledger records exactly the 5 boundaries with a session checkpoint id", async () => {
  const prev = process.env.BRAINSTY_RUN_LEDGER;
  process.env.BRAINSTY_RUN_LEDGER = "shadow";
  try {
    const store = await freshStore();
    const { user, session } = await enrollDefaultMember(store);
    const result = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: "check my benefits", rawMessage: replayRaw });
    const runId = `wfrun:${result.state.graph_trace_id}`;
    const rows = await store.all("SELECT checkpoint_boundary, status, session_checkpoint_id, step_order FROM workflow_checkpoint_runs WHERE workflow_run_id = ? ORDER BY step_order;", [runId]);
    assert.equal(rows.length, 5, "exactly 5 boundary rows");
    assert.deepEqual(rows.map((r) => r.checkpoint_boundary), [...RUN_LEDGER_BOUNDARIES], "correct boundary types in order");
    for (const r of rows) {
      assert.equal(r.status, "completed");
      assert.ok(r.session_checkpoint_id, "each ledger row links a session checkpoint id");
    }
    // The linked checkpoint id is a real session_checkpoints row.
    const ck = await store.findOne("session_checkpoints", { id: rows[0].session_checkpoint_id });
    assert.ok(ck, "session_checkpoint_id references a real checkpoint row");
    // The parent workflow_runs row exists.
    const run = await store.findOne("workflow_runs", { id: runId });
    assert.ok(run, "workflow_runs row created");
    assert.equal(run.last_checkpoint_boundary, "after_response");
  } finally {
    if (prev === undefined) delete process.env.BRAINSTY_RUN_LEDGER;
    else process.env.BRAINSTY_RUN_LEDGER = prev;
  }
});

test("Step 7: ledger is gated — OFF by default writes nothing", async () => {
  const prev = process.env.BRAINSTY_RUN_LEDGER;
  delete process.env.BRAINSTY_RUN_LEDGER;
  try {
    const store = await freshStore();
    const { user, session } = await enrollDefaultMember(store);
    const result = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: "check my benefits", rawMessage: replayRaw });
    const rows = await store.all("SELECT id FROM workflow_checkpoint_runs WHERE workflow_run_id = ?;", [`wfrun:${result.state.graph_trace_id}`]);
    assert.equal(rows.length, 0, "ledger off => no rows");
  } finally {
    if (prev !== undefined) process.env.BRAINSTY_RUN_LEDGER = prev;
  }
});
