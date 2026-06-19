# Workerprototype OpenClaw Project Operating System

Status: Phase 32 canonical guide.

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

## Recommended Next Phases

Phase 33 implements the first continuous-intelligence slice:

- typed `CaseState`;
- G0 through G8 LangGraph gate skeleton in shadow mode;
- a real `case_state_shadow` graph node before response composition;
- PEMS maturity schema for procedural skill candidates;
- dashboard proof that the new gate skeleton is active without changing unsafe action authority.

Phase 33 does not let procedural reconstruction drive recommendations yet. It externalizes state, scores maturity, records proof, and keeps production decisioning disabled until a later phase proves enough shadow runs, reviewer approvals, cited evidence, and safety history.
