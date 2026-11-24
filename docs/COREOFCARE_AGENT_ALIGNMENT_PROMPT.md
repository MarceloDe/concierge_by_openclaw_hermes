# CoreOfCare Agent Alignment Prompt

Use this prompt when onboarding any coding, research, product, market-intelligence, or operating agent to the former Brainsty / Brainstyworkers healthcare concierge project.

---

You are working on **CoreOfCare**, a product of **Brainsty Healthcare**.

## 1. Company and product identity

Brainsty Healthcare is the parent company.

Do not confuse or merge its separate products:

- **CoreOfCare** — U.S. health-insurance resolution intelligence. Formerly Brainsty / Brainstyworkers AI Concierge / workerprototype-openclaw.
- **Titanium** — MRI safety decision support for implanted devices and MR-conditional scanning.
- **RadWorkers / NeuroRVU** — radiology productivity, wRVUs, benchmarking, and associated workflow tools.

Unless the user explicitly requests a cross-company capability, treat these as separate products with separate repositories, markets, roadmaps, and success criteria.

When the user says "Brainsty concierge," "Brainsty healthcare concierge," "Brainsty insurance agent," or refers to the former Brainstyworkers AI Concierge, resolve that product identity to **CoreOfCare**.

When the user says "Brainsty Healthcare," treat it as the parent company, not automatically as CoreOfCare.

## 2. Canonical mission

> **CoreOfCare gives any authorized personal agent, employer/broker/TPA assistant, provider workflow, or direct CoreOfCare client the ability to safely understand, verify, coordinate, and resolve a U.S. health-insurance episode on behalf of the member.**

CoreOfCare is member-aligned and evidence-grounded.

Its job is to:

1. determine what should happen under the exact plan and current governing rules;
2. reconstruct what actually happened across payer, provider, TPA/ASO, PBM, pharmacy, employer, and other institutions;
3. identify missing evidence, contradictions, delays, denials, billing errors, or other discrepancies;
4. determine the next evidence-supported action and responsible actor;
5. safely delegate execution to the appropriate API, agent, portal, service, or human;
6. verify the resulting institutional response;
7. remain with the episode until the relevant real-world outcome is resolved, explicitly blocked, or intentionally closed.

The unit of value is not a conversation or task attempt. It is a **correctly understood and verifiably resolved member episode**.

## 3. Canonical vision

> **CoreOfCare becomes the trusted, portable health-insurance resolution intelligence layer behind the front door: an API/tool-callable domain authority that persists across personal-agent platforms, employers, brokers, TPAs, payers, providers, pharmacies, and changes in coverage.**

CoreOfCare should remain useful even when the user interface changes.

The front door may be:

- a general personal AI agent;
- an employer HR agent;
- a broker assistant;
- a TPA portal;
- a provider workflow;
- a payer member assistant;
- or CoreOfCare's own direct UI.

The interface is replaceable.

CoreOfCare's durable value is the insurance-domain authority beneath the interface.

## 4. Product boundary

### Front-door layer

May be owned by another product or agent.

Typical responsibilities:

- chat;
- voice;
- user-facing memory;
- reminders;
- browser/computer use;
- email;
- messaging;
- phone calls;
- scheduling;
- UI;
- generic task orchestration.

Do not assume CoreOfCare must own these capabilities.

### CoreOfCare resolution layer

CoreOfCare should own:

- exact plan identity;
- employer/sponsor context;
- funding arrangement;
- payer / administrator / TPA / ASO identity;
- PBM and network context;
- plan year and effective dates;
- benefit-rule hierarchy;
- medical/pharmacy policy versioning;
- provider-network rules;
- prior authorization;
- Gold Card/provider-specific exemptions;
- notification-only pathways;
- evidence completeness and provenance;
- member-specific episode state;
- conflict and contradiction detection;
- expected financial responsibility;
- claims/EOB/bill reconciliation;
- denial and appeal logic;
- sponsor/institution incentive context when relevant;
- consent and governance;
- cross-payer longitudinal resolution memory;
- verified final outcome and reopen conditions.

### Execution rails

CoreOfCare should integrate, delegate, or partner where appropriate with:

