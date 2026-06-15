import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { audit } from "./audit.mjs";
import { nowIso } from "./database.mjs";
import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";
import { recordOutboundPayloadObservation } from "./outboundPayloadObservability.mjs";
import { loadLocalEnvOnce } from "./secrets.mjs";

export const PRODUCT_MEMORY_CONTRACT_VERSION = "2026-05-27.graphiti-product-memory.v1";
export const PRODUCT_MEMORY_REPLAY_QUEUE_VERSION = "2026-06-15.product-memory-replay-queue.v1";
const BRIDGE_PATH = resolve("tools/graphiti/graphiti_bridge.py");
const PYTHON_PATH = resolve(".venv-graphiti/bin/python");

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function productMemoryEnabled() {
  return (process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER ?? "disabled").toLowerCase() === "graphiti";
}

export function getProductMemoryConfig() {
  return {
    contractVersion: PRODUCT_MEMORY_CONTRACT_VERSION,
    adapter: process.env.BRAINSTY_PRODUCT_MEMORY_ADAPTER ?? "disabled",
    enabled: productMemoryEnabled(),
    provider: "zep_graphiti",
    bridgePath: BRIDGE_PATH,
    pythonPath: PYTHON_PATH,
    backend: process.env.GRAPHITI_BACKEND ?? process.env.GRAPHITI_DRIVER ?? "falkordb",
    groupId: process.env.GRAPHITI_GROUP_ID ?? "brainstyworkers_local",
    falkor: {
      host: process.env.FALKORDB_HOST ?? "localhost",
      port: process.env.FALKORDB_PORT ?? "6380"
    },
    llmModel: process.env.GRAPHITI_LLM_MODEL ?? "gpt-4.1-mini",
    embeddingModel: process.env.GRAPHITI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    rawEpisodeStorage: process.env.GRAPHITI_STORE_RAW_EPISODES === "1"
  };
}

async function callGraphitiBridge(payload, { timeoutMs = 120000, observability = null } = {}) {
  await loadLocalEnvOnce();
  const config = getProductMemoryConfig();
  let outboundPayloadObservation = null;
  if (observability?.store) {
    outboundPayloadObservation = await recordOutboundPayloadObservation(observability.store, {
      sessionId: observability.sessionId ?? null,
      payload,
      payloadType: observability.payloadType ?? `graphiti_${payload.action ?? "request"}`,
      destination: "zep_graphiti",
      policyMode: observability.policyMode ?? "product_memory_observe_only",
      user: observability.user
    });
  }
  const { stdout, stderr } = await new Promise((resolvePromise, reject) => {
    const child = spawn(config.pythonPath, [config.bridgePath], {
      env: {
        ...process.env,
        GRAPHITI_BACKEND: config.backend,
        GRAPHITI_GROUP_ID: config.groupId,
        FALKORDB_HOST: config.falkor.host,
        FALKORDB_PORT: config.falkor.port,
        GRAPHITI_LLM_MODEL: config.llmModel,
        GRAPHITI_EMBEDDING_MODEL: config.embeddingModel
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Graphiti bridge timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`Graphiti bridge failed with ${signal ?? `exit ${code}`}: ${stderr || stdout}`));
    });
    child.stdin.end(JSON.stringify(payload));
  });
  const result = parseJson(stdout.trim(), null);
  if (!result) {
    throw new Error(`Graphiti bridge returned invalid JSON${stderr ? `: ${stderr}` : ""}`);
  }
  if (!result.ok) {
    throw new Error(result.error ?? "Graphiti bridge failed");
  }
  return outboundPayloadObservation
    ? {
        ...result,
        outboundPayloadObservation: {
          eventType: "outbound_payload_observed",
          payloadHash: outboundPayloadObservation.payloadHash,
          containsPortalText: outboundPayloadObservation.containsPortalText,
          containsDirectIdentifier: outboundPayloadObservation.containsDirectIdentifier,
          containsSourcePointers: outboundPayloadObservation.containsSourcePointers,
          enforcementMode: outboundPayloadObservation.enforcementMode
        }
      }
    : result;
}

