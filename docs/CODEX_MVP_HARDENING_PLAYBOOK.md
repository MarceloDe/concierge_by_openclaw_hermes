---
title: "workerprototype_openclaw MVP Hardening Playbook for Codex"
created: 2026-05-27T12:41:00Z
author: perplexity-computer
project: workerprototype_openclaw
purpose: "Force the next Codex implementation cycle toward a smaller, complete, non-mocked MVP slice."
---

# workerprototype_openclaw MVP Hardening Playbook

This playbook is the controlling direction for the next Codex implementation cycle. It is based on direct source inspection of `/Users/mfelix/projects/workerprototype_openclaw`, direct build/test execution, and three independent review passes. It replaces any “expand the system” instinct with a narrow requirement: make one real healthcare journey work end to end, visibly, safely, and without hidden mocks or pre-seeded state.

## Non-negotiable correction

Cortex is project memory only. Cortex must help agents remember project decisions, handoffs, and directives. Cortex is not product memory for the healthcare concierge. The MVP product memory layer must be a ready-to-start runtime memory framework such as Hindsight, Zen, LangMem, Mem0, Zep/Graphiti, or an explicit adapter with equivalent retain/recall semantics.

LangGraph must be the healthcare workflow master. OpenClaw must be the adaptive worker/tool/channel arm. OpenClaw must not choose healthcare workflows, bypass approval gates, retain product memory, enter credentials, submit forms, contact payers, or perform irreversible actions.

## Current professional assessment

The project is now directionally better than the previous MVP attempts because it contains real LangGraph wiring, an OpenClaw skill artifact, explicit proposal-only contracts, local audit/session state, policy gates, and many deterministic tests. However, it is not MVP-ready. The code can appear orchestrated while still validating contracts and templates rather than completing a real non-mocked healthcare journey.

### Probability assessment

- **Customer-facing MVP today:** 20-30%.
- **If Codex continues unchanged:** 35-40%.
- **If Codex pauses breadth and fixes the hard runtime/test gaps first:** 60-70%.

The fastest path to success is not more workflows, more personas, more UI panels, or more documentation. The fastest path is one small, complete, visible, non-mocked slice that proves the architecture.

## What must stop now

Codex must stop adding:

- New workflows beyond the first MVP slice.
- New personas or multi-agent abstractions.
- New UI panels that do not prove runtime behavior.
- More “parallel-ready” or “future-ready” metadata without execution.
- More tests that assert exact canned strings.
- More claims of OpenClaw integration while no approved execution/resume path exists.
- More claims of product memory while Hindsight/Zen/etc. is not connected.

## Target MVP slice

Build exactly this slice first:

**Read-only authenticated insurance benefits evidence capture plus one sourced answer plus safe product-memory retain.**

### Scope

- One user.
- One channel: local web UI.
- One journey: eligibility/benefits question.
- One portal evidence path: already-authenticated Chrome/CDP or a dedicated project OpenClaw profile.
- One product memory adapter: Hindsight/Zen/LangMem-style retain/recall, not Cortex.
- One final answer that cites stored source pointers.
- One approval/resume loop that can authorize only read-only observation.

### Explicit non-scope

- No payer contact.
- No form submission.
- No credential entry.
- No SSN/passkey/2FA handling.
- No appointment booking.
- No prior-auth submission.
- No denial appeal submission.
- No medical advice.
- No autonomous modification of portal records.
- No sending emails/messages externally.

## Critical observations Codex must address

### Two runtimes are silently diverging

`/api/chat` uses a hand-coded `engine.mjs` pipeline and touches real Chrome/CDP browser observation. `/api/langgraph/run` and orchestrator endpoints use `langgraphRunner.mjs`, but mostly create proposal JSON and do not execute browser observation. This undermines the claim that LangGraph is the workflow master.

### Routing is not yet healthcare orchestration

The current router is mostly keyword/regex scoring. It can pass tests when the test message contains literal route keywords, but it is not yet robust enough for natural customer phrasing.

### LLM calls do not yet control the result

The model call occurs after deterministic response composition in the LangGraph path and does not causally determine route, action, or final response. A live LLM test can pass while the system remains scripted.

### OpenClaw is contract-only

The proposal-only boundary is good, but there is no real approval-resume-dispatch-result-ingest path. Proposal-only is currently a wall, not a gate.

### Real-data tests are not reproducible

`npm run test:local` failed on a clean sanitized snapshot because real Aetna and memory-harness tests depend on prior local database state. This is useful because it reveals the current visibility gap: the system does not yet have a clean non-mocked proof harness.

### Product memory is deferred

The local SQLite memory harness is an adapter seam, not the final product memory framework. The MVP must connect a real memory runtime or explicitly mark memory as non-shipping.

### PHI screening is incomplete

Current masking is regex-oriented and focuses on some direct identifiers. Real PHI can appear in memory items, portal text, tool outputs, DOB, phone, address, free-text clinical content, and screenshots. Every model-bound and memory-bound payload needs capture-and-assert tests.

