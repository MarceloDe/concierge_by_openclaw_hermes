import { createHash } from "node:crypto";
import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";
import {
  buildResearchGraph,
  cancelResearchRun,
  chooseResearchEmbeddingRoute,
  createResearchSchedule,
  evaluateCitationClosure,
  executeResearchRun,
  getResearchEmbeddingStatus,
  getResearchGraph,
  getResearchKpis,
  getResearchRun,
  getResearchWorkerStatus,
  listCitationClosureEvaluations,
  listResearchArtifacts,
  listResearchRuns,
  listResearchSchedules,
  listResearchSources,
  pauseResearchSchedule,
  proposeResearchSource,
  retryResearchRun,
  resumeResearchSchedule,
  reviewResearchArtifact,
  reviewResearchSource,
  reindexResearchEmbeddings,
  runDueResearchSchedules,
  searchResearchEvidence,
  startManualResearchRun,
  updateResearchSource
} from "./researchOps.mjs";

export const OPERATOR_ASSISTANT_VERSION = "2026-06-01.phase10p-claim-citation-closure-proposals.v1";

const PROPOSAL_STATUSES = new Set(["pending_approval", "approved", "rejected", "executed", "failed"]);
const READ_TOOL_KEYS = new Set([
  "research.getKpis",
  "research.getWorkerStatus",
  "research.listSources",
  "research.listRuns",
  "research.getRun",
  "research.listArtifacts",
  "research.searchEvidence",
  "research.listSchedules",
  "research.getEmbeddingStatus",
  "research.getGraph",
  "research.listCitationClosure"
]);
const WRITE_TOOL_KEYS = new Set([
  "research.proposeSource",
  "research.approveSource",
  "research.rejectSource",
  "research.updateSource",
  "research.startRun",
  "research.cancelRun",
  "research.retryRun",
  "research.executeRun",
  "research.reviewArtifact",
  "research.createSchedule",
  "research.pauseSchedule",
  "research.resumeSchedule",
  "research.runDueSchedules",
  "research.chooseEmbeddingRoute",
  "research.reindexEmbeddings",
  "research.buildGraph",
  "research.evaluateCitationClosure"
]);

