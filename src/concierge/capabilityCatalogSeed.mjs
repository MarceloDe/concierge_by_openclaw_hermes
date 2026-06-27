import { BRAINSTY_GRAPH_NODE_NAMES } from "./langgraphRunner.mjs";

export const CAPABILITY_CATALOG_VERSION = "2026-06-27.capability-catalog-seed.v1";

const VALID_NODES = new Set(BRAINSTY_GRAPH_NODE_NAMES);

// Only backing keys that already exist in workflow_definitions/openclaw_skills/
// tool_registry are referenced (FKs are enforced). Items requiring NEW backing rows
// (provider_network_navigation, cost_estimate_navigation workflows; ocr_local /
// browser_automation skills; cms_icd10_lookup tool; user_takeover_login graph node)
// are DEFERRED to a later step because they require new workflow_definitions / policy
// allowed-workflows. See docs/CAPABILITY_PORTFOLIO_SCHEMA_PROPOSAL.md section 6.
const meta = (when, why, best, score) => ({ when_to_use: when, why_use: why, best_used_for: best, planner_score: score });

export const CAPABILITY_CATALOG = Object.freeze({
  capabilities: [
    // workflows (FK workflow_key)
    { capability_key: "workflow:eligibility_benefits_navigation", kind: "workflow", workflow_key: "eligibility_benefits_navigation", short_description: "Coverage, deductible, OOP max, copay lookup.", ...meta("user asks about coverage / what they owe / deductible / OOP / effective dates", "routes benefit + cost-sharing questions to the eligibility journey", "benefits and coverage understanding", 30) },
    { capability_key: "workflow:claim_status_navigation", kind: "workflow", workflow_key: "claim_status_navigation", short_description: "Claim status, EOB, patient responsibility, why-billed.", ...meta("user asks status of a claim / why was I billed / patient responsibility", "routes claim/EOB questions to the claim journey", "claim status and EOB interpretation", 30) },
    { capability_key: "workflow:prior_authorization_navigation", kind: "workflow", workflow_key: "prior_authorization_navigation", short_description: "Prior-auth status and payer requirements.", ...meta("user asks do I need pre-auth / PA status / approval requirement", "routes PA questions; never submits", "prior authorization status and criteria", 28) },
    { capability_key: "workflow:pharmacy_formulary", kind: "workflow", workflow_key: "pharmacy_formulary", short_description: "Drug coverage, tier, step therapy, alternatives.", ...meta("user asks is my drug covered / tier / copay / alternatives", "routes pharmacy/formulary questions", "medication coverage", 28) },
    { capability_key: "workflow:document_or_trace_review", kind: "workflow", workflow_key: "document_or_trace_review", short_description: "Interpret uploaded EOB/SBC/ID/denial documents.", ...meta("user uploads a document to interpret; no login needed", "routes to local document extraction + review", "uploaded document interpretation", 26) },
    { capability_key: "workflow:denial_appeal_preparation", kind: "workflow", workflow_key: "denial_appeal_preparation", short_description: "Understand a denial and assemble appeal support (draft only).", ...meta("denied claim/PA; understand grounds and assemble support", "composes claim + document + policy lookups; draft only, never sends", "denial appeal support", 24) },
    { capability_key: "workflow:payer_portal_read_only_extraction", kind: "workflow", workflow_key: "payer_portal_read_only_extraction", short_description: "Read-only structured extraction from an authenticated portal.", ...meta("specific plan data only available behind portal login", "drives the read-only observation after user takeover login", "authenticated portal evidence capture", 26) },
    // skills (FK skill_key)
    { capability_key: "skill:insurance_portal_browser", kind: "skill", skill_key: "insurance_portal_browser", short_description: "Execution arm: OBSERVE a user-authenticated portal (read-only).", ...meta("portal evidence is needed after the user logs in", "the OpenClaw read-only browser skill; never enters credentials", "read-only portal observation", 22) },
    { capability_key: "skill:insurance_knowledge_research", kind: "skill", skill_key: "insurance_knowledge_research", short_description: "Research authoritative published insurance/policy sources.", ...meta("a fact is published (formulary/SBC/policy) and not behind login", "retrieves + cites authoritative sources", "authoritative published research", 16) },
    // tools (FK tool_key)
    { capability_key: "tool:openclaw_authenticated_browser", kind: "tool", tool_key: "openclaw_authenticated_browser", short_description: "Dispatch handle for the OpenClaw browser arm.", ...meta("a worker dispatch to the read-only browser is required", "bridges worker dispatch + idempotency + lease", "browser worker dispatch", 14) },
    { capability_key: "tool:payer_portal_reader", kind: "tool", tool_key: "payer_portal_reader", short_description: "Structured read-only portal extraction to source pointers.", ...meta("portal page content must be turned into cited evidence", "produces portal_page_snapshots + extraction_artifacts", "portal extraction", 14) },
    { capability_key: "tool:aetna_cpb_lookup", kind: "tool", tool_key: "aetna_cpb_lookup", short_description: "Aetna clinical policy bulletin criteria.", ...meta("PA/appeal needs payer clinical policy criteria", "retrieves CPB criteria with citation, no PHI sent", "payer policy criteria", 12) },
    { capability_key: "tool:cms_mcd_lookup", kind: "tool", tool_key: "cms_mcd_lookup", short_description: "Medicare NCD/LCD coverage determinations.", ...meta("coverage determination requires CMS NCD/LCD", "retrieves CMS coverage determinations + citation", "medicare coverage determination", 12) },
    { capability_key: "tool:document_trace_parser", kind: "tool", tool_key: "document_trace_parser", short_description: "Parse uploaded EOB/SBC/denial artifacts.", ...meta("an uploaded document must be parsed to structured fields", "structured extraction over extraction_artifacts", "document parsing", 12) },
    { capability_key: "tool:web_search_authoritative_sources", kind: "tool", tool_key: "web_search_authoritative_sources", short_description: "Authoritative web retrieval for published facts.", ...meta("a needed fact is published online and citation is acceptable", "authoritative web retrieval + citation", "published fact retrieval", 10) },
    // graph paths (NO FK; graph_subpath validated against the node registry)
    { capability_key: "graph_path:input_policy_to_llm_planner", kind: "graph_path", graph_subpath: ["input_policy", "recall_context", "classify_intent", "llm_decision", "workflow_router"], short_description: "Safety-gated LLM planner entry path.", ...meta("entry path for any chat after safety gates pass", "the deterministic-rails -> LLM planner spine", "request routing", 10) },
    { capability_key: "graph_path:approval_interrupt_resume", kind: "graph_path", graph_subpath: ["observe_evidence", "approval_pause", "observe_evidence"], short_description: "Native HITL approval pause before worker/write.", ...meta("read-only worker execution needs explicit human approval", "native LangGraph interrupt + resume on approval token", "human-in-the-loop approval", 10) },
    { capability_key: "graph_path:evidence_to_sourced_answer", kind: "graph_path", graph_subpath: ["observe_evidence", "case_state_shadow", "compose_response"], short_description: "Cited answer once trusted source pointers exist.", ...meta("trusted source pointers exist and can be cited", "evidence -> case shadow -> cited compose", "sourced answer composition", 10) }
  ],
  processes: [
    {
      process_key: "process:portal_readonly_lookup",
      title: "Read-only insurer portal lookup",
      journey_stage: "coverage_understanding",
      offerable: 1,
      display_order: 1,
      short_description: "You log in yourself; I read and cite what's on screen.",
      ...meta("a payer-portal data request when a portal account exists but no fresh evidence is cached", "the default spine to obtain plan-specific data without the agent ever entering credentials", "plan-specific lookups requiring portal login", 26),
      required_user_inputs: [{ key: "which_payer_portal", label: "Which insurance portal", why: "to open the right site", sensitive: false }],
      approval_scope: "read_only_observation",
      worker_skill_capability_key: "skill:insurance_portal_browser",
      graph_subpath: ["input_policy", "recall_context", "classify_intent", "llm_decision", "workflow_router", "plan_journey", "skill_resolver", "workflow_executor", "observe_evidence", "approval_pause", "case_state_shadow", "compose_response"],
      steps: [
        { step_key: "policy", checkpoint_boundary: "after_policy_gate", title: "Safety gate", capability_key: "graph_path:input_policy_to_llm_planner" },
        { step_key: "plan", checkpoint_boundary: "after_planner", title: "Plan route" },
        { step_key: "observe", checkpoint_boundary: "before_worker", title: "Read-only observe (after your login)", capability_key: "skill:insurance_portal_browser", requires_idempotency_key: 1 },
        { step_key: "evidence", checkpoint_boundary: "after_evidence", title: "Capture cited evidence", expected_source_pointer: 1 },
        { step_key: "respond", checkpoint_boundary: "after_response", title: "Compose cited answer" }
      ]
    }
  ]
});

