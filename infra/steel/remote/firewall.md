# Steel Remote Host Firewall Runbook

This runbook is for Phase 30 self-hosted Steel on infrastructure owned or directly controlled by the operator. Runtime hostnames, IP allowlists, admin addresses, BAA-sensitive identifiers, and secrets stay outside Git under host-local configuration.

## Inbound Policy

- Allow `22/tcp` only from approved admin IPs.
- Allow `443/tcp` only from backend egress IPs.
- Drop all public access to Steel `3000/tcp`.
- Drop all public access to `9223/tcp`.
- Drop all other inbound traffic by default.

`443/tcp` reaches only the reverse proxy, which also enforces the `@allow_backend` allowlist. The Steel API container binds `127.0.0.1:3000`, and the browser debugger binds `127.0.0.1:9223`.

## Outbound Policy

Use a default-drop outbound profile and add explicit allowlist entries for:

- ACME endpoints needed by the TLS reverse proxy.
- `ghcr.io` and required registry hosts for pulling the pinned Steel images.
- Non-PHI acceptance target `example.com` for Phase 30 lifecycle proof.
- Later payer-portal hosts only after the approval and PHI review gates authorize them.
- OS package mirrors required for security patches.

Everything else should drop. The host firewall is defense in depth beside the adapter's `networkPolicy.offsiteFailClosed`; neither replaces the other.

## Verification

From an unapproved network, `curl https://STEEL_REMOTE_HOST/v1/health` must return `403` or fail.

From an approved backend egress address, `curl https://STEEL_REMOTE_HOST/v1/health` must return `{"status":"ok"}`.

From any public network, probes to Steel `3000/tcp` and `9223/tcp` must fail.

Record only pass/fail refs in acceptance artifacts. Do not commit firewall outputs containing real IPs, hostnames, tokens, or account identifiers.
