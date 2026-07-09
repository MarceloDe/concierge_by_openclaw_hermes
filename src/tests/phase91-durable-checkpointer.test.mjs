import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { SqliteStore } from "../concierge/database.mjs";
import {
  CHECKPOINT_RUNTIME_VERSIONS,
  StoreBackedCheckpointSaver,
  resumeCompatibility
} from "../concierge/graphCheckpointerStore.mjs";
import { createGraphCheckpointer, durableCheckpointerMode } from "../concierge/graphCheckpointer.mjs";

// Phase 91 (plan §4.3, founder #4/#17): the durable checkpointer is the declared
// production target. The blocking property is RESTART SURVIVAL — a consent interrupt
// paused before a restart must resume after it. Every arm below runs the real saver
// against a real SQLite file (the same code path Postgres takes through the store
// abstraction); nothing here is mocked.

const KEY_B64 = randomBytes(32).toString("base64");
// PHI-shaped payload: this exact string must never appear in the database in cleartext.
const PHI_NOTE = "member Jane Quimby SSN 123-45-6789 deductible balance";

async function freshDbPath() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-durable-ckpt-"));
  return join(dir, "checkpoints.sqlite");
}

async function openStore(dbPath) {
  return new SqliteStore(dbPath).initialize();
}

function saverFor(dbPath, { runtimeVersions } = {}) {
  return new StoreBackedCheckpointSaver({
    storeFactory: () => openStore(dbPath),
    encryptionKey: Buffer.from(KEY_B64, "base64"),
    ...(runtimeVersions ? { runtimeVersions } : {})
  });
}

// Minimal graph that pauses exactly once, mirroring approval_pause.
function buildPausingGraph(checkpointer) {
  const State = Annotation.Root({
    note: Annotation({ reducer: (_left, right) => right, default: () => "" }),
    approved: Annotation({ reducer: (_left, right) => right, default: () => null })
  });
  return new StateGraph(State)
    .addNode("approval_pause", (state) => {
      const token = interrupt({ kind: "consent_grant", note: state.note });
      return { approved: token };
    })
    .addEdge(START, "approval_pause")
    .addEdge("approval_pause", END)
    .compile({ checkpointer });
}

test("durable checkpointer: a pending interrupt SURVIVES a process restart", async () => {
  const dbPath = await freshDbPath();
  const config = { configurable: { thread_id: "thread-restart-1", checkpoint_ns: "" } };

  // --- process 1: pause, then discard the saver entirely (simulated restart) ---
  const saverA = saverFor(dbPath);
  const graphA = buildPausingGraph(saverA);
  const paused = await graphA.invoke({ note: PHI_NOTE }, config);
  assert.ok(paused.__interrupt__, "first invoke must pause at the interrupt");

  const snapshotA = await graphA.getState(config);
  assert.deepEqual(snapshotA.next, ["approval_pause"], "graph must be parked on approval_pause");

  // --- process 2: brand-new saver + brand-new store over the SAME database ---
  const saverB = saverFor(dbPath);
  const graphB = buildPausingGraph(saverB);

  const snapshotB = await graphB.getState(config);
  assert.deepEqual(
    snapshotB.next,
    ["approval_pause"],
    "the pending interrupt must still be there after restart — this is the whole point"
  );

  const resumed = await graphB.invoke(new Command({ resume: "approval-token-xyz" }), config);
  assert.equal(resumed.approved, "approval-token-xyz", "resume must deliver the token to interrupt()");
  assert.equal(resumed.note, PHI_NOTE, "channel state must survive the restart intact");
  assert.ok(!resumed.__interrupt__, "the graph must run to completion after resume");
});

test("durable checkpointer: PHI is ciphertext-only at rest", async () => {
  const dbPath = await freshDbPath();
  const config = { configurable: { thread_id: "thread-phi-1", checkpoint_ns: "" } };
  const graph = buildPausingGraph(saverFor(dbPath));
  await graph.invoke({ note: PHI_NOTE }, config);

  const store = await openStore(dbPath);
  const rows = await store.all("SELECT * FROM langgraph_checkpoints;", []);
  assert.ok(rows.length > 0, "a checkpoint row must exist");
  for (const row of rows) {
    assert.ok(row.checkpoint_ciphertext && row.checkpoint_iv && row.checkpoint_tag);
    assert.ok(!JSON.stringify(row).includes(PHI_NOTE), "no column may contain cleartext PHI");
    assert.ok(!JSON.stringify(row).includes("123-45-6789"), "no column may contain a cleartext SSN");
  }

  // Strongest arm: the raw database file on disk must not contain the plaintext.
  const bytes = await readFile(dbPath);
  assert.ok(!bytes.includes(Buffer.from(PHI_NOTE, "utf8")), "raw sqlite file must not contain cleartext PHI");
  assert.ok(!bytes.includes(Buffer.from("123-45-6789", "utf8")), "raw sqlite file must not contain a cleartext SSN");
});

