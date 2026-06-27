# SKILL-PROPOSE: Pointer-Based, Checkpoint-Resumable Capability/Process Portfolio

> Status: implementation brief, behind flags, additive. Grounded in `src/concierge/schema.mjs` (node:sqlite default, `data/brainstyworkers.sqlite`; Postgres via `postgresStore.mjs` placeholder translation only), `src/concierge/capabilityPortfolio.mjs` (`CAPABILITY_PORTFOLIO_VERSION`, `capabilityPortfolioKey`), `runtimeContextCache.mjs`, `checkpointResumePlan.mjs`, `langgraphRunner.mjs`. All adversarial corrections incorporated.

---

## 1. Architecture overview

The capability/process portfolio becomes **durable in Postgres (authoritative), mirrored in Redis (fast, may only lag — never lead)**, and **fed continuously by PEMS+Graphiti** rather than rebuilt per-turn in Redis as `buildCapabilityPortfolio()` does today. Every catalog row is split into two physically separate column groups: a small **planner-metadata half** (redacted/masked `short_description`, `when_to_use`, `why_use`, `best_used_for`, `planner_score`, `pointer_cache_key` + a `rationale_hash`/`rationale_preview` PHI guard) that **is the pointer target the planner prompt sees**, and a **hydrate-HOW half** (`how_config_json`, `graph_subpath_json`, `how_config_hash`, backing-table keys) that is injected only after a pointer is dereferenced and **verified** (exists + backing-row enabled + lifecycle/quarantine policy + freshness via `how_config_hash` + route-fit). Backing tables (`workflow_definitions`/`openclaw_skills`/`tool_registry`) stay authoritative for `title`/`enabled`/`integration_status`/`risk` — the catalog denormalizes nothing it can resolve at hydrate time. Workflow runs are made resumable by a per-(run, step) **status ledger** (`workflow_checkpoint_runs`) reusing the **same `workflow_run_id` across reruns**: resume selects rows whose `status NOT IN ('completed','skipped')`, and **every side-effecting LangGraph node SELECTs its (run, step) row and short-circuits on `completed` before acting**, reconciling the status table with LangGraph's native node replay so "no duplicate side effect" is *enforced*, not asserted. Duplicate dispatch is prevented by a Postgres `UNIQUE(idempotency_key)` insert committed **before** the external call, with a Redis `SETNX` lock as a losable fast-path. A single **sync writer** projects PEMS promotion state (the one authority) into `capabilities.lifecycle_state`, and demote/quarantine provenance events `UPDATE` `capabilities.status` so the planner's selection predicate actually filters them out — closing the write→read-back→affects-planner loop.

---

## 2. Postgres DDL

> **Correction applied (dialect):** the shared `SCHEMA_SQL` in `schema.mjs` is SQLite-dialect — TEXT/INTEGER only, INTEGER 0/1 booleans, JSON as TEXT, timestamps as TEXT set via `nowIso()`, inline `UNIQUE`, **no** `CHECK`/`GIN`/`CREATE INDEX`. The five tables below ship in that dialect into `TABLES` + `SCHEMA_SQL` so they survive both engines. CHECK-style constraints are documented as comments and enforced in the writer layer. Real indexes + JSONB + GIN ship **separately** as a Postgres-only migration (`project/db/postgres-init/002_capability_portfolio.sql`) outside the shared DDL.

### 2a. Shared DDL (add to `schema.mjs` `SCHEMA_SQL`, register names in `TABLES`)

