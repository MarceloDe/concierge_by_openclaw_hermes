# Phase 90 Part 1 acceptance proof — S1-independent substrate (mid connectors)

Branch: `phase-90-mid-connectors`. Plan: §5.2 / §9 / §11 Phase 90. Date: 2026-07-03.

## What this Part covers — and the HARD EXTERNAL GATE it stops at

Phase 90's full acceptance requires "a full real sandbox OAuth code flow with an Aetna
test member" — that is **BLOCKED on founder action S1** (self-service
developerportal.aetna.com registration: account → app + callback URL → Provider
Directory + sandbox Patient Access product subscriptions → third-party questionnaire →
click-through ToU → download test-member credentials + client id/secret). No code can
substitute for the registration. This Part lands everything the plan allows WITHOUT S1,
each piece with its own real proof (§12.1 — no table lands for later):

| Landed | Proof |
|---|---|
| `connector_oauth_grants` + `connectors/tokenVault.mjs` (the §5.2 vault split — API rail, distinct from the browser-rail vault) | `phase90-token-vault-rails.test.mjs` — REAL AES-256-GCM encryption via the ONE secret backend; ciphertext-only in the table (raw-token grep), hash-verified dereference, **expiry flips `reauth_required` + audits the reconnect ask (never a silent retry — founder #8)**, revoke destroys the secrets. |
| `member_data_rails` + rail probe (`recordMemberDataRail`/`memberDataRail`) | same file — fail-closed `portal_only` for unprobed members; **LIVE arm: the Aetna sandbox Patient Access `/metadata` answers 200 UNAUTHENTICATED** (`vteapif1.aetna.com/fhirdemo/v1/patientaccess`) — endpoint + probe recorded in `connector_endpoints` (quirks: no sandbox refresh tokens / 5-min access life / S1 registration gate) and the honest pre-S1 rail (`portal_only`, probe-evidence pointer) stored as DATA. The `api_covered` flip happens ONLY via a real member read post-S1. |
| Catalog reshuffle (seed v6): `process:formulary_lookup`, `process:eligibility_snapshot_refresh`, `process:pa_packet_preparation` (13 processes) — `process:pharmacy_formulary_lookup` KEPT per §10 item 23 | seeded + offerable; rail-filtering is catalog data (pre-S1 every member is `portal_only`, so portal processes stay the offered route). **Real fix landed:** `selectProcessForWorkflow` now binds DETERMINISTICALLY by `display_order` (canonical spine first) — dual-process workflows no longer bind the ledger arbitrarily. |
| Schema: 2 new tables (87 total), live-PG parity regenerated | schema-parity 3/3 incl. live Postgres. |

## Deferred to Part 2 (post-S1) — loud, enumerated

Aetna sandbox OAuth authorization_code flow + test-member EOB fetch persisting
`claim_items`/`coverage_balances`; the 5-min token-expiry live arm (the vault's expiry
machinery is already proven); PDex Formulary facade live reads; the Stedi mock-sandbox
facade (`contract_ready` label) — Stedi self-serve signup is also a founder account
action; reseed + rail-filtered eval arms.

## Gates

- `npm run test:local`: **438 tests · 431 pass · 0 fail · 7 gated skips** (new blocking
  gate `phase90-token-vault-rails` 2/2 with the LIVE sandbox-metadata arm).
- `npm run build` green; parity 87/87 live-PG.
