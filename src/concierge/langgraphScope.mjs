export function createLangGraphThreadId(userId, sessionId) {
  return `thread:${userId}:${sessionId}`;
}

export function describeLangGraphScope() {
  return {
    threadScoped: [
      "session state",
      "browser run state",
      "workflow step state",
      "short-term checkpoint-style continuity"
    ],
    storeScoped: [
      "user profile",
      "portal account metadata",
      "approved eligibility snapshots",
      "audit and extraction records",
      "local cross-session memory items",
      "context packets with database pointers",
      "agent tasks and scheduled jobs"
    ],
    activeHarness: [
      "hook-style recall before orchestration",
      "hook-style retain after orchestration",
      "real Zep Graphiti product-memory retain/recall when explicitly enabled",
      "OpenClaw dedicated arm heartbeat planner",
      "approval-gated outbox proposals"
    ],
    adapterSeams: [
      "Zep Graphiti recall/retain runs behind the product-memory contract",
      "LangGraph can consume context_packets through graph state",
      "OpenClaw skills can consume scheduled_jobs and agent_tasks"
    ],
    deferred: [
      "real OpenClaw WhatsApp, email, and browser worker adapters",
      "real external notification sending",
      "production PHI/HIPAA controls"
    ]
  };
}