```sql
-- capabilities: atomic registry of the four portfolio kinds (workflow|skill|tool|graph_path).
-- Backing tables remain authoritative for title/enabled/status/risk; capability owns
-- ONLY lifecycle_state + planner_* + pointer + how_config columns.
CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY,                              -- cap:<kind>:<key>, the pointer subject
  capability_key TEXT NOT NULL UNIQUE,             -- stable slug = portfolioId (e.g. workflow:pharmacy_formulary)
  kind TEXT NOT NULL,                              -- workflow|skill|tool|graph_path (enforced in writer)
  -- lifecycle is a DERIVED projection, written ONLY by the sync writer (see §4):
  status TEXT NOT NULL DEFAULT 'draft',            -- draft|active|disabled|quarantined|demoted
  lifecycle_state TEXT NOT NULL DEFAULT 'shadow',  -- shadow|supervised_advisory|production (projected from PEMS)
  -- PLANNER-METADATA half (the pointer target; MASKED, PHI-gated) ---------------------
  short_description TEXT NOT NULL DEFAULT '',
  when_to_use TEXT NOT NULL DEFAULT '',
  why_use TEXT NOT NULL DEFAULT '',
  best_used_for TEXT NOT NULL DEFAULT '',
  not_for TEXT NOT NULL DEFAULT '',
  planner_tags_json TEXT NOT NULL DEFAULT '[]',
  planner_score INTEGER NOT NULL DEFAULT 0,
  planner_metadata_json TEXT NOT NULL DEFAULT '{}',
  rationale_hash TEXT,                             -- PHI guard (mirrors worker_procedural_memory.masked_preview pattern)
  rationale_preview TEXT NOT NULL DEFAULT '',      -- masked preview only; raw never stored here
  metadata_phi_cleared INTEGER NOT NULL DEFAULT 0, -- 1 only after masking gate passes (§9)
  pointer_cache_key TEXT,                          -- brainsty:capability-portfolio:<session>#<capability_key>
  -- HYDRATE-HOW half (never sent to planner; resolved + verified on deref) -------------
  how_kind_ref TEXT,                              -- workflow_definitions|openclaw_skills|tool_registry|self
  workflow_key TEXT,                              -- backing FK (authoritative for title/enabled/status)
  skill_key TEXT,
  tool_key TEXT,
  graph_subpath_json TEXT,                        -- node sequence for kind=graph_path; validated at seed (§9)
  how_config_json TEXT NOT NULL DEFAULT '{}',
  how_config_hash TEXT,                           -- freshness/route-fit verification on deref
  config_version INTEGER NOT NULL DEFAULT 1,
  last_hydrated_at TEXT,                          -- detect written-but-never-dereferenced anti-pattern
  hydrate_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workflow_key) REFERENCES workflow_definitions(workflow_key),
  FOREIGN KEY (skill_key) REFERENCES openclaw_skills(skill_key),
  FOREIGN KEY (tool_key) REFERENCES tool_registry(tool_key)
);

-- processes: ordered, offerable paths. Same planner/hydrate split.
CREATE TABLE IF NOT EXISTS processes (
  id TEXT PRIMARY KEY,
  process_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  journey_stage TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  lifecycle_state TEXT NOT NULL DEFAULT 'shadow',
  offerable INTEGER NOT NULL DEFAULT 0,            -- INTEGER 0/1 boolean
  display_order INTEGER NOT NULL DEFAULT 100,
  short_description TEXT NOT NULL DEFAULT '',
  when_to_use TEXT NOT NULL DEFAULT '',
  why_use TEXT NOT NULL DEFAULT '',
  best_used_for TEXT NOT NULL DEFAULT '',
  planner_metadata_json TEXT NOT NULL DEFAULT '{}',
  planner_score INTEGER NOT NULL DEFAULT 0,
  rationale_hash TEXT,
  rationale_preview TEXT NOT NULL DEFAULT '',
  required_user_inputs_json TEXT NOT NULL DEFAULT '[]',
  approval_scope TEXT NOT NULL DEFAULT 'read_only_observation',
  worker_skill_capability_id TEXT,
  graph_subpath_json TEXT,
  ai2ui_actions_json TEXT NOT NULL DEFAULT '[]',
  formulas_json TEXT NOT NULL DEFAULT '[]',
  how_config_json TEXT NOT NULL DEFAULT '{}',
  how_config_hash TEXT,
  pointer_cache_key TEXT,
  config_version INTEGER NOT NULL DEFAULT 1,
  last_hydrated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (worker_skill_capability_id) REFERENCES capabilities(id)
);

-- process_steps: ordered binding rows AND resumable checkpoint-boundary templates.
CREATE TABLE IF NOT EXISTS process_steps (
  id TEXT PRIMARY KEY,
  process_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  title TEXT,
  checkpoint_boundary TEXT NOT NULL,              -- after_policy_gate|after_planner|before_worker|after_evidence|after_response
  checkpoint_payload_schema_json TEXT NOT NULL DEFAULT '{}',
  capability_id TEXT,
  required_user_inputs_json TEXT NOT NULL DEFAULT '[]',
  approval_scope TEXT,
  worker_skill_capability_id TEXT,
  graph_subpath_json TEXT,
  ai2ui_actions_json TEXT NOT NULL DEFAULT '[]',
  formulas_json TEXT NOT NULL DEFAULT '[]',
  is_external INTEGER NOT NULL DEFAULT 0,         -- checkpoint before+after when 1
  is_expensive INTEGER NOT NULL DEFAULT 0,
  requires_idempotency_key INTEGER NOT NULL DEFAULT 0,
  on_failure_policy TEXT NOT NULL DEFAULT 'resume_from_last_safe', -- resume_from_last_safe|restart_step
  planner_metadata_json TEXT NOT NULL DEFAULT '{}',
  how_config_json TEXT NOT NULL DEFAULT '{}',
  config_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (process_id, step_order),
  UNIQUE (process_id, step_key),
  FOREIGN KEY (process_id) REFERENCES processes(id),
  FOREIGN KEY (capability_id) REFERENCES capabilities(id),
  FOREIGN KEY (worker_skill_capability_id) REFERENCES capabilities(id)
);

-- workflow_checkpoint_runs: RUNTIME per-run per-step status — heart of rerun-only-unfinished.
-- process_step_id is NOT NULL (synthetic step rows used for non-process traffic) so the
-- UNIQUE(workflow_run_id, process_step_id) invariant holds even though SQLite/PG allow
-- multiple NULLs. SAME workflow_run_id reused across reruns.
CREATE TABLE IF NOT EXISTS workflow_checkpoint_runs (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT,
  langgraph_thread_id TEXT,
  process_id TEXT,
  process_step_id TEXT NOT NULL,                  -- synthetic 'step:adhoc:<boundary>' when no process
  step_order INTEGER NOT NULL,
  checkpoint_boundary TEXT NOT NULL,
  capability_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',         -- pending|in_progress|completed|failed|skipped|refused
  effect_stage TEXT NOT NULL DEFAULT 'none',      -- none|before_effect|after_effect (retry-safety class)
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key TEXT UNIQUE,                     -- authoritative duplicate-dispatch guard
  effect_input_hash TEXT,                          -- sha256 of canonical resolved dispatch input
  dispatch_lease_id TEXT,
  worker_continuation_id TEXT,
  session_checkpoint_id TEXT,                      -- durable LangGraph state link (the real pointer)
  resume_pointer_json TEXT NOT NULL DEFAULT '{}',  -- prior done checkpoint ids[], manifest cacheKey/hash, lg ckpt id
  is_resume_boundary INTEGER NOT NULL DEFAULT 0,
  request_hash TEXT,                               -- after_policy_gate
  safety_class TEXT,
  route TEXT,                                      -- after_planner
  confidence REAL,
  missing_evidence_json TEXT,
  selected_capability_pointers_json TEXT NOT NULL DEFAULT '[]', -- persisted so idempotency hash is STABLE on resume
  approval_token TEXT,                             -- before_worker
  approval_scope TEXT,
  source_pointer_ids_json TEXT NOT NULL DEFAULT '[]', -- after_evidence
  extraction_status TEXT,
  answer_hash TEXT,                               -- after_response
  claims_json TEXT,
  validation_status TEXT,
  llm_output_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  failure_class TEXT,
  started_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workflow_run_id, process_step_id),       -- one status row per checkpoint per run
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (session_checkpoint_id) REFERENCES session_checkpoints(id),
  FOREIGN KEY (dispatch_lease_id) REFERENCES worker_leases(id),
  FOREIGN KEY (worker_continuation_id) REFERENCES worker_continuations(id),
  FOREIGN KEY (process_step_id) REFERENCES process_steps(id),
  FOREIGN KEY (capability_id) REFERENCES capabilities(id)
);

-- capability_provenance: append-only lineage event log ONLY (no 'current' semantics).
CREATE TABLE IF NOT EXISTS capability_provenance (
  id TEXT PRIMARY KEY,
  capability_id TEXT,
  process_id TEXT,
  source_kind TEXT NOT NULL,                       -- graphiti_consolidation|pems_skill_package|reviewer_approval|hardcoded_seed|operator_proposal
  event_type TEXT NOT NULL,                        -- created|promoted|demoted|quarantined|reinstated|maturity_update
  pems_candidate_id TEXT,
  worker_procedural_memory_id TEXT,
  generated_skill_queue_id TEXT,
  graphiti_episode_ref TEXT,                       -- PHI-cleared handle only
  source_pointer_ids_json TEXT NOT NULL DEFAULT '[]',
  reviewer_user_id TEXT,
  review_decision TEXT,
  maturity_score INTEGER,                          -- snapshot copy for audit; NOT authority
  maturity_status TEXT,                            -- event snapshot of pems promotion_status; NOT authority
  production_driving_allowed INTEGER NOT NULL DEFAULT 0,
  demotion_reason TEXT,
  quarantine INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT,
  effective_until TEXT,
  rationale_hash TEXT,
  rationale_preview TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (capability_id) REFERENCES capabilities(id),
  FOREIGN KEY (process_id) REFERENCES processes(id),
  FOREIGN KEY (pems_candidate_id) REFERENCES pems_candidate_maturity(candidate_id),
  FOREIGN KEY (worker_procedural_memory_id) REFERENCES worker_procedural_memory(id),
  FOREIGN KEY (generated_skill_queue_id) REFERENCES generated_skill_review_queue(id),
  FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
);
```

