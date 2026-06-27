# Phase 76-82 Redis Pointer Runtime And LLM-Primary Orchestrator Plan

Status: mandatory implementation plan for the next Ralph loop wave.

Source of truth:
- Cortex semantic note `workerprototype-openclaw-late-implementation-architecture`
- Founder direction from 2026-06-26 chat investigation
- Runtime inspection of LangGraph, session checkpoints, context packets, prompt bundles, OpenClaw skills, and research embedding/index code

## Summary

The next wave makes typed chat genuinely LLM-primary while keeping deterministic safety, approval, PHI, audit, and source validation intact. Redis becomes the fast short-term runtime context and checkpoint layer. Postgres/SQLite remains the deterministic source of truth. Graphiti/Zep remains the long-term product memory layer when PHI and schema gates are green.

The planner must not be built around one exact sentence. It must reason over general insurance questions, the current session, achieved checkpoints, prior decisions, workflow capabilities, OpenClaw skills, remote browser state, source pointers, and AI2UI actions.

Rejected naive options:
- no regex/free-text chat routing;
- no mocked chat decisions counted as intelligence;
- no giant raw context prompt;
- no prompt bloat from browser frames, OCR text, documents, or full history;
- no planner skipping just to reduce latency;
- no Redis-as-source-of-truth for regulated records;
- no credential entry, captcha solving, payer contact, form submission, payment, or account mutation by the agent.

## Target Runtime Shape

Every user chat or UI action creates a compact checkpoint trail:

```json
{
  "sessionId": "session_...",
  "latestCheckpointId": "ckpt_...",
  "achievedCheckpoints": [
    {
      "checkpointId": "ckpt_...",
      "step": "planner_decided",
      "summary": "Planner selected claim scrutiny workflow.",
      "redisPointer": "redis://brainsty/session/.../planner_decided",
      "sourcePointerIds": ["claim_items/..."],
      "createdAt": "2026-06-26T00:00:00.000Z"
    }
  ]
}
```

Redis stores rebuildable runtime state:
- session checkpoint manifests;
- compact recent context;
- hydrated checkpoint payloads;
- capability portfolio manifests;
- prompt section cache keys;
- LLM decision output indexes;
- vector indexes over redacted summaries.

Database stores authoritative state:
- users, sessions, approvals, audit events, source pointers, evidence records, conversation messages, final answers, and retention-controlled records.

Graphiti/Zep stores long-term semantic/product memory:
- advisory recall, plan/user/procedure memory, learned skill candidates, and consolidated case memory after PHI/schema gates pass.

## Phase 76 - General Planner Regression Gate

/goals:
- Prove the current free-text chat failure with general scenarios, not one sentence.
- Require LLM planner reasoning for open-ended chat when safety permits.

Implementation:
- Add regression scenarios for:
  - "What is my copayment for a medication?"
  - "What about my claim?"
  - paraphrases that imply portal or policy scrutiny without exact keywords.
- Assert no frontend regex path answers these messages.
- Assert `/api/chat` reaches LangGraph and records planner mode/model tier.
- Assert the selected workflow family and evidence plan are semantically appropriate.

Pass score:
- 100% when both general scenarios use the planner path, return structured evidence/worker/approval plans, and do not depend on exact string matching.

## Phase 77 - Redis Runtime Context And Latency Mitigation

/goals:
- Reduce latency through Redis checkpoints, compact prompts, cache keys, and capability manifests.
- Do not skip reasoning to gain speed.

Implementation:
- Add a `runtimeContextStore` abstraction with Redis primary and in-memory fallback for tests/local no-Redis runs.
- Add Redis key contracts:
  - `session:{sessionId}:checkpoint_manifest`
  - `session:{sessionId}:recent_context`
  - `thread:{threadId}:checkpoint:{checkpointId}`
  - `portfolio:{portfolioId}`
  - `prompt:{hash}:section`
  - `llm:{runId}:decision`
  - `vector:{namespace}:{id}`
- Add checkpoint stages:
  - `chat_received`
  - `policy_passed`
  - `context_loaded`
  - `portfolio_loaded`
  - `planner_decided`
  - `approval_pending`
  - `worker_dispatched`
  - `evidence_captured`
  - `answer_composed`
  - `response_sent`
- Return checkpoint IDs in `/api/chat` debug and compact summaries.

Pass score:
- 100% when every chat stores and returns checkpoint pointers, repeated prompts reuse cacheable context sections, and tests prove no planner skip is needed for latency.

## Phase 78 - Redis-Backed Capability Portfolio

/goals:
- Represent workflows, skills, tools, journeys, and worker capabilities as short LLM-visible portfolio rows backed by Redis pointers.
- Let the planner select portfolio IDs and pointers, then let LangGraph hydrate details.

