# CoreOfCare — Conceptual Pivot and Implementation Authority

Status: founder-approved conceptual pivot
Date: 2026-11-23
Previous product identity: Brainsty / Brainstyworkers AI Concierge
Compatibility repository: `MarceloDe/concierge_by_openclaw_hermes`

## 1. Canonical product definition

CoreOfCare is not primarily a destination app or chatbot.

> **CoreOfCare is the independent, member-aligned health-insurance resolution intelligence layer behind the front door. It gives any authorized AI agent or enterprise workflow the ability to safely understand, verify, coordinate, and resolve U.S. health-insurance episodes.**

A CoreOfCare app may continue to exist as a reference client, proof surface, or direct B2C distribution channel. It is not the product boundary.

The durable product is the domain authority underneath whichever front door the member already uses.

Possible front doors include:

- personal agents;
- employer HR agents;
- broker assistants;
- TPA portals;
- provider workflows;
- payer/member assistants;
- CoreOfCare's own direct interface.

## 2. Why the pivot exists

General personal and enterprise agents are rapidly commoditizing the visible concierge layer:

- chat and voice;
- generic personal memory;
- browser/computer use;
- email and messaging;
- phone calls;
- form filling;
- reminders;
- appointment scheduling;
- generic workflow orchestration;
- generic health-record summarization;
- generic benefit explanation.

CoreOfCare should not compete primarily on those capabilities.

The strategic question is not whether another agent can open a portal or make a phone call. The strategic question is:

> When that agent needs to know what the correct insurance action actually is, does it reason from scratch, or does it call CoreOfCare?

CoreOfCare should be built so that the answer is: **call CoreOfCare**.

## 3. The three logical layers

### Layer A — Front-door agent

The front-door agent owns the user-facing relationship.

Typical responsibilities:

- conversation;
- user-facing memory;
- notifications;
- email;
- phone;
- browser interaction;
- UI;
- generic task orchestration.

CoreOfCare must not assume it owns this layer.

### Layer B — CoreOfCare resolution authority

CoreOfCare owns insurance-domain interpretation, evidence state, decision state, and resolution verification.

It should answer:

- Which exact plan governs this episode?
- Is the plan fully insured, self-funded, ASO-administered, CHOICE/ICHRA, Medicare, Medicaid, Marketplace, or another structure?
- Which administrator, TPA, PBM, network, and sponsor are relevant?
- Which plan year and policy version apply?
- What benefit rule applies?
- Is prior authorization required?
- Is there a provider-specific Gold Card or exemption?
- Is the pathway authorization, notification-only, or no authorization?
- What evidence is present?
- What evidence is missing?
- What did the payer/provider/TPA/PBM actually do?
- Are their outputs mutually consistent?
- What is the next evidence-supported action?
- Who is responsible for it?
- Which user/human approval is required?
- Which executor may safely perform it?
- Did the action produce the expected institutional result?
- Did the member ultimately receive the correct care and financial outcome?
- Is the episode actually resolved?

### Layer C — Execution rails

CoreOfCare should integrate or delegate to specialized execution infrastructure rather than unnecessarily rebuilding it.

Examples:

- payer FHIR APIs;
- CMS-0057 interfaces;
- CRD / DTR / PAS;
- Patient Access / Provider Access / Payer-to-Payer APIs;
- EHR APIs;
- provider-directory services;
- real-time pricing services;
- pharmacy/formulary services;
- scheduling services;
- specialized voice agents;
- general computer-use agents;
- payer/provider portals;
- human advocates.

CoreOfCare does not need to own every action.

It needs to know **which action should happen next, why, on whose authority, using which evidence, and whether the action actually resolved the case**.

## 4. Preserve the existing three-data-layer architecture

The July 2026 architecture remains valid:

1. `layer_1_public`
2. `layer_2_member_authorized_api`
3. `layer_3_portal_control`

These become evidence and execution substrates beneath CoreOfCare.

They continue to govern:

- access authority;
- freshness;
- source trust;
- privacy;
- execution permissions;
- fallback strategy.

Do not create a parallel data architecture for the pivot.

## 5. Preserve the existing safety architecture

The pivot changes product positioning, not safety authority.

Preserve:

