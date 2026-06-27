# Type-II Capability Reasoning — Verified Failure + Phased Plan

Source: live reproduction on the running system + multiagent design verification (2026-06-27).

## Root cause (one sentence)
The planner already RECEIVES the capability portfolio and already PRODUCES the right strategy fields, but the response composer throws every planner field away and emits deterministic templates keyed only on `evidence_observation.status` — so a capability/meta question with no source pointer falls through to a hardcoded "LangGraph routed this request to X … not executed in this slice" string and reads as a flat refusal.

## Live evidence (the exact failed turn, "so you can access my insurance website?")
- Planner DID reason: selected `skill:insurance_portal_browser` (hydrated from Redis) and wrote `responseStrategy` = "explain that only read-only, human-approved portal observation is possible … the user will be asked to manually approve read-only observation."
- Planner did NOT ask for plan details (`userFacingNextQuestion: ""`).
- Final answer = deterministic template, ignored the planner entirely.

## Verified failure points (file:line)
- `langgraphRunner.mjs:2910-3124` `composeResponseNode` — never reads any `state.llm_orchestration_decision` field.
- `langgraphRunner.mjs:3107-3116` — the literal flat-refusal template array returned for this question.
- `langgraphRunner.mjs:3055-3064` — `composeResponse(...)` call omits all planner fields.
- `outputPolicy.mjs:111-141` — `composeResponse` never references the planner decision.
- `llmOrchestrationDecision.mjs:229-230,318-319` — `responseStrategy`/`userFacingNextQuestion` exist + are normalized, then never consumed; no data-sufficiency / clarification-required / offered-capability field.
- Safety anchors to preserve: `llmOrchestrationDecision.mjs:209-217` `openclawCapabilityPolicy` (no credential entry / form submit / payer contact); live composer is source-pointer-gated.

## Phase A — Make the answer honest (smallest visible fix; no schema/Redis change)
- New `src/concierge/intelligence/plannerResponseComposer.mjs` `composePlannerResponseWithOpenAI({state,store,sessionId,user})`: real ChatOpenAI, NO source-pointer requirement, prompt built from the already-normalized planner fields + `hydrated_capabilities.resolved`. It (a) states honestly it cannot log in for you and has no stored evidence yet; (b) OFFERS the read-only path ("you sign in yourself in the secure OpenClaw browser, approve a read-only observation, and I read + cite what's on screen"); (c) asks the one missing detail (which payer / member id). Hard prompt rule: no dollar figures / coverage claims (offer-only).
- Wire it in `composeResponseNode` BEFORE the template fallthrough (and in `blocked_no_authenticated_evidence` + blocked-research branches). Keep the existing templates strictly as the failure/fallback path. Set `workflow_outcome:"capability_reasoned_offer"`.
- Safety AFTER composition: reuse redaction/claim guard + a guard that rejects any `$`/coverage number lacking a matching source pointer → fall back to template.
- Invariant: Type-II composer fires only when `source_pointers.length === 0`; evidence-backed turns keep the existing path.
- Test: `phaseA-portal-offer-live.test.mjs` (real LLM, key-gated) — for the exact prompt, assert the refusal string is gone, the offer + manual-login + read-only approval appear, `workflow_outcome==="capability_reasoned_offer"`, and no coverage numbers.

## Phase B — Planner output contract (make honesty first-class; additive)
Add to `expectedJsonShape` + `normalizeLlmOrchestrationDecision` (fail-closed defaults): `capabilityAssessment{canAnswerNow:false,reason,limitations}`, `userDataSufficiency: sufficient|insufficient|none`, `missingPlanDetails[]`, `clarificationNeeded:bool`, `userFacingNextQuestion` (REQUIRED non-empty when clarificationNeeded), `responseStrategy` enum (`answer_from_evidence|offer_process_and_ask|honest_capability_decline|degraded_best_effort`), `offeredProcessIds[]`, `offeredProcessPointers[]`, `recommendedProcessId`, `answerComposerMode`. Prompt: "when you can't answer now, set offer_process_and_ask, populate offeredProcessIds from the portfolio process:* rows, put the single most important missing detail in userFacingNextQuestion; never claim a capability whose process/skill isn't in the portfolio." Composer branches on the contract. Test: `phaseB-planner-contract-live.test.mjs` — fields emitted AND consumed end-to-end.

