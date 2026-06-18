# Steel Remote Patching Cadence

This runbook is for the self-hosted Steel remote browser host. It uses placeholders only; hostnames, IPs, account identifiers, keys, tokens, and allowlists stay on the host or in private operator configuration.

## Cadence

- Review Steel API and UI image digests weekly.
- Review Chrome/Chromium security advisories weekly.
- Review critical Chrome/Chromium CVEs within 24 hours.
- Never deploy `latest`; pin image digests.
- Keep the previous known-good digest set available for rollback.

## Patch Sequence

1. Record the currently deployed digest set in the private operations log.
2. Stage a compose change with explicit image digests.
3. Deploy to the remote Steel host.
4. Verify local health on the host.
5. Verify TLS health from the backend egress position.
6. Run:

```bash
npm run sandbox:browser:steel-remote-readiness
npm run sandbox:browser:steel-ops-drills
```

7. Capture dashboard proof without raw frames, raw screenshots, raw OCR text, input values, tokens, hostnames, or IPs.

## Rollback

Rollback is required when any of these fail:

- TLS health
- CDP tunnel reachability
- ten-check lifecycle proof
- screenshot or OCR ref-only proof
- human takeover approval proof
- PHI redaction proof
- host firewall proof

Rollback to the previous digest set, restart Steel, run `infra/steel/remote/recover.sh`, and rerun the full Phase 30 lifecycle harness before restoring remote-host readiness.
