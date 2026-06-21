# ADR-001: AWS HIPAA Substrate Status

Date: 2026-06-21

## Status

Accepted as production-candidate substrate, with committed defaults still non-live.

## Context

A code-only audit can miss the Phase 30 AWS browser-sandbox substrate because the sensitive runtime material was intentionally kept outside Git. The substrate was established on operator-managed AWS infrastructure under the operator's AWS BAA, using Steel Browser, Caddy TLS, host allowlists, and a private WireGuard CDP tunnel.

## Decision

Record the AWS/BAA substrate in repo documentation without committing any secrets or deployment identifiers.

The accepted non-secret reference artifact is:

- `artifacts/phase30/steel-remote-live-lifecycle-2026-06-18T22-29-22-865Z.json`

The committed implementation and templates remain:

- `infra/steel/remote/*`
- `project/deployment/browser-sandbox-provider.steel-operations.example.json`
- `project/deployment/browser-sandbox-provider.private-launch-execution.example.env`

Absence of AWS account IDs, hostnames, IPs, keys, tokens, WireGuard material, TLS secrets, and BAA identifiers in Git is a deliberate security/HIPAA control.

## Consequences

- Code-only re-audits can see that the AWS/BAA substrate exists and why details are private.
- Live readiness still depends on private runtime configuration and proof gates.
- Committed config must not flip hosted or write gates on by default.
- Any future IaC export must be reviewed for secrets, account identifiers, and BAA-sensitive metadata before commit.
