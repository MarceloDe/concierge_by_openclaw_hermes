from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class BaseEdge(BaseModel):
    source_id: str
    target_id: str
    source_provenance: list[str] = Field(min_length=1)
    event_valid_from: datetime
    event_valid_to: datetime | None = None
    valid_at: datetime = Field(default_factory=utcnow)
    invalid_at: datetime | None = None


class CaseOfPatient(BaseEdge):
    relation: Literal["OF_PATIENT"] = "OF_PATIENT"


class CaseUnderPlan(BaseEdge):
    relation: Literal["UNDER_PLAN"] = "UNDER_PLAN"


class CasePursues(BaseEdge):
    relation: Literal["PURSUES"] = "PURSUES"


class CaseInstantiates(BaseEdge):
    relation: Literal["INSTANTIATES"] = "INSTANTIATES"


class CaseLinkedToPain(BaseEdge):
    relation: Literal["LINKED_TO_PAIN"] = "LINKED_TO_PAIN"


class CaseHasOutcome(BaseEdge):
    relation: Literal["HAS_OUTCOME"] = "HAS_OUTCOME"


class CaseClosedAs(BaseEdge):
    relation: Literal["CLOSED_AS"] = "CLOSED_AS"


class TemplateHasStage(BaseEdge):
    relation: Literal["HAS_STAGE"] = "HAS_STAGE"
    ordinal: int


class TemplateHasController(BaseEdge):
    relation: Literal["HAS_CONTROLLER"] = "HAS_CONTROLLER"


class LoopStageBindsTool(BaseEdge):
    relation: Literal["BINDS_TOOL"] = "BINDS_TOOL"
    when_clause: str
    optional: bool = False


class LoopStageBindsExtractor(BaseEdge):
    relation: Literal["BINDS_EXTRACTOR"] = "BINDS_EXTRACTOR"


class LoopStageGatedBy(BaseEdge):
    relation: Literal["GATED_BY"] = "GATED_BY"
    role: Literal["pre", "post"]


class ControllerTransition(BaseEdge):
    relation: Literal["TRANSITION"] = "TRANSITION"
    from_stage_id: str
    when_verifier_id: str
    on_outcome: str


class LoopIterationOfCase(BaseEdge):
    relation: Literal["OF_CASE"] = "OF_CASE"


class LoopIterationAtStage(BaseEdge):
    relation: Literal["AT_STAGE"] = "AT_STAGE"


class LoopIterationProducedEvidence(BaseEdge):
    relation: Literal["PRODUCED_EVIDENCE"] = "PRODUCED_EVIDENCE"


class LoopIterationInvoked(BaseEdge):
    relation: Literal["INVOKED"] = "INVOKED"
    outcome_kind: Literal["ok", "error", "timeout"]


class BillReferencesClaim(BaseEdge):
    relation: Literal["REFERENCES_CLAIM"] = "REFERENCES_CLAIM"


class ClaimForProcedure(BaseEdge):
    relation: Literal["FOR_PROCEDURE"] = "FOR_PROCEDURE"


class ClaimAgainstPlan(BaseEdge):
    relation: Literal["AGAINST_PLAN"] = "AGAINST_PLAN"


class ClaimRenderedBy(BaseEdge):
    relation: Literal["RENDERED_BY"] = "RENDERED_BY"


class PreAuthForDrug(BaseEdge):
    relation: Literal["FOR_DRUG"] = "FOR_DRUG"


class PreAuthForProcedure(BaseEdge):
    relation: Literal["FOR_PROCEDURE"] = "FOR_PROCEDURE"


class ProcedureHasSynonym(BaseEdge):
    relation: Literal["HAS_SYNONYM"] = "HAS_SYNONYM"


class DrugHasFormularyEntry(BaseEdge):
    relation: Literal["HAS_FORMULARY_ENTRY"] = "HAS_FORMULARY_ENTRY"


class ProviderHasNetworkBinding(BaseEdge):
    relation: Literal["HAS_NETWORK_BINDING"] = "HAS_NETWORK_BINDING"


class ProcedureObservedPrice(BaseEdge):
    relation: Literal["OBSERVED_PRICE"] = "OBSERVED_PRICE"


class InsurancePlanHasBenefitRule(BaseEdge):
    relation: Literal["HAS_BENEFIT_RULE"] = "HAS_BENEFIT_RULE"


class ExemplarDerivedFrom(BaseEdge):
    relation: Literal["DERIVED_FROM"] = "DERIVED_FROM"


class ExemplarAppliesToTarget(BaseEdge):
    relation: Literal["APPLIES_TO_TARGET"] = "APPLIES_TO_TARGET"


class ExemplarAppliesToPlanType(BaseEdge):
    relation: Literal["APPLIES_TO_PLAN_TYPE"] = "APPLIES_TO_PLAN_TYPE"


class CaseMapsToJourneyStage(BaseEdge):
    relation: Literal["MAPS_TO_JOURNEY_STAGE"] = "MAPS_TO_JOURNEY_STAGE"


class ExemplarEvidencedByAdvice(BaseEdge):
    relation: Literal["EVIDENCED_BY_ADVICE"] = "EVIDENCED_BY_ADVICE"


class CaseContextualizedByPersona(BaseEdge):
    relation: Literal["CONTEXTUALIZED_BY_PERSONA"] = "CONTEXTUALIZED_BY_PERSONA"
