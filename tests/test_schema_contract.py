import sys
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from brainsty_memory.entities import (
    Case,
    EvidenceArtifact,
    FormularyEntry,
    LoopIteration,
    LoopStage,
    OutcomeMetric,
    PlanType,
    PriceObservation,
    ProcedureSynonym,
    RalphLoopTemplate,
    TargetGoalEnum,
)
from brainsty_memory.groups import group_id_for
from brainsty_memory.migrate import bootstrap_inventory
from brainsty_memory.privacy import RequestorContext
from brainsty_memory.retrieval.primitives import (
    STORE,
    close_case,
    find_drug_coverage,
    find_procedure_synonyms,
    find_provider_price,
    get_exemplars,
    get_loop_for_target,
    get_temporal_facts,
    open_case,
    promote_to_exemplar,
    record_iteration,
    reset_store,
)
from brainsty_memory.retrieval.views import GeoFilter, IterationRecord, OpenCaseRequest, OutcomeMetricRecord


def dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def base_case(case_id="case-1", patient_id="patient-1") -> Case:
    return Case(
        name=f"Case {case_id}",
        source_provenance=["raw-case"],
        case_id=case_id,
        patient_id=patient_id,
        plan_id="plan-1",
        target_goal=TargetGoalEnum.understand_bill,
        opened_at=dt("2026-01-01T00:00:00Z"),
        temporal_window_start=dt("2026-01-01T00:00:00Z"),
        status="open",
    )


def test_case_roundtrip():
    reset_store()
    case = open_case(OpenCaseRequest(case=base_case()))
    for idx in range(3):
        record_iteration(
            case.case_id,
            IterationRecord(
                iteration=LoopIteration(
                    name=f"Iteration {idx}",
                    source_provenance=["raw-iteration"],
                    iteration_id=f"it-{idx}",
                    case_id=case.case_id,
                    stage_id=f"stage-{idx}",
                    started_at=dt("2026-01-01T00:00:00Z"),
                    outcome="advance",
                )
            ),
        )
    closed = close_case(
        case.case_id,
        OutcomeMetricRecord(
            outcome=OutcomeMetric(
                name="Outcome",
                source_provenance=["raw-outcome"],
                metric_id="metric-1",
                case_id=case.case_id,
                resolved=True,
                time_to_resolution_seconds=300,
                iterations_used=3,
                patient_rating=5,
                regulator_escalation_needed=False,
                closed_at=dt("2026-01-01T01:00:00Z"),
            )
        ),
    )
    assert closed.status == "closed_resolved"
    assert closed.current_stage_id == "stage-2"
    assert len(STORE.iterations[case.case_id]) == 3


def test_temporal_as_of_correctness():
    reset_store()
    STORE.prices.extend(
        [
            PriceObservation(
                name="Old price",
                source_provenance=["source-old"],
                observation_id="price-old",
                provider_id="provider-1",
                procedure_id="proc-1",
                plan_id_or_cash="plan-1",
                amount=100,
                event_valid_from=dt("2025-01-01T00:00:00Z"),
                event_valid_to=dt("2025-06-30T00:00:00Z"),
                disclosure_flag="plan_member_only",
                acquisition_method="claim_adjudication",
            ),
            PriceObservation(
                name="New price",
                source_provenance=["source-new"],
                observation_id="price-new",
                provider_id="provider-1",
                procedure_id="proc-1",
                plan_id_or_cash="plan-1",
                amount=200,
                event_valid_from=dt("2025-07-01T00:00:00Z"),
                disclosure_flag="plan_member_only",
                acquisition_method="claim_adjudication",
            ),
        ]
    )
    context = RequestorContext(actor_type="patient_agent", patient_id="patient-1", plan_id_known=True, reason="patient answer")
    assert find_provider_price("proc-1", GeoFilter(), plan_id="plan-1", as_of=dt("2025-03-15T00:00:00Z"), requestor_context=context)[0].observation.amount == 100
    assert find_provider_price("proc-1", GeoFilter(), plan_id="plan-1", as_of=dt("2026-01-01T00:00:00Z"), requestor_context=context)[0].observation.amount == 200


