import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { DEFAULT_POSTGRES_URL } from "../concierge/postgresStore.mjs";
import {
  closeRuntimeDatabaseStore,
  getRuntimeDatabaseStore,
  runtimePostgresAuthority
} from "../concierge/databaseFactory.mjs";
import { createGraphCheckpointer } from "../concierge/graphCheckpointer.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildContextPacket, planTaskFollowups } from "../concierge/memoryHarness.mjs";
import { createId, nowIso } from "../concierge/database.mjs";
import { ingestRagDocument, queryRagEvidence } from "../concierge/knowledge/publicRagRetrieval.mjs";
import { dereferenceDeferredPointer } from "../concierge/deferredPointerStore.mjs";
import { createRuntimeContextCache } from "../concierge/runtimeContextCache.mjs";
import { loadSessionPortfolio } from "../concierge/capabilityCatalog.mjs";
import { buildRuntimeCompatibilityBundle } from "../concierge/runtimeAdapters.mjs";

const LIVE = Boolean(process.env.OPENAI_API_KEY && process.env.BRAINSTY_REDIS_URL);
const PROOF_NOTE = "synthetic encrypted single-authority checkpoint state";
const POLICY_TEXT = `The payer policy requires documented conservative therapy before elective knee replacement authorization.

The source document requires radiographic evidence and a clinician medical-necessity record.`;

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

function buildPausingGraph(checkpointer) {
  const State = Annotation.Root({
    note: Annotation({ reducer: (_left, right) => right, default: () => "" }),
    approved: Annotation({ reducer: (_left, right) => right, default: () => null })
  });
  return new StateGraph(State)
    .addNode("approval_pause", (state) => ({ approved: interrupt({ kind: "consent_grant", note: state.note }) }))
    .addEdge(START, "approval_pause")
    .addEdge("approval_pause", END)
    .compile({ checkpointer });
}

