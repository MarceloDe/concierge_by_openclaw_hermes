# Initial Application Security Review — 2026-07-11

Status: completed with disclosed external/readiness limitations

Reviewed branch: `phase-90-mid-connectors`

Reviewed starting commit: `ca69628`

Owner: Brainsty Healthcare LLC founder and CEO

## Scope

This initial review establishes the annual-review baseline for the
Brainstyworkers AI Concierge before Aetna Patient Access sandbox registration.
It covers dependency health, build integrity, database safety, PHI masking,
outbound egress, approval-gated browser/write behavior, retention, member OAuth
consent design, and identity-assurance claims.

## Automated evidence

The following checks were run locally on 2026-07-11:

| Check | Result |
| --- | --- |
| `npm audit --audit-level=moderate` | PASS — 0 vulnerabilities after remediation |
| `npm run build` | PASS |
| `npm run test:db:safety` | PASS — 16/16 |
| `npm run test:phi` | PASS — 1/1 |
| `npm run test:egress` | PASS — 4/4 |
| `npm run test:execution:v2` | PASS — 11/11 |
| `npm run test:retention` | PASS — 2/2 |

The first dependency scan found the Vite 5/esbuild development-server advisory.
Vite was upgraded to the patched `^6.4.3` line, the lockfile was regenerated,
and the audit, build, and targeted security tests were rerun successfully.

## Manual control review

- PHI: direct identifiers are masked before outbound model/tool payloads; raw
  portal text is blocked from memory-bound egress; safe source pointers remain.
- Consent: the runtime has explicit consent-grant interrupts, bounded single-use
  approval tokens, audited grant consumption, fail-closed consent state, and
  consent-linked OAuth grant metadata. The Aetna member authorization/consent
  redirect remains part of the Phase 90 Part 2 implementation.
- Secrets: OAuth tokens are encrypted through the secret-backend interface;
  local secret files are limited to development/closed-pilot use. Managed
  KMS/Vault remains mandatory before broad external users or long-lived
  production Layer 2 tokens.
- Browser/write boundary: agent credential entry is prohibited; human takeover
  and every write action remain approval-bound, exact-action, expiring, and
  single-use. Committed write flags default off.
- Retention/audit: retention sweeps and audit proof are tested. Production
  operating procedures still require deployment-specific validation.

## Aetna questionnaire determinations

- Follow OWASP Top 10 and CWE/SANS Top 25: **Yes** — adopted commitment and
  repeatable review evidence; not represented as certification.
- Application standards reviewed at least annually: **Yes** — policy adopted,
  initial review completed, next review scheduled for 2027-07-11.
- Obtain informed user consent before Patient Access API access: **Yes** — the
  product contract and runtime gates require consent before member-authorized API access.
- NIST SP 800-63A IAL2 identity proofing: **No** — the product does not collect,
  validate, and bind authoritative identity evidence at IAL2 and has no qualifying CSP.
- Credential Service Providers: **Not applicable** for IAL2. Aetna authenticates
  the member during the payer OAuth authorization flow; that does not make
  Brainsty an IAL2 identity-proofing service.

## Open findings and release boundaries

| Finding | Severity | Disposition |
| --- | --- | --- |
| Aetna Patient Access sandbox OAuth facade and real test-member proof are not complete | High readiness | Phase 90 Part 2; block readiness claim until real sandbox proof passes |
| No IAL2 identity-proofing capability or CSP | Informational | Answer `No`; do not claim IAL2 |
| Managed KMS/Vault not proven for broad external production PHI/token use | High production | Closed-pilot secret-file backend only; Phase 91 production gate |
| Prior Authorization submission lacks provider delegation/contract | External blocked | Packet preparation only; PAS submission remains Phase 92 signature-gated |
| No independent penetration test has been completed | Moderate | Required before broad external production launch |

## Review conclusion

The sandbox registration may proceed with the questionnaire answers above. This
review does not authorize production PHI processing, IAL2 claims, provider PAS
submission, or any signature-gated integration. Those remain explicitly blocked
until their documented gates and real-runtime proofs pass.
