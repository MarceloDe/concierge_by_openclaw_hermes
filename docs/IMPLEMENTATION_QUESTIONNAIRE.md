# Implementation Interview

Codex should ask these questions before building if the answers are not already clear from `brainstyworkers_ai_concierge_prompt.md`.

## Fast Path Recommendation

If the user wants the quickest safe slice, Codex recommends these defaults:

- First user: patient/member.
- First channel: local web chat.
- First workflow: eligibility/benefits navigation with mocked data.
- First demo input: "Can you check whether my Aetna plan covers physical therapy and what I should do next?"
- First response: explain the mocked coverage summary, list next safe steps, and state that no payer was contacted.
- Data: seeded demo data only; no real PHI, SSN, DOB, member ID, login, or payer account credentials.
- Memory: deferred until a later slice; slice 1 may show an audit trace but should not store cross-session facts.
- OpenClaw and Vercel AI Gateway: simulated behind local adapter boundaries for slice 1.
- Human approval: required before payer contact, external messages, record changes, prior authorization submission, appeal submission, or escalation handoff.
- Proof: local browser demo, API response, automated tests, and a recorded trace/audit log.

If the user confirms these defaults, Codex can update the planning documents and implement slice 1.

## Product Behavior

1. Who is the first real user: patient, provider, care coordinator, admin, or internal operator?
2. What is the first interaction the user should complete successfully?
3. Should the concierge sound like Brainsty speaking directly to a patient, or like an operator tool for staff?
4. What should the assistant refuse, escalate, or defer?

## First Workflow

1. Which workflow should be implemented first: eligibility, prior auth, denial appeal, claim status, payer contact, document ingest, or general RAG?
2. What exact input should the first demo accept?
3. What exact response should the first demo produce?
4. What states should be visible to the user or admin?

## Data And Memory

1. Should the first build use mocked data, seeded sample cases, local files, a database, or live APIs?
2. What user facts should be remembered across sessions?
3. What facts must not be stored?
4. How should the system show that it remembered something from a prior session?

## Integrations

1. Which channel comes first: web chat, WhatsApp, Telegram, email, voice, or admin dashboard?
2. Should OpenClaw be used immediately, or should the first build simulate channel/tool behavior?
3. Should Vercel AI Gateway be required in local development, or can local development use a simpler provider adapter first?
4. Which services are mandatory for slice 1?

## Safety And Compliance

1. What PHI or insurance identifiers will appear in demos, if any?
2. Which actions require explicit human approval?
3. What audit events must be logged from day one?
4. What disclaimer or boundary language must appear in user-facing responses?

## Local Demo Proof

1. What should the user be able to open or run locally after slice 1?
2. What command proves the project builds?
3. What test proves the main workflow works?
4. What screenshot, API response, trace, or log should be captured as proof?
