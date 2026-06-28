// OpenClaw always-on runtime proof (no mocks; real gateway + real LLM). Gated by
// BRAINSTY_OPENCLAW_LIVE=1 because it drives the local OpenClaw gateway + an LLM turn.
import test from "node:test";
import assert from "node:assert/strict";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { initializeOpenClawRuntime, verifyOpenClawLlm } from "../concierge/openclawRuntime.mjs";
import { getOfficialOpenClawConfig } from "../concierge/openclawOfficialRuntime.mjs";

await loadLocalEnvOnce();
const LIVE = process.env.BRAINSTY_OPENCLAW_LIVE === "1";

test("OpenClaw runtime: app-boot manager brings the isolated gateway up and proves the wired LLM", { skip: LIVE ? false : "set BRAINSTY_OPENCLAW_LIVE=1 (drives local OpenClaw gateway + LLM)" }, async () => {
  const readiness = await initializeOpenClawRuntime({ env: process.env, verifyLlm: true });
  assert.equal(readiness.gatewayReachable, true, "isolated gateway reachable at boot");
  assert.equal(readiness.stateDir.endsWith(".openclaw-brainstyworkers"), true, "uses the isolated state dir, not personal ~/.openclaw");
  assert.equal(readiness.agentId, "brainstyworkers-insurance-browser");
  assert.equal(readiness.llm.verified, true, "wired LLM produced a real turn");
  assert.equal(readiness.llm.reply, "RUNTIME_OK");

  // A second independent turn confirms the LLM is genuinely live, not a one-off.
  const turn = await verifyOpenClawLlm(getOfficialOpenClawConfig(process.env), { message: "Reply with exactly the token SECOND_OK and nothing else." });
  assert.equal(turn.verified, true);
  assert.equal(turn.reply, "SECOND_OK");
});