- one governed LangGraph workflow authority;
- deterministic PHI/egress rails;
- evidence classes and source pointers;
- approval and interrupt gates;
- human takeover for credentials/2FA/captcha;
- PostgreSQL source of truth;
- Redis rebuildable runtime mirrors;
- capability registry / executable tool catalog;
- hash-chained audit;
- Graphiti/Zep-style product memory boundaries;
- fail-closed behavior;
- non-mocked proof discipline.

Do not create a second orchestration engine.

## 6. Canonical product unit: the insurance-resolution episode

A CoreOfCare product unit is not a chat answer.

It is:

> **a sourced first answer + a durable open episode + explicit unresolved questions + bounded delegated actions + verified final outcome**

The existing value-delivery model:

> evidence → first value → open job → verified outcome

should become the generalized episode model.

## 7. Canonical episode contract

The implementation should converge toward a tool/API abstraction equivalent to:

`resolve_member_episode()`

### Inputs

- member/patient reference;
- actor;
- consent/delegation;
- sponsor context;
- exact plan pointer or plan-resolution request;
- healthcare/insurance event;
- requested outcome;
- document/evidence pointers;
- current episode state;
- permitted execution scopes.

### Outputs

- exact plan identity;
- funding arrangement;
- payer/administrator/PBM/network context;
- authoritative facts with source/version;
- unresolved conflicts;
- unknowns;
- applicable coverage state;
- authorization/exemption state;
- evidence completeness;
- financial exposure;
- recommended next action;
- responsible actor/institution;
- required approval;
- eligible executor(s);
- verification requirement;
- current resolution status;
- reopen condition.

## 8. Resolution-state semantics

Do not collapse execution into success.

At minimum, preserve different states for:

- identified;
- evidence_incomplete;
- ready_for_action;
- action_proposed;
- action_approved;
- action_attempted;
- submitted;
- acknowledged;
- institution_decision_received;
- member_outcome_observed;
- resolved;
- blocked;
- reopened.

A phone call made is not resolution.

A form submitted is not resolution.

A payer response received is not resolution.

Resolution means the relevant real-world outcome has been observed and is consistent with authoritative evidence.

## 9. Core company assets

### A. Normalized insurance graph

Carrier
→ sponsor/employer
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
→ version.

### B. Resolution graph

Episode
→ evidence
→ required actions
→ delegated execution
→ institutional response
→ contradiction
→ correction
→ verified outcome.

### C. Institutional connectivity

Build or partner for access to:

- payers;
- TPAs;
- employers;
- brokers;
- CMS networks;
- providers;
- EHRs;
- pharmacies;
- pricing systems;
- scheduling systems.

### D. Trust and governance

CoreOfCare should preserve:

- explicit user/member consent;
- PHI boundaries;
- source provenance;
- versioned evidence;
- approval gates;
- human-review thresholds;
- sponsor transparency;
- auditability;
- outcome verification.

### E. Cross-payer resolution memory

CoreOfCare should retain what actually resolved prior cases while distinguishing historical precedent from current contractual truth.

The durable memory is not merely what the user asked.

It is:

- what the member was trying to accomplish;
- which rules applied;
- which evidence existed;
- what was missing;
- which actors acted;
- what failed;
- what correction worked;
- what final outcome was verified.

## 10. What is explicitly not the moat

Do not build the company thesis around:

- chat UI;
- generic voice infrastructure;
- generic browser automation;
- generic computer use;
- generic phone calling;
- generic email;
- generic messaging;
- generic scheduling;
- generic OCR;
- generic document summarization;
- generic personal memory;
- generic model routing;
- generic agent orchestration.

Integrate these where safe and practical.

## 11. B2C model

CoreOfCare B2C does not require forcing users to install another app.

Possible distribution:

- CoreOfCare direct interface;
- personal-agent connector/skill;
- Medicare/patient-selected app ecosystems;
- provider referral;
- advocacy groups;
- external assistant integration.

The B2C promise should be high-intent:

> **CoreOfCare independently verifies what should happen, coordinates the correct next step, and stays with the case until the outcome is documented.**

Strong initial episode classes:

- planned procedure;
- drug access/denial;
- unexpected bill;
- claim/EOB discrepancy;
- plan transition affecting ongoing treatment.

## 12. B2B2C model

CoreOfCare should be embeddable behind:

- brokers;
- TPAs/ASOs;
- CHOICE/ICHRA administrators;
- self-funded employers;
- specialty providers;
- HR platforms;
- navigation vendors.

The enterprise product is primarily a structured resolution service, not a white-label chatbot.

