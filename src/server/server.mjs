import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { SqliteStore, DEFAULT_DB_PATH } from "../concierge/database.mjs";
import { createReadOnlyObservationApproval } from "../concierge/approvalResume.mjs";
import { normalizeWebChat } from "../concierge/channelAdapter.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { traceForSession } from "../concierge/engine.mjs";
import { describeLangGraphScope } from "../concierge/langgraphScope.mjs";
import { runLangGraphOrchestration } from "../concierge/langgraphRunner.mjs";
import { probeChrome } from "../concierge/browserAutomation.mjs";
import { getMemoryContextForUser, listHarnessState, planTaskFollowups, runUserHeartbeat } from "../concierge/memoryHarness.mjs";
import { auditPromptContractSafety } from "../concierge/promptContracts.mjs";
import { buildRuntimeCompatibilityBundle } from "../concierge/runtimeAdapters.mjs";
import { listOpenClawSkillArtifacts, loadOpenClawSkillArtifact } from "../concierge/openclawSkillArtifacts.mjs";
import { getOpenAiConfig, loadLocalEnvOnce } from "../concierge/secrets.mjs";
import { closeManagedSession, getManagedSessionState, listManagedSessions } from "../concierge/sessionManager.mjs";
import { authenticatePlannedUser, runOrchestratorChat, runOrchestratorFlowCases } from "../concierge/orchestratorDemo.mjs";
import { getProductMemoryStatus, probeProductMemory, suppressProductMemoryEpisode } from "../concierge/productMemory.mjs";
import { checkOfficialOpenClawReadiness, getOfficialOpenClawConfig } from "../concierge/openclawOfficialRuntime.mjs";
import { classifyOfficialOpenClawLiveReadiness } from "../concierge/openclawLiveReadiness.mjs";
import {
  createRuntimeHookSubscription,
  listRuntimeEvents,
  listRuntimeHookSubscriptions,
  publishRuntimeEvent,
  subscribeRuntimeEvents
} from "../concierge/runtimeEvents.mjs";
import {
  cancelWorkerContinuation,
  createWorkerContinuation,
  listWorkerContinuations,
  requestWorkerContinuation
} from "../concierge/workerContinuations.mjs";

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? "127.0.0.1";
const APP_DIR = resolve("src/app");

