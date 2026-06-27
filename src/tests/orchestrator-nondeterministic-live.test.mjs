// NORTH-STAR ACCEPTANCE TEST for the non-deterministic orchestrator overhaul.
// NO MOCKS: real SQLite store, real context packet, real top-tier LLM call,
// lay-person questions (non-specialist vocabulary). Asserts the founder's core
// rule: every free-text chat reaches ONE real LLM orchestration call and gets a
// usable response — never a keyword/policy-skip or canned non-LLM branch.
//
// STATUS: currently RED by design. It documents the live bug (e.g. "i got a
// letter saying no, what can i do about it?" -> skipped_policy_refusal). Phases
// 1-3 (LLM-always routing, erase regex routers, flexible insurance policy) turn
// it GREEN. It is NOT in the test:local blocking gate; run via
// `npm run test:orchestrator:nondeterministic`.
// Live-gated: skips when OPENAI_API_KEY is absent (offline CI).
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

// Acceptance test exercises the non-deterministic (LLM-always) chat path.
process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = "1";

const HAS_KEY = Boolean(process.env.OPENAI_API_KEY);

// Lay-person phrasings: deliberately avoid specialist keywords (claim, prior auth,
// deductible, copay, formulary) to exercise the non-deterministic planner, not regex.
const LAY_QUESTIONS = [
  "do i have to pay anything out of pocket before my insurance starts helping this year?",
  "why didn't they cover my visit from last week?",
  "my doctor wants me to get a scan, do i need permission from anyone first?",
  "how much is my medicine going to cost me?",
  "i got a letter saying no, what can i do about it?",
  "is my new doctor someone i'm allowed to see?",
  "can you check what's going on with the thing the hospital sent me?"
];

function pickRandom(list, n) {
  const copy = list.slice();
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

async function freshStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-nd-orch-"));
  return new SqliteStore(join(dir, "nd.sqlite")).initialize();
}

test("non-deterministic orchestrator: lay-person chat reaches the LLM planner and returns a usable response (no mocks)", { skip: HAS_KEY ? false : "OPENAI_API_KEY not set" }, async () => {
  const store = await freshStore();
  const { user, session } = await enrollDefaultMember(store);

  // Deterministic + comprehensive: exercise every lay-person phrasing so the
  // acceptance gate is not flaky. pickRandom retained for ad-hoc exploration.
  void pickRandom;
  for (const question of LAY_QUESTIONS) {
    const result = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: question,
      rawMessage: { source: "nondeterministic_live_test", useLiveModel: true }
    });

    const s = result.state;
    // Invariant 1: never crashes, always produces a user-facing response + UI blocks.
    assert.ok(s.final_response && String(s.final_response).trim().length > 0, `empty final_response for: ${question}`);
    assert.ok(Array.isArray(s.ai2ui_blocks) && s.ai2ui_blocks.length > 0, `no ai2ui_blocks for: ${question}`);

    // Invariant 2 (the non-determinism guard): a real top-tier LLM orchestration
    // call must have happened — not a skipped/keyword-only path. This is what
    // later phases must keep true and strengthen (current happy path satisfies it).
    const mode = s.llm_orchestration_decision?.mode ?? "missing";
    assert.notEqual(mode, "skipped_missing_openai_api_key", `planner skipped LLM for: ${question}`);
    assert.ok(
      /openai|invoked|normalized|chatopenai/i.test(mode),
      `expected a real LLM orchestration mode, got "${mode}" for: ${question}`
    );

    // Invariant 3: a workflow was selected (graph routed).
    assert.ok(s.workflow, `no workflow selected for: ${question}`);
  }
});

// No mocks: real store + real graph. Proves missing key is a LOUD degraded state
// under LLM-always, not a silent "classifier as planner" success. Runs offline
// (no key => no network call).
test("LLM-always: missing OPENAI_API_KEY surfaces degraded intelligence, not silent classifier success", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = "1";
  try {
    const store = await freshStore();
    const { user, session } = await enrollDefaultMember(store);
    const result = await runLangGraphOrchestration(store, {
      user,
      session,
      channel: session.channel,
      userInput: "how much is my medicine going to cost me?",
      rawMessage: { source: "degraded_missing_key_test", useLiveModel: true }
    });
    const d = result.state.llm_orchestration_decision;
    assert.equal(d.mode, "skipped_missing_openai_api_key");
    assert.equal(d.degraded, true, "missing key under LLM-always must mark degraded=true");
    assert.ok(
      (d.warnings ?? []).includes("intelligence_degraded_missing_key"),
      "degraded intelligence must be surfaced as a warning"
    );
  } finally {
    if (prevKey) process.env.OPENAI_API_KEY = prevKey;
  }
});
