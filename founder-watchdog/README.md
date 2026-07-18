# Founder Watchdog

Private Codex Site for the Wefella / Brainstyworkers health-insurance concierge. It separates repository implementation proof from current runtime reachability and external authorization gates.

## Refresh and verify

```bash
npm install
npm run generate:watchdog
npm run dev
npm test
```

`scripts/generate-watchdog-manifest.mjs` reads the parent project’s phase ledger, planner spine, Postgres schema snapshot, Redis namespace contract, prompt source, Graphify map, git commit, and safe local reachability probes. It writes a sanitized deploy snapshot to `app/generated/watchdog-manifest.json` and `public/watchdog-manifest.json`.

Only environment-variable names and configured/not-configured booleans are exported. Values, member data, credentials, cookies, tokens, and live prompt payloads are never included.

The hosted Site is intentionally read-only. Real local controls require a separately threat-modeled, authenticated, audited bridge. `runtime_selectable`, safety policy, signature gates, and write approvals must never be arbitrary UI toggles.
