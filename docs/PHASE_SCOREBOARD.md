# Phase Scoreboard

Status: Phase 36 canonical scoreboard.

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
| continuous_procedural_memory | 85 | Phase 36 reviewer/evaluator workbench | Typed `CaseState`, G0-G8 gates, PEMS, append-only shadow runs, aggregate candidate maturity, `pems_candidate_promotion_reviews`, and `pems_candidate_evaluator_drafts` now exist; evaluator drafts and consistency traces are advisory material only, while explicit reviewer/validator/citation/safety gates remain authoritative and production decisioning remains disabled. |
| multi_channel_openclaw_gateway | 0 | Deferred | WhatsApp, Telegram, email, and voice are not production-ready. |
| production_database_rollout | 90 | Partially ready | Postgres profiles and safety contracts exist; production default rollout must still be proven under real deployment conditions. |

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
