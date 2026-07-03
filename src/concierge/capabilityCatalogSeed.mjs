import { BRAINSTY_GRAPH_NODE_NAMES } from "./langgraphRunner.mjs";

export const CAPABILITY_CATALOG_VERSION = "2026-07-03.capability-catalog-seed.v4";

const VALID_NODES = new Set(BRAINSTY_GRAPH_NODE_NAMES);

// Only backing keys that already exist in workflow_definitions/openclaw_skills/
// tool_registry are referenced (FKs are enforced). Items requiring NEW backing rows
// (provider_network_navigation, cost_estimate_navigation workflows; ocr_local /
// browser_automation skills; cms_icd10_lookup tool; user_takeover_login graph node)
// are DEFERRED to a later step because they require new workflow_definitions / policy
// allowed-workflows. See docs/CAPABILITY_PORTFOLIO_SCHEMA_PROPOSAL.md section 6.
const meta = (when, why, best, score) => ({ when_to_use: when, why_use: why, best_used_for: best, planner_score: score });

// Reusable process spines (all node names are in BRAINSTY_GRAPH_NODE_NAMES; validated at seed time).
// Spine A = portal/observe (user login takeover -> idempotent read-only worker dispatch -> cited evidence).
// Spine B = research/parse (no login; gather published/uploaded evidence -> cited answer).
// Spine C = approval (short native HITL pause).
const SPINE_A_GRAPH = ["input_policy", "recall_context", "llm_decision", "workflow_router", "plan_journey", "skill_resolver", "workflow_executor", "observe_evidence", "approval_pause", "case_state_shadow", "compose_response"];
const SPINE_B_GRAPH = ["input_policy", "recall_context", "llm_decision", "workflow_router", "plan_journey", "skill_resolver", "workflow_executor", "observe_evidence", "case_state_shadow", "compose_response"];
const SPINE_C_GRAPH = ["input_policy", "recall_context", "llm_decision", "workflow_router", "approval_pause", "compose_response"];
// Founder edits these step lists after the first sketch. One step per checkpoint boundary in v1.
const spineASteps = (observeCapKey, observeTitle) => [
  { step_key: "policy", checkpoint_boundary: "after_policy_gate", title: "Safety gate", capability_key: "graph_path:input_policy_to_llm_planner" },
  { step_key: "plan", checkpoint_boundary: "after_planner", title: "Plan route" },
  { step_key: "observe", checkpoint_boundary: "before_worker", title: observeTitle, capability_key: observeCapKey, requires_idempotency_key: 1 },
  { step_key: "evidence", checkpoint_boundary: "after_evidence", title: "Capture cited evidence", capability_key: "tool:payer_portal_reader", expected_source_pointer: 1 },
  { step_key: "respond", checkpoint_boundary: "after_response", title: "Compose cited answer", capability_key: "graph_path:evidence_to_sourced_answer" }
];
const spineBSteps = (gatherCapKey, gatherTitle) => [
  { step_key: "policy", checkpoint_boundary: "after_policy_gate", title: "Safety gate", capability_key: "graph_path:input_policy_to_llm_planner" },
  { step_key: "plan", checkpoint_boundary: "after_planner", title: "Plan route" },
  { step_key: "gather", checkpoint_boundary: "after_evidence", title: gatherTitle, capability_key: gatherCapKey, expected_source_pointer: 1 },
  { step_key: "respond", checkpoint_boundary: "after_response", title: "Compose cited answer", capability_key: "graph_path:evidence_to_sourced_answer" }
];
const spineCSteps = () => [
  { step_key: "policy", checkpoint_boundary: "after_policy_gate", title: "Safety gate", capability_key: "graph_path:input_policy_to_llm_planner" },
  { step_key: "plan", checkpoint_boundary: "after_planner", title: "Plan route" },
  { step_key: "approval", checkpoint_boundary: "before_worker", title: "Pause for human approval", capability_key: "graph_path:approval_interrupt_resume", on_failure_policy: "resume" },
  { step_key: "respond", checkpoint_boundary: "after_response", title: "Confirm and respond" }
];

