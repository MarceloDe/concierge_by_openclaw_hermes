# Phase 88 acceptance proof — interrupt kinds + mcpPolicyGuard + durable-interrupt gate

Branch: `phase-88-interrupt-kinds-policy-guard`.
Plan: `docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md` §4.3 / §8 / §11 Phase 88.
Date: 2026-07-03. All proofs are REAL runtime runs — real SQLite + seed, real graph runs
(file-checkpointer restart arms), real approval_gates rows, real audit chain, a real git
worktree at the PRE-Phase-88 commit for the cross-version arm, LIVE gpt-4.1 eval. No
mocks, per `docs/NON_MOCKED_PROOF_RULES.md`.

## Acceptance arms (§11 Phase 88)

| Arm | Result | Evidence |
|---|---|---|
| Existing read-only interrupt pauses/resumes BYTE-COMPATIBLY | PASS | `graph-interrupt-resume.test.mjs` (untouched assertions): `workflow_outcome=approval_pending_interrupt`, payload `type: "read_only_observation_approval"` unchanged; the new `kind` discriminator + §4.3 fields are ADDITIVE. |
| **Cross-version pending-interrupt resume** | **PASS (outright — drain rule stays fallback-only)** | `cross-version-resume-transcript.md` + committed writer/reader scripts: a pending read-only interrupt created under the PRE-Phase-88 tree (git worktree at `origin/main` = 323406f, FILE checkpointer) resumed under Phase 88 code via the same `Command({resume})` path — `approvalResume: approved_consumed`, run completed through the NEW kind-aware topology (new channels hydrate null; the kind-null return edge routes exactly as the old fixed edge). |
| consent_grant end-to-end | PASS | `phase88-interrupts-guard.test.mjs` — revoke → portal turn pauses with `payload.kind=consent_grant` (+ all §4.3 versioned fields asserted field-by-field) → `Command.resume` with the gate token re-runs `plan_journey` → consumption AUTHORIZES the authoritative `user_consents` flip (+ synchronous mirror eviction) → `consent.granted` audited exactly once → run proceeds un-paused. |
| Mismatched-binding consume rejected + audited; double-consume rejected | PASS | same file — `approval_binding_mismatch` + `consent.grant_gate_blocked` audit row; `approval_already_consumed` on reuse. The `auth_handoff` gate pair proves the same single-use/binding discipline. |
| kill -9 during a paused interrupt in file mode → restart → resume completes | PASS | `graph-interrupt-resume.test.mjs` "file-backed checkpointer restores an interrupted LangGraph thread for Command resume" — a SECOND `FileBackedMemorySaver` instance over the same encrypted file (the exact post-kill state: nothing in-process survives) resumes the pending interrupt. |
| Production profile + memory mode exits at boot, classified | PASS | `createGraphCheckpointer({BRAINSTY_RUNTIME_ENV: production\|staging})` throws `non_durable_interrupts_in_production_profile` — derived purely from the runtime profile (same ladder as `redisRequired`), NO new env flag; dev default stays memory. Postgres checkpointer remains the declared production target (founder #4). |
| Guard proof: irreversible action w/o token → `failClosed:true` + `mcp_policy_guard_blocked` audit (chain clean); with token succeeds EXACTLY once | PASS | `phase88-interrupts-guard.test.mjs` — no-token: fail-closed + one blocked audit row; a REAL created write token (carrying the §4.3 fields, `risk_tier_derived: high`): consumption BEFORE verdict, allowed once, `mcp_policy_guard_write_token_consumed` audited, replay of the same token fails closed; `verifyAuditChain` CLEAN over all guard writes; tool OUTPUT stamped `safeForInstructionUse:false` with injection detection. |
| Live turn shows `policy_result.riskTier` + `risk_tier_assigned` audit row | PASS | tier stamped at `input_policy` (covers urgent/blocked short-circuits) and re-derived at `llm_decision` WITH the hydrated rows; the audit row carries `workflow_id, capability_id, risk_tier, reason_code, policy_version, timestamp`. |
| Urgent-language turn: `riskTier=critical` AND `human_handoff_created` | PASS | chest-pain turn → `policy_result.riskTier="critical"` + the human handoff + audit; suppression ordering preserved (hard blocks floor at critical too — `hard_safety_block` reason code arm). |

## What landed

- **§4.3 kinds on the ONE mechanism:** payload `kind` discriminator (`read_only_observation_approval` · `document_candidate_approval` · `single_write_action_approval` · `consent_grant` · `auth_handoff`); NEW `CONSENT_GRANT_GATE`/`AUTH_HANDOFF_GATE` create/consume pairs (same `approval_gates` rows, binding checks, single-use, bounded expiry); kind-aware edges — `plan_journey → approval_pause` (conditional) and `approval_pause → plan_journey | observe_evidence` (kind-aware return). Urgent stays the terminal in-graph rail; clarification stays conversational; `draft_review` deferred to Phase 92 as planned.
- **§4.3 versioned interrupt records (founder #4/#17):** every payload/approval record carries the 15 required fields (`interrupt_id … replay_safety_metadata`) — additive, `INTERRUPT_SCHEMA_VERSION 2026-07-03.interrupt-payload.v1`.
- **§8.1 `deriveRiskTier`** (pure, reason-coded) + `policy_result.riskTier` + `risk_tier_assigned` audit + the hydrate-time tier CEILING in `hydrateCapabilityPointer` (`capability_tier_above_authorized_scope`; the tier→scope map derives from the three gate constants via `riskTierAuthorizedByGates` — consumed write token → high; read-only baseline → medium). **Real bug fixed:** the write-scope regex missed the CANONICAL underscore-joined `approved_single_write_action` scope (word-boundary vs `_`); scopes now normalize before the test.
- **§8.2 `mcpPolicyGuard`:** the single pre-tool-call chokepoint (normalize + fail-closed core + hostile-output classification + consume-before-verdict). ALL three direct `evaluatePortalAction` call sites migrated in the same commit (`browserAutomation`, `llmManagerWorker`, `openclawOfficialRuntime`); the core is no longer exported.
- **§8.3:** `maskOutboundToolArgs` on the one masking layer (`MODEL_PAYLOAD_POLICY_VERSION` v3); connector payload types registered in `outboundPayloadObservability` (v3) ahead of the Phase 89/90 connectors.
- **§4.3 durability:** the profile-derived boot-throw (no env flag).

## Full gates (recorded 2026-07-03)

- `npm run test:local` (final): **428 tests · 425 pass · 0 fail · 3 gated skips** — includes
  the new blocking gate `phase88-interrupts-guard` (6/6). Log: `test-local-final.log`.
- `npm run build` green; schema untouched this phase (no parity delta).
- `npm run eval:planner` (LIVE gpt-4.1): 5/6-with-one-moving-blank across runs, `capability
  source 6/6 (100%)` on every run. **The blank-decision transient is now ROOT-CAUSED and
  observable:** the eval prints the decision `mode`, and every blank case shows
  `mode=openai_chatopenai_failed` — the live planner CALL failed after retries and the run
  degraded to the honest low-confidence clarify path (blank decision, conf 0). Not a contract
  or routing regression; the affected cases pass standalone (3/3 recorded in Phase 87). All
  three run logs committed.
