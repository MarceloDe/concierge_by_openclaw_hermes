# Codex Start Prompt

Use this prompt at the beginning of a Codex session in this repository.

```text
/goal Build the Brainstyworkers AI Concierge from brainstyworkers_ai_concierge_prompt.md using a small-slice implementation loop. Before coding, audit whether the prompt is detailed enough, interview me about missing product and logic details, create the planning documents, then implement one usable slice at a time with test/build/browser or API proof after every slice.
```

Then send:

```text
Read AGENTS.md and brainstyworkers_ai_concierge_prompt.md completely.

Do not implement yet.

First, audit whether the prompt is detailed enough to start implementation. Check the MVP, user roles, first channel, first workflows, data model, memory behavior, guardrails, integrations, and local demo proof.

Create or update:
- docs/IMPLEMENTATION_PLAN.md
- docs/ACCEPTANCE_CRITERIA.md
- docs/DECISIONS.md
- docs/PROGRESS.md

If anything important is unclear, interview me with concise questions before coding. Group the questions by product behavior, workflow logic, data/memory, integrations, safety, and demo expectations.

After the interview, revise the plan into vertical slices. The first slice must produce something I can interact with quickly and correct before the project becomes too advanced.
```

After you answer the interview questions, continue with:

```text
Update the planning documents from my answers.

Implement slice 1 only. Keep it narrow and interactive. After implementation, run the relevant verification commands, prove what works, update docs/PROGRESS.md, and tell me exactly how to try it locally.
```
