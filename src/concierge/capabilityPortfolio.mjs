import { createHash } from "node:crypto";
import { createRuntimeContextCache } from "./runtimeContextCache.mjs";

export const CAPABILITY_PORTFOLIO_VERSION = "2026-06-26.phase78-capability-portfolio.v1";

function sha(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function compact(value, limit = 260) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

export function capabilityPortfolioKey(sessionId) {
  return `brainsty:capability-portfolio:${sessionId}`;
}

function pointerFor(key, id) {
  return `${key}#${id}`;
}

function workflowEntries(architecture, cacheKey) {
  return (architecture.readiness ?? []).map((workflow) => ({
    portfolioId: `workflow:${workflow.workflowKey}`,
    kind: "workflow",
    title: workflow.title ?? workflow.workflowKey,
    shortDescription: compact(`${workflow.journeyStage}; executable=${workflow.executableNow}; missing_data=${workflow.missingDataPointers?.length ?? 0}; disabled_tools=${workflow.disabledTools?.length ?? 0}`),
    pointer: pointerFor(cacheKey, `workflow:${workflow.workflowKey}`),
    workflowKey: workflow.workflowKey,
    routeScore: workflow.routeScore,
    executableNow: workflow.executableNow,
    requiredApproval: workflow.toolStatus?.some((tool) => String(tool.approvalRequired ?? "").includes("approval")) ?? false,
    hydrate: workflow
  }));
}

function toolEntries(architecture, cacheKey) {
  return (architecture.tools ?? []).map((tool) => ({
    portfolioId: `tool:${tool.key}`,
    kind: "tool",
    title: tool.title ?? tool.key,
    shortDescription: compact(`${tool.type}; status=${tool.integrationStatus}; approval=${tool.approvalRequired}; risk=${tool.riskLevel}`),
    pointer: pointerFor(cacheKey, `tool:${tool.key}`),
    toolKey: tool.key,
    status: tool.integrationStatus,
    riskLevel: tool.riskLevel,
    hydrate: tool
  }));
}

function skillEntries(architecture, cacheKey) {
  return (architecture.openclawSkills ?? []).map((skill) => ({
    portfolioId: `skill:${skill.key}`,
    kind: "skill",
    title: skill.title ?? skill.key,
    shortDescription: compact(`${skill.description}; status=${skill.status}; risk=${skill.riskLevel}`),
    pointer: pointerFor(cacheKey, `skill:${skill.key}`),
    skillKey: skill.key,
    status: skill.status,
    riskLevel: skill.riskLevel,
    hydrate: skill
  }));
}

function graphPathEntries(cacheKey) {
  const paths = [
    {
      id: "graph:input_policy_to_llm_planner",
      title: "Safety-gated LLM planner path",
      description: "input_policy -> recall_context -> classify_intent -> llm_decision -> workflow_router",
      useWhen: "General chat or user actions after deterministic safety gates pass."
    },
    {
      id: "graph:approval_interrupt_resume",
      title: "Native human-in-the-loop approval resume",
      description: "observe_evidence -> approval_pause -> observe_evidence",
      useWhen: "Read-only worker execution needs explicit human approval before continuing."
    },
    {
      id: "graph:evidence_to_sourced_answer",
      title: "Evidence to sourced answer",
      description: "observe_evidence -> case_state_shadow -> compose_response",
      useWhen: "Trusted evidence/source pointers exist and the answer composer can cite them."
    }
  ];
  return paths.map((path) => ({
    portfolioId: path.id,
    kind: "graph_path",
    title: path.title,
    shortDescription: compact(`${path.description}; use=${path.useWhen}`),
    pointer: pointerFor(cacheKey, path.id),
    graphPathId: path.id,
    hydrate: path
  }));
}

function scoreEntry(entry) {
  if (entry.kind === "workflow") return (entry.routeScore ?? 0) + (entry.executableNow ? 25 : 0);
  if (entry.kind === "skill" && /ready|enabled/i.test(entry.status ?? "")) return 18;
  if (entry.kind === "tool" && /enabled|ready|available/i.test(entry.status ?? "")) return 12;
  if (entry.kind === "graph_path") return 10;
  return 0;
}

export function buildCapabilityPortfolio(contextPacket, { cacheKey = capabilityPortfolioKey(contextPacket.currentSession?.id ?? "global") } = {}) {
  const architecture = contextPacket.workflowArchitecture ?? {};
  const entries = [
    ...workflowEntries(architecture, cacheKey),
    ...skillEntries(architecture, cacheKey),
    ...toolEntries(architecture, cacheKey),
    ...graphPathEntries(cacheKey)
  ].map((entry) => ({
    ...entry,
    score: scoreEntry(entry)
  }));
  const byId = Object.fromEntries(entries.map((entry) => [entry.portfolioId, entry]));
  const sorted = entries
    .slice()
    .sort((a, b) => b.score - a.score || a.portfolioId.localeCompare(b.portfolioId));
  const pinnedIds = new Set([
    "workflow:pharmacy_formulary",
    "workflow:claim_status_navigation",
    "skill:insurance_portal_browser",
    "tool:openclaw_authenticated_browser",
    "graph:input_policy_to_llm_planner"
  ]);
  const balanced = [
    ...sorted.filter((entry) => pinnedIds.has(entry.portfolioId)),
    ...sorted.filter((entry) => entry.kind === "workflow").slice(0, 8),
    ...sorted.filter((entry) => entry.kind === "skill").slice(0, 4),
    ...sorted.filter((entry) => entry.kind === "tool").slice(0, 4),
    ...sorted.filter((entry) => entry.kind === "graph_path").slice(0, 3)
  ];
  const seen = new Set();
  const promptTable = balanced
    .concat(sorted)
    .filter((entry) => {
      if (seen.has(entry.portfolioId)) return false;
      seen.add(entry.portfolioId);
      return true;
    })
    .slice(0, 18)
    .map((entry) => ({
      portfolioId: entry.portfolioId,
      kind: entry.kind,
      title: entry.title,
      shortDescription: entry.shortDescription,
      pointer: entry.pointer,
      score: entry.score
    }));
  const fullPayload = {
    version: CAPABILITY_PORTFOLIO_VERSION,
    cacheKey,
    generatedAt: contextPacket.generatedAt,
    sessionId: contextPacket.currentSession?.id ?? null,
    entryCount: entries.length,
    entries: byId
  };
  return {
    version: CAPABILITY_PORTFOLIO_VERSION,
    cacheKey,
    entryCount: entries.length,
    portfolioHash: sha(JSON.stringify(promptTable)).slice(0, 24),
    promptTable,
    fullPayload
  };
}

export async function attachCapabilityPortfolio(contextPacket) {
  if (!contextPacket.currentSession?.id) return null;
  const cache = createRuntimeContextCache();
  const portfolio = buildCapabilityPortfolio(contextPacket, {
    cacheKey: capabilityPortfolioKey(contextPacket.currentSession.id)
  });
  try {
    await cache.adapter.set(portfolio.cacheKey, portfolio.fullPayload, { ttlSeconds: 1800 });
    return {
      version: portfolio.version,
      cacheBackend: cache.backend,
      cacheKey: portfolio.cacheKey,
      portfolioHash: portfolio.portfolioHash,
      entryCount: portfolio.entryCount,
      stored: true,
      promptTable: portfolio.promptTable
    };
  } catch (error) {
    return {
      version: portfolio.version,
      cacheBackend: cache.backend,
      cacheKey: portfolio.cacheKey,
      portfolioHash: portfolio.portfolioHash,
      entryCount: portfolio.entryCount,
      stored: false,
      storeError: error.message,
      promptTable: portfolio.promptTable
    };
  }
}

// Dereference the pointers the LLM planner selected back into full hydrated
// capability payloads. This is the read-back half of the pointer architecture:
// the portfolio fullPayload was written to the runtime cache (Redis) during
// context build; here we read it and resolve only the selected entries.
export async function hydrateCapabilityPointers(sessionId, pointers = []) {
  const load = await loadCapabilityPortfolio(sessionId);
  const entries = load.portfolio?.entries ?? {};
  const resolved = [];
  const missing = [];
  for (const pointer of pointers) {
    const raw = String(pointer ?? "").trim();
    if (!raw) continue;
    const portfolioId = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw;
    const entry = entries[portfolioId];
    if (entry) {
      resolved.push({ portfolioId, kind: entry.kind, title: entry.title, pointer: raw, hydrate: entry.hydrate });
    } else {
      missing.push(raw);
    }
  }
  return {
    cacheBackend: load.cacheBackend,
    cacheKey: load.cacheKey,
    cacheStatus: load.status,
    cacheHit: Boolean(load.portfolio),
    requested: pointers.length,
    resolvedCount: resolved.length,
    missing,
    resolved
  };
}

export async function loadCapabilityPortfolio(sessionId) {
  const cache = createRuntimeContextCache();
  const key = capabilityPortfolioKey(sessionId);
  try {
    return {
      cacheBackend: cache.backend,
      cacheKey: key,
      status: "ok",
      portfolio: await cache.adapter.get(key)
    };
  } catch (error) {
    return {
      cacheBackend: cache.backend,
      cacheKey: key,
      status: "error",
      error: error.message,
      portfolio: null
    };
  }
}
