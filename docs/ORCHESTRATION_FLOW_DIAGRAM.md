# Orchestration Flow — hydration points, agent states, measures & contracts

Validated Mermaid (renders in GitHub / Mermaid Live). Three views: the runtime cycle with every
hydration source + agent + Langfuse span; the agent/takeover state machine; and the
hydration + contracts reference tables.

Legend: **green** = hydration store · **indigo** = LLM/worker agent · **slate** = deterministic
node · **purple** = contract/measure · **amber** = HITL gate. `LF:` = the Langfuse span where it
shows (open `planner.start → Input.full_prompt` for the full hydrated decision input; every node
span carries `full_state`).

## 1. Runtime cycle — nodes, hydration, agents, contracts

```mermaid
flowchart TB
  classDef store fill:#0b3d2e,stroke:#10b981,color:#d1fae5
  classDef agent fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff
  classDef node fill:#0f172a,stroke:#475569,color:#e2e8f0
  classDef contract fill:#3b0764,stroke:#c084fc,color:#f3e8ff
  classDef gate fill:#3f2d00,stroke:#f59e0b,color:#fde68a

  U([User message · /api/chat]):::node

  subgraph STORES[Hydration sources]
    PG[(Postgres / SQLite<br/>conversation_messages, processes,<br/>process_steps, capabilities,<br/>workflow_definitions, source pointers)]:::store
    RD[(Redis :6381 — 6 namespaces<br/>runtime-context, capability-catalog,<br/>capability-portfolio, llm-output-index,<br/>runtime-vector-index, worker-state)]:::store
    CK[(File checkpointer<br/>messages channel · per thread_id)]:::store
    GR[(Graphiti / FalkorDB<br/>product memory · PHI-gated)]:::store
  end

  U -->|insertConversationMessage seq| PG
  U --> N1

  subgraph CYCLE[LangGraph 12-node cycle — span per node carries full_state]
    N1[input_policy<br/>evaluateInputPolicy · append user turn to messages channel<br/>LF: input_policy]:::node
    N2[recall_context<br/>buildContextPacket · loadRuntimeContextForSession · loadSessionPortfolio<br/>LF: recall_context]:::node
    N3[classify_intent<br/>structuredIntentNode → curatedClassifier hint<br/>LF: classify_intent]:::node
    N4{{llm_decision · PLANNER agent gpt-4.1<br/>buildLlmOrchestrationDecisionPayload 18 inputs → LLM<br/>LF: planner.start full_prompt · model.llm_orchestration_decision}}:::agent
    N5[workflow_router<br/>shouldUseLlmDecision · selectProcessForWorkflow · route_reason<br/>LF: workflow_router]:::node
    N6[plan_journey]:::node
    N7[skill_resolver<br/>tool/skill bound from process_steps]:::node
    N8[workflow_executor<br/>writeShadowCheckpointLedger · real process_id + pstep rows]:::node
    N9[observe_evidence<br/>read-only worker observation]:::node
    N10{{WORKER agent · OpenClaw / Steel CDP<br/>navigate · scrape → source pointers · read-only}}:::agent
    GATE[[approval_pause · native interrupt<br/>HITL approval token]]:::gate
    N11[case_state_shadow]:::node
    N12{{compose_response · COMPOSER agent gpt-4.1<br/>answer_from_evidence OR offer_process_and_ask<br/>LF: compose_response · model.final_response}}:::agent
    R([Response / AI2UI offer / live-browser action]):::node
  end

  N1 --> N2 --> N3 --> N4 --> N5 --> N6 --> N7 --> N8 --> N9
  N9 -->|approval required| GATE
  GATE -->|token| N9
  N9 --> N11 --> N12 --> R
  N9 -. read-only .-> N10
  N10 -. source pointers .-> PG

  RD -. runtime-context manifest .-> N2
  RD -. capability-catalog 25 entries .-> N2
  RD -. runtime-vector-index topMatches .-> N4
  RD -. llm-output-index .-> N4
  PG -. processes + process_steps target/steps .-> N4
  PG -. workflow_definitions routeCandidates .-> N2
  CK -. messages channel conversation_history .-> N4
  GR -. product memory facts .-> N2
  PG -. assistant turn + checkpoint .-> R
  N8 --> PG

  subgraph CONTRACTS[Measures and contracts]
    C1[Decision contract · expectedJsonShape<br/>extractedDemand · targetOutcome · informationNeeds · collectedUserData<br/>workflow · responseStrategy · offeredProcessIds · capabilityAssessment.canAnswerNow<br/>normalize fail-closed + warnings]:::contract
    C2[Safety contract<br/>no credential entry · no form submit · no payer contact<br/>read_only_observation · current-balance ⇒ offer_process_and_ask]:::contract
    C3[Non-mocked acceptance<br/>write → read-back → behavior change → trace/audit → fail-loud]:::contract
    C4[Measurement · Langfuse<br/>full_prompt + full_state per span · per-span latency<br/>npm run eval:planner scores workflow/process/demand]:::contract
  end

  N4 -. governed by .-> C1
  N4 -. governed by .-> C2
  N10 -. governed by .-> C2
  CYCLE -. proven by .-> C3
  CYCLE -. observed by .-> C4
```

