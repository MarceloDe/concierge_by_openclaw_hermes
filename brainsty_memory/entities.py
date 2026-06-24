from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PlanType(str, Enum):
    PPO = "PPO"
    HMO = "HMO"
    EPO = "EPO"
    POS = "POS"
    HDHP = "HDHP"
    Medicare = "Medicare"
    Medicaid = "Medicaid"
    Marketplace = "Marketplace"
    VA = "VA"
    Tricare = "Tricare"
    null = "null"


class TargetGoalEnum(str, Enum):
    build_claim = "build_claim"
    understand_bill = "understand_bill"
    find_bill = "find_bill"
    schedule_procedure = "schedule_procedure"
    preauth_procedure = "preauth_procedure"
    preauth_medication = "preauth_medication"
    verify_price_provider = "verify_price_provider"
    find_cheaper_cash_alternative = "find_cheaper_cash_alternative"
    find_procedure_synonym = "find_procedure_synonym"


class BaseEntity(BaseModel):
    name: str
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    source_provenance: list[str] = Field(min_length=1)


class Patient(BaseEntity):
    patient_id: str
    pseudonym_hash: str
    dob_year: int | None = None
    sex_at_birth: str | None = None
    preferred_language: str | None = None
    tenant_id: str


class InsurancePlan(BaseEntity):
    plan_id: str
    payer_org_name: str
    plan_type: PlanType
    metal_level: str | None = None
    network_id: str | None = None
    policy_year: int | None = None


class Provider(BaseEntity):
    provider_id: str
    npi: str | None = None
    org_name: str
    specialty: str | None = None
    place_of_service: str | None = None
    location_geo: dict[str, Any] | None = None

    @field_validator("npi")
    @classmethod
    def npi_shape(cls, value: str | None) -> str | None:
        if value is not None and (not value.isdigit() or len(value) != 10):
            raise ValueError("NPI must be 10 digits")
        return value


class Procedure(BaseEntity):
    procedure_id: str
    cpt: str | None = None
    hcpcs: str | None = None
    loinc: str | None = None
    display_name: str
    clinical_category: str


class Drug(BaseEntity):
    drug_id: str
    rxnorm: str | None = None
    ndc_list: list[str] = Field(default_factory=list)
    display_name: str
    is_brand: bool
    generic_name: str | None = None


class Bill(BaseEntity):
    bill_id: str
    bill_number_masked: str
    posted_date: datetime
    total_amount: float
    payer_inferred: str | None = None


class Claim(BaseEntity):
    claim_id: str
    claim_type: Literal["institutional", "professional", "pharmacy"]
    submitted_at: datetime
    adjudicated_at: datetime | None = None
    status: str


class PreAuthRequest(BaseEntity):
    pa_id: str
    submitted_at: datetime
    decision_at: datetime | None = None
    status: str
    requested_cpt_or_ndc: str
    requested_for_patient_id: str


class NetworkBinding(BaseEntity):
    binding_id: str
    provider_id: str
    plan_id: str
    status: Literal["in", "out", "tiered"]
    tier: str | None = None
    event_valid_from: datetime
    event_valid_to: datetime | None = None


class PriceObservation(BaseEntity):
    observation_id: str
    provider_id: str
    procedure_id: str
    plan_id_or_cash: str
    amount: float
    currency: str = "USD"
    event_valid_from: datetime
    event_valid_to: datetime | None = None
    disclosure_flag: Literal["public", "plan_member_only", "patient_private", "payer_internal"]
    acquisition_method: str


class FormularyEntry(BaseEntity):
    entry_id: str
    drug_id: str
    plan_id: str
    tier: str
    pa_required: bool
    step_therapy_required: bool
    quantity_limit: str | None = None
    event_valid_from: datetime
    event_valid_to: datetime | None = None


class BenefitRule(BaseEntity):
    rule_id: str
    plan_id: str
    procedure_id_or_category: str
    coverage_status: str
    cost_share_pattern: str
    event_valid_from: datetime
    event_valid_to: datetime | None = None


class ProcedureSynonym(BaseEntity):
    synonym_id: str
    canonical_procedure_id: str
    alias_text: str
    alias_system: Literal["cpt", "hcpcs", "loinc", "payer_internal", "lay_term", "icd10pcs"]
    confidence: float = Field(ge=0, le=1)


