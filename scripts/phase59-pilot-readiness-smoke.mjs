import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

async function choosePort(envKey, fallback) {
  if (process.env[envKey]) return Number(process.env[envKey]);
  return await new Promise((resolveValue) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port || fallback;
      server.close(() => resolveValue(port));
    });
    server.on("error", () => resolveValue(fallback));
  });
}

const nodePort = await choosePort("PHASE59_NODE_PORT", 4231);
const apiPort = await choosePort("PHASE59_API_PORT", 8031);
const pwaPort = await choosePort("PHASE59_PWA_PORT", 3031);
const artifactPath = resolve(process.env.PHASE59_ARTIFACT_PATH || "artifacts/phase59/phase59-pilot-readiness-proof.json");
const strictExternal = process.env.PHASE59_STRICT_EXTERNAL === "1";
const requireGraphiti = process.env.PHASE59_REQUIRE_GRAPHITI === "1";
const requireAws = process.env.PHASE59_REQUIRE_AWS === "1";
const requireLlm = process.env.PHASE59_REQUIRE_LLM === "1";
const requirePwa = process.env.PHASE59_REQUIRE_PWA !== "0";
const taskPollAttempts = Number(process.env.PHASE59_TASK_POLL_ATTEMPTS || 180);
const timeoutMs = Number(process.env.PHASE59_TIMEOUT_MS || 420000);

const nodeBase = `http://127.0.0.1:${nodePort}`;
const apiBase = `http://127.0.0.1:${apiPort}`;
const pwaBase = `http://127.0.0.1:${pwaPort}`;
const started = [];

function shortHash(value) {
  if (!value) return null;
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function sanitizeAwsIdentity(identity) {
  if (!identity || typeof identity !== "object") return identity;
  return {
    ok: true,
    accountHash: shortHash(identity.Account),
    arnHash: shortHash(identity.Arn),
    userIdHash: shortHash(identity.UserId)
  };
}

function spawnManaged(label, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env },
    cwd: options.cwd || process.cwd()
  });
  const logs = [];
  const record = (chunk) => {
    const text = String(chunk);
    logs.push(text);
    if (logs.join("").length > 8000) logs.splice(0, Math.max(1, logs.length - 20));
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  started.push({ label, child, logs });
  return child;
}

async function shutdownManaged() {
  for (const { child } of started.reverse()) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  await Promise.allSettled(started.map(({ child }) => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  })));
}

async function requestText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body && !options.headers?.["content-type"] ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  return { response, text };
}

