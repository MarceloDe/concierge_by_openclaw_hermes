import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import { classifyUntrustedTextRisk } from "./policy.mjs";
import { buildPromptBundle } from "./promptContracts.mjs";
import { getManagedSessionState } from "./sessionManager.mjs";
import { loadWorkflowArchitecture } from "./workflowArchitecture.mjs";

const DEFAULT_HEARTBEAT_MINUTES = 60;

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function stripBlank(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function compactText(value, limit = 1200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function redactAuthSecretText(value) {
  return String(value ?? "")
    .replace(
      /\b(password|passcode|passkey|one[- ]time code|otp|verification code|2fa|mfa|captcha)\b\s*(?:is|=|:)\s*["']?[^\s,;]+/gi,
      "$1 [redacted]"
    )
    .replace(/\b(ssn|social security)\b\s*(?:is|=|:)?\s*\d{3}[- ]?\d{2}[- ]?\d{4}\b/gi, "$1 [redacted]");
}

function compactTaskMetadata(metadata = {}) {
  const workerPlan = metadata.workerPlan ?? {};
  return {
    executionMode: metadata.executionMode ?? null,
    validationStatus: metadata.validation?.status ?? metadata.validationStatus ?? null,
    validationIssues: metadata.validation?.issues ?? metadata.validationIssues ?? [],
    validationWarnings: metadata.validation?.warnings ?? metadata.validationWarnings ?? [],
    workerPlanId: workerPlan.planId ?? metadata.workerPlanId ?? null,
    workerDispatchStatus: workerPlan.dispatchStatus ?? metadata.workerDispatchStatus ?? null,
    workerJobIds: (workerPlan.workerJobs ?? []).map((job) => job.jobId),
    approvalsRequired: metadata.validation?.approvalsRequired ?? metadata.approvalsRequired ?? []
  };
}

function compactScheduledJobPayload(payload = {}) {
  return {
    sourceTable: payload.sourceTable ?? null,
    sourceId: payload.sourceId ?? null,
    claimId: payload.claimId ?? null,
    workflowKey: payload.workflowKey ?? null,
    summary: payload.summary ? compactText(payload.summary, 300) : null
  };
}

async function getLatestPortalAccount(store, userId) {
  return store.get(
    "SELECT * FROM portal_accounts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1;",
    [userId]
  );
}

async function getRecentSessions(store, userId, limit = 5) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 5));
  return store.all(
    `SELECT id, channel, langgraph_thread_id, title, current_step, last_intent, state_version, status, last_active_at, created_at
     FROM sessions
     WHERE user_id = ?
     ORDER BY COALESCE(last_active_at, created_at) DESC
     LIMIT ?;`,
    [userId, safeLimit]
  );
}

async function getRecentMemoryItems(store, userId, limit = 12) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 12));
  const rows = await store.all(
    `SELECT *
     FROM memory_items
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?;`,
    [userId, safeLimit]
  );
  return rows.map((row) => {
    const { metadata_json, ...rest } = row;
    return {
      ...rest,
      metadata: parseJson(metadata_json, {})
    };
  });
}

async function getRecentConversationMessages(store, sessionId, limit = 12) {
  if (!sessionId) return [];
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 12));
  const rows = await store.all(
    `SELECT id, role, content, created_at
     FROM conversation_messages
     WHERE session_id = ?
     ORDER BY created_at DESC
     LIMIT ?;`,
    [sessionId, safeLimit]
  );
  return rows.reverse().map((row) => {
    const risk = classifyUntrustedTextRisk(row.content ?? "");
    return {
      id: row.id,
      role: row.role,
      content: compactText(redactAuthSecretText(row.content), 700),
      createdAt: row.created_at,
      untrusted: true,
      risk: {
        promptInjection: Boolean(risk.promptInjection),
        credential: Boolean(risk.credential),
        externalAction: Boolean(risk.externalAction),
        urgentEscalation: Boolean(risk.urgentEscalation)
      }
    };
  });
}

async function getOpenTasks(store, userId, limit = 10) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
  const rows = await store.all(
    `SELECT *
     FROM agent_tasks
     WHERE user_id = ? AND status IN ('open', 'pending_integration', 'pending_approval')
     ORDER BY COALESCE(due_at, created_at) ASC
     LIMIT ?;`,
    [userId, safeLimit]
  );
  return rows.map((row) => {
    const { metadata_json, ...rest } = row;
    return {
      ...rest,
      metadata: compactTaskMetadata(parseJson(metadata_json, {}))
    };
  });
}

