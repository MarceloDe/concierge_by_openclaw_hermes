// Full-prompt trace capture defaults ON for dev, OFF for production (override with 0/1).
import test from "node:test";
import assert from "node:assert/strict";
import { traceFullPromptsEnabled } from "../concierge/modelTierPolicy.mjs";

test("traceFullPromptsEnabled: ON by default in dev, OFF in production, explicit overrides win", () => {
  assert.equal(traceFullPromptsEnabled({}), true, "dev default ON");
  assert.equal(traceFullPromptsEnabled({ NODE_ENV: "development" }), true);
  assert.equal(traceFullPromptsEnabled({ NODE_ENV: "production" }), false, "prod default OFF");
  assert.equal(traceFullPromptsEnabled({ BRAINSTY_RUNTIME_ENV: "staging" }), false);
  assert.equal(traceFullPromptsEnabled({ NODE_ENV: "production", BRAINSTY_TRACE_FULL_PROMPTS: "1" }), true, "explicit on overrides prod");
  assert.equal(traceFullPromptsEnabled({ BRAINSTY_TRACE_FULL_PROMPTS: "0" }), false, "explicit off overrides dev");
});