test("durable checkpointer: a tampered ciphertext fails LOUD, never a silent null", async () => {
  const dbPath = await freshDbPath();
  const config = { configurable: { thread_id: "thread-tamper-1", checkpoint_ns: "" } };
  const graph = buildPausingGraph(saverFor(dbPath));
  await graph.invoke({ note: PHI_NOTE }, config);

  const store = await openStore(dbPath);
  // Tamper the row getTuple actually reads back: the newest checkpoint of the thread.
  const row = await store.get(
    "SELECT id, checkpoint_tag FROM langgraph_checkpoints ORDER BY checkpoint_id DESC LIMIT 1;",
    []
  );
  const flippedTag = Buffer.from(row.checkpoint_tag, "base64");
  flippedTag[0] ^= 0xff;
  await store.update("langgraph_checkpoints", { checkpoint_tag: flippedTag.toString("base64") }, { id: row.id });

  const saver = saverFor(dbPath);
  await assert.rejects(
    () => saver.getTuple(config),
    (error) => {
      assert.equal(error.failureClass, "checkpoint_ciphertext_unresolvable");
      return true;
    },
    "a tampered auth tag must throw a classified failure"
  );
});

test("durable checkpointer: pending writes round-trip, dedupe, and delete with the thread", async () => {
  const dbPath = await freshDbPath();
  const saver = saverFor(dbPath);
  const base = { configurable: { thread_id: "thread-writes-1", checkpoint_ns: "" } };

  const checkpoint = {
    v: 4,
    id: "1efb1f00-0000-6000-8000-000000000001",
    ts: new Date(0).toISOString(),
    channel_values: { note: PHI_NOTE },
    channel_versions: {},
    versions_seen: {}
  };
  const putConfig = await saver.put(base, checkpoint, { source: "loop", step: 1 });

  await saver.putWrites(putConfig, [["note", "first"]], "task-1");
  await saver.putWrites(putConfig, [["note", "second-ignored"]], "task-1");

  const tuple = await saver.getTuple(putConfig);
  assert.equal(tuple.checkpoint.id, checkpoint.id);
  assert.equal(tuple.metadata.step, 1, "metadata must decrypt back to the original object");
  assert.equal(tuple.pendingWrites.length, 1, "a positional write is insert-once (MemorySaver parity)");
  assert.deepEqual(tuple.pendingWrites[0], ["task-1", "note", "first"]);

  const listed = [];
  for await (const item of saver.list(base)) listed.push(item);
  assert.equal(listed.length, 1);

  await saver.deleteThread("thread-writes-1");
  assert.equal(await saver.getTuple(putConfig), undefined, "deleteThread must remove checkpoints");
  const store = await openStore(dbPath);
  const leftoverWrites = await store.all(
    "SELECT id FROM langgraph_checkpoint_writes WHERE thread_id = ?;",
    ["thread-writes-1"]
  );
  assert.equal(leftoverWrites.length, 0, "deleteThread must remove pending writes too");
});

test("cross-version resume: a schema change expires and re-asks, never auto-resumes", async () => {
  assert.deepEqual(resumeCompatibility(CHECKPOINT_RUNTIME_VERSIONS), {
    compatible: true,
    action: "resume",
    reason: "checkpoint_runtime_versions_match"
  });

  const changed = { ...CHECKPOINT_RUNTIME_VERSIONS, interruptSchema: "2099-01-01.interrupt-payload.v9" };
  const verdict = resumeCompatibility(changed);
  assert.equal(verdict.compatible, false);
  assert.equal(verdict.action, "expire_and_reissue");
  assert.deepEqual(verdict.mismatched, ["interruptSchema"]);

  // An unstamped (pre-Phase-91) checkpoint is never guessed at.
  assert.equal(resumeCompatibility({}).action, "expire_and_reissue");
  assert.equal(resumeCompatibility(null).reason, "checkpoint_runtime_versions_absent");
});

test("durable checkpointer: runtime versions are stamped on every checkpoint row", async () => {
  const dbPath = await freshDbPath();
  const saver = saverFor(dbPath);
  const config = { configurable: { thread_id: "thread-versions-1", checkpoint_ns: "" } };
  const graph = buildPausingGraph(saver);
  await graph.invoke({ note: "hello" }, config);

  const stamped = await saver.runtimeVersionsForThread("thread-versions-1");
  assert.deepEqual(stamped, CHECKPOINT_RUNTIME_VERSIONS);
  assert.equal(await saver.runtimeVersionsForThread("thread-that-does-not-exist"), null);
});

