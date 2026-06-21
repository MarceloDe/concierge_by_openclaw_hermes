# Workerprototype OpenClaw Project Operating System

Status: Phase 44 canonical guide.

This document is the repo mirror of the Cortex long-term project objective. It governs future development after Phase 31. Cortex remains the canonical source; this file is the local executable mirror that agents must read before planning or coding.

## Source Of Truth Order

1. Cortex semantic project note for the active phase.
2. Most recent Cortex episodic alignment note for `workerprototype_openclaw`.
3. This operating-system file.
4. `docs/PHASE_SCOREBOARD.md`.
5. `docs/NON_MOCKED_PROOF_RULES.md`.
6. `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/ACCEPTANCE_CRITERIA.md`, and `docs/IMPLEMENTATION_PLAN.md`.
7. `brainstyworkers_ai_concierge_prompt.md` as historical product context only.

If these sources conflict, Cortex wins. If current code contradicts Cortex, pause and write the contradiction into the next plan before changing architecture.

## Durable Objective

Build a production-grade, memory-first, multi-channel healthcare insurance concierge:

- LangGraph owns healthcare journey state, routing, approvals, evidence fan-in, product-memory timing, and final response policy.
- OpenClaw is a bounded proposing and solving worker inside assigned LangGraph tasks.
- FastAPI `/api/v1` is the public connector for remote clients.
- Node remains the internal runtime until a separate migration is explicitly approved.
- Product memory is Graphiti/FalkorDB or another explicit runtime product-memory adapter, never Cortex. The committed default remains disabled/fail-soft; production-candidate Graphiti enablement uses in-boundary FalkorDB plus `GRAPHITI_LLM_PROVIDER=bedrock` and requires `BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED=1` before provider payloads can flow.
- Cortex is project memory for agents, planning, proof, and handoffs.
- Every insurance factual claim must be supported by source pointers or a safe caveat.
- External/write/browser actions require an explicit approval contract.
- No agent may enter credentials, solve 2FA/captcha, submit forms, contact payers, change records, make payments, file appeals, or provide medical advice.

## Phase Execution Contract

Every phase must be goal-tied. A phase is valid only when it has:

- phase number and slug;
- branch from fresh `origin/main`;
- product goal;
- non-goals;
- affected surfaces;
- expected code modules;
- explicit acceptance gates;
- visual/browser proof when UI or browser behavior changes;
- non-mocked proof requirements;
- safety boundaries;
- local commands;
- dashboard/API proof key;
- worker repo PR;
- Cortex episodic and semantic/procedural PR when durable knowledge changes.

No phase is done until both the worker repo changes and Cortex memory changes land on `main`, unless the phase is explicitly planning-only and the user approves no repo code.

## RALPH Loop

Use this loop for each phase:

1. Requirements: read Cortex, repo AGENTS, active docs, source files, and current blockers.
2. Architecture: choose the smallest stable change that advances the durable objective.
3. Loop: implement one vertical slice from API/UI to runtime/test proof.
4. Prove: run focused tests, build, local tests, API proof, and visual proof when applicable.
5. Harden: add guardrails and regression tests after the slice works.
6. Record: update docs, dashboard score, artifacts, PRs, and Cortex.

## Role Model

Use role separation even when one Codex session performs the work:

- Planner: defines phase goal, non-goals, and gates.
- Implementer: changes code/docs inside the approved phase.
- Verifier: runs tests, API proof, and visual proof.
- Reviewer: checks safety, PHI, secrets, OpenClaw/LangGraph authority, and source grounding.
- Cortex Scribe: writes episodic, semantic, and procedural memory after proof.

For real multi-agent runs, each role must use its own Cortex branch and author identity when supported. Do not let multiple agents push unrelated edits into the same feature branch without a single phase owner.

## Active Intelligence Phase

Phase 44 refines reviewer history audit exports into an operator-side history review surface on top of the Phase 43 export ledger:

