import { createTieredChatModel } from "./modelTierPolicy.mjs";
import { loadSessionPortfolio } from "./capabilityCatalog.mjs";

// Type-II Phase A: when there is no stored evidence to answer from, do not emit a flat
// refusal/template. Instead REASON AS A PROCESS — consume the planner decision + the
// offerable processes from the catalog and compose an honest answer that (a) states what
// the concierge can/can't do, (b) OFFERS the most relevant process (the user logs in;
// read-only observation; then cite), (c) asks the single most useful missing detail.
// Generic over the process portfolio — no per-sentence / per-intent branching.
export const PLANNER_RESPONSE_COMPOSER_VERSION = "2026-06-27.type-ii-process-offer.v1";

const COVERAGE_NUMBER = /\$\s?\d|\b\d+(?:\.\d+)?\s?(?:usd|dollars)\b|\bdeductible\b.{0,20}\b\d|\boop\b.{0,12}\b\d/i;

export async function composeProcessOfferResponse({ store, state, sessionId }) {
  let processes = [];
  try {
    const portfolio = await loadSessionPortfolio(store, { sessionId });
    processes = (portfolio.manifest?.promptTable ?? []).filter((row) => row.kind === "process");
  } catch {
    processes = [];
  }
  const decision = state.llm_orchestration_decision ?? {};
  const hydrated = (state.hydrated_capabilities?.resolved ?? []).map((r) => ({ id: r.portfolioId, kind: r.kind, title: r.title }));

  // Recent turns so we don't re-offer/re-explain and can advance on acceptance.
  let conversationHistory = state.conversation_history ?? [];
  if (!conversationHistory.length) {
    try {
      const rows = await store.all("SELECT role, content FROM conversation_messages WHERE session_id = ? ORDER BY sequence_number DESC LIMIT 8;", [sessionId]);
      conversationHistory = rows.reverse().map((r) => ({ role: r.role, content: String(r.content ?? "").slice(0, 400) }));
      const last = conversationHistory[conversationHistory.length - 1];
      if (last && last.role === "user" && last.content === String(state.user_input ?? "").slice(0, 400)) conversationHistory.pop();
      conversationHistory = conversationHistory.slice(-6);
    } catch { conversationHistory = []; }
  }
  const alreadyOfferedPortal = conversationHistory.some((m) => m.role === "assistant" && /portal|read-only|log in|sign in/i.test(m.content));

  // Phase B: prefer the processes the planner explicitly offered (recommended first),
  // falling back to all offerable processes if the planner did not select any.
  const offeredIds = new Set([...(decision.offeredProcessIds ?? []), decision.recommendedProcessId].filter(Boolean));
  const ranked = offeredIds.size > 0
    ? [...processes].sort((a, b) => (offeredIds.has(b.portfolioId) ? 1 : 0) - (offeredIds.has(a.portfolioId) ? 1 : 0))
    : processes;

  const payload = {
    userRequest: String(state.user_input ?? "").slice(0, 300),
    plannerResponseStrategy: decision.responseStrategy ?? null,
    plannerClarifyingQuestion: decision.userFacingNextQuestion || null,
    plannerClarificationNeeded: Boolean(decision.clarificationNeeded),
    plannerMissingPlanDetails: decision.missingPlanDetails ?? decision.missingEvidence ?? [],
    plannerApprovalScope: decision.approvalScope ?? null,
    plannerRecommendedProcessId: decision.recommendedProcessId ?? null,
    plannerOfferedProcessIds: [...offeredIds],
    offerableProcesses: ranked.map((p) => ({ id: p.portfolioId, title: p.title, whenToUse: p.whenToUse, whyUse: p.whyUse, approvalScope: p.approvalScope })),
    hydratedCapabilities: hydrated,
    conversationHistory,
    alreadyOfferedPortalEarlier: alreadyOfferedPortal
  };

  const messages = [
    {
      role: "system",
      content: [
        "You are the Brainstyworkers healthcare insurance concierge. Reply in AT MOST 2 short sentences — direct, concise, plain text, no markdown, no preamble.",
        "There is no stored evidence yet, so do not invent facts and never state a coverage amount, dollar figure, or deductible/out-of-pocket/copay number. Offer the path to obtain it instead.",
        "If alreadyOfferedPortalEarlier is false: in ONE sentence say you can't see it directly but can do a secure read-only portal lookup (the user logs in; you observe with approval), then in a short second sentence ask only for the single missing detail you don't already have from conversationHistory.",
        "If alreadyOfferedPortalEarlier is true OR the user's latest message accepts/confirms/proceeds (e.g. 'ready', 'yes', 'ok', names the payer/data): DO NOT re-explain the offer. Reply in ONE short sentence telling them to tap the 'Connect portal (live)' button below, log in, and approve the read-only lookup. Never re-ask for information already in conversationHistory (e.g. the payer or the data they want)."
      ].join("\n")
    },
    { role: "user", content: JSON.stringify(payload) }
  ];

  try {
    const { llm } = createTieredChatModel("final_response", { timeout: 60000, maxRetries: 1, reasoningEffort: "minimal" });
    const response = await llm.invoke(messages);
    const text = String(response?.content ?? "").trim();
    if (!text) return { valid: false, mode: "empty_composition" };
    // Deterministic safety guard: an offer must not contain coverage numbers (no evidence).
    if (COVERAGE_NUMBER.test(text)) return { valid: false, mode: "coverage_number_without_evidence" };
    return { valid: true, mode: "process_offer", finalResponse: text, offeredProcessIds: [...offeredIds].length ? [...offeredIds] : ranked.map((p) => p.portfolioId) };
  } catch (error) {
    return { valid: false, mode: "composer_failed", error: error.message };
  }
}