export const CAPABILITY_CATALOG = Object.freeze({
  capabilities: [
    // workflows (FK workflow_key)
    { capability_key: "workflow:eligibility_benefits_navigation", kind: "workflow", workflow_key: "eligibility_benefits_navigation", short_description: "Coverage, deductible, OOP max, copay lookup.", ...meta("user asks about coverage / what they owe / deductible / OOP / effective dates", "routes benefit + cost-sharing questions to the eligibility journey", "benefits and coverage understanding", 30) },
    { capability_key: "workflow:claim_status_navigation", kind: "workflow", workflow_key: "claim_status_navigation", short_description: "Claim status, EOB, patient responsibility, why-billed.", ...meta("user asks status of a claim / why was I billed / patient responsibility", "routes claim/EOB questions to the claim journey", "claim status and EOB interpretation", 30) },
    { capability_key: "workflow:prior_authorization_navigation", kind: "workflow", workflow_key: "prior_authorization_navigation", short_description: "Prior-auth status and payer requirements.", ...meta("user asks do I need pre-auth / PA status / approval requirement", "routes PA questions; never submits", "prior authorization status and criteria", 28) },
    { capability_key: "workflow:pharmacy_formulary", kind: "workflow", workflow_key: "pharmacy_formulary", short_description: "Drug coverage, tier, step therapy, alternatives.", ...meta("user asks is my drug covered / tier / copay / alternatives", "routes pharmacy/formulary questions", "medication coverage", 28) },
    { capability_key: "workflow:document_or_trace_review", kind: "workflow", workflow_key: "document_or_trace_review", short_description: "Interpret uploaded EOB/SBC/ID/denial documents.", ...meta("user uploads a document to interpret; no login needed", "routes to local document extraction + review", "uploaded document interpretation", 26) },
    { capability_key: "workflow:denial_appeal_preparation", kind: "workflow", workflow_key: "denial_appeal_preparation", short_description: "Understand a denial and assemble appeal support (draft only).", ...meta("denied claim/PA; understand grounds and assemble support", "composes claim + document + policy lookups; draft only, never sends", "denial appeal support", 24) },
    { capability_key: "workflow:payer_portal_read_only_extraction", kind: "workflow", workflow_key: "payer_portal_read_only_extraction", short_description: "Read-only structured extraction from an authenticated portal.", ...meta("specific plan data only available behind portal login", "drives the read-only observation after user takeover login", "authenticated portal evidence capture", 26) },
    // Terminal escalation workflow: the planner may legitimately select it (ambiguous
    // high-stakes / explicit approval / human handoff), so it must appear in the
    // DB-derived allowedWorkflows manifest (plan §3.3 — replaces the frozen enum's 8th key).
    { capability_key: "workflow:human_approval_escalation", kind: "workflow", workflow_key: "human_approval_escalation", short_description: "Human approval escalation and safe handoff.", ...meta("the request is high-stakes/ambiguous, needs explicit human approval, or asks for a human", "terminal safe handoff; never executes tools", "human escalation and approval gates", 18) },
    // skills (FK skill_key)
    { capability_key: "skill:insurance_portal_browser", kind: "skill", skill_key: "insurance_portal_browser", short_description: "Execution arm: OBSERVE a user-authenticated portal (read-only).", ...meta("portal evidence is needed after the user logs in", "the OpenClaw read-only browser skill; never enters credentials", "read-only portal observation", 22) },
    { capability_key: "skill:insurance_knowledge_research", kind: "skill", skill_key: "insurance_knowledge_research", short_description: "Research authoritative published insurance/policy sources.", ...meta("a fact is published (formulary/SBC/policy) and not behind login", "retrieves + cites authoritative sources", "authoritative published research", 16) },
    // tools (FK tool_key)
    { capability_key: "tool:openclaw_authenticated_browser", kind: "tool", tool_key: "openclaw_authenticated_browser", short_description: "Dispatch handle for the OpenClaw browser arm.", ...meta("a worker dispatch to the read-only browser is required", "bridges worker dispatch + idempotency + lease", "browser worker dispatch", 14) },
    // Three-layer pivot Phase 85 tools (plan §7 rows, scores 10-14): real owner
    // modules with real runtime callers landed in the same phase.
    { capability_key: "tool:pricing_mrf_query_db", kind: "tool", tool_key: "pricing_mrf_query_db", short_description: "Cited MRF negotiated-rate/allowed-amount evidence for a billing code.", ...meta("a cost/price question names a CPT/HCPCS code and the user consented to MRF pricing lookups", "returns CITED price observations (source_pointer per row); never planner metadata", "public price evidence", 13) },
    { capability_key: "tool:plan_identity_resolver", kind: "tool", tool_key: "plan_identity_resolver", short_description: "Masked member plan identity (payer, plan name/type, verification status).", ...meta("plan context is needed (which plan/payer the member has) without asking again", "PHI-cleared identity satisfies plan-context information needs", "plan identity context", 12) },
    { capability_key: "tool:consent_session_vault", kind: "tool", tool_key: "consent_session_vault", short_description: "Consent-gated reusable portal-session artifact (pointer + hash only).", ...meta("a portal observation could reuse a consented cached session instead of a fresh takeover login", "skips the takeover step when the user approved session reuse", "portal session reuse", 11) },
    { capability_key: "tool:payer_portal_reader", kind: "tool", tool_key: "payer_portal_reader", short_description: "Structured read-only portal extraction to source pointers.", ...meta("portal page content must be turned into cited evidence", "produces portal_page_snapshots + extraction_artifacts", "portal extraction", 14) },
    { capability_key: "tool:aetna_cpb_lookup", kind: "tool", tool_key: "aetna_cpb_lookup", short_description: "Aetna clinical policy bulletin criteria.", ...meta("PA/appeal needs payer clinical policy criteria", "retrieves CPB criteria with citation, no PHI sent", "payer policy criteria", 12) },
    { capability_key: "tool:cms_mcd_lookup", kind: "tool", tool_key: "cms_mcd_lookup", short_description: "Medicare NCD/LCD coverage determinations.", ...meta("coverage determination requires CMS NCD/LCD", "retrieves CMS coverage determinations + citation", "medicare coverage determination", 12) },
    { capability_key: "tool:document_trace_parser", kind: "tool", tool_key: "document_trace_parser", short_description: "Parse uploaded EOB/SBC/denial artifacts.", ...meta("an uploaded document must be parsed to structured fields", "structured extraction over extraction_artifacts", "document parsing", 12) },
    { capability_key: "tool:public_web_search", kind: "tool", tool_key: "public_web_search", short_description: "Public authoritative web retrieval for published facts.", ...meta("a needed fact is published online and citation is acceptable", "authoritative web retrieval + citation", "published fact retrieval", 10) },
    // Phase 87 (§7) — implemented THIS phase (real modules/gates, real callers):
    { capability_key: "tool:employer_benefits_doc_rag", kind: "tool", tool_key: "employer_benefits_doc_rag", short_description: "Retrieval over the user's own benefits documents (cited chunks).", ...meta("the answer lives in a document the user uploaded (SBC, benefits guide, plan booklet)", "cited chunk retrieval over consented user documents", "user benefits document retrieval", 12) },
    { capability_key: "tool:openclaw_document_downloader", kind: "tool", tool_key: "openclaw_document_downloader", short_description: "Scope-bound single-document download and analysis after explicit approval.", ...meta("one specific portal document must be downloaded and the user approved that exact document", "consumed single-use gate; exactly one approved candidate URL", "approved document capture", 11) },
    { capability_key: "tool:public_web_scraper_openclaw", kind: "tool", tool_key: "public_web_scraper_openclaw", short_description: "Read-only observation of public unauthenticated web pages.", ...meta("needed evidence is on a public page with no login", "per-page observation pipeline with the public evidence class", "public page observation", 11) },
    { capability_key: "tool:openclaw_portal_discovery", kind: "tool", tool_key: "openclaw_portal_discovery", short_description: "Portal search and document discovery without downloading.", ...meta("we must find where a document or section lives in the portal before acting", "download-free discovery reporting", "portal discovery", 11) },
    // Phase 89/90 CONNECTOR registry rows (§7.0 Capability Registry ONLY — honest
    // non-executability as DATA; the Executable Tool Catalog excludes them until each
    // phase's real proof lands; hydrator + normalizer both refuse selection):
    { capability_key: "tool:provider_directory_public_api", kind: "tool", tool_key: "provider_directory_public_api", registry_status: "planned", runtime_selectable: 0, blocked_by: ["phase_89_connector"], planner_exposure: { planner_may: ["explain that provider directory lookup is planned", "offer the portal route instead"], planner_must_not: ["select as an executable tool", "claim a directory lookup was performed"] }, short_description: "Planned: public provider directory (in-network search) connector.", ...meta("a provider network question once the public directory connector lands", "planned connector; not yet executable by the system", "planned provider directory lookup", 10) },
    { capability_key: "tool:prior_auth_requirements_api", kind: "tool", tool_key: "prior_auth_requirements_api", registry_status: "planned", runtime_selectable: 0, blocked_by: ["phase_89_pa_policy_corpus"], planner_exposure: { planner_may: ["explain that PA requirement lookup is planned", "use payer policy research instead"], planner_must_not: ["select as an executable tool"] }, short_description: "Planned: prior-auth requirement lookup over the PA-policy corpus.", ...meta("a PA requirement question once the policy corpus lands", "planned corpus retrieval; not yet executable by the system", "planned PA requirement lookup", 10) },
    { capability_key: "tool:payer_fhir_patient_access_api", kind: "tool", tool_key: "payer_fhir_patient_access_api", registry_status: "contract_ready", runtime_selectable: 0, blocked_by: ["phase_90_sandbox_proof", "phase_91_production_vetting_signature"], planner_exposure: { planner_may: ["explain that member API access is planned", "offer the portal route or user upload instead"], planner_must_not: ["select as an executable tool", "claim member data was fetched via API"] }, short_description: "Planned: member-authorized payer FHIR reads (coverage, claims, accumulators).", ...meta("member-authorized API data once the sandbox and production rails land", "planned member API rail; not yet executable by the system", "planned member API reads", 10) },
    { capability_key: "tool:eligibility_benefits_api", kind: "tool", tool_key: "eligibility_benefits_api", registry_status: "blocked_external_enrollment", runtime_selectable: 0, blocked_by: ["phase_90_mock_sandbox", "external_enrollment_information_receiver_standing"], planner_exposure: { planner_may: ["explain that the eligibility rail is pending enrollment"], planner_must_not: ["select as an executable tool", "claim an eligibility transaction ran"] }, short_description: "Planned: eligibility transaction rail (blocked on external enrollment).", ...meta("real-time eligibility once clearinghouse standing is confirmed", "enrollment-blocked rail; not yet executable by the system", "planned eligibility transactions", 10) },
    { capability_key: "tool:pbm_formulary_api", kind: "tool", tool_key: "pbm_formulary_api", registry_status: "contract_ready", runtime_selectable: 0, blocked_by: ["phase_90_sandbox_proof"], planner_exposure: { planner_may: ["explain that the formulary API is planned", "offer the portal formulary route instead"], planner_must_not: ["select as an executable tool"] }, short_description: "Planned: PDex formulary API rail.", ...meta("formulary API data once the sandbox proof lands", "planned formulary rail; portal route remains available", "planned formulary API", 10) },
    { capability_key: "tool:prior_auth_status_api", kind: "tool", tool_key: "prior_auth_status_api", registry_status: "contract_ready", runtime_selectable: 0, blocked_by: ["phase_90_sandbox_proof"], planner_exposure: { planner_may: ["explain that PA status via API is planned", "offer the portal route instead"], planner_must_not: ["select as an executable tool"] }, short_description: "Planned: prior-auth status via the member API rail.", ...meta("PA status once the Patient Access expansion lands", "planned PA status rail; portal route remains available", "planned PA status", 10) },
    { capability_key: "tool:consent_token_vault", kind: "tool", tool_key: "consent_token_vault", registry_status: "contract_ready", runtime_selectable: 0, blocked_by: ["phase_90_oauth_rail"], planner_exposure: { planner_may: ["explain that API-rail consent storage is planned"], planner_must_not: ["select as an executable tool"] }, short_description: "Planned: OAuth grant vault for the member API rail.", ...meta("API-rail consent once the OAuth rail lands", "planned grant vault; distinct from the portal session vault", "planned API consent vault", 10) },
    // SIGNATURE-GATED write/submission registry rows (Phase 92 ONLY — founder #11 /
    // §13.11): the planner may classify write intent and PREPARE, but every response
    // is phrased prepared-for-review; execution claims are forbidden by contract.
    { capability_key: "tool:prior_auth_submission_pas_api", kind: "tool", tool_key: "prior_auth_submission_pas_api", registry_status: "contract_ready", runtime_selectable: 0, blocked_by: ["phase_92_executor", "provider_delegation_agreements_signature", "clearinghouse_enrollment_signature", "compliance_signoff"], planner_exposure: { planner_may: ["classify prior-auth submission intent", "prepare the submission packet for review", "explain the review and submission process", "create follow-up tasks"], planner_must_not: ["claim the submission was performed", "select as an executable tool", "request or store raw passwords", "bypass the human approval gate"] }, short_description: "Signature-gated: prior-auth submission (prepare-only until the write track opens).", ...meta("a user asks to submit a prior authorization", "prepare-for-review only; submission is not yet executable by the system", "PA submission preparation", 10) },
    { capability_key: "tool:openclaw_claim_submission_worker", kind: "tool", tool_key: "openclaw_claim_submission_worker", registry_status: "planned", runtime_selectable: 0, blocked_by: ["phase_92_executor", "payer_provider_portal_allowlist", "human_approval_gate", "confirmation_capture", "legal_review"], planner_exposure: { planner_may: ["classify claim-submission intent", "prepare the claim packet and work order for review", "explain the process", "create follow-up tasks"], planner_must_not: ["claim the action was performed", "select as an executable tool", "request or store raw passwords", "bypass the human approval gate"] }, short_description: "Signature-gated: claim submission worker (prepare-only).", ...meta("a user asks to submit a claim", "prepared for review or submission — never executed before the write track opens", "claim submission preparation", 10) },
    { capability_key: "tool:openclaw_form_filler", kind: "tool", tool_key: "openclaw_form_filler", registry_status: "planned", runtime_selectable: 0, blocked_by: ["phase_92_executor", "human_approval_gate", "confirmation_capture"], planner_exposure: { planner_may: ["classify form-filling intent", "prepare the field values for review", "explain the process"], planner_must_not: ["claim the form was submitted", "select as an executable tool", "request or store raw passwords"] }, short_description: "Signature-gated: portal form filler (prepare-only).", ...meta("a user asks to fill a portal form", "prepared for review — never executed before the write track opens", "form preparation", 10) },
    { capability_key: "tool:openclaw_provider_scheduler", kind: "tool", tool_key: "openclaw_provider_scheduler", registry_status: "planned", runtime_selectable: 0, blocked_by: ["phase_92_executor", "human_approval_gate", "confirmation_capture"], planner_exposure: { planner_may: ["classify scheduling intent", "prepare scheduling instructions for review", "explain the process"], planner_must_not: ["claim an appointment was booked", "select as an executable tool"] }, short_description: "Signature-gated: provider scheduling worker (prepare-only).", ...meta("a user asks to book or change an appointment", "prepared for review — never executed before the write track opens", "scheduling preparation", 10) },
    // graph paths (NO FK; graph_subpath validated against the node registry)
    { capability_key: "graph_path:input_policy_to_llm_planner", kind: "graph_path", graph_subpath: ["input_policy", "recall_context", "llm_decision", "workflow_router"], short_description: "Safety-gated LLM planner entry path.", ...meta("entry path for any chat after safety gates pass", "the deterministic-rails -> LLM planner spine", "request routing", 10) },
    { capability_key: "graph_path:approval_interrupt_resume", kind: "graph_path", graph_subpath: ["observe_evidence", "approval_pause", "observe_evidence"], short_description: "Native HITL approval pause before worker/write.", ...meta("read-only worker execution needs explicit human approval", "native LangGraph interrupt + resume on approval token", "human-in-the-loop approval", 10) },
    { capability_key: "graph_path:evidence_to_sourced_answer", kind: "graph_path", graph_subpath: ["observe_evidence", "case_state_shadow", "compose_response"], short_description: "Cited answer once trusted source pointers exist.", ...meta("trusted source pointers exist and can be cited", "evidence -> case shadow -> cited compose", "sourced answer composition", 10) }
  ],
  // 8 canonical processes — one per allowed workflow. Spine A (portal/observe), B (research/parse),
  // C (approval). Each binds via workflow_key so the router selects it (selectProcessForWorkflow).
  processes: [
    {
      process_key: "process:portal_readonly_lookup",
      workflow_key: "eligibility_benefits_navigation",
      title: "Read-only insurer portal lookup (eligibility & benefits)",
      journey_stage: "coverage_understanding",
      offerable: 1,
      display_order: 1,
      short_description: "You log in yourself; I read and cite what's on screen.",
      ...meta("a payer-portal data request when a portal account exists but no fresh evidence is cached", "the default spine to obtain plan-specific data without the agent ever entering credentials", "coverage / deductible / OOP / copay requiring portal login", 26),
      required_user_inputs: [{ key: "which_payer_portal", label: "Which insurance portal", why: "to open the right site", sensitive: false }],
      approval_scope: "read_only_observation",
      worker_skill_capability_key: "skill:insurance_portal_browser",
      graph_subpath: SPINE_A_GRAPH,
      steps: [
        { step_key: "policy", checkpoint_boundary: "after_policy_gate", title: "Safety gate", capability_key: "graph_path:input_policy_to_llm_planner" },
        { step_key: "plan", checkpoint_boundary: "after_planner", title: "Plan route" },
        { step_key: "observe", checkpoint_boundary: "before_worker", title: "Read-only observe (after your login)", capability_key: "skill:insurance_portal_browser", requires_idempotency_key: 1 },
        { step_key: "evidence", checkpoint_boundary: "after_evidence", title: "Capture cited evidence", capability_key: "tool:payer_portal_reader", expected_source_pointer: 1 },
        { step_key: "respond", checkpoint_boundary: "after_response", title: "Compose cited answer", capability_key: "graph_path:evidence_to_sourced_answer" }
      ]
    },
    {
      process_key: "process:claim_status_lookup",
      workflow_key: "claim_status_navigation",
      title: "Claim status / EOB / why-was-I-billed lookup",
      journey_stage: "service_use_claim",
      offerable: 1,
      display_order: 2,
      short_description: "Log in; I read your claim/EOB and explain what you owe and why.",
      ...meta("user asks claim status, EOB, patient responsibility, or why they were billed", "reads the claim/EOB from the portal and traces deductible/coinsurance/copay", "claim status and patient-responsibility explanation", 26),
      required_user_inputs: [{ key: "which_payer_portal", label: "Which insurance portal", why: "to open the right site", sensitive: false }, { key: "claim_or_date", label: "Claim id or date of service", why: "to locate the claim", sensitive: false }],
      approval_scope: "read_only_observation",
      worker_skill_capability_key: "skill:insurance_portal_browser",
      graph_subpath: SPINE_A_GRAPH,
      steps: spineASteps("skill:insurance_portal_browser", "Read-only claim/EOB observe (after your login)")
    },
    {
      process_key: "process:pharmacy_formulary_lookup",
      workflow_key: "pharmacy_formulary",
      title: "Pharmacy / formulary coverage lookup",
      journey_stage: "pharmacy_benefit_scrutiny",
      offerable: 1,
      display_order: 3,
      short_description: "Log in; I read your drug's tier, coverage, PA/step-therapy and cost.",
      ...meta("user asks if a drug is covered, its tier, step therapy, quantity limits or cost", "reads the plan formulary / pharmacy benefit from the portal and cites it", "medication coverage and cost-share", 26),
      required_user_inputs: [{ key: "which_payer_portal", label: "Which insurance portal", why: "to open the right site", sensitive: false }, { key: "drug_name", label: "Medication name and strength", why: "to look up the formulary entry", sensitive: false }],
      approval_scope: "read_only_observation",
      worker_skill_capability_key: "skill:insurance_portal_browser",
      graph_subpath: SPINE_A_GRAPH,
      steps: spineASteps("skill:insurance_portal_browser", "Read-only formulary observe (after your login)")
    },
    {
      process_key: "process:prior_auth_lookup",
      workflow_key: "prior_authorization_navigation",
      title: "Prior authorization requirement / status lookup",
      journey_stage: "service_authorization",
      offerable: 1,
      display_order: 4,
      short_description: "Log in; I read whether a service needs prior auth and its status (never submits).",
      ...meta("user asks whether a service/drug needs prior auth, its status, or required documentation", "reads the PA policy/status from the portal and cites it; never submits a request", "prior authorization requirement and status", 24),
      required_user_inputs: [{ key: "which_payer_portal", label: "Which insurance portal", why: "to open the right site", sensitive: false }, { key: "service_or_code", label: "Service, procedure code, or drug", why: "to look up the PA rule", sensitive: false }],
      approval_scope: "read_only_observation",
      worker_skill_capability_key: "skill:insurance_portal_browser",
      graph_subpath: SPINE_A_GRAPH,
      steps: spineASteps("skill:insurance_portal_browser", "Read-only prior-auth observe (after your login)")
    },
    {
      process_key: "process:portal_extraction",
      workflow_key: "payer_portal_read_only_extraction",
      title: "Read-only payer portal extraction",
      journey_stage: "evidence_capture",
      offerable: 1,
      display_order: 5,
      short_description: "Log in; I extract and cite the structured facts visible on your portal.",
      ...meta("specific plan data is only available behind portal login and must be captured as cited evidence", "drives read-only structured extraction after user takeover login", "authenticated portal evidence capture", 24),
      required_user_inputs: [{ key: "which_payer_portal", label: "Which insurance portal", why: "to open the right site", sensitive: false }],
      approval_scope: "read_only_observation",
      worker_skill_capability_key: "skill:insurance_portal_browser",
      graph_subpath: SPINE_A_GRAPH,
      steps: spineASteps("skill:insurance_portal_browser", "Read-only structured extraction (after your login)")
    },
    {
      process_key: "process:denial_appeal_support",
      workflow_key: "denial_appeal_preparation",
      title: "Denial appeal support (draft only)",
      journey_stage: "denial_resolution",
      offerable: 1,
      display_order: 6,
      short_description: "I explain the denial grounds and assemble appeal support — I never send anything.",
      ...meta("a claim/PA was denied and the user wants to understand grounds and assemble an appeal", "researches policy/criteria and assembles a cited appeal support packet; draft only, never sends", "denial appeal preparation", 22),
      required_user_inputs: [{ key: "denial_reason", label: "Denial reason / letter", why: "to map the grounds to plan rules", sensitive: false }],
      approval_scope: "read_only_observation",
      worker_skill_capability_key: "skill:insurance_knowledge_research",
      graph_subpath: SPINE_B_GRAPH,
      steps: spineBSteps("skill:insurance_knowledge_research", "Research denial grounds + appeal criteria")
    },
    {
      process_key: "process:document_review",
      workflow_key: "document_or_trace_review",
      title: "Document / trace review",
      journey_stage: "evidence_review",
      offerable: 1,
      display_order: 7,
      short_description: "Upload an EOB/SBC/denial; I extract the key fields with citations.",
      ...meta("user uploads a document (EOB/SBC/denial/bill) to interpret; no login needed", "parses the uploaded artifact into cited structured fields", "uploaded document interpretation", 22),
      required_user_inputs: [{ key: "uploaded_document", label: "The document to review", why: "to extract its fields", sensitive: false }],
      approval_scope: "read_only_observation",
      worker_skill_capability_key: "skill:insurance_knowledge_research",
      graph_subpath: SPINE_B_GRAPH,
      steps: spineBSteps("tool:document_trace_parser", "Parse uploaded document to cited fields")
    },
    {
      process_key: "process:human_approval",
      workflow_key: "human_approval_escalation",
      title: "Human approval escalation",
      journey_stage: "approval_gate",
      offerable: 0,
      display_order: 8,
      short_description: "Pause for your explicit approval before any gated step.",
      ...meta("a high-risk or approval-gated step needs explicit human approval before proceeding", "native HITL pause that waits for an approval token", "human-in-the-loop approval gate", 18),
      required_user_inputs: [],
      approval_scope: "read_only_observation",
      worker_skill_capability_key: null,
      graph_subpath: SPINE_C_GRAPH,
      steps: spineCSteps()
    }
  ]
});

