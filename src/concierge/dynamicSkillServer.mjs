import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { nowIso } from "./database.mjs";

export const DYNAMIC_SKILL_SERVER_VERSION = "2026-06-02.dynamic-skill-server.phase10u.v1";

const DEFAULT_SKILL_ROOT = resolve("openclaw/skills");
const SKILL_SERVER_FILE = "skill-server.json";

const ALLOWED_SKILL_KINDS = new Set(["insurance_specific", "journey_specific", "execution_specific"]);
const ALLOWED_DATABASE_QUERIES = new Set([
  "latest_eligibility_snapshot_by_session",
  "recent_claim_items_by_session",
  "recent_prior_authorizations_by_session",
  "latest_portal_pages_by_session",
  "open_tasks_by_user",
  "trusted_research_artifacts_by_workflow"
]);

function text(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function compact(value, limit = 360) {
  const valueText = text(value);
  return valueText.length > limit ? `${valueText.slice(0, limit - 3)}...` : valueText;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined).map((item) => String(item)) : [String(value)];
}

function hashObject(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function parseJson(textValue, source) {
  try {
    return JSON.parse(textValue);
  } catch (error) {
    throw new Error(`Invalid ${SKILL_SERVER_FILE} JSON in ${source}: ${error.message}`);
  }
}

function lowerTokens(values) {
  return asArray(values).map((item) => item.toLowerCase()).filter(Boolean);
}

export function validateDynamicSkillDefinition(definition) {
  const issues = [];
  const warnings = [];
  if (!definition || typeof definition !== "object") issues.push("definition_missing");
  const skillKey = text(definition?.skill_key);
  if (!skillKey) issues.push("skill_key_required");
  if (!text(definition?.schema_version).startsWith("brainstyworkers.dynamic_skill.")) {
    issues.push("schema_version_must_start_brainstyworkers_dynamic_skill");
  }
  if (!ALLOWED_SKILL_KINDS.has(definition?.skill_kind)) {
    issues.push(`skill_kind_not_allowed:${definition?.skill_kind ?? "missing"}`);
  }
  if (definition?.editable_by !== "external_skill_generator_llm") {
    warnings.push("editable_by_should_be_external_skill_generator_llm");
  }
  const databaseQueries = asArray(definition?.runtime_mounts?.database_queries);
  for (const query of databaseQueries) {
    if (!ALLOWED_DATABASE_QUERIES.has(query)) issues.push(`database_query_not_allowed:${query}`);
  }
  const answerContract = asArray(definition?.answer_contract?.required_fields);
  for (const required of ["status", "facts", "citations", "uncertainties", "next_actions"]) {
    if (!answerContract.includes(required)) warnings.push(`answer_contract_missing:${required}`);
  }
  if (definition?.skill_kind === "insurance_specific" && !asArray(definition?.matching?.carriers).length) {
    warnings.push("insurance_specific_skill_has_no_carriers");
  }
  if (definition?.skill_kind === "journey_specific" && !asArray(definition?.matching?.workflows).length) {
    warnings.push("journey_specific_skill_has_no_workflows");
  }
  return {
    valid: issues.length === 0,
    issues,
    warnings,
    checked: {
      skillKey,
      skillKind: definition?.skill_kind ?? null,
      databaseQueries,
      editableBy: definition?.editable_by ?? null
    }
  };
}

export async function loadDynamicSkillDefinitions(options = {}) {
  const root = options.root ? resolve(options.root) : DEFAULT_SKILL_ROOT;
  const entries = await readdir(root, { withFileTypes: true });
  const definitions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(root, entry.name);
    const serverPath = join(skillDir, SKILL_SERVER_FILE);
    try {
      const raw = await readFile(serverPath, "utf8");
      const definition = parseJson(raw, serverPath);
      const validation = validateDynamicSkillDefinition(definition);
      definitions.push({
        version: DYNAMIC_SKILL_SERVER_VERSION,
        skillKey: definition.skill_key,
        skillKind: definition.skill_kind,
        skillDir,
        serverPath,
        definition,
        validation
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  definitions.sort((a, b) => String(a.skillKey).localeCompare(String(b.skillKey)));
  return {
    version: DYNAMIC_SKILL_SERVER_VERSION,
    skillRoot: root,
    definitions
  };
}

async function runMountedDatabaseQuery(store, queryKey, { userId, sessionId, workflow }) {
  if (!store || !ALLOWED_DATABASE_QUERIES.has(queryKey)) return { queryKey, status: "blocked_or_unavailable", rows: [] };
  let rows = [];
  if (queryKey === "latest_eligibility_snapshot_by_session" && sessionId) {
    rows = await store.all("SELECT id, portal_account_id, source_url, summary, created_at FROM eligibility_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 3;", [sessionId]);
  } else if (queryKey === "recent_claim_items_by_session" && sessionId) {
    rows = await store.all("SELECT ci.id, ci.description, ci.service_date, ci.share_amount, ci.source, ci.created_at FROM claim_items ci JOIN eligibility_snapshots es ON es.id = ci.snapshot_id WHERE es.session_id = ? ORDER BY ci.created_at DESC LIMIT 6;", [sessionId]);
  } else if (queryKey === "recent_prior_authorizations_by_session" && sessionId) {
    rows = await store.all("SELECT pa.id, pa.provider_or_facility, pa.service_date, pa.status, pa.source, pa.created_at FROM prior_authorizations pa JOIN eligibility_snapshots es ON es.id = pa.snapshot_id WHERE es.session_id = ? ORDER BY pa.created_at DESC LIMIT 6;", [sessionId]);
  } else if (queryKey === "latest_portal_pages_by_session" && sessionId) {
    rows = await store.all("SELECT id, page_kind, title, url, created_at FROM portal_page_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 6;", [sessionId]);
  } else if (queryKey === "open_tasks_by_user" && userId) {
    rows = await store.all("SELECT id, task_type, status, description, created_at FROM agent_tasks WHERE user_id = ? AND status NOT IN ('completed', 'cancelled', 'denied') ORDER BY created_at DESC LIMIT 8;", [userId]);
  } else if (queryKey === "trusted_research_artifacts_by_workflow") {
    rows = workflow
      ? await store.all(
          "SELECT id, artifact_type, title, source_id, run_id, citation_status, created_at FROM research_artifacts WHERE citation_status = 'trusted_retrieval_approved' AND metadata_json LIKE ? ORDER BY created_at DESC LIMIT 6;",
          [`%${workflow}%`]
        )
      : await store.all("SELECT id, artifact_type, title, source_id, run_id, citation_status, created_at FROM research_artifacts WHERE citation_status = 'trusted_retrieval_approved' ORDER BY created_at DESC LIMIT 6;");
  }
  return {
    queryKey,
    status: rows.length ? "mounted" : "empty",
    rowCount: rows.length,
    rows: rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? compact(value, 420) : value])))
  };
}