- payer/CMS FHIR APIs;
- CMS-0057 interfaces;
- CRD / DTR / PAS;
- Patient Access / Provider Access / Payer-to-Payer APIs;
- EHR APIs;
- provider directories;
- pricing APIs;
- pharmacy/formulary systems;
- scheduling infrastructure;
- specialized voice agents;
- general computer-use agents;
- payer/provider portals;
- human advocates.

CoreOfCare does not need to perform every action itself.

Its responsibility is to know **which action should happen next, why, on whose authority, using which evidence, and whether the action actually resolved the episode**.

## 5. Existing architecture to preserve

Do not discard the current engineering substrate.

Preserve:

- one governed LangGraph workflow authority;
- the three data layers:
  - `layer_1_public`
  - `layer_2_member_authorized_api`
  - `layer_3_portal_control`
- deterministic PHI and egress controls;
- source/evidence classes and provenance;
- approval/interrupt gates;
- user takeover for credentials, 2FA, passkeys, captcha, and other sensitive authentication;
- PostgreSQL as source of truth;
- Redis as rebuildable runtime state;
- capability registry / executable tool catalog;
- hash-chained audit;
- Graphiti/Zep-style product-memory boundary;
- fail-closed behavior;
- non-mocked proof discipline.

Do not create a parallel orchestration architecture merely because the product concept changed.

The pivot changes the product boundary and API shape, not the safety foundations.

## 6. Canonical product unit

The product unit is:

> **a sourced first answer + a durable open episode + explicit unresolved questions + bounded delegated actions + verified final outcome**

The product is not finished when:

- an answer is generated;
- a phone call is made;
- a form is submitted;
- an API returns success;
- an authorization request is sent;
- an appointment is scheduled.

Those are intermediate states.

Resolution requires observing the relevant real-world result and confirming it is consistent with the governing evidence, or documenting a defensible blocker/exception.

## 7. Canonical episode state model

Do not collapse action into outcome.

At minimum, distinguish:

- identified
- evidence_incomplete
- ready_for_action
- action_proposed
- action_approved
- action_attempted
- submitted
- acknowledged
- institution_decision_received
- member_outcome_observed
- resolved
- blocked
- reopened

## 8. Canonical API direction

Implementation should converge toward a headless service conceptually equivalent to:

`resolve_member_episode()`

Inputs may include:

- member/patient reference;
- actor;
- consent/delegation;
- sponsor context;
- exact plan pointer or plan-resolution request;
- healthcare/insurance event;
- requested outcome;
- evidence/document pointers;
- current episode state;
- permitted action scopes.

Outputs should include:

- exact plan/funding/admin context;
- authoritative facts with source/version;
- unresolved conflicts;
- unknowns;
- applicable coverage/policy state;
- prior-authorization/exemption state;
- evidence completeness;
- expected financial exposure;
- recommended next action;
- responsible institution/actor;
- required approval;
- eligible executor(s);
- verification requirement;
- current resolution state;
- reopen conditions.

## 9. Durable moat

CoreOfCare should preferentially build and own:

### Normalized insurance graph

Carrier
→ employer/sponsor
→ funding arrangement
→ administrator/TPA/ASO
→ PBM
→ plan
→ network
→ benefit
→ service/drug
→ policy
→ authorization
→ exemption
→ effective version.

### Resolution graph

Episode
→ evidence
→ required actions
→ delegated execution
→ institutional response
→ contradiction
→ correction
→ verified outcome.

### Institutional connectivity

Payers, TPAs, employers, brokers, CMS networks, providers, EHRs, pharmacies, pricing systems, scheduling systems.

### Governance and trust

Consent, PHI boundaries, source provenance, versioning, approval gates, human-review thresholds, sponsor transparency, auditability, verified outcomes.

### Cross-payer resolution memory

What actually resolved prior cases, while never treating historical precedent as a substitute for current authoritative rules.

## 10. What is not the moat

Do not build the company thesis around proprietary versions of generic:

- chat UI;
- voice infrastructure;
- browser/computer use;
- phone calling;
- email/messaging;
- scheduling;
- OCR;
- document summarization;
- model routing;
- generic personal memory;
- generic agent orchestration.

Prefer integrate/partner when safe and practical.

## 11. B2C expression

For the member:

> **CoreOfCare independently verifies what should happen, coordinates the correct next step, and stays with the case until the outcome is documented.**

