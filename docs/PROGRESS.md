# Progress

Track each implementation loop here.

For every slice, record:
- Slice name
- Files changed
- Verification commands
- Result
- What the user can try locally
- Known risks or gaps

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
