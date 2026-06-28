import { spawn } from "node:child_process";
import { getOfficialOpenClawConfig, openClawProcessEnv } from "./openclawOfficialRuntime.mjs";

// Always-on OpenClaw runtime manager. At app boot this ensures the app's ISOLATED
// gateway (brainstyworkers state dir, dedicated port, wired LLM credential) is running —
// independent of any LangGraph/user demand — verifies connectivity over HTTP, and
// optionally proves the wired LLM with a real agent turn. Never touches the operator's
// personal ~/.openclaw gateway.
export const OPENCLAW_RUNTIME_VERSION = "2026-06-27.always-on-runtime.v1";

function dashboardUrl(config) {
  return `http://127.0.0.1:${config.gatewayPort}/`;
}

async function gatewayReachable(config, timeoutMs = 4000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(dashboardUrl(config), { signal: ctrl.signal });
    clearTimeout(t);
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function waitForGateway(config, { attempts = 20, intervalMs = 1000 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    if (await gatewayReachable(config)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function startGateway(config) {
  const child = spawn(config.binary, ["gateway", "run", "--port", String(config.gatewayPort)], {
    env: openClawProcessEnv(config),
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return child.pid ?? null;
}

// Prove the wired LLM with a single real agent turn. Returns {verified, reply, error}.
export async function verifyOpenClawLlm(config = getOfficialOpenClawConfig(), { message = "Reply with exactly the token RUNTIME_OK and nothing else." } = {}) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync(
      config.binary,
      ["agent", "--agent", config.agentId, "-m", message, "--json"],
      { env: openClawProcessEnv(config), timeout: 60000, maxBuffer: 1024 * 1024 * 10 }
    );
    const parsed = JSON.parse(stdout);
    const reply = parsed?.result?.payloads?.[0]?.text ?? parsed?.reply ?? null;
    return { verified: parsed?.status === "ok" && Boolean(reply), reply, status: parsed?.status ?? null };
  } catch (error) {
    return { verified: false, error: String(error.stderr || error.message).slice(0, 300) };
  }
}

export async function initializeOpenClawRuntime({ env = process.env, verifyLlm = null } = {}) {
  const config = getOfficialOpenClawConfig(env);
  const autostart = String(env.BRAINSTY_OPENCLAW_AUTOSTART ?? "1") !== "0";
  const required = String(env.BRAINSTY_REQUIRE_OPENCLAW ?? "0") === "1";
  const shouldVerifyLlm = verifyLlm ?? String(env.BRAINSTY_OPENCLAW_VERIFY_LLM ?? "0") === "1";
  const llmCredentialPresent = Boolean(env.BRAINSTY_OPENCLAW_OPENAI_API_KEY || env.OPENAI_API_KEY);

  let reachable = await gatewayReachable(config);
  let startedPid = null;
  if (!reachable && autostart) {
    startedPid = startGateway(config);
    reachable = await waitForGateway(config);
  }

  let llm = { verified: false, skipped: !shouldVerifyLlm };
  if (reachable && shouldVerifyLlm) llm = await verifyOpenClawLlm(config);

  const readiness = {
    version: OPENCLAW_RUNTIME_VERSION,
    binary: config.binary,
    stateDir: config.stateDir,
    gatewayPort: config.gatewayPort,
    agentId: config.agentId,
    dashboard: dashboardUrl(config),
    autostart,
    required,
    startedPid,
    gatewayReachable: reachable,
    llmCredentialPresent,
    llm
  };

  if (required && !reachable) {
    const error = new Error(`[runtime] OpenClaw gateway required but not reachable at ${dashboardUrl(config)}. Readiness: ${JSON.stringify(readiness)}`);
    error.readiness = readiness;
    throw error;
  }
  return readiness;
}
