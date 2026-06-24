# Phase 66 Production Contract

Status: locked for sequential Phases 66-73.

This contract records the founder interview answers from 2026-06-22 and resolves the implementation ambiguities before the production-blocker wave. Cortex remains project memory only. Product memory remains the server-side Graphiti/Zep direction and must not be replaced by Cortex.

## Production Target

- First production meaning: real patient/member usage under HIPAA controls.
- First production user: patient/member.
- First successful real workflow: bill verification flow, including physical mail or bill photo intake.
- First user surface: regular-user chat/PWA, separated from the operator dashboard.
- Operator dashboard role: proof cockpit for API, safety, memory, browser, audit, retention, and visual evidence.

## Postgres Contract

- Postgres becomes the production default for runtime state.
- First migration scope:
  - sessions,
  - tasks,
  - approvals and audit,
  - source pointers and evidence metadata,
  - uploaded document metadata,
  - generated-skill queue and executor state,
  - browser session state.
- Production retention target: 5 years.
- Production backup/restore target: encrypted cloud backup plus restore drill. Local Docker backup remains development proof only and cannot satisfy production PHI readiness.

## Graphiti/Zep Schema-First Memory Contract

- Store both generalized procedural learning and user-specific longitudinal context.
- Allowed memory facts:
  - plan patterns,
  - procedure playbooks,
  - user clinical preferences and conditions,
  - prior successful journeys,
  - provider and network discoveries.
- Graphiti/Zep schema-first memory is the required next memory posture. The attached schema prompt is authoritative for the next memory implementation slice. The memory phase must implement schema contracts first: entities, edges, group IDs, temporal rules, privacy filters, ingestion envelopes, retrieval primitives, seeded Ralph loop templates, migrations, and tests.
- Every successful case should create a memory episode and candidate exemplar. It must not automatically create production-driving skills without review.
- PHI evidence payloads must stay out of graph memory. Graph memory stores pointer plus hash plus safe metadata.

## Remote Browser And OpenClaw Auth

- First deployment path: self-hosted Steel on AWS EC2 infrastructure.
- The user live block should show an interactive viewer and takeover controls.
- Allowed agent actions without human takeover are read-only:
  - navigate allowlisted pages,
  - read page content,
  - click safe tabs or menus,
  - download documents only when the document approval path allows it.
- Always human-only:
  - credentials,
  - passkeys,
  - 2FA,
  - captcha,
  - form submission,
  - payer contact,
  - uploads,
  - irreversible account or record changes.
- Portal login state may persist between sessions as browser session/cookies, but credentials must never be stored or entered by the agent.
- If login expires mid-task, the system must be transparent, use stale evidence only with an explicit warning, and request user takeover before making fresh portal claims.

## Skill Contract

Production-critical first skills:

- insurance portal browser,
- claim journey,
- Aetna plan,
- prior authorization preparation,
- denial appeal,
- procedure preparation,
- provider network,
- pharmacy/formulary.

Every skill candidate must contain tools, extractors, verifiers/sensors, controller loop, UI blocks, memory retrieval rules, and tests.

Generated skills may be operator-activated in staging or reviewed queue contexts. Production activation requires versioned review, PR/audit trail, rollback/kill switch, and deterministic safety gates.

## Final Answer Contract

- LLM-sourced composition is the preferred final-answer path whenever cited evidence exists.
- Deterministic fallback is allowed only when evidence is unavailable, model credentials are unavailable, or validation rejects unsupported claims.
- Regular users should see:
  - a clear answer,
  - step-by-step plan,
  - confidence/reliability label,
  - what was verified,
  - what could not be verified,
  - next action.
- Required source-pointer citations apply to factual claims about bills, claims, coverage, price, provider network, pharmacy/formulary, documents, portal state, and dates. Generic process guidance does not need citation.

## Exception Contract

- Missing evidence: give a best-effort bounded answer, ask for missing documents or login, start an approved worker browser task when appropriate, and use de-identified trusted research when safe.
- Medical advice: deny/decline and route to clinician or emergency guidance as appropriate.
- Portal text conflicts with uploaded document: human review required.
- Memory conflicts with current evidence: current evidence wins, and human loop records the decision.
- Browser sandbox fails: be transparent about the blocker and next action.

## Success Criteria

The production-ready version must prove:

- patient chat/PWA works separately from the dashboard,
- bidirectional progress feedback at every step,
- bill photo/upload intake with extraction and missing-info follow-up,
- no-login general explanation fallback,
- de-identified parallel research over trusted plan docs and safe public sources,
- LangChain/LangGraph final composition with reliability and confidence labels,
- Postgres production/default rollout,
- Graphiti/Zep schema-ready memory,
- remote browser production readiness,
- authenticated user-controlled OpenClaw proof,
- API readiness,
- dashboard proof,
- deterministic safety/HIPAA posture.

## Phase 66 Gate

`buildPhase66ProductionContractProof()` must score 100/100 before Phase 67 starts. The operator dashboard exposes this as `phase66_production_contract`.
