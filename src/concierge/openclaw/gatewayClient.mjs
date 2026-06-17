import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const OPENCLAW_GATEWAY_CLIENT_VERSION = "2026-06-15.openclaw-gateway-client.v1";
const execFileAsync = promisify(execFile);

export function getGatewayConfig(env = process.env) {
  return {
    version: OPENCLAW_GATEWAY_CLIENT_VERSION,
    binary: env.BRAINSTY_OPENCLAW_BINARY || "openclaw",
    profile: env.BRAINSTY_OPENCLAW_PROFILE || "brainstyworkers",
    gatewayPort: Number(env.BRAINSTY_OPENCLAW_GATEWAY_PORT ?? 19789),
    transport: env.BRAINSTY_OPENCLAW_GATEWAY_TRANSPORT || "cli_transitional"
  };
}

export async function checkGatewayAvailability(config = getGatewayConfig()) {
  try {
    const { stdout } = await execFileAsync(config.binary, ["--profile", config.profile, "--version"], { timeout: 10000 });
    return { ok: true, status: "openclaw_cli_available", config, versionText: stdout.trim() };
  } catch (error) {
    return { ok: false, status: "openclaw_cli_unavailable", config, error: error.message };
  }
}