test("boot gate: postgres is a durable mode; production + memory still throws", async () => {
  assert.equal(durableCheckpointerMode("postgres"), "postgres");
  assert.equal(durableCheckpointerMode("file"), "file");
  assert.equal(durableCheckpointerMode("memory"), null);

  // Production profile on memory: unchanged fail-loud boot error.
  assert.throws(
    () => createGraphCheckpointer({ BRAINSTY_RUNTIME_ENV: "production", BRAINSTY_GRAPH_CHECKPOINTER: "memory" }),
    (error) => {
      assert.equal(error.failureClass, "non_durable_interrupts_in_production_profile");
      return true;
    }
  );

  // Postgres without an encryption key: refuse, because graph state carries PHI.
  assert.throws(
    () => createGraphCheckpointer({ BRAINSTY_GRAPH_CHECKPOINTER: "postgres" }),
    /BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY is required/
  );

  // Production profile on postgres: boots, durable, encrypted, and says so.
  const dbPath = await freshDbPath();
  const { checkpointer, readiness } = createGraphCheckpointer(
    {
      BRAINSTY_RUNTIME_ENV: "production",
      BRAINSTY_GRAPH_CHECKPOINTER: "postgres",
      BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY: KEY_B64
    },
    { storeFactory: () => openStore(dbPath) }
  );
  assert.equal(readiness.mode, "postgres");
  assert.equal(readiness.durable, true);
  assert.equal(readiness.survivesRestart, true);
  assert.equal(readiness.phiAtRest, "encrypted_at_rest_aes_256_gcm");
  assert.equal(readiness.productionTarget, "postgres");
  assert.ok(!("key" in readiness.encryption), "the raw key must never appear in readiness");
  assert.equal(readiness.encryption.rawKeyReturned, false);

  // The wired checkpointer really persists through the injected store.
  const graph = buildPausingGraph(checkpointer);
  const config = { configurable: { thread_id: "thread-boot-1", checkpoint_ns: "" } };
  await graph.invoke({ note: "boot" }, config);
  const snapshot = await graph.getState(config);
  assert.deepEqual(snapshot.next, ["approval_pause"]);

  // File mode under a production profile boots, but names postgres as the target.
  const fileReadiness = createGraphCheckpointer({
    BRAINSTY_RUNTIME_ENV: "production",
    BRAINSTY_GRAPH_CHECKPOINTER: "file",
    BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY: KEY_B64,
    BRAINSTY_GRAPH_CHECKPOINTER_PATH: `${dbPath}.json`
  }).readiness;
  assert.equal(fileReadiness.warning, "file_mode_not_production_target");
});

// LIVE arm (skip-loud, per docs/NON_MOCKED_PROOF_RULES.md): the arms above inject a
// store, which proves the saver but NOT the default production wiring. This one takes
// the real default factory — createGraphCheckpointer with no storeFactory — so a pass
// means a consent interrupt survives a restart on live Postgres, the declared target.
test("LIVE Postgres: default wiring survives a restart on the declared production target", async (t) => {
  const { PostgresStore } = await import("../concierge/postgresStore.mjs");
  let reachable = false;
  try {
    const probe = await new PostgresStore().initialize({ seed: false });
    await probe.get("SELECT 1 AS ok;", []);
    await probe.close();
    reachable = true;
  } catch (error) {
    t.skip(
      `SKIP-LOUD: live Postgres unreachable (${error.message}). Start the dev Postgres on :55432 (BRAINSTY_DATABASE_URL) to run the production-target checkpointer proof.`
    );
    return;
  }
  assert.ok(reachable);

  const env = {
    ...process.env,
    BRAINSTY_GRAPH_CHECKPOINTER: "postgres",
    BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY: KEY_B64
  };
  const threadId = `live-thread-${randomBytes(6).toString("hex")}`;
  const config = { configurable: { thread_id: threadId, checkpoint_ns: "" } };

  // process 1 — pause, using the DEFAULT factory (no storeFactory injected).
  const first = createGraphCheckpointer(env);
  assert.equal(first.readiness.mode, "postgres");
  await buildPausingGraph(first.checkpointer).invoke({ note: PHI_NOTE }, config);

  // process 2 — a brand-new checkpointer, its own pool, same live database.
  const second = createGraphCheckpointer(env);
  const graphB = buildPausingGraph(second.checkpointer);
  const snapshot = await graphB.getState(config);
  assert.deepEqual(snapshot.next, ["approval_pause"], "pending interrupt must survive on live Postgres");

  const resumed = await graphB.invoke(new Command({ resume: "live-token" }), config);
  assert.equal(resumed.approved, "live-token");
  assert.equal(resumed.note, PHI_NOTE);

  // PHI must be ciphertext in the live table, not just in SQLite.
  const store = await new PostgresStore().initialize({ seed: false });
  const rows = await store.all("SELECT * FROM langgraph_checkpoints WHERE thread_id = $1;", [threadId]);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.ok(!JSON.stringify(row).includes(PHI_NOTE), "live Postgres must not hold cleartext PHI");
  }

  // Clean up after ourselves: this ran against a real database.
  await second.checkpointer.deleteThread(threadId);
  const left = await store.all("SELECT id FROM langgraph_checkpoints WHERE thread_id = $1;", [threadId]);
  assert.equal(left.length, 0, "deleteThread must clean the live thread");
  await store.close();
});
