# First value, then continuity

Status: proposed engineering journey, not an installed process or running patient monitor.
Date: 2026-09-09. Architecture baseline: `origin/main` at `7b9d1ee34f0cbf9ea0cf9b974727d3a186c14b0e`.

This package saves two founder-reviewed examples as the first concrete Brainsty value deliveries:

1. **Emergency financial clarity:** an authorized spouse at South Miami Hospital asks what an AFib admission and possible cardioversion could cost. Return a bounded, evidence-backed card quickly; automatically open an episode follow-up task when the real episode is recorded. Continue through admission, procedures, discharge, late claims and bill reconciliation.
2. **Prescription value check:** compare the exact prescription claim with local cash/coupon and direct-pharmacy options, including the incremental annual cost of Costco/Sam's Club or discount-program memberships. Continue until the selected price is confirmed and an actual fill establishes realized savings.

The reusable product unit is **a sourced first answer plus an open job with explicit unresolved questions**, not a chatbot answer that disappears after the turn.

## Read in this order

- [Casebook](CASEBOOK.md): concrete cases, boundaries, and patient cards.
- [Engineering journey](ENGINEERING_JOURNEY.md): graphs, current architecture mapping, state and tools, job lifecycle, economics and acceptance criteria.
- [Machine-readable design](journey-design.json): proposed nodes, transitions, work item, events and tool references. Documentation only; never seed into the executable catalog automatically.

Pitch artifact: [Brainsty emergency companion](https://brainsty-emergency-companion.felixdema.chatgpt.site) (owner-only Site; illustrative conversation, no live API connection).

## Delivery status

| Item | Status |
|---|---|
| Real portal-based historical episode review and medication comparison in the originating task | Completed there; supporting personal records remain outside this repository |
| AFib/cardioversion pitch scenario | Hypothetical; not proof of an actual diagnosis, procedure, current admission or hospital-tier match |
| Casebook, graphs, process/job contract and engineering backlog | Saved in this package |
| New executable capabilities / scheduled monitoring | Not implemented or activated by this package |
| First engineering work item | `VD-01`, open/proposed; acceptance and dependencies below |

No original EOBs, claim identifiers, names, credentials, member IDs, or personal evidence paths are committed. Example plan numbers are scenario inputs, not universal Aetna benefits. No phase status is changed. This package supplements the existing three-layer planner specification and does not replace it.
