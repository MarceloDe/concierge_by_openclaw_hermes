# Slice 1 Pending Spec

Status: implemented; public Aetna browser extraction verified; authenticated member extraction awaits user login.

Last updated: 2026-05-17

## Purpose

This file converts the prompt audit and user interview answers into an implementation-ready slice. The user approved implementation on 2026-05-17.

## Recommended Slice 1 Demo

Build a local Brainstyworkers AI Concierge demo for Marcelo Felix using a web chat interface, local enrollment database, and browser automation against the user's logged-in insurance website.

The demo should prove that the system can:

- Enroll Marcelo Felix as the first member/user.
- Create local user, account, session, portal, consent, extraction, and audit records.
- Receive a user request through local web chat.
- Normalize the request into a channel envelope.
- Run input and action policy checks.
- Attach to a user-authenticated Chrome instance through a remote-debugger/browser automation boundary.
- Navigate the logged insurance website for eligibility/benefits information.
- Extract approved website data into local records.
- Produce a safe user-facing answer and operator trace.
- Record an audit-style trace with browser actions and data extraction events.
- Avoid payer APIs, medical advice, external messages, credential entry by Codex, and irreversible website actions without explicit approval.

## First User

Confirmed user answer:
- Patient/member: Marcelo Felix, `mocfelix@gmail.com`.

Why:
- The product vision emphasizes a personal healthcare insurance concierge.
- A member-facing local demo is easier for the user to judge quickly.
- It keeps the first slice focused on experience and guardrails rather than staff operations.

## First Channel

Confirmed user answer:
- Local web chat.

Why:
- The source prompt's first milestone names a single web chat channel.
- A browser demo gives fast feedback on tone, flow, and trace visibility.
- OpenClaw community channel adapters can be simulated behind a local channel adapter boundary, then replaced later.

## First Workflow

Confirmed user answer:
- Full enrollment plus eligibility/benefits navigation by autonomous navigation of the user's logged insurance website in Chrome.

Why:
- The source prompt names eligibility as a first subagent node.
- It is useful without needing live payer APIs.
- It can show routing, safe next steps, and explicit "no payer contacted" boundaries.

## First Demo Input

Revised default:

```text
Enroll me as Marcelo Felix, connect to my logged insurance website in Chrome, review my eligibility and benefits, and show the trace of what you found.
```

## Expected Response Shape

The response should include:

- A concise enrollment summary.
- A browser automation summary: what portal was opened, what sections were visited, and what was extracted.
- An eligibility/benefits summary based on user-approved portal data.
- A clear statement that no payer API was used and no external message was sent.
- A safety boundary: Brainstyworkers is not providing medical advice.
- An approval note for any next action that would submit, send, change, or contact.

## Data Policy

Confirmed user answer:
- Use enrollment data from Marcelo Felix and approved data from the logged insurance website.
- Portal URL/payer: `https://www.aetna.com/`
- Screenshot policy: all allowed.
- Local PHI storage approval: all fields.
- Read-only extraction after login: approved.
- Website actions: approved.

Allowed in slice 1:
- User profile fields: name and email.
- Insurance portal metadata: payer/portal URL, authenticated session presence, visited pages.
- Eligibility/benefits fields visible in the portal.
- Portal screenshots or DOM extracts only when redacted or explicitly approved.
- Local database records needed for user enrollment, sessions, consent, trace, and portal extraction.

Not allowed in slice 1:
- Codex entering SSN, password, passkey, or 2FA.
- External storage of PHI.
- Vercel production PHI storage.
- Payer API calls.
- External messages.
- Medical advice.
- Form submission, claim submission, prior authorization submission, denial appeal submission, or account changes without per-action approval.

## Memory Policy

Confirmed user answer:
- Cross-session memory is deferred.
- The slice may create per-request trace records for proof.
- Application database records for enrollment/session/portal data are allowed as local app records, not as Hindsight long-term memory.
- The trace must not be treated as long-term semantic memory.

Later memory slices must define:
- What may be retained.
- What must never be retained.
- How memories are scoped by user.
- How cross-user isolation is tested.

## Database Policy

Slice 1 should define and implement local database tables for:

- `users`
- `user_consents`
- `portal_accounts`
- `sessions`
- `conversation_messages`
- `browser_runs`
- `browser_actions`
- `eligibility_snapshots`
- `benefit_items`
- `extraction_artifacts`
- `approval_gates`
- `audit_events`

The design must distinguish:

- Application records: enrollment, sessions, portal metadata, eligibility snapshots.
- Trace records: what the agent did in this run.
- Memory records: deferred Hindsight/LangGraph long-term memory, not active in slice 1.

## Human Approval Policy

Slice 1 must require explicit human approval before any path that implies:

