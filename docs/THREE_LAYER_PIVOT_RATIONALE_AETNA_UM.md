# Context: Why the system pivots from restricted-context MVP to a three-layer decision architecture (Aetna / University of Miami as the concrete case)

The founder's directive: the concierge must stop treating "public crawl vs. transactional portal access" as a binary. Different insurance data types have fundamentally different access models, staleness tolerances, and legal constraints. The planner must route across THREE distinct data layers.

## Layer 1 — Public / Open-Access Data (No Auth Required)
- **Machine-Readable Files (MRFs)** — Transparency in Coverage Rule. Every employer plan must publish MRFs monthly at a public URL (Aetna self-insured MRF portal: health1.aetna.com). JSON files with every negotiated in-network rate per NPI/TIN, all CPT codes, out-of-network allowed amounts. Multi-GB; no member-specific cost-sharing.
- **Provider Directory API** — CMS-mandated. Aetna exposes a public FHIR R4 Provider Directory API (Da Vinci PDex Plan-Net IG), no member auth (client-credentials token). Query in-network providers by plan, specialty, location, NPI.
- **UM HR Benefits Portal** — hr.miami.edu publishes SPDs, benefits grids, Welcome Books publicly. UM Aetna plan has four medical plan options (incl. HRA and HSA variants).
- **CMS Public Use Files** — Exchange PUFs with premiums, copayments, geographic coverage; CMS developer tools include a daily crawl of insurer formulary/provider documents.
- Covers well: provider search, plan comparison, formulary lookup, cost estimates, benefits education, prior-auth documentation requirements (public Prior Authorization API arriving January 2027 under CMS-0057-F).

## Layer 2 — Member-Authorized FHIR API (SMART on FHIR / OAuth2)
The transactional READ layer; the right answer for personalized member-specific support. Aetna has a live CMS-mandated Patient Access API at developerportal.aetna.com (FHIR R4, SMART on FHIR):
- ExplanationOfBenefit (full claims history), Coverage (plan, member ID, group number, effective dates), Patient, Observation, prior-auth decisions (expanding under CMS-0057-F, required Jan 2027).
- OAuth2 flow: register app at developerportal.aetna.com → user redirected to apif1.aetna.com/fhir/v1/fhirserver_auth/oauth2/authorize → member logs in with Aetna portal credentials and consents → app receives access + refresh tokens, scope `launch/patient patient/*.read`, `offline_access` for refresh.
- Protocol: HL7 Da Vinci PDex Member-Authorized OAuth2 Exchange.
- **Critical nuance:** UM likely operates a SELF-FUNDED plan administered by Aetna (Aetna = TPA). Aetna's Patient Access API covers fully insured Commercial plans in production; self-funded groups may differ — must validate during developer-portal registration whether UM's group is in scope. If not, portal scraping becomes the fallback for that layer only.

## Layer 3 — Authenticated Portal Scraping (Selective, Not First Resort)
For data/actions with NO FHIR API equivalent: schedule appointments, submit claim forms with attachments, real-time claim status before EOB appears in FHIR, employer HR portal enrollment changes, download EOB PDFs. Pattern: on-demand, session-based scraping with member credential delegation (in-session auth pass-through, NOT credential storage). Risks: ToS, bot detection, session fragility. Use only where FHIR doesn't reach.

## Routing table (user need → source → approach → freshness)
| User Need | Data Source | Approach | Freshness |
|---|---|---|---|
| Find in-network provider | Aetna Provider Directory FHIR API | Public FHIR (no auth) | Daily |
| Cost estimate for procedure | MRF + plan SPD | Pre-indexed RAG | Monthly |
| Benefits explanation | UM HR SPD PDFs + CMS PUF | RAG over ingested docs | Annual |
| Claims history / EOB | Aetna Patient Access FHIR API | Member-authorized FHIR | Real-time |
| Active coverage / deductible status | Aetna Coverage FHIR resource | Member-authorized FHIR | Real-time |
| Prior auth requirements | Public Prior Auth API (2027) / MRF interim | FHIR + RAG | Per-query |
| Submit a claim | Aetna member portal | RPA/browser agent | On-demand |
| Schedule appointment | Provider portal | RPA/browser agent | On-demand |
| Claim status (live) | Aetna portal | RPA/browser agent | On-demand |
| Plan comparison (UM options) | UM HR public PDFs | RAG | Annual |

## Agentic architecture pattern (target)
1. Intent classification agent — informational (L1 RAG) vs personalized-read (L2 FHIR) vs action-required (L3 RPA).
2. Knowledge base — pre-indexed vector store: UM SPDs, CMS PUFs, Aetna formulary, scraped FAQ/Reddit only as weak signal for confusion patterns.
3. FHIR client agent — OAuth token lifecycle, FHIR queries, maps FHIR R4 → plain language.
4. Action agent — browser automation, bounded autonomy, human confirmation before writes.
5. Orchestrator — routes between layers; re-queries FHIR if RAG answer lacks personalization.

Regulatory tailwind: CMS-0057-F (operational 2026, APIs 2027) forces Aetna to expand Patient Access API with prior-auth data, denial-reason transparency, Prior Auth APIs.

**Bottom line:** Pre-index the public layer into RAG for general/anonymous queries. SMART on FHIR is the primary personalized data pipe (legally cleanest, most stable, CMS-mandated). Reserve RPA scraping only for real-time actions with no FHIR equivalent, always gated by explicit user confirmation.

## Founder's implementation constraints (normative for the plan)
1. Adapt the CURRENT working system (PEMS, DB schema, mapped workflows, agent state variables, checkpoints, Postgres + Redis pointers) to the layer-based decision — without breaking or degrading working integration.
2. Reuse/adapt already-developed workflows, tools, state variables, checkpoints, DB pointers wherever possible.
3. For new API connections: determine best implementation — required enrollment (done by the founder's company), MCP vs facade vs direct API, best interface, query and pagination strategy.
4. The new planner prompt draft must be ADAPTED to the current prompt/agent state/checkpoints/pointers so the orchestrator LLM can take the best decision — not pasted verbatim.
5. Proof-and-test cycle mandatory: no scaffold systems/modules/databases, no mock connections or scripts; pointers and databases proven by deferred pointers and real queries; every new or adapted function needs runtime comprovation to be accepted. All runtime-working, not mocked. (See docs/NON_MOCKED_PROOF_RULES.md.)
6. NO dual systems: do not keep two different logics or switch functions between decision pathways. The new directive replaces the old one; old pathway is removed, not toggled.
7. Connectors requiring the founder's prior signature/enrollment (e.g., Aetna developer portal production access, clearinghouse agreements) are DEFERRED to the latest phases; everything not gated on signature lands earlier.
