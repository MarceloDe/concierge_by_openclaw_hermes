# Brainsty Graphiti/Zep Memory Schema

Status: Phase 67 schema contract.

This document describes the schema-first product memory layer for Brainsty Concierge. It follows the attached Graphiti/Zep schema prompt and stops at contracts: entity classes, edge classes, group IDs, temporal rules, ingestion envelopes, retrieval primitives, privacy filters, seed loop templates, migration shape, and tests. It does not implement the Ralph loop executor, UI, DSPy signatures, or agent prompts.

## Entity Families

- Identity: `Patient`, `InsurancePlan`, `Provider`, `Procedure`, `Drug`, `Bill`, `Claim`, `PreAuthRequest`.
- Time-bounded observations: `NetworkBinding`, `PriceObservation`, `FormularyEntry`, `BenefitRule`, `ProcedureSynonym`.
- Case/loop machinery: `Case`, `TargetGoal`, `RalphLoopTemplate`, `LoopStage`, `LoopIteration`, `Tool`, `Extractor`, `Verifier`, `ControllerSpec`.
- Curator/evidence: `ExemplarCase`, `EvidenceArtifact`, `OutcomeMetric`.

Every entity carries `name`, `created_at`, `updated_at`, and mandatory `source_provenance`.

## Edge Families

Edges are Pydantic contracts with `source_id`, `target_id`, mandatory `source_provenance`, event-time fields `event_valid_from`/`event_valid_to`, and Graphiti ingestion-time fields `valid_at`/`invalid_at`.

The schema includes case wiring, loop template structure, iteration trail, clinical/financial wiring, curator promotion, and bridges to Marcelo's existing `:Pain`, `:Advice`, `:Persona`, `:SolutionStep`, `:RawDocRef`, `:MedicalCode`, and `:JourneyStage` vocabulary.

## Group IDs

`brainsty_memory.groups.group_id_for(...)` returns:

- `clinical_public`
- `plan_semi_public::<payer>`
- `provider_semi_public::<region>`
- `patient_private::<patient_id>`
- `procedural::loop_templates`
- `exemplar::<target_goal>`
- `curated::pain_corpus`

Nodes and edges belong to one group. Cross-community references are allowed through explicit bridge edges.

## Temporal Rules

Mutable facts are not edited in place. New facts append new observation nodes/edges. Superseded facts use `invalid_at`; naturally expired facts keep history through `event_valid_to`.

`brainsty_memory.temporal.as_of_filter(date)` and `is_temporally_valid(record, as_of)` define the default bi-temporal query predicate.

## Privacy Rule

PHI payload does not live in graph memory. `EvidenceArtifact` stores pointer + hash + scope and blocks raw PHI-like bodies.

`PriceObservation.disclosure_flag` controls retrieval:

- `public`: visible broadly.
- `plan_member_only`: visible to patient-agent and curator contexts, not provider-facing contexts.
- `patient_private`: visible only to patient-private contexts.
- `payer_internal`: not returned through public retrieval primitives.

Provider-facing price retrieval returns only public and cash observations and must not reference a patient's plan or patient ID.

## Ingestion Envelope

Every ingestion uses:

```json
{
  "commandId": "cmd-1",
  "commandType": "INGEST_Case",
  "tenantId": "tenant-1",
  "issuedAt": "2026-06-22T20:00:00Z",
  "actor": {
    "actorType": "agent",
    "actorId": "brainsty-langgraph",
    "sessionId": "session-1",
    "runId": "run-1"
  },
  "group_id": "patient_private::patient-1",
  "payload": {},
  "source_provenance": ["raw-doc-1"],
  "event_valid_from": "2026-06-22T20:00:00Z",
  "event_valid_to": null
}
```

`brainsty_memory.ingest.schemas.json_schema_for_model(name)` emits Draft 2020-12-compatible Pydantic JSON Schema for supported entity payloads.

## Retrieval Primitives

Implemented in `brainsty_memory.retrieval.primitives`:

- `get_loop_for_target`
- `get_exemplars`
- `get_temporal_facts`
- `find_provider_price`
- `find_drug_coverage`
- `find_procedure_synonyms`
- `open_case`
- `record_iteration`
- `close_case`
- `promote_to_exemplar`

The current Phase 67 implementation uses an in-memory contract store for deterministic tests. Production wiring should replace the store with Graphiti calls while preserving signatures, return view models, privacy filters, and temporal semantics.

## Seed Templates

Seed YAML lives in `brainsty_memory/seeds/loop_templates/`:

- `build_claim`
- `understand_bill`
- `find_bill`
- `schedule_procedure`
- `preauth_procedure`
- `preauth_medication`
- `verify_price_provider`

`find_procedure_synonym` shares the price/cash-alternative style path in the next executor layer and remains a retrieval primitive in this schema phase.

## Existing HealthcareKG Overlap

The migration path extends the existing Neo4j `healthcarekg` vocabulary rather than replacing it. Where older Event-as-node notes conflict with the April 2026 Brainsty v2 playbook, the Graphiti temporal KG direction wins.

## Acceptance

Run:

```bash
python3 tests/test_schema_contract.py
```

The tests cover case roundtrip, temporal facts, formulary invalidation shape, exemplar promotion idempotency, provider-facing privacy, patient-agent privacy, loop hydration, exemplar Top-K, provenance, PHI blocking, group isolation, migration idempotency, synonym resolution, and cash-pay no-plan-leak behavior.
