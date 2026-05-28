import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { audit } from "./audit.mjs";
import { nowIso } from "./database.mjs";
import { maskDirectIdentifiers } from "./modelPayloadPolicy.mjs";
import { recordOutboundPayloadObservation } from "./outboundPayloadObservability.mjs";
import { loadLocalEnvOnce } from "./secrets.mjs";

export const PRODUCT_MEMORY_CONTRACT_VERSION = "2026-05-27.graphiti-product-memory.v1";
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

export async function getProductMemoryStatus({ requireEnabled = false, store = null, sessionId = null, user = null } = {}) {
  await loadLocalEnvOnce();
  const config = getProductMemoryConfig();
  if (!config.enabled) {
    if (requireEnabled) throw new Error("Product memory is disabled. Set BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti.");
    return { ...disabledResult("status"), config };
  }
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
  return { ...status, adapter: "graphiti", enabled: true, config };
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
    table: pointer.table ?? null,
    id: pointer.id ?? null,
    sourceUrl: pointer.sourceUrl ?? null,
    summary: maskDirectIdentifiers(pointer.summary ?? "", stateForMasking),
    domHash: pointer.domHash ?? null,
    extractionHash: pointer.extractionHash ?? null,
    evidenceFields: pointer.evidenceFields ?? null
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

export async function retainProductMemoryFromGraphRun(store, { user, session, state, localMemoryItems = [] }) {
  await loadLocalEnvOnce();
  const config = getProductMemoryConfig();
  if (!config.enabled || !state?.should_remember) return { ...disabledResult("retain"), config };
  const episodeBody = buildSafeProductMemoryEpisode({ user, session, state, localMemoryItems });
  try {
    const result = await callGraphitiBridge({
      action: "retain",
      groupId: config.groupId,
      name: `Brainsty ${state.workflow ?? "workflow"} ${session.id}`,
      episodeBody,
      source: "json",
      sourceDescription: "Brainstyworkers product memory safe workflow summary",
      referenceTime: nowIso()
    }, {
      observability: {
        store,
        sessionId: session.id,
        payloadType: "graphiti_retain",
        user,
        policyMode: "product_memory_retain_observe_only"
      }
    });
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
      episodeBodyPreview: {
        workflow: episodeBody.workflow,
        workflowOutcome: episodeBody.workflowOutcome,
        sourcePointerCount: episodeBody.sourcePointers.length,
        rawPortalTextStored: false
      }
    };
  } catch (error) {
    await audit(store, session.id, "product_memory_retain_failed_graphiti", {
      provider: "zep_graphiti",
      contractVersion: PRODUCT_MEMORY_CONTRACT_VERSION,
      error: error.message
    });
    return {
      ok: false,
      action: "retain",
      adapter: "graphiti",
      enabled: true,
      retained: false,
      error: error.message
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
