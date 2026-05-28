# Interview Answers

Status: implementation approved for revised slice 1.

Last updated: 2026-05-17

Codex may implement slice 1 under the approvals and boundaries recorded here.

## Revised Plan Approval

The revised slice 1 can begin only if the user explicitly approves it, for example:

```text
Approved: implement the revised Slice 1 plan. The insurance portal is <URL/payer>. I will handle login in Chrome.
```

That would confirm:

- The revised real-user enrollment and browser-portal depuration plan is approved.
- The payer/portal target is known.
- The user will authenticate directly in Chrome.
- Codex may proceed with implementation under the approval gates documented in `docs/SLICE_1_PENDING_SPEC.md`.

## Still Needed

Current implementation approvals:

```text
Insurance portal URL and payer: https://www.aetna.com/
Screenshot policy: all allowed
Local PHI storage approval: all fields
Read-only extraction approval after login: yes
Website action approval: yes
Implementation approval: yes
```

## Current Answers

- First user: patient/member, Marcelo Felix, email `mocfelix@gmail.com`.
- First channel: local web chat.
- First workflow: full member enrollment plus eligibility/benefits navigation through the user's logged-in insurance website in Chrome via remote debugger/browser automation.
- First demo request: enroll Marcelo Felix, create the user database record set, connect session/state architecture to LangChain/LangGraph concepts, use logged Chrome to inspect the insurance website, verify eligibility/benefits, and produce trace proof.
- Slice 1 data policy: collect data from the initial user enrollment and from the logged-in insurance website after the user authenticates in Chrome.
- Memory in slice 1: no cross-session long-term memory; only per-request trace proof. The database may still store enrollment/session/portal data as application records, separate from memory.
- OpenClaw in slice 1: simulate locally where possible, but design the browser automation boundary to match OpenClaw/remote-debugger profile behavior.
- Vercel AI Gateway in slice 1: simulated locally for model routing unless separately approved/configured.
- LangChain/LangGraph in slice 1: use LangGraph concepts for state, threads, checkpoints, and stores; defer production Hindsight memory because cross-session memory is explicitly out of scope for slice 1.
- Hindsight in slice 1: verify integration needs and reserve schema/bank identifiers, but do not retain PHI or create long-term memory in Hindsight during slice 1.
- Human approval gates: required before login credential entry, PHI extraction, data persistence, website clicks that submit/change/send, payer contact, external messages, prior authorization submission, denial appeal submission, record modification, or any irreversible action.
- Demo proof required: automated tests, API response, browser verification, browser automation trace, insurance website navigation/action proof, insurance website data extraction proof, and trace/audit output.
- Insurance portal URL and payer: `https://www.aetna.com/`
- Screenshot policy: all allowed.
- Local PHI storage approval: all fields.
- Read-only extraction after login: approved.
- Website action approval: approved.
- Implementation approval: approved.

## Important Safety Clarification

The user approved PHI access, all local PHI fields, screenshots, read-only extraction, and website actions for the prototype. Credentials must still stay in the user's hands. Any payer API communication, external message, medical advice, or irreversible submission/change must remain explicitly traceable and separately gated in the product flow.
