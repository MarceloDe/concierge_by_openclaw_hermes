import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const OPENCLAW_SKILL_REGISTRY_VERSION = "2026-06-15.openclaw-skill-registry.v1";

const DEFAULT_SKILL_ROOT = resolve("openclaw/skills");

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function optionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function normalizeOpenClawSkill({ dir, skillMd, manifest, serverManifest }) {
  const source = manifest ?? serverManifest ?? {};
  const skillKey = source.skill_key ?? source.skillKey ?? null;
  const allowedWorkflows = asArray(source.allowed_workflows ?? source.matching?.workflows);
  const allowedTools = asArray(source.allowed_tools ?? source.required_workers?.openclaw_tasks ?? source.required_search?.engines);
  return {
    version: OPENCLAW_SKILL_REGISTRY_VERSION,
    skillKey,
    title: source.title ?? skillKey,
    status: source.status ?? "unknown",
    riskLevel: source.risk_level ?? (allowedTools.some((tool) => /browser|email|whatsapp|telegram/i.test(tool)) ? "high" : "medium"),
    dir,
    hasSkillMd: Boolean(skillMd),
    hasSkillJson: Boolean(manifest),
    hasSkillServerJson: Boolean(serverManifest),
    manifest,
    serverManifest,
    skillMd,
    capabilities: {
      journeys: allowedWorkflows,
      tools: allowedTools,
      requiredApprovalScopes: asArray(source.approval_gates ? Object.keys(source.approval_gates) : source.approval_required),
      blockedActions: asArray(source.must_never ?? source.answer_contract?.forbidden)
    }
  };
}

export function validateOpenClawRegistrySkill(skill) {
  const issues = [];
  const warnings = [];
  if (!skill.skillKey) issues.push("skill_key_required");
  if (!skill.hasSkillMd) issues.push("SKILL.md_required");
  if (!skill.hasSkillJson && !skill.hasSkillServerJson) issues.push("skill_json_or_skill_server_json_required");
  if (!skill.capabilities.journeys.length) warnings.push("no_journey_capabilities_declared");
  if (!skill.capabilities.tools.length) warnings.push("no_tool_capabilities_declared");
  if (skill.riskLevel === "high" && !JSON.stringify(skill.capabilities.requiredApprovalScopes).includes("credential")) {
    warnings.push("high_risk_skill_should_declare_approval_scopes");
  }
  return { valid: issues.length === 0, issues, warnings };
}

export function findRegistrySkill(registry, skillKey) {
  return (registry?.skills ?? []).find((skill) => skill.skillKey === skillKey) ?? null;
}

export function routeRegistrySkillsForDynamicContext(registry, dynamicSkillContext = {}) {
  const selected = dynamicSkillContext.selected ?? {};
  const requested = [
    ["insurance", selected.insuranceSkillKey],
    ["journey", selected.journeySkillKey],
    ["execution", selected.executionSkillKey]
  ].filter(([, skillKey]) => skillKey);
  const routed = requested.map(([role, skillKey]) => {
    const skill = findRegistrySkill(registry, skillKey);
    return {
      role,
      skillKey,
      found: Boolean(skill),
      valid: Boolean(skill?.validation?.valid),
      status: skill?.status ?? null,
      riskLevel: skill?.riskLevel ?? null,
      capabilities: skill?.capabilities ?? null,
      issues: skill?.validation?.issues ?? (skill ? [] : ["skill_not_found"])
    };
  });
  return {
    routed,
    missing: routed.filter((item) => !item.found).map((item) => item.skillKey),
    invalid: routed.filter((item) => item.found && !item.valid).map((item) => item.skillKey),
    executionSkillKey: selected.executionSkillKey ?? null
  };
}

export async function loadOpenClawSkillRegistry(options = {}) {
  const root = options.root ? resolve(options.root) : DEFAULT_SKILL_ROOT;
  const entries = await readdir(root, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const [skillMd, manifest, serverManifest] = await Promise.all([
      optionalText(join(dir, "SKILL.md")),
      optionalJson(join(dir, "skill.json")),
      optionalJson(join(dir, "skill-server.json"))
    ]);
    const skill = normalizeOpenClawSkill({ dir, skillMd, manifest, serverManifest });
    skills.push({ ...skill, validation: validateOpenClawRegistrySkill(skill) });
  }
  skills.sort((a, b) => String(a.skillKey).localeCompare(String(b.skillKey)));
  return { version: OPENCLAW_SKILL_REGISTRY_VERSION, root, skills };
}

export async function getOpenClawRegistrySkill(skillKey, options = {}) {
  const registry = await loadOpenClawSkillRegistry(options);
  return registry.skills.find((skill) => skill.skillKey === skillKey) ?? null;
}