async function getScheduledJobs(store, userId, limit = 10) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
  const rows = await store.all(
    `SELECT *
     FROM scheduled_jobs
     WHERE user_id = ? AND status IN ('active', 'blocked_integration', 'pending_approval')
     ORDER BY COALESCE(next_run_at, created_at) ASC
     LIMIT ?;`,
    [userId, safeLimit]
  );
  return rows.map((row) => {
    const { payload_json, ...rest } = row;
    return {
      ...rest,
      payload: compactScheduledJobPayload(parseJson(payload_json, {}))
    };
  });
}

async function getLatestStructuredPointers(store, userId, limit = 8) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 8));
  const snapshots = await store.all(
    `SELECT id, session_id, portal_account_id, source_url, summary, created_at
     FROM eligibility_snapshots
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?;`,
    [userId, safeLimit]
  );
  const pointers = [];
  for (const snapshot of snapshots) {
    pointers.push({
      table: "eligibility_snapshots",
      id: snapshot.id,
      sessionId: snapshot.session_id,
      sourceUrl: snapshot.source_url,
      summary: snapshot.summary,
      createdAt: snapshot.created_at
    });
    const [balances, claims, authorizations] = await Promise.all([
      store.all("SELECT id, balance_type, label, source, created_at FROM coverage_balances WHERE snapshot_id = ? ORDER BY created_at DESC LIMIT 3;", [snapshot.id]),
      store.all("SELECT id, description, service_date, source, created_at FROM claim_items WHERE snapshot_id = ? ORDER BY created_at DESC LIMIT 3;", [snapshot.id]),
      store.all("SELECT id, provider_or_facility, service_date, status, source, created_at FROM prior_authorizations WHERE snapshot_id = ? ORDER BY created_at DESC LIMIT 3;", [snapshot.id])
    ]);
    for (const row of balances) {
      pointers.push({
        table: "coverage_balances",
        id: row.id,
        sessionId: snapshot.session_id,
        sourceUrl: snapshot.source_url,
        summary: `${row.balance_type}: ${row.label}`,
        createdAt: row.created_at
      });
    }
    for (const row of claims) {
      pointers.push({
        table: "claim_items",
        id: row.id,
        sessionId: snapshot.session_id,
        sourceUrl: snapshot.source_url,
        summary: `${row.description}${row.service_date ? ` on ${row.service_date}` : ""}`,
        createdAt: row.created_at
      });
    }
    for (const row of authorizations) {
      pointers.push({
        table: "prior_authorizations",
        id: row.id,
        sessionId: snapshot.session_id,
        sourceUrl: snapshot.source_url,
        summary: `${row.provider_or_facility ?? "authorization"}${row.status ? ` status ${row.status}` : ""}`,
        createdAt: row.created_at
      });
    }
  }
  return pointers.slice(0, safeLimit * 3);
}

async function findUser(store, { userId, email }) {
  if (userId) return store.findOne("users", { id: userId });
  if (email) return store.findOne("users", { email });
  return null;
}

export async function ensureOpenClawInstance(store, user) {
  const existing = await store.findOne("openclaw_instances", { user_id: user.id });
  if (existing) {
    return {
      ...existing,
      heartbeatState: parseJson(existing.heartbeat_state_json, {}),
      persona: parseJson(existing.persona_json, {})
    };
  }
  const createdAt = nowIso();
  const persona = {
    role: "dedicated_user_arm",
    userName: user.name,
    userEmail: user.email,
    operatingMode: "local_harness_until_real_openclaw_adapter",
    actionBoundary: "propose_and_gate_external_actions"
  };
  const heartbeatState = {
    generalContext: "Healthcare insurance concierge arm for this user.",
    lastTask: null,
    pendingCount: 0,
    scheduledJobCount: 0
  };
  const row = {
    id: createId("openclaw"),
    user_id: user.id,
    status: "always_on_local_harness",
    dedicated_channel: "local_web_chat",
    heartbeat_interval_minutes: DEFAULT_HEARTBEAT_MINUTES,
    last_heartbeat_at: null,
    heartbeat_state_json: JSON.stringify(heartbeatState),
    persona_json: JSON.stringify(persona),
    created_at: createdAt,
    updated_at: createdAt
  };
  try {
    await store.insert("openclaw_instances", row);
  } catch (error) {
    if (!String(error.message ?? "").includes("UNIQUE constraint failed: openclaw_instances.user_id")) {
      throw error;
    }
    const raced = await store.findOne("openclaw_instances", { user_id: user.id });
    if (raced) {
      return {
        ...raced,
        heartbeatState: parseJson(raced.heartbeat_state_json, {}),
        persona: parseJson(raced.persona_json, {})
      };
    }
    throw error;
  }
  return { ...row, heartbeatState, persona };
}