## Required implementation sequence

Codex must implement in this order. Do not skip forward.

### Phase 1: Collapse to one runtime

Goal: Every product path goes through LangGraph.

Tasks:

1. Route `/api/chat` through the same LangGraph path as `/api/langgraph/run`, or explicitly deprecate one endpoint.
2. Move real browser/evidence observation into a LangGraph node.
3. Ensure final answer, memory retain, audit, and source-pointer storage happen in the same graph path.
4. Add a route-level test that sends the same request through all public chat endpoints and asserts identical graph trace IDs, workflow, approval state, and source-pointer behavior.

Acceptance:

- There is one product runtime.
- A browser-capable path and the formal LangGraph path are no longer separate.
- No endpoint can bypass the healthcare journey graph.

### Phase 2: Make routing real

Goal: Healthcare journey routing must work without literal keywords.

Tasks:

1. Add a structured intent classifier before workflow routing.
2. Use LLM classification, curated classifier, or hybrid deterministic+LLM classification.
3. Return strict JSON: intent, workflow, confidence, required evidence, missing evidence, refusal/escalation flag, rationale.
4. Route from this structured output, not from keyword presence alone.
5. Keep deterministic safety refusals before the classifier.

Hard test cases:

- “My doctor wants approval for an MRI next month” -> prior authorization.
- “Why didn’t insurance pay my last visit?” -> claim status.
- “They said no and I want to fight it” -> denial appeal.
- “Do I still owe anything before insurance starts paying?” -> eligibility/benefits.
- “Can you log in and type my password?” -> refusal.

Acceptance:

- The LLM/classifier output causally affects workflow.
- Tests fail if model/classifier output is ignored.
- Tests include paraphrases that do not contain route keywords.

### Phase 3: Build approval-resume, not just proposal-only

Goal: Proposal-only becomes a real gate with safe resumption.

Tasks:

1. Add an approval endpoint such as `POST /api/orchestrator/approve`.
2. Approval must bind to task ID, session ID, user ID, workflow, scope, expiration, and allowed action.
3. The next graph run must consume the approval token and continue from the pending state.
4. Only read-only observation may be approved in this MVP.
5. Denied/expired approvals must keep `actionsTaken=[]`.

Acceptance:

- Without approval, no worker/browser execution happens.
- With valid approval, exactly the approved read-only observation happens.
- Approval and execution are visible in audit.

### Phase 4: Prove real evidence capture

Goal: The system must capture real authenticated evidence or fail loudly.

Tasks:

1. Add `npm run test:live:portal`.
2. Require explicit env flag, e.g. `BRAINSTY_PORTAL_LIVE=1`.
3. Require user-authenticated browser state or project OpenClaw profile.
4. Verify page is an authenticated member portal, not public Aetna marketing content.
5. Store source pointer: URL, title, page kind, timestamp, DOM hash, extraction hash, and evidence fields.
6. If authentication/page kind cannot be verified, store only a blocked run/audit event, not an eligibility snapshot.

Acceptance:

- Live test passes only from a real authenticated read-only page.
- Failure does not create false healthcare evidence.
- Final answer only uses stored source pointers.

### Phase 5: Add product memory adapter

Goal: Product memory must be real and separate from Cortex.

Tasks:

1. Choose Hindsight, Zen, LangMem, Mem0, Zep/Graphiti, or a comparable adapter.
2. Implement retain/recall behind the current runtime adapter seam.
3. Store safe summaries and source pointers, not raw PHI.
4. Add deletion/suppression semantics for MVP.
5. Add recall test across two sessions.

Acceptance:

- Session A captures a safe benefits summary plus source pointer.
- Session B recalls it.
- Raw portal text and direct identifiers are not stored.
- Cortex is not called as product memory.

### Phase 6: Harden PHI, audit, and state

Goal: Prevent silent healthcare safety failures.

Tasks:

1. Capture the exact serialized LLM request body before send.
2. Assert no direct identifiers or raw portal PHI appear in model payloads.
3. Screen memory and tool outputs, not just user input.
4. Replace shell-out SQLite operations with transactional `better-sqlite3` or Postgres.
5. Add idempotent enrollment using natural keys.
6. Add append-only/hash-chained audit verification.
7. Add concurrent same-session test.

Acceptance:

- No PHI leak test passes by inspecting actual serialized payloads.
- Concurrent session updates do not corrupt `state_version`.
- Audit tampering can be detected.

## Required test commands

Codex must create and maintain these commands:

```bash
npm run build
npm run test:fast
npm run test:local
npm run test:full
npm run test:live:portal
npm run test:orchestrator:live
npm run test:phi
npm run test:approval
npm run test:memory
```

### Command semantics

