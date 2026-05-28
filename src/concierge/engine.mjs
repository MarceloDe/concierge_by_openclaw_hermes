import { audit } from "./audit.mjs";
import { persistClaimedChromeSnapshot, runPortalExtraction } from "./browserAutomation.mjs";
import { normalizeWebChat } from "./channelAdapter.mjs";
import { classifyIntent } from "./classifier.mjs";
import { createId, nowIso } from "./database.mjs";
import { enrollDefaultMember } from "./enrollment.mjs";
import { buildContextPacket, retainMemoryFromSession } from "./memoryHarness.mjs";
import { composeResponse } from "./outputPolicy.mjs";
import { evaluateInputPolicy } from "./policy.mjs";
import { persistEligibilitySnapshot } from "./portalExtraction.mjs";
import { persistPortalPageScan } from "./portalScan.mjs";
import { checkpointSession, getManagedSessionState } from "./sessionManager.mjs";
import { WORKFLOWS } from "./types.mjs";

export async function runConciergeSlice(store, input = {}) {
  const envelope = normalizeWebChat(input);
  const enrollment = await enrollDefaultMember(store, input.member ?? {}, {
    sessionId: input.sessionId,
    resumeLatestSession: Boolean(input.resumeLatestSession),
    title: input.sessionTitle
  });
  const { user, portal, session } = enrollment;
  const memoryContext = await buildContextPacket(store, {
    user,
    session,
    channel: session.channel,
    userInput: envelope.user_input
  });
  await audit(store, session.id, "memory_context_injected", {
    contextPacketId: memoryContext.row.id,
    memoryItemCount: memoryContext.packet.memoryItems.length,
    taskCount: memoryContext.packet.openTasks.length,
    scheduledJobCount: memoryContext.packet.scheduledJobs.length
  });
  await checkpointSession(store, {
    session,
    stepName: "memory_context_injected",
    statePatch: {
      memory: {
        scope: "local_cross_session_harness",
        crossSessionMemory: true,
        hindsightDeferred: true,
        contextPacketId: memoryContext.row.id,
        memoryItemCount: memoryContext.packet.memoryItems.length,
        openTaskCount: memoryContext.packet.openTasks.length,
        scheduledJobCount: memoryContext.packet.scheduledJobs.length
      }
    },
    metadata: {
      source: "local_memory_harness",
      hindsightAdapterStatus: "deferred"
    }
  });

  await store.insert("conversation_messages", {
    id: createId("msg"),
    session_id: session.id,
    role: "user",
    content: envelope.user_input,
    created_at: nowIso()
  });
  await audit(store, session.id, "channel_envelope_received", envelope);
  await checkpointSession(store, {
    session,
    stepName: "user_message_received",
    statePatch: {
      workflow: {
        lastUserMessage: envelope.user_input,
        messageCount: 1
      }
    },
    metadata: { source: "local_web_chat", resumed: enrollment.sessionResumed }
  });

  const policyResult = evaluateInputPolicy(envelope.user_input);
  const intent = classifyIntent(envelope.user_input, policyResult);
  await audit(store, session.id, "intent_classified", { intent, policyResult });
  await checkpointSession(store, {
    session,
    stepName: "intent_classified",
    statePatch: {
      workflow: {
        lastIntent: intent,
        policyResult
      }
    },
    metadata: { intent }
  });

  if (
    intent === WORKFLOWS.REFUSE_CREDENTIAL_ENTRY ||
    intent === WORKFLOWS.REFUSE_MEDICAL_ADVICE ||
    intent === WORKFLOWS.REFUSE_PROMPT_INJECTION ||
    intent === WORKFLOWS.REFUSE_OUT_OF_SCOPE
  ) {
    const refusalByIntent = {
      [WORKFLOWS.REFUSE_CREDENTIAL_ENTRY]:
        "I cannot enter or request passwords, SSNs, passkeys, or 2FA. Please handle authentication directly in Chrome.",
      [WORKFLOWS.REFUSE_MEDICAL_ADVICE]:
        "I cannot provide medical advice. I can help navigate insurance benefits and coverage information.",
      [WORKFLOWS.REFUSE_PROMPT_INJECTION]:
        "I cannot ignore, reveal, or override the governing instructions. I can continue with approved healthcare insurance navigation tasks.",
      [WORKFLOWS.REFUSE_OUT_OF_SCOPE]:
        "I am scoped to healthcare insurance concierge work. I can help with benefits, eligibility, claims, prior authorization, appeals, and approved payer portal navigation."
    };
    const finalResponse = refusalByIntent[intent];
    await store.insert("conversation_messages", {
      id: createId("msg"),
      session_id: session.id,
      role: "assistant",
      content: finalResponse,
      created_at: nowIso()
    });
    await audit(store, session.id, "response_composed", { finalResponse });
    await checkpointSession(store, {
      session,
      stepName: "response_composed",
      statePatch: {
        workflow: {
          lastIntent: intent,
          finalResponse,
          blockedByPolicy: true
        }
      },
      metadata: { intent, policyBlocked: true }
    });
    const retainedMemory = await retainMemoryFromSession(store, {
      user,
      session: { ...session, current_step: "response_composed" },
      reason: "policy_response_composed"
    });
    return {
      ...enrollment,
      envelope,
      policyResult,
      intent,
      finalResponse,
      browserResult: null,
      eligibility: null,
      memoryContext,
      retainedMemory
    };
  }

  if (intent === WORKFLOWS.ESCALATE_APPROVAL) {
    await audit(store, session.id, "approval_required_for_external_action", {
      message: envelope.user_input
    });
  }

  if (input.portalPageSnapshots?.length) {
    const scan = await persistPortalPageScan(store, {
      user,
      session,
      portal,
      pages: input.portalPageSnapshots
    });
    const latestEligibility = scan.eligibilityResults.at(-1) ?? null;
    const finalResponse = [
      `Enrollment complete for ${user.name} (${user.email}) in the local Brainstyworkers prototype database.`,
      `Scanned ${scan.pageRows.length} real Aetna portal pages from the already-open Chrome session.`,
      `Structured records prepared across the scan. Latest page: ${scan.pageRows.at(-1)?.page_kind ?? "unknown"}.`,
      `Workflow intent: ${intent}. Policy checks: ${policyResult.checks.map((check) => `${check.name}: ${check.severity}`).join("; ")}.`,
      "No payer API was used, no external message was sent, and Brainstyworkers is not providing medical advice."
    ].join("\n\n");
    await store.insert("conversation_messages", {
      id: createId("msg"),
      session_id: session.id,
      role: "assistant",
      content: finalResponse,
      created_at: nowIso()
    });
    await audit(store, session.id, "response_composed", { finalResponse });
    await checkpointSession(store, {
      session,
      stepName: "portal_scan_completed",
      statePatch: {
        workflow: {
          lastIntent: intent,
          latestBrowserRunId: scan.browserRun.id,
          latestEligibilitySnapshotId: latestEligibility?.snapshot?.id ?? null,
          portalPageCount: scan.pageRows.length,
          finalResponse
        }
      },
      metadata: {
        browserRunId: scan.browserRun.id,
        pageCount: scan.pageRows.length
      }
    });
    const retainedMemory = await retainMemoryFromSession(store, {
      user,
      session: { ...session, current_step: "portal_scan_completed" },
      reason: "portal_scan_completed"
    });
    return {
      ...enrollment,
      envelope,
      policyResult,
      intent,
      browserResult: { connected: true, status: "multi_page_scan", browserRunId: scan.browserRun.id },
      eligibility: latestEligibility,
      portalScan: scan,
      finalResponse,
      memoryContext,
      retainedMemory
    };
  }

  const browserResult = input.browserSnapshot
    ? await persistClaimedChromeSnapshot({
        store,
        session,
        portal,
        snapshot: input.browserSnapshot
      })
    : await runPortalExtraction({
        store,
        session,
        portal,
        remoteDebuggerUrl: input.remoteDebuggerUrl
      });
  const eligibility = await persistEligibilitySnapshot(store, { user, session, portal, browserResult });
  const finalResponse = composeResponse({
    user,
    portal,
    policyResult,
    intent,
    browserResult,
    eligibility
  });

  await store.insert("conversation_messages", {
    id: createId("msg"),
    session_id: session.id,
    role: "assistant",
    content: finalResponse,
    created_at: nowIso()
  });
  await audit(store, session.id, "response_composed", { finalResponse });
  await checkpointSession(store, {
    session,
    stepName: "response_composed",
    statePatch: {
      workflow: {
        lastIntent: intent,
        latestBrowserRunId: browserResult?.browserRun?.id ?? browserResult?.browserRunId ?? null,
        latestEligibilitySnapshotId: eligibility?.snapshot?.id ?? null,
        finalResponse
      }
    },
    metadata: {
      browserStatus: browserResult?.status,
      snapshotId: eligibility?.snapshot?.id
    }
  });
  const retainedMemory = await retainMemoryFromSession(store, {
    user,
    session: { ...session, current_step: "response_composed" },
    reason: "response_composed"
  });

  return { ...enrollment, envelope, policyResult, intent, browserResult, eligibility, finalResponse, memoryContext, retainedMemory };
}

