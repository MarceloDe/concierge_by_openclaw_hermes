# AWS HIPAA Substrate

Status: Phase 30 accepted production-candidate substrate, with live values intentionally outside Git.

This repository now records the non-secret architecture fact that the hosted browser sandbox substrate exists on operator-managed AWS infrastructure under the operator's AWS Business Associate Addendum. The absence of committed AWS account data, Terraform state, hostnames, IP addresses, WireGuard keys, TLS material, SSH keys, Caddy secrets, API tokens, and runtime endpoint URLs is a deliberate HIPAA/security control, not evidence that the substrate is missing.

## Accepted Substrate

Phase 30 established a dedicated AWS EC2 Steel Browser host in `us-east-1` for the remote browser sandbox path. The accepted topology is:

- AWS EC2 host managed by the operator under AWS BAA.
- Steel API/UI running in Docker.
- Caddy TLS in front of the allowed Steel HTTPS surface.
- IP allowlist at the host/security boundary.
- WireGuard private CDP tunnel for debugger access.
- CDP never exposed to the public internet.
- Screenshot, OCR, stream, input, and lifecycle proof emitted as refs only.
- Human takeover remains required for credentials, 2FA, captcha, and login screens.

The accepted proof artifact is:

- `artifacts/phase30/steel-remote-live-lifecycle-2026-06-18T22-29-22-865Z.json`

That artifact reports `steel_remote_host_lifecycle_verified`, `10 / 10` remote lifecycle checks, `20 / 20` deployment checks, `100 / 100`, public TLS proof, private CDP tunnel proof, host firewall proof, ref-only screenshot/OCR behavior, human takeover required, and no raw endpoint, secret, frame, image, OCR text, or input return.

## In-Repo Non-Secret Templates

The committed template/runbook surface is:

- `infra/steel/remote/compose.yaml`
- `infra/steel/remote/Caddyfile`
- `infra/steel/remote/firewall.md`
- `infra/steel/remote/wireguard.md`
- `infra/steel/remote/recover.sh`
- `infra/steel/remote/patching.md`
- `infra/steel/remote/backup-restore-drill.sh`
- `infra/steel/remote/health-alerts.example.json`
- `infra/steel/remote/oncall-handoff.md`
- `project/deployment/browser-sandbox-provider.steel-operations.example.json`
- `project/deployment/browser-sandbox-provider.private-launch-execution.example.env`

These files intentionally contain placeholders and policies only. Real endpoint values, hostnames, IP allowlists, AWS identifiers, key material, provider tokens, runtime JSON, and visual proof manifests remain outside Git.

## Current Committed Defaults

Committed config remains non-live:

- `adapter.mode` stays `contract_only` or template-only unless private runtime JSON selects a provider.
- `project/deployment/browser-sandbox-provider.steel-operations.example.json` stays `operations_contract_only`.
- `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0`.
- `WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY=0`.
- `WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED=0`.
- `WEFELLA_EXECUTION_WRITE_ENABLED=0`.

## Audit Interpretation

A code-only re-audit should read this as:

1. AWS/BAA remote Steel substrate exists and has accepted Phase 30 proof.
2. Secret-bearing deployment state is intentionally not committed.
3. The committed repo proves the contract, runbooks, safety posture, and artifact references without leaking deployment details.
4. Live operation still requires private configuration, proof gates, and human/compliance enablement outside Git.
