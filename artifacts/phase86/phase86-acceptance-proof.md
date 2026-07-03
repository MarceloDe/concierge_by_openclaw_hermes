# Phase 86 acceptance proof — Redis runtime deltas + legacy portfolio removal

Branch: `phase-86-redis-deltas-legacy-portfolio-removal`.
Plan: `docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md` §6 / §11 Phase 86.
Date: 2026-07-03. All proofs are REAL runtime runs — LIVE Redis (RESP over TCP,
127.0.0.1:6381), real SQLite, real cross-process node spawns, LIVE gpt-4.1 eval. No
mocks, per `docs/NON_MOCKED_PROOF_RULES.md`.

## Acceptance arms (§11 Phase 86)

| Arm | Result | Evidence |
|---|---|---|
| Golden-value: `computeDispatchIdempotencyKey` unchanged for a recorded pre-pivot pointer set | PASS | `src/tests/dispatch-idempotency-golden.test.mjs` (blocking, in `test:local`) — signature `7f26b80d…`/key `efad2fcf…` recorded against the pre-Phase-86 implementation before any edit; order-insensitivity + empty-set arms included |
| Live turn: `brainsty:consent-state`/`oauth-session` real read-back, ZERO secret substrings | PASS (live Redis) | `test:redis:phase86` arm 1 — real vault write (`cacheSessionArtifact`) mirrors the handle; RESP read-back of both keys; raw values grep clean of the plaintext, the full secret hash, credential-valued fields, and bearer tokens; the handle carries `credential_session_vault#<rowId>` POINTER + sha256-prefix-24 only |
| Consent flip → eviction → next-turn route change visible in the planner prompt | PASS (live Redis) | `test:redis:phase86` arm 2 — turn 1 payload `consentState.layers.layer_3_portal_control.allowed=true`; authoritative `UPDATE user_consents` + synchronous `evictConsentState`; turn 2 planner payload (the `planner.start` full_prompt content) shows `allowed=false`; the layerRouting mirror agrees |
| Fresh session: `brainsty:capability-portfolio` ABSENT, `capability-catalog` populated | PASS (live Redis) | `test:redis:phase86` arm 3 — SCAN shows 0 legacy keys for the fresh session, exactly 1 catalog mirror key |
| SCAN-prefix set equals documented namespaces | PASS (live Redis) | `test:redis:phase86` arm 3 — every observed `brainsty:*` prefix is in `docs/db/redis-keys.json` (`scanKeys` = cursor-iterated SCAN, never KEYS); residual PRE-pivot `capability-portfolio` keys are the only tolerated exception, recorded loudly — TTL 1800s, grep-zero proves no writer/reader remains |
| Grep-zero: no remaining imports/calls of removed symbols | PASS | `attachCapabilityPortfolio`, `hydrateCapabilityPointers`, `loadCapabilityPortfolio`, `capabilityPortfolioKey`, `BRAINSTY_PLANNER_DB_CATALOG`, `capabilityPortfolio.mjs` — zero non-comment references across `src/` + `scripts/`; the module file is DELETED |
| phase80-pattern: `priorDecisionPointers[].dataLayer/riskTier` non-null reaching the planner payload | PASS | `phase86-redis-runtime.test.mjs` — turn 1 v2 replay checkpoints `data_layer`/`risk_tier` into the statePatch; turn 2 planner payload carries them non-null in `runtimeContext.priorDecisionPointers[0]`; pre-pivot checkpoints hydrate null (tolerant read, unit-proven) |
| `eval:planner` shows `plannerCapabilitySource=db_catalog` on 100% of turns | PASS (LIVE gpt-4.1) | new scored dimension in `scripts/planner-eval.mjs`: **capability source 6/6 (100%)** on every recorded run |

## §6.1 new namespaces (wired to real callers — no scaffolds)

- `consentStateRuntime.mjs` — `buildConsentStateFromDb` reuses the Phase 85 credentialVault
  consent builder (ONE derivation for the graph channel and the mirror); `loadConsentState`
  rebuild-on-miss; `evictConsentState` called synchronously inside the `user_consents` write
  (`enrollment.mjs`) and by the `resumeRun` revocation re-plan. Fail-closed: a missing
  consent row denies all portal layers. The mirror is NEVER the consent authority.
- `oauthSessionRuntime.mjs` — handles are SHAPE-ENFORCED (whitelist build; a handle without
  a `credential_session_vault#` pointer throws classified `oauth_session_handle_invalid_pointer`);
  TTL `min(1800, seconds-to-token-expiry)`; written from the REAL vault write path
  (`cacheSessionArtifact`), evicted on vault revoke; read into `layerRouting.oauthHandles`.

## §6.2 changed hydration

- `memoryHarness.buildContextPacket`: the hard-coded safety literal is REPLACED — consent
  flags come from the mirror; the four hard boundaries stay NON-OVERRIDABLE code floors.
  `packet.runtimeContext.layerRouting` = {consentState, oauthHandles (pointer+hash only),
  browserReadinessTier} — the single per-turn hydration point.