**Also reuse, do not duplicate:** `workflow_runs` (run header — add columns `status` value `'resuming'`/`'partial'` to make reopening a completed run a *defined* transition; add `resume_pointer_checkpoint_id TEXT`, `last_resumed_at TEXT`); `session_checkpoints` (LangGraph durable state — referenced by `session_checkpoint_id` FK, the real PK); `worker_continuations`/`worker_leases` (dispatch); `pems_candidate_maturity`/`worker_procedural_memory`/`generated_skill_review_queue` (provenance sources).

### 2b. Postgres-only migration `project/db/postgres-init/002_capability_portfolio.sql` (real indexes, NOT in shared DDL)

```sql
CREATE INDEX IF NOT EXISTS idx_capabilities_select
  ON capabilities (status, lifecycle_state, planner_score DESC)
  WHERE status = 'active' AND lifecycle_state = 'production';      -- portfolio ranking + quarantine/demote filtered out
CREATE INDEX IF NOT EXISTS idx_capabilities_kind_status ON capabilities (kind, status);
CREATE INDEX IF NOT EXISTS idx_capabilities_stale_pointer ON capabilities (last_hydrated_at); -- written-but-never-deref audit
CREATE INDEX IF NOT EXISTS idx_capabilities_meta_gin
  ON capabilities USING GIN ((planner_metadata_json::jsonb));     -- Postgres-only; SQLite path uses LIKE/json_extract
CREATE INDEX IF NOT EXISTS idx_processes_offer ON processes (status, offerable, display_order);
CREATE INDEX IF NOT EXISTS idx_process_steps_process ON process_steps (process_id, step_order);
CREATE INDEX IF NOT EXISTS idx_wcr_run_status ON workflow_checkpoint_runs (workflow_run_id, status); -- find unfinished fast
CREATE INDEX IF NOT EXISTS idx_wcr_run_order ON workflow_checkpoint_runs (workflow_run_id, step_order);
CREATE INDEX IF NOT EXISTS idx_wcr_pending ON workflow_checkpoint_runs (status) WHERE status IN ('pending','in_progress','failed');
CREATE INDEX IF NOT EXISTS idx_provenance_capability_latest ON capability_provenance (capability_id, created_at DESC);
-- Type-tighten on PG only: cast *_json TEXT -> jsonb, created_at TEXT -> timestamptz as a view/materialization if needed.
```

---

## 3. Redis key map (`brainsty:*`, via `createRuntimeContextCache`)

> **Correction applied (write order):** Postgres status/unique-insert commits **before** any Redis write; Redis may only ever lag Postgres, never lead. On miss → rebuild from Postgres and trace `cache.miss`; degrade visibly to `backend=memory`. Every value carries `schemaVersion` (reuse `CAPABILITY_PORTFOLIO_VERSION` style).

