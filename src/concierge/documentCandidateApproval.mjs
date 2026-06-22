import { createHash } from "node:crypto";
import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";

export const DOCUMENT_CANDIDATE_APPROVAL_VERSION = "2026-06-01.document-candidate-approval.v1";
export const DOCUMENT_CANDIDATE_TASK_TYPE = "openclaw_document_candidate_proposal";
export const READ_ONLY_DOCUMENT_APPROVAL_GATE = "openclaw_read_only_document_observation";
export const READ_ONLY_DOCUMENT_APPROVAL_SCOPE = "read_only_document_observation";
export const READ_ONLY_DOCUMENT_ALLOWED_ACTION = "read_only_document_observation";

const IRREVERSIBLE_OR_MIXED_PATH = /(?:\/|\b)(upload|submit|send|message|messages|payment|payments|preferences|profile|appeal|appeals|authorization|authorizations|documents-and-forms|forms?|digital-claims)(?:\/|\b|-)/i;
const SUBMISSION_TEXT = /\b(submit|upload|send|message|pay|payment|appeal|start claim|new authorization|change|update|cancel)\b/i;

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return compact(value);
  }
}

function sameSite(candidateUrl, portalUrl) {
  if (!portalUrl) return true;
  try {
    const candidate = new URL(candidateUrl);
    const portal = new URL(portalUrl);
    return candidate.hostname.replace(/^www\./, "") === portal.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

export function candidateIdFor(candidate = {}) {
  const normalized = [
    canonicalUrl(candidate.url ?? ""),
    compact(candidate.type ?? "document"),
    compact(candidate.label ?? ""),
    compact(candidate.source ?? "")
  ].join("|");
  return `doccand_${createHash("sha256").update(normalized).digest("hex").slice(0, 20)}`;
}

export function normalizeDocumentCandidate(candidate = {}, { portalUrl = null, sourceRuntimeEventId = null } = {}) {
  const url = candidate.url ? canonicalUrl(candidate.url) : null;
  const type = compact(candidate.type ?? "document") || "document";
  const label = compact(candidate.label ?? type.replaceAll("_", " ")) || "Document candidate";
  const source = compact(candidate.source ?? "discovery_report") || "discovery_report";
  const candidateId = candidate.candidateId ?? candidateIdFor({ ...candidate, url, type, label, source });
  const issues = [];

  if (!url) issues.push("missing_candidate_url");
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") issues.push("non_https_candidate_url");
    } catch {
      issues.push("invalid_candidate_url");
    }
  }
  if (url && !sameSite(url, portalUrl)) issues.push("offsite_document_candidate");
  if (candidate.blockedReason) issues.push(candidate.blockedReason);
  if (candidate.readOnlyOpenAllowed === false) issues.push("candidate_not_marked_read_only");
  if (url && IRREVERSIBLE_OR_MIXED_PATH.test(url)) issues.push("mixed_form_submission_or_irreversible_area");
  if (SUBMISSION_TEXT.test(`${label}\n${type}\n${source}`)) issues.push("submission_or_irreversible_candidate_label");

  const uniqueIssues = [...new Set(issues.filter(Boolean))];
  return {
    version: DOCUMENT_CANDIDATE_APPROVAL_VERSION,
    candidateId,
    type,
    label,
    url,
    source,
    sourceRuntimeEventId,
    readOnlyOpenAllowed: uniqueIssues.length === 0,
    blockedReason: uniqueIssues[0] ?? null,
    blockerIssues: uniqueIssues,
    sbcOrPdf: Boolean(candidate.sbcOrPdf),
    original: candidate
  };
}

export function documentCandidatesFromDiscoveryReport(report = {}, { portalUrl = null, sourceRuntimeEventId = null } = {}) {
  const candidates = report?.documentDiscovery?.candidates ?? [];
  return candidates.map((candidate) => normalizeDocumentCandidate(candidate, { portalUrl, sourceRuntimeEventId }));
}

export function approvalMetadataForDocumentCandidateTask(task = {}) {
  const metadata = parseJson(task.metadata_json);
  return {
    metadata,
    candidate: metadata.candidate ?? null,
    approvalScope: metadata.approvalScope ?? READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    allowedAction: metadata.allowedAction ?? READ_ONLY_DOCUMENT_ALLOWED_ACTION
  };
}

export async function latestDocumentDiscovery(store, { sessionId, portalUrl = null, limit = 80 } = {}) {
  if (!sessionId) return { ok: false, status: "missing_session", candidates: [], discoveryReport: null, sourceRuntimeEvent: null };
  const bounded = Math.max(1, Math.min(200, Number(limit) || 80));
  const rows = await store.all(
    `SELECT * FROM runtime_events
     WHERE session_id = ?
     ORDER BY created_at DESC
     LIMIT ${bounded};`,
    [sessionId]
  );
  for (const row of rows) {
    const payload = parseJson(row.payload_json);
    const discoveryReport = payload.discoveryReport ?? payload.evidenceObservation?.discoveryReport ?? null;
    if (!discoveryReport?.documentDiscovery?.attempted) continue;
    const candidates = documentCandidatesFromDiscoveryReport(discoveryReport, {
      portalUrl,
      sourceRuntimeEventId: row.id
    });
    return {
      ok: true,
      status: candidates.length ? "document_candidates_available" : "no_document_candidates_available",
      discoveryReport,
      candidates,
      sourceRuntimeEvent: {
        id: row.id,
        eventType: row.event_type,
        createdAt: row.created_at
      }
    };
  }
  return { ok: false, status: "document_discovery_not_found", candidates: [], discoveryReport: null, sourceRuntimeEvent: null };
}

