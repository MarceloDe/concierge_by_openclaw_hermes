from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from ..entities import (
    Bill,
    Case,
    Claim,
    EvidenceArtifact,
    InsurancePlan,
    Patient,
    PriceObservation,
    Procedure,
    Provider,
    TargetGoalEnum,
)
from ..privacy import assert_price_group_disclosure


class ActorEnvelope(BaseModel):
    actorType: Literal["agent", "human", "system"]
    actorId: str
    sessionId: str
    runId: str


class IngestionEnvelope(BaseModel):
    commandId: str
    commandType: str
    tenantId: str
    issuedAt: datetime
    actor: ActorEnvelope
    group_id: str
    payload: dict[str, Any]
    source_provenance: list[str] = Field(min_length=1)
    event_valid_from: datetime
    event_valid_to: datetime | None = None


def validate_cpt_hcpcs(code: str | None) -> str | None:
    if code is None:
        return None
    if not re.fullmatch(r"[A-Z]?\d{4,5}[A-Z]?", code):
        raise ValueError("invalid CPT/HCPCS shape")
    return code


def validate_ndc(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) > 11:
        raise ValueError("NDC must normalize to 11 or fewer digits")
    return digits.zfill(11)


def validate_rxnorm(value: str | None) -> str | None:
    if value is not None and (not value.isdigit() or not (3 <= len(value) <= 10)):
        raise ValueError("RxNorm must be a numeric string")
    return value


class ProcedureIngest(Procedure):
    @field_validator("cpt", "hcpcs")
    @classmethod
    def code_shape(cls, value: str | None) -> str | None:
        return validate_cpt_hcpcs(value)


class PriceObservationIngest(PriceObservation):
    group_id: str

    @field_validator("group_id")
    @classmethod
    def group_disclosure(cls, group_id: str, info):
        disclosure = info.data.get("disclosure_flag")
        if disclosure:
            assert_price_group_disclosure(group_id, disclosure)
        return group_id


ENTITY_MODELS = {
    "Patient": Patient,
    "InsurancePlan": InsurancePlan,
    "Provider": Provider,
    "Procedure": ProcedureIngest,
    "Bill": Bill,
    "Claim": Claim,
    "Case": Case,
    "EvidenceArtifact": EvidenceArtifact,
    "PriceObservation": PriceObservationIngest,
}


def json_schema_for_model(model_name: str) -> dict[str, Any]:
    return ENTITY_MODELS[model_name].model_json_schema()


def validate_ingestion_envelope(envelope: IngestionEnvelope) -> IngestionEnvelope:
    entity_type = envelope.commandType.removeprefix("INGEST_").removeprefix("ATTACH_")
    model = ENTITY_MODELS.get(entity_type)
    if model:
        payload = dict(envelope.payload)
        payload.setdefault("source_provenance", envelope.source_provenance)
        if model is PriceObservationIngest:
            payload.setdefault("group_id", envelope.group_id)
        model(**payload)
    if envelope.payload.get("target_goal") and envelope.payload["target_goal"] not in {goal.value for goal in TargetGoalEnum}:
        raise ValueError("TargetGoal must use the closed enum")
    return envelope