| Key | Holds | TTL | Planner-metadata vs hydrate split |
|---|---|---|---|
| `brainsty:capability-portfolio:<sessionId>` | Fast mirror of selected portfolio. `promptTable` (≤18 masked rows) + `entries` byId (each w/ pointer `cacheKey#capability_key`). Hydrated **from** Postgres `capabilities`/`processes` (verify enabled/lifecycle/quarantine), not from `contextPacket`. | 1800s (matches today) | **WRITE half** = `promptTable` (planner metadata only). **HYDRATE half** = `entries[].hydrate` (HOW), read on pointer deref via `hydrateCapabilityPointers`. |
| `brainsty:process-catalog:current` → `:manifest:<v>` → `:capability:<id>:v<rev>` | Global versioned catalog (compact manifest + per-cap immutable HOW). Demote/quarantine = flip `current` pointer. | manifest/cap 86400s; `current` no-expiry | manifest = metadata; `:capability:` = HOW. |
| `brainsty:checkpoint-run:<workflowRunId>` | Mirror of `workflow_checkpoint_runs` status map `{process_step_id:{status,idempotency_key,session_checkpoint_id,resume_pointer}}`. Written **after** Postgres commit. | run lifetime (~3600s, refreshed per update; evict on terminal) | n/a (runtime status, no HOW) |
| `brainsty:idempotency:<idempotencyKey>` | `SETNX` dispatch lock `{status,leaseId,resultPointer}`. **Losable fast-path only** — authoritative dedupe is Postgres `UNIQUE(idempotency_key)`. | 300–900s (dispatch window) | n/a |
| `brainsty:runtime-context:<sessionId>` | Existing resume manifest of achieved checkpoint pointers + `manifestHash`; now points at `workflow_checkpoint_runs.session_checkpoint_id`. `deterministicAuthority` stays `database`. | session lifetime | metadata pointers |
| `brainsty:llm-output-index` | Existing `llm_output_id` pointers; referenced at after_planner/after_response. | rolling/bounded | pointer |
| `brainsty:runtime-vector-index` | Existing `vector_hit_id` pointers; dereferenced at after_evidence. | rolling/bounded | pointer |
| `brainsty:worker-state:<sessionId>` | Existing worker runtime mirror; correlates `dispatch_lease_id`/`worker_continuation_id`. | session/worker | n/a |
| `brainsty:trace:hydration:<sessionId>` | Bounded (last 50) `cache.hit/miss`/`verify_fail`/`hydrate` events + p50/p95; backs the missing[] anti-pattern guard. | 1800s | n/a |
| `brainsty:health:backend` | PING gate `{backend,pingMs,healthy}`; exposes `backend=redis` else `memory`. | 120s | n/a |

**Adapter extensions (only two new primitives):** `adapter.setNX(key,val,{ttlSeconds})` and `adapter.ping()` in `runtimeContextCache.mjs`. Checkpoint-run + hydration-trace reuse the proven read-modify-write bounded-array pattern.

---

## 4. Continuous-learning feed: async function interface

New module `src/concierge/capabilityCatalog.mjs`. **Single authority rule:** `pems_candidate_maturity.promotion_status` is the *only* authority for maturity; `capability_provenance` is an append-only event log (no current semantics); `capabilities.lifecycle_state`/`status` is a **derived projection updated solely by `syncCapabilityLifecycleFromPems`**. This closes the write→read-back→affects-planner loop the planner's select predicate depends on.

