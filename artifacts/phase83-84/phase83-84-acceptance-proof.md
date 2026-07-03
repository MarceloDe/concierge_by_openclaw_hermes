# Phase 83+84 acceptance proof — DECISION_CONTRACT_V2 + three-layer planner prompt + legacy classification removal

Branch: `phase-83-84-decision-contract-v2` (one PR train — no Phase-83-only deployment).
Plan: `docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md` §3 / §3.4 / §10 / §11 Phases 83-84.
Date: 2026-07-02. All proofs below are REAL runtime runs (real SQLite in mkdtemp, real seeded
catalog, real LangGraph runner, real OpenAI where marked LIVE) — no mocks, per
`docs/NON_MOCKED_PROOF_RULES.md`.

## Phase 83 arms

| Arm | Result | Evidence |
|---|---|---|
| v1 fixture lifts LOSSLESSLY field-by-field | PASS | `src/tests/planner-contract-v2-replay.test.mjs` — "v1 flat decisions lift LOSSLESSLY into the grouped v2 contract" (every §3.3 table row asserted) |
| `allowedWorkflows=[]` hard-fails (fail loud, never permissive) | PASS | `planner-contract.test.mjs` — issue `allowed_workflows_unavailable`, `valid=false` |
| `workflow_not_allowed` issue string byte-identical | PASS | `planner-contract.test.mjs` — `workflow_not_allowed:made_up_workflow` / `workflow_not_allowed:empty` |
| Deterministic risk floor (raise-only) | PASS | `planner-contract.test.mjs` — below-floor → hard issue `risk_tier_below_floor` + tier raised; above-floor accepted |
| Offered-process filter at normalize time | PASS | `planner-contract.test.mjs` — invented process dropped + warning, recommendation re-bound |
| PAS delegation hard gate | PASS | `planner-contract-v2-replay.test.mjs` — `pas_submission_without_provider_delegation` |
| Registry gate (§7.0) | PASS | `planner-contract-v2-replay.test.mjs` — `tool_not_runtime_selectable:*` via `applyDecisionCapabilityGates` |
| execution_policy invariants force-normalized | PASS | contrary vote overwritten + `execution_policy_invariant_overridden:*` recorded |
| live-boot `manifest.allowedWorkflows` NON-EMPTY | PASS (live) | runtime run: seeded catalog → `["claim_status_navigation","denial_appeal_preparation","document_or_trace_review","eligibility_benefits_navigation","human_approval_escalation","payer_portal_read_only_extraction","pharmacy_formulary","prior_authorization_navigation"]` (8 keys, DB-derived); mirror `2026-07-02.catalog-portfolio-mirror.v2`; seed `2026-07-02.capability-catalog-seed.v2` |
| `prompt_version=v2` span metadata | PASS | `planner.start` checkpoint metadata carries `prompt_version:"v2"` + `contract_version:"2026-07-02.llm-orchestration-decision.v2"` (`langgraphRunner.mjs` planner checkpoint) |
| Phase ledger machine-readable + drift check | PASS | `docs/db/phase-ledger.json` + `src/tests/phase-ledger.test.mjs` (schema, 83-92 coverage, dependency resolution, signature phases blocked_external) — in the blocking `test:local` gate |
| eval v2 scoring wired | PASS | `scripts/planner-eval.mjs` scores `taskClassOk`/`dataLayerOk`/`riskTierOk`/`workflowGraphOk` |

## Phase 84 arms

| Arm | Result | Evidence |
|---|---|---|
| `graph_subpath` SQL read-back: 4-node path without `classify_intent` | PASS (live SQL) | `SELECT graph_subpath_json FROM capabilities WHERE capability_key='graph_path:input_policy_to_llm_planner'` → `["input_policy","recall_context","llm_decision","workflow_router"]` |
| Boot seed fail-loud (§10.26) | PASS | `src/server/server.mjs` boot: seed throw OR empty catalog → `capability_catalog_seed_failed` + `process.exit(1)`. NOTE: during this work the seed WAS silently failing on-branch (stale `classify_intent` in the seeded graph path tripping `validateCatalogGraphNodes`) and the old code logged "seed skipped" — the exact §10.26 failure mode, now impossible |
| no-key arm: `llm_unavailable_no_silent_regex` + audit row | PASS | `gate-llm-planner.test.mjs` arm A (audit row `llm_planner_unavailable_no_silent_regex` asserted from the real audit table) |
| injected INVALID decision → `llm_invalid_decision_no_silent_fallback` (no fallback route) | PASS | `llm-orchestration-decision.test.mjs` — "an invalid replayed decision escalates loud"; route `human_approval_escalation`, audit event emitted |
| URGENT live arm (in Phase 84, not deferred) | PASS (live runtime) | urgent-language turn → `route_reason=urgent_emergency_handoff_required`, `workflow_outcome=urgent_handoff_created`, real handoff id persisted, `composeUrgentEscalationResponse` output, `structured_intent` channel ABSENT |
| Repo-wide grep-zero (`classifyHealthcareIntent`, `structuredIntentClassifier`, `structured_intent`, legacy orchestrator-mode env switch) | PASS | zero code references in `src/` + `scripts/` (excluding historical docs/artifacts); 3 legacy modules deleted from the tree |
| `test:checkpoint:resume` green | PASS | `phase80-checkpoint-resume-plan.test.mjs` 2/2 post-migration |
| Native HITL interrupt byte-compatibility | PASS | `graph-interrupt-resume.test.mjs` — pause (`approval_pending_interrupt`) → approved token → `Command.resume` → `approved_consumed` → real `eligibility_snapshots` row, under decision-first routing |
| Live nondeterministic routing (7 lay questions) | PASS (LIVE gpt-4.1) | `orchestrator-nondeterministic-live.test.mjs` 2/2 — 145s of real planner calls under the v2 contract; every question selected a real workflow |
| Langfuse spans | `router.intent_classified` span removed with the node; `planner.start`/`planner.output`/`model.llm_orchestration_decision`/`capability.hydrate` unchanged; full-state snapshot now captures `llm_decision_classification` (taskClass/dataLayer/riskTier) instead of the deleted channel |