async function upsertMemoryItem(store, item) {
  const existing = await store.get(
    `SELECT * FROM memory_items
     WHERE user_id = ?
       AND source_table = ?
       AND source_id = ?
       AND memory_type = ?
     LIMIT 1;`,
    [item.user_id, item.source_table, item.source_id, item.memory_type]
  );
  const updatedAt = nowIso();
  if (existing) {
    await store.update(
      "memory_items",
      {
        content: item.content,
        metadata_json: item.metadata_json,
        source_url: item.source_url,
        occurred_at: item.occurred_at,
        valid_from_at: item.valid_from_at,
        valid_until_at: item.valid_until_at,
        last_verified_at: item.last_verified_at,
        temporal_metadata_json: item.temporal_metadata_json ?? "{}",
        confidence: item.confidence,
        updated_at: updatedAt
      },
      { id: existing.id }
    );
    return { ...existing, ...item, updated_at: updatedAt, inserted: false };
  }
  const row = {
    id: createId("mem"),
    created_at: updatedAt,
    updated_at: updatedAt,
    ...item
  };
  await store.insert("memory_items", row);
  return { ...row, inserted: true };
}

export async function retainMemoryFromSession(store, { user, session, reason = "session_progress" }) {
  const [managed, portal, snapshots, latestMessage] = await Promise.all([
    getManagedSessionState(store, session.id),
    getLatestPortalAccount(store, user.id),
    store.all(
      `SELECT id, source_url, summary, created_at
       FROM eligibility_snapshots
       WHERE user_id = ? AND session_id = ?
       ORDER BY created_at DESC
       LIMIT 3;`,
      [user.id, session.id]
    ),
    store.get(
      `SELECT id, content, created_at
       FROM conversation_messages
       WHERE session_id = ? AND role = 'user'
       ORDER BY created_at DESC
       LIMIT 1;`,
      [session.id]
    )
  ]);

  const updatedAt = nowIso();
  const retained = [];
  if (latestMessage) {
    const messageRisk = classifyUntrustedTextRisk(latestMessage.content);
    const blockedForRecall = messageRisk.promptInjection || messageRisk.credential || messageRisk.urgentEscalation;
    retained.push(
      await upsertMemoryItem(store, {
        user_id: user.id,
        session_id: session.id,
        memory_scope: "episodic",
        memory_type: blockedForRecall ? "blocked_policy_event" : "last_user_task",
        content:
          blockedForRecall
            ? "A user request was blocked or escalated by guardrails and the sensitive text was not retained for prompt recall."
            : latestMessage.content,
        metadata_json: JSON.stringify({
          reason,
          channel: session.channel,
          threadId: session.langgraph_thread_id,
          promptInjectionRisk: messageRisk.promptInjection,
          credentialRisk: messageRisk.credential,
          urgentEscalation: messageRisk.urgentEscalation,
          urgentEscalationCategory: messageRisk.urgentEscalationCategory
        }),
        source_table: "conversation_messages",
        source_id: latestMessage.id,
        source_url: null,
        sensitivity: blockedForRecall ? "blocked_unsafe_prompt_pointer" : "user_request_phi_possible",
        retention_policy: "local_cross_session_until_user_policy_changes",
        adapter_status: "local_hook_ready_hindsight_deferred",
        occurred_at: latestMessage.created_at,
        valid_from_at: latestMessage.created_at,
        valid_until_at: null,
        last_verified_at: updatedAt,
        temporal_metadata_json: JSON.stringify({
          timestampType: "iso_8601_utc_text",
          eventTimeSource: "conversation_messages.created_at"
        }),
        confidence: 1
      })
    );
  }

  if (managed.state) {
    retained.push(
      await upsertMemoryItem(store, {
        user_id: user.id,
        session_id: session.id,
        memory_scope: "session",
        memory_type: "langchain_checkpoint_pointer",
        content: `Session ${session.id} is at ${session.current_step} with thread ${session.langgraph_thread_id}.`,
        metadata_json: JSON.stringify({
          reason,
          checkpointNamespace: managed.state.checkpoint_ns,
          stateVersion: managed.state.state_version,
          currentStep: session.current_step
        }),
        source_table: "session_state",
        source_id: session.id,
        source_url: null,
        sensitivity: "operational_pointer",
        retention_policy: "stateful_session_pointer",
        adapter_status: "local_hook_ready_langgraph_adapter_pending",
        occurred_at: updatedAt,
        valid_from_at: updatedAt,
        valid_until_at: null,
        last_verified_at: updatedAt,
        temporal_metadata_json: JSON.stringify({
          timestampType: "iso_8601_utc_text",
          eventTimeSource: "session_state.updated_at"
        }),
        confidence: 1
      })
    );
  }

  if (portal) {
    retained.push(
      await upsertMemoryItem(store, {
        user_id: user.id,
        session_id: session.id,
        memory_scope: "semantic",
        memory_type: "payer_portal_context",
        content: `${user.name} uses ${portal.payer} at ${portal.portal_url} through a user-authenticated browser boundary.`,
        metadata_json: JSON.stringify({ reason, portalAccountId: portal.id, payer: portal.payer }),
        source_table: "portal_accounts",
        source_id: portal.id,
        source_url: portal.portal_url,
        sensitivity: "phi_pointer",
        retention_policy: "approved_local_phi_storage",
        adapter_status: "local_hook_ready_hindsight_deferred",
        occurred_at: portal.created_at,
        valid_from_at: portal.created_at,
        valid_until_at: null,
        last_verified_at: updatedAt,
        temporal_metadata_json: JSON.stringify({
          timestampType: "iso_8601_utc_text",
          eventTimeSource: "portal_accounts.created_at"
        }),
        confidence: 1
      })
    );
  }

  for (const snapshot of snapshots) {
    retained.push(
      await upsertMemoryItem(store, {
        user_id: user.id,
        session_id: session.id,
        memory_scope: "episodic",
        memory_type: "eligibility_snapshot_pointer",
        content: snapshot.summary,
        metadata_json: JSON.stringify({ reason, sourceUrl: snapshot.source_url }),
        source_table: "eligibility_snapshots",
        source_id: snapshot.id,
        source_url: snapshot.source_url,
        sensitivity: "phi_summary_and_pointer",
        retention_policy: "approved_local_phi_storage",
        adapter_status: "local_hook_ready_hindsight_deferred",
        occurred_at: snapshot.created_at,
        valid_from_at: snapshot.created_at,
        valid_until_at: null,
        last_verified_at: updatedAt,
        temporal_metadata_json: JSON.stringify({
          timestampType: "iso_8601_utc_text",
          eventTimeSource: "eligibility_snapshots.created_at"
        }),
        confidence: 0.95
      })
    );
  }

  await audit(store, session.id, "memory_retained", {
    reason,
    retained: retained.map((item) => ({
      id: item.id,
      memoryType: item.memory_type,
      sourceTable: item.source_table,
      sourceId: item.source_id,
      adapterStatus: item.adapter_status
    }))
  });

  return retained;
}

