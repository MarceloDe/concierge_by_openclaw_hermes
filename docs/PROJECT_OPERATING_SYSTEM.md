# Workerprototype OpenClaw Project Operating System

Status: Phase 38 canonical guide.

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
- Product memory is Graphiti/FalkorDB or another explicit runtime product-memory adapter, never Cortex.
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

Phase 38 adds richer reviewer comparison and evaluator provenance on top of the Phase 37 workbench:

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
- existing `case_state_shadow` graph node remains the pre-answer shadow checkpoint;
- dashboard proof for `continuous_intelligence_shadow_persistence`, `pems_supervised_promotion_gate`, `pems_reviewer_evaluator_workbench`, `pems_reviewer_ui`, and `pems_reviewer_comparison_provenance`;
- production decisioning still disabled.

Phase 38 does not let reviewer comparison or evaluator provenance drive production recommendations. The UI is an operator surface for explicit review rows only. It renders advisory draft previews, consistency trace refs, comparison rows, evidence chips, and provenance refs without raw notes, raw traces, raw prompts, or raw completions, and every action keeps `productionDrivingAllowed=false`.

## Recommended Next Phases

Phase 39 should add live evaluator generation and deeper reviewer filters only if credentials and observed egress are present:

- live-gated evaluator draft creation with observed egress;
- reviewer filters across multiple candidates and drafts;
- richer citation closure display for each advisory claim;
- no automatic production recommendations.

Phase 39 must still keep healthcare authority in LangGraph and keep OpenClaw bounded by assigned tasks and explicit approvals.