export class OperatorAssistantError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "OperatorAssistantError";
    this.statusCode = statusCode;
  }
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function safePreview(value, max = 220) {
  return maskDirectIdentifiers(String(value ?? ""), {})
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "[redacted-phone]")
    .replace(/\b\d{9,}\b/g, "[redacted-number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeProposal(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorUserId: row.actor_user_id ?? null,
    toolKey: row.tool_key,
    toolType: row.tool_type,
    riskLevel: row.risk_level,
    status: row.status,
    requestMessageHash: row.request_message_hash,
    requestMessagePreview: row.request_message_preview ?? "",
    args: parseJson(row.args_json, {}),
    argsHash: row.args_hash,
    expectedEffect: row.expected_effect,
    approvalRequired: row.approval_required,
    result: parseJson(row.result_json, {}),
    errorMessage: row.error_message ?? null,
    approvedBy: row.approved_by ?? null,
    rejectedBy: row.rejected_by ?? null,
    decidedAt: row.decided_at ?? null,
    executedAt: row.executed_at ?? null,
    executionCount: Number(row.execution_count ?? 0),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listOperatorTools() {
  return {
    ok: true,
    version: OPERATOR_ASSISTANT_VERSION,
    tools: [
      {
        key: "research.getKpis",
        type: "read",
        title: "Read Research KPIs",
        riskLevel: "low",
        approvalRequired: false,
        schema: { type: "object", additionalProperties: false, properties: {} }
      },
      {
        key: "research.getWorkerStatus",
        type: "read",
        title: "Read Research Worker Status",
        riskLevel: "low",
        approvalRequired: false,
        schema: { type: "object", additionalProperties: false, properties: {} }
      },
      {
        key: "research.listSources",
        type: "read",
        title: "List Research Sources",
        riskLevel: "low",
        approvalRequired: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { status: { type: ["string", "null"] }, limit: { type: "integer" } }
        }
      },
      {
        key: "research.listRuns",
        type: "read",
        title: "List Research Runs",
        riskLevel: "low",
        approvalRequired: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { status: { type: ["string", "null"] }, limit: { type: "integer" } }
        }
      },
      {
        key: "research.getRun",
        type: "read",
        title: "Open Research Run",
        riskLevel: "low",
        approvalRequired: false,
        schema: { type: "object", required: ["runId"], additionalProperties: false, properties: { runId: { type: "string" } } }
      },
      {
        key: "research.listArtifacts",
        type: "read",
        title: "List Research Artifacts",
        riskLevel: "low",
        approvalRequired: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            citationStatus: { type: ["string", "null"] },
            runId: { type: ["string", "null"] },
            sourceId: { type: ["string", "null"] },
            limit: { type: "integer" }
          }
        }
      },
      {
        key: "research.searchEvidence",
        type: "read",
        title: "Search Trusted Evidence",
        riskLevel: "low",
        approvalRequired: false,
        schema: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: {
            query: { type: "string" },
            includePending: { type: "boolean" },
            limit: { type: "integer" }
          }
        }
      },
      {
        key: "research.getEmbeddingStatus",
        type: "read",
        title: "Read Embedding Route Status",
        riskLevel: "low",
        approvalRequired: false,
        schema: { type: "object", additionalProperties: false, properties: {} }
      },
      {
        key: "research.getGraph",
        type: "read",
        title: "Read Research Evidence Graph",
        riskLevel: "low",
        approvalRequired: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { limit: { type: "integer" } }
        }
      },
      {
        key: "research.listCitationClosure",
        type: "read",
        title: "List Claim Citation Closure Evaluations",
        riskLevel: "low",
        approvalRequired: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            status: { type: ["string", "null"] },
            verdict: { type: ["string", "null"] },
            limit: { type: "integer" }
          }
        }
      },
      {
        key: "research.listSchedules",
        type: "read",
        title: "List Research Schedules",
        riskLevel: "low",
        approvalRequired: false,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { status: { type: ["string", "null"] }, limit: { type: "integer" } }
        }
      },
      {
        key: "research.proposeSource",
        type: "write",
        title: "Propose Research Source",
        riskLevel: "medium",
        approvalRequired: true,
        schema: {
          type: "object",
          required: ["url"],
          additionalProperties: false,
          properties: {
            url: { type: "string" },
            title: { type: ["string", "null"] },
            workflowKeys: { type: "array", items: { type: "string" } },
            reason: { type: "string" },
            priority: { type: "integer" }
          }
        }
      },
      {
        key: "research.approveSource",
        type: "write",
        title: "Approve Research Source",
        riskLevel: "medium",
        approvalRequired: true,
        schema: { type: "object", required: ["sourceId"], additionalProperties: false, properties: { sourceId: { type: "string" }, reason: { type: "string" } } }
      },
      {
        key: "research.rejectSource",
        type: "write",
        title: "Reject Research Source",
        riskLevel: "medium",
        approvalRequired: true,
        schema: { type: "object", required: ["sourceId"], additionalProperties: false, properties: { sourceId: { type: "string" }, reason: { type: "string" } } }
      },
      {
        key: "research.updateSource",
        type: "write",
        title: "Update Research Source",
        riskLevel: "medium",
        approvalRequired: true,
        schema: { type: "object", required: ["sourceId", "patch"], additionalProperties: false, properties: { sourceId: { type: "string" }, patch: { type: "object" } } }
      },
      {
        key: "research.startRun",
        type: "write",
        title: "Start Manual Research Run",
        riskLevel: "medium",
        approvalRequired: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            sourceId: { type: ["string", "null"] },
            sourceKey: { type: ["string", "null"] },
            topic: { type: "string" },
            workflowKey: { type: "string" },
            query: { type: "object" }
          }
        }
      },
      {
        key: "research.cancelRun",
        type: "write",
        title: "Cancel Research Run",
        riskLevel: "medium",
        approvalRequired: true,
        schema: { type: "object", required: ["runId"], additionalProperties: false, properties: { runId: { type: "string" }, reason: { type: "string" } } }
      },
      {
        key: "research.retryRun",
        type: "write",
        title: "Retry Research Run",
        riskLevel: "medium",
        approvalRequired: true,
        schema: { type: "object", required: ["runId"], additionalProperties: false, properties: { runId: { type: "string" }, reason: { type: "string" } } }
      },
      {
        key: "research.executeRun",
        type: "write",
        title: "Execute Research Run",
        riskLevel: "high",
        approvalRequired: true,
        schema: {
          type: "object",
          required: ["runId"],
          additionalProperties: false,
          properties: {
            runId: { type: "string" },
            workerMode: { type: "string" },
            approvedWorkerDispatch: { type: "boolean" }
          }
        }
      },
      {
        key: "research.reviewArtifact",
        type: "write",
        title: "Review Research Artifact",
        riskLevel: "medium",
        approvalRequired: true,
        schema: {
          type: "object",
          required: ["artifactId", "decision"],
          additionalProperties: false,
          properties: {
            artifactId: { type: "string" },
            decision: { enum: ["approve", "quarantine", "reject", "needs_review"] },
            reason: { type: "string" }
          }
        }
      },
      {
        key: "research.createSchedule",
        type: "write",
        title: "Create Research Schedule",
        riskLevel: "medium",
        approvalRequired: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            sourceId: { type: ["string", "null"] },
            sourceKey: { type: ["string", "null"] },
            scheduleLabel: { type: ["string", "null"] },
            intervalHours: { type: "integer" },
            nextRunAt: { type: ["string", "null"] },
            topic: { type: "string" },
            workflowKey: { type: "string" },
            query: { type: "object" },
            workerMode: { type: "string" }
          }
        }
      },
      {
        key: "research.pauseSchedule",
        type: "write",
        title: "Pause Research Schedule",
        riskLevel: "medium",
        approvalRequired: true,
        schema: { type: "object", required: ["scheduleId"], additionalProperties: false, properties: { scheduleId: { type: "string" }, reason: { type: "string" } } }
      },
      {
        key: "research.resumeSchedule",
        type: "write",
        title: "Resume Research Schedule",
        riskLevel: "medium",
        approvalRequired: true,
        schema: { type: "object", required: ["scheduleId"], additionalProperties: false, properties: { scheduleId: { type: "string" }, reason: { type: "string" }, nextRunAt: { type: ["string", "null"] } } }
      },
      {
        key: "research.runDueSchedules",
        type: "write",
        title: "Run Due Research Schedules",
        riskLevel: "high",
        approvalRequired: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            now: { type: ["string", "null"] },
            limit: { type: "integer" },
            execute: { type: "boolean" },
            workerMode: { type: ["string", "null"] },
            approvedWorkerDispatch: { type: "boolean" }
          }
        }
      },
      {
        key: "research.chooseEmbeddingRoute",
        type: "write",
        title: "Choose Embedding Route",
        riskLevel: "medium",
        approvalRequired: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            provider: { enum: ["local_tfidf", "openai"] },
            model: { type: ["string", "null"] },
            dimensions: { type: ["integer", "null"] },
            status: { enum: ["active", "disabled"] },
            reason: { type: "string" }
          }
        }
      },
      {
        key: "research.reindexEmbeddings",
        type: "write",
        title: "Reindex Trusted Evidence Embeddings",
        riskLevel: "medium",
        approvalRequired: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            routeKey: { type: "string" },
            artifactIds: { type: ["array", "null"], items: { type: "string" } },
            force: { type: "boolean" }
          }
        }
      },
      {
        key: "research.buildGraph",
        type: "write",
        title: "Build Research Evidence Graph",
        riskLevel: "medium",
        approvalRequired: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { limit: { type: "integer" } }
        }
      },
      {
        key: "research.evaluateCitationClosure",
        type: "write",
        title: "Evaluate Claim Citation Closure",
        riskLevel: "medium",
        approvalRequired: true,
        schema: {
          type: "object",
          required: ["answer"],
          additionalProperties: false,
          properties: {
            question: { type: "string" },
            answer: { type: "string" },
            limit: { type: "integer" },
            minSupportScore: { type: "number" }
          }
        }
      }
    ]
  };
}

