import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const siteRoot = process.cwd();
const repoRoot = resolve(siteRoot, "..");
const canonicalWorkspace = "/Users/mfelix/projects/workerprototype_openclaw";
const sourceRoot = await exists(canonicalWorkspace) ? canonicalWorkspace : repoRoot;
const generatedAt = new Date().toISOString();

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function git(args, fallback = "unknown") {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function source(path, line, symbol = null) {
  const absolute = join(sourceRoot, path);
  return {
    path,
    line,
    symbol,
    absolute,
    vscodeUrl: `vscode://file/${absolute}:${line}`,
    githubUrl: `https://github.com/mfelix/concierge_by_openclaw_hermes/blob/main/${path}#L${line}`
  };
}

function lineSlice(text, start, end) {
  return text.split("\n").slice(start - 1, end).join("\n");
}

async function tcpProbe(port, host = "127.0.0.1", timeoutMs = 650) {
  return await new Promise((resolveProbe) => {
    const socket = createConnection({ port, host });
    let settled = false;
    const settle = (reachable) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveProbe({ reachable, host, port });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

async function httpProbe(url, timeoutMs = 900) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal });
    return { reachable: true, statusCode: response.status, url };
  } catch {
    return { reachable: false, statusCode: null, url };
  } finally {
    clearTimeout(timer);
  }
}

async function firstReachableHttp(urls) {
  const probes = [];
  for (const url of urls) {
    const probe = await httpProbe(url);
    probes.push(probe);
    if (probe.reachable) return { ...probe, candidates: probes.map((item) => item.url) };
  }
  return { ...probes[0], candidates: probes.map((item) => item.url) };
}

async function firstReachableTcp(ports, host = "127.0.0.1") {
  const probes = [];
  for (const port of ports) {
    const probe = await tcpProbe(port, host);
    probes.push(probe);
    if (probe.reachable) return { ...probe, candidates: ports };
  }
  return { ...probes[0], candidates: ports };
}

async function listFiles(root, output = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", ".next", ".wrangler"].includes(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) await listFiles(path, output);
    else output.push(path);
  }
  return output;
}

function groupTables(tableEntries) {
  const groups = [
    ["Identity & consent", /^(users|sessions|user_|member_|consent|portal_account|credential_)/],
    ["Planner & capability", /^(capabil|process|workflow_|tool_|planner_|decision_)/],
    ["Evidence & documents", /^(source_|document|evidence|uploads|research_|citation_)/],
    ["Runtime & checkpoints", /^(langgraph_|workflow_checkpoint|runtime_|worker_|agent_)/],
    ["Memory & intelligence", /^(memory_|product_memory|pems_|llm_|skill_)/],
    ["Audit & operations", /^(audit_|human_|operator_|scheduled_|retention_)/]
  ];
  const claimed = new Set();
  const result = groups.map(([name, pattern]) => {
    const tables = tableEntries.filter(([table]) => pattern.test(table));
    tables.forEach(([table]) => claimed.add(table));
    return { name, tables: tables.map(tableSummary) };
  });
  result.push({ name: "Domain & supporting", tables: tableEntries.filter(([table]) => !claimed.has(table)).map(tableSummary) });
  return result.filter((group) => group.tables.length);
}

function tableSummary([name, definition]) {
  return {
    name,
    columnCount: definition.columns?.length ?? 0,
    primaryKey: definition.primaryKey ?? [],
    foreignKeys: definition.foreignKeys ?? [],
    columns: (definition.columns ?? []).map((column) => ({
      name: column.name,
      type: column.type,
      nullable: column.nullable
    }))
  };
}

const ledger = await readJson(join(repoRoot, "docs/db/phase-ledger.json"));
const postgresSchema = await readJson(join(repoRoot, "docs/db/postgres-schema.json"));
const redisKeys = await readJson(join(repoRoot, "docs/db/redis-keys.json"));
const spineYaml = await readFile(join(repoRoot, "docs/THREE_LAYER_PLANNER_SPINE_CONFIG.yaml"), "utf8");
const decisionSource = await readFile(join(repoRoot, "src/concierge/llmOrchestrationDecision.mjs"), "utf8");
const promptContractSource = await readFile(join(repoRoot, "src/concierge/promptContracts.mjs"), "utf8");
const allSourceFiles = await listFiles(join(repoRoot, "src"));
const moduleFiles = allSourceFiles.filter((path) => /\.(mjs|js|ts|tsx|py)$/.test(path));

