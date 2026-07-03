const WORKFLOW_DEFINITIONS = [
  // Phase 89 (plan §9/§11): the two connector-backed navigation workflows — provider
  // network search over the Plan-Net directory mirror, and cost estimation over the
  // Transparency-in-Coverage MRF evidence tables. Public data (layer_1), no login.
  {
    workflow_key: "provider_network_navigation",
    title: "In-network provider search",
    journey_stage: "care_access_navigation",
    description: "Find in-network providers by specialty and location from the payer's Plan-Net provider directory, with cited directory source URLs.",
    required_user_fields: ["user.id"],
    required_data_pointers: ["provider_directory_entries"],
    required_tools: ["provider_directory_public_api", "local_sqlite_memory"],
    memory_scopes: ["session", "episodic"]
  },
  {
    workflow_key: "cost_estimate_navigation",
    title: "Procedure cost estimation",
    journey_stage: "cost_estimation",
    description: "Estimate negotiated in-network prices for a shoppable procedure code from Transparency-in-Coverage MRF observations, always cited and always with the non-guarantee disclaimer.",
    required_user_fields: ["user.id"],
    required_data_pointers: ["mrf_price_observations"],
    required_tools: ["pricing_mrf_query_db", "local_sqlite_memory"],
    memory_scopes: ["session", "episodic"]
  },
  {
    workflow_key: "eligibility_benefits_navigation",
    title: "Eligibility and benefits navigation",
    journey_stage: "coverage_understanding",
    description: "Confirm plan, eligibility, benefit categories, balances, and source pointers from the payer portal.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["portal_accounts"],
    required_tools: ["openclaw_authenticated_browser", "payer_portal_reader", "local_sqlite_memory"],
    memory_scopes: ["session", "episodic", "semantic"]
  },
  {
    workflow_key: "claim_status_navigation",
    title: "Claim status navigation",
    journey_stage: "service_use_claim",
    description: "Find claim records, status, dates, patient responsibility, and next payer/member actions.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["claim_items", "eligibility_snapshots"],
    required_tools: ["openclaw_authenticated_browser", "payer_portal_reader", "local_sqlite_memory"],
    memory_scopes: ["episodic", "long_term"]
  },
  {
    workflow_key: "pharmacy_formulary",
    title: "Pharmacy and formulary scrutiny",
    journey_stage: "pharmacy_benefit_scrutiny",
    description: "Review medication coverage, formulary tier, pharmacy benefit requirements, copay/coinsurance signals, and source pointers from plan documents or the authenticated payer portal.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["eligibility_snapshots", "portal_accounts"],
    required_tools: ["openclaw_authenticated_browser", "payer_portal_reader", "local_sqlite_memory", "public_web_search"],
    memory_scopes: ["session", "episodic", "semantic", "long_term"]
  },
  {
    workflow_key: "prior_authorization_navigation",
    title: "Prior authorization navigation",
    journey_stage: "service_authorization",
    description: "Review prior authorization status, requirements, payer policy pointers, and approval-gated next steps.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["prior_authorizations", "eligibility_snapshots"],
    required_tools: ["openclaw_authenticated_browser", "payer_portal_reader", "aetna_cpb_lookup", "cms_mcd_lookup"],
    memory_scopes: ["episodic", "long_term", "reflection"]
  },
  {
    workflow_key: "denial_appeal_preparation",
    title: "Denial appeal preparation",
    journey_stage: "denial_resolution",
    description: "Assemble denial facts, policy references, evidence checklist, and approval-gated appeal draft support.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["claim_items", "eligibility_snapshots"],
    required_tools: ["aetna_cpb_lookup", "cms_mcd_lookup", "cms_icd10_lookup", "public_web_search"],
    memory_scopes: ["episodic", "long_term", "reflection"]
  },
  {
    workflow_key: "payer_portal_read_only_extraction",
    title: "Payer portal read-only extraction",
    journey_stage: "evidence_capture",
    description: "Capture visible payer portal facts, links, screenshots/artifacts, and source pointers without credential entry.",
    required_user_fields: ["user.id", "user.email", "portal_account"],
    required_data_pointers: ["portal_accounts"],
    required_tools: ["openclaw_authenticated_browser", "browser_remote_debugger", "chrome_extension_bridge", "mcp_browser_adapter"],
    memory_scopes: ["session", "episodic"]
  },
  {
    workflow_key: "document_or_trace_review",
    title: "Document or trace review",
    journey_stage: "evidence_review",
    description: "Review uploaded or locally captured artifacts and traces, extract structured evidence, and identify missing data.",
    required_user_fields: ["user.id", "user.email"],
    required_data_pointers: ["extraction_artifacts", "audit_events"],
    required_tools: ["local_sqlite_memory", "document_trace_parser"],
    memory_scopes: ["session", "episodic", "reflection"]
  },
  {
    workflow_key: "human_approval_escalation",
    title: "Human approval escalation",
    journey_stage: "approval_gate",
    description: "Pause execution for user approval, missing credentials handled by the user, or high-risk external actions.",
    required_user_fields: ["user.id", "user.email"],
    required_data_pointers: ["approval_gates"],
    required_tools: ["local_sqlite_memory"],
    memory_scopes: ["session", "episodic"]
  }
];

