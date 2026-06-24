from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel


class RequestorContext(BaseModel):
    actor_type: Literal["patient_agent", "provider_facing", "curator", "system"]
    patient_id: str | None = None
    plan_id_known: bool = False
    reason: str


def _write_privacy_log(entry: dict, log_path: Path | None = None) -> None:
    target = log_path or Path("audit.privacy_log")
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, default=str, sort_keys=True) + "\n")


def filter_price_observations(observations: list[object], requestor_context: RequestorContext, *, query: dict | None = None, log_path: Path | None = None) -> list[object]:
    returned = []
    for observation in observations:
        disclosure = getattr(observation, "disclosure_flag", None)
        plan_id_or_cash = getattr(observation, "plan_id_or_cash", None)
        if requestor_context.actor_type == "provider_facing":
            if disclosure == "public" or plan_id_or_cash == "CASH":
                returned.append(observation)
            continue
        if requestor_context.actor_type == "patient_agent" and requestor_context.patient_id:
            if disclosure != "payer_internal":
                returned.append(observation)
            continue
        if requestor_context.actor_type == "curator":
            if disclosure in {"public", "plan_member_only"}:
                returned.append(observation)
            continue
        if requestor_context.actor_type == "system":
            returned.append(observation)
    _write_privacy_log(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "requestor_context": requestor_context.model_dump(),
            "query": query or {},
            "filtered_count": len(observations) - len(returned),
            "returned_count": len(returned),
        },
        log_path,
    )
    return returned


def assert_price_group_disclosure(group_id: str, disclosure_flag: str) -> None:
    if disclosure_flag == "public" and group_id.startswith("patient_private::"):
        raise ValueError("public PriceObservation cannot live in patient_private group")
    if disclosure_flag == "patient_private" and not group_id.startswith("patient_private::"):
        raise ValueError("patient_private PriceObservation must live in patient_private group")
