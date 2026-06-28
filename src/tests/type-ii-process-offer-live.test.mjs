// Type-II Phase A proof (no mocks, real LLM): a capability/meta question with no stored
// evidence gets an honest PROCESS OFFER (user logs in -> read-only -> cite), not a flat
// refusal/template, and contains no coverage numbers. Gated by OPENAI_API_KEY.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { SqliteStore, createId, nowIso } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { seedCapabilityCatalog } from "../concierge/capabilityCatalogSeed.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";

await loadLocalEnvOnce();
process.env.BRAINSTY_TYPE_II_COMPOSER = "1";
process.env.BRAINSTY_ORCHESTRATOR_LLM_ALWAYS = "1";
const HAS_KEY = Boolean(process.env.OPENAI_API_KEY);

test("Type-II Phase A: capability question yields a process offer, not a flat refusal/template", { skip: HAS_KEY ? false : "OPENAI_API_KEY not set" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-typeii-"));
  const store = await new SqliteStore(join(dir, "t.sqlite")).initialize();
  await seedCapabilityCatalog(store, { nowIso, createId });
  const { user, session } = await enrollDefaultMember(store);

  const result = await runLangGraphOrchestration(store, {
    user, session, channel: session.channel,
    userInput: "so you can access my insurance website?",
    rawMessage: { source: "type_ii_phasea_test", useLiveModel: true }
  });
  const answer = String(result.state.final_response ?? "");

  assert.equal(result.state.workflow_outcome, "capability_reasoned_offer", "Type-II composer drove the answer");
  assert.doesNotMatch(answer, /routed this request to .*not executed in this slice|I cannot access your (insurance )?website/i, "must NOT be the flat template/refusal");
  assert.match(answer, /read-only|read only|sign in|log in|secure browser|observe|your portal/i, "offers the read-only portal-login process");
  assert.doesNotMatch(answer, /\$\s?\d/, "no coverage dollar figures (no evidence yet)");
});