const TOOL_REGISTRY = [
  {
    tool_key: "openclaw_authenticated_browser",
    tool_type: "openclaw_skill",
    title: "OpenClaw authenticated browser arm",
    risk_level: "high",
    integration_status: "adapter_contract_ready",
    approval_required: "per_browser_action_scope",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { boundary: "user_authenticated_chrome", noCredentialEntry: true }
  },
  // Three-layer pivot Phase 85 tools (plan §7 canonical keys) — real backing modules
  // with real runtime callers (owner modules landed in the same phase).
  {
    tool_key: "pricing_mrf_query_db",
    tool_type: "internal_query",
    title: "Transparency-in-Coverage MRF price evidence query",
    risk_level: "low",
    integration_status: "enabled",
    approval_required: "none",
    executor_key: "local_followup_planner",
    write_capable: 0,
    config: { owner: "src/concierge/mrfPricing.mjs", consentColumn: "mrf_pricing_lookup_approved", dataLayer: "layer_1_public" }
  },
  {
    tool_key: "plan_identity_resolver",
    tool_type: "internal_query",
    title: "Member plan identity resolver (masked, PHI-cleared)",
    risk_level: "medium",
    integration_status: "enabled",
    approval_required: "none",
    executor_key: "local_followup_planner",
    write_capable: 0,
    config: { owner: "src/concierge/planIdentity.mjs", plannerVisibleColumns: ["plan_name_masked", "plan_type"], dataLayer: "layer_2_member_authorized_api" }
  },
  {
    tool_key: "consent_session_vault",
    tool_type: "internal_query",
    title: "Consent-gated portal session vault (pointers + hashes only)",
    risk_level: "medium",
    integration_status: "enabled",
    approval_required: "read_only_observation",
    executor_key: "local_followup_planner",
    write_capable: 0,
    config: { owner: "src/concierge/credentialVault.mjs", consentColumn: "session_reuse_approved", dataLayer: "layer_3_portal_control" }
  },
  {
    tool_key: "browser_remote_debugger",
    tool_type: "browser_control",
    title: "Chrome remote debugger attachment",
    risk_level: "high",
    integration_status: "enabled_local_when_chrome_debugger_running",
    approval_required: "user_opens_and_authenticates_browser",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { fallbackRank: 1 }
  },
  {
    tool_key: "chrome_extension_bridge",
    tool_type: "browser_control",
    title: "Chrome extension bridge",
    risk_level: "high",
    integration_status: "fallback_planned",
    approval_required: "user_installs_and_keeps_session_open",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { fallbackRank: 2 }
  },
  {
    tool_key: "mcp_browser_adapter",
    tool_type: "browser_control",
    title: "MCP browser adapter",
    risk_level: "medium",
    integration_status: "fallback_planned",
    approval_required: "user_approves_tool_connection",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { fallbackRank: 3 }
  },
  {
    tool_key: "payer_portal_reader",
    tool_type: "extraction",
    title: "Payer portal read-only structured extraction",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "read_only_scope_approval",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { storesSourcePointers: true }
  },
  {
    tool_key: "local_sqlite_memory",
    tool_type: "memory",
    title: "Local SQLite session and memory harness",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "local_phi_storage_approval",
    executor_key: "local_followup_planner",
    write_capable: 0,
    config: { storesPhi: true, timestampType: "iso_8601_utc_text" }
  },
  {
    tool_key: "hindsight_memory_adapter",
    tool_type: "memory",
    title: "Hindsight temporal memory adapter",
    risk_level: "medium",
    integration_status: "deferred_until_runtime_approval",
    approval_required: "memory_retention_policy_and_api_setup",
    executor_key: "local_followup_planner",
    write_capable: 0,
    config: { operations: ["recall", "retain", "reflect"] }
  },
  {
    tool_key: "aetna_cpb_lookup",
    tool_type: "knowledge_source",
    title: "Aetna Clinical Policy Bulletins lookup",
    risk_level: "medium",
    integration_status: "registry_ready_manual_or_web",
    approval_required: "cite_source_and_no_medical_advice",
    executor_key: "trusted_research",
    write_capable: 0,
    config: { sourceKey: "aetna_clinical_policy_bulletins" }
  },
  {
    tool_key: "cms_icd10_lookup",
    tool_type: "knowledge_source",
    title: "CMS ICD-10 official files lookup",
    risk_level: "medium",
    integration_status: "registry_ready_manual_or_web",
    approval_required: "cite_source_and_no_coding_advice_as_medical_advice",
    executor_key: "configured_api",
    write_capable: 0,
    config: { sourceKey: "cms_icd10_files" }
  },
  {
    tool_key: "cms_mcd_lookup",
    tool_type: "knowledge_source",
    title: "CMS Medicare Coverage Database lookup",
    risk_level: "medium",
    integration_status: "registry_ready_manual_or_web",
    approval_required: "cite_source_and_plan_specific_verification",
    executor_key: "configured_api",
    write_capable: 0,
    config: { sourceKey: "cms_medicare_coverage_database" }
  },
  // Phase 87 (§7): public_web_search REPLACES the old authoritative-web-search key —
  // the draft name is canonical, the old key + capability row are DELETED (no alias).
  {
    tool_key: "public_web_search",
    tool_type: "research",
    title: "Public authoritative web source retrieval",
    risk_level: "medium",
    integration_status: "available_through_codex_when_requested",
    approval_required: "source_citation_required",
    executor_key: "trusted_research",
    write_capable: 0,
    config: { allowedDomainsFirst: ["cms.gov", "aetna.com", "healthcare.gov", "ama-assn.org"] }
  },
  {
    tool_key: "document_trace_parser",
    tool_type: "extraction",
    title: "Document and trace parser",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "artifact_storage_approval",
    executor_key: "local_followup_planner",
    write_capable: 0,
    config: { storesArtifacts: true }
  },
  {
    tool_key: "gmail_inbox_reader",
    tool_type: "channel",
    title: "Gmail payer-response reader",
    risk_level: "high",
    integration_status: "deferred_until_user_setup",
    approval_required: "user_installs_and_approves_email_scope",
    executor_key: "configured_api",
    write_capable: 0,
    config: { externalData: true }
  },
  {
    tool_key: "whatsapp_sender",
    tool_type: "channel",
    title: "WhatsApp user notification sender",
    risk_level: "high",
    integration_status: "deferred_until_user_setup",
    approval_required: "explicit_send_approval",
    executor_key: "configured_api",
    write_capable: 1,
    config: { externalMessaging: true }
  },
  {
    tool_key: "vercel_ai_gateway",
    tool_type: "model_gateway",
    title: "Vercel AI Gateway",
    risk_level: "medium",
    integration_status: "deferred_until_api_setup",
    approval_required: "gateway_credentials_and_spend_policy",
    executor_key: "configured_api",
    write_capable: 0,
    config: { modelRouting: true }
  },
  // ------------------------------------------------------------------
  // Phase 87 (§7 mapping table). Promotions of REAL pipeline steps to first-class
  // tool_registry rows (the observation pipeline in openclawOfficialRuntime.mjs
  // already executes them), the renamed public scraper, the document-download
  // executor's tool, and the RAG/user-doc retrieval tool.
  {
    tool_key: "openclaw_browser_screenshot",
    tool_type: "openclaw_skill",
    title: "OpenClaw per-page browser screenshot",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "read_only_scope_approval",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { pipelineStep: "cdp_screenshot", evidenceClass: "portal_observation" }
  },
  {
    tool_key: "openclaw_visual_ocr",
    tool_type: "openclaw_skill",
    title: "OpenClaw local OCR over captured screenshots",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "read_only_scope_approval",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { pipelineStep: "local_ocr", localOnly: true }
  },
  {
    tool_key: "openclaw_same_site_read_only_navigation",
    tool_type: "openclaw_skill",
    title: "OpenClaw same-site read-only navigation",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "read_only_scope_approval",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { owner: "buildOfficialOpenClawReadOnlyNavigationPlan", sameSiteOnly: true }
  },
  {
    tool_key: "openclaw_portal_discovery",
    tool_type: "openclaw_skill",
    title: "OpenClaw portal search and document discovery (download-free)",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "read_only_scope_approval",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { owner: "buildOfficialOpenClawDiscoveryReport", downloadAttempted: false }
  },
  {
    tool_key: "public_web_scraper_openclaw",
    tool_type: "openclaw_skill",
    title: "OpenClaw public web scraper (unauthenticated pages)",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "read_only_scope_approval",
    executor_key: "read_only_browser",
    write_capable: 0,
    config: { renamesSkillJsonTool: "website_scraper", evidenceClass: "unauthenticated_public" }
  },
  {
    tool_key: "openclaw_document_downloader",
    tool_type: "openclaw_skill",
    title: "Scope-bound document download + PDF analysis (consumed-gate only)",
    risk_level: "high",
    integration_status: "enabled_local",
    approval_required: "read_only_document_approval_gate_consumed_token",
    executor_key: "document_download",
    write_capable: 0,
    config: { gate: "READ_ONLY_DOCUMENT_APPROVAL_GATE", singleCandidateUrl: true, singleUse: true }
  },
  {
    tool_key: "employer_benefits_doc_rag",
    tool_type: "knowledge_source",
    title: "Employer benefits document retrieval (user-doc chunks, local consent)",
    risk_level: "medium",
    integration_status: "enabled_local",
    approval_required: "local_phi_storage_approval",
    executor_key: "trusted_research",
    write_capable: 0,
    config: { owner: "src/concierge/knowledge/publicRagRetrieval.mjs", corpusClass: "user_document" }
  },
  // Phase 89/90/91/92 CONNECTOR rows — Capability Registry presence only (§7.0):
  // deferred integration_status (backingEnabled-refused), never enabled-looking,
  // runtime_selectable stays fail-closed on the capability row until each phase's
  // real proof lands. No fake enabled integrations (founder decision).
  {
    tool_key: "provider_directory_public_api",
    tool_type: "configured_api",
    title: "Plan-Net public provider directory API",
    risk_level: "low",
    // Phase 89: the connector LANDED (planNetDirectory.mjs + live pagination proof).
    integration_status: "enabled_local",
    approval_required: "none",
    executor_key: "configured_api",
    write_capable: 0,
    config: { connector: "src/concierge/connectors/planNetDirectory.mjs", phase: "phase_89", dataLayer: "layer_1_public" }
  },
  {
    tool_key: "prior_auth_requirements_api",
    tool_type: "knowledge_source",
    title: "Prior-authorization requirement lookup (PA-policy corpus, later CMS API)",
    risk_level: "medium",
    // Phase 89: the PA-policy corpus crawler LANDED (real crawled policy artifacts).
    integration_status: "enabled_local",
    approval_required: "cite_source_and_plan_specific_verification",
    executor_key: "trusted_research",
    write_capable: 0,
    config: { corpus: "pa_policy_corpus", phase: "phase_89", dataLayer: "layer_1_public" }
  },
  {
    tool_key: "payer_fhir_patient_access_api",
    tool_type: "configured_api",
    title: "Payer FHIR Patient Access API (coverage / EOB / accumulators)",
    risk_level: "medium",
    integration_status: "deferred_until_phase_sandbox_proof",
    approval_required: "member_oauth_consent",
    executor_key: "configured_api",
    write_capable: 0,
    config: { connector: "src/concierge/connectors/aetnaPatientAccess.mjs", phase: "phase_90_sandbox_phase_91_production", querySurfaces: ["coverage_api", "accumulator_api", "claims_eob_api"], dataLayer: "layer_2_member_authorized_api" }
  },
  {
    tool_key: "eligibility_benefits_api",
    tool_type: "configured_api",
    title: "Eligibility 270/271 API (clearinghouse rail)",
    risk_level: "medium",
    integration_status: "deferred_until_phase_mock_sandbox",
    approval_required: "member_oauth_consent",
    executor_key: "configured_api",
    write_capable: 0,
    config: { connector: "src/concierge/connectors/eligibility270.mjs", phase: "phase_90_contract_ready_phase_91_production", dataLayer: "layer_2_member_authorized_api" }
  },
  {
    tool_key: "pbm_formulary_api",
    tool_type: "configured_api",
    title: "PDex formulary / PBM API",
    risk_level: "medium",
    integration_status: "deferred_until_phase_sandbox_proof",
    approval_required: "member_oauth_consent",
    executor_key: "configured_api",
    write_capable: 0,
    config: { connector: "src/concierge/connectors/pdexFormulary.mjs", phase: "phase_90_sandbox_phase_91_production", dataLayer: "layer_2_member_authorized_api" }
  },
  {
    tool_key: "prior_auth_status_api",
    tool_type: "configured_api",
    title: "Prior-authorization status API (Patient Access expansion)",
    risk_level: "medium",
    integration_status: "deferred_until_phase_sandbox_proof",
    approval_required: "member_oauth_consent",
    executor_key: "configured_api",
    write_capable: 0,
    config: { rides: "payer_fhir_patient_access_api", phase: "phase_90", dataLayer: "layer_2_member_authorized_api" }
  },
  {
    tool_key: "consent_token_vault",
    tool_type: "configured_api",
    title: "API-rail OAuth grant vault (connector_oauth_grants)",
    risk_level: "medium",
    integration_status: "deferred_until_phase_oauth_rail",
    approval_required: "member_oauth_consent",
    executor_key: "configured_api",
    write_capable: 0,
    config: { connector: "src/concierge/connectors/tokenVault.mjs", phase: "phase_90", distinctFrom: "consent_session_vault" }
  },
  // SIGNATURE-GATED write/submission rows (Phase 92 ONLY, §7.0 / founder #11):
  // present in the Capability Registry, NEVER in the Executable Tool Catalog before
  // every Phase 92 gate clears. executor_key is NULL — any dispatch attempt fails
  // LOUD executor_missing; write_capable declared for the §8 write gates.
  {
    tool_key: "prior_auth_submission_pas_api",
    tool_type: "configured_api",
    title: "Da Vinci PAS prior-auth submission (signature-gated write track)",
    risk_level: "high",
    integration_status: "deferred_until_phase_signature_write_track",
    approval_required: "provider_delegation_verified_plus_consumed_write_token",
    executor_key: null,
    write_capable: 1,
    config: { connector: "src/concierge/connectors/pasPacket.mjs", phase: "phase_92_signature_gated", hardGate: "pas_submission_without_provider_delegation" }
  },
  {
    tool_key: "openclaw_claim_submission_worker",
    tool_type: "openclaw_skill",
    title: "Claim submission worker (approved-write pathway; signature-gated)",
    risk_level: "high",
    integration_status: "deferred_until_phase_signature_write_track",
    approval_required: "per_action_bound_single_use_write_token",
    executor_key: null,
    write_capable: 1,
    config: { pathway: "runOfficialOpenClawApprovedWriteAction", phase: "phase_92_signature_gated" }
  },
  {
    tool_key: "openclaw_form_filler",
    tool_type: "openclaw_skill",
    title: "Portal form filler (approved-write pathway; signature-gated)",
    risk_level: "high",
    integration_status: "deferred_until_phase_signature_write_track",
    approval_required: "per_action_bound_single_use_write_token",
    executor_key: null,
    write_capable: 1,
    config: { pathway: "runOfficialOpenClawApprovedWriteAction", phase: "phase_92_signature_gated" }
  },
  {
    tool_key: "openclaw_provider_scheduler",
    tool_type: "openclaw_skill",
    title: "Provider scheduling worker (approved-write pathway; signature-gated)",
    risk_level: "high",
    integration_status: "deferred_until_phase_signature_write_track",
    approval_required: "per_action_bound_single_use_write_token",
    executor_key: null,
    write_capable: 1,
    config: { pathway: "runOfficialOpenClawApprovedWriteAction", phase: "phase_92_signature_gated" }
  }
];