## Deltas vs plan text (documented, not silent)

1. Router branch 2 (`llm_invalid_decision_no_silent_fallback`) also covers `replayed_live_decision` invalid decisions — a replay IS a recorded live decision; leaving it out would have re-opened a silent path for recorded-decision replays.
2. `not_requested` decisions route through the loud `llm_unavailable_no_silent_regex` branch — with the classifier deleted there is no honest route for a run that never consulted the planner.
3. `execution_policy_invariant_overridden` and `fallback_unresolvable` are recorded in `warnings` (corrective: value overwritten / entry dropped, decision continues) — the reject-class `issues` list is reserved for the five hard gates the plan marks "hard". Rationale: §3.3 specifies the contrary value is "overwritten ... never obeyed" and unresolvable fallbacks are "dropped", both of which presuppose the decision continues.
4. Seed gains the 8th workflow capability row (`workflow:human_approval_escalation`) so the DB-derived `allowedWorkflows` covers every key of the deleted frozen enum — without it, legitimate planner escalations would be `workflow_not_allowed`.

## Full gates

- `npm run eval:planner` (LIVE gpt-4.1, 2026-07-03, real seeded SQLite store, real planner calls):
  workflow selection 6/6 · process selection 6/6 · demand extraction 6/6 · information needs 6/6 ·
  **task class (v2) 6/6 · data layer (v2) 6/6 · risk tier (v2) 6/6 · workflow graph (v2) 6/6** —
  meets the Phase 83 acceptance bar (≥ pre-change baseline on workflow/process/demand AND 6/6 riskTierOk).
  Log: scratchpad `eval-planner-v2-fixed.log` (per-case detail incl. taskClass/data_layer/risk_tier per question).
  NOTE: the first eval run (before the fix below) scored 4/6 workflow — it exposed a REAL floor bug:
  `capabilityRowTier` treated the legacy backing-row `risk_level:"high"` label on read-only-gated
  OpenClaw workers as a high floor, invalidating honest medium-tier decisions with
  `risk_tier_below_floor`. Fixed gate-bound per §8.1 (high = irreversible WRITE gate only, never a
  free string); the live eval is the proof the fix is calibrated.
- `npm run test:local` (final, 2026-07-03): **395 tests · 392 pass · 0 fail · 3 skipped** (the skips are
  key/Langfuse/Redis-gated live suites that skip loud, per repo convention). EXIT 0.

## Residue verification (explicit pass/fail classification, 2026-07-03)

Verifier sweep over every remaining legacy reference, classified against the plan's sequencing:

**FAILED → FIXED (Phase-84 scope residue found after the main migration):**
- `src/app/mvp.js` (3 sites) + `src/app/app.js` (2 sites): UI read the deleted `structured_intent`
  channel (would render permanently blank) → decision-first reads of `llm_orchestration_decision`.
- `src/concierge/capabilityPortfolio.mjs:71`: graph-path description still named `classify_intent` → corrected.
- 4 test fixtures passed the removed `structuredIntent:` param (continuous-intelligence-persistence,
  3 PEMS suites) → removed; 17/17 green.
- `llm-composition-live.test.mjs` composer fixture + `type-ii-process-offer-live.test.mjs` inert env set → migrated/deleted.
- `/api/openclaw/skills/insurance_portal_browser/validate-envelope` (server.mjs): hardcoded rawMessage
  (no replay passthrough, useLiveModel:false) meant NO caller could reach a validated proposal under
  decision-first routing — a silently-broken working route. Fixed with an explicit
  `llmOrchestrationDecisionReplay` passthrough (not a body spread; replays are normalized + DB-validated,
  never a client selection surface per §10.25).
Post-fix: ZERO non-comment `structured_intent`/`structuredIntent` references in src/ + scripts/ incl. UI.

**PASS — in-plan by explicit phase sequencing (verified against the plan's enumerated site lists):**
- `useOfficialOpenClawWorker` (runner gates :547/:1902/:1929/:2142, run-entry openclaw_enabled seeds,
  observability metadata reader, UI checkbox/payload senders in both frontends, 2 test fixtures):
  ALL sites are on §10.17's enumerated list — Phase 87 scope (dispatch-trigger replacement with its
  continuation-resume + no-client-flag acceptance arms). No unlisted stragglers.
- `BRAINSTY_PLANNER_DB_CATALOG` (2 runner reads + its dedicated test): §10.9 — Phase 86 scope
  (opt-out-only; DB catalog is the default surface and the boot seed is fail-loud, so no silent swap).
- Legacy portfolio module: exactly 2 importers (memoryHarness writer, runner hydration fallback) —
  §10.9/§10.10, Phase 86 scope.
- Remaining textual mentions are deletion-documenting comments and tests ASSERTING the deletion.
