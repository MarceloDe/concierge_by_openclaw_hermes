import { createHash } from "node:crypto";
import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";

export const WORKER_MEMORY_VERSION = "2026-06-22.phase57-worker-procedural-memory.v1";

const DIRECT_IDENTIFIER_RE = /\b(?:\d{3}-\d{2}-\d{4}|\d{9,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [value];
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function compact(value, limit = 480) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().replace(DIRECT_IDENTIFIER_RE, "[masked_identifier]");
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function collectSourcePointerIds(result = {}, explicit = []) {
  return [
    ...asArray(explicit),
    ...asArray(result.sourcePointers).map((item) => (typeof item === "string" ? item : item.id ?? item.sourcePointerId ?? item.pointerId)),
    ...asArray(result.evidence).flatMap((item) => asArray(item?.sourcePointers ?? item?.sourcePointerIds))
  ].filter(Boolean).map(String).filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeSequence({ workerPlan = {}, result = {}, dynamicSkillContext = {} }) {
  const subtasks = asArray(result.subtasks).map((item) => ({
    key: item.subtaskKey ?? item.key ?? item.label ?? "worker_subtask",
    status: item.status ?? "reported",
    skillKey: item.skillKey ?? workerPlan.workerJobs?.[0]?.worker?.skillKey ?? dynamicSkillContext.selected?.executionSkillKey ?? null
  }));
  const actions = asArray(result.actionsTaken).map((item) => ({
    action: typeof item === "string" ? item : item.action ?? item.type ?? "worker_action",
    mode: typeof item === "string" ? "reported" : item.mode ?? item.executionMode ?? "reported"
  }));
  return [
    ...asArray(dynamicSkillContext.requiredOpenClawTasks).map((task) => ({ key: task, status: "required_by_skill_context" })),
    ...subtasks,
    ...actions
  ];
}

export function buildWorkerProceduralMemoryRecord({
  user,
  session,
  workflow,
  selectedSkillKey,
  selectedExecutorKey,
  terminalOutcome,
  workerPlan = {},
  workerResult = {},
  dynamicSkillContext = {},
  sourcePointerIds = [],
  metadata = {}
} = {}) {
  const normalizedSourcePointerIds = collectSourcePointerIds(workerResult, sourcePointerIds);
  const sequence = normalizeSequence({ workerPlan, result: workerResult, dynamicSkillContext });
  const effectiveOutcome = terminalOutcome ?? workerResult.status ?? "completed_with_sourced_result";
  const candidateId = `pems_worker_${stableHash({ workflow, selectedSkillKey, selectedExecutorKey, sequence }).slice(0, 24)}`;
  const procedurePayload = {
    workflow: workflow ?? null,
    selectedSkillKey: selectedSkillKey ?? null,
    selectedExecutorKey: selectedExecutorKey ?? null,
    terminalOutcome: effectiveOutcome,
    sequence,
    sourcePointerIds: normalizedSourcePointerIds,
    safety: {
      cortexProductMemory: false,
      productionDrivingAllowed: false,
      sourcePointerRequired: true,
      rawPortalTextStored: false
    }
  };
  return {
    id: createId("worker_mem"),
    user_id: user?.id ?? String(user?.user_id ?? "user_unknown"),
    session_id: session?.id ?? String(session?.session_id ?? "session_unknown"),
    workflow: workflow ?? null,
    selected_skill_key: selectedSkillKey ?? null,
    selected_executor_key: selectedExecutorKey ?? null,
    terminal_outcome: effectiveOutcome,
    procedure_ref: `worker-procedure:${candidateId}`,
    procedure_hash: stableHash(procedurePayload),
    sequence_json: JSON.stringify(sequence),
    source_pointer_ids_json: JSON.stringify(normalizedSourcePointerIds),
    pems_candidate_id: candidateId,
    cortex_product_memory: 0,
    production_driving_allowed: 0,
    masked_preview: compact(workerResult.answer ?? workerResult.summary ?? `${selectedSkillKey ?? "worker"} ${effectiveOutcome}`),
    safety_json: JSON.stringify(procedurePayload.safety),
    metadata_json: JSON.stringify({
      version: WORKER_MEMORY_VERSION,
      dynamicSkillHash: stableHash(dynamicSkillContext),
      workerPlanHash: stableHash(workerPlan),
      ...metadata
    }),
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

export async function recordWorkerProceduralMemory(store, input = {}) {
  if (!store) throw new Error("Worker procedural memory requires a store.");
  const record = buildWorkerProceduralMemoryRecord(input);
  await store.insert("worker_procedural_memory", record);
  const now = nowIso();
  const existing = await store.findOne("pems_candidate_maturity", { candidate_id: record.pems_candidate_id });
  const sourcePointerCount = JSON.parse(record.source_pointer_ids_json).length;
  if (existing) {
    await store.update(
      "pems_candidate_maturity",
      {
        shadow_run_count: Number(existing.shadow_run_count ?? 0) + 1,
        evidence_ref_count: Math.max(Number(existing.evidence_ref_count ?? 0), sourcePointerCount),
        successful_outcome_count: Number(existing.successful_outcome_count ?? 0) + (/completed|partial_result/i.test(record.terminal_outcome) ? 1 : 0),
        production_driving_allowed: 0,
        updated_at: now
      },
      { candidate_id: record.pems_candidate_id }
    );
  } else {
    await store.insert("pems_candidate_maturity", {
      candidate_id: record.pems_candidate_id,
      workflow: record.workflow,
      selected_skill_key: record.selected_skill_key,
      shadow_run_count: 1,
      evidence_ref_count: sourcePointerCount,
      successful_outcome_count: /completed|partial_result/i.test(record.terminal_outcome) ? 1 : 0,
      reviewer_approval_count: 0,
      authority_citation_count: sourcePointerCount,
      validator_pass_count: sourcePointerCount ? 1 : 0,
      safety_incident_count: 0,
      latest_score: 0,
      trusted: 0,
      supervised_advisory_allowed: 0,
      promotion_status: "shadow_review_required",
      production_driving_allowed: 0,
      maturity_json: JSON.stringify({ source: "worker_procedural_memory", recordId: record.id, productionDrivingAllowed: false }),
      promotion_json: "{}",
      created_at: now,
      updated_at: now
    });
  }
  const auditEvent = await audit(store, record.session_id, "worker_procedural_memory_recorded", {
    recordId: record.id,
    pemsCandidateId: record.pems_candidate_id,
    workflow: record.workflow,
    selectedSkillKey: record.selected_skill_key,
    sourcePointerCount,
    cortexProductMemory: false,
    productionDrivingAllowed: false
  });
  return {
    version: WORKER_MEMORY_VERSION,
    record,
    pemsCandidateId: record.pems_candidate_id,
    auditEventId: auditEvent.id,
    safety: {
      cortexProductMemory: false,
      productionDrivingAllowed: false,
      rawPortalTextStored: false,
      sourcePointerIdsOnly: true
    }
  };
}

export async function getWorkerProceduralMemoryStatus(store) {
  const total = await store.get("SELECT COUNT(*) AS count FROM worker_procedural_memory;");
  const latest = await store.get(
    `SELECT id, workflow, selected_skill_key, selected_executor_key, terminal_outcome,
            pems_candidate_id, production_driving_allowed, cortex_product_memory, created_at
       FROM worker_procedural_memory
      ORDER BY created_at DESC
      LIMIT 1;`
  );
  return {
    version: WORKER_MEMORY_VERSION,
    status: Number(total?.count ?? 0) > 0 ? "worker_procedural_memory_ready" : "worker_procedural_memory_contract_ready",
    recordCount: Number(total?.count ?? 0),
    latest: latest
      ? {
          id: latest.id,
          workflow: latest.workflow,
          selectedSkillKey: latest.selected_skill_key,
          selectedExecutorKey: latest.selected_executor_key,
          terminalOutcome: latest.terminal_outcome,
          pemsCandidateId: latest.pems_candidate_id,
          productionDrivingAllowed: latest.production_driving_allowed === 1,
          cortexProductMemory: latest.cortex_product_memory === 1,
          createdAt: latest.created_at
        }
      : null,
    safety: {
      productionDrivingAllowed: false,
      cortexProductMemory: false,
      answerDriving: false
    }
  };
}
