# Phase 28A Steel Browser Sandbox

This local-only Steel Browser deployment is the first self-hosted `BrowserSandboxProvider` target for Phase 28A.

## Images

- `ghcr.io/steel-dev/steel-browser-api@sha256:6b65d776e17950c804c92fa49b66b5b1a335e997786fbc2a80cc11cdd650982e`
- `ghcr.io/steel-dev/steel-browser-ui@sha256:d356f19d0dba3297f5b3a3d431650477b20e3fe95be8b201092eda2af41e624b`

The upstream Docker docs use `latest`; this compose file pins immutable GHCR manifest digests so local proof is reproducible.

## Run

```bash
docker compose -f infra/steel/compose.yaml up -d
docker compose -f infra/steel/compose.yaml ps
curl -s http://127.0.0.1:3000/v1/health
```

Expected health response:

```json
{"status":"ok"}
```

## Local URLs

- Steel UI: `http://127.0.0.1:5173`
- Steel API health: `http://127.0.0.1:3000/v1/health`
- Steel CDP: `ws://127.0.0.1:9223`

## Safety

- Ports bind only to `127.0.0.1`.
- `SKIP_FINGERPRINT_INJECTION=true` is set for this pinned image because the current Steel image can fail closed during fingerprint generation with Chrome 146 on local Docker.
- `LOG_STORAGE_ENABLED=false` is the default. Do not persist browser logs, raw frames, raw screenshots, OCR text, or input values from healthcare or insurance sessions.
- Remote applications must go through the FastAPI connector. Do not expose Steel API, UI, or CDP directly to public networks.
- Keep direct CDP access loopback-only. If this provider is deployed on a remote host, put the FastAPI connector, auth, audit, approvals, and stream proxy in front of it instead of publishing Steel ports.
- Keep concurrency small for the local self-host profile. The operations contract caps this profile at two concurrent sessions, a 30 minute maximum session TTL, and a 5 minute idle timeout.
- Always release stale sessions. Use provider teardown during normal operation, and use `docker compose -f infra/steel/compose.yaml down` to stop the local Steel stack after proof runs.
- Do not commit provider env files, tokens, screenshots, OCR text, or browser artifacts.
- Use `https://example.com` or another non-PHI public page for lifecycle proof.
- If a login, captcha, or payer portal appears, stop and request human takeover through the approval contract.

## Operations Gate

Run the static operations gate after changing Steel config:

```bash
npm run sandbox:browser:steel-operations
```

For a local live probe after Docker is running, keep the endpoint values in private env and run:

```bash
WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_READY=1 \
WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_LIVE_PROBE=1 \
WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL=http://127.0.0.1:3000 \
WEFELLA_BROWSER_SANDBOX_CDP_URL=ws://127.0.0.1:9223 \
WEFELLA_BROWSER_SANDBOX_VIEWER_URL=http://127.0.0.1:5173 \
npm run sandbox:browser:steel-operations
```

The static gate can prove the production-hardening contract. The live probe only checks local Steel API, CDP, and viewer availability; it still does not unlock final `hosted_remote_browser_sandbox` readiness.
