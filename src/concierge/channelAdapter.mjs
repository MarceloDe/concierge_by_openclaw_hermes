import { CHANNELS, DEFAULT_MEMBER } from "./types.mjs";

function recentAssistantText(input) {
  return Array.isArray(input.recentMessages)
    ? input.recentMessages
        .filter((item) => item?.role === "assistant" && typeof item.text === "string")
        .map((item) => item.text)
        .join("\n")
    : "";
}

function expandContextualChoice(input) {
  const message = String(input.message ?? "").trim();
  const assistantContext = recentAssistantText(input);
  if (/\b(option|choice)\s*b\b/i.test(message) && /read[- ]only extraction|read[- ]only access|read[- ]only claim scan/i.test(assistantContext)) {
    return "I choose option B: perform the read-only insurance portal extraction after explicit human approval.";
  }
  if (/\b(option|choice)\s*a\b/i.test(message) && /step[- ]by[- ]step|login steps|log in/i.test(assistantContext)) {
    return "I choose option A: walk me step-by-step through logging in to my insurance portal.";
  }
  if (
    /\b(guide|walk|help|support)\b/i.test(message) &&
    /\b(password|passcode|passkey|2fa|two[- ]factor|one[- ]time code|otp|verification code|mfa|captcha|log ?in|sign ?in)\b/i.test(message) &&
    /\b(portal|browser|aetna|insurance|insurer|sign ?in|log ?in|read[- ]only|password|2fa|captcha)\b/i.test(assistantContext)
  ) {
    return "Please guide me while I enter my own password, 2FA, or captcha in the insurance portal. Do not ask for, see, store, or enter my credentials.";
  }
  return message;
}

export function normalizeWebChat(input = {}) {
  const userInput =
    input.message != null
      ? expandContextualChoice(input)
      : "Enroll me as Marcelo Felix, connect to my logged insurance website in Chrome, review my eligibility and benefits, and show the trace of what you found.";
  return {
    channel: CHANNELS.WEB_CHAT,
    raw_input: input,
    user_id_hint: DEFAULT_MEMBER.email,
    session_id: input.sessionId ?? null,
    user_input: userInput,
    timestamp: new Date().toISOString()
  };
}
