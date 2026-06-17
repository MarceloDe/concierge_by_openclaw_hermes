# Insurance Plan Skill Methodology

> Methodology for building OpenClaw/LangChain insurance-plan specialist skills from BrainstyWorkers research output, inspired by COLLEAGUE.SKILL trace-to-skill distillation.

## 0. Core Thesis

An insurance plan should be treated like a **bounded expert artifact**.

The source traces are not a person’s work history; they are the plan’s authoritative materials and surrounding evidence:

- carrier plan documents;
- SBC / Summary of Benefits and Coverage;
- SPD / Summary Plan Description;
- EOC / Evidence of Coverage;
- formulary and drug policy;
- prior-authorization policies;
- provider directory snapshots;
- claim/denial/appeal letters;
- broker/employer notes;
- DOI/CMS/regulatory material;
- credible social or complaint signals, clearly marked as low-authority.

BrainstyWorkers researches, validates, and packages the evidence. OpenClaw hosts the resulting skill. LangChain executes retrieval, deterministic checks, comparison, and procedural workflows.

The result is not “RAG over PDFs.” It is a **versioned, inspectable, correctable specialist skill**.


---

## 0.1 Verification Notes — COLLEAGUE.SKILL and Current Project Runtime

Verified on 2026-06-02:

- The COLLEAGUE.SKILL paper explicitly names the public implementation repository: [`titanwings/colleague-skill`](https://github.com/titanwings/colleague-skill). The arXiv HTML abstract links to that repository, and the repository README links back to the technical report.
- Marcelo's GitHub account `MarceloDe` has starred the repository. GitHub reported `viewerHasStarred=true` after the update.
- The local `workerprototype_openclaw` project already has a LangChain/LangGraph orchestrator runtime, not just a design note:
  - `package.json` depends on `@langchain/core`, `@langchain/langgraph`, and `@langchain/openai`.
  - `src/concierge/langgraphRunner.mjs` builds the real BrainstyWorkers LangGraph runner and imports the OpenClaw skill validation/proposal path.
  - `src/concierge/runtimeAdapters.mjs` converts context packets into LangChain config, LangGraph state, and OpenClaw channel envelopes.
  - `openclaw/skills/insurance-portal-browser/SKILL.md` and `skill.json` define the repo-scoped OpenClaw worker skill currently enabled for the orchestrator.
  - The current enabled skill is **insurance portal browsing / read-only evidence extraction**, not yet the generated per-plan **insurance-plan specialist knowledge skill** described in this document.
- The 90-day skill-framework scan also identified [`Lubu-Labs/langchain-agent-skills`](https://github.com/Lubu-Labs/langchain-agent-skills) as the preferred community reference pack for **LangGraph orchestration templates**. Treat it as a source of customizable orchestration patterns—not as the primary runtime dependency—especially its LangGraph agent patterns, state management, error handling, testing/evaluation, and deployment skill structure.

This means the next build does not need to invent orchestration from zero. It should add a generated plan-specialist knowledge skill beside the existing portal-browser execution skill, then route LangGraph through both:

```text
LangGraph orchestrator
  -> insurance_plan_specialist skill for cited plan-rule reasoning
  -> insurance_portal_browser skill only when account-specific portal evidence is needed
```

---

## 1. Methodological Lineage

This plan adapts the COLLEAGUE.SKILL methodology:

```text
heterogeneous traces
  -> preset router
  -> dual-track distillation
  -> artifact writer
  -> installable skill
  -> correction / rollback lifecycle
```

For insurance, the mapping is:

| COLLEAGUE.SKILL concept | Insurance-plan adaptation |
|---|---|
| Person or role | Insurance carrier + plan + year + state/market |
| Human traces | Plan docs, policies, claims, regulator sources, broker notes |
| Work/capability track | Coverage rules, cost-sharing rules, procedures, hierarchy rules |
| Persona/behavior track | Safe explanation style, escalation rules, uncertainty behavior |
| Correction records | Human expert corrections, plan updates, conflict resolutions |
| Skill package | OpenClaw `SKILL.md` plus references, tools, metadata |
| Gallery/install | Internal skill registry / runtime install |

The skill generation function can be modeled as:

```text
S = (A, M, L)
```

Where:

- `A` = artifact files: `SKILL.md`, `plan_rules.md`, tools, references;
- `M` = metadata: carrier, plan, year, source hashes, evidence IDs;
- `L` = lifecycle: version, correction count, validation status, rollback history.

---

## 2. System Roles

### 2.1 BrainstyWorkers: evidence builder

BrainstyWorkers owns:

- source discovery;
- crawl/fetch;
- document parsing;
- evidence span extraction;
- graph projection;
- citation closure;
- source health;
- synthesis/judge/HITL;
- skill-generation inputs.

It should never let uncited model output become a plan rule.

### 2.2 Skill writer: artifact distiller

The skill writer consumes BrainstyWorkers evidence bundles and emits an OpenClaw-compatible skill package.

It owns:

- schema-normalized plan rules;
- hierarchy rules;
- procedural workflows;
- tool manifests;
- `SKILL.md` generation;
- metadata and lifecycle files;
- correction merge logic.

### 2.3 OpenClaw: runtime host

OpenClaw owns:

- skill discovery and loading;
- user-facing conversation;
- tool invocation;
- memory boundaries;
- HITL/approval routing;
- WhatsApp/web/email interface.

### 2.4 LangChain: execution graph

LangChain owns runtime orchestration inside the specialist system:

- classify user question;
- resolve plan;
- retrieve cited evidence;
- run deterministic tools;
- compose answer;
- decide escalation.

---

## 3. Generated Skill Package

Recommended folder:

```text
skills/insurance-plan-{carrier}-{plan_slug}-{year}/
  SKILL.md
  plan_rules.md
  hierarchy_rules.md
  procedures.md
  communication_rules.md
  manifest.json
  meta.json
  corrections.md
  references/
    source_registry.json
    evidence_bundle.json
    citation_map.json
    spd.pdf
    sbc.pdf
    eoc.pdf
    formulary.pdf
    prior_auth_policy_docs/
    provider_directory_snapshot.json
  tools/
    check_coverage.py
    check_prior_auth.py
    compare_cost_share.py
    calculate_oop_estimate.py
    appeal_deadline.py
    explain_denial.py
    source_lookup.py
  tests/
    golden_questions.jsonl
    expected_citations.jsonl
```

### 3.1 `SKILL.md`

The OpenClaw entrypoint.

Must include:

- what plan it covers;
- when to invoke;
- user-facing safety boundaries;
- required citation behavior;
- tool list;
- escalation policy;
- command examples.

Example behavior rule:

```text
Never guarantee that a claim will be paid. State what the plan documents appear to say, cite the source, and recommend verification with the carrier or human specialist when uncertainty remains.
```

### 3.2 `plan_rules.md`

Capability track.

Sections:

- Plan identity
- Eligibility
- Covered benefits
- Exclusions
- Deductible rules
- Copay rules
- Coinsurance rules
- Out-of-pocket maximum
- Network rules
- Referral rules
- Prior authorization rules
- Pharmacy/formulary rules
- Emergency/urgent care exceptions
- Appeals and deadlines
- Coordination of benefits
- Special populations / state-specific rules
- Unresolved conflicts / HITL items

Every rule should include:

```text
rule_id
plain_language_rule
authority_tier
source_doc
source_section_or_page
evidence_id
confidence
last_verified
```

### 3.3 `hierarchy_rules.md`

This is the plan’s conflict-resolution doctrine.

Recommended authority order:

1. Federal law / CMS / ACA rule / ERISA requirement, when applicable.
2. State Department of Insurance or regulator guidance.
3. Plan contract / Evidence of Coverage.
4. Summary Plan Description or official plan booklet.
5. Summary of Benefits and Coverage, unless it conflicts with fuller plan docs.
6. Carrier medical policy.
7. Prior authorization policy.
8. Formulary / pharmacy benefit policy.
9. Provider directory / network snapshot.
10. Employer/broker notes.
11. Claims/denial letters for individual facts only.
12. Social/forum/complaint evidence as weak signal only.

Rules:

- Higher authority wins over lower authority.
- More specific rule wins over general rule only within same authority tier.
- Newer source wins only if same authority tier and same scope.
- If a conflict affects coverage/payment materially, escalate to HITL.
- If a source is missing or stale, mark uncertainty rather than infer.

### 3.4 `procedures.md`

Reusable workflows:

#### Coverage check

1. Identify service/drug/device.
2. Identify plan/year/state/network context.
3. Retrieve benefit category.
4. Retrieve exclusions.
5. Retrieve PA/referral rules.
6. Retrieve cost-share rules.
7. Check hierarchy conflicts.
8. Return cited answer + next steps.

#### Prior authorization check

1. Normalize service/drug to CPT/HCPCS/RxNorm if possible.
2. Retrieve PA policy.
3. Check plan-specific PA rule.
4. Check formulary/drug tier if pharmacy.
5. Return requirement, likely documentation, and who must submit.

#### Denial explanation

1. Parse denial reason.
2. Map denial to plan rule or policy.
3. Check whether cited denial reason matches plan docs.
4. Identify appeal deadline.
5. Draft appeal evidence checklist.
6. Escalate if conflict/high-impact.

#### Plan comparison

1. Normalize expected usage profile.
2. Run cost-share comparison.
3. Include premiums if available.
4. Include drug tier and PA friction.
5. Return tradeoff summary with uncertainty.

### 3.5 `communication_rules.md`

Behavior track.

Rules:

- Explain in plain English first.
- Cite the exact source section/page/evidence ID.
- Separate confirmed facts from interpretation.
- Use confidence labels: confirmed / likely / uncertain / conflicting.
- Ask minimal clarifying questions.
- Do not provide medical advice.
- Do not guarantee coverage/payment.
- Escalate PHI, legal, urgent clinical, or high-dollar ambiguity.

### 3.6 `manifest.json`

Example schema:

```json
{
  "schema_version": "insurance-plan-skill-v1",
  "skill_name": "insurance-plan-aetna-silver-ppo-2026",
  "carrier": "Aetna",
  "plan_name": "Silver PPO",
  "plan_year": 2026,
  "state": "FL",
  "market": "individual",
  "entrypoints": {
    "full": "SKILL.md",
    "rules": "plan_rules.md",
    "procedures": "procedures.md",
    "communication": "communication_rules.md"
  },
  "tools": [
    "check_coverage.py",
    "check_prior_auth.py",
    "compare_cost_share.py",
    "appeal_deadline.py"
  ],
  "references": [
    "references/evidence_bundle.json",
    "references/citation_map.json"
  ],
  "compatible_hosts": ["openclaw", "langchain", "codex", "claude-code"]
}
```

### 3.7 `meta.json`

Lifecycle state:

```json
{
  "version": 1,
  "generated_at": "2026-06-02T00:00:00-04:00",
  "generated_by": "brainstyworkers-insurance-skill-writer",
  "evidence_bundle_hash": "sha256:...",
  "source_hashes": {},
  "correction_count": 0,
  "validation_status": "passed",
  "hitl_open_items": 0,
  "rollback_available": true
}
```

---

## 4. BrainstyWorkers Build Pipeline

### Phase A — Source planning

Input:

- carrier;
- plan name;
- plan year;
- state;
- market type;
- user priority questions.

BrainstyWorkers source planner selects:

- official carrier sources;
- regulator sources;
- CMS/DOI material;
- formularies;
- medical policies;
- provider/network pages;
- social/complaint sources as weak signals.

Gate:

- source has authority tier;
- source has retrieval method;
- source registry is approved/versioned.

### Phase B — Fetch and document parsing

Use deterministic workers:

- web scraper: `crawl4ai` / `trafilatura` style path;
- document parser: `docling` / PDF parser;
- OCR for scanned docs if needed;
- store raw artifacts in MinIO/local storage;
- hash all content.

Gate:

- no model in fetch path;
- every raw artifact has source ID and hash;
- PII scrub where needed.

### Phase C — Evidence extraction

Extract only source-bound claims:

- benefits;
- exclusions;
- cost sharing;
- PA/referral requirements;
- formulary tier;
- appeal rights;
- eligibility;
- network definitions.

Gate:

- every extracted claim binds to literal source span;
- uncited claims rejected;
- uncertain claims become HITL.

### Phase D — Graph projection

Project evidence into graph:

```text
Carrier -> Plan -> BenefitCategory -> Service/Drug -> Rule
Plan -> SourceDocument -> EvidenceSpan
Rule -> Requires -> PriorAuthorization
Rule -> HasCostShare -> CostShare
Rule -> Excludes -> Service/Condition
Rule -> HasAppealDeadline -> Deadline
```

Graph nodes should support:

- canonical keys;
- aliases;
- authority tier;
- evidence IDs;
- source freshness.

### Phase E — Evidence bundle generation

Produce:

```text
insurance_evidence_bundle.json
```

Contains:

- plan identity;
- source documents;
- extracted rules;
- conflicts;
- missing data;
- confidence;
- HITL flags;
- evidence IDs and spans.

### Phase F — Skill distillation

The skill writer consumes the evidence bundle and renders:

- `plan_rules.md`;
- `hierarchy_rules.md`;
- `procedures.md`;
- `communication_rules.md`;
- tool input/output schemas;
- metadata files.

Gate:

- no rule without evidence;
- no conflict silently resolved;
- no missing high-impact source ignored;
- output passes golden tests.

### Phase G — Runtime install

Install into OpenClaw skill path or system-specific skill registry.

Gate:

- OpenClaw can discover skill;
- sample invocations load correct skill;
- tools are callable;
- citations render in answer.

### Phase H — Correction lifecycle

Corrections can come from:

- Marcelo;
- human insurance specialist;
- updated carrier docs;
- regulator updates;
- contradiction found by judge;
- user outcome feedback.

Correction types:

```text
source_update
rule_patch
hierarchy_override
procedure_patch
communication_patch
tool_bugfix
```

Lifecycle:

1. archive current version;
2. apply correction;
3. regenerate derived artifacts;
4. run validation tests;
5. install new version;
6. keep rollback.

---

## 5. LangChain Runtime Methodology

### 5.1 Graph nodes

Recommended runtime graph:

```text
User question
  -> QuestionClassifier
  -> PlanResolver
  -> SkillLoader
  -> EvidenceRetriever
  -> ToolRouter
  -> ProcedureExecutor
  -> AnswerComposer
  -> Safety/HITL Gate
```

### 5.2 Question classifier labels

- `coverage_check`
- `cost_estimate`
- `prior_auth`
- `referral_required`
- `drug_formulary`
- `network_check`
- `denial_explanation`
- `appeal_workflow`
- `plan_comparison`
- `source_lookup`
- `unclear_or_out_of_scope`

### 5.3 Tool routing

| Question type | Tool |
|---|---|
| Coverage | `check_coverage.py` |
| PA | `check_prior_auth.py` |
| Cost | `compare_cost_share.py` / `calculate_oop_estimate.py` |
| Appeal | `appeal_deadline.py` |
| Denial | `explain_denial.py` |
| Source question | `source_lookup.py` |

### 5.4 Answer contract

Every answer should return:

```text
Short answer
Confirmed facts
Citations
Uncertainty / conflicts
Next recommended action
Escalation flag if needed
```

Example:

```text
Short answer: This appears covered, but prior authorization is likely required.

Confirmed facts:
- The plan lists X under Y benefit category.
- The PA policy requires authorization for Z.

Sources:
- Evidence ID E123, SPD p. 42
- Evidence ID E221, PA policy section 3.1

Uncertainty:
- I did not find the latest network-specific exception list.

Next action:
- Ask carrier: “Can you confirm PA requirements for CPT ____ under plan ____?”
```

---

## 6. Safety and Governance

### 6.1 Non-negotiable rules

- Do not guarantee coverage, payment, or legal interpretation.
- Do not provide medical advice.
- Do not use low-authority/social evidence as final answer.
- Do not store PHI without explicit approval and documented retention boundary.
- Do not contact carriers/payers externally without explicit user approval.
- Escalate high-impact financial/clinical ambiguity.

### 6.2 HITL triggers

Escalate when:

- source conflict affects payment/coverage;
- no authoritative source found;
- denial interpretation is uncertain;
- appeal deadline could be missed;
- large financial impact;
- PHI or account-specific communication required;
- user asks for medical/legal advice;
- plan document is stale or missing.

---

## 7. MVP Plan

### MVP scope

One carrier, one plan, one year, one state.

Source set:

- SBC;
- SPD/EOC;
- formulary;
- one prior authorization policy.

Workflows:

1. coverage check;
2. prior authorization check;
3. cost-share explanation;
4. source lookup.

### MVP deliverables

- `insurance_evidence_bundle.json`
- generated OpenClaw skill folder
- `check_coverage.py`
- `check_prior_auth.py`
- `compare_cost_share.py`
- 20 golden questions
- WhatsApp/OpenClaw demo
- validation report

### MVP acceptance criteria

- every answer cites at least one evidence ID;
- every extracted rule has a source span;
- no uncited generated plan rule exists;
- OpenClaw loads the skill only for relevant insurance questions;
- tools run deterministically;
- ambiguous questions produce escalation, not hallucination;
- plan skill can be regenerated after one correction;
- rollback restores previous version.

---

## 8. Implementation Slices

### Slice 1 — Static generated skill from one known plan

- manually provide PDF docs;
- parse/extract sections;
- hand-review evidence bundle;
- generate skill folder;
- run 10 golden questions.

### Slice 2 — Automated evidence extraction

- structured extraction schemas;
- span validation;
- citation map;
- confidence flags.

### Slice 3 — Deterministic tools

- coverage checker;
- PA checker;
- cost-share checker;
- appeal deadline calculator.

### Slice 4 — OpenClaw runtime integration

- install skill;
- expose tool calls;
- WhatsApp/web demo;
- answer contract with citations.

### Slice 5 — BrainstyWorkers integration

- connect source registry;
- use crawler/document workers;
- project evidence into graph;
- generate evidence bundle from real run.

### Slice 6 — Correction and rollback

- correction records;
- regenerate skill;
- archive previous version;
- rollback command.

### Slice 7 — Multi-plan comparison

- load two plan skills;
- compare cost sharing and friction;
- cite both plans;
- output recommendation with caveats.

---

## 9. Golden Test Examples

1. Is Ozempic covered under this plan?
2. Does insulin require prior authorization?
3. What is the specialist visit copay?
4. Is out-of-network emergency care covered?
5. What is the annual deductible?
6. What is the out-of-pocket maximum?
7. Are mental health outpatient visits covered?
8. Does this plan require referrals?
9. What is the appeal deadline after denial?
10. Which source says this drug is tier 3?
11. Compare expected monthly cost for insulin + endocrinologist.
12. Explain why a claim for X might be denied.
13. What should I ask the carrier before scheduling?
14. What is uncertain from the available documents?
15. Which rule wins if SBC conflicts with EOC?

---

## 10. Recommended First Build Decision

Start with **one plan skill** generated from a controlled source bundle.

Do not begin with broad autonomous crawling. First prove:

```text
known plan docs -> evidence bundle -> OpenClaw skill -> cited runtime answers
```

Once this vertical slice works, BrainstyWorkers can expand the upstream research automation.

---

## 11. Why This Is Strategically Strong

This makes the insurance system a library of durable specialist artifacts:

- one skill per plan;
- source-cited;
- testable;
- inspectable;
- correctable;
- portable across OpenClaw/LangChain/Codex/Claude Code;
- safer than loose PDF RAG;
- aligned with BrainstyWorkers’ citation-closed architecture.

The methodology turns research into operational capability.

---

## 12. LLM Build Brief for the Insurance Plan Specialist Skill

Use this section as the instruction packet for the LLM or coding agent working in `workerprototype_openclaw`.

### 12.1 Build target

Create a repo-scoped, generated OpenClaw knowledge skill for one concrete plan:

```text
openclaw/skills/insurance-plan-{carrier}-{plan_slug}-{year}/
```

This skill is a **knowledge and reasoning artifact**. It is separate from, and complementary to, the existing `insurance-portal-browser` skill:

- `insurance-plan-*` answers from curated official plan evidence and deterministic rule tools.
- `insurance-portal-browser` collects read-only account/portal evidence after approval.
- LangGraph remains the orchestrator and final-response owner.

### 12.2 Minimal first implementation

Implement one MVP plan skill with these files:

```text
openclaw/skills/insurance-plan-{carrier}-{plan_slug}-{year}/
  SKILL.md
  skill.json
  plan_rules.md
  hierarchy_rules.md
  procedures.md
  communication_rules.md
  references/source_registry.json
  references/evidence_bundle.json
  references/citation_map.json
  tools/source_lookup.mjs
  tools/check_coverage.mjs
  tools/check_prior_auth.mjs
  tools/compare_cost_share.mjs
  tests/golden_questions.jsonl
```

Keep the first version small. Do not crawl the web broadly. Start from known plan documents and build a citation-closed evidence bundle.

### 12.3 Required evidence bundle contract

`references/evidence_bundle.json` must be the source of truth for generated rules. Use this shape:

```json
{
  "schema_version": "2026-06-02.insurance-evidence-bundle.v1",
  "plan_identity": {
    "carrier": "Aetna",
    "plan_name": "Example Silver PPO",
    "plan_year": 2026,
    "state": "FL",
    "market": "individual"
  },
  "sources": [
    {
      "source_id": "SRC-SBC-001",
      "authority_tier": 5,
      "title": "Summary of Benefits and Coverage",
      "url_or_path": "references/sbc.pdf",
      "retrieved_at": "2026-06-02T00:00:00-04:00",
      "sha256": "..."
    }
  ],
  "rules": [
    {
      "rule_id": "RULE-COVERAGE-001",
      "question_types": ["coverage_check"],
      "benefit_category": "Specialist visit",
      "plain_language_rule": "Specialist visits are covered with the listed copay after any applicable referral rules.",
      "authority_tier": 5,
      "source_id": "SRC-SBC-001",
      "evidence_id": "EV-SBC-042",
      "source_locator": "SBC p. 4, Specialist visit row",
      "literal_span": "short exact or near-exact source span",
      "confidence": "high",
      "last_verified": "2026-06-02"
    }
  ],
  "conflicts": [],
  "missing_high_impact_sources": [],
  "hitl_items": []
}
```

Hard rule: if a rule cannot point to `source_id` + `evidence_id` + `source_locator`, it is not allowed into `plan_rules.md`.

### 12.4 Skill manifest contract

`skill.json` should be machine-readable and align with the existing BrainstyWorkers skill-artifact pattern:

```json
{
  "schema_version": "2026-06-02.insurance-plan-skill.v1",
  "skill_key": "insurance_plan_aetna_example_silver_ppo_2026",
  "title": "Insurance Plan Specialist: Aetna Example Silver PPO 2026",
  "status": "repo_artifact_ready_knowledge_runtime_gated",
  "risk_level": "medium_high",
  "purpose": "Answer plan-rule questions from citation-closed evidence and deterministic tools.",
  "allowed_workflows": [
    "coverage_check",
    "cost_estimate",
    "prior_auth",
    "referral_required",
    "drug_formulary",
    "network_check",
    "denial_explanation",
    "appeal_workflow",
    "plan_comparison",
    "source_lookup"
  ],
  "required_references": [
    "references/source_registry.json",
    "references/evidence_bundle.json",
    "references/citation_map.json"
  ],
  "tools": [
    "tools/source_lookup.mjs",
    "tools/check_coverage.mjs",
    "tools/check_prior_auth.mjs",
    "tools/compare_cost_share.mjs"
  ],
  "answer_contract": [
    "short_answer",
    "confirmed_facts",
    "citations",
    "uncertainties_or_conflicts",
    "next_recommended_action",
    "escalation_flag"
  ],
  "approval_gates": {
    "portal_access": "delegate_to_insurance_portal_browser_with_read_only_approval",
    "payer_contact": "requires_explicit_per_action_approval",
    "external_message_send": "requires_explicit_per_message_approval",
    "medical_advice": "not_allowed"
  }
}
```

### 12.5 LangGraph integration target

Add a plan-specialist branch to the existing orchestrator without weakening existing gates:

```text
classifyHealthcareIntent
  -> if plan-rule question and plan skill exists:
       PlanResolver
       InsurancePlanSkillLoader
       EvidenceRetriever/source_lookup
       DeterministicToolRouter
       AnswerComposer
       Safety/HITL Gate
  -> if account-specific portal data is required:
       validate existing insurance_portal_browser proposal
       request/read-only approval
       merge portal source pointers into the answer
```

Implementation hints for the current repo:

- Extend the OpenClaw skill artifact loader to list both `insurance_portal_browser` and generated `insurance_plan_*` skill artifacts.
- Keep `insurance_portal_browser` as the only browser/portal execution skill.
- Add a `DEFAULT_INSURANCE_PLAN_SKILL_KEY` or resolver rather than hard-coding one plan forever.
- Use [`Lubu-Labs/langchain-agent-skills`](https://github.com/Lubu-Labs/langchain-agent-skills) as a **source template to customize**, not a copy-paste dependency. In particular, adapt its LangGraph orchestration-style skill patterns for:
  - plan resolver / router behavior;
  - state schema and checkpoint expectations;
  - retry, error handling, and HITL escalation;
  - testing/evaluation around trajectories and LangSmith traces;
  - production deployment/monitoring notes.
- Add tests similar to the existing OpenClaw skill artifact and invocation tests:
  - skill artifact validates;
  - generated plan rule without citation fails;
  - coverage question routes to plan skill;
  - portal-required question proposes `insurance_portal_browser` rather than letting the plan skill browse;
  - answer composer refuses uncited claims and includes evidence IDs.

### 12.6 Deterministic tool behavior

The first tools can be simple JSON readers. They should not call an LLM.

- `source_lookup.mjs`: input `{ evidence_id | rule_id | query }`; output matching evidence spans and source metadata.
- `check_coverage.mjs`: input `{ service_or_drug, plan_context }`; output matched coverage rules, exclusions, PA/referral flags, conflicts, citations.
- `check_prior_auth.mjs`: input `{ service_or_drug, code?, pharmacy_or_medical? }`; output PA requirement, documentation hints, submitter, citations.
- `compare_cost_share.mjs`: input `{ usage_profile, plan_ids[] }`; output normalized cost-share comparison with missing-data warnings.

Every tool response must include:

```json
{
  "status": "matched | no_match | conflicting | missing_authoritative_source",
  "facts": [],
  "citations": [],
  "uncertainties": [],
  "hitl_required": false
}
```

### 12.7 Quality gates before claiming done

Run at least:

```text
npm run build
node --test src/tests/openclaw-skill-artifacts.test.mjs
node --test src/tests/langgraph-runner.test.mjs
```

If live model/API tests are not required for this slice, do not run `npm run test:live`. The first acceptance gate is deterministic artifact validity plus citation-closed answers.

### 12.8 Definition of done

The first vertical slice is done when:

- a generated `insurance-plan-*` skill exists under `openclaw/skills/`;
- every plan rule comes from `evidence_bundle.json`;
- every answer cites at least one evidence ID or returns an uncertainty/HITL result;
- the LangGraph orchestrator can route a static coverage question to the plan skill;
- portal/account-specific questions still go through the existing approval-gated `insurance_portal_browser` path;
- one correction can regenerate the skill and rollback remains possible.