export async function buildContextPacket(store, { user, session = null, channel = "local_web_chat", userInput = "" }) {
  const [managedSession, recentSessions, memoryItems, recentConversation, openTasks, scheduledJobs, dbPointers, openclaw, portal] = await Promise.all([
    session ? getManagedSessionState(store, session.id) : Promise.resolve(null),
    getRecentSessions(store, user.id),
    getRecentMemoryItems(store, user.id),
    getRecentConversationMessages(store, session?.id),
    getOpenTasks(store, user.id),
    getScheduledJobs(store, user.id),
    getLatestStructuredPointers(store, user.id),
    ensureOpenClawInstance(store, user),
    getLatestPortalAccount(store, user.id)
  ]);
  const architecture = await loadWorkflowArchitecture(store, {
    user,
    portal,
    userInput,
    memoryItems,
    dbPointers
  });
  const generatedAt = nowIso();

  const packet = {
    schemaVersion: 2,
    generatedAt,
    timestampType: "iso_8601_utc_text",
    adapterChoice: {
      selectedNow: "hook_style_local_memory_harness",
      hindsightRole: "long_term_semantic_temporal_adapter_after_runtime_approval",
      openClawRole: "dedicated_user_arm_consuming_this_context_packet"
    },
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    },
    userProfileCompleteness: {
      requiredForFirstSlice: ["user.id", "user.name", "user.email", "portal_account"],
      present: {
        "user.id": Boolean(user.id),
        "user.name": Boolean(user.name),
        "user.email": Boolean(user.email),
        portal_account: Boolean(portal?.id)
      }
    },
    portalAccount: portal
      ? {
          id: portal.id,
          payer: portal.payer,
          portalUrl: portal.portal_url,
          status: portal.status
        }
      : null,
    currentSession: session
      ? {
          id: session.id,
          channel: session.channel,
          title: session.title,
          currentStep: session.current_step,
          threadId: session.langgraph_thread_id,
          stateVersion: managedSession?.state?.state_version ?? session.state_version
        }
      : null,
    request: {
      channel,
      userInput
    },
    recentSessions,
    recentConversation,
    memoryItems: memoryItems.map((item) => ({
      id: item.id,
      scope: item.memory_scope,
      type: item.memory_type,
      content: compactText(item.content, 1200),
      source: {
        table: item.source_table,
        id: item.source_id,
        url: item.source_url
      },
      sensitivity: item.sensitivity,
      retentionPolicy: item.retention_policy,
      adapterStatus: item.adapter_status,
      createdAt: item.created_at,
      occurredAt: item.occurred_at,
      validFromAt: item.valid_from_at,
      validUntilAt: item.valid_until_at,
      lastVerifiedAt: item.last_verified_at,
      temporal: parseJson(item.temporal_metadata_json, {})
    })),
    dbPointers,
    workflowArchitecture: architecture,
    openTasks,
    scheduledJobs,
    openclaw: {
      instanceId: openclaw.id,
      status: openclaw.status,
      channel: openclaw.dedicated_channel,
      heartbeatIntervalMinutes: openclaw.heartbeat_interval_minutes,
      heartbeatState: openclaw.heartbeatState
    },
    safety: {
      externalMessaging: "requires_explicit_approval_gate",
      payerCommunication: "requires_explicit_approval_gate",
      credentialEntry: "user_only",
      medicalAdvice: "not_allowed"
    }
  };
  packet.promptBundle = buildPromptBundle(packet);

  const row = {
    id: createId("ctx"),
    user_id: user.id,
    session_id: session?.id ?? null,
    packet_type: "langchain_openclaw_context",
    channel,
    packet_json: JSON.stringify(packet),
    generated_at: generatedAt,
    created_at: generatedAt
  };
  await store.insert("context_packets", row);
  const topRoute = architecture.routeCandidates[0] ?? null;
  if (session && topRoute) {
    await store.update(
      "sessions",
      {
        active_workflow_key: topRoute.workflowKey,
        journey_stage: topRoute.journeyStage,
        last_context_packet_id: row.id,
        state_version: Number(session.state_version ?? 0) + 1,
        last_active_at: generatedAt
      },
      { id: session.id }
    );
    await store.insert("workflow_runs", {
      id: createId("wrun"),
      user_id: user.id,
      session_id: session.id,
      workflow_key: topRoute.workflowKey,
      journey_stage: topRoute.journeyStage,
      status: topRoute.executableNow ? "preflight_ready" : "preflight_missing_context_or_tools",
      route_reason: topRoute.routeScore > 0 ? "matched_user_input_or_memory" : "default_context_preflight",
      readiness_json: JSON.stringify(topRoute),
      memory_context_ids_json: JSON.stringify(packet.memoryItems.map((item) => item.id)),
      tool_plan_json: JSON.stringify({
        requiredTools: topRoute.toolStatus,
        source: "workflow_architecture_registry"
      }),
      started_at: generatedAt,
      completed_at: generatedAt,
      created_at: generatedAt,
      updated_at: generatedAt
    });
    await store.insert("user_journey_events", {
      id: createId("journey"),
      user_id: user.id,
      session_id: session.id,
      workflow_key: topRoute.workflowKey,
      journey_stage: topRoute.journeyStage,
      event_type: "workflow_preflight_routed",
      status: topRoute.executableNow ? "ready" : "needs_context_or_tool",
      summary: `Workflow preflight selected ${topRoute.workflowKey}.`,
      evidence_json: JSON.stringify({
        routeScore: topRoute.routeScore,
        missingUserFields: topRoute.missingUserFields,
        missingDataPointers: topRoute.missingDataPointers,
        disabledTools: topRoute.disabledTools,
        contextPacketId: row.id
      }),
      occurred_at: generatedAt,
      created_at: generatedAt
    });
  }
  return { row, packet };
}