- `runtimeContextCache` v2: compacted checkpoints + priorDecisionPointers carry
  dataLayer/riskTier from the checkpoint statePatch; pre-pivot manifests hydrate null.
- `workerRuntimeState` v2: dispatch entries carry dataLayer/riskTier/oauthHandlePointer
  (pointer only); key/TTL/historyLimit unchanged.
- `dispatchIdempotency` v2: SETNX lock JSON carries INFORMATIONAL dataLayer/riskTier;
  `workerPlanSignature`/`computeDispatchIdempotencyKey` byte-identical (golden gate).
- `checkpointRunLedger` v2: the shadow run row records `readiness_json.decisionLayer`;
  `resumeRun` re-reads the AUTHORITATIVE `user_consents` row (never the mirror) — a
  revoked layer forces `after_planner` back to pending with `rePlanReasons:
  ["consent_revoked_replan"]` + mirror eviction. `RUN_LEDGER_BOUNDARIES` frozen.
  Proven: `phase86-redis-runtime.test.mjs` (grant → no re-plan; revoke → re-plan).

## §6.3 retired namespace + retarget

- `capabilityPortfolio.mjs` DELETED (writer + Redis-trusting deref). `packet.capabilityPortfolio`
  repointed to the `loadSessionPortfolio` DB-catalog manifest (`source: "db_catalog"`).
- `langgraphRunner` hydration is UNCONDITIONALLY the authoritative catalog hydrator
  (`hydrateCapabilityPointer`, backing-precedence, §7.0 gate); the `BRAINSTY_PLANNER_DB_CATALOG`
  switch is deleted with the legacy fallback (no dual pathway remains).
- `runtimeVectorIndex` v2 retargeted to the DB-catalog promptTable (whenToUse/whyUse/
  approvalScope in the document text); key/TTL/scoring/topMatches≤10 unchanged.
- Cross-process proof rewritten to the catalog mirror (`test:redis:crossprocess` PASS live).
- `docs/DATABASE_REDIS.md` (2 rows added, 1 removed, mermaid + value shapes updated) and
  `docs/db/redis-keys.json` updated in the same PR.

## Latent bug found & fixed (in-scope: Redis runtime)

`MinimalRedisClient` parsed RESP by decoding the buffer to a JS string and slicing
bulk values by the `$<len>` BYTE count — any multi-byte UTF-8 payload (the Phase 85
seed metadata carries "§"/"—") desynced the parser into a silent 3s timeout. This had
rotted `test:redis:{portfolio,provenance,hydration}` (reproduced failing on pre-change
HEAD). Fixed: RESP parsing now operates on the raw Buffer with byte offsets; UTF-8
round-trip proven live (incl. emoji), and all three suites are green again.

Also fixed while proving: v2 normalizer canonicalizes the unambiguous
`workflow:<key>` prefixed form the model occasionally returns (the promptTable
portfolioId representation) ONLY when the bare key is in `allowedWorkflows` — anything
else still fails loud `workflow_not_allowed` (negative arm in
`planner-contract-v2-replay.test.mjs`). This removed a stochastic eval workflow-null.

## Full gates (recorded 2026-07-03)

- `npm run test:local` (final): **412 tests · 409 pass · 0 fail · 3 gated skips** —
  includes the new blocking gates `dispatch-idempotency-golden` (2/2) and
  `phase86-redis-runtime` (7/7). Log: `test-local-final.log`. (One earlier run had a
  single live-LLM workflow-selection wobble in `intelligence-default` — passed twice
  standalone and in the final run; live-model variance, no code change involved. One
  earlier run skipped the live-PG parity arm on a transient connect timeout — re-run
  passed 3/3 with the live arm.)
- LIVE Redis gates: `test:redis:phase86` 3/3 · `hydration` 1/1 · `crossprocess` 1/1 ·
  `phase4` 2/2 · `portfolio` 2/2 · `provenance` 2/2 · `idempotency` 2/2 · `runtime` 4/4.
  `test:redis:worker` 2/3: the failing arm is the flag-driven dispatch-trigger turn
  (`useOfficialOpenClawWorker`) — fails identically on pre-change HEAD and its
  replacement is the ENUMERATED Phase 87 scope (§7 "Dispatch trigger replacement");
  classified deferral, not silence.
- `npm run eval:planner` (LIVE gpt-4.1, final): **6/6 on ALL 9 dimensions** — workflow,
  process, demand, needs, taskClass, data_layer, risk_tier, workflow_graph, and the NEW
  `plannerCapabilitySource=db_catalog` (100%). Log:
  `eval-planner-phase86-final-2026-07-03.log`. Earlier same-day runs recorded the
  transient blank-decision signature (conf 0 — documented in Phase 85) and the
  prefixed-workflow wobble fixed above; all four run logs are committed.
- `npm run build` green; phase 76–81 pointer suites green after catalog retarget
  (phase78 3/3, phase81 3/3 — incl. one PRE-EXISTING phase78 normalizer-options failure
  repaired, confirmed failing on HEAD).
