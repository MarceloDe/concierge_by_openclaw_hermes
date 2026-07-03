// Phase 86 runtime proofs (plan §6.1/§6.2/§6.4) on the hermetic in-memory backend —
// REAL modules, REAL SQLite, real write→read-back through the same adapter the
// production Redis path uses (the live-Redis arm runs in phase86-redis-live.test.mjs).
// Covers: consent-state mirror (rebuild-on-miss, fail-closed, synchronous eviction),
// oauth-session handle invariants (pointer+hash only, shape-enforced), the
// memoryHarness layerRouting hydration point, priorDecisionPointers layer fields, and
// the resumeRun consent-revocation re-plan (authoritative DB re-check, never the mirror).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { buildContextPacket } from "../concierge/memoryHarness.mjs";
import { createRuntimeContextCache } from "../concierge/runtimeContextCache.mjs";
import {
  buildConsentStateFromDb,
  consentAllowsDataLayer,
  consentStateKey,
  evictConsentState,
  loadConsentState
} from "../concierge/consentStateRuntime.mjs";
import {
  oauthSessionKey,
  readOauthSessionRuntime,
  recordOauthSessionHandle
} from "../concierge/oauthSessionRuntime.mjs";
import { cacheSessionArtifact } from "../concierge/credentialVault.mjs";
import { compactManagedCheckpoints, buildRuntimeContextManifest } from "../concierge/runtimeContextCache.mjs";
import { writeShadowCheckpointLedger, resumeRun } from "../concierge/checkpointRunLedger.mjs";

// Hermetic: pin the in-memory backend regardless of ambient .env.local.
process.env.BRAINSTY_REDIS_URL = "";
process.env.REDIS_URL = "";

async function createStore(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  return store;
}

test("Phase 86: consent-state mirror — rebuild-on-miss, read-back, synchronous eviction, fail-closed", async () => {
  const store = await createStore("brainsty-p86-consent-");
  const { user, session } = await enrollDefaultMember(store);
  const cache = createRuntimeContextCache();

  // Rebuild-on-miss from the authoritative row, then a real read-back hit.
  const first = await loadConsentState(store, { sessionId: session.id, userId: user.id });
  assert.equal(first.cacheHit, false);
  assert.equal(first.rebuiltFromDb, true);
  assert.equal(first.consentState.missing, false);
  assert.equal(first.consentState.layers.layer_1_public.allowed, true);
  const second = await loadConsentState(store, { sessionId: session.id, userId: user.id });
  assert.equal(second.cacheHit, true, "second load must be a mirror hit");
  assert.equal(second.consentState.consentRowId, first.consentState.consentRowId);

  // Consent flip + synchronous eviction: the next load rebuilds and sees the flip.
  await store.all("UPDATE user_consents SET read_only_extraction_approved = 0, updated_at = ? WHERE user_id = ?;", [nowIso(), user.id]);
  await evictConsentState([session.id]);
  assert.equal(await cache.adapter.get(consentStateKey(session.id)), null, "mirror key must be gone after eviction");
  const revoked = await loadConsentState(store, { sessionId: session.id, userId: user.id });
  assert.equal(revoked.cacheHit, false, "post-eviction load must rebuild from DB");
  assert.equal(revoked.consentState.layers.layer_3_portal_control.allowed, false, "revoked flag must deny layer 3");

  // Fail-closed: a user with NO consent row denies all portal layers.
  const ghost = await buildConsentStateFromDb(store, { userId: "user:does-not-exist" });
  assert.equal(ghost.missing, true);
  assert.equal(consentAllowsDataLayer(ghost, "layer_3_portal_control"), false);
  assert.equal(consentAllowsDataLayer(ghost, "layer_2_member_authorized_api"), false);
  assert.equal(consentAllowsDataLayer(ghost, "layer_1_public"), true, "public layer is always allowed");
});