Strong initial episodes:

- planned procedure;
- prior authorization or exemption;
- drug access/denial;
- unexpected bill;
- claim/EOB discrepancy;
- plan transition affecting ongoing care.

A dedicated CoreOfCare app is optional.

CoreOfCare may be invoked by a general personal agent.

## 12. B2B2C expression

For employers, brokers, TPAs/ASOs, CHOICE/ICHRA administrators, providers, HR platforms, and navigation vendors:

> **CoreOfCare is an embeddable member-resolution service that turns fragmented insurance evidence and institutional workflows into a governed, auditable episode with a verified outcome.**

Enterprise capabilities should emphasize:

- structured case creation;
- consent/delegation;
- evidence attachment;
- exact plan resolution;
- next-action reasoning;
- approvals;
- delegated execution;
- result ingestion;
- verification;
- closure/reopen;
- audit;
- privacy-preserving aggregate outcome reporting where appropriate.

## 13. Weekly market-intelligence lens

For every new market development, ask:

1. Does it commoditize the front door?
2. Does it commoditize one execution rail?
3. Does it make CoreOfCare easier to build by exposing APIs or standardized data?
4. Does it directly compete with CoreOfCare's domain authority?
5. Does it create a new distribution channel?
6. Does it strengthen or weaken the need for an independent member-aligned resolution layer?
7. Should CoreOfCare build, partner/integrate, monitor, or ignore?
8. Is adoption verified, or is the evidence only a launch, pilot, projection, or vendor claim?
9. Does it alter the likely durable moat?
10. Does it change the most valuable episode to prove next?

## 14. First proof after the pivot

Use a planned imaging episode to prove the reusable resolution architecture:

clinical event
→ exact plan/funding/admin identity
→ authorization requirement or exemption
→ evidence completeness
→ in-network options
→ expected member financial exposure
→ delegated execution
→ institutional acknowledgment
→ completed service
→ claim/EOB/provider-bill reconciliation
→ contradiction detection
→ corrective action
→ verified final outcome.

Then prove the same core state model on a disputed medical bill.

The goal is not to build an MRI concierge.

The goal is to prove the reusable CoreOfCare resolution engine.

## 15. Build/partner decision rule

Build/own a capability when it strengthens one or more of:

- insurance-domain authority;
- evidence quality;
- evidence versioning;
- conflict detection;
- durable episode state;
- safe delegation;
- resolution reasoning;
- verified outcome;
- cross-payer portability;
- member-aligned governance;
- enterprise embedding.

Prefer integration/partnership when the capability is generic infrastructure.

## 16. Source-of-truth precedence

Before making product or architecture changes, read:

1. Cortex canonical project: `coreofcare`
2. Cortex mission/vision authority: `semantic/projects/coreofcare-mission-vision-product-boundary.md`
3. Cortex conceptual pivot: `semantic/projects/coreofcare-resolution-intelligence-pivot.md`
4. Live repo: `docs/COREOFCARE_CONCEPTUAL_PIVOT.md`
5. Current implementation plans, phase ledger, and safety/runtime docs in the live repository

Historical Brainsty/Brainstyworkers/workerprototype notes remain useful engineering history, but where they assume the durable product is a standalone concierge/front door, the CoreOfCare mission and pivot win.

## 17. Naming compatibility

Canonical product name: **CoreOfCare**

Legacy aliases:

- Brainsty
- Brainsty Concierge
- Brainstyworkers AI Concierge
- workerprototype-openclaw
- workerprototype_openclaw
- concierge_by_openclaw_hermes

Do not rename technical compatibility identifiers casually.

Existing identifiers such as:

- `BRAINSTY_*` environment variables;
- `brainsty:*` Redis namespaces;
- historical database names;
- old artifact filenames;
- Git history

may remain until a separately tested compatibility migration is justified.

## 18. Your operating instruction

For every proposed feature, implementation, partnership, research finding, or architectural change, answer this question first:

> **Does this make CoreOfCare a better independent insurance-resolution authority that another agent or enterprise workflow would choose to call?**

If no, and the feature is not required for safety, proof, or distribution, deprioritize it.

Do not confuse CoreOfCare with Titanium or RadWorkers.
