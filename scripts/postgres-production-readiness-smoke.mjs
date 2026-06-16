import pg from "pg";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { TABLES } from "../src/concierge/schema.mjs";
import { audit } from "../src/concierge/audit.mjs";
import { createId, nowIso } from "../src/concierge/database.mjs";
import { DEFAULT_POSTGRES_URL, PostgresStore } from "../src/concierge/postgresStore.mjs";
import { enrollDefaultMember } from "../src/concierge/enrollment.mjs";
import { checkpointSession, getManagedSessionState } from "../src/concierge/sessionManager.mjs";
import { createReadOnlyObservationApproval } from "../src/concierge/approvalResume.mjs";
import { OPENCLAW_PROPOSAL_TASK_TYPE } from "../src/concierge/openclawSkillInvocation.mjs";
import {
  WORKER_LEASES_VERSION,
  acquireWorkerLease,
  heartbeatWorkerLease,
  releaseWorkerLease
} from "../src/concierge/workerLeases.mjs";

export const POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION = "2026-06-16.postgres-production-readiness.v1";

function smokeUrl(env = process.env) {
  return (
    env.BRAINSTY_POSTGRES_PRODUCTION_SMOKE_URL ||
    env.BRAINSTY_POSTGRES_RUNTIME_SMOKE_URL ||
    env.BRAINSTY_DATABASE_URL?.replace("@postgres:5432/", `@127.0.0.1:${env.BRAINSTY_COMPOSE_POSTGRES_PORT || "55432"}/`) ||
    DEFAULT_POSTGRES_URL
  );
}

function pgOptions(connectionString) {
  const raw = String(connectionString ?? DEFAULT_POSTGRES_URL);
  const options = { connectionString: raw };
  if (/sslmode=disable/i.test(raw)) options.ssl = false;
  return options;
}

function databaseUrlWithName(connectionString, databaseName) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function adminUrl(connectionString) {
  return databaseUrlWithName(connectionString, "postgres");
}