```js
// READ-only policy decision; NO writes. Hard-fails closed if maturity/review rows unreadable.
async function evaluateCapabilityPromotionGate(store, { candidateId, skillReviewQueueId })
  // -> { passed, lifecycleEligible:'shadow'|'supervised_advisory'|'production'|'rejected',
  //      maturity:{ latestScore, promotionStatus, reviewerApprovalCount, productionDrivingAllowed,
  //                 safetyIncidentCount, trusted }, skillReview:{ reviewDecision, packageHash }, reasons[] }

// PHI MASKING GATE for planner-facing metadata (§9). Graphiti-derived text MUST pass through this.
async function maskPlannerMetadata(store, { rawWhenWhyBestUsed, sourcePointerIds })
  // -> { shortDescription, whenToUse, whyUse, bestUsedFor, rationaleHash, rationalePreview, phiCleared:boolean }

// Idempotent (idempotencyKey); CHECKPOINT-before/after. On gate fail returns {ingested:false,gate}.
async function ingestMaturedCapability(store, { candidateId, skillReviewQueueId, graphitiEpisodeUuid,
  kind, title, rawMetadata, hydratePayload, sourcePointerIds, actorUserId, reviewerUserId,
  approvalGateId, idempotencyKey })
  // -> { capabilityId, ingested, lifecycleState, pointer, howConfigHash, checkpointId }
  // writes capabilities row (masked metadata + HOW behind how_config_json/hash), then
  // recordCapabilityProvenance(event_type='created'/'promoted'), then syncCapabilityLifecycleFromPems.

// THE read-back loop writer (the correction): UPDATEs capabilities/processes lifecycle+status so
// the planner select predicate (idx_capabilities_select) actually filters demoted/quarantined out.
async function syncCapabilityLifecycleFromPems(store, { capabilityId })
  // reads pems promotion_status (authority) -> sets capabilities.lifecycle_state + status accordingly.

async function promoteCapability(store, { capabilityId, actorUserId, toLifecycle, rationale, checkpointId })
  // re-runs gate; rejects illegal transitions; provenance(event_type='promoted'); syncLifecycle; re-mirror Redis.

async function quarantineCapability(store, { capabilityId, actorUserId, reason, safetyClass })
  // provenance(event_type='quarantined', quarantine=1); syncLifecycle flips status='quarantined';
  // mirrorCapabilityToRedis EVICTS the entry. (demoteCapability = same with event_type='demoted'.)

// Recall for planner: returns METADATA + POINTER ONLY (never HOW). Honors PHI-gated disabled result.
async function recallCandidateCapabilities({ store, user, session, userInput, contextPacket, limit })
  // -> { candidates:[{ capabilityId, pointer, kind, title, shortDescription, recallScore, lifecycleState }],
  //      graphitiBackend, phiCleared, cacheBackend }
  // cross-checks each against capabilities + pems; DROPs quarantined/retired.

// HYDRATE-half (closes write-but-never-deref). Redis first, Postgres fallback + lazy re-mirror.
async function hydrateCapabilityPointer(store, { pointer, sessionId, requestRoute, requiredApproval })
  // VERIFIES exists + backing-row enabled (backing table WINS, §8) + lifecycle/quarantine policy +
  // freshness (how_config_hash == catalog current) + route-fit; returns {resolved, hydrate} or {resolved:false, refusal}.
  // bumps last_hydrated_at + hydrate_count; traces hydrate/verify_fail.

// Single write path for ALL mutations: provenance row + hash-chained audit() in one store.transaction().
async function recordCapabilityProvenance(store, { capabilityId, processId, event_type, source_kind,
  fromStatus, toStatus, pemsCandidateId, generatedSkillQueueId, graphitiEpisodeRef, checkpointId,
  reviewerUserId, rationale, sourcePointerIds, metadata })
  // -> { revisionId, eventHash }

// WRITE-half mirror (Postgres-before-Redis): projects compact redacted handle; evicts if quarantined/retired.
async function mirrorCapabilityToRedis(store, { capabilityId, sessionId, ttlSeconds })

// Orchestrator: episode -> retain (replay queue on failure) -> on candidate maturity -> ingest -> mirror.
async function feedCapabilityFromPemsEpisode(store, { user, session, state, localMemoryItems, actorUserId, reviewerUserId })
```

Pipeline: PEMS case episode (`buildSafeProductMemoryEpisode`, source-pointered/PHI-safe) → reflection → `pems_candidate_maturity` → `generated_skill_review_queue` PR/review → `evaluateCapabilityPromotionGate` → `ingestMaturedCapability` → `syncCapabilityLifecycleFromPems` → `mirrorCapabilityToRedis`. Graph paths currently hardcoded in `graphPathEntries()` move into `capabilities` rows (`kind='graph_path'`, `graph_subpath_json`), validated at seed (§9).

---

## 5. Checkpoint-resume algorithm

> **Corrections applied:** SAME `workflow_run_id` reused across reruns; `process_step_id` NOT NULL; side-effecting nodes must consult the status row before acting; dedup separated from retry; Postgres-before-Redis; LangGraph replay reconciled.

`resumeRun(store, runId)`:

1. **Load** `workflow_runs` header + ledger rows `ORDER BY step_order`. Set header `status='resuming'` (defined transition; not a fresh run).
2. **Crash reconcile.** For each `status='in_progress'` row: look up its `idempotency_key` in the Postgres dispatch ledger / `worker_continuations`. If the external effect *committed* → promote to `completed` with cached `resultPointer` (recovers "crashed after effect, before status write"). Else if the `worker_leases` heartbeat is stale → set `failed`, `failure_class='lease_lost'`, `attempt_count++`.
3. **Select resume target R** = first row where `status NOT IN ('completed','skipped')` by `step_order`. None → run already complete; set header `completed`.
4. **Hydrate upstream (deref the WRITE-half handles of all `completed` rows before R).** For each, verify the pointer still resolves: exists + backing-row enabled + policy-allowed + fresh (`how_config_hash`) + route-fit; capability pointers re-checked NOT demoted/quarantined per PEMS (this is where a since-demoted skill invalidates `after_planner` and moves **R back to after_planner** for re-plan). Any failure → set that boundary back to `pending`, move R earlier. ("`completed` is necessary but the pointer must still hydrate.")
5. **Restore graph position.** Take R's parent `session_checkpoint_id` → restore LangGraph thread channel state via the thread-scoped checkpointer (`graphCheckpointer.mjs`; require `BRAINSTY_GRAPH_CHECKPOINTER=file` for crash-resumable runs, else mark resume-from-after_planner only) and load `session_checkpoints.state_json`. Inject achieved-state pointers (the `session_checkpoint_id`s of completed boundaries) into the resume prompt — compact prior achievements, not full replay.
6. **Replay downstream only**, R → after_response. **Every side-effecting node's contract:** `SELECT` its `(workflow_run_id, process_step_id)` row and **short-circuit return cached output if `status='completed'`** before doing anything — this is what reconciles the status table with LangGraph's native node replay so a replayed node cannot re-fire a side effect.
7. **On boundary failure:** `attempt_count++`; if `>= max_attempts` set header `failed`; else leave `failed` for next resume.