test(
  "LIVE PostgreSQL single authority: state, context/source/deferred pointers, approvals, tasks, audit, Redis rebuild, and restart",
  { skip: LIVE ? false : "OPENAI_API_KEY and BRAINSTY_REDIS_URL are required for the real PostgreSQL/Redis/deferred-pointer proof" },
  async () => {
    const baseUrl = process.env.BRAINSTY_DATABASE_URL || DEFAULT_POSTGRES_URL;
    const database = `brainsty_proof_${randomBytes(6).toString("hex")}`;
    const admin = new pg.Client(adminOptions(baseUrl));
    const tempDir = await mkdtemp(join(tmpdir(), "brainsty-postgres-authority-"));
    const secretFile = join(tempDir, "database-url");
    const encryptionKey = randomBytes(32).toString("base64");
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    await writeFile(secretFile, `${databaseUrl(baseUrl, database)}\n`, { mode: 0o600 });

    const env = {
      ...process.env,
      BRAINSTY_DB_DRIVER: "postgres",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_DATABASE_URL: "",
      BRAINSTY_DATABASE_URL_FILE: secretFile,
      BRAINSTY_DATABASE_SECRET_SOURCE: "ephemeral_local_secret_file",
      BRAINSTY_GRAPH_CHECKPOINTER: "postgres",
      BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY: encryptionKey
    };
    const priorEnv = {
      BRAINSTY_DB_DRIVER: process.env.BRAINSTY_DB_DRIVER,
      BRAINSTY_DATABASE_TARGET: process.env.BRAINSTY_DATABASE_TARGET,
      BRAINSTY_DATABASE_URL: process.env.BRAINSTY_DATABASE_URL,
      BRAINSTY_DATABASE_URL_FILE: process.env.BRAINSTY_DATABASE_URL_FILE,
      BRAINSTY_DATABASE_SECRET_SOURCE: process.env.BRAINSTY_DATABASE_SECRET_SOURCE,
      BRAINSTY_GRAPH_CHECKPOINTER: process.env.BRAINSTY_GRAPH_CHECKPOINTER,
      BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY: process.env.BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY
    };
    Object.assign(process.env, env);

    try {
      const authority = runtimePostgresAuthority(env);
      const store = await getRuntimeDatabaseStore(env);
      assert.equal(store.driver, "postgres");

      const firstCheckpointer = createGraphCheckpointer(env);
      assert.equal(firstCheckpointer.readiness.databaseAuthority, authority.authorityId);
      assert.strictEqual(await firstCheckpointer.checkpointer.store(), store, "application and checkpointer must share one pooled store");

      const { user, session, portal } = await enrollDefaultMember(store, {
        name: "Postgres Runtime Proof",
        email: `postgres-proof-${database}@example.test`,
        payer: "Aetna"
      });
      const threadId = session.langgraph_thread_id;
      const graphConfig = { configurable: { thread_id: threadId, checkpoint_ns: "" } };
      const paused = await buildPausingGraph(firstCheckpointer.checkpointer).invoke({ note: PROOF_NOTE }, graphConfig);
      assert.ok(paused.__interrupt__);

      const browserRunId = createId("apirun");
      await store.insert("browser_runs", {
        id: browserRunId,
        session_id: session.id,
        portal_account_id: portal.id,
        status: "completed_public_api_fetch",
        remote_debugger_url: "public_api:no_browser",
        start_url: "https://www.aetna.com/cpb/medical/data/600_699/0673.html",
        created_at: nowIso(),
        updated_at: nowIso()
      });
      const artifactId = createId("artifact");
      await store.insert("extraction_artifacts", {
        id: artifactId,
        browser_run_id: browserRunId,
        artifact_type: "payer_policy_document",
        content: JSON.stringify({ sourceUrl: "https://www.aetna.com/cpb/medical/data/600_699/0673.html", body: POLICY_TEXT }),
        created_at: nowIso()
      });
      const ingest = await ingestRagDocument(store, {
        sourceKey: "aetna_clinical_policy_bulletins",
        artifactId,
        text: POLICY_TEXT,
        dataClass: "official_payer_public",
        sourceEvidenceClass: "official_payer_public",
        sessionId: session.id
      });
      assert.ok(ingest.ingested > 0);
      const evidence = await queryRagEvidence(store, {
        query: "what is required before elective knee replacement authorization?",
        dataClass: "official_payer_public",
        sessionId: session.id
      });
      assert.ok(evidence.evidence.length > 0);
      const deferredPointer = evidence.evidence[0].source_pointer;
      const dereferenced = await dereferenceDeferredPointer(store, deferredPointer, { sessionId: session.id });
      assert.equal(dereferenced.authority, "postgres");
      assert.deepEqual(dereferenced.backingPointers, [`extraction_artifacts#${artifactId}`]);
      await assert.rejects(
        () => dereferenceDeferredPointer(store, "rag_chunks#missing-proof-row", { sessionId: session.id }),
        (error) => error.failureClass === "deferred_pointer_missing"
      );
      await assert.rejects(
        () => dereferenceDeferredPointer(store, `users#${user.id}`, { sessionId: session.id }),
        (error) => error.failureClass === "deferred_pointer_table_forbidden"
      );

      const eligibilityPointerId = createId("eligibility");
      await store.insert("eligibility_snapshots", {
        id: eligibilityPointerId,
        user_id: user.id,
        session_id: session.id,
        portal_account_id: portal.id,
        source_url: "https://member.aetna.com/",
        summary: "Synthetic authorized-member source pointer used only for PostgreSQL authority proof.",
        raw_text: "No PHI. Synthetic runtime proof row.",
        created_at: nowIso()
      });

      const context = await buildContextPacket(store, {
        user,
        session,
        channel: session.channel,
        userInput: "Explain knee replacement prior authorization evidence."
      });
      assert.ok(context.row.id);
      assert.ok(
        context.packet.dbPointers.some((entry) => entry.table === "eligibility_snapshots" && entry.id === eligibilityPointerId),
        "context packet must carry a PostgreSQL-backed source pointer"
      );

      const followups = await planTaskFollowups(store, {
        user,
        session,
        eventType: "claim_submitted",
        payload: { claimId: `claim-${database}`, sourceTable: "manual_event", sourceId: `event-${database}` }
      });
      assert.ok(followups.planned.length > 0);

      const portfolio = await loadSessionPortfolio(store, { sessionId: session.id });
      const cache = createRuntimeContextCache({ env });
      assert.equal(cache.backend, "redis");
      await cache.adapter.del(portfolio.cacheKey);
      const rebuilt = await loadSessionPortfolio(store, { sessionId: session.id });
      assert.equal(rebuilt.cacheHit, false);
      assert.equal(rebuilt.rebuiltFromPostgres, true);

      const compatibility = buildRuntimeCompatibilityBundle(context.packet);
      assert.equal(compatibility.memoryAuthority.workflowMemory.runtime, "langgraph_checkpointer_and_database");
      assert.equal(compatibility.memoryAuthority.longTermProductMemory.runtime, "zep_graphiti");
      assert.equal(compatibility.validation.checked.openclawProductMemoryWriteBlocked, true);

      for (const [table, where, params] of [
        ["sessions", "id = ?", [session.id]],
        ["context_packets", "id = ?", [context.row.id]],
        ["langgraph_checkpoints", "thread_id = ?", [threadId]],
        ["approval_gates", "session_id = ?", [session.id]],
        ["agent_tasks", "user_id = ?", [user.id]],
        ["audit_events", "session_id = ?", [session.id]],
        ["rag_chunks", "id = ?", [dereferenced.id]]
      ]) {
        const row = await store.get(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where};`, params);
        assert.ok(Number(row.count) > 0, `${table} must persist in PostgreSQL`);
      }
      const encryptedRows = await store.all("SELECT * FROM langgraph_checkpoints WHERE thread_id = ?;", [threadId]);
      assert.ok(encryptedRows.length > 0);
      assert.equal(JSON.stringify(encryptedRows).includes(PROOF_NOTE), false);

      await closeRuntimeDatabaseStore();
      const restartedStore = await getRuntimeDatabaseStore(env, { seed: false });
      const secondCheckpointer = createGraphCheckpointer(env);
      assert.strictEqual(await secondCheckpointer.checkpointer.store(), restartedStore);
      const resumedGraph = buildPausingGraph(secondCheckpointer.checkpointer);
      const restartSnapshot = await resumedGraph.getState(graphConfig);
      assert.deepEqual(restartSnapshot.next, ["approval_pause"]);
      const resumed = await resumedGraph.invoke(new Command({ resume: "proof-approved" }), graphConfig);
      assert.equal(resumed.note, PROOF_NOTE);
      assert.equal(resumed.approved, "proof-approved");
      const persistedContext = await restartedStore.findOne("context_packets", { id: context.row.id });
      assert.ok(persistedContext);
      const restartedPointer = await dereferenceDeferredPointer(restartedStore, deferredPointer, { sessionId: session.id });
      assert.equal(restartedPointer.id, dereferenced.id);
    } finally {
      await closeRuntimeDatabaseStore().catch(() => {});
      for (const [key, value] of Object.entries(priorEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      const active = await admin.query(
        "SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();",
        [database]
      );
      assert.equal(active.rows[0].count, 0, "the single runtime PostgreSQL pool must be fully closed before proof cleanup");
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
      await admin.end();
      await rm(tempDir, { recursive: true, force: true });
    }
  }
);
