from datetime import datetime, timezone


def now_event_time() -> datetime:
    return datetime.now(timezone.utc)


def invalidate_edge(edge: dict, reason: str, evidence_ref: str) -> dict:
    updated = dict(edge)
    updated["invalid_at"] = now_event_time()
    updated["manual_override_reason"] = reason
    updated["manual_override_evidence_ref"] = evidence_ref
    return updated


def as_of_filter(date: datetime) -> dict:
    return {
        "valid_at_lte": date,
        "invalid_at_gt_or_null": date,
        "event_valid_from_lte": date,
        "event_valid_to_gt_or_null": date,
    }


def is_temporally_valid(record: object, as_of: datetime) -> bool:
    valid_at = getattr(record, "valid_at", None)
    invalid_at = getattr(record, "invalid_at", None)
    event_valid_from = getattr(record, "event_valid_from", None)
    event_valid_to = getattr(record, "event_valid_to", None)
    if valid_at is not None and valid_at > as_of:
        return False
    if invalid_at is not None and invalid_at <= as_of:
        return False
    if event_valid_from is not None and event_valid_from > as_of:
        return False
    if event_valid_to is not None and event_valid_to <= as_of:
        return False
    return True