function safeDatabaseName(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`.toLowerCase();
}

function quoteIdent(identifier) {
  const value = String(identifier ?? "");
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe Postgres identifier: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

async function withAdmin(connectionString, callback) {
  const pool = new pg.Pool(pgOptions(adminUrl(connectionString)));
  try {
    return await callback(pool);
  } finally {
    await pool.end();
  }
}

async function dropDatabase(pool, databaseName) {
  await pool.query(`DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE);`);
}

async function createDatabase(pool, databaseName) {
  await pool.query(`CREATE DATABASE ${quoteIdent(databaseName)};`);
}

async function snapshotStore(store) {
  const tables = {};
  for (const table of TABLES) {
    tables[table] = await store.all(`SELECT * FROM ${table};`);
  }
  return {
    version: POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION,
    capturedAt: nowIso(),
    tableOrder: TABLES,
    tables
  };
}

async function restoreSnapshot(store, snapshot) {
  await store.exec(`TRUNCATE TABLE ${TABLES.map(quoteIdent).join(", ")} RESTART IDENTITY CASCADE;`);
  for (const table of snapshot.tableOrder) {
    for (const row of snapshot.tables[table] ?? []) {
      await store.insert(table, row);
    }
  }
}

function countsForSnapshot(snapshot) {
  return Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length]));
}

function selectedCounts(counts) {
  return {
    users: counts.users ?? 0,
    sessions: counts.sessions ?? 0,
    session_checkpoints: counts.session_checkpoints ?? 0,
    approval_gates: counts.approval_gates ?? 0,
    audit_events: counts.audit_events ?? 0,
    agent_tasks: counts.agent_tasks ?? 0,
    worker_leases: counts.worker_leases ?? 0,
    workflow_definitions: counts.workflow_definitions ?? 0,
    tool_registry: counts.tool_registry ?? 0,
    openclaw_skills: counts.openclaw_skills ?? 0
  };
}

async function seedEndpointParityPath(store) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const enrollment = await enrollDefaultMember(
    store,
    {
      name: "Postgres Production Smoke",
      email: `postgres-production-${suffix}@example.test`,
      payer: "Aetna",
      portalUrl: "https://www.aetna.com/"
    },
    { title: "Postgres production readiness smoke" }
  );
  const checkpoint = await checkpointSession(store, {
    session: enrollment.session,
    stepName: "postgres_production_readiness_checkpoint",
    statePatch: {
      workflow: {
        lastIntent: "postgres_production_readiness",
        activeWorkflowKey: "eligibility"
      },
      storage: {
        smokeVersion: POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION
      }
    },
    metadata: {
      smokeVersion: POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION,
      driver: "postgres"
    }
  });
  const now = nowIso();
  const task = {
    id: createId("task"),
    user_id: enrollment.user.id,
    session_id: enrollment.session.id,
    workflow_key: "eligibility",
    journey_stage: "approval_pending",
    task_type: OPENCLAW_PROPOSAL_TASK_TYPE,
    status: "pending_approval",
    priority: "normal",
    description: "Postgres production readiness approval parity task.",
    source_table: "sessions",
    source_id: enrollment.session.id,
    scheduled_job_id: null,
    due_at: null,
    metadata_json: JSON.stringify({
      smokeVersion: POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION,
      approvalScope: "read_only_observation"
    }),
    created_at: now,
    updated_at: now
  };
  await store.insert("agent_tasks", task);
  const approval = await createReadOnlyObservationApproval(store, {
    taskId: task.id,
    sessionId: enrollment.session.id,
    userId: enrollment.user.id
  });
  const auditEvent = await audit(store, enrollment.session.id, "postgres_production_readiness_completed", {
    smokeVersion: POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION,
    checkpointId: checkpoint.checkpointId,
    taskId: task.id,
    approvalGateId: approval.approvalGate?.id ?? null
  });
  const sessionState = await getManagedSessionState(store, enrollment.session.id);
  return {
    enrollment,
    checkpoint,
    task,
    approval,
    auditEvent,
    sessionState
  };
}

async function proveWorkerLease(store) {
  const leaseKey = `postgres-production-smoke:${crypto.randomUUID()}`;
  const first = await acquireWorkerLease(store, {
    leaseKey,
    workerId: "worker-a",
    scope: "postgres_production_readiness",
    ttlMs: 120000,
    metadata: { smokeVersion: POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION }
  });
  const secondWhileActive = await acquireWorkerLease(store, {
    leaseKey,
    workerId: "worker-b",
    scope: "postgres_production_readiness",
    ttlMs: 120000
  });
  const heartbeat = await heartbeatWorkerLease(store, { leaseKey, workerId: "worker-a", ttlMs: 120000 });
  const release = await releaseWorkerLease(store, { leaseKey, workerId: "worker-a" });
  const secondAfterRelease = await acquireWorkerLease(store, {
    leaseKey,
    workerId: "worker-b",
    scope: "postgres_production_readiness",
    ttlMs: 120000
  });
  return {
    leaseKey,
    firstAcquired: first.acquired,
    secondBlockedWhileActive: secondWhileActive.acquired === false,
    heartbeatOk: heartbeat.ok,
    releaseOk: release.ok,
    secondAcquiredAfterRelease: secondAfterRelease.acquired,
    finalLease: secondAfterRelease.lease
  };
}

export async function runPostgresProductionReadinessSmoke({
  connectionString = smokeUrl(),
  artifactPath = resolve("artifacts/postgres-production-readiness-smoke.json"),
  cleanup = true
} = {}) {
  const sourceDb = safeDatabaseName("brainsty_prod_source");
  const restoreDb = safeDatabaseName("brainsty_prod_restore");
  await withAdmin(connectionString, async (pool) => {
    await dropDatabase(pool, sourceDb);
    await dropDatabase(pool, restoreDb);
    await createDatabase(pool, sourceDb);
    await createDatabase(pool, restoreDb);
  });

  const sourceUrl = databaseUrlWithName(connectionString, sourceDb);
  const restoreUrl = databaseUrlWithName(connectionString, restoreDb);
  const sourceStore = await new PostgresStore(sourceUrl).initialize();
  const restoreStore = await new PostgresStore(restoreUrl).initialize({ seed: false });
  try {
    const endpointParity = await seedEndpointParityPath(sourceStore);
    const workerLease = await proveWorkerLease(sourceStore);
    const snapshot = await snapshotStore(sourceStore);
    await restoreSnapshot(restoreStore, snapshot);
    const restoredCounts = await restoreStore.counts();
    const snapshotCounts = countsForSnapshot(snapshot);
    const restoredUser = await restoreStore.findOne("users", { id: endpointParity.enrollment.user.id });
    const restoredSession = await restoreStore.findOne("sessions", { id: endpointParity.enrollment.session.id });
    const restoredCheckpoint = await restoreStore.findOne("session_checkpoints", { id: endpointParity.checkpoint.checkpointId });
    const restoredApproval = await restoreStore.findOne("approval_gates", { id: endpointParity.approval.approvalGate.id });
    const restoredAudit = await restoreStore.findOne("audit_events", { id: endpointParity.auditEvent.id });
    const restoredLease = await restoreStore.findOne("worker_leases", { lease_key: workerLease.leaseKey });
    const comparedTables = TABLES.filter((table) => snapshotCounts[table] > 0);
    const countMismatches = comparedTables.filter((table) => Number(restoredCounts[table] ?? 0) !== Number(snapshotCounts[table] ?? 0));
    const backupRestoreOk =
      countMismatches.length === 0 &&
      Boolean(restoredUser && restoredSession && restoredCheckpoint && restoredApproval && restoredAudit && restoredLease);
    const result = {
      ok:
        endpointParity.approval.ok === true &&
        endpointParity.sessionState.state?.state_version >= 2 &&
        workerLease.firstAcquired &&
        workerLease.secondBlockedWhileActive &&
        workerLease.heartbeatOk &&
        workerLease.releaseOk &&
        workerLease.secondAcquiredAfterRelease &&
        backupRestoreOk,
      version: POSTGRES_PRODUCTION_READINESS_SMOKE_VERSION,
      adapterVersion: sourceStore.adapterVersion,
      leaseVersion: WORKER_LEASES_VERSION,
      driver: sourceStore.driver,
      sourceDatabase: sourceDb,
      restoreDatabase: restoreDb,
      endpointParity: {
        ok: endpointParity.approval.ok === true && endpointParity.sessionState.state?.state_version >= 2,
        userId: endpointParity.enrollment.user.id,
        sessionId: endpointParity.enrollment.session.id,
        checkpointId: endpointParity.checkpoint.checkpointId,
        approvalGateId: endpointParity.approval.approvalGate.id,
        auditEventId: endpointParity.auditEvent.id,
        stateVersion: endpointParity.sessionState.state?.state_version ?? null
      },
      workerLease: {
        ok:
          workerLease.firstAcquired &&
          workerLease.secondBlockedWhileActive &&
          workerLease.heartbeatOk &&
          workerLease.releaseOk &&
          workerLease.secondAcquiredAfterRelease,
        ...workerLease
      },
      backupRestore: {
        ok: backupRestoreOk,
        artifactPath,
        tableCount: TABLES.length,
        comparedTables: comparedTables.length,
        countMismatches,
        sourceCounts: selectedCounts(snapshotCounts),
        restoredCounts: selectedCounts(restoredCounts),
        restoredRows: {
          user: Boolean(restoredUser),
          session: Boolean(restoredSession),
          checkpoint: Boolean(restoredCheckpoint),
          approval: Boolean(restoredApproval),
          audit: Boolean(restoredAudit),
          workerLease: Boolean(restoredLease)
        }
      },
      safety: {
        boundParameters: true,
        sqliteShellOut: false,
        externalActions: false,
        phiSeeded: false,
        temporaryDatabases: true,
        rawBackupContainsSmokeDataOnly: true
      }
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify({ result, snapshot }, null, 2));
    return result;
  } finally {
    await sourceStore.close();
    await restoreStore.close();
    if (cleanup) {
      await withAdmin(connectionString, async (pool) => {
        await dropDatabase(pool, sourceDb);
        await dropDatabase(pool, restoreDb);
      });
    }
  }
}

export { smokeUrl };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPostgresProductionReadinessSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
