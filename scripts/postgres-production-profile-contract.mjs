import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

export const POSTGRES_PRODUCTION_PROFILE_CONTRACT_VERSION = "2026-06-16.postgres-production-profile.v1";

const REQUIRED_FILES = [
  "compose.yaml",
  "compose.postgres.yaml",
  "project/deployment/secrets/README.md",
  "project/deployment/secrets/database-url.example",
  "src/concierge/databaseSecretProfile.mjs",
  "src/concierge/storageReadiness.mjs",
  "scripts/postgres-default-rollout-smoke.mjs"
];

const BASE_COMPOSE_FRAGMENTS = [
  "BRAINSTY_DB_DRIVER: ${BRAINSTY_DB_DRIVER:-sqlite}",
  "BRAINSTY_DATABASE_URL_FILE: ${BRAINSTY_DATABASE_URL_FILE:-}",
  "BRAINSTY_DATABASE_SECRET_SOURCE: ${BRAINSTY_DATABASE_SECRET_SOURCE:-direct_env}",
  "BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: ${BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY:-0}"
];

const PROFILE_FRAGMENTS = [
  "node-runtime:",
  "BRAINSTY_DB_DRIVER: postgres",
  "BRAINSTY_DATABASE_TARGET: postgres",
  "BRAINSTY_DATABASE_URL: \"\"",
  "BRAINSTY_DATABASE_URL_FILE: /run/secrets/brainsty_database_url",
  "BRAINSTY_DATABASE_SECRET_SOURCE: docker_secret",
  "BRAINSTY_POSTGRES_LIVE_READY: ${BRAINSTY_POSTGRES_LIVE_READY:-0}",
  "BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: ${BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY:-0}",
  "BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: ${BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY:-0}",
  "BRAINSTY_POSTGRES_WORKER_LEASE_READY: ${BRAINSTY_POSTGRES_WORKER_LEASE_READY:-0}",
  "BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: ${BRAINSTY_POSTGRES_BACKUP_RESTORE_READY:-0}",
  "BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: ${BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY:-0}",
  "BRAINSTY_DATABASE_SECRET_PROFILE_READY: ${BRAINSTY_DATABASE_SECRET_PROFILE_READY:-0}",
  "BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: ${BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY:-0}",
  "source: brainsty_database_url",
  "target: brainsty_database_url",
  "uid: \"1000\"",
  "gid: \"1000\"",
  "mode: 0400",
  "secrets:",
  "brainsty_database_url:",
  "file: ${BRAINSTY_DATABASE_URL_SECRET_FILE:-./project/deployment/secrets/database-url.example}"
];

const IGNORE_FRAGMENTS = [
  "project/deployment/secrets/*",
  "!project/deployment/secrets/README.md",
  "!project/deployment/secrets/*.example"
];

function missingFragments(body, fragments) {
  return fragments.filter((fragment) => !body.includes(fragment));
}

async function readRequiredFile(file) {
  const filePath = resolve(REPO_ROOT, file);
  await access(filePath);
  return readFile(filePath, "utf8");
}

function assertNoProofGateBypass(profileCompose) {
  const hardcodedReadyFlags = [
    "BRAINSTY_POSTGRES_LIVE_READY: \"1\"",
    "BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY: \"1\"",
    "BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY: \"1\"",
    "BRAINSTY_POSTGRES_WORKER_LEASE_READY: \"1\"",
    "BRAINSTY_POSTGRES_BACKUP_RESTORE_READY: \"1\"",
    "BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY: \"1\"",
    "BRAINSTY_DATABASE_SECRET_PROFILE_READY: \"1\"",
    "BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY: \"1\""
  ];
  const bypassed = hardcodedReadyFlags.filter((fragment) => profileCompose.includes(fragment));
  if (bypassed.length) {
    throw new Error(`compose.postgres.yaml hardcodes readiness gates: ${bypassed.join(", ")}`);
  }
}

export async function assertPostgresProductionProfileContract({ verifyDockerConfig = false } = {}) {
  const missingFiles = [];
  for (const file of REQUIRED_FILES) {
    try {
      await access(resolve(REPO_ROOT, file));
    } catch {
      missingFiles.push(file);
    }
  }
  if (missingFiles.length) {
    throw new Error(`Missing Postgres production profile files: ${missingFiles.join(", ")}`);
  }

  const [baseCompose, profileCompose, gitignore, dockerignore, secretExample] = await Promise.all([
    readRequiredFile("compose.yaml"),
    readRequiredFile("compose.postgres.yaml"),
    readRequiredFile(".gitignore"),
    readRequiredFile(".dockerignore"),
    readRequiredFile("project/deployment/secrets/database-url.example")
  ]);

  const missingBaseFragments = missingFragments(baseCompose, BASE_COMPOSE_FRAGMENTS);
  if (missingBaseFragments.length) {
    throw new Error(`compose.yaml lost safe local defaults: ${missingBaseFragments.join(", ")}`);
  }

  const missingProfileFragments = missingFragments(profileCompose, PROFILE_FRAGMENTS);
  if (missingProfileFragments.length) {
    throw new Error(`compose.postgres.yaml is missing fragments: ${missingProfileFragments.join(", ")}`);
  }

  const missingIgnoreFragments = missingFragments(`${gitignore}\n${dockerignore}`, IGNORE_FRAGMENTS);
  if (missingIgnoreFragments.length) {
    throw new Error(`secret ignore policy is missing fragments: ${missingIgnoreFragments.join(", ")}`);
  }

  if (/postgres(?:ql)?:\/\//i.test(secretExample) || /password|secret|dev-only/i.test(secretExample)) {
    throw new Error("database-url.example must stay a non-secret placeholder and must not contain a URL.");
  }

  assertNoProofGateBypass(profileCompose);

  let dockerConfig = { checked: false, ok: null, error: null };
  if (verifyDockerConfig) {
    try {
      const { stdout } = await execFileAsync("docker", ["compose", "-f", "compose.yaml", "-f", "compose.postgres.yaml", "config"], {
        cwd: REPO_ROOT,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 4
      });
      dockerConfig = {
        checked: true,
        ok: stdout.includes("BRAINSTY_DB_DRIVER: postgres") &&
          stdout.includes("/run/secrets/brainsty_database_url") &&
          stdout.includes("brainsty_database_url"),
        error: null
      };
      if (!dockerConfig.ok) {
        throw new Error("docker compose merged config did not include the Postgres secret runtime profile.");
      }
    } catch (error) {
      dockerConfig = { checked: true, ok: false, error: error.message };
      throw new Error(`docker compose Postgres profile config failed: ${error.message}`);
    }
  }

  return {
    ok: true,
    version: POSTGRES_PRODUCTION_PROFILE_CONTRACT_VERSION,
    files: REQUIRED_FILES,
    baseRuntimeDriverDefault: "sqlite",
    profileRuntimeDriverDefault: "postgres",
    secretSource: "docker_secret",
    secretMount: "/run/secrets/brainsty_database_url",
    readinessGatesRemainProofControlled: true,
    profileCommand:
      "BRAINSTY_DATABASE_URL_SECRET_FILE=/absolute/path/to/database-url docker compose -f compose.yaml -f compose.postgres.yaml up --build",
    defaultRolloutCommand: "npm run storage:postgres:default-rollout-smoke",
    dockerConfig
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const staticOnly = process.argv.includes("--static-only");
  assertPostgresProductionProfileContract({ verifyDockerConfig: !staticOnly })
    .then((result) => {
      console.log(JSON.stringify({ ...result, mode: staticOnly ? "static_only" : "docker_compose_profile_config" }, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