export async function traceForSession(store, sessionId) {
  const [
    session,
    messages,
    browserRuns,
    auditEvents,
    approvalGates,
    snapshots
    ,
    coverageBalances,
    claims,
    priorAuthorizations,
    extractionReviews
    ,
    portalPageSnapshots
    ,
    managedSession,
    memoryItems,
    contextPackets,
    workflowRuns,
    journeyEvents,
    agentTasks,
    scheduledJobs,
    agentOutbox,
    memoryHarnessRuns
  ] = await Promise.all([
    store.findOne("sessions", { id: sessionId }),
    store.list("conversation_messages", { session_id: sessionId }),
    store.list("browser_runs", { session_id: sessionId }),
    store.list("audit_events", { session_id: sessionId }),
    store.list("approval_gates", { session_id: sessionId }),
    store.list("eligibility_snapshots", { session_id: sessionId }),
    store.all(`SELECT cb.* FROM coverage_balances cb JOIN eligibility_snapshots es ON es.id = cb.snapshot_id WHERE es.session_id = '${sessionId.replaceAll("'", "''")}' ORDER BY cb.created_at ASC;`),
    store.all(`SELECT ci.* FROM claim_items ci JOIN eligibility_snapshots es ON es.id = ci.snapshot_id WHERE es.session_id = '${sessionId.replaceAll("'", "''")}' ORDER BY ci.created_at ASC;`),
    store.all(`SELECT pa.* FROM prior_authorizations pa JOIN eligibility_snapshots es ON es.id = pa.snapshot_id WHERE es.session_id = '${sessionId.replaceAll("'", "''")}' ORDER BY pa.created_at ASC;`),
    store.all(`SELECT er.* FROM extraction_reviews er JOIN eligibility_snapshots es ON es.id = er.snapshot_id WHERE es.session_id = '${sessionId.replaceAll("'", "''")}' ORDER BY er.created_at ASC;`),
    store.list("portal_page_snapshots", { session_id: sessionId }),
    getManagedSessionState(store, sessionId),
    store.list("memory_items", { session_id: sessionId }),
    store.list("context_packets", { session_id: sessionId }),
    store.list("workflow_runs", { session_id: sessionId }),
    store.list("user_journey_events", { session_id: sessionId }),
    store.list("agent_tasks", { session_id: sessionId }),
    store.list("scheduled_jobs", { session_id: sessionId }),
    store.list("agent_outbox", { session_id: sessionId }),
    store.list("memory_harness_runs", { session_id: sessionId })
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
    agentOutbox,
    memoryHarnessRuns,
    auditEvents
  };
}
