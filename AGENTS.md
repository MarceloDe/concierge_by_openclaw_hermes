# Codex Project Instructions

## Cortex is the canonical source

Before any implementation, every agent (Codex, Claude Code, OpenClaw, Hermes, Cursor, Perplexity Computer) MUST first:

1. Pull the latest `cortex/main`.
2. Read `semantic/projects/workerprototype-openclaw-three-layer-planner-pivot.md` — the **authoritative product source** for the current phase (supersedes `workerprototype-openclaw-late-implementation-architecture.md`).
3. Read the most recent `episodic/<YYYY>/<MM>/*--codex--workerprototype-openclaw--late-implementation-alignment-consolidation.md` — supersedes any earlier architecture note on conflict.

## CURRENT BIG IMPLEMENTATION CHANGE — Three-Layer Planner Pivot (2026-07-02)

The planner moves from the restricted-context MVP to a three-data-layer decision architecture
(`layer_1_public` | `layer_2_member_authorized_api` | `layer_3_portal_control`). Before writing ANY code for it, read, in this order:

1. `docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md` — the BINDING implementation spec (Phases 83–92, decision contract v2, legacy removal list §10, proof cycle §12). Every file:line anchor in it is verified.
2. `docs/THREE_LAYER_PLANNER_SPINE_CONFIG.yaml` — the founder's permanent spine config (Capability Registry vs Executable Tool Catalog vs Planner Exposure Contract, evidence classes, embedding/vault/interrupt/reauth policies). Where plan and YAML conflict, the YAML wins.
3. `docs/THREE_LAYER_PLANNER_PROMPT_DRAFT.md` + `docs/THREE_LAYER_PIVOT_RATIONALE_AETNA_UM.md` — source documents (vocabulary authority + Aetna/UM case and founder constraints).
4. `docs/THREE_LAYER_FOUNDER_DECISION_SHEET.md` — all 17 founder decisions, RESOLVED 2026-07-02.

Hard rules for this change (non-negotiable):

- NO dual pathways, toggles, or switch functions between old and new decision logic — legacy items are DELETED per plan §10 (26 items), never flagged off.
- Every new/adapted function is accepted ONLY with real-runtime proof per plan §12 and `docs/NON_MOCKED_PROOF_RULES.md` — no mock connections, no scaffold modules/DBs; pointers proven by deferred pointers + real queries; negative arms mandatory.
- LangGraph dispatches ONLY Executable Tool Catalog entries (`runtime_selectable=1` + existing backing gates); planned capabilities are registry-visible but never dispatchable (normalizer hard issue `tool_not_runtime_selectable`).
- Signature-gated connectors (Aetna production FHIR, Stedi BAA, Optum/Availity, Da Vinci PAS delegation) land ONLY in Phases 91–92.
- Phase order comes from `docs/db/phase-ledger.json` (Phase 83 work item) reconciled against the Cortex ledger — never inferred from prose.

The Cortex semantic note is the single source of truth for the next implementation phase. `brainstyworkers_ai_concierge_prompt.md` is historical context only. Any conflict between this repo's docs and Cortex is resolved in favor of Cortex.

After a phase is implemented and verified in this repo, the implementing agent MUST:

- Write a new episodic note to Cortex on its own `memory/<agent>/<date>` branch.
- Update the semantic late-implementation-architecture note via `supersedes`.
- Open a PR on the Cortex repo to land both on `cortex/main` **before** marking the phase done.

A phase is not done until both the project commit lands on `concierge_by_openclaw_hermes/main` AND the Cortex notes land on `cortex/main`.

## Branch hygiene

- Start each phase from a fresh branch off `origin/main`: `git checkout -b phase-<N>-<slug> origin/main`.
- Do not push new phase commits onto an already-merged feature branch.
- Open a PR against `main` at session end. CI green is the merge gate.

## Historical context

This repository was originally governed by `brainstyworkers_ai_concierge_prompt.md`.

Before implementation, Codex must read that file completely and treat it as historical product, architecture, and behavior source for the Brainstyworkers AI Concierge.

## Required Startup Workflow

1. Read `brainstyworkers_ai_concierge_prompt.md`.
2. Do not begin implementation immediately.
3. Audit whether the prompt is detailed enough to start a reliable build.
4. Create or update the planning files in `docs/`:
   - `docs/IMPLEMENTATION_PLAN.md`
   - `docs/ACCEPTANCE_CRITERIA.md`
   - `docs/DECISIONS.md`
   - `docs/PROGRESS.md`
5. If critical product or logic details are missing, interview the user before coding.
6. Convert the prompt into small vertical implementation slices that can be tested early.
7. Implement one slice at a time.
8. After each slice, run the relevant build, lint, tests, and browser/API verification.
9. Record proof and remaining risks in `docs/PROGRESS.md`.

## Prompt Sufficiency Audit

Codex must evaluate whether `brainstyworkers_ai_concierge_prompt.md` answers these questions clearly enough:

- What is the first usable MVP?
- Who are the first users: patient, provider, care coordinator, admin, or internal operator?
- Which channel is first: web chat, WhatsApp, Telegram, email, voice, or dashboard?
- Which workflows are in the first build: eligibility, prior auth, denial appeal, claim status, payer contact, document ingest, or general RAG?
- Which actions are simulated, human-approved, or actually executed?
- What data is real, mocked, seeded, or user-entered?
- What must be stored in memory and what must never be stored?
- What healthcare safety, PHI, consent, and audit boundaries apply?
- Which integrations are required now versus deferred?
- What does a successful local demo prove?

If any of these are unclear, Codex must ask concise interview questions and wait for answers before implementing that area.

## Implementation Loop

Use this RALPH loop for the whole project:

- Requirements: extract behavior, workflows, constraints, and unknowns from the source prompt.
- Architecture: choose the smallest stable architecture that supports the first demo and later expansion.
- Loop: implement one vertical slice at a time, from UI/API entry to graph logic to persistence/test proof.
- Prove: verify each slice with commands, tests, screenshots, API calls, or recorded traces.
- Harden: refactor, add guardrails, and expand coverage only after the slice works.

## Early Interaction Rule

The first implementation must produce something the user can interact with quickly. Prefer a narrow web-chat or API demo with mocked/safe healthcare data over a broad incomplete platform.

## Change Control

Do not make late architectural rewrites unless `docs/DECISIONS.md` records:

- The problem with the current path
- The alternatives considered
- The chosen change
- The migration or rework cost

## Safety Boundary

This system touches healthcare and insurance workflows. Do not implement real payer communication, PHI handling, account login, medical advice, or external message sending without explicit user confirmation and a documented approval gate.
