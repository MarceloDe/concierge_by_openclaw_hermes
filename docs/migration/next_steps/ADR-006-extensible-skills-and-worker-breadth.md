# ADR-006: Extensible Skills And Worker Breadth Inside The Envelope

Date: 2026-06-21

## Status

Proposed. Sequenced after ADR-005. Extends ADR-002 (manager/worker) without changing its safety posture.

## Context

Today the skill system is effectively single-skill: it is **triple-hardcoded to `insurance_portal_browser`** — in the artifact validator (`openclawSkillArtifacts.validateOpenClawSkillArtifact`), in `dynamicSkillServer.selectByKind` (the default `executionSkillKey`), and in the official runtime default. Adding a second real skill means editing three modules. The worker contract is also narrow: it executes one read-only observation; the founder's intent is a worker that solves problems with **breadth** — multi-tool, multi-skill, community skills via the gateway, choosing its own tool path — and that **remembers what worked** (procedural worker memory, like a normal OpenClaw instance).

The safety insight that makes breadth acceptable: breadth of *how* the worker solves a task is safe as long as the **envelope** bounds *what* it may touch (read-only scope, approved actions only, no credentials, full audit). The harness stays the workflow master.

## Decision

1. **Registry-driven skills (de-hardcode).** Make skill discovery/selection fully registry-driven across all three sites; `insurance_portal_browser` becomes one entry, not a constant. Adding a skill = dropping a `SKILL.md` + `skill.json` folder that passes the generic artifact validator. Multiple execution skills can coexist and be selected by match score.
2. **Worker breadth within the envelope.** Within an approved task, let the worker decompose, spawn task-scoped subagents, select among tools/community skills, and use the gateway — all still bounded by `workerPolicy` blocked-actions and the read-only/approval envelope (`workerMayChooseWorkflow=false`, no credentials, no writes without a bound token).
3. **Procedural worker memory.** Persist successful worker procedures (tool/skill sequence that achieved a sourced result) to a worker-memory store, masked and source-pointered like product memory. This feeds the PEMS candidate pipeline (ADR-007) — it does not yet drive answers.

## Consequences

- Unlocks the multi-skill, community-skill, gateway-driven worker the product needs, without loosening the safety envelope — the blocked-action matrix and approval gates are unchanged and remain the enforcement point.
- The generic artifact validator must be strict enough that a community skill cannot smuggle a blocked capability; `openclaw-skill-registry` / `openclaw-worker-contract` suites are the guard and must stay green.
- Procedural worker memory adds a store; it is masked, PHI-gated, and `cortexProductMemory=false` like product memory.
- More skills means more surface to review; mitigated by the artifact validator + the PEMS reviewer workbench.

## Verification

`npm run test:openclaw:skills`, `npm run test:local` (worker-contract + skill-registry suites green and unmodified in their safety assertions), plus a new multi-skill selection test and a worker-memory contract test. The blocked-action matrix is asserted unchanged.
