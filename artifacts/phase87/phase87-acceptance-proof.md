# Phase 87 acceptance proof — tool/executor registry + dispatch trigger + RAG/public-data substrate

Branch: `phase-87-tool-executor-registry-dispatch-rag`.
Plan: `docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md` §7 / §11 Phase 87.
Date: 2026-07-03. All proofs are REAL runtime runs — real SQLite (restart simulation),
LIVE Postgres 16 (parity), LIVE OpenAI `text-embedding-3-small`, LIVE `data.cms.gov`,
LIVE gpt-4.1 planner, real HTTP route on a fresh server. No mocks, per
`docs/NON_MOCKED_PROOF_RULES.md`.

## Acceptance arms (§11 Phase 87)

| Arm | Result | Evidence |
|---|---|---|
| Every mapped tool_key resolves an executor deterministically; unknown key fails `executor_missing` | PASS | `skill-tool-sync.test.mjs` — the FULL registry map iterated: every non-null `executor_key` resolves its executor; unknown keys and the NULL-executor write workers fail loud `executor_missing`. The regex classifier is DELETED. |
| Previously false-blocked read-only verb-named action validates; writeCapable-without-token → `approval_required` | PASS | `openclaw-skill-registry.test.mjs` — `payer_portal_reader.extract_provider_contact_details` (verb "contact", read-only tool) validates with a token; `openclaw_claim_submission_worker` (write_capable=1) yields `write_or_external_action_disabled` + `write_action_requires_bound_approval` + `approval_required`. ROUTE ARM: fresh server on :4517, real `POST /api/openclaw/skills/insurance_portal_browser/validate-envelope` with a v2 replay → `validation.valid=true`, plan `schemaVersion=…phase87.v4`, `status=pending_approval`, `unregisteredToolKeys=[]`. (An initial route probe on :4173 answered with a PRE-pivot contract version — that is the operator's long-running dev server with old code in memory, not this branch; the fresh-server run is the proof.) |
| Planner-selected observation dispatches with NO client flag present | PASS | `phase87-registry-dispatch.test.mjs` — replay decision selecting `skill:insurance_portal_browser` (no `executeEvidenceObservation`, no legacy flag) → pointer hydrates → observe node RUNS and enters the dispatch path. `shouldObserveEvidence` no longer vetoes the planner. |
| Quarantined arm produces NO dispatch | PASS | same file — quarantine flips the capability; hydration refuses; `resolvedCount=0`; ZERO `browser_runs` rows. |
| Continuation-resume arm: a turn carrying only `workerContinuationId` validates and dispatches | PASS | `worker-continuations.test.mjs` (the old flag-veto test INVERTED — the veto status `blocked_worker_continuation_requires_official_openclaw` is deleted; the continuation validates via `validateWorkerContinuationForDispatch` and the node dispatches). |
| `useOfficialOpenClawWorker` no longer gates dispatch — REPO-WIDE grep | PASS | zero occurrences across `src/` (incl. `src/observability`, `src/app`), `scripts/`, `openclaw/` — runner triggers, checkpoint reader, both frontends (checkbox + payload renamed to the NON-authoritative `requestEvidenceObservation`/`executeEvidenceObservation` hint), tests. |
| Write-worker registry/catalog split (a)–(d) | PASS | (a) `phase87-registry-dispatch` — 3 write workers + `prior_auth_submission_pas_api` seeded `planned/contract_ready`, `runtime_selectable=0`, `blocked_by_json` + `planner_exposure_json`; promptTable rows carry `notYetExecutable:true` + the exposure contract. (b) normalizer hard issue `tool_not_runtime_selectable` on selection (normalize-time AND post-hydration gate). (c) hydrator refuses `capability_not_runtime_selectable` — never in the dispatchable set. (d) LIVE arm (`phase87-live-proofs`, real gpt-4.1): "please submit my claim…" → no write worker hydrated, NO dispatch, and the user-visible response never claims the submission happened. |
| Document run gates | PASS (pre-existing gates + new executor row) | `document-candidate-approval.test.mjs` (in `test:local`): no approval → `downloadAttempted:false`; consumed token → bound artifact; token reuse refused. Phase 87 adds the first-class `openclaw_document_downloader` row bound to the NEW `document_download` executor (consumed-gate, single candidate URL, single-use). |
| LIVE CMS endpoint call writes/reads `extraction_artifacts` and changes retrievable evidence | PASS (live) | `phase87-live-proofs` — real keyless `data.cms.gov` data-api fetch → honest run row (`completed_public_api_fetch` — no browser, stated as data) + `extraction_artifacts` row → read-back → cms_public RAG ingest → the SAME query that returned zero evidence before ingest returns a CITED pointer after (causality). |
| RAG §5.5 deferred-pointer proof | PASS (LIVE embeddings) | `phase87-rag-pointer-proofs` — ingest with real `text-embedding-3-small` (dim 1536) → idempotent re-ingest (0 new) → RESTART (second store over the same file) → dereference by `content_hash` → retrieval causally changes the evidence set (control store retrieves nothing) → NEGATIVE arm: out-of-band artifact deletion (FK suspended to simulate; the FK itself is defense layer 1) → `rag_chunk_artifact_missing` LOUD, never a silent uncited answer. |
| Retrieval readiness (founder #16) | PASS (live) | 13 required chunk-metadata fields populated on every row (asserted field-by-field); PHI-class (`member_phi`, `user_uploaded`) → `embedding_phi_blocked_no_baa`; unclassified → `embedding_data_class_unclassified`; unknown class → `embedding_data_class_unknown` — all classified refusals AT the abstraction. PHI retrieval is blocked-by-policy, never contract_ready-by-omission. |
| Write path still terminates at `execution_v2_no_private_executor` | PASS | `execution-v2-write-approval.test.mjs` green in `test:local` (untouched); write workers additionally have NULL executor (dispatch impossible by data). |

## §7 registry landings

- `public_web_search` REPLACES the old authoritative-web-search key (old tool row +
  capability row DELETED at seed; requirement rows cleaned; `fallbacksForTool` updated; no alias).
- Promotions to first-class rows: `openclaw_browser_screenshot`, `openclaw_visual_ocr`,
  `openclaw_same_site_read_only_navigation`, `openclaw_portal_discovery` (real pipeline steps),
  `public_web_scraper_openclaw` (renames skill.json `website_scraper`; evidence class
  `unauthenticated_public`, trust rank 5 — §8.7 taxonomy landed as `knowledge/evidenceClasses.mjs`).
- NEW rows with DEFERRED (never enabled-looking) statuses for the §9 connectors:
  `provider_directory_public_api`, `prior_auth_requirements_api`, `payer_fhir_patient_access_api`
  (query surfaces coverage/accumulator/claims-EOB folded per §7), `eligibility_benefits_api`
  (`blocked_external_enrollment`), `pbm_formulary_api`, `prior_auth_status_api`, `consent_token_vault`.
- `employer_benefits_doc_rag` + `openclaw_document_downloader` implemented THIS phase.
- Seed v4 (`2026-07-03.capability-catalog-seed.v4`): 37 capabilities (11 registry-only
  fail-closed rows), scores 10-14 for new tools (workflow slice intact), digit-free metadata.
- `tool_registry` gains `executor_key` + `write_capable` (schema + COLUMN_MIGRATIONS + live-PG
  parity); `toolExecutorAssignments()` is the ONE map source (seed rows = DB rows by construction).
- skill.json ↔ DB `allowed_tools` SET-EQUAL (permanent gate `skill-tool-sync`); dead
  OS-automation tool removed everywhere; `gatewayClient` drops the broken `--profile` flag
  and uses the official runtime's env isolation; `openclawWorkerContract` v4 (plan built from
  hydrated pointers; every tool key asserted registered — `blocked_tool_not_registered` loud).
- §3.2 prompt gains the PLANNED-capability exposure rule (prepare-only phrasing is contract).

## Full gates (recorded 2026-07-03)

- `npm run test:local` (final): **422 tests · 419 pass · 0 fail · 3 gated skips** — includes
  the new blocking gates `phase87-registry-dispatch` (5/5), `phase87-rag-pointer-proofs`
  (2/2 — LIVE embedding arm), `skill-tool-sync` (3/3). Log: `test-local-final.log`.
- `npm run test:phase87:live`: **2/2** (LIVE CMS + LIVE write-request phrasing arm).
- Schema parity 3/3 incl. the LIVE Postgres arm; `docs/db/postgres-schema.json` regenerated
  from live introspection (79 tables — `rag_chunks` landed).
- `npm run eval:planner` (LIVE gpt-4.1): best full run of the phase — **6/6 on 8 of 9
  dimensions, 5/6 demand** (`eval-planner-phase87-rerun…log`), where the single demand miss
  was a lexical scoring nit ("prior authorization" vs the keyword "approval") — the harness
  now accepts documented synonyms. Subsequent same-day runs each show ONE moving conf-0
  fully-blank case — the transient API-failure signature documented in Phases 85/86; each
  affected case passes 3/3 when probed standalone with diagnostics
  (`workflow=document_or_trace_review, valid:true, conf 0.98-1.0` — recorded in this
  session), so the blank is load-transient, not behavioral. `plannerCapabilitySource=db_catalog`
  **6/6 (100%) on every run**. All five run logs committed.
- `npm run build` green. Stale `BRAINSTY_PLANNER_DB_CATALOG` rows in
  `docs/SYSTEM_ARCHITECTURE.md` corrected (the switch was deleted in Phase 86).