## 2. Agent state machine (control + worker authority)

```mermaid
stateDiagram-v2
  [*] --> agent_control: session start
  agent_control --> takeover_requested: user taps Take control (POST /takeover request)
  takeover_requested --> user_in_control: grant (grantToken) — AGENT PAUSED
  note right of user_in_control
    Worker observe/explore => HTTP 409 (paused)
    User signs in, solves 2FA/captcha, types
    No credential handling by the agent
  end note
  user_in_control --> agent_read_only_observation: Return control (POST /takeover end)
  agent_read_only_observation --> agent_read_only_observation: read-only scrape → source pointers → local DB
  agent_read_only_observation --> takeover_requested: user takes control again
  agent_read_only_observation --> [*]: session closed
  agent_control --> [*]: session closed
  note left of agent_read_only_observation
    Reattach across facade restart:
    steel_session_is_live → reuse (keep login)
    portal_login_required → new login
  end note
```

## 3. Hydration points (where each input is loaded)

| Input | Function | Store | Node / Langfuse span |
|---|---|---|---|
| conversation timeline | `insertConversationMessage` (seq) | Postgres `conversation_messages` | pre-graph |
| messages channel / conversation_history | `inputPolicyNode` append + checkpointer | File checkpointer (authoritative DB) | `input_policy` → read at `llm_decision` |
| deterministicPolicy | `evaluateInputPolicy` | computed | `input_policy` |
| runtimeContext manifest | `loadRuntimeContextForSession` | **Redis** runtime-context | `recall_context` |
| capabilityPortfolio (25) | `loadSessionPortfolio` | **Redis** capability-catalog ← DB processes+capabilities | `recall_context` → payload at `planner.start` |
| offerableProcesses + target/steps | `loadSessionPortfolio` + process_steps batch query | DB processes/process_steps | `llm_decision` payload |
| routeCandidates | workflow architecture readiness | DB workflow_definitions | `recall_context` |
| runtimeVectorContext / llmOutputIndex | memoryHarness | **Redis** runtime-vector-index / llm-output-index | `planner.start` payload |
| productMemory | `recallProductMemoryForRequest` | Graphiti/FalkorDB (PHI-gated) | `recall_context` |
| source pointers | `evidenceObservationNode` / worker | DB extraction_artifacts, portal_page_snapshots | `observe_evidence` |

## 4. Measures & contracts

| Contract / measure | Where | Enforced by |
|---|---|---|
| Decision contract (22 fields incl. demand extraction) | planner output | `expectedJsonShape` + `normalizeLlmOrchestrationDecision` (fail-closed defaults + warnings) |
| Safety boundary | planner + worker | system prompt rules + `openclawCapabilityPolicy` + facade safety contract |
| Takeover state machine + agent pause | facade | `/takeover` states + 409 guard on observe/explore |
| Process-driven execution | runtime | `selectProcessForWorkflow` → real `process_id`/`pstep` ledger; `resumeRun` iterates steps |
| Non-mocked acceptance | tests | write → read-back → behavior change → trace/audit → fail-loud |
| Measurement | Langfuse + eval | `full_prompt`/`full_state` per span + per-span latency; `npm run eval:planner` |
