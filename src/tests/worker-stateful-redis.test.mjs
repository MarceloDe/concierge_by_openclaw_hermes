// Stateful OpenClaw proof: the worker now carries per-session runtime state in
// Redis that accumulates across dispatches, resumes the next orchestration turn,
// and survives a process restart — the worker analogue of LangGraph statefulness.
// NO mocks of DB/context. Requires BRAINSTY_REDIS_URL. Run via `npm run test:redis:worker`.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { recordWorkerDispatchState, readWorkerRuntimeState } from "../concierge/workerRuntimeState.mjs";
import { createId } from "../concierge/database.mjs";

await loadLocalEnvOnce();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function runNode(rel, args = []) {
  return JSON.parse(execFileSync("node", [join(repoRoot, rel), ...args], { encoding: "utf8", env: process.env, cwd: repoRoot }).trim().split("\n").filter(Boolean).pop());
}

test("worker runtime state accumulates across dispatches and reads back (real Redis)", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required");
  const sessionId = createId("wstate");
  const first = await recordWorkerDispatchState({ sessionId, threadId: "t1", dispatch: { dispatchedAt: "2026-06-27T00:00:01Z", workflow: "eligibility_benefits_navigation" } });
  assert.equal(first.cacheBackend, "redis");
  assert.equal(first.stored, true);
  assert.equal(first.state.dispatchCount, 1);
  assert.equal(first.resumedFrom, null, "first dispatch has nothing to resume from");

  const second = await recordWorkerDispatchState({ sessionId, threadId: "t1", dispatch: { dispatchedAt: "2026-06-27T00:00:02Z", workflow: "prior_authorization_navigation" } });
  assert.equal(second.state.dispatchCount, 2, "dispatch count accumulates");
  assert.ok(second.resumedFrom, "second dispatch resumes from prior worker state");
  assert.equal(second.resumedFrom.latestDispatch.workflow, "eligibility_benefits_navigation");

  const read = await readWorkerRuntimeState(sessionId);
  assert.equal(read.cacheHit, true);
  assert.equal(read.prior.dispatchCount, 2);
  assert.equal(read.prior.dispatchHistory.length, 2, "history retained");
});

test("worker runtime state survives a process restart (turn 1 writes, fresh process reads)", () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required");
  const sessionId = "wstate_xproc_" + Math.floor(Math.random() * 1e9);
  const writer = runNode("scripts/worker-state-writer.mjs", [sessionId]);
  assert.equal(writer.backend, "redis");
  assert.equal(writer.stored, true);
  const reader = runNode("scripts/worker-state-reader.mjs", [sessionId]);
  assert.equal(reader.backend, "redis");
  assert.equal(reader.cacheHit, true, "fresh process must read worker state back from redis");
  assert.equal(reader.dispatchCount, 1);
  assert.equal(reader.lastWorkflow, "prior_authorization_navigation");
});

test("orchestration turn 2 resumes from turn 1 worker dispatch state (real graph, no live LLM)", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required");
  const store = await new SqliteStore(join(await mkdtemp(join(tmpdir(), "wstate-")), "w.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store);
  const rawMessage = {
    source: "worker_stateful_test",
    useLiveModel: false,
    executeEvidenceObservation: false,
    llmOrchestrationDecisionReplay: { workflow: "eligibility_benefits_navigation", intent: "benefits_eligibility", confidence: 0.9, rationale: "replay", workerGoal: "read-only" }
  };
  const turn1 = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: "check my benefits", rawMessage });
  const call1 = (turn1.state.tool_calls ?? []).find((c) => c.workerStatePersisted);
  assert.ok(call1, "turn 1 dispatch must persist worker state");
  assert.equal(call1.workerStatePersisted.stored, true);
  assert.equal(call1.workerStatePersisted.dispatchCount, 1);

  const turn2 = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: "what about prior auth", rawMessage });
  const call2 = (turn2.state.tool_calls ?? []).find((c) => "resumedFromWorkerState" in c);
  assert.ok(call2, "turn 2 dispatch tool call present");
  assert.ok(call2.resumedFromWorkerState, "turn 2 must resume from turn 1 worker state (stateful)");
  assert.equal(call2.resumedFromWorkerState.dispatchCount, 1, "resumed from the prior dispatch");
});
