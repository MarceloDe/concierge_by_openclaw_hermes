import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import {
  loadDynamicSkillDefinitions,
  resolveDynamicSkillContext,
  validateDynamicSkillDefinition
} from "../concierge/dynamicSkillServer.mjs";
import { buildContextPacket } from "../concierge/memoryHarness.mjs";
import { buildLlmOrchestrationDecisionPayload } from "../concierge/llmOrchestrationDecision.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-dynamic-skills-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

test("dynamic skill server loads temporary Aetna and claim skill definitions", async () => {
  const result = await loadDynamicSkillDefinitions();
  const keys = result.definitions.map((item) => item.skillKey);

  assert.ok(keys.includes("insurance_plan_aetna_temporary"));
  assert.ok(keys.includes("claim_journey_temporary"));
  assert.ok(result.definitions.every((item) => item.validation.valid), JSON.stringify(result.definitions.map((item) => item.validation), null, 2));

  const aetna = result.definitions.find((item) => item.skillKey === "insurance_plan_aetna_temporary");
  assert.equal(aetna.definition.skill_kind, "insurance_specific");
  assert.equal(aetna.definition.editable_by, "external_skill_generator_llm");
  assert.ok(aetna.definition.runtime_mounts.database_queries.includes("latest_eligibility_snapshot_by_session"));

  const claim = result.definitions.find((item) => item.skillKey === "claim_journey_temporary");
  assert.equal(claim.definition.skill_kind, "journey_specific");
  assert.ok(claim.definition.required_workers.openclaw_tasks.includes("insurance_portal_browser.read_only_claims_observation"));
});

test("dynamic skill validation rejects arbitrary database query mounts", () => {
  const validation = validateDynamicSkillDefinition({
    schema_version: "brainstyworkers.dynamic_skill.v1",
    skill_key: "bad_skill",
    skill_kind: "journey_specific",
    editable_by: "external_skill_generator_llm",
    runtime_mounts: {
      database_queries: ["SELECT * FROM users"]
    },
    answer_contract: {
      required_fields: ["status", "facts", "citations", "uncertainties", "next_actions"]
    }
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.includes("database_query_not_allowed:SELECT * FROM users"));
});

test("dynamic skill resolver mounts session memory and selects insurance plus claim journey skills", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const context = await buildContextPacket(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Why did Aetna not pay my last visit claim?"
  });

  const resolved = await resolveDynamicSkillContext(store, {
    user_id: user.id,
    session_id: session.id,
    graph_trace_id: session.langgraph_thread_id,
    channel: session.channel,
    user_input: "Why did Aetna not pay my last visit claim?",
    context_packet: context.packet,
    workflow: "claim_status_navigation",
    structured_intent: {
      intent: "claim_status_question",
      workflow: "claim_status_navigation"
    }
  });

  assert.equal(resolved.selected.insuranceSkillKey, "insurance_plan_aetna_temporary");
  assert.equal(resolved.selected.journeySkillKey, "claim_journey_temporary");
  assert.equal(resolved.selected.executionSkillKey, "insurance_portal_browser");
  assert.ok(resolved.requiredOpenClawTasks.includes("insurance_portal_browser.read_only_claims_observation"));
  assert.ok(resolved.requiredOpenClawTasks.includes("insurance_portal_browser.read_only_observation"));
  assert.ok(resolved.requiredApis.includes("local_sqlite_claim_lookup"));
  assert.ok(resolved.successEstimate.overallChance > 0);
  assert.equal(resolved.generatorEditContract.forbiddenEdits.includes("raw_sql"), true);
});

test("LangGraph carries dynamic skill context through claim orchestration", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);

  const result = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Why did Aetna not pay my last visit?",
    rawMessage: { source: "dynamic_skill_server_test", useLiveModel: false }
  });

  assert.equal(result.state.workflow, "claim_status_navigation");
  assert.equal(result.state.dynamic_skill_context.selected.insuranceSkillKey, "insurance_plan_aetna_temporary");
  assert.equal(result.state.dynamic_skill_context.selected.journeySkillKey, "claim_journey_temporary");
  assert.equal(result.state.dynamic_skill_context.selected.executionSkillKey, "insurance_portal_browser");
  assert.ok(result.state.proof.some((item) => item.step === "skill_resolver"));
  assert.equal(result.state.openclaw_worker_plan.owner, "langgraph");
  assert.deepEqual(result.state.openclaw_skill_validation.actionsTaken, []);
});

test("LLM orchestration payload includes dynamic skill hints", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const context = await buildContextPacket(store, {
    user,
    session,
    channel: session.channel,
    userInput: "Does my Aetna plan cover specialist visits?"
  });
  const dynamicSkillContext = await resolveDynamicSkillContext(store, {
    user_id: user.id,
    session_id: session.id,
    graph_trace_id: session.langgraph_thread_id,
    channel: session.channel,
    user_input: "Does my Aetna plan cover specialist visits?",
    context_packet: context.packet,
    workflow: "eligibility_benefits_navigation",
    structured_intent: {
      intent: "eligibility_benefits_question",
      workflow: "eligibility_benefits_navigation"
    }
  });

  const payload = buildLlmOrchestrationDecisionPayload({
    user_input: "Does my Aetna plan cover specialist visits?",
    policy_result: { allowed: true, approvalRequired: false, checks: [] },
    structured_intent: {
      intent: "eligibility_benefits_question",
      workflow: "eligibility_benefits_navigation"
    },
    context_packet: context.packet,
    dynamic_skill_context: dynamicSkillContext,
    product_memory_recall: null
  });

  assert.ok(payload.dynamicSkills.matches.some((item) => item.skillKey === "insurance_plan_aetna_temporary"));
  assert.equal(payload.dynamicSkills.selected.insuranceSkillKey, "insurance_plan_aetna_temporary");
  assert.ok(payload.dynamicSkills.requiredOpenClawTasks.includes("insurance_portal_browser.read_only_observation"));
});

test("dynamic skill loader reads externally generated skill-server files from a custom root", async () => {
  const root = await mkdtemp(join(tmpdir(), "brainsty-skill-root-"));
  const skillDir = join(root, "generated-skill");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "skill-server.json"),
    JSON.stringify(
      {
        schema_version: "brainstyworkers.dynamic_skill.v1",
        skill_key: "generated_skill",
        skill_kind: "journey_specific",
        title: "Generated Skill",
        status: "draft_sketch_runtime_gated",
        editable_by: "external_skill_generator_llm",
        matching: { workflows: ["claim_status_navigation"], keywords: ["claim"] },
        runtime_mounts: { database_queries: ["recent_claim_items_by_session"] },
        answer_contract: { required_fields: ["status", "facts", "citations", "uncertainties", "next_actions"] }
      },
      null,
      2
    )
  );

  const result = await loadDynamicSkillDefinitions({ root });
  assert.equal(result.definitions.length, 1);
  assert.equal(result.definitions[0].skillKey, "generated_skill");
  assert.equal(result.definitions[0].validation.valid, true);
});