export function validateCatalogGraphNodes(catalog = CAPABILITY_CATALOG) {
  const unknown = [];
  const check = (subpath, owner) => {
    for (const node of subpath ?? []) {
      if (!VALID_NODES.has(node)) unknown.push(`${owner}:${node}`);
    }
  };
  for (const cap of catalog.capabilities ?? []) if (cap.kind === "graph_path") check(cap.graph_subpath, cap.capability_key);
  for (const proc of catalog.processes ?? []) check(proc.graph_subpath, proc.process_key);
  if (unknown.length) {
    throw new Error(`capability_catalog_invalid_graph_nodes: ${unknown.join(", ")}`);
  }
  return true;
}

async function upsert(store, table, keyCol, keyVal, row, nowIso, createId) {
  const existing = await store.findOne(table, { [keyCol]: keyVal });
  if (existing) {
    const { id: _ignore, created_at: _ignore2, ...mutable } = row;
    await store.update(table, { ...mutable, updated_at: nowIso() }, { id: existing.id });
    return existing.id;
  }
  const id = row.id ?? createId(table.slice(0, 4));
  await store.insert(table, { id, ...row, created_at: nowIso(), updated_at: nowIso() });
  return id;
}

export async function seedCapabilityCatalog(store, { nowIso, createId, catalog = CAPABILITY_CATALOG, validateGraphNodes = true } = {}) {
  if (validateGraphNodes) validateCatalogGraphNodes(catalog);
  // Phase 87 (§7): the renamed web-search capability key retires its stale row.
  try {
    await store.all("DELETE FROM capabilities WHERE capability_key = 'tool:web_search_authoritative_sources';");
  } catch {
    /* fresh store: nothing to retire */
  }
  const capIdByKey = {};
  for (const cap of catalog.capabilities) {
    const id = await upsert(store, "capabilities", "capability_key", cap.capability_key, {
      id: `cap:${cap.capability_key}`,
      capability_key: cap.capability_key,
      kind: cap.kind,
      status: "active",
      lifecycle_state: "production",
      short_description: cap.short_description ?? "",
      when_to_use: cap.when_to_use ?? "",
      why_use: cap.why_use ?? "",
      best_used_for: cap.best_used_for ?? "",
      planner_score: cap.planner_score ?? 0,
      metadata_phi_cleared: 1,
      workflow_key: cap.workflow_key ?? null,
      skill_key: cap.skill_key ?? null,
      tool_key: cap.tool_key ?? null,
      graph_subpath_json: cap.graph_subpath ? JSON.stringify(cap.graph_subpath) : null,
      how_kind_ref: cap.workflow_key ? "workflow_definitions" : cap.skill_key ? "openclaw_skills" : cap.tool_key ? "tool_registry" : "self",
      // §7.0 Capability Registry columns (founder global decision, 2026-07-02):
      // seeded rows have real backing + real callers → implemented_runtime and
      // runtime-selectable unless the catalog entry says otherwise. The fail-closed
      // DEFAULT 0 stands for every row not explicitly seeded selectable.
      registry_status: cap.registry_status ?? "implemented_runtime",
      runtime_selectable: cap.runtime_selectable ?? 1,
      blocked_by_json: JSON.stringify(cap.blocked_by ?? []),
      planner_exposure_json: JSON.stringify(cap.planner_exposure ?? {})
    }, nowIso, createId);
    capIdByKey[cap.capability_key] = id;
  }
  for (const proc of catalog.processes) {
    const procId = await upsert(store, "processes", "process_key", proc.process_key, {
      id: `proc:${proc.process_key}`,
      process_key: proc.process_key,
      title: proc.title,
      journey_stage: proc.journey_stage ?? null,
      status: "active",
      lifecycle_state: "production",
      offerable: proc.offerable ?? 0,
      display_order: proc.display_order ?? 100,
      short_description: proc.short_description ?? "",
      when_to_use: proc.when_to_use ?? "",
      why_use: proc.why_use ?? "",
      best_used_for: proc.best_used_for ?? "",
      planner_score: proc.planner_score ?? 0,
      required_user_inputs_json: JSON.stringify(proc.required_user_inputs ?? []),
      approval_scope: proc.approval_scope ?? "read_only_observation",
      worker_skill_capability_id: proc.worker_skill_capability_key ? capIdByKey[proc.worker_skill_capability_key] ?? null : null,
      graph_subpath_json: proc.graph_subpath ? JSON.stringify(proc.graph_subpath) : null,
      workflow_key: proc.workflow_key ?? null
    }, nowIso, createId);
    let order = 0;
    for (const step of proc.steps ?? []) {
      await upsert(store, "process_steps", "id", `pstep:${proc.process_key}:${step.step_key}`, {
        id: `pstep:${proc.process_key}:${step.step_key}`,
        process_id: procId,
        step_order: order++,
        step_key: step.step_key,
        title: step.title ?? null,
        checkpoint_boundary: step.checkpoint_boundary,
        capability_id: step.capability_key ? capIdByKey[step.capability_key] ?? null : null,
        expected_source_pointer: step.expected_source_pointer ?? 0,
        requires_idempotency_key: step.requires_idempotency_key ?? 0,
        on_failure_policy: step.on_failure_policy ?? "resume"
      }, nowIso, createId);
    }
  }
  return { version: CAPABILITY_CATALOG_VERSION, capabilities: catalog.capabilities.length, processes: catalog.processes.length };
}