**Idempotency (dedup ≠ retry):** dispatch `idempotency_key = sha256(runId : beforeWorkerCheckpointId : workerPlanSignature)`, where `workerPlanSignature` hashes the **persisted** `selected_capability_pointers_json` (NOT a per-turn-rebuilt portfolio — that was the drift bug). Two-phase: (A) Redis `SETNX brainsty:idempotency:<key>` (fast, losable); (B) **authoritative**: Postgres `INSERT … UNIQUE(idempotency_key)` committed **before** the external call. Retry semantics keyed on `status`+`effect_stage`:
- `status='completed'` → **skip** (return cached result pointer).
- `status='failed'` + `effect_stage='before_effect'` → **retry with the SAME key** (insert is a no-op upsert into the existing row; no new effect happened).
- `status='failed'` + `effect_stage='after_effect'` → **do NOT blind-retry**; route to compensation/human approval (`on_failure_policy`), since the external system already received the call.

For external APIs that accept an idempotency header, pass `idempotency_key` through; APIs that don't → mark the step non-idempotent so resume refuses auto-replay.

---

## 6. Initial capability/process catalog

> Read-only portal-observe spine; HITL approval; all submit/send/pay/upload/appeal OUT of initial scope.

| id | kind | WHEN/WHY (planner metadata) | HOW-summary (hydrate) | Approval scope |
|---|---|---|---|---|
| `process:portal_readonly_lookup` | process | Default spine for ANY payer-portal data request when a portal_account exists but no fresh source pointer is cached | input_policy→recall_context→classify_intent→llm_decision→workflow_router→`graph:user_takeover_login`→approval_pause→observe_evidence (`skill:insurance_portal_browser`, read-only)→portalExtraction→portalEvidenceVerifier→compose_response w/ source_pointer_ids; 5 checkpoints | read_only_observe |
| `process:eligibility_benefits` | process | "Am I covered / deductible / OOP max / copay / effective dates" | spine, specialized to Benefits/Coverage sections; reconciles DOM+OCR; reuses fresh `eligibility_snapshots`; mirrors `eligibility_benefits_navigation` | read_only_observe |
| `process:claim_status` | process | "Status of claim X / why billed / patient responsibility / EOB" | spine → Claims/EOB; extracts claim_items w/ per-claim source pointers; mirrors `claim_status_navigation` | read_only_observe |
| `process:prior_authorization` | process | "Do I need pre-auth / PA status / payer requirement" | spine for PA status + fan-out to `tool:aetna_cpb_lookup`/`cms_mcd_lookup`/`cms_icd10_lookup`; returns status+criteria, never submits | read_only_observe (submit OUT of scope) |
| `process:pharmacy_formulary` | process | "Is my drug covered / tier / step therapy / copay / alternatives" | spine on Pharmacy + formulary PDFs via `tool:web_search_authoritative`; mirrors `pharmacy_formulary` | read_only_observe |
| `process:provider_network` | process | "Is Dr X in-network / find in-network near me / tier" | spine on Find-Care directory; flags staleness; **NEW `provider_network_navigation`** | read_only_observe |
| `process:cost_estimate` | process | "How much will X cost me" (estimate, not guarantee) | COMPOSITE: eligibility + provider_network + claim_status accumulators + portal estimator; mandatory non-guarantee disclaimer; **NEW `cost_estimate_navigation`** | read_only_observe |
| `process:document_review` | process | User uploads EOB/SBC/ID card/denial letter to interpret | NO login; observe via `tool:document_trace_parser`+`ocr_local`→structuredExtraction→verifier→cite; mirrors `document_or_trace_review` | read_only (local artifact) |
| `process:denial_appeal` | process | Denied claim/PA — understand grounds, assemble appeal support | composes claim_status + document_review + policy lookups; produces draft SUPPORT only | read_only / draft-only (send OUT of scope) |
| `skill:insurance_portal_browser` | skill | Execution arm to OBSERVE a user-authenticated portal; safety envelope | OpenClaw `insurance_portal_browser` (risk=high); never enters creds/2FA; treats portal text as untrusted; fallback chain | read_only_observe; write needs per-action token |
| `skill:browser_automation` | skill | Substrate when driving a real browser (tab hygiene, ARIA, stale-ref recovery) | OpenClaw `browser-automation` | inherits caller |
| `skill:ocr_local` | skill | Evidence in images/canvas/PDF where DOM is insufficient | OpenClaw `ocr-local`, local only, cross-checks DOM | local read-only |
| `tool:openclaw_authenticated_browser` | tool | Pinned handle to dispatch the OpenClaw browser arm | `openclaw_authenticated_browser` → bridges worker dispatch + idempotency key + lease + continuation | read_only_observe default |
| `tool:payer_portal_reader` | tool | Structured read-only extraction → source pointers | `payer_portal_reader` → portalExtraction/portalScan → portal_page_snapshots + extraction_artifacts | read_only |
| `tool:aetna_cpb_lookup` | tool | Payer clinical policy criteria for PA/appeal | Aetna CPB retrieval → citation pointer (no PHI sent) | read_only external |
| `tool:cms_mcd_lookup` | tool | Medicare NCD/LCD coverage determinations | CMS MCD → criteria + citation | read_only external |
| `tool:cms_icd10_lookup` | tool | Validate/resolve ICD-10 codes | CMS files / MCP `ICD-10_Codes` (2026 set) → code + billable validity | read_only external (no PHI) |
| `tool:web_search_authoritative` | tool | Published formulary/SBC/policy when portal lacks fact | authoritative web retrieval → citation | read_only external |
| `tool:document_trace_parser` | tool | Parse uploaded EOB/SBC/denial artifacts | structuredExtraction over extraction_artifacts | read_only local |
| `graph_path:input_policy_to_llm_planner` | graph_path | Entry path after safety gates | input_policy→recall_context→classify_intent→llm_decision→workflow_router; checkpoints after policy+planner | none (pre-execution) |
| `graph_path:user_takeover_login` | graph_path | REQUIRED HITL before portal observe when unauthenticated | workflow_router→request_user_takeover→approval_pause(login_takeover)→resume; agent never types creds | login_takeover |
| `graph_path:approval_interrupt_resume` | graph_path | Native HITL pause before any worker/write step | observe_evidence→approval_pause→observe_evidence; `approval_gates`; emits token bound to scope+idempotency_key | gates requested scope |
| `graph_path:evidence_to_sourced_answer` | graph_path | Trusted source pointers exist; composer can cite | observe_evidence→case_state_shadow→compose_response; every claim→source_pointer_id | none |
| `graph_path:checkpoint_resume_unfinished` | graph_path | Prior run failed/interrupted | `checkpointResumePlan.mjs` → reruns only unfinished boundaries; idempotency + leases | inherits original |

