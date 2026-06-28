// GATE (Capability portfolio): a planner-SELECTED portfolio pointer must be HYDRATED and
// then USED by the worker/tool plan (behavior change), not merely resolved and dropped.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { catalogPortfolioKey } from "../concierge/capabilityCatalog.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

test("GATE Capability portfolio: planner-selected pointer is hydrated AND used by the worker/tool plan", async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-gate-cap-"));
  const store = await new SqliteStore(join(dir, "g.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  const { user, session } = await enrollDefaultMember(store);
  const pointer = `${catalogPortfolioKey(session.id)}#skill:insurance_portal_browser`;

  const result = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel, userInput: "check my benefits portal",
    rawMessage: {
      source: "gate_cap", useLiveModel: false, executeEvidenceObservation: false,
      llmOrchestrationDecisionReplay: {
        workflow: "eligibility_benefits_navigation", intent: "benefits_eligibility", confidence: 0.9,
        rationale: "replay", workerGoal: "read-only portal observation",
        selectedCapabilityPointers: [pointer]
      }
    }
  });

  // 1) hydrated
  const h = result.state.hydrated_capabilities;
  assert.ok(h && h.resolvedCount >= 1, "selected pointer hydrated");
  assert.ok(h.resolved.some((r) => r.portfolioId === "skill:insurance_portal_browser"), "the selected portfolio ID resolved");

  // 2) USED by the worker/tool plan (the gate against a false pass)
  const toolCall = (result.state.tool_calls ?? [])[0];
  assert.ok(toolCall, "a worker/tool plan was produced");
  assert.ok(
    toolCall.plannerSelectedSkillKeys?.includes("insurance_portal_browser"),
    "the hydrated capability's skill key is used by the worker/tool plan"
  );
  assert.ok(
    toolCall.plannerHydratedCapabilities?.some((c) => c.portfolioId === "skill:insurance_portal_browser"),
    "the planner-selected portfolio ID is carried into the worker/tool plan"
  );
  assert.equal(toolCall.plannerCapabilitySource?.resolvedCount, h.resolvedCount, "worker plan's capability source matches the hydration");
});
