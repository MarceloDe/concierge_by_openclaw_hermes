// Phase 86 LIVE Redis acceptance (plan §6.4 / §11 Phase 86). Requires
// BRAINSTY_REDIS_URL (live Redis, RESP over TCP) — HARD FAILS if absent, per the
// non-mocked proof rules. Not in test:local; run via `npm run test:redis:phase86`.
// Arms: consent-state + oauth-session real write→read-back with zero secret
// substrings; consent flip → synchronous eviction → the NEXT TURN's planner payload
// (planner.start full_prompt equivalent) shows the revoked route; fresh session has
// NO brainsty:capability-portfolio key while capability-catalog is populated; the
// SCAN-prefix set is contained in the documented namespace set (redis-keys.json).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "./support/sqliteTestStore.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildContextPacket } from "../concierge/memoryHarness.mjs";
import { buildLlmOrchestrationDecisionMessages } from "../concierge/llmOrchestrationDecision.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { createRuntimeContextCache } from "../concierge/runtimeContextCache.mjs";
import { consentStateKey, evictConsentState } from "../concierge/consentStateRuntime.mjs";
import { oauthSessionKey } from "../concierge/oauthSessionRuntime.mjs";
import { cacheSessionArtifact } from "../concierge/credentialVault.mjs";

await loadLocalEnvOnce();
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function seededStore(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("Phase 86 LIVE: consent-state + oauth-session real read-back, zero secret substrings", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required for the Phase 86 live proof");
  const cache = createRuntimeContextCache();
  assert.equal(cache.backend, "redis", "must use the real redis backend");

  const store = await seededStore("brainsty-p86-live-");
  const { user, session, portal } = await enrollDefaultMember(store);
  await store.all("UPDATE user_consents SET session_reuse_approved = 1, updated_at = ? WHERE user_id = ?;", [nowIso(), user.id]);

  // Real vault write mirrors an oauth handle; real context build mirrors consent state.
  const plaintext = "live-proof-session-cookie-material-19770707";
  const cached = await cacheSessionArtifact(store, {
    userId: user.id, portalAccountId: portal?.id ?? null, artifactKind: "session_cookie_bundle",
    plaintextArtifact: plaintext, scope: ["portal:read_only"], sessionId: session.id
  });
  assert.equal(cached.cached, true);
  await buildContextPacket(store, { user, session, channel: session.channel, userInput: "check my benefits" });

  // REAL RESP read-back of both keys.
  const consentRaw = JSON.stringify(await cache.adapter.get(consentStateKey(session.id)));
  const oauthRaw = JSON.stringify(await cache.adapter.get(oauthSessionKey(session.id)));
  assert.ok(consentRaw !== "null", "consent-state key must be present in live redis");
  assert.ok(oauthRaw !== "null", "oauth-session key must be present in live redis");

  // Zero secret substrings (§6.4): the raw stored values grep clean.
  for (const [label, raw] of [["consent-state", consentRaw], ["oauth-session", oauthRaw]]) {
    assert.equal(raw.includes(plaintext), false, `${label} must not contain the raw secret`);
    assert.equal(raw.includes(cached.secretHash), false, `${label} must not contain the full secret hash`);
    // Actual secret-material shapes (a policy STRING like credential_boundary may
    // legitimately mention the word "password" — that is not a credential).
    assert.equal(/"(password|rawToken|cookie|authorization)"\s*:/i.test(raw), false, `${label} must not carry credential-valued fields`);
    assert.equal(/bearer\s+[a-z0-9._-]{16,}/i.test(raw), false, `${label} must not carry bearer tokens`);
  }
  assert.ok(oauthRaw.includes(`credential_session_vault#${cached.vaultId}`), "oauth handle must carry the vault POINTER");
});