Required enterprise capabilities:

- case creation;
- consent/delegation;
- evidence attachment;
- plan resolution;
- state retrieval;
- action proposal;
- approval;
- delegated-result ingestion;
- verification;
- closure/reopen;
- audit trail.

## 13. Sponsor context

Each enterprise episode should explicitly identify:

- who sponsors access;
- who bears claims risk when relevant;
- who administers the plan;
- who controls pharmacy benefit decisions;
- what data the sponsor may receive;
- whether recommendations may include sponsor steerage;
- whether the user-facing mode is member-primary, employer-sponsored, provider-sponsored, or payer-sponsored.

Sponsor context must not silently alter source-grounded member facts.

## 14. External executors are evidence sources, not automatic truth

Any result returned by:

- a browser agent;
- voice agent;
- payer API;
- provider API;
- scheduling system;
- human operator;
- uploaded document

must be evaluated for:

- source identity;
- member/plan match;
- date/effective version;
- expected schema;
- institutional acknowledgment;
- contradiction with stronger evidence.

Execution results should be treated as untrusted until verified according to the evidence hierarchy.

## 15. First implementation proof

Use one planned imaging episode.

The purpose is no longer "build an MRI concierge."

The purpose is to prove reusable insurance-resolution infrastructure:

1. receive/detect the imaging event;
2. resolve exact plan/funding/admin context;
3. determine authorization requirement or exemption;
4. determine required supporting evidence;
5. identify appropriate in-network options;
6. estimate member financial exposure;
7. delegate scheduling/portal/API/voice work as needed;
8. verify institutional acknowledgment;
9. observe service completion;
10. reconcile claim/EOB/provider bill;
11. detect contradiction;
12. prepare or execute the approved correction;
13. verify corrected outcome;
14. close with a durable episode record.

Then test the same architecture with a disputed medical bill.

The same episode-state model must support both pre-service access and post-service financial resolution.

## 16. MVP success criteria

The pivot is not proven by a chatbot that answers correctly.

It is proven when an internal or external agent can call CoreOfCare and CoreOfCare can:

- identify the governing insurance context;
- return a source-grounded decision;
- identify a meaningful unresolved step;
- safely delegate or guide the step;
- ingest the result;
- verify it;
- preserve durable state;
- identify contradictions;
- reach a defensible resolution or explicit blocker;
- expose an auditable reason for why the case is considered resolved.

## 17. Implementation filter

For every proposed feature, ask:

1. Does it strengthen insurance-domain authority?
2. Does it improve evidence quality, versioning, or conflict detection?
3. Does it improve durable episode state?
4. Does it improve safe delegation?
5. Does it improve verified resolution?
6. Does it strengthen cross-payer portability?
7. Does it improve enterprise embedding?
8. Is it a commodity function we should integrate instead of build?

If the answer is no to the meaningful CoreOfCare criteria and the feature is not required for safety/proof, deprioritize it.

## 18. Naming migration policy

CoreOfCare is the canonical product name as of this pivot.

For compatibility, do not immediately rename runtime identifiers whose changes could create unnecessary breakage, including:

- `BRAINSTY_*` environment variables;
- `brainsty:*` Redis namespaces;
- database names;
- historical artifact filenames;
- old Git history;
- old Cortex note IDs;
- published evidence paths.

Those identifiers may be migrated in a separately tested compatibility phase if there is a concrete reason.

Current naming hierarchy:

- **Product/brand:** CoreOfCare
- **Concept:** independent health-insurance resolution intelligence layer
- **Legacy product aliases:** Brainsty, Brainstyworkers AI Concierge
- **Compatibility repo slug:** `concierge_by_openclaw_hermes`
- **Runtime compatibility identifiers:** existing Brainsty/Brainstyworkers technical keys remain valid until explicitly migrated.

## 19. Relationship to previous architecture

This pivot supersedes the previous product-level assumption that the durable product is a standalone concierge/front door.

It does **not** discard completed engineering.

Preserve and reinterpret:

- three data layers;
- planner;
- capability catalog;
- source/evidence contracts;
- approvals;
- audit;
- PostgreSQL;
- Redis;
- product memory;
- OpenClaw bounded execution;
- existing provider/payer/public connectors;
- value-delivery episode work.

The new implementation direction is:

> **headless first, interface optional, member-aligned, evidence-grounded, resolution verified.**
