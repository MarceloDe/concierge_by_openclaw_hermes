import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { buildContextPacket } from "../concierge/memoryHarness.mjs";
import { toLangGraphAgentState, toOpenClawHeartbeatEnvelope } from "../concierge/runtimeAdapters.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-workflow-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("runtime registries are seeded during database initialization", async () => {
  const store = await createStore();

  const [workflows, tools, sources, skills] = await Promise.all([
    store.all("SELECT * FROM workflow_definitions ORDER BY workflow_key ASC;"),
    store.all("SELECT * FROM tool_registry ORDER BY tool_key ASC;"),
    store.all("SELECT * FROM knowledge_sources ORDER BY source_key ASC;"),
    store.all("SELECT * FROM openclaw_skills ORDER BY skill_key ASC;")
  ]);

  assert.ok(workflows.some((row) => row.workflow_key === "eligibility_benefits_navigation"));
  assert.ok(workflows.some((row) => row.workflow_key === "pharmacy_formulary"));
  assert.ok(workflows.some((row) => row.workflow_key === "denial_appeal_preparation"));
  assert.ok(tools.some((row) => row.tool_key === "openclaw_authenticated_browser"));
  assert.ok(tools.some((row) => row.tool_key === "hindsight_memory_adapter"));
  assert.ok(sources.some((row) => row.source_key === "cms_icd10_files"));
  assert.ok(sources.some((row) => row.source_key === "aetna_clinical_policy_bulletins"));
  const browserSkill = skills.find((row) => row.skill_key === "insurance_portal_browser");
  assert.ok(browserSkill);
  assert.equal(browserSkill.status, "repo_artifact_ready_adapter_execution_gated");
  assert.match(browserSkill.fallback_strategy_json, /openclaw\/skills\/insurance-portal-browser/);
});

test("context packet injects workflow readiness, journey, tools, sources, and OpenClaw skills", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const context = await buildContextPacket(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Check my Aetna eligibility and benefits from the logged portal."
  });

  const architecture = context.packet.workflowArchitecture;
  assert.equal(context.packet.schemaVersion, 2);
  assert.equal(context.packet.timestampType, "iso_8601_utc_text");
  assert.ok(architecture.readiness.some((item) => item.workflowKey === "eligibility_benefits_navigation"));
  assert.ok(architecture.routeCandidates[0].routeScore > 0);
  assert.ok(architecture.tools.some((tool) => tool.key === "local_sqlite_memory"));
  assert.ok(architecture.knowledgeSources.some((source) => source.key === "aetna_member_portal"));
  assert.ok(architecture.openclawSkills.some((skill) => skill.key === "insurance_portal_browser"));

  const workflowRuns = await store.list("workflow_runs", { session_id: session.id });
  const journeyEvents = await store.list("user_journey_events", { session_id: session.id });
  assert.equal(workflowRuns.length, 1);
  assert.equal(journeyEvents.length, 1);
  assert.equal(workflowRuns[0].workflow_key, architecture.routeCandidates[0].workflowKey);
  assert.equal(journeyEvents[0].event_type, "workflow_preflight_routed");
});

test("runtime adapters expose workflow architecture to LangGraph and OpenClaw", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const context = await buildContextPacket(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Prepare a claim status follow-up."
  });

  const state = toLangGraphAgentState(context.packet, { source: "test" });
  const heartbeat = toOpenClawHeartbeatEnvelope(context.packet);

  assert.ok(state.case_metadata.workflow_readiness.length > 0);
  assert.ok(state.case_metadata.route_candidates.length > 0);
  assert.ok(heartbeat.workflow_architecture.openclaw_skills.some((skill) => skill.key === "heartbeat_followup_planner"));
});
