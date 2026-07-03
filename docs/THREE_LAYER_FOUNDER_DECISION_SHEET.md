# Founder Decision Sheet — Three-Layer Planner Pivot (§13 of the implementation plan)

> **STATUS: ALL ITEMS RESOLVED — Founder / 2026-07-02 — full normative detail in `docs/THREE_LAYER_PLANNER_SPINE_CONFIG.yaml`.**
> The spine YAML is the authoritative long form of every decision below; where this sheet and the YAML differ, the YAML wins. The implementation plan §13 has been updated to RESOLVED accordingly.

> Companion to `docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md` §13. Item numbers match §13 exactly.
> **How to use:** for each item, tick ONE option (or write your own answer in the Decision field — free text always wins over the checkboxes), or tick "Need clarification" and write your question; I/coding agents will answer it in the Clarification-answer field before you decide. When a Decision is filled and dated, it becomes binding and §13 gets updated to RESOLVED.
> **Defaults:** the option marked ⭐ is what the plan assumes if you leave the item blank. Items marked 🔴 BLOCK a phase — decide before that phase lands.

> **Global architectural decision (Founder / 2026-07-02, governs several items below):** the system maintains three surfaces — a **Capability Registry** (durable roadmap; MAY contain unimplemented capabilities; visible to coding agents, docs, evals, and planner policy; NO dispatch authority), an **Executable Tool Catalog** (runtime dispatch truth; only real, backed, credentialed, tested, policy-gated tools), and a **Planner Exposure Contract** (what the planner may say/prepare when a capability exists conceptually but cannot execute). LangGraph dispatches ONLY executable tools. No fake "enabled" integrations. Storage realization: plan §7.0.

---

## Already resolved — no action (for reference only)

- **#1** Source documents supplied and reconciled (`docs/THREE_LAYER_PLANNER_PROMPT_DRAFT.md`, `docs/THREE_LAYER_PIVOT_RATIONALE_AETNA_UM.md`).
- **#3** Consent / review / clarification interrupt realization — settled by the draft prompt.
- **#13** No confidence field in the draft — current thresholds (0.5 route / 0.75 band) stand.

---

## A. Blocking decisions (decide first)

### 🔴 #11 — Write-worker catalog visibility (blocks Phase 87)
The claim-submission / form-filler / scheduler workers won't have a real executor until Phase 92. Should the planner see them in the catalog before that?
Context: a visible-but-always-refusing tool row would need an "enabled"-looking `integration_status` to pass the catalog's backing-status gate while being inert — dishonest scaffolding by the repo's own rules.
- [ ] ⭐ **Absent from catalog until Phase 92** — planner cannot select what cannot run; honest catalog. (Plan default.)
- [ ] Visible but refusing — planner can *plan* writes and tell the user "prepared, pending enablement". Requires you to define how the row passes the backing gate honestly.
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Neither listed option — registry/catalog split. Write workers (claim submission, form filler, scheduler) are visible in the **Capability Registry** as `planned`/`contract_ready` with `runtime_selectable:false` until Phase 92; they are NOT in the Executable Tool Catalog and never pass the backing gate dishonestly. The planner MAY classify write intent and PREPARE (packets, work orders, instructions, follow-up tasks) but must NEVER claim an action was performed; all pre-enablement responses are phrased "prepared for review/submission" or "not yet executable by the system". See spine YAML `capability_registry` (claim_submission / provider_scheduling entries) + `planner_exposure_contracts`.
- Decided by / date: Founder / 2026-07-02

### 🔴 #7 — Eligibility "information receiver" standing (decide BEFORE signing the Stedi BAA; gates the whole 270/271 production rail, Phase 91)
X12 270/271 eligibility checks are provider-shaped: the requester must present an NPI / tax-ID as information receiver. Your company is patient-side and has neither.
- [ ] Obtain own information-receiver standing (register your entity with Stedi as an atypical/receiver org — feasibility to be confirmed with Stedi sales before BAA).
- [ ] Partner with an enrolled provider (e.g., a UM/UHealth-affiliated practice) and submit under their standing, with agreement.
- [x] Defer the eligibility rail entirely (FHIR Coverage + accumulators from Patient Access may be enough for the pilot).
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** 270/271 eligibility = `contract_ready`, `runtime_selectable:false`, `blocked_by: external_enrollment_information_receiver_standing`, `production_transactions_allowed:false`. NO Stedi BAA and NO production key until information-receiver/provider standing is confirmed. Runtime meanwhile uses FHIR Coverage / Patient Access / accumulators / plan documents / portal fallback (user auth) / user-uploaded documents. Capability stays visible to coding agents; planner explains the alternate path. See spine YAML `eligibility_x12_270_271`.
- Decided by / date: Founder / 2026-07-02

