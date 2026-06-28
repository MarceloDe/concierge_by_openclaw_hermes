// GATE (Langfuse): run a live turn, then QUERY the Langfuse trace API and verify expected
// spans + metadata (model, prompt version) + real latency. No dashboard-only proof; this
// reads back from Langfuse's HTTP API. Gated by OPENAI + Langfuse reachability.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { flush_langfuse } from "../observability/langfuseClient.mjs";

await loadLocalEnvOnce();
process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = "1";
const HAS_KEY = Boolean(process.env.OPENAI_API_KEY);
const LF = process.env.LANGFUSE_HOST && process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY;
let lfUp = false;
if (LF) lfUp = await fetch(`${process.env.LANGFUSE_HOST}/api/public/health`).then((r) => r.ok).catch(() => false);

test("GATE Langfuse: trace API returns expected spans with model + prompt version + latency", { skip: HAS_KEY && lfUp ? false : "needs OPENAI_API_KEY + reachable Langfuse" }, async () => {
  const store = await new SqliteStore(join(await mkdtemp(join(tmpdir(), "lf-gate-")), "g.sqlite")).initialize();
  const { user, session } = await enrollDefaultMember(store);
  const r = await runLangGraphOrchestration(store, { user, session, channel: session.channel, userInput: "why was my recent claim denied?", rawMessage: { source: "gate_lf", useLiveModel: true } });
  const traceId = r.state.graph_trace_id;
  assert.ok(traceId, "trace id present");
  await flush_langfuse();

  const auth = "Basic " + Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString("base64");
  let obs = [];
  for (let i = 0; i < 30; i += 1) {
    await new Promise((s) => setTimeout(s, 2000));
    const res = await fetch(`${process.env.LANGFUSE_HOST}/api/public/observations?traceId=${encodeURIComponent(traceId)}&limit=100`, { headers: { authorization: auth } });
    obs = (await res.json().catch(() => ({}))).data ?? [];
    if (["model.llm_orchestration_decision", "planner.start", "agent.run"].every((n) => obs.some((o) => o.name === n))) break;
  }
  assert.ok(obs.length >= 3, `Langfuse returned spans for the trace (got ${obs.length})`);
  const names = obs.map((o) => o.name);
  assert.ok(names.includes("agent.run"), "root agent.run span present");
  assert.ok(names.includes("planner.start"), "planner span present");

  const modelSpan = obs.find((o) => o.name === "model.llm_orchestration_decision");
  assert.ok(modelSpan, "model.llm_orchestration_decision span present");
  assert.ok((modelSpan.model ?? modelSpan.metadata?.model), "span carries the model");
  assert.ok(modelSpan.metadata?.prompt_version, "span carries the prompt/policy version");
  assert.ok(new Date(modelSpan.endTime).getTime() > new Date(modelSpan.startTime).getTime(), "span has real latency (end > start)");
});
