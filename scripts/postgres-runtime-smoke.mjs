import { fileURLToPath } from "node:url";
import { audit } from "../src/concierge/audit.mjs";
import { createId, nowIso } from "../src/concierge/database.mjs";
import { getDatabaseUrlFromEnv } from "../src/concierge/databaseSecretProfile.mjs";
import { DEFAULT_POSTGRES_URL, PostgresStore } from "../src/concierge/postgresStore.mjs";
import { enrollDefaultMember } from "../src/concierge/enrollment.mjs";
import { checkpointSession, getManagedSessionState } from "../src/concierge/sessionManager.mjs";

const SMOKE_VERSION = "2026-06-16.postgres-runtime-parity.v1";

function smokeUrl(env = process.env) {
  const url = env.BRAINSTY_POSTGRES_RUNTIME_SMOKE_URL || getDatabaseUrlFromEnv(env) || DEFAULT_POSTGRES_URL;
  return String(url).replace("@postgres:5432/", `@127.0.0.1:${env.BRAINSTY_COMPOSE_POSTGRES_PORT || "55432"}/`);
}

async function runPostgresRuntimeSmoke({ connectionString = smokeUrl() } = {}) {
  const store = await new PostgresStore(connectionString).initialize();
  const suffix = crypto.randomUUID().slice(0, 8);
  const member = {
    name: "Postgres Runtime Smoke",
    email: `postgres-runtime-${suffix}@example.test`,
    payer: "Aetna",
    portalUrl: "https://www.aetna.com/"
  };
  try {
    const enrollment = await enrollDefaultMember(store, member, { title: "Postgres runtime parity smoke" });
    const checkpoint = await checkpointSession(store, {
      session: enrollment.session,
      stepName: "postgres_runtime_smoke_checkpoint",
      statePatch: {
        workflow: {
          lastIntent: "storage_runtime_parity"
        },
        storage: {
          smokeVersion: SMOKE_VERSION,
          adapterVersion: store.adapterVersion
        }
      },
      metadata: {
        smokeVersion: SMOKE_VERSION,
        driver: "postgres"
      }
    });
    const auditEvent = await audit(store, enrollment.session.id, "postgres_runtime_smoke_completed", {
      smokeVersion: SMOKE_VERSION,
      adapterVersion: store.adapterVersion,
      checkpointId: checkpoint.checkpointId
    });

    await store.transaction(async (tx) => {
      await tx.insert("runtime_events", {
        id: createId("rtevt"),
        session_id: enrollment.session.id,
        user_id: enrollment.user.id,
        source: "postgres_runtime_smoke",
        event_type: "postgres_runtime_smoke_rolled_back",
        correlation_id: checkpoint.checkpointId,
        payload_json: JSON.stringify({ shouldRollback: true }),
        created_at: nowIso()
      });
      throw new Error("intentional postgres rollback proof");
    }).catch((error) => {
      if (!String(error.message).includes("intentional postgres rollback proof")) throw error;
    });

    const rolledBack = await store.findOne("runtime_events", {
      event_type: "postgres_runtime_smoke_rolled_back",
      correlation_id: checkpoint.checkpointId
    });
    const sessionState = await getManagedSessionState(store, enrollment.session.id);
    const counts = await store.counts();
    const migration = await store.findOne("schema_migrations", { migration_key: "schema:base" });
    return {
      ok: true,
      version: SMOKE_VERSION,
      adapterVersion: store.adapterVersion,
      driver: store.driver,
      userId: enrollment.user.id,
      sessionId: enrollment.session.id,
      checkpointId: checkpoint.checkpointId,
      auditEventId: auditEvent.id,
      stateVersion: sessionState.state?.state_version ?? null,
      migrationRecorded: Boolean(migration),
      rollbackProved: rolledBack === null,
      tableCount: Object.keys(counts).length,
      coreCounts: {
        users: counts.users,
        sessions: counts.sessions,
        session_checkpoints: counts.session_checkpoints,
        audit_events: counts.audit_events,
        workflow_definitions: counts.workflow_definitions,
        tool_registry: counts.tool_registry,
        openclaw_skills: counts.openclaw_skills
      },
      safety: {
        boundParameters: true,
        sqliteShellOut: false,
        externalActions: false,
        phiSeeded: false
      }
    };
  } finally {
    await store.close();
  }
}

export { runPostgresRuntimeSmoke, SMOKE_VERSION };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPostgresRuntimeSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