async function createScheduledJob(store, { user, session, jobType, scheduleLabel, nextRunAt, requiresIntegration, approvalStatus, payload }) {
  const sessionClause = session?.id ? "session_id = ?" : "session_id IS NULL";
  const params = session?.id ? [user.id, session.id, jobType] : [user.id, jobType];
  const existing = await store.get(
    `SELECT *
     FROM scheduled_jobs
     WHERE user_id = ?
       AND ${sessionClause}
       AND job_type = ?
       AND status IN ('active', 'blocked_integration', 'pending_approval')
     LIMIT 1;`,
    params
  );
  if (existing) return existing;
  const createdAt = nowIso();
  const row = {
    id: createId("job"),
    user_id: user.id,
    session_id: session?.id ?? null,
    workflow_key: payload.workflowKey ?? null,
    journey_stage: payload.journeyStage ?? null,
    job_type: jobType,
    schedule_label: scheduleLabel,
    status: requiresIntegration ? "blocked_integration" : "active",
    next_run_at: nextRunAt,
    last_run_at: null,
    requires_integration: requiresIntegration,
    approval_status: approvalStatus,
    payload_json: JSON.stringify(payload),
    created_at: createdAt,
    updated_at: createdAt
  };
  await store.insert("scheduled_jobs", row);
  return row;
}

