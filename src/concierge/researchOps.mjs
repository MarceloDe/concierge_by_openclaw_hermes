import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const RESEARCH_OPS_VERSION = "2026-06-21.phase46-research-analytics-budget.v1";

const ACTIVE_SOURCE_STATUSES = new Set(["active_registry", "approved", "active", "enabled"]);
const SOURCE_STATUSES = new Set(["pending_review", "active_registry", "approved", "rejected", "disabled"]);
const RESEARCH_SCHEDULE_STATUSES = new Set(["active", "paused", "disabled"]);
const RESEARCH_SCHEDULE_APPROVAL_STATUSES = new Set(["approved", "pending_approval", "rejected"]);
const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);
const EXECUTABLE_RUN_STATUSES = new Set(["queued", "running"]);
const EXECUTABLE_WORKER_MODES = new Set(["deterministic_fetch", "mock_worker", "openclaw", "hermes"]);
const ADAPTIVE_WORKER_MODES = new Set(["openclaw", "hermes"]);
const TRUSTED_ARTIFACT_STATUS = "trusted_retrieval_approved";
const PENDING_ARTIFACT_STATUS = "extracted_pending_review";
const QUARANTINED_ARTIFACT_STATUS = "quarantined";
const MOCK_UNTRUSTED_ARTIFACT_STATUS = "mock_worker_untrusted";
const EMBEDDING_ROUTE_KEY = "default";
const EMBEDDING_ROUTE_PROVIDERS = new Set(["local_tfidf", "openai"]);
const EMBEDDING_ROUTE_STATUSES = new Set(["active", "disabled"]);
const DEFAULT_LOCAL_EMBEDDING_DIMENSIONS = Number(process.env.BRAINSTY_RESEARCH_EMBEDDING_DIMENSIONS ?? 64);
const DEFAULT_OPENAI_EMBEDDING_DIMENSIONS = Number(process.env.BRAINSTY_RESEARCH_OPENAI_EMBEDDING_DIMENSIONS ?? 1536);
const RESEARCH_BUDGET_POLICY_KEY = "default";
const DEFAULT_RESEARCH_DAILY_RUN_LIMIT = Number(process.env.BRAINSTY_RESEARCH_DAILY_RUN_LIMIT ?? 25);
const DEFAULT_RESEARCH_DAILY_COST_LIMIT_CENTS = Number(process.env.BRAINSTY_RESEARCH_DAILY_COST_LIMIT_CENTS ?? 1000);
const EMBEDDING_INDEX_STATUS_ACTIVE = "active";
const TEXTUAL_CONTENT_TYPES = [
  "text/",
  "application/json",
  "application/xml",
  "application/xhtml+xml",
  "application/ld+json",
  "application/rss+xml"
];
const MAX_FETCH_BYTES = Number(process.env.BRAINSTY_RESEARCH_FETCH_MAX_BYTES ?? 1024 * 1024);
const MAX_RESEARCH_UPLOAD_BYTES = Number(process.env.BRAINSTY_RESEARCH_UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);
const RESEARCH_UPLOAD_CONTENT_TYPES = new Map([
  ["application/pdf", "pdf"],
  ["text/plain", "text"],
  ["text/markdown", "text"],
  ["text/csv", "text"]
]);
function researchArtifactDir() {
  return process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR || "data/research-artifacts";
}

function envFlag(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] ?? "").toLowerCase());
}

function adaptiveWorkerEnabled(workerMode) {
  if (workerMode === "openclaw") return envFlag("BRAINSTY_RESEARCH_OPENCLAW_ENABLED");
  if (workerMode === "hermes") return envFlag("BRAINSTY_RESEARCH_HERMES_ENABLED");
  return true;
}

function adaptiveWorkerFeatureFlag(workerMode) {
  return workerMode === "openclaw" ? "BRAINSTY_RESEARCH_OPENCLAW_ENABLED=1" : "BRAINSTY_RESEARCH_HERMES_ENABLED=1";
}

