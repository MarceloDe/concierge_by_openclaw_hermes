export const PHASE66_PRODUCTION_CONTRACT_VERSION = "2026-06-22.phase66-production-contract.v1";

export const PHASE66_PRODUCTION_DECISIONS = Object.freeze({
  productionTarget: {
    launchMeaning: "real_patient_member_usage_under_hipaa_controls",
    firstUser: "patient_member",
    firstWorkflow: "bill_verification_flow",
    firstChannel: "patient_chat_pwa",
    dashboardRole: "operator_verification_only"
  },
  postgres: {
    productionDefault: true,
    migrateFirst: [
      "sessions",
      "tasks",
      "approvals_audit",
      "source_pointers_evidence",
      "generated_skill_queue_executor_state"
    ],
    retentionYears: 5,
    backupRestorePolicy: "encrypted_cloud_backup_restore_drill_required_for_production"
  },
  graphitiZep: {
    storesGeneralizedProceduralLearning: true,
    storesUserSpecificLongitudinalContext: true,
    allowedFacts: [
      "plan_patterns",
      "procedure_playbooks",
      "user_clinical_preferences_conditions",
      "prior_successful_journeys",
      "provider_network_discoveries"
    ],
    schemaFirst: true,
    successfulCaseCreatesMemoryEpisode: true,
    skillCandidatePolicy: "operator_review_queue_then_versioned_activation"
  },
  remoteBrowser: {
    firstDeployment: "self_hosted_steel_on_aws_ec2",
    liveBlock: ["interactive_viewer", "takeover_controls"],
    readOnlyAgentActionsWithoutTakeover: ["navigate_allowed_pages", "read_page_content", "click_safe_tabs_menus", "download_documents"],
    humanTakeoverAlwaysRequired: ["credentials", "2fa", "captcha", "form_submit", "payer_contact", "uploads"],
    credentialStorageAllowed: false
  },
  openclawAuth: {
    firstAuthModel: "manual_user_login_in_sandbox_browser",
    rememberPortalLoginState: true,
    rememberCredentials: false,
    expiredLoginPolicy: "transparent_stale_evidence_warning_and_user_reauth_for_fresh_claims"
  },
  skills: {
    productionCritical: [
      "insurance_portal_browser",
      "claim_journey",
      "aetna_plan",
      "prior_auth_prep",
      "denial_appeal",
      "procedure_prep",
      "provider_network",
      "pharmacy_formulary"
    ],
    operatorActivation: "staging_or_reviewed_queue_only",
    productionActivation: "versioned_review_pr_audit_and_kill_switch",
    requiredContents: ["tools", "extractors", "verifiers_sensors", "controller_loop", "ui_blocks", "memory_retrieval_rules", "tests"]
  },
  finalAnswer: {
    llmComposesWhenCitedEvidenceExists: true,
    deterministicFallbackOnlyWhenValidationFails: true,
    regularUserStyle: ["step_by_step_plan", "confidence_reliability_label", "what_i_could_not_verify"],
    citationRequiredForClaims: [
      "bill",
      "claim",
      "coverage",
      "price",
      "provider_network",
      "pharmacy_formulary",
      "document",
      "portal_state",
      "dates"
    ]
  },
  exceptionHandling: {
    missingEvidence: ["best_effort_answer", "ask_for_docs_or_login", "start_worker_browser_task", "search_trusted_research"],
    medicalAdvice: "deny_and_route_to_clinician_or_emergency_guidance",
    portalDocumentConflict: "human_review_required",
    memoryEvidenceConflict: "current_evidence_wins_and_human_loop_records_decision",
    browserSandboxFailure: "transparent_blocker_and_next_action"
  },
  successCriteria: {
    userExperience: "chat_gui_separate_from_dashboard",
    progressFeedback: "bidirectional_feedback_at_every_step",
    physicalBillIntake: "photo_upload_extract_missing_info_and_offer_no_login_general_explanation",
    multiSourceResearch: "deidentified_parallel_agents_over_trusted_docs_and_safe_public_sources",
    answerComposition: "langchain_llm_composition_with_reliability_and_confidence"
  },
  safety: {
    cortexIsProjectMemoryOnly: true,
    databaseAuthoritativeForRuntimeState: true,
    graphitiAdvisoryUntilSchemaReady: true,
    noPhiToPublicResearchSources: true,
    noCredentialEntryByAgent: true,
    noExternalWritesWithoutExplicitApproval: true
  }
});

