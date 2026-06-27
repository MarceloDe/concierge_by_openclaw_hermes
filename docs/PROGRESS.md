# Progress

Track each implementation loop here.

For every slice, record:
- Slice name
- Files changed
- Verification commands
- Result
- What the user can try locally
- Known risks or gaps

## Phase 73 First Testable MVP Readiness - 2026-06-22

Slice name:
- Aggregate Phases 66-72 into a first regular-user testable bill-verification MVP proof.

Files changed:
- `src/concierge/phase73MvpReadiness.mjs`
- `src/server/server.mjs`
- `src/app/app.js`
- `src/tests/phase73-mvp-readiness.test.mjs`
- `package.json`
- `docs/PHASE_SCOREBOARD.md`
- `docs/PROGRESS.md`

Implemented:
- Added an aggregate readiness proof that requires Phases 66-72 to pass together.
- Added a direct MVP readiness endpoint: `GET /api/mvp/readiness`.
- Added dashboard proof key `phase73_first_testable_mvp_readiness`.
- Declares the first testable MVP ready only for a regular-user bill-verification flow on `/mvp`.
- Keeps production readiness false until live Postgres rollout, live Graphiti/Zep runtime, hosted remote browser readiness, authenticated OpenClaw signed-in proof, and live OpenAI composition proof are genuinely green.

Verification commands:
- `npm run test:mvp:readiness`
- `npm run build`

Verification result:
- Passed in this run:
  - first run caught an aggregate contract-name mismatch for the OpenClaw human-only credentials boundary;
  - aggregate proof was aligned to the Phase 70 `credentials` contract;
  - `npm run test:mvp:readiness`: 2 passed, 0 failed.
  - `npm run build`: passed.
  - `npm run test:local`: 326 total, 324 passed, 2 expected live-gated OpenClaw skips, 0 failed.
  - Live API checks against `http://127.0.0.1:4226` passed for:
    - `GET /api/mvp/readiness`;
    - `POST /api/bill-verification/analyze`;
    - `POST /api/bill-verification/final-answer`;
    - `POST /api/bill-verification/skill-candidate`.
  - In-app browser visual proof passed:
    - `/mvp` first click immediately rendered bill extraction, source pointer, and "preparing sourced answer";
    - `/mvp` later rendered a valid final answer with source IDs and no medical-advice/external-action caveat;
    - `/` connector dashboard rendered Phase 71, Phase 72, and Phase 73 cards;
    - Phase 73 card showed `100 / 100`, first testable MVP ready, production blocked, and named production blockers.

What the user can try locally:
- Open `/mvp`, paste a bill note, click Analyze Bill, and inspect extracted facts, missing evidence, no-login fallback, source IDs, and final answer.
- Open `/` and inspect the Phase 66-73 proof cards.

Known risks or gaps:
- Phase 73 is a local/testable-MVP readiness decision, not a production launch decision.

## Phase 72 Bill Sourced Answer - 2026-06-22

Slice name:
- LLM-primary sourced bill-answer path with strict bill claim/source validator and deterministic fallback.

Files changed:
- `src/concierge/billSourcedAnswer.mjs`
- `src/server/server.mjs`
- `src/app/app.js`
- `src/app/mvp.js`
- `src/tests/bill-sourced-answer.test.mjs`
- `package.json`
- `docs/PHASE_SCOREBOARD.md`
- `docs/PROGRESS.md`

Implemented:
- Added a bill-specific sourced answer adapter around the existing `sourcedAnswerComposer`.
- Built source pointers and structured bill facts from the Phase 69 bill analyzer.
- Added a strict bill validator requiring each supported bill/cost/provider/claim fact to cite an allowed source pointer ID.
- Rejected unknown source IDs, medical-advice-shaped text, and false external-action claims such as payer contact or form submission.
- Added deterministic fallback for no sources, no live model request, missing key, or validation failure.
- Added `POST /api/bill-verification/final-answer`.
- Updated `/mvp` so bill analysis immediately prepares a user-visible final answer with mode, validation, and source IDs.
- Added connector proof key `phase72_bill_sourced_answer` and dashboard card.

Verification commands:
- `npm run test:bill-sourced-answer`
- `npm run build`

Verification result:
- Passed in this run:
  - first run caught a validator gap for the phrase "payer was contacted";
  - validator was tightened to catch both "contacted payer" and "payer was contacted";
  - `npm run test:bill-sourced-answer`: 3 passed, 0 failed.

What the user can try locally:
- Open `/mvp`, paste a bill note, click Analyze Bill, and review the extracted facts plus final sourced/fallback answer.

Known risks or gaps:
- Local tests prove the strict schema, validator, and fallback. Live OpenAI composition remains credential-gated and must not be counted as live LLM proof unless `OPENAI_API_KEY` is configured and the live composition test runs.

## Phase 71 Bill Memory Skill Loop - 2026-06-22

Slice name:
- Ref-only bill-case memory episode and operator-reviewed skill candidate loop.

Files changed:
- `src/concierge/billMemorySkillLoop.mjs`
- `src/server/server.mjs`
- `src/app/app.js`
- `src/tests/bill-memory-skill-loop.test.mjs`
- `package.json`
- `docs/PHASE_SCOREBOARD.md`
- `docs/PROGRESS.md`

Implemented:
- Added a successful-bill-case memory episode contract for Graphiti/Zep ingestion.
- Stored source pointer IDs, hashes, loop stages, and outcome metrics only; raw bill text and PHI payloads are not stored in the episode contract.
- Added a reviewed skill candidate contract for `bill_verification_flow` containing tools, extractors, verifiers, sensors, controller loop stages, UI blocks, retrieval rules, and tests.
- Kept staging activation operator-gated, production activation PR-gated, production driving blocked, and kill switch required.
- Added `POST /api/bill-verification/skill-candidate` for a regular MVP test path.
- Added connector proof key `phase71_bill_memory_skill_loop` and dashboard card.

Verification commands:
- `npm run test:bill-memory-skill-loop`
- `npm run build`

Verification result:
- Passed in this run:
  - `npm run test:bill-memory-skill-loop`: 3 passed, 0 failed.
  - `npm run build`: passed.

What the user can try locally:
- Open `/mvp`, analyze a bill note, then use the API endpoint `/api/bill-verification/skill-candidate` to see the memory episode and skill candidate created for operator review.

Known risks or gaps:
- This phase creates the candidate contract and proof surface; it does not auto-write a skill into the worktree or enable production answer driving.

## Phase 35 PEMS Supervised Promotion Gates - 2026-06-18

Slice name:
- Continuous-intelligence PEMS supervised promotion gates.

Files changed:
- `src/concierge/schema.mjs`
- `src/concierge/database.mjs`
- `src/concierge/continuousIntelligence.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/tests/pems-promotion-gates.test.mjs`
- `src/tests/chat-ui-contract.test.mjs`
- `package.json`
- `docs/PROJECT_OPERATING_SYSTEM.md`
- `docs/PHASE_SCOREBOARD.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Implemented:
- Added `pems_candidate_promotion_reviews` as the explicit reviewer/evaluator ledger.
- Extended `pems_candidate_maturity` with supervised advisory and promotion status fields.
- Added deterministic PEMS promotion evaluation requiring:
  - PEMS maturity score and enough shadow runs;
  - two human reviewer approvals;
  - validator/evaluator pass;
  - citation/evidence sufficiency;
  - zero safety incidents;
  - production-driving disabled.
- Added review recording that stores rationale hash plus sanitized preview, not raw rationale or source text.
- Added API routes for promotion status and review recording:
  - `GET /api/continuous-intelligence/pems/promotion`
  - `POST /api/continuous-intelligence/pems/reviews`
- Added connector proof key `pems_supervised_promotion_gate`.
- Advanced `continuous_procedural_memory` only to the Phase 35 supervised-advisory target.

Verification commands:
- `node --check src/concierge/continuousIntelligence.mjs`
- `node --check src/server/server.mjs`
- `node --check src/tests/pems-promotion-gates.test.mjs`
- `node --test src/tests/continuous-intelligence.test.mjs src/tests/continuous-intelligence-persistence.test.mjs src/tests/pems-promotion-gates.test.mjs src/tests/chat-ui-contract.test.mjs`
- `npm run build`
- `npm run test:local`
- `curl http://127.0.0.1:4218/api/continuous-intelligence/pems/promotion`
- `curl http://127.0.0.1:4218/api/proof/runs/server-connector-next-mobile-mvp`
- In-app browser visual proof at `http://127.0.0.1:4218/`

Verification result:
- Syntax checks passed.
- Focused continuous-intelligence/UI contract tests passed:
  - 22 tests,
  - 22 passed,
  - 0 failed.
- `npm run build` passed and names the Phase 35 PEMS supervised promotion gate.
- First `npm run test:local` in the temp clone exposed missing local Aetna scan rows because the temp clone did not include `data/brainstyworkers.sqlite`.
- After copying the existing local SQLite proof DB into the temp clone, `npm run test:local` passed:
  - 221 tests,
  - 219 passed,
  - 0 failed,
  - 2 expected live-gated OpenClaw skips.
- API proof passed with seeded non-PHI proof state:
  - `pems_supervised_promotion_gate`: `phase35_supervised_promotion_gate_active`,
  - `continuous_procedural_memory`: `80 / 80`,
  - `productionDrivingAllowed=false`.
- Visual proof passed in the in-app browser:
  - dashboard loaded at `http://127.0.0.1:4218/`,
  - connector proof rendered `pems_supervised_promotion_gate`,
  - connector proof rendered `80 / 80`,
  - browser console error count: 0.
- Artifacts:
  - `artifacts/phase35/phase35-pems-promotion-api-proof.json`
  - `artifacts/phase35/phase35-connector-proof.json`
  - `artifacts/phase35/phase35-dashboard-proof-final.png`

What the user can try locally:
- Open the dashboard and inspect connector proof for `pems_supervised_promotion_gate`.
- Use the promotion API to record reviewer/evaluator rows against a mature PEMS candidate.

Known risks or gaps:
- Phase 35 is not production procedural automation.
- No PEMS candidate may drive final healthcare answers or browser actions.
- Phase 36 should add a reviewer/evaluator workbench and LLM-assisted evaluator draft notes through this same ledger.

## Phase 8T/8U Candidate-Specific Document Approval And Observation - 2026-06-01

Slice name:
- Candidate-specific document approval plus approved single-candidate read-only OpenClaw observation.

Files changed:
- `src/concierge/documentCandidateApproval.mjs`
- `src/concierge/approvalResume.mjs`
- `src/concierge/workerContinuations.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/concierge/openclawOfficialRuntime.mjs`
- `src/concierge/outputPolicy.mjs`
- `src/server/server.mjs`
- `src/app/mvp.js`
- `src/app/app.js`
- `src/app/styles.css`
- `src/tests/document-candidate-approval.test.mjs`
- `src/tests/output-policy.test.mjs`
- `src/tests/chat-ui-contract.test.mjs`
- `package.json`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`
- `docs/DECISIONS.md`

Implemented:
- Added stable document candidate IDs derived from candidate URL/type/label/source.
- Added `openclaw_document_candidate_proposal` tasks using existing `agent_tasks.metadata_json`; no schema migration or new table was needed.
- Added `read_only_document_observation` approval scope and gate details that bind task, session, user, workflow, candidate ID, candidate URL, allowed action, expiration, and single-use token.
- Blocked missing URL, offsite, mixed-form, submission, and irreversible candidates before proposal/approval.
- Added API proof endpoints:
  - `GET /api/document-candidates`
  - `POST /api/document-candidates/propose`
- Extended worker continuations so one approved document candidate can be scheduled and dispatched without widening the portal read-only scope.
- Extended LangGraph evidence observation so approved document-candidate runs consume the candidate-specific approval token before dispatch and call official OpenClaw with exactly the approved candidate URL, single page, no current-tab substitution, and no broad crawl.
- Extended official OpenClaw runtime metadata/actions for approved document candidate observation while keeping DOM/accessibility, screenshot, local OCR, hashes, source pointers, and no raw document dump.
- Added `captured_official_openclaw_document_read_only_observation` to source-pointer-backed response composition.
- Added `/mvp` candidate cards with `Prepare Approval` and `Approve + Observe` controls.
- Added `/` operator proof candidate cards and candidate approval/observe controls.

Verification commands:
- `node --check src/concierge/documentCandidateApproval.mjs`
- `node --check src/concierge/approvalResume.mjs`
- `node --check src/concierge/workerContinuations.mjs`
- `node --check src/concierge/langgraphRunner.mjs`
- `node --check src/concierge/openclawOfficialRuntime.mjs`
- `node --check src/server/server.mjs`
- `node --check src/app/mvp.js`
- `node --check src/app/app.js`
- `node --test src/tests/document-candidate-approval.test.mjs`
- `node --test src/tests/output-policy.test.mjs src/tests/chat-ui-contract.test.mjs`
- `node --test src/tests/approval-resume.test.mjs src/tests/worker-continuations.test.mjs`
- `npm run build`
- `npm run test:local`
- Browser smoke at `http://127.0.0.1:4173/mvp` and `http://127.0.0.1:4173/`

Verification result:
- Static checks passed.
- Focused document candidate tests passed:
  - 5 tests total,
  - 5 passed,
  - 0 failed.
- Output policy and UI contract tests passed:
  - 10 tests total,
  - 10 passed,
  - 0 failed.
- Existing approval/continuation regression tests passed:
  - 8 tests total,
  - 8 passed,
  - 0 failed.
- `npm run build` passed.
- `npm run test:local` passed:
  - 123 tests total,
  - 121 passed,
  - 0 failed,
  - 2 skipped expected live-gated official OpenClaw tests.
- Browser smoke passed:
  - `/mvp` title: `Brainstyworkers Concierge MVP`,
  - `/` title: `Brainstyworkers AI Concierge`,
  - required auth/chat/approval/discovery/runtime/proof elements present,
  - 0 console errors on both pages.

What the user can try locally:
- Open `http://127.0.0.1:4173/mvp`.
- Run the normal live Benefits path after authenticating the dedicated OpenClaw profile.
- After Discovery records document candidates, use a candidate card to prepare approval, then approve and observe exactly one candidate.
- Use `http://127.0.0.1:4173/` to inspect the matching task, approval gate, continuation, runtime events, source pointers, and worker result.

Known risks or gaps:
- This is approved candidate observation, not full PDF/document extraction. The worker opens/observes one approved candidate URL and stores source pointers; it does not yet parse full PDF text into a document-specific structured domain model.
- Live browser proof for the new candidate flow still needs to be run with the user-authenticated dedicated OpenClaw profile.
- The FastAPI/Wefella backend architecture pivot remains deferred until the original Node/LangGraph/OpenClaw MVP gate passes.

## Phase 8S Section-Specific Structured Extraction And Fixture Hardening - 2026-06-01

Slice name:
- Section-specific structured extraction for live-reachable insurance portal surfaces.

Files changed:
- `src/concierge/structuredExtraction.mjs`
- `src/concierge/outputPolicy.mjs`
- `src/tests/fixtures/aetna-captured-home-sanitized.txt`
- `src/tests/fixtures/aetna-captured-claims-sanitized.txt`
- `src/tests/structured-extraction.test.mjs`
- `src/tests/real-aetna-structured.test.mjs`
- `src/tests/portal-scan-real.test.mjs`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PROGRESS.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`

Implemented:
- Added safe structured extraction for live-reachable portal surfaces:
  - benefits,
  - spending,
  - claims,
  - prior authorizations,
  - documents,
  - ID card,
  - pharmacy,
  - network,
  - plan/effective-date signals.
- Kept existing persisted structured rows for coverage balances, claims, and prior authorizations.
- Added section/document/ID/pharmacy/network/plan signal payloads to the extraction review payload so the graph can reason over safe structured evidence without exposing raw portal text in the answer.
- Added a source-pointer-safe section evidence line to answer composition.
- Replaced mutable local DB-dependent Aetna assertions with sanitized captured-format fixtures:
  - home/benefits fixture,
  - claims fixture.
- Converted the prior local-real-data tests into deterministic captured-format regression tests while preserving live proof as the non-mocked OpenClaw evidence path.
- Moved `portal-scan-real.test.mjs` to temporary SQLite stores so it no longer pollutes or depends on `data/brainstyworkers.sqlite`.

Verification commands:
- `node --check src/concierge/structuredExtraction.mjs`
- `node --check src/concierge/outputPolicy.mjs`
- `node --check src/tests/structured-extraction.test.mjs`
- `node --check src/tests/portal-scan-real.test.mjs`
- `node --test src/tests/structured-extraction.test.mjs src/tests/real-aetna-structured.test.mjs src/tests/portal-scan-real.test.mjs src/tests/output-policy.test.mjs`
- `npm run build`
- `npm run test:local`
- Browser smoke at `http://127.0.0.1:4173/mvp`

Verification result:
- Syntax checks passed.
- Focused extraction/portal-scan/output-policy tests passed:
  - 8 tests total,
  - 8 passed,
  - 0 failed.
- `npm run build` passed.
- `npm run test:local` passed:
  - 116 tests total,
  - 114 passed,
  - 0 failed,
  - 2 skipped expected live-gated official OpenClaw tests.
- Browser smoke passed:
  - title: `Brainstyworkers Concierge MVP`,
  - visible sequence controls present,
  - 0 console errors.

What the user can try locally:
- Open `http://127.0.0.1:4173/mvp`.
- Run the normal Benefits path.
- When an approved live OpenClaw run creates evidence, the answer path can now include a compact structured section evidence line instead of only balances/claims/prior authorizations.
- The operator/debug dashboard remains available at `http://127.0.0.1:4173/`.

Known risks or gaps:
- Phase 8S does not download, open, or analyze PDFs/documents.
- Section/document/ID/pharmacy/network/plan extraction is signal-level evidence, not yet a full typed domain model for every portal page.
- Live OpenClaw remains the non-mocked evidence path. The sanitized fixtures are regression fixtures that preserve captured page shape without requiring a mutable local Aetna DB state.
- The next phase is Phase 8T: add candidate-specific approval for one read-only document candidate before any document/PDF ingestion.

## Phase 8R Live Approved MVP Run - 2026-05-31 local / 2026-06-01 UTC

Slice name:
- User-facing `/mvp` live approved Benefits run with official OpenClaw.

Files changed:
- `.gitignore`
- `src/app/mvp.js`
- `src/app/mvp.css`

Implemented:
- Added `.gitignore` coverage for an accidental nested local clone/copy directory: `concierge_by_openclaw_hermes/`.
- Tightened `/mvp` proof rendering after a completed approved worker run:
  - object-valued reachable portal sections now render as section labels instead of `[object Object]`,
  - `approved_consumed` now marks the approval step complete in the sequence rail,
  - successful Graphiti/product-memory retain now displays as `retained`,
  - the approval panel no longer invites another approval when the latest run already captured source pointers.

Live proof performed:
- Started local app with live portal/OpenClaw flags:
  - `BRAINSTY_PORTAL_LIVE=1`
  - `BRAINSTY_OPENCLAW_USE_CURRENT_TAB=1`
  - `BRAINSTY_OPENCLAW_MULTI_PAGE=1`
- Started the dedicated project OpenClaw gateway:
  - `openclaw --profile brainstyworkers gateway --port 19789 --allow-unconfigured run`
- Verified dedicated OpenClaw browser profile/CDP:
  - profile: `brainstyworkers`
  - gateway: `127.0.0.1:19789`
  - CDP: `127.0.0.1:19800`
- User manually completed Aetna login in the dedicated OpenClaw browser.
- `/api/openclaw/official/status` reported:
  - `official_openclaw_profile_ready`
  - `ready_for_read_only_approval`
  - current tab title: `Home - Aetna`
- Browser-tested `/mvp`:
  - started local planned-user session,
  - checked `Portal Ready`,
  - ran the Benefits journey,
  - confirmed LangGraph stopped at `missing_approval_token`,
  - clicked `Approve + Run Read-Only`,
  - observed approval consumption and official OpenClaw dispatch,
  - observed completed official multi-page read-only evidence capture.

Result:
- Phase 8R live loop passed.
- `/mvp` displayed a final sourced answer after approval.
- Runtime events showed:
  - `approval.recorded`,
  - `approval.consumed`,
  - `worker.followup.dispatching`,
  - `worker.status.updated` with `dispatching_official_openclaw_read_only_worker`,
  - `worker.followup.completed`,
  - `worker.status.updated` with `completed_with_sourced_result`,
  - `evidence.status` with `captured_official_openclaw_multi_page_read_only_observation`,
  - `final.answer.created`,
  - `memory.retained`.
- Source pointer count: 8.
- Verified pages: 4 of 4.
- Discovery proof recorded:
  - portal search was available but not submitted,
  - 3 read-only document candidates,
  - 0 SBC/PDF candidates,
  - sections tried: benefits, spending, claims,
  - reachable sections included benefits, spending, claims, prior authorizations, documents, pharmacy, ID card, and network.
- Actions stayed read-only: browser start/current tab, same-site internal link opening, accessibility snapshots, CDP screenshots, local OCR, portal search affordance scan, document candidate discovery, portal verification, source pointer persistence, and multi-page verification.
- No payer contact, external message, credential entry, password manager use, form submission, account modification, or medical advice was performed by the system.

Verification commands:
- `node --check src/app/mvp.js`
- `npm run build`
- `node --test --test-name-pattern "user-friendly MVP app" src/tests/chat-ui-contract.test.mjs`
- Browser proof at `http://127.0.0.1:4173/mvp`

Verification result:
- `node --check src/app/mvp.js`: pass.
- `npm run build`: pass.
- Focused `/mvp` contract test: pass.
- Browser live proof: pass.
- Accidental aggregate test run result: 111 passed, 2 skipped, 2 failed.
  - Failed tests:
    - `src/tests/portal-scan-real.test.mjs`: expected at least 5 parsed claims from the current stored real Aetna page text.
    - `src/tests/real-aetna-structured.test.mjs`: expected at least 5 parsed claims from a real logged Aetna snapshot.
  - Assessment: these failures are the known real-data reproducibility gap described in the MVP hardening playbook. They are not caused by the `/mvp` proof-rendering patch. The next hardening pass should convert those real-data tests to explicit live-gated tests or stable sanitized fixtures.
  - Resolved by Phase 8S above with sanitized captured-format fixtures and temporary test databases.

What the user can try locally:
- Keep the local server and dedicated OpenClaw gateway running.
- Open `http://127.0.0.1:4173/mvp`.
- Click `Portal Ready`.
- Run `Benefits`.
- Approve `Approve + Run Read-Only` only after the dedicated OpenClaw browser is logged into the member portal.
- Confirm Current Answer, sequence rail, approval panel, discovery panel, runtime events, and source pointers update from the same LangGraph/OpenClaw run.

Known risks or gaps:
- `/mvp` is now usable for the approved Benefits path, but it still shows a compact engineering proof rather than a polished end-user chat experience.
- Real Aetna data tests were coupled to mutable local DB state at the end of Phase 8R; Phase 8S resolved this for the local regression suite.
- The current live flow can take long enough that the UI appears idle while the final graph resume completes; event streaming helps, but the next UI phase should add a clear long-running spinner/progress card.
- Phase 8S should improve section-specific structured extraction before adding document/PDF ingestion.

## MVP Hardening Reset - 2026-05-27

User instruction:
- Restart the project plan from the Cortex directions and the `workerprototype_openclaw MVP Hardening Playbook`.
- Renew the plan toward a smaller, complete, non-mocked MVP slice.

Files changed:
- `docs/CODEX_MVP_HARDENING_PLAYBOOK.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Outcome:
- Adopted the existing hardening playbook as the tracked project directive.
- Reframed the next implementation target from OpenClaw profile initialization to Phase 1 runtime collapse.
- Recorded that Cortex is project memory only and must not be treated as product memory.
- Recorded that product memory must use Hindsight, Zen, LangMem, Mem0, Zep/Graphiti, or an explicit equivalent retain/recall adapter.
- Recorded that `/api/chat`, `/api/langgraph/run`, and orchestrator endpoints must not remain divergent product runtimes.
- Preserved the rule that LangGraph is the healthcare workflow master and OpenClaw is the adaptive worker/tool/channel arm.

Proof:
- Read Cortex Codex skill state and project memory handoff notes.
- Read `AGENTS.md`.
- Read `brainstyworkers_ai_concierge_prompt.md`.
- Re-read current planning docs.
- Inspected current server/runtime split:
  - `src/server/server.mjs`
  - `src/concierge/engine.mjs`
  - `src/concierge/langgraphRunner.mjs`

Next implementation:
- Phase 1: collapse to one LangGraph product runtime.
- Move real browser/evidence observation into a LangGraph node.
- Ensure final answer, source-pointer storage, audit, and product-memory retain happen in one graph path.
- Add endpoint parity tests so public chat paths cannot bypass the healthcare journey graph.

Known risks:
- `engine.mjs` currently owns real browser observation while `langgraphRunner.mjs` owns formal graph orchestration; migration must preserve prior real portal extraction behavior.
- Current local memory harness is not product memory.
- Real portal tests still require authenticated user-controlled browser state.
- PHI screening must be expanded before any production claim.

## Current Status

Status: prompt audit complete; implementation blocked on interview answers.

Last updated: 2026-05-17

## Startup Audit

Files read:
- `docs/CODEX_START_PROMPT.md`
- `AGENTS.md`
- `brainstyworkers_ai_concierge_prompt.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`
- `docs/IMPLEMENTATION_QUESTIONNAIRE.md`

Outcome:
- The source prompt is sufficient for architecture direction.
- The source prompt is not sufficient for coding business behavior safely.
- Planning docs were updated with the audit, draft criteria, and initial decisions.
- No implementation code has been written.

## Proof

Commands run:
- `pwd`
- `rg --files`
- `wc -l docs/CODEX_START_PROMPT.md`
- `wc -l brainstyworkers_ai_concierge_prompt.md`
- `sed -n '1,120p' docs/CODEX_START_PROMPT.md`
- `sed -n '1,220p' brainstyworkers_ai_concierge_prompt.md`
- `sed -n '221,440p' brainstyworkers_ai_concierge_prompt.md`
- `sed -n '441,700p' brainstyworkers_ai_concierge_prompt.md`
- `sed -n '1,240p' docs/IMPLEMENTATION_PLAN.md`
- `sed -n '1,240p' docs/ACCEPTANCE_CRITERIA.md`
- `sed -n '1,240p' docs/DECISIONS.md`
- `sed -n '1,260p' docs/PROGRESS.md`
- `sed -n '1,260p' docs/IMPLEMENTATION_QUESTIONNAIRE.md`

Result:
- Startup prompt and source prompt were read.
- Existing planning docs were placeholders.
- Planning docs now contain the audit and next-step blockers.

## Remaining Risks

- First user role is not confirmed.
- First workflow is not confirmed.
- First channel is not confirmed.
- Slice 1 data source is not confirmed.
- Memory storage rules are not confirmed.
- Safety and human approval boundaries are not mapped to the first workflow.
- Local demo proof expectations are not confirmed.

## Next Step

Ask the product interview questions and wait for answers before implementing slice 1.

## Continuation Check - 2026-05-17

Files inspected:
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PROGRESS.md`
- `docs/IMPLEMENTATION_QUESTIONNAIRE.md`

Outcome:
- No interview answers were present in the current workspace.
- Implementation remains blocked by the startup prompt's interview-before-coding requirement.
- `docs/IMPLEMENTATION_QUESTIONNAIRE.md` was updated with a fast-path recommendation so the user can confirm defaults or override only the parts that matter.

Commands run:
- `rg --files`
- `sed -n '1,220p' docs/IMPLEMENTATION_PLAN.md`
- `sed -n '1,220p' docs/PROGRESS.md`
- `sed -n '1,220p' docs/IMPLEMENTATION_QUESTIONNAIRE.md`

## Pending Slice 1 Spec - 2026-05-17

Files changed:
- `docs/SLICE_1_PENDING_SPEC.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

Outcome:
- Added an implementation-ready slice 1 contract based on the fast-path defaults.
- Marked the contract as pending user confirmation.
- Implementation remains blocked until the user confirms defaults or provides overrides.

## Interview Answer Template - 2026-05-17

Files changed:
- `docs/INTERVIEW_ANSWERS.md`
- `docs/PROGRESS.md`

Outcome:
- Added a concise answer template with a one-line fast-path confirmation option and an override form.
- Implementation remains blocked until user confirmation is received.

Commands run:
- `rg --files docs`
- `sed -n '1,220p' docs/SLICE_1_PENDING_SPEC.md`
- `sed -n '1,360p' docs/PROGRESS.md`

## Slice 1 Build Checklist - 2026-05-17

Files changed:
- `docs/SLICE_1_PENDING_SPEC.md`
- `docs/PROGRESS.md`

Outcome:
- Added a planned local stack, file layout, implementation checklist, and non-goals for slice 1.
- No implementation code was created.
- Implementation remains blocked until user confirmation is received.

Commands run:
- `sed -n '1,260p' docs/SLICE_1_PENDING_SPEC.md`
- `sed -n '1,160p' docs/INTERVIEW_ANSWERS.md`
- `sed -n '1,420p' docs/PROGRESS.md`

## User Interview Answers And Revised Plan - 2026-05-17

Files changed:
- `docs/INTERVIEW_ANSWERS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/SLICE_1_PENDING_SPEC.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Outcome:
- Captured the user's requested first user, channel, workflow, data, memory, integration, safety, and proof requirements.
- Revised slice 1 from mocked eligibility demo to local real-user enrollment plus logged Chrome insurance portal navigation/extraction.
- Clarified that application database records are separate from long-term Hindsight memory.
- Clarified that credentials remain user-controlled and high-risk portal actions require explicit approval gates.
- Verified LangGraph, Hindsight, and Vercel storage scope from current primary docs before revising the plan.
- No implementation code was created.
- Implementation remains paused until the user approves the revised plan and provides missing portal details.

Primary docs consulted:
- LangChain LangGraph memory overview.
- LangChain LangGraph persistence docs.
- Hindsight LangGraph memory integration docs.
- Vercel Postgres and Storage docs.
- Vercel AI Gateway docs.

Still needed from user:
- None for planning. Slice 1 implementation is approved.

Follow-up cleanup:
- Replaced the old mocked-demo fast-path confirmation in `docs/INTERVIEW_ANSWERS.md` with the revised approval prompt and missing-detail checklist.

## Slice 1 Implementation Approval - 2026-05-17

Files changed:
- `docs/INTERVIEW_ANSWERS.md`
- `docs/SLICE_1_PENDING_SPEC.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

Outcome:
- Recorded user approval to implement revised slice 1.
- Portal/payer: `https://www.aetna.com/`.
- Screenshot policy: all allowed.
- Local PHI storage approval: all fields.
- Read-only extraction after login: approved.
- Website action approval: approved.
- Credential boundary remains: user handles passwords, passkeys, SSNs, and 2FA directly in Chrome.

## Slice 1 Implementation - 2026-05-17

Slice name:
- Real-user enrollment and Aetna portal depuration.

Files changed:
- `package.json`
- `src/app/index.html`
- `src/app/app.js`
- `src/app/styles.css`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/concierge/audit.mjs`
- `src/concierge/browserAutomation.mjs`
- `src/concierge/channelAdapter.mjs`
- `src/concierge/classifier.mjs`
- `src/concierge/database.mjs`
- `src/concierge/engine.mjs`
- `src/concierge/enrollment.mjs`
- `src/concierge/langgraphScope.mjs`
- `src/concierge/outputPolicy.mjs`
- `src/concierge/policy.mjs`
- `src/concierge/portalExtraction.mjs`
- `src/concierge/schema.mjs`
- `src/concierge/types.mjs`
- `src/tests/database.test.mjs`
- `src/tests/enrollment.test.mjs`
- `src/tests/policy.test.mjs`
- `src/tests/workflow.test.mjs`
- `docs/SLICE_1_PENDING_SPEC.md`
- `docs/PROGRESS.md`

Implemented:
- Local web chat and operator trace UI.
- Local Node API server.
- Local SQLite application database at `data/brainstyworkers.sqlite`.
- Enrollment for Marcelo Felix, `mocfelix@gmail.com`.
- Database tables for users, consents, portal accounts, sessions, messages, browser runs/actions, eligibility snapshots, benefit items, extraction artifacts, approval gates, and audit events.
- LangGraph-style thread IDs and documented split between thread state, store state, and deferred Hindsight memory.
- Input policy gates for credential handling, medical advice, and external/irreversible actions.
- Chrome DevTools Protocol attachment through a configurable remote debugger URL.
- Aetna page navigation/extraction proof through Chrome remote debugging on `http://127.0.0.1:9223`.
- Trace and audit output for enrollment, consent, browser run, extraction, eligibility snapshot, and response.

Verification commands:
- `node --version`
- `npm --version`
- `sqlite3 --version`
- `npm run build`
- `npm test`
- `npm start`
- `/usr/bin/curl -sS http://127.0.0.1:4173/api/health`
- `/usr/bin/curl -sS 'http://127.0.0.1:4173/api/browser/probe?remoteDebuggerUrl=http%3A%2F%2F127.0.0.1%3A9223'`
- `/usr/bin/curl -sS -X POST http://127.0.0.1:4173/api/chat -H 'content-type: application/json' -d '{"remoteDebuggerUrl":"http://127.0.0.1:9223","message":"Enroll me as Marcelo Felix, connect to my logged insurance website in Chrome, review my eligibility and benefits, and show the trace of what you found."}'`
- `sqlite3 data/brainstyworkers.sqlite "SELECT 'users', count(*) FROM users UNION ALL SELECT 'sessions', count(*) FROM sessions UNION ALL SELECT 'browser_runs', count(*) FROM browser_runs UNION ALL SELECT 'eligibility_snapshots', count(*) FROM eligibility_snapshots UNION ALL SELECT 'extraction_artifacts', count(*) FROM extraction_artifacts UNION ALL SELECT 'audit_events', count(*) FROM audit_events;"`

Results:
- Build passed.
- Tests passed: 7 passing, 0 failing.
- Health API returned all required database counts and LangGraph/Hindsight scope.
- Browser probe on `9223` connected to Chrome DevTools.
- Chat API enrolled Marcelo Felix, created records, attached to Chrome, extracted visible Aetna page text, detected `benefits` and `coverage` signals, stored an eligibility snapshot and benefit items, and returned a trace.
- In-app browser verification confirmed the local UI renders, sends the Slice 1 request, and shows trace fields including `extracted_visible_page`, `Health Insurance Plans | Aetna`, `benefits`, and `coverage`.
- SQLite proof after verification: `users=1`, `sessions=6`, `browser_runs=6`, `eligibility_snapshots=6`, `extraction_artifacts=2`, `audit_events=48`.

What the user can try locally:
- Open `http://127.0.0.1:4173`.
- Use the default member fields for Marcelo Felix and Aetna.
- Keep Chrome debugger set to `http://127.0.0.1:9223`.
- To extract authenticated member data, log into Aetna yourself in the Chrome window launched with remote debugging, then click `Run Slice 1` again.

Known risks or gaps:
- The verified extraction is from the public Aetna page because the user has not yet logged into Aetna in the remote-debugging Chrome profile during this implementation run.
- The app supports authenticated extraction from the logged Chrome tab once the user logs in, but real member PHI extraction remains unverified until that login happens.
- Vercel Postgres/Marketplace storage, production PHI controls, Hindsight long-term memory, and real Vercel AI Gateway routing remain deferred.
- The local database stores approved prototype data in plaintext SQLite; this is acceptable only for this local slice and not production PHI handling.

## Already-Open Aetna Chrome Test - 2026-05-17

User request:
- Launch the agent and use an already-open Aetna Chrome tab.

Files changed:
- `src/concierge/browserAutomation.mjs`
- `src/concierge/engine.mjs`
- `src/tests/workflow.test.mjs`
- `docs/PROGRESS.md`

Implemented for this test:
- Added a claimed-Chrome-tab bridge so the local agent can persist a visible-page snapshot from the Codex Chrome Extension path, not only from Chrome remote debugging.
- Added test coverage for persisting an already-open Aetna tab snapshot.

Verification commands/actions:
- Connected to the user's Chrome extension backend.
- Listed open Chrome tabs and found:
  - `Home - Aetna` at `https://health.aetna.com/`
  - Aetna login tabs
- Claimed the already-open `Home - Aetna` tab.
- Extracted visible authenticated page text from the claimed tab.
- Posted the claimed-tab snapshot to the local agent API.
- Ran `npm run build`.
- Ran `npm test`.

Results:
- Build passed.
- Tests passed: 8 passing, 0 failing.
- The claimed tab showed `Home - Aetna` at `https://health.aetna.com/`.
- The visible page text included `Welcome, Marcelo`.
- The visible page text included benefits/coverage/claims data, including:
  - Medical Coverage
  - Deductible - `$600`
  - `$558.72` spent
  - `$41.28` remaining
  - Out-of-Pocket Max - `$9,000`
  - `$1,476.98` spent
  - `$7,523.02` remaining
  - Claims links and prior authorization link
- The agent created a new local session and browser run with source `codex_chrome_extension_claimed_tab`.
- The agent stored an eligibility snapshot and benefit items with signals: `benefits`, `coverage`, `claims`.
- The agent response confirmed no payer API, no external message, and no medical advice.

Known risks or gaps:
- The current extractor stores broad visible page text. It works for proof, but a later slice should parse benefit fields into structured rows instead of keeping only signal categories and raw text.
- The local database is plaintext SQLite and approved only for this prototype slice.

## Slice 2 Structured Aetna Extraction And Review - 2026-05-17

User instruction:
- Continue with RALPH-style testing after each step.
- Do not use mocked data, mocked integrations, mocked APIs, mocked databases, or mocked Vercel interfaces.
- Tell the user before moving to real LangGraph or requesting APIs.

LangGraph/OpenClaw/API note:
- This slice did not add real LangGraph runtime packages.
- This slice did not require OpenAI API, LangGraph API, OpenClaw API, or Vercel API credentials.
- It used the existing Codex Chrome Extension to claim the already-open logged Aetna tab.
- It used the real local SQLite database and real extracted Aetna page text.

Files changed:
- `src/concierge/schema.mjs`
- `src/concierge/structuredExtraction.mjs`
- `src/concierge/portalExtraction.mjs`
- `src/concierge/engine.mjs`
- `src/concierge/outputPolicy.mjs`
- `src/server/server.mjs`
- `src/app/index.html`
- `src/app/app.js`
- `src/app/styles.css`
- `src/tests/real-aetna-structured.test.mjs`
- `docs/PROGRESS.md`

Implemented:
- New structured database tables:
  - `coverage_balances`
  - `claim_items`
  - `prior_authorizations`
  - `extraction_reviews`
- Structured parser for the real Aetna visible page text.
- Persisted structured extraction rows for:
  - Deductible
  - Out-of-pocket maximum
  - Recent claims
  - Prior authorization
- Added `pending_user_review` extraction review payloads.
- Added `/api/review/latest` to load the latest structured extraction from SQLite.
- Added a `Load Latest` review control in the local UI.
- Added review cards for coverage balances, recent claims, and prior authorizations.
- Added a real-data test that reads the actual logged Aetna extraction from `data/brainstyworkers.sqlite`.

RALPH loop 1:
- Requirements: parse real Aetna data into structured rows, not mock data.
- Architecture: add normalized SQLite tables and parser behind existing extraction workflow.
- Loop: implemented schema and structured extraction persistence.
- Prove: ran `npm run build` and `npm test`.
- Harden: build passed, but real-data test exposed a parser bug with claims.

Bug found:
- Aetna raw text in SQLite was sometimes stored as collapsed text instead of line-preserved text.
- The first claims parser expected line breaks and missed the five claims.

Fix:
- Updated the parser to support both line-preserved and collapsed real portal text.

RALPH loop 2:
- Requirements: prove structured parser against real logged Aetna data.
- Architecture: keep SQLite as the real database; no mocks.
- Loop: added `src/tests/real-aetna-structured.test.mjs`.
- Prove: `npm test` passed with 9 tests.
- Harden: the parser now handles both text shapes.

RALPH loop 3:
- Requirements: show structured data in the UI.
- Architecture: add `/api/review/latest` and a review panel backed by SQLite.
- Loop: added latest-review API and UI cards.
- Prove:
  - `npm run build` passed.
  - `npm test` passed: 9 passing, 0 failing.
  - Posted the already-open Aetna Chrome tab into the local agent.
  - `/api/review/latest` returned structured records from real SQLite data.
  - Browser UI verification confirmed status: `2 balances · 5 claims · 1 prior auths`.

Structured values extracted from the real logged Aetna page:
- Deductible:
  - total: `$600`
  - spent: `$558.72`
  - remaining: `$41.28`
- Out-of-pocket max:
  - total: `$9,000`
  - spent: `$1,476.98`
  - remaining: `$7,523.02`
- Claims:
  - Lamotrigine Tab 25mg, Rodrigo, May 12, 2026, `$3.81`
  - Private, Rodrigo, May 12, 2026, `$3.11`
  - Private, Rodrigo, Apr 15, 2026, `$8.92`
  - Horacio Groisman, Marcelo, Apr 14, 2026, `$55.00`
  - Private, Rodrigo, Apr 14, 2026, `$3.11`
- Prior authorization:
  - SOUTH MIAMI HOSPITAL INC, Mar 6, 2026, visible in portal

Verification commands/actions:
- `npm run build`
- `npm test`
- Claimed already-open Aetna Chrome tab through Codex Chrome Extension.
- Posted real Aetna tab snapshot to local `/api/chat`.
- `/usr/bin/curl -sS http://127.0.0.1:4173/api/review/latest`
- Browser UI verification of `Load Latest`.

Known risks or gaps:
- Structured extraction is still tailored to the current Aetna home dashboard text. Next slice should navigate to specific pages like Benefits & Plan Documents, Spending Tracker, Claims, and Prior Authorizations for deeper structured extraction.
- Review records are pending-review only; user approval/save/correction workflow is not implemented yet.
- Local SQLite remains plaintext and local-only.

## Slice 3 Multi-Page Aetna Portal Scan Attempt - 2026-05-17

User instruction:
- Go further after structured extraction.
- Continue using real integrations, real database, and RALPH proof.

LangGraph/OpenClaw/API note:
- This slice still did not add real LangGraph runtime packages.
- This slice did not need OpenAI, LangGraph, OpenClaw, or Vercel APIs.
- It continued using Codex auth through the Codex Chrome Extension for the already-open Chrome session.

Files changed:
- `src/concierge/schema.mjs`
- `src/concierge/portalScan.mjs`
- `src/concierge/engine.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `docs/PROGRESS.md`

Implemented before live-site blocker:
- Added `portal_page_snapshots` table to persist page-level portal scans.
- Added `persistPortalPageScan` for multi-page scans from already-open Chrome pages.
- Added `/api/portal-pages/latest` for page-scan review.
- Extended the engine to accept `portalPageSnapshots`.

RALPH loop:
- Requirements: navigate real Aetna pages and persist each page snapshot; no mocks.
- Architecture: keep using local SQLite and the existing Chrome Extension path.
- Loop: implemented multi-page scan persistence.
- Prove:
  - `npm run build` passed.
  - `npm test` passed: 9 passing, 0 failing.
  - Claimed the already-open Aetna tab and attempted to visit:
    - `https://health.aetna.com/`
    - `https://health.aetna.com/benefits/medical-plan-summary`
    - `https://health.aetna.com/spending/medical`
    - `https://health.aetna.com/manage/claims`
    - `https://health.aetna.com/manage/prior-authorizations`
- Harden:
  - Stopped when Aetna redirected the session to login.
  - Did not enter credentials, SSN, password, passkey, or 2FA.

Observed blocker:
- The Aetna tab redirected to `https://health.aetna.com/login`.
- The claims URL navigation reported `net::ERR_ABORTED`.
- Captured partial state showed the scan pages were on login / member login, not authenticated member data.

Next required user action:
- User must log back into Aetna in Chrome.
- After login, rerun the multi-page scan so the agent can persist real page snapshots for Benefits, Spending, Claims, and Prior Authorizations.

## Slice 3 Repair And Portal Proof UI - 2026-05-17

User instruction:
- Go further, keep testing after each step, and do not use mocked integration/API/database data.

LangGraph/OpenClaw/API note:
- No real LangGraph runtime was added.
- No OpenAI, LangGraph, OpenClaw, or Vercel API credentials were needed.
- Browser checks used the Codex Chrome Extension profile named `Marcelo`.
- Persistence used the real local SQLite database at `data/brainstyworkers.sqlite`.

Files changed:
- `src/concierge/engine.mjs`
- `src/tests/portal-scan-real.test.mjs`
- `src/app/index.html`
- `src/app/app.js`
- `src/app/styles.css`
- `docs/PROGRESS.md`

Implemented:
- Fixed the multi-page scanner call path in `runConciergeSlice`; the previous call shape would fail when `portalPageSnapshots` were submitted.
- Added a real-data regression test that reuses stored Aetna page text from the local SQLite database rather than fabricated portal data.
- Added a local UI `Portal Scan / Captured Page Proof` panel backed by `/api/portal-pages/latest`.
- Escaped third-party portal text before displaying extracted review fields or page snippets in the browser UI.

RALPH loop:
- Requirements: make the multi-page scan path callable and visible, without mock data.
- Architecture: keep using the existing local SQLite scan endpoint and local web UI.
- Loop: repaired engine call, added real-data test, added page-proof UI.
- Prove:
  - `npm run build` passed.
  - `npm test` passed: 10 passing, 0 failing.
  - `/api/health` returned the running local server and database counts.
  - `/api/portal-pages/latest` returned a real captured Aetna page from SQLite.
  - Browser verification on `http://127.0.0.1:4173/` loaded the page-proof panel and showed `1 captured page`.
- Harden:
  - UI now escapes portal-derived text before rendering.
  - Stopped at Aetna login tabs in real Chrome and did not enter credentials, SSN, passkey, password, or 2FA.

Live Chrome result:
- The actual Chrome extension profile was available.
- Open Aetna tabs were present, but all detected Aetna tabs were login pages.
- No authenticated Aetna `Home - Aetna` tab was currently available for deeper live scan.

Next required user action:
- Log into Aetna again in Chrome.
- Leave the authenticated Aetna home tab open.
- Then the next loop can claim that tab and run the real multi-page scan for Benefits, Spending, Claims, and Prior Authorizations.

## Live Aetna Data Capture And Parser Hardening - 2026-05-17

User instruction:
- Aetna is open again; get all necessary data and go.

LangGraph/OpenClaw/API note:
- No real LangGraph runtime was added.
- No OpenAI, LangGraph, OpenClaw, payer, or Vercel API was used.
- Browser access used the Codex Chrome Extension profile named `Marcelo`.
- Credentials, SSN, passkeys, passwords, and 2FA were not entered by Codex.

Files changed:
- `src/concierge/portalScan.mjs`
- `src/concierge/portalExtraction.mjs`
- `src/concierge/structuredExtraction.mjs`
- `src/tests/portal-scan-real.test.mjs`
- `src/tests/real-aetna-structured.test.mjs`
- `docs/PROGRESS.md`

Live browser capture:
- Found authenticated Aetna tab: `Home - Aetna`.
- Claimed a controllable Aetna page through the Chrome extension after opening a fresh Chrome window for the same profile.
- Captured and persisted a broad 13-page scan:
  - home
  - benefits plan documents / medical coverage
  - claims
  - five claim detail URLs
  - prior authorizations
  - prior authorization detail URL
  - ID cards
  - pharmacy
  - EOB
- Closed the Aetna site-experience overlay and reran a corrected 3-page scan for high-value rendered data:
  - `home_corrected`
  - `claims_corrected`
  - `prior_authorizations_corrected`

Bug found and fixed:
- The first live post hit stale server code, so the local server was restarted with the scanner call fix.
- The corrected page kinds were stored as page proof but not parsed into structured snapshots. Fixed `persistPortalPageScan` to recognize corrected page-kind variants.
- Full claims page parsing initially failed because the parser only supported the compact home dashboard format. Added parsing for the full claims page rows.
- `eligibility_snapshots.raw_text` was storing only a 4,000-character preview, truncating the full claims page. Fixed it to store full raw page text while keeping artifacts as previews.
- Older prior authorization tests were updated to target the historical SOUTH MIAMI snapshot because the current live prior authorization page says there are no prior authorization requests at this time.

Structured data persisted from the final corrected session:
- Coverage balances:
  - Deductible total `$600`, spent `$558.72`, remaining `$41.28`.
  - Out-of-pocket max total `$9,000`, spent `$1,476.98`, remaining `$7,523.02`.
- Claims:
  - 25 structured claim rows in the final corrected session:
    - 5 from the home dashboard.
    - 20 from the full claims page, page 1 of 69 claims.
- Prior authorizations:
  - Current live prior authorization page states there are no prior authorization requests at this time.
  - Earlier historical home snapshot with `SOUTH MIAMI HOSPITAL INC` remains in the database and test coverage.
- ID card page proof:
  - Latest `id_cards` snapshot includes plan name, group number, and payor ID fields.

Verification commands/actions:
- `npm run build`
- `npm test`
- `/usr/bin/curl -sS http://127.0.0.1:4173/api/health`
- Posted the 13-page live Aetna payload to `/api/chat`.
- Posted the corrected rendered Aetna payload to `/api/chat`.
- Queried SQLite for final-session page snapshots, coverage balances, claims, and ID card proof.
- Final tests passed: 12 passing, 0 failing.

Final proof highlights:
- Final corrected session id: `session_d0f56dbc-a4dd-4be7-a08b-8df7c0f058b2`.
- Final corrected session persisted 3 rendered page snapshots.
- Final corrected session structured 2 coverage balances and 25 claim rows.
- Global database counts after verification included:
  - `portal_page_snapshots=36`
  - `eligibility_snapshots=31`
  - `coverage_balances=28`
  - `claim_items=145`
  - `audit_events=211`

Known gaps:
- ID card fields are captured in page proof, but not yet normalized into their own structured table.
- Benefits plan documents, EOB, pharmacy, and claim details are captured as page snapshots, but only home and claims have mature structured parsers.
- The local SQLite database remains plaintext and suitable only for this approved local prototype.

## Stateful Session Management For LangChain Readiness - 2026-05-17

User instruction:
- Build professional user session management to allow LangChain stateful behavior.

LangGraph/OpenClaw/API note:
- No real LangGraph runtime package was installed.
- No OpenAI, LangGraph, OpenClaw, payer, or Vercel API was used.
- This slice creates a local state/checkpoint contract that maps to LangChain/LangGraph `configurable.thread_id` and `checkpoint_ns`.

Files changed:
- `src/concierge/schema.mjs`
- `src/concierge/database.mjs`
- `src/concierge/sessionManager.mjs`
- `src/concierge/enrollment.mjs`
- `src/concierge/engine.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/app/index.html`
- `src/app/app.js`
- `src/app/styles.css`
- `src/tests/enrollment.test.mjs`
- `src/tests/session-manager.test.mjs`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Implemented:
- Added professional session lifecycle fields to `sessions`:
  - `title`
  - `current_step`
  - `last_intent`
  - `state_version`
  - `metadata_json`
  - `last_active_at`
  - `expires_at`
  - `closed_at`
- Added managed session tables:
  - `session_state`
  - `session_checkpoints`
  - `session_events`
- Added SQLite migrations for existing local databases.
- Added `sessionManager.mjs` for:
  - create session
  - resume by `sessionId`
  - resume latest active session
  - checkpoint workflow state
  - list sessions
  - close sessions
  - expose LangChain-ready state with `thread_id` and `checkpoint_ns`
- Added workflow checkpoints at:
  - user message received
  - intent classified
  - response composed / portal scan completed
- Added API endpoints:
  - `GET /api/sessions?email=...`
  - `GET /api/sessions/:sessionId/state`
  - `POST /api/sessions/:sessionId/close`
- Updated `POST /api/chat` to accept:
  - `sessionId`
  - `resumeLatestSession`
  - `sessionTitle`
- Added UI controls:
  - Session ID input
  - Resume latest checkbox
  - Load Sessions
  - Load State
  - selectable session rows with state version and LangGraph thread id

Bug found and fixed:
- Real-data tests could hit a locked SQLite file while the local server was running. Added `.timeout 5000` to SQLite CLI calls.

RALPH proof:
- Requirements: durable stateful session contract for LangChain/LangGraph.
- Architecture: local SQLite session manager first, real LangGraph runtime deferred.
- Loop: schema, manager, engine integration, API, UI, tests.
- Prove:
  - `npm run build` passed.
  - `npm test` passed: 15 passing, 0 failing.
  - Restarted local server at `http://127.0.0.1:4173`.
  - `POST /api/chat` created a stateful session:
    - session id `session_33abcb0f-7a66-42e4-b42e-4a3a0bd006bf`
    - thread id `thread:user_b8a70e4b-8c69-44fc-ae88-5705b95964c3:32f8be24-6b1d-434f-a81a-0c2fde872b26`
    - current step `response_composed`
    - state version `4`
  - Second `POST /api/chat` with the same `sessionId` resumed the same thread and advanced state version to `7`.
  - `GET /api/sessions?email=mocfelix%40gmail.com&limit=3` returned active sessions with state versions.
  - `GET /api/sessions/session_33abcb0f-7a66-42e4-b42e-4a3a0bd006bf/state` returned state, checkpoints, and events.
  - SQLite showed checkpoint counts for the resumed session:
    - `user_message_received=2`
    - `intent_classified=2`
    - `response_composed=2`
  - Browser UI verification confirmed session controls render and list sessions.

Known gaps:
- This is LangChain/LangGraph-ready local state, not the real LangGraph runtime/checkpointer yet.
- Session expiry is stored but not enforced by a background cleanup job.
- Existing historical sessions only get `session_state` rows when resumed or touched by the new manager.

## Memory Harness, OpenClaw Arm, And Heartbeat Planner - 2026-05-17

User instruction:
- Decide and implement the integration harness for session/user data across LangChain/LangGraph, Hindsight-style memory, OpenClaw memory, and proactive heartbeat tasks.
- Evaluate Hindsight versus hook-style automation trigger.
- Keep current and past session context injected into new sessions/tasks, with pointers to where data lives in the database.
- Model a dedicated always-on OpenClaw arm with heartbeat context, last task, pending work, and scheduled jobs.

Architecture decision:
- Use both concepts, but sequence them:
  - Hook-style local memory harness now.
  - Real Hindsight/vector temporal recall later as an adapter behind the same `memory_items` and `context_packets` contract.
- The orchestrator/LangChain side consumes `context_packets`.
- The OpenClaw side consumes `openclaw_instances`, `agent_tasks`, `scheduled_jobs`, and `agent_outbox`.
- Heartbeat lives in the local harness for this slice, because real OpenClaw workers and WhatsApp/email adapters are not installed or approved.

External API note:
- No real Hindsight package/API was installed or called.
- No real LangGraph runtime package was installed or called in this slice.
- No OpenClaw external worker, WhatsApp, email, payer API, OpenAI API, or Vercel AI Gateway API was called.
- The local harness records tasks/outbox proposals only; it does not send external messages.

Files changed:
- `src/concierge/schema.mjs`
- `src/concierge/memoryHarness.mjs`
- `src/concierge/engine.mjs`
- `src/concierge/langgraphScope.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/app/index.html`
- `src/app/app.js`
- `src/app/styles.css`
- `src/tests/memory-harness.test.mjs`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

Implemented:
- Added durable local memory/agent tables:
  - `memory_items`
  - `context_packets`
  - `openclaw_instances`
  - `agent_tasks`
  - `scheduled_jobs`
  - `agent_outbox`
  - `memory_harness_runs`
- Added `memoryHarness.mjs` with:
  - `ensureOpenClawInstance`
  - `buildContextPacket`
  - `retainMemoryFromSession`
  - `planTaskFollowups`
  - `runUserHeartbeat`
  - `getMemoryContextForUser`
  - `listHarnessState`
- Integrated context injection before each chat run.
- Integrated memory retention after each chat run.
- Added claim-submitted follow-up planning:
  - blocked email check job twice daily until email integration is approved/configured.
  - blocked payer portal claim-status job until OpenClaw authenticated browser action is approved.
  - WhatsApp outbox proposal marked `pending_approval` and not sent.
- Added API endpoints:
  - `GET /api/memory/context?email=...`
  - `GET /api/memory/harness?email=...`
  - `GET /api/openclaw/instance?email=...`
  - `POST /api/memory/heartbeat`
  - `POST /api/memory/events`
- Added UI controls:
  - Memory Harness panel.
  - Load Harness.
  - Run Heartbeat.
  - Plan Claim Follow-up.

Bug found and fixed:
- Parallel real-data tests could race while creating the unique per-user OpenClaw instance.
- Fixed `ensureOpenClawInstance` to tolerate a concurrent insert and return the already-created instance.

RALPH proof:
- Requirements: cross-session context injection, memory retention, OpenClaw arm state, heartbeat tasks, scheduled follow-ups, and approval gates.
- Architecture: local hook harness now; Hindsight/OpenClaw/Vercel adapters later.
- Loop: schema, harness module, chat integration, API, UI, tests, browser verification.
- Prove:
  - `npm run build` passed.
  - `node --check src/concierge/memoryHarness.mjs` passed.
  - `node --check src/server/server.mjs` passed.
  - First `npm test` found the OpenClaw instance race.
  - After fix, `npm test` passed: 17 passing, 0 failing.
  - Restarted local server at `http://127.0.0.1:4173`.
  - `GET /api/health` returned new table counts, including:
    - `memory_items=27`
    - `context_packets=11`
    - `openclaw_instances=1`
    - `agent_tasks=4`
    - `scheduled_jobs=4`
    - `agent_outbox=2`
    - `memory_harness_runs=2`
  - `GET /api/memory/context?email=mocfelix%40gmail.com` returned a context packet with:
    - selected adapter: `hook_style_local_memory_harness`
    - OpenClaw role: `dedicated_user_arm_consuming_this_context_packet`
    - DB pointers to `eligibility_snapshots`, `claim_items`, `coverage_balances`, and `prior_authorizations`
  - `POST /api/memory/heartbeat` returned:
    - run type `openclaw_heartbeat`
    - status `completed`
    - no external adapter execution
  - Browser verification:
    - local UI title: `Brainstyworkers AI Concierge`
    - Memory Harness section present
    - Load Harness, Run Heartbeat, and Plan Claim Follow-up controls present
    - clicking Load Harness showed `4 tasks · 4 jobs · 27 memories`
    - console errors: none

Known gaps:
- Real Hindsight vector/temporal recall is not installed yet.
- Real LangGraph runtime/checkpointer is not installed yet.
- Real OpenClaw worker/channel execution is not installed yet.
- Email access, WhatsApp sending, and payer portal follow-up execution are recorded as blocked/pending approval, not executed.
- Scheduled jobs are stored and heartbeats can inspect them, but no OS/Vercel cron runner is installed yet.
- Production PHI encryption, retention deletion, audit immutability, and HIPAA controls remain future hardening.

## Prompt Contracts And Guardrail Hardening - 2026-05-17

User instruction:
- Verify the appropriateness of the orchestrator and OpenClaw prompts for a personalized dedicated healthcare concierge.
- Make sure prompt context and memory information create the right agent identity and guardrails.
- Avoid unrelated answers, prompt injection, unsafe memory instructions, and unsafe tool use.
- Proceed with the next implementation step.

Implemented:
- Added `src/concierge/promptContracts.mjs`.
- Added a versioned prompt contract bundle:
  - `orchestrator`
  - `openclaw_arm`
- The orchestrator prompt now defines:
  - Brainstyworkers healthcare insurance concierge identity.
  - Allowed healthcare insurance workflows.
  - Memory and portal data as untrusted context.
  - Source pointer requirements.
  - Refusal rules for unrelated requests and prompt injection.
  - Approval gates for external actions.
- The OpenClaw arm prompt now defines:
  - Dedicated execution arm for the user.
  - Allowed observation/navigation/extraction tasks.
  - No credential entry.
  - No submit/send/pay/cancel/change/authorize/file/appeal without exact approval.
  - Heartbeat jobs can propose next actions but cannot execute external adapters in the local harness.
- Context packets now include `promptBundle`.
- Added `GET /api/prompts/contract?email=...`.
- Hardened `evaluateInputPolicy` with:
  - prompt-injection detection.
  - healthcare insurance domain boundary.
  - untrusted text risk classification.
- Added refusal intents:
  - `refuse_prompt_injection`
  - `refuse_out_of_scope`
- Hardened memory retention:
  - prompt-injection or credential-like blocked requests are stored as `blocked_policy_event`.
  - unsafe blocked request text is not retained as reusable memory content.
- Hardened prompt rendering:
  - risky memory content is rendered as `[withheld unsafe memory content]`.

External API note:
- No real Hindsight package/API was installed or called.
- No real LangGraph runtime package was installed or called.
- No OpenClaw external worker, WhatsApp, email, payer API, OpenAI API, or Vercel AI Gateway API was called.

Files changed:
- `src/concierge/promptContracts.mjs`
- `src/concierge/policy.mjs`
- `src/concierge/classifier.mjs`
- `src/concierge/types.mjs`
- `src/concierge/memoryHarness.mjs`
- `src/concierge/engine.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/tests/policy.test.mjs`
- `src/tests/prompt-contracts.test.mjs`
- `src/tests/memory-harness.test.mjs`
- `src/tests/workflow.test.mjs`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

RALPH proof:
- Requirements: dedicated healthcare concierge identity, orchestrator/OpenClaw separation, prompt injection defense, unrelated-question refusal, and safe memory injection.
- Architecture: versioned prompt bundle inside each context packet before real runtime adapters.
- Loop: prompt module, policy/classifier hardening, engine refusal paths, API endpoint, tests.
- Prove:
  - `npm run build` passed.
  - `node --check src/concierge/promptContracts.mjs` passed.
  - `node --check src/concierge/policy.mjs` passed.
  - `node --check src/server/server.mjs` passed.
  - `npm test` passed: 23 passing, 0 failing.
  - Restarted local server at `http://127.0.0.1:4173`.
  - `GET /api/prompts/contract?email=mocfelix%40gmail.com` returned safety audit fields all true:
    - `hasUntrustedDataBoundary`
    - `hasDomainBoundary`
    - `hasCredentialBoundary`
    - `hasExternalActionBoundary`
    - `hasMedicalAdviceBoundary`
    - `hasSourcePointerRequirement`
  - `POST /api/chat` with a direct prompt-injection request returned:
    - intent `refuse_prompt_injection`
    - final response refusing to ignore/reveal/override instructions
    - memory type `blocked_policy_event`

Known gaps:
- These are local prompt contracts, not yet wired into a live LLM call through LangGraph.
- Compatibility with actual LangGraph message/state types and OpenClaw worker prompt injection still needs verification when those runtimes are connected.
- The local SQLite database may contain older test memory from before this hardening, but prompt rendering now treats risky memory as untrusted/withheld when detected.

## Runtime Adapter Compatibility - 2026-05-17

User instruction:
- Proceed after prompt-contract hardening.
- Verify whether the session and memory harness can feed LangChain, LangGraph, OpenClaw, and future Hindsight-style memory.
- Keep proof real and avoid claiming live external integration that has not been connected.

Implemented:
- Added `src/concierge/runtimeAdapters.mjs`.
- Added runtime mappings from one local context packet into:
  - LangChain thread config and messages.
  - LangGraph-style agent state.
  - OpenClaw channel-task envelope.
  - OpenClaw heartbeat envelope.
  - Future Hindsight retain candidates.
- Added compatibility validation for:
  - user/session identifiers.
  - prompt contract presence.
  - memory and portal data untrusted-context boundary.
  - OpenClaw credential and external-action approval boundary.
- Added `GET /api/runtime/compatibility?email=...&sessionId=...`.
- Added build-check coverage for the runtime compatibility bundle.
- Added automated tests in `src/tests/runtime-adapters.test.mjs`.

Files changed:
- `src/concierge/runtimeAdapters.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/tests/runtime-adapters.test.mjs`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

RALPH proof:
- Requirements: adapter-compatible state for LangChain/LangGraph, OpenClaw, and future Hindsight without live external execution.
- Architecture: versioned local adapter layer after context-packet creation and before real runtime installation.
- Loop: adapter module, API endpoint, build check, tests, local API verification.
- Prove:
  - `npm run build` passed.
  - `node --check src/concierge/runtimeAdapters.mjs` passed.
  - `node --check src/server/server.mjs` passed.
  - `npm test` passed: 26 passing, 0 failing.
  - Restarted local server at `http://127.0.0.1:4173`.
  - `GET /api/runtime/compatibility?email=mocfelix%40gmail.com&sessionId=session_8f7271f3-fc91-4a7c-8c42-f295afca6003` returned:
    - `compatible: true`
    - `warnings: []`
    - `issues: []`
    - LangChain `thread_id` mapped from the local session.
    - OpenClaw heartbeat envelope present.
    - Hindsight retain candidates present.

Known gaps:
- This is local runtime-contract compatibility, not live package/runtime verification.
- Real LangGraph, LangChain, OpenClaw, Hindsight, OpenAI API, and Vercel AI Gateway runtimes were not installed or called.
- Actual runtime compatibility should be verified against the selected packages/APIs before real execution.
- No external emails, WhatsApp messages, payer API calls, or irreversible portal actions were executed.

## Workflow Architecture, Skill Registry, And Temporal Memory Payloads - 2026-05-17

User instruction:
- Before live LangGraph/OpenClaw/Hindsight, verify the big plan for workflow routing, memory injections, workflow orchestration, tools, health user journeys, OpenClaw browser skill design, heartbeat prompting, reliable knowledge sources, and Hindsight-ready temporal payloads.
- Insert any missing cycles or slices.
- Improve the database schema and context/session/memory payloads.
- Use a uniform date/time type.

Implemented:
- Added `src/concierge/workflowArchitecture.mjs`.
- Added seeded runtime registries:
  - `workflow_definitions`
  - `tool_registry`
  - `workflow_tool_requirements`
  - `knowledge_sources`
  - `openclaw_skills`
- Added audit/runtime tables:
  - `workflow_runs`
  - `user_journey_events`
  - `memory_reflections`
- Added workflow architecture to context packets:
  - user profile completeness.
  - workflow readiness.
  - route candidates.
  - tool status and approval requirements.
  - knowledge sources.
  - OpenClaw skills and fallback strategies.
  - prior journey events and memory reflections.
- Added temporal memory fields:
  - `occurred_at`
  - `valid_from_at`
  - `valid_until_at`
  - `last_verified_at`
  - `temporal_metadata_json`
- Added session routing fields:
  - `active_workflow_key`
  - `journey_stage`
  - `last_context_packet_id`
- Added OpenClaw heartbeat prompt/context fields:
  - `last_context_packet_id`
  - `heartbeat_prompt_json`
- Updated prompt contracts so the orchestrator must route by memory, profile completeness, database pointers, prior journey context, tool readiness, and approval gates.
- Updated OpenClaw prompt contract so the execution arm receives skill registry, allowed tools, and browser fallback strategy.
- Updated runtime adapters so LangGraph/OpenClaw/Hindsight compatibility bundles carry workflow readiness, route candidates, knowledge sources, OpenClaw skills, and temporal memory metadata.
- Added tests in `src/tests/workflow-architecture.test.mjs`.

Workflow/user journey design now represented:
- `eligibility_benefits_navigation` -> `coverage_understanding`
- `claim_status_navigation` -> `service_use_claim`
- `prior_authorization_navigation` -> `service_authorization`
- `denial_appeal_preparation` -> `denial_resolution`
- `payer_portal_read_only_extraction` -> `evidence_capture`
- `document_or_trace_review` -> `evidence_review`
- `human_approval_escalation` -> `approval_gate`

OpenClaw skills now represented:
- `insurance_portal_browser`
  - primary path: user-authenticated Chrome through remote debugger/OpenClaw browser adapter.
  - fallback path: Chrome extension bridge, MCP browser adapter, manual user export.
  - stop condition: credentials or irreversible action required.
- `insurance_knowledge_research`
  - uses payer policy, CMS, code-set, and authoritative web sources.
  - requires source citations and no medical/coverage guarantees.
- `heartbeat_followup_planner`
  - inspects pending jobs and scheduled work.
  - proposes approval-gated next actions.
  - does not send external messages by default.

Authoritative source registry now represented:
- Aetna Clinical Policy Bulletins.
- Aetna member portal.
- CMS ICD-10 files.
- CMS Medicare Coverage Database.
- CMS CPT/HCPCS code list, with CPT licensing boundary noted.

Files changed:
- `src/concierge/workflowArchitecture.mjs`
- `src/concierge/schema.mjs`
- `src/concierge/database.mjs`
- `src/concierge/memoryHarness.mjs`
- `src/concierge/promptContracts.mjs`
- `src/concierge/runtimeAdapters.mjs`
- `src/concierge/engine.mjs`
- `src/server/build-check.mjs`
- `src/tests/workflow-architecture.test.mjs`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

Bug found and fixed:
- Parallel test/database initialization could race while applying new `ALTER TABLE` migrations to the shared local SQLite database.
- Fixed migrations to tolerate duplicate-column races after another initializer has already applied the same migration.

RALPH proof:
- Requirements: route workflows from explicit memory/profile/tool/journey state before live runtimes.
- Architecture: executable local registries and context-packet injection before LangGraph/OpenClaw/Hindsight installation.
- Loop: schema, registries, context packet, prompt contracts, runtime adapters, tests, API proof.
- Prove:
  - `node --check src/concierge/workflowArchitecture.mjs` passed.
  - `node --check src/concierge/memoryHarness.mjs` passed.
  - `node --check src/concierge/promptContracts.mjs` passed.
  - `node --check src/concierge/runtimeAdapters.mjs` passed.
  - `npm run build` passed.
  - First `npm test` found the parallel migration race.
  - After the migration fix, `npm test` passed: 29 passing, 0 failing.
  - Restarted local server at `http://127.0.0.1:4173`.
  - `GET /api/health` returned registry counts:
    - `workflow_definitions=7`
    - `tool_registry=15`
    - `workflow_tool_requirements=21`
    - `knowledge_sources=5`
    - `openclaw_skills=3`
    - `workflow_runs=6`
    - `user_journey_events=6`
  - `GET /api/runtime/compatibility?email=mocfelix%40gmail.com&sessionId=session_e6d0f18f-ca40-4550-b297-fdabe01b9678` returned:
    - `compatible: true`
    - `warnings: []`
    - `issues: []`
    - route candidates including eligibility, portal extraction, and claim status.
    - OpenClaw skills: heartbeat follow-up planner, insurance knowledge research, insurance portal browser.
    - knowledge sources: Aetna CPBs, Aetna member portal, CMS CPT/HCPCS, CMS ICD-10, CMS MCD.
    - Hindsight retain candidate count: 12.

Known gaps:
- This still does not install or execute real LangGraph/OpenClaw/Hindsight runtimes.
- OpenClaw skill files/directories have not yet been created in a real OpenClaw skill installation path.
- Hindsight recall/retain/reflect is represented in local payloads but not connected to a Hindsight API/store.
- External source retrieval is registry-backed; live source refresh must happen at task time.
- No external email, WhatsApp, payer API, form submission, appeal, authorization, payment, cancellation, or portal-changing action was executed.

## Live LangGraph Runtime Slice - 2026-05-17

User instruction:
- Proceed to the next step.
- Use OpenAI for LangChain agents through an environment/secret boundary.

Secret handling:
- The literal OpenAI API key was not written into source, docs, tests, package files, command lines, or progress logs.
- Added `.gitignore` rules for `.env`, `.env.*`, `node_modules`, and local SQLite files.
- Added `.env.example` with placeholder variables only:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL=gpt-5-mini`
- Added `src/concierge/secrets.mjs` to load `.env.local` if present and report only configured/not-configured plus model name.

Implemented:
- Installed official packages:
  - `@langchain/langgraph`
  - `@langchain/core`
  - `@langchain/openai`
- Added `src/concierge/langgraphRunner.mjs`.
- Built a real LangGraph `StateGraph` with `MemorySaver` checkpointer and nodes:
  - `input_policy`
  - `recall_context`
  - `workflow_router`
  - `workflow_executor`
  - `compose_response`
  - `maybe_model`
- The graph now:
  - evaluates policy.
  - injects the local context packet and runtime compatibility bundle.
  - routes using workflow registry candidates.
  - prepares an OpenClaw channel-task envelope.
  - writes audit proof and session checkpoint state.
  - retains memory after graph completion.
  - gates live OpenAI/ChatOpenAI model invocation behind per-request `useLiveModel`.
- Added `POST /api/langgraph/run`.
- Added tests in `src/tests/langgraph-runner.test.mjs`.

Files changed:
- `.gitignore`
- `.env.example`
- `package.json`
- `package-lock.json`
- `src/concierge/secrets.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/tests/langgraph-runner.test.mjs`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

RALPH proof:
- Requirements: real LangGraph orchestration, environment-secret boundary, OpenClaw envelope preparation, no external action.
- Architecture: LangGraph graph runs locally; OpenAI model node is optional and externally gated; OpenClaw remains envelope-only until the next slice.
- Loop: install packages, implement graph runner, add endpoint, add tests, restart server, call API.
- Prove:
  - `node --check src/concierge/langgraphRunner.mjs` passed.
  - `node --check src/server/server.mjs` passed.
  - `npm run build` passed.
  - `npm test` passed: 32 passing, 0 failing.
  - Restarted local server at `http://127.0.0.1:4173`.
  - `POST /api/langgraph/run` with `useLiveModel:false` returned:
    - version `2026-05-17.langgraph-runner.v1`
    - workflow `eligibility_benefits_navigation`
    - route reason `matched_user_input_memory_or_pointers`
    - OpenClaw envelope `openclaw_channel_task`
    - model invocation `not_requested`
    - proof steps: input policy, memory recall context, workflow router, workflow executor, response policy, model invocation.
    - trace recorded one workflow run and one journey event.

External model note:
- A minimal live OpenAI call was not executed because the safety reviewer blocked the request: sending locally retained context to OpenAI is a third-party disclosure risk and needs explicit disclosure approval.
- The graph is wired for `@langchain/openai` and reads `OPENAI_API_KEY` from the environment; it does not log or persist the secret.
- Superseded on 2026-05-18 by the PHI-allowed identifier-masked payload policy below.

Known gaps:
- Real OpenClaw worker/skill execution is still not implemented.
- Real Hindsight recall/retain/reflect is still not connected.
- Vercel AI Gateway is still not connected.
- Superseded: live OpenAI model invocation now uses PHI-allowed identifier-masked payloads after patient approval.

## Live OpenAI Test Policy And Payload Minimization - 2026-05-18

Superseded by `PHI-Allowed LLM Payload Policy - 2026-05-18` below. This section records the previous intermediate policy for audit history.

User instruction:
- Explain why the live OpenAI call was blocked.
- From now on, include real OpenAI model calls in test/proof flow.

Implemented:
- Added `src/concierge/modelPayloadPolicy.mjs`.
- Default live model payload now uses `minimized_non_phi_route_proof`.
- The minimized payload includes:
  - workflow key.
  - journey stage.
  - route score.
  - readiness/tool status.
  - safety check names.
- The minimized payload excludes:
  - user name/email.
  - raw user text.
  - portal text.
  - memory context.
  - database pointers.
  - screenshots/artifacts.
- Added expanded payload support only behind `allowExternalPhiDisclosure`.
- Updated LangGraph model node to record:
  - provider.
  - model.
  - invocation mode.
  - payload mode.
  - whether external PHI disclosure was allowed.
- Added `src/tests/model-payload-policy.test.mjs`.
- Added `src/tests/live-openai.test.mjs`.
- Added `npm run test:live`, which runs the real OpenAI smoke test only when `RUN_LIVE_OPENAI_TESTS=1` and `OPENAI_API_KEY` are present.

Why normal `npm test` does not force live OpenAI:
- Unit and local integration tests should remain deterministic and should not require network/API spend.
- Many existing tests intentionally use real local Aetna-derived records; sending all of those through OpenAI by default would disclose PHI-like context.
- The live proof lane solves this by making real model use explicit and payload-minimized.

Files changed:
- `src/concierge/modelPayloadPolicy.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/server/server.mjs`
- `src/tests/model-payload-policy.test.mjs`
- `src/tests/live-openai.test.mjs`
- `package.json`
- `docs/DECISIONS.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

RALPH proof:
- Requirements: real OpenAI proof available without accidental PHI disclosure.
- Architecture: minimized route-proof payload by default; expanded payload requires explicit disclosure flag.
- Loop: payload policy, LangGraph model node update, API flag, tests, docs.
- Prove:
  - `node --check src/concierge/modelPayloadPolicy.mjs` passed.
  - `node --check src/concierge/langgraphRunner.mjs` passed.
  - `npm run build` passed.
  - `npm test` passed: 35 passing, 1 skipped live OpenAI test, 0 failing.
  - The skipped test message explains: set `RUN_LIVE_OPENAI_TESTS=1` to run live OpenAI proof.

Known gaps:
- I did not force a live OpenAI call in the normal unit test suite.
- To run the live proof, use `npm run test:live` with `OPENAI_API_KEY` set in the environment.
- Expanded PHI/context model calls still need separate explicit approval.

## PHI-Allowed LLM Payload Policy - 2026-05-18

User instruction:
- Change scope so the system can exchange PHI in external LLM calls up to the final product after patient approval.
- Mask patient name, SSN, and subscription/member identifiers by database pointers.
- Do not block insurance data, portal data, clinical data, or other reasoning context from the LLM payload.
- Test whether the LLM call works.

Implemented:
- Replaced the previous minimized-default model policy with PHI-allowed identifier-masked payloads.
- Updated `src/concierge/modelPayloadPolicy.mjs` to version `2026-05-18.model-payload-policy.v2`.
- Default payload mode is now `phi_allowed_identifier_masked_reasoning`.
- Allowed in payload:
  - insurance details.
  - portal-derived context.
  - clinical/coding context such as CPT/ICD-10 references.
  - memory context.
  - open tasks.
  - scheduled jobs.
  - database pointers.
  - workflow architecture.
- Masked before payload leaves the app:
  - patient name.
  - patient email.
  - SSN.
  - member ID.
  - subscriber ID.
  - subscription number.
- Kept `route_proof_only` as an optional low-disclosure mode, but it is no longer the product default.
- Updated the LangGraph model prompt to explicitly allow patient-approved PHI-bearing insurance/clinical context while keeping direct identifiers masked.
- Updated orchestrator and OpenClaw prompt contracts so patient name/email are represented by user/database pointers in external LLM payloads.
- Updated live OpenAI test to require a real model call using PHI-allowed identifier-masked payload.
- Updated OpenAI base URL handling:
  - Project now ignores unrelated `OPENAI_BASE_URL` values.
  - Uses `BRAINSTY_OPENAI_BASE_URL` if set.
  - Defaults to `https://api.openai.com/v1`.

Files changed:
- `src/concierge/modelPayloadPolicy.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/concierge/promptContracts.mjs`
- `src/concierge/secrets.mjs`
- `src/server/server.mjs`
- `src/tests/model-payload-policy.test.mjs`
- `src/tests/live-openai.test.mjs`
- `.env.example`
- `package.json`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

Proof:
- `node --check src/concierge/modelPayloadPolicy.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/concierge/promptContracts.mjs` passed.
- `npm run build` passed.
- Focused local tests passed: 9 passing, 0 failing.
- Full `npm test` now includes the live OpenAI call and reached the official OpenAI API.

Live OpenAI test result:
- First attempt failed because the environment had `OPENAI_BASE_URL` pointing to `127.0.0.1:8000`.
- Fixed by forcing this project to use `https://api.openai.com/v1` unless `BRAINSTY_OPENAI_BASE_URL` is set.
- Second attempt reached OpenAI but failed with `401 Incorrect API key provided: local`.
- This means the current shell has `OPENAI_API_KEY=local`, not the real key.

How to complete live proof:
- Set the real key in the shell or ignored `.env.local`.
- Re-run `npm run test:live` or `npm test`.

Known gaps:
- Live model proof is implemented but currently blocked by an invalid local environment key.
- I did not write the user-provided key into files, docs, command lines, or logs.
- A future de-identification layer is still deferred, per user instruction.

## Local OpenAI Secret Install And Live Proof - 2026-05-18

User instruction:
- Add the provided OpenAI key to the environment and run the needed commands.

Implemented:
- Added the key only to ignored local `.env.local`.
- Kept `.env.local` out of source control through `.gitignore`.
- Set local model config to `OPENAI_MODEL=gpt-5-mini`.
- Set `BRAINSTY_OPENAI_BASE_URL=https://api.openai.com/v1` so unrelated local `OPENAI_BASE_URL` overrides do not redirect calls to a local server.
- Removed unsupported `temperature: 0` from the `ChatOpenAI` config because `gpt-5-mini` accepts only its default temperature.
- Increased live OpenAI timeout to 60 seconds.
- Changed `npm test` to run local tests first and the live OpenAI proof second, avoiding concurrent live-call timeout noise.

Proof:
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `npm run build` passed.
- `npm run test:live` passed: 1 passing, 0 failing.
- `npm test` passed sequentially:
  - local tests: 36 passing, 0 failing.
  - live OpenAI test: 1 passing, 0 failing.
- Restarted local server at `http://127.0.0.1:4173` using `.env.local`.

Notes:
- The API key was not printed in command output or docs.
- Because the key was pasted in chat, it should still be rotated when convenient.

## OpenClaw Insurance Portal Browser Skill Artifact - 2026-05-26

User instruction:
- Go sequentially to the next implementation step.
- In parallel, create a separate agent to prepare the final `brainstyworkers_ai_concierge_prompt.md` update and Cortex memory writes with separate long, short, semantic, and episodic layers.

Separate agent:
- Spawned a sidecar documentation/Cortex agent.
- The sidecar read the project prompt, planning docs, Cortex protocol, OpenClaw Cortex skill, and existing Cortex notes.
- The sidecar prepared the end-of-slice plan: append current-state sections to the source prompt, create/update working and episodic Cortex notes, and only write semantic memory if durable project facts changed.

Implementation:
- Added a repo-scoped OpenClaw skill artifact for `insurance_portal_browser`.
- Added `openclaw/skills/insurance-portal-browser/skill.json`.
- Added `openclaw/skills/insurance-portal-browser/SKILL.md`.
- Added `src/concierge/openclawSkillArtifacts.mjs`.
- Added API endpoints:
  - `GET /api/openclaw/skills`
  - `GET /api/openclaw/skills/:skillKey`
- Added local UI panel: `OpenClaw Skill / Insurance Portal Browser Contract`.
- Updated workflow registry status for `insurance_portal_browser` to `repo_artifact_ready_adapter_execution_gated`.
- Updated build-check validation so the skill artifact is required and must pass safety checks.
- Added automated tests in `src/tests/openclaw-skill-artifacts.test.mjs`.

Files changed:
- `openclaw/skills/insurance-portal-browser/skill.json`
- `openclaw/skills/insurance-portal-browser/SKILL.md`
- `src/concierge/openclawSkillArtifacts.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/app/index.html`
- `src/app/app.js`
- `src/app/styles.css`
- `src/concierge/workflowArchitecture.mjs`
- `src/tests/openclaw-skill-artifacts.test.mjs`
- `src/tests/workflow-architecture.test.mjs`
- `package.json`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

RALPH proof:
- Requirements: create the next concrete OpenClaw integration artifact without executing real high-risk browser actions.
- Architecture: repo-scoped skill artifact and validator first; production OpenClaw worker install/execution remains gated.
- Loop: add manifest, skill instructions, validator, API, UI panel, build check, and tests.
- Prove:
  - `npm run build` passed.
  - `node --check src/concierge/openclawSkillArtifacts.mjs` passed.
  - `node --check src/server/server.mjs` passed.
  - `npm run test:local` passed: 38 passing, 0 failing.
  - `GET /api/openclaw/skills` returned one artifact, `insurance_portal_browser`, with `valid=true`.
  - `GET /api/health` returned `openclaw_skills=3` and OpenAI configured with model `gpt-5-mini`.
  - Browser verification on `http://127.0.0.1:4173` confirmed:
    - OpenClaw skill panel present.
    - Load Skills button present.
    - `Insurance Portal Browser` loaded.
    - validation status showed valid.
    - credential boundary showed `user_only`.
    - fallback chain included `manual_user_export`.

Known gaps:
- This does not install the skill into a user-level or production OpenClaw runtime path.
- This does not execute a real OpenClaw browser worker.
- Browser actions, payer contact, external sends, form submission, record changes, prior authorization submission, denial appeal submission, and medical advice remain approval-gated or disallowed.
- Live OpenAI proof was not part of this slice. A prior check in this run showed the current shell still had `OPENAI_API_KEY=local`; restore the real ignored `.env.local` key before running `npm run test:live`.

## OpenClaw Skill Envelope Validator And Proposal Gate - 2026-05-26

User instruction:
- Implement the next slice as a proposal-only OpenClaw bridge.
- Validate the existing LangGraph/OpenClaw envelope against the repo-scoped `insurance_portal_browser` skill artifact.
- Record a pending approval proposal and expose proof in API/UI.
- Keep real OpenClaw worker execution and the user's personal OpenClaw install untouched.

Separate agent:
- Spawned sidecar documentation/Cortex agent `019e662e-4d3b-76b3-a09d-7300d4e513e5`.
- The sidecar inspected the project prompt/docs and Cortex memory protocol and returned patch-ready documentation and Cortex layer guidance.
- The sidecar did not edit source, docs, or Cortex directly.

Implementation:
- Added `src/concierge/openclawSkillInvocation.mjs`.
- The validator checks envelope type, required skill inputs, allowed workflows, approval policy, blocked actions, fallback path, stop conditions, and required output contract.
- LangGraph now validates prepared OpenClaw envelopes and records `openclaw_skill_invocation_proposal` tasks after graph execution.
- Context packets and OpenClaw envelopes now include the active `portalAccount`/`portal_url` so the skill receives required portal input without reading user-level OpenClaw config.
- Added `POST /api/openclaw/skills/insurance_portal_browser/validate-envelope`.
- Added a UI `Validate Envelope` action that shows validation status, approval gates, fallback path, stop conditions, proposal task id, audit event id, and `Actions taken: none`.
- Added local tests for validator behavior, blocked action detection, proposal recording, LangGraph integration, and API proof.

Files changed:
- `src/concierge/openclawSkillInvocation.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/concierge/memoryHarness.mjs`
- `src/concierge/runtimeAdapters.mjs`
- `src/server/server.mjs`
- `src/app/index.html`
- `src/app/app.js`
- `src/tests/openclaw-skill-invocation.test.mjs`
- `src/tests/openclaw-api.test.mjs`
- `src/tests/langgraph-runner.test.mjs`
- `package.json`
- `brainstyworkers_ai_concierge_prompt.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

RALPH proof:
- Requirements: proposal-only OpenClaw bridge using repo-scoped skill artifact.
- Architecture: validate and record local approval proposal first; real OpenClaw worker install/execution remains gated.
- Loop: added validator, graph integration, API route, UI proof, and automated tests.
- Prove:
  - `node --check src/concierge/openclawSkillInvocation.mjs` passed.
  - `node --check src/concierge/langgraphRunner.mjs` passed.
  - `node --check src/server/server.mjs` passed.
  - `node --check src/app/app.js` passed.
  - Focused validator/LangGraph/API tests passed: 9 passing, 0 failing.
  - `npm run build` passed.
  - `npm run test:local` passed: 44 passing, 0 failing.
  - API proof for `POST /api/openclaw/skills/insurance_portal_browser/validate-envelope` returned:
    - `status=validated_proposal_not_executed`
    - `valid=true`
    - `executionMode=proposal_only`
    - `taskType=openclaw_skill_invocation_proposal`
    - `taskStatus=pending_approval`
    - `auditEvent=openclaw_skill_invocation_proposed`
    - fallback path includes `manual_user_export`
    - `actionsTaken=[]`
  - Browser proof on `http://127.0.0.1:4173/` confirmed the UI shows:
    - `validated_proposal_not_executed · task recorded`
    - `proposal_only · valid`
    - workflow `eligibility_benefits_navigation`
    - approval gates including `real_openclaw_worker_execution` and `credential_entry:user_only`
    - fallback path `browser_remote_debugger > chrome_extension_bridge > mcp_browser_adapter > manual_user_export`
    - stop conditions beginning with `credentials_or_irreversible_action_required`
    - `Issues: none`
    - proposal task and audit event ids
    - `Actions taken: none`

Known gaps:
- This still does not install or execute the real OpenClaw engine.
- This does not use the machine-wide personal OpenClaw skills/config.
- No credentials, payer contact, external messages, form submissions, record changes, prior authorization submissions, denial appeal submissions, or medical advice occurred.
- Live OpenAI proof was not needed because this slice did not change model payload behavior.

## OpenClaw Official Profile Alignment - 2026-05-26

User instruction:
- Verify whether a dedicated official OpenClaw profile is possible using the already installed OpenClaw.
- Complete the contract-alignment steps before the next implementation: map the current skill contract, define the profile/workspace path, decide the adapter boundary, preserve the validator gate, and document the decision.

Verification:
- `command -v openclaw` resolved to `/opt/homebrew/bin/openclaw`.
- `openclaw --version` returned `OpenClaw 2026.5.4 (325df3e)`.
- `openclaw --help` showed `--profile <name>` isolates state/config under `~/.openclaw-<name>`.
- `openclaw --profile brainstyworkers config file` resolved to `~/.openclaw-brainstyworkers/openclaw.json`.
- `openclaw --profile brainstyworkers config validate` reported that the config file does not exist, proving the dedicated profile has not been initialized yet.
- Official docs confirmed OpenClaw profiles isolate state, agents manage isolated workspaces/auth/routing, and local skill installs expect a directory containing `SKILL.md`.

Implementation:
- Added `docs/OPENCLAW_RUNTIME_ALIGNMENT.md`.
- Documented the selected runtime path: installed official OpenClaw CLI plus `--profile brainstyworkers`.
- Defined the recommended profile state/config directory, agent id, workspace path, local skill source, and skill install target.
- Mapped the repo `insurance_portal_browser` artifact to official OpenClaw local skill expectations.
- Reframed the existing proposal validator as the required pre-execution gate, not a replacement for the official OpenClaw runtime.
- Recorded the architecture decision in `docs/DECISIONS.md`.
- Updated `docs/IMPLEMENTATION_PLAN.md` and `docs/ACCEPTANCE_CRITERIA.md` with the profile/workspace contract.

Files changed:
- `docs/OPENCLAW_RUNTIME_ALIGNMENT.md`
- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

RALPH proof:
- Requirements: align the next OpenClaw step with the official installed stack and protect the personal OpenClaw profile.
- Architecture: use `openclaw --profile brainstyworkers` with dedicated state/config/workspace/skill install target.
- Loop: documented contract mapping, adapter boundary, and gate preservation.
- Prove:
  - Local CLI proof passed for binary path, version, profile flag, and dedicated config path.
  - Official docs verified profile isolation, agent workspace isolation, and local skill install requirements.
  - No OpenClaw profile initialization, skill install, worker execution, browser action, credential handling, payer contact, external message, form submission, or medical advice occurred.

Known gaps:
- The `brainstyworkers` OpenClaw profile is selected but not initialized.
- The dedicated agent/workspace and official skill install are the next implementation slice.
- The local app still has no real OpenClaw worker adapter invocation path.

## LangGraph-Owned OpenClaw Worker Contract - 2026-05-26

User instruction:
- Revisit all necessary harnesses and correct the project direction before going further.
- Keep LangChain/LangGraph as the workflow master.
- Prepare OpenClaw workers as deterministic jobs rather than letting OpenClaw invent workflows or parallel agents on its own.

Implementation:
- Added `src/concierge/openclawWorkerContract.mjs`.
- The new contract creates stable OpenClaw worker job ids and correlation ids.
- The job contract targets the dedicated official OpenClaw profile path: `openclaw --profile brainstyworkers`, agent `brainstyworkers-insurance-browser`, workspace `~/.openclaw-brainstyworkers/workspace-brainstyworkers`.
- The job contract records required inputs, approval scope, allowed work, approval gates, fallback path, stop conditions, expected result schema, and risks/blockers.
- The job contract sets deterministic controls so OpenClaw cannot choose workflows, create subtasks, retain memory, contact payers, send messages, submit forms, enter credentials, or provide medical advice.
- The worker plan includes LangGraph-owned fan-out and fan-in rules.
- LangGraph now attaches `openclaw_worker_plan` to the state after validating the skill envelope.
- Proposal metadata and audit events now include worker plan id and worker job ids.
- The API response and UI proposal panel now show the worker plan, worker jobs, and fan-out/fan-in status.

Files changed:
- `src/concierge/openclawWorkerContract.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/concierge/openclawSkillInvocation.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/app/app.js`
- `src/tests/openclaw-worker-contract.test.mjs`
- `src/tests/langgraph-runner.test.mjs`
- `src/tests/openclaw-api.test.mjs`
- `package.json`
- `brainstyworkers_ai_concierge_prompt.md`
- `docs/OPENCLAW_RUNTIME_ALIGNMENT.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Known gaps:
- The official OpenClaw profile still is not initialized.
- The worker plan is not dispatched.
- No real OpenClaw browser worker, payer contact, external message, form submission, record change, credential handling, or medical advice occurred.

RALPH proof:
- Requirements: correct the harness so LangGraph masters workflow/job planning before OpenClaw execution.
- Architecture: added a deterministic worker job/result contract and kept OpenClaw as an assigned adaptive worker.
- Loop: wired worker plans into LangGraph state, proposal metadata, API response, UI panel, build check, and tests.
- Prove:
  - `node --check src/concierge/openclawWorkerContract.mjs` passed.
  - `node --check src/concierge/langgraphRunner.mjs` passed.
  - `node --check src/server/build-check.mjs` passed.
  - `node --check src/app/app.js` passed.
  - Focused OpenClaw/LangGraph/API tests passed: 13 passing, 0 failing.
  - `npm run build` passed.
  - `npm run test:local` passed: 48 passing, 0 failing.
  - API proof for `POST /api/openclaw/skills/insurance_portal_browser/validate-envelope` returned:
    - `status=validated_proposal_not_executed`
    - `executionMode=proposal_only`
    - `workerPlan.owner=langgraph`
    - `workerPlan.dispatchStatus=not_dispatched`
    - `workerPlan.workerJobs[0].worker.agentId=brainstyworkers-insurance-browser`
    - `workerPlan.workerJobs[0].worker.profile=brainstyworkers`
    - `workerPlan.workerJobs[0].deterministicControls.workerMayChooseWorkflow=false`
    - `workerPlan.workerJobs[0].deterministicControls.workerMayCreateSubtasks=false`
    - `actionsTaken=[]`

## Real LangGraph And Live GPT Orchestrator Webapp - 2026-05-27

User instruction:
- Do not mock.
- Test multiple real orchestrator flow cases using real LangChain/LangGraph and a real GPT API model call.
- Build the webapp surface to authenticate the planned user, start a session, run chat through LangGraph, show workflow/journey decisions, and show OpenClaw jobs to be contracted.

Implementation:
- Added `src/concierge/orchestratorDemo.mjs`.
- Added real orchestrator endpoints:
  - `POST /api/orchestrator/auth-start`
  - `POST /api/orchestrator/chat`
  - `POST /api/orchestrator/flow-tests`
- The orchestrator endpoints now require live model execution by default.
- Added `src/tests/orchestrator-live.test.mjs` and `npm run test:orchestrator:live`.
- Added UI controls for planned-user auth, real GPT chat orchestration, and all-flow orchestration tests.
- The webapp now shows workflow, journey stage, policy checks, decision points, model invocation mode, OpenClaw worker plan status, and worker jobs to contract.
- Fixed the local env loader so placeholder `OPENAI_API_KEY=local` cannot shadow a real ignored local key.
- Fixed route scoring so current user input dominates old memory.
- Fixed approval-gate routing so explicit send/submit/contact requests route to `human_approval_escalation`.
- Refined external-action policy so internal denial appeal preparation is not treated as filing an appeal.

Real flow cases tested:
- `eligibility_benefits_navigation`
- `claim_status_navigation`
- `prior_authorization_navigation`
- `denial_appeal_preparation`
- `payer_portal_read_only_extraction`
- `document_or_trace_review`
- `human_approval_escalation`

Files changed:
- `src/concierge/orchestratorDemo.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/concierge/modelPayloadPolicy.mjs`
- `src/concierge/policy.mjs`
- `src/concierge/secrets.mjs`
- `src/concierge/workflowArchitecture.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/app/index.html`
- `src/app/app.js`
- `src/app/styles.css`
- `src/tests/orchestrator-live.test.mjs`
- `src/tests/live-openai.test.mjs`
- `package.json`
- `docs/PROGRESS.md`

RALPH proof:
- Requirements: real LangGraph orchestration, real planned-user session/auth, real GPT model calls, all workflow journeys, and OpenClaw worker job contracts without dispatching external actions.
- Architecture: LangGraph owns auth/session/workflow/memory/routing/decision points and creates OpenClaw job contracts; GPT reviews the route proof and worker plan through the live model node.
- Loop: implemented API, UI, live test, routing corrections, and model-secret loader fix.
- Prove:
  - `node --check src/concierge/orchestratorDemo.mjs` passed.
  - `node --check src/concierge/modelPayloadPolicy.mjs` passed.
  - `node --check src/server/server.mjs` passed.
  - `node --check src/app/app.js` passed.
  - `npm run build` passed.
  - `npm run test:local` passed: 48 passing, 0 failing.
  - `npm run test:live` passed with a real OpenAI call.
  - `npm run test:orchestrator:live` passed with 7 real LangGraph runs and 7 real OpenAI model calls.
  - Webapp API proof through `POST /api/orchestrator/flow-tests` returned:
    - `openAI.configured=true`
    - `openAI.model=gpt-5-mini`
    - `aggregate.total=7`
    - `aggregate.matched=7`
    - `aggregate.pendingApproval=7`
    - `aggregate.pendingIntegration=0`
    - `aggregate.notDispatched=true`
    - `aggregate.actionsTaken=[]`
    - each case returned `modelMode=openai_chatopenai_invoked`
    - each case returned one OpenClaw worker job with `workerDispatch=not_dispatched`

Known gaps:
- The real official OpenClaw profile/agent is still not initialized or dispatched.
- OpenClaw worker jobs are real contracts but not real worker executions yet.
- Browser UI automation proof could not be completed with Playwright because the local Playwright module is not installed in this project environment; API proof and server proof passed.
- No payer contact, external message, form submission, record change, credential handling, or medical advice occurred.

## Phase 1 MVP Hardening: Single LangGraph Product Runtime - 2026-05-27

User direction:
- Restart from the MVP hardening playbook.
- Stop expanding breadth and implement the next ordered slice.
- Collapse product paths so LangGraph is the healthcare workflow master.

Implementation:
- Routed `POST /api/chat` through `runLangGraphOrchestration` instead of the legacy `runConciergeSlice` engine.
- Added a LangGraph evidence-observation node that can:
  - persist claimed read-only browser snapshots.
  - run the existing Chrome/CDP read-only extraction path.
  - persist portal page scans.
  - create eligibility snapshots only when evidence is actually captured.
  - return a blocked/no-authenticated-evidence state when the browser path is unavailable.
- Added graph-owned conversation persistence for user and assistant messages.
- Added graph proof fields for `graph_trace_id`, evidence observation status, browser result, eligibility result, portal scan, and source pointers.
- Reset per-run LangGraph state channels so repeated calls on the same thread do not reuse stale final responses or source pointers.
- Kept OpenClaw execution proposal-only: worker contracts are still prepared and validated, but not dispatched.

Files changed:
- `src/concierge/langgraphRunner.mjs`
- `src/server/server.mjs`
- `src/tests/langgraph-runner.test.mjs`
- `src/tests/runtime-collapse.test.mjs`
- `package.json`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Proof:
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --test src/tests/langgraph-runner.test.mjs src/tests/runtime-collapse.test.mjs src/tests/openclaw-api.test.mjs` passed: 6 passing, 0 failing.
- `npm run build` passed.
- `npm run test:local` passed: 50 passing, 0 failing.
- Local API smoke proof against the refreshed dev server at `http://127.0.0.1:4173/api/chat` returned:
  - `runtime=2026-05-17.langgraph-runner.v1`
  - `workflow=eligibility_benefits_navigation`
  - `evidenceStatus=not_requested`
  - `proposalStatus=pending_approval`
  - `actionsTaken=[]`
- In-app browser proof loaded `http://127.0.0.1:4173/` with page title `Brainstyworkers AI Concierge` and visible LangGraph/OpenClaw UI text.
- Added browser-visible Phase 4 panel with `Run Proof Gate`.
- In-app browser clicked `Run Proof Gate`; result displayed:
  - proposal `pending_approval`
  - approval `approved`
  - resume `approved_consumed`
  - evidence `blocked_live_portal_verification_failed`
  - reason `BRAINSTY_PORTAL_LIVE=1 is required before live portal proof can create healthcare evidence.`
  - evidence actions `none`
  - source pointers `0`
  - eligibility snapshots `0`
  - latest browser run `blocked_live_portal_verification_failed`
  - OpenClaw actions `none`

What this proves:
- `/api/chat` and `/api/langgraph/run` now share the LangGraph product runtime.
- Browser-capable evidence observation is now inside the graph path.
- Source-pointer behavior is graph-owned.
- Public chat endpoints cannot bypass the healthcare journey graph in the tested local API path.

Known gaps at the end of Phase 1:
- Phase 2 was still needed at this point: routing remained mostly deterministic/keyword-scored and needed to become structured classifier-driven.
- Phase 3 was still needed: OpenClaw proposal-only remained a wall until approval-resume-dispatch-result-ingest exists.
- Phase 4 was still needed: live authenticated portal capture needed explicit live flags and loud failure without false evidence.
- Phase 5 was still needed: product memory was still the local adapter seam, not Hindsight/Zen/LangMem/Mem0/Zep/Graphiti.
- Phase 6 was still needed: PHI payload capture/assertions, transactional DB hardening, and hash-chained audit remained open.

## Phase 2 MVP Hardening: Structured Healthcare Routing - 2026-05-27

User direction:
- Continue to the next ordered MVP hardening phase.
- Make routing real enough that natural healthcare phrasing does not depend on literal workflow keywords.

Implementation:
- Added `src/concierge/structuredIntentClassifier.mjs`.
- The classifier returns strict JSON:
  - `intent`
  - `workflow`
  - `confidence`
  - `requiredEvidence`
  - `missingEvidence`
  - `refusalOrEscalationFlag`
  - `rationale`
- Wired the classifier into `runLangGraphOrchestration` between context recall and workflow routing.
- Changed the workflow router to route from `structured_intent.workflow`.
- Kept deterministic safety refusals before workflow execution.
- Expanded healthcare-domain policy coverage so denial/appeal paraphrases such as "they said no and I want to fight it" are not incorrectly refused as unrelated.

Files changed:
- `src/concierge/structuredIntentClassifier.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/concierge/policy.mjs`
- `src/tests/structured-intent-classifier.test.mjs`
- `src/tests/langgraph-runner.test.mjs`
- `package.json`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Proof:
- `node --check src/concierge/structuredIntentClassifier.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/concierge/policy.mjs` passed.
- `node --test src/tests/structured-intent-classifier.test.mjs src/tests/langgraph-runner.test.mjs` passed: 11 passing, 0 failing.
- `npm run build` passed.
- `npm run test:local` passed: 57 passing, 0 failing.
- Local API smoke proof against the refreshed dev server at `http://127.0.0.1:4173/api/chat` routed all four natural-language cases through `routeReason=structured_intent_classifier` with `actionsTaken=[]`.
- In-app browser proof loaded `http://127.0.0.1:4173/` with page title `Brainstyworkers AI Concierge` and visible LangGraph/OpenClaw UI text.

Hard routing cases now covered:
- "My doctor wants approval for an MRI next month" -> `prior_authorization_navigation`.
- "Why didn't insurance pay my last visit?" -> `claim_status_navigation`.
- "They said no and I want to fight it" -> `denial_appeal_preparation`.
- "Do I still owe anything before insurance starts paying?" -> `eligibility_benefits_navigation`.
- "Can you log in and type my password?" -> credential-entry refusal before workflow execution.

What this proves:
- LangGraph routes from structured classifier output, not the workflow registry score order alone.
- Tests fail if the graph ignores the structured classifier workflow.
- The classifier contract is deterministic and can later be backed by an LLM or hybrid classifier without changing the graph routing shape.

Known gaps at the end of Phase 2:
- Phase 3 was still needed at this point: OpenClaw proposal-only remained a wall until approval-resume-dispatch-result-ingest exists.
- Phase 4 was still needed: live authenticated portal capture needed explicit live flags and loud failure without false evidence.
- Phase 5 was still needed: product memory was still the local adapter seam, not Hindsight/Zen/LangMem/Mem0/Zep/Graphiti.
- Phase 6 was still needed: PHI payload capture/assertions, transactional DB hardening, and hash-chained audit remained open.

## Phase 3 MVP Hardening: Approval Resume For Read-Only Observation - 2026-05-27

User direction:
- Continue to the next ordered MVP hardening phase.
- Turn proposal-only into a real approval/resume gate for read-only observation.

Implementation:
- Added `src/concierge/approvalResume.mjs`.
- Added `POST /api/orchestrator/approve`.
- Approval records bind:
  - task ID
  - session ID
  - user ID
  - workflow
  - approval scope
  - allowed action
  - expiration
- The only supported MVP approval scope/action is `read_only_observation`.
- LangGraph now refuses evidence observation unless a valid approval token and proposal task ID are provided.
- Valid approval tokens are consumed by the next graph run before evidence capture.
- Expired, denied, missing, mismatched, or already-consumed approvals keep `actionsTaken=[]`.
- Browser/evidence capture remains read-only and still does not dispatch a real OpenClaw worker.

Files changed:
- `src/concierge/approvalResume.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/server/server.mjs`
- `src/tests/approval-resume.test.mjs`
- `src/tests/langgraph-runner.test.mjs`
- `package.json`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Proof:
- `node --check src/concierge/approvalResume.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --test src/tests/approval-resume.test.mjs src/tests/langgraph-runner.test.mjs` passed: 9 passing, 0 failing.
- `npm run build` passed.
- `npm run test:local` passed: 60 passing, 0 failing.
- Local API smoke proof against the refreshed dev server completed proposal -> approval -> graph resume:
  - proposal task status `pending_approval`
  - approval status `approved`
  - approval `actionsTaken=[]`
  - resume approval status `approved_consumed`
  - evidence status `captured_visible_page`
  - evidence action `read_only_visible_text_extracted`
  - source pointer table `eligibility_snapshots`
  - OpenClaw validation `actionsTaken=[]`
- In-app browser proof loaded `http://127.0.0.1:4173/` with page title `Brainstyworkers AI Concierge` and visible LangGraph/OpenClaw UI text.

What this proves:
- Without approval, graph evidence observation does not run and creates no eligibility snapshot.
- Expired approvals preserve `actionsTaken=[]` and create no evidence.
- The approval API can bind a pending proposal task and return an approval token.
- A valid token lets the next graph run consume the approval and capture exactly read-only browser evidence.
- Approval and consumption are visible in audit/trace state.

Known gaps at the end of Phase 3:
- Phase 4 was still needed at this point: live authenticated portal capture needed explicit live flags and loud failure without false evidence.
- Phase 5 was still needed: product memory was still the local adapter seam, not Hindsight/Zen/LangMem/Mem0/Zep/Graphiti.
- Phase 6 was still needed: PHI payload capture/assertions, transactional DB hardening, and hash-chained audit remained open.

## Phase 4 MVP Hardening: Live Authenticated Portal Proof Gate - 2026-05-27

User direction:
- Continue to Phase 4.
- Evaluate which phase is most suitable to test a fully working MVP path.

Implementation:
- Added `src/concierge/portalEvidenceVerifier.mjs`.
- Added authenticated member portal verification when `requireLivePortalProof` or `BRAINSTY_PORTAL_LIVE=1` is active.
- Added fail-closed live proof behavior:
  - missing `BRAINSTY_PORTAL_LIVE=1` blocks evidence creation.
  - public Aetna marketing pages block evidence creation.
  - unknown page kind or missing member/evidence signals block evidence creation.
- Added verified source pointer artifacts with:
  - URL
  - title
  - page kind
  - extraction timestamp
  - DOM hash
  - extraction hash
  - evidence fields
- Added `npm run test:live:portal`.
- The live test requires `BRAINSTY_PORTAL_LIVE=1` and a user-authenticated member portal tab through Chrome remote debugging.

Files changed:
- `src/concierge/portalEvidenceVerifier.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/tests/portal-evidence-verifier.test.mjs`
- `src/tests/live-portal.test.mjs`
- `package.json`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

Proof:
- `node --check src/concierge/portalEvidenceVerifier.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/tests/live-portal.test.mjs` passed.
- `node --test src/tests/portal-evidence-verifier.test.mjs src/tests/approval-resume.test.mjs src/tests/langgraph-runner.test.mjs` passed: 13 passing, 0 failing.
- `npm run build` passed.
- `npm run test:local` passed: 64 passing, 0 failing.
- Local API smoke proof against the refreshed dev server completed proposal -> approval -> live-proof-required resume without `BRAINSTY_PORTAL_LIVE=1`:
  - approval status `approved`
  - evidence status `blocked_live_portal_verification_failed`
  - reason `BRAINSTY_PORTAL_LIVE=1 is required before live portal proof can create healthcare evidence.`
  - `actionsTaken=[]`
  - `sourcePointers=[]`
  - `snapshotCount=0`
  - latest browser run status `blocked_live_portal_verification_failed`
- In-app browser proof loaded `http://127.0.0.1:4173/` with page title `Brainstyworkers AI Concierge` and visible LangGraph/OpenClaw UI text.

What this proves locally:
- Live portal proof is explicit and fail-closed.
- A public Aetna page cannot become a healthcare evidence snapshot.
- Blocked live proof creates a blocked browser run/audit event and no eligibility snapshot.
- Verified authenticated-member evidence stores source hashes and evidence fields before creating the sourced evidence path.

Not run:
- `npm run test:live:portal` was not run in this pass because it intentionally requires `BRAINSTY_PORTAL_LIVE=1` and an already authenticated Chrome member portal tab. Running it without that state would only prove the safety tripwire, not live portal capture.

Full working test recommendation:
- Phase 4 is the right phase to test the live portal evidence loop.
- Phase 5 is the first phase suitable for a full target MVP test, because the target slice includes safe product-memory retain/recall.
- Phase 6 is the customer-facing hardening phase because PHI payload inspection, transactional database behavior, audit integrity, and concurrency remain open.

Known gaps:
- Phase 5 is still needed: product memory is still the local adapter seam, not Hindsight/Zen/LangMem/Mem0/Zep/Graphiti.
- Phase 6 is still needed: PHI payload capture/assertions, transactional DB hardening, and hash-chained audit remain open.

## MVP UI Correction: Auth Plus Chat Primary Surface - 2026-05-27

User direction:
- Final MVP should be a user-friendly auth/login followed by chat.
- Workflow buttons should run testable workflows through the real LangGraph harness.
- Chat should ask for missing information when needed.
- Workflow output, OpenClaw proposal/result state, and proof should route back into chat.
- Keep the proof dashboard for verification, but do not make it the primary user experience.
- Do not mock; wire to real harness/LLM/OpenClaw proposal flows.

Implementation:
- Reworked the app into an auth plus chat primary flow.
- Added chat workflow shortcut buttons:
  - Benefits
  - Claim Status
  - Prior Auth
  - Appeal
  - Portal Proof
- Added `Sign In` using the real `/api/orchestrator/auth-start` endpoint.
- Updated chat submit and workflow buttons to call the real `/api/chat` LangGraph runtime.
- Added chat proof cards that render:
  - workflow
  - structured intent/confidence
  - missing evidence/user fields/data pointers
  - OpenClaw proposal task
  - worker plan dispatch state
  - approval state
  - evidence state/actions
  - source pointers
  - graph trace id
- Added `Approve Read-Only Observation` action in chat, wired to the real `/api/orchestrator/approve` endpoint and graph resume path.
- Added browser-side timeout/error handling for long model calls.
- Kept the existing dashboard panels for operator proof and debugging.
- Updated Phase 4 browser proof panel to use the real remote-debugger path instead of a synthetic browser snapshot.

Proof:
- `node --check src/app/app.js` passed.
- `npm run build` passed.
- `node --test src/tests/portal-evidence-verifier.test.mjs` passed: 4 passing, 0 failing.
- In-app browser proof:
  - app loaded with `Auth + Workflow Conversation`.
  - `Sign In` completed through real auth endpoint.
  - `Benefits` workflow ran through real `/api/chat`.
  - chat rendered `Workflow Proof`.
  - workflow was `eligibility_benefits_navigation`.
  - OpenClaw proposal was visible and pending approval.
  - `Approve Read-Only Observation` button was visible and wired.
  - approval resume path reported real browser harness state.

Current UI assessment:
- The app now behaves like the intended MVP direction: auth plus chat first, proof dashboard second.
- LangSmith is not required for this MVP because the UI can render LangGraph/OpenClaw proof from local runtime state.
- Live GPT remains optional via the existing checkbox; browser-side timeout handling prevents a slow model call from silently freezing the UI.

## Phase 5 Product Memory: Zep Graphiti Runtime - 2026-05-27

User direction:
- Build the product memory contracts with a real Zep/Graphiti framework install from its repo.
- Do not only add an interface; install and test the real schema/runtime.
- Connect memory to the interface and LangGraph path.
- Keep Cortex out of product memory.

Implementation:
- Cloned the official `getzep/graphiti` repo into `vendor/getzep-graphiti` at commit `34f56e6`.
- Created `.venv-graphiti` and installed `graphiti-core` from the local official repo checkout with FalkorDB/Kuzu extras.
- Started a real FalkorDB container as `brainsty-falkordb` on host port `6380` because local Redis already uses `6379`.
- Added `tools/graphiti/graphiti_bridge.py` to run real Graphiti schema/index initialization, retain, recall, and suppress operations.
- Added `src/concierge/productMemory.mjs` as the Node contract:
  - `status`
  - `recall`
  - `retain`
  - `suppress`
  - safe episode construction
- Wired LangGraph to recall Graphiti product memory before orchestration and retain safe summaries/source pointers after graph completion.
- Added `/api/product-memory/status`, `/api/product-memory/probe`, and `/api/product-memory/suppress`.
- Added Product Memory UI panel with `Check Graphiti` and `Retain + Recall`.
- Added chat proof display for product memory recall/retain state.
- Added `npm run graphiti:falkordb` and `npm run test:memory:graphiti`.
- Updated `.env.example` with Graphiti/FalkorDB variables.

Important runtime decision:
- Official Graphiti requirements verified from the repo/docs:
  - Python `>=3.10,<4`; local runtime is Python 3.12.
  - Graph backend required; FalkorDB support is installed through the `graphiti-core[falkordb]` extra.
  - Graphiti defaults to OpenAI for LLM inference and embeddings; local `.env.local` supplies `OPENAI_API_KEY`.
  - Local FalkorDB normally uses Redis protocol port `6379`; this project maps container port `6379` to host port `6380` to avoid the already-running local Redis.
- FalkorDB is the selected local Graphiti backend for MVP proof.
- Docker/Colima is required for the FalkorDB local service.
- Kuzu was installed and evaluated, but the current Graphiti Kuzu path failed during real ingestion because the required edge full-text index was not visible to `QUERY_FTS_INDEX`. FalkorDB worked and is the active backend.

Safety:
- Graphiti stores safe summaries and source pointers, not raw portal text.
- `GRAPHITI_STORE_RAW_EPISODES=0`.
- Direct identifiers are masked before safe episode construction.
- Cortex is not called or used as product memory.
- OpenClaw still does not retain product memory.

Proof:
- Direct Python Graphiti/FalkorDB smoke retained and recalled facts:
  - facts included deductible/benefits/source pointer memory.
- `node --check src/concierge/productMemory.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `.venv-graphiti/bin/python -m py_compile tools/graphiti/graphiti_bridge.py` passed.
- `node --test src/tests/product-memory-contract.test.mjs` passed: 2 passing, 0 failing.
- `npm run build` passed.
- `node --test src/tests/product-memory-contract.test.mjs src/tests/langgraph-runner.test.mjs src/tests/runtime-collapse.test.mjs` passed: 10 passing, 0 failing.
- `npm run test:local` passed: 66 passing, 0 failing.
- `npm run test:memory:graphiti` passed: 1 passing, 0 failing.
- Browser UI proof at `http://127.0.0.1:4173/`:
  - Product Memory panel loaded.
  - `Check Graphiti` returned `graphiti · schema ready`.
  - `Retain + Recall` returned a real episode id, 2 nodes, 1 edge, and a recalled fact about deductible/benefits/source-pointer memory.

Known gaps:
- Product memory is now real Graphiti, but deletion/suppression has only the episode-level Graphiti operation and audit hook; no user-facing deletion policy UI yet.
- Multi-user isolation is acceptable for the one-user MVP with FalkorDB `GRAPHITI_GROUP_ID`; broader product use needs stronger tenant/group lifecycle tests.
- Phase 6 is still required for exact serialized memory-bound payload capture/assertions, transactional database hardening, audit integrity, and concurrency.

## Phase 6A-Lite: Outbound Payload Observability Before PHI Enforcement - 2026-05-27

User direction:
- Treat PHI hardening carefully now because deferring all PHI work could create silent failures as the MVP grows.
- Avoid a broad Phase 6 rewrite before the full OpenClaw worker path is connected.

Implementation:
- Added `src/concierge/outboundPayloadObservability.mjs`.
- Every observed outbound payload gets an `outbound_payload_observed` audit event with:
  - destination
  - payload type
  - policy mode
  - exact serialized payload
  - SHA-256 payload hash
  - `containsPortalText`
  - `containsDirectIdentifier`
  - `containsSourcePointers`
  - `enforcementMode: observe_only`
- Wired OpenAI ChatOpenAI invocation in LangGraph to record the exact message body before send.
- Wired Graphiti product-memory status, recall, retain, probe, and suppress bridge calls to record exact memory-bound payloads before send.
- Extended the chat proof UI with a `Payload audits` summary row.
- Added build-check coverage for the outbound payload observability contract.

Important boundary:
- This slice is observe-only.
- It does not block payloads yet.
- It does not claim the full Phase 6 PHI taxonomy, transactional state rewrite, audit hash chain, or concurrency hardening is complete.
- It makes future PHI enforcement testable because the app now captures what actually leaves the runtime.

Proof:
- `node --check src/concierge/outboundPayloadObservability.mjs` passed.
- `node --check src/concierge/modelPayloadPolicy.mjs` passed.
- `node --check src/concierge/productMemory.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/server/build-check.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/outbound-payload-observability.test.mjs` passed: 1 passing, 0 failing.
- `node --test src/tests/live-openai.test.mjs` passed: 1 passing, 0 failing.
- `npm run test:memory:graphiti` passed: 1 passing, 0 failing.
- `npm run test:local` passed: 67 passing, 0 failing.
- `npm run build` passed.
- API proof after restarting the dev server at `http://127.0.0.1:4173`:
  - `/api/chat` returned 2 `outbound_payload_observed` audit events for a non-executing benefits workflow.
  - Observed payloads were `graphiti_recall` and `graphiti_retain`.
  - Both reported direct identifiers absent, portal text absent, source pointers present, and `observe_only` enforcement.
- Browser proof at `http://127.0.0.1:4173/`:
  - Signed in through the auth plus chat UI.
  - Ran the `Benefits` workflow button.
  - Workflow proof rendered `Payload audits`.
  - The row showed `zep_graphiti:graphiti_recall`, `openai:openai_chat_messages`, and `zep_graphiti:graphiti_retain`, each with `id=no portal=no`.

Known gaps:
- Payload labels are intentionally coarse and conservative; full PHI taxonomy is still Phase 6B.
- The direct identifier detector now avoids false positives for instruction phrases such as "member ID masked", but it is not a complete PHI classifier.
- Enforcement/blocking, payload redaction gates, append-only/hash-chained audit verification, transactional database migration, and concurrent same-session tests remain open.

## Phase 6B: Enforced Payload Policy, Audit Integrity, And Concurrent State - 2026-05-27

User direction:
- Do the best Phase 6B now.
- Keep the scope practical and avoid creating silent PHI failures before the OpenClaw execution path grows.

Implementation:
- Converted outbound payload observability into enforced policy by default.
- Added `evaluateOutboundPayloadPolicy` in `src/concierge/outboundPayloadObservability.mjs`.
- Enforced default outbound blockers:
  - direct identifiers present
  - raw portal text present
  - required source pointer contract missing when the call type requires source pointers
- Blocked outbound payloads record `outbound_payload_blocked` audit events before throwing.
- OpenAI and Graphiti outbound payloads now run through enforced mode unless a caller explicitly chooses observe-only.
- Added policy metadata to payload audits:
  - `policyVersion`
  - `allowedByCurrentPrototypePolicy`
  - `policyIssues`
  - `policyRequirements`
  - `enforcementMode`
- Added hash-chain columns to `audit_events`:
  - `previous_event_hash`
  - `event_hash`
  - `chain_version`
- Added hash-chain creation and verification in `src/concierge/audit.mjs`.
- Added a per-session checkpoint lock in `src/concierge/sessionManager.mjs` to prevent same-process concurrent checkpoint collisions.
- Added build-check coverage for audit hash-chain columns and the outbound policy contract.

Tests added:
- `src/tests/outbound-payload-policy-enforcement.test.mjs`
  - blocks direct identifiers before external send
  - blocks raw portal text in memory-bound payloads
  - allows safe source-pointer summaries
  - fails when source pointers are required but missing
- `src/tests/audit-integrity.test.mjs`
  - verifies chained audit events
  - detects tampered audit details
- `src/tests/concurrent-session-state.test.mjs`
  - proves two concurrent same-session checkpoints advance `state_version` to distinct versions.

Proof:
- `node --check src/concierge/audit.mjs` passed.
- `node --check src/concierge/outboundPayloadObservability.mjs` passed.
- `node --check src/concierge/sessionManager.mjs` passed.
- `node --check src/server/build-check.mjs` passed.
- Focused Phase 6B test set passed: 6 passing, 0 failing.
- `npm run build` passed.
- `npm run test:local` passed: 72 passing, 0 failing.
- `node --test src/tests/live-openai.test.mjs` passed: 1 passing, 0 failing.
- `npm run test:memory:graphiti` passed: 1 passing, 0 failing.
- API proof after restarting the dev server at `http://127.0.0.1:4173`:
  - `/api/chat` returned 3 `outbound_payload_observed` audit events for a safe benefits run with Live GPT enabled.
  - Observed payloads were `graphiti_recall`, `openai_chat_messages`, and `graphiti_retain`.
  - All three reported `enforcementMode=enforced`, `allowed=true`, `policyIssues=[]`, direct identifiers absent, portal text absent, and source pointers present.
- Browser proof at `http://127.0.0.1:4173/`:
  - Signed in through the auth plus chat UI.
  - Ran the `Benefits` workflow button with Live GPT enabled.
  - Workflow proof rendered `Payload audits`.
  - The row showed `zep_graphiti:graphiti_recall enforced allowed id=no portal=no sources=yes`, `openai:openai_chat_messages enforced allowed id=no portal=no sources=yes`, and `zep_graphiti:graphiti_retain enforced allowed id=no portal=no sources=yes`.

Known gaps:
- The payload policy is now enforced, but the PHI classifier remains intentionally narrow: direct identifiers, raw portal text fields, and source-pointer contract presence.
- Existing legacy audit rows in the local database may be unhashed; new audit rows are hash chained.
- The checkpoint lock protects same-process local concurrency. Production still needs transactional `better-sqlite3` or Postgres and database-level concurrency controls.
- Full screenshot/PDF/document PHI inspection is still future hardening.

## Phase 7A/7B: Official OpenClaw Dedicated Profile And Read-Only Worker Dispatch - 2026-05-27

User direction:
- Proceed to 7A and, if it passed, 7B.
- Verify the official OpenClaw path does not interfere with the user's personal OpenClaw instance and personal skills.
- Keep LangGraph as workflow master and OpenClaw as the adaptive read-only worker arm.

Implementation:
- Added `src/concierge/openclawOfficialRuntime.mjs`.
- Added official OpenClaw readiness API:
  - `GET /api/openclaw/official/status`
- Added official worker dispatch to the LangGraph `observe_evidence` node behind:
  - a consumed read-only approval token.
  - `useOfficialOpenClawWorker: true`.
- Added UI controls:
  - `Official Status` in the OpenClaw skill panel.
  - `Use official OpenClaw worker` in the auth/chat panel.
- Added `src/tests/openclaw-official-runtime.test.mjs`.
- Added `npm run test:openclaw:official`.
- Updated `recordBlockedPortalEvidence` so blocked approved worker observations can preserve the read-only actions actually taken.

Official OpenClaw setup/proof:
- Reused installed official CLI:
  - `/opt/homebrew/bin/openclaw`
  - `OpenClaw 2026.5.4`
- Dedicated project profile:
  - command prefix: `openclaw --profile brainstyworkers`
  - state/config: `~/.openclaw-brainstyworkers`
  - config: `~/.openclaw-brainstyworkers/openclaw.json`
  - gateway port: `19789`
  - browser CDP port observed: `19800`
- Dedicated project workspace:
  - `~/.openclaw-brainstyworkers/workspace-brainstyworkers`
- Dedicated project agent:
  - `brainstyworkers-insurance-browser`
- Project browser profile:
  - managed OpenClaw browser profile `openclaw`
- Workspace skills:
  - `insurance-portal-browser` ready from `openclaw-workspace`
  - `browser-automation` ready
  - personal skills reported as excluded
- Personal default OpenClaw config/skill fingerprint remained unchanged:
  - `29d22a5bc018f05f46f6547d96abd22133025ca526f5d405e2a057b81347afb6`

Phase 7B behavior now implemented:
- With no valid approval token, no official OpenClaw worker action runs.
- With a valid approval token, the graph can run exactly these read-only OpenClaw actions:
  - `openclaw_browser_start`
  - `openclaw_browser_open_url`
  - `openclaw_browser_snapshot_aria`
  - `verify_authenticated_member_portal`
- Public Aetna marketing content is blocked by LangGraph verification after the real OpenClaw observation.
- Blocked public content creates no eligibility snapshot and no source pointer.
- Official worker dispatch writes outbound payload audit metadata without raw portal text.

Proof:
- `node --check src/concierge/openclawOfficialRuntime.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `npm run test:openclaw:official` passed:
  - 2 passing, 0 failing.
  - Live test executed the dedicated official OpenClaw browser against public Aetna and failed closed.
- `npm run build` passed.
- `npm run test:local` passed:
  - 73 passing, 1 skipped live OpenClaw proof, 0 failing.

Known gaps:
- Phase 7B has proven fail-closed behavior on public payer content. It still needs a user-authenticated member portal page to prove successful verified source pointer creation through the official OpenClaw worker path.
- The dedicated local gateway was run with local loopback/auth-none settings for prototype proof. Production needs authenticated gateway configuration and lifecycle management.
- Local OpenClaw reports an available update from `2026.5.4`; do not update during this slice unless explicitly requested.
- Manual device-scope repair was performed only inside the dedicated project profile after OpenClaw's approval command did not apply the pending request. This did not touch the default personal profile, but it should be treated as a local setup caveat.

## Phase 7C: Authenticated Official OpenClaw Portal Proof - 2026-05-27

User direction:
- Try the 7C flow after the user manually logged in to the dedicated OpenClaw browser.
- Keep credentials, passwords, passkeys, SSNs, and 2FA entirely under user control.

Implementation adjustment:
- Hardened `src/concierge/openclawOfficialRuntime.mjs` so official OpenClaw snapshots poll until the page is no longer a loading screen before verification.
- The first 7C attempt failed closed because OpenClaw captured `Page Loading`; it created no source pointer and no eligibility snapshot.
- The retry passed after the polling fix.

Verified run:
- Session: `session_f38928dc-eead-4cca-9b5d-3929713ab04a`
- Proposal task: `task_4556e5cb-3d49-41ba-bff0-88a14a9fb1d0`
- Approval status: `approved`
- Approval resume: `approved_consumed`
- Evidence status: `captured_official_openclaw_read_only_observation`
- Live portal proof: `verified`
- Browser run: `browser_6d2bbb7c-0eb6-42a6-b043-40b410aab0e0`
- Eligibility snapshot pointer: `eligibility_snapshots/elig_e4753c11-7c53-47dd-a47f-0aae2aec7977`
- Verified source-pointer artifact: `extraction_artifacts/artifact_2a1bde5b-2733-44c7-b190-433c64c31855`

Actions taken:
- `openclaw_browser_start`
- `openclaw_browser_open_url`
- `openclaw_browser_snapshot_aria`
- `verify_authenticated_member_portal`
- `record_verified_source_pointer`
- `persist_eligibility_snapshot`

Proof details:
- Verified page title: `Home - Aetna`
- Verified URL: `https://health.aetna.com/`
- Source pointer status: `authenticated_member_portal_verified`
- Evidence fields:
  - member signal present.
  - benefits signal present.
  - claims signal present.
  - authorization signal absent.
  - text length recorded by verifier.
- Verified source pointer included DOM hash and extraction hash.
- Graphiti retain payload audits reported:
  - direct identifiers absent.
  - raw portal text absent.
  - source pointers present.
  - enforced policy allowed.

Commands/proof:
- `node --check src/concierge/openclawOfficialRuntime.mjs` passed.
- `npm run build` passed.
- `npm run test:openclaw:official` passed after the polling fix:
  - 2 passing, 0 failing.

Known gaps:
- The final response cited source pointers and verified the worker path, but structured coverage balance rows were not extracted from the authenticated home page in this run.
- The UI still needs a smoother "manual login complete / continue read-only proof" interaction instead of the current operator-style proof flow.
- A focused automated regression should be added for loading-screen polling without requiring the live portal.

## Phase 7D: DOM Plus Visual OCR Evidence Hardening - 2026-05-27

User direction:
- Use the best Chrome/OpenClaw automation for logged pages.
- Always include DOM evaluation and OCR-based visual evaluation because complex pages can hide essential information from text/ARIA snapshots alone.
- Install only the necessary OpenClaw skill(s).

Research/selection:
- Official OpenClaw browser docs confirm the managed browser supports snapshots, screenshots, PDFs, deterministic tab control, and the bundled `browser-automation` skill.
- Official OpenClaw skills docs confirm workspace skills have highest precedence, per-agent allowlists are final, and third-party skills must be treated as untrusted code.
- Chosen stack:
  - `browser-automation` for OpenClaw browser operation guidance.
  - repo/workspace `insurance-portal-browser` for the healthcare-specific boundary.
  - ClawHub `ocr-local` for local Tesseract.js OCR with no API key.
- Avoided changing the global/personal OpenClaw install when `openclaw browser screenshot` reported missing optional `sharp`; instead the project runtime captures screenshots via the dedicated OpenClaw browser CDP endpoint and sends that local image to the project-scoped OCR skill.

Implementation:
- Installed `ocr-local@1.0.0` into:
  - `~/.openclaw-brainstyworkers/workspace-brainstyworkers/skills/ocr-local`
- Installed its local dependency with `npm install --prefix .../skills/ocr-local`.
- Added `ocr-local` to the dedicated `brainstyworkers-insurance-browser` agent allowlist.
- Patched the project-scoped installed OCR wrapper for Tesseract.js 7 compatibility when `result.data.words` is absent.
- Updated `src/concierge/openclawOfficialRuntime.mjs` so every official observation now:
  - captures an ARIA/accessibility snapshot.
  - captures a screenshot from the dedicated OpenClaw browser CDP endpoint.
  - runs local OCR against that screenshot.
  - fails closed if screenshot or OCR fails.
  - combines DOM/accessibility text and visual OCR text for verification.
  - stores local artifact metadata including OCR confidence, OCR preview, and screenshot path.
- Updated the repo `insurance-portal-browser` skill artifact and copied it into the dedicated OpenClaw workspace.
- Updated official OpenClaw readiness checks to require `ocr-local` ready.

Proof:
- `openclaw --profile brainstyworkers skills list --agent brainstyworkers-insurance-browser` reports 3 ready skills:
  - `browser-automation`
  - `insurance-portal-browser`
  - `ocr-local`
- `node --check src/concierge/openclawOfficialRuntime.mjs` passed.
- `node --check ~/.openclaw-brainstyworkers/workspace-brainstyworkers/skills/ocr-local/scripts/ocr.js` passed.
- `npm run build` passed.
- `npm run test:openclaw:official` passed:
  - public Aetna still fails closed after DOM + visual OCR.
- Authenticated 7C rerun with visual OCR passed:
  - Session: `session_d13ca34f-e57b-41fc-a66b-6635d2c605ae`
  - Evidence status: `captured_official_openclaw_read_only_observation`
  - Live portal proof: `verified`
  - Actions included `openclaw_browser_screenshot_cdp` and `openclaw_browser_visual_ocr_local`
  - Visual OCR status: `official_openclaw_visual_ocr_completed`
  - Visual OCR confidence: `88`
  - Screenshot path: `data/openclaw-visual-evidence/browser_7cb7a6aa-8719-4653-95e8-e3425c05357f.png`
  - Source pointers:
    - `eligibility_snapshots/elig_7b868f84-3239-4652-998b-557c04acaaf8`
    - `extraction_artifacts/artifact_cd176029-4bcc-4da7-91cb-759550cc851b`

Known gaps:
- OCR is local and required, but Tesseract quality varies by screenshot complexity. The next extraction slice should reconcile DOM text, OCR text, and structured parser output rather than trusting any one layer alone.
- The OpenClaw global browser screenshot command still reports a missing optional `sharp` dependency; the project avoids that by using CDP screenshot capture instead of modifying the global engine.

## Phase 7E: OpenClaw Skill Layering Correction - 2026-05-28

User direction:
- Verify whether the secure personal OpenClaw `browser-automation` skill is better than the complete project skill.
- Apply the necessary correction instead of treating the two skills as competing alternatives.

Finding:
- `browser-automation` is better for tactical browser operation: status/profile checks, tab hygiene, stable labels, read-before-click snapshots, fresh refs, stale-ref recovery, and exact manual blocker reporting.
- `insurance-portal-browser` is better for the healthcare contract: allowed workflows, approval gates, PHI/source-pointer boundaries, no credential/2FA/SSN entry, no payer contact, no form submission, no medical advice, and DOM plus OCR evidence requirements.
- The correct architecture is layered, not either/or:
  - LangGraph is the healthcare workflow master.
  - `insurance-portal-browser` is the healthcare safety envelope.
  - `browser-automation` is the required OpenClaw browser-control substrate.
  - `ocr-local` is the required local visual evidence substrate.

Implementation:
- Updated `openclaw/skills/insurance-portal-browser/SKILL.md` to explicitly state that it does not replace `browser-automation`.
- Added required companion skill language for `browser-automation` and `ocr-local`.
- Replaced stale contract wording that said real worker execution was not installed with the current status: approval-gated official OpenClaw read-only worker execution exists through the dedicated project profile.
- Updated `openclaw/skills/insurance-portal-browser/skill.json` with:
  - `required_companion_skills`
  - `skill_layering`
  - `browser_control_policy`
- Updated artifact validation so tests fail if the project skill no longer declares the `browser-automation` and `ocr-local` dependencies.
- Updated workflow architecture registry metadata to expose the browser-control and visual-evidence substrates.

Proof:
- Synced the updated `insurance-portal-browser` artifact into `~/.openclaw-brainstyworkers/workspace-brainstyworkers/skills/insurance-portal-browser`.
- `node -e "JSON.parse(...skill.json...)"` passed for the repo skill manifest and the synced workspace manifest.
- `node --check src/concierge/openclawSkillArtifacts.mjs` passed.
- `node --test src/tests/openclaw-skill-artifacts.test.mjs` passed with 2 passing tests.
- Artifact validation now reports `browserAutomationRequired: true` and `ocrLocalRequired: true`.
- `node --test src/tests/workflow-architecture.test.mjs` passed with 3 passing tests.
- `npm run build` passed.
- `openclaw --profile brainstyworkers skills list --agent brainstyworkers-insurance-browser` reports 3 ready skills for the project agent:
  - `browser-automation`
  - `insurance-portal-browser`
  - `ocr-local`
- `npm run test:openclaw:official` passed with 2 passing tests; the public payer marketing page still fails closed rather than creating healthcare evidence.

## Phase 7F: LangGraph Worker Cycle Management Verification - 2026-05-28

User direction:
- Verify that LangChain/LangGraph correctly manages the worker cycle and its OpenClaw workers.

Verification target:
- Confirm that LangGraph owns the cycle from input policy through memory recall, structured classification, workflow routing, OpenClaw envelope preparation, worker-job contract, evidence observation, response composition, model invocation, proposal recording, and product-memory retain.
- Confirm that OpenClaw workers cannot choose workflows, create subtasks, retain memory, or execute before approval.
- Confirm that approval tokens are bound, consumed once, and cannot be reused to create duplicate evidence.

Implementation:
- Added a lifecycle regression in `src/tests/langgraph-runner.test.mjs`:
  - proposal run verifies proof order and LangGraph-owned worker job constraints.
  - approval starts with `actionsTaken=[]`.
  - approved resume consumes the token and captures exactly one read-only evidence result.
  - a second attempt with the same token returns `approval_already_consumed`, takes no actions, and creates no new source pointer.
  - audit rows must include proposal, approval recorded, approval consumed, and response composed events.
- Fixed `src/concierge/approvalResume.mjs` so a consumed approval gate reports `approval_already_consumed` before falling through to the generic denied state.

Proof:
- `node --check src/concierge/approvalResume.mjs` passed.
- `node --check src/tests/langgraph-runner.test.mjs` passed.
- `node --test src/tests/langgraph-runner.test.mjs` passed with 8 passing tests.
- `node --test src/tests/approval-resume.test.mjs` passed with 2 passing tests.
- `node --test src/tests/openclaw-worker-contract.test.mjs src/tests/openclaw-skill-artifacts.test.mjs` passed with 6 passing tests.
- `npm run build` passed.
- `npm run test:openclaw:official` passed with 2 passing tests; the dedicated official OpenClaw worker still fails closed on public payer marketing content.

Result:
- The current cycle management is correct for the MVP boundary: LangGraph is the workflow master, worker jobs are deterministic contracts, approval is single-use, and evidence/result ingest cannot bypass LangGraph.

Next step:
- Move from lifecycle correctness to user-facing MVP flow: auth plus chat should expose the same cycle naturally, with login-needed state, user manual sign-in, read-only approval, official OpenClaw observation, source-pointer citation, and structured benefits extraction shown inside chat.

## Phase 7G: OpenClaw Adaptive Worker Empowerment Contract - 2026-05-28

User direction:
- Relax the overly narrow OpenClaw worker contract so OpenClaw can use its intelligence and capabilities to get the delegated job done.
- Allow subtasks, alternate browser automation, web scraping, read-only API attempts, task-scoped skill creation, local OS automation, worker heartbeat memory, and 30-second status reporting.
- Ensure the worker reports final outcomes clearly: sourced result, missing user data, insurance block, policy block, long-running follow-up, or partial result with blockers.

Boundary preserved:
- LangGraph remains the healthcare workflow master and final response owner.
- The worker can choose how to execute inside the assigned task, but not which healthcare workflow to run.
- Credential/passkey/2FA/SSN handling remains user-only.
- Payer contact, external messaging, form submission, record changes, appeals, authorizations, payments, cancellations, and other irreversible actions still require separate explicit per-action approval.
- Medical advice remains not allowed.

Implementation:
- Updated `src/concierge/openclawWorkerContract.mjs` to v2:
  - worker may create assigned-task subtasks.
  - worker may run task-scoped status subagents.
  - worker may retain OpenClaw worker memory and update heartbeat memory.
  - worker may create task-scoped helper skills/scripts.
  - worker may choose tool path, open additional browser instances, try public web/scrape/configured read-only API paths, and use local OS automation inside task scope.
  - progress protocol requires 30-second reports and forbids silent failure.
  - terminal outcome policy is explicit.
- Updated OpenClaw prompt contracts so the task packet tells the worker to use Zep/Graphiti recall, prior sessions, open tasks, scheduled jobs, and database pointers as context.
- Updated runtime adapters so the OpenClaw task envelope carries `product_memory` and `prior_sessions`.
- Updated the `insurance-portal-browser` skill artifact and manifest with adaptive worker policy, progress protocol, status updates, subtasks, worker-memory updates, and terminal outcomes.
- Updated workflow architecture registry metadata to expose adaptive-worker capabilities.
- Updated tests to assert the new empowered worker contract.

Proof:
- `node -e "JSON.parse(...skill.json...)"` passed for the repo skill manifest.
- `node --check src/concierge/openclawWorkerContract.mjs` passed.
- `node --check src/concierge/promptContracts.mjs` passed.
- `node --check src/concierge/runtimeAdapters.mjs` passed.
- `node --check src/concierge/openclawSkillArtifacts.mjs` passed.
- Synced the updated `insurance-portal-browser` artifact into `~/.openclaw-brainstyworkers/workspace-brainstyworkers/skills/insurance-portal-browser`.
- Workspace skill manifest JSON parsed successfully.
- Focused contract test run passed with 12 passing tests:
  - `src/tests/openclaw-worker-contract.test.mjs`
  - `src/tests/openclaw-skill-artifacts.test.mjs`
  - `src/tests/runtime-adapters.test.mjs`
  - `src/tests/prompt-contracts.test.mjs`
  - `src/tests/openclaw-api.test.mjs`
- Artifact validation now reports:
  - `browserAutomationRequired: true`
  - `ocrLocalRequired: true`
  - `adaptiveWorkerAllowed: true`
  - `progressProtocolSeconds: 30`
- `npm run build` passed.
- `openclaw --profile brainstyworkers skills list --agent brainstyworkers-insurance-browser` still reports the three intended ready skills:
  - `browser-automation`
  - `insurance-portal-browser`
  - `ocr-local`
- `node --test src/tests/langgraph-runner.test.mjs` passed with 8 passing tests.
- `npm run test:openclaw:official` passed with 2 passing tests; the official worker remains fail-closed on public payer marketing content.

Incidental test fix:
- Tightened a brittle missing-OpenAI-key assertion in `src/tests/langgraph-runner.test.mjs`; the old assertion looked for the substring `sk-`, which falsely matched the expected word `skipped_missing_openai_api_key`. The test now rejects actual secret-key-shaped strings.

## Phase 8A: GPT-Governed LangGraph Decision Node And Runtime Event Spine - 2026-05-28

User direction:
- Start Phase 8 with extra-high scrutiny because the MVP must prove non-mocked LLM and agent interoperability.
- Use GPT as real LangChain/LangGraph intelligence for workflow decisions, not only as post-hoc response wording.
- Keep the MVP focused on the auth-plus-chat user-facing app while preserving OpenClaw worker versatility, progress updates, hooks, and future automation triggers.

Implementation:
- Added `src/concierge/llmOrchestrationDecision.mjs`.
  - Builds strict JSON-only orchestration decision messages for GPT.
  - Masks direct identifiers before external model calls.
  - Carries route candidates, source-pointer hints, product-memory recall, and OpenClaw worker capability policy into the model decision payload.
  - Normalizes and validates GPT output before LangGraph can route from it.
- Updated `src/concierge/langgraphRunner.mjs`.
  - Added an `llm_decision` LangGraph node after structured classification and before workflow routing.
  - Deterministic refusals and approval gates still override the model.
  - Real `ChatOpenAI` is invoked when live model mode is requested and `OPENAI_API_KEY` is available.
  - Replay mode exists only for deterministic regression tests.
  - Workflow routing now uses a valid, confident GPT decision when available.
- Added `src/concierge/runtimeEvents.mjs`.
  - Runtime events are persisted and mirrored into session events.
  - In-process code hooks can subscribe to events.
  - Webhook subscriptions are recorded but dry-run blocked unless `BRAINSTY_ENABLE_OUTBOUND_WEBHOOKS=1`.
  - Events can stream to the UI through Server-Sent Events.
- Updated `src/concierge/schema.mjs` with `runtime_events`, `runtime_hook_subscriptions`, and `runtime_hook_deliveries`.
- Updated `src/server/server.mjs` with:
  - `GET /api/runtime/events`
  - `GET /api/runtime/events/stream`
  - `GET /api/runtime/hooks`
  - `POST /api/runtime/hooks`
  - `POST /api/runtime/events/publish`
- Updated `src/app/app.js` so the proof UI exposes GPT decision mode, whether GPT was used by the router, chosen workflow, and confidence.
- Updated `src/app/app.js` so live-model UI calls wait up to 180 seconds instead of timing out after 45 seconds.
- Updated `src/concierge/orchestratorDemo.mjs` and `src/concierge/modelPayloadPolicy.mjs` so orchestration summaries and outbound payload proof include the GPT decision stage.
- Hardened `src/concierge/database.mjs` so large SQLite write batches stream through stdin instead of process arguments.
- Hardened `src/concierge/memoryHarness.mjs` to compact context packets by stripping raw task metadata/payload JSON and retaining bounded summaries.

Proof:
- Static checks passed:
  - `node --check src/concierge/llmOrchestrationDecision.mjs`
  - `node --check src/concierge/runtimeEvents.mjs`
  - `node --check src/concierge/langgraphRunner.mjs`
  - `node --check src/server/server.mjs`
  - `node --check src/app/app.js`
  - `node --check src/concierge/memoryHarness.mjs`
  - `node --check src/concierge/database.mjs`
- Build passed:
  - `npm run build`
- Focused deterministic tests passed:
  - `node --test src/tests/llm-orchestration-decision.test.mjs`
  - `node --test src/tests/runtime-events.test.mjs`
  - `node --test src/tests/langgraph-runner.test.mjs`
- Live GPT proof passed:
  - `npm run test:live`
  - `npm run test:orchestrator:live`
- Full local suite passed:
  - `npm run test:local`
  - Result: 83 tests, 82 passed, 1 skipped live official OpenClaw public-page proof unless `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1` is set.
- Browser proof passed at `http://127.0.0.1:4173/`:
  - Started the current dev server.
  - Signed in through the local chat UI.
  - Ran the Benefits workflow with Live GPT enabled.
  - UI showed `Workflow eligibility_benefits_navigation · llm_orchestration_decision`.
  - UI showed `GPT decision openai_chatopenai_invoked · used by router · eligibility_benefits_navigation`.
  - UI showed OpenClaw proposal `pending_approval`, worker `not_dispatched`, approval `missing_approval_token`, evidence actions `none`, Graphiti recall/retain proof, and outbound payload audits.
  - `GET /api/runtime/events?limit=5` returned graph lifecycle events for the same run: `memory.retained`, `final.answer.created`, `evidence.status`, `approval.requested`, and `worker.plan.prepared`.
  - Screenshot capture through the in-app browser bridge timed out, so the browser proof is recorded from DOM-visible UI text rather than an image artifact.

Failures found and fixed:
- LangGraph rejected a node named the same as the state channel; the implementation now uses node id `llm_decision` and state key `llm_orchestration_decision`.
- A live OpenAI smoke prompt accidentally triggered medical-advice refusal, which correctly skipped GPT routing; the test now uses an insurance-navigation prompt.
- Repeated live orchestrator cases exposed `spawn E2BIG` from large SQLite write arguments; writes now stream over stdin and context packet payloads are compacted.
- Human approval escalation correctly overrides GPT routing; live orchestrator assertions now verify that policy behavior instead of treating it as failure.
- Browser proof initially exposed a stale-server/UX timeout issue: the old server process did not have the Phase 8 runtime, and the UI aborted live GPT chat after 45 seconds. The server was restarted and the UI timeout now expands to 180 seconds when Live GPT is enabled.

Result:
- GPT is now a causal LangGraph decision participant for workflow routing when live model mode is enabled.
- The app can audit whether the model was invoked, what workflow it selected, whether the router used it, and why policy overrode it when applicable.
- A runtime event spine now exists for chat timelines, debug dashboards, webhooks, code hooks, and future OpenClaw worker progress messages.
- The implementation still keeps LangGraph as workflow master and OpenClaw as the adaptive worker arm.

Next step:
- Phase 8B should turn this backend proof into the auth-plus-chat MVP interaction:
  - login-needed state in chat,
  - manual user sign-in readiness,
  - read-only approval card,
  - live GPT decision proof,
  - runtime event timeline,
  - OpenClaw worker status/progress events,
  - sourced final answer and product-memory proof in the same conversation.

## Phase 8B: Auth-Plus-Chat Guided MVP Surface - 2026-05-28

User direction:
- Continue to the next phase after Phase 8A.
- Keep the MVP centered on the user-facing app: auth first, chat second, workflow buttons as shortcuts, and visible LangGraph/OpenClaw proof.

Implementation:
- Updated `src/app/index.html`:
  - Added a chat journey strip.
  - Added a `Portal Ready` control for the manual user-login/readiness boundary.
  - Added a runtime timeline panel in the chat area.
  - Added a `Refresh Timeline` control backed by runtime events.
- Updated `src/app/app.js`:
  - Chat workflows now require local planned-user sign-in before running LangGraph.
  - If the user clicks a workflow before sign-in, chat shows a login-needed message and does not create a graph run.
  - `Portal Ready` enables live portal proof and official OpenClaw worker toggles, but still requires explicit read-only approval before any worker observation.
  - The chat journey strip shows Local Auth, GPT Route, Approval, OpenClaw, and Memory states.
  - The runtime timeline fetches `/api/runtime/events?sessionId=...` and can also subscribe to the SSE stream.
  - Timeline summaries show GPT classification, route, worker plan, approval request, evidence state, final answer, and memory retain events.
- Updated `src/app/styles.css` with responsive journey/timeline UI.
- Added `src/tests/chat-ui-contract.test.mjs`.
- Updated `package.json` so `npm run test:local` includes the chat UI contract test.

Proof:
- `node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 2 passing tests.
- `npm run build` passed.
- `node --test src/tests/llm-orchestration-decision.test.mjs src/tests/runtime-events.test.mjs` passed with 8 passing tests.
- `npm run test:local` passed:
  - 85 tests total.
  - 84 passed.
  - 1 skipped live official OpenClaw public-page proof unless `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1` is set.
  - 0 failed.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - Clicking Benefits before local sign-in showed `sign in first` and did not show `Workflow Proof`.
  - Signing in created a session and rendered the guided state.
  - Clicking `Portal Ready` checked `Require live portal proof` and `Use official OpenClaw worker`, and reminded that credentials/passkeys/SSN/2FA stay user-controlled.
  - Running Benefits with Live GPT produced `openai_chatopenai_invoked`, `used by router`, `pending_approval`, and `actions none`.
  - Runtime Timeline showed 7 graph events:
    - `workflow.classified`
    - `workflow.routed`
    - `worker.plan.prepared`
    - `approval.requested`
    - `evidence.status`
    - `final.answer.created`
    - `memory.retained`

Result:
- The primary MVP surface now proves the real LangGraph/GPT/OpenClaw cycle from chat instead of relying only on operator panels.
- The user can see what is waiting for sign-in, what GPT decided, what OpenClaw is allowed to do, why approval is required, and what memory/events were retained.
- OpenClaw remains approval-gated; no worker action is taken before approval.

Next step:
- Phase 8C should make the approval/resume experience smoother in chat:
  - after approval, stream or refresh worker progress into the timeline,
  - surface long-running worker status and async-follow-up recommendations,
  - route official OpenClaw read-only results back into the same chat conversation,
  - show source pointers and structured benefits evidence when the authenticated portal proof succeeds,
  - keep fail-closed behavior when portal auth/evidence verification is not ready.

## Phase 8C: Chat Approval/Resume And Worker Status Continuity - 2026-05-29

User direction:
- Continue to the next phase after the guided auth-plus-chat MVP surface.
- Make approval/resume continuous in chat and route OpenClaw worker status/results back into the same conversation.

Implementation:
- Updated `src/server/server.mjs`:
  - `POST /api/orchestrator/approve` now publishes `approval.recorded` runtime events with task, workflow, scope, expiration, and no-action proof.
- Updated `src/concierge/langgraphRunner.mjs`:
  - Evidence observation now publishes `worker.status.updated` when it is waiting for approval.
  - Approved resume publishes `approval.consumed`.
  - Official OpenClaw dispatch publishes `worker.status.updated` before dispatching.
  - Worker/evidence terminal status events now distinguish:
    - `completed_with_sourced_result`
    - `not_possible_insurance_or_portal_block`
    - `not_possible_policy_or_approval_block`
  - Fail-closed paths publish worker status before returning blocked evidence.
- Updated `src/app/app.js`:
  - Runtime timeline now understands `approval.recorded`, `approval.consumed`, and `worker.status.updated`.
  - Approval/resume runs now render a `Worker Result` card in chat with terminal outcome, status, actions, source pointers, structured benefits, and blocker text.
- Updated tests:
  - `src/tests/chat-ui-contract.test.mjs` now asserts the chat UI keeps approval/worker status event handling and worker result rendering.
  - `src/tests/runtime-events.test.mjs` now proves an approved graph resume emits `approval.consumed` and `worker.status.updated` with `completed_with_sourced_result`.
  - `src/tests/approval-resume.test.mjs` now proves the approval API emits `approval.recorded`, and approved resume emits approval consumption plus worker-status terminal events.

Proof:
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 2 passing tests.
- `node --test src/tests/runtime-events.test.mjs` passed with 5 passing tests.
- `node --test src/tests/approval-resume.test.mjs` passed with 2 passing tests.
- `node --test src/tests/langgraph-runner.test.mjs` passed with 8 passing tests.
- `npm run build` passed.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - Local planned-user sign-in created session `session_cab7352a-588a-4f7b-a38e-888302e08400`.
  - Clicking `Benefits` routed through live GPT classification with `openai_chatopenai_invoked` and `used by router`.
  - The first run showed `pending_approval`, `missing_approval_token`, `worker.status.updated`, and `actions none`.
  - Clicking `Approve Read-Only Observation` emitted `approval.recorded`.
  - The resumed graph emitted `approval.consumed` and additional `worker.status.updated` events.
  - Because the browser did not expose an authenticated member portal page, the resumed worker result failed closed with `blocked_no_authenticated_evidence` and `not_possible_insurance_or_portal_block`.
  - The chat showed a post-approval `Worker Result` card with actions `none`, source pointers `none`, structured benefits `none yet`, and the blocker text.
- `npm run test:local` passed:
  - 86 tests total.
  - 85 passed.
  - 0 failed.
  - 1 skipped: the live official OpenClaw dispatch proof remains gated behind `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`.

Result:
- Chat approval now has a real event trail: approval recorded, approval consumed, worker status, evidence status, final response, and memory retention.
- The worker status event contract is ready for the 30-second OpenClaw status subagent and future async follow-up conversion.
- Fail-closed outcomes are visible to the user instead of being hidden in raw trace JSON.
- Phase 8C is verified in both the local browser and the full deterministic test suite.

Next step:
- Phase 8D should focus on authenticated portal source-pointer success quality: show structured deductible/out-of-pocket rows from DOM plus OCR evidence when the portal is truly authenticated, and keep blocked/async outcomes friendly when it is not.

## Phase 8D: Authenticated Evidence Quality And Friendly Worker Outcomes - 2026-05-29

User direction:
- Continue to Phase 8D after approval/resume continuity.
- Improve the value of a successful authenticated benefits proof before adding workflow breadth.
- Keep the app honest when portal auth, live proof, OCR, or verification is missing.

Implementation:
- Updated `src/concierge/structuredExtraction.mjs`:
  - Added more tolerant deductible and out-of-pocket balance parsing for DOM/accessibility text and OCR-style text.
  - Supports label-before-money and money-before-label formats such as `Total $600`, `Spent $558.72`, `Remaining $41.28`, and `Out of pocket maximum $9,000 total $1,476.98 spent $7,523.02 remaining`.
- Updated `src/concierge/langgraphRunner.mjs`:
  - Adds persisted `coverage_balances` rows to the source-pointer list.
  - Adds `structuredBenefits` rows to `evidence_observation`.
  - Adds evidence-channel metadata such as `visible_dom_text`, `accessibility_tree`, and `visual_ocr` when available.
  - Publishes `structuredBenefitCount` and evidence channels on successful `worker.status.updated` events.
  - Keeps source-pointer-only retention/model surfaces; raw portal text is still not sent as product memory.
- Updated `src/concierge/outputPolicy.mjs`:
  - Final sourced answers now summarize structured deductible/out-of-pocket rows when they are extracted.
- Updated `src/app/app.js`:
  - Worker Result cards now show total/spent/remaining structured benefits.
  - Worker Result cards now show evidence channels.
  - Fail-closed blockers are mapped to friendly user-facing explanations for missing approval, missing live flag, public page verification, missing authenticated browser session, and OCR/visual proof failure.
- Updated tests:
  - Added `src/tests/structured-extraction.test.mjs`.
  - Added LangGraph coverage for verified portal proof returning structured benefit rows and `coverage_balances` source pointers.
  - Extended runtime-event coverage to assert `structuredBenefitCount`.
  - Extended the chat UI contract test for friendly blocker/structured benefit/evidence-channel rendering.

Proof:
- Static checks passed:
  - `node --check src/concierge/structuredExtraction.mjs`
  - `node --check src/concierge/langgraphRunner.mjs`
  - `node --check src/concierge/outputPolicy.mjs`
  - `node --check src/app/app.js`
- Focused tests passed:
  - `node --test src/tests/structured-extraction.test.mjs`
  - `node --test src/tests/chat-ui-contract.test.mjs`
  - `node --test src/tests/runtime-events.test.mjs`
  - `node --test src/tests/langgraph-runner.test.mjs`
  - `node --test src/tests/portal-evidence-verifier.test.mjs`
- Build passed:
  - `npm run build`
- Browser proof at `http://127.0.0.1:4173/` passed:
  - Fresh server was restarted for Phase 8D code.
  - Local sign-in worked.
  - Benefits flow produced approval, consumed approval, and worker status events.
  - With no authenticated browser evidence available, the latest Worker Result card showed `blocked_no_authenticated_evidence`, actions `none`, source pointers `none`, structured benefits `none yet`, evidence channels `not reported`, and the friendly blocker: `I could not reach an authenticated browser session. Sign in yourself in the approved browser, then run the read-only approval again.`
  - The latest Worker Result card did not expose the raw Chrome startup command.
- Full local suite passed:
  - `npm run test:local`
  - 88 tests total.
  - 87 passed.
  - 0 failed.
  - 1 skipped: live official OpenClaw dispatch remains gated behind `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`.

Result:
- A verified authenticated portal proof can now produce user-visible structured deductible/out-of-pocket evidence with source pointers, not only a generic snapshot citation.
- The official OpenClaw path can carry accessibility-tree and OCR evidence-channel metadata into the LangGraph result contract.
- The chat result is more useful when evidence succeeds and more humane when evidence fails closed.

Next step:
- Phase 8E should make the synchronous result loop ready for longer worker tasks:
  - add explicit async-follow-up state when a worker task exceeds the current chat turn,
  - persist a pending worker continuation record bound to session/task/correlation id,
  - expose cancel/continue status in the chat timeline,
  - keep the current read-only evidence guardrails and source-pointer-only memory behavior.

## Phase 8E: Async Worker Follow-Up State - 2026-05-29

User direction:
- Continue past the synchronous approval/resume loop toward correct cycle management between LangGraph and OpenClaw workers.
- Keep the MVP focused on the benefits journey and do not add workflow breadth.
- Make longer worker tasks visible and cancellable instead of allowing silent failure.

Implementation:
- Added `worker_continuations` runtime storage in `src/concierge/schema.mjs` and migration support in `src/concierge/database.mjs`.
- Added `src/concierge/workerContinuations.mjs`:
  - creates a task/session/user/workflow-bound continuation from a pending worker proposal,
  - enforces `read_only_observation` as the only MVP continuation scope/action,
  - creates a matching `scheduled_jobs` status-check row,
  - captures the last worker progress event,
  - publishes `worker.followup.scheduled`, `worker.followup.continue_requested`, and `worker.followup.cancelled`,
  - audits create/continue/cancel transitions,
  - keeps `actionsTaken: []` for all continuation controls.
- Added API endpoints in `src/server/server.mjs`:
  - `GET /api/worker-continuations`
  - `POST /api/worker-continuations`
  - `POST /api/worker-continuations/:id/continue`
  - `POST /api/worker-continuations/:id/cancel`
- Extended `traceForSession` to include worker continuation records.
- Extended the chat UI:
  - pending worker proposals can be left as async follow-up,
  - continuation cards show status, outcome, task, workflow, approval scope, next check, last progress, and actions taken,
  - continue/cancel controls record state transitions without executing worker actions,
  - cancelled continuation cards close the controls and show that actions remain none.
- Added `src/tests/worker-continuations.test.mjs`.
- Extended `src/tests/chat-ui-contract.test.mjs` for async follow-up controls and terminal cancelled UI.
- Updated `docs/IMPLEMENTATION_PLAN.md`, `docs/ACCEPTANCE_CRITERIA.md`, and `docs/DECISIONS.md`.

Proof:
- Static checks passed:
  - `node --check src/concierge/workerContinuations.mjs`
  - `node --check src/concierge/schema.mjs`
  - `node --check src/concierge/database.mjs`
  - `node --check src/server/server.mjs`
  - `node --check src/app/app.js`
- Focused tests passed:
  - `node --test src/tests/worker-continuations.test.mjs`
  - `node --test src/tests/chat-ui-contract.test.mjs`
  - `node --test src/tests/runtime-events.test.mjs`
- Build passed:
  - `npm run build`
- Full local suite passed after final UI polish:
  - `npm run test:local`
  - 92 tests total.
  - 91 passed.
  - 0 failed.
  - 1 skipped: live official OpenClaw dispatch remains gated behind `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`.
- Browser proof at `http://127.0.0.1:4173/` passed after a fresh server/app reload:
  - Local sign-in worked.
  - Benefits flow used live GPT routing with `openai_chatopenai_invoked · used`.
  - The pending worker proposal showed `Leave As Async Follow-Up`.
  - Creating follow-up produced `pending_async_followup`, `needs_long_running_followup`, `read_only_observation · read_only_observation`, `Actions taken none`, and `worker.followup.scheduled`.
  - Continue produced `continue_requested`, `worker.followup.continue_requested`, and no worker action.
  - Cancel produced `cancelled`, `not_possible_policy_or_approval_block`, `worker.followup.cancelled`, and no worker action.
  - The final cancelled card displayed `Cancelled follow-up is closed. Actions taken remain none.` and did not show an active continue button.

Result:
- Phase 8E turns long worker work into explicit persisted runtime state instead of another proposal-only dead end.
- LangGraph still owns the workflow, approval gate, and future worker dispatch.
- OpenClaw worker continuation is now ready to be consumed by the next official status-subagent bridge without relaxing the read-only MVP boundary.

Next step:
- Phase 8F should consume the persisted continuation from a fresh approved LangGraph run and bridge it to the dedicated official OpenClaw status/observation worker:
  - dispatch only the bound read-only status/observation action,
  - ingest worker progress and result through runtime events,
  - preserve user continue/cancel controls,
  - keep credentials, external messages, payer contact, form submission, record changes, and medical advice out of scope.

## Phase 8F: Approved Continuation Dispatch Bridge - 2026-05-29

User direction:
- Go to 8F.
- If it passes, write the project handoff to Cortex and build a PR for the changes.

Implementation:
- Extended `src/concierge/workerContinuations.mjs`:
  - validates continuation/task/session/user/workflow/read-only bindings before dispatch,
  - rejects cancelled, expired, completed, blocked, wrong-scope, wrong-task, wrong-session, and wrong-workflow continuations,
  - marks a valid continuation as `dispatching_official_openclaw` only after a fresh approval run,
  - finalizes official worker results as `completed` or `blocked`,
  - updates matching `scheduled_jobs` and `agent_tasks`,
  - publishes `worker.followup.dispatching`, `worker.followup.completed`, `worker.followup.blocked`, and `worker.followup.expired`,
  - preserves action history only after real official read-only worker actions occur.
- Updated `src/concierge/langgraphRunner.mjs`:
  - `workerContinuationId` now makes evidence observation enter the continuation bridge,
  - continuation dispatch requires `useOfficialOpenClawWorker: true`,
  - continuation readiness is checked before approval token consumption,
  - fresh approval is consumed only when the continuation can dispatch,
  - official OpenClaw result ingest finalizes the continuation and keeps the existing source-pointer/evidence flow.
- Updated `src/app/app.js`:
  - active continuation cards show `Approve + Run Official Read-Only`,
  - continuation run approval calls the existing read-only approval endpoint,
  - the next chat run carries `workerContinuationId` into LangGraph,
  - timeline rendering understands dispatching/completed/blocked/expired continuation events.
- Updated tests:
  - `src/tests/worker-continuations.test.mjs` now covers validation, consume-for-dispatch, finalize, and the pre-approval block when the official worker flag is missing.
  - `src/tests/openclaw-official-runtime.test.mjs` now wires the live official OpenClaw test through the continuation bridge when `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`.
  - `src/tests/chat-ui-contract.test.mjs` now asserts the 8F control and event vocabulary.
- Updated `docs/IMPLEMENTATION_PLAN.md`, `docs/ACCEPTANCE_CRITERIA.md`, and `docs/DECISIONS.md`.

Proof:
- Static checks passed:
  - `node --check src/concierge/workerContinuations.mjs`
  - `node --check src/concierge/langgraphRunner.mjs`
  - `node --check src/server/server.mjs`
  - `node --check src/app/app.js`
- Focused tests passed:
  - `node --test src/tests/worker-continuations.test.mjs`
  - `node --test src/tests/chat-ui-contract.test.mjs`
  - `node --test src/tests/langgraph-runner.test.mjs`
  - `node --test src/tests/openclaw-official-runtime.test.mjs`
  - `node --test src/tests/runtime-events.test.mjs`
- Build passed:
  - `npm run build`
- Browser proof at `http://127.0.0.1:4173/` passed after a fresh server/app restart:
  - Local sign-in worked.
  - Benefits workflow produced `Workflow Proof`.
  - Async follow-up scheduling showed `Approve + Run Official Read-Only`.
  - Follow-up card retained `read_only_observation`.
  - Runtime timeline showed `worker.followup.scheduled` and `worker.followup.continue_requested`.
  - Actions remained none before official dispatch.
- Full local suite passed:
  - `npm run test:local`
  - 94 tests total.
  - 93 passed.
  - 0 failed.
  - 1 skipped: live official OpenClaw continuation dispatch remains gated behind `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`.

Result:
- Phase 8F converts the 8E continuation record into a real LangGraph-owned bridge instead of a UI-only queue item.
- The system now has the intended cycle boundary: pending proposal -> async continuation -> fresh read-only approval -> official OpenClaw dispatch -> result/blocked finalization -> runtime events/audit.
- A wrong or incomplete continuation run fails before approval is consumed.

Next step:
- Phase 8G should run and polish the full authenticated continuation path with the dedicated logged-in OpenClaw browser:
  - user manually signs in,
  - chat schedules follow-up,
  - user approves and runs official read-only follow-up,
  - LangGraph verifies DOM/accessibility plus OCR evidence,
  - chat shows completed/blocked continuation status and sourced benefits,
  - product memory retains only source-pointer grounded summaries.

## Phase 8G: Authenticated Current-Tab Continuation Proof - 2026-05-29

User direction:
- Go to Phase 8G.

Implementation:
- Updated `src/concierge/openclawOfficialRuntime.mjs`:
  - added official OpenClaw tab discovery through `openclaw browser --json tabs`,
  - exposes tab count/current-tab summary in official readiness,
  - added current-tab observation mode for already-authenticated portal pages,
  - fails closed with `official_openclaw_current_tab_missing` when no tab is available,
  - focuses the current tab when possible,
  - captures accessibility-tree, CDP screenshot, and local OCR evidence without navigating away first.
- Updated `src/concierge/langgraphRunner.mjs`:
  - passes `officialOpenClawUseCurrentTab` / `BRAINSTY_OPENCLAW_USE_CURRENT_TAB=1` into the official worker observation node.
- Updated `src/app/index.html` and `src/app/app.js`:
  - added `Use current OpenClaw tab`,
  - `Portal Ready` now enables live proof, official worker dispatch, and current-tab mode,
  - official status shows the current tab and open-tab count,
  - approved follow-up dispatch carries the current-tab flag.
- Updated `src/tests/openclaw-official-runtime.test.mjs`:
  - added a live-gated authenticated current-tab continuation proof.
- Updated `package.json`:
  - added `npm run test:live:openclaw-auth`, narrowed to only the authenticated current-tab test so it does not first navigate the browser through the public payer fail-closed test.
- Updated `src/tests/chat-ui-contract.test.mjs` for the current-tab UI and payload contract.

Proof:
- Static checks passed:
  - `node --check src/concierge/openclawOfficialRuntime.mjs`
  - `node --check src/concierge/langgraphRunner.mjs`
  - `node --check src/app/app.js`
  - `node --check src/tests/openclaw-official-runtime.test.mjs`
  - `node --check src/server/server.mjs`
- Focused tests passed:
  - `node --test src/tests/openclaw-official-runtime.test.mjs`
  - `node --test src/tests/chat-ui-contract.test.mjs`
  - `node --test src/tests/worker-continuations.test.mjs`
  - `node --test src/tests/langgraph-runner.test.mjs`
- Build passed:
  - `npm run build`
- Full local suite passed:
  - `npm run test:local`
  - 95 tests total.
  - 93 passed.
  - 0 failed.
  - 2 skipped: public official OpenClaw live proof and authenticated current-tab live proof.
- Browser proof at `http://127.0.0.1:4173/` passed after a fresh server restart:
  - the app rendered `Use current OpenClaw tab`,
  - official status showed `official_openclaw_profile_ready · ready`,
  - official status showed current tab `none open` and open tabs `0`,
  - personal skills were still excluded from the project agent,
  - after local Sign In, `Portal Ready` checked live portal proof, official worker, and current-tab mode,
  - the chat message reminded that passwords, passkeys, SSN, and 2FA remain user-controlled.
- Live authenticated proof attempted:
  - `npm run test:live:openclaw-auth`
  - Result: failed loudly because the dedicated OpenClaw profile had no authenticated member-portal tab open.
  - Failure assertion: `The dedicated OpenClaw profile must have the authenticated member portal tab open.`
- Live authenticated proof passed after manual user login:
  - The dedicated profile showed a current `Home - Aetna` tab at `https://health.aetna.com/`.
  - `npm run test:live:openclaw-auth`
  - 1 test passed.
  - 0 failed.
  - Duration: about 46.8 seconds.
  - The test created source pointers through the approved current-tab official OpenClaw path.
- Chat UI proof passed after restarting the app with live-proof flags:
  - Server flags: `BRAINSTY_PORTAL_LIVE=1`, `BRAINSTY_OPENCLAW_USE_CURRENT_TAB=1`, `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`.
  - UI path: Sign In -> Benefits -> Leave As Async Follow-Up -> Portal Ready -> Approve + Run Official Read-Only.
  - Evidence status: `captured_official_openclaw_read_only_observation`.
  - Continuation status: `completed`.
  - Terminal outcome: `completed_with_sourced_result`.
  - Runtime events included `worker.followup.dispatching` and `worker.followup.completed`.
  - Actions included current-tab official OpenClaw start/use, accessibility snapshot, CDP screenshot, local OCR, member-portal verification, source-pointer recording, and eligibility snapshot persistence.
  - Result exposed 4 source pointers and 2 structured benefit rows in the chat Worker Result card.
- Local readiness confirmed:
  - dedicated profile `brainstyworkers` ready,
  - browser profile `openclaw` running on CDP port `19800`,
  - project agent `brainstyworkers-insurance-browser` ready,
  - `insurance-portal-browser`, `browser-automation`, and `ocr-local` ready,
  - personal skills excluded.

Result:
- Phase 8G implementation is wired and live-gated.
- The code now supports the desired authenticated proof shape: user signs in manually, LangGraph validates the bound continuation, approval is consumed once, OpenClaw observes the current authenticated tab read-only, DOM/accessibility plus OCR evidence is verified, and the continuation completes or blocks.
- The live proof is complete for both the test-runner lane and the user-facing chat UI lane.

Next step:
- Harden the post-success MVP loop:
  - make the completed continuation card terminal in the UI so it no longer shows active continue/cancel/run buttons after completion,
  - make missing-data wording recognize that portal evidence has now been captured,
  - add a compact user-facing final answer that cites source pointers without exposing raw portal text,
  - keep the operator trace available for audit/debug proof.

## Phase 8H: Post-Success Chat Loop Hardening - 2026-05-29

Request:
- Go to Phase 8H after the authenticated current-tab OpenClaw proof passed.

Implementation:
- Updated `src/concierge/outputPolicy.mjs` and `src/concierge/langgraphRunner.mjs`:
  - successful read-only evidence answers now use a compact source-pointer-grounded response,
  - the answer keeps structured benefit rows and source pointer ids,
  - the answer avoids raw portal text and direct user identity strings,
  - the official OpenClaw read-only mode is described as DOM/accessibility plus visual OCR verified by LangGraph.
- Updated `src/app/app.js`:
  - added captured-evidence detection for `source_pointers` and evidence statuses,
  - filtered satisfied portal evidence/data-pointer missing-info lines after source pointers exist,
  - replaced matching worker continuation cards in place by continuation id,
  - terminal continuations now show closed-state text and no active approve/run/continue/cancel controls.
- Updated `src/tests/langgraph-runner.test.mjs`:
  - asserts compact final answers still cite source pointers and structured benefits,
  - asserts evidence answers no longer use the older enrollment-style identity text.
- Updated `src/tests/chat-ui-contract.test.mjs`:
  - asserts the terminal continuation-card and stale-portal-prompt contracts.
- Hardened `src/concierge/portalEvidenceVerifier.mjs` after browser proof exposed a safety gap:
  - Aetna login/sign-in/credential pages are now classified as `login_or_credential_gate`,
  - login or credential gate pages fail closed and create no source pointers or eligibility snapshots.
- Hardened `src/concierge/structuredExtraction.mjs` after the official OpenClaw accessibility text shape surfaced parser drift:
  - consecutive duplicated ARIA money nodes are reconciled,
  - ARIA/link-style claim rows are parsed,
  - ARIA/link-style prior authorization rows are parsed.
- Hardened `src/concierge/database.mjs`:
  - SQLite shell busy timeout now defaults to 30 seconds through `BRAINSTY_SQLITE_BUSY_TIMEOUT_MS`,
  - this prevents concurrent local real-data tests from failing on transient shared-DB locks.
- Updated `src/tests/portal-evidence-verifier.test.mjs` and `src/tests/structured-extraction.test.mjs`:
  - login-page blocker coverage,
  - OpenClaw accessibility snapshot parser coverage.
- Updated planning docs for Phase 8H acceptance and decision context.

Proof:
- Static checks passed:
  - `node --check src/concierge/outputPolicy.mjs`
  - `node --check src/concierge/langgraphRunner.mjs`
  - `node --check src/app/app.js`
  - `node --check src/tests/langgraph-runner.test.mjs`
  - `node --check src/tests/chat-ui-contract.test.mjs`
  - `node --check src/concierge/portalEvidenceVerifier.mjs`
  - `node --check src/concierge/structuredExtraction.mjs`
  - `node --check src/concierge/database.mjs`
- Focused tests passed:
  - `node --test src/tests/langgraph-runner.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/worker-continuations.test.mjs`
  - 18 passed, 0 failed.
  - `node --test src/tests/structured-extraction.test.mjs src/tests/real-aetna-structured.test.mjs src/tests/portal-scan-real.test.mjs`
  - 6 passed, 0 failed.
  - `node --test src/tests/portal-evidence-verifier.test.mjs src/tests/openclaw-official-runtime.test.mjs`
  - 7 passed, 0 failed, 2 live-gated skipped.
  - `node --test src/tests/memory-harness.test.mjs src/tests/portal-scan-real.test.mjs`
  - 5 passed, 0 failed.
- Build passed:
  - `npm run build`
- Full local suite passed after stopping the dev server to avoid shared DB contention:
  - `npm run test:local`
  - 99 tests total.
  - 97 passed.
  - 0 failed.
  - 2 skipped: live-gated official OpenClaw tests.
- Browser proof at `http://127.0.0.1:4173/` passed with live flags:
  - server flags: `BRAINSTY_PORTAL_LIVE=1`, `BRAINSTY_OPENCLAW_USE_CURRENT_TAB=1`, `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1`,
  - path: Sign In -> Benefits -> Leave As Async Follow-Up -> Portal Ready -> Approve + Run Official Read-Only,
  - GPT decision mode: `openai_chatopenai_invoked` and used by router,
  - final answer was compact and cited 4 source pointers,
  - Workflow Proof showed `Missing info: none`,
  - Worker Result showed `completed_with_sourced_result`, official OpenClaw actions, 4 source pointers, and 2 structured benefit rows,
  - completed continuation card replaced the active card and showed no approve/run/continue/cancel controls.
- Browser proof also revealed and drove a safety fix:
  - an Aetna login URL/title must not be accepted as authenticated member evidence,
  - the verifier now blocks login/credential gates and tests assert no false evidence is created.
- Live authenticated official OpenClaw test passed after the verifier fix:
  - `npm run test:live:openclaw-auth`
  - 1 passed, 0 failed.

Next step:
- Phase 8I should turn the proof into a repeatable MVP harness and user-facing result surface:
  - a clean local journey reset/replay path,
  - a more focused final-answer panel in chat,
  - expandable operator proof for runtime timeline, source pointers, payload audits, and OpenClaw worker status.

## Phase 8I: Repeatable MVP Harness And Answer Surface - 2026-05-29

Request:
- Go to the next phase with real data and no mocks.

Implementation:
- Updated `src/app/index.html`, `src/app/styles.css`, and `src/app/app.js`:
  - added `Reset MVP Journey` and `Replay Benefits MVP` controls in the auth-plus-chat surface,
  - reset clears the local journey UI, closes the runtime event stream, clears active session selection, resets approval/live toggles, and keeps existing local database/audit records intact,
  - replay starts a real planned-user local session through `/api/orchestrator/auth-start` and sends the standard benefits question through `/api/chat`,
  - added a `Current Answer` panel that foregrounds the user answer, workflow, source-pointer ids, worker result/actions, structured benefit rows, GPT decision mode, and graph trace,
  - added answer-panel controls for read-only approval and async follow-up when the proposal task is still pending,
  - wrapped Workflow Proof, Worker Result, and the runtime timeline in expandable operator-proof sections so debug proof remains available without dominating the answer.
- Updated `src/tests/chat-ui-contract.test.mjs`:
  - asserts reset/replay controls,
  - asserts the final-answer panel contract,
  - asserts replay uses real auth plus `/api/chat`,
  - asserts operator proof remains expandable.
- Updated planning docs for Phase 8I acceptance, decision context, and Phase 8J direction.

Proof:
- Static checks passed:
  - `node --check src/app/app.js`
  - `node --check src/tests/chat-ui-contract.test.mjs`
- Focused tests passed:
  - `node --test src/tests/chat-ui-contract.test.mjs`
  - 6 passed, 0 failed.
  - `node --test src/tests/langgraph-runner.test.mjs src/tests/worker-continuations.test.mjs src/tests/openclaw-official-runtime.test.mjs`
  - 15 passed, 0 failed, 2 live-gated skipped.
- Build passed:
  - `npm run build`
- Full local suite passed:
  - `npm run test:local`
  - 101 tests total.
  - 99 passed.
  - 0 failed.
  - 2 skipped: live-gated official OpenClaw tests.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - `Reset MVP Journey` cleared the chat surface, session id, local auth state, runtime timeline, approval/live toggles, and answer panel without deleting database/audit records,
  - `Replay Benefits MVP` created a fresh local session through real planned-user auth,
  - the replay sent `Do I still owe anything before insurance starts paying?` through `/api/chat`,
  - live GPT returned `openai_chatopenai_invoked` and was used by the router,
  - the answer panel showed `approval needed`, the eligibility/benefits workflow, no source pointers yet, worker actions `none`, and the graph trace,
  - the answer panel exposed `Approve Read-Only Observation` and `Leave As Async Follow-Up`,
  - Workflow Proof, Worker Result, and Runtime Timeline were expandable operator-proof sections,
  - browser console had 0 errors.
- Authenticated current-tab live proof was rerun:
  - `npm run test:live:openclaw-auth`
  - failed loudly because the dedicated OpenClaw project profile did not currently have an authenticated member-portal tab open,
  - this matched the intended safety boundary: no source pointer or eligibility snapshot should be created without an authenticated current tab.

Next step:
- Phase 8J should test OpenClaw as a richer adaptive read-only worker inside the same benefits workflow:
  - multi-page authenticated insurance-site navigation,
  - worker-chosen read-only browser/search/scrape paths inside the approved task,
  - 30-second status reporting,
  - per-page source pointers,
  - LangGraph verification and final-answer composition.

## Phase 8J: Multi-Page Read-Only OpenClaw Worker Navigation - 2026-05-30

Request:
- Go to the next phase with real data, not mocks, and test OpenClaw as a harder worker inside the existing benefits MVP.

Implementation:
- Updated `src/concierge/openclawOfficialRuntime.mjs`:
  - added same-origin read-only navigation planning from observed portal DOM links,
  - selects benefits, spending, claims, and prior-authorization page goals from real portal links,
  - rejects logout/signout, profile, messages, forms, upload/document-submission, and other unsafe paths,
  - captures each observed page with accessibility-tree text, CDP screenshot, local OCR, DOM links, and a local page-observation artifact,
  - stores unique per-page screenshot files instead of overwriting a single screenshot,
  - prefers exact CDP target URL matching before same-host fallback.
- Updated `src/concierge/langgraphRunner.mjs`:
  - passes multi-page worker intent into the official OpenClaw observation node,
  - verifies every observed page before source-pointer creation,
  - records `partial_result_with_blockers` when some observed pages fail verification,
  - publishes worker runtime events with page count, verified page count, blocked page count, evidence channels, navigation plan, structured benefit count, and actions.
- Updated OpenClaw worker contracts and repo skill artifact:
  - allowed same-site read-only internal navigation,
  - added per-page DOM/OCR evidence expectations,
  - kept LangGraph as workflow master, verifier, product-memory owner, and final-response owner.
- Updated the chat UI:
  - added a `Multi-page read-only worker` toggle,
  - `Portal Ready` enables current-tab and multi-page read-only worker mode,
  - Worker Result and Current Answer now show pages, verified/blocked page counts, navigation plan, evidence channels, and worker actions.
- Added `npm run test:live:openclaw-multipage` for the live authenticated multi-page proof path.
- Updated tests for:
  - real Aetna link navigation planning,
  - UI multi-page proof fields,
  - worker contract per-page navigation/evidence fields,
  - live authenticated current-tab test compatibility with optional multi-page mode.

Proof so far:
- Static checks passed:
  - `node --check src/concierge/openclawOfficialRuntime.mjs`
  - `node --check src/concierge/langgraphRunner.mjs`
  - `node --check src/concierge/openclawWorkerContract.mjs`
  - `node --check src/app/app.js`
  - `node --check src/tests/openclaw-official-runtime.test.mjs`
  - `node --check src/tests/chat-ui-contract.test.mjs`
  - `node --check src/tests/openclaw-worker-contract.test.mjs`
- Focused tests passed:
  - `node --test src/tests/openclaw-official-runtime.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/openclaw-worker-contract.test.mjs src/tests/openclaw-skill-artifacts.test.mjs`
  - 17 tests total.
  - 15 passed.
  - 0 failed.
  - 2 skipped: live-gated official OpenClaw tests.
- Build passed:
  - `npm run build`
- Full local suite passed:
  - `npm run test:local`
  - 103 tests total.
  - 101 passed.
  - 0 failed.
  - 2 skipped: live-gated official OpenClaw tests.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - page title: `Brainstyworkers AI Concierge`,
  - auth-plus-chat surface loaded,
  - `Reset MVP Journey`, `Replay Benefits MVP`, `Use official OpenClaw worker`, `Use current OpenClaw tab`, and `Multi-page read-only worker` controls were present,
  - answer panel and runtime timeline were present,
  - browser console had 0 errors.

Next step:
- Run the live authenticated multi-page proof when the dedicated OpenClaw browser profile is already signed in to the member portal:
  - `npm run test:live:openclaw-multipage`
- If it passes, use the app UI to run:
  - Sign In -> Benefits/Replay -> Leave As Async Follow-Up -> Portal Ready -> Approve + Run Official Read-Only,
  - verify the Worker Result shows multi-page navigation, per-page verification, source pointers, and no external actions.

## Phase 8K: User-Friendly Live Worker Readiness And Recovery - 2026-05-30

Request:
- Prepare the user-friendly MVP path for testing the deterministic LangGraph harness, the versatile OpenClaw worker, real scraping/navigation, and safe recovery when auth or workflow blockers appear.

Implementation:
- Added `src/concierge/openclawLiveReadiness.mjs`:
  - classifies official OpenClaw readiness into profile/browser not ready, auth required, auth/challenge required, public portal page requiring user navigation, and ready-for-read-only-approval states,
  - exposes allowed worker attempts after approval: dedicated current-tab reuse, same-site portal navigation, DOM/accessibility scrape, visual OCR confirmation, configured read-only/public lookup, and manual-export fallback,
  - keeps blocked actions explicit: credential entry, password manager access, passkeys/2FA, SSN entry, payer contact, external messages, form submission, record modification, and medical advice,
  - returns terminal outcomes for sourced success, missing user data, portal block, manual export, and long-running follow-up.
- Updated `GET /api/openclaw/official/status`:
  - returns the existing official OpenClaw profile readiness plus `liveReadiness`,
  - keeps the same dedicated project OpenClaw profile and does not use the user's personal OpenClaw profile.
- Updated the auth-plus-chat UI:
  - added `Live Worker Readiness`, `Check Live Worker`, current-tab summary, next action, approval state, worker versatility, blocked actions, and fallback chain,
  - `Portal Ready` now checks live readiness before telling the user whether the worker is ready,
  - live proof/current-tab/multi-page preferences are still approval-gated and read-only.
- Updated `brainstyworkers_ai_concierge_prompt.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/ACCEPTANCE_CRITERIA.md`, and `docs/DECISIONS.md`:
  - records that OpenClaw can be versatile after LangGraph approval,
  - records that auth recovery remains user-controlled and cannot be bypassed by OpenClaw.

Proof:
- Static checks passed:
  - `node --check src/concierge/openclawLiveReadiness.mjs`
  - `node --check src/server/server.mjs`
  - `node --check src/app/app.js`
  - `node --check src/tests/openclaw-live-readiness.test.mjs`
- Focused tests passed:
  - `node --test src/tests/openclaw-live-readiness.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/openclaw-official-runtime.test.mjs`
  - 17 tests total.
  - 15 passed.
  - 0 failed.
  - 2 skipped: live-gated official OpenClaw tests.
- Build passed:
  - `npm run build`
- Full local suite passed:
  - `npm run test:local`
  - 109 tests total.
  - 107 passed.
  - 0 failed.
  - 2 skipped: live-gated official OpenClaw tests.
- Browser proof at `http://127.0.0.1:4173/` passed after restarting the local server:
  - page title: `Brainstyworkers AI Concierge`,
  - `Live Worker Readiness`, `Check Live Worker`, `Portal Ready`, `Use current OpenClaw tab`, `Multi-page read-only worker`, and runtime timeline were present,
  - `Check Live Worker` returned `liveReadiness.status=auth_required`,
  - the UI told the user to open the member portal in the dedicated OpenClaw browser profile and sign in manually,
  - the UI rendered worker versatility, blocked actions, and fallback chain,
  - browser console had 0 errors.
- In-app screenshot capture was attempted for the proof, but the browser CDP screenshot command timed out. DOM/API/browser-console proof passed.

Next step:
- Phase 8L should run the guided live flow from the app with the dedicated OpenClaw profile already authenticated:
  - `Check Live Worker` should report `ready_for_read_only_approval`,
  - run Benefits MVP chat,
  - approve read-only observation,
  - verify multi-page source pointers, structured answer, worker status, and terminal outcome in chat,
  - if the portal blocks automation, return `not_possible_insurance_portal_block` or `needs_user_manual_export` rather than silently failing.

## Phase 8L: Guided Live App Multi-Page OpenClaw Proof - 2026-05-30

Request:
- Continue after the user manually logged into the dedicated project OpenClaw browser profile.
- Prove the user-facing auth-plus-chat MVP path can run the real LangGraph approval loop, dispatch the official OpenClaw read-only worker, navigate multiple authenticated portal pages, and return source-pointer proof in chat.

Implementation:
- Updated `src/concierge/openclawLiveReadiness.mjs`:
  - treats known authenticated member portal hosts such as `health.aetna.com` and `member.aetna.com` as valid readiness starts,
  - still blocks login, credential, challenge, public marketing, and non-member pages before approval.
- Updated `src/concierge/workerContinuations.mjs`:
  - treats `partial_result_with_blockers` as a completed continuation when verified source pointers exist,
  - keeps blocked/no-evidence outcomes as blocked.
- Updated `src/concierge/langgraphRunner.mjs` and `src/concierge/outputPolicy.mjs`:
  - recognizes `captured_official_openclaw_multi_page_read_only_observation` as captured evidence,
  - composes the current answer as an executed sourced result instead of falling through to proposal-only wording,
  - reports the dedicated official OpenClaw profile, same-site navigation, DOM/accessibility checks, OCR, and verified page count.
- Added `src/tests/output-policy.test.mjs` and expanded live official OpenClaw assertions so final answers must cite source pointers and must not say the approved worker was "not executed in this slice."
- Added the new output-policy test to `npm run test:local`.

Proof:
- Static checks passed:
  - `node --check src/concierge/langgraphRunner.mjs`
  - `node --check src/concierge/outputPolicy.mjs`
  - `node --check src/tests/output-policy.test.mjs`
  - `node --check src/tests/openclaw-official-runtime.test.mjs`
- Focused tests passed:
  - `node --test src/tests/output-policy.test.mjs src/tests/langgraph-runner.test.mjs src/tests/worker-continuations.test.mjs src/tests/openclaw-live-readiness.test.mjs src/tests/openclaw-official-runtime.test.mjs`
  - 27 tests total.
  - 25 passed.
  - 0 failed.
  - 2 skipped: live-gated official OpenClaw tests.
- Build passed:
  - `npm run build`
- Live authenticated multi-page OpenClaw proof passed:
  - `npm run test:live:openclaw-multipage`
  - 1 test passed.
  - 0 failed.
- Browser proof at `http://127.0.0.1:4173/` passed after restarting the local server with live flags:
  - `Check Live Worker` reported `ready_for_read_only_approval` on the dedicated authenticated Aetna member portal tab,
  - `Portal Ready` enabled live proof, official worker, current-tab, and multi-page mode,
  - the Benefits MVP path used live GPT routing with `openai_chatopenai_invoked`,
  - the answer panel first showed approval needed with `actions none`,
  - after `Approve Read-Only Observation`, the current answer showed `sourced answer`,
  - evidence status was `captured_official_openclaw_multi_page_read_only_observation`,
  - Worker Result showed `completed_with_sourced_result`,
  - pages showed `2/2` verified,
  - 3 source pointers were displayed,
  - worker actions included current-tab reuse, accessibility snapshots, CDP screenshots, local OCR, same-site internal link navigation, authenticated portal verification, source-pointer recording, eligibility snapshot persistence, and multi-page verification,
  - browser console had 0 errors.
- In-app screenshot capture was attempted for the final proof but the browser CDP screenshot command timed out. DOM/UI/API/console proof passed.

Observed residual risks:
- The approved live app run returned no structured deductible/out-of-pocket rows because the current authenticated page was Claims-oriented; the worker still produced verified source pointers.
- Product memory retain reported `graphiti · retained false` in the UI during this run. This did not block the sourced answer, but Phase 8M should harden Graphiti retain/retry and surface memory state more clearly.
- The UI conversation history still contains the earlier pre-approval proposal-only message, which correctly says the worker was not executed before approval. The Current Answer is now the sourced executed answer.

Next step:
- Phase 8M should harden the user-facing MVP result loop:
  - make the Current Answer visually distinguish current sourced result from older pre-approval history,
  - add a retry/repair path for Graphiti retain failures,
  - improve structured extraction for Claims/Benefits pages without exposing raw portal text,
  - keep the proof dashboard available but make the auth-plus-chat path the primary MVP test surface.

## Phase 8M: OpenClaw Insurance Skill Playbook And Contract Hardening - 2026-05-30

Request:
- Continue to the next phase and include the richer OpenClaw skill behavior requested by the user.
- Align the project worker prompt with the desired insurance-site playbook: autonomous read-only navigation after user-controlled auth, DOM/accessibility extraction, OCR, portal search, PDFs/documents, structured insurance data, status updates, uncertainty, and source pointers.

Implementation:
- Updated `openclaw/skills/insurance-portal-browser/SKILL.md`:
  - added the Insurance Site Tooling Strategy,
  - added browser navigation, user-auth handoff, DOM/accessibility extraction, local OCR, portal search, document/PDF handling, reasoning/validation, structured return payload, and quality bar,
  - kept credential/password/passkey/2FA/captcha/SSN handling user-only.
- Updated `openclaw/skills/insurance-portal-browser/skill.json`:
  - added `portal_search`, `read_only_document_download`, and `pdf_extraction_analysis`,
  - added portal section strategy, structured answer schema, document policy, and quality bar.
- Refreshed the dedicated project OpenClaw workspace copy:
  - `~/.openclaw-brainstyworkers/workspace-brainstyworkers/skills/insurance-portal-browser/SKILL.md`
  - `~/.openclaw-brainstyworkers/workspace-brainstyworkers/skills/insurance-portal-browser/skill.json`
  - SHA-256 hashes match the repo artifact.
- Updated `src/concierge/openclawSkillArtifacts.mjs`:
  - validates the richer skill playbook, portal sections, structured schema, document/PDF policy, and quality bar.
- Updated `src/concierge/openclawWorkerContract.mjs`:
  - transmits portal section hints, data collection fields, document policy, quality bar, and auth boundary,
  - allows portal search, official read-only documents, PDF analysis, and structured insurance extraction inside the assigned task,
  - blocks password-manager/auth-challenge handling and all irreversible/external actions.
- Updated `src/concierge/promptContracts.mjs`:
  - adds an editable Insurance Site Tooling Strategy and Insurance Data Collection Targets to the OpenClaw arm prompt contract,
  - requires JSON-compatible fields for `authenticated`, `data_collected`, `answer`, `evidence`, `uncertainties`, and `recommended_next_steps`.
- Updated tests:
  - `src/tests/openclaw-skill-artifacts.test.mjs`
  - `src/tests/openclaw-worker-contract.test.mjs`
  - `src/tests/prompt-contracts.test.mjs`
- Updated docs and governing prompt:
  - `brainstyworkers_ai_concierge_prompt.md`
  - `docs/IMPLEMENTATION_PLAN.md`
  - `docs/ACCEPTANCE_CRITERIA.md`
  - `docs/DECISIONS.md`

Proof:
- Static checks passed:
  - `node --check src/concierge/openclawSkillArtifacts.mjs`
  - `node --check src/concierge/openclawWorkerContract.mjs`
  - `node --check src/concierge/promptContracts.mjs`
  - `node --check src/tests/openclaw-skill-artifacts.test.mjs`
  - `node --check src/tests/openclaw-worker-contract.test.mjs`
  - `node --check src/tests/prompt-contracts.test.mjs`
- Focused tests passed:
  - `node --test src/tests/openclaw-skill-artifacts.test.mjs src/tests/openclaw-worker-contract.test.mjs src/tests/prompt-contracts.test.mjs src/tests/chat-ui-contract.test.mjs`
  - 15 tests total.
  - 15 passed.
  - 0 failed.
- Build passed:
  - `npm run build`
- Full local suite passed:
  - `npm run test:local`
  - 112 tests total.
  - 110 passed.
  - 0 failed.
  - 2 skipped: live-gated official OpenClaw tests.

Known risks:
- This slice hardens contracts and the installed project skill copy; it does not run a fresh live OpenClaw browser proof.
- The next live proof should verify the enriched playbook against the authenticated portal and check whether portal search/document/PDF branches are reachable.
- Graphiti retain retry/repair and clearer user-facing memory state are still pending from the prior Phase 8M plan and should move into Phase 8N.

Next step:
- Phase 8N should use the enriched skill in the user-facing MVP result loop:
  - separate Current Answer from older pre-approval history,
  - add Graphiti retain retry/repair and clearer memory status,
  - improve structured extraction for benefits/claims pages while preserving source-pointer-only responses,
  - keep auth-plus-chat as the primary MVP test surface and the proof dashboard as operator/debug support.

## Phase 8N: Auth-Plus-Chat Result Loop, Memory Repair, And Claims Pointers - 2026-05-30

Request:
- Go to the next phase after enriching the OpenClaw insurance worker skill.

Implementation:
- Updated the chat MVP surface in `src/app/app.js` and `src/app/styles.css`:
  - Current Answer now states it is the latest LangGraph result for the active session,
  - newest assistant graph-run messages are marked with a current-answer style,
  - Current Answer now shows structured claims/prior authorization summaries and product-memory retain/repair status,
  - Worker Result now shows structured claims alongside structured benefits,
  - memory runtime events render retain attempts, repair status, next action, and repaired state.
- Updated `src/concierge/productMemory.mjs`:
  - added Graphiti retain repair classification,
  - distinguishes retryable runtime failures from payload-policy failures,
  - retries fast retryable retain failures once unless `BRAINSTY_PRODUCT_MEMORY_RETAIN_RETRY=0`,
  - avoids automatic retry after timeouts and returns the next repair action,
  - audits repaired or failed retain attempts with repair metadata.
- Updated `src/concierge/langgraphRunner.mjs`:
  - publishes product-memory repair metadata in `memory.retained` runtime events,
  - adds `claim_items` and `prior_authorizations` to source-pointer fan-in when structured extraction finds them,
  - carries structured claims/prior authorizations in evidence observations and worker status events.
- Updated `src/concierge/outputPolicy.mjs`:
  - includes a source-pointer-safe structured claims/prior-authorization line in sourced answers.
- Updated tests:
  - `src/tests/chat-ui-contract.test.mjs`
  - `src/tests/product-memory-contract.test.mjs`
  - `src/tests/output-policy.test.mjs`
  - `src/tests/langgraph-runner.test.mjs`
- Updated governing/planning docs:
  - `brainstyworkers_ai_concierge_prompt.md`
  - `docs/IMPLEMENTATION_PLAN.md`
  - `docs/ACCEPTANCE_CRITERIA.md`
  - `docs/DECISIONS.md`

Proof so far:
- Static checks passed:
  - `node --check src/concierge/productMemory.mjs`
  - `node --check src/concierge/langgraphRunner.mjs`
  - `node --check src/concierge/outputPolicy.mjs`
  - `node --check src/app/app.js`
  - `node --check src/tests/product-memory-contract.test.mjs`
  - `node --check src/tests/langgraph-runner.test.mjs`
  - `node --check src/tests/output-policy.test.mjs`
  - `node --check src/tests/chat-ui-contract.test.mjs`
- Focused tests passed:
  - `node --test src/tests/product-memory-contract.test.mjs src/tests/output-policy.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/langgraph-runner.test.mjs`
  - 20 tests total.
  - 20 passed.
  - 0 failed.
- Build passed:
  - `npm run build`
- Full local suite passed:
  - `npm run test:local`
  - 113 tests total.
  - 111 passed.
  - 0 failed.
  - 2 skipped: live-gated official OpenClaw tests.
- Browser proof at `http://127.0.0.1:4173/` passed after restarting the local server:
  - page title: `Brainstyworkers AI Concierge`,
  - initial app loaded with Current Answer, Replay Benefits MVP, Live Worker Readiness, and Zep Graphiti Runtime surfaces,
  - Replay Benefits MVP completed through the real local auth-plus-chat path,
  - Current Answer showed `Latest LangGraph result for this session`,
  - Current Answer included Claims and Memory fields,
  - Workflow Proof and Worker Result were present,
  - the newest assistant graph-run message had the latest-answer marker,
  - browser console had 0 errors.
- Screenshot capture was attempted through the in-app browser but timed out on the CDP screenshot command. DOM/UI/console proof passed.

Known risks:
- Graphiti repair retry is implemented and unit-tested by classification, but a fresh live Graphiti repair failure was not forced in this slice.
- The next live worker proof should check whether the enriched skill can find portal search or official document/PDF/SBC surfaces from the authenticated portal.

Next step:
- Phase 8O should run a live authenticated worker pass that specifically tries portal search, document discovery, SBC/PDF handling, and richer same-site navigation, while preserving user-controlled auth and LangGraph approval.

## Phase 8O: OpenClaw Search And Document Discovery Proof - 2026-05-30

Request:
- Go to the next phase after the enriched OpenClaw skill and user-facing result loop.

Implementation:
- Updated `src/concierge/openclawOfficialRuntime.mjs`:
  - added `buildOfficialOpenClawDiscoveryReport`,
  - scans DOM/accessibility/CDP evidence for portal search affordances without submitting a query,
  - scans same-site links for official document, SBC, and PDF candidates without downloading documents,
  - classifies document candidates as read-only-openable or blocked by mixed form, submission, offsite, or non-read-only areas,
  - records portal sections tried/reachable and the fallback chain,
  - records `openclaw_portal_search_affordance_scan` and `openclaw_document_candidate_discovery` browser actions.
- Updated `src/concierge/langgraphRunner.mjs`:
  - carries discovery proof into official OpenClaw evidence observations,
  - publishes discovery counts in `worker.status.updated`,
  - includes discovery metadata when finalizing worker continuations.
- Updated `src/concierge/outputPolicy.mjs`:
  - sourced answers now state portal search status, document candidate count, and SBC/PDF candidate count without exposing raw portal text.
- Updated `src/app/app.js`:
  - Current Answer, Workflow Proof, Worker Result, and runtime timeline now show discovery status.
- Updated tests:
  - `src/tests/openclaw-official-runtime.test.mjs`,
  - `src/tests/output-policy.test.mjs`,
  - `src/tests/chat-ui-contract.test.mjs`.

Proof so far:
- Static checks passed:
  - `node --check src/concierge/openclawOfficialRuntime.mjs`
  - `node --check src/concierge/langgraphRunner.mjs`
  - `node --check src/concierge/outputPolicy.mjs`
  - `node --check src/concierge/workerContinuations.mjs`
  - `node --check src/app/app.js`
  - `node --check src/tests/openclaw-official-runtime.test.mjs`
- Focused tests passed:
  - `node --test src/tests/openclaw-official-runtime.test.mjs`
    - 5 tests total, 3 passed, 2 skipped live-gated.
  - `node --test src/tests/chat-ui-contract.test.mjs`
    - 7 passed.
  - `node --test src/tests/output-policy.test.mjs`
    - 1 passed.
  - `node --test src/tests/worker-continuations.test.mjs`
    - 6 passed.
- Build passed:
  - `npm run build`
- Full local suite passed:
  - `npm run test:local`
  - 114 tests total.
  - 112 passed.
  - 0 failed.
  - 2 skipped live-gated official OpenClaw tests.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - page title: `Brainstyworkers AI Concierge`,
  - initial shell loaded Current Answer and Replay Benefits MVP with 0 console errors,
  - Replay Benefits MVP completed through the local app path,
  - Current Answer showed `Latest LangGraph result for this session`,
  - Current Answer, Workflow Proof, and Worker Result showed the new Discovery field,
  - Discovery rendered `not reported` for the replay-only non-live run, as expected before official worker execution.
- Screenshot capture was attempted through the in-app browser but timed out on `Page.captureScreenshot`; DOM/UI/console proof passed.
- OpenClaw status API proof passed after restarting the local server:
  - `GET /api/openclaw/official/status` returned runtime version `2026-05-30.official-openclaw-runtime.v3`,
  - readiness was `ready=true`,
  - allowed actions included `portal_search_affordance_scan` and `document_candidate_discovery`,
  - live readiness was `auth_required` because the dedicated OpenClaw browser currently had no authenticated current tab open.

Known risks:
- This slice proves discovery/reporting and does not yet download or analyze PDFs.
- A fresh authenticated live run is still needed to inspect actual portal search/document/SBC/PDF availability from the user's current member portal.

Next step:
- Phase 8P should run the fresh live authenticated OpenClaw pass, inspect the discovery report in the app, and decide whether the next implementation should add read-only document/PDF ingestion or improve page-specific structured extraction first.

## Phase 8P: Live OpenClaw Discovery Proof Harness - 2026-05-30

Request:
- Go to the next phase.

Implementation:
- Added `npm run test:live:openclaw-discovery`.
- Expanded the live authenticated current-tab official OpenClaw test to assert:
  - sourced final answer includes `OpenClaw discovery proof`,
  - discovery report scanned portal search affordances without submitting a query,
  - document/SBC/PDF discovery ran without download or PDF analysis,
  - raw document dumps remain disallowed,
  - discovery actions are present in `actionsTaken`,
  - worker status events include discovery metadata and SBC/PDF counts.

Proof so far:
- Readiness checked through `GET /api/openclaw/official/status`:
  - official runtime version `2026-05-30.official-openclaw-runtime.v3`,
  - `ready=true`,
  - allowed actions include `portal_search_affordance_scan` and `document_candidate_discovery`.
- Opened the dedicated Brainstyworkers OpenClaw browser to `https://health.aetna.com/`.
- Readiness changed from `auth_required` to `auth_or_challenge_required` on `Aetna Member Log-in`.
- Static and local proof passed:
  - `node --check src/tests/openclaw-official-runtime.test.mjs`
  - `node --test src/tests/openclaw-official-runtime.test.mjs`
    - 5 tests total, 3 passed, 2 skipped live-gated.
  - `npm run build`

Current blocker:
- Resolved after the user manually logged in to the dedicated OpenClaw browser.

Live proof:
- `npm run test:live:openclaw-discovery`
  - 1 test total.
  - 1 passed.
  - 0 failed.
  - duration about 81 seconds.
- Readiness before the run:
  - `ready_for_read_only_approval`
  - current tab `Home - Aetna`
  - runtime `2026-05-30.official-openclaw-runtime.v3`
- Live discovery result:
  - terminal outcome `completed_with_sourced_result`,
  - 4 pages observed,
  - 4 pages verified,
  - 0 pages blocked,
  - 8 source pointers created,
  - portal search status `portal_search_available_not_submitted`,
  - portal search affordances found: 6 inputs, 6 buttons, 7 links,
  - document discovery status `document_candidates_recorded`,
  - 5 document candidates found,
  - 4 read-only document candidates,
  - 1 blocked/mixed document-form candidate,
  - 0 SBC/PDF candidates surfaced from the observed pages,
  - document candidate types included document center, ID card, plan document, and EOB,
  - sections tried: benefits, spending, claims,
  - sections reachable: benefits, spending, claims, prior authorizations, documents, pharmacy, ID card, and network.
- Actions included:
  - current-tab reuse,
  - accessibility snapshots,
  - CDP screenshots,
  - local OCR,
  - same-site internal navigation,
  - portal search affordance scan,
  - document candidate discovery,
  - authenticated portal verification,
  - source-pointer recording,
  - eligibility snapshot persistence,
  - multi-page read-only navigation verification.

Next step:
- Phase 8Q should use the live proof to improve the MVP value path:
  - add a user-visible Discovery/Next Evidence panel that names search availability and document candidates from source-pointer-safe metadata,
  - add page-specific structured extraction for benefits, spending, claims, prior authorization, ID card, pharmacy, network, and documents surfaces,
  - defer actual PDF/document ingestion until the UI can ask for a narrower read-only document approval and because the observed pages did not expose SBC/PDF candidates directly.

## Phase 8Q: User-Friendly MVP Sequencing App - 2026-05-30

Request:
- Build a user-friendly UI for the system without giving up the already running proof dashboard.
- Keep the phase aligned with the implementation flow and test the sequencing of the whole system.

Implementation:
- Added a separate `/mvp` route served by the existing Node/static app:
  - `src/app/mvp.html`,
  - `src/app/mvp.css`,
  - `src/app/mvp.js`.
- Kept `/` as the existing operator/debug proof dashboard and added an `Open MVP App` link from the dashboard top bar.
- Wired the new MVP app to the real APIs only:
  - local planned-user auth through `/api/orchestrator/auth-start`,
  - LangGraph chat through `/api/chat`,
  - live OpenClaw readiness through `/api/openclaw/official/status`,
  - read-only approval through `/api/orchestrator/approve`,
  - official worker continuation through `/api/worker-continuations`,
  - runtime proof through `/api/runtime/events` and `/api/runtime/events/stream`.
- Added a user-facing sequence view for:
  - Auth,
  - GPT / Intent,
  - Approval,
  - OpenClaw,
  - Evidence,
  - Memory,
  - Answer.
- Added workflow buttons that submit real chat messages instead of bypassing LangGraph.
- Added a Current Answer panel and Discovery/Next Evidence panel that render source-pointer-safe graph state.
- Added approval controls that can run read-only observation through the existing approval token and, for official OpenClaw, a worker continuation id.
- Added static contract coverage in `src/tests/chat-ui-contract.test.mjs`.

Proof so far:
- `node --check src/app/mvp.js` passed.
- `node --check src/server/server.mjs` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed:
  - 8 tests total,
  - 8 passed,
  - 0 failed.
- `npm run build` passed.
- Browser proof at `http://127.0.0.1:4173/mvp` passed:
  - route title loaded as `Brainstyworkers Concierge MVP`,
  - `Start Session` created a real local session `session_b191be2f-14e4-447c-b60a-866191cadf1b`,
  - `Benefits` submitted a real chat message through LangGraph,
  - Current Answer showed workflow `eligibility_benefits_navigation`,
  - Approval Gate showed a pending proposal task `task_c8fa9828-7d5b-4120-a863-1808732dcf4d`,
  - sequence state showed Auth done, GPT/Intent done, Approval pending, Answer ready,
  - Discovery/Next Evidence correctly stayed empty before approved worker execution,
  - browser console had 0 errors.
- Full local suite passed:
  - `npm run test:local`,
  - 115 tests total,
  - 113 passed,
  - 0 failed,
  - 2 skipped live-gated official OpenClaw tests.

Remaining proof:
- Live approved OpenClaw execution from `/mvp` remains gated by the user's authenticated dedicated OpenClaw browser and a read-only approval click.

Next step:
- Continue Phase 8Q by validating the MVP route in the browser, then move to section-specific structured extraction for the live-reachable portal surfaces before any PDF/document ingestion.

## Phase 8Q Restart Handoff - 2026-05-31

What was built since the last restart:
- A new user-friendly MVP app route exists at `http://127.0.0.1:4173/mvp`.
- The existing proof dashboard remains at `http://127.0.0.1:4173/`.
- The MVP route is not a mock and not a separate runtime. It calls the same local APIs used by the proof dashboard:
  - `/api/orchestrator/auth-start`,
  - `/api/chat`,
  - `/api/openclaw/official/status`,
  - `/api/orchestrator/approve`,
  - `/api/worker-continuations`,
  - `/api/runtime/events`,
  - `/api/runtime/events/stream`.
- The MVP route shows:
  - local planned-user auth,
  - workflow buttons as chat inputs,
  - Current Answer,
  - Auth -> GPT/Intent -> Approval -> OpenClaw -> Evidence -> Memory -> Answer sequence,
  - Approval Gate,
  - Discovery/Next Evidence,
  - runtime event timeline,
  - live OpenClaw readiness controls.

What to expect from `/mvp` right now:
- `Start Session` should create a real local session.
- `Benefits` should route through LangGraph to `eligibility_benefits_navigation`.
- Before approval, Current Answer should show a proposal/pending approval result and no source pointers.
- Approval Gate should show the pending read-only proposal task.
- Discovery/Next Evidence should remain empty until an approved worker run executes.
- If the user enables official OpenClaw and approves read-only observation, the app should create a worker continuation and resume the graph with the approval token.
- Source pointers should be created only if live portal proof is enabled and LangGraph verifies authenticated member portal evidence.

Next phases:
- Phase 8R: run the full live approved flow from `/mvp` with the dedicated OpenClaw browser authenticated and live portal proof enabled.
- Phase 8S: improve section-specific structured extraction for live-reachable portal surfaces before adding document ingestion.
- Phase 8T: add a narrow approval scope for one specific document candidate from Discovery.
- Phase 8U: add read-only PDF/document ingestion only after candidate-specific approval.
- Phase 8V: polish the user/operator split so `/mvp` is tester-friendly and `/` remains the proof dashboard.

Current proof baseline:
- Commit `05e0799 feat: add user-facing MVP sequencing app`.
- `node --check src/app/mvp.js` passed.
- `node --check src/server/server.mjs` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed.
- `npm run build` passed.
- Browser proof at `/mvp` passed with 0 console errors.
- `npm run test:local` passed with 115 tests total, 113 passed, 0 failed, and 2 live-gated official OpenClaw tests skipped.

Known blockers and guardrails:
- Live approved OpenClaw evidence from `/mvp` still requires the user-authenticated dedicated OpenClaw browser/profile.
- Official live evidence creation requires `BRAINSTY_PORTAL_LIVE=1` when live proof is required.
- The worker must not enter credentials, handle passkeys/2FA/captcha, use password managers, enter SSNs, contact payers, send messages, submit forms, change records, or provide medical advice.
- Cortex remains project memory only; Zep Graphiti remains the product-memory adapter path.

## Phase 8W External Portal Blocker Proof - 2026-06-01

What happened:
- Phase 8W was started from the current `/mvp` user-facing route and `/` operator dashboard.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `/mvp` created real session `session_b11af8e4-24f0-434e-a057-ccd812af080d`.
- The Benefits question routed through LangGraph with live GPT decisioning.
- A read-only OpenClaw proposal task was created: `task_d520ef97-cbde-4580-89cf-cdf151fc2112`.
- `/` loaded the same session and showed the same trace/proposal state.

Live blocker:
- The Aetna website/member portal was unavailable during the live proof window.
- `/api/openclaw/official/status` returned `auth_required` / no current authenticated OpenClaw tab.
- The approved official OpenClaw continuation was allowed to fail closed as a real no-mock proof.

Fail-closed proof:
- Approval token `approval_ade458e2-3145-4382-8247-71f037ddb635` was consumed for the pending read-only task.
- Worker continuation `cont_ad27cb6c-2e6a-49b1-a579-9b78bbf26176` finalized as `blocked`.
- Terminal outcome was `not_possible_insurance_or_portal_block`.
- Evidence observation status was `blocked_no_authenticated_evidence`.
- Browser run `browser_74c70314-d1c8-4b96-b856-e524a18080f2` recorded the missing current OpenClaw tab/authenticated portal state.
- Source pointer count remained 0.
- Document candidate count remained 0.
- No eligibility snapshot, payer contact, external message, credential entry, medical advice, form submission, or account mutation was created.

Hardening added:
- `compose_response` now treats `blocked_no_authenticated_evidence` as a first-class user-facing result.
- The blocked answer says the live insurance portal evidence step is blocked, lists the scoped worker actions attempted, states that no source pointers or document candidates were created, and tells the tester to rerun after manually signing in through the dedicated OpenClaw browser profile.
- A regression test was added for approved-but-unavailable portal evidence.

Verification after hardening:
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --test src/tests/langgraph-runner.test.mjs` passed with 10 tests total, 10 passed, 0 failed.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.

Next step:
- The user accepted this external-blocker outcome as OK to proceed.
- Start the complementary Wefella/FastAPI alignment as a facade over the existing runtime, not as a rewrite.
- Retry the full live Aetna path when the portal is available again:
  - sign in manually in the dedicated OpenClaw browser profile,
  - rerun Benefits from `/mvp`,
  - approve read-only portal observation,
  - confirm source pointers and discovery candidates,
  - approve one document candidate,
  - verify `/mvp` and `/` agree on trace, audit, source pointers, worker continuation, and Graphiti retain.

## Phase 9A FastAPI Facade - 2026-06-01

What was built:
- Added a complementary FastAPI backend facade under `project/api/`.
- The facade does not replace Node/LangGraph/OpenClaw/Zep Graphiti. It calls the existing Node `/api/chat` runtime internally.
- Added local development JWT handling:
  - `Authorization: Bearer <token>` is required for chat and status endpoints,
  - JWT subject must match `user_id`,
  - `GET /api/health` remains public.
- Added async task handling:
  - `POST /api/chat` returns `session_id`, `task_id`, and `queued`,
  - `GET /api/chat/status/{task_id}` returns queued/running/completed/failed task state,
  - `GET /api/chat/stream/{task_id}` emits SSE-style task events and terminal result.
- Added scripts:
  - `npm run facade:dev`,
  - `npm run test:facade`.
- Added environment examples:
  - `WEFELLA_NODE_RUNTIME_URL`,
  - `WEFELLA_JWT_SECRET`,
  - `WEFELLA_ALLOWED_ORIGINS`.
- Extended `npm run build` so the facade files are part of the file-presence gate.

What was tested:
- `python3 -m compileall -q project` passed.
- `npm run test:facade` passed with the explicit live delegation test skipped by default.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed against the running Node runtime at `http://127.0.0.1:4173`.
- `npm run build` passed after adding facade files to the build check.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.

Important implementation note:
- The production FastAPI path uses background task execution so the client gets a task id and can poll or stream status.
- The test app can run the task inline only for the live in-process TestClient proof, because TestClient does not keep server background tasks alive like uvicorn does.
- The live proof still delegates to the real Node runtime and does not use a mocked agent result.

Next step:
- Phase 9B should add an optional facade-backed mode to `/mvp`, so the same user-facing workflow can be exercised through FastAPI and compared against the direct Node path.
- Keep `/` as the operator proof dashboard and Node/LangGraph/OpenClaw as the source of truth until facade parity is proven.

## Phase 9B MVP Facade Route - 2026-06-01

What was built:
- `/mvp` now has a Backend/API Route panel with:
  - direct Node/LangGraph runtime,
  - Wefella FastAPI facade,
  - FastAPI URL,
  - facade health check,
  - facade route activation.
- FastAPI added `POST /api/auth/local-session` for local MVP auth:
  - it delegates planned-user auth-start to the existing Node runtime,
  - it returns the enrollment plus a local bearer token whose subject is the Node user id.
- FastAPI task registry now stores task owner user ids.
- FastAPI status and stream endpoints now reject task access from a different JWT subject.
- FastAPI chat requests now pass through current MVP graph options:
  - approval token/task id,
  - worker continuation id,
  - read-only evidence execution flag,
  - live portal proof flag,
  - official OpenClaw worker/current-tab/multi-page flags,
  - document candidate approval scope and candidate id.
- `/mvp` can submit chat through FastAPI:
  - `POST /api/chat`,
  - `GET /api/chat/stream/{task_id}` using bearer auth over fetch streaming,
  - fallback to `GET /api/chat/status/{task_id}` polling.

What was tested:
- `python3 -m compileall -q project` passed.
- `npm run test:facade` passed with 7 tests, 6 passed and 1 expected live-gated skip.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 7 tests.
- `node --check src/app/mvp.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof at `http://127.0.0.1:4173/mvp` passed through the FastAPI facade:
  - selected Wefella FastAPI facade,
  - checked FastAPI health,
  - started local MVP auth through the facade,
  - submitted Benefits,
  - FastAPI accepted task `task_759cb89f-3289-4082-85c8-092edaffdc1d`,
  - task stream completed,
  - Current Answer rendered `eligibility_benefits_navigation`,
  - Approval Gate rendered pending task `task_94b6a654-0dae-4c95-8b51-6c26d4ff84b6`,
  - browser console had 0 errors.
- Screenshot proof saved at `/tmp/workerprototype_phase9b_facade_mvp.png`.

Current limitation:
- `/mvp` chat can route through FastAPI now, but approval, worker continuation, document candidate, OpenClaw readiness, and runtime event endpoints still call Node directly.
- This is intentional for Phase 9B. Phase 9C should proxy those surfaces through FastAPI before making FastAPI the only frontend entrypoint.

Next step:
- Phase 9C: add FastAPI proxies for MVP non-chat actions:
  - local approval,
  - worker continuations,
  - document candidate listing/proposal,
  - official OpenClaw readiness,
  - runtime events/status snapshot.
- After Phase 9C, run a side-by-side Node-direct versus FastAPI facade parity proof from `/mvp`.

## Phase 9C FastAPI MVP Action Proxies - 2026-06-01

What was built:
- FastAPI now proxies the remaining `/mvp` user-facing action endpoints:
  - `POST /api/orchestrator/approve`,
  - `GET /api/worker-continuations`,
  - `POST /api/worker-continuations`,
  - `POST /api/worker-continuations/{id}/cancel`,
  - `POST /api/worker-continuations/{id}/continue`,
  - `GET /api/document-candidates`,
  - `POST /api/document-candidates/propose`,
  - `GET /api/openclaw/official/status`,
  - `GET /api/runtime/events`,
  - `GET /api/runtime/events/stream`.
- FastAPI proxy requests are JWT-subject bound:
  - mismatched query/body user ids return 403,
  - omitted user ids are injected from the bearer-token subject.
- `/mvp` now uses FastAPI for runtime event stream/snapshot, OpenClaw readiness, approval, worker continuations, and document candidates when Wefella mode is selected.
- Direct Node mode remains available in `/mvp` for parity checks.
- `/` remains the Node-backed operator dashboard during this phase.

What was tested:
- `python3 -m compileall -q project` passed.
- `npm run test:facade` passed with 9 tests, 8 passed and 1 expected live-gated skip.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 9 tests.
- `node --check src/app/mvp.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof at `http://127.0.0.1:4173/mvp` passed through the FastAPI facade:
  - selected Wefella FastAPI route,
  - started local MVP auth through the facade,
  - facade runtime event stream opened,
  - checked official OpenClaw readiness through the facade and got `auth_required`,
  - submitted Benefits through the facade,
  - FastAPI accepted task `task_e62c8873-bbe8-4d1c-a14d-177af3d2348d`,
  - task stream completed,
  - document candidate load went through the facade,
  - runtime event snapshot went through the facade,
  - Current Answer rendered `eligibility_benefits_navigation`,
  - Approval Gate rendered pending task `task_022350c2-e3ac-41a8-819e-050a7a13378c`,
  - browser console had 0 errors.
- Screenshot proof saved at `/tmp/workerprototype_phase9c_facade_mvp.png`.

Next step:
- Phase 9D should make `/mvp` FastAPI-first by default, add an explicit Node-direct versus FastAPI parity comparison for the same Benefits prompt/session family, and keep direct Node as an operator escape hatch until the parity proof is stable.

## Phase 9D FastAPI-First MVP Parity - 2026-06-01

What was built:
- `/mvp` now defaults to the Wefella FastAPI facade route.
- The direct Node/LangGraph route remains selectable as an operator parity escape hatch.
- `/mvp` now includes a visible `Node vs FastAPI` parity panel.
- The parity panel runs the same Benefits prompt through:
  - direct Node local auth plus `/api/chat`,
  - FastAPI local auth plus protected async `/api/chat` and stream/status completion.
- The parity check uses separate temporary sessions so it does not overwrite the active user chat.
- The parity check compares stable graph-contract fields:
  - workflow,
  - intent,
  - approval state,
  - proposal status,
  - evidence status,
  - source-pointer count,
  - answer presence,
  - trace presence.
- The parity check is proposal-only and does not approve evidence observation or dispatch an OpenClaw worker.

What was tested:
- `python3 -m compileall -q project` passed.
- `npm run test:facade` passed with 9 tests, 8 passed and 1 expected live-gated skip.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 9 tests.
- `node --check src/app/mvp.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof at `http://127.0.0.1:4173/mvp` passed:
  - default route was `wefella`,
  - FastAPI health showed `0.1.0-phase9d-fastapi-first-parity` and Node connected,
  - parity compared Node direct and FastAPI facade with the same Benefits prompt,
  - parity result was `Parity passed`,
  - both routes matched `eligibility_benefits_navigation`, `eligibility_benefits_question`, pending approval, pending proposal, no requested evidence, 0 source pointers, answer present, and trace present,
  - no evidence observation or OpenClaw worker action was approved,
  - browser console had 0 errors.
- Screenshot proof saved at `/tmp/workerprototype_phase9d_fastapi_first_parity.png`.

Next step:
- Phase 9E should add production-grade auth/JWT provider alignment only if the user wants to continue the Wefella production API path now. Otherwise, the next product-value slice should keep testing the original MVP loop through FastAPI-first `/mvp`: approval, OpenClaw worker, source pointers, and Graphiti retain from one user-friendly session.

## Phase 9E Provider-Style JWT Alignment - 2026-06-01

What was built:
- FastAPI auth now has explicit auth modes:
  - default local development mode,
  - `WEFELLA_AUTH_MODE=provider` for stricter provider-style validation.
- Provider mode validates:
  - subject,
  - expiration,
  - not-before,
  - configured issuer,
  - configured audience.
- Provider mode requires:
  - `WEFELLA_JWT_ISSUER`,
  - `WEFELLA_JWT_AUDIENCE`.
- Local MVP auth at `POST /api/auth/local-session` is disabled by default in provider mode unless explicitly re-enabled.
- `GET /api/health` now returns safe auth metadata:
  - mode,
  - algorithm,
  - provider-claim requirement,
  - issuer configured,
  - audience configured,
  - local auth enabled.
- Health does not expose JWT secrets.
- FastAPI facade version is now `0.1.0-phase9e-provider-jwt-alignment`.
- `docs/goal_final_system.md` now records the final-system contract, current baseline, remaining MVP requirements, next phases, and completion evidence.

What was tested:
- `python3 -m compileall -q project` passed.
- `npm run test:facade` passed with 13 tests, 12 passed and 1 expected live-gated skip.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 13 tests against the running Node runtime at `http://127.0.0.1:4173`.
- `node --check src/app/mvp.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.

Next step:
- Phase 9F should test the FastAPI-first approved live loop from `/mvp` through approval, official OpenClaw continuation, source pointers or precise blocker, Graphiti retain, and matching operator proof.

## Phase 9F FastAPI-First Approved Loop Proof - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase9f-approved-loop-proof`.
- `/mvp` now labels the current user-facing proof as Phase 9F.
- `/mvp` now includes a `FastAPI Live Loop` proof panel that summarizes:
  - backend route,
  - session id,
  - graph trace,
  - approval state,
  - worker outcome,
  - evidence status,
  - source pointer count,
  - product-memory retain status,
  - precise blocker when evidence cannot be created.
- The Phase 9F panel links to the operator dashboard with the same session and user id.
- `/` now reads `?sessionId=...&userId=...` on load and opens the linked operator proof session automatically.
- FastAPI facade tests now include an approved-loop payload forwarding test that proves approval tokens, worker continuation ids, live portal flags, official OpenClaw flags, approval scope/action, and document candidate ids reach the Node/LangGraph runtime.
- The live Node facade test now runs the approved read-only loop through:
  - `POST /api/auth/local-session`,
  - `POST /api/chat` proposal,
  - `POST /api/worker-continuations`,
  - `POST /api/orchestrator/approve`,
  - approved `POST /api/chat` resume.
- The approved live loop accepts either verified source pointers or a precise blocker and asserts no credential, password, 2FA, submit, payer-contact, or external-message actions occur.

What was tested:
- `node --check src/app/mvp.js` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run test:facade` passed with 15 tests, 13 passed and 2 expected live-gated skips.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 15 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof at `http://127.0.0.1:4173/mvp` passed through the FastAPI facade:
  - facade health was connected to Node,
  - local planned-user auth succeeded,
  - Portal Ready enabled live portal proof, official OpenClaw, current tab, and multi-page preferences,
  - OpenClaw readiness returned `auth_required`,
  - Benefits produced pending approval task `task_d664f45e-e7df-4f4f-a951-40fe86325e54`,
  - approval was recorded and consumed,
  - FastAPI accepted approved resume task `task_d87b066a-e1e6-47a2-aca3-5ed32dec0a63`,
  - approved worker result returned `blocked_no_authenticated_evidence`,
  - precise blocker was `No current OpenClaw browser tab is available. The user must manually sign in and leave the member portal tab open.`,
  - worker actions were limited to `openclaw_browser_start` and `openclaw_browser_use_current_tab`,
  - source pointers remained `0`,
  - product-memory status rendered as `disabled_by_env`,
  - the answer explicitly stated no eligibility snapshot, document candidate, payer contact, external message, credential entry, medical advice, form submission, or account change was created.
- Browser operator proof link opened `/` for the same session:
  - session `session_d41a532c-81be-4667-af02-ccef09ae2489`,
  - operator trace loaded `langgraph_run_completed · v3`,
  - trace panel showed the matching LangGraph thread,
  - browser console had 0 errors.
- Screenshot proof:
  - `/tmp/workerprototype_phase9f_fastapi_approved_blocker.png`,
  - `/tmp/workerprototype_phase9f_operator_linked_session.png`.

External blocker status:
- The sourced-result branch still requires the user to manually sign in to an authenticated member portal tab in the dedicated OpenClaw profile. With no authenticated current tab, Phase 9F now proves the correct fail-closed result instead of fabricating evidence.

Next step:
- Phase 9G should harden the production API facade around this proven loop: rate limiting, safer error envelopes, production CORS defaults, task registry persistence plan, and source-grounding checks.

## Phase 9G Production API Facade Hardening - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase9g-facade-hardening`.
- Every FastAPI response now carries an `x-request-id`; callers can also provide one.
- FastAPI errors now use a stable envelope with:
  - top-level `detail`,
  - `error.code`,
  - `error.message`,
  - `error.request_id`,
  - optional structured `error.details`.
- The facade now has in-memory per-scope rate limiting with deployment configuration through `WEFELLA_RATE_LIMIT_PER_MINUTE` and `WEFELLA_RATE_LIMIT_DISABLED`.
- `GET /api/health` now reports safe deployment metadata for:
  - auth,
  - CORS,
  - task registry,
  - rate limiting,
  - source-grounding policy.
- CORS is now explicit `GET`, `POST`, `OPTIONS` with only `authorization`, `content-type`, and `x-request-id` headers. In provider auth mode, CORS has no local default origins unless `WEFELLA_ALLOWED_ORIGINS` is configured.
- The async FastAPI task registry can now persist to a local JSON file with `WEFELLA_TASK_REGISTRY_PATH`; default remains in-memory.
- Completed chat results now include `result.facade.sourceGrounding` with source-pointer count, workflow, evidence status, blocker, approval/proposal status, and pass/fail summary.
- Optional `WEFELLA_ENFORCE_SOURCE_GROUNDING=1` now fails a facade task when a healthcare answer has neither source pointers nor a precise blocker/approval state.
- `/mvp` now understands the new FastAPI error-envelope shape and shows readable errors instead of raw objects.
- `/mvp` visible phase label is now Phase 9G while preserving the Phase 9F live-loop panel behavior.

What was tested:
- `python3 -m compileall -q project` passed.
- `python3 -m unittest project.tests.test_fastapi_facade -v` passed with 18 tests, 16 passed and 2 expected live-gated skips.
- `npm run test:facade` passed with 18 tests, 16 passed and 2 expected live-gated skips.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 18 tests against the running Node runtime.
- `node --check src/app/mvp.js` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- FastAPI health proof at `http://127.0.0.1:8000/api/health` returned:
  - version `0.1.0-phase9g-facade-hardening`,
  - Node runtime connected,
  - local auth metadata,
  - production-safe local CORS metadata,
  - in-memory task registry,
  - rate limit enabled at 120/minute,
  - source grounding not enforced by default.
- Browser proof at `http://127.0.0.1:4173/mvp` passed:
  - user-facing MVP loaded,
  - FastAPI facade controls were present,
  - OpenClaw/portal controls were present,
  - Check Facade reported `FastAPI 0.1.0-phase9g-facade-hardening · reachable and connected to Node`,
  - browser console had 0 errors.
- Screenshot proof saved at `/tmp/workerprototype_phase9g_mvp_facade_health.png`.

Next step:
- Phase 9H should add deployment and observability readiness without changing the product runtime: environment examples, production notes, optional trace export hooks, CI-friendly smoke commands, and a clear operator runbook for FastAPI plus Node/LangGraph/OpenClaw.

## Phase 9H Deployment And Observability Readiness - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase9h-deployment-observability`.
- Added `GET /api/readiness` with safe deployment checks for:
  - Node runtime connectivity,
  - auth posture,
  - CORS production safety,
  - task registry state,
  - rate-limit status,
  - source-grounding enforcement,
  - observability export/tracing posture.
- Added optional JSONL task observability export through `WEFELLA_OBSERVABILITY_EVENTS_PATH`.
- Observability events record task id, user/session hashes, message hash, message length, task status, and source-grounding summary; they do not record raw user ids, raw user messages, or raw portal text.
- Added `project/api/smoke.py` and `npm run smoke:facade` for a running FastAPI deployment smoke check.
- Added `docs/DEPLOYMENT_OBSERVABILITY.md` with local service startup, smoke commands, deployment envs, readiness semantics, OpenClaw live gates, and remaining deployment gaps.
- Expanded `.env.example` with provider auth, CORS, rate-limit, task registry, source-grounding, smoke, and observability settings.
- Validation-error envelopes now omit raw Pydantic input values and keep only location, message, and type.

What was tested:
- `python3 -m compileall -q project` passed.
- `npm run test:facade` passed with 22 tests, 20 passed and 2 expected live-gated skips.
- `npm run smoke:facade` passed against the restarted Phase 9H FastAPI facade:
  - health returned `0.1.0-phase9h-deployment-observability`,
  - Node runtime was connected,
  - readiness returned `ready`,
  - unauthorized chat returned the standard `unauthorized` error envelope with the caller-provided request id.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 22 tests against the running Node runtime.
- `node --check src/app/mvp.js` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Browser proof at `http://127.0.0.1:4173/mvp` passed:
  - visible page label is `Phase 9H`,
  - FastAPI facade controls are present,
  - OpenClaw/portal controls are present,
  - Check Facade reported `FastAPI 0.1.0-phase9h-deployment-observability · reachable and connected to Node`,
  - browser console had 0 errors.
- Screenshot proof saved at `/tmp/workerprototype_phase9h_mvp_facade_health.png`.

Next step:
- Reassess the broad `docs/goal_final_system.md` acceptance matrix and choose the next missing final-system area. The largest unimplemented areas remain user document upload/extraction, operator/research APIs, background evidence pipeline, MockWorker/Hermes worker modes, RBAC, and the final PASS/FAIL/BLOCKED report.

## Phase 10A User Document Upload And Local Extraction - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase10a-document-upload-extraction`.
- Added authenticated `POST /api/uploads` with:
  - allowed content types for text, markdown, CSV, PDF, PNG, and JPEG,
  - configurable local storage through `WEFELLA_UPLOAD_STORE_PATH`,
  - configurable size limit through `WEFELLA_UPLOAD_MAX_BYTES`,
  - local SHA-256 file hash,
  - user-bound upload ownership.
- Added authenticated `GET /api/uploads/{upload_id}/extraction`.
- Added `project/api/uploads.py` as a real local extraction harness:
  - UTF-8 text extraction for text-like files,
  - optional `pypdf` extraction for PDFs,
  - optional Tesseract CLI extraction for images,
  - fail-closed blocker states when an extraction runtime is missing or unreadable,
  - redacted safe text preview,
  - structured field extraction for document type, amounts, dates, claim number, member-id last4, deductible, copay, coinsurance, out-of-pocket, and payer hints,
  - source snippets without raw direct identifiers.
- Added upload metadata to `/api/health` and upload readiness to `/api/readiness`.
- Added upload/extraction controls to `/mvp`:
  - file picker,
  - document kind selector,
  - `Upload + Extract` action,
  - extraction status,
  - structured fields,
  - redacted preview.
- Added `.env.example` settings for the upload store and size limit.
- Added `pypdf` to `project/requirements.txt` for PDF extraction in prepared environments.

What was tested:
- `python3 -m compileall -q project` passed.
- `node --check src/app/mvp.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 26 tests, 24 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 123 tests total, 121 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 26 tests against the running Node runtime.
- Restarted FastAPI and `npm run smoke:facade` passed:
  - health returned `0.1.0-phase10a-document-upload-extraction`,
  - Node runtime was connected,
  - readiness returned `ready`,
  - upload readiness was `true`.
- Browser proof at `http://127.0.0.1:4173/mvp` passed:
  - upload controls rendered,
  - Check Facade worked,
  - Start Session worked,
  - visible facade version was reachable,
  - browser console had 0 errors.
- Screenshot proof saved at `/tmp/workerprototype_phase10a_mvp_upload_ui.png`.
- Live API proof against the running FastAPI facade uploaded a real text benefits sample:
  - returned `status: stored`,
  - extraction returned `completed`,
  - extracted document type, amount, date, member-id last4, deductible, and out-of-pocket fields,
  - redacted email and SSN in the safe preview,
  - extraction retrieval by upload id matched.

Current limits:
- This slice proves upload and extraction, but it does not yet connect uploaded document evidence into the LangGraph chat answer, Graphiti retain, or OpenClaw worker loop.
- PDF and image support are real harness paths, but depend on runtime availability of `pypdf` and Tesseract. Missing runtimes return blockers rather than fake extraction.
- Uploaded files are stored locally under `data/wefella-uploads` by default, which is git-ignored.

Next step:
- Phase 10B should connect uploaded document extractions to the chat/orchestration path: let the user ask a benefits/claim question about an uploaded document, feed only safe extracted fields/source spans into LangGraph, create source pointers/citations for the uploaded document, and optionally retain a safe Graphiti memory summary.

## Phase 10B Uploaded Document Grounded Chat - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase10b-uploaded-document-grounded-chat`.
- `POST /api/chat` now accepts `uploaded_document_ids` and resolves only documents owned by the authenticated JWT subject.
- FastAPI sends safe uploaded document extraction packets to the Node/LangGraph runtime:
  - upload id,
  - filename,
  - content type,
  - SHA-256,
  - extraction status/method/confidence,
  - structured fields,
  - source spans,
  - blockers,
  - redacted safe preview only.
- LangGraph now has an uploaded-document evidence path:
  - detects attached uploaded documents,
  - records `uploaded_document_context`,
  - creates `uploaded_document_extractions` source pointers,
  - audits `uploaded_document_extraction_observed`,
  - publishes evidence status events,
  - composes a sourced answer without OpenClaw worker dispatch.
- The final answer can cite the stored uploaded extraction and list extracted insurance fields without dumping raw document text.
- `/mvp` now includes an `Ask About Upload` action that routes through the same FastAPI chat task path.

What was tested:
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/app/mvp.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/uploaded-document-chat.test.mjs` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 27 tests, 25 passed and 2 expected live-gated skips.
- `node --check src/server/server.mjs` passed.
- `npm run build` passed.
- `npm run test:local` passed with 124 tests total, 122 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 27 tests against the restarted Node runtime.
- `npm run smoke:facade` passed against the restarted Phase 10B FastAPI facade:
  - health returned `0.1.0-phase10b-uploaded-document-grounded-chat`,
  - Node runtime was connected,
  - readiness returned `ready`,
  - uploads readiness was `true`.
- Live API proof against the running FastAPI facade passed:
  - created a local authenticated user/session,
  - uploaded a real text benefits sample,
  - submitted `/api/chat` with `uploaded_document_ids`,
  - LangGraph completed `eligibility_benefits_navigation`,
  - evidence status was `captured_uploaded_document_extraction`,
  - one source pointer was created,
  - actions taken were limited to `read_uploaded_document_extraction`.
- Browser proof at `http://127.0.0.1:4173/mvp` passed:
  - visible page label is `Phase 10B`,
  - FastAPI facade route is active by default,
  - upload controls and `Ask About Upload` render,
  - local sign-in works through FastAPI,
  - Send routes through FastAPI and returns a completed LangGraph answer with pending approval proof,
  - screenshot proof saved at `/tmp/workerprototype-openclaw-phase10b-mvp-proof.png`.

Current limits:
- Direct Node `/api/chat` can accept uploaded document packets, but the public upload-id resolution happens in FastAPI. That keeps upload ownership enforcement at the facade boundary.
- Uploaded document grounding does not execute OpenClaw. It is a separate read-only evidence path for user-supplied documents.
- Product memory still needs a stronger explicit assertion that the uploaded-document answer retains only safe summaries/source pointers in Graphiti, not raw extraction text.

Next step:
- Phase 10C should add the user-facing citation/source details for uploaded documents and assert Graphiti safe retain/recall from a document-grounded chat across sessions. Keep `/mvp` as the user app and `/` as the operator proof console.

## Phase 10C Uploaded Document Citations And Graphiti Recall - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase10c-citations-memory-recall`.
- Uploaded-document source pointers now carry richer citation metadata:
  - `kind: uploaded_document_extraction`,
  - display label,
  - content type,
  - byte size,
  - SHA-256,
  - extraction method/hash,
  - page count,
  - structured evidence fields,
  - source spans/snippets.
- Product-memory safe episode construction now normalizes both array and object-shaped evidence fields.
- Product-memory safe episodes sanitize uploaded-document evidence fields and citation snippets before Graphiti retain.
- `/mvp` now renders:
  - citation/source detail cards,
  - uploaded-document field confidence,
  - source spans,
  - Graphiti retain/recall status,
  - recalled facts when present.
- `/mvp` visible phase label is now Phase 10C and the proof panel is `Source + Memory Loop`.
- Extended the real Graphiti/FalkorDB test to retain an uploaded-document source pointer in one session and recall it in a later session.

What was tested:
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/concierge/productMemory.mjs` passed.
- `node --check src/app/mvp.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/uploaded-document-chat.test.mjs` passed.
- `node --test src/tests/product-memory-contract.test.mjs` passed with 4 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 27 tests, 25 passed and 2 expected live-gated skips.
- `npm run test:memory:graphiti` passed with 2 real Graphiti/FalkorDB tests:
  - schema retain/recall proof,
  - uploaded-document source pointer retained in one session and recalled in another.
- `node --check src/server/server.mjs` passed.
- `npm run build` passed.
- `npm run test:local` initially exposed a product-memory sanitizer regression for object-shaped portal evidence fields; after fixing normalization, the two failing portal tests passed and the full rerun passed with 125 tests total, 123 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted Node and FastAPI services.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 27 tests against the restarted Node runtime.
- `npm run smoke:facade` passed against the restarted Phase 10C FastAPI facade:
  - health returned `0.1.0-phase10c-citations-memory-recall`,
  - Node runtime was connected,
  - readiness returned `ready`,
  - uploads readiness was `true`.
- Live HTTP proof against the running FastAPI facade passed:
  - created a local authenticated user/session,
  - uploaded a real text benefits sample,
  - submitted `/api/chat` with `uploaded_document_ids`,
  - LangGraph completed `eligibility_benefits_navigation`,
  - evidence status was `captured_uploaded_document_extraction`,
  - source pointer kind was `uploaded_document_extraction`,
  - citation metadata included 16 fields and 5 source spans,
  - Graphiti retain returned an episode UUID and recall returned 5 facts.
- Browser proof at `http://127.0.0.1:4173/mvp` passed:
  - visible page label is `Phase 10C`,
  - `Source + Memory Loop` proof panel renders,
  - upload controls and `Ask About Upload` render,
  - FastAPI-first sign-in works,
  - browser console had 0 errors.
- Screenshot proof saved at `/tmp/workerprototype-openclaw-phase10c-mvp-source-memory.png`.

Current limits:
- Browser proof verified the Phase 10C UI and sign-in surface; the dynamic uploaded-document citation run was proven through the live FastAPI HTTP path because the in-app browser automation surface did not provide a reliable file-picker upload path.
- The source/citation cards are implemented in `/mvp`; `/` already exposes deeper operator proof, but it can still be improved for uploaded-document-specific source spans later.

Next step:
- Phase 10D should continue from the final-system goal rather than widen workflows: likely session history/feedback or the first operator/research API slice, depending on whether the next priority is user-facing continuity or operator dashboard completeness.

## Phase 10D Session History, Feedback, And Export - 2026-06-01

What was built:
- Added `src/concierge/sessionContinuity.mjs` as the continuity layer for user-facing session resume/proof:
  - owner-bound session history,
  - latest LangGraph state/source pointers,
  - feedback persistence,
  - Markdown session export.
- Added `feedback_items` to the local SQLite schema.
- Node now exposes:
  - `GET /api/sessions/:sessionId` for protected session history,
  - `GET /api/sessions/:sessionId/export` for Markdown export,
  - `POST /api/feedback` for answer/session feedback.
- FastAPI facade version is now `0.1.0-phase10d-session-feedback-export`.
- FastAPI now proxies protected continuity endpoints:
  - `GET /api/sessions/{session_id}`,
  - `GET /api/sessions/{session_id}/export`,
  - `POST /api/feedback`.
- `/mvp` now renders a continuity panel with:
  - `Load History`,
  - `Export Answer`,
  - feedback note,
  - `Useful` and `Needs Follow-Up`,
  - last messages,
  - source-pointer count,
  - feedback status,
  - export status.
- Feedback comments and exported session content are identifier-masked before persistence/return.
- Operator `traceForSession` now includes `feedbackItems`.
- `npm run test:local` now includes `src/tests/session-continuity.test.mjs`.

What was tested:
- `node --check src/concierge/sessionContinuity.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/mvp.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/session-continuity.test.mjs` passed with 2 tests.
- `node --test src/tests/uploaded-document-chat.test.mjs` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 8 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 29 tests, 27 passed and 2 expected live-gated skips.
- Combined focused Node/UI run passed with 11 tests.
- `npm run build` passed.
- `npm run test:local` passed after adding the new continuity file into the script, with 127 tests total, 125 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted Node and FastAPI services.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 29 tests against the restarted Node runtime.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10d-session-feedback-export`.
- Live HTTP proof against the running FastAPI facade passed:
  - created a local authenticated user/session,
  - uploaded a text benefits document,
  - submitted `/api/chat` with `uploaded_document_ids`,
  - LangGraph completed `eligibility_benefits_navigation`,
  - evidence status was `captured_uploaded_document_extraction`,
  - session history returned 2 messages and 1 source pointer,
  - feedback was recorded as `useful`,
  - export returned `text/markdown` with `Latest Answer` and `Checklist`.
- Browser proof at `http://127.0.0.1:4173/mvp` passed:
  - Phase 10D and `History + Feedback` controls rendered,
  - FastAPI-first sign-in worked,
  - Send completed a LangGraph/FastAPI chat run,
  - Load History showed the session messages,
  - Useful feedback recorded,
  - Export Answer completed,
  - browser console had 0 errors.
- Screenshot proof saved at `/tmp/workerprototype-openclaw-phase10d-continuity.png`.

Current limits:
- Export is Markdown text returned by the runtime and downloaded by the browser; it is not yet a durable server-side artifact store.
- The browser proof used a proposal-only benefits chat for the UI continuity branch; the live HTTP proof separately covered uploaded-document source-pointer history/feedback/export through the same FastAPI facade.

Next step:
- After Phase 10D, the next highest-value gap is likely the first operator/research dashboard API slice or RBAC/MockWorker mode from the final-system goal, while preserving the original MVP runtime.

## Phase 10E Operator Research API And Dashboard Foundation - 2026-06-01

What was built:
- Added `src/concierge/researchOps.mjs` as the first operator/research control plane over the existing Node/LangGraph runtime.
- Added `research_runs` and `research_run_events` tables plus `knowledge_sources` review/run metadata columns.
- Node now exposes operator research endpoints for:
  - KPI summary,
  - source listing/proposal/review/update,
  - manual research run queueing,
  - run detail/events,
  - cancel and retry.
- FastAPI facade version is now `0.1.0-phase10e-operator-research-api`.
- FastAPI proxies the research endpoints behind JWT auth and binds `actorUserId` to the authenticated subject.
- `/` now has a Phase 10E Operator Research Console with:
  - Load KPIs,
  - Load Sources,
  - Load Runs,
  - Start Manual Run,
  - source proposal fields,
  - source approve/reject/run controls,
  - run open/cancel/retry controls.
- The research API creates real queue/audit records. It does not scrape, crawl, call a model, or dispatch OpenClaw yet.

What was tested:
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 2 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `npm run build` passed.
- Focused Phase 10E/UI rerun passed with 11 tests.
- `npm run test:local` passed on the final patched state with 130 tests total, 128 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted Node and FastAPI services.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests against the running Node runtime.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10e-operator-research-api`.
- Live HTTP proof through FastAPI passed:
  - created a local authenticated operator/user session,
  - read research KPIs,
  - proposed a unique source,
  - approved the source,
  - queued a manual research run,
  - read run detail/events,
  - cancelled the run,
  - retried the run with `retryOfRunId` linked to the original run.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - Phase 10E console rendered,
  - Load Sources showed real source cards,
  - Start Manual Run created a queued run and event,
  - a UI bug where source arrays were mistaken for KPI payloads was found and fixed,
  - screenshot proofs saved at `/tmp/workerprototype-openclaw-phase10e-operator-research.png` and `/tmp/workerprototype-openclaw-phase10e-research-run-detail.png`.

Current limits:
- Research runs are queue/control records only; the next phase must attach them to real deterministic fetch/scrape/OpenClaw worker execution.
- FastAPI protects research endpoints with JWT subject binding, but full role-based operator/admin RBAC is still pending.
- Direct Node research routes remain local operator/runtime routes and are not a production authorization boundary.

Next step:
- Phase 10F should add role/RBAC separation and a real research execution loop decision: either attach manual research runs to a safe deterministic fetch/scrape worker, add MockWorker/Hermes mode for non-live demos, or produce the final PASS/FAIL/BLOCKED report if the remaining operator/research execution gates are not yet ready.

## Phase 10F Operator/Admin RBAC For Research Facade Routes - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase10f-rbac-operator-routes`.
- `project/api/auth.py` now normalizes roles from provider-friendly JWT claims:
  - `roles`,
  - `role`,
  - `groups`,
  - `permissions`,
  - `scope`,
  - `scp`.
- Local facade session tokens remain user-scoped by default and do not gain operator access.
- FastAPI `/api/research/*` routes now require `operator` or `admin`.
- User-facing routes still use normal authenticated-user access.
- `/api/health` exposes RBAC metadata without exposing secrets.
- `.env.example` documents the operator/admin role requirement and supported role claims.

What was tested:
- `python3 -m compileall -q project` passed.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 130 tests total, 128 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted local Node and FastAPI services in tmux session `workerprototype_openclaw_phase10f`.
- FastAPI health reported version `0.1.0-phase10f-rbac-operator-routes`, Node runtime healthy, RBAC enabled, and supported role claims.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests against the running Node runtime.
- `npm run smoke:facade` passed against FastAPI version `0.1.0-phase10f-rbac-operator-routes`.
- Live HTTP RBAC proof against `/api/research/kpis` passed:
  - plain user token returned 403 `Operator role required.`
  - operator token returned 200
  - admin scope token returned 200

Current limits:
- Research runs are still queued/audited control records only; no deterministic fetch/scrape/OpenClaw research execution is attached yet.
- Direct Node research routes remain local runtime/operator routes and are not the production authorization boundary.
- Production identity-provider integration still needs real issuer/audience/role-claim configuration outside this local harness.

Next step:
- Phase 10G should attach the queued research-run contract to a real gated execution path, or deliberately add MockWorker/Hermes mode for non-live demos before the final PASS/FAIL/BLOCKED report.

## Phase 10G Approved Research Run Execution And Worker Status - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase10g-research-execution`.
- Added `research_artifacts` to the local schema and health counts.
- `src/concierge/researchOps.mjs` now supports:
  - `GET /api/research/worker-status` contract metadata,
  - deterministic approved-source fetch execution,
  - explicit MockWorker fallback execution,
  - artifact file persistence under `data/research-artifacts` by default,
  - artifact database rows with source/run pointers, title, URL, hashes, safe preview, citation status, and metadata,
  - execution started/completed/failed events,
  - execution audit rows with hashes and no raw source text.
- Node exposes `POST /api/research/runs/{run_id}/execute`.
- FastAPI proxies `GET /api/research/worker-status` and `POST /api/research/runs/{run_id}/execute` behind operator/admin RBAC.
- `/` operator dashboard now shows:
  - Phase 10G label,
  - Worker Status button,
  - deterministic fetch status,
  - MockWorker fallback status,
  - feature-gated OpenClaw/Hermes research modes,
  - Execute Fetch and MockWorker run controls,
  - artifact cards with safe preview and hashes.
- `.env.example` documents `BRAINSTY_RESEARCH_WORKER_MODE`, `BRAINSTY_RESEARCH_ARTIFACT_DIR`, and `BRAINSTY_RESEARCH_FETCH_MAX_BYTES`.

What was tested:
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 4 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 132 tests total, 130 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted Node and FastAPI in tmux session `workerprototype_openclaw_phase10g`.
- Node health reported `research_artifacts` count.
- FastAPI health reported version `0.1.0-phase10g-research-execution`, Node runtime healthy, and RBAC enabled.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests.
- `npm run smoke:facade` passed.
- Live HTTP proof through FastAPI passed:
  - operator token loaded worker status,
  - proposed and approved a local HTTP fixture source,
  - queued a manual research run,
  - executed deterministic fetch,
  - stored one artifact,
  - returned `research_run_execution_completed`,
  - returned redacted safe preview with `[redacted-email]` and masked SSN pointer.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - Phase 10G Operator Research Console rendered,
  - Worker Status panel rendered deterministic fetch, MockWorker, and feature-gated OpenClaw/Hermes,
  - 0 console errors,
  - screenshot saved at `/tmp/workerprototype-openclaw-phase10g-research-worker-status.png`.

Current limits:
- Deterministic fetch artifacts are `extracted_pending_review`; they are not yet trusted retrieval evidence.
- MockWorker artifacts are explicitly `mock_worker_untrusted` and must not be used for trusted user healthcare answers.
- OpenClaw and Hermes research-worker execution are still feature-gated future modes.
- No nightly scheduler, embeddings/indexing, evidence search API, citation closure queue, or operator NL proposal gate is implemented in this phase.

Next step:
- Phase 10H should make approved research artifacts useful without over-trusting them: add search/evidence/citation-review APIs over reviewed artifacts, or add the operator natural-language proposal gate for write actions.

## Phase 10H Research Citation Review And Trusted Evidence Search - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase10h-citation-review`.
- Research operations version is now `2026-06-01.phase10h-citation-review.v1`.
- Added review-gated artifact lifecycle over existing `research_artifacts`:
  - `extracted_pending_review`,
  - `trusted_retrieval_approved`,
  - `quarantined`,
  - `mock_worker_untrusted`.
- Added Node APIs:
  - `GET /api/research/artifacts`,
  - `POST /api/research/artifacts/{artifact_id}/review`,
  - `GET /api/research/search`,
  - `GET /api/research/evidence`.
- Added FastAPI operator/admin-protected proxies for those APIs.
- Trusted evidence search defaults to reviewed artifacts only. Pending artifacts can be counted and shown, but are not returned as trusted retrieval results unless explicitly requested by review/status filters.
- MockWorker artifacts cannot be approved for trusted retrieval.
- Artifact review writes run events and audit rows with hashes and redacted review reason handling; raw source text is not placed in audit.
- `/` operator dashboard now shows Phase 10H controls:
  - Review Artifacts,
  - Search Evidence,
  - pending artifact cards,
  - Approve Citation / Quarantine actions,
  - trusted evidence search result cards,
  - KPI counts for trusted, pending, quarantined, and mock-untrusted artifacts.

What was tested:
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 5 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 133 tests total, 131 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted Node and FastAPI in tmux session `workerprototype_openclaw_phase10h`.
- FastAPI health reported version `0.1.0-phase10h-citation-review`.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests.
- `npm run smoke:facade` passed.
- Live HTTP proof through FastAPI passed:
  - operator token proposed and approved a local HTTP fixture source,
  - manual research run queued,
  - deterministic fetch completed,
  - artifact started as `extracted_pending_review`,
  - search before review returned `pending_review_only` with 0 trusted results,
  - artifact review approval returned `trusted_retrieval_approved`,
  - search after review returned `trusted_evidence_found` with the approved artifact id.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - Phase 10H Operator Research Console rendered,
  - Search Evidence displayed trusted search status/results,
  - Review Artifacts displayed pending review cards with Approve Citation and Quarantine actions,
  - 0 console errors,
  - screenshot saved at `/tmp/workerprototype-openclaw-phase10h-citation-review.png`.

Current limits:
- Phase 10H does not add embeddings or semantic vector retrieval. Search is deterministic over reviewed safe previews, titles, and source URLs.
- Phase 10H does not wire research artifacts into user-facing healthcare answers yet; it creates the operator-reviewed evidence/search gate needed before doing that safely.
- Nightly scheduler, operator natural-language write proposals, OpenClaw/Hermes research-worker execution, and embedding/reindex routes remain future phases.

Next step:
- Choose the next narrow final-system gate:
  - wire reviewed research evidence into grounded user answers,
  - add operator natural-language proposal/write-action gate,
  - or add scheduled research automation over approved sources.

## Phase 10I Trusted Research Evidence In User Answers - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase10i-research-grounded-answers`.
- LangGraph runner version is now `2026-06-01.langgraph-runner.phase10i-trusted-research-grounding.v1`.
- LangGraph now searches reviewed research artifacts when a healthcare question does not have an approved portal/document evidence observation in the current run.
- Only `trusted_retrieval_approved` artifacts become user-facing research source pointers by default.
- Pending-review matches create a blocker state instead of a sourced answer.
- Missing trusted evidence creates a precise refusal/escalation response instead of a scripted answer.
- Research source pointers use `research_artifacts/{artifactId}` with citation status, source URL, content/extraction hashes, reviewed snippet, confidence, and score.
- User-facing responses now disclose that they are based on operator-reviewed research evidence and list the source pointers used.
- Pending artifacts, MockWorker output, raw document dumps, payer contact, form submission, credential entry, medical advice, and account changes are explicitly excluded from this answer path.
- `/mvp` and `/` labels were updated to show Phase 10I proof surfaces.

What was tested:
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/langgraph-runner.test.mjs` passed with 12 tests.
- `node --test src/tests/runtime-collapse.test.mjs src/tests/runtime-events.test.mjs src/tests/llm-orchestration-decision.test.mjs` passed with 10 tests.
- `node --test src/tests/uploaded-document-chat.test.mjs src/tests/session-continuity.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 12 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 31 tests, 29 passed and 2 expected live-gated skips.
- `node --test src/tests/langgraph-runner.test.mjs src/tests/runtime-collapse.test.mjs src/tests/research-ops.test.mjs src/tests/uploaded-document-chat.test.mjs` passed with 19 tests.
- `npm run build` passed.
- `npm run test:local` passed with 135 tests total, 133 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- After the UI label update, `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests and `npm run build` passed again.
- Restarted Node and FastAPI in tmux session `workerprototype_openclaw_phase10i`.
- FastAPI health reported version `0.1.0-phase10i-research-grounded-answers`.
- `WEFELLA_TEST_NODE_LIVE=1 npm run test:facade` passed with 31 tests.
- `npm run smoke:facade` passed against the Phase 10I FastAPI facade.
- Live FastAPI proof passed:
  - operator token proposed and approved a local fixture source,
  - manual research run queued,
  - deterministic fetch completed,
  - artifact was approved for `trusted_retrieval_approved`,
  - trusted search returned the exact reviewed artifact,
  - user local auth created a session,
  - `/api/chat` through FastAPI returned `captured_trusted_research_evidence`,
  - the final answer cited `research_artifacts/research_artifact_27f8e2f2-744a-4459-8186-a54b5ec1f131`,
  - the fixture email was redacted.
- Browser proof at `http://127.0.0.1:4173/mvp` passed:
  - Phase 10I label and `Trusted Research Answers` panel rendered,
  - user signed in through the FastAPI route,
  - chat answer displayed operator-reviewed research evidence,
  - source pointer/citation cards rendered,
  - no console errors,
  - screenshot saved at `/tmp/workerprototype-openclaw-phase10i-research-grounded-answer.png`.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - Phase 10I Operator Research Console rendered,
  - Search Evidence and Review Artifacts controls remained visible,
  - no console errors,
  - screenshots saved at `/tmp/workerprototype-openclaw-phase10i-operator-dashboard.png`, `/tmp/workerprototype-openclaw-phase10i-mvp-labels.png`, and `/tmp/workerprototype-openclaw-phase10i-dashboard-labels.png`.

Current limits:
- Search remains deterministic over reviewed safe previews, titles, and source URLs; no embeddings or semantic vector retrieval yet.
- The user-facing answer path uses reviewed research artifacts, uploaded document source pointers, or approved portal evidence, but it does not yet run a claims-specific research endpoint or graph endpoint.
- Nightly/scheduled research automation, operator natural-language write proposals, OpenClaw research-worker execution, Hermes dispatch, and embedding/reindex routes remain future phases.
- The old local SQLite artifact/history data can affect ranking when broad terms match multiple trusted artifacts; exact/unique evidence queries correctly return the intended artifact first.

Next step:
- Phase 10J should add the next narrow final-system gate. Best candidates are:
  - operator natural-language proposal/write-action gate for source/run/review operations,
  - scheduled research automation over approved sources,
  - or embeddings/reindexing over reviewed artifacts if semantic retrieval becomes the highest-value blocker.

## Phase 10J Operator Natural-Language Proposal Gate - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase10j-operator-proposal-gate`.
- Added `operator_tool_proposals` as the local proposal/audit table for operator assistant write requests.
- Added `src/concierge/operatorAssistant.mjs` with a fixed registry of operator tools.
- Read-only operator requests execute immediately through registered research tools only:
  - KPIs,
  - worker status,
  - source/run/artifact listing,
  - run detail,
  - trusted evidence search.
- Write/action requests become proposal-only records with:
  - tool key,
  - risk level,
  - expected effect,
  - argument hash,
  - message hash/preview,
  - approval requirement,
  - `actionsTaken: []`,
  - status `pending_approval`.
- Approval/rejection endpoints execute exactly one approved proposal or reject it with no target mutation.
- Added Node routes:
  - `GET /api/operator/tools`,
  - `GET /api/operator/proposals`,
  - `POST /api/operator/assistant`,
  - `POST /api/operator/proposals/{proposal_id}/approve`,
  - `POST /api/operator/proposals/{proposal_id}/reject`.
- Added FastAPI operator/admin-protected proxies for the same routes with actor binding.
- `/` now exposes the Phase 10J operator assistant UI:
  - assistant tool registry,
  - plain-English operator request box,
  - read-only tool result rendering,
  - proposal cards,
  - approve/reject proposal buttons.

What was tested:
- `node --check src/concierge/operatorAssistant.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/operator-assistant.test.mjs` passed with 5 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `node --test src/tests/database.test.mjs` passed.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 140 tests total, 138 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted the local Node app at `http://127.0.0.1:4173/` after the stale API process returned 404 for the new route.
- Browser proof at `http://127.0.0.1:4173/` passed:
  - Phase 10J Operator Research Console rendered,
  - Assistant Tools loaded 7 read tools and 9 gated write tools,
  - Run Assistant executed read-only `research.searchEvidence`,
  - a local proof proposal rendered as `research.proposeSource`,
  - proposal card showed approve/reject controls and `actionsTaken: []`,
  - screenshots saved at `/tmp/workerprototype-openclaw-phase10j-visible-proposal-card.png` and `/tmp/workerprototype-openclaw-phase10j-full-dashboard.png`.

Current limits:
- The operator assistant uses a curated deterministic parser over a fixed tool registry. It is not yet an LLM planner.
- Approved proposal execution is local to the current Node research control plane; OpenClaw/Hermes research dispatch is still feature-gated.
- The browser proof created one local pending proposal record for `research.proposeSource` as proof, but did not approve it or mutate `knowledge_sources`.
- Embeddings/semantic retrieval, scheduled automation, live OpenClaw research-worker dispatch, Hermes dispatch, and production provider-auth wiring remain future phases.

Next step:
- Phase 10K should choose the next narrow final-system gate:
  - scheduled/cron research automation over approved sources,
  - semantic embeddings/reindexing over reviewed artifacts,
  - or OpenClaw/Hermes research-worker dispatch behind the same proposal and audit boundaries.

## Phase 10K Scheduled Research Automation - 2026-06-01

What was built:
- FastAPI facade version is now `0.1.0-phase10k-scheduled-research`.
- Research operations version is now `2026-06-01.phase10k-scheduled-research.v1`.
- Added `research_schedules` as the scheduler contract table with:
  - schedule key,
  - actor,
  - optional approved source binding,
  - schedule label,
  - interval hours,
  - workflow/topic/query,
  - worker mode,
  - status,
  - approval status,
  - next run time,
  - last run/status,
  - run count,
  - metadata.
- Added scheduler operations:
  - list schedules,
  - create approved schedule,
  - pause schedule,
  - resume schedule,
  - run due schedules.
- Due scheduler ticks only create runs for active approved schedules and approved/active sources.
- Due scheduler ticks queue `scheduled_research_run` records by default; execution remains a separate worker action unless explicitly requested.
- Scheduler writes audit events:
  - `research_schedule_created`,
  - `research_schedule_tick_run_created`,
  - `research_schedule_paused`,
  - `research_schedule_resumed`,
  - `research_schedule_blocked`.
- Added Node routes:
  - `GET /api/research/schedules`,
  - `POST /api/research/schedules/tick`.
- Added FastAPI operator/admin-protected proxies for the same routes with actor binding.
- Extended the operator assistant registry:
  - read tool `research.listSchedules`,
  - gated write tools `research.createSchedule`, `research.pauseSchedule`, `research.resumeSchedule`, and `research.runDueSchedules`.
- `/` now exposes Phase 10K schedule controls:
  - Load Schedules,
  - Run Due,
  - schedule cards,
  - Scheduled Research Tick proof card.

What was tested:
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/concierge/operatorAssistant.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 6 tests.
- `node --test src/tests/operator-assistant.test.mjs` passed with 6 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `node --test src/tests/database.test.mjs` passed.
- `python3 -m compileall -q project` passed.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 142 tests total, 140 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted the local Node app at `http://127.0.0.1:4173/`.
- Browser proof at `/` passed:
  - Phase 10K controls rendered,
  - a proof source was approved,
  - a schedule was created only after an operator proposal was approved,
  - Load Schedules rendered the active approved schedule,
  - Run Due queued one scheduled research run,
  - screenshot saved at `/tmp/workerprototype-openclaw-phase10k-scheduled-research-visible.png`.

Current limits:
- Phase 10K provides an explicit scheduler tick endpoint and persisted schedules, not a daemonized cron loop.
- The due tick queues runs by default. Fetch/MockWorker/OpenClaw/Hermes execution remains a separate worker action.
- Schedule creation/pause/resume/run-due are registry-bound proposal tools for operator assistant use, but legacy direct research write endpoints still exist for existing operator controls.
- Semantic embeddings/reindexing, graph endpoints, OpenClaw/Hermes research dispatch, and production provider-auth deployment proof remain future phases.

Next step:
- Phase 10L should choose the next final-system gate:
  - audit log API/dashboard (`GET /api/audit`) to close H22/D24,
  - semantic embeddings/reindexing over reviewed artifacts,
  - or OpenClaw/Hermes research-worker dispatch behind schedule/proposal/audit controls.

## Phase 10L Audit Log API And Operator Dashboard - 2026-06-01

What was built:
- Added audit log API version `2026-06-01.phase10l-audit-log-api.v1`.
- Added `listAuditEvents` and `verifyAuditChains` over the existing hash-chained `audit_events` table.
- Audit log responses include:
  - event id,
  - session id,
  - event type,
  - action kind,
  - created timestamp,
  - event hash,
  - previous event hash,
  - details hash,
  - chain version,
  - redacted/truncated details preview,
  - event-type counts,
  - pagination,
  - visible-chain verification,
  - safety metadata showing raw details are not returned.
- Added Node route `GET /api/audit`.
- Added FastAPI route `GET /api/audit` behind operator/admin RBAC and authenticated actor binding.
- Updated FastAPI facade version to `0.1.0-phase10l-audit-log-api`.
- Updated `/` operator dashboard to Phase 10L with:
  - Audit Log button,
  - audit prefix filter,
  - chain status summary,
  - event type counts,
  - event cards with safe previews and hashes.

What was tested:
- `node --check src/concierge/audit.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/audit-integrity.test.mjs` passed with 2 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 143 tests total, 141 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted the local Node app at `http://127.0.0.1:4173/`.
- Browser proof at `/` passed:
  - Phase 10L rendered in the operator research console,
  - Audit Log control was present,
  - audit prefix defaulted to `research`,
  - Audit Log returned 25 redacted audit events,
  - UI status showed `25 audit events · chain valid`,
  - Audit Log card showed `raw details hidden`, event hashes, and details hashes,
  - screenshot files saved at `/tmp/workerprototype-openclaw-phase10l-audit-log.png` and `/tmp/workerprototype-openclaw-phase10l-audit-log-full.png`.

Current limits:
- The audit API is a safe operator listing surface, not a raw audit export.
- It verifies visible chains and sampled chains from the current page; full historical verification can still be run through the existing audit integrity utilities.
- It does not yet add a separate immutable object-store export or Postgres-backed pagination.

Next step:
- Phase 10M should likely add either:
  - semantic embeddings/reindexing over reviewed artifacts, if retrieval quality becomes the next blocker,
  - or OpenClaw/Hermes research-worker dispatch behind the existing proposal/schedule/audit controls, if adaptive worker value is the next MVP proof target.

## Phase 10M Embedding Route And Trusted Evidence Reindex - 2026-06-01

What was built:
- Added research embedding route/index version `2026-06-01.phase10m-embedding-route-reindex.v1`.
- Added schema tables:
  - `research_embedding_routes`,
  - `research_embedding_jobs`,
  - `research_embedding_index`.
- Added a persisted default embedding route:
  - provider `local_tfidf`,
  - model `local-tfidf-v1`,
  - dimensions from `BRAINSTY_RESEARCH_EMBEDDING_DIMENSIONS` or `64`.
- Added optional OpenAI route selection metadata:
  - `BRAINSTY_RESEARCH_EMBEDDING_PROVIDER`,
  - `BRAINSTY_RESEARCH_OPENAI_EMBEDDING_MODEL`,
  - `BRAINSTY_RESEARCH_OPENAI_EMBEDDING_DIMENSIONS`.
- Added local deterministic embedding vectors over reviewed safe previews, titles, and URLs.
- Reindexing indexes only `trusted_retrieval_approved` research artifacts.
- Pending, quarantined, and MockWorker artifacts are not written to the trusted embedding index.
- Reindex jobs fail safely on route/vector dimension mismatch and preserve existing active index rows unless an explicit force reindex succeeds.
- Search now reports whether the selected embedding route contributed to ranking and returns lexical plus embedding scores.
- Added Node routes:
  - `GET /api/research/embeddings/status`,
  - `POST /api/research/embeddings/route`,
  - `POST /api/research/embeddings/reindex`.
- Added FastAPI operator/admin-protected proxies for the same routes with actor binding.
- Extended the operator assistant registry:
  - read tool `research.getEmbeddingStatus`,
  - gated write tools `research.chooseEmbeddingRoute` and `research.reindexEmbeddings`.
- `/` now exposes Phase 10M embedding controls:
  - Embedding Status,
  - Reindex Embeddings,
  - provider/dimension route controls,
  - embedding score fields in trusted evidence search results.

What was tested:
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/concierge/operatorAssistant.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 8 tests.
- `node --test src/tests/operator-assistant.test.mjs` passed with 7 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 9 tests.
- `node --test src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 17 tests.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 146 tests total, 144 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted the local Node app at `http://127.0.0.1:4173/`.
- Browser proof at `/` passed:
  - Phase 10M controls rendered,
  - Embedding Status showed `local_tfidf`, 3 trusted artifacts, 3 indexed, and 0 stale after reindex,
  - Reindex Embeddings completed with 3 indexed artifacts,
  - UI showed `approved evidence only`,
  - actions showed `research_embedding_vectors_written`,
  - screenshot saved at `data/phase10m-embedding-dashboard-proof.png`.

Current limits:
- The default route is a deterministic local lexical-vector backend, not a deep semantic model.
- OpenAI embedding route selection is supported, but live OpenAI embedding reindex requires `OPENAI_API_KEY` and fails safely when it is absent.
- The index stores vectors over safe previews/source metadata only, not raw artifact files.
- Reindexing is explicit from API/UI/operator proposal tooling; no automatic reindex daemon is running.

Next step:
- Phase 10N should likely add OpenClaw/Hermes research-worker dispatch behind the existing source approval, proposal, schedule, audit, and trusted retrieval gates.
- A smaller alternative is to add explicit operator controls for forced route migration/reindex if the next test needs OpenAI embeddings before adaptive workers.

## Phase 10N Adaptive Research Worker Dispatch - 2026-06-01

What was built:
- Added research operations version `2026-06-01.phase10n-adaptive-worker-dispatch.v1`.
- Added `openclaw` and `hermes` worker modes to the existing research execution contract.
- Kept adaptive workers disabled by default behind explicit feature flags:
  - `BRAINSTY_RESEARCH_OPENCLAW_ENABLED=1`,
  - `BRAINSTY_RESEARCH_HERMES_ENABLED=1`.
- Added typed worker task envelope `brainstyworkers.research_worker_task.v1` with:
  - approved source id/key/url/title/status,
  - workflow/topic/query,
  - approved-source-only controls,
  - read-only allowed actions,
  - disallowed credential, auth-bypass, form-submit, payer-contact, external-message, record-change, medical-advice, and raw private dump actions,
  - required pending-review result lifecycle.
- Added real adapter command bindings:
  - OpenClaw via `openclaw --profile brainstyworkers agent --local ... --json`,
  - Hermes via `hermes --oneshot ...`.
- Adaptive dispatch now requires both an approved source/run and `approvedWorkerDispatch=true`.
- Adaptive worker output must return structured JSON; unstructured output fails closed with a failed run and audit proof.
- Successful OpenClaw/Hermes worker output creates `openclaw_research_worker_result` or `hermes_research_worker_result` artifacts with citation status `extracted_pending_review`.
- Adaptive worker artifacts are not trusted retrieval evidence until the existing artifact review gate approves them.
- Added `research_worker_dispatch_requested` run events and audit rows with source URL hash, worker mode, task id, allowed/disallowed action lists, and no raw source text.
- Extended `/api/research/worker-status` with typed envelope, approval gate, adapter, feature flag, and review-required metadata.
- Extended `/` run cards with OpenClaw and Hermes execution controls; the frontend sends `approvedWorkerDispatch=true` only for adaptive worker buttons.
- Extended FastAPI facade tests to prove adaptive worker dispatch flags are forwarded through the protected public API path.

What was tested so far:
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/concierge/operatorAssistant.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 9 tests.
- `node --test src/tests/operator-assistant.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 16 tests.
- `node --test src/tests/research-ops.test.mjs src/tests/operator-assistant.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 25 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 147 tests total, 145 passed, 0 failed, and 2 expected live-gated official OpenClaw tests skipped.
- Restarted the local Node app at `http://127.0.0.1:4173/`.
- API proof for `GET /api/research/worker-status` returned:
  - version `2026-06-01.phase10n-adaptive-worker-dispatch.v1`,
  - OpenClaw adapter `official_openclaw_cli_agent`,
  - Hermes adapter `hermes_cli_oneshot`,
  - typed envelope `brainstyworkers.research_worker_task.v1`,
  - approval gate `approvedWorkerDispatch=true plus approved source/run`,
  - `trustedRetrieval: false` and `artifactReviewRequired: true`.
- Browser proof at `/` passed:
  - Phase 10N label rendered,
  - Worker Status showed feature-gated OpenClaw/Hermes bounded to approved read-only sources,
  - queued run cards rendered OpenClaw and Hermes buttons alongside Fetch/MockWorker,
  - screenshot saved at `data/phase10n-adaptive-worker-dashboard-proof.png`.

Current limits:
- OpenClaw/Hermes worker modes are real adapter paths but remain disabled unless the operator explicitly enables the corresponding environment flag.
- Focused tests use injected command runners so the local suite does not require live OpenClaw/Hermes credentials.
- Worker output is still pending review, not trusted retrieval; this is intentional and preserves the citation/reindex boundary.
- Live OpenClaw/Hermes research-worker proof still needs an enabled worker environment and external model/tool credentials.

Next step:
- After 10N, the next likely final-system gap is the research graph endpoint, a quality judge/claim-level citation closure, production queue/backoff for adaptive workers, or a final PASS/FAIL/BLOCKED matrix over `docs/goal_final_system.md`.

## Phase 10O Research Evidence Graph API - 2026-06-01

What was built:
- Added research operations version `2026-06-01.phase10o-research-graph.v1`.
- Added operator assistant version `2026-06-01.phase10o-research-graph-proposals.v1`.
- Updated FastAPI facade version to `0.1.0-phase10o-research-graph`.
- Added `research_graph_builds` to the local schema and migration path.
- Added metadata-only graph generation over:
  - `knowledge_sources`,
  - `research_runs`,
  - `research_artifacts`,
  - `research_embedding_routes`,
  - `research_embedding_jobs`,
  - `research_embedding_index`,
  - `research_schedules`.
- Added graph node types for sources, workflows, runs, artifacts, embedding routes/jobs, and schedules.
- Added graph edge types for source/run, run/artifact, source/artifact, artifact/embedding-route, embedding-job/artifact, schedule/source, schedule/run, and workflow relationships.
- Added graph safety behavior:
  - no raw artifact text returned,
  - no raw safe text previews returned,
  - no artifact file contents returned,
  - graph URL metadata uses host/hash fields,
  - pending artifacts remain pending-only and do not become trusted retrieval evidence.
- Added Node endpoints:
  - `GET /api/research/graph`,
  - `POST /api/research/graph/build`.
- `POST /api/research/graph/build` persists node count, edge count, graph hash, graph JSON, safety JSON, actor id, status, and audit event id.
- Added hash-chained `research_graph_build_completed` and failure audit events.
- Added FastAPI protected operator/admin proxies for both graph endpoints.
- Added operator assistant tools:
  - read-only `research.getGraph`,
  - proposal-gated `research.buildGraph`.
- Added `/` operator dashboard graph controls and rendering for node/edge counts, node types, edge examples, latest build, safety, and actions taken.
- Updated build-check and UI contract tests for Phase 10O.

What was tested:
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/concierge/operatorAssistant.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --check src/server/build-check.mjs` passed.
- `node --test src/tests/research-ops.test.mjs src/tests/operator-assistant.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 27/27 tests.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed.
- `npm run test:local` passed with 149 tests total, 147 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- API proof for `GET /api/research/graph` returned version `2026-06-01.phase10o-research-graph.v1`, `status=ready`, 34 nodes, 54 edges, 3 trusted artifacts, 1 pending artifact, 11 approved sources, and metadata-only safety flags.
- API proof for `POST /api/research/graph/build` persisted completed build `research_graph_build_a04e83ad-e6cd-4838-a16a-fc418a31214e` with graph hash `2200d9be77fa4035c90a044c6aa756f468c75585aac9d5b2147ec357f2a5f88a` and audit event `audit_720e3667-c823-445f-b19a-20864d086609`.
- Browser proof at `http://127.0.0.1:4173/` confirmed the operator dashboard renders `Research Evidence Graph`, graph controls, node/edge counts, latest completed build, safety JSON, action proof, and edge examples.
- Browser `Build Graph` proof created completed build `research_graph_build_88e9cd5f-9316-4a9e-b2cf-d28d8e8f3825` with audit event `audit_be3046c2-9568-4c81-986e-8fd3baf400f9`.
- Browser proof screenshot: `artifacts/phase10o-research-graph-browser-proof.png`.

Current limits:
- The graph is a local metadata graph, not Neo4j/Graphiti graph storage.
- Graph build is synchronous for the local MVP. A durable queue can call the same build contract later.
- The graph is not a quality judge; it shows relationships and safety metadata but does not yet score individual answer claims.
- Graph responses intentionally hide raw artifact text and raw safe previews, so operators must open artifact review/search views for reviewed snippets.

Next step:
- Phase 10O is locally proven.
- Next phase should likely be Phase 10P quality judge/claim-level citation closure before broadening worker execution.

## Phase 10P Claim-Level Citation Closure Judge - 2026-06-01

What was built:
- Added research operations version `2026-06-01.phase10p-claim-citation-closure.v1`.
- Added operator assistant version `2026-06-01.phase10p-claim-citation-closure-proposals.v1`.
- Updated FastAPI facade version to `0.1.0-phase10p-claim-citation-closure`.
- Added `research_claim_evaluations` to the local schema and migration path.
- Added a labels-only citation closure evaluator that:
  - extracts factual/domain claims from safe answer previews,
  - compares claims only against `trusted_retrieval_approved` research artifacts,
  - labels claims as `supported`, `low_confidence`, or `unsupported`,
  - returns metadata-only citation pointers for trusted reviewed artifacts,
  - fails citation closure when any claim is unsupported or low confidence,
  - writes no new evidence and never promotes pending artifacts.
- Added stop-word filtering to the research scorer so common words do not create false weak support.
- Added Node endpoints:
  - `GET /api/research/citation-closure`,
  - `POST /api/research/citation-closure/evaluate`.
- Added FastAPI protected operator/admin proxies for both citation-closure endpoints.
- Added hash-chained `research_claim_citation_closure_evaluated` audit events.
- Added operator assistant tools:
  - read-only `research.listCitationClosure`,
  - proposal-gated `research.evaluateCitationClosure`.
- Added `/` operator dashboard controls and rendering for:
  - latest evaluation status/verdict,
  - claim counts and labels,
  - citation pointer artifact ids,
  - safety flags,
  - actions taken,
  - audit proof.

What was tested:
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/concierge/operatorAssistant.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --check src/server/build-check.mjs` passed.
- `node --test src/tests/research-ops.test.mjs src/tests/operator-assistant.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 29/29 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:local` passed with 151 tests total, 149 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- API proof for `POST /api/research/citation-closure/evaluate` returned a persisted evaluation, trusted citation pointers, labels-only safety flags, and audit event `research_claim_citation_closure_evaluated`.
- API proof for `GET /api/research/citation-closure` returned latest evaluation `research_claim_evaluation_f515ea47-df54-49d0-8334-c8ee69da032e` with:
  - `status=citation_closure_failed`,
  - `verdict=unsupported_claims_found`,
  - 2 claims,
  - 1 supported,
  - 1 unsupported,
  - audit event `audit_a190bf89-86a1-4752-9d4e-eb5f61ef6d4a`.
- Browser proof at `http://127.0.0.1:4173/` confirmed:
  - Phase 10P label rendered,
  - `Judge Citations` produced a Claim Citation Closure result,
  - supported and unsupported claim labels rendered,
  - citation artifact ids rendered for the supported claim,
  - labels-only safety and action proof rendered.
- Browser proof screenshot: `artifacts/phase10p-citation-closure-browser-proof.png`.

Current limits:
- The judge is deterministic lexical scoring over approved research artifacts; it is not yet an LLM-as-judge or embedding-grounded entailment model.
- Claim extraction intentionally stays conservative and domain-focused for the local MVP.
- The judge writes labels, scores, hashes, and metadata pointers only. It does not repair the answer automatically yet.
- Citation closure currently runs synchronously through the local API; production can later run it through a queue.

Next step:
- Phase 10P is locally proven.
- Next, produce the final PASS/FAIL/BLOCKED matrix over `docs/goal_final_system.md` before choosing production queue/backoff or broader real-source UX hardening.

## Phase 10Q Final-System Verification Matrix - 2026-06-01

What was built:
- Added `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md`.
- Converted every explicit final-system checklist id into a PASS / FAIL / BLOCKED row:
  - A1-A22 user dashboard,
  - B1-B8 user API,
  - C1-C32 operator dashboard,
  - D1-D24 operator API,
  - E1-E11 background/evidence pipeline,
  - F1-F4 worker adapters,
  - G1-G7 security/safety,
  - H1-H24 minimum "system is real" gate.
- Added `src/tests/final-system-verification-report.test.mjs`.
- Updated `npm run test:local` to include the report coverage test.
- Updated `npm run build` so the build guard requires:
  - the final report file,
  - the goal file,
  - the final report coverage test,
  - visible remaining failure/blocker categories.

What the report says now:
- The final system is not complete.
- 112 requirement rows are currently `PASSING`.
- 2 requirement rows are `BLOCKED BY EXTERNAL DEPENDENCY`:
  - live OpenClaw worker proof,
  - live Hermes worker proof.
- 18 requirement rows are `FAILING / NEEDS FIX`.
- The highest-priority failing areas are:
  - urgent/emergency safe escalation and durable human handoff,
  - Chat/Split/Guided/Bento mode preservation and typed AI2UI block contract,
  - research knowledge-base PDF upload/extraction,
  - research analytics and budget/kill-switch,
  - broader cost/prescription/procedure/provider journeys.

What was tested:
- `node --check src/tests/final-system-verification-report.test.mjs` passed.
- `node --test src/tests/final-system-verification-report.test.mjs` passed with 2/2 tests.
- `npm run build` passed with the Phase 10Q report guard.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run test:local` passed with 153 tests total, 151 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.

Current limits:
- Phase 10Q intentionally does not mark the active goal complete.
- The report is a closeout control surface, not a product feature.
- Full `npm run test:local` should be rerun after this report/test addition before commit or PR.

Next step:
- Phase 10R should implement urgent/emergency safe escalation and durable human handoff records, because that is the top remaining user-facing safety gap.

## Phase 10R Urgent/Emergency Human Handoff - 2026-06-01

What was built:
- Added urgent/emergency detection to `src/concierge/policy.mjs` for emergency-service, breathing/chest-pain, stroke/unconscious, self-harm/overdose, and severe-bleeding/pain signals.
- Routed urgent prompts through `urgent_emergency_escalation` and `human_approval_escalation` in the structured intent classifier.
- Added `src/concierge/humanHandoffs.mjs` and durable `human_handoff_items` storage.
- LangGraph now creates a `human_handoff_items` row, an `urgent_human_handoff` `agent_tasks` row, a hash-chained `human_handoff_created` audit event, and a safe immediate user response.
- Urgent runs explicitly bypass OpenClaw envelopes/proposals, browser evidence observation, payer contact, credential handling, form submission, external messages, and GPT calls.
- Added `GET /api/handoffs` in Node and the FastAPI facade.
- Added handoff visibility to `traceForSession`, session continuity, `/mvp`, and `/` operator proof.
- Updated local memory retention so urgent/safety prompts become blocked/escalated policy pointers instead of reusable raw prompt-recall text.
- Updated `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md` so A19, A20, and H10 are now `PASSING`.

What was tested:
- `node --check src/concierge/policy.mjs && node --check src/concierge/humanHandoffs.mjs && node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/server/server.mjs && node --check src/app/mvp.js && node --check src/app/app.js` passed.
- `python3 -m py_compile project/api/main.py project/api/models.py project/api/node_client.py` passed.
- `node --test src/tests/policy.test.mjs src/tests/structured-intent-classifier.test.mjs src/tests/langgraph-runner.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 36/36 tests.
- `node --test src/tests/database.test.mjs src/tests/session-continuity.test.mjs src/tests/final-system-verification-report.test.mjs` passed with 5/5 tests.
- `npm run test:facade` passed with 32 tests, 30 passed and 2 expected live-gated skips.
- `npm run build` passed with the urgent handoff schema/build guard.
- `npm run test:local` passed with 157 tests total, 155 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser proof at `http://127.0.0.1:4173/mvp` and `http://127.0.0.1:4173/`:
  - `/mvp` loaded the Phase 10R Handoff panel and started local session `session_4509a3c4-1082-4ef3-b5f4-3d9ffa0673db` through the visible UI.
  - A same-session urgent run created `handoff_c97f2738-b795-4953-bfed-4b95946c0998`, `task_a6fc5c94-34c7-4b8a-965c-19ea2f855d1f`, `workflow=human_approval_escalation`, `routeReason=urgent_emergency_handoff_required`, `workflowOutcome=urgent_handoff_created`, `model=skipped_urgent_emergency_escalation`, and `openclaw=false`.
  - The `/` operator dashboard rendered the Human Handoff card with `open · urgent`, `urgent_emergency`, the same session id, task id, summary, and audit id `audit_0414ffc7-562d-4320-8bf3-f128913d39a7`.
  - The operator trace showed `rawUserInputReturned=false`, `rawUserInputStored=false`, `openclawExecutedByHandoff=false`, and `externalActionTakenByHandoff=false`.
  - Browser-plugin screenshot capture timed out on `Page.captureScreenshot`, and macOS `screencapture` was unavailable in this sandbox (`could not create image from display`), so no screenshot artifact was saved for Phase 10R.

Current limits:
- Phase 10R does not complete the active goal.

## Phase 10S Typed AI2UI Blocks And MVP Modes - 2026-06-01

Slice name:
- Typed AI2UI block contract plus state-preserving `/mvp` Chat/Split/Guided/Bento modes.

Files changed:
- `src/concierge/ai2uiBlocks.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/app/mvp.html`
- `src/app/mvp.js`
- `src/app/mvp.css`
- `src/tests/ai2ui-blocks.test.mjs`
- `src/tests/chat-ui-contract.test.mjs`
- `src/tests/langgraph-runner.test.mjs`
- `package.json`
- `project/api/main.py`
- `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md`
- `docs/goal_final_system.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `brainstyworkers_ai_concierge_prompt.md`

Implemented:
- Added `brainstyworkers.ai2ui.blocks.v1` as a typed backend response contract.
- Added safe block normalization with an `unknown` fallback so unsupported future block types render as warning cards instead of breaking the MVP.
- LangGraph now attaches typed blocks after product-memory retain, so the response includes real answer, workflow, approval, worker, citation, memory, handoff, safety, and next-step state.
- `POST /api/chat` returns `ai2uiBlocks` at the top level and in `graphRun.state.ai2ui_blocks`.
- `/mvp` now exposes Chat, Split, Guided, and Bento presentation modes.
- Mode switching is state-preserving: it stores the selected mode in localStorage and re-renders the current session/run without creating a new session, rerunning LangGraph, consuming approvals, dispatching workers, or modifying memory.
- Split mode keeps the older detailed citation/memory proof panels while all modes use the typed block renderer.
- FastAPI facade version is now `0.1.0-phase10s-ai2ui-modes`.
- LangGraph runner version is now `2026-06-01.langgraph-runner.phase10s-ai2ui-modes.v1`.

Verification commands:
- `node --check src/concierge/ai2uiBlocks.mjs`
- `node --check src/concierge/langgraphRunner.mjs`
- `node --check src/app/mvp.js`
- `node --check src/server/build-check.mjs`
- `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/langgraph-runner.test.mjs`
- `npm run build`
- `npm run test:facade`
- `npm run test:local`
- Browser proof at `http://127.0.0.1:4173/mvp`

Verification result:
- Syntax checks passed.
- Focused Phase 10S tests passed:
  - 24 tests total,
  - 24 passed,
  - 0 failed.
- `npm run build` passed.
- `npm run test:facade` passed:
  - 32 tests total,
  - 30 passed,
  - 2 expected live-gated skips,
  - 0 failed.
- `npm run test:local` passed:
  - 159 tests total,
  - 157 passed,
  - 2 expected live-gated official OpenClaw skips,
  - 0 failed.
- Browser proof passed after restarting the Node server with refreshed code:
  - URL: `http://127.0.0.1:4173/mvp`,
  - title: `Brainstyworkers Concierge MVP`,
  - modes checked: Chat, Guided, Bento, Split,
  - all modes rendered typed AI2UI blocks,
  - the same session id was preserved across modes: `session_cc33e568-4612-4b88-bd35-29d06e8220d5`,
  - console error count: 0,
  - screenshot saved at `artifacts/phase10s-ai2ui-modes-browser-proof.png`.

What the user can try locally:
- Open `http://127.0.0.1:4173/mvp`.
- Start or resume a session.
- Run the Benefits workflow or another supported question.
- Switch among Chat, Split, Guided, and Bento from the top bar.
- Confirm the same session, latest answer, approvals, source pointers, handoffs, memory state, and operator proof link remain intact across modes.

Known risks or gaps:
- Phase 10S closes A6/A7 only; it does not complete the active final-system goal.
- Remaining high-priority gaps are production scheduled-worker/cron proof, research PDF upload/extraction, analytics, budget/kill-switch enforcement, expanded review queues, and broader domain journey completion.
- The handoff queue is visible and durable, but operator assignment/closure workflow remains a later hardening task.
- Next highest-priority gaps are typed AI2UI blocks, Chat/Split/Guided/Bento UI mode preservation, production schedule execution, research PDF ingestion, and analytics/budget kill-switch controls.

Next step:
- Phase 10S should implement typed AI2UI blocks and state-preserving MVP UI modes before adding broader workflow breadth.

## Phase 10T Research Scheduler Daemon Proof - 2026-06-01

Status: Implemented and verified locally on 2026-06-01.

Changed files:
- `src/concierge/researchScheduler.mjs`
- `src/concierge/schema.mjs`
- `src/concierge/database.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/app/index.html`
- `src/app/app.js`
- `src/tests/research-scheduler.test.mjs`
- `src/tests/chat-ui-contract.test.mjs`
- `project/api/main.py`
- `project/tests/test_fastapi_facade.py`
- `package.json`
- `docs/FINAL_SYSTEM_VERIFICATION_REPORT.md`
- `docs/goal_final_system.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`
- `brainstyworkers_ai_concierge_prompt.md`

Implemented:
- Added an env-gated research scheduler daemon around the existing approved-schedule due-tick contract.
- Added persisted daemon state in `research_scheduler_daemon_state`.
- Node creates the daemon on startup and auto-starts only when `BRAINSTY_RESEARCH_SCHEDULER_ENABLED=1`.
- Daemon ticks call `runDueResearchSchedules`, so approved schedules and approved/active sources remain the source of truth.
- Default daemon behavior queues `scheduled_research_run` records and does not silently execute workers.
- Daemon start/tick/overlap/failure events are published to `runtime_events`.
- Daemon tick completion, overlap skip, and failure are hash-chain audit visible.
- Added a same-process overlap guard to prevent duplicate interval ticks.
- Added Node and FastAPI routes for scheduler daemon status and tick.
- Added operator dashboard controls/cards for daemon process state, cadence, due count, last tick, actions, overlap count, and safety.
- Added tests for daemon tick proof, disabled status, startup scan, and overlap guard.

Verification:
- `node --check src/concierge/researchScheduler.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m compileall -q project` passed.
- `node --test src/tests/research-scheduler.test.mjs src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 24/24 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 32 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 163 total, 161 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser/API proof at `http://127.0.0.1:4173/` passed:
  - scheduler daemon status button present,
  - daemon tick button present,
  - process state showed `running`,
  - one due scheduled run was queued,
  - approved-schedule-only safety was visible,
  - console error count was 0,
  - screenshot saved at `artifacts/phase10t-research-scheduler-daemon-browser-proof.png`.
- Graceful shutdown proof passed after adding the server signal handler:
  - scheduler-enabled server received `SIGINT`,
  - daemon stop ran before listener close,
  - process exited with code 0,
  - no listener remained on port 4173.

Known risks or gaps:
- The local daemon uses an in-process interval and overlap guard. Production should run it under the chosen process manager/scheduler and move concurrency control to Postgres or a durable queue.
- Adaptive OpenClaw/Hermes scheduled dispatch remains feature-gated and approval-bound.
- The active final-system goal remains incomplete. Next high-priority gaps are research PDF upload/extraction, analytics and budget/kill-switch controls, expanded review queues, and broader journey/entity extraction.

## Phase 10U Dynamic Skill Server - 2026-06-02

Status: Implemented and verified locally.

Changed files:
- `src/concierge/dynamicSkillServer.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/concierge/llmOrchestrationDecision.mjs`
- `src/server/server.mjs`
- `src/server/build-check.mjs`
- `src/tests/dynamic-skill-server.test.mjs`
- `src/tests/langgraph-runner.test.mjs`
- `src/tests/memory-harness.test.mjs`
- `src/tests/research-ops.test.mjs`
- `openclaw/skills/insurance-plan-aetna-temporary/SKILL.md`
- `openclaw/skills/insurance-plan-aetna-temporary/skill.json`
- `openclaw/skills/insurance-plan-aetna-temporary/skill-server.json`
- `openclaw/skills/claim-journey-temporary/SKILL.md`
- `openclaw/skills/claim-journey-temporary/skill.json`
- `openclaw/skills/claim-journey-temporary/skill-server.json`
- `package.json`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/DECISIONS.md`

Implemented:
- Added a LangGraph-compatible dynamic skill server that reads editable `skill-server.json` files.
- Added temporary Aetna insurance-specific and claim journey-specific skill artifacts.
- Added allowlisted runtime mounts for memory/session/database context.
- Rejected arbitrary SQL from generated skill files by allowing only named database query keys.
- Added `dynamic_skill_context` to LangGraph shared state.
- Added `skill_resolver` node after workflow routing and before workflow execution.
- Added pre-LLM dynamic skill hints so GPT orchestration can consider available insurance and journey skills.
- Added `GET /api/dynamic-skills` and `POST /api/dynamic-skills/resolve`.
- Added build-check and unit coverage for the dynamic skill server.

Expected proof:
- Aetna benefits questions select `insurance_plan_aetna_temporary`.
- Claim questions select `claim_journey_temporary`.
- Account-specific portal evidence still uses `insurance_portal_browser` as the execution skill.
- Resolver output includes success estimates, data needed, runtime variables, required OpenClaw tasks, search engines, APIs, and mounted context.
- No worker execution, credential entry, payer contact, external message, form submission, record change, or medical advice is added by this phase.

Verification:
- `node --check src/concierge/dynamicSkillServer.mjs` passed.
- `node --check src/concierge/langgraphRunner.mjs` passed.
- `node --check src/concierge/llmOrchestrationDecision.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/server/build-check.mjs` passed.
- `node --check src/tests/dynamic-skill-server.test.mjs` passed.
- `node --check src/tests/langgraph-runner.test.mjs` passed.
- `node --check src/tests/research-ops.test.mjs` passed.
- `node --check src/tests/memory-harness.test.mjs` passed.
- `node --test src/tests/dynamic-skill-server.test.mjs` passed with 6/6 tests.
- `node --test src/tests/langgraph-runner.test.mjs` passed with 13/13 tests.
- `node --test src/tests/research-ops.test.mjs` passed with 11/11 tests.
- `node --test src/tests/memory-harness.test.mjs` passed with 2/2 tests.
- `npm run build` passed.
- `npm run test:local` passed with 169 total tests, 167 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- The first sandboxed `npm run test:local` attempt failed only because local API tests could not bind `127.0.0.1` inside the sandbox and because two research fixtures used localhost HTTP helpers that triggered a Node 24 native callback assertion. The confirmation run passed after moving those fixtures to injected deterministic fetches and rerunning the suite with localhost permission.

Known risks or gaps:
- The temporary Aetna and claim skills are sketches, not citation-closed production plan skills.
- The next skill-generation phase should create plan-specific `insurance_plan_*` packages from evidence bundles and enforce citation-backed deterministic tools.
- One older memory harness test still depends on previously captured real Aetna data for the cross-session memory proof. The claim-heartbeat test was isolated in a temporary store to avoid shared local backlog state.

## Phase 10V Dynamic Skill UI Exposure - 2026-06-03

Status: Implemented and verified locally.

Changed files:
- `src/app/app.js`
- `src/app/styles.css`
- `src/app/mvp.html`
- `src/app/mvp.js`
- `src/app/mvp.css`
- `src/server/server.mjs`
- `src/tests/chat-ui-contract.test.mjs`
- `src/tests/openclaw-api.test.mjs`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/PROGRESS.md`

Implemented:
- Added dynamic skill proof rendering to `/mvp`.
- Added a `/mvp` sequence step for skill resolution.
- Added selected insurance, journey, and execution skill display.
- Added success estimate, missing data, required OpenClaw tasks, required search, and required APIs to the MVP surface.
- Added the same dynamic skill proof to the `/` operator workflow proof.
- Added dynamic skill proof to the OpenClaw envelope validation panel.
- Returned `dynamicSkillContext` from `POST /api/openclaw/skills/insurance_portal_browser/validate-envelope`.
- Added UI/API contract assertions for the new proof surfaces.

Verification:
- `node --check src/app/app.js` passed.
- `node --check src/app/mvp.js` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/tests/chat-ui-contract.test.mjs` passed.
- `node --check src/tests/openclaw-api.test.mjs` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/dynamic-skill-server.test.mjs` passed with 15/15 tests.
- `node --test src/tests/openclaw-api.test.mjs` passed with 1/1 test.
- `npm run build` passed.
- Browser proof on `/mvp` passed after a deterministic claim workflow:
  - skill step showed `insurance=insurance_plan_aetna_temporary · journey=claim_journey_temporary · execution=insurance_portal_browser`,
  - dynamic skill panel showed success estimate `0.96`,
  - missing data and required worker tasks were visible,
  - worker tasks included `insurance_portal_browser.read_only_claims_observation`.
- Browser proof on `/` passed after `Validate Envelope`:
  - skill status was `validated_proposal_not_executed · task recorded`,
  - dynamic skill panel showed Aetna, claim journey, execution skill, missing data, worker tasks, search, APIs, and generator-edit constraints.

Known risks or gaps:
- UI now exposes dynamic skill resolution, but the temporary skill content is still sketch-level and should be replaced by citation-closed plan-specific skill packages.
- The dynamic skill card is proof-oriented. A later UX polish pass should decide how much of it belongs in the ordinary patient view versus an expandable advanced/proof view.

## OpenClaw Node Communication and Skill Verification - 2026-06-13

Status: Implemented guardrail fix and verified locally.

Changed files:
- `src/concierge/openclawLiveReadiness.mjs`
- `src/tests/openclaw-live-readiness.test.mjs`
- `docs/PROGRESS.md`

Implemented:
- Verified the official OpenClaw CLI is installed and reachable as `OpenClaw 2026.6.5`.
- Verified the dedicated Brainstyworkers OpenClaw profile configuration resolves to:
  - profile `brainstyworkers`
  - state dir `/Users/mfelix/.openclaw-brainstyworkers`
  - workspace `/Users/mfelix/.openclaw-brainstyworkers/workspace-brainstyworkers`
  - agent `brainstyworkers-insurance-browser`
  - browser profile `openclaw`
  - CDP browser on `http://127.0.0.1:19800`
- Verified profile readiness checks are true for config, workspace skill, agent, skill, browser automation, OCR local, personal-skill exclusion, browser enabled, and dedicated browser profile.
- Found and fixed a readiness fail-open bug: an unrelated offsite current tab such as `https://example.com/` was previously classified as ready for read-only approval.
- The live readiness classifier now requires a known member portal host or member/benefit/coverage/claims-like portal page before read-only approval can proceed.
- Added a regression test proving unrelated offsite tabs return `portal_page_required` with `readyForReadOnlyObservation=false`.

Verification:
- `openclaw --version` passed and returned `OpenClaw 2026.6.5 (5181e4f)`.
- Official OpenClaw readiness probe passed at the profile/browser layer and reported the current tab as `Example Domain` on `https://example.com/`.
- After the fix, the readiness classifier correctly returned `portal_page_required`, `readyForReadOnlyObservation=false`, and a user action to navigate to a benefits, coverage, eligibility, or claims page.
- `node --test src/tests/openclaw-live-readiness.test.mjs` passed with 8/8 tests.
- `node --test src/tests/openclaw-skill-artifacts.test.mjs src/tests/openclaw-skill-invocation.test.mjs src/tests/openclaw-worker-contract.test.mjs src/tests/openclaw-live-readiness.test.mjs src/tests/openclaw-official-runtime.test.mjs src/tests/dynamic-skill-server.test.mjs src/tests/worker-continuations.test.mjs src/tests/browser-takeover-safety.test.mjs` passed with 42 total tests, 40 passed, 0 failed, and 2 explicit live-gated OpenClaw skips.
- `npm run build` passed.
- `npm run test:local` passed after the guardrail fix with 176 total tests, 174 passed, 0 failed, and 2 explicit live-gated OpenClaw skips.
- `npm run test:live` passed with 1/1 live OpenAI model test and no skipped tests.
- `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1 node --test --test-name-pattern "public payer marketing" src/tests/openclaw-official-runtime.test.mjs` passed with 1/1 live official OpenClaw test and no skipped tests. This exercised the official browser worker path and confirmed public Aetna marketing content fails closed without creating source pointers or healthcare evidence.
- Post-run official OpenClaw readiness probe reported:
  - profile/browser ready,
  - CDP browser running,
  - current tab `Health Insurance Plans | Aetna` at `https://www.aetna.com/`,
  - readiness classification `portal_page_required`,
  - `readyForReadOnlyObservation=false`.

Known risks or gaps:
- The official OpenClaw profile and browser are running, but the current tab is not an authenticated payer/member portal page. Live authenticated current-tab dispatch remains gated until the user manually opens and authenticates the Aetna/member portal in the dedicated OpenClaw browser profile.
- The two skipped OpenClaw tests are correctly blocked by explicit preconditions:
  - set `BRAINSTY_OPENCLAW_OFFICIAL_LIVE=1` after the dedicated gateway is running,
  - set `BRAINSTY_OPENCLAW_AUTHENTICATED_LIVE=1` after an authenticated approved member portal tab is open.
- No mocked OpenClaw dispatch, no mocked LLM call, no credential entry, no payer contact, no external message, no form submission, and no irreversible portal action were used as proof.

## Browser GUI and User Takeover Verification - 2026-06-15

Status: Implemented health fix and verified live remote-browser GUI.

Changed files:
- `src/server/server.mjs`
- `src/tests/chat-ui-contract.test.mjs`
- `docs/PROGRESS.md`

Context confirmation:
- Repo status was inspected before coding.
- Cortex project context was loaded for `workerprototype_openclaw`.
- Cortex returned core project/user protocol only and no recent implementation notes; current repo state remained authoritative.
- Cortex boundary remains project memory only, not product/user memory.

Implemented:
- Fixed `/api/health` so Graphiti/FalkorDB downtime is reported as degraded product-memory status instead of crashing the whole health endpoint.
- Added static UI contract coverage for the standalone remote-browser page and embedded `/mvp` worker-browser panel.
- Confirmed the remote-browser GUI includes:
  - live frame stream connection,
  - start live view action,
  - takeover request,
  - explicit user grant,
  - human-only input relay,
  - return-control action,
  - copy stating the assistant never enters credentials.

Live verification:
- Restarted the local app at `http://127.0.0.1:4173`.
- `GET /api/health` returned HTTP 200 with `productMemory.status=degraded` while Graphiti/FalkorDB was unavailable on `localhost:6380`.
- Started the dedicated official OpenClaw browser profile:
  - `openclaw --profile brainstyworkers browser --browser-profile openclaw start`
  - result: browser running.
- Opened a safe non-PHI test page:
  - `openclaw --profile brainstyworkers browser --browser-profile openclaw open https://example.com`
- Verified `GET /remote-browser.html` and `GET /remoteBrowser.js` return HTTP 200.
- Verified `POST /api/runtime/browser/screencast/start` succeeds with:
  - `status=browser_screencast_started`
  - `targetUrl=https://example.com/`
- Verified `GET /api/runtime/browser/frames/stream` emits `browser.frame` events after screencast starts.
- Verified takeover flow through the same endpoints used by the GUI:
  - request: `interactive_takeover_pending_approval`
  - grant: `interactive_takeover_active`
  - relay test text: `interactive_takeover_input_relayed`
  - end: `interactive_takeover_ended`
  - audit-safe aggregate counts only: `{ key: 0, text: 1, mouse: 0, scroll: 0 }`
- The relay proof used only synthetic text `ui-test-no-secret`; no credential, PHI, payer action, form submission, or external message was sent.

Verification commands:
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/browser-takeover-safety.test.mjs src/tests/openclaw-api.test.mjs src/tests/openclaw-live-readiness.test.mjs` passed with 25/25 tests.
- `npm run build` passed.
- `npm run test:local` passed with 177 total tests, 175 passed, 0 failed, and 2 expected live-gated OpenClaw skips.

Known risks or gaps:
- The GUI is proven against a safe `https://example.com/` OpenClaw browser tab. Authenticated Aetna/member portal source-pointer proof remains gated until the user manually signs in and leaves an approved member portal page open.
- Product memory is correctly visible as degraded when Graphiti/FalkorDB is down; this does not prove Graphiti/FalkorDB is healthy.

## Next-Level Intelligence Loop Slice 1 - 2026-06-15

Status: Implemented and verified the first broad intelligence/automation slice.

Implemented:
- Added a multi-journey structured intent contract covering benefits/eligibility, claims/EOB, prior authorization, denial/appeal, provider/network, pharmacy/formulary, document review, cost estimate, urgent handoff, and trusted research.
- Added LLM/hybrid structured intent reasoning inside the outbound-payload observation path, with strict validation and deterministic safe fallback only for clearly safe unavailable-model cases.
- Added a source-caged LLM answer composer that receives source pointers, structured facts, and advisory memory, then validates every substantive claim against source pointer IDs before rendering `final_response`.
- Added LangGraph conditional routing after input policy and workflow routing, plus typed append/merge reducers for accumulating proof, tool calls, source pointers, worker results, runtime events, policy flags, journey decisions, and answer claims.
- Added an OpenClaw skill registry, executor registry, gateway client, profile readiness module, and worker policy module so multiple skills can be discovered and bounded without editing hardcoded artifact lists.
- Hardened SQL helper entry points with table/column allowlists and identifier validation. Full replacement of shell-backed sqlite with a bound-parameter Node SQLite adapter remains open.
- Added a retention sweeper for expired runtime state and memory tombstoning.
- Added required package scripts for journey, graph topology, OpenClaw skill registry, DB safety, PHI, retention, egress, and live LLM intent/composition/journey tests.

Verification:
- `npm run build` passed.
- `npm run test:local` passed with 187 total tests, 185 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- `npm run test:graph:topology` passed.
- `npm run test:journeys` passed.
- `npm run test:openclaw:skills` passed.
- `npm run test:egress` passed.
- `npm run test:llm:composition` passed with a real OpenAI model call after network approval.
- `npm run test:llm:intent` passed with real OpenAI model calls after network approval.
- `npm run test:llm:journeys` passed with real OpenAI model calls after network approval.
- Local API health returned HTTP 200 at `http://127.0.0.1:4173/api/health` with OpenAI configured and product memory visibly degraded because Graphiti/FalkorDB was unavailable.
- Static MVP endpoints returned HTTP 200 for `/`, `/mvp`, and `/remote-browser.html`.
- In-app Browser visual proof loaded `http://127.0.0.1:4173/mvp`, showing the Brainstyworkers Concierge UI, Marcelo Felix local auth fields, live GPT decisioning toggle, workflow controls, upload controls, portal worker controls, and chat input.
- In-app Browser remote-control proof clicked the `Guided` tab and the screenshot/DOM state confirmed `Guided` became the selected view.

Score decision:
- This slice passes its local intelligence, live-LLM, OpenClaw registry, API, and GUI proof gates.
- The full `/goal #general` is not complete yet because Graphiti/FalkorDB product memory is degraded, full better-sqlite3 or production DB migration is not done, remote push is not done, WhatsApp/Telegram/email OpenClaw gateway skills are not implemented, and authenticated Aetna portal proof remains gated by user login state.

Known risks or gaps:
- Product memory health is observable but not fully available until Graphiti/FalkorDB is running and replay/retain failure handling is broadened.
- Database safety is improved but still not production-complete because legacy raw SQL and sqlite shell execution remain.
- PHI-at-rest encryption and full retention acceptance are still partial.
- LangSmith trace compatibility is prepared only at the architecture/test level, not fully wired as a live trace exporter.
- OpenClaw skill discovery is generic, but official messaging gateways and native channel skills for WhatsApp, Telegram, and email remain future slices.
- Authenticated payer/member portal extraction was not performed in this slice; no credential entry, payer contact, form submission, or irreversible portal action was executed.

## Next-Level Intelligence Loop Slice 2 - Product Memory Replay Queue - 2026-06-15

Status: Implemented and locally verified.

Implemented:
- Added durable `product_memory_replay_queue` storage for retryable Graphiti/Zep product-memory retain failures.
- Failed retryable retains now enqueue safe source-pointer retain payloads for later replay instead of relying only on transient repair-plan metadata.
- Product-memory status now includes replay queue health so degraded memory is visible as actionable backlog.
- Added `GET /api/product-memory/replay-queue` for local queue inspection.
- Added `POST /api/product-memory/replay` to replay queued retains through the same observed Graphiti payload path when the product-memory adapter is enabled.
- Replay attempts write hash-chained audit events for queued, completed, and failed replay states.
- Policy/manual payload failures remain manual-repair items and are not silently retried as if they were runtime downtime.

Verification:
- `node --check src/concierge/productMemory.mjs` passed.
- `node --check src/server/server.mjs` passed.
- Focused product-memory/database tests passed with 7/7 tests.
- Focused API/product-memory tests passed outside the sandbox after local server binding was allowed: 6 passed, 2 Graphiti-live tests skipped with explicit FalkorDB precondition.
- `npm run build` passed.
- `npm run test:local` passed with 189 total tests, 187 passed, 0 failed, and 2 expected live-gated OpenClaw skips.

Score decision:
- This slice improves the product-memory score by adding visible degraded-mode backlog and replay mechanics.
- The full product-memory requirement is still not 100% complete because actual replay into Graphiti/FalkorDB was not live-proven in this run; `npm run test:memory:graphiti` still requires FalkorDB/Graphiti live preconditions.

Known risks or gaps:
- Full product-memory completion still needs a running Graphiti/FalkorDB service and a replay proof that queued items move to `completed`.
- The queue stores safe source-pointer retain payloads; it intentionally does not store raw portal text or direct identifiers.
- Production should eventually move this queue to the production DB/queue backend with transactional leases and worker concurrency controls.

## Next-Level Intelligence Loop Slice 3 - Native SQLite Store And Migration Ledger - 2026-06-15

Status: Implemented and locally verified.

Implemented:
- Replaced the store's per-query `sqlite3` CLI shell-out path with a persistent native `node:sqlite` `DatabaseSync` connection.
- Removed `child_process` usage from `src/concierge/database.mjs`.
- Added `schema_migrations` as a migration ledger table.
- Added `DATABASE_ADAPTER_VERSION=2026-06-15.node-sqlite-bound-store.v1`.
- Changed high-level `insert`, `update`, `findOne`, and `list` helpers to use bound parameters for values while preserving identifier allowlists for table and column names.
- Added an explicit `transaction(callback)` helper using `BEGIN IMMEDIATE`, `COMMIT`, and `ROLLBACK`.
- Kept the public async store API stable so existing LangGraph, OpenClaw, memory, audit, research, and UI code paths continue to use the same store object.
- Updated browser takeover tests to create real user/session rows instead of placeholder IDs; native SQLite now enforces foreign keys consistently.

Verification:
- `node --check src/concierge/database.mjs` passed.
- Focused DB/audit/concurrency tests passed with 7/7 tests.
- `npm run test:db:safety` passed with 3/3 tests.
- `npm run build` passed.
- `npm run test:local` passed with 191 total tests, 189 passed, 0 failed, and 2 expected live-gated OpenClaw skips.

Score decision:
- This slice materially improves the database architecture score by removing shell-backed sqlite execution from the central store and adding bound helper methods plus a migration ledger.
- The full database production target is still not complete because many legacy raw SQL call sites remain and production deployment still needs a stronger database/queue story such as Postgres or a hardened SQLite lease model.

Known risks or gaps:
- Raw SQL strings still exist at call sites that use `store.get()` and `store.all()` directly; this slice removes shell execution and hardens high-level helpers but does not rewrite every query to parameter binding.
- `node:sqlite` is local-process storage; production concurrency still needs database-level leases, transactional worker claims, and deployment-specific durability.

## Next-Level Intelligence Loop Slice 4 - Bound Query Cleanup For Recent Safety Paths - 2026-06-15

Status: Implemented and locally verified.

Implemented:
- Migrated product-memory replay queue inspection and due-replay selection to bound query parameters, including bound `LIMIT` values.
- Migrated the retention sweeper's expiration scans to bound query parameters.
- Migrated `/api/review/latest` structured extraction lookups to bound query parameters instead of manual quote escaping.
- Added DB safety coverage proving raw `store.get()` and `store.all()` support bound value parameters for hostile-looking values.
- Confirmed the touched product-memory, retention, server review, and DB-safety files no longer use manual `replaceAll` SQL quote escaping.

Verification:
- `node --check src/concierge/productMemory.mjs` passed.
- `node --check src/concierge/retentionPolicy.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `npm run test:db:safety` passed with 4/4 tests.
- Focused product-memory API/contract and retention tests passed with 7/7 tests after local server binding was allowed for the API test.
- `npm run build` passed.
- `npm run test:local` passed with 192 total tests, 190 passed, 0 failed, and 2 expected live-gated OpenClaw skips.

Score decision:
- This slice reduces the raw-SQL risk in recently added memory/retention/API surfaces and makes the migration path explicit for remaining legacy raw SQL callers.
- The full database production target remains incomplete until the older modules are migrated away from manual SQL interpolation or isolated behind reviewed query helpers.

Known risks or gaps:
- Older modules such as audit, session, memory harness, research, and operator helpers still contain hand-built SQL. Many values are generated IDs or already escaped, but they remain technical debt against the production-grade database target.
- Production worker concurrency still needs leases or a production database backend.

## Next-Level Intelligence Loop Slice 5 - Bound Audit Log Queries - 2026-06-15

Status: Implemented and locally verified.

Implemented:
- Migrated audit hash lookup, audit-chain verification, and audit log filter queries to bound query parameters.
- Replaced audit filter string interpolation with a parameterized where-builder for `sessionId`, `eventType`, `eventPrefix`, `since`, `until`, and free-text query.
- Escaped `LIKE` wildcard characters so user-entered `%` and `_` remain literal in audit log searches unless the code intentionally adds the event-prefix suffix wildcard.
- Added audit tests for hostile-looking event-prefix and session filters, literal wildcard search behavior, and normal prefix filtering.

Verification:
- `node --check src/concierge/audit.mjs` passed.
- Focused audit/DB/browser takeover tests passed with 13/13 tests.
- `npm run build` passed.
- `npm run test:local` passed with 193 total tests, 191 passed, 0 failed, and 2 expected live-gated OpenClaw skips.

Score decision:
- This slice reduces database risk on the audit API, which is a core proof and operator-readiness surface.
- The full database target remains incomplete until the remaining session, memory harness, research, operator, and worker query modules are either bound or isolated behind reviewed helpers.

Known risks or gaps:
- Audit writes were already using high-level insert helpers; this slice focused on read/filter/query paths.
- Remaining raw SQL technical debt should continue module-by-module to avoid a destabilizing all-at-once rewrite.

## Next-Level Intelligence Loop Slice 6 - Bound Session Runtime Queries - 2026-06-15

Status: Implemented and locally verified.

Implemented:
- Migrated `resolveManagedSession` latest-session lookup to bound query parameters.
- Migrated `listManagedSessions` email/user filtering and `LIMIT` to bound query parameters.
- Removed unused manual SQL quote helper from `sessionContinuity`.
- Added session-manager tests proving hostile-looking email and user-id filters do not broaden session listing.
- Added resume-latest regression coverage to preserve LangGraph stateful session behavior.
- Confirmed `sessionManager`, `sessionContinuity`, and the session-manager tests no longer contain manual `replaceAll` SQL quote escaping.

Verification:
- `node --check src/concierge/sessionManager.mjs` passed.
- `node --check src/concierge/sessionContinuity.mjs` passed.
- Focused session/continuity/DB tests passed with 11/11 tests.
- `npm run build` passed.
- `npm run test:local` passed with 195 total tests, 193 passed, 0 failed, and 2 expected live-gated OpenClaw skips.

Score decision:
- This slice hardens the session runtime path that carries LangGraph state, checkpointing, and user continuity.
- The full database target remains incomplete because memory harness, research/operator, worker, and some legacy engine paths still contain hand-built SQL.

Known risks or gaps:
- Session continuity itself mostly used high-level helpers already; this slice primarily removed dead manual-quote code there and hardened session listing/resume queries.
- Remaining raw SQL migration should continue by subsystem, with memory harness and research/operator paths next.

## Next-Level Intelligence Loop Slice 7 - Bound Memory Harness Queries - 2026-06-15

Status: Implemented and locally verified.

Implemented:
- Removed the memory harness manual SQL quote helper.
- Migrated context-building queries for portal accounts, recent sessions, memory items, open tasks, scheduled jobs, structured source pointers, context packets, outbox, and harness runs to bound query parameters.
- Migrated memory-retention and follow-up planning lookups to bound parameters, including hostile-looking source IDs and nullable session job matching.
- Clamped caller-provided query limits before binding them.
- Added a memory harness regression proving hostile-looking user IDs do not broaden user lookup, hostile-looking claim/source IDs remain literal values, duplicate follow-up planning stays idempotent for those literal values, and cross-user retained memory is not leaked into another user's harness state.

Verification:
- `node --check src/concierge/memoryHarness.mjs` passed.
- Focused memory-harness and DB-safety tests passed with 7/7 tests.
- `npm run build` passed.
- `npm run test:local` passed with 196 total tests, 194 passed, 0 failed, and 2 expected live-gated OpenClaw skips.

Score decision:
- This slice hardens the prompt-context and heartbeat harness path that injects session, memory, task, and scheduled-job data into LangGraph/OpenClaw context packets.
- It improves the database architecture and memory safety scores without changing OpenClaw authority boundaries or model behavior.

Known risks or gaps:
- Research/operator/worker continuation and some legacy engine query paths still need the same bound-parameter migration.
- Product-memory production readiness still depends on a real Graphiti/FalkorDB deployment or another approved product-memory adapter with health, replay, and egress enforcement.

## Next-Level Intelligence Loop Slice 8 - Bound Approval And Worker Continuation Queries - 2026-06-15

Status: Implemented and locally verified.

Implemented:
- Removed manual SQL quote helpers from the approval-resume and worker-continuation modules.
- Migrated approval-token lookup to bound query parameters while preserving session/gate-type binding and single-use consumption behavior.
- Migrated worker latest-event lookup and continuation listing filters to bound query parameters.
- Added safe limit clamping for continuation listing.
- Added approval regression coverage proving hostile-looking session IDs are treated literally and cannot consume an approval token from the real session.
- Added worker continuation regression coverage proving hostile-looking session/status filters do not broaden listing results.

Verification:
- `node --check src/concierge/approvalResume.mjs` passed.
- `node --check src/concierge/workerContinuations.mjs` passed.
- Focused approval/worker-continuation/DB tests passed with 14/14 tests after local test-server binding was allowed for the approval API test.
- `npm run build` passed.
- `npm run test:local` passed with 198 total tests, 196 passed, 0 failed, and 2 expected live-gated OpenClaw skips.

Score decision:
- This slice strengthens the approval and continuation boundary that protects OpenClaw read-only execution, approval consumption, async worker status, and user/session/task binding.
- It improves approval/audit scaffolding and database hardening without broadening browser automation or adding new external actions.

Known risks or gaps:
- Research/operator scheduler/query modules, runtime events, document candidate approval, workflow architecture, and some legacy engine/test query paths still contain raw SQL or manual quote helpers.
- Production-grade database readiness still needs continued module-by-module binding plus deployment-level concurrency/lease decisions.

## Live LLM Regression Proof After Native SQLite - 2026-06-15

Status: Fixed test precondition and verified with real OpenAI calls.

Implemented:
- Updated the live LLM sourced-answer composition test to create a real enrolled user/session before composing, so outbound payload observation and audit writes satisfy native SQLite foreign-key enforcement.
- No model calls were mocked and no deterministic template was counted as live LLM proof.

Verification:
- Initial live LLM intent and journey runs were blocked by sandbox DNS for `api.openai.com`; rerunning with network approval resolved the precondition.
- Initial live LLM composition run exposed the real foreign-key setup bug described above; after the fix, it passed.
- `npm run test:llm:composition` passed with 1/1 live OpenAI model test.
- `npm run test:llm:intent` passed with 1/1 live OpenAI model test.
- `npm run test:llm:journeys` passed with 1/1 live OpenAI model test.

Known risks or gaps:
- These live tests prove the current real-model harness, not Graphiti/FalkorDB health or authenticated OpenClaw portal dispatch.
- Network access is still an external precondition for live LLM proof in the local sandbox.

## Complemented Plan Cycle - OpenClaw Automation, Sourced Answers, And Hardening - 2026-06-15

Status: Implemented and locally verified.

Implemented:
- Added registry-driven OpenClaw bounded task proposal construction using selected insurance, journey, and execution skills.
- Added executor selection/validation around the selected registry skill and task action.
- Removed the single-skill assumption from OpenClaw skill-envelope validation while preserving manifest workflow, approval, blocked-action, and required-input checks.
- Integrated the bounded proposal into the LangGraph workflow executor proof, lifecycle events, and exported state.
- Made sourced LLM answer composition the preferred evidence-backed path when source pointers exist and live model use is not explicitly disabled.
- Kept deterministic fallback for no source pointers, missing model key, explicit offline mode, or strict validator failure.
- Added a conditional evidence-observation route so graph topology proof covers evidence blocked, evidence found, and answer composition before final response.
- Added retention audit proof for expired sessions, expired worker continuations, and expired memory tombstones.
- Tuned live intent instructions so urgent health language routes to human handoff without being mislabeled as a prohibited action request.

Verification:
- `npm run test:openclaw:skills` passed with 11/11 tests.
- `npm run test:llm:composition` passed with 1/1 live OpenAI model test after network approval.
- `npm run test:llm:intent` passed with 1/1 live OpenAI model test after network approval.
- `npm run test:llm:journeys` passed with 1/1 live OpenAI model test after network approval.
- `npm run test:journeys` passed with 8/8 tests.
- `npm run test:db:safety` passed with 4/4 tests.
- `npm run test:phi` passed with 1/1 tests.
- `npm run test:retention` passed with 1/1 tests.
- `npm run test:egress` passed with 4/4 tests.
- `npm run test:graph:topology` passed with 2/2 tests.
- `npm run build` passed.
- `npm run test:local` passed with 200 total tests, 198 passed, 0 failed, and 2 expected live-gated OpenClaw skips.

Score decision:
- Strong browser automation MVP: unchanged by this slice; existing read-only readiness and fail-closed browser tests remain green.
- PHI process and treatments: improved through retained egress/PHI gates; still not a real treatment or clinical advice system.
- Strong approval/audit scaffolding: improved through bounded proposal proof and retention audit proof.
- Strong LLM orchestration: improved; live intent, journey, and sourced composition gates are green.
- Strong product memory: unchanged in production readiness; Graphiti/FalkorDB deployment remains an external acceptance item.
- Full multi-journey design: improved through registry-routed insurance, claim journey, and Aetna plan skill proof.
- Production-grade intelligence architecture: improved through sourced composer preference, validator veto, and topology proof.
- Local and remote pushed: local verified only; no commit or remote push was requested or performed in this cycle.
- GUI/OCR/browser proof: not rerun because this cycle changed backend graph, policy, retention, and tests rather than UI/browser controls.
- API readiness: unchanged except safer graph/runtime proof payloads.
- Database product-ready architecture: improved through retention proof and earlier bound-parameter work; remaining raw SQL cleanup continues module by module.
- Data injection for MVP multi-journey test: existing local journey and dynamic-skill tests remain green.
- LangChain/LangSmith traceability: unchanged.
- OpenClaw gateway/skills: improved through registry-routed multi-skill bounded proposals.
- OpenClaw connected to remote browser: unchanged; live authenticated OpenClaw remains gated by external profile/browser state.
- OpenClaw native skills availability: improved for registry-discovered official skills, still subject to actual installed skill artifacts and executor readiness.

Known risks or gaps:
- Authenticated remote browser/OCR proof still needs a live signed-in approved portal tab and explicit user approval before read-only worker dispatch.
- Product memory full score still requires real Graphiti/FalkorDB health, replay, and degraded-mode production proof.
- Remaining raw SQL sites should continue moving to bound parameters.
- No external/write action execution was enabled; this remains intentionally blocked until a separate approval contract exists.

## Server Connector + Next Mobile MVP Cycle - 2026-06-15

Status: Implemented and locally verified.

Implemented:
- Added FastAPI `/api/v1` connector routes for sessions, tasks, task status, task events, approvals, documents, OpenClaw readiness, browser sessions, browser stream, browser input, browser takeover, and proof runs.
- Added v1 response contracts for task lifecycle status, task proposal, browser session, and proof-run score reporting.
- Added a provider-neutral browser sandbox boundary with a local CDP adapter that proxies through the existing Node/OpenClaw runtime while preserving bearer-user ownership checks.
- Added a Next.js mobile PWA scaffold in `apps/mobile-next` with a connector-only API client that rejects non-`/api/v1` paths.
- Installed and built the Next.js PWA locally, added same-origin `/api/v1` rewrites, and kept browser clients away from direct Node/internal runtime paths.
- Added task polling, live browser SSE parsing, and a user-facing answer formatter so the PWA shows regular-user results instead of raw operator routing/proof text.
- Hardened the Node live-browser frame producer with a CDP screenshot fallback and latest-frame replay for late subscribers when native `Page.screencastFrame` events do not arrive.
- Added a connector verification panel to `/` showing goals, checks, scores, visual gates, and safety boundaries.
- Kept `/mvp` as the static compatibility harness while the PWA moves toward parity.

Verification:
- `python3 -m compileall -q project` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 11/11 tests.
- `npm run test:facade` passed with 34 tests and 2 expected skips.
- `npm run build` in `apps/mobile-next` passed.
- `npm audit --audit-level=moderate` in `apps/mobile-next` found 0 vulnerabilities.
- `npm run build` passed.
- `npm run test:local` passed with 202 total tests, 200 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- Fresh local server proof passed on `http://127.0.0.1:4174`.
- `GET /api/proof/runs/server-connector-next-mobile-mvp` returned the connector cycle, goals, checks, scores, visual gates, and safety contract.
- Browser proof for `/` showed the connector verification dashboard with no console errors.
- Browser proof for `/mvp` showed the static compatibility harness with no console errors.
- Browser proof for the Next.js PWA at `http://127.0.0.1:3000/` passed at a 390x844 mobile viewport: Session, Ask, Worker, and Live all worked; task status reached `completed`; the answer panel hid raw LangGraph/source-pointer/audit labels; the live worker block rendered a `data:image/jpeg` browser frame; console errors were 0.
- Direct FastAPI stream proof confirmed `/api/v1/browser/sessions/{browser_session_id}/stream` emits a `browser.frame` event through the v1 connector.
- Visual screenshots:
  - `/private/tmp/workerprototype-openclaw-connector-visual/server-connector-dashboard-proof.png`
  - `/private/tmp/workerprototype-openclaw-connector-visual/server-connector-mvp-compat-proof.png`
  - `/private/tmp/workerprototype-openclaw-mobile-pwa-visual/15-mobile-pwa-final-clean-live-frame.png`

Known risks or gaps:
- The first browser sandbox adapter is local CDP, not a hosted remote sandbox provider.
- Docker compose proof for FastAPI, Node, database, product memory, and sandbox adapter remains a later cycle.
- Graphiti/FalkorDB product memory remained degraded on this machine during connector verification and still needs full Docker/remote deployment proof.
- The live worker frame is visually available, but approval-gated read-only portal evidence still depends on the user keeping an approved authenticated portal page in the dedicated OpenClaw profile.

## Long-Run Phase Checkpoint - 2026-06-15

Status: The long run is in the production-hardening / remote-application connector phase. The local MVP is no longer only a prototype UI: it now has a FastAPI public connector, a Next.js mobile PWA client, a local-CDP browser sandbox adapter, live worker-frame proof, and dashboard proof. It is not yet a full production deployment because Docker, hosted remote sandbox, deployed Graphiti/FalkorDB, and external channel adapters still need acceptance proof.

Original build-prompt milestone position:
- Milestone 1, core LangGraph web-chat graph: locally implemented.
- Milestone 2, product memory retain/recall: locally implemented with Graphiti adapter and degraded/replay behavior, but production Graphiti/FalkorDB health remains pending.
- Milestone 3, workflow coverage and human approval gates: locally implemented for the MVP healthcare/insurance journeys with approval, refusal, urgent handoff, evidence-blocked, and sourced-answer gates.
- Milestone 4, multi-channel / remote client deployment: partially implemented. The public FastAPI `/api/v1` connector and Next.js mobile PWA are working; WhatsApp, Telegram, email, voice, and hosted remote browser sandbox remain pending.
- Milestone 5, production hardening: in progress. Local gates for PHI, egress, retention, DB safety, graph topology, OpenClaw skills, visual UI proof, and audit scaffolding pass; Docker, deployed memory, production DB, LangSmith/LangChain trace readiness, and budget/kill-switch controls still need full proof.

Complemented-plan cycle position:
- Cycle 1, OpenClaw automation gap: implemented and locally verified.
- Cycle 2, sourced-answer gap: implemented and locally/live-LLM verified.
- Cycle 3, safety hardening: partially implemented and locally verified for DB/PHI/retention/egress; remaining work is production/Docker and broader document/screenshot/remote deployment proof.
- Cycle 4, graph topology proof: implemented and locally verified.
- Cycle 5, full score decision: local score decision recorded and pushed; incomplete scores remain tied to external deployment dependencies.

Server Connector + Next Mobile MVP cycle position:
- Cycle 1, public connector API: implemented and tested.
- Cycle 2, Next.js mobile PWA shell: implemented, built, audited, and visually tested.
- Cycle 3, remote browser sandbox gateway: implemented with local CDP adapter and live-frame proof.
- Cycle 4, verification dashboard: implemented with connector proof endpoint and visual score reporting.
- Current next phase: Cycle 6-style production hardening and remote-app readiness. The next implementation should focus on Docker compose/startup proof, hosted sandbox/WebRTC provider or equivalent remote sandbox, product-memory deployment health, upload/document parity in the PWA, history/approval parity, and production-safe observability/trace configuration.

Latest pushed proof:
- Project branch: `feature/phase-11-remote-browser-control`.
- Latest project commit: `cd38788` (`Implement server connector mobile MVP`).
- Project PR: `https://github.com/MarceloDe/concierge_by_openclaw_hermes/pull/2`.
- Cortex memory branch: `memory/codex/2026-06-15`.
- Cortex memory commit: `7887689`.
- Cortex PR: `https://github.com/MarceloDe/cortex/pull/76`.

Decision for the next loop:
- Do not declare full production completion yet.
- Treat the current local system as a verified server-connector/mobile MVP.
- Start the next loop at production hardening and deployment proof, not more local UI breadth.

## Production Connector Docker Cycle - 2026-06-15

Status: Implemented and verified with a live local compose smoke.

Implemented:
- Added `.dockerignore`.
- Added `Dockerfile.node`, `Dockerfile.api`, and `apps/mobile-next/Dockerfile`.
- Added root `compose.yaml` with separate `node-runtime`, `fastapi`, `mobile-pwa`, and `falkordb` services.
- Added host-port overrides for local compose smoke without killing existing servers:
  - `BRAINSTY_COMPOSE_NODE_PORT`,
  - `BRAINSTY_COMPOSE_API_PORT`,
  - `BRAINSTY_COMPOSE_MOBILE_PORT`,
  - `BRAINSTY_COMPOSE_FALKORDB_PORT`,
  - `BRAINSTY_COMPOSE_FALKORDB_UI_PORT`.
- Added `scripts/compose-contract.mjs`, `src/tests/deployment-compose.test.mjs`, and npm scripts:
  - `docker:config`,
  - `docker:contract`,
  - `test:docker:contract`.
- Extended the Node dashboard proof payload with `docker_compose_contract`, `deployment_contract`, deployment files, services, and score.
- Fixed the mobile PWA Docker rewrite by baking `BRAINSTY_CONNECTOR_API_BASE=http://fastapi:8000` during the Next build stage.
- Fixed the Node runtime image so it includes the deployment proof files used by the dashboard.
- Improved the mobile PWA Live block so a missing OpenClaw/sandbox frame becomes a clear `official_openclaw_profile_not_ready` blocker instead of an indefinite `waiting for frames`.

Verification commands:
- `node --check scripts/compose-contract.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/server/build-check.mjs` passed.
- `npm run test:docker:contract` passed with 1/1 test.
- `node scripts/compose-contract.mjs --static-only` passed.
- `npm run docker:config` passed.
- `node scripts/compose-contract.mjs` passed and verified `docker compose config`.
- `npm run build` passed.
- `python3 -m compileall -q project` passed.
- `npm run build` in `apps/mobile-next` passed.
- `docker compose build` passed for `node-runtime`, `fastapi`, and `mobile-pwa`.
- `colima start --cpu 2 --memory 4` succeeded.
- Live compose smoke passed with alternate host ports:
  - Node: `http://127.0.0.1:4273`,
  - FastAPI: `http://127.0.0.1:8100`,
  - PWA: `http://127.0.0.1:3100`,
  - FalkorDB: `6480`,
  - FalkorDB UI: `3101`.
- `docker compose ps` showed Node, FastAPI, and PWA healthy.
- `GET http://127.0.0.1:8100/api/v1/health` returned `node_runtime_ok=true`.
- Visual PWA proof passed:
  - loaded at `http://127.0.0.1:3100/`,
  - Session button created a session through `/api/v1`,
  - Ask created a task and reached `approval_pending`,
  - Worker reported `official_openclaw_profile_not_ready`,
  - Live showed a clear blocker instead of hanging,
  - console errors: 0.
- Visual dashboard proof passed:
  - loaded at `http://127.0.0.1:4273/`,
  - Connector proof showed `docker_compose_contract=compose_contract_present`,
  - deployment score showed `75 / 75`,
  - console errors: 0.

Visual artifacts:
- `artifacts/phase11-compose-mobile-pwa-degraded-live-proof.png`
- `artifacts/phase11-compose-dashboard-proof.png`

Score decision:
- API readiness: remains passing for the connector API; live compose proves FastAPI-to-Node network health.
- GUI visual test: passing for the container PWA and container dashboard.
- Remote browser controls: locally gatewayed, but container proof currently reports `official_openclaw_profile_not_ready`; hosted sandbox/OpenClaw image readiness is still the next dependency.
- Database product-ready architecture: improved with deployable volumes and service boundaries, but still not production Postgres.
- Product memory: honest degraded/disabled-safe remains the default startup posture; full Graphiti/FalkorDB in-container proof is now implemented and passes when the adapter is explicitly enabled with credentials.

Known risks or gaps:
- The Docker Node image now installs and verifies the Graphiti Python runtime. Production managed graph storage and secret-manager profiles are still not implemented.
- The first compose sandbox path is still local CDP/OpenClaw readiness, not a hosted remote sandbox/WebRTC provider.
- The compose stack uses local SQLite volumes, not production Postgres/transactional deployment storage.
- OpenClaw official profile/browser readiness is not available inside the container image yet, so Live correctly shows a blocker rather than a frame.

## Product Memory Container Runtime Cycle - 2026-06-15

Status: Implemented and verified with live Docker compose Graphiti/FalkorDB schema plus retain/recall proof.

Implemented:
- Updated `Dockerfile.node` to install Python, create `/app/.venv-graphiti`, install `vendor/getzep-graphiti[falkordb]`, and verify `graphiti_core` plus the FalkorDB driver during image build.
- Kept `BRAINSTY_PRODUCT_MEMORY_ADAPTER` disabled by default, but wired runtime env for explicit Graphiti activation:
  - `OPENAI_API_KEY`,
  - `BRAINSTY_OPENAI_BASE_URL`,
  - `GRAPHITI_OPENAI_BASE_URL`,
  - `GRAPHITI_LLM_MODEL`,
  - `GRAPHITI_SMALL_MODEL`,
  - `GRAPHITI_EMBEDDING_MODEL`,
  - `GRAPHITI_MAX_COROUTINES`,
  - `GRAPHITI_STORE_RAW_EPISODES=0`.
- Made the optional Kuzu import lazy in `tools/graphiti/graphiti_bridge.py` so the FalkorDB-only container path boots without Kuzu.
- Added `scripts/compose-memory-smoke.mjs` and package script `docker:memory:smoke`.
- Added `src/tests/deployment-graphiti-compose.test.mjs` and included it in `test:docker:contract`.
- Extended connector proof with:
  - `graphiti_container_product_memory`,
  - `graphiti_container_runtime`,
  - `product_memory_deployment`.
- Changed deployment scoring so disabled-safe product memory is not counted as full Graphiti readiness.

Verification commands:
- `node --check scripts/compose-contract.mjs` passed.
- `node --check scripts/compose-memory-smoke.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `python3 -m py_compile tools/graphiti/graphiti_bridge.py` passed.
- `npm run test:docker:contract` passed with 4/4 tests.
- `npm run docker:contract` passed and verified `docker compose config`.
- `npm run build` passed.
- Docker compose rebuilt the Node runtime image with the Graphiti Python runtime.
- Live Graphiti compose smoke passed:
  - command: `BRAINSTY_COMPOSE_NODE_PORT=4273 BRAINSTY_COMPOSE_API_PORT=8100 BRAINSTY_EXPECT_GRAPHITI_READY=1 BRAINSTY_RUN_GRAPHITI_PROBE=1 npm run docker:memory:smoke`,
  - Node health passed,
  - FastAPI health passed with `nodeRuntimeOk=true`,
  - product memory reported `adapter=graphiti`, `schemaReady=true`, `backend=falkordb`, `rawEpisodeStorage=false`,
  - replay queue was empty,
  - safe probe retained episode `2dccbc76-ee07-419f-bc76-e277015da164`,
  - recall returned 1 fact,
  - raw portal text was not stored,
  - Cortex was not used as product memory.
- Direct container API proof passed:
  - `GET http://127.0.0.1:4273/api/product-memory/status` returned `/app/.venv-graphiti/bin/python`, `falkordb:6379`, `schemaReady=true`, and enforced outbound payload observation with no direct identifiers or portal text.
- Connector proof endpoint reported:
  - `product_memory=graphiti_schema_ready`,
  - `graphiti_container_runtime=graphiti_container_runtime_present`,
  - `product_memory_deployment=100 / 100`.

Visual artifact:
- `artifacts/phase11-graphiti-container-dashboard-proof.png`

Score decision:
- Product memory deployment: now passes `100 / 100` for the compose stack when Graphiti is explicitly enabled with credentials.
- Docker deployment contract: remains passing `75 / 75`.
- Database product-ready architecture: still not final production-ready because structured app state remains SQLite volumes rather than Postgres/transactional production storage.
- Remote browser controls: still need hosted/container OpenClaw sandbox readiness beyond the local-CDP adapter.

Known risks or gaps:
- The Node image now contains Graphiti, but the default compose adapter remains disabled-safe to avoid failing local startup without model credentials.
- Secrets are passed at runtime, not baked into the image. A production secret manager is still required.
- FalkorDB is containerized with a local Docker volume; managed graph storage or production backup/restore policy is still pending.
- OpenClaw official profile/browser readiness remains a blocker inside the compose image.

## Postgres Storage Deployment Profile Cycle - 2026-06-15

Status: Implemented and verified as a live Postgres deployment target, with the application runtime intentionally still on the bound-parameter SQLite store until adapter migration tests are added.

Implemented:
- Added a `postgres` service to `compose.yaml` using `postgres:16-alpine`, a health check, configurable `BRAINSTY_COMPOSE_POSTGRES_PORT`, persistent `postgres_data`, and the init mount `project/db/postgres-init:/docker-entrypoint-initdb.d:ro`.
- Added `project/db/postgres-init/001_storage_readiness.sql` with the storage readiness table and contract row.
- Added `src/concierge/storageReadiness.mjs` to report runtime driver, SQLite safety, Postgres target/configuration/live readiness, redacted database URL, migration-pending state, and a storage score.
- Added `scripts/storage-contract.mjs`, `npm run storage:contract`, and `npm run storage:postgres:smoke`.
- Added `src/tests/deployment-storage.test.mjs` and included it in `npm run test:docker:contract`.
- Updated `Dockerfile.node`, `compose.yaml`, `scripts/compose-contract.mjs`, `src/server/build-check.mjs`, and the connector proof endpoint so the dashboard reports `postgres_storage_profile`, `database_storage`, and `database_product_ready_architecture`.

Verification commands:
- `node --check scripts/storage-contract.mjs` passed.
- `node --check src/concierge/storageReadiness.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `npm run storage:contract` passed.
- `npm run storage:postgres:smoke` passed and returned readiness row `brainstyworkers-postgres-live-smoke | 2026-06-15.postgres-storage-profile.v1 | postgres`.
- `npm run test:docker:contract` passed with 6/6 tests.
- `npm run build` passed.
- `npm run test:local` passed with 202 tests total, 200 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- `BRAINSTY_COMPOSE_NODE_PORT=4273 BRAINSTY_COMPOSE_API_PORT=8100 BRAINSTY_EXPECT_GRAPHITI_READY=1 npm run docker:memory:smoke` passed after the rebuild.
- `docker compose ps` showed Postgres, Node, FastAPI, PWA, and FalkorDB running; Postgres, Node, FastAPI, and PWA were healthy.
- Direct connector proof at `http://127.0.0.1:4273/api/proof/runs/phase11-postgres-storage` reported `storage.status=postgres_live_ready_sqlite_runtime`, `score=85`, `targetScore=100`, `appRuntimeMigratedToPostgres=false`, `migrationPending=true`, and a redacted database URL.
- Browser dashboard proof at `http://127.0.0.1:4273/?phase=postgres-storage` showed `postgres_storage_profile`, `database_storage`, `database_product_ready_architecture=85 / 100`, `postgres_live_ready_sqlite_runtime`, and `migrationPending=true` with 0 console errors.

Visual artifact:
- `artifacts/phase11-postgres-storage-dashboard-proof.png`

Score decision:
- Database product-ready architecture: improved from local-volume-only toward `85 / 100` because compose now contains a live Postgres target and smoke proof.
- The score does not reach `100 / 100` because application state still runs through the SQLite adapter and the Postgres application adapter/migration tests are not implemented.
- Product memory container proof remains passing after the rebuild.

Known risks or gaps:
- `BRAINSTY_DB_DRIVER=postgres` is not yet supported as the default app runtime path.
- Transactional leases, concurrent worker claims, migration rollback tests, and hosted backup/restore proof are still pending.
- Production secret-manager integration is still needed before a remote deployment should use real credentials.

## Postgres Runtime Adapter Parity Cycle - 2026-06-16

Status: Implemented and verified as a selectable Postgres runtime for core application storage operations. SQLite remains the default runtime until endpoint-wide query compatibility, leases, backup/restore, and secret-manager proof are complete.

Implemented:
- Added `pg` and refreshed the dependency lockfile; `npm audit fix` updated vulnerable transitive `uuid` usage through LangGraph and left `npm audit --audit-level=moderate` clean.
- Added `src/concierge/postgresStore.mjs` with:
  - `POSTGRES_ADAPTER_VERSION=2026-06-16.pg-bound-store-parity.v1`,
  - bound parameter translation from `?` to `$1..$n`,
  - schema initialization from `SCHEMA_SQL`,
  - foreign-key-safe table creation ordering,
  - high-level `insert`, `update`, `findOne`, `list`, `counts`, and `transaction`,
  - a compatibility shim for existing audit `rowid` query reads.
- Added `src/concierge/databaseFactory.mjs` so `BRAINSTY_DB_DRIVER=postgres` selects `PostgresStore`, while default runtime remains `SqliteStore`.
- Updated `src/server/server.mjs` to use the factory and report `databaseDriver` plus `databaseAdapterVersion` from `/api/health`.
- Added `scripts/postgres-runtime-smoke.mjs` and package scripts:
  - `storage:postgres:runtime-smoke`,
  - `test:db:postgres`.
- Added `src/tests/postgres-store-contract.test.mjs` and included it in `npm run test:db:safety`.
- Updated compose, storage contract, deployment contract, build guard, storage readiness, and connector proof to report runtime smoke readiness and database score `90 / 100` after adapter parity proof.

Verification commands:
- `node --check src/concierge/postgresStore.mjs` passed.
- `node --check src/concierge/databaseFactory.mjs` passed.
- `node --check scripts/postgres-runtime-smoke.mjs` passed.
- `node --check src/concierge/storageReadiness.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `npm run test:db:postgres` passed with 3/3 tests.
- `npm run test:db:safety` passed with 7/7 tests.
- `npm run storage:contract` passed.
- `npm run test:docker:contract` passed with 7/7 tests.
- `npm run storage:postgres:runtime-smoke` passed against live Docker Postgres.
- `npm audit --audit-level=moderate` passed with 0 vulnerabilities after `npm audit fix`.
- `npm run build` passed.
- `npm run test:local` passed with 202 tests total: 200 passed and 2 expected live-gated OpenClaw skips.
- Temporary server proof passed:
  - command used `HOST=127.0.0.1 PORT=4193 BRAINSTY_DB_DRIVER=postgres BRAINSTY_DATABASE_URL=<redacted local Postgres URL> BRAINSTY_POSTGRES_LIVE_READY=1 BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY=1 npm start`,
  - server booted with `Database driver: postgres`,
  - `/api/health` returned `databaseDriver=postgres`, adapter `2026-06-16.pg-bound-store-parity.v1`, `storage.status=postgres_runtime_selected_parity_smoked`, `score=90`, `appRuntimeMigratedToPostgres=true`, `fullMigrationReady=false`, `migrationPending=true`,
  - `/api/proof/runs/postgres-runtime-adapter` returned `database_product_ready_architecture=90 / 100` with status `postgres_adapter_parity_ready_runtime_migration_pending`,
  - port `4193` was clear after shutdown.
- Docker Compose proof passed after image rebuild:
  - `docker compose ps` reported healthy `node-runtime` on `4273`, `fastapi` on `8100`, `mobile-pwa` on `3100`, `postgres` on `55432`, and running `falkordb`.
  - `http://127.0.0.1:4273/api/health` reported `databaseDriver=sqlite`, storage status `postgres_adapter_parity_ready_sqlite_default`, `score=90`, `postgres.runtimeSmokeReady=true`, and `migrationPending=true`.
  - `http://127.0.0.1:4273/api/proof/runs/postgres-runtime-adapter` reported the full connector proof with `database_product_ready_architecture=90 / 100`.
  - `BRAINSTY_COMPOSE_NODE_PORT=4273 BRAINSTY_COMPOSE_API_PORT=8100 BRAINSTY_EXPECT_GRAPHITI_READY=1 npm run docker:memory:smoke` passed with product memory `adapter=graphiti`, `status=graphiti_schema_ready`, and replay queue ready.
- Browser proof passed at `http://127.0.0.1:4273/?phase=postgres-runtime-adapter`: the dashboard loaded connector proof, displayed `database_product_ready_architecture`, `90 / 100`, `postgres_adapter_parity_ready_sqlite_default`, and runtime smoke/migration-pending proof with 0 console errors. Screenshot: `artifacts/phase11-postgres-runtime-adapter-dashboard-proof.png`.

Live Postgres runtime smoke details:
- Version: `2026-06-16.postgres-runtime-parity.v1`.
- Driver: `postgres`.
- Table count: 54.
- Core counts after smoke included users, sessions, session checkpoints, audit events, workflow definitions, tool registry rows, and OpenClaw skill rows.
- Smoke proved schema migration ledger, planned-member enrollment, managed session state, session checkpoint, hash-chain audit write, and transaction rollback.
- Safety proof reported bound parameters, no SQLite shell-out, no external actions, and no PHI seed.

Score decision:
- Database product-ready architecture improved from `85 / 100` to `90 / 100`.
- The score remains below `100 / 100` because Postgres is selectable and parity-smoked for core operations, but not yet the default for every endpoint/worker path and not yet backed by production lease, migration, backup/restore, and secret-manager gates.

Known risks or gaps:
- Some existing raw SQL paths still contain SQLite-specific assumptions such as `rowid` ordering or manually interpolated values. The adapter handles the audited `rowid` path, but every endpoint path still needs compatibility coverage before defaulting to Postgres.
- Database-level leases and concurrent worker claims are not implemented yet.
- Hosted Postgres backup/restore proof and secret-manager profile are still pending.

## Postgres Operational Readiness Cycle - 2026-06-16

Status: Implemented and live-smoked as an operational-readiness gate. Database architecture can now score `95 / 100` when endpoint parity, leases, and backup/restore are proven, while `100 / 100` remains blocked on a managed-secret/default-runtime rollout gate.

Implemented:
- Added `worker_leases` to `src/concierge/schema.mjs` and the table registry.
- Added `src/concierge/workerLeases.mjs` with:
  - `WORKER_LEASES_VERSION=2026-06-16.worker-leases.v1`,
  - atomic acquire with conflict blocking,
  - heartbeat extension,
  - owner-only release,
  - expired lease sweeping.
- Added `scripts/postgres-production-readiness-smoke.mjs` and package script `storage:postgres:production-smoke`.
- Added `src/tests/worker-leases.test.mjs`.
- Added `src/tests/postgres-production-readiness-contract.test.mjs`.
- Updated `npm run test:db:postgres`, `npm run test:db:safety`, `npm run test:local`, storage contract, compose contract, build guard, Dockerfile, compose env, server proof payload, and storage readiness.
- Storage readiness now reports:
  - `postgres.productionSmokeReady`,
  - `postgres.workerLeaseReady`,
  - `postgres.backupRestoreReady`,
  - `postgres.endpointParityReady`,
  - `postgres.operationalGatesReady`,
  - `postgres.productionGatesReady`,
  - `safety.secretProfileReady`.

Verification commands:
- `node --check src/concierge/workerLeases.mjs` passed.
- `node --check scripts/postgres-production-readiness-smoke.mjs` passed.
- `node --check src/concierge/storageReadiness.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `npm run test:db:postgres` passed with 9/9 tests.
- `npm run test:db:safety` passed with 13/13 tests.
- `npm run storage:contract` passed.
- `npm run test:docker:contract` passed with 8/8 tests.
- `npm run build` passed.
- `docker compose ps postgres` reported Postgres running healthy on host port `55432`.
- `npm run storage:postgres:production-smoke` passed against live Docker Postgres.
- Temporary server proof passed:
  - command used `HOST=127.0.0.1 PORT=4194 BRAINSTY_DB_DRIVER=postgres BRAINSTY_DATABASE_URL=<redacted local Postgres URL> BRAINSTY_POSTGRES_LIVE_READY=1 BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY=1 BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY=1 BRAINSTY_POSTGRES_WORKER_LEASE_READY=1 BRAINSTY_POSTGRES_BACKUP_RESTORE_READY=1 BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY=1 BRAINSTY_DATABASE_SECRET_PROFILE_READY=0 npm start`,
  - server booted with `Database driver: postgres`,
  - `/api/health` reported `storage.status=postgres_runtime_selected_operational_gates_ready_secret_profile_pending`, `score=95`, `appRuntimeMigratedToPostgres=true`, `fullMigrationReady=false`, `migrationPending=true`, and `secretProfileReady=false`,
  - `/api/proof/runs/postgres-operational-readiness` reported `database_product_ready_architecture=95 / 100` and the production smoke/worker lease/backup restore/endpoint parity gates,
  - port `4194` was clear after shutdown.
- Browser proof passed at `http://127.0.0.1:4194/?phase=postgres-operational-readiness`: the dashboard loaded connector proof, displayed `database_product_ready_architecture`, `95 / 100`, `postgres_runtime_selected_operational_gates_ready_secret_profile_pending`, and no console errors. Screenshot: `artifacts/phase11-postgres-operational-readiness-dashboard-proof.png`.

Live Postgres production smoke details:
- Version: `2026-06-16.postgres-production-readiness.v1`.
- Adapter: `2026-06-16.pg-bound-store-parity.v1`.
- Lease version: `2026-06-16.worker-leases.v1`.
- Endpoint parity proof created one user, session, checkpoint, OpenClaw proposal task, approval gate, and hash-chain audit event.
- Worker lease proof:
  - first worker acquired,
  - second worker was blocked while active,
  - heartbeat succeeded,
  - owner release succeeded,
  - second worker acquired after release,
  - final claim count was 2.
- Backup/restore proof:
  - temporary source and restore databases were created and cleaned up,
  - 55 tables were included in the snapshot contract,
  - 17 non-empty tables were compared,
  - no count mismatches were found,
  - restored user/session/checkpoint/approval/audit/worker-lease rows were present,
  - smoke-only artifact written to `artifacts/postgres-production-readiness-smoke.json`.
- Safety proof reported bound parameters, no SQLite shell-out, no external actions, no PHI seed, and temporary databases only.

Score decision:
- Database product-ready architecture can move from `90 / 100` to `95 / 100` when the operational flags are set:
  - `BRAINSTY_POSTGRES_RUNTIME_SMOKE_READY=1`,
  - `BRAINSTY_POSTGRES_PRODUCTION_SMOKE_READY=1`,
  - `BRAINSTY_POSTGRES_WORKER_LEASE_READY=1`,
  - `BRAINSTY_POSTGRES_BACKUP_RESTORE_READY=1`,
  - `BRAINSTY_POSTGRES_ENDPOINT_PARITY_READY=1`.
- The score remains below `100 / 100` until a real managed-secret or equivalent production secret profile is proven and `BRAINSTY_DATABASE_SECRET_PROFILE_READY=1` is justified.

Known risks or gaps:
- Full endpoint regression with `BRAINSTY_DB_DRIVER=postgres` is still needed before changing the default runtime.
- The backup/restore proof is a logical smoke over app rows; production still needs scheduled hosted backup and restore runbooks.
- Managed-secret/Docker-secret profile is pending and intentionally blocks `100 / 100`.

## Postgres Default Rollout And Secret Profile Cycle - 2026-06-16

Status: Implemented and visually verified. Database product-ready architecture can now score `100 / 100` only when Postgres is the selected runtime, operational Postgres gates pass, a secret-backed database URL profile is ready, and the default-rollout gate is set.

Implemented:
- Added `src/concierge/databaseSecretProfile.mjs` with:
  - `DATABASE_SECRET_PROFILE_VERSION=2026-06-16.database-secret-profile.v1`,
  - secret-backed source detection for `BRAINSTY_DATABASE_URL_FILE`, Docker/local secret files, and explicit managed-env profiles,
  - redacted URL and hash-only proof fields,
  - direct raw env URL rejection unless it is explicitly marked as managed env.
- Updated `src/concierge/databaseFactory.mjs` so the Postgres runtime driver resolves the database URL through the secret profile contract.
- Added `scripts/postgres-default-rollout-smoke.mjs` and package script `storage:postgres:default-rollout-smoke`.
- Updated `scripts/postgres-runtime-smoke.mjs` and `scripts/postgres-production-readiness-smoke.mjs` to use the same secret-aware URL resolution path.
- Updated `src/concierge/storageReadiness.mjs` with:
  - `postgres.defaultRolloutReady`,
  - `postgres.defaultRolloutCommand`,
  - `postgres.secretProfile`,
  - `safety.databaseSecretProfile`,
  - status `postgres_runtime_selected_secret_profile_ready_default_rollout_pending`,
  - status `postgres_secret_profile_ready_sqlite_default_rollout_pending`,
  - score `98 / 100` for Postgres runtime plus operational and secret gates but no default rollout,
  - score `100 / 100` only for full Postgres runtime production readiness.
- Updated compose, Dockerfile, storage contract, compose contract, build guard, server connector proof, and focused DB tests.
- Added artifacts:
  - `artifacts/postgres-default-rollout-smoke.json`,
  - `artifacts/postgres-default-rollout-production-smoke.json`,
  - `artifacts/phase11-postgres-default-rollout-dashboard-proof.png`.

Verification commands:
- `node --check src/concierge/databaseSecretProfile.mjs` passed.
- `node --check src/concierge/storageReadiness.mjs` passed.
- `node --check src/concierge/databaseFactory.mjs` passed.
- `node --check scripts/postgres-default-rollout-smoke.mjs` passed.
- `node --check scripts/postgres-runtime-smoke.mjs` passed.
- `node --check scripts/postgres-production-readiness-smoke.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check scripts/storage-contract.mjs` passed.
- `node --check scripts/compose-contract.mjs` passed.
- `npm run test:db:postgres` passed with 11/11 tests.
- `npm run test:db:safety` passed with 15/15 tests.
- `npm run storage:contract` passed.
- `npm run test:docker:contract` passed with 8/8 tests.
- `npm run storage:postgres:default-rollout-smoke` passed against live Docker Postgres.
- `npm run storage:postgres:production-smoke` passed after the secret-aware URL resolution change.
- `npm run build` passed.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.

Default rollout smoke details:
- Version: `2026-06-16.postgres-default-rollout.v1`.
- Runtime driver: `postgres`.
- Runtime adapter: `2026-06-16.pg-bound-store-parity.v1`.
- Runtime table count: 55.
- Secret source: `ephemeral_local_secret_file` for the local smoke; health/proof artifacts expose only redacted URL and hashes.
- Storage status: `postgres_production_ready`.
- Storage score: `100 / 100`.
- `fullMigrationReady=true`.
- `migrationPending=false`.
- Production smoke summary inside the rollout proof:
  - endpoint parity ok,
  - worker lease ok,
  - backup/restore ok,
  - 55 tables,
  - 17 compared non-empty tables,
  - no count mismatches.
- Leak check on `artifacts/postgres-default-rollout-smoke.json` and `artifacts/postgres-default-rollout-production-smoke.json` found no raw password, raw secret path, or raw database URL.

Temporary server proof:
- A temporary server booted on `http://127.0.0.1:4195` with:
  - `BRAINSTY_DB_DRIVER=postgres`,
  - `BRAINSTY_DATABASE_URL_FILE=<temporary secret file>`,
  - `BRAINSTY_DATABASE_SECRET_SOURCE=local_secret_file`,
  - all Postgres operational gate flags set to `1`,
  - `BRAINSTY_POSTGRES_DEFAULT_ROLLOUT_READY=1`.
- `/api/health` reported:
  - `databaseDriver=postgres`,
  - `storage.status=postgres_production_ready`,
  - `score=100`,
  - `fullMigrationReady=true`,
  - `migrationPending=false`,
  - `secretProfileReady=true`,
  - `defaultRolloutReady=true`,
  - redacted database URL only.
- `/api/proof/runs/postgres-default-rollout` reported:
  - `database_product_ready_architecture=100 / 100`,
  - status `postgres_production_ready`,
  - production gates endpoint/worker/backup/secret/default all true,
  - command `npm run storage:postgres:default-rollout-smoke`.
- Browser dashboard proof passed at `http://127.0.0.1:4195/?phase=postgres-default-rollout` with 0 console errors. Screenshot: `artifacts/phase11-postgres-default-rollout-dashboard-proof.png`.
- Port `4195` was clear after shutdown.

Score decision:
- Database product-ready architecture can now reach `100 / 100` in the isolated Postgres runtime + secret profile + default rollout proof.
- SQLite remains the safe local default in compose until the user chooses to flip defaults.
- The local smoke proves the architecture and Docker-compatible secret-file path; a hosted deployment must still provide its real secret manager or Docker secret mount.

Known risks or gaps:
- The default local compose profile still uses SQLite by default to preserve developer ergonomics.
- The local proof uses an ephemeral local secret file; production should mount a real Docker secret or managed secret source.
- Hosted scheduled backup/restore runbooks remain a deployment operations follow-up beyond the logical restore smoke.

## Phase 11 Postgres Docker-Secret Runtime Profile Update

Status: Implemented and visually verified.

Code changes:
- Added `compose.postgres.yaml` as a Docker Compose override for a Postgres runtime selected through `/run/secrets/brainsty_database_url`.
- Added ignored deployment secret placeholders under `project/deployment/secrets/`.
- Added `scripts/postgres-production-profile-contract.mjs`.
- Added package script `storage:postgres:profile-contract`.
- Added `src/tests/postgres-production-profile-contract.test.mjs`.
- Updated compose/storage contracts, storage readiness, build guard, server connector proof payload, `.gitignore`, and `.dockerignore`.

Safety decision:
- The profile selects the Postgres runtime and Docker-secret source, but does not hardcode proof gates to `1`.
- Database readiness still reaches `100 / 100` only after runtime, operational, secret-profile, and default-rollout gates are proven.
- The dashboard now has a separate `database_deployment_profile` score for the existence of the profile.

Verification so far:
- `node --check scripts/postgres-production-profile-contract.mjs` passed.
- `node --check scripts/compose-contract.mjs` passed.
- `node --check scripts/storage-contract.mjs` passed.
- `node --check src/concierge/storageReadiness.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/server/build-check.mjs` passed.
- `npm run storage:postgres:profile-contract` passed.
- `node scripts/postgres-production-profile-contract.mjs` passed and reported `dockerConfig.ok=true`.
- Focused contract tests passed with 7/7 tests.
- `npm run test:docker:contract` passed with 10/10 tests.
- `npm run storage:contract` passed.
- `npm run build` passed.
- `npm run test:db:postgres` passed with 11/11 tests.
- `npm run test:db:safety` passed with 15/15 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Browser proof passed at `http://127.0.0.1:4196/?phase=postgres-production-profile` with 0 console errors.
- Dashboard proof showed:
  - `postgres_production_profile=postgres_docker_secret_runtime_profile_present`,
  - `database_deployment_profile=100 / 100`,
  - `database_product_ready_architecture=75 / 100` on the safe SQLite local default.
- Screenshot: `artifacts/phase11-postgres-production-profile-dashboard-proof.jpg`.

Next proof:
- Run the profile with a real provider secret file or managed secret mount when deployment credentials are available.

## Phase 12 Postgres Profile Live Regression Update

Status: Implemented, live-smoked, visually verified, and cleaned up.

Slice name:
- Endpoint-wide Postgres regression and live Docker-secret compose profile proof.

Code changes:
- Added `scripts/postgres-endpoint-regression-smoke.mjs`.
- Added `scripts/postgres-production-profile-live-smoke.mjs`.
- Added `src/tests/postgres-production-profile-live-contract.test.mjs`.
- Added package scripts:
  - `storage:postgres:endpoint-regression-smoke`;
  - `storage:postgres:profile-live-smoke`.
- Updated compose/storage contracts, server proof payload, build guard, Docker image context, and deployment storage tests.
- Updated `.dockerignore` so safe deployment secret docs remain available while real runtime secret files stay excluded.
- Updated `Dockerfile.node` so the Node image contains `compose.postgres.yaml` for dashboard proof.

Verification commands:
- `node --check scripts/postgres-endpoint-regression-smoke.mjs`
- `node --check scripts/postgres-production-profile-live-smoke.mjs`
- `node --check scripts/storage-contract.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/server/server.mjs`
- `node --check src/server/build-check.mjs`
- `node --test src/tests/postgres-production-profile-live-contract.test.mjs src/tests/deployment-compose.test.mjs src/tests/deployment-storage.test.mjs`
- `npm run test:docker:contract`
- `npm run storage:contract`
- `npm run storage:postgres:endpoint-regression-smoke`
- `BRAINSTY_PROFILE_SMOKE_KEEP_STACK=1 npm run storage:postgres:profile-live-smoke`
- `npm run build`
- `node --test src/tests/final-system-verification-report.test.mjs`
- `npm run test:db:postgres`
- `npm run test:db:safety`
- `npm run test:local`

Verification result:
- Focused syntax checks passed.
- Focused contract tests passed with 7/7 tests.
- `npm run test:docker:contract` passed with 12/12 tests.
- `npm run storage:contract` passed and reported the new endpoint/live profile commands.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:db:postgres` passed with 11/11 tests.
- `npm run test:db:safety` passed with 15/15 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Endpoint regression smoke passed with:
  - `databaseDriver=postgres`;
  - adapter `2026-06-16.pg-bound-store-parity.v1`;
  - `storage.status=postgres_production_ready`;
  - `database_product_ready_architecture=100 / 100`;
  - `database_deployment_profile=100 / 100`;
  - OpenClaw skill count `3`;
  - chat final response present;
  - skill-envelope `executionMode=proposal_only` and `actionsTakenCount=0`.
- Live profile smoke passed with:
  - isolated compose ports `4296`, `8296`, `3296`, `65432`, `6580`, and `3297`;
  - Node `/api/health` on Postgres with score `100`;
  - FastAPI `/api/v1/health` with `nodeRuntimeOk=true`;
  - PWA `/` status `200`;
  - no raw database URL, raw secret-file path, or external action leakage.
- In-app browser dashboard verification passed at `http://127.0.0.1:4296/?phase=postgres-profile-live` with required proof strings present and 0 console errors.
- In-app browser PWA verification passed at `http://127.0.0.1:3296/` with regular-user Session/Journey/Worker/Evidence/Answer surfaces present and 0 console errors.
- Screenshot artifacts:
  - `artifacts/phase12-postgres-profile-live-dashboard-proof.png`
  - `artifacts/phase12-postgres-profile-live-pwa-proof.png`
- Cleanup proof:
  - temporary compose project `brainstyworkers-profile-smoke-1781647680491` was torn down with volumes removed;
  - `project/deployment/secrets/.runtime` was deleted;
  - ports `4296`, `8296`, `3296`, `65432`, `6580`, and `3297` were verified clear.

What the user can try locally:
- Run `npm run storage:postgres:endpoint-regression-smoke` with Docker Postgres available.
- Run `npm run storage:postgres:profile-live-smoke` to prove the Postgres Docker-secret compose profile end to end.
- Use `BRAINSTY_PROFILE_SMOKE_KEEP_STACK=1 npm run storage:postgres:profile-live-smoke` when a visual dashboard/PWA proof is needed before automatic teardown.

Known risks or gaps:
- The smoke uses a local Docker-secret-compatible file, not the hosted deployment's final secret manager.
- Hosted backup scheduling and operator restore runbooks are still follow-up production work.
- Base compose still defaults to SQLite for local developer safety until the user explicitly approves changing the general default.

## Phase 13 Postgres Hosted Backup Runbook Update

Status: Implemented, live-smoked, API-proven, and visually verified.

Slice name:
- Provider-neutral hosted Postgres backup/restore runbook proof gate.

Code changes:
- Added `docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md`.
- Added `scripts/postgres-backup-runbook-smoke.mjs`.
- Added package script `storage:postgres:backup-runbook-smoke`.
- Added `src/tests/postgres-backup-runbook-contract.test.mjs`.
- Updated compose defaults, Docker image context, storage readiness, connector proof payload, build guard, compose/storage contracts, and deployment storage tests.

Safety decision:
- The new runbook gate is separate from the core database product-ready architecture score.
- `database_backup_restore_runbook` reaches `100 / 100` only when the runbook smoke has passed and `BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY=1`.
- The smoke uses temporary Postgres databases, does not seed PHI, does not execute external actions, and does not perform destructive production restores.
- Smoke artifacts are sanitized and must not contain raw database URLs or secret-file paths.

Verification commands:
- `node --check scripts/postgres-backup-runbook-smoke.mjs`
- `node --check scripts/storage-contract.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/concierge/storageReadiness.mjs`
- `node --check src/server/server.mjs`
- `node --check src/server/build-check.mjs`
- `node --test src/tests/postgres-backup-runbook-contract.test.mjs src/tests/deployment-storage.test.mjs src/tests/deployment-compose.test.mjs`
- `npm run test:docker:contract`
- `npm run storage:contract`
- `docker compose up -d postgres`
- `docker compose exec -T postgres pg_isready -U brainsty -d brainstyworkers`
- `npm run storage:postgres:backup-runbook-smoke`
- `curl -s http://127.0.0.1:4198/api/proof/runs/postgres-backup-runbook`

Verification result:
- Focused syntax checks passed.
- Focused contract tests passed with 7/7 tests.
- `npm run test:docker:contract` passed with 14/14 tests.
- `npm run storage:contract` passed and reported `backupRunbookCommand`.
- Docker Postgres readiness passed.
- `npm run storage:postgres:backup-runbook-smoke` passed.
- The smoke validated the runbook, compared 17 restored tables with no count mismatches, and restored user, session, checkpoint, approval, audit, and worker-lease rows.
- Sanitized artifacts reported:
  - no raw database URL;
  - no raw secret-file path;
  - no external actions;
  - no PHI seed;
  - no destructive production restore.
- API proof reported:
  - `postgres_backup_runbook=backup_restore_runbook_smoked`;
  - `database_backup_restore_runbook=100 / 100`.
- In-app browser verification passed at `http://127.0.0.1:4198/?phase=postgres-backup-runbook` with required runbook proof strings present in the dashboard DOM and 0 console errors.
- Screenshot and proof artifacts:
  - `artifacts/phase13-postgres-backup-runbook-dashboard-proof.png`;
  - `artifacts/phase13-postgres-backup-runbook-proof.json`;
  - `artifacts/postgres-backup-runbook-smoke.json`;
  - `artifacts/postgres-backup-runbook-production-smoke.json`.

Known risks or gaps:
- Hosted provider backup/PITR policy is not configured yet.
- The smoke proves local Docker Postgres restore rehearsal and runbook compliance, not a managed provider restore.
- Provider-specific restore promotion steps should be added after the deployment target is selected.

## Phase 14 Postgres Provider Backup Policy Update

Status: Implemented and contract-smoked. Hosted provider configuration remains intentionally not claimed.

Slice name:
- Provider backup/PITR policy contract and readiness gate.

Code changes:
- Added `project/deployment/postgres-provider-backup-policy.example.json`.
- Added `scripts/postgres-provider-backup-policy-smoke.mjs`.
- Added package script `storage:postgres:provider-backup-policy-smoke`.
- Added `src/tests/postgres-provider-backup-policy-contract.test.mjs`.
- Updated compose defaults, Docker image env, storage readiness, connector proof payload, build guard, compose/storage contracts, and deployment tests.

Safety decision:
- The checked-in policy is an example contract only.
- The example policy can validate the shape but cannot mark hosted-provider readiness, even when `BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY=1`.
- Hosted readiness requires a non-example policy file supplied through `BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE`.
- The policy file must reference a provider secret or env reference, not contain a raw database URL.

Verification commands:
- `node --check scripts/postgres-provider-backup-policy-smoke.mjs`
- `node --check scripts/storage-contract.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/concierge/storageReadiness.mjs`
- `node --check src/server/server.mjs`
- `node --check src/server/build-check.mjs`
- `node --test src/tests/postgres-provider-backup-policy-contract.test.mjs src/tests/deployment-storage.test.mjs src/tests/deployment-compose.test.mjs`
- `npm run storage:postgres:provider-backup-policy-smoke`
- `npm run build`
- `node --test src/tests/final-system-verification-report.test.mjs`
- `npm run test:docker:contract`
- `npm run storage:contract`
- `npm run test:db:postgres`
- `npm run test:db:safety`
- `npm run test:local`

Verification result:
- Focused syntax checks passed.
- Focused contract tests passed with 8/8 tests.
- `npm run storage:postgres:provider-backup-policy-smoke` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 17/17 tests.
- `npm run storage:contract` passed and reported `providerBackupPolicyCommand`.
- `npm run test:db:postgres` passed with 11/11 tests.
- `npm run test:db:safety` passed with 15/15 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- The smoke reported:
  - `status=provider_policy_contract_valid_not_hosted`;
  - `hostedProviderReady=false`;
  - no validation failures;
  - `rawDatabaseUrlWritten=false`;
  - `rawSecretFilePathWritten=false`;
  - `destructiveProductionRestore=false`;
  - `externalActions=false`;
  - `phiSeeded=false`.
- API proof at `/api/proof/runs/postgres-provider-backup-policy` reported:
  - `postgres_provider_backup_policy=provider_policy_contract_available`;
  - `database_provider_backup_policy=0 / 100`;
  - `configure_hosted_provider_policy`.
- In-app browser verification passed at `http://127.0.0.1:4199/?phase=postgres-provider-backup-policy` with required provider-policy proof strings present in the dashboard DOM and 0 console errors.
- Screenshot and proof artifacts:
  - `artifacts/phase14-postgres-provider-backup-policy-dashboard-proof.png`;
  - `artifacts/phase14-postgres-provider-backup-policy-proof.json`;
  - `artifacts/postgres-provider-backup-policy-smoke.json`.

Known risks or gaps:
- A real hosted provider has not been selected in this repo.
- Provider-native backup/PITR has not been configured.
- A private provider policy file and deployment secret manager must be supplied outside Git before this score can pass.

## Phase 15 Hosted Browser Sandbox Provider Update

Status: Implemented and contract-smoked. Hosted browser provider configuration remains intentionally not claimed.

Slice name:
- Hosted remote browser sandbox provider contract and fail-closed readiness gate.

Code changes:
- Added `project/deployment/browser-sandbox-provider.example.json`.
- Added `scripts/browser-sandbox-provider-contract.mjs`.
- Added package script `sandbox:browser:provider-contract`.
- Added `src/tests/browser-sandbox-provider-contract.test.mjs`.
- Updated compose defaults, FastAPI image env, FastAPI browser provider selection, FastAPI proof, Node dashboard proof, build guard, compose contract, and deployment tests.

Safety decision:
- Local CDP remains the default browser sandbox provider.
- `hosted_remote` is accepted by the public API schema but returns a setup-required error until a real non-example provider config and readiness gate are present.
- The example config validates the provider contract but cannot mark hosted readiness.
- Agent credential entry, external write actions, frame recording, and raw OCR persistence remain disabled in the provider contract.

Verification commands:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/server/server.mjs`
- `node --check src/server/build-check.mjs`
- `python3 -m py_compile project/api/browser_sandbox.py project/api/main.py project/api/models.py`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_fails_closed_until_configured`
- `npm run sandbox:browser:provider-contract`
- `npm run build`
- `node --test src/tests/final-system-verification-report.test.mjs`
- `npm run test:docker:contract`
- `python3 -m unittest project.tests.test_fastapi_facade`
- `npm run test:local`
- In-app browser proof at `http://127.0.0.1:4200/?phase=hosted-browser-sandbox-provider`
- Headless Chrome DevTools screenshot capture after clicking `Load Connector Proof`

Verification result:
- Focused syntax checks passed.
- Focused browser-sandbox/compose contract tests passed with 3/3 tests.
- Focused FastAPI fail-closed hosted provider test passed.
- `npm run sandbox:browser:provider-contract` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 19/19 tests.
- FastAPI facade regression passed with 35 tests, including 2 expected skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- The smoke reported:
  - `status=hosted_browser_sandbox_contract_valid_not_configured`;
  - `hostedProviderReady=false`;
  - no validation failures;
  - `rawEndpointUrlWritten=false`;
  - `rawSecretFilePathWritten=false`;
  - `rawOcrTextReturned=false`;
  - `frameRecordingEnabled=false`;
  - `externalActions=false`;
  - `phiSeeded=false`;
  - `agentCredentialEntryAllowed=false`.
- API proof at `/api/proof/runs/hosted-browser-sandbox-provider` reported:
  - `hosted_browser_sandbox_provider=hosted_browser_sandbox_contract_valid_not_configured`;
  - `hosted_remote_browser_sandbox=0 / 100`;
  - `remote_browser_controls=90 / 90`.
- In-app browser verification passed with required hosted-browser-sandbox proof strings present in the dashboard DOM and 0 console errors.
- Screenshot and proof artifacts:
  - `artifacts/phase15-hosted-browser-sandbox-provider-dashboard-proof.png`;
  - `artifacts/phase15-hosted-browser-sandbox-provider-proof.json`;
  - `artifacts/browser-sandbox-provider-contract-smoke.json`.

Known risks or gaps:
- A hosted browser sandbox provider has not been selected in this repo.
- No hosted WebRTC/SSE provider credentials are configured.
- Real hosted provider proof still needs create-session, stream-frame, screenshot/OCR, takeover, human input, offsite fail-closed, and teardown tests.

## Phase 16 Hosted Browser Sandbox Adapter Harness Update

Status: Implemented, regression-tested, and visually proved.

Slice name:
- Hosted remote browser sandbox adapter lifecycle harness.

Code changes:
- Added `project/deployment/browser-sandbox-provider.contract-harness.json`.
- Added `scripts/browser-sandbox-adapter-harness.mjs`.
- Added package script `sandbox:browser:adapter-harness`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with explicit adapter modes and harness readiness.
- Extended FastAPI hosted provider behavior with contract-harness create-session, stream, takeover, input, and end responses.
- Exposed `hosted_browser_sandbox_adapter_harness` in FastAPI proof and the Node dashboard proof.

Safety decision:
- The harness is not a real hosted provider and never sets `hostedProviderReady=true`.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real hosted provider config uses `adapter.mode=hosted_provider`.
- Harness stream events return no raw frame, no raw OCR text, no credentials, and no external/write actions.
- Human input relay returns only sanitized metadata, never the raw input value.

Focused verification commands:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-adapter-harness.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/server/server.mjs`
- `node --check src/server/build-check.mjs`
- `python3 -m py_compile project/api/browser_sandbox.py project/api/main.py project/api/models.py`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_fails_closed_until_configured project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_adapter_harness_lifecycle_is_safe_and_sanitized`
- `npm run sandbox:browser:provider-contract`
- `npm run sandbox:browser:adapter-harness`
- `npm run build`
- `node --test src/tests/final-system-verification-report.test.mjs`
- `npm run test:docker:contract`
- `python3 -m unittest project.tests.test_fastapi_facade`
- `npm run test:local`
- Browser proof at `http://127.0.0.1:4201/?phase=hosted-browser-sandbox-adapter-harness`
- Headless Chrome DevTools screenshot capture after clicking `Load Connector Proof`

Focused verification result:
- Focused syntax checks passed.
- Focused browser-sandbox/compose contract tests passed with 4/4 tests.
- Focused FastAPI hosted-provider fail-closed and hosted harness lifecycle tests passed.
- Provider contract smoke passed with `hostedProviderReady=false`.
- Adapter harness smoke passed with `status=hosted_browser_sandbox_adapter_harness_ready`, `adapterHarnessReady=true`, `hostedProviderReady=false`, no raw endpoint URL, no raw secret path, no raw OCR text, no frame recording, no external actions, no PHI seed, and no agent credential entry.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 20/20 tests.
- FastAPI facade regression passed with 36 tests, including 2 expected skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- API proof at `/api/proof/runs/hosted-browser-sandbox-adapter-harness` reported:
  - `hosted_browser_sandbox_adapter_harness=75 / 75`;
  - `hosted_remote_browser_sandbox=0 / 100`;
  - `hosted_browser_sandbox_provider=hosted_browser_sandbox_adapter_harness_ready`;
  - `remote_browser_controls=90 / 90`.
- Browser verification passed with required adapter-harness proof strings present in the dashboard and 0 console errors in the proof artifact.
- Screenshot and proof artifacts:
  - `artifacts/phase16-hosted-browser-sandbox-adapter-harness-dashboard-proof.png`;
  - `artifacts/phase16-hosted-browser-sandbox-adapter-harness-proof.json`;
  - `artifacts/browser-sandbox-adapter-harness-smoke.json`.

Known risks or gaps:
- The harness is a deterministic contract path only.
- No hosted WebRTC/SSE provider credentials are configured.
- Real hosted provider proof still needs provider-backed create-session, stream-frame/WebRTC, screenshot/OCR, takeover, human input, offsite fail-closed, and teardown tests.

## Phase 17 Hosted Browser Sandbox Provider Resolver Update

Status: Implemented, regression-tested, and visually proved.

Slice name:
- Hosted browser sandbox provider endpoint/auth resolver gate.

Code changes:
- Added `project/deployment/browser-sandbox-provider.hosted-provider.example.json`.
- Added `scripts/browser-sandbox-provider-resolver.mjs` and package script `sandbox:browser:provider-resolver`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with hosted-provider env-ref validation and sanitized resolver output.
- Extended FastAPI hosted provider behavior with distinct missing-endpoint/secret and configured-unverified states.
- Exposed `hosted_browser_sandbox_provider_resolver` in FastAPI proof and Node dashboard proof.
- Updated deployment/build contracts and focused tests.

Safety decision:
- Endpoint and token values are resolved only to booleans/statuses and are never returned in proof payloads.
- A configured endpoint/token pair is not enough to create a hosted session.
- `hosted_remote_browser_sandbox` stays `0 / 100` until live provider proof passes, `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1` is set, and a private config marks the provider live-connected.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-resolver.mjs`
- `node --check src/server/server.mjs`
- `python3 -m py_compile project/api/browser_sandbox.py project/api/main.py project/tests/test_fastapi_facade.py`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_resolver_requires_endpoint_and_secret project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_resolver_never_overclaims_live_provider project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_adapter_harness_lifecycle_is_safe_and_sanitized`
- `npm run sandbox:browser:provider-resolver`
- `WEFELLA_BROWSER_SANDBOX_PROVIDER=hosted_remote WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL=https://sandbox-provider.invalid/api WEFELLA_BROWSER_SANDBOX_API_TOKEN=test-token-that-must-not-leak npm run sandbox:browser:provider-resolver`

Focused verification result:
- JS and Python syntax/compile checks passed.
- Focused browser-sandbox/compose contract tests passed with 5/5 tests.
- Focused FastAPI resolver and harness tests passed with 3/3 tests.
- Resolver smoke without envs reported `hosted_browser_sandbox_provider_missing_endpoint_or_secret`.
- Resolver smoke with fake endpoint/token reported `hosted_browser_sandbox_provider_configured_unverified`, `hostedProviderResolverReady=true`, `hostedProviderReady=false`, and did not emit the fake endpoint or token.

Full verification result:
- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run sandbox:browser:provider-resolver` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 21/21 tests.
- FastAPI facade regression passed with 38 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Headless Chrome dashboard proof passed at `http://127.0.0.1:4202/?phase=hosted-browser-sandbox-provider-resolver`:
  - resolver row visible;
  - `hosted_browser_sandbox_provider_configured_unverified` visible;
  - `hosted_remote_browser_sandbox` visible;
  - fake provider endpoint and token absent from the page;
  - screenshot captured.
- Screenshot and proof artifacts:
  - `artifacts/phase17-hosted-browser-sandbox-provider-resolver-dashboard-proof.png`;
  - `artifacts/phase17-hosted-browser-sandbox-provider-resolver-proof.json`;
  - `artifacts/browser-sandbox-provider-resolver-smoke.json`.

Known risks or gaps:
- The real hosted provider adapter is not implemented yet.
- No hosted provider endpoint/token is configured for production.
- Live provider proof still needs provider-backed create-session, stream-frame/WebRTC, screenshot/OCR, takeover, human input, offsite fail-closed, and teardown tests.

## Phase 18 Hosted Browser Sandbox Provider Adapter Contract Update

Status: Implemented, regression-tested, visually proved, and UI-race hardened.

Slice name:
- Hosted browser sandbox provider adapter request/response contract.

Code changes:
- Added `scripts/browser-sandbox-provider-adapter-smoke.mjs` and package script `sandbox:browser:provider-adapter`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with:
  - redacted hosted-provider create-session request builder;
  - hosted-provider response validator;
  - deterministic adapter smoke.
- Exposed `hosted_browser_sandbox_provider_adapter` in FastAPI proof and Node dashboard proof.
- Kept FastAPI `/api/v1/browser/sessions` fail-closed when only the adapter contract is ready.
- Hardened the connector proof panel so auto-load and manual `Load Connector Proof` clicks share one in-flight request and recover visibly on errors.
- Updated deployment/build contracts and focused tests.

Safety decision:
- The adapter smoke does not call the provider network.
- The adapter request and response use opaque refs and redacted authorization only.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real provider passes live stream, screenshot/OCR, takeover, input, teardown, and offsite-fail-closed proof.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-adapter-smoke.mjs`
- `node --check src/server/server.mjs`
- `node --check src/server/build-check.mjs`
- `python3 -m py_compile project/api/browser_sandbox.py project/api/main.py project/tests/test_fastapi_facade.py`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_adapter_contract_never_overclaims_live_provider project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_resolver_never_overclaims_live_provider`
- `WEFELLA_BROWSER_SANDBOX_PROVIDER=hosted_remote WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL=https://sandbox-provider.invalid/api WEFELLA_BROWSER_SANDBOX_API_TOKEN=test-token-that-must-not-leak WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY=1 npm run sandbox:browser:provider-adapter`

Focused verification result:
- JS and Python syntax/compile checks passed.
- Focused browser-sandbox/compose contract tests passed with 6/6 tests.
- Focused FastAPI adapter/resolver tests passed with 2/2 tests.
- Adapter smoke reported `hosted_browser_sandbox_provider_adapter_contract_ready`, `hostedProviderAdapterReady=true`, `hostedProviderReady=false`, `providerNetworkCalled=false`, `providerLiveConnected=false`, redacted authorization, opaque provider refs, no raw frame, no raw OCR text, no external actions, and no fake endpoint/token leak.

Full verification result:
- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run sandbox:browser:provider-resolver` passed.
- `npm run sandbox:browser:provider-adapter` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 22/22 tests.
- FastAPI facade regression passed with 39 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Headless Chrome dashboard proof passed at `http://127.0.0.1:4203/?phase=hosted-browser-sandbox-provider-adapter`:
  - adapter score row visible;
  - `hosted_browser_sandbox_provider_adapter_contract_ready` visible;
  - `hosted_remote_browser_sandbox` visible;
  - fake provider endpoint and token absent from the page;
  - duplicate-click proof loading race fixed and re-tested;
  - screenshot captured.
- Screenshot and proof artifacts:
  - `artifacts/phase18-hosted-browser-sandbox-provider-adapter-dashboard-proof.png`;
  - `artifacts/phase18-hosted-browser-sandbox-provider-adapter-proof.json`;
  - `artifacts/browser-sandbox-provider-adapter-smoke.json`.

Known risks or gaps:
- This is an adapter-envelope proof, not a live provider implementation.
- No hosted provider endpoint/token is configured for production.
- Live provider proof still needs provider-backed create-session, stream-frame/WebRTC, screenshot/OCR, takeover, human input, offsite fail-closed, and teardown tests.

## Phase 19 Hosted Browser Sandbox Provider HTTP Adapter Harness Update

Status: Implemented, regression-tested, and visually proved.

Slice name:
- Hosted browser sandbox provider HTTP adapter harness.

Code changes:
- Added `scripts/browser-sandbox-provider-http-adapter-harness-smoke.mjs` and package script `sandbox:browser:provider-http-adapter`.
- Added `callHostedProviderCreateSession` to exercise a provider-style HTTP create-session request.
- Extended the hosted provider contract smoke with an in-process provider-compatible HTTP harness.
- Exposed `hosted_browser_sandbox_provider_http_adapter` in FastAPI proof and Node dashboard proof.
- Kept FastAPI `/api/v1/browser/sessions` fail-closed when only the HTTP adapter harness is ready.
- Updated deployment/build contracts and focused tests.

Safety decision:
- The HTTP adapter harness makes a real local HTTP call, but only to an in-process harness.
- The proof writes no local harness endpoint, fake provider endpoint, local harness token, or fake provider token.
- The provider response still uses opaque refs only and never returns raw frames, raw OCR text, external actions, credential entry, or provider live-connected status.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real provider passes live stream, screenshot/OCR, takeover, input, teardown, and offsite-fail-closed proof.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-http-adapter-harness-smoke.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/server/server.mjs`
- `python3 -m py_compile project/api/browser_sandbox.py project/api/main.py project/tests/test_fastapi_facade.py`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_http_adapter_harness_never_overclaims_live_provider project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_adapter_contract_never_overclaims_live_provider`
- `node scripts/browser-sandbox-provider-http-adapter-harness-smoke.mjs`

Focused verification result:
- JS and Python syntax/compile checks passed.
- Focused browser-sandbox/compose contract tests passed with 7/7 tests.
- Focused FastAPI HTTP adapter harness and adapter-contract tests passed with 2/2 tests.
- HTTP adapter harness reported `hosted_browser_sandbox_provider_http_adapter_harness_ready`, `hostedProviderHttpAdapterReady=true`, `hostedProviderReady=false`, `providerNetworkCalled=true`, `localHarnessOnly=true`, and no local/fake endpoint or token leak.

Full verification result:
- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run sandbox:browser:provider-resolver` passed.
- `npm run sandbox:browser:provider-adapter` passed.
- `npm run sandbox:browser:provider-http-adapter` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 23/23 tests.
- FastAPI facade regression passed with 40 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- In-app browser DOM proof passed at `http://127.0.0.1:4204/?phase=hosted-browser-sandbox-provider-http-adapter`:
  - HTTP adapter score row visible;
  - `hosted_browser_sandbox_provider_http_adapter_harness_ready` visible;
  - `hosted_remote_browser_sandbox` visible;
  - fake provider endpoint and token absent from the page;
  - console errors/warnings absent.
- Fresh headless Chrome visual proof passed and captured the screenshot artifact after the connector proof loaded.
- Screenshot and proof artifacts:
  - `artifacts/phase19-hosted-browser-sandbox-provider-http-adapter-harness-dashboard-proof.png`;
  - `artifacts/phase19-hosted-browser-sandbox-provider-http-adapter-harness-proof.json`;
  - `artifacts/browser-sandbox-provider-http-adapter-harness-smoke.json`.

Known risks or gaps:
- This is a local provider-compatible HTTP harness, not a selected production hosted browser provider.
- No hosted provider endpoint/token is configured for production.
- Live provider proof still needs real provider create-session, stream-frame/WebRTC, screenshot/OCR, takeover, human input, offsite fail-closed, and teardown tests.

## Phase 20 Hosted Browser Sandbox Provider Live Lifecycle Harness Update

Status: Implemented, regression-tested, and visually proved.

Slice name:
- Hosted browser sandbox provider live lifecycle harness.

Code changes:
- Added `scripts/browser-sandbox-provider-live-lifecycle-harness-smoke.mjs` and package script `sandbox:browser:provider-live-lifecycle`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with provider-style lifecycle operation callers and an in-process provider-compatible lifecycle harness.
- The harness now proves create session, SSE-style frame event, screenshot ref, OCR/caption ref, approval-gated takeover, redacted approved input relay, offsite fail-closed behavior, and teardown.
- Exposed `hosted_browser_sandbox_provider_live_lifecycle` in FastAPI proof and Node dashboard proof.
- Kept FastAPI `/api/v1/browser/sessions` fail-closed when only the lifecycle harness is ready.
- Updated deployment/build contracts and focused tests.

Safety decision:
- The lifecycle harness makes local provider-style HTTP calls only to an in-process harness.
- The proof writes no local harness endpoint, fake provider endpoint, local harness token, fake provider token, raw frame data, raw OCR text, raw input values, or raw private portal data.
- `hosted_remote_browser_sandbox` remains `0 / 100` until a real provider passes live stream, screenshot/OCR, takeover, input, teardown, offsite-fail-closed, and GUI/OCR visual proof.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-live-lifecycle-harness-smoke.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/server/server.mjs`
- `python3 -m py_compile project/api/browser_sandbox.py project/api/main.py project/tests/test_fastapi_facade.py`
- `npm run sandbox:browser:provider-live-lifecycle`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_live_lifecycle_harness_never_overclaims_live_provider project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_http_adapter_harness_never_overclaims_live_provider`

Focused verification result:
- JS and Python syntax/compile checks passed.
- Focused browser-sandbox/compose contract tests passed with 8/8 tests.
- Focused FastAPI lifecycle-harness and HTTP-adapter-harness tests passed with 2/2 tests.
- Lifecycle harness reported `hosted_browser_sandbox_provider_live_lifecycle_harness_ready`, `hostedProviderLiveLifecycleHarnessReady=true`, `hostedProviderHttpAdapterReady=true`, `hostedProviderReady=false`, `providerNetworkCalled=true`, `localHarnessOnly=true`, and no local/fake endpoint, token, raw frame, raw OCR text, or raw input leak.

Full verification result:
- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run sandbox:browser:provider-resolver` passed.
- `npm run sandbox:browser:provider-adapter` passed.
- `npm run sandbox:browser:provider-http-adapter` passed.
- `npm run sandbox:browser:provider-live-lifecycle` passed.
- `npm run build` passed.
- Final-system verification report coverage passed with 2/2 tests.
- `npm run test:docker:contract` passed with 24/24 tests.
- FastAPI facade regression passed with 41 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- In-app browser dashboard proof passed at `http://127.0.0.1:4205/?phase=hosted-browser-sandbox-provider-live-lifecycle`:
  - lifecycle score row visible;
  - `hosted_browser_sandbox_provider_live_lifecycle_harness_ready` visible;
  - HTTP adapter score/status visible;
  - `hosted_remote_browser_sandbox` visible;
  - fake provider endpoint and token absent from the page;
  - console errors/warnings absent.
- Screenshot and proof artifacts:
  - `artifacts/phase20-hosted-browser-sandbox-provider-live-lifecycle-harness-dashboard-proof.png`;
  - `artifacts/phase20-hosted-browser-sandbox-provider-live-lifecycle-harness-proof.json`;
  - `artifacts/browser-sandbox-provider-live-lifecycle-harness-smoke.json`.

Known risks or gaps:
- This is a local provider-compatible lifecycle harness, not a selected production hosted browser provider.
- No hosted provider endpoint/token is configured for production.
- Live provider proof still needs real provider WebRTC/SSE stream, screenshot/OCR, takeover, human input, offsite fail-closed, teardown, and GUI/OCR testing.

## Phase 21 Hosted Browser Sandbox Provider Selection And Preflight Update

Status: Implemented, regression-tested, and visually proved.

Slice name:
- Hosted browser sandbox provider selection and preflight.

Code changes:
- Added `project/deployment/browser-sandbox-provider.selection.example.json` with non-secret hosted provider candidates and required capabilities.
- Added `scripts/browser-sandbox-provider-selection-smoke.mjs` and package script `sandbox:browser:provider-selection`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with provider-selection validation, preflight scoring, and safe artifact output.
- Extended compose/build/deployment contracts with selection-file and selected-provider env gates.
- Exposed `hosted_browser_sandbox_provider_selection` in FastAPI proof and Node dashboard proof.
- Added JS and FastAPI tests proving selection preflight does not overclaim live provider readiness.

Safety decision:
- The selection contract is not a provider config and contains no provider endpoint, token, raw frame, raw OCR text, or raw input value.
- Selection preflight can only mean "a candidate has been explicitly selected for live integration"; it does not create a browser session and does not set `hosted_remote_browser_sandbox` ready.
- `hosted_remote_browser_sandbox` remains `0 / 100` until selected-provider live stream, screenshot/OCR, takeover, input, teardown, offsite-fail-closed, and GUI/OCR proof passes.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-selection-smoke.mjs`
- `node --check src/server/server.mjs`
- `python3 -m compileall -q project`
- `npm run sandbox:browser:provider-selection`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_selection_preflight_never_overclaims_live_provider`

Focused verification result:
- Syntax/compile checks passed.
- Selection smoke reported `hosted_browser_sandbox_provider_selection_contract_ready`, `providerSelectionContractReady=true`, `providerSelectionPreflightReady=false`, and `hostedProviderReady=false`.
- Focused browser-sandbox/compose contract tests passed with 10/10 tests.
- Focused FastAPI selection-preflight regression passed.

Full verification result:
- `npm run sandbox:browser:provider-contract` passed.
- `npm run sandbox:browser:adapter-harness` passed.
- `npm run sandbox:browser:provider-resolver` passed.
- `npm run sandbox:browser:provider-adapter` passed.
- `npm run sandbox:browser:provider-http-adapter` passed.
- `npm run sandbox:browser:provider-live-lifecycle` passed.
- `npm run sandbox:browser:provider-selection` passed.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 26/26 tests.
- `npm run test:facade` passed with 42 tests, including 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- In-app browser dashboard proof passed at `http://127.0.0.1:4206/?phase=hosted-browser-sandbox-provider-selection`:
  - `hosted_browser_sandbox_provider_selection` visible;
  - `hosted_browser_sandbox_provider_selection_preflight_ready` visible;
  - `hosted_remote_browser_sandbox` visible;
  - `hosted_remote_browser_sandbox` remained `0 / 100`;
  - fake provider endpoint and token absent from the page;
  - console errors/warnings absent.
- Proof API artifact confirmed `hosted_browser_sandbox_provider_selection=90 / 90` and `hosted_remote_browser_sandbox=0 / 100`.
- Screenshot and proof artifacts:
  - `artifacts/phase21-hosted-browser-sandbox-provider-selection-dashboard-viewport-proof.png`;
  - `artifacts/phase21-hosted-browser-sandbox-provider-selection-proof.json`;
  - `artifacts/browser-sandbox-provider-selection-smoke.json`.

Known risks or gaps:
- This phase chooses and verifies the provider-selection/preflight gate, not a production hosted browser provider.
- The real provider endpoint/token still must live outside Git.
- Live provider proof still needs selected-provider HTTPS/WebRTC stream, screenshot/OCR, takeover, approved input, offsite fail-closed, teardown, and GUI/OCR testing.

## Phase 22 Hosted Browser Sandbox Provider Live Preflight Update

Status: Implemented, full regression-tested, and visually proved.

Slice name:
- Hosted browser sandbox provider live preflight.

Code changes:
- Added `scripts/browser-sandbox-provider-live-preflight-smoke.mjs` and package script `sandbox:browser:provider-live-preflight`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with selected-provider live preflight and optional provider health probing.
- Added `project/deployment/browser-sandbox-provider.live-preflight.example.env`.
- Added `.gitignore` and `.dockerignore` patterns for private provider runtime JSON files.
- Extended compose/build/deployment contracts with live-preflight env gates.
- Exposed `hosted_browser_sandbox_provider_live_preflight` in FastAPI proof and Node dashboard proof.
- Added JS and FastAPI tests proving live preflight does not overclaim hosted remote browser readiness.

Safety decision:
- Default live preflight is blocked but safe.
- Live preflight readiness does not create a browser session and does not set `hosted_remote_browser_sandbox` ready.
- Optional live provider health probing is explicitly env-gated.
- Provider endpoints, bearer tokens, raw frames, OCR text, and input values must never appear in proof artifacts or dashboard text.
- `hosted_remote_browser_sandbox` remains `0 / 100` until selected-provider create-session, stream, screenshot/OCR, takeover, input, teardown, offsite-fail-closed, and GUI/OCR proof passes.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-live-preflight-smoke.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/server/server.mjs`
- `python3 -m compileall -q project`
- `npm run sandbox:browser:provider-live-preflight`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_live_preflight_never_overclaims_live_provider`

Focused verification result:
- Syntax/compile checks passed.
- Live preflight smoke reported `hosted_browser_sandbox_provider_live_preflight_blocked`, `hostedProviderLivePreflightReady=false`, and `hostedProviderReady=false`.
- Focused browser-sandbox/compose contract tests passed with 12/12 tests.
- Focused FastAPI live-preflight regression passed.

Full verification result:
- Full sandbox smoke chain passed:
  - `npm run sandbox:browser:provider-contract`
  - `npm run sandbox:browser:provider-selection`
  - `npm run sandbox:browser:provider-live-preflight`
  - `npm run sandbox:browser:adapter-harness`
  - `npm run sandbox:browser:provider-resolver`
  - `npm run sandbox:browser:provider-adapter`
  - `npm run sandbox:browser:provider-http-adapter`
  - `npm run sandbox:browser:provider-live-lifecycle`
- `npm run build` passed.
- `npm run test:docker:contract` passed with 28/28 tests.
- `npm run test:facade` passed with 43 tests and 2 expected skips.
- `npm run test:local` passed with 208 passing tests and 2 expected skips.
- Dashboard visual proof passed on `http://127.0.0.1:4207/?phase=hosted-browser-sandbox-provider-live-preflight`.
- Browser DOM/visual assertion proved `hosted_browser_sandbox_provider_selection` at `90 / 90`, `hosted_browser_sandbox_provider_live_preflight` at `80 / 80`, `hosted_remote_browser_sandbox` still at `0 / 100`, and no fake endpoint/token leakage.
- API proof artifact: `artifacts/phase22-hosted-browser-sandbox-provider-live-preflight-proof.json`.
- Visual proof artifact: `artifacts/phase22-hosted-browser-sandbox-provider-live-preflight-dashboard-proof.png`.
- Visual assertion artifact: `artifacts/phase22-hosted-browser-sandbox-provider-live-preflight-visual-proof.json`.
- Smoke artifact: `artifacts/browser-sandbox-provider-live-preflight-smoke.json`.

Known risks or gaps:
- This phase validates the live-preflight gate, not a production hosted browser provider.
- Real provider endpoint/token still must live outside Git.
- Live provider proof still needs selected-provider HTTPS/WebRTC lifecycle implementation and GUI/OCR testing.

## Phase 23 Hosted Browser Sandbox Provider Live Verification Update

Status: Implemented, full regression-tested, and visually/API proved with the hosted remote score still honestly blocked.

Slice name:
- Hosted browser sandbox provider live verification.

Code changes:
- Added `scripts/browser-sandbox-provider-live-verification-smoke.mjs` and package script `sandbox:browser:provider-live-verification`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with selected-provider live verification for create session, stream, screenshot, OCR/caption, takeover, approved input, offsite fail-closed navigation, and teardown.
- Added `project/deployment/browser-sandbox-provider.live-verification.example.env` as a non-secret operator template for private provider verification.
- Extended compose, build, and deployment contract checks with the live-verification env gate and command.
- Added FastAPI hosted-provider runtime support for provider HTTPS create-session, provider-backed takeover/input, and sanitized SSE stream proxying.
- Exposed `hosted_browser_sandbox_provider_live_verification` in FastAPI proof and Node dashboard proof.
- Kept `hosted_remote_browser_sandbox` blocked unless live verification is ready, `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1` is set, and the private provider config reports `adapter.providerLiveConnected=true`.

Safety decision:
- Private endpoint, token, and provider runtime JSON remain outside Git.
- The default verification command is blocked and safe when live provider config is absent.
- The live-verification score can prove the lifecycle contract, but it does not by itself enable the hosted remote browser score.
- Provider-backed input remains gated by human-only `interactive_takeover`; raw input values are redacted before provider relay.
- Provider endpoint, token, raw frame payload, raw OCR text, raw input values, and credential material must not appear in dashboard text or proof artifacts.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-live-verification-smoke.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/server/server.mjs`
- `python3 -m compileall -q project`
- `npm run sandbox:browser:provider-live-verification`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_live_preflight_never_overclaims_live_provider project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_live_verification_is_separate_from_hosted_ready`

Focused verification result:
- Syntax/compile checks passed.
- Live verification smoke reported `hosted_browser_sandbox_provider_live_verification_blocked`, `hostedProviderLiveVerificationReady=false`, and `hostedProviderReady=false` in default safe mode.
- Focused browser-sandbox/compose contract tests passed with 14/14 tests.
- Focused FastAPI live-verification regressions passed with 2/2 tests.

Full verification result:
- Full sandbox smoke chain passed:
  - `npm run sandbox:browser:provider-contract`
  - `npm run sandbox:browser:provider-selection`
  - `npm run sandbox:browser:provider-live-preflight`
  - `npm run sandbox:browser:provider-live-verification`
  - `npm run sandbox:browser:adapter-harness`
  - `npm run sandbox:browser:provider-resolver`
  - `npm run sandbox:browser:provider-adapter`
  - `npm run sandbox:browser:provider-http-adapter`
  - `npm run sandbox:browser:provider-live-lifecycle`
- `npm run build` passed.
- `npm run test:docker:contract` passed with 30/30 tests.
- `npm run test:facade` passed with 44 tests and 2 expected skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Dashboard visual/API proof passed on `http://127.0.0.1:4208/?phase=hosted-browser-sandbox-provider-live-verification`.
- Browser/API assertion proved `hosted_browser_sandbox_provider_live_verification` at `100 / 100`, `hosted_browser_sandbox_provider_live_preflight` at `80 / 80`, `hosted_remote_browser_sandbox` still at `0 / 100`, and no fake endpoint/token leakage.
- Proof artifacts:
  - `artifacts/phase23-hosted-browser-sandbox-provider-live-verification-dashboard-proof.png`
  - `artifacts/phase23-hosted-browser-sandbox-provider-live-verification-visual-proof.json`
  - `artifacts/phase23-hosted-browser-sandbox-provider-live-verification-proof.json`
  - `artifacts/browser-sandbox-provider-live-verification-smoke.json`

Known risks or gaps:
- This phase adds the selected-provider integration path and proof gate, but the local environment still does not include real provider credentials.
- Real provider endpoint/token/config must stay outside Git and be supplied by the operator.
- `hosted_remote_browser_sandbox` must remain `0 / 100` until a real provider returns live connected proof plus GUI/OCR evidence.

## Phase 24 Hosted Browser Sandbox Provider WebRTC Signaling Update

Status: Implemented, regression-tested, and visually/API proved with the hosted remote score still honestly blocked.

Slice name:
- Hosted browser sandbox provider WebRTC signaling.

Code changes:
- Added `scripts/browser-sandbox-provider-webrtc-signaling-smoke.mjs` and package script `sandbox:browser:provider-webrtc-signaling`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with WebRTC signaling proof for opaque SDP offer refs, opaque answer refs, and opaque ICE candidate refs.
- Added `project/deployment/browser-sandbox-provider.webrtc-signaling.example.env` as a non-secret operator template for private provider signaling verification.
- Extended compose, build, and deployment contract checks with the WebRTC signaling env gate and command.
- Added FastAPI hosted-provider signaling support at `POST /api/v1/browser/sessions/{browser_session_id}/webrtc/offer`.
- Tightened WebRTC-capable hosted-provider readiness so `webrtc` and `webrtc_or_sse_frames` configs require `WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY=1`.
- Exposed `hosted_browser_sandbox_provider_webrtc_signaling` in FastAPI proof and Node dashboard proof.
- Kept `hosted_remote_browser_sandbox` blocked unless live verification is ready, `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1` is set, WebRTC signaling is ready when required, and the private provider config reports `adapter.providerLiveConnected=true`.

Safety decision:
- Private endpoint, token, and provider runtime JSON remain outside Git.
- The default verification command is blocked and safe when live provider config is absent.
- The WebRTC signaling score can prove opaque signaling readiness, but it does not by itself enable the hosted remote browser score.
- Public route payloads use opaque references and reject raw SDP-looking or raw ICE-looking payloads.
- Provider endpoint, token, raw SDP, raw ICE candidate, TURN/STUN credential material, raw frame payload, raw OCR text, raw input values, and credential material must not appear in dashboard text or proof artifacts.
- Provider-backed input remains gated by human-only `interactive_takeover`; Codex does not enter credentials.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-webrtc-signaling-smoke.mjs`
- `node --check scripts/compose-contract.mjs`
- `node --check src/server/server.mjs`
- `python3 -m compileall -q project`
- `npm run sandbox:browser:provider-webrtc-signaling`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `python3 -m unittest project.tests.test_fastapi_facade`

Focused verification result:
- Syntax/compile checks passed.
- WebRTC signaling smoke reported `hosted_browser_sandbox_provider_webrtc_signaling_blocked`, `hostedProviderWebrtcSignalingReady=false`, `hostedProviderReady=false`, no provider network call, and no raw SDP/ICE/endpoint/token leakage in default safe mode.
- Focused browser-sandbox/compose contract tests passed with 15/15 tests.
- FastAPI facade regression passed with 46 tests and 2 expected live-gated skips.

Full verification result:
- `npm run build` passed.
- `npm run test:docker:contract` passed with 31/31 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Dashboard visual/API proof passed on `http://127.0.0.1:4210/?phase=hosted-browser-sandbox-provider-webrtc-signaling`.
- Browser/API assertion proved `hosted_browser_sandbox_provider_webrtc_signaling` at `100 / 100`, `hosted_browser_sandbox_provider_live_verification` at `100 / 100`, `hosted_remote_browser_sandbox` still at `0 / 100`, and no endpoint/token/raw SDP/raw ICE leakage.
- Proof artifacts:
  - `artifacts/phase24-hosted-browser-sandbox-provider-webrtc-signaling-dashboard-proof.png`
  - `artifacts/phase24-hosted-browser-sandbox-provider-webrtc-signaling-visual-proof.json`
  - `artifacts/phase24-hosted-browser-sandbox-provider-webrtc-signaling-proof.json`
  - `artifacts/browser-sandbox-provider-webrtc-signaling-smoke.json`

Known risks or gaps:
- This phase adds the opaque signaling path and proof gate, but the local environment still does not include real provider credentials.
- Real provider endpoint/token/config must stay outside Git and be supplied by the operator.
- `hosted_remote_browser_sandbox` must remain `0 / 100` until a real provider returns live connected proof plus GUI/OCR evidence.

## Phase 25 Hosted Browser Sandbox Provider Visual/OCR Replay Update

Status: Implemented, regression-tested, and visually/API proved with the hosted remote score still honestly blocked.

Slice name:
- Hosted browser sandbox provider visual/OCR replay.

Code changes:
- Added `scripts/browser-sandbox-provider-visual-ocr-replay-smoke.mjs` and package script `sandbox:browser:provider-visual-ocr-replay`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with a private visual/OCR replay proof validator for operator-supplied dashboard screenshots, mobile live-block proof, screenshot refs, caption refs, human takeover proof, approved-input proof, and teardown proof.
- Added `project/deployment/browser-sandbox-provider.visual-ocr-replay.example.env` as a non-secret operator template; real proof manifests remain outside Git.
- Extended compose, build, Docker, and deployment contract checks with visual/OCR replay env gates and command wiring.
- Mirrored the replay gate in FastAPI proof via `hosted_browser_sandbox_provider_visual_ocr_replay`.
- Strengthened final hosted-provider readiness so `hosted_remote_browser_sandbox` cannot pass without live verification, WebRTC signaling when required, visual/OCR replay readiness, explicit `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1`, and private config `adapter.providerLiveConnected=true`.

Safety decision:
- Private screenshot/OCR proof manifests must live outside Git and may contain only opaque refs, booleans, and redacted status fields.
- Raw screenshots, `data:image` payloads, OCR text, portal/member text, endpoint URLs, bearer tokens, SDP, ICE candidates, local paths, credentials, and input values are rejected by the replay validator.
- The visual/OCR replay score can reach `100 / 100` for a valid private manifest, but it does not enable the final hosted remote browser score without real provider live verification.
- Human-only `interactive_takeover` remains the only approved input relay scope; Codex still must not enter credentials.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `python3 -m py_compile project/api/browser_sandbox.py project/api/main.py`
- `npm run sandbox:browser:provider-visual-ocr-replay`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs`
- `node --test src/tests/deployment-compose.test.mjs`
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade`

Focused verification result:
- Browser-sandbox provider contract tests passed with 17/17 tests, including blocked-default replay, valid private-manifest replay, and invalid raw OCR/raw frame rejection.
- Deployment compose contract test passed after initializing the temp worktree's Graphiti submodule dependency from the existing local checkout.
- FastAPI facade regression passed with 47 tests and 2 expected live-gated skips.
- Default visual/OCR replay smoke reported `hosted_browser_sandbox_provider_visual_ocr_replay_blocked`, `hostedProviderVisualOcrReplayReady=false`, `hostedProviderReady=false`, and no endpoint/token/raw OCR leakage.

Full verification result:
- `npm run build` passed.
- `npm run test:docker:contract` passed with 34/34 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Dashboard visual/API proof passed on `http://127.0.0.1:4211/?phase=hosted-browser-sandbox-provider-visual-ocr-replay`.
- Browser/API assertion proved `hosted_browser_sandbox_provider_visual_ocr_replay` at `100 / 100`, `hosted_browser_sandbox_provider_webrtc_signaling` at `100 / 100`, `hosted_browser_sandbox_provider_live_verification` at `100 / 100`, `hosted_remote_browser_sandbox` still at `0 / 100`, and no endpoint/token leakage.
- Proof artifacts:
  - `artifacts/phase25-hosted-provider-visual-ocr-replay-dashboard-proof.png`
  - `artifacts/phase25-hosted-provider-visual-ocr-replay-visual-proof.json`
  - `artifacts/phase25-hosted-provider-visual-ocr-replay-proof.json`
  - `artifacts/browser-sandbox-provider-visual-ocr-replay-smoke.json`

Known risks or gaps:
- This phase validates the visual/OCR replay artifact layer, but the local environment still does not include real provider credentials.
- A real selected provider must still be verified with private endpoint/token/config and real GUI/OCR evidence before `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1` can be set.
- `hosted_remote_browser_sandbox` must remain `0 / 100` until a real provider proves live connection from private config, WebRTC signaling when required, and GUI/OCR replay proof.

## Phase 26 Hosted Browser Sandbox Provider Launch Readiness Update

Status: Implemented, regression-tested, and dashboard/API visually proved with hosted remote still honestly blocked.

Slice name:
- Hosted browser sandbox provider launch readiness runbook.

Code changes:
- Added `npm run sandbox:browser:provider-launch-readiness` and `scripts/browser-sandbox-provider-launch-readiness-smoke.mjs`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with an aggregate launch-readiness evaluator over provider selection, live preflight, live verification, WebRTC signaling, visual/OCR replay, private config placement, and final enablement.
- Added `project/deployment/browser-sandbox-provider.launch-readiness.example.env` as a non-secret operator template.
- Added `docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md`.
- Exposed `hosted_browser_sandbox_provider_launch_readiness` in Node dashboard proof and FastAPI `/api/v1/proof`.
- Extended compose/deployment contract checks with the new launch-readiness env gate, script, env template, and runbook.

Safety decision:
- Launch readiness is separate from final hosted remote readiness.
- `hosted_browser_sandbox_provider_launch_readiness` can report runbook readiness or private proof-chain readiness, but `hosted_remote_browser_sandbox` remains `0 / 100` unless the existing final live provider conditions pass.
- Private provider config and visual/OCR proof manifests must stay outside Git.
- No raw endpoint URL, token, screenshot, OCR text, SDP, ICE candidate, local private path, credential, or input value should appear in proof output.
- Human-only `interactive_takeover` remains preserved; Codex must not enter credentials, solve 2FA/captcha, submit forms, contact payers, or perform external/write actions.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-launch-readiness-smoke.mjs`
- `node --check scripts/compose-contract.mjs`
- `python3 -m py_compile project/api/browser_sandbox.py project/api/main.py`
- `npm run sandbox:browser:provider-launch-readiness`
- `npm run sandbox:browser:provider-visual-ocr-replay`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs`
- `node --test src/tests/deployment-compose.test.mjs`
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_launch_readiness_is_visible_without_overclaiming project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_visual_ocr_replay_is_separate_from_hosted_ready`

Focused verification result:
- Launch-readiness smoke reported `hosted_browser_sandbox_provider_launch_runbook_ready`, `hostedProviderLaunchReadinessRunbookReady=true`, `hostedProviderPrivateProofChainReady=false`, `hostedProviderFinalEnablementAllowed=false`, and `hostedProviderReady=false`.
- Browser-sandbox provider contract tests passed with 19/19 tests.
- Deployment compose contract test passed after linking the temp worktree to the existing local Graphiti vendor checkout.
- Focused FastAPI facade tests passed with 2/2 tests.

Full verification result:
- `npm run build` passed.
- `npm run test:docker:contract` passed with 36/36 tests.
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade` passed with 48 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated official OpenClaw skips.
- Dashboard/API proof passed on `http://127.0.0.1:4212/?phase=hosted-browser-sandbox-provider-launch-readiness`.
- Browser DOM/API assertion proved `hosted_browser_sandbox_provider_launch_readiness` at `60 / 100`, `hosted_remote_browser_sandbox` still at `0 / 100`, runbook ready, private proof chain not ready, final enablement not allowed, and no fake endpoint/token leakage.
- In-app screenshot capture timed out, so the visual screenshot was captured through delayed headless Chrome after the auto-loaded proof panel populated the operator trace.
- Proof artifacts:
  - `artifacts/phase26-hosted-provider-launch-readiness-dashboard-proof.png`
  - `artifacts/phase26-hosted-provider-launch-readiness-visual-proof.json`
  - `artifacts/phase26-hosted-provider-launch-readiness-proof.json`
  - `artifacts/browser-sandbox-provider-launch-readiness-smoke.json`

Known risks or gaps:
- No real hosted-provider credentials were present in the local environment.
- The private proof-chain path is covered by a fake live-provider harness; production readiness still requires operator-supplied private config, live provider verification, WebRTC proof when required, and real visual/OCR replay.
- `hosted_remote_browser_sandbox` must remain `0 / 100` until a real provider proves live connection from private config and final human enablement is approved.

## Phase 27 Hosted Browser Sandbox Provider Private Launch Execution Update

Status: Implemented, regression-tested, and dashboard/API visually proved with hosted remote still honestly blocked.

Slice name:
- Hosted browser sandbox provider private launch execution.

Code changes:
- Added `npm run sandbox:browser:provider-private-launch-execution` and `scripts/browser-sandbox-provider-private-launch-execution-smoke.mjs`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with a private launch execution gate over launch readiness, private proof-chain readiness, final enablement allowance, explicit private execution, and final human review.
- Added `project/deployment/browser-sandbox-provider.private-launch-execution.example.env` as a non-secret operator template.
- Exposed `hosted_browser_sandbox_provider_private_launch_execution` in Node dashboard proof and FastAPI `/api/v1/proof`.
- Tightened final `hosted_remote_browser_sandbox` readiness so it cannot pass from launch readiness alone; private execution and final human review are now required.
- Redacted private provider config paths from FastAPI public proof output.

Safety decision:
- Launch readiness is still not production hosted remote readiness.
- `WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY=1` and `WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED=1` are required before final hosted readiness can pass.
- Private config paths, proof paths, provider endpoints, tokens, screenshots, OCR text, SDP, ICE candidates, credentials, and input values must not appear in public proof output.
- Human-only `interactive_takeover` remains preserved; Codex must not enter credentials, solve 2FA/captcha, submit forms, contact payers, or perform external/write actions.

Focused verification completed:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-private-launch-execution-smoke.mjs`
- `node --check src/server/server.mjs`
- `node --check scripts/compose-contract.mjs`
- `python3 -m py_compile project/api/browser_sandbox.py project/api/main.py`
- `npm run sandbox:browser:provider-private-launch-execution`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_private_launch_execution_requires_final_review project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_browser_sandbox_provider_launch_readiness_is_visible_without_overclaiming`

Focused verification result:
- Default private launch execution smoke reported `hosted_browser_sandbox_provider_private_launch_execution_not_enabled`, execution gate false, final human review false, and `hostedProviderReady=false`.
- Browser-sandbox provider and deployment compose contract tests passed with 22/22 tests.
- Focused FastAPI tests passed with 2/2 tests and verified private config/proof paths plus endpoint/token were not exposed.

Full verification result:
- `npm run build` passed.
- `npm run test:docker:contract` passed with 38/38 tests.
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade` passed with 49 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- Dashboard/API proof passed on `http://127.0.0.1:4213/?phase=hosted-browser-sandbox-provider-private-launch-execution`.
- Browser/API assertion proved `hosted_browser_sandbox_provider_private_launch_execution` at `0 / 100`, `hosted_browser_sandbox_provider_launch_readiness` at `60 / 100`, `hosted_remote_browser_sandbox` still at `0 / 100`, execution gate false, final human review false, and no fake endpoint/token/provider-config-path leakage.
- Proof artifacts:
  - `artifacts/phase27-hosted-provider-private-launch-execution-dashboard-proof.png`
  - `artifacts/phase27-hosted-provider-private-launch-execution-visual-proof.json`
  - `artifacts/browser-sandbox-provider-private-launch-execution-smoke.json`

Known risks or gaps:
- No real hosted-provider credentials were present in the local environment.
- The success path is covered by a fake live-provider harness in JS tests only; production readiness still requires operator-supplied private config, real provider verification, WebRTC proof when required, real visual/OCR replay, private launch execution, and final human review.
- `hosted_remote_browser_sandbox` must remain `0 / 100` until the private execution and final human review gates pass against real provider evidence.

## Phase 28A Self-Hosted Steel Browser Provider Update

Status: Implemented, Docker-backed live-verified locally, and dashboard/API proof surfaced separately from final hosted remote readiness.

Slice name:
- Self-hosted Steel Browser as `steel-self-host` BrowserSandboxProvider strategy.

Code changes:
- Added `infra/steel/compose.yaml` and `infra/steel/README.md` for local Steel API/UI with loopback-only API, CDP, and viewer ports.
- Added a `steel-self-host` live-verification strategy to `scripts/browser-sandbox-provider-contract.mjs`.
- Allowed HTTP endpoint resolution only for loopback `steel-self-host`; non-local hosted providers still require HTTPS.
- Mapped Steel `/v1` lifecycle into the existing provider envelope: create session, CDP connect, live viewer ref, screenshot ref, local caption ref, approval-gated takeover, synthetic approved input relay, offsite fail-closed, and teardown.
- Added a regression test with fake Steel API and fake CDP WebSocket.
- Exposed `hosted_browser_sandbox_provider_steel_self_host` in Node dashboard proof and FastAPI `/api/v1/proof` from the Phase 28 artifact.

Safety decision:
- The final `hosted_remote_browser_sandbox` score remains blocked until the explicit live-verified/runtime-flag/WebRTC/visual-replay/private-execution/final-review gates all pass.
- The Steel self-host proof is a separate local-provider proof and returns refs/booleans only.
- Human-only takeover remains preserved; Codex must not enter credentials, solve 2FA/captcha, submit forms, contact payers, or run against a real payer portal.

Focused verification completed:
- `docker compose -f infra/steel/compose.yaml up -d`
- `docker compose -f infra/steel/compose.yaml ps`
- `curl http://127.0.0.1:3000/v1/health` returned `{"status":"ok"}` after clearing a stale local Next.js listener on port 3000.
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs`
- `npm run sandbox:browser:provider-live-verification`

Focused verification result:
- Steel live lifecycle passed with `steel_self_host_live_lifecycle_verified`.
- Phase 28A artifact: `artifacts/phase28/steel-self-host-live-lifecycle-2026-06-18T02-15-54Z.json`.
- Dashboard/API proof now derives `10 / 10` checks and `100 / 100` for `hosted_browser_sandbox_provider_steel_self_host`.
- `hostedProviderReady=false` remains correct even after private runtime JSON was flipped to `adapter.providerLiveConnected=true`, because final live-verified, WebRTC/visual replay, private execution, and human-reviewed launch gates are not all enabled.

Known risks or gaps:
- Current Steel self-host deployment is single-machine/local and should be treated as a staging sandbox, not a scaled production browser cluster.
- The pinned Steel image required `SKIP_FINGERPRINT_INJECTION=true` on this Docker host to avoid an upstream fingerprint-generation launch failure.
- The Steel API/CDP/UI ports are local loopback only; remote/mobile access still needs the FastAPI connector and a deployment-safe tunnel or hosted infrastructure.

## Phase 29 Steel Self-Host Production Hardening Update

Status: Implemented, regression-tested, and visually proved on the operator dashboard.

Slice name:
- Steel self-host operations readiness gate.

Code changes:
- Added `project/deployment/browser-sandbox-provider.steel-operations.example.json` as the non-secret operations policy for self-hosted Steel.
- Added `npm run sandbox:browser:steel-operations` and `scripts/browser-sandbox-provider-steel-operations-smoke.mjs`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with a Steel operations validator covering concurrency, TTL/idle cleanup, retention, loopback networking, image pinning, monitoring, and approval boundaries.
- Changed `infra/steel/compose.yaml` to disable Steel browser log storage by default.
- Expanded `infra/steel/README.md` with the operations gate, stale-session cleanup, loopback-only, and FastAPI-connector remote boundary guidance.
- Exposed `hosted_browser_sandbox_provider_steel_operations` in the Node dashboard and FastAPI `/api/v1/proof` as a separate score from `hosted_browser_sandbox_provider_steel_self_host` and `hosted_remote_browser_sandbox`.

Safety decision:
- Static Steel operations hardening can score `85 / 100` without claiming production hosted remote readiness.
- `100 / 100` for `hosted_browser_sandbox_provider_steel_operations` requires `WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_READY=1`; if live probe mode is enabled, local Steel API/CDP/viewer config must also be present.
- The final `hosted_remote_browser_sandbox` score remains blocked until the separate private execution, final human review, live verification, visual/OCR replay, and provider-live-connected gates all pass.
- Human-only `interactive_takeover` remains preserved; Codex must not enter credentials, solve 2FA/captcha, submit forms, contact payers, or perform external/write actions.

Verification plan:
- `npm run sandbox:browser:steel-operations`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs`
- `node --test src/tests/deployment-compose.test.mjs`
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_steel_self_host_operations_visible_without_hosted_remote_overclaim project.tests.test_fastapi_facade.FastApiFacadeTest.test_steel_self_host_operations_gate_scores_without_hosted_remote_overclaim`
- `npm run build`
- `npm run test:docker:contract`
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade`
- `npm run test:local`
- Browser dashboard/API proof showing `hosted_browser_sandbox_provider_steel_operations`, `hosted_browser_sandbox_provider_steel_self_host`, and `hosted_remote_browser_sandbox`.

Verification result:
- Steel operations smoke passed with `steel_self_host_operations_contract_ready`, `85 / 100`, `hostedProviderReady=false`, and no endpoint/token/frame/OCR/input leakage.
- Browser-sandbox provider contract tests passed with 25/25 tests.
- Deployment compose contract test passed.
- Focused FastAPI Steel operations tests passed with 2/2 tests.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 42/42 tests.
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade` passed with 51 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated OpenClaw skips after linking the clean worktree to the existing local Graphiti venv and copied local Aetna fixture DB for verification only.
- Browser dashboard/API proof passed on `http://127.0.0.1:4214/?phase=steel-self-host-operations-hardening`.
- Visual/API proof verified `hosted_browser_sandbox_provider_steel_operations` at `85 / 100`, `hosted_browser_sandbox_provider_steel_self_host` at `0 / 100` in the fresh worktree without the private Phase 28 artifact, `hosted_remote_browser_sandbox` at `0 / 100`, and no local endpoint/token leakage.
- Proof artifacts:
  - `artifacts/browser-sandbox-provider-steel-operations-smoke.json`
  - `artifacts/phase29-steel-operations-dashboard-proof.png`
  - `artifacts/phase29-steel-operations-visual-proof.json`

## Phase 30 Steel Remote Hardening Update

Status: Implemented as static remote-hardening scaffolding and proof gates; live remote 10/10 is blocked until an owned remote Steel host, TLS hostname, backend allowlist, and private debugger tunnel are available.

Slice name:
- Steel Browser remote hardening for infrastructure owned by the operator.

Code changes:
- Added `infra/steel/remote/compose.yaml` with Phase 29 pinned Steel API/UI image digests, loopback API/CDP/UI bindings, restart policies, healthcheck, and encrypted-volume log mount placeholder.
- Added `infra/steel/remote/Caddyfile` with TLS hostname placeholder, backend egress allowlist matcher, restricted Steel routes, 403 for non-allowlisted clients, and 404 for all other routes.
- Added `infra/steel/remote/firewall.md` and `infra/steel/remote/wireguard.md` for host firewall, outbound allowlist, and private CDP tunnel procedures.
- Added `infra/steel/remote/recover.sh` for health wait, one-session non-PHI smoke, release, and recovery event emission.
- Added `npm run sandbox:browser:steel-remote-readiness` and `scripts/browser-sandbox-provider-steel-remote-readiness-smoke.mjs`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with `production-candidate` and additive `transport.tls` support, remote deployment validation, remote ten-check summarization, and accepted lifecycle artifact writing under `artifacts/phase30/` only when live proof passes.
- Exposed `hosted_browser_sandbox_provider_steel_remote_host` in Node dashboard proof and FastAPI `/api/v1/proof`.
- Required the Phase 30 remote-host gate before final `hosted_remote_browser_sandbox` can score above `0 / 100`.

Safety decision:
- CDP remains private-only through loopback/tunnel. It is not reverse-proxied.
- `recordFrames=false`, `persistRawOcrText=false`, human-only takeover, no agent credential entry, and no external/write actions remain preserved.
- No real hostname, IP, token, WireGuard key, BAA identifier, or private runtime endpoint was committed.
- The runtime JSON was not flipped to `production-candidate`, and no Cortex Phase 30 semantic/episodic promotion was written, because the real remote lifecycle did not pass 10/10 in this environment.

Verification plan:
- `npm run sandbox:browser:steel-remote-readiness`
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs src/tests/deployment-compose.test.mjs`
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_steel_remote_host_readiness_visible_without_hosted_remote_overclaim project.tests.test_fastapi_facade.FastApiFacadeTest.test_hosted_remote_readiness_requires_phase30_steel_remote_artifact`
- `npm run build`
- `npm run test:docker:contract`
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade`
- `npm run test:local`

Verification result:
- `npm run sandbox:browser:steel-remote-readiness` passed the static remote deployment contract with 20/20 checks, reported `steel_remote_host_contract_ready_waiting_live_10_of_10`, and kept the remote-host score at `0 / 100`.
- Focused JS provider/deployment tests passed with 28/28 tests.
- Focused FastAPI remote-host tests passed with 2/2 tests.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 44/44 tests.
- `.venv-facade/bin/python -m unittest project.tests.test_fastapi_facade` passed with 53 tests and 2 expected live-gated skips.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated OpenClaw skips after linking the clean worktree to the existing local Graphiti venv for verification only.

Known gap:
- Task 4 acceptance remains blocked by missing real remote Steel host/TLS/tunnel. The remote-host score must stay `0 / 100` until the Phase 29 ten-check lifecycle harness passes against `https://example.com` from the backend network position and host-firewall offsite proof is recorded.

## Phase 30 Closure And Phase 31 Steel Ops Drills Update

Status: Phase 30 is now closed on main, and Phase 31 is implemented as an operational drill gate.

Phase 30 closure:
- The real remote Steel host path was completed on owned AWS EC2 infrastructure in `us-east-1` after the earlier static note.
- Accepted artifact: `artifacts/phase30/steel-remote-live-lifecycle-2026-06-18T22-29-22-865Z.json`.
- Remote readiness passed with `steel_remote_host_lifecycle_verified`, `10 / 10` lifecycle checks, `20 / 20` deployment checks, `100 / 100`, public TLS, private CDP tunnel, host firewall proof, ref-only screenshot/OCR, human takeover required, and no raw endpoint/secret/frame/image/OCR/input return.
- Phase 30 PRs landed:
  - Worker PR #13
  - Cortex PR #92

Phase 31 slice name:
- Steel remote ops drills: patch cadence, backup/restore drill, health alerting, and on-call handoff.

Code changes:
- Added `infra/steel/remote/ops-drills.example.json` for the non-secret Phase 31 operations contract.
- Added `infra/steel/remote/patching.md` for weekly digest review, critical CVE review, rollback, and post-patch smoke commands.
- Added `infra/steel/remote/backup-restore-drill.sh`, dry-run safe by default, with ref-only drill events and raw visual artifact exclusions.
- Added `infra/steel/remote/health-alerts.example.json` for TLS health, local health, session latency, TLS expiry, WireGuard/CDP, restart, and recovery-event probes.
- Added `infra/steel/remote/oncall-handoff.md` with incident handoff fields for PHI exposure, takeover boundary, credential entry, external/write actions, and rollback.
- Added `scripts/browser-sandbox-provider-steel-ops-drills-smoke.mjs` and `npm run sandbox:browser:steel-ops-drills`.
- Extended `scripts/browser-sandbox-provider-contract.mjs` with Phase 31 ops-drill validation and `hosted_browser_sandbox_provider_steel_ops_drills`.
- Exposed the Phase 31 gate in the Node dashboard proof and score table.

Safety decision:
- Phase 31 does not add concurrency fan-out or N-host routing.
- Phase 31 does not introduce a browser SaaS dependency.
- The human-only `interactive_takeover` boundary remains preserved.
- No hostnames, IPs, AWS account IDs, keys, tokens, WireGuard material, raw screenshots, raw OCR text, raw frames, or input values were committed.

Verification result:
- `node --check scripts/browser-sandbox-provider-contract.mjs`
- `node --check scripts/browser-sandbox-provider-steel-ops-drills-smoke.mjs`
- `node --check src/server/server.mjs`
- `npm run sandbox:browser:steel-ops-drills` passed with `16 / 16` checks and `100 / 100`.
- `node --test src/tests/browser-sandbox-provider-contract.test.mjs` passed with 28/28 tests.
- `npm run build` passed.
- `npm run test:docker:contract` passed with 45/45 tests.
- `npm run test:local` passed with 210 total tests: 208 passed, 0 failed, and 2 expected live-gated OpenClaw skips after linking the clean worktree to the existing local Graphiti venv and copying the local Aetna fixture SQLite DB plus WAL/SHM files for verification only.

Browser/dashboard proof:
- Dashboard URL: `http://127.0.0.1:4215/?phase=steel-ops-drills`
- Browser DOM proof verified `hosted_browser_sandbox_provider_steel_ops_drills`, `steel_remote_ops_drills_ready`, `100 / 100`, `ops-drill readiness`, `remote-host readiness`, and the Phase 30 lifecycle artifact reference.
- Screenshot artifact: `artifacts/phase31/steel-ops-drills-dashboard-proof.png`
- Visual proof artifact: `artifacts/phase31/steel-ops-drills-visual-proof.json`

## Phase 32 Canonical Goal-Tied Operating System Update

Status: Implemented and locally verified in the Phase 32 branch; PRs pending.

Slice name:
- Canonical RALPH + multi-agent role operating system.

Context:
- The user asked to upgrade from long-running implementation continuity to canonical goal-tied phase execution.
- Cortex remains the canonical source of truth.
- Phase 32 intentionally does not implement runtime continuous procedural memory; it creates the development control surface for Phase 33.

Code and docs changed:
- Added `docs/PROJECT_OPERATING_SYSTEM.md`.
- Added `docs/PHASE_SCOREBOARD.md`.
- Added `docs/NON_MOCKED_PROOF_RULES.md`.
- Extended `/api/proof/runs/server-connector-next-mobile-mvp` with:
  - `canonical_goal_tied_phase_execution`;
  - `canonical_phase_operating_system`;
  - Phase 32 visual/doc proof metadata.
- Added regression coverage in `src/tests/chat-ui-contract.test.mjs`.

Safety decision:
- Multi-agent work is allowed only as role-separated phase execution with one merge gate.
- Cortex is project memory only; product memory remains Graphiti/FalkorDB or another explicit runtime product-memory adapter.
- Non-mocked proof labels are now a first-class local rule.

Verification result:
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 12/12 tests.
- `npm run build` passed.
- `npm run test:local` passed with 211 total tests: 209 passed, 0 failed, and 2 expected live-gated OpenClaw skips after linking the clean worktree to the existing local Graphiti venv and copying the local SQLite fixture DB for verification only.
- API proof at `http://127.0.0.1:4216/api/proof/runs/server-connector-next-mobile-mvp` showed `canonical_goal_tied_phase_execution`, `canonical_phase_operating_system`, and a `100 / 100` `canonical_goal_tied_phase_execution` score.

Browser/dashboard proof:
- Dashboard URL: `http://127.0.0.1:4216/?phase=phase-32-canonical-ralph-operating-system`
- Browser DOM proof verified `canonical_goal_tied_phase_execution`, `pass_phase32_operating_system_contract`, `100 / 100`, `docs/PROJECT_OPERATING_SYSTEM.md`, and `cycle_contract_ready`.
- Screenshot artifact: `artifacts/phase32/phase32-dashboard-proof.png`
- Visual proof artifact: `artifacts/phase32/phase32-dashboard-proof.json`

Next phase:
- Phase 33 should implement the first continuous-intelligence runtime slice: typed `CaseState`, G0-G8 LangGraph gates, PEMS maturity schema, and shadow-mode procedural reconstruction proof.

## Phase 33 Continuous Intelligence Runtime Shadow Slice

Status: Implemented and locally verified in the Phase 33 branch.

Slice name:
- Continuous-intelligence shadow scaffold: typed `CaseState`, G0-G8 gates, PEMS, and shadow procedural reconstruction.

Context:
- Phase 32 made the development loop canonical and identified continuous procedural intelligence as the next runtime gap.
- Phase 33 intentionally implements the first runtime scaffold only. It does not let procedural reconstruction drive healthcare recommendations, approval decisions, worker dispatch, or final answers.

Code and docs changed:
- Added `src/concierge/continuousIntelligence.mjs` with:
  - `brainstyworkers.case_state.v1`;
  - `brainstyworkers.pems.v1`;
  - ordered G0-G8 universal case gates;
  - PEMS maturity scoring and safety-incident veto;
  - shadow-only cue/tag/content procedural reconstruction;
  - connector readiness proof helper.
- Added LangGraph node `case_state_shadow` after `observe_evidence` and before `compose_response`.
- Extended connector proof with:
  - `continuous_procedural_memory_shadow`;
  - `continuous_intelligence_shadow`;
  - score `continuous_procedural_memory` at `60 / 60`.
- Added `src/tests/continuous-intelligence.test.mjs`.
- Updated topology, runner-cycle, dashboard contract, build-check, plan, acceptance, decisions, project operating-system, and scoreboard docs.

Safety decision:
- `productionDrivingAllowed=false` remains hard-coded for Phase 33.
- PEMS is not trusted in the readiness proof.
- `CaseState` hashes user input and returns source pointer refs without raw URL paths.
- Cortex remains project memory only; product memory remains Graphiti/FalkorDB direction.

Verification result:
- `node --test src/tests/continuous-intelligence.test.mjs src/tests/graph-topology.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 20/20 tests.
- `npm run build` passed.
- `npm run test:local` passed with 217 total tests: 215 passed, 0 failed, and 2 expected live-gated OpenClaw skips after linking the clean worktree to the existing local Graphiti venv and copying the local Aetna fixture SQLite DB for verification only.
- API proof at `http://127.0.0.1:4217/api/proof/runs/server-connector-next-mobile-mvp` showed `continuous_procedural_memory_shadow`, `continuous_intelligence_shadow`, `60 / 60`, `shadow_only`, `brainstyworkers.case_state.v1`, `brainstyworkers.pems.v1`, `pemsTrusted=false`, and `productionDrivingAllowed=false`.

Browser/dashboard proof:
- Dashboard URL: `http://127.0.0.1:4217/?phase=phase-33-continuous-intelligence-shadow`
- Browser DOM proof verified `continuous_procedural_memory_shadow`, `continuous_intelligence_shadow`, `pass_phase33_shadow_scaffold_not_runtime_decisioning`, `60 / 60`, both schema ids, `shadow_only`, and production-driving blocked.
- Visual proof artifact: `artifacts/phase33/phase33-dashboard-proof.json`
- Screenshot note: in-app browser screenshot capture timed out twice on `Page.captureScreenshot`; a full-screen fallback was intentionally not committed because it could capture unrelated personal window content.

Next phase:
- Phase 34 should persist shadow runs and accumulate PEMS maturity from real resolved traces, still without letting procedural skills drive recommendations until maturity, reviewer, citation, and safety gates are green.

## Phase 34 Continuous Intelligence Shadow Persistence

Status: Implemented and locally verified in the Phase 34 branch.

Slice name:
- Durable shadow-run ledger and PEMS candidate maturity accumulation.

Context:
- Phase 33 created the shadow-only `CaseState`, G0-G8 gates, PEMS scorer, and LangGraph `case_state_shadow` node.
- Phase 34 makes those shadows durable after final response/product-memory retain so the project can learn from real graph traces without letting learned procedures drive healthcare decisions.

Code and docs changed:
- Added schema tables:
  - `continuous_intelligence_shadow_runs`;
  - `pems_candidate_maturity`.
- Extended `src/concierge/continuousIntelligence.mjs` with:
  - `2026-06-18.phase34-shadow-persistence.v1`;
  - safe shadow persistence summaries;
  - append-only shadow-run persistence;
  - aggregate PEMS candidate maturity updates;
  - dashboard/API persistence readiness proof.
- Wired `runLangGraphOrchestration` to persist a final shadow trace after response composition and product-memory retain.
- Extended connector proof with `continuous_intelligence_shadow_persistence`.
- Added `src/tests/continuous-intelligence-persistence.test.mjs`.

Safety decision:
- Phase 34 still sets `productionDrivingAllowed=false`.
- PEMS stays untrusted without reviewer approvals even when trace counts accumulate.
- Persisted shadows include hashes, source pointer refs, gate counts, PEMS maturity, and safe metadata only. Raw user input, raw source URLs, raw frames, OCR text, and Cortex product-memory claims remain excluded.

Verification result:
- `node --test src/tests/continuous-intelligence.test.mjs src/tests/continuous-intelligence-persistence.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 20/20 tests.
- `npm run build` passed.
- `npm run test:local` passed with 219 total tests: 217 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- API proof at `http://127.0.0.1:4218/api/proof/runs/server-connector-next-mobile-mvp` showed `continuous_intelligence_shadow_persistence`, `phase34_shadow_persistence_active`, `70 / 70`, one real shadow run, `pemsTrusted=false`, and `productionDrivingAllowed=false`.

Browser/dashboard proof:
- Dashboard URL: `http://127.0.0.1:4218/?phase=phase-34-continuous-intelligence-shadow-persistence`
- Browser proof verified `continuous_intelligence_shadow_persistence`, `phase34_shadow_persistence_active`, `70 / 70`, `pemsTrusted=false`, and `productionDrivingAllowed=false`.
- Visual proof artifacts:
  - `artifacts/phase34/phase34-dashboard-proof.json`;
  - `artifacts/phase34/phase34-dashboard-proof.png`.

Next phase:
- Phase 35 should add reviewer/evaluator promotion gates for PEMS candidates before any candidate can move from shadow maturity into supervised advisory use.

## Phase 36 PEMS Reviewer/Evaluator Workbench

Status: Implemented and locally verified on branch `phase-36-pems-reviewer-evaluator-workbench`.

Slice name:
- Sanitized advisory-draft workbench for supervised PEMS review.

Context:
- Phase 35 created the promotion-review ledger and explicit reviewer, validator, citation, and safety gates.
- Cortex Phase 35 named the next step as a workbench where LLM-assisted evaluator draft notes and NeSTR-style consistency traces can advise reviewers without becoming authority.

Code and docs changed:
- Add schema table `pems_candidate_evaluator_drafts`.
- Add advisory draft helpers and workbench readiness proof in `src/concierge/continuousIntelligence.mjs`.
- Add API routes:
  - `GET /api/continuous-intelligence/pems/workbench`;
  - `POST /api/continuous-intelligence/pems/evaluator-drafts`.
- Extend `POST /api/continuous-intelligence/pems/reviews` so explicit reviews can link to advisory draft refs.
- Extend connector proof with `pems_reviewer_evaluator_workbench`.
- Add `src/tests/pems-reviewer-workbench.test.mjs`.

Safety decision:
- Drafts are advisory material only.
- Drafts do not approve candidates, alter promotion state, route healthcare workflows, compose final answers, dispatch OpenClaw, control browsers, contact payers, send external messages, or write to payer systems.
- Draft rows store hashes, previews, and refs only; raw notes, raw traces, raw OCR, raw frames, raw source text, credentials, and secrets remain excluded.
- `productionDrivingAllowed=false` remains enforced.

Verification result:
- `node --test src/tests/pems-reviewer-workbench.test.mjs src/tests/pems-promotion-gates.test.mjs src/tests/chat-ui-contract.test.mjs` passed with 16/16 tests.
- `npm run build` passed and names the Phase 36 reviewer/evaluator workbench contract.
- `npm run test:local` passed with 222 total tests: 220 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- API proof at `http://127.0.0.1:4218/api/continuous-intelligence/pems/workbench` showed `phase36_reviewer_evaluator_workbench_active`, `85 / 85`, one evaluator draft, one advisory-linked review, and `productionDrivingAllowed=false`.
- Connector proof at `http://127.0.0.1:4218/api/proof/runs/server-connector-next-mobile-mvp` showed `pems_reviewer_evaluator_workbench`, `continuous_procedural_memory` at `85 / 85`, `evaluatorDraftCount=1`, `advisoryLinkedReviewCount=1`, and production driving disabled.

Browser/dashboard proof:
- Dashboard URL: `http://127.0.0.1:4218/?phase=phase-36-pems-reviewer-evaluator-workbench`
- Browser DOM proof verified `pems_reviewer_evaluator_workbench`, `phase36_reviewer_evaluator_workbench_active`, `85 / 85`, and production-driving false.
- Visual proof artifacts:
  - `artifacts/phase36/phase36-workbench-api-proof.json`;
  - `artifacts/phase36/phase36-connector-proof.json`;
  - `artifacts/phase36/phase36-dashboard-proof.json`;
  - `artifacts/phase36/phase36-dashboard-proof.png`.

Next phase:
- Phase 37 should add a reviewer-facing UI surface for comparing deterministic and advisory outputs and approving, rejecting, or blocking advisory material by ref only.

## Phase 37 PEMS Reviewer UI

Status: Verified locally on branch `phase-37-pems-reviewer-ui`.

Slice name:
- Operator-facing UI for ref-only advisory PEMS review.

Context:
- Phase 36 created the safe evaluator-draft ledger and workbench API.
- Cortex Phase 36 named the next step as a reviewer-facing UI surface that lets operators compare/inspect advisory material and approve, reject, or block by ref only.

Implemented code and docs:
- Added a `PEMS Reviewer Workbench` panel to `src/app/index.html`.
- Added rendering and review-action handlers in `src/app/app.js`.
- Added responsive workbench styling in `src/app/styles.css`.
- Extended connector proof with `pems_reviewer_ui`.
- Extended the workbench API with a `reviewerUi` readiness wrapper so the dashboard distinguishes the Phase 37 UI gate from the underlying Phase 36 workbench queue.
- Extended build and UI contract tests.

Safety decision:
- UI actions submit explicit review records only.
- The UI does not let advisory drafts drive recommendations, workflow routing, approval outcomes, browser actions, OpenClaw dispatch, payer contact, external messages, or writes.
- The UI renders sanitized previews and refs only; raw advisory notes, raw consistency traces, raw OCR, raw frames, credentials, and secrets remain excluded.
- `productionDrivingAllowed=false` remains enforced.

Verification result:
- `node --check src/server/server.mjs && node --check src/server/build-check.mjs && node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs` passed with 15/15 tests.
- `npm run build` passed and names the Phase 37 PEMS reviewer UI contract.
- `npm run test:local` passed with 223 total tests: 221 passed, 0 failed, and 2 expected live-gated skips.
- API proof at `http://127.0.0.1:4218/api/continuous-intelligence/pems/workbench` shows the Phase 37 `reviewerUi` wrapper at `88 / 88`, the underlying Phase 36 workbench queue at `85 / 85`, one ready draft, one linked review, and `productionDrivingAllowed=false`.
- Connector proof at `http://127.0.0.1:4218/api/proof/runs/server-connector-next-mobile-mvp` shows `pems_reviewer_ui`, `continuous_procedural_memory` at `88 / 88`, review actions `approved`, `rejected`, `blocked`, and production driving disabled.

Browser/dashboard proof:
- Dashboard URL: `http://127.0.0.1:4218/?phase=phase-37-pems-reviewer-ui`
- Browser DOM proof verified `phase37_pems_reviewer_ui_ready`, `88 / 88`, the underlying Phase 36 queue, the three review controls, and production-driving false.
- Visual proof initially caught a dashboard truth bug where the Phase 37 panel displayed the Phase 36 workbench header; fixed by adding the `reviewerUi` wrapper and rendering the UI gate separately from the queue.
- Visual and API proof artifacts:
  - `artifacts/phase37/phase37-workbench-api-proof.json`;
  - `artifacts/phase37/phase37-connector-proof.json`;
  - `artifacts/phase37/phase37-dashboard-proof.json`;
  - `artifacts/phase37/phase37-dashboard-workbench-proof.png`;
  - `artifacts/phase37/phase37-dashboard-score-proof.png`.

Next phase:
- Phase 38 should add deterministic-vs-advisory comparison rows, source-pointer evidence chips, and evaluator provenance refs without letting advisory material become production authority.

## Phase 38 PEMS Reviewer Comparison And Provenance

Status: Verified locally on branch `phase-38-reviewer-comparison-provenance`.

Slice name:
- Operator-facing deterministic-vs-advisory comparison and evaluator provenance.

Context:
- Phase 37 exposed the reviewer workbench in the dashboard.
- Cortex Phase 37 named Phase 38 as richer reviewer comparison and provenance, while keeping comparison output advisory/ref-only.

Implemented code and docs:
- Added `PEMS_REVIEWER_COMPARISON_VERSION`.
- Added `buildPemsReviewerComparisonProvenance` to derive deterministic-vs-advisory comparison rows from existing safe workbench state.
- Extended the workbench API with `reviewerComparison`.
- Extended connector proof with `pems_reviewer_comparison_provenance`.
- Added dashboard rendering for comparison rows, source-pointer chips, and evaluator provenance refs.
- Updated build guards, UI contract tests, PEMS workbench tests, operating docs, scoreboard, acceptance criteria, implementation plan, and decisions.

Safety decision:
- The comparison is a reviewer aid only.
- Mocked LLM output never counts as live LLM proof.
- Raw prompts, raw completions, raw advisory notes, raw traces, raw OCR, raw frames, credentials, and secrets remain excluded.
- The comparison cannot drive healthcare answers, workflow routing, approvals, browser actions, OpenClaw dispatch, payer contact, external messages, or writes.
- `productionDrivingAllowed=false` remains enforced.

Verification result:
- `node --check src/concierge/continuousIntelligence.mjs && node --check src/server/server.mjs && node --check src/server/build-check.mjs && node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs` passed with 15/15 tests.
- `npm run build` passed and names the Phase 38 reviewer comparison/provenance contract.
- `npm run test:local` passed with 223 total tests: 221 passed, 0 failed, and 2 expected live-gated skips.
- API proof at `http://127.0.0.1:4218/api/continuous-intelligence/pems/workbench` shows `reviewerComparison` at `90 / 90`, four comparison rows, one source-pointer chip, `liveProofClaimed=false`, and `productionDrivingAllowed=false`.
- Connector proof at `http://127.0.0.1:4218/api/proof/runs/server-connector-next-mobile-mvp` shows `pems_reviewer_comparison_provenance`, `continuous_procedural_memory` at `90 / 90`, `comparisonRows=4`, `liveProofClaimed=false`, and production driving disabled.

Browser/dashboard proof:
- Dashboard URL: `http://127.0.0.1:4218/?phase=phase-38-reviewer-comparison-provenance`
- Browser DOM proof verified `phase38_reviewer_comparison_provenance_ready`, `90 / 90`, deterministic-vs-advisory comparison rows, source-pointer chip `phase36_public_example`, evaluator provenance, and live proof not claimed.
- Visual and API proof artifacts:
  - `artifacts/phase38/phase38-workbench-api-proof.json`;
  - `artifacts/phase38/phase38-connector-proof.json`;
  - `artifacts/phase38/phase38-dashboard-proof.json`;
  - `artifacts/phase38/phase38-dashboard-dom-proof.json`;
  - `artifacts/phase38/phase38-dashboard-workbench-proof.png`;
  - `artifacts/phase38/phase38-dashboard-comparison-proof.png`;
  - `artifacts/phase38/phase38-dashboard-provenance-proof.png`.

## Phase 39 PEMS Live Evaluator Generation And Filtering

Status: Verified locally on branch `phase-39-live-evaluator-filters`.

Slice name:
- Live-gated evaluator draft creation and reviewer filtering.

Context:
- Phase 38 exposed deterministic-vs-advisory comparison and evaluator provenance.
- Cortex Phase 38 named Phase 39 as live-gated advisory generation and reviewer filtering, while preserving the advisory/ref-only boundary.

Implemented code and docs:
- Added `PEMS_LIVE_EVALUATOR_FILTERING_VERSION`.
- Added `createLiveGatedPemsEvaluatorDraft()` with source-pointer requirements, OpenAI credential gating, outbound payload observation, safe advisory preview storage, completion hashing, egress refs, and mocked-output non-proof metadata.
- Added filter-aware `getPemsReviewerWorkbenchStatus()` support for draft status, evaluator mode, candidate id, and live-only filters.
- Added `buildPemsLiveEvaluatorFilteringProof()` and connector proof key `pems_live_evaluator_generation_filtering`.
- Added `POST /api/continuous-intelligence/pems/live-evaluator-drafts`.
- Extended `/api/continuous-intelligence/pems/workbench` with `liveEvaluatorFiltering`, `appliedFilters`, `filterOptions`, `filteredDraftCount`, and `draftQueue`.
- Updated the dashboard PEMS workbench with Phase 39 filter controls, filtered draft queue, live evaluator gate, generate-live-draft action, live proof state, and mocked-output proof status.

Safety decision:
- Missing source pointer IDs fail closed before model invocation.
- Missing model credentials fail closed before model invocation.
- Mocked or injected LLM output never counts as live proof.
- Draft metadata excludes raw prompts, raw completions, raw source text, raw OCR, raw frames, credentials, secrets, and PHI.
- Phase 39 remains advisory-only and keeps `productionDrivingAllowed=false`.

Verification result:
- `node --check src/concierge/continuousIntelligence.mjs && node --check src/server/server.mjs && node --check src/server/build-check.mjs && node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs` passed with 16/16 tests.
- `npm run build` passed and names the Phase 39 live evaluator/filtering contract.
- `npm run test:local` passed with 224 total tests: 222 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- Real live evaluator proof ran against configured OpenAI and returned `phase39_live_evaluator_draft_created` with `liveProofClaimed=true`, observed egress ref, model ref, source pointer ids, metadata phase `39`, and `productionDrivingAllowed=false`.
- API proof at `http://127.0.0.1:4218/api/continuous-intelligence/pems/workbench` shows `phase39_live_evaluator_filtering_ready`, `92 / 92`, live generated draft count, live proof draft count, and filter metadata.
- Connector proof at `http://127.0.0.1:4218/api/proof/runs/server-connector-next-mobile-mvp` shows `pems_live_evaluator_generation_filtering`, `continuous_procedural_memory` at `92 / 92`, `liveProofClaimed=true`, and production driving disabled.

Browser/dashboard proof:
- Dashboard URL: `http://127.0.0.1:4218/?phase=phase-39-live-evaluator-filters`
- In-app browser DOM proof verified Phase 39, `92 / 92`, observed egress draft, reviewer filters, mocked-output proof never counted, and production-driving disabled.
- Screenshot capture through the in-app browser timed out on the tall dashboard, so the saved PNG artifacts were captured through bundled local Playwright after the in-app DOM proof passed.
- Visual and API proof artifacts:
  - `artifacts/phase39/phase39-live-evaluator-response.json`;
  - `artifacts/phase39/phase39-workbench-api-proof.json`;
  - `artifacts/phase39/phase39-workbench-filtered-api-proof.json`;
  - `artifacts/phase39/phase39-connector-proof.json`;
  - `artifacts/phase39/phase39-dashboard-dom-proof.json`;
  - `artifacts/phase39/phase39-dashboard-browser-dom-proof.json`;
  - `artifacts/phase39/phase39-dashboard-filtered-dom-proof.json`;
  - `artifacts/phase39/phase39-playwright-visual-proof.json`;
  - `artifacts/phase39/phase39-dashboard-workbench-proof.png`;
  - `artifacts/phase39/phase39-dashboard-provenance-proof.png`;
  - `artifacts/phase39/phase39-dashboard-filtered-proof.png`.
## Phase 40 PEMS Live Claim Citation Closure

Status: Implemented locally on branch `phase-40-live-claim-citation-closure`.

What changed:

- Added `PEMS_LIVE_CLAIM_CITATION_CLOSURE_VERSION`.
- Added claim-level citation closure normalization for live evaluator outputs.
- Live evaluator output can now carry supported, low-confidence, and unsupported claim rows.
- Supported claim rows are source-pointer bounded; unsupported or low-confidence rows require reviewer edits.
- Draft metadata stores claim hashes/previews, allowed source pointer IDs, labels, suggested edit previews, and closure summary counts only.
- Workbench API returns `liveClaimCitationClosure`.
- Connector proof exposes `pems_live_claim_citation_closure`.
- Dashboard renders a `Claim Citation Closure` table and disables approval when closure requires reviewer edits.
- Reject and block remain available for vetoed advisory drafts.

Safety:

- Claim labels do not create evidence.
- Claim labels do not drive production recommendations, healthcare answers, workflow routing, approval outcomes, browser actions, OpenClaw dispatch, payer contact, external messages, or payer writes.
- Raw claims, raw source text, raw prompts, raw completions, raw OCR, raw frames, credentials, secrets, and PHI remain excluded.
- `productionDrivingAllowed=false` remains enforced.

Verification:

- `node --check src/concierge/continuousIntelligence.mjs && node --check src/server/server.mjs && node --check src/server/build-check.mjs && node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs` passed with 17/17 tests.
- `npm run build` passed and names the Phase 40 live claim citation closure contract.
- `npm run test:local` passed with 225 total tests, 223 passed, 0 failed, and 2 expected skips.
- `git diff --check` passed.
- Targeted secret and PHI scans over `src`, `docs`, and `artifacts/phase40` passed.
- A live OpenAI-gated evaluator draft was created from the workbench API with one supported claim and one unsupported claim; mocked LLM output does not count as live proof.
- The filtered workbench API showed `phase40_claim_citation_closure_veto_visible`, score `94 / 94`, `supported=1`, `unsupported=1`, `sourcePointerBounded=true`, `reviewerEditRequired=true`, and `productionDrivingAllowed=false`.
- The connector proof raised `continuous_procedural_memory` to the Phase 40 target while keeping PEMS untrusted and advisory-only.
- The dashboard DOM proof showed Phase 40 visible, unsupported claim visible, raw claim/source not stored, approval disabled, and reject/block enabled.
- The in-app browser DOM proof passed; screenshot capture used the local Playwright fallback after the in-app browser screenshot call timed out.

Artifacts:

- `artifacts/phase40/phase40-live-evaluator-response.json`
- `artifacts/phase40/phase40-workbench-filtered-api-proof.json`
- `artifacts/phase40/phase40-connector-proof.json`
- `artifacts/phase40/phase40-dashboard-dom-proof.json`
- `artifacts/phase40/phase40-playwright-visual-proof.json`
- `artifacts/phase40/phase40-dashboard-claim-closure-proof.png`

## Phase 41 PEMS Reviewer Claim Revision Records

Status: Implemented and visually verified locally on branch `phase-41-reviewer-claim-revisions`.

What changed:

- Added `PEMS_REVIEWER_CLAIM_REVISION_VERSION`.
- Added `pems_candidate_claim_revisions` as an append-only reviewer revision ledger.
- Added safe reviewer revision recording for candidate id, advisory draft id, claim id/hash, actor id, original claim hash/preview, suggested edit hash/preview, revised claim hash/preview, source pointer IDs, and deterministic reclosure.
- Added `POST /api/continuous-intelligence/pems/claim-revisions`.
- Workbench API returns `reviewerClaimRevisions`.
- Connector proof exposes `pems_reviewer_claim_revisions`.
- Dashboard renders `Reviewer Claim Revision` with before/suggested/revised rows and deterministic reclosure status.

Safety:

- Revision records do not create evidence.
- Revision records do not drive production recommendations, healthcare answers, workflow routing, approval outcomes, browser actions, OpenClaw dispatch, payer contact, external messages, or payer writes.
- Raw original claims, raw suggested edits, raw revised claims, raw source text, raw prompts, raw completions, raw OCR, raw frames, credentials, secrets, and PHI remain excluded.
- `productionDrivingAllowed=false` remains enforced.

Verification:

- `node --check src/concierge/continuousIntelligence.mjs && node --check src/server/server.mjs && node --check src/server/build-check.mjs && node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs` passed with 18/18 tests.
- `npm run build` passed and names the Phase 41 reviewer claim revision contract.
- `npm run test:local` passed with 226 total tests, 224 passed, 0 failed, and 2 expected skips.
- API proof showed `phase41_reviewer_claim_revision_ready`, score `96 / 96`, deterministic reclosure passed, source-pointer bounded, raw revision not stored, revision creates no evidence, and `productionDrivingAllowed=false`.
- In-app browser DOM proof showed Phase 41 visible, revision panel visible, before/suggested/revised rows visible, raw revision/source not stored, approval disabled, and reject/block/revise available.
- Full-page screenshot capture through the in-app browser timed out, so visual screenshots used the local Playwright fallback.

Artifacts:

- `artifacts/phase41/phase41-workbench-before-revision.json`
- `artifacts/phase41/phase41-claim-revision-request.json`
- `artifacts/phase41/phase41-claim-revision-response.json`
- `artifacts/phase41/phase41-workbench-after-revision.json`
- `artifacts/phase41/phase41-connector-proof.json`
- `artifacts/phase41/phase41-api-proof-summary.json`
- `artifacts/phase41/phase41-dashboard-dom-proof.json`
- `artifacts/phase41/phase41-playwright-visual-proof.json`
- `artifacts/phase41/phase41-dashboard-reviewer-claim-revision-proof.png`
- `artifacts/phase41/phase41-dashboard-reviewer-claim-revision-panel.png`

## Phase 42 PEMS Reviewer Follow-Up Workflow Binding

Status: Implemented and visually verified locally on branch `phase-42-reviewer-follow-up-workflows`.

What changed:

- Added `PEMS_REVIEWER_FOLLOW_UP_VERSION`.
- Added `pems_candidate_review_followups` as an append-only reviewer follow-up ledger.
- Added safe reviewer follow-up recording for candidate id, advisory draft id, claim revision id, promotion review id, workflow status, revision outcome, action required, safe rationale preview/hash, and advisory-only metadata.
- Added `POST /api/continuous-intelligence/pems/follow-ups`.
- Workbench API returns `reviewerFollowUps`.
- Connector proof exposes `pems_reviewer_follow_up_workflows`.
- Dashboard renders `Reviewer Follow-Up Workflow` with revision binding, review binding, workflow state, action required, and advisory-only safety.

Safety:

- Follow-up records do not create evidence.
- Follow-up records do not bypass human review.
- Follow-up records do not drive production recommendations, healthcare answers, workflow routing, approval outcomes, browser actions, OpenClaw dispatch, payer contact, external messages, or payer writes.
- Raw revision text, raw review text, raw rationale text, raw source text, raw prompts, raw completions, raw OCR, raw frames, credentials, secrets, and PHI remain excluded.
- `productionDrivingAllowed=false` remains enforced.

Verification:

- `node --check src/concierge/continuousIntelligence.mjs && node --check src/server/server.mjs && node --check src/server/build-check.mjs && node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs` passed with 19/19 tests.
- `npm run build` passed and names the Phase 42 reviewer follow-up workflow contract.
- `npm run test:local` passed with 227 total tests, 225 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- API proof showed `phase42_reviewer_follow_up_workflow_ready`, score `98 / 98`, revision binding true, review decision binding true, revision resolved veto true, raw follow-up storage false, follow-up creates no evidence, and `productionDrivingAllowed=false`.
- Browser visual proof showed Phase 42 visible, follow-up panel visible, revision-to-review binding visible, explicit review decision visible, resolved advisory veto visible, raw revision/review not stored, approval enabled only after deterministic reclosure, and no console errors.

## Phase 43 PEMS Reviewer History Audit Exports

Timestamp: 2026-06-21T03:37:05Z.

Goal:

- Turn reviewer follow-up history into a longitudinal audit/export surface without enabling production procedural decisioning.

Implemented:

- Added `PEMS_REVIEWER_HISTORY_EXPORT_VERSION`.
- Added `pems_candidate_review_history_exports` as an append-only export ledger.
- Added safe snapshot assembly across advisory drafts, claim revisions, promotion reviews, and reviewer follow-ups.
- Added export rows with filters, export ref, export hash, snapshot hash, safe snapshot preview, and safety metadata only.
- Added `POST /api/continuous-intelligence/pems/history-exports`.
- Workbench API returns `reviewerHistoryExports`.
- Connector proof exposes `pems_reviewer_history_audit_exports`.
- Dashboard renders the Phase 43 reviewer history audit export panel and a record-history-export control.

Safety:

- Export rows store refs, hashes, counts, IDs, and statuses only.
- Raw history text, raw revision text, raw review text, raw follow-up text, raw source text, prompts, completions, OCR, frames, credentials, secrets, and PHI are not stored in export rows.
- History exports do not create evidence, bypass human review, dispatch OpenClaw, contact payers, send external messages, write to payer portals, or drive healthcare answers.
- `productionDrivingAllowed=false` remains enforced.

Verification:

- `node --check src/concierge/continuousIntelligence.mjs && node --check src/server/server.mjs && node --check src/server/build-check.mjs && node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs` passed with 20/20 tests.
- `npm run build` passed and names the Phase 43 reviewer history audit export contract.
- `npm run test:local` passed with 228 total tests, 226 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- `git diff --check` passed.
- Targeted secret scan over changed files and `artifacts/phase43` found no real secrets; it only matched pre-existing fake test/safety example strings.
- API proof artifact: `artifacts/phase43/phase43-api-proof-summary.json`.
- API proof extract: `artifacts/phase43/phase43-api-proof-extract.json`.
- Browser visual proof: `artifacts/phase43/phase43-dashboard-history-export-ref-section.png`.
- Browser DOM proof showed `phase43_reviewer_history_audit_export_ready`, `99 / 99`, export ref visible, snapshot hash visible, raw history/source not stored, production authority disabled, and no console/page errors.

Artifacts:

- `artifacts/phase42/phase42-seed-before-followup.json`
- `artifacts/phase42/phase42-workbench-before-followup.json`
- `artifacts/phase42/phase42-followup-request.json`
- `artifacts/phase42/phase42-followup-response.json`
- `artifacts/phase42/phase42-workbench-after-followup.json`
- `artifacts/phase42/phase42-connector-proof.json`
- `artifacts/phase42/phase42-api-proof-summary.json`
- `artifacts/phase42/phase42-dashboard-dom-proof.json`
- `artifacts/phase42/phase42-playwright-visual-proof.json`
- `artifacts/phase42/phase42-dashboard-followup-proof.png`
- `artifacts/phase42/phase42-dashboard-followup-panel.png`

## Phase 44 PEMS Reviewer History Review Refinement

Timestamp: 2026-06-21T15:38:55Z.

Goal:

- Make longitudinal reviewer history exports searchable, sortable, and comparable across operator review windows without enabling production procedural decisioning.

Implemented:

- Added `PEMS_REVIEWER_HISTORY_REVIEW_VERSION`.
- Added safe history-review filter normalization for candidate id, advisory draft id, follow-up status, export ref, snapshot hash, sort field, and sort direction.
- Added `listPemsReviewerHistoryExports()` over the Phase 43 export ledger using bound SQL parameters and safe post-filtering over snapshot refs.
- Added `comparePemsReviewerHistoryExports()` to compare two export snapshots by safe counts and added/removed safe refs only.
- Workbench API returns `reviewerHistoryReview`.
- Connector proof exposes `pems_reviewer_history_review_refinement`.
- Dashboard renders Phase 44 history follow-up, export-ref, snapshot-hash, sort-field, and sort-direction controls.
- Dashboard renders `Reviewer History Search And Snapshot Diff`.

Safety:

- History review rows and snapshot deltas store/export refs, hashes, counts, statuses, IDs, and safe row refs only.
- Raw history text, raw revision text, raw review text, raw follow-up text, raw source text, prompts, completions, OCR, frames, credentials, secrets, and PHI are not stored.
- History review rows do not create evidence, bypass human review, dispatch OpenClaw, contact payers, send external messages, write to payer portals, or drive healthcare answers.
- `productionDrivingAllowed=false` remains enforced.

Verification:

- `node --check src/concierge/continuousIntelligence.mjs && node --check src/server/server.mjs && node --check src/server/build-check.mjs && node --check src/app/app.js` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/pems-reviewer-workbench.test.mjs` passed with 21/21 tests.
- `npm run build` passed and names the Phase 44 reviewer history review refinement contract.
- `npm run test:local` passed with 229 total tests, 227 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- API proof extract showed `phase44_reviewer_history_review_refinement_ready`, score `100 / 100`, comparison ready, safe rows, and `productionDrivingAllowed=false`.
- Browser DOM proof showed the Phase 44 panel, `100 / 100`, search controls, snapshot comparison ready, raw history/source not stored, production authority disabled, and 0 console errors.

Artifacts:

- `artifacts/phase44/phase44-seed-summary.json`
- `artifacts/phase44/phase44-api-proof-summary.json`
- `artifacts/phase44/phase44-api-proof-extract.json`
- `artifacts/phase44/phase44-dashboard-dom-proof.json`
- `artifacts/phase44/phase44-dashboard-history-review-refinement.png`

## Corrective Phase: Execution Architecture V2 LLM-Manager Worker

Timestamp: 2026-06-21T16:20:00Z.

Goal:

- Correct the post-Phase-44 plan before Phase 45 by documenting the real AWS/BAA substrate and adding an off-by-default v2 write-capable LLM-manager substrate with per-action human approval.

Implemented:

- Added `docs/AWS_HIPAA_SUBSTRATE.md`.
- Added `docs/adr/ADR-001-aws-hipaa-substrate-status.md`.
- Added `docs/adr/ADR-002-execution-v2-llm-manager-worker.md`.
- Added `docs/EXECUTION_ARCHITECTURE_V2.md`.
- Added write approval schema normalization, digesting, exact URL/action binding, single-use consumption, expiry checks, and audit events.
- Extended `evaluatePortalAction()` so irreversible actions remain blocked unless a consumed write token matches the exact action and URL.
- Added `runOfficialOpenClawApprovedWriteAction()` with `executionMode=approved_single_write_action_only`, off by default behind `WEFELLA_EXECUTION_WRITE_ENABLED`.
- Added `src/concierge/llmManagerWorker.mjs` behind `BRAINSTY_WORKER_RUNTIME=llm_manager`, with deterministic default and kill switch.
- Extended the OpenClaw worker contract so `workerMaySubmitForms` can be true only per job with a bound write approval; credentials and payer contact remain hard false.
- Added FastAPI/provider status field `executionV2WriteGate`, blocked by default.
- Updated committed provider examples so `BRAINSTY_WORKER_RUNTIME=deterministic` and `WEFELLA_EXECUTION_WRITE_ENABLED=0`.

Safety:

- Live PHI writes are not enabled.
- No credentials, passwords, passkeys, OTP, 2FA, captcha, or login screen handling is authorized for the agent.
- No payer contact or external messaging is authorized.
- Read-only mode and existing blocked actions are additive-preserved.
- AWS hostnames, IPs, account identifiers, keys, tokens, WireGuard material, TLS secrets, and BAA identifiers remain out of Git.

Verification so far:

- `node --check src/concierge/approvalResume.mjs && node --check src/concierge/policy.mjs && node --check src/concierge/openclawWorkerContract.mjs && node --check src/concierge/openclawOfficialRuntime.mjs && node --check src/concierge/llmManagerWorker.mjs && node --check src/tests/execution-v2-write-approval.test.mjs` passed.
- `node --test src/tests/execution-v2-write-approval.test.mjs src/tests/approval-resume.test.mjs src/tests/policy.test.mjs src/tests/openclaw-worker-contract.test.mjs src/tests/browser-takeover-safety.test.mjs` passed with 26/26 tests.
- `npm run test:execution:v2` passed with 11/11 tests.
- `npm run build` passed.
- `npm run test:local` passed with 234 total tests, 232 passed, 0 failed, and 2 expected live-gated OpenClaw skips.
- `npm run test:facade` passed with 53 tests, 51 passed, 0 failed, and 2 expected skips.
- `npm run test:docker:contract` passed with 45/45 tests.
- `python3 -m py_compile project/api/browser_sandbox.py project/tests/test_fastapi_facade.py` passed.
- `git diff --check` passed.
- Targeted secret scan over changed files found no AWS keys, bearer tokens, private keys, or OpenAI-style secrets.

Remaining before PR:

- Open the worker PR for `feature/execution-v2-llm-manager`.
- Update Cortex after the project PR state is ready.

## Phase 45 Research Knowledge-Base PDF Upload And Extraction - 2026-06-21

Goal:
- Close final verification rows `C17`, `D13`, and `D14` with a real operator research document upload/extraction path.

Implemented:
- Added `POST /api/research/documents` in Node.
- Added FastAPI proxy `POST /api/research/documents` behind operator/admin RBAC with actor binding.
- Added local PDF/text extraction in `src/concierge/researchOps.mjs`.
- Added creation of an uploaded-document knowledge source, completed research run, `research_document_upload_extracted` event, and pending-review research artifact.
- Added dashboard file controls and a research upload proof card.
- Kept uploaded research artifacts out of trusted retrieval until the existing artifact review gate approves them.
- Hardened dashboard action rows so the trace panel cannot overlap operator controls during visual testing.

Safety:
- API and dashboard return hashes, safe preview, extraction metadata, and citation status only.
- Raw document bytes and raw extracted text are not returned; the dashboard may show the existing sanitized safe preview while citation status remains `extracted_pending_review`.
- Audit stores hashes/IDs and safety flags, not raw document bodies or identifiers.

Verification:
- `node --check src/concierge/researchOps.mjs && node --check src/server/server.mjs && node --check src/app/app.js`
- `python3 -m py_compile project/api/main.py project/tests/test_fastapi_facade.py`
- `node --test src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs` - 26 passed.
- `python3 -m unittest project.tests.test_fastapi_facade` - 53 passed, 2 expected skips.
- `npm run test:local` - 233 passed, 2 expected skips.
- `npm run build` - passed.
- `git diff --check` - passed.
- Visual dashboard proof passed with 0 console errors and 0 page errors: `artifacts/phase45/research-document-upload-browser-proof.png` and `artifacts/phase45/research-document-upload-browser-proof.json`.

## Corrective Product Memory Bedrock Phase - 2026-06-21

Goal:
- Follow the corrective product-memory directive: make Graphiti/Zep MVP-ready, fail-soft, Bedrock-backed, and HIPAA-boundary enable-able while keeping committed defaults disabled.

Implemented:
- Added `GRAPHITI_LLM_PROVIDER=bedrock` support in `tools/graphiti/graphiti_bridge.py`.
- Added Bedrock Runtime LLM and Titan embedding clients with env-selected model IDs and standard AWS credential resolution.
- Preserved the existing OpenAI Graphiti path for back-compat.
- Added `tools/graphiti/requirements-graphiti.txt` and Docker venv installation of Bedrock dependencies.
- Added `BRAINSTY_GRAPHITI_PYTHON` so runtime hosts can point at their own Graphiti venv.
- Added `BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED`; when unset and adapter is `graphiti`, status/recall/retain/replay/probe/suppress degrade without sending provider payloads.
- Added fail-soft product-memory boot probe logging.
- Hardened product-memory episode masking for generic email and phone identifiers before provider calls.
- Added `docs/PRODUCT_MEMORY_RUNBOOK.md` and ADR-003.

Safety:
- `BRAINSTY_PRODUCT_MEMORY_ADAPTER=disabled` remains the committed default.
- `GRAPHITI_STORE_RAW_EPISODES=0` remains the compose default.
- No AWS keys, hostnames, FalkorDB credentials, or account-specific Bedrock ARNs were committed.
- Cortex remains project memory only; product memory remains Graphiti/FalkorDB.

Verification:
- `python3 -m py_compile tools/graphiti/graphiti_bridge.py tools/graphiti/graphiti_bridge_bedrock_test.py` passed.
- `node --check src/concierge/productMemory.mjs && node --check src/server/server.mjs && node --check src/tests/product-memory-bedrock.test.mjs && node --check src/tests/product-memory-api.test.mjs` passed.
- `npm run test:memory:bedrock` passed with 5/5 tests.
- `node --test src/tests/product-memory-api.test.mjs` passed with 2/2 tests.
- `npm run test:docker:contract` passed with 45/45 tests.
- `python3 -m unittest project.tests.test_fastapi_facade` passed with 53 tests, 51 passed, 2 expected skips.
- `npm run build` passed.
- `npm run test:local` passed with 240 total, 238 passed, 2 expected live-gated OpenClaw skips.
- `git diff --check` passed.
- Targeted changed-file secret scan found no AWS keys, bearer tokens, private keys, or OpenAI-style secrets.

## Phase 46 Research Analytics And Budget Kill-Switch Controls - 2026-06-21

Goal:
- Close final verification rows `C26`, `C27`, and `D19`.

Implemented:
- Added `research_budget_policies` and `research_budget_events`.
- Added safe research analytics aggregation through `GET /api/research/analytics`.
- Added budget status/update endpoints through Node and FastAPI.
- Enforced the persisted budget policy before manual research run queueing, scheduled run queueing, and run execution.
- Added `/` dashboard Analytics/Budget buttons, persisted daily limit fields, kill-switch selector, and proof cards.
- Updated the final verification report so `C26`, `C27`, and `D19` are now `PASSING`.

Safety:
- Analytics is read-only and returns counts/distributions/recent metadata only.
- Budget controls persist policy and event proof but do not return raw prompts, raw artifact text, source-pointer payload dumps, credentials, secrets, or PHI.
- Kill-switch and limit blocks fail closed with `research_budget_blocked` audit proof.

Verification:
- `npm run test:local` passed with 239 passing tests and 2 expected live-gated OpenClaw skips.
- `npm run test:live` passed with the live OpenAI smoke plus research/UI slices.
- `npm run test:facade` passed with 53 tests and 2 expected skips.

## Phase 47 Expanded Review Queues - 2026-06-21

Goal:
- Close final verification row `C21`.

Implemented:
- Added `getResearchReviewQueues` in `src/concierge/researchOps.mjs`.
- Added Node and FastAPI operator/admin routes for `GET /api/research/review-queues`.
- Added a dashboard Review Queues button and proof card for pending artifacts, low-confidence/unsupported user answers, downvoted feedback, escalated handoffs, and user-answer review rows.
- Updated the final verification report so `C21` is now `PASSING`.

Safety:
- The queue is read-only and ref-only.
- It returns IDs, hashes, safe previews, counts, statuses, and audit refs, not raw artifact bodies, raw feedback comments, raw handoff reasons, credentials, secrets, source-pointer payload dumps, or PHI.

Verification:
- `node --check src/concierge/researchOps.mjs && node --check src/server/server.mjs && node --check src/app/app.js` passed.
- `python3 -m py_compile project/api/main.py project/tests/test_fastapi_facade.py` passed.
- `node --test src/tests/research-ops.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/final-system-verification-report.test.mjs` passed with 30/30 tests.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- `npm run build` passed.
- `npm run test:local` passed with 240 passing tests and 2 expected live-gated OpenClaw skips.
- Browser dashboard proof passed at `http://127.0.0.1:4218/?phase=phase-47-review-queues`: Review Queues rendered all five queue families, safety flags showed read-only/ref-only/raw-hidden behavior, and console error count was 0.
- Visual artifacts: `artifacts/phase47/research-review-queues-dashboard-proof.png` and `artifacts/phase47/research-review-queues-dashboard-proof.json`.

## Phase 48 Research Entity Extraction - 2026-06-21

Goal:
- Close final verification row `E5`.

Implemented:
- Added persisted `research_entities` rows with artifact/run/source binding, source pointer metadata, entity type/label, normalized value/hash, page number, character span offsets, confidence, and safe evidence preview.
- Added deterministic research entity extraction for money amounts, percentages, procedure codes, diagnosis codes, dates, payers, benefit terms, pharmacy/formulary terms, and network/provider terms.
- Wired automatic extraction into research artifact creation so fetched and uploaded research artifacts produce entity rows immediately.
- Added explicit re-extraction for existing artifacts through `POST /api/research/artifacts/{artifact_id}/entities/extract`.
- Added read API `GET /api/research/entities` through Node and FastAPI.
- Added dashboard controls for `Research Entities` plus per-artifact `Extract Entities`, with source/page/span/confidence proof.
- Updated the final verification report so `E5` is now `PASSING`.

Safety:
- Entity listing and extraction do not return raw artifact bodies or source-pointer payload dumps.
- Stored entity rows keep hashes and bounded redacted previews; page/span/confidence metadata is returned for verification.
- Explicit extraction writes audit/event proof without raw extracted text.

Verification:
- `node --check src/concierge/researchOps.mjs` passed.
- `node --check src/server/server.mjs` passed.
- `node --check src/app/app.js` passed.
- `python3 -m py_compile project/api/main.py project/tests/test_fastapi_facade.py` passed.
- `node --test src/tests/research-ops.test.mjs` passed with 14/14 tests.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 14/14 tests.
- `node --test src/tests/final-system-verification-report.test.mjs` passed with 2/2 tests before the final report count update and will be re-run after full Phase 48 verification.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- `node --test src/tests/final-system-verification-report.test.mjs` passed with 2/2 tests after the final report count update.
- `npm run build` passed.
- `npm run test:local` passed with 242 tests total, 240 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- Browser dashboard proof passed at `http://127.0.0.1:4218/?phase=phase-48-research-entity-extraction`: Research Entity Extraction rendered 8 real extracted entities from a non-PHI seeded artifact, including source pointer, page 2, character spans, confidence, safe evidence previews, and 0 console errors.
- Visual artifacts: `artifacts/phase48/research-entity-extraction-dashboard-proof.png` and `artifacts/phase48/research-entity-extraction-dashboard-proof.json`.
- Added-line and Phase 48 artifact secret scans found no AWS keys, OpenAI keys, bearer tokens, private keys, direct identifiers, or credential material.

## Phase 49 Cost Comparison Journey - 2026-06-21

Goal:
- Close final verification row `A9`.

Implemented:
- Added a source-pointer-grounded `cost_comparison` AI2UI block to the `brainstyworkers.ai2ui.blocks.v1` contract.
- The block builds comparison rows only from stored source pointers, coverage balances, claim share rows, uploaded-document fields, or trusted reviewed research snippets that contain cost/comparison signals.
- The block carries explicit assumptions, tradeoffs, source pointer ids, and safety flags proving no fabricated exact prices and no external actions.
- Missing-evidence cost/comparison prompts fail closed with `blocked_missing_source_pointers` and no comparison rows.
- `/mvp` now renders the block in Chat, Split, Guided, and Bento modes with a compact comparison grid.
- Updated the final verification report so `A9` is now `PASSING`.

Safety:
- Every comparison row must include at least one source pointer id.
- The UI labels the rows as cited cost signals, not guaranteed future prices.
- The missing-evidence state tells the user to provide cited plan, claim/EOB, portal accumulator, provider estimate, or reviewed research evidence instead of inventing exact prices.

Verification:
- `node --check src/concierge/ai2uiBlocks.mjs && node --check src/app/mvp.js && node --check src/server/build-check.mjs` passed.
- `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/langgraph-runner.test.mjs src/tests/final-system-verification-report.test.mjs` passed with 33/33 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- `npm run test:local` passed with 244 tests total, 242 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- Browser `/mvp` proof passed at `http://127.0.0.1:4218/mvp?phase=phase-49-cost-comparison-journey`: after seeding non-PHI reviewed research artifacts through the real research pipeline, deterministic local chat rendered 9 typed blocks including `Cost Comparison`, 2 source-backed comparison rows, source pointer count 2, `captured_trusted_research_evidence`, no busy state, and 0 console errors.
- Visual artifacts: `artifacts/phase49/cost-comparison-mvp-proof.png` and `artifacts/phase49/cost-comparison-mvp-proof.json`.

## Phase 50 Pharmacy Formulary Journey - 2026-06-21

Goal:
- Close final verification row `A11`.

Implemented:
- Added a source-pointer-grounded `pharmacy_formulary` AI2UI block to the `brainstyworkers.ai2ui.blocks.v1` contract.
- The block builds rows only from stored source pointers whose evidence carries pharmacy/formulary signals such as covered/non-formulary status, drug tier, prior authorization, quantity limit, step therapy, specialty pharmacy, or mail-order evidence.
- Missing-evidence prescription/formulary prompts fail closed with `blocked_missing_source_pointers` and no formulary rows.
- `/mvp` now renders the block in Chat, Split, Guided, and Bento modes with a compact pharmacy/formulary grid.
- Updated the final verification report so `A11` is now `PASSING`.

Safety:
- Every pharmacy/formulary row must include at least one source pointer id.
- The UI labels the card as evidence navigation, not medication advice.
- The block explicitly forbids clinical substitution advice and external actions.
- Missing evidence asks for cited formulary/drug-list, plan pharmacy-benefit, trusted reviewed research, approved portal, or uploaded document evidence instead of inventing coverage facts.

Verification:
- `node --check src/concierge/ai2uiBlocks.mjs && node --check src/app/mvp.js && node --check src/server/build-check.mjs` passed.
- `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/langgraph-runner.test.mjs src/tests/final-system-verification-report.test.mjs` passed with 36/36 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- `npm run test:local` passed with 247 tests total, 245 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- In-app browser `/mvp` proof passed at `http://127.0.0.1:4218/mvp?phase=phase-50-pharmacy-formulary-journey`: after seeding a non-PHI reviewed formulary artifact through the real research pipeline, deterministic local chat rendered the `Pharmacy Formulary` AI2UI block with 1 source-backed Ozempic row, source pointer count 1, `captured_trusted_research_evidence`, all Chat/Split/Guided/Bento modes preserved the card, no busy state, and 0 console errors.
- Visual artifacts: `artifacts/phase50/pharmacy-formulary-mvp-proof.png` and `artifacts/phase50/pharmacy-formulary-mvp-proof.json`.

## Phase 51 Procedure Prep Checklist Journey - 2026-06-21

Goal:
- Close final verification row `A12`.

Implemented:
- Added a source-pointer-grounded `procedure_checklist` AI2UI block to the `brainstyworkers.ai2ui.blocks.v1` contract.
- The block builds checklist rows only from stored source pointers whose evidence carries procedure/admin-prep signals such as authorization, referral, order, document/ID, arrival/check-in/registration, transportation/support, cost/benefit confirmation, or clinical-instruction pointers.
- Missing-evidence procedure/admin-checklist prompts fail closed with `blocked_missing_source_pointers` and no checklist rows.
- `/mvp` now renders the block in Chat, Split, Guided, and Bento modes with a compact procedure checklist grid.
- Added `procedure_admin_checklist` as a structured journey intent that maps through the safe existing eligibility/trusted-research workflow spine.
- Updated the final verification report so `A12` is now `PASSING`.

Safety:
- Every procedure checklist row must include at least one source pointer id.
- The UI labels the card as administrative preparation support, not medical advice.
- Clinical prep, fasting, medication, or testing signals are shown only as cited instruction pointers and tell the user to confirm clinical questions with the care team.
- The block explicitly forbids clinical-instruction creation and external actions.
- Missing evidence asks for cited procedure/facility instructions, authorization/referral evidence, an uploaded pre-procedure document, or approved portal/reviewed research source pointers instead of inventing preparation steps.

Verification:
- `node --check src/concierge/ai2uiBlocks.mjs && node --check src/app/mvp.js && node --check src/server/build-check.mjs` passed.
- `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/intelligence-contracts.test.mjs src/tests/langgraph-runner.test.mjs src/tests/final-system-verification-report.test.mjs` passed with 41/41 tests.
- `npm run build` passed.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- `npm run test:local` passed with 250 tests total, 248 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- In-app browser `/mvp` proof passed at `http://127.0.0.1:4218/mvp?phase=phase-51-procedure-prep-checklist-journey`: after seeding a non-PHI reviewed procedure-prep artifact through the real research pipeline, deterministic local chat rendered the `Procedure Checklist` AI2UI block with 2 source-backed rows, source pointer count 1, `captured_trusted_research_evidence`, all Chat/Split/Guided/Bento modes preserved the card, no busy state, and 0 console errors.
- Visual artifacts: `artifacts/phase51/procedure-checklist-mvp-proof.png` and `artifacts/phase51/procedure-checklist-mvp-proof.json`.

## Phase 52 Provider Network Cards Journey - 2026-06-22

Goal:
- Close final verification row `A13`.

Implemented:
- Added a source-pointer-grounded `provider_network` AI2UI block to the `brainstyworkers.ai2ui.blocks.v1` contract.
- The block builds provider/facility rows only from stored source pointers whose evidence carries network signals such as in-network, out-of-network, participating, provider directory, NPI, facility type, accepting new patients, referral, authorization, or location evidence.
- Missing-evidence provider/network prompts fail closed with `blocked_missing_source_pointers` and no provider/facility rows.
- `/mvp` now renders the block in Chat, Split, Guided, and Bento modes with compact provider/facility option cards.
- Updated the final verification report so `A13` is now `PASSING`, leaving only externally gated rows `F2` and `F3`.

Safety:
- Every provider/facility row must include at least one source pointer id.
- The UI labels the card as evidence navigation, not a live network guarantee.
- The block explicitly forbids provider contact, scheduling actions, and external actions.
- Missing evidence asks for a cited provider directory, member plan/network context, uploaded referral/provider/facility document, or approved portal/reviewed research source pointer instead of inventing network status.

Verification:
- Focused syntax checks passed for `src/concierge/ai2uiBlocks.mjs`, `src/app/mvp.js`, and `src/server/build-check.mjs`.
- Focused tests passed: `node --test src/tests/ai2ui-blocks.test.mjs src/tests/chat-ui-contract.test.mjs src/tests/intelligence-contracts.test.mjs src/tests/langgraph-runner.test.mjs src/tests/final-system-verification-report.test.mjs` reported 44/44 passing.
- `npm run build` passed.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- `npm run test:local` passed with 253 tests total, 251 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- In-app browser `/mvp` proof passed at `http://127.0.0.1:4218/mvp?phase=phase-52-provider-network-cards`: after seeding a non-PHI reviewed provider-network artifact through the real research pipeline in an isolated Phase 52 SQLite profile, deterministic local chat rendered the `Provider Network` AI2UI block with 1 source-backed Midtown Imaging Center row, source pointer count 1, `captured_trusted_research_evidence`, all Chat/Split/Guided/Bento modes preserved the card, no busy state, and 0 console errors.
- Visual artifacts: `artifacts/phase52/provider-network-mvp-proof.png` and `artifacts/phase52/provider-network-mvp-proof.json`.

## Phase 53 Intelligence Default Inversion - 2026-06-21

Goal:
- Start the orchestration-intelligence migration with corrected numbering: migration Phase 47 is implemented as repo Phase 53; the remaining migration phases become Phase 54 and Phase 55.

Implemented:
- Added `src/concierge/modelTierPolicy.mjs` as the centralized ChatOpenAI boundary with classifier, reasoner, planner, and edge-SLM interface tiers.
- Made `structuredIntentNode` live-first when configured and safety-allowed; deterministic structured reasoning remains the fallback and is stamped as `reasoning_source: curated_fallback`.
- Added `reasoning_source: llm` for valid live structured-intent reasoning and routed it through the existing journey-to-workflow schema.
- Made live orchestration decisioning default-on unless `useLiveModel === false`, while urgent handoff and policy refusal still skip external model decisioning deterministically.
- Added `confidenceBand()` and explicit `low_confidence_clarify` route labeling for valid but weak LLM decisions.
- Routed sourced-answer composition, the deprecated `maybeModelNode`, and the PEMS live evaluator through the shared tier policy.
- Updated Node and FastAPI public defaults so omitted live-model flags allow live intelligence; explicit false remains the deterministic-only path.

Safety:
- Safety-invariant suites were not modified.
- Emergency, policy refusal, credential-entry, medical-advice, and approval boundaries remain deterministic hard stops.
- No source-pointer validation or PHI masking rails were loosened.
- The edge-SLM tier is an explicit not-implemented contract, not a silent fallback.

Verification:
- Focused Phase 53 tests passed: `node --test src/tests/model-tier-policy.test.mjs src/tests/intelligence-default.test.mjs src/tests/llm-orchestration-decision.test.mjs` reported 12/12 passing.
- `npm run build` passed.
- `npm run test:journeys` passed with 14/14 tests.
- `npm run test:phi` passed with 1/1 tests.
- `npm run test:egress` passed with 4/4 tests.
- `npm run test:graph:topology` passed with 2/2 tests.
- `npm run test:execution:v2` passed with 11/11 tests.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- Safety-invariant batch passed: `policy`, `model-payload-policy`, `prompt-contracts`, `output-policy`, `approval-resume`, and `openclaw-worker-contract` reported 23/23 tests passing.
- `npm run test:local` passed with 261 tests total, 259 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4219/api/chat` with omitted `useLiveModel`, non-PHI provider-network input, `useLive=true`, `structuredReasoningSource=llm`, `llmDecisionMode=openai_chatopenai_invoked`, and route reason `llm_orchestration_decision`.
- In-app browser `/mvp` proof passed at `http://127.0.0.1:4219/mvp?phase=phase-53-intelligence-default`: Live GPT decisioning was checked by default, the MVP loaded with no visible errors, and browser console error count was 0.
- Visual/API artifacts: `artifacts/phase53/intelligence-default-api-proof.json`, `artifacts/phase53/intelligence-default-mvp-proof.png`, and `artifacts/phase53/intelligence-default-mvp-proof.json`.

## Phase 54 Graceful Degradation And Tiered Offer - 2026-06-22

Goal:
- Implement corrected migration Phase 48 as repo Phase 54: missing evidence should no longer dead-end an otherwise safe healthcare/insurance journey.

Implemented:
- Added `src/concierge/gracefulDegradation.mjs` as the best-effort answer composer for evidence-insufficient states.
- Evidence-insufficiency states now route through `source pointers + structured facts + advisory memory -> best-effort composer -> strict sourced-answer validator -> deterministic output policy -> final_response`.
- Deterministic safety refusals remain hard stops; only missing or untrusted evidence becomes `workflow_outcome: best_effort_degraded`.
- Added `degraded_answer` to the LangGraph state schema so API and UI consumers can render the tiered offer.
- Added `degraded_answer_with_options` to the AI2UI block contract and `/mvp` renderer.
- The tiered offer presents three bounded user choices when possible: verify myself, let concierge check with approval, or provide more information.
- Shared sandbox privacy copy now appears in prompt safety rules and the degraded AI2UI block: user login/2FA remains human-only and isolated.
- Public chat/runtime-collapse tests now assert the API returns best-effort degradation instead of the old trusted-citation terminal blocker.

Safety:
- No confident coverage, cost, claim, provider, pharmacy, or document factual claim is allowed without a source pointer.
- Unsupported degraded claims are explicitly marked `unsupported: true` and shown as unverified.
- The `let_concierge_check` option is shown only when a registry-routed OpenClaw proposal exists and still requires approval.
- Credential entry, medical advice, external/write actions, prompt injection, and urgent handoff remain deterministic hard stops.

Verification:
- Focused Phase 54 suite passed: `node --test src/tests/graceful-degradation.test.mjs src/tests/ai2ui-blocks.test.mjs src/tests/langgraph-runner.test.mjs src/tests/prompt-contracts.test.mjs` reported 32/32 tests passing.
- `npm run build` passed.
- `npm run test:journeys` passed with 18/18 tests.
- `npm run test:phi` passed with 1/1 tests.
- `npm run test:egress` passed with 4/4 tests.
- `npm run test:graph:topology` passed with 2/2 tests.
- `npm run test:execution:v2` passed with 11/11 tests.
- Safety-invariant batch passed: `policy`, `model-payload-policy`, `prompt-contracts`, `output-policy`, `approval-resume`, `openclaw-worker-contract`, and `graceful-degradation` reported 27/27 tests passing.
- `npm run test:facade` passed with 53 tests and 2 expected skips.
- `npm run test:db:safety` passed with 15/15 tests.
- `npm run test:retention` passed with 1/1 tests.
- `npm run test:openclaw:skills` passed with 11/11 tests.
- `npm run test:local` passed with 265 tests total, 263 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4220/api/chat` with `workflowOutcome=best_effort_degraded`, `blocked_no_trusted_research_evidence`, no source pointers, `degraded_answer_with_options`, all three user options, privacy copy present, no confident uncited claims, no external actions, and no medical advice.
- In-app browser `/mvp` proof passed at `http://127.0.0.1:4220/mvp?phase=phase-54-graceful-degradation`: deterministic local chat rendered the `Best Effort Options` card, all three option rows, pending approval-gated concierge check, unverified evidence text, isolated-sandbox privacy copy, and 0 console errors.
- Visual/API artifacts: `artifacts/phase54/graceful-degradation-api-proof.json`, `artifacts/phase54/graceful-degradation-mvp-proof.png`, and `artifacts/phase54/graceful-degradation-mvp-proof.json`.

## Phase 55 Native LangGraph HITL And Runtime Collapse - 2026-06-22

Goal:
- Implement corrected migration Phase 49 as repo Phase 55: make human-in-the-loop approval a native LangGraph interrupt/resume path, add a durable checkpointer option, remove the deprecated `maybe_model` side node, and delete the old `engine.mjs` dual pipeline.

Implemented:
- Added `src/concierge/graphCheckpointer.mjs` with an in-memory default and a local file-backed `MemorySaver` for durable checkpoint proof.
- Added a real `plan_journey` node between workflow routing and skill resolution; `journey_plan` now records workflow, steps, missing evidence, graceful degradation behavior, and HITL requirements.
- Added `approval_pause` as a native LangGraph `interrupt()` node. Missing/invalid approval tokens pause the graph, and valid tokens resume with `Command({ resume, update })`.
- Kept the approval token as the authorization of record: resume control flows back through `consumeReadOnlyObservationApproval`, preserving single-use, expiry, binding, and fail-closed behavior.
- Removed `maybeModelNode` and the `compose_response -> maybe_model -> END` edge; answer composition now terminates at `compose_response -> END`.
- Deleted `src/concierge/engine.mjs`; server trace reads now use `src/concierge/traceSession.mjs`, and legacy tests use `src/concierge/langgraphCompatibility.mjs`, which delegates through LangGraph and the approval contract.
- Updated live OpenAI proof to assert the surviving observed LLM orchestration path instead of the retired side node.

Safety:
- Safety-invariant suites were not modified or loosened.
- Emergency handoff, credential entry, medical advice, prompt injection, external/write actions, and payer contact remain deterministic hard stops.
- User/browser worker actions still require explicit approval; the interrupt is a pause/resume mechanism, not authorization.
- Compatibility fixture evidence now creates an explicit read-only approval before replaying through LangGraph.

Verification:
- Focused Phase 55 suite passed: `node --test src/tests/graph-topology.test.mjs src/tests/graph-interrupt-resume.test.mjs src/tests/langgraph-runner.test.mjs src/tests/approval-resume.test.mjs` reported 23/23 passing.
- `npm run build` passed.
- `npm run test:graph:topology` passed with 4/4 tests.
- `npm run test:local` passed with 267 tests total, 265 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed and is saved at `artifacts/phase55/native-hitl-api-proof.json`: proposal -> native approval interrupt -> checkpoint pending `approval_pause` -> approval token -> `Command.resume` -> captured visible-page source pointers.
- In-app browser `/mvp` proof passed at `http://127.0.0.1:4221/mvp?phase=phase-55-native-hitl`: session start worked, FastAPI facade on port 8001 was reachable and connected to Node 4221, OpenClaw and run-state panels rendered, and browser console error count was 0.
- Visual artifacts: `artifacts/phase55/native-hitl-mvp-proof.png`, `artifacts/phase55/native-hitl-mvp-proof.json`, `artifacts/phase55/native-hitl-mvp-facade-connected-proof.png`, and `artifacts/phase55/native-hitl-mvp-facade-connected-proof.json`.

## Phase 56 P0 Production Hardening - 2026-06-22

Goal:
- Implement the next migration wave's P0 hardening slice as repo Phase 56: make durable graph checkpoints encrypted at rest, keep outbound payload enforcement default-on, prove retention sweeper execution through an API/dashboard gate, and continue removing hand-escaped SQL from active runtime modules.

Implemented:
- Upgraded `src/concierge/graphCheckpointer.mjs` so file-backed LangGraph checkpoints require `BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY` and persist AES-256-GCM encrypted checkpoint/writes payloads. Legacy plaintext checkpoint files remain readable for migration, but new writes are encrypted.
- Added `src/concierge/retentionScheduler.mjs`, a disabled-by-default retention sweeper daemon with explicit tick/status APIs, runtime events, and audit proof.
- Added `/api/retention/sweeper/status` and `/api/retention/sweeper/tick`.
- Added a `phase56_p0_hardening` connector proof goal, check, score, and operator-dashboard card showing checkpointer encryption, retention tick state, egress default, and local DB driver proof.
- Changed low-level outbound payload observation defaults from observe-only to enforced while preserving explicit observe-only override for diagnostic tests.
- Parameterized remaining active runtime query paths in human handoffs, document candidate approval, dynamic skill mounted queries, runtime events, operator proposals, and workflow architecture seeding/lookups.
- Added cache-busting for the operator dashboard module so phase proof panels refresh after implementation.

Safety:
- Safety-invariant suites were not loosened.
- The retention daemon does not run hidden work unless enabled or explicitly ticked; every tick writes runtime and audit proof.
- The graph interrupt remains control flow only; approval token authority remains unchanged.
- File-backed graph checkpoint mode fails closed without a private encryption key.
- Browser, payer-contact, credential, captcha/2FA, external write, and medical-advice boundaries are unchanged.

Verification:
- `npm run test:graph:topology` passed with 4/4 tests.
- `npm run test:retention` passed with 2/2 tests.
- `npm run test:egress` passed with 4/4 tests.
- `npm run test:db:safety` passed with 15/15 tests.
- `node --test src/tests/outbound-payload-observability.test.mjs` passed with 1/1 test.
- `node --test src/tests/chat-ui-contract.test.mjs` passed with 14/14 tests.
- `npm run build` passed and reports the Phase 56 P0 hardening contract.
- `npm run test:local` passed with 268 tests total, 266 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed after `POST /api/retention/sweeper/tick`: `phase56_p0_hardening` scored `100 / 100`, retention `tick_completed`, encrypted checkpoint required/configured, egress `enforced`, DB `node:sqlite`, and sqlite shell-out absent.
- In-app browser dashboard proof passed at `http://127.0.0.1:4222/?phase=phase-56-p0-hardening&v=2`: Phase 56 P0 Hardening card rendered `100 / 100`, `encrypted-at-rest configured`, `tick_completed`, `enforced by default`, `node:sqlite`, and browser console error count was 0.
- Artifacts: `artifacts/phase56/phase56-p0-hardening-proof.json`, `artifacts/phase56/retention-sweeper-tick-proof.json`, `artifacts/phase56/phase56-dashboard-hardening-card.png`, and `artifacts/phase56/phase56-dashboard-hardening-card.json`.

## Phase 57 Extensible Skills And Worker Breadth - 2026-06-22

Goal:
- Implement the next migration wave's extensible-skill slice as repo Phase 57. This maps to the packet's Phase 51 because repo Phase 56 already completed the packet's Phase 50/P0 hardening target.

Implemented:
- Made `validateOpenClawSkillArtifact` generic across skill artifacts instead of requiring the `insurance_portal_browser` literal. The insurance portal artifact still receives deeper domain-contract checks when that skill is loaded.
- Added generic blocked-capability detection for skill-declared credentials/auth secrets, write/submit/send/pay actions, external messaging, non-local OCR, and page-text-as-instructions patterns.
- Added `openclaw/skills/insurance-portal-browser/skill-server.json` so the portal browser advertises itself as an `execution_specific` skill through the same dynamic skill metadata path as other skills.
- Removed the dynamic selector's hardcoded execution fallback and removed the worker-policy browser-like fallback. Missing execution skills now fail closed instead of silently selecting a default browser skill.
- Hardened executor selection so a missing skill returns `skill_missing` rather than choosing a planner or crashing.
- Added `src/concierge/workerMemory.mjs` plus `worker_procedural_memory` storage for masked, source-pointered procedure traces that feed PEMS candidates while keeping `cortexProductMemory=false` and `productionDrivingAllowed=false`.
- Added a `phase57_extensible_skills_worker_breadth` connector proof goal/check/score and operator dashboard card.

Safety:
- Safety-invariant suites were not loosened.
- `workerMayChooseWorkflow=false` remains enforced and OpenClaw remains bounded by LangGraph-assigned tasks.
- No write, payer-contact, external messaging, credential, passkey/2FA/captcha, form submission, or medical-advice authority was added.
- Worker procedural memory is advisory only and does not drive answers.

Verification:
- `npm run test:openclaw:skills` passed with 14/14 tests.
- Focused Phase 57 suite passed: `node --test src/tests/dynamic-skill-server.test.mjs src/tests/openclaw-worker-contract.test.mjs src/tests/worker-memory.test.mjs` reported 13/13 tests passing.
- `npm run build` passed and reports the Phase 57 extensible skills and worker memory contract.
- `npm run test:local` passed with 272 tests total, 270 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4223/api/proof/runs/local`: `phase57_extensible_skills_worker_breadth` scored `100 / 100`, loaded 3 required skills, selected `insurance_portal_browser` through dynamic scoring, kept fallback literals unused, and reported `worker_procedural_memory_contract_ready`.
- Dashboard visual proof passed at `http://127.0.0.1:4223/?phase=phase-57-extensible-skills`: Chrome DevTools Protocol scrolled to the connector proof panel and asserted the Phase 57 card text for `100 / 100`, `insurance_portal_browser`, `fallback literal not used`, `LangGraph owns workflow`, `writes blocked`, and `answer-driving disabled`.
- Artifacts: `artifacts/phase57/phase57-extensible-skills-proof.json`, `artifacts/phase57/phase57-dashboard-extensible-skills-card.png`, and `artifacts/phase57/phase57-dashboard-extensible-skills-card.json`.

## Phase 58 Trusted Answer Driving - 2026-06-22

Goal:
- Implement the next migration wave's continuous-learning slice as repo Phase 58. This maps to the packet's Phase 52 because repo Phases 56 and 57 already completed packet Phases 50 and 51.

Implemented:
- Added `src/concierge/trustedAnswerDriving.mjs` as the only trusted answer-driving helper. It reconstructs answers from reviewer-approved PEMS candidates, structured facts, allowed source pointer IDs, and advisory memory fragments.
- Added `pems_trusted_answer_driving_controls` with a global kill switch. The kill switch demotes active production-driving candidates and keeps the gate fail-closed until cleared.
- Updated PEMS promotion evaluation so `productionDrivingAllowed=true` can appear only when maturity, reviewer approvals, validator pass, citation pass, source evidence, no safety veto, and kill switch clear all pass.
- Preserved the old supervised advisory readiness proof for non-driving candidates and added a distinct Phase 58 trusted answer-driving proof at 100/100.
- Added Graphiti-style memory namespaces: semantic plan, hashed episodic member, user-agnostic procedural skills, and collective patterns. Product memory episodes now carry these namespaces without putting raw member IDs in procedural memory.
- Added candidate-only seed helpers for resolved cases and nightly research changes. Both stay non-driving until reviewer approval promotes them through the trusted gate.
- Added dashboard/API visibility through `phase58_trusted_answer_driving`.

Safety:
- Safety-invariant suites were not loosened.
- Safety refusals, emergency handoff, credential entry, medical advice, prompt injection, payer contact, external writes, and browser takeover boundaries remain deterministic hard stops.
- Unsupported claims are explicitly labeled and source-less; every supported factual claim must cite an allowed source pointer ID.
- The kill switch and safety incident paths demote trusted answer-driving to non-driving.
- Procedural memory must be user-agnostic; user/member/session/email identifiers are rejected.

Verification:
- Focused Phase 58 suite passed: `node --test src/tests/pems-promotion-gates.test.mjs src/tests/pems-trusted-answer-driving.test.mjs src/tests/product-memory-contract.test.mjs` reported 11/11 passing.
- `npm run build` passed and reports the Phase 58 trusted answer-driving contract.
- `npm run test:local` passed with 276 tests total, 274 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4224/api/proof/runs/local`: `phase58_trusted_answer_driving` scored `100 / 100`, promotion was `trusted_answer_driving`, citation rails passed, unsupported items were labeled, kill switch demoted, safety incident demoted, memory namespaces passed, and candidate generation stayed non-driving.
- Dashboard visual proof passed at `http://127.0.0.1:4224/?phase=phase-58-trusted-answer-driving`: bundled Playwright captured the rendered Phase 58 card with `100 / 100`, `production-driving trusted path only`, `validated cited answer`, `unsupported items labeled`, `kill switch demotes`, `safety incident demotes`, and `procedural:skills`.
- Artifacts: `artifacts/phase58/phase58-trusted-answer-driving-proof.json`, `artifacts/phase58/phase58-dashboard-trusted-answer-driving-card.png`, and `artifacts/phase58/phase58-dashboard-trusted-answer-driving-card.json`.

## Phase 59 Pilot Readiness - 2026-06-22

Goal:
- Package the less-deterministic MVP into a pilot-readiness proof: PWA uses live reasoning by default, FastAPI/Node endpoint coverage is visible, OpenClaw is bounded and ready, DB/safety gates pass, AWS communication is tested without secrets, and Graphiti/FalkorDB status is explicit.

Implemented:
- Updated the Next mobile PWA task creation to request `use_live_model: true` and `phi_allowed_identifier_masked_reasoning` by default while still relying on deterministic fallback when the key/runtime is unavailable.
- Fixed the v1 task continuation path by forwarding member context from the PWA and Phase 59 smoke so Node resolves the same user/session created by `/api/v1/sessions`.
- Added `scripts/phase59-pilot-readiness-smoke.mjs` plus `npm run phase59:pilot-readiness`.
- Added the `phase59_pilot_readiness` connector proof goal/check/score and a dashboard Phase 59 card.
- Added focused Phase 59 contract coverage to `npm run test:local`.

Safety:
- No payer portal was used; the smoke target is `https://example.com`.
- AWS identity proof is sanitized to hashes only; no account id, ARN, access key, token, host, IP, or secret is stored in the artifact.
- No write, payer-contact, credential, passkey/2FA/captcha, form submission, or medical-advice authority was added.
- Graphiti direct-identifier blocks were preserved; the live Graphiti product-memory path is not overclaimed.

Verification:
- `npm run phase59:pilot-readiness` passed and wrote `artifacts/phase59/phase59-pilot-readiness-proof.json`. The final task reached `approval_pending` with `taskHasAnswer=true`, all 79 FastAPI endpoints were OpenAPI-covered, Node/DB/PWA were live, AWS `phase30` STS was reachable with sanitized hashes, and OpenAI live reasoning was requested.
- `npm run test:live`, `npm run test:llm:intent`, `npm run test:llm:composition`, and `npm run test:llm:journeys` all passed against the configured live OpenAI path.
- `npm run test:openclaw:skills` passed with 14/14 tests.
- `npm run test:facade` passed with 53 tests, 51 passing and 2 expected skips.
- `npm run test:db:safety`, `npm run test:phi`, and `npm run test:egress` passed.
- `npm run build` passed and reports the Phase 59 proof script.
- `npm run test:local` passed with 279 tests total, 277 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- Visual proof passed with bundled Playwright screenshots: `artifacts/phase59/phase59-dashboard.png` and `artifacts/phase59/phase59-mobile-pwa.png`.

Remaining:
- FalkorDB is running on Docker/Colima, but `npm run test:memory:graphiti` is not green. The current live Graphiti product-memory path remains degraded/not production-ready because one graph-run retain path is disabled when no sourced memory should be retained, and one uploaded-document memory path is correctly blocked by direct-identifier policy. This needs a dedicated product-memory safety/masking slice before Graphiti can be marked fully on.

## Phase 60 Memory Skill Tree And Graphiti Consolidation Loop - 2026-06-22

Goal:
- Turn product memory into a mature advisory learning/consolidation layer while keeping deterministic DB state authoritative for users, sessions, tasks, approvals, audit, source pointers, and runtime control.
- Use Graphiti/Zep memory when the demand is new, the plan/journey is non-standard, or the skill pool has a gap, then bind the result to a RALPH-style procedure loop and reviewer-gated skill candidate.

Implemented:
- Added `src/concierge/memorySkillTree.mjs`.
- Added a memory skill-tree selector that combines DB authority, Graphiti advisory facts, dynamic skill matches, source pointers, procedure loop tools/extractors/verifiers/sensors/controllers, and consolidation readiness.
- Added a RALPH-style loop contract:
  - requirements/current-state evaluation,
  - target planning,
  - implementation,
  - testing,
  - dashboard/MVP/visual-OCR sensor proof,
  - separated goal evaluation score,
  - pass/fail restart or reviewer-promotion decision.
- Added reviewer-gated consolidation candidate generation. A mature pattern can propose a `skill-server.json` draft, but `worktreeWriteAllowed=false` and `productionDrivingAllowed=false` unless existing human-review and trusted-answer gates approve it.
- Added `memory_skill_tree` to LangGraph state and included bounded memory skill-tree guidance in the LLM orchestration decision payload.
- Added connector proof/dashboard visibility through `phase60_memory_skill_tree`.
- Fixed the Phase 59 Graphiti carry-forward blocker without loosening policy:
  - enabled Graphiti graph runs with no sourced memory now report `skipped_no_sourced_memory` rather than looking disabled;
  - outbound payload observability recognizes `uploaded_document_extractions/...` as source pointers;
  - hashed `episodic:member:<hash>` Graphiti namespaces no longer trigger direct-identifier blocking;
  - real member/subscriber identifiers remain blocked.
- Updated `npm run test:memory:graphiti` to run the synthetic live memory gate with explicit `BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED=1` while committed runtime defaults remain disabled/fail-soft.

Safety:
- DB remains the source of truth; Graphiti cannot override sessions, users, approvals, tasks, or audit.
- No raw PHI, raw OCR/frame text, raw portal text, credentials, payer contact, external writes, form submission, or medical advice authority was added.
- Generated skills are candidates only until reviewer approval and PR promotion.
- The memory skill-tree can advise orchestration and skill selection, but production answer driving remains restricted to the existing Phase 58 trusted path.

Literature alignment:
- Reflexion: episodic feedback improves later trials.
- Generative Agents: memory streams can be reflected into plans.
- Voyager: repeated verified behaviors can become a skill library.
- CoALA: memory layers and action spaces should stay modular.

Verification:
- Focused Phase 60 suite passed: `node --test src/tests/memory-skill-tree.test.mjs` reported 5/5 passing.
- Focused product-memory/policy suite passed: `node --test src/tests/outbound-payload-observability.test.mjs src/tests/product-memory-contract.test.mjs src/tests/memory-skill-tree.test.mjs` reported 12/12 passing.
- `npm run test:memory:graphiti` passed with real Graphiti/FalkorDB: 2/2 passing.
- `npm run build` passed and reports the Phase 60 memory skill-tree contract.
- `npm run test:local` passed with 284 tests total, 282 passing, 2 expected live-gated OpenClaw skips, and 0 failures.

## Phase 61 Generated Skill PR Workflow - 2026-06-22

Goal:
- Finish the next planned memory-learning step after Phase 60: mature Graphiti/Zep consolidation candidates should become concrete generated skill PR packages only after reviewer, validator, citation, source-pointer, and safety gates pass.

Implemented:
- Added `src/concierge/generatedSkillPrWorkflow.mjs`.
- Added `evaluateGeneratedSkillPrGate`, requiring:
  - two human reviewer approvals,
  - validator pass,
  - citation pass,
  - source pointer presence,
  - no safety veto,
  - raw PHI blocked,
  - production-driving blocked.
- Added generated skill package construction for `openclaw/skills/<skill>/skill-server.json`, `SKILL.md`, and `README.md` with content hashes.
- Validated generated packages through the existing OpenClaw skill artifact validator.
- Validated generated procedural content through the existing user-agnostic procedural-memory guard.
- Added PR metadata: branch name, base branch, title, body sections, reviewer requirement, and auto-merge disabled.
- Kept proof mode side-effect-free: no generated skill files are written, no Git branch is created, no PR is opened, and no auto-merge or production-driving authority is added.
- Added `npm run test:generated-skills`.
- Added `/api/continuous-intelligence/pems/generated-skill-pr`.
- Added connector proof/dashboard visibility through `phase61_generated_skill_pr_workflow`.

Safety:
- DB remains authoritative; Graphiti/Zep cannot write session, user, approval, audit, or task truth.
- Generated skills are PR packages only and do not become active production skills automatically.
- Worktree write permission is true only when the PR gate passes and an explicit reviewer worktree-write approval is present.
- Production-driving, credential entry, external writes, payer contact, form submission, auto-merge, raw PHI, raw OCR/frame text, and medical advice remain blocked.

Verification:
- Focused Phase 61 suite passed: `npm run test:generated-skills` reported 4/4 passing.
- Focused safety-adjacent suite passed: `node --test src/tests/memory-skill-tree.test.mjs src/tests/openclaw-skill-artifacts.test.mjs src/tests/pems-trusted-answer-driving.test.mjs src/tests/generated-skill-pr-workflow.test.mjs` reported 16/16 passing.
- `npm run build` passed and reports the Phase 61 generated-skill PR workflow contract.
- `npm run test:local` passed with 289 tests total, 287 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4226/api/proof/runs/local`: `phase61_generated_skill_pr_workflow` scored `100 / 100`, gate status was `generated_skill_pr_gate_passed`, package validation was valid, auto-merge was blocked, and production-driving was blocked.
- Dashboard visual proof passed at `http://127.0.0.1:4226/?phase=phase-61-generated-skill-pr-workflow`: the Phase 61 card rendered `100 / 100`, reviewers `2/2`, package `files 3`, artifact valid, generated branch name, auto-merge blocked, no files written, reviewer-approved worktree write, production-driving blocked, and raw PHI hidden. Console errors: 0.
- Artifacts: `artifacts/phase61/phase61-dashboard-generated-skill-pr.png` and `artifacts/phase61/phase61-generated-skill-pr-proof.json`.

## Phase 62 Generated Skill Reviewer Queue - 2026-06-22

Goal:
- Make Phase 61's generated skill package durable and operator-reviewable before any worktree mutation or PR executor can run.

Implemented:
- Added `generated_skill_review_queue` to the deterministic DB schema and migration path.
- Added `src/concierge/generatedSkillReviewQueue.mjs`.
- Added durable enqueue/list/review helpers for generated skill package proposals.
- Added supported decisions: `approved`, `rejected`, `blocked`, and `needs_more_evidence`.
- Added a bounded executor-plan builder that prepares branch/PR commands only after reviewer approval and a separate explicit executor approval.
- Added `src/tests/generated-skill-review-queue.test.mjs`.
- Updated `npm run test:generated-skills` to cover both Phase 61 and Phase 62.
- Added `/api/continuous-intelligence/pems/generated-skill-review-queue`.
- Added connector proof/dashboard visibility through `phase62_generated_skill_review_queue`.

Safety:
- Queue rows store package metadata, file paths, and hashes, not raw generated file bodies.
- Raw PHI storage remains blocked.
- DB remains authoritative for queue/reviewer/executor state.
- Rejected, blocked, and needs-more-evidence decisions never prepare executor commands.
- Approved queue items still require explicit executor approval before commands are prepared.
- Executor plans do not auto-run commands, auto-open PRs, auto-merge, or enable production-driving.

Verification:
- Focused Phase 62 suite passed: `node --test src/tests/generated-skill-review-queue.test.mjs` reported 5/5 passing.
- Combined generated-skill gate passed: `npm run test:generated-skills` reported 9/9 passing.
- `npm run build` passed and reports the Phase 62 generated-skill reviewer queue contract.
- `npm run test:local` passed with 294 tests total, 292 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4228/api/proof/runs/local`: `phase62_generated_skill_review_queue` scored `100 / 100`, persisted one approved queue row, prepared an executor plan after explicit approval, blocked auto-run, blocked auto-merge, blocked production-driving, and hid raw PHI/raw file bodies.
- Dashboard visual proof passed at `http://127.0.0.1:4228/?phase=phase-62-generated-skill-reviewer-queue`: the Phase 62 card rendered `100 / 100`, queue status `approved_for_pr_execution`, executor status `ready_to_open_generated_skill_pr`, generated branch name, auto-run blocked, auto-merge blocked, production-driving blocked, raw PHI hidden, and zero console errors.
- Artifacts: `artifacts/phase62/phase62-dashboard-generated-skill-review-queue.png` and `artifacts/phase62/phase62-generated-skill-review-queue-proof.json`.

## Phase 63 Generated Skill PR Executor - 2026-06-22

Goal:
- Add a human-operated generated-skill PR executor surface for approved queue items while keeping connector/dashboard proof dry-run and side-effect-free.

Implemented:
- Added `generated_skill_pr_executor_runs` to the deterministic DB schema and migration path.
- Added `src/concierge/generatedSkillPrExecutor.mjs`.
- Extracted a Phase 61 materialization helper so the executor can verify reviewed package hash closure without storing raw generated file bodies in queue rows.
- Added executor surface checks for queue approval, executor readiness, package-hash match, explicit operator approval, bounded output paths, file-hash closure, explicit PR request, auto-merge blocked, and production-driving blocked.
- Added dry-run run recording for dashboard/API proof.
- Added explicit non-dry-run materialization support into a supplied repo root for human-operated execution tests.
- Kept PR opening behind explicit `openPullRequest=true`.
- Added `src/tests/generated-skill-pr-executor.test.mjs`.
- Updated `npm run test:generated-skills` and `npm run test:local` to include Phase 63.
- Added `/api/continuous-intelligence/pems/generated-skill-pr-executor`.
- Added connector proof/dashboard visibility through `phase63_generated_skill_pr_executor`.

Safety:
- Dashboard/API proof does not create a branch, write files, or open a PR.
- Non-dry-run materialization requires explicit operator approval and a supplied repo root.
- Auto-merge and production-driving remain blocked.
- Generated skill activation still requires Git review and later trusted-answer-driving promotion before production use.

Verification:
- Focused Phase 63/generated-skills suite passed: `npm run test:generated-skills` reported 14/14 passing.
- `npm run build` passed and reports the Phase 63 generated-skill PR executor contract.
- `npm run test:local` passed with 299 tests total, 297 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4229/api/proof/runs/local`: `phase63_generated_skill_pr_executor` scored `100 / 100`, recorded dry-run execution, preserved three reviewed generated files in the plan, wrote no files, opened no PR, blocked auto-merge, and blocked production-driving.
- Dashboard visual proof passed at `http://127.0.0.1:4229/?phase=phase-63-generated-skill-pr-executor`: the Phase 63 card rendered `100 / 100`, dry-run recorded, writes not performed, PR opened no, auto-merge blocked, production-driving blocked, and zero console errors.
- Artifacts: `artifacts/phase63/phase63-dashboard-generated-skill-pr-executor.png` and `artifacts/phase63/phase63-generated-skill-pr-executor-proof.json`.

## Phase 64 MVP Completion Audit - 2026-06-22

Goal:
- Evaluate whether the product is ready as a regular-user pilot MVP and list remaining production blockers without overclaiming completion.

Implemented:
- Added `src/concierge/mvpCompletionAudit.mjs`.
- Added `src/tests/mvp-completion-audit.test.mjs`.
- Added `npm run test:mvp:audit`.
- Added `/api/mvp/completion-audit`.
- Added connector proof/dashboard visibility through `phase64_mvp_completion_audit`.
- Separated regular-user MVP `score` from `productionScore`.
- Added explicit blockers for Postgres production rollout, Graphiti/Zep schema readiness, hosted/remote browser readiness, and live authenticated OpenClaw proof.

Safety:
- Graphiti/Zep degraded status remains advisory and visible.
- Production blockers remain visible even when the local MVP path is pilot-ready.
- The audit does not mutate runtime state or widen OpenClaw/browser permissions.

Verification:
- Focused Phase 64 suite passed: `npm run test:mvp:audit` reported 2/2 passing.
- `npm run build` passed and reports the Phase 64 MVP completion audit contract.
- `npm run test:local` passed after the final audit fix with 301 tests total, 299 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4230/api/proof/runs/local` and `http://127.0.0.1:4230/api/mvp/completion-audit`: `phase64_mvp_completion_audit` scored `100 / 88`, production score was `0 / 90`, and four production blockers remained visible.
- Dashboard visual proof passed at `http://127.0.0.1:4230/?phase=phase-64-mvp-completion-audit`: the Phase 64 card rendered MVP score, production score, pilot-ready user MVP posture, Graphiti/Zep degraded advisory memory, Postgres production blocker, and the local/pilot recommendation with zero console errors.
- Artifacts: `artifacts/phase64/phase64-dashboard-mvp-completion-audit.png` and `artifacts/phase64/phase64-mvp-completion-audit-proof.json`.

## Phase 65 Final MVP Goal Evaluation - 2026-06-22

Goal:
- Record the final MVP decision after Phase 64: local/pilot MVP achieved, production launch not complete.

Implemented:
- Added `src/concierge/finalMvpGoalEvaluation.mjs`.
- Added `src/tests/final-mvp-goal-evaluation.test.mjs`.
- Added `npm run test:mvp:final`.
- Added `/api/mvp/final-goal-evaluation`.
- Added connector proof/dashboard visibility through `phase65_final_mvp_goal_evaluation`.

Decision:
- Local/pilot regular-user MVP: achieved.
- Production launch: not achieved.
- Next recommended phase: fix production blockers.

Production blockers carried forward:
- Postgres production/default rollout.
- Graphiti/Zep schema-ready production memory.
- Hosted/remote browser production readiness.
- Authenticated live OpenClaw proof with user-controlled signed-in session.

Verification:
- Focused Phase 65 suite passed: `npm run test:mvp:final` reported 2/2 passing.
- `npm run build` passed and reports the Phase 65 final MVP goal evaluation contract.
- `npm run test:local` passed with 303 tests total, 301 passing, 2 expected live-gated OpenClaw skips, and 0 failures.
- API proof passed at `http://127.0.0.1:4231/api/proof/runs/local` and `http://127.0.0.1:4231/api/mvp/final-goal-evaluation`: `phase65_final_mvp_goal_evaluation` scored `100 / 100`, local/pilot MVP was `achieved`, production launch was `not_achieved`, and four production blockers were carried forward.
- Dashboard visual proof passed at `http://127.0.0.1:4231/?phase=phase-65-final-mvp-goal-evaluation`: the Phase 65 card rendered final score, local/pilot MVP achieved, production launch not achieved, final answer, next recommended phase `fix-production-blockers`, and zero console errors.
- Artifacts: `artifacts/phase65/phase65-dashboard-final-mvp-goal-evaluation.png` and `artifacts/phase65/phase65-final-mvp-goal-evaluation-proof.json`.
# Phase 66 — Production Contract

Date: 2026-06-22

RALPH state:

- Requirements: parsed the founder production interview answers and the attached Graphiti/Zep memory schema prompt.
- Architecture: kept the existing server-first Node/FastAPI/PWA/dashboard architecture; locked the next wave as production blocker closure rather than a rewrite.
- Loop: added a production contract module, dashboard proof entry, documentation, and test coverage.
- Prove: `phase66_production_contract` must score 100/100 before Phase 67 starts.
- Harden: resolved two ambiguous answers into safer production rules: encrypted cloud backup/restore is required for production PHI, and generated skills may be reviewed/operator-activated only inside gated contexts with versioned production activation.

Implemented:

- Added `src/concierge/productionContract.mjs`.
- Added `docs/PRODUCTION_CONTRACT_PHASE66.md`.
- Added dashboard/API proof key `phase66_production_contract`.
- Added scoreboard row `production_contract_phase66`.

Locked decisions:

- First user: patient/member.
- First workflow: bill verification flow from chat/PWA, including physical bill photo/upload.
- Postgres: production default with 5-year retention.
- Backup/restore: encrypted cloud backup and restore drill required for production.
- Product memory: Graphiti/Zep schema-first, with patient-private and procedural memory boundaries.
- Browser: self-hosted Steel on AWS first, user-visible live block, human-only credentials/2FA/captcha/form submission/uploads/payer contact.
- OpenClaw auth: manual user login; session state may persist, credentials may not.
- Skills: insurance portal browser, claim journey, Aetna plan, prior auth prep, denial appeal, procedure prep, provider network, pharmacy/formulary.
- Answers: LLM-primary sourced composition when cited evidence exists, deterministic fallback only when validation fails or evidence/model is unavailable.

Next:

- Phase 67: implement the attached Graphiti/Zep schema-ready memory layer before executor/orchestrator memory-driving changes.

# Phase 67 — Graphiti/Zep Schema-Ready Product Memory

Date: 2026-06-22

RALPH state:

- Requirements: implement the attached `brainsty_graphiti_memory_schema_prompt.md` as a schema-only product-memory contract.
- Architecture: Python/Pydantic package under `brainsty_memory/` with Node dashboard proof. No executor, UI, DSPy signatures, or agent prompts in this phase.
- Loop: added entities, edges, group IDs, temporal helpers, privacy filter, ingestion envelopes/schema generation, retrieval view models/primitives, seed loop templates, migration stub, schema docs, and tests.
- Prove: `npm run test:memory:schema`, `node --test src/tests/graphiti-schema-memory.test.mjs`, and `npm run build`.
- Harden: provider-facing price retrieval filters plan-member/private observations; evidence artifacts block raw PHI body; Graphiti retrieval boundary returns view models, not raw nodes.

Implemented:

- Added `brainsty_memory/entities.py`.
- Added `brainsty_memory/edges.py`.
- Added `brainsty_memory/groups.py`.
- Added `brainsty_memory/temporal.py`.
- Added `brainsty_memory/privacy.py`.
- Added `brainsty_memory/ingest/schemas.py`.
- Added `brainsty_memory/retrieval/`.
- Added `brainsty_memory/seeds/loop_templates/*.yaml`.
- Added `brainsty_memory/migrate.py`.
- Added `docs/schema.md`.
- Added `tests/test_schema_contract.py`.
- Added `src/concierge/graphitiSchemaMemory.mjs`.
- Added dashboard/API proof key `phase67_graphiti_zep_schema_memory`.

Boundary:

- This is schema-ready memory, not a live Graphiti executor integration.
- The in-memory test store proves signatures, privacy semantics, temporal behavior, and return shapes deterministically.
- Production Graphiti calls must preserve the same contracts when wired in later phases.

Next:

- Phase 68: make Postgres the production/default runtime path with retention and encrypted backup/restore proof.

# Phase 68 — Postgres Production Default

Date: 2026-06-22

RALPH state:

- Requirements: Postgres must become the production/default runtime store while local development remains ergonomic and SQLite-backed.
- Architecture: preserve the existing `PostgresStore` and smoke gates; add production-profile default resolution and dashboard proof instead of replacing the storage layer.
- Loop: updated database driver resolution, storage readiness, proof module, dashboard/API proof, tests, and docs.
- Prove: `npm run test:production:database`, `npm run test:db:safety`, and `npm run build`.
- Harden: production readiness still requires secret-backed database URL, 5-year retention policy, encrypted backup/restore drill, provider backup policy, endpoint parity, worker leases, and bound-parameter adapters.

Implemented:

- Added `resolveDatabaseDriver()` and `isProductionDatabaseProfile()` in `src/concierge/databaseFactory.mjs`.
- `NODE_ENV=production` or `BRAINSTY_RUNTIME_ENV=production-candidate` with `BRAINSTY_DATABASE_TARGET=postgres` now selects the Postgres runtime when `BRAINSTY_DB_DRIVER` is absent.
- Local development without explicit driver still selects SQLite.
- Updated `getStorageReadiness()` to use the same driver resolver as server startup.
- Added `src/concierge/productionDatabaseReadiness.mjs`.
- Added dashboard/API proof key `phase68_postgres_production_default`.
- Added `src/tests/production-database-readiness.test.mjs`.

Locked scope:

- Production runtime state includes sessions, tasks, approvals/audit, source pointers/evidence, uploaded document metadata, generated-skill queue/executor state, and browser session state.
- Retention target is 5 years.
- Local Docker backup is development proof only; production requires encrypted cloud backup/restore drill.

Next:

- Phase 69: build the patient bill verification PWA/API flow on top of the production contract and schema memory posture.

# Phase 69 — Patient Bill Verification MVP Flow

Date: 2026-06-22

RALPH state:

- Requirements: the first real workflow is patient/member bill verification, including a physical bill/photo intake path and a no-login explanation fallback.
- Architecture: add a safe Node parity endpoint and `/mvp` user-facing bill note intake while preserving the existing FastAPI upload path for real files.
- Loop: implemented bill signal extraction, missing evidence checklist, source-pointer-only posture, parallel agent plan, no-login fallback, dashboard/API proof, PWA controls, and tests.
- Prove: `npm run test:bill-verification`, `npm run build`, and visual `/mvp` testing.
- Harden: no payer contact, form submission, credential entry, medical advice, or raw PHI graph/payload storage occurs in the bill analyzer.

Implemented:

- Added `src/concierge/billVerification.mjs`.
- Added `POST /api/bill-verification/analyze`.
- Added `/mvp` bill note textarea, `Analyze Bill` button, and bill verification panel.
- Added dashboard/API proof key `phase69_bill_verification_mvp_flow`.
- Added `src/tests/bill-verification-flow.test.mjs`.

User behavior:

- User can paste or type visible bill details.
- The app extracts provider, amount, date, payer, claim reference, masked bill number, and code hints when present.
- The app shows missing evidence and a no-login explanation fallback.
- The app proposes parallel agents: bill parser, plan document research, approval/user-login-gated OpenClaw portal observer, and de-identified trusted public research.

Next:

- Phase 70: strengthen authenticated OpenClaw browser proof around the bill verification path and live user-controlled session boundaries.

# Phase 70 — Authenticated OpenClaw Bill Flow Proof

Date: 2026-06-22

RALPH state:

- Requirements: bill verification may use authenticated OpenClaw only with user-controlled login, read-only approval, source refs, and human-only takeover for credentials/2FA/captcha/submissions/uploads.
- Architecture: keep existing OpenClaw live readiness and takeover boundaries; add a bill-flow proof contract without pretending a portal is signed in.
- Loop: added Phase 70 proof module, dashboard/API proof, and tests.
- Prove: `npm run test:openclaw:bill-auth` and `npm run build`.
- Harden: the proof status distinguishes `live_gate_ready_user_login_required` from `ready_for_read_only_approval`.

Implemented:

- Added `src/concierge/authenticatedOpenClawBillProof.mjs`.
- Added dashboard/API proof key `phase70_authenticated_openclaw_bill_flow`.
- Added `src/tests/authenticated-openclaw-bill-proof.test.mjs`.

Boundary:

- Agent cannot enter credentials, passkeys, 2FA, captcha, or SSN.
- Agent cannot submit forms, upload documents, contact payers, pay/cancel, or modify records.
- Authenticated portal readiness still requires a user-controlled signed-in session.

Next:

- Phase 71: connect successful bill/case outcomes to schema memory episodes and generated skill candidates through an operator review queue.

# Phase 66-73 Follow-Up — React User App Read-Only Claim Scan

Date: 2026-06-24

RALPH state:

- Requirements: keep Claude's Phase 66-73 user app work PR-clean, make the default FastAPI facade use the real Steel provider config on `:8000`, and let the regular-user PWA continue from human takeover into read-only OpenClaw claim observation without widening the credential/action boundary.
- Architecture: reuse the proven FastAPI `POST /api/v1/browser/sessions/{id}/openclaw/claims-observe` endpoint. The React `/userapp` remains a regular-user surface; `/mvp` remains the operator/parity harness.
- Loop: added a typed `observeClaimsReadOnly()` client, surfaced **Continue read-only claim scan** after the user returns control, rendered source-aware scan status, and pushed successful observations back into the chat thread.
- Prove: `npm run userapp:build`, focused user app/facade tests, `npm run build`, `npm run test:local`, default-facade Steel API probe, and in-app visual proof.
- Harden: login, 2FA, captcha, password entry, payer document upload, form submit, payer contact, and account mutation remain human-only or blocked. If no signed-in claims page is visible, the scan returns a next action instead of fabricating evidence.

Implemented:

- Added `observeClaimsReadOnly()` in `src/userapp/api.ts`.
- Added post-return read-only scan UI and result panel in `src/userapp/components/LiveView.tsx`.
- Added chat handoff of the LangChain/composer result in `src/userapp/App.tsx`.
- Added `.claim-scan` styles and rebuilt `src/app/userapp/*`.
- Added static contract coverage in `src/tests/chat-ui-contract.test.mjs`.
- Updated `docs/REMOTE_BROWSER_AND_USERAPP.md`.

Proof:

- `npm run userapp:build` passed.
- `node --test src/tests/chat-ui-contract.test.mjs src/tests/portal-observation-answer.test.mjs src/tests/authenticated-openclaw-bill-proof.test.mjs` passed.
- `python3 -m unittest project.tests.test_fastapi_facade` passed: 57 tests, 2 expected skips.
- `npm run build` passed.
- `npm run test:local` passed: 329 tests, 327 passed, 2 expected live-gated skips.
- Default `:8000` facade probe returned `provider=hosted_remote`, `providerStrategy=steel-self-host`, `providerLiveConnected=true`, `streamTransport=sse_cdp_jpeg_frames`, and `navigation_status=remote_cdp_navigated`.
- Visual artifact: `artifacts/remote-browser/userapp-readonly-claim-scan-gated-1782269055577.png`.

Remaining manual gate:

- Actual post-login claim extraction still requires the user to sign in manually inside the AWS/Steel browser, pass any 2FA/captcha, return control, and then run **Continue read-only claim scan**. Codex/OpenClaw must not enter credentials or solve challenges.

# Phase 66-73 Follow-Up — Claude User App Verification And OpenClaw Readiness Hardening

Date: 2026-06-23

RALPH state:

- Requirements: verify the Claude Code implementation of the regular-user app and ensure the app did not lose the new `/userapp` surface or default FastAPI facade path.
- Architecture: keep `/userapp` as the regular-user PWA backed by FastAPI `:8000`; keep `/mvp` as the operator/parity harness; keep official OpenClaw observation limited to active approved payer portal tabs.
- Loop: inspected the committed Claude app files, rebuilt/served `/userapp`, tested FastAPI local auth and readiness, then hardened official OpenClaw readiness against unrelated browser tabs.
- Prove: focused readiness tests, `npm run build`, `npm run test:local`, `/userapp` HTTP asset check, Node `/api/openclaw/official/status` runtime check, and FastAPI `/api/auth/local-session` plus `/api/v1/openclaw/readiness` check.
- Harden: generic authenticated-looking pages such as third-party dashboards no longer qualify for read-only approval. An inactive payer tab also no longer qualifies.

Implemented:

- Tightened `src/concierge/openclawLiveReadiness.mjs` so member/dashboard/account keywords only count on known payer hosts.
- Required the current payer portal tab to be active before read-only approval readiness.
- Added regression coverage in `src/tests/openclaw-live-readiness.test.mjs` for `https://dashboard.clerk.com/apps` and inactive payer portal tabs.

Proof:

- `node --test src/tests/openclaw-live-readiness.test.mjs src/tests/authenticated-openclaw-bill-proof.test.mjs` passed: 13 tests.
- `npm run build` passed.
- `npm run test:local` passed: 331 tests, 329 passed, 2 expected live-gated skips.
- `GET http://127.0.0.1:4226/userapp?v=readiness-offsite-fix` served the built React user app assets.
- `GET http://127.0.0.1:4226/api/openclaw/official/status` returned fail-closed live readiness when no active approved payer portal tab was available.
- `POST http://127.0.0.1:8000/api/auth/local-session` with a member payload minted a local facade bearer token, and `GET http://127.0.0.1:8000/api/v1/openclaw/readiness` returned the official OpenClaw readiness envelope through the public connector.

Remaining manual gate:

- The live post-login claim scan still requires the user to sign in manually inside the AWS/Steel browser and return control. The worker can then observe only active approved payer portal pages in read-only mode.

# Phase 66-73 Follow-Up — Remote Claims Observation Host And Link Hardening

Date: 2026-06-23

RALPH state:

- Requirements: continue closing the real post-login read-only OpenClaw path without weakening the browser boundary. The worker must navigate read-only claim pages, understand visible claim rows, and pass source pointers to LangChain only after user-controlled login and return-control.
- Architecture: keep FastAPI as the public connector, Steel as the remote browser provider, and Node/LangChain as the answer composer. Claims observation remains provider-side read-only extraction plus sourced final-answer composition.
- Loop: audited `POST /api/v1/browser/sessions/{id}/openclaw/claims-observe`, found three provider gaps, and patched them.
- Prove: helper probe, FastAPI facade suite, `npm run build`, and `npm run test:local`.
- Harden: non-payer pages with claim-like text now fail closed before source pointers are created; relative same-site Aetna claims links now resolve and can be followed read-only.

Implemented:

- Added a shared approved member-portal host helper in `project/api/browser_sandbox.py`.
- Blocked `observe_claims_read_only()` when the current remote page is not on an approved Aetna member portal host.
- Fixed same-site claims link resolution by replacing the invalid `httpx.URL(..., base=...)` pattern with `urllib.parse.urljoin`.
- Tightened login-page detection so Aetna `Member Log-in` URL/title states stop as `human_login_required`, even when the login page contains benefits/coverage footer text.
- Added direct provider tests proving:
  - offsite current pages such as `dashboard.clerk.com` return `portal_page_required` with no source pointers or claim rows;
  - Aetna `Member Log-in` pages return `human_login_required` with no source pointers or claim rows;
  - a signed-in Aetna home page can follow a relative `/claims` link and extract a visible claim row in read-only mode.

Proof:

- `_safe_claims_link("/claims", "View All Claims", current_url="https://health.aetna.com/")` returns `https://health.aetna.com/claims`.
- `_safe_claims_link("https://dashboard.clerk.com/claims", "View All Claims", current_url="https://health.aetna.com/")` returns `None`.
- `python3 -m unittest project.tests.test_fastapi_facade` passed: 60 tests, 2 expected skips.
- `npm run build` passed.
- `npm run test:local` passed: 331 tests, 329 passed, 2 expected live-gated skips.
- Live default FastAPI facade proof created an AWS/Steel session through `POST /api/v1/browser/sessions` with `provider=hosted_remote`, `provider_strategy=steel-self-host`, `provider_live_connected=true`, `stream_transport=sse_cdp_jpeg_frames`, and `navigation_status=remote_cdp_navigated`.
- Live `POST /api/v1/browser/sessions/{id}/openclaw/claims-observe` against the Aetna login page returned `status=human_login_required`, `source_pointer_count=0`, `claim_row_count=0`, and `agentCredentialEntryAllowed=false`.

Remaining manual gate:

- Actual post-login proof still needs the user to manually sign in inside the AWS/Steel browser, pass any login/2FA/captcha challenge, return control, and run **Continue read-only claim scan**. Codex/OpenClaw must not enter credentials, solve challenges, submit forms, upload payer documents, contact Aetna, or mutate account data.

# Phase 66-73 Follow-Up — Default Facade Private Steel Config Hydration

Date: 2026-06-24

RALPH state:

- Requirements: keep Claude's `/userapp` work and Phase 66-73 PR history clean, make the default FastAPI facade on `:8000` start with the private AWS/Steel provider config, and avoid relying on a separate `:8001` debug facade or stale `.env.local` Steel endpoints.
- Architecture: keep Node as the internal runtime, FastAPI as the connector, `/userapp` as the regular-user app, and `/mvp` as the operator harness. Runtime provider values stay outside Git under `~/.config/workerprototype_openclaw/`.
- Loop: extended the conservative FastAPI env loader so explicit process env wins, private Phase 30/Phase 28 Steel env wins over repo-local loaded Steel defaults, and `steel-self-host` maps `WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL` to `WEFELLA_BROWSER_SANDBOX_STEEL_API_URL` when no explicit Steel API URL exists.
- Prove: added focused facade env-loader regression coverage and a live import proof showing the default facade resolves the private Steel endpoint and CDP tunnel metadata without returning secret values.
- Harden: no endpoint token, raw provider secret, portal credential, frame, OCR text, or payer login value is committed or returned by the loader metadata.

Implemented:

- Added `load_facade_env_once()` in `project/api/local_env.py`.
- Added private-provider env discovery for `~/.config/workerprototype_openclaw/phase30/phase30-remote.env`, then `~/.config/workerprototype_openclaw/phase28/phase28.env`.
- Added a `WEFELLA_FACADE_PRIVATE_ENV_FILE` override for one-off private provider file selection.
- Added Steel self-host endpoint aliasing from `WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL` to `WEFELLA_BROWSER_SANDBOX_STEEL_API_URL` for the default facade.
- Added regression coverage in `project/tests/test_fastapi_facade.py`.
- Updated `docs/REMOTE_BROWSER_AND_USERAPP.md`.

Proof:

- `python3 -m unittest project.tests.test_fastapi_facade.FastApiFacadeTest.test_local_env_loader_applies_missing_steel_facade_config_without_overriding_explicit_env project.tests.test_fastapi_facade.FastApiFacadeTest.test_default_facade_env_prefers_private_steel_config_over_repo_local_values` passed.
- `WEFELLA_FACADE_LOAD_LOCAL_ENV=1 python3 - <<'PY' ... import project.api.main ... PY` loaded `.env.local` plus the private Phase 30 env, selected the Phase 30 provider file over Phase 28, resolved `WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME=steel-self-host`, resolved redacted endpoint hosts for Steel API/viewer/CDP, and returned only key/path metadata.

Remaining manual gate:

- Actual post-login claim extraction still requires the user to sign in manually inside the AWS/Steel browser, pass any 2FA/captcha challenge, return control, and then run **Continue read-only claim scan**. Codex/OpenClaw must not enter credentials, solve challenges, submit forms, upload payer documents, contact Aetna, or mutate account data.

# Phase 66-73 Follow-Up — Post-Login Claims Proof Artifact

Date: 2026-06-24

RALPH state:

- Requirements: make the post-login Aetna read-only scan auditable after the user manually signs in, while preserving the no-credentials/no-submit/no-upload browser boundary.
- Architecture: keep the existing FastAPI `claims-observe` endpoint as the public connector path, keep Node/LangChain as the final-answer composer, and add a separate sanitized local proof artifact beside the API response.
- Loop: added proof writing after the provider observation and LangChain answer composer complete, then surfaced the artifact path in `/userapp` when the scan succeeds.
- Prove: focused facade and UI contract tests prove the artifact is written and does not store raw claim text, raw portal text, raw frame content, credentials, tokens, or final answer text.
- Harden: artifact rows use source-pointer refs and hashes/counts instead of claim descriptions, service dates, or response text.

Implemented:

- Added `brainstyworkers.claims-observe-proof.v1` artifacts from `POST /api/v1/browser/sessions/{id}/openclaw/claims-observe`.
- Added `WEFELLA_CLAIMS_OBSERVE_PROOF_DIR` for runtime proof redirection; default remains `artifacts/remote-browser`.
- Added proof metadata to the endpoint response: artifact path, status, source-pointer count, claim-row count, and safety booleans.
- Updated the React `/userapp` live view to display `Proof artifact: <path>` after a successful read-only scan.
- Added regression coverage in `project/tests/test_fastapi_facade.py` and `src/tests/chat-ui-contract.test.mjs`.

Proof:

- `npm run test:facade` passed: 61 tests, 2 expected skips.
- `npm run userapp:build` passed.
- `node --test src/tests/chat-ui-contract.test.mjs` passed: 15 tests.
- `npm run build` passed.
- `npm run test:local` passed: 331 tests, 329 passed, 2 expected live-gated skips.
- Restarted the default FastAPI facade on `:8000`; `GET /api/v1/health` returned `node_runtime_ok=true` for Node `http://127.0.0.1:4226`.
- Live default-facade smoke created an AWS/Steel session with `provider=hosted_remote`, `provider_strategy=steel-self-host`, `provider_live_connected=true`, `stream_transport=sse_cdp_jpeg_frames`, and `navigation_status=remote_cdp_navigated`.
- Live `POST /api/v1/browser/sessions/{id}/openclaw/claims-observe` before user login returned `status=human_login_required`, `source_pointer_count=0`, `claim_row_count=0`, `agentCredentialEntryAllowed=false`, and proof artifact `artifacts/remote-browser/claims-observe-proof-8a2d20b6-d14f-4faa-abd6-1293b1420161.json`.
- The live proof artifact had no blocked raw-string hits and kept `portalText=false`, `frameContent=false`, `credentials=false`, `tokens=false`, `claimRowText=false`, and `finalResponseText=false`.
- `GET http://127.0.0.1:4226/userapp?verify=proof-artifact` served the rebuilt bundle `/userapp/assets/index-Ut5Ei0nW.js` with no browser console errors.

Remaining manual gate:

- Actual post-login proof still requires the user to take control inside the AWS/Steel browser, sign in to Aetna manually, pass any 2FA/captcha challenge, return control, and run **Continue read-only claim scan**. That final live proof is intentionally human-gated; Codex/OpenClaw must not enter credentials, solve challenges, submit forms, upload payer documents, contact Aetna, or mutate account data.

# Phase 76 — LLM-Primary General Planner Questions

Date: 2026-06-26

RALPH state:

- Requirements: stop brittle sentence-specific free-text routing, prove general user questions re-enter the LLM planner with context, and keep deterministic logic reserved for safety and UI-selected workflow controls.
- Architecture: keep LangGraph as the workflow authority, but make medication-copay and claim questions planner-routed through the top-tier LLM orchestration decision node. Promote `pharmacy_formulary` from a journey-only concept to a workflow visible to the runtime registry, LLM decision contract, prompt contract, OpenClaw skill boundary, and AI2UI path.
- Loop: added a focused deterministic harness that injects a fake LangChain model factory at the model boundary, then runs the full LangGraph orchestration for two general prompts: medication copay and claim inquiry.
- Prove: tests assert the graph invokes the planner tier (`gpt-5`), includes route candidates and OpenClaw capability policy in the planner payload, adopts the planner workflow, and no longer relies on frontend phrase shortcuts like `interactiveFastPath` or “option B”.
- Harden: planner-tier model selection no longer inherits a classifier-sized global `OPENAI_MODEL` fallback; classifier can still use `OPENAI_MODEL`, while planner/reasoner default to top-tier models unless explicitly configured.

Implemented:

- Added `pharmacy_formulary` to `LLM_DECISION_WORKFLOWS`, prompt contracts, reasoning schema workflow mapping, workflow registry seed data, Aetna member-portal source mapping, route scoring, and the insurance portal browser skill manifest.
- Added `npm run test:planner:general`.
- Added `src/tests/phase76-planner-general-questions.test.mjs`.
- Updated the prior pharmacy-formulary LangGraph expectation from generic eligibility routing to first-class `pharmacy_formulary` workflow routing.
- Added model-tier regression coverage proving planner/reasoner do not inherit `OPENAI_MODEL=gpt-5-mini`.

Proof:

- `npm run test:planner:general` passed: 3 tests.
- Focused affected suite passed: `node --test src/tests/model-tier-policy.test.mjs src/tests/workflow-architecture.test.mjs src/tests/intelligence-contracts.test.mjs src/tests/structured-intent-classifier.test.mjs src/tests/llm-orchestration-decision.test.mjs src/tests/langgraph-runner.test.mjs src/tests/prompt-contracts.test.mjs src/tests/openclaw-skill-artifacts.test.mjs src/tests/openclaw-skill-invocation.test.mjs` passed: 48 tests.
- `npm run test:journeys` passed: 19 tests.
- `npm run test:openclaw:skills` passed: 14 tests.
- `npm run build` passed.

Remaining follow-up:

- Phase 77 must add Redis-backed runtime context/checkpoint pointers, prompt compaction, cache keys, and achieved-checkpoint injection so every chat or user action carries compact prior decisions without skipping planner reasoning.

# Phase 77 — Redis-Compatible Runtime Context And Checkpoint Pointers

Date: 2026-06-26

RALPH state:

- Requirements: reduce long-context latency without skipping reasoning, add Redis-style fast runtime context, and ensure each chat/user action carries achieved checkpoint pointers and prior decisions.
- Architecture: added a `runtimeContextCache` adapter with optional real Redis via `BRAINSTY_REDIS_URL` / `REDIS_URL` and deterministic in-memory fallback for local/test. The cache stores hydratable manifests only; authoritative user/session/checkpoint state stays in the database.
- Loop: context-packet creation now reads the previous manifest, builds a compact pointer manifest from durable session checkpoints, writes it to the fast cache, and injects only safe pointers into the context packet. After each LangGraph completion checkpoint, the cache is refreshed from the durable session checkpoint state.
- Prove: new tests run two chats in the same session and prove the second chat includes the first run's achieved checkpoint pointers, prior workflow/route decisions, cache key, manifest hash, and prompt-compaction metadata.
- Harden: runtime context does not carry raw prior chat text; it uses hashes, checkpoint IDs, workflow pointers, source-pointer counts, and context-packet IDs.

Implemented:

- Added `src/concierge/runtimeContextCache.mjs` with `memory` and minimal RESP-compatible `redis` adapters.
- Added runtime context manifests to `buildContextPacket()`.
- Added runtime context summaries to structured-intent and LLM orchestration decision payloads.
- Added post-checkpoint cache refresh in `runLangGraphOrchestration()`.
- Added `npm run test:runtime:context`.
- Added `src/tests/phase77-redis-runtime-context.test.mjs`.

Proof:

- `npm run test:runtime:context` passed: 3 tests.
- Affected context/session/payload suite passed: `node --test src/tests/model-payload-policy.test.mjs src/tests/session-manager.test.mjs src/tests/session-continuity.test.mjs src/tests/runtime-events.test.mjs src/tests/runtime-adapters.test.mjs src/tests/workflow-architecture.test.mjs src/tests/llm-orchestration-decision.test.mjs` passed: 28 tests.
- `npm run test:egress` passed: 4 tests.
- `npm run build` passed.

Remaining follow-up:

- Phase 78 must add the Redis-backed capability portfolio: short planner-visible descriptions with portfolio IDs and cache pointers for skills, workflows, tools, graph paths, and available worker actions.

# Phase 78 — Redis-Backed Capability Portfolio

Date: 2026-06-26

RALPH state:

- Requirements: provide the planner with a compact portfolio of available workflows, skills, tools, graph paths, and worker capabilities, backed by fast Redis-style pointers rather than a large prompt dump.
- Architecture: added a capability portfolio manifest stored in the same Redis-compatible runtime cache. The planner sees a balanced short table with `portfolioId`, `kind`, `title`, `shortDescription`, `score`, and `pointer`; hydrated entries stay in the cache.
- Loop: context-packet creation now attaches a portfolio every run. The LLM orchestration decision payload and structured-intent payload include the short table. The decision parser now preserves `selectedCapabilityPortfolioIds` and `selectedCapabilityPointers` returned by the planner.
- Prove: tests hydrate the portfolio from cache, verify key workflow/skill/tool/graph entries are present, verify planner payloads omit hydrated entries, and verify selected portfolio IDs/pointers survive normalization.
- Harden: the portfolio table is balanced and pins critical entries (`pharmacy_formulary`, `claim_status_navigation`, `insurance_portal_browser`, `openclaw_authenticated_browser`, and the LLM planner graph path) so high-value capabilities are not crowded out by lower-value entries.

Implemented:

- Added `src/concierge/capabilityPortfolio.mjs`.
- Attached `capabilityPortfolio` to each context packet.
- Added capability portfolio summaries to the structured-intent and LLM planner payloads.
- Extended `normalizeLlmOrchestrationDecision()` with selected capability IDs/pointers.
- Added `npm run test:capability:portfolio`.
- Added `src/tests/phase78-capability-portfolio.test.mjs`.

Proof:

- `npm run test:capability:portfolio` passed: 3 tests.
- `npm run test:planner:general` passed: 3 tests.
- `npm run test:runtime:context` passed: 3 tests.
- Related prompt/runtime suite passed: `node --test src/tests/workflow-architecture.test.mjs src/tests/llm-orchestration-decision.test.mjs src/tests/model-payload-policy.test.mjs src/tests/prompt-contracts.test.mjs src/tests/runtime-adapters.test.mjs` passed: 18 tests.
- `npm run build` passed.

Remaining follow-up:

- Phase 79 must index LLM outputs and planner decisions by pointer so downstream agents, checkpoints, and future prompts can cite prior model decisions without re-injecting full text.

# Phase 79 — LLM Output Index Pointers

Date: 2026-06-26

RALPH state:

- Requirements: index LLM outputs so future turns, agents, and checkpoints can reference prior reasoning by pointer instead of re-injecting full model text.
- Architecture: added a Redis-compatible `llmOutputIndex` that records output IDs, cache pointers, model/tier metadata, output hashes, selected portfolio IDs/pointers, workflow, intent, confidence, and issue/warning counts. It deliberately does not store raw model output text in the prompt-facing index.
- Loop: live structured-intent and LLM-orchestration planner outputs are indexed after model invocation. The next context packet loads recent output pointers and injects them into structured-intent/planner payloads.
- Prove: tests run two live-model graph turns with deterministic fake LangChain models. The first turn writes structured-intent and planner output entries; the second turn receives those entries as pointers and the planner can return `priorLlmOutputPointersUsed`.
- Harden: removed rationale/model-prose summaries from the index after tests caught that raw rationale text could leak into prompt context. The retained index uses hashes and structured routing fields only.

Implemented:

- Added `src/concierge/llmOutputIndex.mjs`.
- Indexed live structured-intent outputs.
- Indexed live LLM orchestration decision outputs.
- Added `llmOutputIndex` to context packets, structured-intent payloads, and LLM planner payloads.
- Extended `normalizeLlmOrchestrationDecision()` with `priorLlmOutputPointersUsed`.
- Added `npm run test:llm:output-index`.
- Added `src/tests/phase79-llm-output-index.test.mjs`.

Proof:

- `npm run test:llm:output-index` passed: 2 tests.
- Combined Phase 76-79 gates passed: `npm run test:planner:general && npm run test:runtime:context && npm run test:capability:portfolio && npm run test:llm:output-index`.
- `npm run test:egress` passed: 4 tests.
- Related model/payload/LangGraph suite passed: `node --test src/tests/model-payload-policy.test.mjs src/tests/llm-orchestration-decision.test.mjs src/tests/intelligence-default.test.mjs src/tests/langgraph-runner.test.mjs` passed: 28 tests.
- `npm run build` passed.

Remaining follow-up:

- Phase 80 must use the checkpoint/cache pointers for explicit resume/error handling so interrupted or failed LangGraph flows can resume from achieved checkpoints instead of restarting from scratch.

# Phase 80 — Checkpoint Resume Plan

Date: 2026-06-26

RALPH state:

- Requirements: make checkpoint/cache pointers usable for explicit resume and error handling, so the orchestrator can continue from achieved work instead of restarting from scratch.
- Architecture: added a deterministic `checkpoint_resume_plan` derived from the runtime-context manifest, durable session checkpoints, and prior LLM output pointers. The database checkpoint remains authoritative; Redis/memory cache is a fast pointer layer only.
- Loop: every LangGraph run now builds a resume plan before graph invocation. If `resumeFromRuntimeContext`, `resumeFromCheckpoint`, or an approval token is present, the plan is marked requested. The plan is included in graph state, checkpoint metadata, structured-intent payloads, and planner payloads.
- Prove: tests seed a completed run, start a second run with `resumeFromRuntimeContext`, and verify the resume plan includes latest checkpoint ID, completed step, prior workflow, prior route, deterministic authority, and cache role. A live-model harness also verifies prior LLM-output pointers are visible to the planner.
- Harden: resume metadata does not bypass LangGraph or deterministic safety. It gives the planner and graph a compact continuation map while preserving policy evaluation and approval gates.

Implemented:

- Added `src/concierge/checkpointResumePlan.mjs`.
- Added `checkpoint_resume_plan` to LangGraph state.
- Added checkpoint resume plans to structured-intent and LLM planner payloads.
- Stored checkpoint resume metadata in the session checkpoint metadata.
- Added `npm run test:checkpoint:resume`.
- Added `src/tests/phase80-checkpoint-resume-plan.test.mjs`.

Proof:

- `npm run test:checkpoint:resume` passed: 2 tests.
- Combined runtime resume gates passed: `npm run test:runtime:context && npm run test:llm:output-index && npm run test:checkpoint:resume`.
- Related checkpoint/runtime suite passed: `node --test src/tests/session-manager.test.mjs src/tests/graph-interrupt-resume.test.mjs src/tests/runtime-events.test.mjs src/tests/llm-orchestration-decision.test.mjs` passed: 18 tests.
- `npm run build` passed.

Remaining follow-up:

- Phase 81 must add vector-to-context retrieval pointers for workflows, skills, and prior outputs, while keeping prompt context compact and source-pointered.
