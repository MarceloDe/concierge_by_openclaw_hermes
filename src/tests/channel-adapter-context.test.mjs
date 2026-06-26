import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeWebChat } from "../concierge/channelAdapter.mjs";

test("web chat expands contextual option B into read-only portal extraction intent", () => {
  const envelope = normalizeWebChat({
    message: "Go to the option B",
    recentMessages: [
      {
        role: "assistant",
        text: "Which would you like: step-by-step guidance or option B, read-only extraction?"
      }
    ]
  });

  assert.match(envelope.user_input, /read-only insurance portal extraction/);
  assert.match(envelope.user_input, /explicit human approval/);
});

test("web chat keeps unrelated contextless fragments as-is", () => {
  const envelope = normalizeWebChat({
    message: "Go to the option B",
    recentMessages: [{ role: "assistant", text: "Pick a color theme." }]
  });

  assert.equal(envelope.user_input, "Go to the option B");
});

test("web chat expands user-controlled password guidance follow-up into portal context", () => {
  const envelope = normalizeWebChat({
    message: "but you can guide me and i put the password?",
    recentMessages: [
      {
        role: "assistant",
        text: "I can guide you through signing in to the insurance portal or help extract benefits with read-only access."
      }
    ]
  });

  assert.match(envelope.user_input, /guide me while I enter my own password/i);
  assert.match(envelope.user_input, /insurance portal/i);
  assert.match(envelope.user_input, /Do not ask for, see, store, or enter my credentials/i);
});