function toolByKey(toolKey) {
  const tool = listOperatorTools().tools.find((item) => item.key === toolKey);
  if (!tool) throw new OperatorAssistantError(`Operator tool is not registered: ${toolKey}`, 400);
  return tool;
}

function validateToolArgs(toolKey, args = {}) {
  toolByKey(toolKey);
  if (toolKey === "research.searchEvidence" && !String(args.query ?? "").trim()) {
    throw new OperatorAssistantError("Evidence search requires a query.", 400);
  }
  if (toolKey === "research.getRun" && !args.runId) {
    throw new OperatorAssistantError("Opening a research run requires runId.", 400);
  }
  if (toolKey === "research.proposeSource" && !args.url) {
    throw new OperatorAssistantError("Source proposal requires url.", 400);
  }
  if (["research.approveSource", "research.rejectSource", "research.updateSource"].includes(toolKey) && !args.sourceId) {
    throw new OperatorAssistantError("Source write action requires sourceId.", 400);
  }
  if (["research.cancelRun", "research.retryRun", "research.executeRun"].includes(toolKey) && !args.runId) {
    throw new OperatorAssistantError("Research run write action requires runId.", 400);
  }
  if (toolKey === "research.reviewArtifact" && (!args.artifactId || !args.decision)) {
    throw new OperatorAssistantError("Artifact review requires artifactId and decision.", 400);
  }
  if (["research.pauseSchedule", "research.resumeSchedule"].includes(toolKey) && !args.scheduleId) {
    throw new OperatorAssistantError("Schedule write action requires scheduleId.", 400);
  }
  if (toolKey === "research.chooseEmbeddingRoute" && args.provider && !["local_tfidf", "openai"].includes(args.provider)) {
    throw new OperatorAssistantError("Embedding route provider must be local_tfidf or openai.", 400);
  }
  if (toolKey === "research.evaluateCitationClosure" && !String(args.answer ?? "").trim()) {
    throw new OperatorAssistantError("Citation closure evaluation requires an answer.", 400);
  }
}

