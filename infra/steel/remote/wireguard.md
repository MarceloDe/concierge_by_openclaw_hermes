# Steel Private Tunnel Runbook

Production Phase 30 uses WireGuard for the private browser-debugger path between the backend host and the Steel remote host. Runtime peer addresses, keys, tunnel addresses, and hostnames stay on the hosts under `/etc/workerprototype_openclaw/phase30/`.

## Production Path

1. Create a WireGuard interface on the Steel remote host and a peer on the backend host.
2. Configure the Steel peer so only the backend peer can reach the service bound at `127.0.0.1:9223`.
3. Keep Steel listening on loopback in Docker: `127.0.0.1:9223`.
4. On the backend host, configure the browser sandbox runtime with:
   - `WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL=https://STEEL_REMOTE_HOST`
   - `WEFELLA_BROWSER_SANDBOX_CDP_URL=ws://127.0.0.1:9223`
   - `WEFELLA_BROWSER_SANDBOX_VIEWER_URL=https://STEEL_REMOTE_HOST/v1/sessions/{id}/viewer`
5. Verify that only the backend network position can reach the tunnel endpoint.
6. Run the Phase 30 lifecycle harness against `https://example.com`.

The browser-debugger port is never reverse-proxied and never reachable from the public internet.

## Developer Fallback

For a one-off developer proof, use an SSH local forward from the backend position:

```bash
ssh -L 9223:127.0.0.1:9223 steel-admin@STEEL_REMOTE_HOST
```

Keep this fallback short-lived and interactive. It is not the production path.

## Acceptance Evidence

Acceptance artifacts should contain only opaque refs and booleans:

- private tunnel reachable from backend: pass/fail
- public debugger access blocked: pass/fail
- lifecycle harness result: pass/fail
- no raw frames, OCR text, input values, endpoints, keys, or host-identifying values
