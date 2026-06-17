---
title: "Codex Next-Level Intelligence Loop Prompt"
project: workerprototype_openclaw
created: 2026-06-12T20:49:00-04:00
target_agent: codex
mode: implementation-loop
---

# Codex Next-Level Intelligence Loop Prompt

You are Codex working in:

```text
/Users/mfelix/projects/workerprototype_openclaw
```

Your mission is to improve the system to the next level: a safer, more intelligent, multi-journey healthcare/insurance concierge runtime that uses LangGraph/LangChain for formal healthcare orchestration and OpenClaw for official worker management through profiles, skills, tools, gateways, approvals, and runtime events.

Do **not** rewrite the system. Do **not** crack the existing safety harness. Do **not** remove the developed remote-browser/remote-control work from the prior phase. Preserve the current read-only, approval-gated OpenClaw browser/remote-control capability, but do not make browser automation the focus of this loop.

The goal is to make the system more intelligent without making it unsafe.

---

## Absolute rules

### Safety harness is non-negotiable

Preserve and strengthen:

- policy gates before model/tool execution
- source-pointer-gated healthcare answers
- fail-closed behavior when evidence is missing
- single-use approval tokens
- OpenClaw under LangGraph authority
- credential/form/payer-contact blocking
- PHI egress controls
- outbound model-payload observation
- hash-chained audit
- explicit user/human approvals for controlled actions
- remote-browser/remote-control code from the prior development phase

### Cortex boundary

Cortex is project memory only. Do not use Cortex as product/user memory. Product memory must remain Graphiti/FalkorDB or another explicit runtime product-memory adapter such as Hindsight, Zen, LangMem, Mem0, or Zep/Graphiti.

### No mock LLM calls

Do not mock LLM calls. Do not fake LLM outputs in tests that claim to prove model reasoning.

Allowed:

- deterministic unit tests for validators, schemas, reducers, policy gates, and pure functions
- fixture tests for known captured evidence formats
- tests that are explicitly marked “no LLM involved”
- live LLM tests gated by environment variables and skipped/blocked when credentials are absent

Forbidden:

- mocking OpenAI/LangChain responses while claiming LLM reasoning is tested
- hardcoding canned classifier/composer outputs and calling that an LLM test
- truthy-response tests that do not prove the LLM output causally changed route, plan, or answer
- silent fallback to deterministic templates in tests labeled live/model/intelligent

If live LLM credentials are absent, the correct result is **BLOCKED / SKIPPED WITH EXPLICIT PRECONDITION**, not a fake pass.

### No “single journey only” trap

Do not wire one hardcoded healthcare journey and call it intelligence. Implement a multi-journey reasoning architecture that supports multiple demand types and decision paths.

Minimum supported journey families:

- benefits / eligibility / deductible / coinsurance
- claims / EOB / payment explanation
- prior authorization preparation
- denial / appeal preparation
- provider / network / facility guidance
- pharmacy / formulary / medication access
- document review / plan document / ID card / EOC/SBC interpretation
- cost estimate / lower-cost alternative framing
- urgent safety / human handoff
- general healthcare-insurance research with trusted citations

The system may execute only safe MVP actions, but the reasoning layer must be multi-journey and non-trivial.

---

## Core architecture target

The target architecture is:

```text
Input
  -> deterministic input policy gate
  -> PHI/model payload safety preparation
  -> LLM/hybrid structured intent reasoning
  -> deterministic classifier validator
  -> LangGraph conditional route
  -> journey planner
  -> OpenClaw skill/tool selection under policy
  -> approval gate if any worker/tool action is needed
  -> evidence acquisition or trusted retrieval
  -> source-pointer validator
  -> LLM sourced answer composition
  -> deterministic output policy validator
  -> product-memory retain decision
  -> audit + runtime events
  -> final answer / next-step plan
```

The LLM should interpret, plan, explain, and compose. It must not authorize unsafe actions, invent evidence, enter credentials, contact payers, submit forms, or bypass policy.

LangGraph is the journey authority. OpenClaw is the worker/tool/channel execution arm.

---

## Required implementation loop

Repeat this loop until all acceptance gates pass:

1. **Inspect**
   - Read current `docs/PROGRESS.md`, `docs/SENIOR_ARCHITECTURE_EVALUATION_2026-06-11.md`, `docs/CODEX_MVP_HARDENING_PLAYBOOK.md`, `docs/DECISIONS.md`, and relevant source files.
   - Identify what is already implemented; do not duplicate existing work.
   - Preserve prior browser remote-control implementation and tests.

