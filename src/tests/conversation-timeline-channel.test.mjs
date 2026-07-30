// Non-mocked proof of the canonical conversation timeline + messages channel (Phase 1):
// - conversation_messages gets a strictly-increasing per-session sequence_number (stable timeline)
// - the messages channel + DB survive a REAL process restart (spawned child, file checkpointer)
// - cold start (checkpoint rows deleted) rehydrates the channel from authoritative PostgreSQL so the next
//   turn's planner still sees prior turns.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DEFAULT_POSTGRES_URL, PostgresStore } from "../concierge/postgresStore.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

// A real child process: encrypted PostgreSQL checkpointer + the shared PostgreSQL DB. Replays a fixed
// workflow so it needs no live LLM. Prints CHANNEL_LEN=<messages channel length after the turns>.
const CHILD = `
const repo = process.env.REPO;
const { closeRuntimeDatabaseStore, getRuntimeDatabaseStore } = await import(repo + "src/concierge/databaseFactory.mjs");
const { runLangGraphOrchestration } = await import(repo + "src/concierge/langgraphRunner.mjs");
const store = await getRuntimeDatabaseStore(process.env);
const session = await store.findOne("sessions", { id: process.env.SID });
const user = await store.findOne("users", { id: process.env.UID });
const replay = { source: "child", useLiveModel: false, executeEvidenceObservation: false, llmOrchestrationDecisionReplay: { workflow: "eligibility_benefits_navigation", intent: "benefits", confidence: 0.9, rationale: "r", workerGoal: "g" } };
let last;
for (const m of JSON.parse(process.env.TURNS)) { last = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: m, rawMessage: replay }); }
console.log("CHANNEL_LEN=" + (last.state.messages || []).length);
await closeRuntimeDatabaseStore();
`;

function databaseUrl(base, database) {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

function adminOptions(urlString) {
  const url = new URL(urlString);
  url.pathname = "/postgres";
  return { connectionString: url.toString(), ssl: /sslmode=disable/i.test(urlString) ? false : undefined };
}

function runChild({ connectionString, encryptionKey, sid, uid, turns }) {
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", CHILD], {
    encoding: "utf8",
    env: {
      ...process.env,
      REPO,
      NODE_TEST_CONTEXT: "",
      BRAINSTY_FORCE_POSTGRES_TEST_CHECKPOINTER: "1",
      BRAINSTY_DB_DRIVER: "postgres",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: connectionString,
      BRAINSTY_DATABASE_URL_FILE: "",
      SID: sid,
      UID: uid,
      TURNS: JSON.stringify(turns),
      BRAINSTY_GRAPH_CHECKPOINTER: "postgres",
      BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY: encryptionKey
    }
  });
  if (res.status !== 0) throw new Error(`child failed (status ${res.status}): ${res.stderr || res.stdout}`);
  const m = /CHANNEL_LEN=(\d+)/.exec(res.stdout);
  if (!m) throw new Error(`child produced no CHANNEL_LEN: ${res.stdout}\n${res.stderr}`);
  return Number(m[1]);
}

test("conversation timeline + messages channel survive a real PostgreSQL process restart", async (t) => {
  const baseUrl = process.env.BRAINSTY_DATABASE_URL || DEFAULT_POSTGRES_URL;
  const database = `brainsty_conversation_${randomBytes(6).toString("hex")}`;
  const connectionString = databaseUrl(baseUrl, database);
  const encryptionKey = randomBytes(32).toString("base64");
  const admin = new pg.Client(adminOptions(baseUrl));
  let store = null;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
  } catch (error) {
    await admin.end().catch(() => {});
    t.skip(`SKIP-LOUD: live PostgreSQL unavailable for process-restart timeline proof (${error.message})`);
    return;
  }

  try {
    store = await new PostgresStore(connectionString).initialize();
    const { user, session } = await enrollDefaultMember(store);

    // Process A: two turns with the encrypted PostgreSQL checkpointer.
    const lenA = runChild({ connectionString, encryptionKey, sid: session.id, uid: user.id, turns: ["aetna", "ready out of pocket"] });
    assert.equal(lenA, 3, "after 2 turns the channel holds u1,a1,u2 (assistant2 appended post-run via updateState)");

    // Authoritative DB timeline is ordered + strictly increasing, user-before-assistant per turn.
    const rows1 = await store.all("SELECT role, sequence_number FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number ASC;", [session.id]);
    assert.deepEqual(rows1.map((r) => r.role), ["user", "assistant", "user", "assistant"], "correct role order");
    assert.deepEqual(rows1.map((r) => r.sequence_number), [1, 2, 3, 4], "strictly increasing ordinals, no gaps");

    // Cold start: delete checkpoint rows so the channel cannot come from the saver — it MUST
    // rehydrate from authoritative PostgreSQL inside inputPolicyNode.
    await store.query("DELETE FROM langgraph_checkpoint_writes WHERE thread_id = ?;", [session.langgraph_thread_id]);
    await store.query("DELETE FROM langgraph_checkpoints WHERE thread_id = ?;", [session.langgraph_thread_id]);
    const lenB = runChild({ connectionString, encryptionKey, sid: session.id, uid: user.id, turns: ["what about my copay"] });
    assert.equal(lenB, 5, "cold-start rehydrated 4 prior turns from PostgreSQL + the new user turn");

    // DB now holds the full ordered 6-turn timeline across both processes.
    const rows2 = await store.all("SELECT role, sequence_number FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number ASC;", [session.id]);
    assert.equal(rows2.length, 6, "all turns durably recorded across processes");
    assert.deepEqual(rows2.map((r) => r.sequence_number), [1, 2, 3, 4, 5, 6], "monotonic across process restarts");
  } finally {
    await store?.close().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`).catch(() => {});
    await admin.end().catch(() => {});
  }
});