- Contacting a payer.
- Sending an external message.
- Updating a record.
- Submitting prior authorization.
- Submitting denial appeal.
- Accessing an account.
- Sharing sensitive identifiers.
- Escalating to a human with case context.
- Persisting raw PHI beyond the local prototype database.
- Capturing unredacted screenshots.
- Exporting data from the machine.

In slice 1, read-only navigation and extraction may be performed after the user approves the portal and login state. Submit/send/change actions must be blocked until separately approved.

## Suggested State Shape

The first implementation can use a small local state object inspired by the source prompt:

- `user_id`
- `session_id`
- `channel`
- `user_input`
- `consent_state`
- `policy_result`
- `portal_account_id`
- `browser_run_id`
- `intent`
- `workflow`
- `workflow_result`
- `approval_required`
- `extracted_records`
- `final_response`
- `audit_events`

## Suggested Workflow Nodes

The first implementation can model the LangGraph architecture without requiring production dependencies:

1. `channel_adapter`
2. `enrollment`
3. `consent_gate`
4. `input_policy`
5. `classify_intent`
6. `plan`
7. `chrome_attach`
8. `portal_navigation`
9. `eligibility_extraction`
10. `compose_response`
11. `output_policy`
12. `audit_trace`

## Planned Local Stack

Recommended default:
- Local web app for chat and operator trace.
- Local backend/API for enrollment, database writes, and browser automation orchestration.
- Local relational database for the slice 1 app records.
- LangGraph-style state model now; real LangGraph checkpointer/store wiring when dependency/setup is approved.
- Browser automation through Chrome remote debugging or available Chrome/OpenClaw-compatible tooling.
- Vitest or equivalent tests for policy, routing, database, and trace behavior.
- No Vercel AI Gateway model call required in slice 1 unless separately approved.

Why:
- This directly tests the risky part: real-user enrollment, logged portal navigation, extraction, and auditability.
- The database shape can later move to Vercel Marketplace Postgres.
- LangGraph session/thread concepts can be mapped before Hindsight long-term memory is enabled.
- The UI can show both the member-facing response and an operator trace.

## Planned File Layout

Codex should choose the final layout after inspecting any created project scaffold, but the intended shape is:

```text
package.json
src/
  app/
  server/
  concierge/
    audit.ts
    browserAutomation.ts
    channelAdapter.ts
    consent.ts
    database.ts
    engine.ts
    enrollment.ts
    langgraphScope.ts
    outputPolicy.ts
    policy.ts
    portalExtraction.ts
    schema.ts
    types.ts
    workflows.ts
  tests/
    enrollment.test.ts
    policy.test.ts
    workflow.test.ts
    database.test.ts
docs/
  SLICE_1_PENDING_SPEC.md
```

## Planned Implementation Checklist

After user confirmation, Codex should:

1. Ask the user for final approval to implement the revised slice and provide the insurance portal URL/payer.
2. Scaffold the local app/backend/database.
3. Implement the enrollment and local database schema.
4. Implement consent and approval gates for PHI, screenshots, and portal actions.
5. Implement the graph-like workflow core with LangGraph-compatible state/thread IDs.
6. Implement Chrome remote-debugger/browser automation attachment.
7. Require the user to authenticate directly in Chrome.
8. Implement read-only portal navigation and extraction.
9. Implement eligibility/benefits summary and trace rendering.
10. Add tests for enrollment, database writes, policy gates, and workflow routing.
11. Run install/build/test checks.
12. Start the dev server.
13. Verify the browser demo and browser automation proof.
14. Update `docs/PROGRESS.md` with files changed, proof, risks, and local try-it steps.

## Non-Goals For Slice 1

- Hindsight retain/recall of user PHI.
- Real Vercel AI Gateway model routing.
- Real OpenClaw multi-channel adapters beyond browser automation compatibility.
- Real payer APIs.
- Production authentication.
- Deployment.
- Vercel production PHI persistence.
- HIPAA compliance hardening.

## Verification Requirements

Before calling slice 1 done, Codex must run:

- Dependency install or build check appropriate to the created stack.
- Unit tests for enrollment and database schema behavior.
- Unit tests for consent/approval gates.
- Unit tests for guarded external action and medical advice paths.
- API verification for enrollment/chat/trace behavior.
- Browser verification for the local web chat.
- Browser automation verification against the logged Chrome portal flow.
- Trace/audit verification showing data extraction and action boundaries.

`docs/PROGRESS.md` must record:

- Files changed.
- Commands run.
- Test/build results.
- Browser/API proof.
- What the user can try locally.
- Known risks and deferred work.

## User Confirmation

Implementation approved on 2026-05-17:

```text
Insurance portal URL and payer: https://www.aetna.com/
Screenshot policy: all allowed
Local PHI storage approval: all fields
Read-only extraction approval after login: yes
Website action approval: yes
Implementation approval: yes
```

Credential boundary still applies: the user handles login, passwords, passkeys, SSNs, and 2FA directly in Chrome.