def test_formulary_invalidation():
    reset_store()
    STORE.formularies.extend(
        [
            FormularyEntry(name="Tier 2", source_provenance=["formulary-1"], entry_id="f1", drug_id="drug-1", plan_id="plan-1", tier="2", pa_required=False, step_therapy_required=False, event_valid_from=dt("2025-01-01T00:00:00Z"), event_valid_to=dt("2025-06-30T00:00:00Z")),
            FormularyEntry(name="Tier 3", source_provenance=["formulary-2"], entry_id="f2", drug_id="drug-1", plan_id="plan-1", tier="3", pa_required=True, step_therapy_required=True, event_valid_from=dt("2025-07-01T00:00:00Z")),
        ]
    )
    assert find_drug_coverage("drug-1", "plan-1", dt("2025-03-15T00:00:00Z")).entry.tier == "2"
    assert find_drug_coverage("drug-1", "plan-1", dt("2026-01-01T00:00:00Z")).entry.tier == "3"


def test_curator_promotion_idempotent():
    test_case_roundtrip()
    first = promote_to_exemplar("case-1", "resolved bill exemplar", "operator")
    second = promote_to_exemplar("case-1", "resolved bill exemplar", "operator")
    assert first.exemplar_id == second.exemplar_id
    assert len(STORE.exemplars) == 1


def test_privacy_filter_provider_facing():
    reset_store()
    STORE.prices.append(PriceObservation(name="Plan price", source_provenance=["source-plan"], observation_id="p1", provider_id="provider-1", procedure_id="proc-1", plan_id_or_cash="plan-1", amount=100, event_valid_from=dt("2026-01-01T00:00:00Z"), disclosure_flag="plan_member_only", acquisition_method="claim_adjudication"))
    context = RequestorContext(actor_type="provider_facing", reason="cash quote")
    payload = find_provider_price("proc-1", GeoFilter(), plan_id="plan-1", as_of=dt("2026-02-01T00:00:00Z"), requestor_context=context)
    assert payload == []
    assert Path("audit.privacy_log").exists()


def test_privacy_filter_patient_agent():
    reset_store()
    STORE.prices.append(PriceObservation(name="Plan price", source_provenance=["source-plan"], observation_id="p1", provider_id="provider-1", procedure_id="proc-1", plan_id_or_cash="plan-1", amount=100, event_valid_from=dt("2026-01-01T00:00:00Z"), disclosure_flag="plan_member_only", acquisition_method="claim_adjudication"))
    context = RequestorContext(actor_type="patient_agent", patient_id="patient-1", plan_id_known=True, reason="patient answer")
    assert len(find_provider_price("proc-1", GeoFilter(), plan_id="plan-1", as_of=dt("2026-02-01T00:00:00Z"), requestor_context=context)) == 1


def test_loop_hydration_end_to_end():
    reset_store()
    template = RalphLoopTemplate(name="PA med", source_provenance=["seed"], template_id="tpl-1", target_goal=TargetGoalEnum.preauth_medication, version=2, published_at=dt("2026-01-01T00:00:00Z"), description="hydrate loop", entry_stage_id="s1", exit_predicate_text="done", escalation_predicate_text="blocked")
    STORE.templates.append(template)
    STORE.stages[template.template_id] = [LoopStage(name="Identify", source_provenance=["seed"], stage_id="s1", template_id="tpl-1", ordinal=1, pre_conditions=["v1"], post_conditions=["v2"], description="identify")]
    STORE.controller_specs[template.template_id] = {"transition_table": [{"from_stage": "s1", "to_stage": "done", "when_verifier_id": "v2", "on_outcome": "advance"}]}
    hydrated = get_loop_for_target(TargetGoalEnum.preauth_medication, "patient-1", "plan-1")
    assert hydrated.template.version == 2
    assert hydrated.stages[0].stage_id == "s1"
    assert hydrated.controller_spec["transition_table"]