function matchDefinition(definition, context) {
  const inputText = `${context.userInput} ${context.workflow ?? ""} ${context.intent ?? ""} ${context.payer ?? ""}`.toLowerCase();
  const matching = definition.matching ?? {};
  const workflowMatches = lowerTokens(matching.workflows).filter((item) => item === String(context.workflow ?? "").toLowerCase());
  const intentMatches = lowerTokens(matching.intents).filter((item) => item === String(context.intent ?? "").toLowerCase());
  const carrierMatches = lowerTokens(matching.carriers).filter((item) => item && String(context.payer ?? "").toLowerCase().includes(item));
  const keywordMatches = lowerTokens(matching.keywords).filter((item) => item && inputText.includes(item));
  const questionTypeMatches = lowerTokens(matching.question_types).filter((item) => item && inputText.includes(item.replaceAll("_", " ")));
  const score =
    workflowMatches.length * 35 +
    intentMatches.length * 20 +
    carrierMatches.length * 25 +
    keywordMatches.length * 8 +
    questionTypeMatches.length * 10;
  return {
    score,
    workflowMatches,
    intentMatches,
    carrierMatches,
    keywordMatches,
    questionTypeMatches
  };
}

function successEstimate(definition, match, mountedQueries, context) {
  const model = definition.success_model ?? {};
  let chance = Number(model.base_chance ?? 0.35);
  if (match.score >= 35) chance += 0.2;
  if (match.carrierMatches.length) chance += 0.15;
  if (mountedQueries.some((item) => item.rowCount > 0)) chance += 0.2;
  if ((context.dbPointers ?? []).length) chance += 0.1;
  const blockers = [];
  const missingData = [];
  for (const required of asArray(definition.data_needed?.required)) {
    const present = JSON.stringify(context).toLowerCase().includes(required.toLowerCase()) || mountedQueries.some((item) => JSON.stringify(item).toLowerCase().includes(required.toLowerCase()));
    if (!present) missingData.push(required);
  }
  if (missingData.length) chance -= Math.min(0.25, missingData.length * 0.05);
  for (const blocker of asArray(model.blockers)) {
    if (blocker === "no_authenticated_portal" && !context.portalUrl) blockers.push(blocker);
    if (blocker === "no_source_pointer" && !(context.dbPointers ?? []).length && !mountedQueries.some((item) => item.rowCount > 0)) blockers.push(blocker);
  }
  if (blockers.length) chance -= Math.min(0.25, blockers.length * 0.1);
  return {
    chance: Math.max(0, Math.min(1, Number(chance.toFixed(2)))),
    missingData,
    blockers
  };
}

