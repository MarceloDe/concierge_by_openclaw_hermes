import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { getOpenClawRegistrySkill, loadOpenClawSkillRegistry } from "./openclaw/skillRegistry.mjs";

export const OPENCLAW_SKILL_ARTIFACTS_VERSION = "2026-06-22.phase57-generic-openclaw-skill-artifacts.v2";

const DEFAULT_SKILL_ROOT = resolve("openclaw/skills");
const SAFE_SKILL_KEY_RE = /^[a-z][a-z0-9_:-]{2,96}$/;
const BLOCKED_CAPABILITY_PATTERNS = [
  ["credential_or_auth_secret", /(?:^|[^a-z0-9])(credential|password|passkey|2fa|mfa|otp|captcha|ssn|secret|token|cookie|localstorage|sessionstorage)(?:[^a-z0-9]|$)/i],
  ["write_or_submit_action", /(?:^|[^a-z0-9])(write|submit|send|pay|payment|cancel|modify|change|delete|upload|file_appeal|submit_appeal|submit_authorization)(?:[^a-z0-9]|$)/i],
  ["external_messaging", /(?:^|[^a-z0-9])(email|sms|whatsapp|telegram|external_message|payer_contact|contact_payer|phone_call)(?:[^a-z0-9]|$)/i],
  ["non_local_ocr", /(?:^|[^a-z0-9])(remote_ocr|cloud_ocr|external_ocr|third_party_ocr)(?:[^a-z0-9]|$)/i],
  ["page_text_as_instructions", /(?:^|[^a-z0-9])(treat_page_text_as_instructions|follow_portal_instructions|obey_page_text|browser_content_instructions)(?:[^a-z0-9]|$)/i]
];
const BLOCKED_DECLARATION_KEYS = new Set([
  "allowed_tools",
  "allowed_actions",
  "allowed_capabilities",
  "capabilities",
  "required_apis",
  "required_workers",
  "runtime_tools",
  "tool_permissions",
  "execution_tools"
]);
const POLICY_DECLARATION_KEYS = new Set([
  "must_never",
  "forbidden",
  "blocked",
  "blocked_actions",
  "forbidden_browser_behaviors",
  "stop_conditions",
  "approval_gates",
  "answer_contract",
  "safety",
  "policy"
]);

function hasEvery(value, required) {
  return Array.isArray(value) && required.every((item) => value.includes(item));
}

function includesText(text, fragment) {
  return String(text ?? "").toLowerCase().includes(fragment.toLowerCase());
}

function hashObject(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function collectCapabilityDeclarations(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const declarations = [];
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    const keyText = key.toLowerCase();
    if (POLICY_DECLARATION_KEYS.has(keyText)) continue;
    if (BLOCKED_DECLARATION_KEYS.has(keyText)) {
      declarations.push({ path: nextPath.join("."), value: child });
      continue;
    }
    if (typeof child === "object") declarations.push(...collectCapabilityDeclarations(child, nextPath));
  }
  return declarations;
}

function validateBlockedCapabilityEnvelope(manifest) {
  const issues = [];
  const declarations = collectCapabilityDeclarations(manifest);
  for (const declaration of declarations) {
    const text = JSON.stringify(declaration.value ?? "");
    for (const [issue, pattern] of BLOCKED_CAPABILITY_PATTERNS) {
      if (pattern.test(text)) issues.push(`blocked_capability_declared:${issue}:${declaration.path}`);
    }
  }
  return [...new Set(issues)];
}

function validateInsurancePortalBrowserSpecifics(manifest, skillMd) {
  const issues = [];
  const warnings = [];

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

  return { issues, warnings };
}

