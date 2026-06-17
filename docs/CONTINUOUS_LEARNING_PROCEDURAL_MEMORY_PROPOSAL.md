# Continuous-Learning Procedural Memory — Design Proposal

> Status: **proposal / pre-implementation** · Author: Claude Code · Date: 2026-06-17
> For discussion in the next implementation phase. Cross-domain synthesis from the
> `~/projects/brain` graphify knowledge graph (1489 nodes / 1419 edges) applied to this
> project's runtime. No insurance-specific result was assumed from the literature; each
> paper contributes a domain-general mechanism transferred here.

## 0. Scope and relationship to existing docs

This proposal designs **how the concierge accumulates and improves its procedural expertise
over time** — the steps, validations, and decision points for counseling a user through an
insurance procedure or medical-office appointment — **without hand-authoring a workflow for
every `(member × plan × provider × procedure)` combination**.

It builds directly on what already exists in this repo:

- **`docs/INSURANCE_PLAN_SKILL_METHODOLOGY.md`** — a plan is a *bounded, versioned,
  inspectable, correctable specialist skill* distilled from BrainstyWorkers traces
  (COLLEAGUE.SKILL trace-to-skill). **That doc covers the per-plan *semantic* artifact.**
  This proposal adds the **cross-plan *procedural* memory and the continuous-learning loop**
  that grows and matures those skills.
- **The deterministic safety harness** (policy gates run *before* the model; answers fail
  closed without verifiable evidence; PHI masked on egress; hash-chained audit). The gate
  skeleton below is an extension of that philosophy, not a departure from it.
- **The runtime**: LangGraph.js orchestrator (`src/concierge/langgraphRunner.mjs`), Zep
  Graphiti/FalkorDB product memory (`src/concierge/productMemory.mjs`, bitemporal), OpenClaw
  read-only browser worker, FastAPI auth facade.
- The senior architecture evaluation (`docs/SENIOR_ARCHITECTURE_EVALUATION_2026-06-11.md`)
  flagged that the graph is **linear simulating branching**. The gate skeleton here is
  expressed as **real conditional edges + escalation interrupts**, which closes that gap.

