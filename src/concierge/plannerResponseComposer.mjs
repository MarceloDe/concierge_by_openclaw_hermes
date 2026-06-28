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

  const payload = {
    userRequest: String(state.user_input ?? "").slice(0, 300),
    plannerResponseStrategy: decision.responseStrategy ?? null,
    plannerClarifyingQuestion: decision.userFacingNextQuestion || null,
    plannerMissingEvidence: decision.missingEvidence ?? [],
    plannerApprovalScope: decision.approvalScope ?? null,
    offerableProcesses: processes.map((p) => ({ id: p.portfolioId, title: p.title, whenToUse: p.whenToUse, whyUse: p.whyUse, approvalScope: p.approvalScope })),
    hydratedCapabilities: hydrated
  };

  const messages = [
    {
      role: "system",
      content: [
        "You are the Brainstyworkers healthcare insurance concierge composing a short user-facing reply.",
        "REASON AS A PROCESS: there is no stored evidence to answer from yet, so do not refuse flatly and do not invent facts. Pick the single most relevant offerable process and OFFER it.",
        "Honest scope: you cannot log into the insurer website for the user and never enter credentials, passwords, or 2FA. The USER signs in themselves in a secure browser; then you observe read-only and cite what is on screen.",
        "Always do three things: (1) answer the user's actual question about what you can and cannot do; (2) OFFER the most relevant process from offerableProcesses — name what it does, that the user logs in, and that it is read-only with their approval; (3) ask the single most useful missing detail (e.g., which payer/plan).",
        "HARD RULES: never state a coverage amount, dollar figure, deductible/out-of-pocket/copay number, or any plan-specific fact — you have no evidence yet; offer the path to obtain it. Plain text, concise, no markdown headers."
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
    return { valid: true, mode: "process_offer", finalResponse: text, offeredProcessIds: processes.map((p) => p.portfolioId) };
  } catch (error) {
    return { valid: false, mode: "composer_failed", error: error.message };
  }
}