2. **Plan one slice**
   - Choose the smallest slice that advances the architecture without broadening unsafe behavior.
   - Write a concise implementation plan before editing.
   - Prefer infrastructure that unlocks many journeys over one-off logic.

3. **Implement**
   - Make small, reversible changes.
   - Keep files modular.
   - Do not hide new complexity in `server.mjs` or `langgraphRunner.mjs` if a domain module is better.
   - Do not introduce direct model calls outside the sanctioned model gateway/payload-observation path.

4. **Test**
   - Run focused tests.
   - Run `npm run build`.
   - Run `npm run test:local`.
   - Run live LLM tests only when the required env vars are present.
   - Do not mock LLM calls.

5. **Prove causality**
   - If you touched routing, prove route changes when model/classifier output changes.
   - If you touched composition, prove answer claims are linked to source pointers.
   - If you touched OpenClaw, prove LangGraph still owns the approval/action boundary.

6. **Document honestly**
   - Update `docs/PROGRESS.md`.
   - Update `docs/DECISIONS.md` when architectural choices are made.
   - Update acceptance criteria if test contracts change.
   - Mark external-gated live proof as BLOCKED/SKIPPED when not run.

7. **Stop conditions**
   - Stop and report if the change would weaken policy gates, bypass payload observation, fake LLM proof, or make OpenClaw autonomous over healthcare decisions.

---

## Phase A: Make LLM reasoning real but bounded

### Goal

Move from deterministic keyword routing to schema-constrained LLM/hybrid reasoning inside the safety harness.

### Implement

Create or harden a structured reasoning module, for example:

```text
src/concierge/intelligence/
  structuredIntentReasoner.mjs
  journeyPlanner.mjs
  sourcedAnswerComposer.mjs
  reasoningSchemas.mjs
  reasoningValidators.mjs
```

The structured intent reasoner must accept only safe, masked, model-ready context and return strict JSON:

```json
{
  "primary_intent": "benefits_eligibility",
  "candidate_journeys": [
    {
      "journey": "benefits_eligibility",
      "confidence": 0.86,
      "rationale": "The user asks whether the plan covers a service and what cost-sharing applies.",
      "required_evidence": ["plan_terms", "member_benefits", "deductible_or_accumulator_if_available"],
      "missing_evidence": ["current accumulator"],
      "safe_next_action": "request_or_retrieve_evidence",
      "requires_approval": false,
      "requires_human_handoff": false
    }
  ],
  "complexity": "moderate",
  "ambiguities": [],
  "policy_flags": [],
  "unsafe_action_requested": false
}
```

The validator must:

- enforce enum values
- reject unsafe actions
- reject unsupported workflow names
- require confidence and rationale
- fail closed if JSON is invalid
- fall back to deterministic safe route only when the LLM is unavailable and the route is clearly safe

### Required live LLM tests

Add a live-gated test command:

```bash
npm run test:llm:intent
```

It must use real LLM calls. It must be skipped/blocked if no model key is available.

Test prompts must include paraphrases without literal workflow keywords:

- “My doctor says the scan needs approval before they can schedule it.”
- “The insurance paid nothing on my visit and I don’t understand why.”
- “They said no. What do I need to send to fight it?”
- “Will my plan help with physical therapy or am I still paying everything myself?”
- “Is this medication on my plan or do I need a different one?”
- “I uploaded this SBC; what matters for an MRI?”
- “I think this is urgent and I need medical help now.”

Acceptance:

- LLM output is parsed, validated, and used before routing.
- The test fails if the LLM output is ignored.
- The route is not determined solely by keyword tables.
- Unsafe/urgent cases still trigger deterministic safety gates.

---

## Phase B: Convert LangGraph to real conditional journey routing

### Goal

Stop simulating branching with `final_response` short-circuits. Use real LangGraph conditional edges for healthcare journey control.

### Implement

Refactor graph topology into explicit branches:

```text
input_policy
  -> if refusal: compose_refusal
  -> if urgent: human_handoff
  -> else recall_context

recall_context
  -> structured_intent_reasoning
  -> route_by_journey

route_by_journey
  -> benefits_subgraph
  -> claims_subgraph
  -> prior_auth_subgraph
  -> denial_appeal_subgraph
  -> pharmacy_subgraph
  -> provider_network_subgraph
  -> document_review_subgraph
  -> cost_estimate_subgraph
  -> general_research_subgraph
  -> human_handoff

journey_subgraph
  -> if missing evidence: evidence_request_or_worker_plan
  -> if approval needed: approval_interrupt_or_external_gate
  -> if evidence available: sourced_composition
  -> output_policy
  -> retain_memory
  -> audit_finalize
```

