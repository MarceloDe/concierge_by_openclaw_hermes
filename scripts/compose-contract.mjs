import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const REQUIRED_FILES = [
  ".dockerignore",
  "Dockerfile.node",
  "Dockerfile.api",
  "apps/mobile-next/Dockerfile",
  "compose.yaml",
  "scripts/compose-memory-smoke.mjs",
  "tools/graphiti/graphiti_bridge.py",
  "vendor/getzep-graphiti/pyproject.toml",
  "src/tests/deployment-graphiti-compose.test.mjs"
];

const COMPOSE_FRAGMENTS = [
  "node-runtime:",
  "fastapi:",
  "mobile-pwa:",
  "falkordb:",
  "WEFELLA_NODE_RUNTIME_URL: http://node-runtime:4173",
  "BRAINSTY_CONNECTOR_API_BASE: http://fastapi:8000",
  "BRAINSTY_PRODUCT_MEMORY_ADAPTER: ${BRAINSTY_PRODUCT_MEMORY_ADAPTER:-disabled}",
  "OPENAI_API_KEY: ${OPENAI_API_KEY:-}",
  "GRAPHITI_LLM_MODEL: ${GRAPHITI_LLM_MODEL:-gpt-4.1-mini}",
  "GRAPHITI_EMBEDDING_MODEL: ${GRAPHITI_EMBEDDING_MODEL:-text-embedding-3-small}",
  "FALKORDB_HOST: falkordb",
  "/api/v1/health",
  "/api/health",
  "condition: service_healthy",
  "node_runtime_data:",
  "fastapi_data:",
  "falkordb_data:"
];

const DOCKERIGNORE_FRAGMENTS = [
  ".env",
  ".env.*",
  "node_modules",
  "**/node_modules",
  ".venv-graphiti",
  "data",
  "artifacts"
];

export async function assertDeploymentComposeContract({ verifyDockerConfig = false } = {}) {
  const missingFiles = [];
  for (const file of REQUIRED_FILES) {
    try {
      await access(resolve(REPO_ROOT, file));
    } catch {
      missingFiles.push(file);
    }
  }
  if (missingFiles.length) {
    throw new Error(`Missing deployment files: ${missingFiles.join(", ")}`);
  }

  const compose = await readFile(resolve(REPO_ROOT, "compose.yaml"), "utf8");
  const dockerignore = await readFile(resolve(REPO_ROOT, ".dockerignore"), "utf8");
  const nodeDockerfile = await readFile(resolve(REPO_ROOT, "Dockerfile.node"), "utf8");
  const apiDockerfile = await readFile(resolve(REPO_ROOT, "Dockerfile.api"), "utf8");
  const mobileDockerfile = await readFile(resolve(REPO_ROOT, "apps/mobile-next/Dockerfile"), "utf8");

  const missingComposeFragments = COMPOSE_FRAGMENTS.filter((fragment) => !compose.includes(fragment));
  if (missingComposeFragments.length) {
    throw new Error(`compose.yaml is missing required fragments: ${missingComposeFragments.join(", ")}`);
  }

  const missingIgnoreFragments = DOCKERIGNORE_FRAGMENTS.filter((fragment) => !dockerignore.includes(fragment));
  if (missingIgnoreFragments.length) {
    throw new Error(`.dockerignore is missing required fragments: ${missingIgnoreFragments.join(", ")}`);
  }

  for (const [name, body, expected] of [
    [
      "Dockerfile.node",
      nodeDockerfile,
      [
        "npm ci --omit=dev",
        "HOST=0.0.0.0",
        "python3 -m venv .venv-graphiti",
        "vendor/getzep-graphiti[falkordb]",
        "graphiti_core.driver.falkordb_driver",
        "USER node",
        "HEALTHCHECK",
        "/api/health"
      ]
    ],
    ["Dockerfile.api", apiDockerfile, ["python:3.12-slim", "project/requirements.txt", "USER app", "HEALTHCHECK", "/api/v1/health"]],
    ["apps/mobile-next/Dockerfile", mobileDockerfile, ["npm run build", "BRAINSTY_CONNECTOR_API_BASE=http://fastapi:8000", "USER node", "HEALTHCHECK", "server.js"]]
  ]) {
    const missing = expected.filter((fragment) => !body.includes(fragment));
    if (missing.length) {
      throw new Error(`${name} is missing required fragments: ${missing.join(", ")}`);
    }
  }

  if (!compose.includes("externalWriteActionsWithoutApproval") && !compose.includes("WEFELLA_NODE_RUNTIME_URL")) {
    throw new Error("Deployment contract does not visibly preserve the FastAPI-to-Node connector boundary.");
  }

  let dockerConfig = { checked: false, ok: null, error: null };
  if (verifyDockerConfig) {
    try {
      const { stdout } = await execFileAsync("docker", ["compose", "config"], {
        cwd: REPO_ROOT,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 4
      });
      dockerConfig = {
        checked: true,
        ok: stdout.includes("node-runtime") && stdout.includes("fastapi") && stdout.includes("mobile-pwa"),
        error: null
      };
      if (!dockerConfig.ok) {
        throw new Error("docker compose config output did not include required services.");
      }
    } catch (error) {
      dockerConfig = { checked: true, ok: false, error: error.message };
      throw new Error(`docker compose config failed: ${error.message}`);
    }
  }

  return {
    ok: true,
    files: REQUIRED_FILES,
    services: ["node-runtime", "fastapi", "mobile-pwa", "falkordb"],
    graphitiRuntime: {
      dockerfileReady: true,
      bridge: "tools/graphiti/graphiti_bridge.py",
      packageSource: "vendor/getzep-graphiti",
      backend: "falkordb",
      smokeCommand: "npm run docker:memory:smoke"
    },
    dockerConfig
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const staticOnly = process.argv.includes("--static-only");
  assertDeploymentComposeContract({ verifyDockerConfig: !staticOnly })
    .then((result) => {
      console.log(JSON.stringify({ ...result, mode: staticOnly ? "static_only" : "docker_compose_config" }, null, 2));
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
