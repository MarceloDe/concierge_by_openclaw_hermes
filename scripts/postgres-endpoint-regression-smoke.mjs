import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { smokeUrl } from "./postgres-production-readiness-smoke.mjs";

export const POSTGRES_ENDPOINT_REGRESSION_SMOKE_VERSION = "2026-06-16.postgres-endpoint-regression.v1";

const DEFAULT_PORT = Number(process.env.BRAINSTY_POSTGRES_ENDPOINT_SMOKE_PORT ?? 4197);
const ARTIFACT_PATH = resolve("artifacts/postgres-endpoint-regression-smoke.json");

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} failed ${response.status}: ${text.slice(0, 300)}`);
  }
  return body;
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function prepareSecretFile(env) {
  if (env.BRAINSTY_DATABASE_URL_FILE) {
    return {
      env: {
        ...env,
        BRAINSTY_DATABASE_SECRET_SOURCE: env.BRAINSTY_DATABASE_SECRET_SOURCE || "local_secret_file"
      },
      cleanup: async () => {},
      generated: false,
      filePathHash: sha256(env.BRAINSTY_DATABASE_URL_FILE)
    };
  }
  const tempDir = await mkdtemp(join(tmpdir(), "brainsty-postgres-endpoint-secret-"));
  const secretFile = join(tempDir, "database-url");
  await writeFile(secretFile, `${smokeUrl(env)}\n`, { mode: 0o600 });
  return {
    env: {
      ...env,
      BRAINSTY_DATABASE_URL_FILE: secretFile,
      BRAINSTY_DATABASE_SECRET_SOURCE: "ephemeral_local_secret_file"
    },
    cleanup: async () => rm(tempDir, { recursive: true, force: true }),
    generated: true,
    filePathHash: sha256(secretFile)
  };
}

async function waitForHealth(baseUrl, timeoutMs = 45000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const health = await requestJson(`${baseUrl}/api/health`);
      if (health.databaseDriver === "postgres") return health;
      lastError = new Error(`health returned driver ${health.databaseDriver}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
  }
  throw lastError ?? new Error("Timed out waiting for Postgres endpoint smoke server.");
}

