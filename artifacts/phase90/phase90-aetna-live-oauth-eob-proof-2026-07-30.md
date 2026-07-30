# Phase 90 Aetna Live OAuth and EOB Proof

Date: 2026-07-30

## Classification

Real Aetna VTE sandbox proof using Aetna-issued synthetic test-member data.
No production member, PHI, access token, client secret, or synthetic credential
is recorded in this artifact.

## Observed runtime proof

- The approved Third-Party Developer application completed Aetna's real
  authorization-code flow through the member authorization page.
- The single-use OAuth state was consumed by the local callback.
- The connector exchanged the code through Aetna's real sandbox token endpoint.
- The independent sync read 43 Coverage resources and 45
  ExplanationOfBenefit resources.
- The application persisted an eligibility snapshot and 45 claim pointers, then
  recorded the member rail as `api_covered`.
- A later independent Node process rebuilt the member context from PostgreSQL
  and recovered two snapshot pointers plus six bounded claim pointers. This
  proves cross-process read-back rather than same-call return-value reuse.
- Aetna's synthetic response supplied no `Coverage.costToBeneficiary` or
  `ExplanationOfBenefit.benefitBalance` values, so zero coverage-balance rows
  were persisted. The connector does not fabricate missing balances.
- The callback emitted classified OAuth-completed and sync-completed audit
  events without storing raw tokens in application database columns.

## Sandbox interoperability hardening

Aetna's VTE sandbox rejected otherwise conventional search parameters used in
the initial implementation: `_count` on Coverage/EOB and Coverage
`_revinclude`. The connector now performs the sandbox reads without those query
parameters. Focused contract tests cover the accepted request shape, persisted
read-back, single-use state, expiry, and repeat-sync idempotency.

The planner constitution now treats persisted Patient Access Coverage/EOB
pointers as authenticated Layer 2 member evidence. It must not force Layer 3
portal control merely because current claim evidence arrived through the
preferred API rail.

A later live OpenAI planner invocation in a separate process normalized as a
valid decision with six persisted claim pointers in its context. The focused
contract test locks the Layer 2-before-Layer 3 rule.

## UM scope boundary

The Aetna authorization page stated that its current data transfer supports
Medicare member data. That screen and the approved developer application do not
prove that the University of Miami self-funded/TPA employer plan is eligible.
The plan remains `portal_only` until written Aetna and UM plan-administrator
confirmation follows:

`docs/runbooks/AETNA_UM_PATIENT_ACCESS_SCOPE_DETERMINATION.md`

## Remaining Phase 90 gaps

- Live five-minute token expiry followed by classified `reauth_required`.
- PDex formulary connector/live proof.
- Stedi free test/mock `contract_ready` proof.
- Written UM plan/product scope determination.
- A synthetic member or Aetna response that contains real balance fields, if
  Aetna can provide one; absent data must continue to remain absent.

## Verification

- `npm run test:phase90:aetna`: 6 passed, 0 failed.
- Focused LangGraph runner/decision/ledger suite: 31 passed, 0 failed.
- `npm run test:local` with the established local Graphiti and captured-fixture
  test profile: 452 total, 445 passed, 0 failed, 7 expected skips.
- `npm run security:review`: passed.
- `npm run build`: passed.
- `npm audit --audit-level=moderate`: zero vulnerabilities.
- `git diff --check`: passed.
