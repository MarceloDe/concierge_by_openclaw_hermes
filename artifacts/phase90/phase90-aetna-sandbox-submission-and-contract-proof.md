# Phase 90 — Aetna Sandbox Submission and Contract Proof

Date: 2026-07-11

Branch: `phase-90-mid-connectors`

Readiness label: `contract_ready_external_approval_pending`

## Portal proof

- Submitted the Aetna **Third Party Developer** sandbox questionnaire through
  the authenticated Aetna Developer Portal.
- The portal displayed `Submission Successful!` and stated that the Aetna
  Interoperability team will review the subscription within 2–4 business days.
- Questionnaire security answers were grounded in
  `docs/security/reviews/2026-07-11-initial-application-security-review.md`:
  annual standards review `Yes`, informed consent `Yes`, IAL2 `No`, and no IAL2 CSP claim.
- No client ID, client secret, test-member credential, token, or PHI is stored in
  this artifact.

## Implemented contract path

- `src/concierge/connectors/aetnaPatientAccess.mjs`
  - official sandbox authorization and token endpoints;
  - exact sandbox audience and `launch/patient patient/*.read` scope;
  - Basic-auth authorization-code exchange;
  - expiring, session-bound, single-use OAuth state;
  - encrypted OAuth grant storage through `tokenVault.mjs`;
  - Patient, Coverage, and ExplanationOfBenefit reads;
  - persistence into `eligibility_snapshots`, `claim_items`, and
    `coverage_balances`;
  - `api_covered` rail fact only after a successful member read.
- `src/server/server.mjs`
  - `POST /api/connectors/aetna/oauth/start`;
  - `GET /api/connectors/aetna/oauth/callback`;
  - secret-file-only client credential reads.

## Proof executed

- `node --test src/tests/phase90-aetna-patient-access.test.mjs`: 3/3 pass.
- `npm run build`: pass.
- `npm run security:review`: audit 0 vulnerabilities, build pass, 34/34
  targeted security tests pass.

The local HTTP contract test is not reported as live Aetna readiness. It proves
request shape, state replay protection, ciphertext-only token persistence, FHIR
normalization, database read-back, and member-rail behavior. The mandatory real
sandbox proof remains blocked until Aetna issues the application credentials and
test member after review.

## Remaining real-runtime proof

1. Create the sandbox application after Aetna approval.
2. Subscribe to Patient Access and the applicable Third-Party products.
3. Store the client ID, client secret, and test-member file in local secret files.
4. Register the exact callback URL.
5. Execute one real member authorization-code flow.
6. Read back the persisted EOB and coverage balance in a later live turn.
7. Let the ~5-minute token expire and prove `reauth_required` without stale retry.
