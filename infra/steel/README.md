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
- Do not commit provider env files, tokens, screenshots, OCR text, or browser artifacts.
- Use `https://example.com` or another non-PHI public page for lifecycle proof.
- If a login, captcha, or payer portal appears, stop and request human takeover through the approval contract.
