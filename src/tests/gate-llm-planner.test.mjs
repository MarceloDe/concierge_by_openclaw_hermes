// GATE (LLM planner): (A) with NO key in LLM-primary mode the planner must FAIL LOUD —
// no silent regex/classifier route — and emit an audit event; (B) with a live key a
// paraphrased lay-person question is actually decided by the LLM planner.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

await loadLocalEnvOnce();
const HAS_KEY = Boolean(process.env.OPENAI_API_KEY);

async function freshStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-gate-llm-"));
  return new SqliteStore(join(dir, "g.sqlite")).initialize();
}

test("GATE LLM planner: no key in LLM-primary mode FAILS LOUD — no silent regex route", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedAlways = process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS;
  process.env.OPENAI_API_KEY = "";            // primary dependency unavailable
  process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = "1";
  try {
    const store = await freshStore();
    const { user, session } = await enrollDefaultMember(store);
    const result = await runLangGraphOrchestration(store, {
      user, session, channel: session.channel,
      userInput: "hey can you peek at what my plan covers for an MRI",   // a real lay-person paraphrase
      rawMessage: { source: "gate_llm_nokey", useLiveModel: true }
    });
    assert.equal(result.state.route_reason, "llm_unavailable_no_silent_regex", "must not silently regex-route");
    assert.equal(result.state.workflow_outcome, "llm_unavailable");
    assert.notEqual(result.state.route_reason, "structured_intent_classifier", "regex classifier must NOT be the silent route");
    const audits = await store.all("SELECT event_type FROM audit_events WHERE event_type='llm_planner_unavailable_no_silent_regex';");
    assert.ok(audits.length >= 1, "fail-loud emits an audit event");
  } finally {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
    if (savedAlways === undefined) delete process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS; else process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = savedAlways;
  }
});

test("GATE LLM planner: a paraphrased question is decided by the LLM planner (not regex)", { skip: HAS_KEY ? false : "OPENAI_API_KEY not set" }, async () => {
  process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = "1";
  const store = await freshStore();
  const { user, session } = await enrollDefaultMember(store);
  const result = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel,
    userInput: "i got a bill i wasn't expecting, can you figure out why my insurer didn't pay",
    rawMessage: { source: "gate_llm_live", useLiveModel: true }
  });
  assert.equal(result.state.route_reason, "llm_orchestration_decision", "the live LLM planner decided the route");
  assert.equal(result.state.llm_orchestration_decision.mode, "openai_chatopenai_invoked");
  assert.equal(result.state.llm_orchestration_decision.usedByRouter, true);
  assert.ok(result.state.llm_orchestration_decision.confidence >= 0.5);
});
