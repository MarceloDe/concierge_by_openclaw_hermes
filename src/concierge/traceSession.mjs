import { getManagedSessionState } from "./sessionManager.mjs";

export async function traceForSession(store, sessionId) {
  const [
    session,
    messages,
    browserRuns,
    auditEvents,
    approvalGates,
    snapshots,
    coverageBalances,
    claims,
    priorAuthorizations,
    extractionReviews,
    portalPageSnapshots,
    managedSession,
    memoryItems,
    contextPackets,
    workflowRuns,
    journeyEvents,
    agentTasks,
    scheduledJobs,
    workerContinuations,
    agentOutbox,
    memoryHarnessRuns,
    feedbackItems,
    humanHandoffs
  ] = await Promise.all([
    store.findOne("sessions", { id: sessionId }),
    store.list("conversation_messages", { session_id: sessionId }),
    store.list("browser_runs", { session_id: sessionId }),
    store.list("audit_events", { session_id: sessionId }),
    store.list("approval_gates", { session_id: sessionId }),
    store.list("eligibility_snapshots", { session_id: sessionId }),
    store.all(
      "SELECT cb.* FROM coverage_balances cb JOIN eligibility_snapshots es ON es.id = cb.snapshot_id WHERE es.session_id = ? ORDER BY cb.created_at ASC;",
      [sessionId]
    ),
    store.all(
      "SELECT ci.* FROM claim_items ci JOIN eligibility_snapshots es ON es.id = ci.snapshot_id WHERE es.session_id = ? ORDER BY ci.created_at ASC;",
      [sessionId]
    ),
    store.all(
      "SELECT pa.* FROM prior_authorizations pa JOIN eligibility_snapshots es ON es.id = pa.snapshot_id WHERE es.session_id = ? ORDER BY pa.created_at ASC;",
      [sessionId]
    ),
    store.all(
      "SELECT er.* FROM extraction_reviews er JOIN eligibility_snapshots es ON es.id = er.snapshot_id WHERE es.session_id = ? ORDER BY er.created_at ASC;",
      [sessionId]
    ),
    store.list("portal_page_snapshots", { session_id: sessionId }),
    getManagedSessionState(store, sessionId),
    store.list("memory_items", { session_id: sessionId }),
    store.list("context_packets", { session_id: sessionId }),
    store.list("workflow_runs", { session_id: sessionId }),
    store.list("user_journey_events", { session_id: sessionId }),
    store.list("agent_tasks", { session_id: sessionId }),
    store.list("scheduled_jobs", { session_id: sessionId }),
    store.list("worker_continuations", { session_id: sessionId }),
    store.list("agent_outbox", { session_id: sessionId }),
    store.list("memory_harness_runs", { session_id: sessionId }),
    store.list("feedback_items", { session_id: sessionId }),
    store.list("human_handoff_items", { session_id: sessionId })
  ]);
  return {
    session,
    messages,
    browserRuns,
    approvalGates,
    snapshots,
    coverageBalances,
    claims,
    priorAuthorizations,
    extractionReviews,
    portalPageSnapshots,
    managedSession,
    memoryItems,
    contextPackets,
    workflowRuns,
    journeyEvents,
    agentTasks,
    scheduledJobs,
    workerContinuations,
    agentOutbox,
    memoryHarnessRuns,
    feedbackItems,
    humanHandoffs,
    auditEvents
  };
}
