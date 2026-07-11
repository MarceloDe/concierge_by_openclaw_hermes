# Annual Application Security Review Policy

Status: adopted 2026-07-11

Owner: Brainsty Healthcare LLC founder and CEO

Next scheduled full review: 2027-07-11

## Purpose and scope

Brainsty Healthcare LLC reviews the Brainstyworkers AI Concierge security
standards at least annually. The review covers application code, dependencies,
authentication and consent, PHI handling, OAuth secrets and tokens, databases,
browser automation, external connectors, deployment configuration, audit,
retention, incident response, and software-supply-chain controls.

The review uses the current applicable versions of:

- OWASP Top 10 and OWASP Application Security Verification Standard (ASVS).
- The current MITRE CWE Top 25 (historically called the SANS/CWE Top 25).
- NIST SP 800-218 Secure Software Development Framework (SSDF).
- NIST SP 800-63 requirements only for assurance levels the product actually
  claims. The product does not currently claim or perform IAL2 identity proofing.

This policy is a review and continuous-improvement commitment. It is not a claim
of third-party certification.

## Cadence and trigger events

A full review is required at least every 12 months. An out-of-cycle review is
also required after any of the following:

- A material PHI, OAuth, identity, authorization, storage, or browser-control change.
- A new production payer, provider, clearinghouse, EHR, or credential-service integration.
- A security incident, suspected data exposure, or critical/high dependency advisory.
- A major infrastructure migration or material change to the trust boundary.
- A material revision to an applicable security or healthcare requirement.

Dependency and vulnerability scanning runs more frequently than the annual
review and must run before production releases.

## Required review evidence

Each review must record:

1. The reviewed commit and system scope.
2. Framework versions and checklist coverage.
3. Automated dependency, build, database-safety, PHI, egress, approval, and
   retention results.
4. Manual review of authentication, authorization, consent, secrets, logging,
   data retention, browser boundaries, and external connectors.
5. Findings with severity, owner, target date, and disposition.
6. Explicit negative claims, including unsupported assurance levels and blocked
   production integrations.

Run the repeatable local evidence bundle with:

```bash
npm run security:review
```

## Finding management

- Critical findings block release and external data access.
- High findings block production release unless formally accepted by the owner
  with a documented time-limited remediation plan.
- Moderate and low findings require an owner and target date.
- A finding is closed only with implementation evidence and a passing regression check.

Review records are stored under `docs/security/reviews/` and retained with the
repository history.
