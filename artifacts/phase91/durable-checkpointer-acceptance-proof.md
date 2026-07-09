# Phase 91 acceptance proof — durable LangGraph checkpointer (the declared production target)

Branch: `phase-90-mid-connectors`. Plan: §4.3 (founder #4, founder #17), §11 Phase 91.
Date: 2026-07-09.

## What this lands, and why it was the blocking item

Phase 91's named **non-signature-gated** work item: *"the Postgres LangGraph checkpointer —
the declared production target (§4.3, founder #4) — must land before broad external users,
together with the §4.3 cross-version-or-safe-reissue deploy acceptance (#17)."*

Before this change the default checkpointer was `MemorySaver`. A pending interrupt does not
survive a restart, and `createGraphCheckpointer` correctly boot-threw
`non_durable_interrupts_in_production_profile` rather than run unsafely. The consequence was
that **no configuration existed in which the system could both run a production profile and
pause for consent** — the interrupt spine landed in Phase 88 was unusable in production.

## Implementation decision (founder-approved 2026-07-09)

Store-backed, ciphertext-only. NOT `@langchain/langgraph-checkpoint-postgres`.

| | Upstream `PostgresSaver` | What landed |
|---|---|---|
| Checkpoint state at rest | plaintext JSONB | **AES-256-GCM ciphertext columns** |
| Tables | creates its own, outside `schema.mjs` | in `schema.mjs`; parity test covers them |
| Test path | needs live PG | same code path on mkdtemp SQLite **and** live PG |
| Dependency | new npm install | none |

Graph state carries PHI (`user_input`, `memory_context`). The file-mode saver already
encrypted at rest; storing checkpoints as plaintext JSONB would have been a **downgrade** of
the §5.2 posture. `StoreBackedCheckpointSaver` is written against the store abstraction, so
the identical code is proven on SQLite and on live Postgres.

## Schema

2 new tables (**87 → 89**), live-PG parity regenerated (`docs/db/postgres-schema.json`, 89/89).

- `langgraph_checkpoints` — ciphertext + iv + tag for the checkpoint and its metadata,
  `parent_checkpoint_id`, `runtime_versions_json`, `UNIQUE(thread_id, checkpoint_ns, checkpoint_id)`.
- `langgraph_checkpoint_writes` — ciphertext pending writes,
  `UNIQUE(thread_id, checkpoint_ns, checkpoint_id, task_id, write_idx)`.

## Cross-version resume (founder #17) — an ambiguous post-deploy write is NEVER auto-executed

Every checkpoint row stamps `runtime_versions_json` = `{checkpointer, interruptSchema, plannerSchema}`.
On resume, `resolveResumeCompatibility` (`langgraphRunner.mjs`) compares the stamp with the
resuming process. On any mismatch — or an **unstamped** pre-Phase-91 checkpoint — the stale
thread is deleted, `graph_interrupt.expired_schema_change` is audited, and the run re-raises
the interrupt so the user is asked again under the current contract. It is never resumed.

## Gates

| Arm | Result |
|---|---|
| Pending interrupt survives a restart (fresh saver + fresh store, same DB) | PASS |
| **LIVE Postgres, default wiring** (no injected store) — pause, restart, resume | PASS |
| PHI ciphertext-only: no cleartext in any column, **nor in the raw sqlite file bytes**, nor in live PG | PASS |
| Tampered auth tag → `checkpoint_ciphertext_unresolvable`, never a silent null (§5.5 negative arm) | PASS |
| Pending writes round-trip; positional writes insert-once (MemorySaver parity); `deleteThread` clears both tables | PASS |
| Cross-version stamp mismatch / absent stamp → `expire_and_reissue` | PASS |
| Boot gate: production + `memory` still throws `non_durable_interrupts_in_production_profile` | PASS |
| Boot gate: `postgres` without an encryption key is REFUSED (graph state carries PHI) | PASS |
| `npm run test:local` | **445 tests · 437 pass · 0 fail · 8 gated skips** |
| `npm run build` | green |
| schema parity | 89/89 incl. live Postgres |

The 8th skip is pre-existing and unrelated: `Phase 89 LIVE: public payer FHIR CapabilityStatement`
skip-LOUD because `fhir.humana.com` did not answer from this network. It was 7 skips before this
change only because that external host answered then.

## Readiness labels (per docs/NON_MOCKED_PROOF_RULES.md)

- `postgres` mode: **`local_live_ready`** — proven against live Postgres 16 on `:55432` with the
  default factory. Not `production_ready`: the secret backend backing the encryption key is still
  `secret_file`/`default_dev` class (`resolveSecretBackend` reports `allowedForProduction: false`).
  A managed KMS/Vault profile remains required before broad external users (§5.2, founder #5).
- `file` mode: retained, now reports `warning: "file_mode_not_production_target"` under a
  production profile. Single-instance only — two app instances cannot share a pending interrupt
  through a file.

## What this does NOT do

- It does not flip Phase 91 to `landed`. Phase 91 remains `blocked_external` on four signatures
  (Aetna S2 vetting, Stedi BAA, Optum/Availity contracts, MRF vendor agreement). This closes only
  the one engineering item inside that window.
- It does not change the default mode. `BRAINSTY_GRAPH_CHECKPOINTER` still defaults to `memory`
  for dev. Production/staging profiles must now set `postgres` (or `file` for a closed pilot).
- It does not make the encryption key production-grade. That is the KMS/Vault work item.