const KNOWLEDGE_SOURCES = [
  {
    source_key: "aetna_clinical_policy_bulletins",
    title: "Aetna Clinical Policy Bulletins",
    source_type: "payer_policy",
    authority_level: "payer_primary",
    base_url: "https://www.aetna.com/health-care-professionals/clinical-policy-bulletins.html",
    workflow_keys: ["prior_authorization_navigation", "denial_appeal_preparation"],
    refresh_policy: "check_at_task_time_policy_can_change",
    access_method: "web_with_source_citation",
    status: "active_registry"
  },
  {
    source_key: "cms_icd10_files",
    title: "CMS ICD-10 official files",
    source_type: "code_set",
    authority_level: "federal_primary",
    base_url: "https://www.cms.gov/medicare/coding-billing/icd-10-codes",
    workflow_keys: ["denial_appeal_preparation", "prior_authorization_navigation"],
    refresh_policy: "check_effective_date_for_service_or_submission",
    access_method: "web_or_downloaded_official_file",
    status: "active_registry"
  },
  {
    source_key: "cms_medicare_coverage_database",
    title: "CMS Medicare Coverage Database",
    source_type: "coverage_policy",
    authority_level: "federal_primary",
    base_url: "https://www.cms.gov/medicare/coverage/center",
    workflow_keys: ["prior_authorization_navigation", "denial_appeal_preparation"],
    refresh_policy: "check_at_task_time_and_match_plan_context",
    access_method: "web_with_source_citation",
    status: "active_registry"
  },
  {
    source_key: "cms_cpt_hcpcs_code_list",
    title: "CMS CPT/HCPCS Code List",
    source_type: "code_set",
    authority_level: "federal_primary_with_ama_cpt_license_boundary",
    base_url: "https://www.cms.gov/medicare/regulations-guidance/physician-self-referral/list-cpt-hcpcs-codes",
    workflow_keys: ["denial_appeal_preparation", "prior_authorization_navigation", "claim_status_navigation"],
    refresh_policy: "annual_or_task_time",
    access_method: "web_with_cpt_license_boundary",
    status: "active_registry"
  },
  {
    source_key: "aetna_member_portal",
    title: "Aetna member portal",
    source_type: "user_authenticated_payer_portal",
    authority_level: "user_account_primary",
    base_url: "https://www.aetna.com/",
    workflow_keys: ["eligibility_benefits_navigation", "claim_status_navigation", "pharmacy_formulary", "payer_portal_read_only_extraction"],
    refresh_policy: "read_live_visible_state_when_user_logged_in",
    access_method: "user_authenticated_browser_only",
    status: "active_registry"
  }
];

