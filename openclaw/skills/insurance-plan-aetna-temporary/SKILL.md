# Temporary Aetna Insurance Plan Skill

skill_key: insurance_plan_aetna_temporary
kind: insurance_specific
status: draft_sketch_runtime_gated

This is a temporary editable Brainstyworkers skill-server artifact for Aetna-specific insurance reasoning. It is not a production plan document skill and must not claim coverage from uncited facts.

Use this skill when LangGraph needs payer/plan-specific Aetna reasoning for benefits, deductibles, out-of-pocket maximums, copays, prior authorization hints, network context, or source lookup.

Runtime boundaries:

- LangGraph remains workflow master.
- This skill supplies insurance-specific reasoning context and required evidence.
- It does not browse portals, enter credentials, submit forms, contact payers, send messages, or provide medical advice.
- If account-specific portal evidence is needed, delegate to `insurance_portal_browser` through the existing read-only approval gate.
- Every factual answer must cite a source pointer, evidence id, trusted research artifact, or return uncertainty/HITL.

Generator notes:

- External skill-generator LLMs may edit `skill-server.json` to refine matching, data needs, workers, APIs, and success model.
- Do not add arbitrary SQL, credential capture, irreversible actions, or medical advice.