function disabledResult(action) {
  return {
    ok: true,
    action,
    contractVersion: PRODUCT_MEMORY_CONTRACT_VERSION,
    adapter: "disabled",
    enabled: false,
    provider: "zep_graphiti",
    status: "disabled_by_env",
    facts: [],
    retained: false,
    message: "Set BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti to enable real product memory."
  };
}

export async function getProductMemoryReplayQueueSummary(store) {
  if (!store) {
    return {
      queueVersion: PRODUCT_MEMORY_REPLAY_QUEUE_VERSION,
      available: false,
      pending: 0,
      retryableFailed: 0,
      running: 0,
      completed: 0,
      failed: 0
    };
  }
  const rows = await store.all(`
    SELECT status, COUNT(*) AS count
    FROM product_memory_replay_queue
    GROUP BY status
    ORDER BY status ASC;
  `);
  const summary = Object.fromEntries(rows.map((row) => [row.status, Number(row.count ?? 0)]));
  const oldest = await store.get(`
    SELECT id, created_at, next_attempt_at, last_error
    FROM product_memory_replay_queue
    WHERE status IN ('queued', 'retryable_failed', 'running')
    ORDER BY created_at ASC
    LIMIT 1;
  `);
  return {
    queueVersion: PRODUCT_MEMORY_REPLAY_QUEUE_VERSION,
    available: true,
    pending: summary.queued ?? 0,
    retryableFailed: summary.retryable_failed ?? 0,
    running: summary.running ?? 0,
    completed: summary.completed ?? 0,
    failed: summary.failed ?? 0,
    oldestPending: oldest ?? null
  };
}