export function validateOpenClawSkillArtifact(artifact) {
  const issues = [];
  const warnings = [];
  const manifest = artifact.manifest ?? {};
  const skillMd = artifact.skillMd ?? "";
  const skillKey = manifest.skill_key ?? artifact.skillKey;
  const schemaVersion = manifest.schema_version ?? manifest.schemaVersion ?? "";
  const status = String(manifest.status ?? "");
  const riskLevel = String(manifest.risk_level ?? manifest.riskLevel ?? "");
  const executionMode = String(manifest.execution_mode ?? manifest.executionMode ?? "");
  const sourcePointerRequired = Boolean(manifest.source_pointer_policy?.required || manifest.answer_contract?.required_fields?.includes?.("citations"));

  if (!skillKey || !SAFE_SKILL_KEY_RE.test(String(skillKey))) issues.push("skill_key_required_or_invalid");
  if (!schemaVersion) warnings.push("schema_version_missing");
  if (!status) issues.push("status_required");
  if (!skillMd) issues.push("SKILL.md_required");
  if (!/gated|review|draft|disabled|proposal|context_resolution/i.test(status) && !/context_resolution_only|proposal_only/i.test(executionMode)) {
    issues.push("skill_status_must_be_gated_or_context_only");
  }
  issues.push(...validateBlockedCapabilityEnvelope(manifest));
  if (riskLevel === "high" && !manifest.approval_gates && !manifest.approval_required) {
    issues.push("high_risk_skill_requires_approval_policy");
  }
  if (/browser|portal|ocr/i.test(JSON.stringify(manifest.allowed_tools ?? manifest.required_workers ?? {})) && !sourcePointerRequired) {
    issues.push("browser_or_portal_skill_requires_source_pointer_policy");
  }
  if (/portal|browser/i.test(String(skillMd)) && !includesText(skillMd, "untrusted context")) {
    warnings.push("browser_or_portal_skill_should_mark_content_untrusted");
  }

  if (skillKey === "insurance_portal_browser") {
    if (status !== "repo_artifact_ready_adapter_execution_gated") {
      issues.push("Skill status must make real adapter execution gated.");
    }
    const specific = validateInsurancePortalBrowserSpecifics(manifest, skillMd);
    issues.push(...specific.issues);
    warnings.push(...specific.warnings);
  }

  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    warnings: [...new Set(warnings)],
    checked: {
      manifest: Boolean(artifact.manifest),
      skillMd: Boolean(skillMd),
      skillKey,
      genericContract: true,
      artifactHash: hashObject({ manifest, skillMd }),
      sourcePointersRequired: Boolean(manifest.source_pointer_policy?.required),
      credentialBoundary: manifest.approval_gates?.credential_entry === "user_only",
      executionGated: /gated|review|draft|disabled|proposal|context_resolution/i.test(status) || /context_resolution_only|proposal_only/i.test(executionMode),
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
  const root = options.root ? resolve(options.root) : DEFAULT_SKILL_ROOT;
  const registered = await getOpenClawRegistrySkill(skillKey, { root });
  if (!registered) throw new Error(`Unknown OpenClaw skill artifact: ${skillKey}`);
  const manifest = registered.manifest ?? registered.serverManifest;
  const artifact = {
    version: OPENCLAW_SKILL_ARTIFACTS_VERSION,
    skillKey,
    skillDir: registered.dir,
    manifestPath: registered.hasSkillJson ? resolve(registered.dir, "skill.json") : resolve(registered.dir, "skill-server.json"),
    skillPath: resolve(registered.dir, "SKILL.md"),
    manifest,
    skillMd: registered.skillMd,
    registryValidation: registered.validation
  };
  return {
    ...artifact,
    validation: validateOpenClawSkillArtifact(artifact)
  };
}

export async function listOpenClawSkillArtifacts(options = {}) {
  const registry = await loadOpenClawSkillRegistry(options);
  const artifacts = await Promise.all(registry.skills.map((skill) => loadOpenClawSkillArtifact(skill.skillKey, options)));
  return {
    version: OPENCLAW_SKILL_ARTIFACTS_VERSION,
    artifacts
  };
}
