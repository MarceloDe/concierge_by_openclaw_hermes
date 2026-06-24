from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from ..entities import (
    Case,
    ExemplarCase,
    FormularyEntry,
    LoopIteration,
    LoopStage,
    OutcomeMetric,
    PriceObservation,
    ProcedureSynonym,
    RalphLoopTemplate,
    TargetGoalEnum,
    PlanType,
)


class GeoFilter(BaseModel):
    region_code: str | None = None
    radius_miles: int | None = None


class LoopHydration(BaseModel):
    template: RalphLoopTemplate
    stages: list[LoopStage]
    tools_by_stage: dict[str, list[str]]
    extractors_by_stage: dict[str, list[str]]
    verifiers_by_stage: dict[str, list[str]]
    controller_spec: dict[str, Any]


class ExemplarHydration(BaseModel):
    exemplar: ExemplarCase
    target_goal: TargetGoalEnum
    plan_type: PlanType


class TemporalFactSet(BaseModel):
    formulary: list[FormularyEntry] = []
    network: list[Any] = []
    benefit_rules: list[Any] = []


class PriceObservationView(BaseModel):
    observation: PriceObservation
    source_pointer_ids: list[str]


class DrugCoverageView(BaseModel):
    entry: FormularyEntry | None
    pa_required: bool | None = None
    step_therapy_required: bool | None = None


class ProcedureSynonymView(BaseModel):
    synonym: ProcedureSynonym
    canonical_procedure_id: str


class OpenCaseRequest(BaseModel):
    case: Case


class IterationRecord(BaseModel):
    iteration: LoopIteration


class OutcomeMetricRecord(BaseModel):
    outcome: OutcomeMetric


class PromotionConfig(BaseModel):
    resolved_weight: float = 0.5
    patient_rating_weight: float = 0.2
    cost_weight: float = 0.2
    time_weight: float = 0.1


class MemoryStore(BaseModel):
    cases: dict[str, Case] = {}
    iterations: dict[str, list[LoopIteration]] = {}
    outcomes: dict[str, OutcomeMetric] = {}
    exemplars: dict[str, ExemplarCase] = {}
    templates: list[RalphLoopTemplate] = []
    stages: dict[str, list[LoopStage]] = {}
    controller_specs: dict[str, dict[str, Any]] = {}
    prices: list[PriceObservation] = []
    formularies: list[FormularyEntry] = []
    synonyms: list[ProcedureSynonym] = []
