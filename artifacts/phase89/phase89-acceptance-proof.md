# Phase 89 acceptance proof — early no-signature connectors

Branch: `phase-89-early-connectors`.
Plan: `docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md` §9 / §11 Phase 89.
Date: 2026-07-03. All proofs are REAL runtime runs against REAL external systems —
the live Aetna Transparency-in-Coverage egress bucket, the live Humana Plan-Net R4
server, the real 2.5 GB CMS 2026-Q1 PDP PUF release, live cms.gov Medicare Coverage
Database pages, LIVE Postgres 16 parity, and the LIVE gpt-4.1 planner. No mocks, per
`docs/NON_MOCKED_PROOF_RULES.md`.

## Acceptance arms (§11 Phase 89)

| Arm | Result | Evidence |
|---|---|---|
| **ENTRY GATE: first unauthenticated MRF fetch** | **PASS (VERIFIED LIVE)** | `mrf-entry-gate-transcript.md` + headers file — probe chain per the plan (transparency.aetna.com 200 → health1.aetna.com 200 → **mrf.healthsparq.com egress bucket 200 UNAUTHENTICATED**): `latest_metadata.json` sha256 `8cd92b0f…`, 7,068,263 bytes, **12,030 file entries**, reportingEntityName "Aetna Life Insurance Company", lastUpdatedOn 2026-07-05. The previously UNVERIFIED external claim is now verified; `external_blocked` NOT triggered. |
| Live public Plan-Net CapabilityStatement + ≥2-page real Bundle pagination | PASS (live) | `phase89-directory-live.test.mjs` — Humana public Plan-Net (`fhir.humana.com/api`, R4 4.0.1, unauthenticated; 231,884 real cardiology PractitionerRoles): CapabilityStatement fetch, TWO real pages via the server's next-links (opaque continuation quirk recorded in `connector_endpoints.quirks_json`), ≥40 real rows into `provider_directory_entries`, idempotent re-sync (0 new). Langfuse span coverage: the sync runs under the existing observed-node/audit rails; page URLs recorded per sync. |
| Live `/api/chat`-equivalent: "find an in-network cardiologist near 33143" routes via the REAL planner and cites stored source URLs | PASS (live gpt-4.1) | same file arm 2 — the live planner selects `provider_network_navigation` (conf 1.0) + offers `process:provider_network_search`; the run carries CITED `provider_directory_entries#…` pointers whose `sourceUrl`s are the real `fhir.humana.com` search URLs; the composed answer references the directory evidence + the confirm-before-booking note. (Same-corpus eval case: routed correctly with conf 1.0 in the recorded run.) |
| One real Aetna in-network MRF slice ingested with filename-hash provenance + idempotent re-run | PASS (live) | `phase89-mrf-pipeline.test.mjs` (3/3) — real 195,123,001-byte in-network file (`…2026-07-05_pl-8h-tr25_Aetna-Life-Insurance-Company.json.gz`, month 2026-07) STREAM-parsed (gunzip over the fetch stream, brace-depth incremental extractor, ~4.2 MB compressed actually read, truncation logged LOUDLY); 50 real observations via the `mrfPricing.mjs` OWNER API only; provenance = source row URL + deterministic content hash; re-run 0 new. Hermetic extractor arms incl. `"}]"`-in-string and desync-fail-loud. |
| Cost question answered WITH source pointer + disclaimer, coverage-number guard | PASS (live) | `phase89-cost-pa-arms.test.mjs` arm 1 — consent flipped (mrf_pricing_lookup_approved), real slice streamed, the run carries `mrf_price_observations#…` pointers and the composed answer contains the MANDATORY non-guarantee disclaimer + the pointer line. Real fix landed: `queryMrfPriceEvidence` payer clause is a PREFIX family match ("Aetna" → "Aetna Life Insurance Company"). |
| Current PUF loaded with PER-TABLE proofs for ALL FOUR `pdp_*` tables | **PASS — nothing deferred** | `phase89-pdp-puf.test.mjs` (5/5) — the REAL 2026-Q1 quarterly release (`SPUF_2026_20260408.zip`, 2,504,003,692 bytes at data.cms.gov) read via HTTP Range against the live zip (~299 MB transferred): pdp_plans 142 / pdp_formulary 20,000 / pdp_pharmacy_network 20,000 / pdp_pricing 20,000 real rows (FL slice, real Aetna Health Inc. (FL) contract H1609). (1) tier question: RXCUI 1551300 (Trulicity) → tier 3 + PA flag + dataset pointer; (2) pharmacy-network question: real pharmacy id → in-network retail non_preferred + pointer; (3) Part D cost: NDC 00002143380 30-day → unit_cost 489.9064 + pointer; (4) idempotent re-ingest 0 new ×4 tables; (5) missing-release → exit 1 classified `pdp_release_files_missing`. |
| PA-requirement question answers `evidence_sourced` citing a stored policy pointer | PASS (live) | `phase89-pa-corpus.test.mjs` (2/2) + `phase89-cost-pa-arms.test.mjs` arm 2 — polite crawler (robots.txt-obeying, honest UA, sequential+delay) ingested the REAL CMS LCD **L36575 (Total Knee Arthroplasty)** + NCD pages through the EXISTING research pipeline (`extracted_pending_review` → the existing `reviewResearchArtifact` operator approval → `trusted_evidence_found`); the PA turn answers `captured_trusted_research_evidence` citing `research_artifacts#…`. Aetna CPB pages: Incapsula WAF challenge → classified skip `pa_policy_bot_challenge_interstitial` (never stored as policy evidence — honest, pinned for when plain HTML returns). |
| PA packet-prep Part 1 | PASS | `pasPacket.mjs` — `buildPaPacketPreparation` composes ONLY from stored cited evidence + the masked plan identity into an `agent_tasks` row `prepared_for_review` with the prepare-only disposition text; audited `pa_packet.prepared_for_review`. Part 2 (PAS $submit) stays Phase 92 signature-gated. |
| Probe job write→read-back changes feasibility | PASS | `phase89-fhir-endpoint.test.mjs` (3/3) — `connectorFeasibility` false→true flips ONLY via the stored `probeConnectorEndpoint` fact; unreachable endpoint stores classified `error` (readiness is a probed stored fact, never an env switch). |
| `eval:planner` extended, no regression | PASS | corpus extended to 8 cases (cardiologist + CPT-27447 cost). Across the two recorded runs every case passes with correct routing (cardiologist conf 1.0 → the new process; knee-cost → `cost_estimate_navigation` + `process:cost_estimate_lookup`); each run's 1-2 misses are ALL the instrumented `mode=openai_chatopenai_failed` transient (root-caused in Phase 88), `capability source 8/8 (100%)` both runs. Both logs committed. |