Implementation:
- Build `capabilityPortfolio` from workflow architecture, tool registry, OpenClaw skill registry, remote browser readiness, approval scopes, evidence modes, memory status, PEMS controls, and AI2UI action inventory.
- Store each portfolio item in Redis and persist source-of-truth refs to database rows or skill files.
- Planner prompt includes a short table only:
  - portfolio ID;
  - kind;
  - short description;
  - required evidence;
  - approval scope;
  - redis pointer.
- Planner output must include `selectedPortfolioIds` and `selectedPointers`.

Pass score:
- 100% when planner payload includes compact portfolio rows, selected portfolio IDs are validated, and LangGraph hydrates selected items from Redis/in-memory fallback before execution.

## Phase 79 - LLM Output Indexing

/goals:
- Index planner/composer outputs for same-session retrieval and audit without storing raw sensitive context.

Implementation:
- Store each structured LLM decision with:
  - run ID;
  - model tier;
  - prompt hash;
  - portfolio hash;
  - selected portfolio IDs;
  - decision JSON;
  - validator result;
  - source pointer IDs;
  - redacted summary.
- Add vector/search namespaces:
  - `session_decisions`
  - `capability_portfolio`
  - `workflow_summaries`
  - `skill_summaries`
  - `prior_answers`
- Store raw LLM output only if it passes PHI/model-payload policy; otherwise store hash and safe summary.

Pass score:
- 100% when follow-up chat can retrieve prior planner decisions by pointer and the dashboard can explain why a path was selected.

## Phase 80 - Redis Checkpointed LangGraph Resume

/goals:
- Resume long-running orchestration from the latest safe checkpoint instead of restarting from scratch.
- Prevent duplicate external/browser execution.

Implementation:
- Add Redis-backed checkpointer option behind `createGraphCheckpointer`.
- Keep encrypted file checkpointer and in-memory checkpointer as fallbacks.
- On node error, store:
  - failed node;
  - safe resume point;
  - latest successful checkpoint;
  - selected portfolio IDs;
  - hydrated pointer refs;
  - retry policy.
- Require worker leases and approval-token validation before re-dispatching browser/OpenClaw actions.

Pass score:
- 100% when simulated crashes after planner, approval, and evidence nodes resume from the correct checkpoint and do not duplicate worker dispatch.

## Phase 81 - Vector-To-Context Retrieval

/goals:
- Use vectors for compact retrieval of relevant runtime context and capability summaries.
- Avoid full-memory dumping.

Implementation:
- Reuse the existing research embedding route pattern as the model for route selection, local deterministic fallback, OpenAI route, job status, and index lifecycle.
- Add runtime context vector namespaces for decisions, portfolio items, skill summaries, workflow summaries, and prior answers.
- Query vectors before the planner call; inject only top ranked summaries and pointers.
- Hydrate selected details after planner selection.

Pass score:
- 100% when medication copay questions retrieve pharmacy/benefit/formulary capabilities, claim questions retrieve claim capabilities/evidence pointers, and planner prompts remain under the configured token budget.

## Phase 82 - Audit Dashboard And Ralph Cycle Proof

/goals:
- Make the whole runtime decision loop auditable for all agents and operators.

Implementation:
- Add dashboard/API panels for:
  - Redis runtime status;
  - latest checkpoint trail;
  - capability portfolio version/hash;
  - selected portfolio IDs;
  - vector retrieval hits;
  - LLM output index entries;
  - resume/retry proof;
  - safety/action verdict.
- Add Ralph loop proof per phase:
  - Requirements;
  - Architecture;
  - Loop;
  - Prove;
  - Harden.

Pass score:
- 100% when an operator can inspect a chat turn from user message to checkpoint trail, portfolio selection, LLM decision, validator result, safety verdict, final answer, and restart/resume proof.

## Mandatory Gates

Every phase must pass:
- `npm run build`
- `npm run test:local`
- `npm run test:policy`
- `npm run test:phi`
- `npm run test:egress`
- `npm run test:model-payload-policy`
- `npm run test:prompt-contracts`
- `npm run test:openclaw:skills`

New focused gates:
- `npm run test:runtime-context`
- `npm run test:planner:portfolio`
- `npm run test:planner:redis-context`
- `npm run test:graph:redis-checkpoints`
- `npm run test:llm:decision-index`

Visual proof:
- `/userapp` or `/mvp` shows helpful LLM-planned responses for medication copay and claim questions.
- Dashboard shows Redis/context/checkpoint/portfolio panels.

## Assumptions

- Redis is a fast rebuildable runtime cache and checkpoint accelerator, not regulated source of truth.
- Local tests may use an in-memory Redis-compatible adapter until a live Redis service is configured.
- Production should use real Redis with TLS/private networking and configured TTLs.
- Long-term product learning remains Graphiti/Zep, not Redis.
- Cortex holds project memory only and must receive episodic/semantic/procedural mirrors by PR.
