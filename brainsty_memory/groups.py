from typing import Literal


Scope = Literal[
    "clinical_public",
    "plan_semi_public",
    "provider_semi_public",
    "patient_private",
    "procedural",
    "exemplar",
    "curated_pain",
]


def _slug(value: str) -> str:
    return "-".join(value.strip().lower().replace("_", "-").split())


def group_id_for(
    scope: Scope,
    *,
    patient_id: str | None = None,
    payer_org: str | None = None,
    region_code: str | None = None,
    target_goal: str | None = None,
) -> str:
    if scope == "clinical_public":
        return "clinical_public"
    if scope == "plan_semi_public":
        if not payer_org:
            raise ValueError("payer_org is required for plan_semi_public")
        return f"plan_semi_public::{_slug(payer_org)}"
    if scope == "provider_semi_public":
        if not region_code:
            raise ValueError("region_code is required for provider_semi_public")
        return f"provider_semi_public::{_slug(region_code)}"
    if scope == "patient_private":
        if not patient_id:
            raise ValueError("patient_id is required for patient_private")
        return f"patient_private::{patient_id}"
    if scope == "procedural":
        return "procedural::loop_templates"
    if scope == "exemplar":
        if not target_goal:
            raise ValueError("target_goal is required for exemplar")
        return f"exemplar::{_slug(target_goal)}"
    if scope == "curated_pain":
        return "curated::pain_corpus"
    raise ValueError(f"unknown group scope: {scope}")