export function validateCatalogGraphNodes(catalog = CAPABILITY_CATALOG) {
  const unknown = [];
  const check = (subpath, owner) => {
    for (const node of subpath ?? []) {
      if (!VALID_NODES.has(node)) unknown.push(`${owner}:${node}`);
    }
  };
  for (const cap of catalog.capabilities ?? []) if (cap.kind === "graph_path") check(cap.graph_subpath, cap.capability_key);
  for (const proc of catalog.processes ?? []) check(proc.graph_subpath, proc.process_key);
  if (unknown.length) {
    throw new Error(`capability_catalog_invalid_graph_nodes: ${unknown.join(", ")}`);
  }
  return true;
}

async function upsert(store, table, keyCol, keyVal, row, nowIso, createId) {
  const existing = await store.findOne(table, { [keyCol]: keyVal });
  if (existing) {
    const { id: _ignore, created_at: _ignore2, ...mutable } = row;
    await store.update(table, { ...mutable, updated_at: nowIso() }, { id: existing.id });
    return existing.id;
  }
  const id = row.id ?? createId(table.slice(0, 4));
  await store.insert(table, { id, ...row, created_at: nowIso(), updated_at: nowIso() });
  return id;
}

export async function seedCapabilityCatalog(store, { nowIso, createId, catalog = CAPABILITY_CATALOG, validateGraphNodes = true } = {}) {
  if (validateGraphNodes) validateCatalogGraphNodes(catalog);
  const capIdByKey = {};
  for (const cap of catalog.capabilities) {
    const id = await upsert(store, "capabilities", "capability_key", cap.capability_key, {
      id: `cap:${cap.capability_key}`,
      capability_key: cap.capability_key,
      kind: cap.kind,
      status: "active",
      lifecycle_state: "production",
      short_description: cap.short_description ?? "",
      when_to_use: cap.when_to_use ?? "",
      why_use: cap.why_use ?? "",
      best_used_for: cap.best_used_for ?? "",
      planner_score: cap.planner_score ?? 0,
      metadata_phi_cleared: 1,
      workflow_key: cap.workflow_key ?? null,
      skill_key: cap.skill_key ?? null,
      tool_key: cap.tool_key ?? null,
      graph_subpath_json: cap.graph_subpath ? JSON.stringify(cap.graph_subpath) : null,
      how_kind_ref: cap.workflow_key ? "workflow_definitions" : cap.skill_key ? "openclaw_skills" : cap.tool_key ? "tool_registry" : "self"
    }, nowIso, createId);
    capIdByKey[cap.capability_key] = id;
  }
  for (const proc of catalog.processes) {
    const procId = await upsert(store, "processes", "process_key", proc.process_key, {
      id: `proc:${proc.process_key}`,
      process_key: proc.process_key,
      title: proc.title,
      journey_stage: proc.journey_stage ?? null,
      status: "active",
      lifecycle_state: "production",
      offerable: proc.offerable ?? 0,
      display_order: proc.display_order ?? 100,
      short_description: proc.short_description ?? "",
      when_to_use: proc.when_to_use ?? "",
      why_use: proc.why_use ?? "",
      best_used_for: proc.best_used_for ?? "",
      planner_score: proc.planner_score ?? 0,
      required_user_inputs_json: JSON.stringify(proc.required_user_inputs ?? []),
      approval_scope: proc.approval_scope ?? "read_only_observation",
      worker_skill_capability_id: proc.worker_skill_capability_key ? capIdByKey[proc.worker_skill_capability_key] ?? null : null,
      graph_subpath_json: proc.graph_subpath ? JSON.stringify(proc.graph_subpath) : null
    }, nowIso, createId);
    let order = 0;
    for (const step of proc.steps ?? []) {
      await upsert(store, "process_steps", "id", `pstep:${proc.process_key}:${step.step_key}`, {
        id: `pstep:${proc.process_key}:${step.step_key}`,
        process_id: procId,
        step_order: order++,
        step_key: step.step_key,
        title: step.title ?? null,
        checkpoint_boundary: step.checkpoint_boundary,
        capability_id: step.capability_key ? capIdByKey[step.capability_key] ?? null : null,
        expected_source_pointer: step.expected_source_pointer ?? 0,
        requires_idempotency_key: step.requires_idempotency_key ?? 0
      }, nowIso, createId);
    }
  }
  return { version: CAPABILITY_CATALOG_VERSION, capabilities: catalog.capabilities.length, processes: catalog.processes.length };
}