function startServer(env, port) {
  const child = spawn(process.execPath, ["src/server/server.mjs"], {
    cwd: resolve("."),
    env: {
      ...env,
      HOST: "127.0.0.1",
      PORT: String(port),
      BRAINSTY_DB_DRIVER: "postgres",
      BRAINSTY_DATABASE_TARGET: "postgres",
      BRAINSTY_POSTGRES_LIVE_READY: "1",
      BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: "1",
      BRAINSTY_POSTGRES_WORKER_LEASE_READY: "1",
      BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: "1",
      BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: "1",
      BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1",
      BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: "1",
      BRAINSTY_PRODUCT_MEMORY_ADAPTER: "disabled"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGINT");
  await new Promise((resolveStop) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolveStop();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
  });
}

function summarizeHealth(health) {
  return {
    databaseDriver: health.databaseDriver,
    databaseAdapterVersion: health.databaseAdapterVersion,
    storageStatus: health.storage?.status ?? null,
    storageScore: health.storage?.score ?? null,
    fullMigrationReady: Boolean(health.storage?.fullMigrationReady),
    migrationPending: Boolean(health.storage?.migrationPending),
    secretProfileReady: Boolean(health.storage?.safety?.secretProfileReady),
    defaultRolloutReady: Boolean(health.storage?.postgres?.defaultRolloutReady)
  };
}

function scoreFor(proof, key) {
  return (proof.scores ?? []).find((item) => item.key === key) ?? null;
}

export async function runPostgresEndpointRegressionSmoke({
  env = process.env,
  port = DEFAULT_PORT,
  artifactPath = ARTIFACT_PATH
} = {}) {
  const prepared = await prepareSecretFile(env);
  const baseUrl = `http://127.0.0.1:${port}`;
  const { child, logs } = startServer(prepared.env, port);
  try {
    const health = await waitForHealth(baseUrl);
    assertCondition(health.storage?.status === "postgres_production_ready", "Node health did not report postgres_production_ready.");
    assertCondition(health.storage?.score === 100, "Node health did not report database score 100.");

    const proof = await requestJson(`${baseUrl}/api/proof/runs/postgres-endpoint-regression`);
    assertCondition(scoreFor(proof, "database_product_ready_architecture")?.score === 100, "Proof score did not report database architecture 100.");
    assertCondition(scoreFor(proof, "database_deployment_profile")?.score === 100, "Proof score did not report deployment profile 100.");

    const skills = await requestJson(`${baseUrl}/api/openclaw/skills`);
    const skillCount = Array.isArray(skills.artifacts)
      ? skills.artifacts.length
      : Array.isArray(skills.skills)
        ? skills.skills.length
        : Array.isArray(skills)
          ? skills.length
          : 0;
    assertCondition(skillCount >= 3, "OpenClaw skill registry did not expose at least three skills.");

    const suffix = randomUUID().slice(0, 8);
    const member = {
      name: "Postgres Endpoint Smoke",
      email: `postgres-endpoint-${suffix}@example.test`,
      payer: "Aetna",
      portalUrl: "https://www.aetna.com/"
    };
    const auth = await requestJson(`${baseUrl}/api/orchestrator/auth-start`, {
      method: "POST",
      body: JSON.stringify({ member })
    });
    assertCondition(Boolean(auth.user?.id && auth.session?.id), "Auth-start did not return user/session ids.");

    const memoryContext = await requestJson(
      `${baseUrl}/api/memory/context?userId=${encodeURIComponent(auth.user.id)}&sessionId=${encodeURIComponent(auth.session.id)}`
    );
    assertCondition(Boolean(memoryContext.row?.id || memoryContext.packet), "Memory context endpoint did not return a context packet.");

    const chat = await requestJson(`${baseUrl}/api/chat`, {
      method: "POST",
      body: JSON.stringify({
        member,
        sessionId: auth.session.id,
        message: "Check my benefits and explain what evidence is still needed.",
        useLiveModel: false,
        executeEvidenceObservation: false
      })
    });
    assertCondition(Boolean(chat.session?.id && chat.finalResponse), "Chat endpoint did not return a final response.");
    assertCondition(Array.isArray(chat.ai2uiBlocks), "Chat endpoint did not return AI2UI blocks.");

    const envelope = await requestJson(`${baseUrl}/api/openclaw/skills/insurance_portal_browser/validate-envelope`, {
      method: "POST",
      body: JSON.stringify({
        member,
        sessionId: auth.session.id,
        message: "Validate a read-only insurance portal browser proposal."
      })
    });
    assertCondition(envelope.executionMode === "proposal_only", "OpenClaw validation did not remain proposal-only.");
    assertCondition((envelope.actionsTaken ?? []).length === 0, "OpenClaw validation took actions during endpoint regression.");

    const result = {
      ok: true,
      version: POSTGRES_ENDPOINT_REGRESSION_SMOKE_VERSION,
      baseUrl,
      generatedSecretFile: prepared.generated,
      secretFilePathHash: prepared.filePathHash,
      checks: {
        health: summarizeHealth(health),
        proof: {
          status: proof.status,
          databaseProductReadyScore: scoreFor(proof, "database_product_ready_architecture"),
          databaseDeploymentProfileScore: scoreFor(proof, "database_deployment_profile")
        },
        openclawSkills: { skillCount },
        authStart: { userId: auth.user.id, sessionId: auth.session.id },
        memoryContext: { contextPacketId: memoryContext.row?.id ?? null },
        chat: {
          sessionId: chat.session.id,
          finalResponsePresent: Boolean(chat.finalResponse),
          ai2uiBlockCount: chat.ai2uiBlocks.length,
          sourcePointerCount: chat.sourcePointers?.length ?? 0
        },
        openclawEnvelope: {
          executionMode: envelope.executionMode,
          actionsTakenCount: envelope.actionsTaken?.length ?? 0,
          proposalStatus: envelope.proposal?.status ?? null
        }
      },
      safety: {
        rawDatabaseUrlWritten: false,
        rawSecretFilePathWritten: false,
        externalActions: false,
        openclawActionsTaken: false,
        phiSeeded: false
      }
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(result, null, 2));
    return result;
  } finally {
    await stopServer(child);
    await prepared.cleanup();
    if (child.exitCode && child.exitCode !== 0) {
      const logText = logs.join("").slice(-2000);
      throw new Error(`Postgres endpoint smoke server exited ${child.exitCode}: ${logText}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPostgresEndpointRegressionSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
