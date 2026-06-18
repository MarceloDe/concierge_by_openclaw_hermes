# Non-Mocked Product Proof Rules

Status: Phase 32 canonical proof rules.

The project may use fixtures, deterministic unit tests, local harnesses, and simulated providers, but they must be labeled accurately. A mocked or local contract test cannot be reported as live product readiness.

## Allowed Proof Types

- Deterministic unit tests for schemas, validators, policies, database safety, retention, egress, and pure functions.
- Fixture tests for captured formats, source-pointer contracts, and visual/OCR replay manifests.
- Local contract harnesses for provider-style APIs when labeled as contract readiness.
- Live-gated LLM tests that use real credentials and skip or block explicitly when credentials are absent.
- Live browser/OCR/dashboard tests against local, self-hosted, or owned infrastructure when no raw PHI or secrets are committed.

## Forbidden Claims

- Do not call a stubbed LLM response an LLM proof.
- Do not call a local fake provider final hosted-browser readiness.
- Do not call a contract harness a production provider integration.
- Do not call deterministic fallback answer composition a live model-composed answer.
- Do not call Graphiti disabled/degraded mode full product memory.
- Do not call screenshots, OCR text, uploads, or portal text safe for Cortex memory.
- Do not call a PR complete until the required project and Cortex visibility gates are satisfied.

## Required Labels

Use these labels in docs, proof artifacts, and dashboard entries:

- `contract_ready`: local schema/adapter/API contract passes without live external dependency.
- `local_live_ready`: live local or self-hosted proof passes on developer/owned infrastructure.
- `remote_live_ready`: remote owned infrastructure passes from the backend network position.
- `external_blocked`: live proof requires credentials, login, BAA, DNS, firewall, or other external state.
- `production_candidate`: all required proof is green, but final human review or deployment enablement remains.
- `production_ready`: all required proof plus final human review and deployment enablement are complete.

## Live LLM Proof

Live LLM proof must:

- call the real configured model provider;
- pass through outbound payload observation;
- use masked direct identifiers;
- carry source pointers when the claim requires evidence;
- prove model output causally affects route, plan, composition, or validator rejection;
- skip with a clear precondition when credentials are missing.

## Visual Proof

Visual proof is required when a change affects:

- `/mvp`;
- `/`;
- Next.js mobile PWA;
- worker live browser block;
- approval/takeover flow;
- dashboard score or proof panel.

Visual proof must record screenshot or OCR/caption artifacts without committing raw PHI, raw portal text, credentials, session tokens, private hostnames, or provider secrets.

