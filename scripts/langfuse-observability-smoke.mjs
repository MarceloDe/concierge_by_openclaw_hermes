import { createId } from "../src/concierge/database.mjs";
import { flush_langfuse, getLangfuseStatus, shutdown_langfuse } from "../src/observability/langfuseClient.mjs";
import { withCheckpoint } from "../src/observability/checkpoints.mjs";

const traceId = createId("lftrace");
const status = getLangfuseStatus();

await withCheckpoint(
  "agent.run",
  {
    kind: "agent.run",
    metadata: {
      app_name: "brainstyworkers-ai-concierge",
      trace_id: traceId,
      session_id: "smoke_session",
      workflow: "claim_status_navigation",
      route: "claim_status_navigation",
      langchain_runtime: "@langchain/langgraph",
      safety_mode: "deterministic_rails_llm_planner",
      phi_redaction_enabled: true
    },
    input: {
      prompt: "Can you help with my claim? email marcelo@example.com claim id CLM-123456"
    }
  },
  async () => {
    await withCheckpoint(
      "router.route_selected",
      {
        kind: "router.route_selected",
        metadata: {
          trace_id: traceId,
          session_id: "smoke_session",
          route: "claim_status_navigation",
          route_candidates_count: 2
        }
      },
      async () => ({ selectedRoute: "claim_status_navigation", confidence: 0.92 })
    );
    await withCheckpoint(
      "openclaw.approval_required",
      {
        kind: "openclaw.approval_requested",
        metadata: {
          trace_id: traceId,
          session_id: "smoke_session",
          openclaw_profile: "brainstyworkers",
          skill_name: "insurance_portal_browser",
          approval_required: true,
          approval_status: "pending"
        }
      },
      async () => ({ status: "pending_approval", actionsTaken: [] })
    );
    return { status: "smoke_ok", traceId };
  }
);

await flush_langfuse().catch(() => null);
await shutdown_langfuse().catch(() => null);

console.log(
  JSON.stringify(
    {
      status: "ok",
      traceId,
      langfuse: status.mode,
      host: status.host,
      environment: status.environment,
      release: status.release,
      secrets: "redacted"
    },
    null,
    2
  )
);
