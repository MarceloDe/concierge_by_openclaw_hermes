// Non-mocked proof of the canonical conversation timeline + messages channel (Phase 1):
// - conversation_messages gets a strictly-increasing per-session sequence_number (stable timeline)
// - the messages channel + DB survive a REAL process restart (spawned child, file checkpointer)
// - cold start (checkpoint deleted) rehydrates the channel from the authoritative DB so the next
//   turn's planner still sees prior turns.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

// A real child process: file-backed durable checkpointer + the shared sqlite DB. Replays a fixed
// workflow so it needs no live LLM. Prints CHANNEL_LEN=<messages channel length after the turns>.
const CHILD = `
const repo = process.env.REPO;
const { SqliteStore } = await import(repo + "src/concierge/database.mjs");
const { runLangGraphOrchestration } = await import(repo + "src/concierge/langgraphRunner.mjs");
const store = await new SqliteStore(process.env.BRAINSTY_DB_PATH).initialize();
const session = await store.findOne("sessions", { id: process.env.SID });
const user = await store.findOne("users", { id: process.env.UID });
const replay = { source: "child", useLiveModel: false, executeEvidenceObservation: false, llmOrchestrationDecisionReplay: { workflow: "eligibility_benefits_navigation", intent: "benefits", confidence: 0.9, rationale: "r", workerGoal: "g" } };
let last;
for (const m of JSON.parse(process.env.TURNS)) { last = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: m, rawMessage: replay }); }
console.log("CHANNEL_LEN=" + (last.state.messages || []).length);
`;

function runChild({ dbPath, ckptPath, sid, uid, turns }) {
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", CHILD], {
    encoding: "utf8",
    env: {
      ...process.env,
      REPO,
      BRAINSTY_DB_PATH: dbPath,
      SID: sid,
      UID: uid,
      TURNS: JSON.stringify(turns),
      BRAINSTY_GRAPH_CHECKPOINTER: "file",
      BRAINSTY_GRAPH_CHECKPOINTER_PATH: ckptPath,
      BRAINSTY_GRAPH_CHECKPOINTER_ALLOW_TEST_KEY: "1"
    }
  });
  if (res.status !== 0) throw new Error(`child failed (status ${res.status}): ${res.stderr || res.stdout}`);
  const m = /CHANNEL_LEN=(\d+)/.exec(res.stdout);
  if (!m) throw new Error(`child produced no CHANNEL_LEN: ${res.stdout}\n${res.stderr}`);
  return Number(m[1]);
}

test("conversation timeline + messages channel survive a real process restart (DB rehydration on cold start)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "conv-ch-"));
  const dbPath = join(dir, "conv.sqlite");
  const ckptPath = join(dir, "ckpt.json");

  // Setup the shared DB + a session (in-process; durability is proven across the children).
  const store = await new SqliteStore(dbPath).initialize();
  const { user, session } = await enrollDefaultMember(store);

  // Process A: two turns with the durable file checkpointer.
  const lenA = runChild({ dbPath, ckptPath, sid: session.id, uid: user.id, turns: ["aetna", "ready out of pocket"] });
  assert.equal(lenA, 3, "after 2 turns the channel holds u1,a1,u2 (assistant2 appended post-run via updateState)");

  // Authoritative DB timeline is ordered + strictly increasing, user-before-assistant per turn.
  const rows1 = await store.all("SELECT role, sequence_number FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number ASC;", [session.id]);
  assert.deepEqual(rows1.map((r) => r.role), ["user", "assistant", "user", "assistant"], "correct role order");
  assert.deepEqual(rows1.map((r) => r.sequence_number), [1, 2, 3, 4], "strictly increasing ordinals, no gaps");

  // Cold start: delete the checkpoint so the channel cannot come from the checkpointer — it MUST
  // rehydrate from the authoritative DB inside inputPolicyNode.
  rmSync(ckptPath, { force: true });
  const lenB = runChild({ dbPath, ckptPath, sid: session.id, uid: user.id, turns: ["what about my copay"] });
  assert.equal(lenB, 5, "cold-start rehydrated 4 prior turns from the DB + the new user turn");

  // DB now holds the full ordered 6-turn timeline across both processes.
  const rows2 = await store.all("SELECT role, sequence_number FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number ASC;", [session.id]);
  assert.equal(rows2.length, 6, "all turns durably recorded across processes");
  assert.deepEqual(rows2.map((r) => r.sequence_number), [1, 2, 3, 4, 5, 6], "monotonic across process restarts");
});
