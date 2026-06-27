# Phase Scoreboard

Status: Phase 44 canonical scoreboard.

This file is the local score mirror for the goal-tied development loop. The operator dashboard must expose this discipline through proof scores, and Cortex must hold the durable semantic/procedural version.

| Gate | Target | Current State | Notes |
|---|---:|---|---|
| canonical_operating_system | 100 | Phase 32 target | `PROJECT_OPERATING_SYSTEM.md`, this scoreboard, non-mocked proof rules, dashboard/API proof, and Cortex mirror must exist. |
| ralph_phase_loop | 100 | Phase 32 target | Every phase must have requirements, architecture, loop, proof, hardening, and recorded memory. |
| non_mocked_product_proof | 100 | Phase 32 target | No mocked LLM, browser, provider, or memory proof may be scored as live product readiness. |
| cortex_main_memory_mirror | 100 | Phase 32 target | Durable objectives and phase-loop procedure must land in Cortex via PR. |
| llm_intelligence_maturity | 60 | Implemented but incomplete | Structured intent and sourced composition exist; continuous procedural memory and broader live trace proof remain next-phase work. |
| openclaw_bounded_worker | 85 | Implemented | Registry, executor, proposal, and approval boundaries exist; broader channel skills remain future work. |
| remote_steel_ops | 100 | Implemented in Phase 31 | Remote-host readiness and ops drills are distinct from SaaS browser-provider readiness. |
| continuous_procedural_memory | 100 | Phase 44 reviewer history review refinement | Typed `CaseState`, G0-G8 gates, PEMS, append-only shadow runs, aggregate candidate maturity, `pems_candidate_promotion_reviews`, `pems_candidate_evaluator_drafts`, `pems_candidate_claim_revisions`, `pems_candidate_review_followups`, `pems_candidate_review_history_exports`, an operator reviewer UI, deterministic-vs-advisory comparison rows, source-pointer chips, evaluator provenance refs, live-gated evaluator draft creation, reviewer filters, claim-level citation closure labels, reviewer claim revision records, revision-to-review follow-up bindings, ref-only longitudinal audit exports, and operator-side export search/sort/snapshot comparison now exist; evaluator drafts, claim labels, suggested edits, revision records, follow-up records, history exports, history review rows, snapshot deltas, and UI controls are advisory/ref-only, mocked LLM output never counts as live proof, unsupported/low-confidence claims visibly veto approval until revised or blocked, explicit reviewer/validator/citation/safety gates remain authoritative, and production decisioning remains disabled. |
| production_contract_phase66 | 100 | Phase 66 founder production contract | Patient/member bill verification, Postgres default, 5-year retention, encrypted cloud backup/restore drill, Graphiti/Zep schema-first memory, self-hosted Steel on AWS, user-controlled OpenClaw auth, generated-skill review policy, and LLM-primary sourced answers are locked before Phases 67-73. |
| graphiti_zep_schema_memory_phase67 | 100 | Phase 67 schema-first product memory | Python/Pydantic contracts now define Brainsty memory entities, edges, group IDs, temporal rules, privacy filtering, ingestion envelopes, retrieval primitives, seed Ralph loop templates, idempotent migration shape, schema docs, and fourteen schema acceptance tests without implementing the executor/UI. |
| postgres_production_default_phase68 | 100 | Phase 68 production database default | Production/prod/staging profiles with `BRAINSTY_DATABASE_TARGET=postgres` now resolve to the Postgres runtime by default while local development stays SQLite; state scope, 5-year retention, encrypted cloud backup/restore drill, secret profile, provider backup policy, and bound-parameter adapter proof are dashboard-visible. |
| bill_verification_mvp_phase69 | 100 | Phase 69 patient bill verification flow | `/mvp` now has a regular-user bill note intake and `POST /api/bill-verification/analyze` extracts safe bill signals, source-pointer refs, missing evidence, no-login fallback, and parallel agent plan without payer contact, form submission, credential entry, or raw text storage. |
| authenticated_openclaw_bill_flow_phase70 | 100 | Phase 70 live-gated browser proof | Bill verification can request authenticated OpenClaw only behind user-controlled login and read-only approval; dashboard proof distinguishes live-gate-ready from actually signed-in portal readiness and keeps credentials, passkeys, 2FA, captcha, submissions, uploads, payer contact, payments, and record changes human-only. |
| bill_memory_skill_loop_phase71 | 100 | Phase 71 ref-only learning loop | Successful bill verification cases create Graphiti/Zep case episodes and operator-reviewed skill candidates with tools, extractors, verifiers, sensors, controller loop, UI blocks, retrieval rules, tests, kill switch, PR-gated production activation, and production driving blocked. |
| bill_sourced_answer_phase72 | 100 | Phase 72 sourced answer rails | Bill verification final answers prefer LLM-sourced composition when cited evidence is valid; every supported bill/provider/cost/claim fact must cite an allowed source pointer, and unsupported/uncited/external-action claims fall back deterministically. |
| first_testable_mvp_readiness_phase73 | 100 | Phase 73 local MVP ready | Phases 66-72 are aggregated into a first regular-user bill-verification MVP on `/mvp`; production readiness remains false until live Postgres, Graphiti/Zep, hosted browser, authenticated OpenClaw, and live LLM proofs are complete. |
| multi_channel_openclaw_gateway | 0 | Deferred | WhatsApp, Telegram, email, and voice are not production-ready. |
| production_database_rollout | 90 | Partially ready | Postgres profiles and safety contracts exist; production default rollout must still be proven under real deployment conditions. |
| redis_runtime_context_phase76_82 | 0 | Active plan | Redis pointer runtime, compact checkpoint manifests, capability portfolio pointers, LLM output indexing, vector-to-context retrieval, and resumable LangGraph checkpoints are mandatory for the next LLM-primary orchestrator wave. |
| llm_primary_chat_orchestrator_phase76_82 | 0 | Active plan | Typed chat must use top-tier planner reasoning over session context, capability portfolio, OpenClaw skills, remote browser state, DB pointers, and prior checkpoint decisions; deterministic code remains safety/validation only. |