function firstUrl(message) {
  return String(message ?? "").match(/https?:\/\/[^\s"')<>]+/i)?.[0] ?? null;
}

function firstId(message, prefix) {
  const pattern = new RegExp(`${prefix}_[a-z0-9-]+`, "i");
  return String(message ?? "").match(pattern)?.[0] ?? null;
}

function intervalHoursFromText(message, fallback = 24) {
  const text = String(message ?? "").toLowerCase();
  if (/\bnightly\b|\bdaily\b|\bevery day\b/.test(text)) return 24;
  if (/\bweekly\b|\bevery week\b/.test(text)) return 24 * 7;
  const hours = text.match(/\bevery\s+(\d{1,3})\s*(h|hr|hrs|hour|hours)\b/)?.[1];
  if (hours) return Number(hours);
  const days = text.match(/\bevery\s+(\d{1,2})\s*(d|day|days)\b/)?.[1];
  if (days) return Number(days) * 24;
  return fallback;
}

function quotedOrAfter(message, labels) {
  const text = String(message ?? "");
  const quoted = text.match(/"([^"]{2,240})"/)?.[1] ?? text.match(/'([^']{2,240})'/)?.[1];
  if (quoted) return quoted;
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s+(.+)$`, "i");
    const match = text.match(pattern)?.[1];
    if (match) return match.replace(firstUrl(match) ?? "", "").trim().replace(/[.]+$/, "").slice(0, 240);
  }
  return "";
}

function classifyOperatorMessage(message, explicit = {}) {
  const text = String(message ?? "").trim();
  const lower = text.toLowerCase();
  if (explicit.toolKey) {
    return { toolKey: explicit.toolKey, args: explicit.args ?? {}, reason: "explicit_tool_key" };
  }
  if (/\b(kpi|counts?|metrics?|dashboard summary)\b/.test(lower)) {
    return { toolKey: "research.getKpis", args: {}, reason: "read_kpis" };
  }
  if (/\b(worker status|worker mode|mockworker|openclaw status|hermes status)\b/.test(lower)) {
    return { toolKey: "research.getWorkerStatus", args: {}, reason: "read_worker_status" };
  }
  if (/\b(search|find|retrieve|look up)\b/.test(lower) && /\b(evidence|citation|artifact|research)\b/.test(lower)) {
    return {
      toolKey: "research.searchEvidence",
      args: {
        query: explicit.query ?? (quotedOrAfter(text, ["for", "about", "query", "search", "find"]) || text),
        includePending: Boolean(explicit.includePending),
        limit: explicit.limit ?? 5
      },
      reason: "read_evidence_search"
    };
  }
  if (/\b(embedding|embeddings|vector|index|reindex)\b/.test(lower) && /\b(status|state|show|load|read)\b/.test(lower)) {
    return { toolKey: "research.getEmbeddingStatus", args: {}, reason: "read_embedding_status" };
  }
  if (/\b(graph|nodes?|edges?|relationships?|knowledge graph|evidence graph)\b/.test(lower) && /\b(status|state|show|load|read|view)\b/.test(lower)) {
    return { toolKey: "research.getGraph", args: { limit: explicit.limit ?? 250 }, reason: "read_research_graph" };
  }
  if (/\b(citation closure|claim closure|groundedness|quality judge|claim judge)\b/.test(lower) && /\b(list|show|load|read|view|latest|status)\b/.test(lower)) {
    return {
      toolKey: "research.listCitationClosure",
      args: { status: explicit.status ?? null, verdict: explicit.verdict ?? null, limit: explicit.limit ?? 25 },
      reason: "read_citation_closure"
    };
  }
  if (/\b(list|show|load)\b/.test(lower) && /\bsources?\b/.test(lower)) {
    return { toolKey: "research.listSources", args: { status: explicit.status ?? null, limit: explicit.limit ?? 25 }, reason: "read_sources" };
  }
  if (/\b(list|show|load)\b/.test(lower) && /\bruns?\b/.test(lower)) {
    return { toolKey: "research.listRuns", args: { status: explicit.status ?? null, limit: explicit.limit ?? 25 }, reason: "read_runs" };
  }
  if (/\b(list|show|load)\b/.test(lower) && /\bschedules?\b/.test(lower)) {
    return { toolKey: "research.listSchedules", args: { status: explicit.status ?? null, limit: explicit.limit ?? 25 }, reason: "read_schedules" };
  }
  if (/\b(open|show|load)\b/.test(lower) && /\brun\b/.test(lower)) {
    return { toolKey: "research.getRun", args: { runId: explicit.runId ?? firstId(text, "research_run") }, reason: "read_run_detail" };
  }
  if (/\b(list|show|load|review)\b/.test(lower) && /\bartifacts?\b/.test(lower)) {
    return { toolKey: "research.listArtifacts", args: { citationStatus: explicit.citationStatus ?? null, limit: explicit.limit ?? 25 }, reason: "read_artifacts" };
  }
  if (/\b(propose|add|register)\b/.test(lower) && /\b(source|url)\b/.test(lower)) {
    return {
      toolKey: "research.proposeSource",
      args: {
        url: explicit.url ?? firstUrl(text),
        title: explicit.title ?? (quotedOrAfter(text, ["titled", "title", "named"]) || null),
        workflowKeys: explicit.workflowKeys ?? ["general_rag"],
        reason: explicit.reason ?? safePreview(text),
        priority: explicit.priority ?? 500
      },
      reason: "write_propose_source"
    };
  }
  if (/\bapprove\b/.test(lower) && /\bsource\b/.test(lower)) {
    return {
      toolKey: "research.approveSource",
      args: { sourceId: explicit.sourceId ?? firstId(text, "ksrc"), reason: explicit.reason ?? safePreview(text) },
      reason: "write_approve_source"
    };
  }
  if (/\b(reject|disable)\b/.test(lower) && /\bsource\b/.test(lower)) {
    return {
      toolKey: "research.rejectSource",
      args: { sourceId: explicit.sourceId ?? firstId(text, "ksrc"), reason: explicit.reason ?? safePreview(text) },
      reason: "write_reject_source"
    };
  }
  if (/\b(start|queue|create)\b/.test(lower) && /\brun\b/.test(lower)) {
    return {
      toolKey: "research.startRun",
      args: {
        sourceId: explicit.sourceId ?? firstId(text, "ksrc"),
        sourceKey: explicit.sourceKey ?? null,
        topic: explicit.topic ?? (quotedOrAfter(text, ["topic", "about", "for"]) || safePreview(text)),
        workflowKey: explicit.workflowKey ?? "general_rag",
        query: explicit.query ?? { requestedByOperatorAssistant: true }
      },
      reason: "write_start_run"
    };
  }
  if (/\b(schedule|nightly|daily|weekly|automation)\b/.test(lower) && /\b(create|add|start|enable|refresh|run)\b/.test(lower)) {
    return {
      toolKey: "research.createSchedule",
      args: {
        sourceId: explicit.sourceId ?? firstId(text, "ksrc"),
        sourceKey: explicit.sourceKey ?? null,
        scheduleLabel: explicit.scheduleLabel ?? (quotedOrAfter(text, ["label", "called", "named"]) || null),
        intervalHours: explicit.intervalHours ?? intervalHoursFromText(text, 24),
        nextRunAt: explicit.nextRunAt ?? null,
        topic: explicit.topic ?? (quotedOrAfter(text, ["topic", "about", "for"]) || safePreview(text)),
        workflowKey: explicit.workflowKey ?? "general_rag",
        query: explicit.query ?? { requestedByOperatorAssistant: true, scheduledResearch: true },
        workerMode: explicit.workerMode ?? "deterministic_fetch"
      },
      reason: "write_create_schedule"
    };
  }
  if (/\bpause\b/.test(lower) && /\bschedule\b/.test(lower)) {
    return {
      toolKey: "research.pauseSchedule",
      args: { scheduleId: explicit.scheduleId ?? firstId(text, "research_schedule"), reason: explicit.reason ?? safePreview(text) },
      reason: "write_pause_schedule"
    };
  }
  if (/\b(resume|enable)\b/.test(lower) && /\bschedule\b/.test(lower)) {
    return {
      toolKey: "research.resumeSchedule",
      args: { scheduleId: explicit.scheduleId ?? firstId(text, "research_schedule"), reason: explicit.reason ?? safePreview(text), nextRunAt: explicit.nextRunAt ?? null },
      reason: "write_resume_schedule"
    };
  }
  if (/\b(run|trigger|tick)\b/.test(lower) && /\bdue\b/.test(lower) && /\bschedules?\b/.test(lower)) {
    return {
      toolKey: "research.runDueSchedules",
      args: {
        now: explicit.now ?? null,
        limit: explicit.limit ?? 5,
        execute: Boolean(explicit.execute),
        workerMode: explicit.workerMode ?? null,
        approvedWorkerDispatch: Boolean(explicit.approvedWorkerDispatch)
      },
      reason: "write_run_due_schedules"
    };
  }
  if (/\b(choose|select|set|switch)\b/.test(lower) && /\b(embedding|embeddings|vector)\b/.test(lower)) {
    const provider = explicit.provider ?? (/\bopenai\b/.test(lower) ? "openai" : "local_tfidf");
    return {
      toolKey: "research.chooseEmbeddingRoute",
      args: {
        provider,
        model: explicit.model ?? null,
        dimensions: explicit.dimensions ?? null,
        status: explicit.status ?? "active",
        reason: explicit.reason ?? safePreview(text)
      },
      reason: "write_choose_embedding_route"
    };
  }
  if (/\b(reindex|index|refresh)\b/.test(lower) && /\b(embedding|embeddings|vector|trusted evidence)\b/.test(lower)) {
    return {
      toolKey: "research.reindexEmbeddings",
      args: {
        routeKey: explicit.routeKey ?? "default",
        artifactIds: explicit.artifactIds ?? null,
        force: Boolean(explicit.force)
      },
      reason: "write_reindex_embeddings"
    };
  }
  if (/\b(build|rebuild|create|refresh)\b/.test(lower) && /\b(graph|nodes?|edges?|knowledge graph|evidence graph)\b/.test(lower)) {
    return {
      toolKey: "research.buildGraph",
      args: { limit: explicit.limit ?? 250 },
      reason: "write_build_research_graph"
    };
  }
  if (/\b(evaluate|judge|check|close|score)\b/.test(lower) && /\b(citation|citations|claim|claims|grounded|groundedness|quality)\b/.test(lower)) {
    return {
      toolKey: "research.evaluateCitationClosure",
      args: {
        question: explicit.question ?? quotedOrAfter(text, ["question", "for"]) ?? "",
        answer: explicit.answer ?? quotedOrAfter(text, ["answer"]) ?? "",
        limit: explicit.limit ?? 12,
        minSupportScore: explicit.minSupportScore ?? 3
      },
      reason: "write_evaluate_citation_closure"
    };
  }
  if (/\bcancel\b/.test(lower) && /\brun\b/.test(lower)) {
    return {
      toolKey: "research.cancelRun",
      args: { runId: explicit.runId ?? firstId(text, "research_run"), reason: explicit.reason ?? safePreview(text) },
      reason: "write_cancel_run"
    };
  }
  if (/\bretry\b/.test(lower) && /\brun\b/.test(lower)) {
    return {
      toolKey: "research.retryRun",
      args: { runId: explicit.runId ?? firstId(text, "research_run"), reason: explicit.reason ?? safePreview(text) },
      reason: "write_retry_run"
    };
  }
  if (/\b(execute|fetch)\b/.test(lower) && /\brun\b/.test(lower)) {
    const inferredWorkerMode = explicit.workerMode ?? (/\bopenclaw\b/.test(lower) ? "openclaw" : /\bhermes\b/.test(lower) ? "hermes" : "deterministic_fetch");
    return {
      toolKey: "research.executeRun",
      args: {
        runId: explicit.runId ?? firstId(text, "research_run"),
        workerMode: inferredWorkerMode,
        approvedWorkerDispatch: Boolean(explicit.approvedWorkerDispatch || /\bapprove|approved|dispatch\b/.test(lower))
      },
      reason: "write_execute_run"
    };
  }
  if (/\b(approve|quarantine|reject|review)\b/.test(lower) && /\bartifact\b/.test(lower)) {
    const decision = explicit.decision ?? (lower.includes("quarantine") ? "quarantine" : lower.includes("reject") ? "reject" : lower.includes("needs review") ? "needs_review" : "approve");
    return {
      toolKey: "research.reviewArtifact",
      args: { artifactId: explicit.artifactId ?? firstId(text, "research_artifact"), decision, reason: explicit.reason ?? safePreview(text) },
      reason: "write_review_artifact"
    };
  }
  return { toolKey: null, args: {}, reason: "unsupported" };
}

function expectedEffect(toolKey, args) {
  switch (toolKey) {
    case "research.proposeSource":
      return `Create one pending research source for ${args.url}.`;
    case "research.approveSource":
      return `Approve research source ${args.sourceId}.`;
    case "research.rejectSource":
      return `Reject research source ${args.sourceId}.`;
    case "research.updateSource":
      return `Update research source ${args.sourceId}.`;
    case "research.startRun":
      return `Queue one manual research run for ${args.sourceId ?? args.sourceKey ?? "the approved source"}.`;
    case "research.cancelRun":
      return `Cancel research run ${args.runId}.`;
    case "research.retryRun":
      return `Create one retry for research run ${args.runId}.`;
    case "research.executeRun":
      return `Execute research run ${args.runId} with ${args.workerMode ?? "deterministic_fetch"}${args.approvedWorkerDispatch ? " after explicit worker-dispatch approval" : ""}.`;
    case "research.reviewArtifact":
      return `Apply artifact review decision ${args.decision} to ${args.artifactId}.`;
    case "research.createSchedule":
      return `Create one approved research schedule for ${args.sourceId ?? args.sourceKey ?? "the highest-priority approved source"} every ${args.intervalHours ?? 24} hours.`;
    case "research.pauseSchedule":
      return `Pause research schedule ${args.scheduleId}.`;
    case "research.resumeSchedule":
      return `Resume research schedule ${args.scheduleId}.`;
    case "research.runDueSchedules":
      return `Run due approved research schedules with limit ${args.limit ?? 5}${args.execute ? " and execute queued runs" : ""}${args.approvedWorkerDispatch ? " with explicit adaptive-worker dispatch approval" : ""}.`;
    case "research.chooseEmbeddingRoute":
      return `Set the trusted-evidence embedding route to ${args.provider ?? "local_tfidf"}${args.model ? `/${args.model}` : ""}.`;
    case "research.reindexEmbeddings":
      return `Reindex trusted reviewed evidence for route ${args.routeKey ?? "default"} without indexing pending or mock artifacts.`;
    case "research.buildGraph":
      return `Build a metadata-only research evidence graph with up to ${args.limit ?? 250} records per source table.`;
    case "research.evaluateCitationClosure":
      return "Evaluate one answer for claim-level citation closure against trusted reviewed evidence; write labels and scores only.";
    default:
      return "No write effect.";
  }
}

async function executeReadTool(store, toolKey, args) {
  validateToolArgs(toolKey, args);
  switch (toolKey) {
    case "research.getKpis":
      return getResearchKpis(store);
    case "research.getWorkerStatus":
      return getResearchWorkerStatus();
    case "research.listSources":
      return listResearchSources(store, { status: args.status ?? null, limit: args.limit ?? 25 });
    case "research.listRuns":
      return listResearchRuns(store, { status: args.status ?? null, limit: args.limit ?? 25 });
    case "research.getRun":
      return getResearchRun(store, { runId: args.runId });
    case "research.listArtifacts":
      return listResearchArtifacts(store, {
        citationStatus: args.citationStatus ?? null,
        runId: args.runId ?? null,
        sourceId: args.sourceId ?? null,
        limit: args.limit ?? 25
      });
    case "research.listSchedules":
      return listResearchSchedules(store, { status: args.status ?? null, limit: args.limit ?? 25 });
    case "research.getEmbeddingStatus":
      return getResearchEmbeddingStatus(store);
    case "research.getGraph":
      return getResearchGraph(store, { limit: args.limit ?? 250 });
    case "research.listCitationClosure":
      return listCitationClosureEvaluations(store, {
        status: args.status ?? null,
        verdict: args.verdict ?? null,
        limit: args.limit ?? 25
      });
    case "research.searchEvidence":
      return searchResearchEvidence(store, {
        query: args.query,
        includePending: Boolean(args.includePending),
        limit: args.limit ?? 5
      });
    default:
      throw new OperatorAssistantError(`Operator tool is not read-only: ${toolKey}`, 400);
  }
}

async function executeWriteTool(store, toolKey, args, actorUserId) {
  validateToolArgs(toolKey, args);
  switch (toolKey) {
    case "research.proposeSource":
      return proposeResearchSource(store, {
        actorUserId,
        url: args.url,
        title: args.title ?? null,
        sourceType: args.sourceType ?? "web_source",
        authorityLevel: args.authorityLevel ?? "operator_proposed",
        workflowKeys: args.workflowKeys ?? [],
        reason: args.reason ?? "",
        priority: args.priority ?? 500
      });
    case "research.approveSource":
      return reviewResearchSource(store, { sourceId: args.sourceId, actorUserId, decision: "approved", reason: args.reason ?? "" });
    case "research.rejectSource":
      return reviewResearchSource(store, { sourceId: args.sourceId, actorUserId, decision: "rejected", reason: args.reason ?? "" });
    case "research.updateSource":
      return updateResearchSource(store, { sourceId: args.sourceId, actorUserId, patch: args.patch ?? {} });
    case "research.startRun":
      return startManualResearchRun(store, {
        actorUserId,
        sourceId: args.sourceId ?? null,
        sourceKey: args.sourceKey ?? null,
        topic: args.topic ?? "",
        query: args.query ?? {},
        workflowKey: args.workflowKey ?? "general_rag",
        metadata: { ...(args.metadata ?? {}), proposedByOperatorAssistant: true }
      });
    case "research.cancelRun":
      return cancelResearchRun(store, { runId: args.runId, actorUserId, reason: args.reason ?? "" });
    case "research.retryRun":
      return retryResearchRun(store, { runId: args.runId, actorUserId, reason: args.reason ?? "" });
    case "research.executeRun":
      return executeResearchRun(store, {
        runId: args.runId,
        actorUserId,
        workerMode: args.workerMode ?? null,
        approvedWorkerDispatch: Boolean(args.approvedWorkerDispatch)
      });
    case "research.reviewArtifact":
      return reviewResearchArtifact(store, { artifactId: args.artifactId, actorUserId, decision: args.decision, reason: args.reason ?? "" });
    case "research.createSchedule":
      return createResearchSchedule(store, {
        actorUserId,
        sourceId: args.sourceId ?? null,
        sourceKey: args.sourceKey ?? null,
        scheduleKey: args.scheduleKey ?? null,
        scheduleLabel: args.scheduleLabel ?? null,
        intervalHours: args.intervalHours ?? 24,
        nextRunAt: args.nextRunAt ?? null,
        topic: args.topic ?? "",
        workflowKey: args.workflowKey ?? "general_rag",
        query: args.query ?? {},
        workerMode: args.workerMode ?? "deterministic_fetch",
        metadata: { ...(args.metadata ?? {}), proposedByOperatorAssistant: true }
      });
    case "research.pauseSchedule":
      return pauseResearchSchedule(store, { scheduleId: args.scheduleId, actorUserId, reason: args.reason ?? "" });
    case "research.resumeSchedule":
      return resumeResearchSchedule(store, { scheduleId: args.scheduleId, actorUserId, reason: args.reason ?? "", nextRunAt: args.nextRunAt ?? null });
    case "research.runDueSchedules":
      return runDueResearchSchedules(store, {
        actorUserId,
        now: args.now ?? undefined,
        limit: args.limit ?? 5,
        execute: Boolean(args.execute),
        workerMode: args.workerMode ?? null,
        approvedWorkerDispatch: Boolean(args.approvedWorkerDispatch)
      });
    case "research.chooseEmbeddingRoute":
      return chooseResearchEmbeddingRoute(store, {
        actorUserId,
        provider: args.provider ?? null,
        model: args.model ?? null,
        dimensions: args.dimensions ?? null,
        status: args.status ?? "active",
        reason: args.reason ?? ""
      });
    case "research.reindexEmbeddings":
      return reindexResearchEmbeddings(store, {
        actorUserId,
        routeKey: args.routeKey ?? "default",
        artifactIds: Array.isArray(args.artifactIds) ? args.artifactIds : null,
        force: Boolean(args.force)
      });
    case "research.buildGraph":
      return buildResearchGraph(store, {
        actorUserId,
        limit: args.limit ?? 250
      });
    case "research.evaluateCitationClosure":
      return evaluateCitationClosure(store, {
        actorUserId,
        question: args.question ?? "",
        answer: args.answer ?? "",
        limit: args.limit ?? 12,
        minSupportScore: args.minSupportScore ?? 3
      });
    default:
      throw new OperatorAssistantError(`Operator tool is not a write tool: ${toolKey}`, 400);
  }
}

export async function listOperatorProposals(store, { status = null, actorUserId = null, limit = 50 } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    if (!PROPOSAL_STATUSES.has(status)) throw new OperatorAssistantError("Unsupported proposal status.", 400);
    conditions.push("status = ?");
    params.push(status);
  }
  if (actorUserId) {
    conditions.push("actor_user_id = ?");
    params.push(actorUserId);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const bounded = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await store.all(`SELECT * FROM operator_tool_proposals${where} ORDER BY created_at DESC LIMIT ${bounded};`, params);
  return {
    ok: true,
    version: OPERATOR_ASSISTANT_VERSION,
    filters: { status, actorUserId, limit: bounded },
    proposals: rows.map(normalizeProposal)
  };
}

async function getProposal(store, proposalId) {
  const row = await store.findOne("operator_tool_proposals", { id: proposalId });
  if (!row) throw new OperatorAssistantError("Operator proposal not found.", 404);
  return row;
}

async function createOperatorProposal(store, { actorUserId = null, message = "", toolKey, args = {}, parseReason = "explicit" }) {
  const tool = toolByKey(toolKey);
  if (!WRITE_TOOL_KEYS.has(toolKey)) throw new OperatorAssistantError("Only write tools can create proposals.", 400);
  validateToolArgs(toolKey, args);
  const time = nowIso();
  const argsText = json(args);
  const row = {
    id: createId("operator_proposal"),
    actor_user_id: actorUserId,
    tool_key: toolKey,
    tool_type: tool.type,
    risk_level: tool.riskLevel,
    status: "pending_approval",
    request_message_hash: sha256(message),
    request_message_preview: safePreview(message),
    args_json: argsText,
    args_hash: sha256(argsText),
    expected_effect: expectedEffect(toolKey, args),
    approval_required: "operator_or_admin",
    result_json: "{}",
    error_message: null,
    approved_by: null,
    rejected_by: null,
    decided_at: null,
    executed_at: null,
    execution_count: 0,
    metadata_json: json({ version: OPERATOR_ASSISTANT_VERSION, parseReason }),
    created_at: time,
    updated_at: time
  };
  await store.insert("operator_tool_proposals", row);
  const auditEvent = await audit(store, null, "operator_tool_proposal_created", {
    proposalId: row.id,
    actorUserId,
    toolKey,
    riskLevel: tool.riskLevel,
    requestMessageHash: row.request_message_hash,
    argsHash: row.args_hash,
    expectedEffect: row.expected_effect,
    status: row.status
  });
  return {
    ok: true,
    version: OPERATOR_ASSISTANT_VERSION,
    status: "proposal_pending_approval",
    mode: "proposal_only",
    proposal: normalizeProposal(row),
    tool,
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
    actionsTaken: []
  };
}

export async function runOperatorAssistant(store, { actorUserId = null, message = "", toolKey = null, args = {}, context = {} } = {}) {
  const classification = classifyOperatorMessage(message, { toolKey, args, ...context });
  if (!classification.toolKey) {
    const auditEvent = await audit(store, null, "operator_assistant_request_refused", {
      actorUserId,
      requestMessageHash: sha256(message),
      requestMessageLength: String(message ?? "").length,
      reason: classification.reason
    });
    return {
      ok: false,
      version: OPERATOR_ASSISTANT_VERSION,
      status: "unsupported_operator_request",
      mode: "refused",
      message: "I can only use registered operator tools. Try asking to search evidence, show research KPIs, list sources/runs/artifacts, or propose a specific research write action.",
      toolCall: null,
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
      actionsTaken: []
    };
  }
  const tool = toolByKey(classification.toolKey);
  if (READ_TOOL_KEYS.has(classification.toolKey)) {
    const toolResult = await executeReadTool(store, classification.toolKey, classification.args);
    const auditEvent = await audit(store, null, "operator_assistant_read_tool_invoked", {
      actorUserId,
      toolKey: classification.toolKey,
      requestMessageHash: sha256(message),
      argsHash: sha256(json(classification.args)),
      resultStatus: toolResult.status ?? "ok"
    });
    return {
      ok: true,
      version: OPERATOR_ASSISTANT_VERSION,
      status: "read_tool_completed",
      mode: "read_only",
      message: `${tool.title} completed with registry-bound tool ${tool.key}.`,
      toolCall: { toolKey: tool.key, args: classification.args, riskLevel: tool.riskLevel, approvalRequired: false },
      toolResult,
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
      actionsTaken: [tool.key]
    };
  }
  return createOperatorProposal(store, {
    actorUserId,
    message,
    toolKey: classification.toolKey,
    args: classification.args,
    parseReason: classification.reason
  });
}

export async function decideOperatorProposal(store, { proposalId, actorUserId = null, decision, reason = "" }) {
  if (!["approve", "reject"].includes(decision)) {
    throw new OperatorAssistantError("Proposal decision must be approve or reject.", 400);
  }
  const row = await getProposal(store, proposalId);
  const proposal = normalizeProposal(row);
  if (proposal.status !== "pending_approval" || proposal.executionCount > 0) {
    throw new OperatorAssistantError(`Operator proposal cannot be decided from status ${proposal.status}.`, 409);
  }
  const time = nowIso();
  if (decision === "reject") {
    await store.update(
      "operator_tool_proposals",
      {
        status: "rejected",
        rejected_by: actorUserId,
        decided_at: time,
        metadata_json: json({ ...proposal.metadata, rejectionReason: safePreview(reason), version: OPERATOR_ASSISTANT_VERSION }),
        updated_at: time
      },
      { id: proposalId }
    );
    const auditEvent = await audit(store, null, "operator_tool_proposal_rejected", {
      proposalId,
      actorUserId,
      toolKey: proposal.toolKey,
      reasonHash: reason ? sha256(safePreview(reason)) : null,
      argsHash: proposal.argsHash,
      actionsTaken: []
    });
    return {
      ok: true,
      version: OPERATOR_ASSISTANT_VERSION,
      status: "proposal_rejected",
      proposal: normalizeProposal(await getProposal(store, proposalId)),
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
      actionsTaken: []
    };
  }

  await store.update(
    "operator_tool_proposals",
    {
      status: "approved",
      approved_by: actorUserId,
      decided_at: time,
      metadata_json: json({ ...proposal.metadata, approvalReason: safePreview(reason), version: OPERATOR_ASSISTANT_VERSION }),
      updated_at: time
    },
    { id: proposalId }
  );
  const approvalAudit = await audit(store, null, "operator_tool_proposal_approved", {
    proposalId,
    actorUserId,
    toolKey: proposal.toolKey,
    argsHash: proposal.argsHash,
    expectedEffect: proposal.expectedEffect
  });
  try {
    const result = await executeWriteTool(store, proposal.toolKey, proposal.args, actorUserId);
    const executedAt = nowIso();
    await store.update(
      "operator_tool_proposals",
      {
        status: "executed",
        result_json: json(result),
        executed_at: executedAt,
        execution_count: 1,
        updated_at: executedAt
      },
      { id: proposalId }
    );
    const executedAudit = await audit(store, null, "operator_tool_proposal_executed", {
      proposalId,
      actorUserId,
      toolKey: proposal.toolKey,
      argsHash: proposal.argsHash,
      executionCount: 1,
      resultKeys: result && typeof result === "object" ? Object.keys(result).slice(0, 12) : []
    });
    return {
      ok: true,
      version: OPERATOR_ASSISTANT_VERSION,
      status: "proposal_executed",
      proposal: normalizeProposal(await getProposal(store, proposalId)),
      result,
      audit: [
        { id: approvalAudit.id, eventType: approvalAudit.event_type, eventHash: approvalAudit.event_hash },
        { id: executedAudit.id, eventType: executedAudit.event_type, eventHash: executedAudit.event_hash }
      ],
      actionsTaken: [proposal.toolKey]
    };
  } catch (error) {
    const failedAt = nowIso();
    const message = String(error?.message ?? error);
    await store.update(
      "operator_tool_proposals",
      {
        status: "failed",
        error_message: safePreview(message, 500),
        executed_at: failedAt,
        execution_count: 1,
        updated_at: failedAt
      },
      { id: proposalId }
    );
    const failedAudit = await audit(store, null, "operator_tool_proposal_execution_failed", {
      proposalId,
      actorUserId,
      toolKey: proposal.toolKey,
      argsHash: proposal.argsHash,
      executionCount: 1,
      errorType: error?.name ?? "Error"
    });
    return {
      ok: false,
      version: OPERATOR_ASSISTANT_VERSION,
      status: "proposal_execution_failed",
      proposal: normalizeProposal(await getProposal(store, proposalId)),
      error: safePreview(message, 500),
      audit: [
        { id: approvalAudit.id, eventType: approvalAudit.event_type, eventHash: approvalAudit.event_hash },
        { id: failedAudit.id, eventType: failedAudit.event_type, eventHash: failedAudit.event_hash }
      ],
      actionsTaken: []
    };
  }
}