- append-only shadow-run ledger;
- aggregate PEMS candidate maturity;
- real LangGraph final-trace persistence after response/product-memory retain;
- explicit human reviewer approvals;
- validator/evaluator pass requirements;
- cited-evidence sufficiency checks;
- safety-incident vetoes;
- supervised advisory mode as the only possible promotion state;
- sanitized evaluator draft notes;
- NeSTR-style consistency trace refs;
- advisory material linkage into explicit promotion-review records;
- dashboard UI for ref-only advisory review;
- approve, reject, and block controls that submit explicit review rows;
- deterministic-vs-advisory comparison rows;
- source-pointer evidence chips for advisory drafts;
- evaluator provenance refs, including model and egress refs when present;
- live-gated LLM provenance without counting mocked output as live proof;
- live-gated evaluator draft creation through observed outbound egress when credentials are present;
- reviewer filters for draft status, evaluator mode, candidate id, and live-egress-only draft views;
- explicit filter counts and draft queues for operator review;
- claim-level citation closure labels for live advisory claims;
- supported, low-confidence, and unsupported claim separation;
- reviewer-side suggested edits for unsupported or low-confidence claims;
- approval veto visibility when claim closure requires edits;
- append-only reviewer claim revision records;
- original and revised claim hashes with safe previews only;
- deterministic reclosure for revised claims using allowed source pointer IDs;
- before/suggested/revised dashboard diff rows without raw source text;
- append-only reviewer follow-up workflow records;
- revision-to-review binding across candidate, advisory draft, claim revision, and explicit promotion review ids;
- resolved, open, and blocked advisory follow-up workflow states;
- dashboard UI for revision history across the review lifecycle;
- visible links showing which revision resolved which reviewer veto and which explicit review decision followed it;
- append-only reviewer history audit export records;
- export refs and hashes across candidate, advisory draft, revisions, reviews, and follow-ups;
- filterable history snapshots that store IDs, counts, statuses, and refs only;
- dashboard UI for longitudinal audit export refs;
- operator-side search/sort across history export windows by candidate, advisory draft, follow-up status, export ref, snapshot hash, created time, and history-row count;
- snapshot comparison between two reviewer-history exports over time;
- visible diff counts and added/removed safe refs for export snapshots;
- explicit proof that raw history, revision text, review text, source text, prompts, completions, OCR, and frames are not stored in exports;
- existing `case_state_shadow` graph node remains the pre-answer shadow checkpoint;
- dashboard proof for `continuous_intelligence_shadow_persistence`, `pems_supervised_promotion_gate`, `pems_reviewer_evaluator_workbench`, `pems_reviewer_ui`, `pems_reviewer_comparison_provenance`, `pems_live_evaluator_generation_filtering`, `pems_live_claim_citation_closure`, and `pems_reviewer_claim_revisions`;
- dashboard proof for `pems_reviewer_follow_up_workflows`;
- dashboard proof for `pems_reviewer_history_audit_exports`;
- dashboard proof for `pems_reviewer_history_review_refinement`;
- production decisioning still disabled.

Phase 44 does not let live evaluator drafts, claim labels, suggested edits, reviewer revision records, reviewer follow-up records, reviewer history exports, history-review filters, snapshot comparison rows, or provenance refs drive production recommendations. The UI is an operator surface for explicit review rows, advisory follow-up workflow binding, ref-only longitudinal audit exports, and safe export review. It renders advisory draft previews, claim hashes/previews, source-pointer IDs, consistency trace refs, comparison rows, evidence chips, provenance refs, filter counts, draft queues, before/after revision previews, revision-to-review links, history export refs/hashes, export search rows, and snapshot deltas without raw notes, raw traces, raw prompts, raw claims, raw sources, raw completions, raw review text, raw follow-up text, raw OCR, or raw frames, and every action keeps `productionDrivingAllowed=false`.

## Recommended Next Phases

Phase 45 should continue the reviewer-history program only after Phase 44 is merged into both repos. Candidate directions:

- add saved operator review presets for recurrent history windows;
- add dashboard artifact links for exported history review proofs;
- keep deterministic validators, citation checks, safety gates, and human approvals authoritative;
- no automatic production recommendations.

Phase 45 must still keep healthcare authority in LangGraph and keep OpenClaw bounded by assigned tasks and explicit approvals.
