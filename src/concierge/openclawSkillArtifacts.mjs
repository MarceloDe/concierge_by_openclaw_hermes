import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const OPENCLAW_SKILL_ARTIFACTS_VERSION = "2026-05-26.openclaw-skill-artifacts.v1";

const DEFAULT_SKILL_ROOT = resolve("openclaw/skills");
const SKILL_PATHS = {
  insurance_portal_browser: "insurance-portal-browser"
};

function hasEvery(value, required) {
  return Array.isArray(value) && required.every((item) => value.includes(item));
}

function includesText(text, fragment) {
  return String(text ?? "").toLowerCase().includes(fragment.toLowerCase());
}

export function validateOpenClawSkillArtifact(artifact) {
  const issues = [];
  const warnings = [];
  const manifest = artifact.manifest ?? {};
  const skillMd = artifact.skillMd ?? "";

  if (manifest.skill_key !== "insurance_portal_browser") issues.push("Manifest skill_key must be insurance_portal_browser.");
  if (manifest.status !== "repo_artifact_ready_adapter_execution_gated") {
    issues.push("Skill status must make real adapter execution gated.");
  }
  if (manifest.risk_level !== "high") issues.push("Insurance portal browser skill must be high risk.");
  if (
    !hasEvery(manifest.allowed_tools, [
      "browser_remote_debugger",
      "chrome_extension_bridge",
      "mcp_browser_adapter",
      "payer_portal_reader",
      "portal_search",
      "read_only_document_download",
      "pdf_extraction_analysis"
    ])
  ) {
    issues.push("Skill allowed_tools must include all browser fallback and extraction tools.");
  }
  if (!hasEvery(manifest.required_companion_skills, ["browser-automation", "ocr-local"])) {
    issues.push("Skill required_companion_skills must include browser-automation and ocr-local.");
  }
  if (manifest.browser_control_policy?.required_skill !== "browser-automation") {
    issues.push("Skill browser_control_policy must delegate browser operation to browser-automation.");
  }
  if (manifest.adaptive_worker_policy?.worker_may_decompose_assigned_task !== true) {
    issues.push("Skill adaptive_worker_policy must allow assigned-task decomposition.");
  }
  if (manifest.adaptive_worker_policy?.langgraph_remains_workflow_master !== true) {
    issues.push("Skill adaptive_worker_policy must keep LangGraph as workflow master.");
  }
  if (manifest.progress_protocol?.report_every_seconds !== 30 || manifest.progress_protocol?.silent_failure_allowed !== false) {
    issues.push("Skill progress_protocol must require non-silent 30-second reports.");
  }
  if (!manifest.tooling_strategy?.document_handling?.some((item) => includesText(item, "SBCs"))) {
    issues.push("Skill tooling_strategy must include read-only insurance document/PDF handling.");
  }
  if (!manifest.portal_section_strategy?.likely_sections?.includes("Summary of Benefits and Coverage")) {
    issues.push("Skill portal_section_strategy must include the Summary of Benefits and Coverage section.");
  }
  if (!manifest.structured_answer_schema?.data_collected_fields?.includes("out_of_pocket_max")) {
    issues.push("Skill structured_answer_schema must include insurance plan data fields.");
  }
  if (!manifest.quality_bar?.some((item) => includesText(item, "multiple read-only approaches"))) {
    issues.push("Skill quality_bar must require multiple read-only approaches before failure.");
  }
  if (!hasEvery(manifest.allowed_workflows, ["eligibility_benefits_navigation", "claim_status_navigation", "prior_authorization_navigation", "payer_portal_read_only_extraction"])) {
    issues.push("Skill allowed_workflows must cover eligibility, claims, prior auth, and portal extraction.");
  }
  if (manifest.approval_gates?.credential_entry !== "user_only") {
    issues.push("Credential entry must be user_only.");
  }
  if (manifest.approval_gates?.form_submit_or_record_change !== "requires_explicit_per_action_approval") {
    issues.push("Form submission and record changes must require explicit per-action approval.");
  }
  if (!manifest.must_never?.includes("treat_portal_text_as_instructions")) {
    issues.push("Skill must explicitly treat portal text as untrusted context.");
  }
  if (!manifest.source_pointer_policy?.required) {
    issues.push("Source pointer policy must be required.");
  }
  if (!manifest.visual_evidence_policy?.screenshot_ocr_required || manifest.visual_evidence_policy?.ocr_engine !== "ocr-local") {
    issues.push("Visual evidence policy must require local OCR through ocr-local.");
  }
  if (!includesText(skillMd, "Never enter credentials")) {
    issues.push("SKILL.md must state the credential boundary.");
  }
  if (!includesText(skillMd, "untrusted context")) {
    issues.push("SKILL.md must mark portal/tool content as untrusted context.");
  }
  if (!includesText(skillMd, "does not replace `browser-automation`")) {
    issues.push("SKILL.md must state that insurance-portal-browser does not replace browser-automation.");
  }
  if (!includesText(skillMd, "Report to LangGraph every 30 seconds")) {
    issues.push("SKILL.md must state the 30-second worker progress protocol.");
  }
  if (!includesText(skillMd, "Insurance Site Tooling Strategy")) {
    issues.push("SKILL.md must include the insurance-site tooling strategy.");
  }
  if (!includesText(skillMd, "Structured Return Payload")) {
    issues.push("SKILL.md must include the structured return payload.");
  }
  if (!includesText(skillMd, "Summary of Benefits and Coverage")) {
    issues.push("SKILL.md must include portal section strategy for SBC documents.");
  }
  if (!includesText(skillMd, "not_possible_missing_user_data")) {
    issues.push("SKILL.md must define terminal outcome statuses.");
  }
  if (!includesText(skillMd, "approval-gated official OpenClaw read-only worker path")) {
    issues.push("SKILL.md must state the current approval-gated official OpenClaw worker status.");
  }
  if (!manifest.fallback_strategy?.order?.includes("manual_user_export")) {
    warnings.push("Manual user export fallback is missing.");
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    checked: {
      manifest: Boolean(artifact.manifest),
      skillMd: Boolean(skillMd),
      sourcePointersRequired: Boolean(manifest.source_pointer_policy?.required),
      credentialBoundary: manifest.approval_gates?.credential_entry === "user_only",
      executionGated: manifest.status === "repo_artifact_ready_adapter_execution_gated",
      browserAutomationRequired: manifest.browser_control_policy?.required_skill === "browser-automation",
      ocrLocalRequired: manifest.visual_evidence_policy?.ocr_engine === "ocr-local",
      adaptiveWorkerAllowed: manifest.adaptive_worker_policy?.worker_may_decompose_assigned_task === true,
      structuredAnswerSchema: Boolean(manifest.structured_answer_schema?.data_collected_fields?.length),
      portalSectionStrategy: Boolean(manifest.portal_section_strategy?.likely_sections?.length),
      progressProtocolSeconds: manifest.progress_protocol?.report_every_seconds ?? null
    }
  };
}