await loadLocalEnvOnce();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const store = await new SqliteStore(process.env.BRAINSTY_DB_PATH ?? DEFAULT_DB_PATH).initialize();

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": MIME[".json"] });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function sendSse(res, event) {
  res.write(`event: ${event.eventType ?? "message"}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function serveStatic(req, res) {
  const path = new URL(req.url, "http://localhost").pathname;
  const fileName = path === "/" ? "index.html" : path === "/mvp" ? "mvp.html" : path.slice(1);
  const filePath = join(APP_DIR, fileName);
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      dbPath: store.dbPath,
      counts: await store.counts(),
      langGraphScope: describeLangGraphScope()
      ,
      openAI: {
        configured: getOpenAiConfig().configured,
        model: getOpenAiConfig().model
      },
      productMemory: {
        ...(await getProductMemoryStatus()),
        config: undefined
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/events") {
    sendJson(
      res,
      200,
      {
        events: await listRuntimeEvents(store, {
          sessionId: url.searchParams.get("sessionId") ?? null,
          userId: url.searchParams.get("userId") ?? null,
          eventType: url.searchParams.get("eventType") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 100)
        })
      }
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/events/stream") {
    const sessionId = url.searchParams.get("sessionId") ?? null;
    const userId = url.searchParams.get("userId") ?? null;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });
    sendSse(res, {
      eventType: "runtime.stream.opened",
      source: "server",
      sessionId,
      userId,
      createdAt: new Date().toISOString()
    });
    const unsubscribe = subscribeRuntimeEvents((event) => {
      if (sessionId && event.sessionId !== sessionId) return;
      if (userId && event.userId !== userId) return;
      sendSse(res, event);
    });
    req.on("close", unsubscribe);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/worker-continuations") {
    sendJson(res, 200, {
      continuations: await listWorkerContinuations(store, {
        sessionId: url.searchParams.get("sessionId") ?? null,
        userId: url.searchParams.get("userId") ?? null,
        status: url.searchParams.get("status") ?? null,
        limit: Number(url.searchParams.get("limit") ?? 20)
      })
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/worker-continuations") {
    const body = await readJson(req);
    const payload = await createWorkerContinuation(store, {
      taskId: body.taskId,
      sessionId: body.sessionId,
      userId: body.userId,
      approvalScope: body.approvalScope ?? "read_only_observation",
      allowedAction: body.allowedAction ?? "read_only_observation",
      correlationId: body.correlationId,
      reason: body.reason,
      reportEverySeconds: Number(body.reportEverySeconds ?? 30),
      expiresInMinutes: Number(body.expiresInMinutes ?? 120),
      lastProgressEvent: body.lastProgressEvent,
      metadata: body.metadata ?? {}
    });
    sendJson(res, payload.ok ? 200 : 400, {
      ...payload,
      trace: payload.continuation?.sessionId ? await traceForSession(store, payload.continuation.sessionId) : null
    });
    return;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/worker-continuations\/[^/]+\/cancel$/)) {
    const body = await readJson(req);
    const continuationId = decodeURIComponent(url.pathname.split("/")[3]);
    const payload = await cancelWorkerContinuation(store, {
      continuationId,
      sessionId: body.sessionId ?? null,
      userId: body.userId ?? null,
      reason: body.reason ?? "Cancelled by user."
    });
    sendJson(res, payload.ok ? 200 : 400, {
      ...payload,
      trace: payload.continuation?.sessionId ? await traceForSession(store, payload.continuation.sessionId) : null
    });
    return;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/worker-continuations\/[^/]+\/continue$/)) {
    const body = await readJson(req);
    const continuationId = decodeURIComponent(url.pathname.split("/")[3]);
    const payload = await requestWorkerContinuation(store, {
      continuationId,
      sessionId: body.sessionId ?? null,
      userId: body.userId ?? null
    });
    sendJson(res, payload.ok ? 200 : 400, {
      ...payload,
      trace: payload.continuation?.sessionId ? await traceForSession(store, payload.continuation.sessionId) : null
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/hooks") {
    sendJson(
      res,
      200,
      {
        subscriptions: await listRuntimeHookSubscriptions(store, {
          sessionId: url.searchParams.get("sessionId") ?? null,
          userId: url.searchParams.get("userId") ?? null,
          limit: Number(url.searchParams.get("limit") ?? 100)
        })
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/hooks") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      {
        subscription: await createRuntimeHookSubscription(store, {
          userId: body.userId ?? null,
          sessionId: body.sessionId ?? null,
          eventType: body.eventType ?? "*",
          targetType: body.targetType ?? "webhook",
          targetUrl: body.targetUrl ?? null,
          secret: body.secret ?? null,
          status: body.status ?? "active"
        })
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/events/publish") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      {
        event: await publishRuntimeEvent(store, {
          userId: body.userId ?? null,
          sessionId: body.sessionId ?? null,
          source: body.source ?? "api_runtime_events_publish",
          eventType: body.eventType,
          correlationId: body.correlationId ?? null,
          payload: body.payload ?? {}
        })
      }
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orchestrator/auth-start") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await authenticatePlannedUser(store, {
        member: body.member ?? {},
        sessionId: body.sessionId ?? null,
        resumeLatestSession: Boolean(body.resumeLatestSession)
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orchestrator/chat") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await runOrchestratorChat(store, {
        member: body.member ?? {},
        sessionId: body.sessionId ?? null,
        resumeLatestSession: Boolean(body.resumeLatestSession),
        message: body.message ?? body.userInput,
        useLiveModel: body.useLiveModel ?? true,
        requireLiveModel: body.requireLiveModel ?? true,
        payloadMode: body.payloadMode
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orchestrator/flow-tests") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await runOrchestratorFlowCases(store, {
        member: body.member ?? {},
        sessionId: body.sessionId ?? null,
        resumeLatestSession: Boolean(body.resumeLatestSession),
        useLiveModel: body.useLiveModel ?? true,
        requireLiveModel: body.requireLiveModel ?? true,
        payloadMode: body.payloadMode,
        caseIds: body.caseIds
      })
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/browser/probe") {
    sendJson(res, 200, await probeChrome(url.searchParams.get("remoteDebuggerUrl") ?? undefined));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/memory/context") {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    sendJson(
      res,
      200,
      await getMemoryContextForUser(store, {
        email,
        userId,
        sessionId: url.searchParams.get("sessionId") ?? null
      })
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/prompts/contract") {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    const context = await getMemoryContextForUser(store, {
      email,
      userId,
      sessionId: url.searchParams.get("sessionId") ?? null
    });
    sendJson(res, 200, {
      contextPacketId: context.row.id,
      promptBundle: context.packet.promptBundle,
      safetyAudit: auditPromptContractSafety(context.packet.promptBundle)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/runtime/compatibility") {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    const context = await getMemoryContextForUser(store, {
      email,
      userId,
      sessionId: url.searchParams.get("sessionId") ?? null
    });
    sendJson(res, 200, {
      contextPacketId: context.row.id,
      compatibility: buildRuntimeCompatibilityBundle(context.packet, {
        source: "api_runtime_compatibility",
        requestedAt: new Date().toISOString()
      })
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/memory/harness" || url.pathname === "/api/openclaw/instance")) {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    sendJson(res, 200, await listHarnessState(store, { email, userId }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/openclaw/skills") {
    sendJson(res, 200, await listOpenClawSkillArtifacts());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/openclaw/official/status") {
    const readiness = await checkOfficialOpenClawReadiness({ config: getOfficialOpenClawConfig() });
    sendJson(res, 200, {
      ...readiness,
      liveReadiness: classifyOfficialOpenClawLiveReadiness(readiness)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/openclaw/skills/insurance_portal_browser/validate-envelope") {
    const body = await readJson(req);
    const enrollment = await enrollDefaultMember(store, body.member ?? {}, {
      sessionId: body.sessionId,
      resumeLatestSession: Boolean(body.resumeLatestSession),
      title: body.sessionTitle ?? "OpenClaw skill envelope validation"
    });
    const graphRun = await runLangGraphOrchestration(store, {
      user: enrollment.user,
      session: enrollment.session,
      channel: enrollment.session.channel,
      userInput:
        body.message ??
        body.userInput ??
        "Validate the insurance portal browser envelope for read-only eligibility observation.",
      rawMessage: {
        source: "api_openclaw_skill_validate_envelope",
        member: body.member ?? {},
        portalUrl: body.portalUrl ?? body.member?.portalUrl ?? null,
        approvalScope: body.approvalScope ?? "read_only_observation",
        useLiveModel: false,
        requestedAt: new Date().toISOString()
      }
    });
    sendJson(res, 200, {
      user: enrollment.user,
      portal: enrollment.portal,
      session: enrollment.session,
      skillArtifact: await loadOpenClawSkillArtifact("insurance_portal_browser"),
      envelope: graphRun.state.openclaw_envelope,
      validation: graphRun.state.openclaw_skill_validation,
      workerPlan: graphRun.state.openclaw_worker_plan,
      proposal: graphRun.state.openclaw_skill_proposal,
      executionMode: graphRun.state.openclaw_skill_validation?.executionMode ?? "proposal_only",
      actionsTaken: graphRun.state.openclaw_skill_validation?.actionsTaken ?? [],
      trace: await traceForSession(store, enrollment.session.id)
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/openclaw/skills/")) {
    const skillKey = decodeURIComponent(url.pathname.replace("/api/openclaw/skills/", ""));
    try {
      sendJson(res, 200, await loadOpenClawSkillArtifact(skillKey));
    } catch (error) {
      sendJson(res, 404, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/memory/heartbeat") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await runUserHeartbeat(store, {
        email: body.email,
        userId: body.userId,
        sessionId: body.sessionId ?? null,
        now: body.now
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/memory/events") {
    const body = await readJson(req);
    const user = body.userId
      ? await store.findOne("users", { id: body.userId })
      : body.email
        ? await store.findOne("users", { email: body.email })
        : null;
    if (!user) {
      sendJson(res, 404, { error: "User not found." });
      return;
    }
    const session = body.sessionId ? await store.findOne("sessions", { id: body.sessionId }) : null;
    if (body.sessionId && !session) {
      sendJson(res, 404, { error: "Session not found." });
      return;
    }
    const planned = await planTaskFollowups(store, {
      user,
      session,
      eventType: body.eventType,
      payload: body.payload ?? {}
    });
    sendJson(res, 200, {
      planned,
      harness: await listHarnessState(store, { userId: user.id })
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/product-memory/status") {
    sendJson(res, 200, await getProductMemoryStatus({ store }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/product-memory/probe") {
    const body = await readJson(req);
    const enrollment = await enrollDefaultMember(store, body.member ?? {}, {
      sessionId: body.sessionId,
      resumeLatestSession: Boolean(body.resumeLatestSession),
      title: body.sessionTitle ?? "Graphiti product memory probe"
    });
    sendJson(
      res,
      200,
      await probeProductMemory({
        store,
        user: enrollment.user,
        session: enrollment.session,
        query: body.query ?? "eligibility benefits deductible source pointer"
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/product-memory/suppress") {
    const body = await readJson(req);
    sendJson(
      res,
      200,
      await suppressProductMemoryEpisode(store, {
        sessionId: body.sessionId ?? null,
        episodeUuid: body.episodeUuid
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/enroll") {
    const body = await readJson(req);
    const enrollment = await enrollDefaultMember(store, body.member ?? {});
    sendJson(res, 200, {
      user: enrollment.user,
      consent: enrollment.consent,
      portal: enrollment.portal,
      session: enrollment.session,
      counts: await store.counts()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const body = await readJson(req);
    const envelope = normalizeWebChat(body);
    const enrollment = await enrollDefaultMember(store, body.member ?? {}, {
      sessionId: body.sessionId,
      resumeLatestSession: Boolean(body.resumeLatestSession),
      title: body.sessionTitle
    });
    const graphRun = await runLangGraphOrchestration(store, {
      user: enrollment.user,
      session: enrollment.session,
      channel: enrollment.session.channel,
      userInput: envelope.user_input,
      rawMessage: {
        ...body,
        ...envelope,
        source: "api_chat",
        executeEvidenceObservation: body.executeEvidenceObservation !== false,
        useLiveModel: Boolean(body.useLiveModel),
        payloadMode: body.payloadMode ?? "phi_allowed_identifier_masked_reasoning",
        requestedAt: new Date().toISOString()
      }
    });
    const trace = await traceForSession(store, enrollment.session.id);
    sendJson(res, 200, {
      user: enrollment.user,
      portal: enrollment.portal,
      session: trace.session ?? enrollment.session,
      intent: graphRun.state.intent,
      policyResult: graphRun.state.policy_result,
      browserResult: graphRun.state.browser_result,
      eligibility: graphRun.state.eligibility_result,
      portalScan: graphRun.state.portal_scan,
      sourcePointers: graphRun.state.source_pointers,
      finalResponse: graphRun.state.final_response,
      graphRun,
      trace,
      counts: await store.counts()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/orchestrator/approve") {
    const body = await readJson(req);
    const task = body.taskId ? await store.findOne("agent_tasks", { id: body.taskId }) : null;
    if (!task) {
      sendJson(res, 404, { error: "Approval task not found." });
      return;
    }
    const approval = await createReadOnlyObservationApproval(store, {
      taskId: task.id,
      sessionId: body.sessionId ?? task.session_id,
      userId: body.userId ?? task.user_id,
      decision: body.decision ?? "approved",
      approvalScope: body.approvalScope ?? "read_only_observation",
      allowedAction: body.allowedAction ?? "read_only_observation",
      expiresInMinutes: Number(body.expiresInMinutes ?? 15)
    });
    if (!approval.ok && approval.status !== "denied") {
      sendJson(res, 400, approval);
      return;
    }
    await publishRuntimeEvent(store, {
      userId: task.user_id,
      sessionId: task.session_id,
      source: "orchestrator_approval",
      eventType: "approval.recorded",
      correlationId: task.id,
      payload: {
        status: approval.status,
        taskId: task.id,
        workflow: task.workflow_key,
        approvalScope: approval.approval?.approvalScope ?? body.approvalScope ?? "read_only_observation",
        allowedAction: approval.approval?.allowedAction ?? body.allowedAction ?? "read_only_observation",
        expiresAt: approval.approval?.expiresAt ?? null,
        actionsTaken: approval.approval?.actionsTaken ?? []
      }
    });
    sendJson(res, 200, {
      ...approval,
      trace: await traceForSession(store, task.session_id)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/langgraph/run") {
    const body = await readJson(req);
    const enrollment = await enrollDefaultMember(store, body.member ?? {}, {
      sessionId: body.sessionId,
      resumeLatestSession: Boolean(body.resumeLatestSession),
      title: body.sessionTitle ?? "LangGraph orchestration session"
    });
    const graphRun = await runLangGraphOrchestration(store, {
      user: enrollment.user,
      session: enrollment.session,
      channel: enrollment.session.channel,
      userInput: body.message ?? body.userInput ?? "",
      rawMessage: {
        ...body,
        source: "api_langgraph_run",
        executeEvidenceObservation: body.executeEvidenceObservation !== false,
        useLiveModel: Boolean(body.useLiveModel),
        payloadMode: body.payloadMode ?? "phi_allowed_identifier_masked_reasoning",
        requestedAt: new Date().toISOString()
      }
    });
    sendJson(res, 200, {
      user: enrollment.user,
      portal: enrollment.portal,
      session: enrollment.session,
      openAI: {
        configured: getOpenAiConfig().configured,
        model: getOpenAiConfig().model
      },
      graphRun,
      trace: await traceForSession(store, enrollment.session.id)
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/trace/")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/api/trace/", ""));
    sendJson(res, 200, await traceForSession(store, sessionId));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sessions") {
    const email = url.searchParams.get("email") ?? undefined;
    const userId = url.searchParams.get("userId") ?? undefined;
    if (!email && !userId) {
      sendJson(res, 400, { error: "Provide email or userId." });
      return;
    }
    sendJson(res, 200, {
      sessions: await listManagedSessions(store, {
        email,
        userId,
        limit: Number(url.searchParams.get("limit") ?? 20)
      })
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/state")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/api/sessions/", "").replace("/state", "").replace(/\/$/, ""));
    const state = await getManagedSessionState(store, sessionId);
    if (!state.session) {
      sendJson(res, 404, { error: "Session not found." });
      return;
    }
    sendJson(res, 200, state);
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/sessions/") && url.pathname.endsWith("/close")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/api/sessions/", "").replace("/close", "").replace(/\/$/, ""));
    await closeManagedSession(store, sessionId);
    sendJson(res, 200, { ok: true, sessionId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/review/latest") {
    const snapshot = await store.get("SELECT * FROM eligibility_snapshots ORDER BY created_at DESC LIMIT 1;");
    if (!snapshot) {
      sendJson(res, 404, { error: "No extraction snapshot exists yet." });
      return;
    }
    const snapshotId = snapshot.id.replaceAll("'", "''");
    sendJson(res, 200, {
      snapshot,
      coverageBalances: await store.all(`SELECT * FROM coverage_balances WHERE snapshot_id = '${snapshotId}' ORDER BY created_at ASC;`),
      claims: await store.all(`SELECT * FROM claim_items WHERE snapshot_id = '${snapshotId}' ORDER BY created_at ASC;`),
      priorAuthorizations: await store.all(`SELECT * FROM prior_authorizations WHERE snapshot_id = '${snapshotId}' ORDER BY created_at ASC;`),
      extractionReviews: await store.all(`SELECT * FROM extraction_reviews WHERE snapshot_id = '${snapshotId}' ORDER BY created_at ASC;`)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/portal-pages/latest") {
    const session = await store.get("SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1;");
    if (!session) {
      sendJson(res, 404, { error: "No session exists yet." });
      return;
    }
    sendJson(res, 200, {
      session,
      pages: await store.list("portal_page_snapshots", { session_id: session.id })
    });
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message, stack: process.env.NODE_ENV === "production" ? undefined : error.stack });
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, HOST, () => {
    console.log(`Brainstyworkers AI Concierge running at http://${HOST}:${PORT}`);
    console.log(`SQLite database: ${store.dbPath}`);
  });
}