### 🔴 #12 — Phase numbering + Redis port (blocks writing `docs/ACCEPTANCE_CRITERIA.md` sections)
Plan uses provisional Phases **83–92**; your Cortex ledger is the declared tiebreaker. Separately, docs disagree on the runtime Redis port (`:6379` vs `:6381`).
- [x] Confirm 83–92 as-is.
- [ ] Renumber to: ____________
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text, incl. correct Redis port):** Phase numbering follows the Cortex ledger; if no conflict exists, keep 83–92. The Redis port must be canonicalized from ACTUAL runtime config, never prose: the authoritative variable is `BRAINSTY_REDIS_URL` (fallback `REDIS_URL`), read at `src/concierge/runtimeContextCache.mjs:249`; the current runtime value is `redis://127.0.0.1:6381` (`.env.local:39`). `:6379` in repo config is ONLY the FalkorDB/Graphiti container-internal port (host-mapped `:6380`, `compose.yaml:27`) — a different store. No separate test port exists (tests without `BRAINSTY_REDIS_URL` use the memory backend). Docs must reference the config variable, never a duplicated literal port, and must distinguish container-internal vs host-mapped ports. ADDITIONALLY: a MACHINE-READABLE phase ledger (`docs/db/phase-ledger.json`) is required — phase number, title, status, dependencies, docs touched, acceptance-criteria file, owner, blockers — so agents never infer phase order from prose (plan §11 Phase 83). See spine YAML `phase_ledger_policy`.
- Decided by / date: Founder / 2026-07-02

### 🔴 #16 — RAG embedding provider (blocks Phase 87 *retrieval readiness* only; schema lands regardless)
`rag_chunks.embedding_json` needs a named live embedding provider; until then retrieval is honestly labeled `contract_ready`.
- [ ] ⭐ OpenAI embeddings (`text-embedding-3-small/large`) via the existing `OPENAI_API_KEY` — zero new enrollment.
- [ ] AWS Bedrock embeddings (aligns with the HIPAA substrate; needs the out-of-Git AWS creds wired in).
- [ ] Local model (no data egress; ops burden).
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Embedding-provider ABSTRACTION now (beyond the listed single-provider options). Public/non-PHI data classes → OpenAI `text-embedding-3-small` (live now, via existing key). PHI/member-document classes → BLOCKED until an OpenAI BAA or a Bedrock/KMS profile is active; never embed data before data-class classification. `rag_chunks` must carry the 13 required metadata fields (embedding_provider, embedding_model, embedding_dimension, data_class, embedding_policy_version, created_at, source_document_id, source_evidence_class, phi_allowed, baa_required, baa_status, kms_profile, chunk_hash). See spine YAML `embedding_policy`.
- Decided by / date: Founder / 2026-07-02

---

## B. Pilot-posture confirmations (confirm or veto)

### #2 — No operational kill switch beyond real dependency absence
All decision toggles are deleted; no new env flags are introduced. Degraded mode exists only when a real dependency is absent (e.g., `OPENAI_API_KEY` unset ⇒ loud honest decline). The interrupt-durability boot-throw derives from the runtime profile only (no per-env override).
- [x] ⭐ Confirmed — no flag, dependency-absence only.
- [ ] I want one emergency kill switch — specify exactly what it disables and why it is not a decision pathway: ______________
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Confirmed — no ad-hoc flags. The deterministic capability-policy layer (`runtime_selectable` derived from real dependency/legal/credential/enrollment/phase/test/safety status) is the source of truth for executability — it is data-driven policy, not a kill switch. See spine YAML `executable_tool_catalog_policy` + `capability_status_values`.
- Decided by / date: Founder / 2026-07-02

### #4 — Interrupt durability: file checkpointer as the only production story (until a Postgres LangGraph checkpointer)
Single-instance assumption holds (server binds 127.0.0.1). Pending interrupts survive restarts via the file-backed saver.
- [x] ⭐ Acceptable for the pilot.
- [ ] Not acceptable — pull the Postgres checkpointer forward (adds a phase of work before Phase 88).
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** File checkpointer acceptable for dev/local/single-instance ONLY; the Postgres checkpointer is the DECLARED production target (plan §4.3). Required NOW (Phase 88): `interrupt_schema_version` + workflow/planner schema versions + the approval-record fields per spine YAML `interrupt_policy.required_interrupt_fields`.
- Decided by / date: Founder / 2026-07-02