async function createTask(store, { user, session, taskType, status, priority, description, sourceTable, sourceId, scheduledJobId, dueAt, metadata }) {
  const existing = await store.get(
    `SELECT *
     FROM agent_tasks
     WHERE user_id = ?
       AND task_type = ?
       AND source_table = ?
       AND source_id = ?
       AND status IN ('open', 'pending_integration', 'pending_approval')
     LIMIT 1;`,
    [user.id, taskType, sourceTable, sourceId]
  );
  if (existing) return existing;
  const createdAt = nowIso();
  const row = {
    id: createId("task"),
    user_id: user.id,
    session_id: session?.id ?? null,
    workflow_key: metadata.workflowKey ?? null,
    journey_stage: metadata.journeyStage ?? null,
    task_type: taskType,
    status,
    priority,
    description,
    source_table: sourceTable,
    source_id: sourceId,
    scheduled_job_id: scheduledJobId,
    due_at: dueAt,
    metadata_json: JSON.stringify(metadata),
    created_at: createdAt,
    updated_at: createdAt
  };
  await store.insert("agent_tasks", row);
  return row;
}

async function createOutboxProposal(store, { user, session, channel, message, relatedTaskId, metadata }) {
  const createdAt = nowIso();
  const row = {
    id: createId("outbox"),
    user_id: user.id,
    session_id: session?.id ?? null,
    channel,
    status: "pending_approval",
    message,
    related_task_id: relatedTaskId,
    approval_status: "requires_user_approval",
    metadata_json: JSON.stringify(metadata),
    created_at: createdAt,
    updated_at: createdAt
  };
  await store.insert("agent_outbox", row);
  return row;
}