const OPENCLAW_SKILLS = [
  {
    skill_key: "insurance_portal_browser",
    title: "Insurance portal browser",
    description: "Navigate the user-authenticated payer portal, observe visible state, extract facts with source pointers, and stop before any irreversible action.",
    status: "repo_artifact_ready_adapter_execution_gated",
    risk_level: "high",
    // Phase 87 (§7): SET-EQUAL with skill.json allowed_tools (one commit, one test) —
    // website_scraper renamed public_web_scraper_openclaw; the dead OS-automation tool removed.
    allowed_tools: [
      "openclaw_authenticated_browser",
      "openclaw_browser_screenshot",
      "openclaw_visual_ocr",
      "openclaw_same_site_read_only_navigation",
      "openclaw_portal_discovery",
      "browser_remote_debugger",
      "chrome_extension_bridge",
      "mcp_browser_adapter",
      "payer_portal_reader",
      "public_web_search",
      "public_web_scraper_openclaw",
      "configured_read_only_api_client",
      "openclaw_document_downloader",
      "read_only_document_download",
      "pdf_extraction_analysis",
      "task_scoped_helper_skill"
    ],
    fallback_strategy: {
      order: ["browser_remote_debugger", "chrome_extension_bridge", "mcp_browser_adapter", "manual_user_export"],
      stopCondition: "credentials_or_irreversible_action_required",
      artifactPath: "openclaw/skills/insurance-portal-browser",
      requiredCompanionSkills: ["browser-automation", "ocr-local"],
      browserControlSubstrate: "browser-automation",
      visualEvidenceSubstrate: "ocr-local",
      adaptiveWorkerPolicy: "decompose_subtasks_choose_tools_report_every_30_seconds",
      workerMemoryLayer: "openclaw_worker_heartbeat_memory"
    },
    prompt_contract: {
      noCredentialEntry: true,
      sourcePointersRequired: true,
      externalActionsRequireApproval: true,
      browserAutomationRequired: true,
      visualOcrRequired: true,
      adaptiveSubtasksAllowed: true,
      statusSubagentRequired: true,
      progressReportEverySeconds: 30
    }
  },
  {
    skill_key: "insurance_knowledge_research",
    title: "Insurance knowledge research",
    description: "Retrieve payer, CMS, code-set, and authoritative web sources for workflow-specific questions with citation and freshness checks.",
    status: "design_ready",
    risk_level: "medium",
    allowed_tools: ["aetna_cpb_lookup", "cms_icd10_lookup", "cms_mcd_lookup", "public_web_search"],
    fallback_strategy: {
      order: ["payer_policy_source", "cms_source", "healthcare.gov_or_state_source", "ask_user_for_document"],
      stopCondition: "source_not_current_or_not_applicable_to_plan"
    },
    prompt_contract: {
      citeSources: true,
      noMedicalAdvice: true,
      noUnsupportedCoverageGuarantees: true
    }
  },
  {
    skill_key: "heartbeat_followup_planner",
    title: "Heartbeat follow-up planner",
    description: "Inspect pending jobs, due dates, open tasks, last context packet, and propose approval-gated next actions.",
    status: "enabled_local_harness",
    risk_level: "medium",
    allowed_tools: ["local_sqlite_memory", "gmail_inbox_reader", "whatsapp_sender", "openclaw_authenticated_browser"],
    fallback_strategy: {
      order: ["local_sqlite_memory", "approval_request_outbox", "manual_user_followup"],
      stopCondition: "external_adapter_not_approved"
    },
    prompt_contract: {
      inspectAndProposeOnlyByDefault: true,
      scheduleAwarenessRequired: true,
      neverSendWithoutApproval: true
    }
  }
];