**Gap to close in seed:** `provider_network_navigation`, `cost_estimate_navigation` (and `pharmacy_formulary`, `document_or_trace_review`, `denial_appeal_preparation`) must be added to `WORKFLOW_DEFINITIONS` **and** the skill's Allowed Workflows, else route-rejected at the policy gate.

---

## 7. Implementation steps (skill-propose; each a vertical slice + non-mocked test)

1. **Schema + table registration.** Add all 5 `CREATE TABLE` blocks (SQLite dialect) to `SCHEMA_SQL` + names to `TABLES`; add the 3 new `workflow_runs` columns via the additive column-migration path in `database.mjs` (~L501); ship `002_capability_portfolio.sql`. **Test:** boot a fresh `data/*.sqlite` AND a real Postgres container, assert all 5 tables exist, `UNIQUE(workflow_run_id, process_step_id)` and `UNIQUE(idempotency_key)` both reject a real duplicate insert on **both** engines (the SQLite path is the load-bearing one).
2. **Seed the catalog from §6** (no Redis yet). Insert capabilities/processes/process_steps; for `kind=graph_path`, validate every `graph_subpath_json` node name against the langgraph node registry at seed (fail seed on unknown node, §9). **Test:** seed runs idempotently twice; selecting `WHERE status='active' AND lifecycle_state='production'` returns the expected production set; an intentionally-bad graph node fails the seed.
3. **`hydrateCapabilityPointer` + backing-table precedence (§8).** **Test:** disable a `tool_registry` row → hydrate of the corresponding capability returns `{resolved:false, refusal}` even though `capabilities` row says active (backing table wins).
4. **PHI masking gate `maskPlannerMetadata`.** **Test:** feed a metadata string containing a synthetic MRN/SSN/name; assert masked output, `metadata_phi_cleared=1` only after masking, `rationale_hash` set, and that an unmasked Graphiti string cannot reach `capabilities.short_description`.
5. **Redis mirror (Postgres-before-Redis).** Implement `mirrorCapabilityToRedis` + `adapter.ping()`; rebuild `brainsty:capability-portfolio:<session>` from Postgres on miss. **Test:** with `BRAINSTY_REDIS_URL` set, write → kill Redis key → next read rebuilds from Postgres and traces `cache.miss`; with URL unset, `backend=memory` is surfaced (visible degrade).
6. **Provenance read-back loop.** `recordCapabilityProvenance` + `syncCapabilityLifecycleFromPems` + `quarantineCapability`. **Test:** quarantine a capability → assert `capabilities.status='quarantined'`, it disappears from the production select, the Redis entry is evicted, AND an append-only provenance row + hash-chained `audit_events` entry exist (verify via `verifyAuditChain`).
7. **`workflow_checkpoint_runs` shadow ledger** (`BRAINSTY_RUN_LEDGER=shadow`) written alongside `checkpointSession`, write-only, the 5 boundaries wired into `langgraphRunner.mjs` nodes. **Test:** run a real read-only portal-observe flow end-to-end (no mocks of the graph) and assert exactly 5 ledger rows with the correct boundary types and a non-null `session_checkpoint_id` each.
8. **Idempotency lock around before_worker dispatch** (safe to enable first — only *prevents* dispatch). **Test:** dispatch twice with the same persisted `selected_capability_pointers_json` → assert one real worker dispatch, second returns cached `resultPointer`, trace `duplicate-dispatch.prevented`, Postgres `UNIQUE(idempotency_key)` is the rejecter even with Redis flushed mid-test.
9. **`resumeRun` authoritative** (`BRAINSTY_RUN_LEDGER=authoritative`); upgrade `checkpointResumePlan.mjs` from advisory to a thin presenter over R. **Test (extend `graph-interrupt-resume.test.mjs`):** kill a run after `after_evidence`, resume with the SAME `workflow_run_id`, assert only `after_response` re-executes, completed boundaries are skipped, no second portal session opens, and a since-quarantined selected capability forces R back to `after_planner`.
10. **`feedCapabilityFromPemsEpisode` end-to-end.** **Test:** drive a matured `pems_candidate_maturity` + approved `generated_skill_review_queue` through `ingestMaturedCapability` → assert a new production capability appears in the planner select; flip `pems_candidate_maturity.promotion_status` to demoted → `syncCapabilityLifecycleFromPems` removes it from the planner select (read-back proven).

---

## 8. Feeding Phases A/B/C of the Type-II reasoning plan