export async function planTaskFollowups(store, { user, session, eventType, payload = {} }) {
  if (eventType !== "claim_submitted") {
    return { eventType, planned: [], reason: "No follow-up rule for event type." };
  }

  const now = nowIso();
  const sourceTable = payload.sourceTable ?? "manual_event";
  const sourceId = payload.sourceId ?? payload.claimId ?? createId("claim_event");
  const emailJob = await createScheduledJob(store, {
    user,
    session,
    jobType: "check_email_for_payer_response",
    scheduleLabel: "twice_daily_09_00_and_17_00_local",
    nextRunAt: addHours(now, 12),
    requiresIntegration: "gmail_or_email_channel",
    approvalStatus: "requires_user_setup",
    payload: {
      reason: "A claim was submitted; watch for payer response email after user approves email integration.",
      eventType,
      sourceTable,
      sourceId,
      claimId: payload.claimId ?? null,
      workflowKey: "claim_status_navigation",
      journeyStage: "service_use_claim"
    }
  });
  const claimStatusJob = await createScheduledJob(store, {
    user,
    session,
    jobType: "check_payer_portal_claim_status",
    scheduleLabel: "daily_after_claim_submission",
    nextRunAt: addHours(now, 24),
    requiresIntegration: "openclaw_authenticated_browser",
    approvalStatus: "requires_user_approval_before_action",
    payload: {
      reason: "A claim was submitted; revisit payer portal status through user-controlled Chrome/OpenClaw boundary.",
      eventType,
      sourceTable,
      sourceId,
      claimId: payload.claimId ?? null,
      workflowKey: "claim_status_navigation",
      journeyStage: "service_use_claim"
    }
  });

  const emailTask = await createTask(store, {
    user,
    session,
    taskType: "setup_email_access_for_payer_responses",
    status: "pending_integration",
    priority: "high",
    description: "Ask the user to approve and configure email access before the concierge checks payer response emails.",
    sourceTable,
    sourceId,
    scheduledJobId: emailJob.id,
    dueAt: emailJob.next_run_at,
    metadata: { eventType, claimId: payload.claimId ?? null, workflowKey: "claim_status_navigation", journeyStage: "service_use_claim" }
  });
  const portalTask = await createTask(store, {
    user,
    session,
    taskType: "verify_claim_status_in_payer_portal",
    status: "pending_approval",
    priority: "medium",
    description: "Use the authenticated browser/OpenClaw arm to verify claim status after user approval.",
    sourceTable,
    sourceId,
    scheduledJobId: claimStatusJob.id,
    dueAt: claimStatusJob.next_run_at,
    metadata: { eventType, claimId: payload.claimId ?? null, workflowKey: "claim_status_navigation", journeyStage: "service_use_claim" }
  });
  const outbox = await createOutboxProposal(store, {
    user,
    session,
    channel: "whatsapp",
    message:
      "I prepared follow-up monitoring for the submitted claim. Before I can check payer response emails or send updates by WhatsApp, please approve those integrations.",
    relatedTaskId: emailTask.id,
    metadata: {
      eventType,
      claimId: payload.claimId ?? null,
      notSentExternally: true
    }
  });

  await audit(store, session?.id ?? null, "followup_jobs_planned", {
    eventType,
    emailJobId: emailJob.id,
    claimStatusJobId: claimStatusJob.id,
    taskIds: [emailTask.id, portalTask.id],
    outboxId: outbox.id
  });

  return {
    eventType,
    planned: [
      { type: "scheduled_job", id: emailJob.id, jobType: emailJob.job_type, status: emailJob.status },
      { type: "scheduled_job", id: claimStatusJob.id, jobType: claimStatusJob.job_type, status: claimStatusJob.status },
      { type: "task", id: emailTask.id, taskType: emailTask.task_type, status: emailTask.status },
      { type: "task", id: portalTask.id, taskType: portalTask.task_type, status: portalTask.status },
      { type: "outbox", id: outbox.id, channel: outbox.channel, status: outbox.status }
    ]
  };
}

async function getDueJobs(store, userId, now) {
  const rows = await store.all(
    `SELECT *
     FROM scheduled_jobs
     WHERE user_id = ?
       AND status IN ('active', 'blocked_integration', 'pending_approval')
       AND (next_run_at IS NULL OR next_run_at <= ?)
     ORDER BY COALESCE(next_run_at, created_at) ASC;`,
    [userId, now]
  );
  return rows.map((row) => ({
    ...row,
    payload: parseJson(row.payload_json, {})
  }));
}