function json(value) {
  return JSON.stringify(value);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function upsert(store, table, keyColumn, row, time, createId) {
  const existing = await store.findOne(table, { [keyColumn]: row[keyColumn] });
  if (existing) {
    const { id, created_at, ...updates } = row;
    await store.update(table, { ...updates, updated_at: time }, { id: existing.id });
    return { ...existing, ...updates, updated_at: time };
  }
  const insert = {
    id: row.id ?? createId(table.replace(/s$/, "")),
    created_at: time,
    updated_at: time,
    ...row
  };
  await store.insert(table, insert);
  return insert;
}

export async function seedRuntimeRegistries(store, { nowIso, createId }) {
  // Phase 87 (§7): public_web_search replaced the old authoritative-web-search key —
  // the stale row and its requirement rows are DELETED (no alias, no dual key).
  try {
    await store.all("DELETE FROM workflow_tool_requirements WHERE tool_key = 'web_search_authoritative_sources';");
    await store.all("DELETE FROM tool_registry WHERE tool_key = 'web_search_authoritative_sources';");
  } catch {
    /* fresh store: nothing to retire */
  }
  const time = nowIso();
  for (const workflow of WORKFLOW_DEFINITIONS) {
    await upsert(
      store,
      "workflow_definitions",
      "workflow_key",
      {
        workflow_key: workflow.workflow_key,
        title: workflow.title,
        journey_stage: workflow.journey_stage,
        description: workflow.description,
        required_user_fields_json: json(workflow.required_user_fields),
        required_data_pointers_json: json(workflow.required_data_pointers),
        required_tools_json: json(workflow.required_tools),
        memory_scopes_json: json(workflow.memory_scopes),
        status: "active"
      },
      time,
      createId
    );
  }
  for (const tool of TOOL_REGISTRY) {
    await upsert(
      store,
      "tool_registry",
      "tool_key",
      {
        tool_key: tool.tool_key,
        tool_type: tool.tool_type,
        title: tool.title,
        risk_level: tool.risk_level,
        integration_status: tool.integration_status,
        approval_required: tool.approval_required,
        // Phase 87 (§7): the explicit executor map + write gate are DATA on the row —
        // executorRegistry materializes tool_key -> executor_key from here; a NULL
        // executor_key means any dispatch attempt fails loud executor_missing.
        executor_key: tool.executor_key ?? null,
        write_capable: tool.write_capable ?? 0,
        config_json: json(tool.config)
      },
      time,
      createId
    );
  }
  for (const source of KNOWLEDGE_SOURCES) {
    await upsert(
      store,
      "knowledge_sources",
      "source_key",
      {
        source_key: source.source_key,
        title: source.title,
        source_type: source.source_type,
        authority_level: source.authority_level,
        base_url: source.base_url,
        workflow_keys_json: json(source.workflow_keys),
        refresh_policy: source.refresh_policy,
        access_method: source.access_method,
        status: source.status
      },
      time,
      createId
    );
  }
  for (const skill of OPENCLAW_SKILLS) {
    await upsert(
      store,
      "openclaw_skills",
      "skill_key",
      {
        skill_key: skill.skill_key,
        title: skill.title,
        description: skill.description,
        status: skill.status,
        risk_level: skill.risk_level,
        allowed_tools_json: json(skill.allowed_tools),
        fallback_strategy_json: json(skill.fallback_strategy),
        prompt_contract_json: json(skill.prompt_contract)
      },
      time,
      createId
    );
  }

  const requirementRows = [];
  for (const workflow of WORKFLOW_DEFINITIONS) {
    for (const toolKey of workflow.required_tools) {
      requirementRows.push({
        workflow_key: workflow.workflow_key,
        tool_key: toolKey,
        required_for: workflow.journey_stage,
        fallback_tool_keys_json: json(fallbacksForTool(toolKey))
      });
    }
  }
  for (const row of requirementRows) {
    const existing = await store.get(
      "SELECT id FROM workflow_tool_requirements WHERE workflow_key = ? AND tool_key = ? LIMIT 1;",
      [row.workflow_key, row.tool_key]
    );
    if (!existing) {
      await store.insert("workflow_tool_requirements", {
        id: createId("wtreq"),
        ...row,
        created_at: time
      });
    }
  }
}

// Phase 87 (§7): the explicit tool_key -> executor mapping, materialized from the SAME
// rows that seed tool_registry (one source of truth; the DB rows are the runtime
// authority — buildToolExecutorMap in executorRegistry.mjs consumes either).
export function toolExecutorAssignments() {
  const map = {};
  for (const tool of TOOL_REGISTRY) {
    map[tool.tool_key] = {
      executorKey: tool.executor_key ?? null,
      writeCapable: Number(tool.write_capable ?? 0) === 1 ? 1 : 0
    };
  }
  return map;
}

function fallbacksForTool(toolKey) {
  if (toolKey === "openclaw_authenticated_browser") return ["browser_remote_debugger", "chrome_extension_bridge", "mcp_browser_adapter"];
  if (toolKey === "aetna_cpb_lookup") return ["public_web_search", "ask_user_for_plan_document"];
  if (toolKey === "cms_icd10_lookup") return ["public_web_search"];
  if (toolKey === "cms_mcd_lookup") return ["public_web_search"];
  if (toolKey === "gmail_inbox_reader") return ["manual_user_forwarded_email"];
  return [];
}

function normalizeWorkflow(row) {
  return {
    key: row.workflow_key,
    title: row.title,
    journeyStage: row.journey_stage,
    description: row.description,
    requiredUserFields: parseJson(row.required_user_fields_json, []),
    requiredDataPointers: parseJson(row.required_data_pointers_json, []),
    requiredTools: parseJson(row.required_tools_json, []),
    memoryScopes: parseJson(row.memory_scopes_json, []),
    status: row.status
  };
}

function normalizeTool(row) {
  return {
    key: row.tool_key,
    type: row.tool_type,
    title: row.title,
    riskLevel: row.risk_level,
    integrationStatus: row.integration_status,
    approvalRequired: row.approval_required,
    config: parseJson(row.config_json, {})
  };
}

function normalizeSource(row) {
  return {
    key: row.source_key,
    title: row.title,
    type: row.source_type,
    authorityLevel: row.authority_level,
    baseUrl: row.base_url,
    workflowKeys: parseJson(row.workflow_keys_json, []),
    refreshPolicy: row.refresh_policy,
    accessMethod: row.access_method,
    status: row.status
  };
}

function normalizeSkill(row) {
  return {
    key: row.skill_key,
    title: row.title,
    description: row.description,
    status: row.status,
    riskLevel: row.risk_level,
    allowedTools: parseJson(row.allowed_tools_json, []),
    fallbackStrategy: parseJson(row.fallback_strategy_json, {}),
    promptContract: parseJson(row.prompt_contract_json, {})
  };
}

function hasDataPointer(required, pointers) {
  return pointers.some((pointer) => pointer.table === required || pointer.table?.startsWith(required));
}

function fieldIsPresent(field, { user, portal }) {
  if (field === "user.id") return Boolean(user?.id);
  if (field === "user.email") return Boolean(user?.email);
  if (field === "portal_account") return Boolean(portal?.id || portal?.portal_url);
  return false;
}

function toolIsEnabled(tool) {
  return [
    "enabled_local",
    "enabled_local_when_chrome_debugger_running",
    "adapter_contract_ready",
    "registry_ready_manual_or_web",
    "available_through_codex_when_requested"
  ].includes(tool?.integrationStatus);
}

function routeScore(workflow, userInput, memoryItems) {
  const inputText = String(userInput ?? "").toLowerCase();
  const memoryText = memoryItems.map((item) => `${item.type} ${item.content}`).join(" ").toLowerCase();
  const keys = {
    eligibility_benefits_navigation: ["eligibility", "benefit", "coverage", "deductible", "copay", "out-of-pocket", "aetna"],
    claim_status_navigation: ["claim", "eob", "paid", "denied", "status", "patient responsibility"],
    pharmacy_formulary: ["medication", "drug", "pharmacy", "formulary", "rx", "prescription", "copay", "tier"],
    prior_authorization_navigation: ["prior authorization", "precert", "authorization", "approved", "pending"],
    denial_appeal_preparation: ["denial", "appeal", "reconsideration", "medical necessity", "letter"],
    payer_portal_read_only_extraction: ["portal", "browser", "chrome", "extract", "scrape", "logged"],
    document_or_trace_review: ["document", "trace", "screenshot", "audit", "review"],
    human_approval_escalation: ["approve", "permission", "send", "submit", "change", "cancel"]
  };
  return (keys[workflow.key] ?? []).reduce((score, token) => {
    const inputMatch = inputText.includes(token) ? 10 : 0;
    const memoryMatch = memoryText.includes(token) ? 1 : 0;
    return score + inputMatch + memoryMatch;
  }, 0);
}

export async function loadWorkflowArchitecture(store, { user, portal, userInput = "", memoryItems = [], dbPointers = [] }) {
  const [workflowRows, toolRows, sourceRows, skillRows, journeyRows, reflectionRows] = await Promise.all([
    store.all("SELECT * FROM workflow_definitions WHERE status = 'active' ORDER BY workflow_key ASC;"),
    store.all("SELECT * FROM tool_registry ORDER BY tool_key ASC;"),
    store.all("SELECT * FROM knowledge_sources ORDER BY source_key ASC;"),
    store.all("SELECT * FROM openclaw_skills ORDER BY skill_key ASC;"),
    user?.id
      ? store.all("SELECT * FROM user_journey_events WHERE user_id = ? ORDER BY occurred_at DESC LIMIT 20;", [user.id])
      : Promise.resolve([]),
    user?.id
      ? store.all("SELECT * FROM memory_reflections WHERE user_id = ? ORDER BY created_at DESC LIMIT 10;", [user.id])
      : Promise.resolve([])
  ]);
  const workflows = workflowRows.map(normalizeWorkflow);
  const tools = toolRows.map(normalizeTool);
  const toolsByKey = new Map(tools.map((tool) => [tool.key, tool]));
  const readiness = workflows.map((workflow) => {
    const missingUserFields = workflow.requiredUserFields.filter((field) => !fieldIsPresent(field, { user, portal }));
    const missingDataPointers = workflow.requiredDataPointers.filter((pointer) => !hasDataPointer(pointer, dbPointers));
    const toolStatus = workflow.requiredTools.map((toolKey) => {
      const tool = toolsByKey.get(toolKey);
      return {
        toolKey,
        present: Boolean(tool),
        enabled: toolIsEnabled(tool),
        integrationStatus: tool?.integrationStatus ?? "missing",
        approvalRequired: tool?.approvalRequired ?? "unknown"
      };
    });
    const missingTools = toolStatus.filter((tool) => !tool.present).map((tool) => tool.toolKey);
    const disabledTools = toolStatus.filter((tool) => tool.present && !tool.enabled).map((tool) => tool.toolKey);
    const score = routeScore(workflow, userInput, memoryItems);
    return {
      workflowKey: workflow.key,
      title: workflow.title,
      journeyStage: workflow.journeyStage,
      routeScore: score,
      complete: missingUserFields.length === 0 && missingTools.length === 0,
      executableNow: missingUserFields.length === 0 && missingTools.length === 0 && disabledTools.length === 0,
      missingUserFields,
      missingDataPointers,
      missingTools,
      disabledTools,
      toolStatus,
      memoryScopes: workflow.memoryScopes,
      routeEvidence: {
        userInputMatched: score > 0,
        priorMemoryConsidered: memoryItems.length > 0,
        dataPointersConsidered: dbPointers.length > 0
      }
    };
  });
  const routeCandidates = readiness
    .slice()
    .sort((a, b) => b.routeScore - a.routeScore || Number(b.executableNow) - Number(a.executableNow))
    .slice(0, 5);
  return {
    schemaVersion: 1,
    timestampType: "iso_8601_utc_text",
    workflows,
    tools,
    knowledgeSources: sourceRows.map(normalizeSource),
    openclawSkills: skillRows.map(normalizeSkill),
    readiness,
    routeCandidates,
    journeyEvents: journeyRows.map((row) => ({ ...row, evidence: parseJson(row.evidence_json, {}) })),
    memoryReflections: reflectionRows.map((row) => ({
      ...row,
      memoryItemIds: parseJson(row.memory_item_ids_json, [])
    }))
  };
}