## Phase C — Redis portfolio → process → agentic-workflow-graph (the durable mechanism)
A **process** is a new capability `kind`: an offerable ordered path binding question-type → required user inputs → approval scope → worker-skill POINTER → existing graph-subpath POINTERS → AI2UI actions → deterministic formulas.
- Keys: `brainsty:process-catalog:v1` (global, versioned, ttl ~1d) copied per-session into the existing `brainsty:capability-portfolio:<sessionId>` so current hydration works unchanged; optional `brainsty:process-offer:<sessionId>` for "yes, do it" resume.
- Process entry mirrors the proven entry pattern (`capabilityPortfolio.mjs:38-49`): `portfolioId:"process:portal_read_only_lookup"`, `kind:"process"`, score>workflows so it survives the 18-row cap (pin it), `hydrate:{answersQuestionTypes, requiredUserInputs[{key,label,why,sensitive,collectViaAi2uiActionId}], approvalScope:"read_only_observation", workerSkillRef:<pointer>, graphSubpathRefs:[<pointers>], orderedSteps[{id,label,capabilityRefs,ai2uiActionIds,expectedSourcePointer}], ai2uiActions[], formulas[{id,expression,inputs,unit}], safetyInvariants, pre/postconditions}`.
- `processEntries()` added to `buildCapabilityPortfolio`; `hydrateCapabilityPointers` extended with ONE bounded recursive pass resolving `workerSkillRef`/`graphSubpathRefs`/steps from the already-loaded map (no extra round-trips, no cycles).
- Planner selects `process:*` → composer hydrates `offeredProcessPointers` and narrates the offer from the hydrated definition (never hardcodes plan facts).
- Deterministic `validateCapabilityAnswer` (in outputPolicy) AFTER the LLM: offered process must exist in hydrated set; approvalScope/steps match byte-for-byte vs the hydrated def + `openclawCapabilityPolicy` (no scope inflation, no credential step); numeric coverage figure requires a source pointer; failure → deterministic decline.
- Formulas evaluated deterministically (whitelisted operators + declared inputs only; never eval free text), only on source-pointer-backed structured fields.
- Put `offeredProcesses` on the wire (`workflow.capability_offer` lifecycle event) → userapp renders affordances (`open_secure_browser`, `login_takeover_handoff`, `confirm_read_only_observation`, `show_source_pointer`); accepting dispatches the bound graph subpath at the bound approval scope (existing HITL flow).
- Tests: `phaseC-process-graph-live.test.mjs` + 3 golden turns: T1 pure meta → offers portfolio processes, zero `$`; T2 "what's my deductible?" no evidence → asks the one detail AND offers the read-only process; T3 same question AFTER a captured read-only observation → falls through to the existing evidence/sourced path (proves Type-II owns only the no-evidence case).

## Risks / safety
Deterministic templates remain as the catch/invalid branch (fail-soft). Coverage-fact fabrication blocked by post-composition redaction + source-pointer-required-for-numbers guard + deterministic formula eval. Capability hallucination blocked by `validateCapabilityAnswer` byte-for-byte vs hydrated def + `openclawCapabilityPolicy`. Honesty drift caught by fail-closed normalize defaults + warnings. Process rows protected from prompt-table truncation by pinning + score. Type-II/Type-I boundary held by `source_pointers.length===0` gate (T3).

## Sequencing
Ship Phase A behind the existing `useLiveModel` flag and verify before B. B is additive schema+prompt. C is the durable generalization. The visible bug is fully fixed by Phase A alone.
