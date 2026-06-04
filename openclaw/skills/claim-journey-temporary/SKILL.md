# Temporary Claim Journey Skill

skill_key: claim_journey_temporary
kind: journey_specific
status: draft_sketch_runtime_gated

This is a temporary editable Brainstyworkers skill-server artifact for the claim-status journey. It describes what LangGraph must gather, which data sources to mount, and when OpenClaw worker help is needed.

Use this skill when the user asks why a visit was not paid, whether a claim is pending/denied/processed, what they owe, what an EOB means, or what next step follows a claim result.

Runtime boundaries:

- LangGraph owns workflow, approval, final answer, audit, and product-memory retain.
- This skill can request source pointers, claim rows, EOB/document evidence, and read-only portal observation.
- It does not submit appeals, contact payers, send messages, enter credentials, or provide medical advice.
- If evidence is missing, return missing data and a next question rather than inventing claim facts.

Generator notes:

- External skill-generator LLMs may edit `skill-server.json`.
- Keep database mounts as named query keys only.
- Keep worker tasks read-only unless a separate explicit action approval scope is implemented.