export async function runUserHeartbeat(store, { userId, email, sessionId = null, now = nowIso() }) {
  const user = await findUser(store, { userId, email });
  if (!user) {
    throw new Error("User not found for heartbeat.");
  }
  const session = sessionId ? await store.findOne("sessions", { id: sessionId }) : null;
  const openclaw = await ensureOpenClawInstance(store, user);
  const dueJobs = await getDueJobs(store, user.id, now);
  const context = await buildContextPacket(store, {
    user,
    session,
    channel: openclaw.dedicated_channel,
    userInput: "heartbeat"
  });

  const pendingActions = dueJobs.map((job) => {
    if (job.status === "blocked_integration") {
      return {
        jobId: job.id,
        action: "request_integration_setup",
        integration: job.requires_integration,
        reason: "Job is due but blocked until the user approves and configures the integration."
      };
    }
    if (job.status === "pending_approval") {
      return {
        jobId: job.id,
        action: "request_user_approval",
        reason: "Job is due but needs explicit approval before external action."
      };
    }
    return {
      jobId: job.id,
      action: "ready_for_adapter_execution",
      reason: "No external adapter was invoked by the local harness."
    };
  });

  const run = {
    id: createId("mh run".replace(" ", "_")),
    user_id: user.id,
    session_id: session?.id ?? null,
    run_type: "openclaw_heartbeat",
    status: "completed",
    summary: `Heartbeat inspected ${dueJobs.length} due job(s) and produced ${pendingActions.length} pending action(s).`,
    input_json: JSON.stringify({ now, sessionId, email, userId }),
    output_json: JSON.stringify({ contextPacketId: context.row.id, dueJobs, pendingActions }),
    created_at: nowIso()
  };
  await store.insert("memory_harness_runs", run);

  const heartbeatState = {
    generalContext: `Dedicated local OpenClaw harness for ${user.name}.`,
    lastTask: pendingActions[0]?.action ?? stripBlank(context.packet.memoryItems[0]?.content),
    pendingCount: pendingActions.length,
    scheduledJobCount: context.packet.scheduledJobs.length,
    lastContextPacketId: context.row.id,
    lastHeartbeatRunId: run.id
  };
  await store.update(
    "openclaw_instances",
    {
      last_heartbeat_at: now,
    heartbeat_state_json: JSON.stringify(heartbeatState),
    last_context_packet_id: context.row.id,
    heartbeat_prompt_json: JSON.stringify(context.packet.promptBundle.openclawArm),
      updated_at: nowIso()
    },
    { id: openclaw.id }
  );
  await audit(store, session?.id ?? null, "openclaw_heartbeat_completed", {
    runId: run.id,
    contextPacketId: context.row.id,
    dueJobCount: dueJobs.length,
    pendingActions
  });

  return {
    user,
    instance: {
      ...openclaw,
      heartbeatState
    },
    run,
    contextPacket: context,
    dueJobs,
    pendingActions
  };
}

export async function getMemoryContextForUser(store, { userId, email, sessionId = null }) {
  const user = await findUser(store, { userId, email });
  if (!user) {
    throw new Error("User not found for memory context.");
  }
  const session = sessionId ? await store.findOne("sessions", { id: sessionId }) : null;
  return buildContextPacket(store, { user, session });
}

export async function listHarnessState(store, { userId, email }) {
  const user = await findUser(store, { userId, email });
  if (!user) {
    throw new Error("User not found for harness state.");
  }
  const [instance, tasks, jobs, outbox, memories, packets, runs] = await Promise.all([
    ensureOpenClawInstance(store, user),
    getOpenTasks(store, user.id, 50),
    getScheduledJobs(store, user.id, 50),
    store.all("SELECT * FROM agent_outbox WHERE user_id = ? ORDER BY created_at DESC LIMIT 50;", [user.id]),
    getRecentMemoryItems(store, user.id, 50),
    store.all("SELECT id, packet_type, channel, session_id, created_at FROM context_packets WHERE user_id = ? ORDER BY created_at DESC LIMIT 20;", [user.id]),
    store.all("SELECT * FROM memory_harness_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20;", [user.id])
  ]);
  return {
    user,
    instance,
    tasks,
    jobs,
    outbox: outbox.map((row) => ({ ...row, metadata: parseJson(row.metadata_json, {}) })),
    memories,
    packets,
    runs: runs.map((row) => ({ ...row, input: parseJson(row.input_json, {}), output: parseJson(row.output_json, {}) }))
  };
}