export class ResearchOpsError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ResearchOpsError";
    this.statusCode = statusCode;
  }
}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function safeFilename(value, fallback = "research-document") {
  const basename = String(value ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
  return basename || fallback;
}

function normalizeContentType(value = "") {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function decodeBase64Upload(value = "") {
  const raw = String(value ?? "").trim();
  const payload = raw.includes(",") && raw.split(",", 1)[0].startsWith("data:") ? raw.split(",", 2)[1] : raw;
  try {
    return Buffer.from(payload, "base64");
  } catch {
    throw new ResearchOpsError("Research document upload payload is not valid base64.", 400);
  }
}

function decodeResearchTextUpload(buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
}

function printableTextFallback(buffer) {
  const text = buffer.toString("utf8").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  const alphaCount = (text.match(/[A-Za-z]/g) ?? []).length;
  return alphaCount >= 20 ? text : "";
}

async function extractResearchPdfUpload(buffer, { filename = "research-document.pdf" } = {}) {
  const uploadDir = resolve(researchArtifactDir(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const contentHash = sha256(buffer);
  const uploadPath = join(uploadDir, `${contentHash.slice(0, 16)}-${safeFilename(filename, "research-document.pdf")}`);
  await writeFile(uploadPath, buffer);
  const script = [
    "import json, sys",
    "path = sys.argv[1]",
    "try:",
    "    from pypdf import PdfReader",
    "    reader = PdfReader(path)",
    "    pages = []",
    "    for idx, page in enumerate(reader.pages[:50], start=1):",
    "        text = page.extract_text() or ''",
    "        if text.strip():",
    "            pages.append(f'[page {idx}]\\n{text}')",
    "    combined = '\\n\\n'.join(pages)",
    "    print(json.dumps({'ok': bool(combined.strip()), 'text': combined, 'method': 'pypdf', 'page_count': len(reader.pages), 'blockers': [] if combined.strip() else ['PDF text extraction produced no readable text.']}))",
    "except Exception as exc:",
    "    print(json.dumps({'ok': False, 'text': '', 'method': 'pypdf', 'page_count': None, 'blockers': [f'PDF extraction failed: {exc.__class__.__name__}']}))"
  ].join("\n");
  try {
    const { stdout } = await execFileAsync("python3", ["-c", script, uploadPath], {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10
    });
    const parsed = parseJson(stdout, {});
    if (parsed.ok && String(parsed.text ?? "").trim()) {
      return {
        status: "completed",
        method: parsed.method ?? "pypdf",
        text: String(parsed.text ?? ""),
        pageCount: Number(parsed.page_count ?? 0) || null,
        blockers: [],
        localUploadPath: uploadPath
      };
    }
    const fallback = printableTextFallback(buffer);
    return {
      status: fallback ? "partial" : "blocked",
      method: fallback ? "pdf_utf8_fallback" : parsed.method ?? "pypdf",
      text: fallback,
      pageCount: Number(parsed.page_count ?? 0) || null,
      blockers: parsed.blockers ?? ["PDF text extraction produced no readable text."],
      localUploadPath: uploadPath
    };
  } catch (error) {
    const fallback = printableTextFallback(buffer);
    return {
      status: fallback ? "partial" : "blocked",
      method: fallback ? "pdf_utf8_fallback" : "pypdf_subprocess",
      text: fallback,
      pageCount: null,
      blockers: [safePreview(error?.message ?? error, 240)],
      localUploadPath: uploadPath
    };
  }
}

async function extractResearchDocumentUpload(buffer, { contentType, filename } = {}) {
  if (contentType === "application/pdf") return extractResearchPdfUpload(buffer, { filename });
  return {
    status: "completed",
    method: "utf8_text",
    text: decodeResearchTextUpload(buffer),
    pageCount: 1,
    blockers: [],
    localUploadPath: null
  };
}

function addHoursIso(isoValue, hours) {
  const base = new Date(isoValue);
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  safeBase.setTime(safeBase.getTime() + Number(hours) * 60 * 60 * 1000);
  return safeBase.toISOString();
}

function normalizeScheduleKey(value) {
  const key = slug(value);
  return key ? `research_schedule_${key}` : `research_schedule_${createId("key")}`;
}

function validateUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ResearchOpsError("Source URL must be a valid URL.", 400);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ResearchOpsError("Source URL must use http or https.", 400);
  }
  return parsed;
}

function isTextualContentType(contentType = "") {
  const normalized = String(contentType || "").toLowerCase();
  return !normalized || TEXTUAL_CONTENT_TYPES.some((prefix) => normalized.includes(prefix));
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(value, fallback = "") {
  const match = String(value ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(match?.[1] ?? fallback).slice(0, 240);
}

function safePreview(value, max = 2000) {
  return maskDirectIdentifiers(String(value ?? ""), {})
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "[redacted-phone]")
    .replace(/\b\d{9,}\b/g, "[redacted-number]")
    .slice(0, max);
}

function boundedLimit(value, fallback = 50, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

const RESEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "before",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
  "you",
  "your"
]);

function tokenize(value) {
  return Array.from(
    new Set(
      String(value ?? "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !RESEARCH_STOP_WORDS.has(token))
    )
  ).slice(0, 16);
}

function artifactSearchText(artifact) {
  return `${artifact.title ?? ""} ${artifact.sourceUrl ?? ""} ${artifact.safeTextPreview ?? ""}`.toLowerCase();
}

function scoreArtifact(artifact, tokens, query) {
  if (!tokens.length) return 1;
  const text = artifactSearchText(artifact);
  let score = 0;
  for (const token of tokens) {
    if (String(artifact.title ?? "").toLowerCase().includes(token)) score += 4;
    if (String(artifact.sourceUrl ?? "").toLowerCase().includes(token)) score += 2;
    if (String(artifact.safeTextPreview ?? "").toLowerCase().includes(token)) score += 1;
  }
  const phrase = String(query ?? "").trim().toLowerCase();
  if (phrase && text.includes(phrase)) score += 6;
  return score;
}

function evidenceSnippet(artifact, tokens) {
  const preview = String(artifact.safeTextPreview ?? "");
  if (!preview) return "";
  const lower = preview.toLowerCase();
  const firstIndex = tokens.map((token) => lower.indexOf(token)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstIndex - 120);
  const snippet = preview.slice(start, start + 420).trim();
  return start > 0 ? `...${snippet}` : snippet;
}

function embeddingRouteDefaults(provider = "local_tfidf") {
  if (provider === "openai") {
    return {
      provider,
      model: process.env.BRAINSTY_RESEARCH_OPENAI_EMBEDDING_MODEL || process.env.GRAPHITI_EMBEDDING_MODEL || "text-embedding-3-small",
      dimensions: DEFAULT_OPENAI_EMBEDDING_DIMENSIONS
    };
  }
  return {
    provider: "local_tfidf",
    model: "local-tfidf-v1",
    dimensions: DEFAULT_LOCAL_EMBEDDING_DIMENSIONS
  };
}

function normalizeEmbeddingRoute(row) {
  if (!row) return null;
  return {
    id: row.id,
    routeKey: row.route_key,
    provider: row.provider,
    model: row.model,
    dimensions: Number(row.dimensions ?? 0),
    status: row.status,
    selectedBy: row.selected_by ?? null,
    selectedAt: row.selected_at,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeEmbeddingJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    routeKey: row.route_key,
    actorUserId: row.actor_user_id ?? null,
    jobType: row.job_type,
    status: row.status,
    artifactCount: Number(row.artifact_count ?? 0),
    indexedCount: Number(row.indexed_count ?? 0),
    skippedCount: Number(row.skipped_count ?? 0),
    failureReason: row.failure_reason ?? null,
    metadata: parseJson(row.metadata_json, {}),
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeEmbeddingIndex(row) {
  if (!row) return null;
  return {
    id: row.id,
    artifactId: row.artifact_id,
    routeKey: row.route_key,
    provider: row.provider,
    model: row.model,
    dimensions: Number(row.dimensions ?? 0),
    vectorHash: row.vector_hash,
    textHash: row.text_hash,
    sourceHash: row.source_hash,
    status: row.status,
    jobId: row.job_id ?? null,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hashToken(value) {
  const digest = createHash("sha256").update(String(value ?? "")).digest();
  return digest.readUInt32BE(0);
}

function embeddingTextForArtifact(artifact) {
  return [artifact.title, artifact.sourceUrl, artifact.safeTextPreview].filter(Boolean).join("\n").slice(0, 8000);
}

function localEmbeddingVector(text, dimensions) {
  const parsedDimensions = Number(dimensions);
  if (!Number.isInteger(parsedDimensions) || parsedDimensions < 8 || parsedDimensions > 4096) {
    throw new ResearchOpsError("Embedding dimensions must be an integer between 8 and 4096.", 400);
  }
  const vector = Array(parsedDimensions).fill(0);
  const terms = String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  for (const term of terms) {
    const index = hashToken(term) % parsedDimensions;
    vector[index] += 1;
    if (term.length >= 6) vector[index] += 0.25;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function cosineSimilarity(left = [], right = []) {
  const limit = Math.min(left.length, right.length);
  if (!limit) return 0;
  let score = 0;
  for (let index = 0; index < limit; index += 1) score += Number(left[index] ?? 0) * Number(right[index] ?? 0);
  return score;
}

function parseVectorJson(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed.map(Number) : [];
}

async function ensureDefaultEmbeddingRoute(store) {
  const existing = await store.findOne("research_embedding_routes", { route_key: EMBEDDING_ROUTE_KEY });
  if (existing) return normalizeEmbeddingRoute(existing);
  const defaults = embeddingRouteDefaults(process.env.BRAINSTY_RESEARCH_EMBEDDING_PROVIDER || "local_tfidf");
  const time = nowIso();
  const row = {
    id: createId("research_embedding_route"),
    route_key: EMBEDDING_ROUTE_KEY,
    provider: defaults.provider,
    model: defaults.model,
    dimensions: defaults.dimensions,
    status: "active",
    selected_by: "system_default",
    selected_at: time,
    metadata_json: json({
      source: "system_default",
      purpose: "trusted_research_retrieval",
      indexesOnlyApprovedEvidence: true,
      version: RESEARCH_OPS_VERSION
    }),
    created_at: time,
    updated_at: time
  };
  await store.insert("research_embedding_routes", row);
  return normalizeEmbeddingRoute(row);
}

async function openAiEmbeddingVectors(texts, route) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ResearchOpsError("OpenAI embedding route is selected, but OPENAI_API_KEY is not configured.", 424);
  }
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: route.model,
      input: texts
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ResearchOpsError(`OpenAI embedding request failed with HTTP ${response.status}.`, 502);
  }
  const vectors = (payload.data ?? []).map((item) => item.embedding);
  if (vectors.length !== texts.length || vectors.some((vector) => !Array.isArray(vector))) {
    throw new ResearchOpsError("OpenAI embedding response did not include one vector per input.", 502);
  }
  return vectors.map((vector) => vector.map((value) => Number(value)));
}

async function vectorsForRoute(texts, route) {
  if (route.provider === "local_tfidf") {
    return texts.map((text) => localEmbeddingVector(text, route.dimensions));
  }
  if (route.provider === "openai") {
    return openAiEmbeddingVectors(texts, route);
  }
  throw new ResearchOpsError(`Unsupported embedding provider: ${route.provider}.`, 400);
}

function normalizeArtifact(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    sourceId: row.source_id ?? null,
    artifactType: row.artifact_type,
    sourceUrl: row.source_url,
    title: row.title ?? null,
    contentHash: row.content_hash,
    extractionHash: row.extraction_hash,
    safeTextPreview: row.safe_text_preview,
    citationStatus: row.citation_status,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at
  };
}

function normalizeSource(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceKey: row.source_key,
    title: row.title,
    sourceType: row.source_type,
    authorityLevel: row.authority_level,
    baseUrl: row.base_url,
    workflowKeys: parseJson(row.workflow_keys_json, []),
    refreshPolicy: row.refresh_policy,
    accessMethod: row.access_method,
    status: row.status,
    approved: ACTIVE_SOURCE_STATUSES.has(row.status),
    priority: Number(row.priority ?? 100),
    lastRunAt: row.last_run_at ?? null,
    lastStatus: row.last_status ?? null,
    metadata: parseJson(row.metadata_json, {}),
    proposedBy: row.proposed_by ?? null,
    approvedBy: row.approved_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    sourceId: row.source_id ?? null,
    sourceKey: row.source_key ?? null,
    actorUserId: row.actor_user_id ?? null,
    runType: row.run_type,
    workflowKey: row.workflow_key ?? null,
    status: row.status,
    topic: row.topic ?? "",
    query: parseJson(row.query_json, {}),
    summary: row.summary ?? "",
    retryOfRunId: row.retry_of_run_id ?? null,
    metadata: parseJson(row.metadata_json, {}),
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeRunEvent(row) {
  return {
    id: row.id,
    runId: row.run_id,
    eventType: row.event_type,
    status: row.status,
    summary: row.summary,
    payload: parseJson(row.payload_json, {}),
    createdAt: row.created_at
  };
}

function normalizeSchedule(row) {
  if (!row) return null;
  return {
    id: row.id,
    scheduleKey: row.schedule_key,
    actorUserId: row.actor_user_id ?? null,
    sourceId: row.source_id ?? null,
    sourceKey: row.source_key ?? null,
    scheduleLabel: row.schedule_label,
    intervalHours: Number(row.interval_hours ?? 24),
    workflowKey: row.workflow_key,
    topic: row.topic ?? "",
    query: parseJson(row.query_json, {}),
    workerMode: row.worker_mode,
    status: row.status,
    approvalStatus: row.approval_status,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at ?? null,
    lastRunId: row.last_run_id ?? null,
    lastStatus: row.last_status ?? null,
    runCount: Number(row.run_count ?? 0),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeBudgetPolicy(row) {
  if (!row) return null;
  return {
    id: row.id,
    policyKey: row.policy_key,
    actorUserId: row.actor_user_id ?? null,
    enabled: Boolean(Number(row.enabled ?? 1)),
    dailyRunLimit: Number(row.daily_run_limit ?? DEFAULT_RESEARCH_DAILY_RUN_LIMIT),
    dailyCostLimitCents: Number(row.daily_cost_limit_cents ?? DEFAULT_RESEARCH_DAILY_COST_LIMIT_CENTS),
    killSwitchEnabled: Boolean(Number(row.kill_switch_enabled ?? 0)),
    killSwitchReason: row.kill_switch_reason ?? "",
    enforcementMode: row.enforcement_mode ?? "fail_closed",
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeBudgetEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    policyKey: row.policy_key,
    actorUserId: row.actor_user_id ?? null,
    runId: row.run_id ?? null,
    eventType: row.event_type,
    estimatedCostCents: Number(row.estimated_cost_cents ?? 0),
    status: row.status,
    reason: row.reason ?? "",
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at
  };
}

function startOfUtcDayIso(now = nowIso()) {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function estimateResearchCostCents({ workerMode = null, operation = "run_queued" } = {}) {
  if (operation === "run_queued") return 1;
  if (workerMode === "mock_worker") return 0;
  if (workerMode === "openclaw" || workerMode === "hermes") return 50;
  return 2;
}

async function ensureResearchBudgetPolicy(store) {
  const existing = await store.findOne("research_budget_policies", { policy_key: RESEARCH_BUDGET_POLICY_KEY });
  if (existing) return normalizeBudgetPolicy(existing);
  const time = nowIso();
  const row = {
    id: createId("research_budget_policy"),
    policy_key: RESEARCH_BUDGET_POLICY_KEY,
    actor_user_id: "system_default",
    enabled: 1,
    daily_run_limit: Number.isFinite(DEFAULT_RESEARCH_DAILY_RUN_LIMIT) ? DEFAULT_RESEARCH_DAILY_RUN_LIMIT : 25,
    daily_cost_limit_cents: Number.isFinite(DEFAULT_RESEARCH_DAILY_COST_LIMIT_CENTS) ? DEFAULT_RESEARCH_DAILY_COST_LIMIT_CENTS : 1000,
    kill_switch_enabled: 0,
    kill_switch_reason: "",
    enforcement_mode: "fail_closed",
    metadata_json: json({
      source: "system_default",
      purpose: "operator_research_budget_and_kill_switch",
      version: RESEARCH_OPS_VERSION
    }),
    created_at: time,
    updated_at: time
  };
  await store.insert("research_budget_policies", row);
  return normalizeBudgetPolicy(row);
}

async function getResearchBudgetUsage(store, { now = nowIso() } = {}) {
  const start = startOfUtcDayIso(now);
  const [acceptedRunEvents, acceptedCost, blockedEvents, latestEvent] = await Promise.all([
    store.get(
      `SELECT COUNT(*) AS count
       FROM research_budget_events
       WHERE policy_key = ${sql(RESEARCH_BUDGET_POLICY_KEY)}
         AND status = 'accepted'
         AND event_type = 'run_queued'
         AND created_at >= ${sql(start)};`
    ),
    store.get(
      `SELECT COALESCE(SUM(estimated_cost_cents), 0) AS cents
       FROM research_budget_events
       WHERE policy_key = ${sql(RESEARCH_BUDGET_POLICY_KEY)}
         AND status = 'accepted'
         AND created_at >= ${sql(start)};`
    ),
    store.get(
      `SELECT COUNT(*) AS count
       FROM research_budget_events
       WHERE policy_key = ${sql(RESEARCH_BUDGET_POLICY_KEY)}
         AND status = 'blocked'
         AND created_at >= ${sql(start)};`
    ),
    store.get(
      `SELECT * FROM research_budget_events
       WHERE policy_key = ${sql(RESEARCH_BUDGET_POLICY_KEY)}
       ORDER BY created_at DESC
       LIMIT 1;`
    )
  ]);
  return {
    window: {
      key: "utc_day",
      startsAt: start,
      observedAt: now
    },
    queuedRuns: Number(acceptedRunEvents?.count ?? 0),
    estimatedCostCents: Number(acceptedCost?.cents ?? 0),
    blockedEvents: Number(blockedEvents?.count ?? 0),
    latestEvent: normalizeBudgetEvent(latestEvent)
  };
}

async function recordResearchBudgetEvent(
  store,
  { actorUserId = null, runId = null, eventType, estimatedCostCents = 0, status = "accepted", reason = "", metadata = {} } = {}
) {
  const row = {
    id: createId("research_budget_event"),
    policy_key: RESEARCH_BUDGET_POLICY_KEY,
    actor_user_id: actorUserId,
    run_id: runId,
    event_type: eventType,
    estimated_cost_cents: Math.max(0, Math.floor(Number(estimatedCostCents) || 0)),
    status,
    reason: safePreview(reason, 300),
    metadata_json: json({
      ...metadata,
      rawPromptReturned: false,
      rawArtifactTextReturned: false,
      version: RESEARCH_OPS_VERSION
    }),
    created_at: nowIso()
  };
  await store.insert("research_budget_events", row);
  return normalizeBudgetEvent(row);
}

async function assertResearchBudgetAllows(store, { actorUserId = null, runId = null, eventType, estimatedCostCents = 0, metadata = {} } = {}) {
  const policy = await ensureResearchBudgetPolicy(store);
  const usage = await getResearchBudgetUsage(store);
  let reason = "";
  if (!policy.enabled) reason = "research_budget_policy_disabled";
  else if (policy.killSwitchEnabled) reason = "research_budget_kill_switch_enabled";
  else if (eventType === "run_queued" && usage.queuedRuns >= policy.dailyRunLimit) reason = "research_daily_run_limit_exceeded";
  else if (usage.estimatedCostCents + estimatedCostCents > policy.dailyCostLimitCents) reason = "research_daily_cost_limit_exceeded";
  if (!reason) return { policy, usage };

  const blocked = await recordResearchBudgetEvent(store, {
    actorUserId,
    runId,
    eventType,
    estimatedCostCents,
    status: "blocked",
    reason,
    metadata
  });
  const auditEvent = await audit(store, null, "research_budget_blocked", {
    actorUserId,
    runId,
    eventType,
    estimatedCostCents,
    reason,
    policyKey: policy.policyKey,
    killSwitchEnabled: policy.killSwitchEnabled,
    dailyRunLimit: policy.dailyRunLimit,
    dailyCostLimitCents: policy.dailyCostLimitCents,
    usageQueuedRuns: usage.queuedRuns,
    usageEstimatedCostCents: usage.estimatedCostCents
  });
  const error = new ResearchOpsError(`Research budget blocked operation: ${reason}.`, 409);
  error.budget = { policy, usage, blocked, audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash } };
  throw error;
}

function normalizeGraphBuild(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorUserId: row.actor_user_id ?? null,
    status: row.status,
    nodeCount: Number(row.node_count ?? 0),
    edgeCount: Number(row.edge_count ?? 0),
    graphHash: row.graph_hash,
    safety: parseJson(row.safety_json, {}),
    auditEventId: row.audit_event_id ?? null,
    failureReason: row.failure_reason ?? null,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeClaimEvaluation(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorUserId: row.actor_user_id ?? null,
    questionHash: row.question_hash ?? null,
    questionPreview: row.question_preview ?? "",
    answerHash: row.answer_hash,
    answerPreview: row.answer_preview,
    status: row.status,
    verdict: row.verdict,
    claimCount: Number(row.claim_count ?? 0),
    supportedCount: Number(row.supported_count ?? 0),
    unsupportedCount: Number(row.unsupported_count ?? 0),
    lowConfidenceCount: Number(row.low_confidence_count ?? 0),
    evaluation: parseJson(row.evaluation_json, {}),
    safety: parseJson(row.safety_json, {}),
    auditEventId: row.audit_event_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function urlSafetyParts(value) {
  try {
    const parsed = new URL(value);
    return {
      host: parsed.hostname,
      originHash: sha256(parsed.origin),
      urlHash: sha256(parsed.href),
      pathHash: sha256(`${parsed.pathname}${parsed.search}`)
    };
  } catch {
    return {
      host: "invalid_url",
      originHash: sha256("invalid_url"),
      urlHash: sha256(value ?? ""),
      pathHash: sha256(value ?? "")
    };
  }
}

function claimCandidateText(value) {
  return safePreview(
    String(value ?? "")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-*•\d.)]+/, "")
      .trim(),
    600
  );
}

function extractAnswerClaims(answer, { maxClaims = 12 } = {}) {
  const domainSignal =
    /\b(deductible|copay|co-pay|coinsurance|out[- ]of[- ]pocket|claim|eob|denial|appeal|prior authorization|authorization|coverage|covered|benefit|eligible|network|provider|facility|pharmacy|formulary|payer|insurance|plan|member|policy|document|bill|cost|allowed amount)\b/i;
  const factualSignal =
    /\b(is|are|was|were|has|have|had|applies|covers|covered|requires|required|will|can|must|should|eligible|in[- ]network|out[- ]of[- ]network|starts|ends|counts|pay|paid|owe|costs?)\b/i;
  const fragments = String(answer ?? "")
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?])\s+|\n+|;\s+/)
    .map(claimCandidateText)
    .filter(Boolean);
  const claims = [];
  const seen = new Set();
  for (const fragment of fragments) {
    if (claims.length >= maxClaims) break;
    if (fragment.length < 18) continue;
    if (/^(please|verify|check|contact|ask|upload|sign in)\b/i.test(fragment) && !domainSignal.test(fragment)) continue;
    if (!domainSignal.test(fragment) && !(/\$?\d/.test(fragment) || factualSignal.test(fragment))) continue;
    const claimHash = sha256(fragment);
    if (seen.has(claimHash)) continue;
    seen.add(claimHash);
    claims.push({
      id: `claim_${claims.length + 1}`,
      text: fragment,
      textHash: claimHash,
      tokens: tokenize(fragment)
    });
  }
  return claims;
}

function citationPointerFromResult(artifact, score, lexicalScore, claimTokens = []) {
  const urlParts = urlSafetyParts(artifact.sourceUrl);
  return {
    artifactId: artifact.id,
    runId: artifact.runId,
    sourceId: artifact.sourceId,
    title: artifact.title,
    artifactType: artifact.artifactType,
    citationStatus: artifact.citationStatus,
    score: Number(score.toFixed(4)),
    lexicalScore: Number(lexicalScore.toFixed(4)),
    confidence: score >= 8 ? "high" : score >= 3 ? "medium" : "low",
    sourceHost: urlParts.host,
    sourceUrlHash: urlParts.urlHash,
    contentHash: artifact.contentHash,
    extractionHash: artifact.extractionHash,
    snippet: evidenceSnippet(artifact, claimTokens).slice(0, 420)
  };
}

function scoreClaimArtifact(claim, artifact) {
  const lexicalScore = scoreArtifact(artifact, claim.tokens, claim.text);
  return {
    artifact,
    lexicalScore,
    score: lexicalScore
  };
}

async function trustedArtifactsForClosure(store, { limit = 500 } = {}) {
  const rows = await store.all(
    `SELECT * FROM research_artifacts
     WHERE citation_status = ${sql(TRUSTED_ARTIFACT_STATUS)}
     ORDER BY created_at DESC
     LIMIT ${boundedLimit(limit, 500, 1000)};`
  );
  return rows.map(normalizeArtifact);
}

async function pendingMatchCountForClaim(store, claim) {
  const rows = await store.all(
    `SELECT * FROM research_artifacts
     WHERE citation_status = ${sql(PENDING_ARTIFACT_STATUS)}
     ORDER BY created_at DESC
     LIMIT 500;`
  );
  return rows.map(normalizeArtifact).filter((artifact) => scoreArtifact(artifact, claim.tokens, claim.text) > 0).length;
}

function citationClosureVerdict(claims) {
  if (!claims.length) return "no_claims_detected";
  if (claims.some((claim) => claim.status === "unsupported")) return "unsupported_claims_found";
  if (claims.some((claim) => claim.status === "low_confidence")) return "low_confidence_claims_found";
  return "all_claims_supported";
}

function pushGraphNode(nodes, seenNodes, node) {
  if (!node?.id || seenNodes.has(node.id)) return;
  seenNodes.add(node.id);
  nodes.push(node);
}

function pushGraphEdge(edges, seenEdges, edge) {
  if (!edge?.from || !edge?.to || !edge?.type) return;
  const id = edge.id ?? `${edge.from}->${edge.type}->${edge.to}`;
  if (seenEdges.has(id)) return;
  seenEdges.add(id);
  edges.push({ ...edge, id });
}

function graphStatusFromCounts(nodes, edges) {
  if (!nodes.length && !edges.length) return "empty_graph";
  if (!nodes.length) return "nodes_missing";
  return "ready";
}

async function buildResearchGraphSnapshot(store, { limit = 250 } = {}) {
  const bounded = boundedLimit(limit, 250, 1000);
  const [
    sourceRows,
    runRows,
    artifactRows,
    scheduleRows,
    routeRows,
    jobRows,
    indexRows,
    latestBuildRow
  ] = await Promise.all([
    store.all(`SELECT * FROM knowledge_sources ORDER BY priority ASC, title ASC LIMIT ${bounded};`),
    store.all(`SELECT * FROM research_runs ORDER BY created_at DESC LIMIT ${bounded};`),
    store.all(`SELECT * FROM research_artifacts ORDER BY created_at DESC LIMIT ${bounded};`),
    store.all(`SELECT * FROM research_schedules ORDER BY next_run_at ASC, created_at DESC LIMIT ${bounded};`),
    store.all(`SELECT * FROM research_embedding_routes ORDER BY updated_at DESC LIMIT ${Math.min(bounded, 50)};`),
    store.all(`SELECT * FROM research_embedding_jobs ORDER BY created_at DESC LIMIT ${Math.min(bounded, 100)};`),
    store.all(`SELECT * FROM research_embedding_index WHERE status = ${sql(EMBEDDING_INDEX_STATUS_ACTIVE)} ORDER BY created_at DESC LIMIT ${bounded};`),
    store.get("SELECT * FROM research_graph_builds ORDER BY created_at DESC LIMIT 1;")
  ]);

  const sources = sourceRows.map(normalizeSource);
  const runs = runRows.map(normalizeRun);
  const artifacts = artifactRows.map(normalizeArtifact);
  const schedules = scheduleRows.map(normalizeSchedule);
  const routes = routeRows.map(normalizeEmbeddingRoute);
  const jobs = jobRows.map(normalizeEmbeddingJob);
  const indexes = indexRows.map(normalizeEmbeddingIndex);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const runById = new Map(runs.map((run) => [run.id, run]));
  const routeByKey = new Map(routes.map((route) => [route.routeKey, route]));
  const nodes = [];
  const edges = [];
  const seenNodes = new Set();
  const seenEdges = new Set();

  for (const source of sources) {
    const urlParts = urlSafetyParts(source.baseUrl);
    pushGraphNode(nodes, seenNodes, {
      id: `source:${source.id}`,
      type: "knowledge_source",
      label: safePreview(source.title, 140),
      status: source.status,
      metadata: {
        sourceKey: source.sourceKey,
        sourceType: source.sourceType,
        authorityLevel: source.authorityLevel,
        approved: source.approved,
        priority: source.priority,
        workflowKeys: source.workflowKeys,
        host: urlParts.host,
        urlHash: urlParts.urlHash,
        lastStatus: source.lastStatus,
        lastRunAt: source.lastRunAt
      }
    });
    for (const workflowKey of source.workflowKeys ?? []) {
      const workflowNodeId = `workflow:${workflowKey}`;
      pushGraphNode(nodes, seenNodes, {
        id: workflowNodeId,
        type: "workflow",
        label: safePreview(workflowKey, 120),
        status: "registered",
        metadata: { workflowKey }
      });
      pushGraphEdge(edges, seenEdges, {
        from: `source:${source.id}`,
        to: workflowNodeId,
        type: "source_supports_workflow"
      });
    }
  }

  for (const run of runs) {
    const workerMode = run.metadata?.workerMode ?? run.query?.workerMode ?? "unspecified";
    pushGraphNode(nodes, seenNodes, {
      id: `run:${run.id}`,
      type: "research_run",
      label: safePreview(run.topic || run.id, 140),
      status: run.status,
      metadata: {
        sourceKey: run.sourceKey,
        workflowKey: run.workflowKey,
        runType: run.runType,
        workerMode,
        actorUserId: run.actorUserId,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        retryOfRunId: run.retryOfRunId
      }
    });
    if (run.sourceId && sourceById.has(run.sourceId)) {
      pushGraphEdge(edges, seenEdges, {
        from: `source:${run.sourceId}`,
        to: `run:${run.id}`,
        type: "source_has_run",
        metadata: { runStatus: run.status, workerMode }
      });
    }
    if (run.workflowKey) {
      const workflowNodeId = `workflow:${run.workflowKey}`;
      pushGraphNode(nodes, seenNodes, {
        id: workflowNodeId,
        type: "workflow",
        label: safePreview(run.workflowKey, 120),
        status: "observed",
        metadata: { workflowKey: run.workflowKey }
      });
      pushGraphEdge(edges, seenEdges, {
        from: `run:${run.id}`,
        to: workflowNodeId,
        type: "run_for_workflow"
      });
    }
    if (run.retryOfRunId) {
      pushGraphEdge(edges, seenEdges, {
        from: `run:${run.id}`,
        to: `run:${run.retryOfRunId}`,
        type: "run_retries"
      });
    }
  }

  for (const artifact of artifacts) {
    const urlParts = urlSafetyParts(artifact.sourceUrl);
    pushGraphNode(nodes, seenNodes, {
      id: `artifact:${artifact.id}`,
      type: "research_artifact",
      label: safePreview(artifact.title || artifact.artifactType || artifact.id, 140),
      status: artifact.citationStatus,
      metadata: {
        artifactType: artifact.artifactType,
        sourceId: artifact.sourceId,
        runId: artifact.runId,
        trustedRetrieval: artifact.citationStatus === TRUSTED_ARTIFACT_STATUS,
        host: urlParts.host,
        sourceUrlHash: urlParts.urlHash,
        contentHash: artifact.contentHash,
        extractionHash: artifact.extractionHash,
        safePreviewHash: sha256(artifact.safeTextPreview ?? ""),
        safePreviewReturned: false,
        createdAt: artifact.createdAt
      }
    });
    if (artifact.runId && runById.has(artifact.runId)) {
      pushGraphEdge(edges, seenEdges, {
        from: `run:${artifact.runId}`,
        to: `artifact:${artifact.id}`,
        type: "run_produced_artifact",
        metadata: { citationStatus: artifact.citationStatus, artifactType: artifact.artifactType }
      });
    }
    if (artifact.sourceId && sourceById.has(artifact.sourceId)) {
      pushGraphEdge(edges, seenEdges, {
        from: `source:${artifact.sourceId}`,
        to: `artifact:${artifact.id}`,
        type: "source_has_artifact",
        metadata: { citationStatus: artifact.citationStatus }
      });
    }
  }

  for (const route of routes) {
    pushGraphNode(nodes, seenNodes, {
      id: `embedding_route:${route.routeKey}`,
      type: "embedding_route",
      label: safePreview(`${route.provider}/${route.model}`, 140),
      status: route.status,
      metadata: {
        routeKey: route.routeKey,
        provider: route.provider,
        model: route.model,
        dimensions: route.dimensions,
        indexesOnlyApprovedEvidence: true
      }
    });
  }

  for (const job of jobs) {
    pushGraphNode(nodes, seenNodes, {
      id: `embedding_job:${job.id}`,
      type: "embedding_job",
      label: safePreview(`${job.jobType} ${job.status}`, 140),
      status: job.status,
      metadata: {
        routeKey: job.routeKey,
        jobType: job.jobType,
        artifactCount: job.artifactCount,
        indexedCount: job.indexedCount,
        skippedCount: job.skippedCount,
        failureReason: job.failureReason,
        completedAt: job.completedAt
      }
    });
    if (routeByKey.has(job.routeKey)) {
      pushGraphEdge(edges, seenEdges, {
        from: `embedding_job:${job.id}`,
        to: `embedding_route:${job.routeKey}`,
        type: "embedding_job_used_route",
        metadata: { status: job.status }
      });
    }
  }

  for (const index of indexes) {
    if (routeByKey.has(index.routeKey)) {
      pushGraphEdge(edges, seenEdges, {
        from: `artifact:${index.artifactId}`,
        to: `embedding_route:${index.routeKey}`,
        type: "artifact_indexed_by_route",
        metadata: {
          provider: index.provider,
          model: index.model,
          dimensions: index.dimensions,
          vectorHash: index.vectorHash,
          textHash: index.textHash,
          sourceHash: index.sourceHash,
          rawArtifactTextStoredInIndex: false
        }
      });
    }
    if (index.jobId) {
      pushGraphEdge(edges, seenEdges, {
        from: `embedding_job:${index.jobId}`,
        to: `artifact:${index.artifactId}`,
        type: "embedding_job_indexed_artifact",
        metadata: { routeKey: index.routeKey, status: index.status }
      });
    }
  }

  for (const schedule of schedules) {
    pushGraphNode(nodes, seenNodes, {
      id: `schedule:${schedule.id}`,
      type: "research_schedule",
      label: safePreview(schedule.scheduleLabel || schedule.scheduleKey, 140),
      status: schedule.status,
      metadata: {
        scheduleKey: schedule.scheduleKey,
        approvalStatus: schedule.approvalStatus,
        workerMode: schedule.workerMode,
        workflowKey: schedule.workflowKey,
        intervalHours: schedule.intervalHours,
        nextRunAt: schedule.nextRunAt,
        lastStatus: schedule.lastStatus,
        runCount: schedule.runCount
      }
    });
    if (schedule.sourceId && sourceById.has(schedule.sourceId)) {
      pushGraphEdge(edges, seenEdges, {
        from: `schedule:${schedule.id}`,
        to: `source:${schedule.sourceId}`,
        type: "schedule_targets_source",
        metadata: { workerMode: schedule.workerMode }
      });
    }
    if (schedule.lastRunId && runById.has(schedule.lastRunId)) {
      pushGraphEdge(edges, seenEdges, {
        from: `schedule:${schedule.id}`,
        to: `run:${schedule.lastRunId}`,
        type: "schedule_created_last_run",
        metadata: { lastStatus: schedule.lastStatus }
      });
    }
  }

  const summary = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes: nodes.reduce((counts, node) => ({ ...counts, [node.type]: (counts[node.type] ?? 0) + 1 }), {}),
    edgeTypes: edges.reduce((counts, edge) => ({ ...counts, [edge.type]: (counts[edge.type] ?? 0) + 1 }), {}),
    citationStatuses: artifacts.reduce((counts, artifact) => ({ ...counts, [artifact.citationStatus]: (counts[artifact.citationStatus] ?? 0) + 1 }), {}),
    trustedArtifactCount: artifacts.filter((artifact) => artifact.citationStatus === TRUSTED_ARTIFACT_STATUS).length,
    pendingArtifactCount: artifacts.filter((artifact) => artifact.citationStatus === PENDING_ARTIFACT_STATUS).length,
    approvedSourceCount: sources.filter((source) => source.approved).length,
    activeRunCount: runs.filter((run) => EXECUTABLE_RUN_STATUSES.has(run.status)).length,
    activeEmbeddingIndexEdges: indexes.length
  };
  const safety = {
    rawArtifactTextReturned: false,
    safeTextPreviewReturned: false,
    artifactBodiesReturned: false,
    sourceUrlsRedactedToHostAndHash: true,
    graphBuiltFromMetadataOnly: true,
    trustedRetrievalRequiresArtifactReview: true,
    pendingArtifactsIncludedAsPendingOnly: true,
    graphBuildAuditLogged: true
  };
  const graph = {
    status: graphStatusFromCounts(nodes, edges),
    nodes,
    edges,
    summary
  };
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    generatedAt: nowIso(),
    graph,
    latestBuild: normalizeGraphBuild(latestBuildRow),
    safety,
    actionsTaken: ["research_graph_metadata_snapshot_built"]
  };
}

export async function getResearchGraph(store, { limit = 250 } = {}) {
  return buildResearchGraphSnapshot(store, { limit });
}

export async function buildResearchGraph(store, { actorUserId = null, limit = 250 } = {}) {
  const time = nowIso();
  const graphBuildId = createId("research_graph_build");
  const running = {
    id: graphBuildId,
    actor_user_id: actorUserId,
    status: "running",
    node_count: 0,
    edge_count: 0,
    graph_hash: sha256(`${graphBuildId}:running`),
    graph_json: "{}",
    safety_json: "{}",
    audit_event_id: null,
    failure_reason: null,
    started_at: time,
    completed_at: null,
    created_at: time,
    updated_at: time
  };
  await store.insert("research_graph_builds", running);
  try {
    const snapshot = await buildResearchGraphSnapshot(store, { limit });
    const graphJson = json(snapshot.graph);
    const graphHash = sha256(graphJson);
    const completedAt = nowIso();
    await store.update(
      "research_graph_builds",
      {
        status: "completed",
        node_count: snapshot.graph.summary.nodeCount,
        edge_count: snapshot.graph.summary.edgeCount,
        graph_hash: graphHash,
        graph_json: graphJson,
        safety_json: json(snapshot.safety),
        completed_at: completedAt,
        updated_at: completedAt
      },
      { id: graphBuildId }
    );
    const auditEvent = await audit(store, null, "research_graph_build_completed", {
      actorUserId,
      graphBuildId,
      graphHash,
      nodeCount: snapshot.graph.summary.nodeCount,
      edgeCount: snapshot.graph.summary.edgeCount,
      rawArtifactTextReturned: false,
      safeTextPreviewReturned: false,
      actionsTaken: ["research_graph_build_recorded"]
    });
    await store.update("research_graph_builds", { audit_event_id: auditEvent.id, updated_at: nowIso() }, { id: graphBuildId });
    return {
      ...snapshot,
      status: "graph_build_completed",
      build: normalizeGraphBuild(await store.findOne("research_graph_builds", { id: graphBuildId })),
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
      actionsTaken: ["research_graph_metadata_snapshot_built", "research_graph_build_recorded"]
    };
  } catch (error) {
    const message = safePreview(error?.message ?? error, 500);
    const failedAt = nowIso();
    await store.update(
      "research_graph_builds",
      {
        status: "failed",
        failure_reason: message,
        completed_at: failedAt,
        updated_at: failedAt
      },
      { id: graphBuildId }
    );
    const auditEvent = await audit(store, null, "research_graph_build_failed", {
      actorUserId,
      graphBuildId,
      errorType: error?.name ?? "Error",
      errorHash: sha256(message),
      actionsTaken: []
    });
    await store.update("research_graph_builds", { audit_event_id: auditEvent.id, updated_at: nowIso() }, { id: graphBuildId });
    return {
      ok: false,
      version: RESEARCH_OPS_VERSION,
      status: "graph_build_failed",
      build: normalizeGraphBuild(await store.findOne("research_graph_builds", { id: graphBuildId })),
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
      error: message,
      actionsTaken: []
    };
  }
}

function buildResearchWorkerTaskEnvelope({ run, source, actorUserId = null, workerMode }) {
  const parsedUrl = validateUrl(source.base_url);
  return {
    schemaVersion: "brainstyworkers.research_worker_task.v1",
    taskId: run.id,
    adapter: workerMode,
    intent: "approved_source_read_only_research",
    actorUserId,
    workflowKey: run.workflow_key ?? "general_rag",
    topic: run.topic ?? source.title,
    source: {
      id: source.id,
      sourceKey: source.source_key,
      title: source.title,
      url: parsedUrl.href,
      status: source.status,
      authorityLevel: source.authority_level
    },
    payload: {
      query: parseJson(run.query_json, {}),
      approvedSourceUrl: parsedUrl.href
    },
    controls: {
      readOnly: true,
      approvedSourceOnly: true,
      allowedDomains: [parsedUrl.hostname],
      allowedActions: [
        "open_approved_source",
        "read_only_browser_observation",
        "read_only_scrape",
        "dom_or_accessibility_extract",
        "screenshot_or_ocr_extract_when_available",
        "summarize_with_source_pointers"
      ],
      disallowedActions: [
        "credential_entry",
        "password_manager_use",
        "captcha_or_2fa_bypass",
        "form_submission",
        "payer_contact",
        "external_message",
        "account_or_record_modification",
        "medical_advice",
        "raw_private_data_dump"
      ],
      resultMustBePendingReview: true,
      trustedRetrievalRequiresArtifactReview: true,
      progressCadenceSeconds: 30
    },
    expectedResultSchema: {
      status: "success | partial | blocked",
      answer: "string",
      evidence: [{ source: "string", details: "string", confidence: "high | medium | low" }],
      sourcePointers: [{ url: "string", title: "string", kind: "string" }],
      actionsTaken: ["string"],
      blockers: ["string"],
      uncertainties: ["string"],
      recommendedNextSteps: ["string"]
    },
    createdAt: nowIso(),
    version: RESEARCH_OPS_VERSION
  };
}

function researchWorkerPrompt(taskEnvelope) {
  return [
    "You are a bounded OpenClaw/Hermes research worker for Brainstyworkers.",
    "Use only the approved read-only source and task envelope below.",
    "Do not choose healthcare workflows, contact payers, submit forms, enter credentials, bypass auth, send messages, modify records, or give medical advice.",
    "Try appropriate read-only methods available to your worker runtime: browser observation, DOM/accessibility extraction, visible text scraping, screenshot/OCR if available, and concise reasoning over the observed material.",
    "Return ONLY strict JSON matching this schema:",
    JSON.stringify(taskEnvelope.expectedResultSchema),
    "Task envelope:",
    JSON.stringify(taskEnvelope)
  ].join("\n\n");
}

function extractJsonCandidate(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue below.
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    try {
      return JSON.parse(fenced.trim());
    } catch {
      // Continue below.
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function commandOutputText(payload) {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return String(payload);
  return (
    payload.answer ??
    payload.result ??
    payload.response ??
    payload.final_response ??
    payload.finalResponse ??
    payload.message ??
    payload.output ??
    payload.stdout ??
    payload.text ??
    JSON.stringify(payload)
  );
}

function normalizeWorkerResult(raw, { workerMode, taskEnvelope }) {
  const nested = extractJsonCandidate(commandOutputText(raw));
  const candidate = nested ?? (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null);
  const inner = extractJsonCandidate(commandOutputText(candidate));
  const parsed = inner ?? candidate;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ResearchOpsError(`${workerMode} worker did not return a structured JSON result.`, 502);
  }
  const status = String(parsed.status ?? (parsed.success === false ? "blocked" : "partial")).toLowerCase();
  if (!["success", "partial", "blocked"].includes(status)) {
    throw new ResearchOpsError(`${workerMode} worker returned unsupported status: ${status}.`, 502);
  }
  const answer = safePreview(parsed.answer ?? parsed.result ?? parsed.summary ?? parsed.response ?? "", 2000);
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence.slice(0, 20).map((item) => ({
        source: safePreview(item?.source ?? item?.url ?? taskEnvelope.source.url, 500),
        details: safePreview(item?.details ?? item?.text ?? item?.summary ?? "", 1200),
        confidence: ["high", "medium", "low"].includes(String(item?.confidence ?? "").toLowerCase()) ? String(item.confidence).toLowerCase() : "medium"
      }))
    : [];
  const sourcePointers = Array.isArray(parsed.sourcePointers ?? parsed.source_pointers)
    ? (parsed.sourcePointers ?? parsed.source_pointers).slice(0, 20).map((item) => ({
        url: safePreview(item?.url ?? taskEnvelope.source.url, 500),
        title: safePreview(item?.title ?? item?.source ?? taskEnvelope.source.title, 500),
        kind: safePreview(item?.kind ?? "worker_observed_source", 120)
      }))
    : [
        {
          url: taskEnvelope.source.url,
          title: taskEnvelope.source.title,
          kind: "approved_source"
        }
      ];
  const actionsTaken = Array.isArray(parsed.actionsTaken ?? parsed.actions_taken)
    ? (parsed.actionsTaken ?? parsed.actions_taken).map((item) => safePreview(item, 160)).filter(Boolean)
    : [`${workerMode}_worker_structured_result_returned`];
  const blockers = Array.isArray(parsed.blockers)
    ? parsed.blockers.map((item) => safePreview(item, 500)).filter(Boolean)
    : parsed.blocker
      ? [safePreview(parsed.blocker, 500)]
      : [];
  if (!answer && !evidence.length && !blockers.length) {
    throw new ResearchOpsError(`${workerMode} worker result had no answer, evidence, or blocker.`, 502);
  }
  return {
    status,
    answer,
    evidence,
    sourcePointers,
    actionsTaken,
    blockers,
    uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map((item) => safePreview(item, 500)).filter(Boolean) : [],
    recommendedNextSteps: Array.isArray(parsed.recommendedNextSteps ?? parsed.recommended_next_steps)
      ? (parsed.recommendedNextSteps ?? parsed.recommended_next_steps).map((item) => safePreview(item, 500)).filter(Boolean)
      : [],
    confidence: Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : status === "success" ? 0.8 : 0.45
  };
}

async function createResearchRunEvent(store, { runId, eventType, status, summary, payload = {} }) {
  const event = {
    id: createId("research_event"),
    run_id: runId,
    event_type: eventType,
    status,
    summary,
    payload_json: json({ ...payload, version: RESEARCH_OPS_VERSION }),
    created_at: nowIso()
  };
  await store.insert("research_run_events", event);
  return normalizeRunEvent(event);
}

async function createResearchArtifact(
  store,
  {
    runId,
    sourceId,
    artifactType,
    sourceUrl,
    title,
    rawText,
    extractedText,
    citationStatus,
    metadata = {}
  }
) {
  const time = nowIso();
  const contentHash = sha256(rawText);
  const extractionHash = sha256(extractedText);
  const artifactDir = resolve(researchArtifactDir());
  await mkdir(artifactDir, { recursive: true });
  const rawArtifactPath = join(artifactDir, `${runId}-${contentHash.slice(0, 16)}.txt`);
  await writeFile(rawArtifactPath, rawText, "utf8");
  const row = {
    id: createId("research_artifact"),
    run_id: runId,
    source_id: sourceId ?? null,
    artifact_type: artifactType,
    source_url: sourceUrl,
    title: title || null,
    content_hash: contentHash,
    extraction_hash: extractionHash,
    safe_text_preview: safePreview(extractedText),
    citation_status: citationStatus,
    metadata_json: json({
      ...metadata,
      rawArtifactPath,
      rawArtifactStored: true,
      safePreviewRedacted: true,
      trustedRetrieval: citationStatus === TRUSTED_ARTIFACT_STATUS,
      version: RESEARCH_OPS_VERSION
    }),
    created_at: time
  };
  await store.insert("research_artifacts", row);
  return normalizeArtifact(row);
}

export async function ingestResearchDocumentUpload(
  store,
  {
    actorUserId = null,
    filename = "research-document.pdf",
    contentType = "application/pdf",
    contentBase64,
    title = null,
    workflowKeys = ["general_rag"],
    documentKind = "research_knowledge_base_pdf",
    sourceStatus = "approved",
    authorityLevel = "operator_uploaded",
    topic = ""
  } = {}
) {
  const normalizedContentType = normalizeContentType(contentType);
  if (!RESEARCH_UPLOAD_CONTENT_TYPES.has(normalizedContentType)) {
    throw new ResearchOpsError("Research document upload supports PDF, plain text, markdown, or CSV only.", 400);
  }
  if (!contentBase64) throw new ResearchOpsError("Research document upload requires contentBase64.", 400);
  const buffer = decodeBase64Upload(contentBase64);
  if (!buffer.length) throw new ResearchOpsError("Research document upload is empty.", 400);
  if (buffer.byteLength > MAX_RESEARCH_UPLOAD_BYTES) {
    throw new ResearchOpsError(`Research document upload exceeds the configured ${MAX_RESEARCH_UPLOAD_BYTES} byte limit.`, 413);
  }
  if (!SOURCE_STATUSES.has(sourceStatus) || sourceStatus === "rejected" || sourceStatus === "disabled") {
    throw new ResearchOpsError("Research document source status must be approved, active, active_registry, enabled, or pending_review.", 400);
  }
  const safeName = safeFilename(filename, normalizedContentType === "application/pdf" ? "research-document.pdf" : "research-document.txt");
  const extracted = await extractResearchDocumentUpload(buffer, { contentType: normalizedContentType, filename: safeName });
  const extractedText = String(extracted.text ?? "").trim();
  if (!extractedText) {
    throw new ResearchOpsError(`Research document extraction failed: ${(extracted.blockers ?? []).join("; ") || "no readable text"}`, 422);
  }
  const time = nowIso();
  const uploadSha256 = sha256(buffer);
  const sourceKey = `research_upload_${slug(title || safeName)}_${uploadSha256.slice(0, 12)}`;
  const existing = await store.findOne("knowledge_sources", { source_key: sourceKey });
  if (existing) throw new ResearchOpsError("This research document upload already exists as a knowledge source.", 409);
  const sourceUrl = `https://local.research-upload.invalid/${uploadSha256.slice(0, 16)}/${encodeURIComponent(safeName)}`;
  const sourceRow = {
    id: createId("ksrc"),
    source_key: sourceKey,
    title: safePreview(title || safeName, 240),
    source_type: "uploaded_research_document",
    authority_level: authorityLevel,
    base_url: sourceUrl,
    workflow_keys_json: json(Array.isArray(workflowKeys) ? workflowKeys.slice(0, 12) : ["general_rag"]),
    refresh_policy: "manual_reupload_required",
    access_method: "operator_upload_local_extraction",
    status: sourceStatus,
    priority: 250,
    last_run_at: time,
    last_status: "completed",
    metadata_json: json({
      documentKind,
      filename: safeName,
      contentType: normalizedContentType,
      byteSize: buffer.byteLength,
      uploadSha256,
      localUploadPath: extracted.localUploadPath ? "[local-research-upload-store]" : null,
      rawDocumentReturned: false,
      rawTextReturned: false,
      createdVia: "research_document_upload_api",
      version: RESEARCH_OPS_VERSION
    }),
    proposed_by: actorUserId,
    approved_by: ACTIVE_SOURCE_STATUSES.has(sourceStatus) ? actorUserId : null,
    reviewed_at: ACTIVE_SOURCE_STATUSES.has(sourceStatus) ? time : null,
    created_at: time,
    updated_at: time
  };
  await store.insert("knowledge_sources", sourceRow);
  const runRow = {
    id: createId("research_run"),
    source_id: sourceRow.id,
    source_key: sourceRow.source_key,
    actor_user_id: actorUserId,
    run_type: "manual_research_document_upload",
    workflow_key: Array.isArray(workflowKeys) && workflowKeys[0] ? workflowKeys[0] : "general_rag",
    status: "completed",
    topic: safePreview(topic || title || safeName, 240),
    query_json: json({
      documentKind,
      filename: safeName,
      contentType: normalizedContentType,
      uploadSha256,
      operatorUploadedDocument: true
    }),
    summary: `Research document upload extracted ${extractedText.length} characters from ${safeName}; artifact is pending citation review.`,
    retry_of_run_id: null,
    metadata_json: json({
      documentKind,
      extractionStatus: extracted.status,
      extractionMethod: extracted.method,
      pageCount: extracted.pageCount,
      blockers: extracted.blockers ?? [],
      version: RESEARCH_OPS_VERSION
    }),
    started_at: time,
    completed_at: time,
    created_at: time,
    updated_at: time
  };
  await store.insert("research_runs", runRow);
  const artifact = await createResearchArtifact(store, {
    runId: runRow.id,
    sourceId: sourceRow.id,
    artifactType: normalizedContentType === "application/pdf" ? "operator_uploaded_pdf_extraction" : "operator_uploaded_text_extraction",
    sourceUrl,
    title: sourceRow.title,
    rawText: [
      `Research document upload: ${safeName}`,
      `Upload SHA-256: ${uploadSha256}`,
      `Extraction method: ${extracted.method}`,
      "",
      extractedText
    ].join("\n"),
    extractedText,
    citationStatus: PENDING_ARTIFACT_STATUS,
    metadata: {
      documentKind,
      filename: safeName,
      contentType: normalizedContentType,
      byteSize: buffer.byteLength,
      uploadSha256,
      extractionMethod: extracted.method,
      extractionStatus: extracted.status,
      pageCount: extracted.pageCount,
      blockers: extracted.blockers ?? [],
      localUploadPath: extracted.localUploadPath ? "[local-research-upload-store]" : null,
      rawDocumentReturned: false,
      rawTextReturned: false,
      actorUserId
    }
  });
  const event = await createResearchRunEvent(store, {
    runId: runRow.id,
    eventType: "research_document_upload_extracted",
    status: "completed",
    summary: `Operator research document ${safeName} was extracted into a pending-review artifact.`,
    payload: {
      actorUserId,
      sourceId: sourceRow.id,
      artifactId: artifact.id,
      contentType: normalizedContentType,
      byteSize: buffer.byteLength,
      uploadSha256,
      extractionHash: artifact.extractionHash,
      citationStatus: artifact.citationStatus,
      rawDocumentReturned: false,
      rawTextReturned: false
    }
  });
  const auditEvent = await audit(store, null, "research_document_uploaded", {
    actorUserId,
    sourceId: sourceRow.id,
    sourceKey: sourceRow.source_key,
    runId: runRow.id,
    artifactId: artifact.id,
    filenameHash: sha256(safeName),
    contentType: normalizedContentType,
    byteSize: buffer.byteLength,
    uploadSha256,
    extractionHash: artifact.extractionHash,
    citationStatus: artifact.citationStatus,
    rawDocumentReturned: false,
    rawTextReturned: false,
    trustedRetrievalReady: false
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    status: "research_document_upload_extracted",
    document: {
      filename: safeName,
      contentType: normalizedContentType,
      byteSize: buffer.byteLength,
      uploadSha256,
      extractionStatus: extracted.status,
      extractionMethod: extracted.method,
      pageCount: extracted.pageCount,
      blockers: extracted.blockers ?? [],
      rawDocumentReturned: false,
      rawTextReturned: false
    },
    source: normalizeSource(sourceRow),
    run: normalizeRun(runRow),
    artifact,
    event,
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
    safety: {
      operatorOnly: true,
      localExtractionOnly: true,
      rawDocumentReturned: false,
      rawTextReturned: false,
      artifactPendingReview: true,
      trustedRetrievalReady: false,
      userAnswerEligibleBeforeReview: false
    },
    actionsTaken: ["research_document_upload_stored", "local_document_text_extracted", "pending_review_artifact_created"]
  };
}

async function sourceByIdOrKey(store, { sourceId = null, sourceKey = null } = {}) {
  if (sourceId) return store.findOne("knowledge_sources", { id: sourceId });
  if (sourceKey) return store.findOne("knowledge_sources", { source_key: sourceKey });
  return store.get("SELECT * FROM knowledge_sources WHERE status IN ('active_registry', 'approved', 'active', 'enabled') ORDER BY priority ASC, title ASC LIMIT 1;");
}

export async function getResearchEmbeddingStatus(store) {
  const route = await ensureDefaultEmbeddingRoute(store);
  const [latestJob, trustedArtifacts, activeIndex, staleArtifacts, failedJobs] = await Promise.all([
    store.get("SELECT * FROM research_embedding_jobs ORDER BY created_at DESC LIMIT 1;"),
    store.get(`SELECT COUNT(*) AS count FROM research_artifacts WHERE citation_status = ${sql(TRUSTED_ARTIFACT_STATUS)};`),
    store.get(
      `SELECT COUNT(DISTINCT artifact_id) AS count
       FROM research_embedding_index
       WHERE route_key = ${sql(route.routeKey)}
         AND status = ${sql(EMBEDDING_INDEX_STATUS_ACTIVE)};`
    ),
    store.get(
      `SELECT COUNT(*) AS count
       FROM research_artifacts artifacts
       WHERE artifacts.citation_status = ${sql(TRUSTED_ARTIFACT_STATUS)}
         AND NOT EXISTS (
           SELECT 1 FROM research_embedding_index idx
           WHERE idx.artifact_id = artifacts.id
             AND idx.route_key = ${sql(route.routeKey)}
             AND idx.status = ${sql(EMBEDDING_INDEX_STATUS_ACTIVE)}
         );`
    ),
    store.get("SELECT COUNT(*) AS count FROM research_embedding_jobs WHERE status = 'failed';")
  ]);
  const mismatch = await store.get(
    `SELECT COUNT(*) AS count
     FROM research_embedding_index
     WHERE route_key = ${sql(route.routeKey)}
       AND status = ${sql(EMBEDDING_INDEX_STATUS_ACTIVE)}
       AND dimensions <> ${sql(route.dimensions)};`
  );
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    route,
    latestJob: normalizeEmbeddingJob(latestJob),
    counts: {
      trustedArtifacts: trustedArtifacts?.count ?? 0,
      activeIndexedArtifacts: activeIndex?.count ?? 0,
      staleTrustedArtifacts: staleArtifacts?.count ?? 0,
      failedJobs: failedJobs?.count ?? 0,
      dimensionMismatches: mismatch?.count ?? 0
    },
    safety: {
      indexesOnlyApprovedEvidence: true,
      rawArtifactTextStoredInIndex: false,
      pendingArtifactsIndexed: false,
      priorIndexRowsSupersededOnlyAfterSuccessfulReindex: true
    }
  };
}

export async function chooseResearchEmbeddingRoute(
  store,
  { actorUserId = null, provider = null, model = null, dimensions = null, status = "active", reason = "" } = {}
) {
  const selectedProvider = provider || process.env.BRAINSTY_RESEARCH_EMBEDDING_PROVIDER || "local_tfidf";
  if (!EMBEDDING_ROUTE_PROVIDERS.has(selectedProvider)) {
    throw new ResearchOpsError("Unsupported research embedding provider.", 400);
  }
  if (!EMBEDDING_ROUTE_STATUSES.has(status)) {
    throw new ResearchOpsError("Unsupported research embedding route status.", 400);
  }
  const defaults = embeddingRouteDefaults(selectedProvider);
  const parsedDimensions = Number(dimensions ?? defaults.dimensions);
  if (!Number.isInteger(parsedDimensions) || parsedDimensions < 8 || parsedDimensions > 4096) {
    throw new ResearchOpsError("Embedding dimensions must be an integer between 8 and 4096.", 400);
  }
  const time = nowIso();
  const existing = await store.findOne("research_embedding_routes", { route_key: EMBEDDING_ROUTE_KEY });
  const activeIndexRows = await store.get(
    `SELECT COUNT(*) AS count
     FROM research_embedding_index
     WHERE route_key = ${sql(EMBEDDING_ROUTE_KEY)}
       AND status = ${sql(EMBEDDING_INDEX_STATUS_ACTIVE)};`
  );
  const metadata = {
    ...(existing ? parseJson(existing.metadata_json, {}) : {}),
    reason: safePreview(reason),
    selectedVia: "operator_research_api",
    activeIndexRowsAtSelection: activeIndexRows?.count ?? 0,
    requiresReindex: Boolean(existing && (existing.provider !== selectedProvider || existing.model !== (model || defaults.model) || Number(existing.dimensions) !== parsedDimensions)),
    indexesOnlyApprovedEvidence: true,
    version: RESEARCH_OPS_VERSION
  };
  const row = {
    id: existing?.id ?? createId("research_embedding_route"),
    route_key: EMBEDDING_ROUTE_KEY,
    provider: selectedProvider,
    model: model || defaults.model,
    dimensions: parsedDimensions,
    status,
    selected_by: actorUserId,
    selected_at: time,
    metadata_json: json(metadata),
    created_at: existing?.created_at ?? time,
    updated_at: time
  };
  if (existing) {
    await store.update(
      "research_embedding_routes",
      {
        provider: row.provider,
        model: row.model,
        dimensions: row.dimensions,
        status: row.status,
        selected_by: row.selected_by,
        selected_at: row.selected_at,
        metadata_json: row.metadata_json,
        updated_at: row.updated_at
      },
      { route_key: EMBEDDING_ROUTE_KEY }
    );
  } else {
    await store.insert("research_embedding_routes", row);
  }
  const auditEvent = await audit(store, null, "research_embedding_route_selected", {
    actorUserId,
    routeKey: EMBEDDING_ROUTE_KEY,
    provider: selectedProvider,
    model: row.model,
    dimensions: parsedDimensions,
    status,
    reasonHash: reason ? sha256(safePreview(reason)) : null,
    requiresReindex: metadata.requiresReindex,
    activeIndexRowsAtSelection: metadata.activeIndexRowsAtSelection
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    route: normalizeEmbeddingRoute(await store.findOne("research_embedding_routes", { route_key: EMBEDDING_ROUTE_KEY })),
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

async function finishEmbeddingJob(store, { jobId, status, failureReason = null, metadata = {}, indexedCount = 0, skippedCount = 0 }) {
  const time = nowIso();
  await store.update(
    "research_embedding_jobs",
    {
      status,
      indexed_count: indexedCount,
      skipped_count: skippedCount,
      failure_reason: failureReason,
      metadata_json: json({ ...metadata, version: RESEARCH_OPS_VERSION }),
      completed_at: time,
      updated_at: time
    },
    { id: jobId }
  );
  return normalizeEmbeddingJob(await store.findOne("research_embedding_jobs", { id: jobId }));
}

export async function reindexResearchEmbeddings(
  store,
  { actorUserId = null, routeKey = EMBEDDING_ROUTE_KEY, artifactIds = null, force = false } = {}
) {
  if (routeKey !== EMBEDDING_ROUTE_KEY) throw new ResearchOpsError("Only the default research embedding route is supported in this MVP.", 400);
  const route = await ensureDefaultEmbeddingRoute(store);
  if (route.status !== "active") throw new ResearchOpsError("Research embedding route is not active.", 409);
  const conditions = [`citation_status = ${sql(TRUSTED_ARTIFACT_STATUS)}`];
  if (Array.isArray(artifactIds) && artifactIds.length) {
    conditions.push(`id IN (${artifactIds.map(sql).join(", ")})`);
  }
  const artifacts = (await store.all(`SELECT * FROM research_artifacts WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC LIMIT 1000;`)).map(normalizeArtifact);
  const time = nowIso();
  const job = {
    id: createId("research_embedding_job"),
    route_key: route.routeKey,
    actor_user_id: actorUserId,
    job_type: "trusted_research_reindex",
    status: "running",
    artifact_count: artifacts.length,
    indexed_count: 0,
    skipped_count: 0,
    failure_reason: null,
    metadata_json: json({
      provider: route.provider,
      model: route.model,
      dimensions: route.dimensions,
      indexesOnlyApprovedEvidence: true,
      artifactIds: artifacts.map((artifact) => artifact.id),
      force,
      version: RESEARCH_OPS_VERSION
    }),
    started_at: time,
    completed_at: null,
    created_at: time,
    updated_at: time
  };
  await store.insert("research_embedding_jobs", job);
  try {
    const mismatch = await store.get(
      `SELECT * FROM research_embedding_index
       WHERE route_key = ${sql(route.routeKey)}
         AND status = ${sql(EMBEDDING_INDEX_STATUS_ACTIVE)}
         AND dimensions <> ${sql(route.dimensions)}
       LIMIT 1;`
    );
    if (mismatch && !force) {
      const failedJob = await finishEmbeddingJob(store, {
        jobId: job.id,
        status: "failed",
        failureReason: "blocked_dimension_mismatch",
        metadata: {
          provider: route.provider,
          model: route.model,
          expectedDimensions: route.dimensions,
          existingDimensions: mismatch.dimensions,
          existingIndexId: mismatch.id,
          nextAction: "Run an explicit force reindex after verifying that superseding the prior route is intended."
        }
      });
      const auditEvent = await audit(store, null, "research_embedding_reindex_blocked", {
        actorUserId,
        jobId: job.id,
        routeKey: route.routeKey,
        provider: route.provider,
        reason: "dimension_mismatch",
        expectedDimensions: route.dimensions,
        existingDimensions: mismatch.dimensions,
        actionsTaken: []
      });
      return {
        ok: false,
        version: RESEARCH_OPS_VERSION,
        status: "blocked_dimension_mismatch",
        route,
        job: failedJob,
        safety: {
          indexesOnlyApprovedEvidence: true,
          rawArtifactTextStoredInIndex: false,
          priorIndexRowsSupersededOnlyAfterSuccessfulReindex: true
        },
        audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
        actionsTaken: []
      };
    }
    if (!artifacts.length) {
      const completedJob = await finishEmbeddingJob(store, {
        jobId: job.id,
        status: "completed",
        metadata: { provider: route.provider, model: route.model, dimensions: route.dimensions, note: "No trusted artifacts available." }
      });
      const auditEvent = await audit(store, null, "research_embedding_reindex_completed", {
        actorUserId,
        jobId: job.id,
        routeKey: route.routeKey,
        provider: route.provider,
        artifactCount: 0,
        indexedCount: 0,
        skippedCount: 0
      });
      return {
        ok: true,
        version: RESEARCH_OPS_VERSION,
        status: "completed_no_trusted_artifacts",
        route,
        job: completedJob,
        safety: {
          indexesOnlyApprovedEvidence: true,
          rawArtifactTextStoredInIndex: false,
          priorIndexRowsSupersededOnlyAfterSuccessfulReindex: true
        },
        audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
        indexed: [],
        actionsTaken: ["research_embedding_reindex_checked_trusted_artifacts"]
      };
    }
    const texts = artifacts.map(embeddingTextForArtifact);
    const vectors = await vectorsForRoute(texts, route);
    const invalidVector = vectors.find((vector) => vector.length !== route.dimensions);
    if (invalidVector) {
      throw new ResearchOpsError(`Embedding vector dimension mismatch: expected ${route.dimensions}, received ${invalidVector.length}.`, 502);
    }
    const artifactIdList = artifacts.map((artifact) => artifact.id).map(sql).join(", ");
    await store.exec(
      `UPDATE research_embedding_index
       SET status = 'superseded', updated_at = ${sql(nowIso())}
       WHERE route_key = ${sql(route.routeKey)}
         AND artifact_id IN (${artifactIdList})
         AND status = ${sql(EMBEDDING_INDEX_STATUS_ACTIVE)};`
    );
    const indexed = [];
    for (let index = 0; index < artifacts.length; index += 1) {
      const artifact = artifacts[index];
      const vector = vectors[index];
      const vectorJson = json(vector);
      const row = {
        id: createId("research_embedding_index"),
        artifact_id: artifact.id,
        route_key: route.routeKey,
        provider: route.provider,
        model: route.model,
        dimensions: route.dimensions,
        vector_json: vectorJson,
        vector_hash: sha256(vectorJson),
        text_hash: sha256(texts[index]),
        source_hash: sha256(`${artifact.sourceUrl}|${artifact.contentHash}|${artifact.extractionHash}`),
        status: EMBEDDING_INDEX_STATUS_ACTIVE,
        job_id: job.id,
        metadata_json: json({
          title: safePreview(artifact.title ?? ""),
          sourceUrlHash: sha256(artifact.sourceUrl ?? ""),
          citationStatus: artifact.citationStatus,
          trustedRetrieval: true,
          rawArtifactTextStoredInIndex: false,
          version: RESEARCH_OPS_VERSION
        }),
        created_at: nowIso(),
        updated_at: nowIso()
      };
      await store.insert("research_embedding_index", row);
      indexed.push(normalizeEmbeddingIndex(row));
    }
    const completedJob = await finishEmbeddingJob(store, {
      jobId: job.id,
      status: "completed",
      indexedCount: indexed.length,
      skippedCount: artifacts.length - indexed.length,
      metadata: {
        provider: route.provider,
        model: route.model,
        dimensions: route.dimensions,
        indexedArtifactIds: indexed.map((item) => item.artifactId),
        rawArtifactTextStoredInIndex: false
      }
    });
    const auditEvent = await audit(store, null, "research_embedding_reindex_completed", {
      actorUserId,
      jobId: job.id,
      routeKey: route.routeKey,
      provider: route.provider,
      model: route.model,
      dimensions: route.dimensions,
      artifactCount: artifacts.length,
      indexedCount: indexed.length,
      skippedCount: artifacts.length - indexed.length,
      actionsTaken: ["research_embedding_vectors_written"]
    });
    return {
      ok: true,
      version: RESEARCH_OPS_VERSION,
      status: "completed",
      route,
      job: completedJob,
      indexed,
      safety: {
        indexesOnlyApprovedEvidence: true,
        rawArtifactTextStoredInIndex: false,
        priorIndexRowsSupersededOnlyAfterSuccessfulReindex: true
      },
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
      actionsTaken: ["research_embedding_vectors_written"]
    };
  } catch (error) {
    const message = error instanceof ResearchOpsError ? error.message : String(error?.message ?? error);
    const failedJob = await finishEmbeddingJob(store, {
      jobId: job.id,
      status: "failed",
      failureReason: error instanceof ResearchOpsError && error.statusCode === 424 ? "blocked_missing_openai_key" : safePreview(message, 500),
      metadata: {
        provider: route.provider,
        model: route.model,
        dimensions: route.dimensions,
        errorType: error?.name ?? "Error"
      },
      skippedCount: artifacts.length
    });
    const auditEvent = await audit(store, null, "research_embedding_reindex_failed", {
      actorUserId,
      jobId: job.id,
      routeKey: route.routeKey,
      provider: route.provider,
      errorType: error?.name ?? "Error",
      errorHash: sha256(message),
      actionsTaken: []
    });
    return {
      ok: false,
      version: RESEARCH_OPS_VERSION,
      status: failedJob.failureReason || "failed",
      route,
      job: failedJob,
      safety: {
        indexesOnlyApprovedEvidence: true,
        rawArtifactTextStoredInIndex: false,
        priorIndexRowsSupersededOnlyAfterSuccessfulReindex: true
      },
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
      actionsTaken: []
    };
  }
}

export function getResearchWorkerStatus() {
  const defaultMode = process.env.BRAINSTY_RESEARCH_WORKER_MODE || "deterministic_fetch";
  return {
    version: RESEARCH_OPS_VERSION,
    defaultMode,
    modes: {
      deterministicFetch: {
        enabled: true,
        mode: "deterministic_fetch",
        description: "Approved-source HTTP(S) fetch and local text extraction without LLM or browser worker execution.",
        maxBytes: MAX_FETCH_BYTES,
        artifactDir: researchArtifactDir()
      },
      mockWorker: {
        enabled: true,
        mode: "mock_worker",
        visibleInUi: true,
        trustedRetrieval: false,
        description: "Explicit fallback mode for demos when real workers or external sites are unavailable; outputs are marked untrusted."
      },
      openclaw: {
        enabled: adaptiveWorkerEnabled("openclaw"),
        mode: "openclaw",
        featureFlagRequired: "BRAINSTY_RESEARCH_OPENCLAW_ENABLED=1",
        adapter: "official_openclaw_cli_agent",
        typedEnvelope: "brainstyworkers.research_worker_task.v1",
        approvalGate: "approvedWorkerDispatch=true plus approved source/run",
        trustedRetrieval: false,
        artifactReviewRequired: true,
        description: "Official OpenClaw research worker dispatch is bounded to approved read-only sources and writes pending-review artifacts only."
      },
      hermes: {
        enabled: adaptiveWorkerEnabled("hermes"),
        mode: "hermes",
        featureFlagRequired: "BRAINSTY_RESEARCH_HERMES_ENABLED=1",
        adapter: "hermes_cli_oneshot",
        typedEnvelope: "brainstyworkers.research_worker_task.v1",
        approvalGate: "approvedWorkerDispatch=true plus approved source/run",
        trustedRetrieval: false,
        artifactReviewRequired: true,
        description: "Hermes research worker dispatch is bounded to approved read-only sources and writes pending-review artifacts only."
      }
    }
  };
}

export async function getResearchKpis(store) {
  const [
    totalSources,
    approvedSources,
    pendingSources,
    disabledSources,
    totalRuns,
    queuedRuns,
    completedRuns,
    artifactCount,
    pendingArtifacts,
    trustedArtifacts,
    quarantinedArtifacts,
    mockArtifacts,
    totalSchedules,
    activeSchedules,
    pausedSchedules,
    dueSchedules,
    cancelledRuns,
    feedbackCount,
    auditCount
  ] = await Promise.all([
    store.get("SELECT COUNT(*) AS count FROM knowledge_sources;"),
    store.get("SELECT COUNT(*) AS count FROM knowledge_sources WHERE status IN ('active_registry', 'approved', 'active', 'enabled');"),
    store.get("SELECT COUNT(*) AS count FROM knowledge_sources WHERE status = 'pending_review';"),
    store.get("SELECT COUNT(*) AS count FROM knowledge_sources WHERE status = 'disabled';"),
    store.get("SELECT COUNT(*) AS count FROM research_runs;"),
    store.get("SELECT COUNT(*) AS count FROM research_runs WHERE status IN ('queued', 'running');"),
    store.get("SELECT COUNT(*) AS count FROM research_runs WHERE status = 'completed';"),
    store.get("SELECT COUNT(*) AS count FROM research_artifacts;"),
    store.get(`SELECT COUNT(*) AS count FROM research_artifacts WHERE citation_status = ${sql(PENDING_ARTIFACT_STATUS)};`),
    store.get(`SELECT COUNT(*) AS count FROM research_artifacts WHERE citation_status = ${sql(TRUSTED_ARTIFACT_STATUS)};`),
    store.get(`SELECT COUNT(*) AS count FROM research_artifacts WHERE citation_status = ${sql(QUARANTINED_ARTIFACT_STATUS)};`),
    store.get(`SELECT COUNT(*) AS count FROM research_artifacts WHERE citation_status = ${sql(MOCK_UNTRUSTED_ARTIFACT_STATUS)};`),
    store.get("SELECT COUNT(*) AS count FROM research_schedules;"),
    store.get("SELECT COUNT(*) AS count FROM research_schedules WHERE status = 'active' AND approval_status = 'approved';"),
    store.get("SELECT COUNT(*) AS count FROM research_schedules WHERE status = 'paused';"),
    store.get(`SELECT COUNT(*) AS count FROM research_schedules WHERE status = 'active' AND approval_status = 'approved' AND next_run_at <= ${sql(nowIso())};`),
    store.get("SELECT COUNT(*) AS count FROM research_runs WHERE status = 'cancelled';"),
    store.get("SELECT COUNT(*) AS count FROM feedback_items;"),
    store.get("SELECT COUNT(*) AS count FROM audit_events;")
  ]);
  const latestRun = await store.get("SELECT * FROM research_runs ORDER BY created_at DESC LIMIT 1;");
  return {
    version: RESEARCH_OPS_VERSION,
    sources: {
      total: totalSources?.count ?? 0,
      approved: approvedSources?.count ?? 0,
      pendingReview: pendingSources?.count ?? 0,
      disabled: disabledSources?.count ?? 0
    },
    runs: {
      total: totalRuns?.count ?? 0,
      active: queuedRuns?.count ?? 0,
      completed: completedRuns?.count ?? 0,
      cancelled: cancelledRuns?.count ?? 0,
      latest: normalizeRun(latestRun)
    },
    artifacts: {
      total: artifactCount?.count ?? 0,
      pendingReview: pendingArtifacts?.count ?? 0,
      trustedRetrieval: trustedArtifacts?.count ?? 0,
      quarantined: quarantinedArtifacts?.count ?? 0,
      mockUntrusted: mockArtifacts?.count ?? 0
    },
    schedules: {
      total: totalSchedules?.count ?? 0,
      active: activeSchedules?.count ?? 0,
      paused: pausedSchedules?.count ?? 0,
      due: dueSchedules?.count ?? 0
    },
    reviewQueue: {
      pendingArtifacts: pendingArtifacts?.count ?? 0,
      feedbackItems: feedbackCount?.count ?? 0
    },
    audit: {
      totalEvents: auditCount?.count ?? 0
    }
  };
}

export async function getResearchBudgetStatus(store) {
  const policy = await ensureResearchBudgetPolicy(store);
  const usage = await getResearchBudgetUsage(store);
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    policy,
    usage,
    state: policy.enabled && !policy.killSwitchEnabled ? "enforcing" : "blocked",
    safety: {
      failClosed: policy.enforcementMode === "fail_closed",
      policyPersisted: true,
      killSwitchPersisted: true,
      rawPromptReturned: false,
      rawArtifactTextReturned: false
    }
  };
}

export async function updateResearchBudgetPolicy(
  store,
  { actorUserId = null, enabled = null, dailyRunLimit = null, dailyCostLimitCents = null, killSwitchEnabled = null, killSwitchReason = "", metadata = {} } = {}
) {
  const existing = await ensureResearchBudgetPolicy(store);
  const parsedRunLimit = dailyRunLimit === null || dailyRunLimit === undefined ? existing.dailyRunLimit : Number(dailyRunLimit);
  const parsedCostLimit = dailyCostLimitCents === null || dailyCostLimitCents === undefined ? existing.dailyCostLimitCents : Number(dailyCostLimitCents);
  if (!Number.isInteger(parsedRunLimit) || parsedRunLimit < 0 || parsedRunLimit > 10000) {
    throw new ResearchOpsError("Research daily run limit must be an integer between 0 and 10000.", 400);
  }
  if (!Number.isInteger(parsedCostLimit) || parsedCostLimit < 0 || parsedCostLimit > 100000000) {
    throw new ResearchOpsError("Research daily cost limit must be an integer between 0 and 100000000 cents.", 400);
  }
  const time = nowIso();
  await store.update(
    "research_budget_policies",
    {
      actor_user_id: actorUserId,
      enabled: enabled === null || enabled === undefined ? (existing.enabled ? 1 : 0) : (enabled ? 1 : 0),
      daily_run_limit: parsedRunLimit,
      daily_cost_limit_cents: parsedCostLimit,
      kill_switch_enabled: killSwitchEnabled === null || killSwitchEnabled === undefined ? (existing.killSwitchEnabled ? 1 : 0) : (killSwitchEnabled ? 1 : 0),
      kill_switch_reason: safePreview(killSwitchReason || existing.killSwitchReason || "", 300),
      enforcement_mode: "fail_closed",
      metadata_json: json({
        ...existing.metadata,
        ...metadata,
        updatedVia: "operator_research_api",
        version: RESEARCH_OPS_VERSION
      }),
      updated_at: time
    },
    { policy_key: RESEARCH_BUDGET_POLICY_KEY }
  );
  const policy = await ensureResearchBudgetPolicy(store);
  const event = await recordResearchBudgetEvent(store, {
    actorUserId,
    eventType: "policy_updated",
    estimatedCostCents: 0,
    status: "accepted",
    reason: policy.killSwitchEnabled ? "kill_switch_enabled" : "policy_updated",
    metadata: {
      enabled: policy.enabled,
      dailyRunLimit: policy.dailyRunLimit,
      dailyCostLimitCents: policy.dailyCostLimitCents,
      killSwitchEnabled: policy.killSwitchEnabled
    }
  });
  const usage = await getResearchBudgetUsage(store);
  const auditEvent = await audit(store, null, "research_budget_policy_updated", {
    actorUserId,
    policyKey: policy.policyKey,
    enabled: policy.enabled,
    dailyRunLimit: policy.dailyRunLimit,
    dailyCostLimitCents: policy.dailyCostLimitCents,
    killSwitchEnabled: policy.killSwitchEnabled,
    killSwitchReasonHash: policy.killSwitchReason ? sha256(policy.killSwitchReason) : null
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    policy,
    usage,
    event,
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
    safety: {
      failClosed: true,
      policyPersisted: true,
      rawReasonReturned: false
    }
  };
}

async function countBy(store, table, column) {
  const rows = await store.all(`SELECT ${column} AS key, COUNT(*) AS count FROM ${table} GROUP BY ${column} ORDER BY count DESC;`);
  return Object.fromEntries(rows.map((row) => [row.key ?? "none", Number(row.count ?? 0)]));
}

export async function getResearchAnalytics(store) {
  const [kpis, budget, worker, recentRuns, recentBudgetEvents, runStatusCounts, artifactStatusCounts, sourceStatusCounts, scheduleStatusCounts] = await Promise.all([
    getResearchKpis(store),
    getResearchBudgetStatus(store),
    Promise.resolve(getResearchWorkerStatus()),
    store.all("SELECT * FROM research_runs ORDER BY created_at DESC LIMIT 8;"),
    store.all("SELECT * FROM research_budget_events ORDER BY created_at DESC LIMIT 8;"),
    countBy(store, "research_runs", "status"),
    countBy(store, "research_artifacts", "citation_status"),
    countBy(store, "knowledge_sources", "status"),
    countBy(store, "research_schedules", "status")
  ]);
  const latestAudit = await store.get("SELECT event_type, created_at FROM audit_events ORDER BY created_at DESC LIMIT 1;");
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    generatedAt: nowIso(),
    kpis,
    budget,
    worker,
    distributions: {
      runStatuses: runStatusCounts,
      artifactCitationStatuses: artifactStatusCounts,
      sourceStatuses: sourceStatusCounts,
      scheduleStatuses: scheduleStatusCounts
    },
    recentRuns: recentRuns.map(normalizeRun),
    recentBudgetEvents: recentBudgetEvents.map(normalizeBudgetEvent),
    audit: {
      latestEventType: latestAudit?.event_type ?? null,
      latestEventAt: latestAudit?.created_at ?? null
    },
    safety: {
      readOnly: true,
      rawArtifactTextReturned: false,
      rawRunPayloadsReturned: false,
      sourcePointerPayloadsReturned: false,
      policyPersisted: true,
      killSwitchEnforced: true
    }
  };
}

export async function listResearchSources(store, { status = null, limit = 50 } = {}) {
  const where = status ? ` WHERE status = ${sql(status)}` : "";
  const rows = await store.all(
    `SELECT * FROM knowledge_sources${where} ORDER BY priority ASC, title ASC LIMIT ${Number(limit)};`
  );
  return {
    version: RESEARCH_OPS_VERSION,
    sources: rows.map(normalizeSource)
  };
}

export async function proposeResearchSource(
  store,
  { actorUserId = null, url, title = null, sourceType = "web_source", authorityLevel = "operator_proposed", workflowKeys = [], reason = "", priority = 500 }
) {
  const parsed = validateUrl(url);
  const sourceKey = `operator_${slug(title || parsed.hostname || parsed.href)}`;
  const existing = await store.findOne("knowledge_sources", { source_key: sourceKey });
  if (existing) {
    throw new ResearchOpsError("A source with the derived key already exists.", 409);
  }
  const time = nowIso();
  const row = {
    id: createId("ksrc"),
    source_key: sourceKey,
    title: title || parsed.hostname,
    source_type: sourceType,
    authority_level: authorityLevel,
    base_url: parsed.href,
    workflow_keys_json: json(workflowKeys),
    refresh_policy: "manual_review_required",
    access_method: "manual_or_deterministic_fetch_after_approval",
    status: "pending_review",
    priority: Number(priority),
    last_run_at: null,
    last_status: null,
    metadata_json: json({ reason, proposedVia: "operator_research_api", version: RESEARCH_OPS_VERSION }),
    proposed_by: actorUserId,
    approved_by: null,
    reviewed_at: null,
    created_at: time,
    updated_at: time
  };
  await store.insert("knowledge_sources", row);
  const auditEvent = await audit(store, null, "research_source_proposed", {
    sourceId: row.id,
    sourceKey: row.source_key,
    actorUserId,
    url: row.base_url,
    status: row.status
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    source: normalizeSource(row),
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

export async function reviewResearchSource(store, { sourceId, actorUserId = null, decision, reason = "" }) {
  if (!["approved", "rejected"].includes(decision)) {
    throw new ResearchOpsError("Source review decision must be approved or rejected.", 400);
  }
  const source = await store.findOne("knowledge_sources", { id: sourceId });
  if (!source) throw new ResearchOpsError("Research source not found.", 404);
  const status = decision === "approved" ? "approved" : "rejected";
  const time = nowIso();
  const nextMetadata = {
    ...parseJson(source.metadata_json, {}),
    reviewReason: reason,
    reviewedVia: "operator_research_api"
  };
  await store.update(
    "knowledge_sources",
    {
      status,
      approved_by: decision === "approved" ? actorUserId : null,
      reviewed_at: time,
      metadata_json: json(nextMetadata),
      updated_at: time
    },
    { id: sourceId }
  );
  const updated = await store.findOne("knowledge_sources", { id: sourceId });
  const auditEvent = await audit(store, null, `research_source_${decision}`, {
    sourceId,
    actorUserId,
    reason,
    status
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    source: normalizeSource(updated),
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

export async function updateResearchSource(store, { sourceId, actorUserId = null, patch = {} }) {
  const source = await store.findOne("knowledge_sources", { id: sourceId });
  if (!source) throw new ResearchOpsError("Research source not found.", 404);
  const updates = { updated_at: nowIso() };
  if (patch.title !== undefined) updates.title = String(patch.title).slice(0, 240);
  if (patch.status !== undefined) {
    if (!SOURCE_STATUSES.has(patch.status)) throw new ResearchOpsError("Unsupported source status.", 400);
    updates.status = patch.status;
  }
  if (patch.priority !== undefined) updates.priority = Number(patch.priority);
  if (patch.refreshPolicy !== undefined) updates.refresh_policy = String(patch.refreshPolicy).slice(0, 240);
  if (patch.accessMethod !== undefined) updates.access_method = String(patch.accessMethod).slice(0, 240);
  if (patch.workflowKeys !== undefined) updates.workflow_keys_json = json(patch.workflowKeys);
  if (patch.metadata !== undefined) {
    updates.metadata_json = json({
      ...parseJson(source.metadata_json, {}),
      ...patch.metadata,
      updatedVia: "operator_research_api"
    });
  }
  await store.update("knowledge_sources", updates, { id: sourceId });
  const updated = await store.findOne("knowledge_sources", { id: sourceId });
  const auditEvent = await audit(store, null, "research_source_updated", {
    sourceId,
    actorUserId,
    changedFields: Object.keys(updates).filter((key) => key !== "updated_at")
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    source: normalizeSource(updated),
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

export async function listResearchSchedules(store, { status = null, limit = 50 } = {}) {
  if (status && !RESEARCH_SCHEDULE_STATUSES.has(status)) {
    throw new ResearchOpsError("Unsupported research schedule status.", 400);
  }
  const where = status ? ` WHERE status = ${sql(status)}` : "";
  const bounded = boundedLimit(limit, 50, 200);
  const rows = await store.all(`SELECT * FROM research_schedules${where} ORDER BY next_run_at ASC, created_at DESC LIMIT ${bounded};`);
  const dueCount = await store.get(`SELECT COUNT(*) AS count FROM research_schedules WHERE status = 'active' AND approval_status = 'approved' AND next_run_at <= ${sql(nowIso())};`);
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    filters: { status, limit: bounded },
    dueCount: dueCount?.count ?? 0,
    schedules: rows.map(normalizeSchedule)
  };
}

export async function createResearchSchedule(
  store,
  {
    actorUserId = null,
    sourceId = null,
    sourceKey = null,
    scheduleKey = null,
    scheduleLabel = null,
    intervalHours = 24,
    nextRunAt = null,
    topic = "",
    workflowKey = "general_rag",
    query = {},
    workerMode = "deterministic_fetch",
    status = "active",
    approvalStatus = "approved",
    metadata = {}
  } = {}
) {
  if (!RESEARCH_SCHEDULE_STATUSES.has(status)) throw new ResearchOpsError("Unsupported research schedule status.", 400);
  if (!RESEARCH_SCHEDULE_APPROVAL_STATUSES.has(approvalStatus)) throw new ResearchOpsError("Unsupported research schedule approval status.", 400);
  if (!EXECUTABLE_WORKER_MODES.has(workerMode)) throw new ResearchOpsError(`Research worker mode is not configured for scheduled execution: ${workerMode}.`, 409);
  const parsedInterval = Number(intervalHours);
  if (!Number.isFinite(parsedInterval) || parsedInterval < 1 || parsedInterval > 24 * 30) {
    throw new ResearchOpsError("Research schedule interval must be between 1 hour and 720 hours.", 400);
  }
  const source = sourceId || sourceKey ? await sourceByIdOrKey(store, { sourceId, sourceKey }) : null;
  if ((sourceId || sourceKey) && !source) throw new ResearchOpsError("Research source not found for schedule.", 404);
  if (source && !ACTIVE_SOURCE_STATUSES.has(source.status)) {
    throw new ResearchOpsError("Research schedules can only target approved or active sources.", 409);
  }
  const time = nowIso();
  const key = scheduleKey ? normalizeScheduleKey(scheduleKey) : normalizeScheduleKey(`${source?.source_key ?? "priority_sources"}_${workflowKey}_${topic || "research"}_${parsedInterval}`);
  const existing = await store.findOne("research_schedules", { schedule_key: key });
  if (existing) throw new ResearchOpsError("A research schedule with the derived key already exists.", 409);
  const row = {
    id: createId("research_schedule"),
    schedule_key: key,
    actor_user_id: actorUserId,
    source_id: source?.id ?? null,
    source_key: source?.source_key ?? sourceKey ?? null,
    schedule_label: scheduleLabel || `Every ${parsedInterval}h research refresh`,
    interval_hours: Math.floor(parsedInterval),
    workflow_key: workflowKey,
    topic: String(topic || source?.title || "Scheduled research refresh").slice(0, 240),
    query_json: json(query),
    worker_mode: workerMode,
    status,
    approval_status: approvalStatus,
    next_run_at: nextRunAt || time,
    last_run_at: null,
    last_run_id: null,
    last_status: null,
    run_count: 0,
    metadata_json: json({ ...metadata, createdVia: "operator_research_schedule", version: RESEARCH_OPS_VERSION }),
    created_at: time,
    updated_at: time
  };
  await store.insert("research_schedules", row);
  const auditEvent = await audit(store, null, "research_schedule_created", {
    scheduleId: row.id,
    scheduleKey: row.schedule_key,
    actorUserId,
    sourceId: row.source_id,
    sourceKey: row.source_key,
    intervalHours: row.interval_hours,
    nextRunAt: row.next_run_at,
    workerMode: row.worker_mode,
    status: row.status,
    approvalStatus: row.approval_status
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    schedule: normalizeSchedule(row),
    source: normalizeSource(source),
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

export async function pauseResearchSchedule(store, { scheduleId, actorUserId = null, reason = "" } = {}) {
  const row = await store.findOne("research_schedules", { id: scheduleId });
  if (!row) throw new ResearchOpsError("Research schedule not found.", 404);
  const time = nowIso();
  await store.update(
    "research_schedules",
    {
      status: "paused",
      last_status: "paused",
      metadata_json: json({ ...parseJson(row.metadata_json, {}), pauseReason: safePreview(reason), pausedBy: actorUserId, pausedAt: time, version: RESEARCH_OPS_VERSION }),
      updated_at: time
    },
    { id: scheduleId }
  );
  const auditEvent = await audit(store, null, "research_schedule_paused", {
    scheduleId,
    actorUserId,
    reasonHash: reason ? sha256(safePreview(reason)) : null
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    schedule: normalizeSchedule(await store.findOne("research_schedules", { id: scheduleId })),
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

export async function resumeResearchSchedule(store, { scheduleId, actorUserId = null, reason = "", nextRunAt = null } = {}) {
  const row = await store.findOne("research_schedules", { id: scheduleId });
  if (!row) throw new ResearchOpsError("Research schedule not found.", 404);
  if (row.approval_status !== "approved") throw new ResearchOpsError("Only approved research schedules can be resumed.", 409);
  const time = nowIso();
  await store.update(
    "research_schedules",
    {
      status: "active",
      last_status: "resumed",
      next_run_at: nextRunAt || row.next_run_at || time,
      metadata_json: json({ ...parseJson(row.metadata_json, {}), resumeReason: safePreview(reason), resumedBy: actorUserId, resumedAt: time, version: RESEARCH_OPS_VERSION }),
      updated_at: time
    },
    { id: scheduleId }
  );
  const auditEvent = await audit(store, null, "research_schedule_resumed", {
    scheduleId,
    actorUserId,
    nextRunAt: nextRunAt || row.next_run_at || time,
    reasonHash: reason ? sha256(safePreview(reason)) : null
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    schedule: normalizeSchedule(await store.findOne("research_schedules", { id: scheduleId })),
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

export async function runDueResearchSchedules(
  store,
  { actorUserId = null, now = nowIso(), limit = 5, execute = false, workerMode = null, approvedWorkerDispatch = false } = {}
) {
  const bounded = boundedLimit(limit, 5, 25);
  const rows = await store.all(
    `SELECT * FROM research_schedules
     WHERE status = 'active'
       AND approval_status = 'approved'
       AND next_run_at <= ${sql(now)}
     ORDER BY next_run_at ASC, created_at ASC
     LIMIT ${bounded};`
  );
  const processed = [];
  const blocked = [];
  for (const row of rows) {
    const schedule = normalizeSchedule(row);
    const source = await sourceByIdOrKey(store, { sourceId: schedule.sourceId, sourceKey: schedule.sourceKey });
    if (!source || !ACTIVE_SOURCE_STATUSES.has(source.status)) {
      const time = nowIso();
      await store.update(
        "research_schedules",
        {
          last_run_at: time,
          last_status: "blocked_no_approved_source",
          next_run_at: addHoursIso(now, schedule.intervalHours),
          updated_at: time
        },
        { id: schedule.id }
      );
      const auditEvent = await audit(store, null, "research_schedule_blocked", {
        scheduleId: schedule.id,
        actorUserId,
        reason: "no_approved_source",
        sourceId: schedule.sourceId,
        sourceKey: schedule.sourceKey
      });
      blocked.push({
        schedule: normalizeSchedule(await store.findOne("research_schedules", { id: schedule.id })),
        reason: "no_approved_source",
        audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
      });
      continue;
    }
    try {
      const run = await startManualResearchRun(store, {
        actorUserId,
        sourceId: source.id,
        topic: schedule.topic || source.title,
        workflowKey: schedule.workflowKey,
        query: {
          ...schedule.query,
          scheduledAutomation: true,
          scheduleId: schedule.id,
          scheduleKey: schedule.scheduleKey
        },
        metadata: {
          scheduleId: schedule.id,
          scheduleKey: schedule.scheduleKey,
          scheduledRun: true,
          workerMode: workerMode ?? schedule.workerMode,
          version: RESEARCH_OPS_VERSION
        },
        runType: "scheduled_research_run"
      });
      let executed = null;
      if (execute) {
        executed = await executeResearchRun(store, {
          runId: run.run.id,
          actorUserId,
          workerMode: workerMode ?? schedule.workerMode,
          approvedWorkerDispatch
        });
      }
      const time = nowIso();
      const terminalStatus = executed?.run?.status ?? run.run.status;
      await store.update(
        "research_schedules",
        {
          last_run_at: time,
          last_run_id: run.run.id,
          last_status: terminalStatus,
          run_count: schedule.runCount + 1,
          next_run_at: addHoursIso(now, schedule.intervalHours),
          updated_at: time
        },
        { id: schedule.id }
      );
      const auditEvent = await audit(store, null, "research_schedule_tick_run_created", {
        scheduleId: schedule.id,
        scheduleKey: schedule.scheduleKey,
        actorUserId,
        runId: run.run.id,
        sourceId: source.id,
        sourceKey: source.source_key,
        execute: Boolean(execute),
        workerMode: workerMode ?? schedule.workerMode,
        nextRunAt: addHoursIso(now, schedule.intervalHours)
      });
      processed.push({
        schedule: normalizeSchedule(await store.findOne("research_schedules", { id: schedule.id })),
        run: executed?.run ?? run.run,
        source: normalizeSource(source),
        executed,
        audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
      });
    } catch (error) {
      if (!(error instanceof ResearchOpsError)) throw error;
      const time = nowIso();
      await store.update(
        "research_schedules",
        {
          last_run_at: time,
          last_status: "blocked_budget_or_execution",
          next_run_at: addHoursIso(now, schedule.intervalHours),
          updated_at: time
        },
        { id: schedule.id }
      );
      const auditEvent = await audit(store, null, "research_schedule_blocked", {
        scheduleId: schedule.id,
        actorUserId,
        reason: error.message,
        reasonHash: sha256(error.message),
        sourceId: source.id,
        sourceKey: source.source_key,
        budgetBlocked: Boolean(error.budget)
      });
      blocked.push({
        schedule: normalizeSchedule(await store.findOne("research_schedules", { id: schedule.id })),
        reason: error.budget ? "budget_or_kill_switch_blocked" : "execution_blocked",
        error: safePreview(error.message, 300),
        audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
      });
    }
  }
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    scheduler: {
      mode: execute ? "queue_and_execute_due_runs" : "queue_due_runs",
      now,
      processedCount: processed.length,
      blockedCount: blocked.length,
      actionsTaken: processed.map((item) => (execute ? `executed:${item.run.id}` : `queued:${item.run.id}`))
    },
    processed,
    blocked
  };
}

export async function listResearchRuns(store, { status = null, limit = 50 } = {}) {
  const where = status ? ` WHERE status = ${sql(status)}` : "";
  const rows = await store.all(
    `SELECT * FROM research_runs${where} ORDER BY created_at DESC LIMIT ${Number(limit)};`
  );
  return {
    version: RESEARCH_OPS_VERSION,
    runs: rows.map(normalizeRun)
  };
}

export async function getResearchRun(store, { runId }) {
  const row = await store.findOne("research_runs", { id: runId });
  if (!row) throw new ResearchOpsError("Research run not found.", 404);
  const [source, events, artifacts] = await Promise.all([
    row.source_id ? store.findOne("knowledge_sources", { id: row.source_id }) : Promise.resolve(null),
    store.list("research_run_events", { run_id: runId }),
    store.list("research_artifacts", { run_id: runId })
  ]);
  return {
    version: RESEARCH_OPS_VERSION,
    run: normalizeRun(row),
    source: normalizeSource(source),
    events: events.map(normalizeRunEvent),
    artifacts: artifacts.map(normalizeArtifact)
  };
}

export async function listResearchRunEvents(store, { runId }) {
  await getResearchRun(store, { runId });
  const events = await store.list("research_run_events", { run_id: runId });
  return {
    version: RESEARCH_OPS_VERSION,
    runId,
    events: events.map(normalizeRunEvent)
  };
}

export async function listResearchArtifacts(store, { citationStatus = null, runId = null, sourceId = null, limit = 50 } = {}) {
  const conditions = [];
  if (citationStatus) conditions.push(`citation_status = ${sql(citationStatus)}`);
  if (runId) conditions.push(`run_id = ${sql(runId)}`);
  if (sourceId) conditions.push(`source_id = ${sql(sourceId)}`);
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const bounded = boundedLimit(limit, 50, 200);
  const rows = await store.all(`SELECT * FROM research_artifacts${where} ORDER BY created_at DESC LIMIT ${bounded};`);
  const [pending, trusted, quarantined, mockUntrusted] = await Promise.all([
    store.get(`SELECT COUNT(*) AS count FROM research_artifacts WHERE citation_status = ${sql(PENDING_ARTIFACT_STATUS)};`),
    store.get(`SELECT COUNT(*) AS count FROM research_artifacts WHERE citation_status = ${sql(TRUSTED_ARTIFACT_STATUS)};`),
    store.get(`SELECT COUNT(*) AS count FROM research_artifacts WHERE citation_status = ${sql(QUARANTINED_ARTIFACT_STATUS)};`),
    store.get(`SELECT COUNT(*) AS count FROM research_artifacts WHERE citation_status = ${sql(MOCK_UNTRUSTED_ARTIFACT_STATUS)};`)
  ]);
  return {
    version: RESEARCH_OPS_VERSION,
    filters: { citationStatus, runId, sourceId, limit: bounded },
    artifacts: rows.map(normalizeArtifact),
    reviewQueue: {
      pendingArtifacts: pending?.count ?? 0,
      trustedRetrieval: trusted?.count ?? 0,
      quarantined: quarantined?.count ?? 0,
      mockUntrusted: mockUntrusted?.count ?? 0
    }
  };
}

export async function reviewResearchArtifact(store, { artifactId, actorUserId = null, decision, reason = "" }) {
  if (!["approve", "quarantine", "reject", "needs_review"].includes(decision)) {
    throw new ResearchOpsError("Artifact review decision must be approve, quarantine, reject, or needs_review.", 400);
  }
  const artifactRow = await store.findOne("research_artifacts", { id: artifactId });
  if (!artifactRow) throw new ResearchOpsError("Research artifact not found.", 404);
  const artifact = normalizeArtifact(artifactRow);
  if (decision === "approve" && artifact.citationStatus === MOCK_UNTRUSTED_ARTIFACT_STATUS) {
    throw new ResearchOpsError("MockWorker artifacts cannot be approved for trusted retrieval.", 409);
  }
  if (decision === "approve" && String(artifact.artifactType ?? "").includes("mock_worker")) {
    throw new ResearchOpsError("MockWorker artifacts cannot be approved for trusted retrieval.", 409);
  }

  const nextStatus =
    decision === "approve"
      ? TRUSTED_ARTIFACT_STATUS
      : decision === "needs_review"
        ? PENDING_ARTIFACT_STATUS
        : QUARANTINED_ARTIFACT_STATUS;
  const eventType =
    nextStatus === TRUSTED_ARTIFACT_STATUS
      ? "research_artifact_approved"
      : nextStatus === QUARANTINED_ARTIFACT_STATUS
        ? "research_artifact_quarantined"
        : "research_artifact_marked_needs_review";
  const time = nowIso();
  const safeReason = safePreview(reason);
  const metadata = {
    ...artifact.metadata,
    citationReview: {
      decision,
      reason: safeReason,
      actorUserId,
      reviewedAt: time,
      previousCitationStatus: artifact.citationStatus,
      nextCitationStatus: nextStatus
    },
    trustedRetrieval: nextStatus === TRUSTED_ARTIFACT_STATUS,
    version: RESEARCH_OPS_VERSION
  };
  await store.update(
    "research_artifacts",
    {
      citation_status: nextStatus,
      metadata_json: json(metadata)
    },
    { id: artifactId }
  );
  const event = await createResearchRunEvent(store, {
    runId: artifact.runId,
    eventType,
    status: nextStatus,
    summary:
      nextStatus === TRUSTED_ARTIFACT_STATUS
        ? `Artifact approved for trusted retrieval: ${artifact.title ?? artifact.id}.`
        : nextStatus === QUARANTINED_ARTIFACT_STATUS
          ? `Artifact quarantined from trusted retrieval: ${artifact.title ?? artifact.id}.`
          : `Artifact returned to pending review: ${artifact.title ?? artifact.id}.`,
    payload: {
      actorUserId,
      artifactId,
      sourceId: artifact.sourceId,
      previousCitationStatus: artifact.citationStatus,
      citationStatus: nextStatus,
      contentHash: artifact.contentHash,
      extractionHash: artifact.extractionHash,
      reasonHash: safeReason ? sha256(safeReason) : null
    }
  });
  const auditEvent = await audit(store, null, eventType, {
    artifactId,
    runId: artifact.runId,
    sourceId: artifact.sourceId,
    actorUserId,
    decision,
    previousCitationStatus: artifact.citationStatus,
    citationStatus: nextStatus,
    contentHash: artifact.contentHash,
    extractionHash: artifact.extractionHash,
    reasonHash: safeReason ? sha256(safeReason) : null
  });
  const updated = normalizeArtifact(await store.findOne("research_artifacts", { id: artifactId }));
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    artifact: updated,
    event,
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

export async function searchResearchEvidence(
  store,
  { query = "", includePending = false, citationStatus = null, runId = null, sourceId = null, limit = 10 } = {}
) {
  const bounded = boundedLimit(limit, 10, 50);
  const tokens = tokenize(query);
  const statuses = citationStatus
    ? [citationStatus]
    : includePending
      ? [TRUSTED_ARTIFACT_STATUS, PENDING_ARTIFACT_STATUS]
      : [TRUSTED_ARTIFACT_STATUS];
  const conditions = [`citation_status IN (${statuses.map(sql).join(", ")})`];
  if (runId) conditions.push(`run_id = ${sql(runId)}`);
  if (sourceId) conditions.push(`source_id = ${sql(sourceId)}`);
  const rows = await store.all(
    `SELECT * FROM research_artifacts WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 500;`
  );
  const artifacts = rows.map(normalizeArtifact);
  let embeddingSearch = {
    used: false,
    status: "not_indexed_or_no_query",
    route: null,
    indexedCandidateCount: 0,
    message: "Lexical trusted-evidence search was used."
  };
  const embeddingScores = new Map();
  if (String(query ?? "").trim() && artifacts.length) {
    try {
      const route = await ensureDefaultEmbeddingRoute(store);
      const indexRows = await store.all(
        `SELECT * FROM research_embedding_index
         WHERE route_key = ${sql(route.routeKey)}
           AND status = ${sql(EMBEDDING_INDEX_STATUS_ACTIVE)}
           AND artifact_id IN (${artifacts.map((artifact) => sql(artifact.id)).join(", ")});`
      );
      if (indexRows.length) {
        const [queryVector] = await vectorsForRoute([query], route);
        for (const row of indexRows) {
          const vector = parseVectorJson(row.vector_json);
          if (vector.length === route.dimensions && queryVector.length === route.dimensions) {
            embeddingScores.set(row.artifact_id, Math.max(0, cosineSimilarity(queryVector, vector)) * 10);
          }
        }
        embeddingSearch = {
          used: embeddingScores.size > 0,
          status: embeddingScores.size > 0 ? "embedding_route_used" : "embedding_route_no_valid_vectors",
          route: { routeKey: route.routeKey, provider: route.provider, model: route.model, dimensions: route.dimensions },
          indexedCandidateCount: indexRows.length,
          message: embeddingScores.size > 0 ? "Selected embedding route contributed to trusted-evidence ranking." : "Indexed vectors existed but could not be scored."
        };
      } else {
        embeddingSearch = {
          used: false,
          status: "no_active_index_rows_for_candidates",
          route: { routeKey: route.routeKey, provider: route.provider, model: route.model, dimensions: route.dimensions },
          indexedCandidateCount: 0,
          message: "Run a trusted-evidence reindex after approving artifacts."
        };
      }
    } catch (error) {
      embeddingSearch = {
        used: false,
        status: error instanceof ResearchOpsError && error.statusCode === 424 ? "blocked_missing_openai_key" : "embedding_route_unavailable",
        route: null,
        indexedCandidateCount: 0,
        message: safePreview(error?.message ?? error)
      };
    }
  }
  const ranked = artifacts
    .map((artifact) => {
      const lexicalScore = scoreArtifact(artifact, tokens, query);
      const embeddingScore = embeddingScores.get(artifact.id) ?? 0;
      return {
        artifact,
        lexicalScore,
        embeddingScore,
        score: lexicalScore + embeddingScore
      };
    })
    .filter((item) => !tokens.length || item.score > 0)
    .sort((left, right) => right.score - left.score || String(right.artifact.createdAt).localeCompare(String(left.artifact.createdAt)))
    .slice(0, bounded)
    .map(({ artifact, score, lexicalScore, embeddingScore }) => ({
      artifactId: artifact.id,
      runId: artifact.runId,
      sourceId: artifact.sourceId,
      artifactType: artifact.artifactType,
      sourceUrl: artifact.sourceUrl,
      title: artifact.title,
      citationStatus: artifact.citationStatus,
      score: Number(score.toFixed(4)),
      lexicalScore: Number(lexicalScore.toFixed(4)),
      embeddingScore: Number(embeddingScore.toFixed(4)),
      embeddingRoute: embeddingSearch.route,
      confidence: score >= 8 ? "high" : score >= 3 ? "medium" : "low",
      snippet: evidenceSnippet(artifact, tokens),
      contentHash: artifact.contentHash,
      extractionHash: artifact.extractionHash,
      createdAt: artifact.createdAt
    }));

  const pendingRows = await store.all(
    `SELECT * FROM research_artifacts WHERE citation_status = ${sql(PENDING_ARTIFACT_STATUS)} ORDER BY created_at DESC LIMIT 500;`
  );
  const pendingMatches = pendingRows
    .map(normalizeArtifact)
    .filter((artifact) => !tokens.length || scoreArtifact(artifact, tokens, query) > 0);
  const trustedResultCount = ranked.filter((result) => result.citationStatus === TRUSTED_ARTIFACT_STATUS).length;
  const pendingReviewCount = pendingMatches.length;
  const status =
    trustedResultCount > 0
      ? "trusted_evidence_found"
      : pendingReviewCount > 0
        ? "pending_review_only"
        : "no_evidence_found";

  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    query,
    includePending: Boolean(includePending),
    citationStatus: citationStatus ?? null,
    status,
    embeddingSearch,
    trustedResultCount,
    pendingReviewCount,
    lowConfidence: trustedResultCount === 0,
    message:
      status === "trusted_evidence_found"
        ? "Trusted reviewed evidence is available for citation."
        : status === "pending_review_only"
          ? "Matching artifacts exist, but they are pending review and unavailable to trusted retrieval."
          : "No reviewed evidence matched the query.",
    results: ranked
  };
}

export async function evaluateCitationClosure(
  store,
  { actorUserId = null, question = "", answer = "", limit = 12, minSupportScore = 3 } = {}
) {
  const safeAnswer = safePreview(answer, 1200);
  if (!safeAnswer) throw new ResearchOpsError("Citation closure requires an answer to evaluate.", 400);
  const boundedClaimLimit = boundedLimit(limit, 12, 25);
  const supportThreshold = Math.max(1, Number(minSupportScore) || 3);
  const claims = extractAnswerClaims(answer, { maxClaims: boundedClaimLimit });
  const trustedArtifacts = await trustedArtifactsForClosure(store);
  const evaluatedClaims = [];

  for (const claim of claims) {
    const ranked = trustedArtifacts
      .map((artifact) => scoreClaimArtifact(claim, artifact))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || String(right.artifact.createdAt).localeCompare(String(left.artifact.createdAt)))
      .slice(0, 3);
    const pendingReviewMatches = ranked.length ? 0 : await pendingMatchCountForClaim(store, claim);
    const topScore = ranked[0]?.score ?? 0;
    const status = topScore >= supportThreshold ? "supported" : topScore > 0 ? "low_confidence" : "unsupported";
    evaluatedClaims.push({
      id: claim.id,
      text: claim.text,
      textHash: claim.textHash,
      status,
      supportScore: Number(topScore.toFixed(4)),
      supportThreshold,
      pendingReviewMatches,
      citations: ranked.map((item) => citationPointerFromResult(item.artifact, item.score, item.lexicalScore, claim.tokens)),
      explanation:
        status === "supported"
          ? "Trusted reviewed evidence matched this claim."
          : status === "low_confidence"
            ? "Only weak trusted evidence matched this claim; the answer should be revised or escalated."
            : pendingReviewMatches
              ? "Matching evidence exists only in pending review and cannot support a trusted answer."
              : "No trusted reviewed evidence supports this claim."
    });
  }

  const verdict = citationClosureVerdict(evaluatedClaims);
  const supportedCount = evaluatedClaims.filter((claim) => claim.status === "supported").length;
  const unsupportedCount = evaluatedClaims.filter((claim) => claim.status === "unsupported").length;
  const lowConfidenceCount = evaluatedClaims.filter((claim) => claim.status === "low_confidence").length;
  const status =
    verdict === "all_claims_supported"
      ? "citation_closure_passed"
      : verdict === "no_claims_detected"
        ? "citation_closure_no_claims"
        : "citation_closure_failed";
  const safety = {
    judgeCreatesEvidence: false,
    trustedEvidenceOnly: true,
    pendingEvidenceUsedForSupport: false,
    rawArtifactTextReturned: false,
    rawArtifactBodiesReturned: false,
    rawAnswerStored: false,
    rawQuestionStored: false,
    citationPointersAreMetadataOnly: true,
    unsupportedClaimsUnavailableToTrustedRetrieval: true
  };
  const evaluation = {
    schemaVersion: "brainstyworkers.research_claim_citation_closure.v1",
    status,
    verdict,
    questionHash: question ? sha256(safePreview(question, 1200)) : null,
    answerHash: sha256(safeAnswer),
    claimCount: evaluatedClaims.length,
    supportedCount,
    unsupportedCount,
    lowConfidenceCount,
    minSupportScore: supportThreshold,
    claims: evaluatedClaims,
    actionsTaken: ["research_claims_extracted", "trusted_research_evidence_scored", "claim_citation_labels_written"]
  };
  const time = nowIso();
  const row = {
    id: createId("research_claim_evaluation"),
    actor_user_id: actorUserId,
    question_hash: evaluation.questionHash,
    question_preview: question ? safePreview(question, 600) : "",
    answer_hash: evaluation.answerHash,
    answer_preview: safeAnswer,
    status,
    verdict,
    claim_count: evaluatedClaims.length,
    supported_count: supportedCount,
    unsupported_count: unsupportedCount,
    low_confidence_count: lowConfidenceCount,
    evaluation_json: json(evaluation),
    safety_json: json(safety),
    audit_event_id: null,
    created_at: time,
    updated_at: time
  };
  await store.insert("research_claim_evaluations", row);
  const auditEvent = await audit(store, null, "research_claim_citation_closure_evaluated", {
    actorUserId,
    evaluationId: row.id,
    questionHash: row.question_hash,
    answerHash: row.answer_hash,
    status,
    verdict,
    claimCount: evaluatedClaims.length,
    supportedCount,
    unsupportedCount,
    lowConfidenceCount,
    claimHashes: evaluatedClaims.map((claim) => claim.textHash),
    unsupportedClaimHashes: evaluatedClaims.filter((claim) => claim.status !== "supported").map((claim) => claim.textHash),
    judgeCreatesEvidence: false,
    trustedEvidenceOnly: true
  });
  await store.update("research_claim_evaluations", { audit_event_id: auditEvent.id, updated_at: nowIso() }, { id: row.id });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    status,
    verdict,
    evaluation: normalizeClaimEvaluation(await store.findOne("research_claim_evaluations", { id: row.id })),
    safety,
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash },
    actionsTaken: evaluation.actionsTaken
  };
}

export async function listCitationClosureEvaluations(store, { status = null, verdict = null, limit = 25 } = {}) {
  const conditions = [];
  if (status) conditions.push(`status = ${sql(status)}`);
  if (verdict) conditions.push(`verdict = ${sql(verdict)}`);
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const bounded = boundedLimit(limit, 25, 100);
  const rows = await store.all(`SELECT * FROM research_claim_evaluations${where} ORDER BY created_at DESC LIMIT ${bounded};`);
  const latest = rows[0] ? normalizeClaimEvaluation(rows[0]) : null;
  const counts = await store.all("SELECT verdict, COUNT(*) AS count FROM research_claim_evaluations GROUP BY verdict;");
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    filters: { status, verdict, limit: bounded },
    latest,
    counts: Object.fromEntries(counts.map((row) => [row.verdict, Number(row.count ?? 0)])),
    evaluations: rows.map(normalizeClaimEvaluation),
    safety: {
      judgeCreatesEvidence: false,
      trustedEvidenceOnly: true,
      rawArtifactTextReturned: false,
      rawAnswerStored: false
    }
  };
}

export async function startManualResearchRun(
  store,
  { actorUserId = null, sourceId = null, sourceKey = null, topic = "", query = {}, workflowKey = "general_rag", metadata = {}, runType = "manual_operator_run" }
) {
  const source = await sourceByIdOrKey(store, { sourceId, sourceKey });
  if (!source) throw new ResearchOpsError("No approved research source is available.", 404);
  if (!ACTIVE_SOURCE_STATUSES.has(source.status)) {
    throw new ResearchOpsError("Research runs can only start from approved or active sources.", 409);
  }
  const estimatedCostCents = estimateResearchCostCents({ operation: "run_queued", workerMode: metadata.workerMode ?? query.workerMode ?? null });
  await assertResearchBudgetAllows(store, {
    actorUserId,
    eventType: "run_queued",
    estimatedCostCents,
    metadata: {
      runType,
      workflowKey,
      sourceId: source.id,
      sourceKey: source.source_key
    }
  });
  const time = nowIso();
  const run = {
    id: createId("research_run"),
    source_id: source.id,
    source_key: source.source_key,
    actor_user_id: actorUserId,
    run_type: runType,
    workflow_key: workflowKey,
    status: "queued",
    topic: String(topic || source.title).slice(0, 240),
    query_json: json(query),
    summary: `${runType === "scheduled_research_run" ? "Scheduled" : "Manual"} research run queued for ${source.title}.`,
    retry_of_run_id: null,
    metadata_json: json({ ...metadata, version: RESEARCH_OPS_VERSION }),
    started_at: time,
    completed_at: null,
    created_at: time,
    updated_at: time
  };
  await store.insert("research_runs", run);
  const budgetEvent = await recordResearchBudgetEvent(store, {
    actorUserId,
    runId: run.id,
    eventType: "run_queued",
    estimatedCostCents,
    status: "accepted",
    reason: "research_run_queued",
    metadata: {
      runType,
      workflowKey,
      sourceId: source.id,
      sourceKey: source.source_key
    }
  });
  const event = await createResearchRunEvent(store, {
    runId: run.id,
    eventType: "research_run_queued",
    status: "queued",
    summary: run.summary,
    payload: { sourceId: source.id, sourceKey: source.source_key, actorUserId, workflowKey }
  });
  await store.update("knowledge_sources", { last_run_at: time, last_status: "queued", updated_at: time }, { id: source.id });
  const auditEvent = await audit(store, null, "research_run_started", {
    runId: run.id,
    sourceId: source.id,
    sourceKey: source.source_key,
    actorUserId,
    status: run.status
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    run: normalizeRun(run),
    source: normalizeSource(source),
    budget: {
      event: budgetEvent,
      estimatedCostCents,
      policy: (await getResearchBudgetStatus(store)).policy
    },
    event,
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

async function executeDeterministicFetch(store, { run, source, actorUserId = null, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") {
    throw new ResearchOpsError("Deterministic fetch runtime is not available.", 503);
  }
  const parsed = validateUrl(source.base_url);
  const response = await fetchImpl(parsed.href, {
    method: "GET",
    headers: {
      "accept": "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5",
      "user-agent": "BrainstyworkersResearchBot/0.1 read-only deterministic fetch"
    }
  });
  const contentType = response.headers?.get?.("content-type") || "";
  const contentLength = Number(response.headers?.get?.("content-length") || 0);
  if (!response.ok) {
    throw new ResearchOpsError(`Deterministic fetch failed with HTTP ${response.status}.`, 502);
  }
  if (contentLength > MAX_FETCH_BYTES) {
    throw new ResearchOpsError(`Research source is larger than the configured ${MAX_FETCH_BYTES} byte limit.`, 413);
  }
  if (!isTextualContentType(contentType)) {
    throw new ResearchOpsError(`Research source content type is not textual: ${contentType || "unknown"}.`, 415);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_FETCH_BYTES) {
    throw new ResearchOpsError(`Research source is larger than the configured ${MAX_FETCH_BYTES} byte limit.`, 413);
  }
  const rawText = Buffer.from(arrayBuffer).toString("utf8");
  const extractedText = stripHtml(rawText);
  if (!extractedText) {
    throw new ResearchOpsError("Research source did not contain extractable text.", 422);
  }
  const title = extractTitle(rawText, source.title);
  const artifact = await createResearchArtifact(store, {
    runId: run.id,
    sourceId: source.id,
    artifactType: "deterministic_fetch_text",
    sourceUrl: parsed.href,
    title,
    rawText,
    extractedText,
    citationStatus: "extracted_pending_review",
    metadata: {
      workerMode: "deterministic_fetch",
      httpStatus: response.status,
      contentType,
      byteLength: arrayBuffer.byteLength,
      extractionMethod: contentType.toLowerCase().includes("html") ? "html_text_strip" : "text_decode",
      actorUserId
    }
  });
  return {
    artifact,
    summary: `Deterministic fetch completed for ${title || source.title}; extracted ${extractedText.length} characters for review.`
  };
}

async function executeMockWorker(store, { run, source, actorUserId = null }) {
  const rawText = [
    `MockWorker fallback evidence for approved source: ${source.title}.`,
    `Source URL: ${source.base_url}.`,
    `Topic: ${run.topic}.`,
    "This artifact is intentionally marked untrusted and must not enter trusted retrieval or user-facing healthcare answers."
  ].join("\n");
  const extractedText = rawText;
  const artifact = await createResearchArtifact(store, {
    runId: run.id,
    sourceId: source.id,
    artifactType: "mock_worker_generated_evidence",
    sourceUrl: source.base_url,
    title: `${source.title} MockWorker proof`,
    rawText,
    extractedText,
    citationStatus: "mock_worker_untrusted",
    metadata: {
      workerMode: "mock_worker",
      trustedRetrieval: false,
      actorUserId,
      reason: "Fallback mode for unavailable real workers or external sites."
    }
  });
  return {
    artifact,
    summary: `MockWorker fallback completed for ${source.title}; output is visible but untrusted.`
  };
}

async function runOpenClawResearchWorkerCommand(taskEnvelope) {
  const binary = process.env.BRAINSTY_OPENCLAW_BINARY || "openclaw";
  const profile = process.env.BRAINSTY_OPENCLAW_PROFILE || "brainstyworkers";
  const agentId = process.env.BRAINSTY_RESEARCH_OPENCLAW_AGENT_ID || process.env.BRAINSTY_OPENCLAW_AGENT_ID || "brainstyworkers-insurance-browser";
  const timeoutSeconds = String(Number(process.env.BRAINSTY_RESEARCH_WORKER_TIMEOUT_SECONDS ?? 180));
  const prompt = researchWorkerPrompt(taskEnvelope);
  const { stdout, stderr } = await execFileAsync(
    binary,
    ["--profile", profile, "agent", "--local", "--agent", agentId, "--session-id", `research:${taskEnvelope.taskId}`, "--message", prompt, "--json", "--timeout", timeoutSeconds],
    {
      timeout: Number(timeoutSeconds) * 1000 + 15000,
      maxBuffer: 1024 * 1024 * 20
    }
  );
  return {
    stdout,
    stderr,
    command: `${binary} --profile ${profile} agent --local --agent ${agentId} --session-id research:${taskEnvelope.taskId} --message [redacted-task-envelope] --json`,
    provider: "official_openclaw_cli"
  };
}

async function runHermesResearchWorkerCommand(taskEnvelope) {
  const binary = process.env.BRAINSTY_HERMES_BINARY || "hermes";
  const prompt = researchWorkerPrompt(taskEnvelope);
  const args = ["--oneshot", prompt, "--accept-hooks"];
  if (process.env.BRAINSTY_RESEARCH_HERMES_MODEL) args.push("--model", process.env.BRAINSTY_RESEARCH_HERMES_MODEL);
  if (process.env.BRAINSTY_RESEARCH_HERMES_PROVIDER) args.push("--provider", process.env.BRAINSTY_RESEARCH_HERMES_PROVIDER);
  if (process.env.BRAINSTY_RESEARCH_HERMES_TOOLSETS) args.push("--toolsets", process.env.BRAINSTY_RESEARCH_HERMES_TOOLSETS);
  const timeoutSeconds = Number(process.env.BRAINSTY_RESEARCH_WORKER_TIMEOUT_SECONDS ?? 180);
  const { stdout, stderr } = await execFileAsync(binary, args, {
    timeout: timeoutSeconds * 1000 + 15000,
    maxBuffer: 1024 * 1024 * 20
  });
  return {
    stdout,
    stderr,
    command: `${binary} --oneshot [redacted-task-envelope]`,
    provider: "hermes_cli"
  };
}

async function executeAdaptiveResearchWorker(
  store,
  {
    run,
    source,
    actorUserId = null,
    workerMode,
    approvedWorkerDispatch = false,
    workerRunners = {}
  }
) {
  if (!approvedWorkerDispatch) {
    throw new ResearchOpsError(`${workerMode} research worker dispatch requires an explicit approvedWorkerDispatch=true gate.`, 409);
  }
  if (!adaptiveWorkerEnabled(workerMode)) {
    throw new ResearchOpsError(`${workerMode} research worker mode is disabled. Set ${adaptiveWorkerFeatureFlag(workerMode)} to enable real dispatch.`, 424);
  }
  const taskEnvelope = buildResearchWorkerTaskEnvelope({ run, source, actorUserId, workerMode });
  await createResearchRunEvent(store, {
    runId: run.id,
    eventType: "research_worker_dispatch_requested",
    status: "running",
    summary: `${workerMode} research worker dispatch requested for approved source ${source.title}.`,
    payload: {
      actorUserId,
      workerMode,
      taskId: taskEnvelope.taskId,
      sourceId: source.id,
      sourceKey: source.source_key,
      sourceUrlHash: sha256(source.base_url),
      approvedSourceOnly: true,
      trustedRetrievalRequiresArtifactReview: true
    }
  });
  const auditEvent = await audit(store, null, "research_worker_dispatch_requested", {
    runId: run.id,
    sourceId: source.id,
    sourceKey: source.source_key,
    actorUserId,
    workerMode,
    taskId: taskEnvelope.taskId,
    sourceUrlHash: sha256(source.base_url),
    approvedSourceOnly: true,
    allowedActions: taskEnvelope.controls.allowedActions,
    disallowedActions: taskEnvelope.controls.disallowedActions
  });
  const runner =
    workerMode === "openclaw"
      ? workerRunners.openclaw ?? runOpenClawResearchWorkerCommand
      : workerRunners.hermes ?? runHermesResearchWorkerCommand;
  const commandResult = await runner(taskEnvelope);
  const workerResult = normalizeWorkerResult(commandResult, { workerMode, taskEnvelope });
  const rawText = JSON.stringify(
    {
      taskId: taskEnvelope.taskId,
      workerMode,
      status: workerResult.status,
      answer: workerResult.answer,
      evidence: workerResult.evidence,
      sourcePointers: workerResult.sourcePointers,
      blockers: workerResult.blockers,
      uncertainties: workerResult.uncertainties,
      recommendedNextSteps: workerResult.recommendedNextSteps,
      actionsTaken: workerResult.actionsTaken,
      confidence: workerResult.confidence
    },
    null,
    2
  );
  const extractedText = [
    workerResult.answer,
    ...workerResult.evidence.map((item) => `${item.source}: ${item.details}`),
    ...workerResult.blockers.map((item) => `Blocker: ${item}`)
  ]
    .filter(Boolean)
    .join("\n");
  const artifact = await createResearchArtifact(store, {
    runId: run.id,
    sourceId: source.id,
    artifactType: `${workerMode}_research_worker_result`,
    sourceUrl: taskEnvelope.source.url,
    title: `${source.title} ${workerMode} worker result`,
    rawText,
    extractedText,
    citationStatus: PENDING_ARTIFACT_STATUS,
    metadata: {
      workerMode,
      taskEnvelope,
      workerResult,
      dispatchAuditEventId: auditEvent.id,
      command: safePreview(commandResult.command ?? commandResult.provider ?? workerMode, 500),
      stderrHash: commandResult.stderr ? sha256(commandResult.stderr) : null,
      structuredResultValidated: true,
      trustedRetrieval: false,
      requiresArtifactReview: true,
      actorUserId
    }
  });
  return {
    artifact,
    summary: `${workerMode} worker returned a structured ${workerResult.status} result for ${source.title}; artifact is pending operator citation review.`,
    workerResult,
    taskEnvelope,
    dispatchAudit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

export async function executeResearchRun(
  store,
  { runId, actorUserId = null, workerMode = null, fetchImpl = globalThis.fetch, approvedWorkerDispatch = false, workerRunners = {} } = {}
) {
  const selectedMode = workerMode || process.env.BRAINSTY_RESEARCH_WORKER_MODE || "deterministic_fetch";
  if (!EXECUTABLE_WORKER_MODES.has(selectedMode)) {
    throw new ResearchOpsError(`Research worker mode is not configured for execution: ${selectedMode}.`, 409);
  }
  const run = await store.findOne("research_runs", { id: runId });
  if (!run) throw new ResearchOpsError("Research run not found.", 404);
  if (!EXECUTABLE_RUN_STATUSES.has(run.status)) {
    throw new ResearchOpsError(`Research run cannot execute from status ${run.status}.`, 409);
  }
  const source = run.source_id ? await store.findOne("knowledge_sources", { id: run.source_id }) : null;
  if (!source) throw new ResearchOpsError("Research source not found for run.", 404);
  if (!ACTIVE_SOURCE_STATUSES.has(source.status)) {
    throw new ResearchOpsError("Research execution requires an approved or active source.", 409);
  }
  const estimatedCostCents = estimateResearchCostCents({ operation: "run_executed", workerMode: selectedMode });
  await assertResearchBudgetAllows(store, {
    actorUserId,
    runId,
    eventType: "run_executed",
    estimatedCostCents,
    metadata: {
      workerMode: selectedMode,
      sourceId: source.id,
      sourceKey: source.source_key
    }
  });
  const budgetEvent = await recordResearchBudgetEvent(store, {
    actorUserId,
    runId,
    eventType: "run_executed",
    estimatedCostCents,
    status: "accepted",
    reason: "research_run_execution_started",
    metadata: {
      workerMode: selectedMode,
      sourceId: source.id,
      sourceKey: source.source_key
    }
  });
  const startedAt = nowIso();
  await store.update(
    "research_runs",
    {
      status: "running",
      summary: `Research run executing with ${selectedMode}.`,
      metadata_json: json({
        ...parseJson(run.metadata_json, {}),
        workerMode: selectedMode,
        executionStartedAt: startedAt,
        version: RESEARCH_OPS_VERSION
      }),
      updated_at: startedAt
    },
    { id: runId }
  );
  await createResearchRunEvent(store, {
    runId,
    eventType: "research_run_execution_started",
    status: "running",
    summary: `Execution started with ${selectedMode}.`,
    payload: { actorUserId, sourceId: source.id, sourceKey: source.source_key, workerMode: selectedMode }
  });
  try {
    const execution =
      selectedMode === "mock_worker"
        ? await executeMockWorker(store, { run, source, actorUserId })
        : ADAPTIVE_WORKER_MODES.has(selectedMode)
          ? await executeAdaptiveResearchWorker(store, {
              run,
              source,
              actorUserId,
              workerMode: selectedMode,
              approvedWorkerDispatch,
              workerRunners
            })
          : await executeDeterministicFetch(store, { run, source, actorUserId, fetchImpl });
    const time = nowIso();
    await store.update(
      "research_runs",
      {
        status: "completed",
        summary: execution.summary,
        completed_at: time,
        metadata_json: json({
          ...parseJson(run.metadata_json, {}),
          workerMode: selectedMode,
          executionStartedAt: startedAt,
          executionCompletedAt: time,
          artifactId: execution.artifact.id,
          artifactCitationStatus: execution.artifact.citationStatus,
          workerResultStatus: execution.workerResult?.status ?? null,
          trustedRetrievalReady: execution.artifact.citationStatus === TRUSTED_ARTIFACT_STATUS,
          version: RESEARCH_OPS_VERSION
        }),
        updated_at: time
      },
      { id: runId }
    );
    const event = await createResearchRunEvent(store, {
      runId,
      eventType: "research_run_execution_completed",
      status: "completed",
      summary: execution.summary,
      payload: {
        actorUserId,
        workerMode: selectedMode,
        artifactId: execution.artifact.id,
        artifactType: execution.artifact.artifactType,
        contentHash: execution.artifact.contentHash,
        extractionHash: execution.artifact.extractionHash,
        citationStatus: execution.artifact.citationStatus,
        workerResultStatus: execution.workerResult?.status ?? null,
        actionsTaken: execution.workerResult?.actionsTaken ?? []
      }
    });
    await store.update("knowledge_sources", { last_run_at: time, last_status: "completed", updated_at: time }, { id: source.id });
    const auditEvent = await audit(store, null, "research_run_executed", {
      runId,
      sourceId: source.id,
      sourceKey: source.source_key,
      actorUserId,
      workerMode: selectedMode,
      artifactId: execution.artifact.id,
      contentHash: execution.artifact.contentHash,
      extractionHash: execution.artifact.extractionHash,
      citationStatus: execution.artifact.citationStatus,
      workerResultStatus: execution.workerResult?.status ?? null,
      actionsTaken: execution.workerResult?.actionsTaken ?? []
    });
    const detail = await getResearchRun(store, { runId });
    return {
      ok: true,
      version: RESEARCH_OPS_VERSION,
      ...detail,
      event,
      artifact: execution.artifact,
      workerResult: execution.workerResult ?? null,
      taskEnvelope: execution.taskEnvelope ?? null,
      worker: getResearchWorkerStatus(),
      budget: {
        event: budgetEvent,
        estimatedCostCents,
        policy: (await getResearchBudgetStatus(store)).policy
      },
      audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
    };
  } catch (error) {
    const time = nowIso();
    const message = error instanceof ResearchOpsError ? error.message : String(error?.message ?? error);
    await store.update(
      "research_runs",
      {
        status: "failed",
        summary: message,
        completed_at: time,
        updated_at: time,
        metadata_json: json({
          ...parseJson(run.metadata_json, {}),
          workerMode: selectedMode,
          executionStartedAt: startedAt,
          executionFailedAt: time,
          errorType: error?.name ?? "Error",
          version: RESEARCH_OPS_VERSION
        })
      },
      { id: runId }
    );
    const event = await createResearchRunEvent(store, {
      runId,
      eventType: "research_run_execution_failed",
      status: "failed",
      summary: message,
      payload: {
        actorUserId,
        workerMode: selectedMode,
        errorType: error?.name ?? "Error"
      }
    });
    await store.update("knowledge_sources", { last_run_at: time, last_status: "failed", updated_at: time }, { id: source.id });
    const auditEvent = await audit(store, null, "research_run_execution_failed", {
      runId,
      sourceId: source.id,
      sourceKey: source.source_key,
      actorUserId,
      workerMode: selectedMode,
      errorType: error?.name ?? "Error",
      errorHash: sha256(message)
    });
    if (error instanceof ResearchOpsError) {
      error.event = event;
      error.audit = { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash };
      throw error;
    }
    const wrapped = new ResearchOpsError(message, 500);
    wrapped.event = event;
    wrapped.audit = { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash };
    throw wrapped;
  }
}

export async function cancelResearchRun(store, { runId, actorUserId = null, reason = "" }) {
  const row = await store.findOne("research_runs", { id: runId });
  if (!row) throw new ResearchOpsError("Research run not found.", 404);
  if (TERMINAL_RUN_STATUSES.has(row.status)) {
    throw new ResearchOpsError(`Research run is already ${row.status}.`, 409);
  }
  const time = nowIso();
  await store.update(
    "research_runs",
    {
      status: "cancelled",
      summary: reason || "Manual research run cancelled by operator.",
      completed_at: time,
      updated_at: time
    },
    { id: runId }
  );
  const event = await createResearchRunEvent(store, {
    runId,
    eventType: "research_run_cancelled",
    status: "cancelled",
    summary: reason || "Cancelled by operator.",
    payload: { actorUserId }
  });
  if (row.source_id) await store.update("knowledge_sources", { last_status: "cancelled", updated_at: time }, { id: row.source_id });
  const auditEvent = await audit(store, null, "research_run_cancelled", {
    runId,
    actorUserId,
    reason
  });
  return {
    ok: true,
    version: RESEARCH_OPS_VERSION,
    run: normalizeRun(await store.findOne("research_runs", { id: runId })),
    event,
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}

export async function retryResearchRun(store, { runId, actorUserId = null, reason = "" }) {
  const original = await store.findOne("research_runs", { id: runId });
  if (!original) throw new ResearchOpsError("Research run not found.", 404);
  const retry = await startManualResearchRun(store, {
    actorUserId,
    sourceId: original.source_id,
    topic: original.topic,
    query: parseJson(original.query_json, {}),
    workflowKey: original.workflow_key ?? "general_rag",
    metadata: {
      retryOfRunId: runId,
      retryReason: reason
    }
  });
  await store.update("research_runs", { retry_of_run_id: runId }, { id: retry.run.id });
  const retryRow = await store.findOne("research_runs", { id: retry.run.id });
  await createResearchRunEvent(store, {
    runId,
    eventType: "research_run_retry_created",
    status: original.status,
    summary: `Retry created: ${retry.run.id}`,
    payload: { retryRunId: retry.run.id, actorUserId, reason }
  });
  const auditEvent = await audit(store, null, "research_run_retry_created", {
    originalRunId: runId,
    retryRunId: retry.run.id,
    actorUserId,
    reason
  });
  return {
    ...retry,
    run: normalizeRun(retryRow),
    retryOfRunId: runId,
    audit: { id: auditEvent.id, eventType: auditEvent.event_type, eventHash: auditEvent.event_hash }
  };
}