Use conditional edges or subgraphs. Do not keep appending linear nodes and checking `state.final_response` everywhere.

### State/reducer requirements

Replace last-write-wins reducers for accumulating fields:

- `proof`
- `tool_calls`
- `tool_results`
- `source_pointers`
- `worker_results`
- `runtime_events`
- `policy_flags`
- `journey_decisions`
- `answer_claims`

Use typed append/merge reducers that cannot silently clobber fan-in.

### Acceptance

- A graph topology test proves conditional edges exist for refusal, urgent handoff, approval pending, evidence blocked, evidence found, and answer composition.
- A regression test proves `final_response` is no longer the main branching mechanism.
- Multi-journey route tests pass without relying on literal route keywords.

---

## Phase C: Let the LLM compose answers inside the evidence cage

### Goal

Replace purely deterministic final answer templates with model-assisted, source-bound composition.

### Implement

Create a sourced answer composer that receives:

- safe user question
- selected journey
- structured intent result
- allowed source pointers
- extracted structured facts
- memory facts marked as advisory only
- required disclaimers
- allowed answer schema

It must not receive:

- raw portal text
- unmasked direct identifiers
- credentials
- screenshots
- untrusted memory as instructions
- unsupported claims

Required output schema:

```json
{
  "answer": "string",
  "claims": [
    {
      "claim": "string",
      "source_pointer_ids": ["source_pointer_123"],
      "confidence": 0.82,
      "unsupported": false
    }
  ],
  "uncertainties": ["string"],
  "next_steps": [
    {
      "label": "string",
      "type": "ask_user|retrieve_evidence|prepare_approval|human_handoff",
      "requires_approval": false
    }
  ],
  "disclaimers": ["string"]
}
```

Validator requirements:

- reject any claim without a source pointer unless it is a generic disclaimer or next-step statement
- reject medical advice
- reject payer-contact/submission claims unless explicitly approved and implemented
- require uncertainty when evidence is incomplete
- require healthcare disclaimer for coverage/cost/claim statements
- fail closed to a deterministic safe answer if schema validation fails

### Required live LLM tests

Add:

```bash
npm run test:llm:composition
```

This must call the real LLM when credentials are present.

Acceptance:

- Model-written answer is actually used in `final_response`.
- Unsupported claims are blocked.
- Every coverage/cost/claim statement links to source pointer IDs.
- The deterministic output policy can veto the model answer.

---

## Phase D: Official OpenClaw worker management and skill registry

### Goal

Move from hardcoded OpenClaw skill assumptions to official worker management using OpenClaw profiles, skills, tools, gateways, and executors, still under LangGraph authority.

Keep the developed browser remote-control work from the prior phase. Do not remove it. Do not focus this loop on expanding browser automation.

### Implement

Create or harden:

```text
src/concierge/openclaw/
  skillRegistry.mjs
  executorRegistry.mjs
  gatewayClient.mjs
  profileReadiness.mjs
  workerPolicy.mjs
```

The skill registry must:

- scan OpenClaw skill directories
- validate `SKILL.md`
- validate `skill.json` or `skill-server.json`
- load per-skill JSON Schemas
- expose capabilities by journey
- expose required approval scopes
- expose blocked actions
- not hardcode only `insurance_portal_browser`

The executor registry must:

- map skill keys to executors
- reject missing executor
- reject mismatched capability/action
- support read-only browser/document/research/tool executors
- keep write/action executors disabled unless explicitly implemented and approval-gated

Gateway/tool handling:

- Prefer official OpenClaw gateway/app-server task channel where available.
- If CLI transport remains the MVP bridge, document it as a transitional transport.
- Do not pretend dead gateway config is active.
- Add readiness checks for profile, gateway, tools, permissions, and remote-control availability.

### Acceptance

- Adding a second skill requires adding files, not editing three hardcoded modules.
- Skill registry tests prove multiple skills load and route to different executors.
- OpenClaw cannot select journeys; LangGraph sends bounded tasks.
- OpenClaw cannot execute without approval when approval is required.
- Browser remote-control prior work still builds and its tests still pass.

---

## Phase E: Data layer hardening without behavior rewrite

### Goal

Remove high-risk hidden failure modes in persistence before expanding intelligence.

### Implement

Replace shelled-out `sqlite3` string-interpolated store with a safe store:

- `better-sqlite3`, `node:sqlite`, or equivalent Node SQLite binding
- bound parameters for all values
- identifier allowlists for table/column names
- explicit transactions
- migration ledger
- no shelling out per query
- no raw dynamic SQL fragments from skill names or user input