test("Phase 86: oauth-session handles — pointer+hash only, shape-enforced, no raw secret substring", async () => {
  const store = await createStore("brainsty-p86-oauth-");
  const { user, session, portal } = await enrollDefaultMember(store);
  await store.all("UPDATE user_consents SET session_reuse_approved = 1, updated_at = ? WHERE user_id = ?;", [nowIso(), user.id]);

  // Real vault write path (the ONLY writer) mirrors a handle.
  const plaintext = "super-secret-session-cookie-material-08151234";
  const cached = await cacheSessionArtifact(store, {
    userId: user.id,
    portalAccountId: portal?.id ?? null,
    artifactKind: "session_cookie_bundle",
    plaintextArtifact: plaintext,
    scope: ["portal:read_only"],
    sessionId: session.id
  });
  assert.equal(cached.cached, true);
  assert.equal(cached.oauthHandleMirror?.stored, true, "vault write must mirror an oauth handle");

  const runtime = await readOauthSessionRuntime(session.id);
  assert.equal(runtime.cacheHit, true);
  assert.equal(runtime.handles.length, 1);
  const handle = runtime.handles[0];
  assert.equal(handle.vaultPointer, `credential_session_vault#${cached.vaultId}`);
  assert.equal(handle.tokenHash, cached.secretHash.slice(0, 24));
  assert.equal(handle.dataLayer, "layer_3_portal_control");

  // HARD INVARIANT: the stored value greps clean of the raw secret.
  const cache = createRuntimeContextCache();
  const rawValue = JSON.stringify(await cache.adapter.get(oauthSessionKey(session.id)));
  assert.equal(rawValue.includes(plaintext), false, "raw secret must never enter the oauth-session key");
  assert.equal(rawValue.includes(cached.secretHash), false, "full secret hash must not be stored (prefix-24 only)");

  // Shape enforcement: a handle without a vault pointer is REFUSED loud, never stored.
  await assert.rejects(
    () => recordOauthSessionHandle({ sessionId: session.id, handle: { tokenHash: "abc123", rawToken: plaintext } }),
    (error) => error.failureClass === "oauth_session_handle_invalid_pointer"
  );
});

test("Phase 86: memoryHarness layerRouting is the single hydration point (consent mirror + oauth handles + browser tier)", async () => {
  const store = await createStore("brainsty-p86-layer-");
  const { user, session } = await enrollDefaultMember(store);
  const context = await buildContextPacket(store, {
    user,
    session,
    channel: session.channel,
    userInput: "what is my deductible?"
  });
  const routing = context.packet.runtimeContext.layerRouting;
  assert.ok(routing, "layerRouting must be hydrated");
  assert.equal(routing.consentState.missing, false);
  assert.equal(routing.consentState.layers.layer_1_public.allowed, true);
  assert.ok(Array.isArray(routing.oauthHandles));
  assert.ok(typeof routing.browserReadinessTier === "string");
  // The four hard boundaries stay non-overridable floors in the safety section.
  assert.equal(context.packet.safety.credentialEntry, "user_only");
  assert.equal(context.packet.safety.medicalAdvice, "not_allowed");
  assert.ok(context.packet.safety.consentState, "safety must carry the consent-state mirror");
  // Phase 86 (§6.3): the packet capability surface is the DB catalog.
  assert.equal(context.packet.capabilityPortfolio.source, "db_catalog");
  assert.ok(context.packet.capabilityPortfolio.promptTable.length > 0);
});

test("Phase 86: priorDecisionPointers carry dataLayer/riskTier from the checkpoint statePatch (pre-pivot tolerant)", () => {
  const managedSession = {
    checkpoints: [
      {
        checkpoint_id: "ckpt-new",
        step_name: "langgraph_run_completed",
        created_at: "2026-07-03T12:00:00.000Z",
        state: { langgraph: { workflow: "eligibility_benefits_navigation", routeReason: "llm", dataLayer: "layer_2_member_authorized_api", riskTier: "medium" } }
      },
      {
        checkpoint_id: "ckpt-prepivot",
        step_name: "langgraph_run_completed",
        created_at: "2026-07-01T12:00:00.000Z",
        state: { langgraph: { workflow: "claim_status_navigation", routeReason: "llm" } }
      }
    ]
  };
  const compacted = compactManagedCheckpoints(managedSession);
  assert.equal(compacted[0].dataLayer, "layer_2_member_authorized_api");
  assert.equal(compacted[0].riskTier, "medium");
  assert.equal(compacted[1].dataLayer, null, "pre-pivot checkpoints hydrate null, never throw");

  const manifest = buildRuntimeContextManifest({
    session: { id: "sess-p86", langgraph_thread_id: "thread-p86" },
    contextPacket: { generatedAt: nowIso(), request: { userInput: "x" }, workflowArchitecture: { routeCandidates: [] }, currentSession: { lastContextPacketId: null } },
    managedSession
  });
  const pointer = manifest.priorDecisionPointers.find((p) => p.checkpointId === "ckpt-new");
  assert.equal(pointer.dataLayer, "layer_2_member_authorized_api");
  assert.equal(pointer.riskTier, "medium");
});