def test_exemplar_topk_ranking():
    reset_store()
    for score in [0.1, 0.9, 0.6, 0.8, 0.2]:
        exemplar = promote_ready_exemplar(score)
        STORE.exemplars[exemplar.exemplar_id] = exemplar
    ranked = get_exemplars(TargetGoalEnum.preauth_procedure, PlanType.PPO, k=3)
    assert [item.exemplar.outcome_score for item in ranked] == [0.9, 0.8, 0.6]


def promote_ready_exemplar(score):
    from brainsty_memory.entities import ExemplarCase

    return ExemplarCase(name=f"exemplar {score}", source_provenance=["curator"], exemplar_id=f"ex-{score}", source_case_id=f"case-{score}", target_goal=TargetGoalEnum.preauth_procedure, plan_type_bucket=PlanType.PPO, outcome_score=score, cost_of_resolution=0, time_to_resolution_seconds=10, patient_confirmation=True, curator_notes="note", promoted_at=datetime.now(timezone.utc), promoted_by="operator")


def test_provenance_required():
    try:
        base_case().model_copy(update={"source_provenance": []})
        Case(**{**base_case().model_dump(), "source_provenance": []})
        raise AssertionError("expected validation error")
    except ValidationError:
        pass


def test_phi_payload_blocked():
    try:
        EvidenceArtifact(name="bad", source_provenance=["raw"], artifact_id="e1", kind="eob", hash="hash", pointer="s3://safe/ref", mime_type="text/plain", acquired_at=datetime.now(timezone.utc), phi_scope="PHI", body="SSN 123-45-6789 " * 20)
        raise AssertionError("expected PHI body block")
    except ValidationError:
        pass


def test_group_id_isolation():
    reset_store()
    open_case(OpenCaseRequest(case=base_case("case-p", "patient-p")))
    open_case(OpenCaseRequest(case=base_case("case-q", "patient-q")))
    patient_p_cases = [case for case in STORE.cases.values() if group_id_for("patient_private", patient_id=case.patient_id) == "patient_private::patient-p"]
    assert [case.case_id for case in patient_p_cases] == ["case-p"]


def test_bootstrap_idempotent():
    first = bootstrap_inventory(dry_run=True)
    second = bootstrap_inventory(dry_run=True)
    assert first["created_nodes"] == 0
    assert first == second


def test_synonym_resolution():
    reset_store()
    STORE.synonyms.append(ProcedureSynonym(name="knee MRI", source_provenance=["source"], synonym_id="syn-1", canonical_procedure_id="73721", alias_text="knee MRI", alias_system="lay_term", confidence=0.9))
    matches = find_procedure_synonyms("knee MRI")
    assert matches[0].canonical_procedure_id == "73721"


def test_cash_pay_path_no_plan_leak():
    reset_store()
    STORE.prices.extend(
        [
            PriceObservation(name="Cash", source_provenance=["cash-source"], observation_id="cash", provider_id="provider-1", procedure_id="proc-1", plan_id_or_cash="CASH", amount=50, event_valid_from=dt("2026-01-01T00:00:00Z"), disclosure_flag="public", acquisition_method="provider_website"),
            PriceObservation(name="Plan", source_provenance=["plan-source"], observation_id="plan", provider_id="provider-1", procedure_id="proc-1", plan_id_or_cash="plan-1", amount=25, event_valid_from=dt("2026-01-01T00:00:00Z"), disclosure_flag="plan_member_only", acquisition_method="claim_adjudication"),
        ]
    )
    context = RequestorContext(actor_type="provider_facing", reason="cash-only provider query")
    result = find_provider_price("proc-1", GeoFilter(), plan_id="plan-1", as_of=dt("2026-02-01T00:00:00Z"), requestor_context=context)
    dumped = [item.model_dump() for item in result]
    assert len(result) == 1
    assert result[0].observation.plan_id_or_cash == "CASH"
    assert "plan-1" not in str(dumped)


if __name__ == "__main__":
    tests = sorted(name for name in globals() if name.startswith("test_"))
    for name in tests:
        globals()[name]()
        print(f"ok {name}")
    print(f"{len(tests)} schema contract tests passed")
