import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getOfficialOpenClawConfig, openClawProcessEnv } from "../openclawOfficialRuntime.mjs";

// Phase 87 (§7): the broken global --profile flag is DROPPED — OpenClaw 2026.x rejects
// it for several subcommands. Isolation uses the SAME env mechanism the official
// runtime already uses (OPENCLAW_STATE_DIR / OPENCLAW_CONFIG_PATH /
// OPENCLAW_GATEWAY_PORT via openClawProcessEnv), so the availability check exercises
// the exact instance the app drives — never the operator's personal ~/.openclaw.
export const OPENCLAW_GATEWAY_CLIENT_VERSION = "2026-07-03.openclaw-gateway-client.phase87.v2";
const execFileAsync = promisify(execFile);

export function getGatewayConfig(env = process.env) {
  const official = getOfficialOpenClawConfig(env);
  return {
    version: OPENCLAW_GATEWAY_CLIENT_VERSION,
    binary: env.BRAINSTY_OPENCLAW_BINARY || "openclaw",
    stateDir: official.stateDir,
    configPath: official.configPath,
    gatewayPort: official.gatewayPort,
    transport: env.BRAINSTY_OPENCLAW_GATEWAY_TRANSPORT || "cli_transitional"
  };
}

export async function checkGatewayAvailability(config = getGatewayConfig()) {
  try {
    const { stdout } = await execFileAsync(config.binary, ["--version"], {
      timeout: 10000,
      env: openClawProcessEnv()
    });
    return { ok: true, status: "openclaw_cli_available", config, versionText: stdout.trim() };
  } catch (error) {
    return { ok: false, status: "openclaw_cli_unavailable", config, error: error.message };
  }
}