const promptPreviewState = {
  user_input: "[Founder Watchdog safe preview — live user data intentionally omitted]",
  raw_message: {},
  conversation_history: [],
  policy_result: { allowed: true, approvalRequired: false, riskTier: "low", checks: [] },
  allowed_workflows: ["general_insurance_navigation"],
  context_packet: { capabilityPortfolio: { promptTable: [], entryCount: 0 } },
  offerable_processes: []
};
const decisionTemplateSource = lineSlice(decisionSource, 421, 463);
const orchestratorTemplateSource = lineSlice(promptContractSource, 175, 244);
const openclawTemplateSource = lineSlice(promptContractSource, 246, 355);
const safePayloadPreview = JSON.stringify(promptPreviewState, null, 2);

const envPath = join(sourceRoot, ".env.local");
const envNames = new Set();
const safeEnvValues = new Map();
if (await exists(envPath)) {
  for (const line of (await readFile(envPath, "utf8")).split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      envNames.add(match[1]);
      if (["LANGFUSE_HOST"].includes(match[1])) safeEnvValues.set(match[1], match[2].trim().replace(/^['"]|['"]$/g, ""));
    }
  }
}
const configured = (...names) => names.some((name) => envNames.has(name));

const configuredLangfuseUrl = safeEnvValues.get("LANGFUSE_HOST") || "http://127.0.0.1:3100";
const appProbe = await firstReachableHttp([
  "http://127.0.0.1:4173/api/health",
  "http://127.0.0.1:4226/api/health",
  "http://127.0.0.1:4426/api/health"
]);
const liveProbes = {
  app: appProbe,
  openclaw: await httpProbe("http://127.0.0.1:19789/"),
  hermes: await httpProbe("http://127.0.0.1:8790/"),
  chromeCdp: await httpProbe("http://127.0.0.1:9222/json/version"),
  redis: await firstReachableTcp([6381, 6379]),
  postgres: await firstReachableTcp([55432, 5432]),
  falkordb: await tcpProbe(6380),
  fastapi: await httpProbe("http://127.0.0.1:8000/docs"),
  langfuse: await httpProbe(`${configuredLangfuseUrl.replace(/\/$/, "")}/api/public/health`)
};

let graphStats = null;
const graphPath = join(repoRoot, "graphify-out/graph.json");
if (await exists(graphPath)) {
  const graph = await readJson(graphPath);
  graphStats = {
    nodes: graph.nodes?.length ?? Object.keys(graph.nodes ?? {}).length,
    edges: graph.edges?.length ?? 0,
    scope: "src/concierge first-party runtime",
    generatedFrom: "Graphify AST extraction"
  };
}

const modules = [
  { id: "http-runtime", name: "Node HTTP runtime", domain: "Experience", description: "Serves the app, API, health, proof, research, prompt, and operator surfaces.", status: "implemented_proven", runtime: liveProbes.app.reachable ? "running" : "stopped", phase: "pre-83 foundation", source: source("src/server/server.mjs", 5092, "server") },
  { id: "langgraph", name: "LangGraph master orchestrator", domain: "Orchestration", description: "Deterministic policy rails, one live LLM decision, DB-authored capability routing, worker dispatch, evidence, approval interrupt, and response composition.", status: "implemented_proven", runtime: liveProbes.app.reachable ? "loaded" : "not_loaded", phase: 84, source: source("src/concierge/langgraphRunner.mjs", 3745, "createBrainstyLangGraph") },
  { id: "planner-v2", name: "Decision Contract v2 planner", domain: "Orchestration", description: "Three prompt layers, three insurance data layers, strict JSON normalization, risk floor, and fail-closed capability gates.", status: "implemented_proven", runtime: configured("OPENAI_API_KEY") ? "credential_present_in_source_workspace" : "credential_missing", phase: 83, source: source("src/concierge/llmOrchestrationDecision.mjs", 424, "buildLlmOrchestrationDecisionMessages") },
  { id: "catalog", name: "Capability portfolio & catalog", domain: "Orchestration", description: "Postgres-authored capability, process, workflow, skill, tool, graph-path, and planner-exposure truth.", status: "implemented_proven", runtime: liveProbes.postgres.reachable ? "running" : "dependency_stopped", phase: 87, source: source("src/concierge/capabilityCatalog.mjs", 1) },
  { id: "policy", name: "Policy and approval guard", domain: "Safety", description: "Single pre-tool chokepoint; deterministic floors, consent checks, approval consumption, and write prohibitions.", status: "implemented_proven", runtime: "code_ready", phase: 88, source: source("src/concierge/policy.mjs", 316, "mcpPolicyGuard") },
  { id: "openclaw", name: "OpenClaw worker runtime", domain: "Workers", description: "Delegated, bounded worker execution with skill registry, gateway isolation, read-only portal observation, and explicit human handoff.", status: "implemented_proven", runtime: liveProbes.openclaw.reachable ? "running" : "stopped", phase: 87, source: source("src/concierge/openclawOfficialRuntime.mjs", 634) },
  { id: "hermes", name: "Hermes research worker adapter", domain: "Workers", description: "Optional bounded research-worker CLI. The host gateway can be live while project dispatch remains feature-gated and unproven.", status: "implemented_unproven", runtime: liveProbes.hermes.reachable ? "host_service_running" : "stopped", phase: "pre-83 foundation", source: source("src/concierge/researchOps.mjs", 1655) },
  { id: "llm-manager", name: "LLM manager worker", domain: "Workers", description: "Proposal-only optional worker mode; deterministic is default and writes remain behind kill switch plus consumed approval.", status: "implemented_proven", runtime: "deterministic_default", phase: 88, source: source("src/concierge/llmManagerWorker.mjs", 7, "getBrainstyWorkerRuntime") },
  { id: "postgres", name: "Postgres authority", domain: "Data", description: "Authoritative runtime state, catalog, evidence, audit, checkpoint, consent, task, and memory pointer store.", status: "implemented_proven", runtime: liveProbes.postgres.reachable ? "running" : "stopped", phase: 85, source: source("src/concierge/postgresStore.mjs", 146, "PostgresStore") },
  { id: "sqlite", name: "SQLite test adapter", domain: "Data", description: "Hermetic test/local compatibility adapter. It is not the production authority after Phase 85.", status: "implemented_dev", runtime: "test_only", phase: 85, source: source("src/tests/support/sqliteTestStore.mjs", 1) },
  { id: "redis", name: "Redis runtime mirror", domain: "Data", description: "Losable fast mirror for runtime context, portfolio, consent, OAuth handles, LLM index, vector context, worker state, and idempotency.", status: "implemented_proven", runtime: liveProbes.redis.reachable ? "running" : "stopped", phase: 86, source: source("src/concierge/runtimeContextCache.mjs", 285, "createRuntimeContextCache") },
  { id: "checkpointer", name: "Encrypted LangGraph checkpointer", domain: "Data", description: "AES-256-GCM checkpoint persistence with durable-interrupt gating and Postgres production mode.", status: "implemented_proven", runtime: liveProbes.postgres.reachable ? "durable_dependency_running" : "durable_dependency_stopped", phase: 91, source: source("src/concierge/graphCheckpointer.mjs", 210, "createGraphCheckpointer") },
  { id: "graphiti", name: "Graphiti / FalkorDB product memory", domain: "Memory", description: "Advisory longitudinal product memory with safe episodes, replay queue, recall/retain probes, and Postgres pointers as authority.", status: "implemented_proven", runtime: liveProbes.falkordb.reachable ? "running" : "stopped", phase: "pre-83 foundation", source: source("src/concierge/productMemory.mjs", 445, "getProductMemoryStatus") },
  { id: "langfuse", name: "Langfuse observability", domain: "Observability", description: "Traces agent, graph, and LLM checkpoints. The watchdog links out; it intentionally does not duplicate agent traces.", status: "implemented_proven", runtime: liveProbes.langfuse.reachable ? "running" : "stopped", phase: "pre-83 foundation", source: source("src/observability/langfuseClient.mjs", 67, "getLangfuseStatus") },
  { id: "fastapi", name: "FastAPI remote facade", domain: "Experience", description: "Remote/mobile API boundary for sessions, tasks, approvals, documents, browser sessions, streams, and proof.", status: "implemented_proven", runtime: liveProbes.fastapi.reachable ? "running" : "stopped", phase: "pre-83 foundation", source: source("project/api/main.py", 239) },
  { id: "plan-net", name: "Plan-Net provider directory", domain: "Connectors", description: "Public no-signature provider directory rail with plan/network qualification and source timestamping.", status: "implemented_proven", runtime: "ingestion_on_demand", phase: 89, source: source("src/concierge/connectors/planNetDirectory.mjs", 1) },
  { id: "mrf", name: "MRF pricing pipeline", domain: "Connectors", description: "Public Transparency in Coverage ingestion and normalized pricing query substrate; real data coverage remains payer/geography dependent.", status: "implemented_proven", runtime: "ingestion_on_demand", phase: 89, source: source("src/concierge/connectors/mrfPipeline.mjs", 1) },
  { id: "fhir", name: "Generic FHIR client / Aetna rail", domain: "Connectors", description: "Generic throttled/paginated FHIR client and endpoint registry exist; the payer-specific Aetna Patient Access module is intentionally absent pending credentials.", status: "contract_ready", runtime: "blocked_external", phase: 90, source: source("src/concierge/connectors/fhirClient.mjs", 43) },
  { id: "stedi", name: "Stedi eligibility rail", domain: "Connectors", description: "The payer-specific eligibility module is absent; no test key is configured and production remains prohibited until BAA and standing are confirmed.", status: "blocked_external", runtime: "credential_missing", phase: 90, source: source("docs/db/phase-ledger.json", 112) },
  { id: "write-workers", name: "Submission and write workers", domain: "Workers", description: "Registry-visible only. Claim, PAS, scheduling, and form-writing capabilities are not runtime-selectable without signature, delegation, and approval gates.", status: "blocked_external", runtime: "not_selectable", phase: 92, source: source("src/concierge/capabilityCatalogSeed.mjs", 1) }
];

const graphFlow = [
  ["input_policy", "Deterministic safety gate", 3747],
  ["recall_context", "DB, Redis, checkpoints, memory", 3748],
  ["llm_decision", "One strict Decision Contract v2 call", 3749],
  ["workflow_router", "Fail-loud route from validated decision", 3750],
  ["plan_journey", "Select DB-authored process and steps", 3751],
  ["skill_resolver", "Hydrate pointer-backed capability HOW", 3752],
  ["workflow_executor", "Dispatch executable catalog entries only", 3753],
  ["observe_evidence", "Verify source pointers and result", 3754],
  ["approval_pause", "Interrupt for login/read/write approval", 3755],
  ["case_state_shadow", "Persist bounded case-state shadow", 3756],
  ["compose_response", "Cited response or explicit blocker", 3757]
].map(([id, label, line], index) => ({ id, label, order: index + 1, source: source("src/concierge/langgraphRunner.mjs", line, id) }));

const sequences = [
  {
    id: "public-answer",
    name: "Layer 1 — public evidence answer",
    status: "implemented_proven",
    steps: ["User → HTTP channel adapter", "Policy → low/medium risk floor", "Context → Postgres catalog + Redis mirror", "Planner → allowed workflow + public capability", "RAG/API → source pointers", "Composer → cited answer"]
  },
  {
    id: "member-api",
    name: "Layer 2 — member-authorized API read",
    status: "contract_ready",
    steps: ["User → consent request", "Interrupt → payer OAuth handoff", "Vault → pointer-only token handle", "FHIR adapter → member-authorized read", "Evidence → source pointer", "Composer → member-specific answer"]
  },
  {
    id: "portal-read",
    name: "Layer 3 — authenticated portal observation",
    status: "implemented_proven",
    steps: ["Planner → API unavailable / portal required", "Interrupt → user performs login", "Approval → scoped read-only observation", "OpenClaw → allowlisted portal worker", "Verifier → authenticated evidence", "Composer → cited result or blocker"]
  },
  {
    id: "write-action",
    name: "Write/submission request",
    status: "blocked_external",
    steps: ["Planner → classify write intent", "Registry → planned capability visible", "Normalizer → runtime_selectable=0 rejects dispatch", "System → prepare packet for review", "Human → delegation/signature gates remain", "No write executed"]
  }
];

const APIs = [
  { group: "Runtime", method: "GET", path: "/api/health", purpose: "Storage, Redis, browser, memory, model, and runtime readiness", status: "implemented_proven", source: source("src/server/server.mjs", 5092) },
  { group: "Conversation", method: "POST", path: "/api/chat", purpose: "Run the LangGraph concierge turn", status: "implemented_proven", source: source("src/server/server.mjs", 5092) },
  { group: "Runtime", method: "GET", path: "/api/runtime-events", purpose: "Bounded runtime event stream; not duplicated in this watchdog", status: "implemented_proven", source: source("src/concierge/runtimeEvents.mjs", 184, "publishRuntimeEvent") },
  { group: "Memory", method: "GET", path: "/api/product-memory/status", purpose: "Graphiti/FalkorDB status and replay queue", status: "implemented_proven", source: source("src/concierge/productMemory.mjs", 445) },
  { group: "Workers", method: "GET", path: "/api/openclaw/readiness", purpose: "Gateway, profile, browser, skill, and authenticated portal readiness", status: "implemented_proven", source: source("src/concierge/openclawLiveReadiness.mjs", 1) },
  { group: "Operator", method: "GET", path: "/api/operator/tools", purpose: "Approval-scoped operator tool inventory", status: "implemented_proven", source: source("src/concierge/operatorAssistant.mjs", 1) },
  { group: "Research", method: "GET/POST", path: "/api/research/*", purpose: "Research graphs, sources, artifacts, review, budgets, and schedules", status: "implemented_proven", source: source("src/concierge/researchOps.mjs", 1) },
  { group: "Connector", method: "OAuth/FHIR", path: "Aetna Patient Access", purpose: "Coverage, EOB/claims, and member-authorized reads", status: "contract_ready", source: source("src/concierge/connectors/fhirClient.mjs", 1) },
  { group: "Connector", method: "REST", path: "Stedi eligibility", purpose: "Eligibility/benefits transaction adapter", status: "contract_ready", source: source("src/concierge/connectors/endpointRegistry.mjs", 1) },
  { group: "Connector", method: "FHIR", path: "Da Vinci PAS", purpose: "Prior-authorization submission", status: "blocked_external", source: source("src/concierge/connectors/pasPacket.mjs", 1) }
];

const prompts = [
  {
    id: "planner-layer-1",
    name: "LangGraph planner constitution",
    callSite: "model.llm_orchestration_decision",
    modelTier: "planner",
    defaultModel: "gpt-4.1",
    status: "implemented_proven",
    description: "The authoritative production system-message builder used for every orchestration decision. Runtime interpolation and live user/context payloads are omitted; exact calls belong in Langfuse when the PHI-safe debug gate allows them.",
    text: decisionTemplateSource,
    payloadPreview: safePayloadPreview,
    source: source("src/concierge/llmOrchestrationDecision.mjs", 424, "buildLlmOrchestrationDecisionMessages")
  },
  {
    id: "orchestrator-contract",
    name: "Orchestrator prompt contract",
    callSite: "buildPromptBundle.orchestrator",
    modelTier: "policy/context contract",
    defaultModel: "n/a",
    status: "implemented_proven",
    description: "Static safety, domain, memory, workflow, evidence, and handoff contract assembled into the context packet.",
    text: orchestratorTemplateSource,
    source: source("src/concierge/promptContracts.mjs", 175, "buildOrchestratorPromptContract")
  },
  {
    id: "openclaw-arm",
    name: "OpenClaw worker arm contract",
    callSite: "buildPromptBundle.openclawArm",
    modelTier: "delegated worker",
    defaultModel: "OpenClaw configured runtime",
    status: "implemented_proven",
    description: "Exact bounded worker prompt: assigned task only, read-only observation rules, progress heartbeat, insurance collection targets, and structured return contract.",
    text: openclawTemplateSource,
    source: source("src/concierge/promptContracts.mjs", 246, "buildOpenClawArmPromptContract")
  },
  {
    id: "langfuse-registry",
    name: "Langfuse prompt registry override",
    callSite: "get_prompt",
    modelTier: "runtime override",
    defaultModel: "inherits call site",
    status: "implemented_dev",
    description: "Unused helper for a future Langfuse-managed prompt override. Current authoritative prompt templates are code-built at their call sites.",
    text: lineSlice(await readFile(join(repoRoot, "src/observability/prompts.mjs"), "utf8"), 1, 46),
    source: source("src/observability/prompts.mjs", 10, "get_prompt")
  },
  {
    id: "sourced-answer",
    name: "Pointer-backed sourced answer",
    callSite: "model.sourced_answer",
    modelTier: "reasoner",
    defaultModel: "gpt-4.1",
    status: "implemented_proven",
    description: "Direct ChatOpenAI call that composes an answer only from source-pointer-backed context.",
    text: lineSlice(await readFile(join(repoRoot, "src/concierge/intelligence/sourcedAnswerComposer.mjs"), "utf8"), 22, 103),
    source: source("src/concierge/intelligence/sourcedAnswerComposer.mjs", 22)
  },
  {
    id: "process-response",
    name: "Process offer / final response",
    callSite: "model.final_response",
    modelTier: "reasoner",
    defaultModel: "gpt-4.1",
    status: "implemented_proven",
    description: "Direct model call that turns a validated process decision into a concise user-facing offer.",
    text: lineSlice(await readFile(join(repoRoot, "src/concierge/plannerResponseComposer.mjs"), "utf8"), 14, 80),
    source: source("src/concierge/plannerResponseComposer.mjs", 14)
  },
  {
    id: "graceful-degradation",
    name: "Graceful degradation response",
    callSite: "model.graceful_degradation",
    modelTier: "reasoner",
    defaultModel: "gpt-4.1",
    status: "implemented_proven",
    description: "Direct model call with a deterministic fallback when evidence or model availability is degraded.",
    text: lineSlice(await readFile(join(repoRoot, "src/concierge/gracefulDegradation.mjs"), "utf8"), 81, 174),
    source: source("src/concierge/gracefulDegradation.mjs", 81)
  },
  {
    id: "pems-evaluator",
    name: "PEMS supervised evaluator",
    callSite: "model.pems_live_evaluator",
    modelTier: "reasoner / advisory",
    defaultModel: "gpt-4.1",
    status: "implemented_dev",
    description: "Advisory evaluation prompt; it cannot promote itself into trusted runtime behavior.",
    text: lineSlice(await readFile(join(repoRoot, "src/concierge/continuousIntelligence.mjs"), "utf8"), 1984, 2106),
    source: source("src/concierge/continuousIntelligence.mjs", 1984)
  },
  {
    id: "research-worker-envelope",
    name: "OpenClaw / Hermes research envelope",
    callSite: "approvedWorkerDispatch",
    modelTier: "delegated CLI worker",
    defaultModel: "worker configured",
    status: "implemented_unproven",
    description: "Bounded JSON task envelope used for optional OpenClaw or Hermes research dispatch.",
    text: lineSlice(await readFile(join(repoRoot, "src/concierge/researchOps.mjs"), "utf8"), 1655, 1665),
    source: source("src/concierge/researchOps.mjs", 1655)
  }
];

const modelRuntimes = [
  { name: "Planner", step: "llm_orchestration_decision", tier: "planner", defaultModel: "gpt-4.1", implementation: "ChatOpenAI", credentialConfigured: configured("OPENAI_API_KEY"), liveProof: "historically proven; current direct probe recorded in Proof view when run", source: source("src/concierge/modelTierPolicy.mjs", 194, "createTieredChatModel") },
  { name: "Reasoner / composer", step: "sourced_answer | final_response | pems_live_evaluator", tier: "reasoner", defaultModel: "gpt-4.1", implementation: "ChatOpenAI", credentialConfigured: configured("OPENAI_API_KEY"), liveProof: "implemented; invocation depends on workflow", source: source("src/concierge/modelTierPolicy.mjs", 19, "STEP_TIERS") },
  { name: "Classifier", step: "classifier fallback tier", tier: "classifier", defaultModel: "gpt-4.1-mini", implementation: "ChatOpenAI", credentialConfigured: configured("OPENAI_API_KEY"), liveProof: "model tier exists; primary routing uses the single planner decision", source: source("src/concierge/modelTierPolicy.mjs", 13, "DEFAULT_MODELS") },
  { name: "Edge SLM", step: "edge_slm", tier: "edge_slm", defaultModel: "none", implementation: "explicit fail-loud", credentialConfigured: false, liveProof: "not implemented", source: source("src/concierge/modelTierPolicy.mjs", 149, "edge_slm_not_implemented") }
];

const manifest = {
  schemaVersion: "2026-07-18.founder-watchdog.v1",
  generatedAt,
  snapshot: {
    repo: "mfelix/concierge_by_openclaw_hermes",
    branch: git(["branch", "--show-current"]),
    commit: git(["rev-parse", "HEAD"]),
    shortCommit: git(["rev-parse", "--short", "HEAD"]),
    sourceRoot,
    dirty: Boolean(git(["status", "--porcelain"], "")),
    policy: "Generated deploy snapshot. Re-run npm run generate:watchdog at each implementation deployment.",
    controlBridge: "not_connected",
    graphStats
  },
  truthLegend: [
    { id: "implemented_proven", label: "Implemented + proven", color: "green", meaning: "Source and acceptance proof exist." },
    { id: "implemented_unproven", label: "Implemented · not live-proven", color: "amber", meaning: "Code exists, but this snapshot lacks a successful current runtime proof." },
    { id: "implemented_dev", label: "Implemented, non-production", color: "amber", meaning: "Code exists but is test/dev-only or not production-cleared." },
    { id: "contract_ready", label: "Contract ready", color: "amber", meaning: "Interface and rails exist; credentials/enrollment/runtime proof are incomplete." },
    { id: "blocked_external", label: "Externally blocked", color: "red", meaning: "Signature, delegation, legal, enrollment, or credential gate prevents execution." },
    { id: "planned", label: "Planned", color: "slate", meaning: "Roadmap-visible and not implemented." }
  ],
  summary: {
    projectName: "Wefella / Brainstyworkers Health Insurance Concierge",
    currentPhase: 90,
    landedPhases: ledger.phases.filter((phase) => phase.status === "landed").length,
    inProgressPhases: ledger.phases.filter((phase) => phase.status === "in_progress").length,
    blockedPhases: ledger.phases.filter((phase) => phase.status === "blocked_external").length,
    plannedPhases: ledger.phases.filter((phase) => phase.status === "planned").length,
    moduleCount: modules.length,
    sourceModuleCount: moduleFiles.length,
    tableCount: postgresSchema.tableCount,
    redisNamespaceCount: Object.keys(redisKeys.namespaces).length
  },
  capabilityInventory: {
    total: 39,
    implementedRuntimeClaim: 30,
    contractReady: 5,
    blockedExternalEnrollment: 1,
    planned: 3,
    activeProcesses: 13,
    processSteps: 57,
    toolAssignments: 36,
    caveat: "Registry claims are not live-health proof. A runtime-selectable capability can still have an empty backing table or stopped dependency.",
    source: source("src/concierge/capabilityCatalogSeed.mjs", 80)
  },
  liveProbes,
  modules,
  graphFlow,
  sequences,
  phases: ledger.phases,
  prompts,
  modelRuntimes,
  APIs,
  data: {
    postgres: {
      engine: postgresSchema.engine,
      generatedFrom: postgresSchema.generatedFrom,
      generatedAt: postgresSchema.generatedAt,
      tableCount: postgresSchema.tableCount,
      groups: groupTables(Object.entries(postgresSchema.tables)),
      authoritySource: source("src/concierge/databaseFactory.mjs", 46, "runtimePostgresAuthority")
    },
    redis: {
      description: redisKeys.description,
      backendSelection: redisKeys.backendSelection,
      namespaces: Object.entries(redisKeys.namespaces).map(([name, value]) => ({ name, ...value })),
      source: source("src/concierge/runtimeContextCache.mjs", 285, "createRuntimeContextCache")
    },
    drivers: [
      { name: "pg", role: "Production Postgres adapter", status: "implemented_proven", package: "pg ^8.21.0", source: source("src/concierge/postgresStore.mjs", 1) },
      { name: "SQLite test store", role: "Hermetic tests and compatibility", status: "implemented_dev", package: "node:sqlite", source: source("src/tests/support/sqliteTestStore.mjs", 1) },
      { name: "RESP client", role: "Minimal Redis runtime mirror", status: "implemented_proven", package: "native TCP/RESP", source: source("src/concierge/runtimeContextCache.mjs", 1) },
      { name: "FalkorDB", role: "Graphiti graph backend", status: "implemented_proven", package: "graphiti-core external service", source: source("src/concierge/productMemory.mjs", 37) },
      { name: "LangGraph saver", role: "Encrypted workflow checkpoint driver", status: "implemented_proven", package: "@langchain/langgraph", source: source("src/concierge/graphCheckpointer.mjs", 210) }
    ]
  },
  configuration: {
    file: "docs/THREE_LAYER_PLANNER_SPINE_CONFIG.yaml",
    source: source("docs/THREE_LAYER_PLANNER_SPINE_CONFIG.yaml", 1),
    topLevelSections: [...spineYaml.matchAll(/^([a-zA-Z_][a-zA-Z0-9_]*):/gm)].map((match) => match[1]),
    rawYaml: spineYaml,
    configuredEnvNames: [
      "OPENAI_API_KEY", "BRAINSTY_REDIS_URL", "BRAINSTY_DATABASE_URL", "LANGFUSE_HOST", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "FALKORDB_HOST", "FALKORDB_PORT"
    ].map((name) => ({ name, configured: configured(name) })),
    secretsPolicy: "Only variable names and configured/not-configured booleans are exported. Values, tokens, cookies, member data, and credentials are never included."
  },
  sourceEvidence: {
    graphify: graphStats,
    plannerExcerpt: lineSlice(decisionSource, 421, 463),
    workerPromptExcerpt: lineSlice(promptContractSource, 246, 355),
    canonicalDocs: [
      source("docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md", 1),
      source("docs/THREE_LAYER_PLANNER_SPINE_CONFIG.yaml", 1),
      source("docs/THREE_LAYER_PLANNER_PROMPT_DRAFT.md", 1),
      source("docs/THREE_LAYER_PIVOT_RATIONALE_AETNA_UM.md", 1),
      source("docs/THREE_LAYER_FOUNDER_DECISION_SHEET.md", 1),
      source("docs/db/phase-ledger.json", 1)
    ],
    focusedVerification: {
      tests: 35,
      passed: 29,
      skippedLoud: 6,
      failed: 0,
      phase89LiveTests: 9,
      phase89Passed: 8,
      claims: [
        "11-node graph topology and fail-loud router",
        "Decision Contract v2 parsing and registry dispatch restrictions",
        "Token-vault encryption, revoke, and expiry",
        "Postgres-only durable AES-256-GCM checkpointer",
        "Real Humana FHIR provider-directory pagination",
        "Real Aetna HealthSparq bounded MRF ingestion",
        "Real CMS LCD/NCD policy crawl"
      ]
    },
    driftWarnings: [
      { severity: "high", title: "Architecture docs lag runtime authority", detail: "SYSTEM_ARCHITECTURE.md still describes SQLite compatibility, 12 graph nodes, and 75 tables; origin/main is Postgres-only, 11 nodes, and 89 tables.", source: source("docs/SYSTEM_ARCHITECTURE.md", 1) },
      { severity: "high", title: "Database docs retain stale SQLite wording", detail: "DATABASE_POSTGRES.md and DATABASE_REDIS.md still describe a Postgres/SQLite authority split. The runtime factory now rejects non-Postgres authority.", source: source("docs/DATABASE_POSTGRES.md", 16) },
      { severity: "medium", title: "Configured ports differ from host services", detail: "Project defaults expect Postgres 55432 and Redis 6381; host services may be reachable at 5432 and 6379. The generator probes both and reports the actual endpoint.", source: source("docs/THREE_LAYER_PLANNER_IMPLEMENTATION_PLAN.md", 647) },
      { severity: "medium", title: "Langfuse and dashboard port collision avoided", detail: "The repository example uses port 3000; the actual configured Langfuse host is used instead. The Watchdog never assumes its own preview listener is Langfuse.", source: source("src/observability/langfuseClient.mjs", 16) },
      { severity: "medium", title: "Legacy environment switches remain documented", detail: ".env.example still mentions a deleted orchestrator switch and memory/file checkpointer defaults that current fail-closed code no longer permits.", source: source(".env.example", 85) }
    ]
  },
  links: {
    langfuse: configuredLangfuseUrl,
    application: liveProbes.app.reachable ? liveProbes.app.url.replace("/api/health", "") : "http://localhost:4173",
    openclaw: "http://localhost:19789",
    repository: "https://github.com/mfelix/concierge_by_openclaw_hermes"
  }
};

const output = `${JSON.stringify(manifest, null, 2)}\n`;
for (const path of [join(siteRoot, "app/generated/watchdog-manifest.json"), join(siteRoot, "public/watchdog-manifest.json")]) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, output);
}

console.log(`Founder Watchdog manifest: ${manifest.summary.moduleCount} curated modules, ${manifest.summary.sourceModuleCount} source modules, ${manifest.summary.tableCount} Postgres tables, ${manifest.summary.redisNamespaceCount} Redis namespaces.`);