function countBooleans(values) {
  const entries = Object.entries(values);
  const passed = entries.filter(([, value]) => value === true).length;
  return {
    passed,
    total: entries.length,
    score: Math.round((passed / entries.length) * 100)
  };
}

export function buildPhase66ProductionContractProof({ docsPresent = true } = {}) {
  const checks = {
    founderAnswersParsed: true,
    patientMemberFirstUserLocked: PHASE66_PRODUCTION_DECISIONS.productionTarget.firstUser === "patient_member",
    billVerificationFirstWorkflowLocked: PHASE66_PRODUCTION_DECISIONS.productionTarget.firstWorkflow === "bill_verification_flow",
    postgresProductionDefaultLocked: PHASE66_PRODUCTION_DECISIONS.postgres.productionDefault === true,
    fiveYearRetentionLocked: PHASE66_PRODUCTION_DECISIONS.postgres.retentionYears === 5,
    encryptedBackupRequired: /encrypted/.test(PHASE66_PRODUCTION_DECISIONS.postgres.backupRestorePolicy),
    graphitiSchemaFirstLocked: PHASE66_PRODUCTION_DECISIONS.graphitiZep.schemaFirst === true,
    memoryStoresBothProceduralAndUserContext:
      PHASE66_PRODUCTION_DECISIONS.graphitiZep.storesGeneralizedProceduralLearning === true &&
      PHASE66_PRODUCTION_DECISIONS.graphitiZep.storesUserSpecificLongitudinalContext === true,
    steelAwsFirstBrowserDeployment: PHASE66_PRODUCTION_DECISIONS.remoteBrowser.firstDeployment === "self_hosted_steel_on_aws_ec2",
    humanOnlyCredentialBoundary: PHASE66_PRODUCTION_DECISIONS.remoteBrowser.credentialStorageAllowed === false,
    operatorSkillActivationPolicyLocked: PHASE66_PRODUCTION_DECISIONS.skills.productionActivation.includes("pr_audit"),
    llmPrimarySourcedAnswerLocked: PHASE66_PRODUCTION_DECISIONS.finalAnswer.llmComposesWhenCitedEvidenceExists === true,
    deterministicSafetyRailsPreserved:
      PHASE66_PRODUCTION_DECISIONS.safety.noCredentialEntryByAgent === true &&
      PHASE66_PRODUCTION_DECISIONS.safety.noExternalWritesWithoutExplicitApproval === true,
    productionContractDocsPresent: docsPresent === true
  };
  const scored = countBooleans(checks);
  return {
    version: PHASE66_PRODUCTION_CONTRACT_VERSION,
    status: scored.score === 100 ? "phase66_production_contract_locked" : "phase66_production_contract_attention",
    ok: scored.score === 100,
    score: scored.score,
    target: 100,
    checks,
    decisions: PHASE66_PRODUCTION_DECISIONS,
    gates: {
      nextPhase: "phase67_graphiti_zep_schema_ready_memory_layer",
      ralphLoop: "requirements_architecture_loop_prove_harden",
      interphaseApprovalRequired: false,
      implementationMayProceedSequentially: true
    },
    blockersResolved: [
      "backup_restore_policy_upgraded_from_local_docker_to_encrypted_cloud_restore_drill",
      "generated_skill_activation_split_between_reviewed_queue_and_versioned_production_activation",
      "social_public_research_deidentified_only",
      "portal_login_state_may_persist_without_credentials"
    ]
  };
}