## Landings

- 6 new tables (schema + TABLES + live-PG parity — **85 tables**, regenerated from live
  introspection): `connector_endpoints`, `provider_directory_entries`, `pdp_plans`,
  `pdp_formulary`, `pdp_pharmacy_network`, `pdp_pricing`. (`connector_oauth_grants` /
  `member_data_rails` defer to Phase 90 with their proofs, per §12.1.)
- Shared substrate: `connectors/fhirClient.mjs` (R4 GET, next-link async iterator,
  429/Retry-After backoff, per-host throttle), `connectors/endpointRegistry.mjs` (+probe),
  `connectors/planNetDirectory.mjs` (sync + deterministic query extraction + zip-relax),
  `connectors/mrfPipeline.mjs` (+`scripts/ingest-mrf.mjs`), `scripts/sync-provider-directory.mjs`,
  `scripts/ingest-pa-policy-corpus.mjs`, `scripts/ingest-cms-pdp-puf.mjs`, `connectors/pasPacket.mjs`.
- Seed v5: `provider_network_navigation` + `cost_estimate_navigation` workflows (allowedWorkflows
  now 10), `process:provider_network_search` + `process:cost_estimate_lookup`; the
  `provider_directory_public_api` + `prior_auth_requirements_api` registry rows FLIP to
  implemented/selectable — with their real proofs, never before (§7.0 derivation).
- Evidence path: directory evidence joins the trusted pool (workflow-gated, deterministic
  specialty/ZIP extraction — Humana's chained postal-code search 504s, so geography filters
  at query time, recorded as quirk data); MRF answers carry the mandatory disclaimer;
  directory answers carry the confirm-with-office note.

## Full gates (recorded 2026-07-03)

- `npm run test:local` (final): **436 tests · 429 pass · 0 fail · 7 gated skips** (new in-suite
  gates: `phase89-fhir-endpoint` 3/3, `phase89-pdp-puf` — per-table arms skip-loud without the
  downloaded slice, negative arm always runs). Log: `test-local-final.log`.
- `npm run test:phase89:live`: directory 2/2 · mrf-pipeline 3/3 · pa-corpus 2/2 · cost/pa arms 2/2.
- `npm run build` green; schema parity 3/3 incl. live Postgres (85 tables).
- Founder items untouched by design: buy-vs-build stays self-build (thresholds not tripped);
  MRF legal-owner review list stands before any consumer display/redistribution; Aetna
  Plan-Net OAuth + Patient Access sandbox remain founder portal-registration actions (S1).