### #5 — Vault secret backend for the pilot (HIPAA posture)
Token vault (`connector_oauth_grants`, `credential_session_vault`) encrypts with the local secret-file class (`/run/secrets`, per `databaseSecretProfile.mjs`). Managed KMS/vault is signature-gated/late. Raw passwords are never stored anywhere (settled — not part of this question).
- [x] ⭐ Acceptable for pilot; revisit at KMS phase.
- [ ] Not acceptable — require KMS before any Layer-2 token is stored (delays Phase 90).
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Vault/KMS as an INTERFACE now: the secret backend sits behind an abstraction; the local secret-file backend is allowed for dev/closed-pilot profiles only; managed KMS/Vault is REQUIRED before broad external users or long-lived Layer-2 tokens. Token metadata is stored separately from the token secret; every token access is audited and scoped (user, payer, capability, consent, expiry, data class). See spine YAML `secret_vault_policy`.
- Decided by / date: Founder / 2026-07-02

### #17 — Deploys while a user has a pending approval interrupt
Cross-version resume of a pre-pivot pending interrupt may not be byte-compatible.
- [x] ⭐ Operational drain rule — never deploy with pending interrupts; the 10–15 min token expiry bounds the wait. (Cheapest.)
- [ ] Engineering guarantee — Phase 88 must make cross-version resume pass byte-compatibly (more work, zero ops constraint).
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Versioned interrupt payloads + replay-safety metadata land NOW (Phase 88). The operational drain rule is allowed EARLY-phase only; cross-version resume OR safe expire/reissue-with-user-notice becomes an acceptance criterion before broader production. Never auto-execute an ambiguous post-deploy write. See spine YAML `interrupt_policy.deployment_policy`.
- Decided by / date: Founder / 2026-07-02

---

## C. Scope and legal

### #6 — MRF pilot slice: CPT/HCPCS whitelist + buy-vs-build threshold
Payer and geography are fixed (Aetna via `health1.aetna.com`, Miami/UM NPIs). Still needed:
(a) the **shoppable CPT/HCPCS whitelist** for the pilot (suggested starting point: the CMS 500 shoppable services list filtered to the pilot's likely demands — imaging, labs, common outpatient procedures);
(b) at what scale a **Serif Health / Payerset contract** replaces the self-built pipeline;
(c) whether vendor terms permit **consumer-facing display** (legal review).
- [x] ⭐ Start with CMS-500-shoppable ∩ imaging/labs/outpatient for the pilot; self-build; defer vendor until >1 payer or >1 metro.
- [ ] I will supply a specific code list: ______________
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text — codes/threshold/legal owner):** MRF pipeline GENERIC from day one — never hardwire Aetna. Required keys: `payer_id, employer_id, plan_id, network_id, geography, npi, tin, cpt_hcpcs, place_of_service, billing_class, negotiated_rate, allowed_amount, source_file_url, source_file_month, ingestion_run_id`. First slice = CMS shoppable baseline ∩ imaging/labs/common-outpatient, first metro (Miami/UM), first payer source (Aetna). Buy-vs-build: self-build until ANY of (>1 payer, >1 metro, maintenance >1 engineer-week/month, legal requires vendor terms, consumer-display warranty needed). Legal-owner review required for: display, redistribution, caching, attribution, vendor contract. See spine YAML `mrf_policy`.
- Decided by / date: Founder / 2026-07-02

### #9 — `unauthenticated_public` evidence class sign-off
Public scraping is in scope (draft mandates it). Sign off that public-web facts carry a lower-trust source-pointer class, while portal truth stays Aetna-allowlisted. Multi-payer generalization of the authenticated-host allowlist stays a separate future decision.
- [x] ⭐ Approved as specified.
- [ ] Approved with restrictions: ______________
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Approved, and generalized: adopt the 10-value evidence-class taxonomy with trust ranks — `authenticated_portal` (1), `member_authorized_api` (1), `official_payer_public` (2), `official_employer_public` (2), `cms_public` (2), `mrf_public` (2), `user_uploaded` (2), `user_reported` (4), `unauthenticated_public` (5), `social_confusion_signal` (6). Member-specific truth may come ONLY from classes marked `can_support_member_specific_truth` (authenticated_portal, member_authorized_api, user_uploaded). Social/forum content is confusion-signal only, never coverage truth. See spine YAML `evidence_classes`.
- Decided by / date: Founder / 2026-07-02

---

## D. Product / ops details