async function requestJson(url, options = {}) {
  const { response, text } = await requestText(url, options);
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 2000) };
  }
  if (!response.ok) {
    const error = new Error(`${options.method || "GET"} ${url} failed ${response.status}: ${text.slice(0, 1000)}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function waitFor(label, url, { json = true, timeout = 60000 } = {}) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeout) {
    try {
      return json ? await requestJson(url) : await requestText(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`${label} did not become ready at ${url}: ${lastError?.message || "timeout"}`);
}

async function runCommand(label, command, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs || 30000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 12000) stdout = stdout.slice(-12000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ label, ok: code === 0, exitCode: code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ label, ok: false, error: error.message, stdout, stderr });
    });
  });
}

async function maybeRunAwsCheck() {
  const cli = await runCommand("aws_cli_available", "aws", ["--version"], { timeoutMs: 10000 });
  if (!cli.ok) {
    return { ok: false, status: "aws_cli_unavailable", required: requireAws || strictExternal, error: cli.error || cli.stderr || cli.stdout };
  }
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  const identity = await runCommand("aws_sts_phase30", "aws", ["sts", "get-caller-identity", "--profile", "phase30", "--region", region, "--output", "json"], { timeoutMs: 20000 });
  if (!identity.ok) {
    return { ok: false, status: "phase30_profile_unavailable", required: requireAws || strictExternal, region, error: (identity.stderr || identity.stdout || identity.error || "").slice(0, 1000) };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(identity.stdout);
  } catch {
    return { ok: false, status: "aws_identity_parse_failed", required: requireAws || strictExternal, region };
  }
  return { ok: true, status: "aws_phase30_profile_reachable", required: requireAws || strictExternal, region, identity: sanitizeAwsIdentity(parsed) };
}

async function startServers() {
  const dbDir = await mkdtemp(resolve(tmpdir(), "brainsty-phase59-"));
  const dbPath = resolve(dbDir, "phase59.sqlite");
  spawnManaged("node_runtime", "node", ["src/server/server.mjs"], {
    env: {
      PORT: String(nodePort),
      HOST: "127.0.0.1",
      BRAINSTY_DB_PATH: dbPath,
      NODE_ENV: "test"
    }
  });
  await waitFor("Node runtime", `${nodeBase}/api/health`);

  spawnManaged("fastapi_facade", "python3", ["-m", "uvicorn", "project.api.main:app", "--host", "127.0.0.1", "--port", String(apiPort)], {
    env: {
      WEFELLA_NODE_RUNTIME_URL: nodeBase
    }
  });
  await waitFor("FastAPI facade", `${apiBase}/api/v1/health`);

  if (requirePwa) {
    spawnManaged("next_mobile_pwa", "npm", ["exec", "next", "--", "dev", "--hostname", "127.0.0.1", "--port", String(pwaPort)], {
      cwd: resolve("apps/mobile-next"),
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_BRAINSTY_CLIENT_API_BASE: apiBase
      }
    });
    await waitFor("Next mobile PWA", pwaBase, { json: false, timeout: 90000 });
  }
  return { dbPath };
}

function fastApiEndpointInventory(openapi) {
  const paths = openapi?.paths && typeof openapi.paths === "object" ? openapi.paths : {};
  const endpoints = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const method of Object.keys(methods || {})) {
      endpoints.push({ method: method.toUpperCase(), path, schemaPresent: true });
    }
  }
  endpoints.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
  return endpoints;
}

async function exerciseFastApiV1() {
  const openapi = await requestJson(`${apiBase}/openapi.json`);
  const endpoints = fastApiEndpointInventory(openapi);
  const health = await requestJson(`${apiBase}/api/v1/health`);
  const readiness = await requestJson(`${apiBase}/api/v1/readiness`);
  const session = await requestJson(`${apiBase}/api/v1/sessions`, {
    method: "POST",
    body: JSON.stringify({
      member: {
        name: "Phase 59 Pilot",
        email: "phase59@example.test",
        payer: "Aetna",
        portalUrl: "https://example.com"
      },
      client_context: { phase: "phase59_pilot_readiness" }
    })
  });
  const token = session.access_token;
  const task = await requestJson(`${apiBase}/api/v1/tasks`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      journey: "eligibility_benefits_navigation",
      message: "Please explain what I may need to verify before insurance starts paying, using safe fixture context.",
      session_id: session.session_id,
      member: {
        name: "Phase 59 Pilot",
        email: "phase59@example.test",
        payer: "Aetna",
        portalUrl: "https://example.com"
      },
      client_context: {
        surface: "phase59_smoke",
        useLiveModel: true,
        payloadMode: "phi_allowed_identifier_masked_reasoning"
      },
      use_live_model: true,
      use_official_openclaw_worker: false,
      require_live_portal_proof: false
    })
  });
  let taskStatus = null;
  for (let attempt = 0; attempt < taskPollAttempts; attempt += 1) {
    taskStatus = await requestJson(`${apiBase}/api/v1/tasks/${encodeURIComponent(task.task_id)}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (["approval_pending", "evidence_blocked", "completed", "refused", "failed"].includes(taskStatus.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const events = await requestJson(`${apiBase}/api/v1/tasks/${encodeURIComponent(task.task_id)}/events`, {
    headers: { authorization: `Bearer ${token}` }
  }).catch((error) => ({ error: error.message }));
  const openclaw = await requestJson(`${apiBase}/api/v1/openclaw/readiness`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const proofRun = await requestJson(`${apiBase}/api/v1/proof/runs/phase59-pilot-readiness`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const upload = await requestJson(`${apiBase}/api/v1/documents`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      filename: "phase59-safe-note.txt",
      content_type: "text/plain",
      content_base64: Buffer.from("Safe non-PHI fixture: deductible details should be verified against plan evidence.").toString("base64"),
      session_id: session.session_id,
      document_kind: "safe_fixture_note"
    })
  });
  return {
    ok: health.status === "ok" && readiness.status && Boolean(session.access_token) && Boolean(task.task_id) && Boolean(taskStatus?.status) && !["queued", "running", "failed"].includes(taskStatus?.status),
    endpointInventory: {
      total: endpoints.length,
      coveredByOpenApiSchema: endpoints.length,
      endpoints
    },
    liveProbes: {
      health: health.status,
      readiness: readiness.status,
      sessionCreated: Boolean(session.session_id),
      taskCreated: Boolean(task.task_id),
      taskStatus: taskStatus?.status || "unknown",
      taskRawStatus: taskStatus?.raw_status || null,
      taskHasAnswer: Boolean(taskStatus?.answer),
      taskError: taskStatus?.error || null,
      taskResultStatus: taskStatus?.result?.status || taskStatus?.result?.graphRun?.status || null,
      taskPollAttempts,
      eventsShape: Array.isArray(events?.events) || Array.isArray(events),
      openclawStatus: openclaw?.liveReadiness?.status || openclaw?.status || "unknown",
      proofRunStatus: proofRun?.status || "unknown",
      documentStored: upload?.status === "stored"
    },
    tokenUsed: Boolean(token)
  };
}

async function exerciseNodeRuntime() {
  const health = await requestJson(`${nodeBase}/api/health`);
  const productMemory = await requestJson(`${nodeBase}/api/product-memory/status`);
  const officialOpenClaw = await requestJson(`${nodeBase}/api/openclaw/official/status`);
  const skills = await requestJson(`${nodeBase}/api/openclaw/skills`);
  const promptContracts = await requestJson(`${nodeBase}/api/prompts/contract?email=phase59%40example.test`);
  const proof = await requestJson(`${nodeBase}/api/proof/runs/phase59-pilot-readiness`);
  const routeText = await import("node:fs/promises").then(({ readFile }) => readFile(resolve("src/server/server.mjs"), "utf8"));
  const routeMatches = Array.from(routeText.matchAll(/req\.method === "([A-Z]+)" && url\.pathname(?:\.startsWith)?\("([^"]+)"\)/g))
    .map((match) => ({ method: match[1], path: match[2] }));
  return {
    ok: Boolean(health.ok) && Boolean(proof?.scores?.some((score) => score.key === "phase59_pilot_readiness")),
    health: {
      ok: Boolean(health.ok),
      databaseDriver: health.databaseDriver,
      databaseAdapterVersion: health.databaseAdapterVersion,
      tableCount: Object.keys(health.counts || {}).length,
      openAiConfigured: Boolean(health.openAI?.configured),
      openAiModel: health.openAI?.model || null
    },
    productMemory: {
      ok: Boolean(productMemory.ok),
      status: productMemory.status,
      adapter: productMemory.adapter,
      enabled: Boolean(productMemory.enabled),
      schemaReady: Boolean(productMemory.schemaReady),
      backend: productMemory.backend || productMemory.config?.backend || null,
      rawEpisodeStorage: Boolean(productMemory.rawEpisodeStorage || productMemory.config?.rawEpisodeStorage),
      required: requireGraphiti || strictExternal
    },
    openclaw: {
      ready: Boolean(officialOpenClaw.ready),
      status: officialOpenClaw.liveReadiness?.status || officialOpenClaw.status || "unknown",
      officialSkillCount: Array.isArray(skills.skills) ? skills.skills.length : null,
      skillKeys: Array.isArray(skills.skills) ? skills.skills.map((skill) => skill.skillKey).filter(Boolean).slice(0, 12) : []
    },
    promptContracts: {
      ok: Boolean(promptContracts.ok ?? true),
      count: Array.isArray(promptContracts.contracts) ? promptContracts.contracts.length : null
    },
    endpointInventory: {
      routeCount: routeMatches.length,
      routes: routeMatches
    },
    proofScore: proof?.scores?.find((score) => score.key === "phase59_pilot_readiness") || null
  };
}

async function exercisePwa() {
  if (!requirePwa) return { ok: true, status: "skipped_by_env" };
  const { response, text } = await requestText(pwaBase);
  return {
    ok: response.ok && /Brainstyworkers|Concierge|__next/i.test(text),
    status: response.ok ? "served" : "unavailable",
    statusCode: response.status,
    containsNextApp: /__next/i.test(text),
    apiBoundary: "NEXT_PUBLIC_BRAINSTY_CLIENT_API_BASE -> /api/v1 only"
  };
}

function classifyReadiness(result) {
  const requiredChecks = [
    result.checks.servers?.ok,
    result.checks.fastapi?.ok,
    result.checks.nodeRuntime?.ok,
    result.checks.pwa?.ok
  ];
  const externalRequired = [
    !requireLlm && !strictExternal ? true : result.checks.llm?.ok,
    !requireAws && !strictExternal ? true : result.checks.aws?.ok,
    !requireGraphiti && !strictExternal ? true : result.checks.nodeRuntime?.productMemory?.ok
  ];
  const ok = [...requiredChecks, ...externalRequired].every(Boolean);
  if (ok && result.checks.llm?.ok && result.checks.aws?.ok && result.checks.nodeRuntime?.productMemory?.ok) return "pilot_ready_live_external";
  if (ok) return "pilot_ready_with_external_degraded";
  return "pilot_blocked";
}

async function main() {
  const startedAt = new Date().toISOString();
  const result = {
    version: "phase59-pilot-readiness-smoke.v1",
    phase: 59,
    startedAt,
    completedAt: null,
    ok: false,
    status: "running",
    mode: strictExternal ? "strict_external" : "local_pilot_with_degraded_external_allowed",
    bases: { nodeBase, apiBase, pwaBase },
    artifactPath,
    safety: {
      payerPortalUsed: false,
      testTarget: "https://example.com",
      rawAwsIdentityReturned: false,
      rawPortalFrameStored: false,
      externalWritesWithoutApproval: false
    },
    checks: {}
  };
  const timeout = setTimeout(() => {
    console.error(JSON.stringify({ ...result, status: "timeout", error: `Timed out after ${timeoutMs}ms` }, null, 2));
    process.exit(124);
  }, timeoutMs);

  try {
    const startup = await startServers();
    result.checks.servers = { ok: true, status: "started", dbPath: startup.dbPath };
    result.checks.fastapi = await exerciseFastApiV1();
    result.checks.nodeRuntime = await exerciseNodeRuntime();
    result.checks.pwa = await exercisePwa();
    result.checks.aws = await maybeRunAwsCheck();
    result.checks.llm = {
      ok: Boolean(result.checks.nodeRuntime?.health?.openAiConfigured),
      status: result.checks.nodeRuntime?.health?.openAiConfigured ? "openai_key_configured_live_path_requested" : "blocked_missing_openai_key",
      required: requireLlm || strictExternal,
      model: result.checks.nodeRuntime?.health?.openAiModel || null,
      v1TaskRequestedLiveModel: result.checks.fastapi?.liveProbes?.taskCreated === true
    };
    result.completedAt = new Date().toISOString();
    result.status = classifyReadiness(result);
    result.ok = result.status !== "pilot_blocked";
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    result.completedAt = new Date().toISOString();
    result.status = "pilot_blocked";
    result.error = error.message;
    result.processLogs = Object.fromEntries(started.map(({ label, logs }) => [label, logs.join("").slice(-3000)]));
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(result, null, 2));
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    await shutdownManaged();
  }
}

await main();
