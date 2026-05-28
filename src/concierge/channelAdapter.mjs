import { CHANNELS, DEFAULT_MEMBER } from "./types.mjs";

export function normalizeWebChat(input = {}) {
  return {
    channel: CHANNELS.WEB_CHAT,
    raw_input: input,
    user_id_hint: DEFAULT_MEMBER.email,
    session_id: input.sessionId ?? null,
    user_input:
      input.message ??
      "Enroll me as Marcelo Felix, connect to my logged insurance website in Chrome, review my eligibility and benefits, and show the trace of what you found.",
    timestamp: new Date().toISOString()
  };
}
