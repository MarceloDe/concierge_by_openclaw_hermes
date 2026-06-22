<!--
COMMIT TARGET (Cortex repo, private):
  semantic/projects/workerprototype-openclaw-late-implementation-architecture.md
This is a DRAFT of the section to MERGE into the existing semantic note (do not blindly overwrite —
append/replace the "Current architecture direction" section and bump the supersedes chain).
Commit from a machine with Cortex access; land on cortex/main via PR before marking the phase done.
-->

# Semantic update — Late-Implementation Architecture

supersedes: <previous-episodic-or-semantic-ref>
updated: 2026-06-21
status: authoritative direction for Phases 47–49 (orchestration intelligence)

## Current architecture direction: Reasoning Orchestrator With Rails (ADR-004)

The product runtime is a LangGraph state machine whose **rails are deterministic and whose reasoning is
LLM-primary**. This replaces the earlier deterministic-first posture for the orchestration layer. All
safety rails from ADR-001/002/003 are preserved.

### Layer boundary (canonical)

- **Deterministic rails (never model-dependent):** PHI/identifier masking (`modelPayloadPolicy`),
  SHA-256 hash-chained audit (`audit`), approval-token binding (`approvalResume`), schema/allow-list
  validation (`reasoningValidators`, `normalizeLlmOrchestrationDecision`), the source-pointer evidence
  model, and safety refusals (`evaluateInputPolicy` + `refusalForIntent`: emergency→handoff, credential
  entry, medical advice, prompt injection, out-of-scope).
- **LLM-primary reasoning (rails-bounded):** intent understanding, planning under uncertainty, semantic
  substitution of present-for-absent information, answer composition, and worker problem-solving. Curated
  classifier is the fallback used only when a model is unavailable/fails.

### Control-flow rules

- Safety stops are hard and deterministic. Evidence-insufficiency is **never** a stop — it produces a
  best-effort answer plus an AI2UI tiered offer (verify-myself / let-the-concierge-check (sandboxed,
  nothing stored, user provides 2FA) / provide-more-info). The orchestrator may ask ≤2 basic questions
  first but must not block on them.
- Human-in-the-loop is a native LangGraph `interrupt()` backed by a durable checkpointer; resume is a
  `Command(resume=token)` where the single-use, time-boxed, bound approval token remains the authorization
  of record. Fail-closed on expiry/mismatch.
- Models are tiered (`modelTierPolicy`): classifier / reasoner / planner, with a forward seam for an edge SLM.

### What changed vs prior note

- LLM moved from optional advisor to primary reasoner in `classify_intent`, `llm_decision`, and composition.
- Evidence-insufficiency `blocked_*` outcomes replaced by `best_effort_degraded` + options.
- `maybe_model` node retired; `engine.mjs` dead pipeline removed; `MemorySaver` replaced by a durable checkpointer.

### Carried forward unchanged

Worker remains read-only and approval-gated (`workerMayChooseWorkflow=false`); product memory remains
Graphiti, PHI-gated, `cortexProductMemory=false`; Cortex remains project memory only; continuous learning
remains shadow until Phase 52 promotes reviewer-approved skills to answer-driving.
