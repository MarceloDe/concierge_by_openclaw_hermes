# Acceptance Criteria — Phases 47–49 (Orchestration Intelligence)

Status: Migration track to ADR-004. Additive to `docs/ACCEPTANCE_CRITERIA.md`.

Last updated: 2026-06-21

This track changes how the system *reasons*; it must not change what the system is *allowed to do*. The governing rule for every slice: **safety-rail suites stay green and unmodified; reasoning suites are updated alongside the code; new behavior gets new suites.**

## Safety invariants that MUST stay green (unchanged) in every phase

These suites guard the rails. If any change is needed to make them pass, the migration is wrong — stop and reassess.

- `policy.test.mjs` — `evaluateInputPolicy` refusals, urgent escalation, prompt-injection, credential/medical-advice detection.
- `phi.test.mjs` + `model-payload-policy.test.mjs` — `maskDirectIdentifiers` masks name/email/SSN/member-ID before any egress.
- `prompt-contracts.test.mjs` — `auditPromptContractSafety`: untrusted-memory withholding, "never click submit", no-medical-advice, source-pointer requirement.
- `output-policy.test.mjs` — composed-response policy.
- `approval-resume.test.mjs` + `execution-v2-write-approval.test.mjs` — single-use, time-boxed, bound tokens; fail-closed on expiry/mismatch.
- `openclaw-worker-contract.test.mjs` + `openclaw-skill-registry.test.mjs` — worker read-only, `workerMayChooseWorkflow=false`, blocked-action matrix.
- `egress.test.mjs` / `outbound-payload-policy-enforcement.test.mjs` — payload observability/enforcement.

## Reasoning suites that WILL change (update alongside code)

- `graph-topology.test.mjs` and `langgraph-runner.test.mjs` — topology + node behavior (Phases 47 & 49).
- `llm-orchestration-decision.test.mjs` — default-on, confidence-band behavior (Phase 47).
- `intelligence-contracts.test.mjs` — LLM-primary with curated fallback (Phase 47).

---

## Phase 47: Invert The Intelligence Default

Phase 47 is acceptable when:

- With a model configured, `classify_intent` and `llm_decision` run the LLM as the primary path and stamp `reasoning_source: "llm"`; with the model disabled or `OPENAI_API_KEY` absent, the curated classifier produces a valid result and stamps `reasoning_source: "curated_fallback"`.
- All model construction routes through `modelTierPolicy.selectModelForStep`; no `new ChatOpenAI(` remains outside that module (grep-asserted in test).
- `validateSourcedAnswer` remains mandatory on every composed answer; an uncited factual claim is still rejected.
- Low-confidence LLM decisions set `route_reason: "low_confidence_clarify"` rather than silently using regex.
- New `intelligence-default.test.mjs` and `model-tier-policy.test.mjs` pass; updated `llm-orchestration-decision.test.mjs` and `intelligence-contracts.test.mjs` pass.
- All safety-invariant suites pass unchanged. `npm run build`, `npm run test:local`, API proof, and visual proof pass.

## Phase 48: Graceful Degradation And The Tiered Offer

Phase 48 is acceptable when:

- A request with insufficient evidence returns a best-effort answer (`workflow_outcome: "best_effort_degraded"`) with an explicit `unverified[]` list and a `degraded_answer_with_options` AI2UI block — and never a refusal.
- Every factual claim in a degraded answer cites a source pointer or is labeled unverified (no confident uncited claims).
- Safety still hard-stops: emergency → handoff; credential entry / medical advice / prompt injection / out-of-scope → refusal — unchanged.
- The `let_concierge_check` option appears only when a portal/document observation is applicable, carries a valid read-only proposal, and on approval resumes through the existing `approvalResume` consume path with no change to token binding.
- The sandbox/privacy copy is rendered from a single shared constant reused by `promptContracts.baseSafetyRules` (asserted identical in test).
- New `graceful-degradation.test.mjs` passes; safety-invariant suites pass unchanged. `npm run build`, `npm run test:local`, `npm run test:journeys`, API + visual proof pass.

## Phase 49: Real Dynamic Graph And Native Human-In-The-Loop

Phase 49 is acceptable when:

- A journey needing observation pauses via LangGraph `interrupt()`, persists in the durable checkpointer, and resumes via `Command(resume=token)` in a separate request — proven across a simulated process restart.
- Approval remains single-use, time-boxed, and bound; expired/mismatched tokens produce zero side effects (existing `approval-resume` invariants extended, never weakened).
- `maybe_model` node and edge are removed (`compose_response → END`); `describeBrainstyLangGraphTopology()` and `graph-topology.test.mjs` updated to match; no test depends on the removed node.
- `engine.mjs` is deleted with no remaining importers; its removal is recorded in `docs/DECISIONS.md`.
- Durable checkpoints contain no raw portal text and are encrypted at rest (coordinated with Phase 50).
- New `graph-interrupt-resume.test.mjs` passes; `npm run build`, `npm run test:local`, `npm run test:graph:topology`, `npm run test:execution:v2`, API + visual proof pass.

## Test-to-invariant traceability (quick map)

| Concern | Guarded by | Phase that touches it |
|---|---|---|
| PHI masking before egress | `phi`, `model-payload-policy`, `egress` | none (must stay green) |
| Safety refusals / urgent handoff | `policy`, `langgraph-runner` | 48 (extended, not weakened) |
| Prompt-contract safety | `prompt-contracts` | none (must stay green) |
| Approval token binding / fail-closed | `approval-resume`, `execution-v2-write-approval` | 49 (extended) |
| Worker read-only envelope | `openclaw-worker-contract`, `openclaw-skill-registry` | none (51 later) |
| Graph shape | `graph-topology`, `langgraph-runner` | 47, 49 (updated) |
| LLM decision adoption | `llm-orchestration-decision` | 47 (updated) |
| LLM-primary vs fallback | `intelligence-default` (new), `intelligence-contracts` | 47 |
| Graceful degradation | `graceful-degradation` (new) | 48 |
| Interrupt/resume durability | `graph-interrupt-resume` (new) | 49 |
| Model tiering | `model-tier-policy` (new) | 47 |