### #8 — Aetna production re-auth UX (if refresh tokens turn out absent in production)
Background EOB sync would then need periodic member re-authorization.
- [ ] ⭐ Accept a "reconnect your plan" prompt cadence (product copy to be designed at Phase 91).
- [ ] Background sync is not a pilot requirement — fetch on demand only (no re-auth UX needed).
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Both modes (beyond either single option): support on-demand fetch AND background sync as capabilities. Runtime DEFAULT is on-demand; background sync only with refresh token + user consent + token policy + stable connector. Reconnect prompts are governed by the spine YAML `reconnect_prompt_policy` (prompt on expired-token member-data ask, consented scheduled task, or `reauth_required` status; never without immediate user value, after a recent prompt, or when the user disabled background sync). Adopt the `connector_status_values` enum: `connected | expired | reauth_required | revoked | unsupported | error`. See spine YAML `reauth_and_sync_policy`.
- Decided by / date: Founder / 2026-07-02

### #10 — Recorded planner-decision corpus after legacy pointer removal
- [x] ⭐ Re-record the eval corpus post-Phase-85 (one scripted run; keeps eval:planner meaningful).
- [ ] Accept missing-pointer results on pre-pivot recordings.
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Re-record post-Phase-85; the old corpus is archive-only. The active eval must cover: the new planner schema, capability registry, executable tool catalog, planner exposure contract, three data layers, OpenClaw write-worker non-executability before Phase 92, consent/auth/human-approval interrupts, the prior-auth provider-delegation block, and the eligibility `blocked_external_enrollment` rail. See spine YAML `eval_policy`.
- Decided by / date: Founder / 2026-07-02

### #14 — Langfuse dashboards keyed on `router.intent_classified`
That span disappears when `classify_intent` is deleted (Phase 84).
- [ ] ⭐ No dashboard depends on it — proceed.
- [ ] A dashboard depends on it — which: ______________ (it will be re-keyed to `planner.output` in the same phase).
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Re-key ANY dashboard or saved query from `router.intent_classified` to `planner.output` / `planner.capability_decision` in the SAME phase as the removal; a grep/export check over dashboards and saved queries is required before removal. Adopt the spine's span-name list: `planner.input, planner.output, planner.capability_decision, planner.tool_selection, planner.policy_decision, planner.interrupt_required, worker.dispatch, openclaw.worker_selected, openclaw.worker_blocked, final.answer_contract`. PHI-safe redaction required. See spine YAML `langfuse_policy`.
- Decided by / date: Founder / 2026-07-02

### #15 — `risk_tier` stays derived-only (never persisted)
Avoids a third authority alongside the decision record and audit rows. Reporting can recompute or read audit `risk_tier_assigned` events.
- [x] ⭐ Confirmed — derived-only.
- [ ] I need a persisted tier column for reporting — where/why: ______________
- [ ] Need clarification — my question: ______________________________________
  - Clarification answer: ______________________________________
- **Decision (free text):** Confirmed derived-only. The `risk_tier_assigned` audit event must carry: `workflow_id, capability_id, risk_tier, reason_code, policy_version, timestamp`. Materialized reporting views/caches are ALLOWED but are never the source of truth and must include `source_event_ids, policy_version, recomputed_at`. See spine YAML `risk_tier_policy`.
- Decided by / date: Founder / 2026-07-02

---

## Signature/enrollment actions you can start today (not decisions — calendar items)

| # | Action | Unblocks | Effort |
|---|---|---|---|
| S1 | Create `developerportal.aetna.com` account, register app, subscribe **sandbox** Patient Access + Provider Directory products, fill third-party questionnaire, download test-member credentials | Phases 89–90 | click-through, ~1 day |
| S2 | Email `AetnaInteroperabilityProductionAccess@AETNA.com` to start production vetting; **ask the UM self-funded/TPA in-scope question in the same thread** | Phase 91 | email now; unknown lead time — start early |
| S3 | ~~Decide #7 above, then~~ #7 DECIDED (2026-07-02): NO Stedi BAA / production key until information-receiver or provider standing is confirmed — confirm standing first, then (and only then) sign the Stedi self-serve BAA and buy a production key | Phase 91 eligibility rail | blocked on standing confirmation |
| S4 | Legal review of MRF vendor display/redistribution terms (only if #6's buy-vs-build threshold is crossed; #6 decided self-build first slice) | Phase 91 | blocked on #6 threshold |
| S5 | Provider delegation agreement + clearinghouse trading-partner enrollment + compliance sign-off per `docs/EXECUTION_ARCHITECTURE_V2.md` | Phase 92 write track | longest lead — start conversations when pilot provider is chosen |