- `test:fast`: deterministic unit/contract tests only; no hidden DB state.
- `test:local`: clean checkout local tests; must pass without seeded portal data.
- `test:full`: includes local, memory, approval, and no-false-evidence tests.
- `test:live:portal`: opt-in live browser/portal evidence proof; must fail if environment is not explicitly ready.
- `test:orchestrator:live`: live LLM/classifier proof where model output must affect routing.
- `test:phi`: serialized payload PHI assertions.
- `test:approval`: proposal -> approve -> resume -> read-only execute -> ingest result.
- `test:memory`: product-memory retain/recall with Hindsight/Zen/etc.

## Hard tests that must fail today and then pass

### Single-runtime parity test

Same request through `/api/chat`, `/api/langgraph/run`, and any orchestrator chat endpoint must produce the same workflow, graph trace, approval state, and source-pointer behavior. If one endpoint can access browser state and another cannot, the product runtime is not unified.

### Routing-without-keyword test

Use realistic customer language without literal workflow keywords. Route must still be correct.

### LLM-causal test

If the structured classifier output is modified in a controlled test, route must change accordingly. If route does not change, the LLM/classifier is decorative.

### Approval-resume test

Create proposal, approve it, resume graph, execute only approved read-only observation, ingest result. Without approval token, no execution.

### No-false-evidence test

When Chrome/CDP is unavailable, when the page is public, or when authenticated member evidence is absent, the system must not create eligibility/claim/prior-auth evidence rows.

### Live portal source-pointer test

Every factual benefit/claim/prior-auth statement in the user answer must map to a stored source pointer and audit event.

### Product memory retain/recall test

Use Hindsight/Zen/etc. Session A retains safe summary plus source pointer. Session B recalls it. Raw PHI must be absent.

### PHI payload serialization test

Before any model call, capture the actual outgoing JSON body. Assert absence of name, DOB, phone, email, address, SSN, member ID, subscriber ID, raw page text identifiers, and credential-like strings.

### Enrollment idempotency test

Call enrollment five times for the same user. There must be one user row, one current portal account per payer/account, and one active consent row per scope unless explicitly renewed.

### Concurrency/state-version test

Run two concurrent requests against the same session. State version must be monotonic; no orphan checkpoints; no lost update.

### Audit tamper test

Modify one audit row externally. Verification must detect tampering.

## Visible demo harness requirement

Codex must create a demo command that Marcelo can run and watch:

```bash
npm run demo:mvp:visible
```

Minimum behavior:

1. Starts the local server.
2. Opens the local UI.
3. Shows the selected user/session.
4. Asks one benefits question.
5. Shows policy decision.
6. Shows route decision.
7. Shows approval gate.
8. Shows browser/evidence capture status.
9. Shows source pointers.
10. Shows final answer.
11. Shows memory retain decision.
12. Shows audit trace.

Pass condition:

- The demo either completes with real source-backed evidence or fails loudly with a clear missing precondition.
- It must never silently fall back to canned answer, seeded DB snapshot, or “pending evidence” presented as fact.

## Codex prompt for today

Use this exact instruction for the next Codex run:

```text
You are Codex working in /Users/mfelix/projects/workerprototype_openclaw.

Mission: stop expanding the system and make the smallest credible MVP slice real.

Cortex is project memory only. Do not use Cortex as product memory. Product memory must be Hindsight/Zen/LangMem/Mem0/Zep-style runtime memory or a clearly named adapter with equivalent retain/recall semantics.

Primary objective today:
Unify the product runtime around LangGraph and build a visible, non-mocked, read-only benefits evidence slice.

You must implement or prepare failing tests for:
1. Single runtime parity across chat/orchestrator endpoints.
2. Routing without literal workflow keywords.
3. LLM/classifier output causally affecting routing.
4. Proposal -> approval -> resume loop.
5. No false evidence when browser/authenticated portal is unavailable.
6. Live portal source-pointer proof.
7. Product memory retain/recall using Hindsight/Zen/etc., not Cortex.
8. PHI serialized payload inspection.
9. Idempotent enrollment.
10. Concurrent same-session checkpoint safety.

Do not add new workflows, personas, UI panels, or broad integrations until these tests exist.

Definition of done for today:
- npm run build passes.
- npm run test:fast passes.
- npm run test:local passes on a clean checkout without hidden DB state.
- New hard tests exist and either pass because the gap is fixed or fail clearly because the implementation is not done yet.
- docs/PROGRESS.md is updated with honest status: contract-only, proposal-only, live-proof missing, or complete.
- No test may pass by relying on pre-seeded local SQLite data unless the command name explicitly says live/seeded and checks the precondition.
```

## Stop conditions

Codex must stop and report rather than continue if:

- It cannot decide which runtime is the product runtime.
- It cannot run tests from a clean DB.
- It cannot prove LLM/classifier output affects routing.
- It cannot prevent false evidence snapshots.
- It cannot inspect serialized model payloads.
- It cannot keep OpenClaw actions proposal-only without losing the future approval-resume design.
- It cannot separate Cortex project memory from product memory.

## Final rule

The MVP is not “many workflows that mostly route.” The MVP is “one healthcare journey that actually works.”