class Case(BaseEntity):
    case_id: str
    patient_id: str
    plan_id: str
    target_goal: TargetGoalEnum
    opened_at: datetime
    closed_at: datetime | None = None
    temporal_window_start: datetime
    temporal_window_end: datetime | None = None
    current_stage_id: str | None = None
    status: Literal["open", "paused", "closed_resolved", "closed_unresolved", "escalated"]
    linked_pain_hashes: list[str] = Field(default_factory=list)


class TargetGoal(BaseEntity):
    target_id: str
    display_name: str
    target_goal: TargetGoalEnum
    default_template_id: str
    discovery_questions: list[str] = Field(default_factory=list)


class RalphLoopTemplate(BaseEntity):
    template_id: str
    target_goal: TargetGoalEnum
    version: int
    published_at: datetime
    description: str
    entry_stage_id: str
    exit_predicate_text: str
    max_iterations: int = 12
    escalation_predicate_text: str
    escalation_target: Literal["human_in_the_loop", "regulator", "patient_advocate", "provider_appeal"] = "human_in_the_loop"


class LoopStage(BaseEntity):
    stage_id: str
    template_id: str
    ordinal: int
    pre_conditions: list[str] = Field(default_factory=list)
    post_conditions: list[str] = Field(default_factory=list)
    description: str


class LoopIteration(BaseEntity):
    iteration_id: str
    case_id: str
    stage_id: str
    started_at: datetime
    ended_at: datetime | None = None
    state_delta: dict[str, Any] = Field(default_factory=dict)
    tools_invoked: list[str] = Field(default_factory=list)
    extractors_invoked: list[str] = Field(default_factory=list)
    verifiers_invoked: list[str] = Field(default_factory=list)
    outcome: Literal["advance", "repeat", "escalate", "fail"]
    evidence_refs: list[str] = Field(default_factory=list)


class Tool(BaseEntity):
    tool_id: str
    when_to_use: str
    inputs_schema_ref: str
    outputs_schema_ref: str
    side_effects: Literal["read_only", "external_call", "writes_state", "user_visible"]
    cost_class: Literal["free", "api_metered", "human_in_the_loop", "regulatory_escalation"]


class Extractor(BaseEntity):
    extractor_id: str
    kind: Literal["regex", "llm", "api", "ocr", "table_parser"]
    input_artifact_type: str
    output_field_schema: dict[str, Any]
    validator_ref: str | None = None


class Verifier(BaseEntity):
    verifier_id: str
    name: str
    asserts: str
    evaluator_kind: Literal["pure_function", "graph_query", "llm_judgement", "api_check"]
    evaluator_ref: str
    evidence_required: bool


class ControllerSpec(BaseEntity):
    controller_id: str
    template_id: str
    transition_table: list[dict[str, str]]


class EvidenceArtifact(BaseEntity):
    artifact_id: str
    kind: Literal[
        "eob",
        "denial_letter",
        "prior_auth_response",
        "provider_quote",
        "call_transcript",
        "portal_screenshot",
        "policy_doc",
        "formulary_snapshot",
        "manual_override",
    ]
    hash: str
    pointer: str
    mime_type: str
    acquired_at: datetime
    phi_scope: Literal["PHI", "PII", "DEIDENTIFIED", "OPERATIONAL_ONLY"]
    body: str | None = None

    @model_validator(mode="after")
    def block_phi_body(self):
        if self.body:
            if len(self.body) > 200 or any(token in self.body.lower() for token in ["ssn", "social security", "dob", "date of birth"]):
                raise ValueError("EvidenceArtifact stores pointer + hash only; raw PHI body is blocked")
        return self


class OutcomeMetric(BaseEntity):
    metric_id: str
    case_id: str
    resolved: bool
    time_to_resolution_seconds: int
    dollars_saved: float | None = None
    dollars_paid: float | None = None
    iterations_used: int
    patient_rating: int | None = Field(default=None, ge=1, le=5)
    regulator_escalation_needed: bool
    closed_at: datetime


class ExemplarCase(BaseEntity):
    exemplar_id: str
    source_case_id: str
    target_goal: TargetGoalEnum
    plan_type_bucket: PlanType
    demographic_bucket: str | None = None
    outcome_score: float = Field(ge=0, le=1)
    cost_of_resolution: float
    time_to_resolution_seconds: int
    patient_confirmation: bool
    curator_notes: str
    promoted_at: datetime
    promoted_by: str
