const nodePort = process.env.BRAINSTY_COMPOSE_NODE_PORT || "4173";
const apiPort = process.env.BRAINSTY_COMPOSE_API_PORT || "8000";
const expectGraphitiReady = process.env.BRAINSTY_EXPECT_GRAPHITI_READY === "1";
const runProbe = process.env.BRAINSTY_RUN_GRAPHITI_PROBE === "1";

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} failed ${response.status}: ${text}`);
  }
  return body;
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const nodeBase = `http://127.0.0.1:${nodePort}`;
const apiBase = `http://127.0.0.1:${apiPort}`;

const result = {
  ok: false,
  mode: expectGraphitiReady ? "graphiti_required" : "safe_degraded_or_ready",
  nodeBase,
  apiBase,
  checks: {}
};

try {
  const nodeHealth = await requestJson(`${nodeBase}/api/health`);
  result.checks.nodeHealth = {
    ok: Boolean(nodeHealth.ok ?? nodeHealth.status === "ok"),
    status: nodeHealth.status ?? null
  };

  const apiHealth = await requestJson(`${apiBase}/api/v1/health`);
  result.checks.fastapiHealth = {
    ok: Boolean(apiHealth.ok ?? apiHealth.status === "ok"),
    nodeRuntimeOk: Boolean(apiHealth.node_runtime_ok)
  };

  const memoryStatus = await requestJson(`${nodeBase}/api/product-memory/status`);
  const graphitiReady = Boolean(memoryStatus.enabled && memoryStatus.schemaReady);
  result.checks.productMemory = {
    ok: expectGraphitiReady ? graphitiReady : Boolean(memoryStatus.ok || graphitiReady),
    adapter: memoryStatus.adapter,
    enabled: Boolean(memoryStatus.enabled),
    status: graphitiReady ? "graphiti_schema_ready" : memoryStatus.status ?? "unknown",
    schemaReady: Boolean(memoryStatus.schemaReady),
    backend: memoryStatus.backend ?? memoryStatus.config?.backend ?? null,
    rawEpisodeStorage: Boolean(memoryStatus.rawEpisodeStorage ?? memoryStatus.config?.rawEpisodeStorage),
    replayQueue: memoryStatus.replayQueue ?? null
  };

  assertCondition(result.checks.nodeHealth.ok, "Node runtime health did not pass.");
  assertCondition(result.checks.fastapiHealth.ok, "FastAPI health did not pass.");
  assertCondition(result.checks.fastapiHealth.nodeRuntimeOk, "FastAPI cannot reach the Node runtime.");
  if (expectGraphitiReady) {
    assertCondition(memoryStatus.adapter === "graphiti", "Product memory adapter is not graphiti.");
    assertCondition(memoryStatus.enabled === true, "Product memory adapter is not enabled.");
    assertCondition(memoryStatus.schemaReady === true, "Graphiti schema is not ready.");
    assertCondition((memoryStatus.backend ?? memoryStatus.config?.backend) === "falkordb", "Graphiti backend is not FalkorDB.");
    assertCondition(Boolean(memoryStatus.rawEpisodeStorage ?? memoryStatus.config?.rawEpisodeStorage) === false, "Raw episode storage must remain disabled.");
  }

  if (runProbe) {
    assertCondition(graphitiReady, "BRAINSTY_RUN_GRAPHITI_PROBE requires ready Graphiti schema.");
    const probe = await requestJson(`${nodeBase}/api/product-memory/probe`, {
      method: "POST",
      body: JSON.stringify({
        member: {
          name: "Compose Memory Probe",
          email: "compose-memory-probe@example.com",
          payer: "Aetna",
          portalUrl: "https://www.aetna.com/"
        },
        query: "BrainstyMember deductible remaining EligibilitySnapshot source pointer"
      })
    });
    result.checks.productMemoryProbe = {
      ok: Boolean(probe.retained?.episodeUuid && probe.recalled?.facts?.length >= 1),
      episodeUuid: probe.retained?.episodeUuid ?? null,
      factCount: probe.recalled?.facts?.length ?? 0,
      rawPortalTextStored: Boolean(probe.rawPortalTextStored),
      cortexProductMemory: Boolean(probe.cortexProductMemory)
    };
    assertCondition(result.checks.productMemoryProbe.ok, "Graphiti retain/recall probe did not return a retained episode and recall facts.");
    assertCondition(result.checks.productMemoryProbe.rawPortalTextStored === false, "Probe must not store raw portal text.");
    assertCondition(result.checks.productMemoryProbe.cortexProductMemory === false, "Probe must not use Cortex as product memory.");
  }

  result.ok = true;
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result.error = error.message;
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