function selectByKind(matches, kind) {
  return matches
    .filter((item) => item.skillKind === kind)
    .sort((a, b) => b.fit.score - a.fit.score || b.success.chance - a.success.chance)[0] ?? null;
}

export async function resolveDynamicSkillContext(store, state, options = {}) {
  const packet = state.context_packet ?? {};
  const session = packet.currentSession ?? { id: state.session_id, threadId: state.graph_trace_id, channel: state.channel };
  const context = {
    generatedAt: nowIso(),
    userId: packet.user?.id ?? state.user_id ?? null,
    sessionId: session.id ?? state.session_id ?? null,
    threadId: session.threadId ?? state.graph_trace_id ?? null,
    channel: session.channel ?? state.channel ?? "local_web_chat",
    userInput: state.user_input ?? packet.request?.userInput ?? "",
    workflow: state.workflow ?? state.structured_intent?.workflow ?? state.llm_orchestration_decision?.workflow ?? null,
    intent: state.structured_intent?.intent ?? state.intent ?? null,
    payer: packet.portalAccount?.payer ?? packet.user?.payer ?? null,
    portalUrl: packet.portalAccount?.portalUrl ?? null,
    memoryItems: packet.memoryItems ?? [],
    productMemoryFacts: state.product_memory_recall?.facts ?? packet.productMemory?.recalledFacts ?? [],
    dbPointers: packet.dbPointers ?? [],
    routeCandidates: packet.workflowArchitecture?.routeCandidates ?? [],
    workflowReadiness: packet.workflowArchitecture?.readiness ?? [],
    openTasks: packet.openTasks ?? [],
    scheduledJobs: packet.scheduledJobs ?? []
  };
  const loaded = await loadDynamicSkillDefinitions(options);
  const matches = [];
  for (const artifact of loaded.definitions) {
    const definition = artifact.definition;
    const fit = matchDefinition(definition, context);
    const shouldMount = fit.score > 0 || asArray(definition.matching?.workflows).includes(String(context.workflow ?? ""));
    if (!artifact.validation.valid || !shouldMount) continue;
    const queryKeys = asArray(definition.runtime_mounts?.database_queries);
    const mountedQueries = [];
    for (const queryKey of queryKeys) {
      mountedQueries.push(await runMountedDatabaseQuery(store, queryKey, context));
    }
    const success = successEstimate(definition, fit, mountedQueries, context);
    matches.push({
      skillKey: definition.skill_key,
      skillKind: definition.skill_kind,
      title: definition.title,
      status: definition.status,
      editableBy: definition.editable_by,
      fit,
      success,
      questionsToSolve: asArray(definition.questions_to_solve),
      dataNeeded: definition.data_needed ?? {},
      runtimeVariables: definition.runtime_variables ?? {},
      requiredWorkers: definition.required_workers ?? {},
      requiredSearch: definition.required_search ?? {},
      requiredApis: definition.required_apis ?? {},
      answerContract: definition.answer_contract ?? {},
      mountedContext: {
        memoryItemCount: context.memoryItems.length,
        productMemoryFactCount: context.productMemoryFacts.length,
        dbPointerCount: context.dbPointers.length,
        databaseQueries: mountedQueries
      },
      artifactHash: hashObject(definition)
    });
  }
  const selectedInsuranceSkill = selectByKind(matches, "insurance_specific");
  const selectedJourneySkill = selectByKind(matches, "journey_specific");
  const selectedExecutionSkill = selectByKind(matches, "execution_specific");
  const requiresPortalObservation =
    Boolean(selectedJourneySkill?.requiredWorkers?.openclaw_tasks?.length) ||
    ["eligibility_benefits_navigation", "claim_status_navigation", "payer_portal_read_only_extraction"].includes(context.workflow);
  return {
    version: DYNAMIC_SKILL_SERVER_VERSION,
    generatedAt: context.generatedAt,
    langGraphCompatibility: {
      stateField: "dynamic_skill_context",
      node: "skill_resolver",
      usesSharedStateUpdates: true,
      requiresConfigurableThreadId: true,
      sideEffects: "read_only_context_mounts"
    },
    contextSummary: {
      userId: context.userId,
      sessionId: context.sessionId,
      threadId: context.threadId,
      workflow: context.workflow,
      intent: context.intent,
      payer: context.payer,
      memoryItemCount: context.memoryItems.length,
      productMemoryFactCount: context.productMemoryFacts.length,
      dbPointerCount: context.dbPointers.length
    },
    selected: {
      insuranceSkillKey: selectedInsuranceSkill?.skillKey ?? null,
      journeySkillKey: selectedJourneySkill?.skillKey ?? null,
      executionSkillKey: selectedExecutionSkill?.skillKey ?? (requiresPortalObservation ? "insurance_portal_browser" : null)
    },
    matches,
    requiredOpenClawTasks: [
      ...asArray(selectedJourneySkill?.requiredWorkers?.openclaw_tasks),
      ...(requiresPortalObservation ? ["insurance_portal_browser.read_only_observation"] : [])
    ].filter((item, index, list) => list.indexOf(item) === index),
    requiredSearch: [
      ...asArray(selectedInsuranceSkill?.requiredSearch?.engines),
      ...asArray(selectedJourneySkill?.requiredSearch?.engines)
    ].filter((item, index, list) => list.indexOf(item) === index),
    requiredApis: [
      ...asArray(selectedInsuranceSkill?.requiredApis?.connectors),
      ...asArray(selectedJourneySkill?.requiredApis?.connectors)
    ].filter((item, index, list) => list.indexOf(item) === index),
    dataNeeded: [
      ...asArray(selectedInsuranceSkill?.dataNeeded?.required),
      ...asArray(selectedJourneySkill?.dataNeeded?.required)
    ].filter((item, index, list) => list.indexOf(item) === index),
    successEstimate: {
      insurance: selectedInsuranceSkill?.success ?? null,
      journey: selectedJourneySkill?.success ?? null,
      overallChance: Math.max(0, Math.min(1, Number(((selectedInsuranceSkill?.success?.chance ?? 0.35) * 0.45 + (selectedJourneySkill?.success?.chance ?? 0.35) * 0.55).toFixed(2))))
    },
    generatorEditContract: {
      editableFiles: loaded.definitions.map((item) => item.serverPath),
      allowedDatabaseQueries: [...ALLOWED_DATABASE_QUERIES],
      forbiddenEdits: ["raw_sql", "credential_capture", "unapproved_external_action", "medical_advice"]
    }
  };
}
