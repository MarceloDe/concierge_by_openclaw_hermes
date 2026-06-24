from __future__ import annotations

import argparse
import json
from pathlib import Path

from .entities import TargetGoalEnum


DEFAULT_TEMPLATE_TARGETS = [
    TargetGoalEnum.build_claim,
    TargetGoalEnum.understand_bill,
    TargetGoalEnum.find_bill,
    TargetGoalEnum.schedule_procedure,
    TargetGoalEnum.preauth_procedure,
    TargetGoalEnum.preauth_medication,
    TargetGoalEnum.verify_price_provider,
]


def bootstrap_inventory(*, dry_run: bool = False) -> dict:
    """Idempotent bootstrap contract.

    The live Neo4j/Graphiti copy runs outside this module in production. This
    function exposes the no-op/idempotency shape the orchestrator and tests can
    depend on without opening a database connection during schema tests.
    """
    seed_files = sorted(Path(__file__).parent.joinpath("seeds", "loop_templates").glob("*.yaml"))
    return {
        "dry_run": dry_run,
        "created_nodes": 0,
        "created_edges": 0,
        "skipped_existing": True,
        "seed_template_count": len(seed_files),
        "target_goals": [item.value for item in DEFAULT_TEMPLATE_TARGETS],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(json.dumps(bootstrap_inventory(dry_run=args.dry_run), sort_keys=True))


if __name__ == "__main__":
    main()