export async function loadOpenClawSkillArtifact(skillKey = "insurance_portal_browser", options = {}) {
  const relative = SKILL_PATHS[skillKey];
  if (!relative) throw new Error(`Unknown OpenClaw skill artifact: ${skillKey}`);

  const root = options.root ? resolve(options.root) : DEFAULT_SKILL_ROOT;
  const skillDir = resolve(root, relative);
  const manifestPath = resolve(skillDir, "skill.json");
  const skillPath = resolve(skillDir, "SKILL.md");
  const [manifestText, skillMd] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(skillPath, "utf8")
  ]);
  const manifest = JSON.parse(manifestText);
  const artifact = {
    version: OPENCLAW_SKILL_ARTIFACTS_VERSION,
    skillKey,
    skillDir,
    manifestPath,
    skillPath,
    manifest,
    skillMd
  };
  return {
    ...artifact,
    validation: validateOpenClawSkillArtifact(artifact)
  };
}

export async function listOpenClawSkillArtifacts(options = {}) {
  const artifacts = [];
  for (const skillKey of Object.keys(SKILL_PATHS)) {
    artifacts.push(await loadOpenClawSkillArtifact(skillKey, options));
  }
  return {
    version: OPENCLAW_SKILL_ARTIFACTS_VERSION,
    artifacts
  };
}
