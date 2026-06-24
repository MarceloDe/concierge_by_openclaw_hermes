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

## Aetna Portal Target Policy

- Use `env:BRAINSTY_AETNA_PORTAL_URL` as the private runtime login URL when the user provides a current Aetna login link. Do not commit that URL to Git because it may contain a short-lived identity transaction.
- Stable fallback login host: `https://health.aetna.com/managemyaccount/login`.
- Allowed member hosts for remote browser startup: `health.aetna.com`, `member.aetna.com`, and `member.cvsaetna.com`.
- The browser provider for authenticated portal work is `steel-self-host` through the FastAPI `/api/v1/browser/*` facade. Do not start a local Chrome/OpenClaw profile for regular-user MVP live view.
- Credentials, passkeys, 2FA, captcha, uploads, form submission, and payer contact always require human takeover and explicit approval. The agent may navigate and observe read-only pages only after the user-controlled login boundary is satisfied.

Generator notes:

- External skill-generator LLMs may edit `skill-server.json` to refine matching, data needs, workers, APIs, and success model.
- Do not add arbitrary SQL, credential capture, irreversible actions, or medical advice.