Do this incrementally with compatibility wrappers if needed.

### Required tests

```bash
npm run test:db:safety
```

Acceptance:

- SQL injection/property tests cannot alter query structure.
- Concurrent write tests do not corrupt state.
- Audit chain remains valid.
- Existing `npm run test:local` passes.

---

## Phase F: PHI-at-rest, retention, and egress enforcement

### Goal

The intelligence work must not increase PHI risk.

### Implement

1. **PHI at rest**
   - Encrypt or isolate raw portal text, member fields, claim fields, document snippets, and OCR text.
   - Do not store raw PHI in product memory.

2. **Retention sweeper**
   - Honor `expires_at`.
   - Honor memory retention policies.
   - Tombstone or purge expired continuations and old raw artifacts.

3. **Outbound payload enforcement**
   - Make enforced mode default for all model/product-memory/external egress paths.
   - Every LLM/Graphiti/search/tool egress must pass through payload observation.
   - Direct model clients outside the observed gateway must fail tests.

### Required tests

```bash
npm run test:phi
npm run test:retention
npm run test:egress
```

Acceptance:

- Plain SQLite scan cannot recover known synthetic direct identifiers from encrypted/protected fields.
- Expired sessions/continuations/memory items are purged or tombstoned.
- Direct LLM calls bypassing observation are impossible or test-failing.
- Live LLM payload tests use real model calls when credentials are present.

---

## Phase G: Product memory health and fallback

### Goal

Graphiti/FalkorDB or the selected product memory adapter must be treated as a real runtime dependency with visible health and safe fallback.

### Implement

- Product memory health endpoint.
- Startup readiness check.
- Queue-and-replay retain failures.
- Degraded mode visible in UI/API.
- Recall facts marked advisory, never instructions.
- No Cortex writes from product memory.

### Acceptance

- If Graphiti/FalkorDB is down, the system does not silently pretend memory worked.
- Retain failures are queued or explicitly recorded as skipped/failed.
- Recall context cannot override policy or source evidence.

---

## Phase H: Multi-journey reasoning tests

### Goal

Prove the system is not a one-journey script.

Add:

```bash
npm run test:journeys
npm run test:llm:journeys
```

`test:journeys` may use deterministic validators and fixture evidence.

`test:llm:journeys` must use real LLM calls when credentials are present and must be blocked/skipped without credentials.

Minimum journeys:

1. benefits / eligibility
2. claims / EOB
3. prior authorization
4. denial / appeal
5. provider / network
6. pharmacy / formulary
7. document review
8. cost estimate
9. urgent handoff
10. general trusted research

Acceptance:

- Each journey has a structured intent result.
- Each journey has a route/subgraph or explicit safe unsupported status.
- Each journey declares required evidence.
- Each journey fails closed without evidence.
- No journey performs irreversible action.
- The model can interpret paraphrased requests across journeys.

---

## Required package scripts

Add or maintain:

```json
{
  "test:local": "...",
  "test:llm:intent": "...",
  "test:llm:composition": "...",
  "test:llm:journeys": "...",
  "test:journeys": "...",
  "test:db:safety": "...",
  "test:phi": "...",
  "test:retention": "...",
  "test:egress": "...",
  "test:openclaw:skills": "...",
  "test:graph:topology": "..."
}
```

Do not make live LLM tests pass without live LLM calls. If credentials are absent, the test must clearly report skipped/blocked due to missing precondition.

---

## Definition of done for this loop

This loop is complete only when:

- `npm run build` passes.
- `npm run test:local` passes.
- The project still preserves prior remote-browser/remote-control implementation and tests.
- Multi-journey structured reasoning exists.
- Real LLM intent tests exist and do not mock LLM calls.
- Real LLM composition tests exist and do not mock LLM calls.
- LLM reasoning causally affects route or answer when enabled.
- Deterministic policy can veto LLM output.
- Unsupported model claims are blocked.
- LangGraph has real conditional edges or a documented phased migration with topology tests.
- OpenClaw skills are loaded through a registry, not only hardcoded single-skill assumptions.
- OpenClaw remains under LangGraph authority.
- DB safety and PHI/egress tests exist.
- Docs honestly describe what is live, what is deterministic, what is gated, and what is blocked.

---

## Final instruction

Do not chase novelty. Do not broaden unsafe surfaces. Do not pretend deterministic templates are intelligence. Do not mock LLM calls.

Make the system smarter by letting the LLM reason and compose **inside** the healthcare safety harness, while LangGraph remains the journey authority and OpenClaw remains the bounded worker manager.