## Phase 32 Acceptance Checklist

- `docs/PROJECT_OPERATING_SYSTEM.md` exists and names Cortex as canonical.
- `docs/PHASE_SCOREBOARD.md` exists and identifies incomplete intelligence gaps.
- `docs/NON_MOCKED_PROOF_RULES.md` exists and blocks fake live proof claims.
- `GET /api/proof/runs/server-connector-next-mobile-mvp` exposes `canonical_goal_tied_phase_execution`.
- Dashboard renders the new goal and score through the existing connector proof panel.
- Tests fail if the operating-system docs or proof keys are removed.
- Cortex receives semantic and procedural mirrors through PR.

## Phase 33 Acceptance Checklist

- `src/concierge/continuousIntelligence.mjs` defines `brainstyworkers.case_state.v1` and `brainstyworkers.pems.v1`.
- LangGraph includes a `case_state_shadow` node after evidence observation and before response composition.
- G0-G8 gates are present in order and run in `shadow_only` mode.
- PEMS can mark mature candidates trusted only after enough shadow runs, reviewer approvals, no safety incidents, and a score at or above threshold.
- Connector proof exposes `continuous_procedural_memory_shadow` and `continuous_intelligence_shadow`.
- Score `continuous_procedural_memory` passes only the Phase 33 shadow scaffold target, not full production procedural automation.
- Tests prove no raw user input, raw source URL path, or Cortex-as-product-memory claim leaks into `CaseState`.

## Phase 34 Acceptance Checklist

- `continuous_intelligence_shadow_runs` exists as the append-only trace ledger.
- `pems_candidate_maturity` exists as the aggregate candidate maturity table.
- Real LangGraph runs persist a final shadow after response composition and product-memory retain.
- Connector proof exposes `continuous_intelligence_shadow_persistence`.
- Score `continuous_procedural_memory` reaches only the Phase 34 persistence target, not full production procedural automation.
- PEMS remains untrusted without reviewer approvals.
- `productionDrivingAllowed=false` remains enforced.
- Tests prove persisted payloads do not contain raw user input or raw source URLs.

## Phase 35 Acceptance Checklist

- `pems_candidate_promotion_reviews` exists as the audited reviewer/evaluator ledger.
- `pems_candidate_maturity` records `supervised_advisory_allowed`, `promotion_status`, `last_reviewed_at`, and `promotion_json`.
- PEMS promotion fails without at least two explicit human reviewer approvals.
- PEMS promotion fails without a validator/evaluator pass.
- PEMS promotion fails without citation/evidence sufficiency.
- Any safety incident or safety review failure vetoes supervised advisory.
- Connector proof exposes `pems_supervised_promotion_gate`.
- Score `continuous_procedural_memory` reaches only the Phase 35 supervised-advisory target, not full production procedural automation.
- `productionDrivingAllowed=false` remains enforced even when supervised advisory is allowed.
- Tests prove promotion-review payloads store safe rationale previews and hashes, not raw sensitive text.

## Phase 36 Acceptance Checklist