export async function listDocumentCandidateProposals(store, { sessionId = null, userId = null, limit = 50 } = {}) {
  const bounded = Math.max(1, Math.min(200, Number(limit) || 50));
  const clauses = ["task_type = ?"];
  const params = [DOCUMENT_CANDIDATE_TASK_TYPE];
  if (sessionId) {
    clauses.push("session_id = ?");
    params.push(sessionId);
  }
  if (userId) {
    clauses.push("user_id = ?");
    params.push(userId);
  }
  const rows = await store.all(
    `SELECT * FROM agent_tasks
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT ${bounded};`,
    params
  );
  return rows.map((task) => {
    const { metadata, candidate, approvalScope, allowedAction } = approvalMetadataForDocumentCandidateTask(task);
    return {
      task,
      candidate,
      approvalScope,
      allowedAction,
      actionsTaken: Array.isArray(metadata.actionsTaken) ? metadata.actionsTaken : []
    };
  });
}

export async function createDocumentCandidateProposal(
  store,
  { userId, sessionId, workflow = "eligibility_benefits_navigation", candidateId, portalUrl = null, expiresInMinutes = 15 } = {}
) {
  if (!userId || !sessionId) {
    return { ok: false, status: "missing_binding", error: "userId and sessionId are required.", actionsTaken: [] };
  }
  if (!candidateId) {
    return { ok: false, status: "missing_candidate_id", error: "candidateId is required.", actionsTaken: [] };
  }
  const discovery = await latestDocumentDiscovery(store, { sessionId, portalUrl });
  const candidate = discovery.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) {
    return {
      ok: false,
      status: discovery.ok ? "candidate_not_found" : discovery.status,
      error: "The requested document candidate was not found in the latest discovery report.",
      discovery,
      actionsTaken: []
    };
  }
  if (!candidate.readOnlyOpenAllowed) {
    await audit(store, sessionId, "openclaw_document_candidate_proposal_blocked", {
      candidateId,
      candidateUrl: candidate.url,
      candidateLabel: candidate.label,
      blockerIssues: candidate.blockerIssues,
      actionsTaken: []
    });
    return {
      ok: false,
      status: "candidate_blocked",
      error: `Document candidate is blocked: ${candidate.blockerIssues.join(", ") || candidate.blockedReason}.`,
      candidate,
      actionsTaken: []
    };
  }

  const now = nowIso();
  const metadata = {
    version: DOCUMENT_CANDIDATE_APPROVAL_VERSION,
    executionMode: "candidate_specific_approval_only",
    approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_ALLOWED_ACTION,
    candidate,
    sourceRuntimeEventId: discovery.sourceRuntimeEvent?.id ?? null,
    expiresInMinutes: Number(expiresInMinutes),
    notExecuted: true,
    actionsTaken: []
  };
  const task = {
    id: createId("task"),
    user_id: userId,
    session_id: sessionId,
    workflow_key: workflow,
    journey_stage: "document_candidate_observation",
    task_type: DOCUMENT_CANDIDATE_TASK_TYPE,
    status: "pending_approval",
    priority: "medium",
    description: `Review and approve one read-only document candidate before OpenClaw may observe it: ${candidate.label}.`,
    source_table: "runtime_events",
    source_id: discovery.sourceRuntimeEvent?.id ?? null,
    scheduled_job_id: null,
    due_at: null,
    metadata_json: JSON.stringify(metadata),
    created_at: now,
    updated_at: now
  };
  await store.insert("agent_tasks", task);
  const auditEvent = await audit(store, sessionId, "openclaw_document_candidate_proposed", {
    taskId: task.id,
    userId,
    workflow,
    candidateId: candidate.candidateId,
    candidateUrl: candidate.url,
    candidateLabel: candidate.label,
    approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_ALLOWED_ACTION,
    sourceRuntimeEventId: discovery.sourceRuntimeEvent?.id ?? null,
    actionsTaken: []
  });
  return {
    ok: true,
    status: "pending_approval",
    task,
    candidate,
    proposal: {
      task,
      candidate,
      approvalScope: READ_ONLY_DOCUMENT_APPROVAL_SCOPE,
      allowedAction: READ_ONLY_DOCUMENT_ALLOWED_ACTION,
      actionsTaken: []
    },
    auditEvent,
    actionsTaken: []
  };
}