- **Phase A (deliberate slow planning over a stable surface).** The masked planner-metadata half (`short_description`/`when_to_use`/`why_use`/`best_used_for` + `planner_score`) is the *entire* Type-II working set the planner reasons over — small, pointer-addressed, PHI-cleared. The planner does Type-II deliberation on WHEN/WHY without ever seeing HOW, so the reasoning surface is bounded and cacheable. The production-only select predicate guarantees the planner deliberates only over capabilities PEMS has matured to production.
- **Phase B (commit + execute with verification).** Pointer dereference + `hydrateCapabilityPointer`'s 5 verifications (exists/enabled/policy/freshness/route-fit) are the Type-II→Type-I handoff: deliberate selection, then verified hydration of the executable HOW. The before_worker checkpoint + idempotency key make the commit exactly-once; `selected_capability_pointers_json` is persisted so the committed plan is stable across resumes.
- **Phase C (reflect + learn).** `after_response` (answer_hash/claims/validation) + `after_evidence` (source_pointer_ids) feed `feedCapabilityFromPemsEpisode`: source-pointered, PHI-cleared episodes → reflection → candidate → review → `ingestMaturedCapability`. `syncCapabilityLifecycleFromPems` is the learning effect that closes back into Phase A's surface — a demotion learned in C is *visible* to A's next deliberation, which is the whole point of continuous learning rather than write-only audit.

---

## 9. Risks + safety/PHI/determinism preservation

- **Dialect (was blocking).** Shared DDL is SQLite-native (TEXT/INTEGER, JSON-as-TEXT, INTEGER 0/1, `nowIso()` timestamps, inline `UNIQUE`, zero CHECK/GIN/CREATE INDEX). JSONB/GIN/partial-unique live only in the Postgres migration. CHECK semantics enforced in the writer layer. Validate every test on the SQLite default path, not just Postgres.
- **NULL `process_step_id` defeating dedup.** Fixed: `process_step_id` NOT NULL via synthetic `step:adhoc:<boundary>` rows for non-process traffic, so `UNIQUE(run, step)` holds.
- **Rerun identity.** Fixed: SAME `workflow_run_id` reused; `workflow_runs` gains `resuming`/`partial` states so reopening a completed run is defined. A new run id per rerun (which would void the feature) is explicitly disallowed.
- **LangGraph replay vs status table.** Fixed: side-effecting nodes MUST `SELECT (run, step)` and short-circuit on `completed` before acting; status table reconciled with native replay rather than assumed-consulted. Require `BRAINSTY_GRAPH_CHECKPOINTER=file` for crash-resumable runs.
- **idempotency_key blocking legitimate retry.** Fixed via `effect_stage`: completed=skip, failed-before-effect=retry-same-key, failed-after-effect=compensation/human (no blind retry).
- **Redis as transient truth.** Fixed: Postgres `UNIQUE` insert before the side effect is authoritative; Redis `SETNX`/status map only ever lags Postgres and is safe to lose. `deterministicAuthority` stays `database`.
- **Provenance write-only.** Fixed: `syncCapabilityLifecycleFromPems` UPDATEs `capabilities.status`/`lifecycle_state`; production-only select predicate filters demoted/quarantined.
- **Maturity triplication/drift.** Fixed: `pems_candidate_maturity.promotion_status` is the sole authority; provenance is append-only event log; `capabilities.lifecycle_state` is a derived projection written only by the sync writer.
- **PHI in planner metadata.** Fixed: `maskPlannerMetadata` gate + `rationale_hash`/`rationale_preview`/`metadata_phi_cleared`; Graphiti-derived text cannot populate planner columns unmasked. External tools (`aetna_cpb`, `cms_*`, `web_search`, ICD-10 MCP) receive de-identified codes/criteria only.
- **Reviewer/production gate procedural-only.** Mitigation: `ingestMaturedCapability`/`promoteCapability` hard-fail closed if `evaluateCapabilityPromotionGate` cannot read maturity/review rows — never default to production. (Schema-level FK linking lifecycle='production' to an approved review row is a follow-up hardening.)
- **Denormalization conflict.** Fixed: backing tables win for `title`/`enabled`/`integration_status`/`risk`, resolved at hydrate via `how_config_hash`; capability owns only `lifecycle_state`/`planner_*`/pointer/`how_config`.
- **`achieved_checkpoint_pointer` on non-unique target.** Fixed: dropped; rely on `session_checkpoint_id` FK (the real PK). Achieved-state pointers in prompts use `session_checkpoints.id`.
- **graph_path opacity.** Fixed: `graph_subpath_json` node names validated against the langgraph node registry at seed/migration; unknown node fails the seed (keeps them grep-checkable).
- **Determinism preserved.** Deterministic safety gates (input_policy, approval) remain pre-pointer; pointers/checkpoints add resumability without altering the deterministic route. `selected_capability_pointers_json` persistence keeps the idempotency hash stable so resume is deterministic. Every ledger/provenance write emits an `audit_events` hash-chain entry for HIPAA traceability.

**Files touched:** `src/concierge/schema.mjs` (5 tables + workflow_runs columns + `TABLES`), `project/db/postgres-init/002_capability_portfolio.sql` (new), `src/concierge/capabilityCatalog.mjs` (new — §4 functions), `src/concierge/capabilityPortfolio.mjs` (split manifest vs per-pointer hydrate, hydrate from Postgres), `src/concierge/runtimeContextCache.mjs` (`setNX`+`ping`), `src/concierge/workflowRunCheckpoints.mjs` (new — open/close/fail/resumeRun), `src/concierge/langgraphRunner.mjs` (5 boundaries + node short-circuit + dispatch lock), `src/concierge/checkpointResumePlan.mjs` (presenter over ledger), `src/observability/checkpoints.mjs` (hydration/cache traces). Tests: extend `phase80-checkpoint-resume-plan.test.mjs`, `graph-interrupt-resume.test.mjs`, `worker-stateful-redis.test.mjs`.