from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from ..entities import ExemplarCase, PlanType, TargetGoalEnum, utcnow
from ..privacy import RequestorContext, filter_price_observations
from ..temporal import is_temporally_valid
from .views import (
    DrugCoverageView,
    ExemplarHydration,
    GeoFilter,
    IterationRecord,
    LoopHydration,
    MemoryStore,
    OpenCaseRequest,
    OutcomeMetricRecord,
    PriceObservationView,
    ProcedureSynonymView,
    TemporalFactSet,
)


STORE = MemoryStore()


def reset_store() -> None:
    STORE.cases.clear()
    STORE.iterations.clear()
    STORE.outcomes.clear()
    STORE.exemplars.clear()
    STORE.templates.clear()
    STORE.stages.clear()
    STORE.controller_specs.clear()
    STORE.prices.clear()
    STORE.formularies.clear()
    STORE.synonyms.clear()


def get_loop_for_target(target_goal: TargetGoalEnum, patient_id: str, plan_id: str, as_of: datetime | None = None) -> LoopHydration:
    cutoff = as_of or utcnow()
    candidates = [template for template in STORE.templates if template.target_goal == target_goal and template.published_at <= cutoff]
    if not candidates:
        raise LookupError(f"no RalphLoopTemplate for {target_goal}")
    template = sorted(candidates, key=lambda item: item.version, reverse=True)[0]
    stages = sorted(STORE.stages.get(template.template_id, []), key=lambda stage: stage.ordinal)
    return LoopHydration(
        template=template,
        stages=stages,
        tools_by_stage={stage.stage_id: [] for stage in stages},
        extractors_by_stage={stage.stage_id: [] for stage in stages},
        verifiers_by_stage={stage.stage_id: stage.pre_conditions + stage.post_conditions for stage in stages},
        controller_spec=STORE.controller_specs.get(template.template_id, {"transition_table": []}),
    )


def get_exemplars(target_goal: TargetGoalEnum, plan_type: PlanType, k: int = 5, demographic_bucket: str | None = None) -> list[ExemplarHydration]:
    exemplars = [
        exemplar
        for exemplar in STORE.exemplars.values()
        if exemplar.target_goal == target_goal
        and exemplar.plan_type_bucket == plan_type
        and (demographic_bucket is None or exemplar.demographic_bucket == demographic_bucket)
    ]
    ranked = sorted(exemplars, key=lambda item: item.outcome_score, reverse=True)[:k]
    return [ExemplarHydration(exemplar=item, target_goal=target_goal, plan_type=plan_type) for item in ranked]


def get_temporal_facts(patient_id: str, plan_id: str, scope: str, as_of: datetime) -> TemporalFactSet:
    formularies = [entry for entry in STORE.formularies if entry.plan_id == plan_id and is_temporally_valid(entry, as_of)]
    return TemporalFactSet(formulary=formularies if scope in {"formulary", "all"} else [])


def find_provider_price(
    procedure_id: str,
    location_geo: GeoFilter,
    plan_id: str | None = None,
    allow_cash: bool = True,
    as_of: datetime | None = None,
    requestor_context: RequestorContext | None = None,
) -> list[PriceObservationView]:
    requestor_context = requestor_context or RequestorContext(actor_type="system", reason="schema contract test")
    cutoff = as_of or utcnow()
    observations = [
        obs
        for obs in STORE.prices
        if obs.procedure_id == procedure_id
        and (allow_cash or obs.plan_id_or_cash != "CASH")
        and (plan_id is None or obs.plan_id_or_cash in {plan_id, "CASH"})
        and is_temporally_valid(obs, cutoff)
    ]
    filtered = filter_price_observations(observations, requestor_context, query={"procedure_id": procedure_id, "plan_id": plan_id})
    return [PriceObservationView(observation=item, source_pointer_ids=item.source_provenance) for item in filtered]


def find_drug_coverage(drug_or_alias: str, plan_id: str, as_of: datetime) -> DrugCoverageView:
    entries = [entry for entry in STORE.formularies if entry.plan_id == plan_id and entry.drug_id == drug_or_alias and is_temporally_valid(entry, as_of)]
    entry = entries[-1] if entries else None
    return DrugCoverageView(entry=entry, pa_required=entry.pa_required if entry else None, step_therapy_required=entry.step_therapy_required if entry else None)


def find_procedure_synonyms(name_or_code: str) -> list[ProcedureSynonymView]:
    needle = name_or_code.lower()
    matches = [item for item in STORE.synonyms if needle in item.alias_text.lower() or needle == item.canonical_procedure_id.lower()]
    return [ProcedureSynonymView(synonym=item, canonical_procedure_id=item.canonical_procedure_id) for item in matches]


def open_case(payload: OpenCaseRequest):
    STORE.cases[payload.case.case_id] = payload.case
    STORE.iterations.setdefault(payload.case.case_id, [])
    return payload.case


def record_iteration(case_id: str, payload: IterationRecord):
    if case_id not in STORE.cases:
        raise LookupError(f"case not found: {case_id}")
    STORE.iterations.setdefault(case_id, []).append(payload.iteration)
    STORE.cases[case_id].current_stage_id = payload.iteration.stage_id
    return payload.iteration


def close_case(case_id: str, outcome: OutcomeMetricRecord):
    if case_id not in STORE.cases:
        raise LookupError(f"case not found: {case_id}")
    STORE.outcomes[case_id] = outcome.outcome
    case = STORE.cases[case_id]
    case.status = "closed_resolved" if outcome.outcome.resolved else "closed_unresolved"
    case.closed_at = outcome.outcome.closed_at
    return case


def promote_to_exemplar(case_id: str, curator_notes: str, promoted_by: str) -> ExemplarCase:
    for exemplar in STORE.exemplars.values():
        if exemplar.source_case_id == case_id:
            return exemplar
    case = STORE.cases[case_id]
    outcome = STORE.outcomes[case_id]
    rating_norm = ((outcome.patient_rating or 3) - 1) / 4
    resolved_score = 1 if outcome.resolved else 0
    outcome_score = round(0.5 * resolved_score + 0.2 * rating_norm + 0.2 * 0.8 + 0.1 * 0.8, 4)
    exemplar = ExemplarCase(
        name=f"Exemplar {case.target_goal.value} {case.case_id}",
        source_provenance=["curator_promotion"],
        exemplar_id=f"exemplar-{uuid4()}",
        source_case_id=case_id,
        target_goal=case.target_goal,
        plan_type_bucket=PlanType.PPO,
        outcome_score=outcome_score,
        cost_of_resolution=0,
        time_to_resolution_seconds=outcome.time_to_resolution_seconds,
        patient_confirmation=outcome.patient_rating is not None,
        curator_notes=curator_notes,
        promoted_at=utcnow(),
        promoted_by=promoted_by,
    )
    STORE.exemplars[exemplar.exemplar_id] = exemplar
    return exemplar