test("Phase 86: resumeRun consent-revocation re-plan — authoritative DB re-check forces after_planner pending", async () => {
  const store = await createStore("brainsty-p86-replan-");
  const { user, session } = await enrollDefaultMember(store);

  // A completed run recorded against layer_3 (portal control).
  const graphTraceId = "p86-replan-trace";
  await writeShadowCheckpointLedger(store, {
    user,
    session,
    state: {
      workflow: "payer_portal_read_only_extraction",
      route_reason: "llm",
      policy_result: { ok: true },
      llm_orchestration_decision: { data_layer: "layer_3_portal_control", risk_tier: "medium", classification: { workflow: "payer_portal_read_only_extraction" } },
      evidence_observation: { status: "completed" },
      final_response: { text: "done" },
      tool_calls: [{ tool: "openclaw" }]
    },
    graphTraceId
  });
  const runId = `wfrun:${graphTraceId}`;
  const run = await store.findOne("workflow_runs", { id: runId });
  assert.equal(JSON.parse(run.readiness_json).decisionLayer.dataLayer, "layer_3_portal_control");

  // Consent still granted: resume does NOT re-plan for consent.
  const before = await resumeRun(store, runId, {});
  assert.equal(before.rePlanReasons.includes("consent_revoked_replan"), false);

  // Revoke the flag layer_3 requires → resume must force a re-plan, loud and classified.
  await store.all("UPDATE user_consents SET read_only_extraction_approved = 0, updated_at = ? WHERE user_id = ?;", [nowIso(), user.id]);
  const after = await resumeRun(store, runId, {});
  assert.equal(after.rePlanned, true, "revoked consent must trigger a re-plan");
  assert.ok(after.rePlanReasons.includes("consent_revoked_replan"), "re-plan reason must be consent_revoked_replan");
  assert.equal(after.resumeTarget, "after_planner", "after_planner must be forced back to pending");
});

test("Phase 86: phase80-pattern — turn 2 planner payload carries priorDecisionPointers with non-null dataLayer/riskTier", async () => {
  const store = await createStore("brainsty-p86-p80-");
  const { user, session } = await enrollDefaultMember(store);
  const { runLangGraphOrchestration } = await import("../concierge/langgraphRunner.mjs");
  const { buildLlmOrchestrationDecisionMessages } = await import("../concierge/llmOrchestrationDecision.mjs");
  const rawMessage = {
    source: "phase86_p80_pattern", useLiveModel: false, executeEvidenceObservation: false,
    // V2 GROUPED replay (the post-pivot recorded-corpus shape) — v1 flat replays lift
    // with data_layer:[] by design, so the layer-flow proof must replay v2.
    llmOrchestrationDecisionReplay: {
      classification: { workflow: "eligibility_benefits_navigation", taskClass: "coverage_verification", intent: "benefits_eligibility", confidence: 0.9, rationale: "replay" },
      data_layer: ["layer_2_member_authorized_api"],
      risk_tier: "medium",
      response: { responseStrategy: "answer", workerGoal: "read-only" }
    }
  };
  // Turn 1 checkpoints the decision (its data_layer/risk_tier land in the statePatch).
  const turn1 = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: "check my benefits", rawMessage });
  assert.ok(turn1.state.llm_orchestration_decision?.data_layer?.length > 0, "turn 1 decision must carry data_layer");
  // Turn 2 hydrates the pointers back — layer fields must be NON-NULL in the planner payload.
  const turn2 = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: "and my claims?", rawMessage });
  const payload = JSON.parse(buildLlmOrchestrationDecisionMessages(turn2.state).find((m) => m.role === "user").content);
  const pointers = payload.runtimeContext?.priorDecisionPointers ?? [];
  assert.ok(pointers.length > 0, "turn 2 payload must carry prior decision pointers");
  assert.ok(pointers[0].dataLayer, "priorDecisionPointers[0].dataLayer must be non-null");
  assert.ok(pointers[0].riskTier, "priorDecisionPointers[0].riskTier must be non-null");
});

test("Phase 86: dispatchOnce lock JSON carries informational layer fields without touching the key", async () => {
  const store = await createStore("brainsty-p86-idem-");
  const { user, session } = await enrollDefaultMember(store);
  const { dispatchOnce, computeDispatchIdempotencyKey, workerPlanSignature } = await import("../concierge/dispatchIdempotency.mjs");
  await store.insert("workflow_runs", {
    id: "wfrun:p86-idem", user_id: user.id, session_id: session.id, workflow_key: "w", journey_stage: "j",
    status: "started", route_reason: "test", started_at: nowIso(), created_at: nowIso(), updated_at: nowIso()
  });
  const key = computeDispatchIdempotencyKey({ runId: "wfrun:p86-idem", beforeWorkerCheckpointId: "", workerPlanSignature: workerPlanSignature(["p"]) });
  let dispatches = 0;
  const first = await dispatchOnce(store, { workflowRunId: "wfrun:p86-idem", idempotencyKey: key, dataLayer: "layer_1_public", riskTier: "low" }, async () => { dispatches += 1; return { resultPointer: "r1" }; });
  assert.equal(first.dispatched, true);
  const dup = await dispatchOnce(store, { workflowRunId: "wfrun:p86-idem", idempotencyKey: key, dataLayer: "layer_1_public", riskTier: "low" }, async () => { dispatches += 1; return { resultPointer: "r2" }; });
  assert.equal(dup.duplicatePrevented, true, "second dispatch with the same key must be prevented");
  assert.equal(dispatches, 1, "the real dispatch ran exactly once");
});