export async function listProductMemoryReplayQueue(store, { status = null, limit = 25 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
  const params = [];
  const statusClause = status ? "WHERE status = ?" : "";
  if (status) params.push(String(status));
  params.push(safeLimit);
  const rows = await store.all(`
    SELECT id, user_id, session_id, adapter, action, status, attempts, max_attempts, source_pointer_count,
           first_error, last_error, next_attempt_at, last_attempt_at, completed_at, created_at, updated_at
    FROM product_memory_replay_queue
    ${statusClause}
    ORDER BY created_at ASC
    LIMIT ?;
  `, params);
  return rows;
}

function replayBackoffIso(attempts) {
  const minutes = Math.min(60, Math.max(1, Number(attempts) || 1) * 5);
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export async function enqueueProductMemoryRetainReplay(store, { user, session, retainPayload, episodeBody, error, repairPlan }) {
  if (!store || !user?.id || !session?.id || !retainPayload) return null;
  const now = nowIso();
  const item = {
    id: `pm_replay_${crypto.randomUUID()}`,
    user_id: user.id,
    session_id: session.id,
    adapter: "graphiti",
    action: "retain",
    status: "queued",
    attempts: 0,
    max_attempts: 3,
    source_pointer_count: episodeBody?.sourcePointers?.length ?? 0,
    payload_json: JSON.stringify({
      queueVersion: PRODUCT_MEMORY_REPLAY_QUEUE_VERSION,
      payload: retainPayload,
      episodePreview: {
        workflow: episodeBody?.workflow ?? null,
        workflowOutcome: episodeBody?.workflowOutcome ?? null,
        sourcePointerCount: episodeBody?.sourcePointers?.length ?? 0,
        rawPortalTextStored: false,
        directIdentifiersMasked: true
      },
      repairPlan
    }),
    result_json: "{}",
    first_error: String(error?.message ?? error ?? "Graphiti retain failed."),
    last_error: String(error?.message ?? error ?? "Graphiti retain failed."),
    next_attempt_at: now,
    last_attempt_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now
  };
  await store.insert("product_memory_replay_queue", item);
  await audit(store, session.id, "product_memory_retain_queued_for_replay", {
    provider: "zep_graphiti",
    queueVersion: PRODUCT_MEMORY_REPLAY_QUEUE_VERSION,
    queueItemId: item.id,
    sourcePointerCount: item.source_pointer_count,
    retryable: Boolean(repairPlan?.retryable),
    nextAttemptAt: item.next_attempt_at,
    rawPortalTextStored: false,
    cortexProductMemory: false
  });
  return {
    id: item.id,
    status: item.status,
    nextAttemptAt: item.next_attempt_at,
    sourcePointerCount: item.source_pointer_count,
    queueVersion: PRODUCT_MEMORY_REPLAY_QUEUE_VERSION
  };
}

export async function replayQueuedProductMemoryRetains(store, { limit = 5, user = null } = {}) {
  await loadLocalEnvOnce();
  const config = getProductMemoryConfig();
  if (!config.enabled) {
    return {
      ok: false,
      status: "disabled_by_env",
      adapter: "graphiti",
      replayed: 0,
      failed: 0,
      message: "Set BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti to replay queued product memory retains."
    };
  }
  const now = nowIso();
  const safeLimit = Math.max(1, Math.min(25, Number(limit) || 5));
  const rows = await store.all(`
    SELECT *
    FROM product_memory_replay_queue
    WHERE action = 'retain'
      AND status IN ('queued', 'retryable_failed')
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    ORDER BY created_at ASC
    LIMIT ?;
  `, [now, safeLimit]);
  const results = [];
  for (const row of rows) {
    const attempts = Number(row.attempts ?? 0) + 1;
    const startedAt = nowIso();
    await store.update(
      "product_memory_replay_queue",
      {
        status: "running",
        attempts,
        last_attempt_at: startedAt,
        updated_at: startedAt
      },
      { id: row.id }
    );
    const envelope = parseJson(row.payload_json, {});
    try {
      const result = await callGraphitiBridge(envelope.payload, {
        observability: {
          store,
          sessionId: row.session_id,
          payloadType: "graphiti_replay_retain",
          user,
          policyMode: "product_memory_replay_retain_observe_only"
        }
      });
      const completedAt = nowIso();
      await store.update(
        "product_memory_replay_queue",
        {
          status: "completed",
          result_json: JSON.stringify({
            ok: true,
            episodeUuid: result.episodeUuid ?? null,
            backend: result.backend ?? null,
            groupId: result.groupId ?? null
          }),
          last_error: null,
          completed_at: completedAt,
          updated_at: completedAt
        },
        { id: row.id }
      );
      await audit(store, row.session_id, "product_memory_replay_completed_graphiti", {
        provider: "zep_graphiti",
        queueVersion: PRODUCT_MEMORY_REPLAY_QUEUE_VERSION,
        queueItemId: row.id,
        attempts,
        episodeUuid: result.episodeUuid ?? null,
        sourcePointerCount: row.source_pointer_count
      });
      results.push({ id: row.id, status: "completed", episodeUuid: result.episodeUuid ?? null });
    } catch (error) {
      const retryable = isRetryableGraphitiRetainError(error);
      const exhausted = attempts >= Number(row.max_attempts ?? 3);
      const failedAt = nowIso();
      const status = retryable && !exhausted ? "retryable_failed" : "failed";
      await store.update(
        "product_memory_replay_queue",
        {
          status,
          last_error: error.message,
          next_attempt_at: status === "retryable_failed" ? replayBackoffIso(attempts) : null,
          updated_at: failedAt
        },
        { id: row.id }
      );
      await audit(store, row.session_id, "product_memory_replay_failed_graphiti", {
        provider: "zep_graphiti",
        queueVersion: PRODUCT_MEMORY_REPLAY_QUEUE_VERSION,
        queueItemId: row.id,
        attempts,
        status,
        retryable,
        exhausted,
        error: error.message
      });
      results.push({ id: row.id, status, error: error.message });
    }
  }
  return {
    ok: true,
    status: "replay_finished",
    adapter: "graphiti",
    attempted: rows.length,
    replayed: results.filter((item) => item.status === "completed").length,
    failed: results.filter((item) => item.status !== "completed").length,
    results,
    queue: await getProductMemoryReplayQueueSummary(store)
  };
}

export async function getProductMemoryStatus({ requireEnabled = false, store = null, sessionId = null, user = null } = {}) {
  await loadLocalEnvOnce();
  const config = getProductMemoryConfig();
  const replayQueue = await getProductMemoryReplayQueueSummary(store);
  if (!config.enabled) {
    if (requireEnabled) throw new Error("Product memory is disabled. Set BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti.");
    return { ...disabledResult("status"), config, replayQueue };
  }
  try {
    const status = await callGraphitiBridge(
      { action: "status", groupId: config.groupId },
      {
        timeoutMs: 60000,
        observability: store
          ? {
              store,
              sessionId,
              payloadType: "graphiti_status",
              user,
              policyMode: "product_memory_status_observe_only"
            }
          : null
      }
    );
    return { ...status, adapter: "graphiti", enabled: true, config, replayQueue };
  } catch (error) {
    if (requireEnabled) throw error;
    return {
      ok: false,
      action: "status",
      adapter: "graphiti",
      enabled: true,
      provider: "zep_graphiti",
      status: "degraded",
      error: error.message,
      errorType: error?.name ?? "Error",
      config,
      replayQueue
    };
  }
}

export async function recallProductMemoryForRequest({ store = null, user, session, userInput, contextPacket, limit = 5 }) {
  await loadLocalEnvOnce();
  const config = getProductMemoryConfig();
  if (!config.enabled) return { ...disabledResult("recall"), config };
  const stateForMasking = { context_packet: contextPacket };
  const query = [
    maskDirectIdentifiers(userInput, stateForMasking),
    `workflow candidates ${(contextPacket?.workflowArchitecture?.routeCandidates ?? []).map((item) => item.workflowKey).join(", ")}`,
    `source pointers ${(contextPacket?.dbPointers ?? []).map((item) => `${item.table}/${item.id}`).join(", ")}`
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const result = await callGraphitiBridge({
      action: "recall",
      groupId: config.groupId,
      query,
      limit
    }, {
      observability: {
        store,
        sessionId: session?.id ?? null,
        payloadType: "graphiti_recall",
        user,
        policyMode: "product_memory_recall_observe_only"
      }
    });
    return {
      ...result,
      adapter: "graphiti",
      enabled: true,
      userId: user.id,
      sessionId: session?.id ?? null,
      factCount: result.facts?.length ?? 0
    };
  } catch (error) {
    return {
      ok: false,
      action: "recall",
      adapter: "graphiti",
      enabled: true,
      error: error.message,
      facts: [],
      userId: user.id,
      sessionId: session?.id ?? null
    };
  }
}

export function buildSafeProductMemoryEpisode({ user, session, state, localMemoryItems = [] }) {
  const stateForMasking = { context_packet: state.context_packet };
  const sourcePointers = (state.source_pointers ?? []).map((pointer) => ({
    kind: pointer.kind ?? null,
    table: pointer.table ?? null,
    id: pointer.id ?? null,
    displayLabel: maskDirectIdentifiers(pointer.displayLabel ?? "", stateForMasking) || null,
    sourceUrl: pointer.sourceUrl ?? null,
    summary: maskDirectIdentifiers(pointer.summary ?? "", stateForMasking),
    domHash: pointer.domHash ?? null,
    extractionHash: pointer.extractionHash ?? null,
    evidenceFields: sanitizeEvidenceFields(pointer.evidenceFields ?? [], stateForMasking),
    citation: sanitizeCitation(pointer.citation, stateForMasking)
  }));
  return {
    contractVersion: PRODUCT_MEMORY_CONTRACT_VERSION,
    memoryKind: "safe_healthcare_workflow_summary",
    userPointer: `users/${user.id}`,
    sessionPointer: `sessions/${session.id}`,
    workflow: state.workflow ?? null,
    routeReason: state.route_reason ?? null,
    workflowOutcome: state.workflow_outcome ?? null,
    approvalState: state.approval_resume?.status ?? null,
    evidenceStatus: state.evidence_observation?.status ?? null,
    graphitiExtractionText: [
      `BrainstyMember workflow ${state.workflow ?? "unknown"} had outcome ${state.workflow_outcome ?? "unknown"}.`,
      sourcePointers.length
        ? `BrainstyMember answer must cite stored source pointers ${sourcePointers.map((pointer) => `${pointer.table}/${pointer.id}`).join(", ")}.`
        : "BrainstyMember answer has no healthcare evidence source pointer yet."
    ].join(" "),
    sourcePointers,
    summary: maskDirectIdentifiers(state.memory_summary ?? state.final_response ?? "", stateForMasking),
    localMemoryItemPointers: localMemoryItems.map((item) => ({
      table: "memory_items",
      id: item.id,
      type: item.memory_type,
      sensitivity: item.sensitivity
    })),
    boundaries: {
      rawPortalTextStored: false,
      directIdentifiersMasked: true,
      cortexProductMemory: false,
      credentialStorage: "not_allowed",
      irreversiblePortalActions: "not_allowed"
    }
  };
}

function sanitizeEvidenceFields(fields = [], stateForMasking) {
  const normalized = Array.isArray(fields)
    ? fields
    : Object.entries(fields ?? {}).map(([label, value]) => ({ label, value, confidence: "unknown" }));
  return normalized.slice(0, 20).map((field) => ({
    label: maskDirectIdentifiers(field.label ?? "field", stateForMasking),
    value: sanitizeEvidenceFieldValue(field, stateForMasking),
    confidence: field.confidence ?? "unknown"
  }));
}

function sanitizeEvidenceFieldValue(field, stateForMasking) {
  const label = String(field.label ?? "");
  const value = String(field.value ?? "");
  if (/member|subscriber|policy|group/i.test(label) && !/^last4:/i.test(value)) {
    const match = value.match(/([A-Z0-9]{4})$/i);
    return match ? `last4:${match[1]}` : "[DB_POINTER:insurance_identifiers:member_or_subscriber_id]";
  }
  return maskDirectIdentifiers(value, stateForMasking);
}

function sanitizeCitation(citation, stateForMasking) {
  if (!citation || typeof citation !== "object") return null;
  return {
    sourceKind: citation.sourceKind ?? null,
    uploadId: citation.uploadId ?? null,
    filename: maskDirectIdentifiers(citation.filename ?? "", stateForMasking) || null,
    extractionStatus: citation.extractionStatus ?? null,
    extractionMethod: citation.extractionMethod ?? null,
    confidence: citation.confidence ?? null,
    sourceSpans: (citation.sourceSpans ?? []).slice(0, 5).map((span) => ({
      spanId: span.spanId ?? span.span_id ?? null,
      snippet: maskDirectIdentifiers(span.snippet ?? "", stateForMasking),
      confidence: span.confidence ?? citation.confidence ?? "unknown"
    }))
  };
}

export function isRetryableGraphitiRetainError(errorOrMessage) {
  const message = String(errorOrMessage?.message ?? errorOrMessage ?? "");
  if (!message) return false;
  if (/direct identifier|raw portal text|source pointer|policy|not allowed|unsafe/i.test(message)) return false;
  return /timed out|timeout|ECONN|connection|refused|reset|failed with|invalid JSON|Falkor|Graphiti bridge failed|temporar/i.test(message);
}

export function buildProductMemoryRetainRepairPlan(errorOrMessage, { sourcePointerCount = 0, attempt = 1 } = {}) {
  const error = String(errorOrMessage?.message ?? errorOrMessage ?? "Graphiti retain failed.");
  const timeout = /timed out|timeout/i.test(error);
  const retryable = isRetryableGraphitiRetainError(error);
  const nextAction = (() => {
    if (!sourcePointerCount) return "Run a sourced workflow first so Graphiti retain has source pointers.";
    if (timeout) return "Check the Graphiti/FalkorDB runtime, then run the product memory probe or replay retain.";
    if (retryable) return "Retry Graphiti retain after checking runtime status.";
    return "Inspect the memory payload policy and Graphiti bridge error before retrying.";
  })();
  return {
    status: retryable ? (timeout ? "retry_deferred_timeout" : "retryable_retain_failed") : "manual_repair_required",
    retryable,
    timeout,
    attempt,
    sourcePointerCount,
    attemptedRetry: false,
    repaired: false,
    error,
    nextAction
  };
}

export async function retainProductMemoryFromGraphRun(store, { user, session, state, localMemoryItems = [] }) {
  await loadLocalEnvOnce();
  const config = getProductMemoryConfig();
  if (!config.enabled || !state?.should_remember) return { ...disabledResult("retain"), config };
  const episodeBody = buildSafeProductMemoryEpisode({ user, session, state, localMemoryItems });
  const retainPayload = {
    action: "retain",
    groupId: config.groupId,
    name: `Brainsty ${state.workflow ?? "workflow"} ${session.id}`,
    episodeBody,
    source: "json",
    sourceDescription: "Brainstyworkers product memory safe workflow summary",
    referenceTime: nowIso()
  };
  const retainOnce = (attempt) =>
    callGraphitiBridge(retainPayload, {
      observability: {
        store,
        sessionId: session.id,
        payloadType: attempt === 1 ? "graphiti_retain" : "graphiti_retain_retry",
        user,
        policyMode: "product_memory_retain_observe_only"
      }
    });
  try {
    const result = await retainOnce(1);
    await audit(store, session.id, "product_memory_retained_graphiti", {
      provider: "zep_graphiti",
      contractVersion: PRODUCT_MEMORY_CONTRACT_VERSION,
      backend: result.backend,
      groupId: result.groupId,
      episodeUuid: result.episodeUuid,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
      sourcePointerCount: episodeBody.sourcePointers.length,
      rawPortalTextStored: false,
      cortexProductMemory: false
    });
    return {
      ...result,
      adapter: "graphiti",
      enabled: true,
      retained: true,
      retainAttempts: 1,
      repairPlan: null,
      episodeBodyPreview: {
        workflow: episodeBody.workflow,
        workflowOutcome: episodeBody.workflowOutcome,
        sourcePointerCount: episodeBody.sourcePointers.length,
        rawPortalTextStored: false
      }
    };
  } catch (error) {
    const repairPlan = buildProductMemoryRetainRepairPlan(error, {
      sourcePointerCount: episodeBody.sourcePointers.length,
      attempt: 1
    });
    const shouldRetry = repairPlan.retryable && !repairPlan.timeout && process.env.BRAINSTY_PRODUCT_MEMORY_RETAIN_RETRY !== "0";
    if (shouldRetry) {
      repairPlan.attemptedRetry = true;
      try {
        const status = await callGraphitiBridge(
          { action: "status", groupId: config.groupId },
          {
            timeoutMs: 30000,
            observability: {
              store,
              sessionId: session.id,
              payloadType: "graphiti_retain_repair_status",
              user,
              policyMode: "product_memory_retain_repair_observe_only"
            }
          }
        );
        repairPlan.statusProbe = {
          ok: Boolean(status.ok),
          schemaReady: Boolean(status.schemaReady),
          backend: status.backend ?? null
        };
      } catch (statusError) {
        repairPlan.statusProbe = {
          ok: false,
          error: statusError.message
        };
      }
      try {
        const retryResult = await retainOnce(2);
        repairPlan.repaired = true;
        await audit(store, session.id, "product_memory_retain_repaired_graphiti", {
          provider: "zep_graphiti",
          contractVersion: PRODUCT_MEMORY_CONTRACT_VERSION,
          firstError: error.message,
          backend: retryResult.backend,
          groupId: retryResult.groupId,
          episodeUuid: retryResult.episodeUuid,
          sourcePointerCount: episodeBody.sourcePointers.length,
          repairPlan
        });
        return {
          ...retryResult,
          adapter: "graphiti",
          enabled: true,
          retained: true,
          retainAttempts: 2,
          firstError: error.message,
          repairPlan,
          episodeBodyPreview: {
            workflow: episodeBody.workflow,
            workflowOutcome: episodeBody.workflowOutcome,
            sourcePointerCount: episodeBody.sourcePointers.length,
            rawPortalTextStored: false
          }
        };
      } catch (retryError) {
        repairPlan.retryError = retryError.message;
      }
    }
    const queuedReplay = repairPlan.retryable
      ? await enqueueProductMemoryRetainReplay(store, {
          user,
          session,
          retainPayload,
          episodeBody,
          error: repairPlan.retryError ?? error,
          repairPlan
        })
      : null;
    await audit(store, session.id, "product_memory_retain_failed_graphiti", {
      provider: "zep_graphiti",
      contractVersion: PRODUCT_MEMORY_CONTRACT_VERSION,
      error: error.message,
      repairPlan,
      queuedReplay
    });
    return {
      ok: false,
      action: "retain",
      adapter: "graphiti",
      enabled: true,
      retained: false,
      retainAttempts: repairPlan.attemptedRetry ? 2 : 1,
      error: repairPlan.retryError ?? error.message,
      firstError: error.message,
      repairPlan,
      queuedReplay
    };
  }
}

export async function suppressProductMemoryEpisode(store, { sessionId, episodeUuid }) {
  await loadLocalEnvOnce();
  const config = getProductMemoryConfig();
  if (!config.enabled) return { ...disabledResult("suppress"), config };
  const result = await callGraphitiBridge({
    action: "suppress",
    groupId: config.groupId,
    episodeUuid
  }, {
    observability: {
      store,
      sessionId,
      payloadType: "graphiti_suppress",
      policyMode: "product_memory_suppress_observe_only"
    }
  });
  if (store && sessionId) {
    await audit(store, sessionId, "product_memory_suppressed_graphiti", {
      provider: "zep_graphiti",
      episodeUuid,
      suppressed: true
    });
  }
  return { ...result, adapter: "graphiti", enabled: true };
}

export async function probeProductMemory({ store = null, user, session, query = "eligibility benefits deductible source pointer" }) {
  const status = await getProductMemoryStatus({ requireEnabled: true, store, sessionId: session?.id ?? null, user });
  const safeEpisode = {
    contractVersion: PRODUCT_MEMORY_CONTRACT_VERSION,
    memoryKind: "safe_probe_summary",
    graphitiExtractionText:
      "BrainstyMember asked about deductible remaining. EligibilitySnapshot probe is the source pointer for the benefits answer.",
    userPointer: `users/${user.id}`,
    sessionPointer: `sessions/${session?.id ?? "probe"}`,
    workflow: "eligibility_benefits_navigation",
    summary:
      "The member asked about deductible remaining and benefits. Evidence should be answered only from stored source pointers.",
    sourcePointers: [{ table: "eligibility_snapshots", id: "probe", summary: "probe source pointer" }],
    boundaries: {
      rawPortalTextStored: false,
      directIdentifiersMasked: true,
      cortexProductMemory: false
    }
  };
  const retained = await callGraphitiBridge({
    action: "retain",
    groupId: status.config.groupId,
    name: `Brainsty product memory probe ${Date.now()}`,
    episodeBody: safeEpisode,
    source: "json",
    sourceDescription: "Brainstyworkers product memory probe",
    referenceTime: nowIso()
  }, {
    observability: {
      store,
      sessionId: session?.id ?? null,
      payloadType: "graphiti_probe_retain",
      user,
      policyMode: "product_memory_probe_retain_observe_only"
    }
  });
  const recalled = await callGraphitiBridge({
    action: "recall",
    groupId: status.config.groupId,
    query,
    limit: 5
  }, {
    observability: {
      store,
      sessionId: session?.id ?? null,
      payloadType: "graphiti_probe_recall",
      user,
      policyMode: "product_memory_probe_recall_observe_only"
    }
  });
  return {
    status,
    retained,
    recalled,
    contractVersion: PRODUCT_MEMORY_CONTRACT_VERSION,
    rawPortalTextStored: false,
    cortexProductMemory: false
  };
}
