import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runPostgresDefaultRolloutSmoke } from "./postgres-default-rollout-smoke.mjs";

const execFileAsync = promisify(execFile);

export const POSTGRES_PRODUCTION_PROFILE_LIVE_SMOKE_VERSION = "2026-06-16.postgres-production-profile-live.v1";

const DEFAULT_PORTS = {
  node: "4296",
  api: "8296",
  mobile: "3296",
  postgres: "65432",
  falkordb: "6580",
  falkordbUi: "3297"
};

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function composeArgs(projectName) {
  return ["compose", "-p", projectName, "-f", "compose.yaml", "-f", "compose.postgres.yaml"];
}

async function dockerCompose(projectName, args, env, options = {}) {
  const { stdout, stderr } = await execFileAsync("docker", [...composeArgs(projectName), ...args], {
    cwd: resolve("."),
    env,
    timeout: options.timeoutMs ?? 120000,
    maxBuffer: 1024 * 1024 * 8
  });
  return { stdout, stderr };
}

function buildPostgresUrl({ host, port, database, user, password }) {
  const url = new URL(`postgresql://${host}:${port}/${database}`);
  url.username = user;
  url.password = password;
  url.searchParams.set("sslmode", "disable");
  return url.toString();
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
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${url} failed ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

async function waitForJson(url, validate, timeoutMs = 120000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const payload = await requestJson(url);
      if (validate(payload)) return payload;
      lastError = new Error(`Unexpected payload from ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function waitForTextOk(url, timeoutMs = 120000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return { ok: true, status: response.status };
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function waitForPostgresReady(projectName, env, user, database, timeoutMs = 120000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      await dockerCompose(projectName, ["exec", "-T", "postgres", "pg_isready", "-U", user, "-d", database], env, { timeoutMs: 15000 });
      return { ok: true };
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
  }
  throw lastError ?? new Error("Timed out waiting for profile Postgres readiness.");
}

function scoreFor(proof, key) {
  return (proof.scores ?? []).find((item) => item.key === key) ?? null;
}

function buildComposeEnv({ tempDir, projectName, ports, hostSecretFile, dockerSecretFile }) {
  return {
    ...process.env,
    COMPOSE_PROJECT_NAME: projectName,
    BRAINSTY_COMPOSE_NODE_PORT: ports.node,
    BRAINSTY_COMPOSE_API_PORT: ports.api,
    BRAINSTY_COMPOSE_MOBILE_PORT: ports.mobile,
    BRAINSTY_COMPOSE_POSTGRES_PORT: ports.postgres,
    BRAINSTY_COMPOSE_FALKORDB_PORT: ports.falkordb,
    BRAINSTY_COMPOSE_FALKORDB_UI_PORT: ports.falkordbUi,
    BRAINSTY_DATABASE_URL_SECRET_FILE: dockerSecretFile,
    BRAINSTY_PRODUCT_MEMORY_ADAPTER: "disabled",
    BRAINSTY_POSTGRES_LIVE_READY: "1",
    BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: "1",
    BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: "1",
    BRAINSTY_POSTGRES_WORKER_LEASE_READY: "1",
    BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: "1",
    BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: "1",
    BRAINSTY_DATABASE_SECRET_PROFILE_READY: "1",
    BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: "1",
    BRAINSTY_PROFILE_SMOKE_TEMP_HASH: sha256(tempDir),
    BRAINSTY_PROFILE_SMOKE_HOST_SECRET_HASH: sha256(hostSecretFile),
    BRAINSTY_PROFILE_SMOKE_DOCKER_SECRET_HASH: sha256(dockerSecretFile)
  };
}

function defaultPorts(env = process.env) {
  return {
    node: env.BRAINSTY_PROFILE_SMOKE_NODE_PORT || DEFAULT_PORTS.node,
    api: env.BRAINSTY_PROFILE_SMOKE_API_PORT || DEFAULT_PORTS.api,
    mobile: env.BRAINSTY_PROFILE_SMOKE_MOBILE_PORT || DEFAULT_PORTS.mobile,
    postgres: env.BRAINSTY_PROFILE_SMOKE_POSTGRES_PORT || DEFAULT_PORTS.postgres,
    falkordb: env.BRAINSTY_PROFILE_SMOKE_FALKORDB_PORT || DEFAULT_PORTS.falkordb,
    falkordbUi: env.BRAINSTY_PROFILE_SMOKE_FALKORDB_UI_PORT || DEFAULT_PORTS.falkordbUi
  };
}

export async function runPostgresProductionProfileLiveSmoke({
  projectName = process.env.BRAINSTY_PROFILE_SMOKE_PROJECT || `brainstyworkers-profile-smoke-${Date.now()}`,
  ports = defaultPorts(),
  keepStack = process.env.BRAINSTY_PROFILE_SMOKE_KEEP_STACK === "1",
  skipBuild = process.env.BRAINSTY_PROFILE_SMOKE_SKIP_BUILD === "1",
  artifactPath = resolve("artifacts/postgres-production-profile-live-smoke.json")
} = {}) {
  const runtimeSecretRoot = resolve("project/deployment/secrets/.runtime");
  await mkdir(runtimeSecretRoot, { recursive: true });
  const tempDir = await mkdtemp(join(runtimeSecretRoot, "postgres-profile-live-"));
  const hostSecretFile = join(tempDir, "host-database-url");
  const dockerSecretFile = join(tempDir, "docker-database-url");
  const database = process.env.BRAINSTY_POSTGRES_DB || "brainstyworkers";
  const user = process.env.BRAINSTY_POSTGRES_USER || "brainsty";
  const password = process.env.BRAINSTY_POSTGRES_PASSWORD || "brainsty-dev-only";
  await writeFile(hostSecretFile, `${buildPostgresUrl({ host: "127.0.0.1", port: ports.postgres, database, user, password })}\n`, {
    mode: 0o600
  });
  await writeFile(dockerSecretFile, `${buildPostgresUrl({ host: "postgres", port: "5432", database, user, password })}\n`, {
    mode: 0o600
  });

  const composeEnv = buildComposeEnv({ tempDir, projectName, ports, hostSecretFile, dockerSecretFile });
  const commands = [];
  async function runCompose(args, options) {
    commands.push(`docker ${composeArgs(projectName).join(" ")} ${args.join(" ")}`);
    return dockerCompose(projectName, args, composeEnv, options);
  }

  try {
    await runCompose(["up", "-d", "postgres"], { timeoutMs: 120000 });
    await waitForPostgresReady(projectName, composeEnv, user, database);

    const defaultRollout = await runPostgresDefaultRolloutSmoke({
      env: {
        ...process.env,
        BRAINSTY_COMPOSE_POSTGRES_PORT: ports.postgres,
        BRAINSTY_DATABASE_URL_FILE: hostSecretFile,
        BRAINSTY_DATABASE_SECRET_SOURCE: "ephemeral_local_secret_file"
      },
      artifactPath: resolve("artifacts/postgres-production-profile-live-default-rollout.json")
    });
    if (!defaultRollout.ok) throw new Error("Default rollout smoke did not pass before profile startup.");

    const upArgs = ["up", "-d"];
    if (!skipBuild) upArgs.push("--build");
    upArgs.push("node-runtime", "fastapi", "mobile-pwa");
    await runCompose(upArgs, { timeoutMs: 300000 });

    const nodeBase = `http://127.0.0.1:${ports.node}`;
    const apiBase = `http://127.0.0.1:${ports.api}`;
    const mobileBase = `http://127.0.0.1:${ports.mobile}`;
    const nodeHealth = await waitForJson(
      `${nodeBase}/api/health`,
      (payload) => payload.databaseDriver === "postgres" && payload.storage?.status === "postgres_production_ready",
      150000
    );
    const proof = await waitForJson(
      `${nodeBase}/api/proof/runs/postgres-production-profile-live`,
      (payload) => scoreFor(payload, "database_product_ready_architecture")?.score === 100,
      30000
    );
    const apiHealth = await waitForJson(`${apiBase}/api/v1/health`, (payload) => payload.status === "ok" && payload.node_runtime_ok === true, 90000);
    const mobile = await waitForTextOk(`${mobileBase}/`, 90000);

    const result = {
      ok:
        nodeHealth.databaseDriver === "postgres" &&
        nodeHealth.storage?.status === "postgres_production_ready" &&
        scoreFor(proof, "database_product_ready_architecture")?.score === 100 &&
        scoreFor(proof, "database_deployment_profile")?.score === 100 &&
        apiHealth.node_runtime_ok === true &&
        mobile.ok === true,
      version: POSTGRES_PRODUCTION_PROFILE_LIVE_SMOKE_VERSION,
      projectName,
      keptStack: keepStack,
      ports,
      commands,
      secretFilePathHashes: {
        host: sha256(hostSecretFile),
        docker: sha256(dockerSecretFile)
      },
      defaultRollout: {
        ok: defaultRollout.ok,
        status: defaultRollout.status,
        storage: defaultRollout.storage,
        productionSmoke: defaultRollout.productionSmoke
      },
      checks: {
        nodeHealth: {
          databaseDriver: nodeHealth.databaseDriver,
          databaseAdapterVersion: nodeHealth.databaseAdapterVersion,
          storageStatus: nodeHealth.storage?.status,
          storageScore: nodeHealth.storage?.score,
          fullMigrationReady: Boolean(nodeHealth.storage?.fullMigrationReady),
          migrationPending: Boolean(nodeHealth.storage?.migrationPending)
        },
        connectorProof: {
          status: proof.status,
          databaseProductReadyScore: scoreFor(proof, "database_product_ready_architecture"),
          databaseDeploymentProfileScore: scoreFor(proof, "database_deployment_profile")
        },
        fastapi: {
          status: apiHealth.status,
          nodeRuntimeOk: Boolean(apiHealth.node_runtime_ok)
        },
        mobile
      },
      safety: {
        dockerSecretSource: true,
        rawDatabaseUrlWritten: false,
        rawSecretFilePathWritten: false,
        externalActions: false,
        productMemoryAdapter: "disabled"
      }
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(result, null, 2));
    return result;
  } finally {
    if (!keepStack) {
      await dockerCompose(projectName, ["down", "-v", "--remove-orphans"], composeEnv, { timeoutMs: 120000 }).catch(() => null);
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPostgresProductionProfileLiveSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