- `pems_candidate_evaluator_drafts` exists as the sanitized advisory-draft ledger.
- Evaluator drafts store note hashes, safe previews, consistency trace refs, and trace hashes instead of raw advisory notes, raw traces, raw source text, raw OCR, raw frames, credentials, or secrets.
- Drafts may be LLM-assisted advisory material, but no mocked LLM output is scored as live LLM proof.
- Drafts do not change `pems_candidate_maturity`, supervised advisory state, healthcare routing, final answers, browser actions, OpenClaw dispatch, payer contact, external messages, or writes.
- A draft affects the promotion ledger only when an explicit human or deterministic reviewer submits a `pems_candidate_promotion_reviews` record linked by advisory draft id.
- Connector proof exposes `pems_reviewer_evaluator_workbench`.
- Score `continuous_procedural_memory` reaches only the Phase 36 reviewer-workbench target, not full production procedural automation.
- `productionDrivingAllowed=false` remains enforced.
- Tests prove sanitized draft storage, advisory-only behavior, explicit review linkage, and dashboard/API proof.

## Phase 37 Acceptance Checklist

- Dashboard exposes a `PEMS Reviewer Workbench` panel.
- The panel loads `/api/continuous-intelligence/pems/workbench`.
- The panel renders latest candidate id, promotion state, latest advisory draft id, evaluator mode, deterministic validator status, suggested review, consistency trace ref, sanitized previews, and safety flags.
- Approve, reject, and block controls submit explicit review rows to `/api/continuous-intelligence/pems/reviews`.
- UI actions include `advisoryDraftId` and never submit raw advisory notes, raw consistency traces, raw OCR, raw frames, credentials, or secrets.
- Connector proof exposes `pems_reviewer_ui`.
- Score `continuous_procedural_memory` reaches only the Phase 37 reviewer-UI target, not full production procedural automation.
- `productionDrivingAllowed=false` remains enforced.
- Tests and visual proof show the UI works for a regular operator.

## Phase 38 Acceptance Checklist

- Workbench API includes `reviewerComparison`.
- Connector proof exposes `pems_reviewer_comparison_provenance`.
- Dashboard renders deterministic-vs-advisory comparison rows.
- Dashboard renders cited evidence chips for advisory drafts.
- Dashboard renders evaluator provenance refs without raw prompts or raw completions.
- Mocked LLM output never counts as live LLM proof.
- Score `continuous_procedural_memory` reaches only the Phase 38 reviewer-comparison target, not full production procedural automation.
- `productionDrivingAllowed=false` remains enforced.
- Tests and visual proof show the comparison/provenance panel works for a regular operator.

## Phase 39 Acceptance Checklist

- Workbench API accepts draft status, evaluator mode, candidate id, and live-only filters.
- Workbench API returns `liveEvaluatorFiltering`, `appliedFilters`, `filterOptions`, `filteredDraftCount`, and `draftQueue`.
- Node exposes `POST /api/continuous-intelligence/pems/live-evaluator-drafts`.
- Live evaluator generation requires source pointer IDs, an OpenAI key, and observed outbound payload egress.
- Mocked or injected LLM output never counts as live LLM proof.
- Live evaluator draft metadata stores refs, hashes, source-pointer IDs, and safe previews only.
- Dashboard renders filter controls, filtered draft queue, live evaluator gate, and mocked-output proof status.
- Connector proof exposes `pems_live_evaluator_generation_filtering`.
- Score `continuous_procedural_memory` reaches only the Phase 39 live-evaluator/filtering target while `productionDrivingAllowed=false`.
- Tests and visual proof show the live evaluator/filtering panel works for a regular operator.

## Phase 40 Acceptance Checklist

- Live evaluator prompt schema asks for claim-level citation closure labels.
- Stored PEMS draft metadata includes claim hashes/previews, allowed source-pointer IDs, labels, suggested edits, and summary counts only.
- Raw claims, raw source text, raw prompt text, and raw completion text are not stored in reviewer surfaces.
- Workbench API returns `liveClaimCitationClosure` with supported, low-confidence, unsupported, reviewer-edit, source-pointer-bounded, and safety fields.
- Connector proof exposes `pems_live_claim_citation_closure`.
- Dashboard renders a claim citation closure table with supported, low-confidence, and unsupported labels.
- Unsupported or low-confidence claims visibly require reviewer edits and disable approval while reject/block remain available.
- Claim labels do not create evidence and do not drive healthcare answers, workflow routing, approval outcomes, browser actions, OpenClaw dispatch, payer contact, external messages, or payer writes.
- Score `continuous_procedural_memory` reaches only the Phase 40 claim-closure target while `productionDrivingAllowed=false`.
- Tests and visual proof show the claim-closure panel works for a regular operator.

## Phase 41 Acceptance Checklist