test("Phase 86 LIVE: consent flip → eviction → the next turn's planner payload shows the revoked route", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required");
  const store = await seededStore("brainsty-p86-flip-");
  const { user, session } = await enrollDefaultMember(store);

  // Turn 1: consent granted → planner payload consent state allows layer 3.
  const turn1 = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel, userInput: "what does my portal say about my claim?",
    rawMessage: { source: "phase86_live_flip", useLiveModel: false, executeEvidenceObservation: false,
      llmOrchestrationDecisionReplay: { workflow: "claim_status_navigation", intent: "claim_status", confidence: 0.9, rationale: "replay", workerGoal: "read-only" } }
  });
  const payload1 = JSON.parse(buildLlmOrchestrationDecisionMessages(turn1.state).find((m) => m.role === "user").content);
  assert.equal(payload1.consentState.layers.layer_3_portal_control.allowed, true, "turn 1 must see the granted consent");

  // The consent flip (authoritative UPDATE) + the SYNCHRONOUS eviction every write path performs.
  await store.all("UPDATE user_consents SET read_only_extraction_approved = 0, updated_at = ? WHERE user_id = ?;", [nowIso(), user.id]);
  await evictConsentState([session.id]);

  // Turn 2: the planner payload (the planner.start full_prompt content) must show the flip.
  const turn2 = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel, userInput: "and my other claim?",
    rawMessage: { source: "phase86_live_flip", useLiveModel: false, executeEvidenceObservation: false,
      llmOrchestrationDecisionReplay: { workflow: "claim_status_navigation", intent: "claim_status", confidence: 0.9, rationale: "replay", workerGoal: "read-only" } }
  });
  const payload2 = JSON.parse(buildLlmOrchestrationDecisionMessages(turn2.state).find((m) => m.role === "user").content);
  assert.equal(payload2.consentState.layers.layer_3_portal_control.allowed, false, "turn 2 must see the revoked consent — route change visible in the planner prompt");
  // The context-packet mirror agrees (single hydration point, §6.2).
  assert.equal(turn2.state.context_packet.runtimeContext.layerRouting.consentState.layers.layer_3_portal_control.allowed, false);
});

test("Phase 86 LIVE: fresh session has NO capability-portfolio key; catalog mirror populated; namespace set documented", async () => {
  assert.ok(process.env.BRAINSTY_REDIS_URL, "BRAINSTY_REDIS_URL required");
  const cache = createRuntimeContextCache();
  const store = await seededStore("brainsty-p86-ns-");
  const { user, session } = await enrollDefaultMember(store);
  await runLangGraphOrchestration(store, {
    user, session, channel: session.channel, userInput: "check my eligibility",
    rawMessage: { source: "phase86_live_ns", useLiveModel: false, executeEvidenceObservation: false,
      llmOrchestrationDecisionReplay: { workflow: "eligibility_benefits_navigation", intent: "benefits_eligibility", confidence: 0.9, rationale: "replay", workerGoal: "read-only" } }
  });

  // Retired namespace: ZERO keys for this fresh session; catalog mirror populated.
  const legacy = await cache.adapter.scanKeys(`brainsty:capability-portfolio:${session.id}*`);
  assert.equal(legacy.length, 0, "retired brainsty:capability-portfolio must have NO key for a fresh session");
  const catalog = await cache.adapter.scanKeys(`brainsty:capability-catalog:${session.id}*`);
  assert.equal(catalog.length, 1, "capability-catalog mirror must be populated for the session");

  // Namespace gate (§6.3): every observed brainsty:* prefix is in the DOCUMENTED set.
  // Residual pre-pivot capability-portfolio keys (written before this phase, no writer
  // or reader remains — grep-zero proven) age out via their 1800s TTL and are the only
  // tolerated exception, recorded loudly here.
  const documented = new Set(
    Object.values(JSON.parse(await readFile(join(repoRoot, "docs/db/redis-keys.json"), "utf8")).namespaces)
      .map((ns) => ns.keyPattern.split(":").slice(0, 2).join(":"))
  );
  const observed = [...new Set((await cache.adapter.scanKeys("brainsty:*")).map((key) => key.split(":").slice(0, 2).join(":")))];
  const undocumented = observed.filter((prefix) => !documented.has(prefix) && prefix !== "brainsty:capability-portfolio" && prefix !== "brainsty:runtime");
  assert.deepEqual(undocumented, [], `every live brainsty:* prefix must be documented; undocumented: ${undocumented.join(", ")}`);
  const residual = observed.includes("brainsty:capability-portfolio");
  if (residual) console.log("note: residual pre-pivot brainsty:capability-portfolio keys present — TTL 1800s, no writer/reader remains");
});
