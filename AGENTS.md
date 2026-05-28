# Codex Project Instructions

This repository is governed by `brainstyworkers_ai_concierge_prompt.md`.

Before implementation, Codex must read that file completely and treat it as the primary product, architecture, and behavior source for the Brainstyworkers AI Concierge.

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