- `pems_candidate_claim_revisions` exists as an append-only reviewer revision ledger.
- `PEMS_REVIEWER_CLAIM_REVISION_VERSION` is defined.
- Reviewer revisions bind candidate id, advisory draft id, claim id/hash, actor id, original claim hash/preview, suggested edit hash/preview, revised claim hash/preview, source pointer IDs, and deterministic reclosure.
- Deterministic reclosure uses only allowed source pointer IDs from the source draft.
- Raw original claims, raw suggested edits, raw revised claims, raw source text, raw prompts, raw completions, credentials, secrets, and PHI are not stored in reviewer surfaces.
- Workbench API returns `reviewerClaimRevisions`.
- Connector proof exposes `pems_reviewer_claim_revisions`.
- Dashboard renders a reviewer claim revision panel with before/suggested/revised rows, reclosure state, source pointers, and advisory-only safety.
- Revision records do not create evidence, bypass human review, drive healthcare answers, route workflows, dispatch OpenClaw, contact payers, send messages, or write to payer portals.
- Score `continuous_procedural_memory` reaches only the Phase 41 revision-record target while `productionDrivingAllowed=false`.
- Tests and visual proof show the revision panel works for a regular operator.

## Phase 42 Acceptance Checklist

- `pems_candidate_review_followups` exists as an append-only reviewer follow-up ledger.
- `PEMS_REVIEWER_FOLLOW_UP_VERSION` is defined.
- Reviewer follow-ups bind candidate id, advisory draft id, claim revision id, and promotion review id.
- Follow-up workflow states distinguish open, resolved, and blocked advisory work.
- A resolved follow-up requires a deterministic reclosure-passed revision and a later explicit review decision.
- Raw review text, raw revision text, raw rationale text, raw source text, raw prompts, raw completions, credentials, secrets, and PHI are not stored in reviewer surfaces.
- Workbench API returns `reviewerFollowUps`.
- Connector proof exposes `pems_reviewer_follow_up_workflows`.
- Dashboard renders a reviewer follow-up workflow panel with revision binding, review binding, workflow state, action required, and advisory-only safety.
- Follow-up records do not create evidence, bypass human review, drive healthcare answers, route workflows, dispatch OpenClaw, contact payers, send messages, or write to payer portals.
- Score `continuous_procedural_memory` reaches only the Phase 42 follow-up target while `productionDrivingAllowed=false`.
- Tests and visual proof show the follow-up panel works for a regular operator.

## Phase 43 Acceptance Checklist

- `pems_candidate_review_history_exports` exists as an append-only reviewer history export ledger.
- `PEMS_REVIEWER_HISTORY_EXPORT_VERSION` is defined.
- Reviewer history exports bind optional candidate id and advisory draft id to filters, export ref, export hash, and snapshot hash.
- Export snapshots store IDs, counts, statuses, refs, and hashes only.
- Raw history text, revision text, review text, source text, prompts, completions, OCR, frames, credentials, secrets, and PHI are not stored in export rows.
- Workbench API returns `reviewerHistoryExports`.
- Connector proof exposes `pems_reviewer_history_audit_exports`.
- Dashboard renders a reviewer history audit export panel with export ref, snapshot hash, row counts, and latest safe refs.
- History exports do not create evidence, bypass human review, drive healthcare answers, route workflows, dispatch OpenClaw, contact payers, send messages, or write to payer portals.
- Score `continuous_procedural_memory` reaches only the Phase 43 history-export target while `productionDrivingAllowed=false`.
- Tests and visual proof show the history export panel works for a regular operator.

## Phase 44 Acceptance Checklist

- `PEMS_REVIEWER_HISTORY_REVIEW_VERSION` is defined.
- Workbench API returns `reviewerHistoryReview`.
- Connector proof exposes `pems_reviewer_history_review_refinement`.
- Operators can search/filter history exports by candidate id, advisory draft id, follow-up status, export ref, and snapshot hash.
- Operators can sort history exports by created time, history row count, export ref, or snapshot hash.
- Snapshot comparison works across two reviewer history exports and returns safe count deltas plus added/removed safe refs only.
- Dashboard renders `Reviewer History Search And Snapshot Diff`.
- History review rows and snapshot comparison do not create evidence, bypass human review, drive healthcare answers, route workflows, dispatch OpenClaw, contact payers, send messages, or write to payer portals.
- Raw history text, revision text, review text, follow-up text, source text, prompts, completions, OCR, frames, credentials, secrets, and PHI are not stored in the history review surface.
- Score `continuous_procedural_memory` reaches only the Phase 44 history-review target while `productionDrivingAllowed=false`.
- Tests and visual proof show the history review panel works for a regular operator.
