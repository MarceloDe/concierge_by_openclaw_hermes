import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const mobilePage = await readFile(new URL("../../apps/mobile-next/app/page.jsx", import.meta.url), "utf8");
const mobileApi = await readFile(new URL("../../apps/mobile-next/lib/api.js", import.meta.url), "utf8");
const appJs = await readFile(new URL("../app/app.js", import.meta.url), "utf8");
const serverMjs = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");
const smokeScript = await readFile(new URL("../../scripts/phase59-pilot-readiness-smoke.mjs", import.meta.url), "utf8");

test("Phase 59 mobile PWA requests live reasoning through the public connector", () => {
  assert.match(mobilePage, /use_live_model:\s*true/);
  assert.match(mobilePage, /member,/);
  assert.doesNotMatch(mobilePage, /use_live_model:\s*false/);
  assert.match(mobilePage, /payloadMode:\s*"phi_allowed_identifier_masked_reasoning"/);
  assert.match(mobileApi, /path\.startsWith\("\/api\/v1\/"\)/);
  assert.doesNotMatch(mobilePage, /\/api\/chat/);
});

test("Phase 59 pilot readiness proof command and dashboard gate are registered", () => {
  assert.equal(packageJson.scripts["phase59:pilot-readiness"], "node scripts/phase59-pilot-readiness-smoke.mjs");
  assert.match(serverMjs, /buildPhase59PilotReadinessProof/);
  assert.match(serverMjs, /phase59_pilot_readiness/);
  assert.match(appJs, /Phase 59 Pilot Readiness/);
  assert.match(appJs, /npm run phase59:pilot-readiness/);
});

test("Phase 59 smoke covers API, LLM, OpenClaw, database, AWS, Graphiti, and PWA without payer portal use", () => {
  for (const required of [
    "openapi.json",
    "OPENAI",
    "openclaw",
    "product-memory/status",
    "get-caller-identity",
    "NEXT_PUBLIC_BRAINSTY_CLIENT_API_BASE",
    "use_live_model",
    "payerPortalUsed"
  ]) {
    assert.match(smokeScript, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(smokeScript, /https:\/\/example\.com/);
  assert.doesNotMatch(smokeScript, /aetna\.com\/login|member\.aetna/i);
});