> Note: **Cortex is not in scope.** Cortex is the *agents' design-note vault* (memory about
> this project for the people/agents building it), per `goal_final_system.md` ("Product
> memory is Zep Graphiti … not Cortex"). All product memory below is Zep Graphiti/FalkorDB.

## 1. Problem

A single LLM context cannot reliably hold *plan rules + this member's situation + live case
state + the reasoning trace*. State corrupts across turns (the "belief drift" failure mode).
And the scenario space is combinatorial — we cannot pre-build a playbook per
plan×provider×procedure. We want:

1. a **thin, hand-built skeleton of universal field rules** (these genuinely exist: *is the
   external case info complete? is coverage active? is the plan loaded? what is the member's
   status for this request? is prior authorization required?*);
2. **particular scenarios that accrete as procedural memory**, grown two ways — from **daily
   platform use** and from **nightly BrainstyWorkers external research** of cases/policy that
   occur *outside* the platform; and
3. a **nightly consolidation ("dream")** that matures both streams into long-term procedural
   memory and improves the harness — yielding active learning that **transfers across users**.

## 2. Architectural spine — five mechanisms, one substrate

Each row is a domain-general mechanism from the literature, transferred onto this runtime.

| Concern | Mechanism (paper) | Transfer to the concierge |
|---|---|---|
| Working state | **Harness-1** — stateful cognitive offloading (arXiv 2606.02373v1) | the LLM never *remembers* case facts; a typed `CaseState` holds them — inspectable, recoverable, PHI-auditable. Directly serves the "fail-closed, evidence-required" harness. |
| Procedural access at inference | **MRAgent** — *reconstruct, not retrieve* (ICML 2026, github.com/Ji-shuo/MRAgent) | the per-scenario sub-workflow is **reconstructed** from skill fragments and pruned by live evidence — not a static playbook lookup. Defeats the combinatorial blow-up. |
| Procedural lifecycle | **FluxMem** — 3-stage evolving connectivity (arXiv 2605.28773v1) | Stage I seed skeleton → Stage II online refinement → Stage III nightly consolidation (PEMS maturity + skill induction). |
| Nightly optimization | **RHO** — label-free self-preference (arXiv 2606.05922v1) | rank/improve skills overnight **without** ground-truth outcomes (insurance outcomes are delayed/sparse). |
| Decision validation | **NeSTR** — consistency verification + abductive reflection (arXiv 2512.07218v1) | each decision point is gated; contradictions trigger revision, not halt/hallucination — i.e., fail-closed with recovery. |
| Substrate | **Zep Graphiti / FalkorDB** (already in repo) | one bitemporal store for semantic facts + episodic cases + procedural skills + collective patterns. No new memory framework. |

## 3. Part A — The universal rule skeleton (FluxMem Stage I), at full granularity

Hand-build **once**: a fixed LangGraph of ~9 domain-general gates over a typed `CaseState`.
Gates `G0–G5, G7, G8` are universal; **`G6` is the only scenario-specific node, and it is
never hand-written — it is *reconstructed* from procedural memory (§4).**

### 3.1 `CaseState` (externalized working memory — Harness-1)

```ts
type CaseState = {
  // identity / request
  member_id: string;
  plan_id: string;                 // → payer+product in semantic memory (per-plan skill)
  provider_npi?: string;
  procedure_code?: string;         // CPT/HCPCS
  diagnosis_code?: string;         // ICD-10
  date_of_service: string;         // ISO — drives bitemporal Graphiti queries
  request_type: "eligibility" | "cost" | "appointment" | "prior_auth" | "appeal";
  // derived facts (written by gates; never free-invented by the LLM)
  eligibility_active?: boolean;
  plan_loaded?: boolean;
  network_tier?: "in" | "out" | "tiered" | "unknown";
  accumulators?: { deductible_met: boolean; oop_met: boolean; remaining_usd: number };
  preauth_required?: boolean;
  coverage_rule_id?: string;
  // process / audit (feeds the hash-chained audit log)
  steps: StepRecord[];             // ordered: gate, evidence, citations, confidence
  open_questions: string[];
  confidence: number;              // rolling min over gate confidences
  escalate: boolean;
  reconstruction_frontier: string[]; // MRAgent cues still being explored in G6
};
```

Every gate reads/writes `CaseState`. The reasoning lives in **graph + state**, not in an
ever-growing prompt. This also removes the "linear graph simulating branching" smell: gates
are real nodes with conditional edges.

### 3.2 The universal gates

For each: **precondition → action → branches**, and whether it is *deterministic* (KG/API
lookup) or *LLM-judged* (and therefore validated by G7 before it can influence an answer).

| Gate | Reads | Action | Pass | Fail / Unknown | Kind |
|---|---|---|---|---|---|
| **G0 INTAKE** | raw request | external case info complete for `request_type`? | all slots → G1 | missing → emit `open_questions`, elicit, re-enter | deterministic (schema) |
| **G1 ELIGIBILITY** | member, DOS | coverage active for date of service? | active → G2 | inactive/unknown → fail-closed advise OR escalate | deterministic (portal/API) |
| **G2 PLAN LOADED** | plan_id | per-plan specialist skill present & **valid at DOS**? | loaded → G3 | not loaded → enqueue **night-fetch** (Path B), serve degraded + flag | deterministic (Graphiti bitemporal) |
| **G3 STATUS** | member, plan | member status *for this request*: tier, accumulators | resolved → G4 | partial → `open_questions`, continue w/ uncertainty | deterministic |
| **G4 RULE MATCH** | procedure/dx, plan | retrieve coverage / medical-necessity rule | found → set `coverage_rule_id`, G5 | none → G6 reconstructs from analogous rules | deterministic + reconstruct |
| **G5 PRE-AUTH** | rule, procedure | **decision point**: prior auth required? | resolved → G6 | unknown → reconstruct, then G7 | LLM-judged |
| **G6 SCENARIO** | full state | **reconstruct** the procedure sub-workflow from procedural memory (§4) | steps execute → G7 | no skill ≥ maturity → skeleton fallback + escalate, **log the gap** for the night job | reconstruct |
| **G7 VALIDATE** | steps, facts | NeSTR consistency check; abductive repair on contradiction | consistent → G8 | contradiction → revise; if irreparable → escalate | LLM-judged + symbolic |
| **G8 DECIDE** | confidence | gate: `confidence ≥ τ` → advise w/ evidence trace; else **escalate to human oracle** (failing step identified) | advise | escalate | deterministic gate |

**The hand-built surface is exactly this table.** Everything plan/procedure-specific lives in
G6's reconstructed content, which the system grows itself.

## 4. Part B — How G6 reconstructs a scenario (MRAgent: what the newest paper gives us)

MRAgent's thesis — *"memory is reconstructed, not retrieved"* — replaces the static
**retrieve-then-reason** pipeline with reasoning **integrated into** memory access:
iteratively **explore and prune** retrieval paths over a **Cue–Tag–Content graph** where
*associative tags bridge fine-grained cues to contents*, **avoiding combinatorial explosion
from unconstrained expansion**. Reported +23% on LoCoMo/LongMemEval at lower token+runtime
cost.

Why this is the right access layer here (not generic RAG): our worst case *is* combinatorial.
MRAgent says we don't store a playbook per combination — we reconstruct one:

- **Cue** = live `CaseState` facts (`procedure=MRI-knee`, `plan=PPO-X`, `network=in`,
  `preauth=unknown`).
- **Tag** = associative bridges over procedural memory (`imaging-prior-auth`,
  `high-cost-outpatient`, `tiered-coinsurance`). Tags let a **never-seen plan-procedure pair
  reconstruct from fragments of *related* matured skills** — the formal answer to "I won't
  hand-build every combo."
- **Content** = procedural skill fragments (PEMS-matured), and the per-plan specialist skill
  from `INSURANCE_PLAN_SKILL_METHODOLOGY.md`.
- **Active pruning** = G6 expands the `reconstruction_frontier` one hop at a time and the
  validation gate (G7) **prunes** invalid branches as evidence accrues (once `network=in`,
  all out-of-network branches drop). This is what keeps the blow-up tractable and cheap.

```js
async function g6Reconstruct(state, pmem) {            // pmem = procedural graph in Graphiti
  let frontier = pmem.tagsFor(deriveCues(state));      // associative bridges
  const plan = new SubWorkflow();
  while (frontier.length && !plan.complete()) {
    const frag = await pmem.bestFragment(frontier, state); // LLM-in-the-loop, evidence-aware
    if (await validate(frag, state)) {                 // NeSTR consistency → else prune
      plan.attach(frag); frontier = pmem.expand(frag, state);
    } else frontier = frontier.filter(f => f !== frag);
  }
  if (plan.maturity() < PEMS_MIN) { logGap(state); return skeletonFallback(state); }
  return plan;                                          // feeds back as an episode
}
```

So **MRAgent supplies the inference-time access pattern**, **FluxMem the lifecycle that fills
it**; they compose (FluxMem grows the Cue-Tag-Content store, MRAgent reads it).

## 5. Part C — The two pathways that grow procedural memory

Both write **candidates**; both converge on a **PEMS maturity gate** before anything becomes
trusted. They are separate because Path A can only learn what the platform has *seen*; Path B
imports the exception tail from the outside world.

```
   PATH A  (daily platform use — endogenous)        PATH B  (nightly BrainstyWorkers — exogenous)
   ┌────────────────────────────────────────┐       ┌─────────────────────────────────────────────┐
   │ each resolved case → episodic note      │       │ BrainstyWorkers scrape SBC/SPD/EOC/formulary/ │
   │ (append-only, user-scoped, in Graphiti) │       │ prior-auth/appeals + cases OUTSIDE platform   │
   │            │ nightly                      │       │            │ nightly                          │
   │ episodic clustering + skill induction    │       │ change-detect vs last run → diffs              │
   │ (FluxMem Stage III, COLLEAGUE-style)     │       │ validated facts (semantic: confidence+cite)    │
   │            │                              │       │ + synthesized EXCEPTION skills                 │
   └────────────┼─────────────────────────────┘       └────────────┼──────────────────────────────────┘
                └───────────────► PEMS maturity gate ◄──────────────┘
                                         │  RHO label-free self-preference ranks variants
                       promote (new version, supersedes) → PROCEDURAL skill (long-term)
                                         │  generalize cross-user → COLLECTIVE patterns
```

### 5.1 Path A — learning from daily platform use (FluxMem Stage III)

1. **Capture (online).** Every resolved case appends an **episodic** record to Graphiti
   (append-only): full `steps[]`, cues, the reconstructed sub-workflow, decision, and — when
   it later arrives — the **real outcome** (claim approved/denied, appointment booked).
2. **Cluster + induce (nightly).** Cluster similar episodes and induce a **candidate
   procedural skill** — the same trace-to-skill distillation already described in
   `INSURANCE_PLAN_SKILL_METHODOLOGY.md`, now applied to *interaction* traces, not just plan
   documents.
3. **Score (RHO).** Where variants compete, rank by self-preference over replayed rollouts
   using `rank_val` + `rank_con` — **no labeled outcome required**. Real outcomes, when
   present, become a stronger reward (learn from failed trajectories).
4. **Mature (PEMS).** Promote candidate → trusted only after it proves out; below threshold
   it stays shadow-only and G6 won't rely on it. Promotion is a **new skill version
   (supersedes)** — consistent with "versioned, inspectable, correctable."

### 5.2 Path B — nightly BrainstyWorkers external study (exogenous)

The part Path A structurally cannot provide: **exceptions and policy that never appeared in
platform usage.** This *is* the BrainstyWorkers research role, run nightly.

1. **Study.** BrainstyWorkers web-search + scrape payer bulletins, CMS/DOI updates,
   formulary/prior-auth changes, and publicly observable cases (appeals, coverage
   explainers) — i.e., the authoritative-materials pipeline already defined in the skill
   methodology doc, on a schedule.
2. **Change-detect.** Diff against the previous run; keep only new/changed items.
3. **Validate → write.** New **facts** land in **semantic** memory with `confidence` +
   `citations` (and authority level, per the methodology's low-/high-authority marking); new
   **exception handling** is synthesized into candidate **procedural** skills.
4. **Same gate.** These candidates enter the **same PEMS gate** and RHO ranking — external
   knowledge is held to the same maturity bar as learned knowledge before G6 trusts it.

### 5.3 Why this transfers across users

- **Episodic = user-scoped** (append-only, PHI-masked). **Procedural = user-agnostic** (skills
  generalize over the cue space, never over a `member_id`). **Collective** holds cross-user
  patterns ("for PPO-X imaging, prior-auth required ~90%").
- A skill matured from user A's case (Path A) or a scraped policy change (Path B) is
  immediately available to user B's reconstruction in G6 — **compounding, cross-user
  improvement**, while no member's private episode enters another's context.

## 6. Wiring on the current runtime

- **Keep** LangGraph.js as the harness; **Keep** Zep Graphiti/FalkorDB as the single
  bitemporal substrate. Graphiti's valid-time vs ingestion-time is exactly right: Path B
  writes ingestion-time nightly; G2/G4 read valid-time at `date_of_service`. **No second
  memory framework.**
- **Graphiti namespaces (one store, four logical layers):**

  | Layer | group | write rule |
  |---|---|---|
  | Semantic (plan skills, codes) | `semantic:plan:<plan_id>` | bitemporal facts; confidence + citations + authority |
  | Episodic (cases) | `episodic:member:<member_id>` | append-only; full `steps[]`; PHI-masked |
  | Procedural (skills) | `procedural:skills` | Cue-Tag-Content fragments; `pems`, `version`, `supersedes` |
  | Collective (patterns) | `collective:patterns` | cross-user aggregates, no PII |

- **LangGraph**: 9 gate nodes G0–G8 with **real conditional edges** + escalation interrupt
  (resolves the "linear-graph" liability). `scenario_reconstruct` calls `g6Reconstruct`.
- **Nightly job** (this project's own scheduler — *not* cortex's): `00:00` Path A cluster +
  induce → `00:30` Path B BrainstyWorkers scrape + change-detect → `01:00` RHO rollout
  ranking → `01:30` PEMS promotion (versioned) → `02:00` generalize to collective. Honors the
  existing fail-closed and audit invariants.

## 7. Genuinely new work for the next phase

1. `CaseState` typed object + the 9 universal gates as real LangGraph conditional edges. *(Biggest reasoning win; also fixes the linear-graph liability.)*
2. `g6Reconstruct` — MRAgent Cue-Tag-Content reconstruction over `procedural:skills`.
3. NeSTR validation (G7) + RHO confidence gate (G8) with human-oracle escalation.
4. The two-stream nightly job (Path A induction + Path B BrainstyWorkers scrape) → one PEMS gate.
5. PEMS scorer + RHO label-free ranker (the only ML-ish components).

Everything else (memory substrate, plan-skill artifact, BrainstyWorkers research pipeline,
audit transport) already exists in the repo.

## 8. Open questions for discussion

- PEMS threshold + shadow-mode policy before a skill may drive a real recommendation.
- How aggressively Path B may write **procedural** skills (vs only **semantic** facts) before
  human review — exceptions are high-risk in a fail-closed product.
- Whether RHO self-preference is trustworthy for compliance-sensitive **coverage
  determinations**, or whether G8 should hard-require **real, cited evidence** for any
  coverage-determination skill to mature (keep cost/appointment skills on the label-free
  path). This must stay consistent with the "no answer without verifiable evidence" rule.
- Outcome-feedback latency: backfilling episodic notes when a claim resolves weeks later.

---

*Prepared by Claude Code from the local graphify knowledge graph via cross-domain inference;
no insurance-specific result was assumed from the literature. Product memory references are
Zep Graphiti/FalkorDB (not Cortex). For discussion in the next implementation phase.*
