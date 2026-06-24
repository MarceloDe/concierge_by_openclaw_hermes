const messages = document.querySelector("#messages");
const trace = document.querySelector("#trace");
const form = document.querySelector("#chatForm");
const review = document.querySelector("#review");
const reviewStatus = document.querySelector("#reviewStatus");
const portalPages = document.querySelector("#portalPages");
const portalStatus = document.querySelector("#portalStatus");
const sessionStatus = document.querySelector("#sessionStatus");
const sessions = document.querySelector("#sessions");
const harness = document.querySelector("#harness");
const harnessStatus = document.querySelector("#harnessStatus");
const productMemory = document.querySelector("#productMemory");
const productMemoryStatus = document.querySelector("#productMemoryStatus");
const skills = document.querySelector("#skills");
const skillStatus = document.querySelector("#skillStatus");
const orchestrator = document.querySelector("#orchestrator");
const orchestratorStatus = document.querySelector("#orchestratorStatus");
const phase4 = document.querySelector("#phase4");
const phase4Status = document.querySelector("#phase4Status");
const connectorProof = document.querySelector("#connectorProof");
const connectorProofStatus = document.querySelector("#connectorProofStatus");
const loadConnectorProofButton = document.querySelector("#loadConnectorProof");
const pemsWorkbench = document.querySelector("#pemsWorkbench");
const pemsWorkbenchStatus = document.querySelector("#pemsWorkbenchStatus");
const loadPemsWorkbenchButton = document.querySelector("#loadPemsWorkbench");
const generatePemsLiveDraftButton = document.querySelector("#generatePemsLiveDraft");
const pemsDraftStatusFilter = document.querySelector("#pemsDraftStatusFilter");
const pemsEvaluatorModeFilter = document.querySelector("#pemsEvaluatorModeFilter");
const pemsLiveOnlyFilter = document.querySelector("#pemsLiveOnlyFilter");
const pemsHistoryFollowupFilter = document.querySelector("#pemsHistoryFollowupFilter");
const pemsHistoryExportRefFilter = document.querySelector("#pemsHistoryExportRefFilter");
const pemsHistorySnapshotHashFilter = document.querySelector("#pemsHistorySnapshotHashFilter");
const pemsHistorySortBy = document.querySelector("#pemsHistorySortBy");
const pemsHistorySortDirection = document.querySelector("#pemsHistorySortDirection");
const pemsReviewRationale = document.querySelector("#pemsReviewRationale");
const pemsClaimRevisionText = document.querySelector("#pemsClaimRevisionText");
const recordPemsClaimRevisionButton = document.querySelector("#recordPemsClaimRevision");
const pemsFollowUpRationale = document.querySelector("#pemsFollowUpRationale");
const recordPemsFollowUpButton = document.querySelector("#recordPemsFollowUp");
const pemsHistoryExportReason = document.querySelector("#pemsHistoryExportReason");
const recordPemsHistoryExportButton = document.querySelector("#recordPemsHistoryExport");
const pemsReviewActionButtons = [...document.querySelectorAll("[data-pems-review-action]")];
const researchStatus = document.querySelector("#researchStatus");
const researchConsole = document.querySelector("#researchConsole");
const loadHandoffsButton = document.querySelector("#loadHandoffs");
const operatorAssistantStatus = document.querySelector("#operatorAssistantStatus");
const operatorAssistantConsole = document.querySelector("#operatorAssistantConsole");
const productAuthStatus = document.querySelector("#productAuthStatus");
const productAuth = document.querySelector("#productAuth");
const requireLivePortalProof = document.querySelector("#requireLivePortalProof");
const useOfficialOpenClawWorker = document.querySelector("#useOfficialOpenClawWorker");
const officialOpenClawCurrentTab = document.querySelector("#officialOpenClawCurrentTab");
const officialOpenClawMultiPage = document.querySelector("#officialOpenClawMultiPage");
const chatJourney = document.querySelector("#chatJourney");
const runtimeTimeline = document.querySelector("#runtimeTimeline");
const portalReady = document.querySelector("#portalReady");
const loadRuntimeEventsButton = document.querySelector("#loadRuntimeEvents");
const answerPanel = document.querySelector("#answerPanel");
const resetMvpJourneyButton = document.querySelector("#resetMvpJourney");
const replayMvpBenefitsButton = document.querySelector("#replayMvpBenefits");
const liveWorkerGuide = document.querySelector("#liveWorkerGuide");
const liveWorkerStatus = document.querySelector("#liveWorkerStatus");
const workerVersatility = document.querySelector("#workerVersatility");
const checkLiveWorkerButton = document.querySelector("#checkLiveWorker");

let latestChatRun = null;
let latestUserMessage = "";
let runtimeEvents = [];
let runtimeEventSource = null;
let runtimeStreamSessionId = null;
let productSignedIn = false;
let connectorProofLoadPromise = null;
let latestPemsWorkbench = null;
let pemsWorkbenchLoadPromise = null;

const MVP_BENEFITS_MESSAGE = "Do I still owe anything before insurance starts paying?";
const READ_ONLY_DOCUMENT_SCOPE = "read_only_document_observation";

function value(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}

function addMessage(role, content, options = {}) {
  const node = document.createElement("div");
  node.className = `message ${role}${options.className ? ` ${options.className}` : ""}`;
  if (options.html) node.innerHTML = content;
  else node.textContent = content;
  messages.append(node);
  messages.scrollTop = messages.scrollHeight;
  return node;
}

function money(value) {
  if (value === null || value === undefined) return "unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textPreview(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
}

function sourcePointerLabel(pointer) {
  return [pointer.table, pointer.id].filter(Boolean).join("/") || pointer.sourceUrl || "source pointer";
}

function uniqueSourcePointers(state = {}) {
  const pointers = [...(state.source_pointers ?? []), ...(state.evidence_observation?.sourcePointers ?? [])];
  const seen = new Set();
  return pointers.filter((pointer) => {
    const key = sourcePointerLabel(pointer);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourcePointerCount(state = {}) {
  return (state.source_pointers?.length ?? 0) + (state.evidence_observation?.sourcePointers?.length ?? 0);
}

function hasCapturedPortalEvidence(state = {}) {
  const evidence = state.evidence_observation ?? {};
  return (
    sourcePointerCount(state) > 0 ||
    [
      "captured_visible_page",
      "captured_official_openclaw_read_only_observation",
      "captured_official_openclaw_multi_page_read_only_observation",
      "captured_multi_page_scan"
    ].includes(evidence.status)
  );
}

function isSatisfiedByCapturedPortalEvidence(line) {
  return /portal_accounts|portal account|portal evidence|authenticated portal|insurance portal/i.test(line);
}

function missingInfoLines(state) {
  const lines = [
    ...(state.structured_intent?.missingEvidence ?? []).map((item) => `Missing evidence: ${item}`),
    ...(state.workflow_route?.missingUserFields ?? []).map((item) => `Missing user field: ${item}`),
    ...(state.workflow_route?.missingDataPointers ?? []).map((item) => `Missing data pointer: ${item}`),
    ...(state.workflow_route?.disabledTools ?? []).map((item) => `Tool disabled: ${item}`)
  ];
  if (!hasCapturedPortalEvidence(state)) return lines;
  return lines.filter((line) => !isSatisfiedByCapturedPortalEvidence(line));
}

function dynamicSkillContextFromState(state = {}) {
  return state.dynamic_skill_context ?? state.dynamicSkillContext ?? null;
}

function dynamicSkillSelectedLine(context = {}) {
  const selected = context.selected ?? {};
  return [
    selected.insuranceSkillKey ? `insurance=${selected.insuranceSkillKey}` : null,
    selected.journeySkillKey ? `journey=${selected.journeySkillKey}` : null,
    selected.executionSkillKey ? `execution=${selected.executionSkillKey}` : null
  ].filter(Boolean).join(" · ") || "none selected";
}

function dynamicSkillMissingData(context = {}) {
  const missing = new Set(context.dataNeeded ?? []);
  for (const match of context.matches ?? []) {
    for (const item of match.success?.missingData ?? []) missing.add(item);
  }
  return [...missing].filter(Boolean);
}

function dynamicSkillMatchCards(context = {}) {
  const matches = context.matches ?? [];
  if (!matches.length) return '<p class="status-text">No matching dynamic skill selected for this run.</p>';
  return `
    <div class="dynamic-skill-match-grid">
      ${matches
        .slice(0, 4)
        .map(
          (match) => `
            <article class="dynamic-skill-match-card">
              <strong>${escapeHtml(match.title ?? match.skillKey)}</strong>
              <span>${escapeHtml(match.skillKind ?? "skill")} · fit ${escapeHtml(match.fit?.score ?? 0)} · success ${escapeHtml(match.success?.chance ?? "n/a")}</span>
              <small>${escapeHtml((match.questionsSolved ?? []).slice(0, 2).join(" · ") || "questions not listed")}</small>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDynamicSkillProof(context, options = {}) {
  if (!context) {
    return options.empty === false
      ? ""
      : `
        <article class="dynamic-skill-card">
          <div>
            <p class="eyebrow">Dynamic Skills</p>
            <h3>No skill context yet</h3>
          </div>
          <p class="status-text">Run a LangGraph workflow to resolve insurance, journey, and execution skills.</p>
        </article>
      `;
  }
  const missing = dynamicSkillMissingData(context);
  return `
    <article class="dynamic-skill-card">
      <div class="dynamic-skill-header">
        <div>
          <p class="eyebrow">Dynamic Skills</p>
          <h3>${escapeHtml(dynamicSkillSelectedLine(context))}</h3>
        </div>
        <span>${escapeHtml(context.successEstimate?.overallChance ?? "n/a")} chance</span>
      </div>
      <dl>
        <dt>Missing data</dt>
        <dd>${escapeHtml(missing.join(" · ") || "none")}</dd>
        <dt>OpenClaw tasks</dt>
        <dd>${escapeHtml((context.requiredOpenClawTasks ?? []).join(" · ") || "none")}</dd>
        <dt>Search</dt>
        <dd>${escapeHtml((context.requiredSearch ?? []).join(" · ") || "none")}</dd>
        <dt>APIs</dt>
        <dd>${escapeHtml((context.requiredApis ?? []).join(" · ") || "none")}</dd>
        <dt>Generator edits</dt>
        <dd>${escapeHtml(context.generatorEditContract?.editableBy ?? "not reported")} · forbids ${escapeHtml((context.generatorEditContract?.forbiddenEdits ?? []).join(", ") || "none")}</dd>
      </dl>
      ${dynamicSkillMatchCards(context)}
    </article>
  `;
}

function outboundPayloadAuditSummary(result) {
  const audits = result.trace?.auditEvents ?? [];
  const payloadAudits = audits
    .map((item) => {
      try {
        return item.event_type === "outbound_payload_observed" ? JSON.parse(item.details) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!payloadAudits.length) return "none";
  return payloadAudits
    .slice(-4)
    .map((item) => {
      const status = item.allowedByCurrentPrototypePolicy === false ? `blocked(${(item.policyIssues ?? []).join(", ") || "policy"})` : "allowed";
      return `${item.destination}:${item.payloadType} ${item.enforcementMode ?? "observe"} ${status} id=${item.containsDirectIdentifier ? "yes" : "no"} portal=${item.containsPortalText ? "yes" : "no"} sources=${item.containsSourcePointers ? "yes" : "no"}`;
    })
    .join(" · ");
}

function pendingReadOnlyTaskId(result) {
  const state = result?.graphRun?.state ?? {};
  const task = state.openclaw_skill_proposal?.task ?? {};
  if (!task.id || hasCapturedPortalEvidence(state)) return "";
  if (state.approval_resume?.status === "approval_consumed") return "";
  return task.id;
}

function currentSessionId() {
  return value("sessionId") || latestChatRun?.session?.id || "";
}

function journeyClass(ok, waiting = false) {
  if (ok) return "done";
  return waiting ? "waiting" : "";
}

function renderOperatorProofDetails(title, bodyHtml, options = {}) {
  return `
    <details class="chat-proof-card operator-proof ${escapeHtml(options.className ?? "")}" ${options.open ? "open" : ""}>
      <summary>${escapeHtml(title)}</summary>
      ${bodyHtml}
    </details>
  `;
}

function renderJourneyState(result = null) {
  const state = result?.graphRun?.state ?? {};
  const proposalTask = state.openclaw_skill_proposal?.task ?? {};
  const evidence = state.evidence_observation ?? {};
  const memoryRetain = state.product_memory_retain ?? result?.graphRun?.productMemory?.retain ?? {};
  const llmDecision = state.llm_orchestration_decision ?? {};
  const approvalStatus = state.approval_resume?.status ?? (proposalTask.id ? "waiting_for_read_only_approval" : "not_requested");
  const sourceCount = state.source_pointers?.length ?? 0;
  const signedIn = productSignedIn || Boolean(currentSessionId());
  const steps = [
    {
      label: "Local Auth",
      detail: signedIn ? currentSessionId() : "sign in first",
      className: journeyClass(signedIn, !signedIn)
    },
    {
      label: "GPT Route",
      detail: llmDecision.mode ? `${llmDecision.mode}${llmDecision.usedByRouter ? " · used" : ""}` : "waiting for workflow",
      className: journeyClass(Boolean(llmDecision.usedByRouter), Boolean(result && !llmDecision.usedByRouter))
    },
    {
      label: "Approval",
      detail: approvalStatus,
      className: journeyClass(approvalStatus === "approval_consumed", proposalTask.id && approvalStatus !== "approval_consumed")
    },
    {
      label: "OpenClaw",
      detail: evidence.status ?? "not requested",
      className: journeyClass(sourceCount > 0, evidence.status === "missing_approval_token" || proposalTask.id)
    },
    {
      label: "Memory",
      detail: memoryRetainSummary(memoryRetain),
      className: journeyClass(Boolean(memoryRetain.retained), Boolean(result))
    }
  ];
  chatJourney.innerHTML = `
    <div class="journey-grid">
      ${steps
        .map(
          (step) => `
            <div class="journey-step ${escapeHtml(step.className)}">
              <strong>${escapeHtml(step.label)}</strong>
              <span>${escapeHtml(step.detail)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function memoryRetainSummary(memoryRetain = {}) {
  if (!memoryRetain?.adapter) return "waiting";
  if (!memoryRetain.enabled) return `${memoryRetain.adapter} disabled`;
  if (memoryRetain.retained) {
    const repaired = memoryRetain.repairPlan?.repaired ? " · repaired" : "";
    const attempts = memoryRetain.retainAttempts ? ` · attempts ${memoryRetain.retainAttempts}` : "";
    return `${memoryRetain.adapter} retained${repaired}${attempts}`;
  }
  const repair = memoryRetain.repairPlan ?? {};
  const status = repair.status ?? "retain_failed";
  return `${memoryRetain.adapter} ${status}${repair.attemptedRetry ? " · retry tried" : ""}`;
}

function memoryNextAction(memoryRetain = {}) {
  if (memoryRetain?.retained) return "retained";
  return memoryRetain?.repairPlan?.nextAction ?? memoryRetain?.message ?? memoryRetain?.error ?? "not retained yet";
}

function renderAnswerPanel(result = null, options = {}) {
  if (!answerPanel) return;
  if (!result) {
    answerPanel.className = "answer-panel empty";
    answerPanel.innerHTML = `
      <div class="answer-panel-header">
        <h3>Current Answer</h3>
        <span class="answer-status">${escapeHtml(options.status ?? "ready")}</span>
      </div>
      <p class="answer-body">${escapeHtml(
        options.body ??
          "No benefits answer yet. Start a real local session, then run the Benefits MVP replay or ask in chat."
      )}</p>
      <div class="answer-meta">
        <div>
          <strong>Session</strong>
          <span>${escapeHtml(currentSessionId() || "none")}</span>
        </div>
        <div>
          <strong>Evidence</strong>
          <span>none</span>
        </div>
        <div>
          <strong>Worker</strong>
          <span>not requested</span>
        </div>
      </div>
    `;
    return;
  }
  const state = result.graphRun?.state ?? {};
  const evidence = state.evidence_observation ?? {};
  const pointers = uniqueSourcePointers(state);
  const balances = result.trace?.coverageBalances ?? [];
  const claims = result.trace?.claims ?? [];
  const priorAuthorizations = result.trace?.priorAuthorizations ?? [];
  const memoryRetain = state.product_memory_retain ?? result?.graphRun?.productMemory?.retain ?? {};
  const discovery = evidence.discoveryReport ?? {};
  const dynamicSkillContext = dynamicSkillContextFromState(state);
  const approvalNeeded = pendingReadOnlyTaskId(result);
  const finalText = result.finalResponse ?? "The workflow completed without a final answer.";
  const answerStatus =
    pointers.length > 0
      ? "sourced answer"
      : approvalNeeded
        ? "approval needed"
        : evidence.status?.startsWith("blocked")
          ? "blocked"
          : "workflow result";
  const workerOutcome =
    pointers.length > 0
      ? "completed_with_sourced_result"
      : evidence.status === "missing_approval_token"
        ? "approval required"
        : evidence.status ?? "not requested";
  answerPanel.className = "answer-panel";
  answerPanel.innerHTML = `
    <div class="answer-panel-header">
      <div>
        <h3>Current Answer</h3>
        <p class="answer-subtitle">Latest LangGraph result for this session; older messages remain as history.</p>
      </div>
      <span class="answer-status">${escapeHtml(answerStatus)}</span>
    </div>
    <p class="answer-body">${escapeHtml(finalText)}</p>
    <div class="answer-meta">
      <div>
        <strong>Workflow</strong>
        <span>${escapeHtml(state.workflow ?? "unknown")}</span>
      </div>
      <div>
        <strong>Source Pointers</strong>
        <span>${escapeHtml(pointers.map(sourcePointerLabel).join(" · ") || "none")}</span>
      </div>
      <div>
        <strong>Worker</strong>
        <span>${escapeHtml(workerOutcome)} · pages ${escapeHtml(evidence.verifiedPageCount ?? 0)}/${escapeHtml(evidence.pageCount ?? 0)} · actions ${escapeHtml((evidence.actionsTaken ?? []).join(", ") || "none")}</span>
      </div>
      <div>
        <strong>Benefits</strong>
        <span>${escapeHtml(structuredBenefitSummary(balances))}</span>
      </div>
      <div>
        <strong>Claims</strong>
        <span>${escapeHtml(structuredClaimSummary(claims, priorAuthorizations))}</span>
      </div>
      <div>
        <strong>Discovery</strong>
        <span>${escapeHtml(discoverySummary(discovery))}</span>
      </div>
      <div>
        <strong>Memory</strong>
        <span>${escapeHtml(memoryRetainSummary(memoryRetain))} · ${escapeHtml(memoryNextAction(memoryRetain))}</span>
      </div>
      <div>
        <strong>GPT Decision</strong>
        <span>${escapeHtml(state.llm_orchestration_decision?.mode ?? "not run")} · ${escapeHtml(
          state.llm_orchestration_decision?.usedByRouter ? "used" : "not used"
        )}</span>
      </div>
      <div>
        <strong>Trace</strong>
        <span>${escapeHtml(state.graph_trace_id ?? result.session?.langgraph_thread_id ?? "none")}</span>
      </div>
    </div>
    ${renderDynamicSkillProof(dynamicSkillContext, { empty: false })}
    ${
      approvalNeeded
        ? `<div class="button-row">
            <button type="button" data-answer-approve-readonly="${escapeHtml(approvalNeeded)}">Approve Read-Only Observation</button>
            <button type="button" data-answer-worker-followup="${escapeHtml(approvalNeeded)}">Leave As Async Follow-Up</button>
          </div>`
        : ""
    }
  `;
}

function summarizeRuntimeEvent(event) {
  const payload = event.payload ?? {};
  if (event.eventType === "workflow.classified") {
    const llm = payload.llmDecision ?? {};
    return `curated=${payload.curatedIntent?.workflow ?? "unknown"} · gpt=${llm.mode ?? "not run"} · ${llm.usedByRouter ? "used" : "not used"}`;
  }
  if (event.eventType === "workflow.routed") {
    return `${payload.workflow ?? "unknown"} · ${payload.routeReason ?? "unknown"}`;
  }
  if (event.eventType === "worker.plan.prepared") {
    return `${payload.dispatchStatus ?? "unknown"} · jobs ${(payload.workerJobIds ?? []).length} · progress ${payload.progressEverySeconds ?? "n/a"}s`;
  }
  if (event.eventType === "approval.recorded") {
    return `${payload.status ?? "unknown"} · ${payload.taskId ?? "no task"} · ${payload.allowedAction ?? "read_only_observation"}`;
  }
  if (event.eventType === "approval.consumed") {
    return `${payload.status ?? "unknown"} · ${payload.taskId ?? "no task"} · actions ${(payload.actionsTaken ?? []).join(", ") || "none"}`;
  }
  if (event.eventType === "worker.status.updated") {
    const discovery = payload.documentCandidateCount !== undefined ? ` · docs ${payload.documentCandidateCount} · SBC/PDF ${payload.sbcPdfCandidateCount ?? 0}` : "";
    return `${payload.status ?? "unknown"}${payload.terminalOutcome ? ` · ${payload.terminalOutcome}` : ""}${discovery} · actions ${(payload.actionsTaken ?? []).join(", ") || "none"}`;
  }
  if (event.eventType === "worker.followup.scheduled") {
    return `${payload.status ?? "pending_async_followup"} · ${payload.terminalOutcome ?? "needs_long_running_followup"} · next ${payload.nextCheckAt ?? "not scheduled"}`;
  }
  if (event.eventType === "worker.followup.cancelled") {
    return `${payload.status ?? "cancelled"} · ${payload.reason ?? "cancelled"} · actions ${(payload.actionsTaken ?? []).join(", ") || "none"}`;
  }
  if (event.eventType === "worker.followup.continue_requested") {
    return `${payload.status ?? "continue_requested"} · ${payload.note ?? "awaiting approved graph run"} · actions ${(payload.actionsTaken ?? []).join(", ") || "none"}`;
  }
  if (event.eventType === "worker.followup.dispatching") {
    return `${payload.status ?? "dispatching_official_openclaw"} · ${payload.runtime ?? "official_openclaw"} · actions ${(payload.actionsTaken ?? []).join(", ") || "none"}`;
  }
  if (event.eventType === "worker.followup.completed" || event.eventType === "worker.followup.blocked") {
    return `${payload.status ?? "unknown"} · ${payload.terminalOutcome ?? "unknown"} · actions ${(payload.actionsTaken ?? []).join(", ") || "none"}`;
  }
  if (event.eventType === "worker.followup.expired") {
    return `${payload.status ?? "expired"} · ${payload.reason ?? "expired"} · actions ${(payload.actionsTaken ?? []).join(", ") || "none"}`;
  }
  if (event.eventType === "approval.requested") {
    return `${payload.status ?? "unknown"} · ${payload.taskId ?? "no task"}`;
  }
  if (event.eventType === "evidence.status") {
    return `${payload.status ?? "unknown"} · actions ${(payload.actionsTaken ?? []).join(", ") || "none"} · sources ${payload.sourcePointerCount ?? 0}`;
  }
  if (event.eventType === "final.answer.created") {
    return `${payload.outcome ?? "unknown"} · sources ${payload.sourcePointerCount ?? 0}`;
  }
  if (event.eventType === "memory.retained") {
    const repaired = payload.repairRepaired ? " · repaired" : "";
    const attempts = payload.retainAttempts ? ` · attempts ${payload.retainAttempts}` : "";
    const next = payload.nextAction ? ` · next ${payload.nextAction}` : "";
    return `${payload.productMemoryAdapter ?? "disabled"} · retained ${payload.productMemoryRetained ?? false}${repaired}${attempts}${next}`;
  }
  return textPreview(JSON.stringify(payload), 220) || event.source || "event";
}

function renderRuntimeTimeline(events = runtimeEvents, status = "") {
  const visible = events.slice(0, 10);
  runtimeTimeline.innerHTML = `
    <h3>Runtime Timeline${status ? ` · ${escapeHtml(status)}` : ""}</h3>
    ${
      visible.length
        ? visible
            .map(
              (event) => `
                <div class="runtime-event">
                  <strong>${escapeHtml(event.eventType ?? "event")}</strong>
                  <span>${escapeHtml(summarizeRuntimeEvent(event))}</span>
                </div>
              `
            )
            .join("")
        : '<p class="eyebrow">No graph events for this session yet.</p>'
    }
  `;
}

function rememberRuntimeEvent(event) {
  if (!event?.id || runtimeEvents.some((item) => item.id === event.id)) return;
  runtimeEvents = [event, ...runtimeEvents].slice(0, 20);
  renderRuntimeTimeline(runtimeEvents, "live");
}

async function loadRuntimeEventsForSession(sessionId = currentSessionId()) {
  if (!sessionId) {
    renderRuntimeTimeline([], "sign in first");
    return [];
  }
  const payload = await api(`/api/runtime/events?sessionId=${encodeURIComponent(sessionId)}&limit=20`, { timeoutMs: 30000 });
  runtimeEvents = payload.events ?? [];
  renderRuntimeTimeline(runtimeEvents, `${runtimeEvents.length} event${runtimeEvents.length === 1 ? "" : "s"}`);
  return runtimeEvents;
}

function startRuntimeEventStream(sessionId = currentSessionId(), userId = latestChatRun?.user?.id) {
  if (!sessionId || runtimeStreamSessionId === sessionId) return;
  if (runtimeEventSource) runtimeEventSource.close();
  runtimeStreamSessionId = sessionId;
  runtimeEvents = [];
  renderRuntimeTimeline([], "stream open");
  const params = new URLSearchParams({ sessionId });
  if (userId) params.set("userId", userId);
  runtimeEventSource = new EventSource(`/api/runtime/events/stream?${params.toString()}`);
  for (const type of [
    "runtime.stream.opened",
    "workflow.classified",
    "workflow.routed",
    "worker.plan.prepared",
    "approval.requested",
    "approval.recorded",
    "approval.consumed",
    "worker.status.updated",
    "worker.followup.scheduled",
    "worker.followup.cancelled",
    "worker.followup.continue_requested",
    "worker.followup.dispatching",
    "worker.followup.completed",
    "worker.followup.blocked",
    "worker.followup.expired",
    "evidence.status",
    "final.answer.created",
    "memory.retained"
  ]) {
    runtimeEventSource.addEventListener(type, (event) => {
      try {
        rememberRuntimeEvent(JSON.parse(event.data));
      } catch {
        renderRuntimeTimeline(runtimeEvents, "stream parse error");
      }
    });
  }
  runtimeEventSource.onerror = () => {
    renderRuntimeTimeline(runtimeEvents, "stream paused");
  };
}

function requireSignedInBeforeWorkflow() {
  if (productSignedIn && currentSessionId()) return true;
  renderJourneyState(null);
  addMessage(
    "assistant",
    "Please sign in to the local planned-user session first. Portal passwords, passkeys, SSN, and 2FA stay with you; the app only records the local session and then routes the workflow through LangGraph."
  );
  productAuth.focus();
  return false;
}

function renderChatProof(result) {
  const state = result.graphRun?.state ?? {};
  const proposalTask = state.openclaw_skill_proposal?.task ?? {};
  const workerPlan = state.openclaw_worker_plan ?? {};
  const evidence = state.evidence_observation ?? {};
  const llmDecision = state.llm_orchestration_decision ?? {};
  const productMemoryRecall = state.product_memory_recall ?? result.graphRun?.productMemory?.recall ?? {};
  const productMemoryRetain = state.product_memory_retain ?? result.graphRun?.productMemory?.retain ?? {};
  const missing = missingInfoLines(state);
  const sourcePointers = uniqueSourcePointers(state);
  const discovery = evidence.discoveryReport ?? {};
  const dynamicSkillContext = dynamicSkillContextFromState(state);
  const canRequestWorkerAction = proposalTask.id && !hasCapturedPortalEvidence(state);
  return renderOperatorProofDetails(
    "Workflow Proof",
    `
      <dl>
        <dt>Workflow</dt>
        <dd>${escapeHtml(state.workflow ?? "unknown")} · ${escapeHtml(state.route_reason ?? "unknown")}</dd>
        <dt>Intent</dt>
        <dd>${escapeHtml(state.structured_intent?.intent ?? state.intent ?? "unknown")} · confidence ${escapeHtml(state.structured_intent?.confidence ?? "n/a")}</dd>
        <dt>GPT decision</dt>
        <dd>${escapeHtml(llmDecision.mode ?? "not run")} · ${escapeHtml(llmDecision.usedByRouter ? "used by router" : "not used")} · ${escapeHtml(llmDecision.workflow ?? "no workflow")} · confidence ${escapeHtml(llmDecision.confidence ?? "n/a")}</dd>
        <dt>Missing info</dt>
        <dd>${escapeHtml(missing.join(" · ") || "none")}</dd>
        <dt>Dynamic skills</dt>
        <dd>${escapeHtml(dynamicSkillSelectedLine(dynamicSkillContext ?? {}))} · chance ${escapeHtml(dynamicSkillContext?.successEstimate?.overallChance ?? "n/a")}</dd>
        <dt>OpenClaw proposal</dt>
        <dd>${escapeHtml(proposalTask.status ?? "not prepared")} · ${escapeHtml(proposalTask.id ?? "no task")}</dd>
        <dt>Worker plan</dt>
        <dd>${escapeHtml(workerPlan.dispatchStatus ?? "not prepared")} · jobs ${escapeHtml(workerPlan.workerJobs?.length ?? 0)}</dd>
        <dt>Approval</dt>
        <dd>${escapeHtml(state.approval_resume?.status ?? "not consumed")}</dd>
        <dt>Evidence</dt>
        <dd>${escapeHtml(evidence.status ?? "not requested")} · actions ${escapeHtml((evidence.actionsTaken ?? []).join(", ") || "none")}</dd>
        <dt>Discovery</dt>
        <dd>${escapeHtml(discoverySummary(discovery))}</dd>
        <dt>Document candidates</dt>
        <dd>${escapeHtml((discovery.documentDiscovery?.candidates ?? []).length)} selectable/blocked item(s)</dd>
        <dt>Sources</dt>
        <dd>${escapeHtml(sourcePointers.map(sourcePointerLabel).join(" · ") || "none")}</dd>
        <dt>Product memory</dt>
        <dd>${escapeHtml(productMemoryRecall.adapter ?? "disabled")} recall ${escapeHtml(productMemoryRecall.facts?.length ?? 0)} · ${escapeHtml(memoryRetainSummary(productMemoryRetain))} · ${escapeHtml(memoryNextAction(productMemoryRetain))}</dd>
        <dt>Payload audits</dt>
        <dd>${escapeHtml(outboundPayloadAuditSummary(result))}</dd>
        <dt>Trace</dt>
        <dd>${escapeHtml(state.graph_trace_id ?? result.session?.langgraph_thread_id ?? "none")}</dd>
      </dl>
      ${
        canRequestWorkerAction
          ? `<div class="button-row">
              <button type="button" data-approve-readonly="${escapeHtml(proposalTask.id)}">Approve Read-Only Observation</button>
              <button type="button" data-worker-followup="${escapeHtml(proposalTask.id)}">Leave As Async Follow-Up</button>
            </div>`
          : ""
      }
      ${renderDynamicSkillProof(dynamicSkillContext)}
      ${renderDocumentCandidateProof(result)}
    `,
    { open: !hasCapturedPortalEvidence(state) }
  );
}

function renderMissingInfoPrompt(result) {
  const missing = missingInfoLines(result.graphRun?.state ?? {});
  if (!missing.length) return;
  addMessage(
    "assistant",
    `I can continue, but the workflow is still missing:\n\n${missing.map((item) => `- ${item}`).join("\n")}\n\nYou can answer here in chat, or approve read-only observation if the missing evidence should come from the portal.`
  );
}

function friendlyWorkerBlocker(evidence = {}) {
  const raw = [evidence.reason, ...(evidence.verification?.issues ?? [])].filter(Boolean).join(" ");
  if (!raw) return "No blocker reported.";
  if (/approval token|missing_approval_token|requires an approval/i.test(raw)) {
    return "Read-only observation needs your approval before a worker can look at portal evidence.";
  }
  if (/BRAINSTY_PORTAL_LIVE=1/i.test(raw)) {
    return "Live portal proof is off. Enable it only when the browser is already on an authenticated member portal page.";
  }
  if (/public Aetna marketing|not an approved authenticated member portal|public payer marketing/i.test(raw)) {
    return "The page looked public, not like an authenticated member portal, so no healthcare evidence was stored.";
  }
  if (/Start Chrome with remote debugging|remote debugging|Chrome DevTools/i.test(raw)) {
    return "I could not reach an authenticated browser session. Sign in yourself in the approved browser, then run the read-only approval again.";
  }
  if (/ocr|screenshot|visual/i.test(raw)) {
    return "The visual evidence check did not complete, so the worker stopped before creating healthcare evidence.";
  }
  return raw;
}

function structuredBenefitSummary(balances = []) {
  if (!balances.length) return "none yet";
  return balances
    .map(
      (item) =>
        `${item.label}: total ${money(item.total_amount)}, spent ${money(item.spent_amount)}, remaining ${money(item.remaining_amount)}`
    )
    .join(" · ");
}

function structuredClaimSummary(claims = [], priorAuthorizations = []) {
  const parts = [];
  if (claims.length) {
    const totalShare = claims.reduce((sum, item) => sum + (Number(item.share_amount) || 0), 0);
    parts.push(`${claims.length} claim${claims.length === 1 ? "" : "s"} · visible share ${money(totalShare)}`);
  }
  if (priorAuthorizations.length) {
    parts.push(`${priorAuthorizations.length} prior auth${priorAuthorizations.length === 1 ? "" : "s"}`);
  }
  return parts.join(" · ") || "none yet";
}

function evidenceChannelSummary(channels = []) {
  if (!channels.length) return "not reported";
  return channels
    .map((channel) => {
      const parts = [channel.channel, channel.status];
      if (channel.pageCount !== null && channel.pageCount !== undefined) parts.push(`${channel.pageCount} pages`);
      if (channel.confidence !== null && channel.confidence !== undefined) parts.push(`confidence ${channel.confidence}`);
      if (channel.wordCount !== null && channel.wordCount !== undefined) parts.push(`${channel.wordCount} words`);
      return parts.filter(Boolean).join(" · ");
    })
    .join(" | ");
}

function discoverySummary(report = {}) {
  if (!report?.version) return "not reported";
  const search = report.portalSearch?.available ? report.portalSearch.status : "no search affordance";
  const docs = report.documentDiscovery ?? {};
  const sections = report.portalSections?.tried?.length ? ` · sections ${report.portalSections.tried.join(", ")}` : "";
  return `search ${search} · documents ${docs.candidateCount ?? 0} · SBC/PDF ${docs.sbcPdfCandidateCount ?? 0}${sections}`;
}

function documentCandidatesFromResult(result = latestChatRun) {
  const report = result?.graphRun?.state?.evidence_observation?.discoveryReport ?? {};
  return report.documentDiscovery?.candidates ?? [];
}

function renderDocumentCandidateProof(result = latestChatRun) {
  const candidates = documentCandidatesFromResult(result);
  if (!candidates.length) return '<p class="eyebrow">No selectable document candidates in this run.</p>';
  return `
    <div class="candidate-grid">
      ${candidates
        .map((candidate) => {
          const id = candidate.candidateId ?? "";
          const blocked = !candidate.readOnlyOpenAllowed;
          return `
            <article class="candidate-card ${blocked ? "blocked" : ""}">
              <div>
                <strong>${escapeHtml(candidate.label ?? candidate.type ?? "Document candidate")}</strong>
                <span>${escapeHtml(blocked ? `blocked: ${candidate.blockedReason ?? "policy"}` : "read-only candidate")}</span>
              </div>
              <small>${escapeHtml(candidate.url ?? "no URL")}</small>
              <dl>
                <dt>Candidate</dt>
                <dd>${escapeHtml(id || "not assigned")}</dd>
                <dt>Type</dt>
                <dd>${escapeHtml(candidate.type ?? "document")}</dd>
                <dt>SBC/PDF</dt>
                <dd>${escapeHtml(candidate.sbcOrPdf ? "yes" : "no")}</dd>
              </dl>
              ${
                blocked
                  ? '<p class="danger-line">Blocked from approval in this MVP.</p>'
                  : `<div class="button-row">
                      <button type="button" data-document-candidate-propose="${escapeHtml(id)}">Prepare Candidate Approval</button>
                    </div>`
              }
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderWorkerContinuationCard(continuation) {
  const progress = continuation.lastProgressEvent?.payload ?? {};
  const isTerminal = ["cancelled", "completed", "blocked", "expired"].includes(continuation.status);
  const terminalNote =
    continuation.status === "cancelled"
      ? "Cancelled follow-up is closed. Actions taken remain none."
      : continuation.status === "completed"
        ? "Completed follow-up is closed. Source pointers and worker actions are shown in Worker Result."
        : "This follow-up is closed. Actions taken are shown in Worker Result.";
  return `
    <article class="chat-proof-card worker-continuation-card" data-continuation-card="${escapeHtml(continuation.id)}">
      <h3>Async Worker Follow-Up</h3>
      <dl>
        <dt>Status</dt>
        <dd>${escapeHtml(continuation.status)}</dd>
        <dt>Outcome</dt>
        <dd>${escapeHtml(continuation.terminalOutcome ?? "needs_long_running_followup")}</dd>
        <dt>Task</dt>
        <dd>${escapeHtml(continuation.taskId)}</dd>
        <dt>Workflow</dt>
        <dd>${escapeHtml(continuation.workflow ?? "unknown")}</dd>
        <dt>Approval scope</dt>
        <dd>${escapeHtml(continuation.approvalScope)} · ${escapeHtml(continuation.allowedAction)}</dd>
        <dt>Next check</dt>
        <dd>${escapeHtml(continuation.nextCheckAt ?? "not scheduled")}</dd>
        <dt>Last progress</dt>
        <dd>${escapeHtml(progress.status ?? continuation.lastProgressEvent?.eventType ?? "not reported")}</dd>
        <dt>Actions taken</dt>
        <dd>${escapeHtml((continuation.actionsTaken ?? []).join(", ") || "none")}</dd>
      </dl>
      ${
        isTerminal
          ? `<p class="continuation-note">${escapeHtml(terminalNote)}</p>`
          : `<div class="button-row">
              <button type="button" data-worker-followup-run="${escapeHtml(continuation.id)}" data-worker-followup-task="${escapeHtml(continuation.taskId)}">Approve + Run Official Read-Only</button>
              <button type="button" data-worker-followup-continue="${escapeHtml(continuation.id)}">Continue Status Check</button>
              <button type="button" data-worker-followup-cancel="${escapeHtml(continuation.id)}">Cancel Follow-Up</button>
            </div>`
      }
    </article>
  `;
}

function workerContinuationFromResult(result) {
  const state = result?.graphRun?.state ?? {};
  return state.evidence_observation?.workerContinuation ?? state.worker_continuation?.continuation ?? null;
}

function upsertWorkerContinuationCard(continuation) {
  if (!continuation?.id) return null;
  const existing = [...messages.querySelectorAll("[data-continuation-card]")].find(
    (node) => node.dataset.continuationCard === continuation.id
  );
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderWorkerContinuationCard(continuation).trim();
  const next = wrapper.firstElementChild;
  if (!next) return null;
  if (existing) {
    existing.replaceWith(next);
    messages.scrollTop = messages.scrollHeight;
    return next;
  }
  return addMessage("assistant", renderWorkerContinuationCard(continuation), { html: true });
}

function renderWorkerOutcomeCard(result) {
  const state = result.graphRun?.state ?? {};
  const evidence = state.evidence_observation ?? {};
  const sourcePointers = uniqueSourcePointers(state);
  const balances = result.trace?.coverageBalances ?? [];
  const reason = friendlyWorkerBlocker(evidence);
  const navigationTargets = evidence.navigationPlan?.targets ?? [];
  const discovery = evidence.discoveryReport ?? {};
  const terminalOutcome =
    sourcePointers.length > 0
      ? "completed_with_sourced_result"
      : evidence.status === "missing_approval_token"
        ? "not_possible_policy_or_approval_block"
        : evidence.status?.startsWith("blocked")
          ? "not_possible_insurance_or_portal_block"
          : evidence.status ?? "pending";
  return renderOperatorProofDetails(
    "Worker Result",
    `
      <dl>
        <dt>Outcome</dt>
        <dd>${escapeHtml(terminalOutcome)}</dd>
        <dt>Status</dt>
        <dd>${escapeHtml(evidence.status ?? "not requested")}</dd>
        <dt>Actions</dt>
        <dd>${escapeHtml((evidence.actionsTaken ?? []).join(", ") || "none")}</dd>
        <dt>Source pointers</dt>
        <dd>${escapeHtml(sourcePointers.map(sourcePointerLabel).join(" · ") || "none")}</dd>
        <dt>Structured benefits</dt>
        <dd>${escapeHtml(structuredBenefitSummary(balances))}</dd>
        <dt>Structured claims</dt>
        <dd>${escapeHtml(structuredClaimSummary(result.trace?.claims ?? [], result.trace?.priorAuthorizations ?? []))}</dd>
        <dt>Discovery</dt>
        <dd>${escapeHtml(discoverySummary(discovery))}</dd>
        <dt>Approved candidate</dt>
        <dd>${escapeHtml(evidence.approvedDocumentCandidate?.label ?? "none")}</dd>
        <dt>Pages</dt>
        <dd>${escapeHtml(`${evidence.verifiedPageCount ?? 0}/${evidence.pageCount ?? 0} verified${evidence.blockedPageCount ? ` · ${evidence.blockedPageCount} blocked` : ""}`)}</dd>
        <dt>Navigation plan</dt>
        <dd>${escapeHtml(navigationTargets.map((target) => `${target.goal}:${target.label}`).join(" · ") || "single page")}</dd>
        <dt>Evidence channels</dt>
        <dd>${escapeHtml(evidenceChannelSummary(evidence.evidenceChannels ?? []))}</dd>
        <dt>Blocker</dt>
        <dd>${escapeHtml(sourcePointers.length ? "none" : reason)}</dd>
      </dl>
      ${renderDocumentCandidateProof(result)}
    `,
    { open: sourcePointers.length === 0 }
  );
}

function setBusy(button, busyText = "Working...") {
  if (!button) return () => {};
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  return () => {
    button.disabled = false;
    button.textContent = originalText;
  };
}

function renderConnectorProof(payload) {
  if (!connectorProof) return;
  const goals = payload.goals ?? [];
  const checks = payload.checks ?? [];
  const scores = payload.scores ?? [];
  const visuals = payload.visualArtifacts ?? payload.visual_artifacts ?? [];
  const phase56Score = scores.find((score) => score.key === "phase56_p0_hardening") ?? null;
  const phase56Check = checks.find((check) => check.key === "phase56_p0_hardening") ?? null;
  const phase57Score = scores.find((score) => score.key === "phase57_extensible_skills_worker_breadth") ?? null;
  const phase57Check = checks.find((check) => check.key === "phase57_extensible_skills_worker_breadth") ?? null;
  const phase58Score = scores.find((score) => score.key === "phase58_trusted_answer_driving") ?? null;
  const phase58Check = checks.find((check) => check.key === "phase58_trusted_answer_driving") ?? null;
  const phase59Score = scores.find((score) => score.key === "phase59_pilot_readiness") ?? null;
  const phase59Check = checks.find((check) => check.key === "phase59_pilot_readiness") ?? null;
  const phase60Score = scores.find((score) => score.key === "phase60_memory_skill_tree") ?? null;
  const phase60Check = checks.find((check) => check.key === "phase60_memory_skill_tree") ?? null;
  const phase61Score = scores.find((score) => score.key === "phase61_generated_skill_pr_workflow") ?? null;
  const phase61Check = checks.find((check) => check.key === "phase61_generated_skill_pr_workflow") ?? null;
  const phase62Score = scores.find((score) => score.key === "phase62_generated_skill_review_queue") ?? null;
  const phase62Check = checks.find((check) => check.key === "phase62_generated_skill_review_queue") ?? null;
  const phase63Score = scores.find((score) => score.key === "phase63_generated_skill_pr_executor") ?? null;
  const phase63Check = checks.find((check) => check.key === "phase63_generated_skill_pr_executor") ?? null;
  const phase64Score = scores.find((score) => score.key === "phase64_mvp_completion_audit") ?? null;
  const phase64Check = checks.find((check) => check.key === "phase64_mvp_completion_audit") ?? null;
  const phase65Score = scores.find((score) => score.key === "phase65_final_mvp_goal_evaluation") ?? null;
  const phase65Check = checks.find((check) => check.key === "phase65_final_mvp_goal_evaluation") ?? null;
  const phase66Score = scores.find((score) => score.key === "phase66_production_contract") ?? null;
  const phase66Check = checks.find((check) => check.key === "phase66_production_contract") ?? null;
  const phase67Score = scores.find((score) => score.key === "phase67_graphiti_zep_schema_memory") ?? null;
  const phase67Check = checks.find((check) => check.key === "phase67_graphiti_zep_schema_memory") ?? null;
  const phase68Score = scores.find((score) => score.key === "phase68_postgres_production_default") ?? null;
  const phase68Check = checks.find((check) => check.key === "phase68_postgres_production_default") ?? null;
  const phase69Score = scores.find((score) => score.key === "phase69_bill_verification_mvp_flow") ?? null;
  const phase69Check = checks.find((check) => check.key === "phase69_bill_verification_mvp_flow") ?? null;
  const phase70Score = scores.find((score) => score.key === "phase70_authenticated_openclaw_bill_flow") ?? null;
  const phase70Check = checks.find((check) => check.key === "phase70_authenticated_openclaw_bill_flow") ?? null;
  const phase71Score = scores.find((score) => score.key === "phase71_bill_memory_skill_loop") ?? null;
  const phase71Check = checks.find((check) => check.key === "phase71_bill_memory_skill_loop") ?? null;
  const phase72Score = scores.find((score) => score.key === "phase72_bill_sourced_answer") ?? null;
  const phase72Check = checks.find((check) => check.key === "phase72_bill_sourced_answer") ?? null;
  const phase73Score = scores.find((score) => score.key === "phase73_first_testable_mvp_readiness") ?? null;
  const phase73Check = checks.find((check) => check.key === "phase73_first_testable_mvp_readiness") ?? null;
  connectorProofStatus.textContent = `${payload.status ?? "unknown"} · ${payload.cycle ?? "connector"}`;
  connectorProof.innerHTML = `
    <article class="connector-card wide">
      <h3>Cycle State</h3>
      <dl>
        <dt>Run</dt>
        <dd>${escapeHtml(payload.runId ?? payload.run_id ?? "server-connector-next-mobile-mvp")}</dd>
        <dt>Public API</dt>
        <dd>${escapeHtml(payload.safety?.publicApi ?? "/api/v1")} · frontend direct Node calls ${escapeHtml(payload.safety?.frontendDirectNodeCallsAllowedForPwa ? "allowed" : "blocked")}</dd>
        <dt>Browser boundary</dt>
        <dd>${escapeHtml(payload.safety?.rawOcrTextReturned ? "attention: raw OCR returned" : "raw OCR hidden")} · external writes ${escapeHtml(payload.safety?.externalWriteActionsWithoutApproval ? "attention" : "approval-gated")}</dd>
      </dl>
    </article>
    ${phase56Score ? `
      <article class="connector-card wide">
        <h3>Phase 56 P0 Hardening</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase56Score.score)} / ${escapeHtml(phase56Score.target)} · ${escapeHtml(phase56Score.status)}</dd>
          <dt>Checkpointer</dt>
          <dd>${escapeHtml(phase56Check?.graphCheckpointer?.encryptedAtRestConfigured ? "encrypted-at-rest configured" : "verify encrypted file mode")}</dd>
          <dt>Retention</dt>
          <dd>${escapeHtml(phase56Check?.retentionSweeper?.lastTick?.status ?? phase56Check?.retentionSweeper?.status ?? phase56Score.retentionSweeperStatus ?? "not ticked")}</dd>
          <dt>Egress</dt>
          <dd>${escapeHtml(phase56Check?.egress?.defaultEnforcementMode ?? "enforced")} by default</dd>
          <dt>Database</dt>
          <dd>${escapeHtml(phase56Check?.database?.sqliteAdapter ?? "node:sqlite")} · shell-out sqlite3 ${escapeHtml(phase56Check?.database?.shellOutSqlite3 ? "present" : "absent")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase57Score ? `
      <article class="connector-card wide">
        <h3>Phase 57 Extensible Skills</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase57Score.score)} / ${escapeHtml(phase57Score.target)} · ${escapeHtml(phase57Score.status)}</dd>
          <dt>Skills</dt>
          <dd>${escapeHtml(phase57Check?.registry?.skillCount ?? phase57Score.skillCount ?? 0)} loaded · ${escapeHtml((phase57Check?.registry?.requiredSkillKeys ?? []).join(", "))}</dd>
          <dt>Selection</dt>
          <dd>${escapeHtml(phase57Check?.dynamicSelection?.selected?.executionSkillKey ?? phase57Score.selectedExecutionSkillKey ?? "not selected")} · fallback literal ${escapeHtml(phase57Check?.dynamicSelection?.fallbackLiteralUsed ? "used" : "not used")}</dd>
          <dt>Envelope</dt>
          <dd>${escapeHtml(phase57Check?.proposal?.openClawMayChooseJourney ? "attention: workflow choice widened" : "LangGraph owns workflow")} · writes ${escapeHtml(phase57Check?.proposal?.openClawMayExecuteWriteActions ? "enabled" : "blocked")}</dd>
          <dt>Worker Memory</dt>
          <dd>${escapeHtml(phase57Check?.workerMemory?.status ?? phase57Score.workerMemoryStatus ?? "contract")} · answer-driving ${escapeHtml(phase57Check?.workerMemory?.safety?.answerDriving ? "enabled" : "disabled")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase58Score ? `
      <article class="connector-card wide">
        <h3>Phase 58 Trusted Answer Driving</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase58Score.score)} / ${escapeHtml(phase58Score.target)} · ${escapeHtml(phase58Score.status)}</dd>
          <dt>Promotion</dt>
          <dd>${escapeHtml(phase58Check?.promotionGate?.status ?? "not evaluated")} · production-driving ${escapeHtml(phase58Check?.promotionGate?.productionDrivingAllowed ? "trusted path only" : "blocked")}</dd>
          <dt>Citation Rails</dt>
          <dd>${escapeHtml(phase58Check?.drivenAnswer?.validation?.valid ? "validated cited answer" : "not validated")} · unsupported items ${escapeHtml(phase58Check?.drivenAnswer?.unsupportedItemsLabeled ? "labeled" : "attention")}</dd>
          <dt>Demotion</dt>
          <dd>kill switch ${escapeHtml(phase58Check?.checks?.killSwitchDemotes ? "demotes" : "attention")} · safety incident ${escapeHtml(phase58Check?.checks?.safetyIncidentDemotes ? "demotes" : "attention")}</dd>
          <dt>Memory Namespaces</dt>
          <dd>${escapeHtml(phase58Check?.namespaces?.proceduralSkills ?? "procedural:skills")} · episodic member scoped</dd>
        </dl>
      </article>
    ` : ""}
    ${phase59Score ? `
      <article class="connector-card wide">
        <h3>Phase 59 Pilot Readiness</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase59Score.score)} / ${escapeHtml(phase59Score.target)} · ${escapeHtml(phase59Score.status)}</dd>
          <dt>Proof Command</dt>
          <dd>${escapeHtml(phase59Check?.liveProbeCommand ?? phase59Score.liveProbeCommand ?? "npm run phase59:pilot-readiness")}</dd>
          <dt>API Inventory</dt>
          <dd>FastAPI ${escapeHtml(phase59Check?.endpointInventory?.fastApiRouteCount ?? 0)} routes · /api/v1 ${escapeHtml(phase59Check?.endpointInventory?.fastApiV1RouteCount ?? 0)} · Node ${escapeHtml(phase59Check?.endpointInventory?.nodeRouteCount ?? 0)}</dd>
          <dt>LLM Default</dt>
          <dd>${escapeHtml(phase59Check?.checks?.pwaRequestsLiveReasoning ? "PWA requests live reasoning" : "attention: PWA deterministic default")} · OpenAI ${escapeHtml(phase59Check?.externalReadiness?.openAiConfigured ? "configured" : "not configured")}</dd>
          <dt>Memory / AWS</dt>
          <dd>${escapeHtml(phase59Check?.externalReadiness?.productMemoryStatus ?? "unknown")} · AWS checked by sanitized smoke artifact</dd>
        </dl>
      </article>
    ` : ""}
    ${phase66Score ? `
      <article class="connector-card wide">
        <h3>Phase 66 Production Contract</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase66Score.score)} / ${escapeHtml(phase66Score.target)} · ${escapeHtml(phase66Score.status)}</dd>
          <dt>First workflow</dt>
          <dd>${escapeHtml(phase66Check?.decisions?.productionTarget?.firstWorkflow ?? phase66Score.firstWorkflow ?? "bill_verification_flow")} · user ${escapeHtml(phase66Check?.decisions?.productionTarget?.firstUser ?? phase66Score.firstUser ?? "patient_member")}</dd>
          <dt>Postgres</dt>
          <dd>${escapeHtml(phase66Check?.decisions?.postgres?.productionDefault ? "production default" : "not default")} · retention ${escapeHtml(phase66Check?.decisions?.postgres?.retentionYears ?? phase66Score.retentionYears ?? 5)} years · encrypted restore drill required</dd>
          <dt>Memory</dt>
          <dd>${escapeHtml(phase66Check?.decisions?.graphitiZep?.schemaFirst ? "Graphiti/Zep schema-first" : "attention")} · successful case creates memory episode</dd>
          <dt>Browser/Auth</dt>
          <dd>${escapeHtml(phase66Check?.decisions?.remoteBrowser?.firstDeployment ?? "self_hosted_steel_on_aws_ec2")} · credentials human-only</dd>
          <dt>Next</dt>
          <dd>${escapeHtml(phase66Check?.gates?.nextPhase ?? phase66Score.nextPhase ?? "phase67_graphiti_zep_schema_ready_memory_layer")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase67Score ? `
      <article class="connector-card wide">
        <h3>Phase 67 Graphiti/Zep Schema Memory</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase67Score.score)} / ${escapeHtml(phase67Score.target)} · ${escapeHtml(phase67Score.status)}</dd>
          <dt>Schema</dt>
          <dd>entities ${escapeHtml(phase67Check?.checks?.entitiesPresent ? "ready" : "missing")} · edges ${escapeHtml(phase67Check?.checks?.edgesPresent ? "ready" : "missing")} · groups ${escapeHtml(phase67Check?.checks?.groupIdsPresent ? "ready" : "missing")}</dd>
          <dt>Temporal/Privacy</dt>
          <dd>${escapeHtml(phase67Check?.checks?.temporalHelpersPresent ? "temporal helpers" : "missing temporal")} · ${escapeHtml(phase67Check?.checks?.privacyFilterPresent ? "privacy filter" : "missing privacy")} · PHI pointer/hash only</dd>
          <dt>Retrieval</dt>
          <dd>${escapeHtml(phase67Check?.checks?.retrievalPrimitivesPresent ? "view-model primitives ready" : "missing retrieval")} · raw Graphiti nodes hidden</dd>
          <dt>Seeds</dt>
          <dd>${escapeHtml(phase67Check?.seedCount ?? phase67Score.seedCount ?? 0)} Ralph loop templates</dd>
          <dt>Gate</dt>
          <dd>${escapeHtml(phase67Check?.contract?.testCommand ?? phase67Score.testCommand ?? "npm run test:memory:schema")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase68Score ? `
      <article class="connector-card wide">
        <h3>Phase 68 Postgres Production Default</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase68Score.score)} / ${escapeHtml(phase68Score.target)} · ${escapeHtml(phase68Score.status)}</dd>
          <dt>Runtime</dt>
          <dd>production ${escapeHtml(phase68Check?.readiness?.runtimeDriver ?? phase68Score.runtimeDriver ?? "postgres")} · local dev fallback SQLite</dd>
          <dt>State scope</dt>
          <dd>${escapeHtml((phase68Check?.runtimeStateScope ?? []).join(", ") || "sessions, tasks, audit, evidence, uploads, skill queue, browser state")}</dd>
          <dt>Retention</dt>
          <dd>${escapeHtml(phase68Check?.retention?.years ?? phase68Score.retentionYears ?? 5)} years · applies to audit/source pointers/docs/browser refs/memory facts</dd>
          <dt>Backup</dt>
          <dd>${escapeHtml(phase68Check?.backupRestore?.required ?? phase68Score.backupRestore ?? "encrypted_cloud_backup_restore_drill")} · local Docker is dev-only</dd>
          <dt>Safety</dt>
          <dd>secret profile ${escapeHtml(phase68Check?.checks?.secretProfileRequired ? "required" : "attention")} · shell-out sqlite3 ${escapeHtml(phase68Check?.checks?.sqliteShellOutAbsent ? "absent" : "attention")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase69Score ? `
      <article class="connector-card wide">
        <h3>Phase 69 Bill Verification MVP</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase69Score.score)} / ${escapeHtml(phase69Score.target)} · ${escapeHtml(phase69Score.status)}</dd>
          <dt>Endpoint</dt>
          <dd>${escapeHtml(phase69Check?.endpoint ?? phase69Score.endpoint ?? "/api/bill-verification/analyze")} · surface ${escapeHtml(phase69Check?.pwaSurface ?? "/mvp")}</dd>
          <dt>Evidence</dt>
          <dd>source pointer only · raw text ${escapeHtml(phase69Check?.sample?.sourcePointer?.rawTextReturned ? "attention" : "hidden")} · missing evidence checklist ${escapeHtml(phase69Check?.checks?.missingEvidenceChecklistReady ? "ready" : "attention")}</dd>
          <dt>Parallel agents</dt>
          <dd>${escapeHtml((phase69Check?.sample?.parallelAgents ?? []).map((agent) => `${agent.key}:${agent.status}`).join(" · ") || "planned")}</dd>
          <dt>No-login fallback</dt>
          <dd>${escapeHtml(phase69Check?.sample?.noLoginFallback?.available ? "available" : "attention")} · payer contact ${escapeHtml(phase69Check?.sample?.safety?.payerContacted ? "attention" : "none")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase70Score ? `
      <article class="connector-card wide">
        <h3>Phase 70 Authenticated OpenClaw Bill Proof</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase70Score.score)} / ${escapeHtml(phase70Score.target)} · ${escapeHtml(phase70Score.status)}</dd>
          <dt>Live readiness</dt>
          <dd>${escapeHtml(phase70Check?.liveReadiness?.status ?? phase70Score.liveReadinessStatus ?? "unknown")} · ready ${escapeHtml(phase70Check?.liveReadiness?.readyForReadOnlyObservation ?? phase70Score.readyForReadOnlyObservation ? "yes" : "no")}</dd>
          <dt>Approval</dt>
          <dd>${escapeHtml(phase70Check?.approvalBoundary?.approvalScope ?? "read_only_observation")} · actions ${escapeHtml((phase70Check?.approvalBoundary?.allowedActions ?? []).join(", ") || "read-only only")}</dd>
          <dt>Human-only</dt>
          <dd>${escapeHtml((phase70Check?.approvalBoundary?.humanOnly ?? []).join(", ") || "credentials, 2FA, captcha, submissions, uploads")}</dd>
          <dt>Bill flow</dt>
          <dd>${escapeHtml(phase70Check?.billVerificationIntegration?.endpoint ?? "/api/bill-verification/analyze")} · no-login fallback preserved</dd>
        </dl>
      </article>
    ` : ""}
    ${phase71Score ? `
      <article class="connector-card wide">
        <h3>Phase 71 Bill Memory Skill Loop</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase71Score.score)} / ${escapeHtml(phase71Score.target)} · ${escapeHtml(phase71Score.status)}</dd>
          <dt>Memory episode</dt>
          <dd>${escapeHtml(phase71Check?.episode?.caseId ?? phase71Score.sourceCaseId ?? "case:bill")} · refs only ${escapeHtml(phase71Check?.checks?.episodeStoresRefsOnly ? "yes" : "attention")}</dd>
          <dt>Loop</dt>
          <dd>${escapeHtml((phase71Check?.episode?.loopIterations ?? []).map((iteration) => `${iteration.stage}:${iteration.outcome}`).join(" · ") || "extract_bill_facts · plan_next_evidence")}</dd>
          <dt>Skill candidate</dt>
          <dd>${escapeHtml(phase71Check?.candidate?.proposedSkillKey ?? "bill_verification_flow")} · ${escapeHtml(phase71Check?.candidate?.status ?? phase71Score.candidateStatus ?? "operator_review_required")}</dd>
          <dt>Activation</dt>
          <dd>staging operator ${escapeHtml(phase71Check?.candidate?.activation?.stagingOperatorActivationAllowed ? "allowed" : "attention")} · production PR ${escapeHtml(phase71Check?.candidate?.activation?.productionActivationRequiresPrMerge ? "required" : "attention")} · auto driving ${escapeHtml(phase71Check?.candidate?.activation?.autoProductionDrivingAllowed ? "attention" : "blocked")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase72Score ? `
      <article class="connector-card wide">
        <h3>Phase 72 Bill Sourced Answer</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase72Score.score)} / ${escapeHtml(phase72Score.target)} · ${escapeHtml(phase72Score.status)}</dd>
          <dt>Endpoint</dt>
          <dd>${escapeHtml(phase72Check?.endpoint ?? phase72Score.endpoint ?? "/api/bill-verification/final-answer")} · surface ${escapeHtml(phase72Check?.pwaSurface ?? "/mvp")}</dd>
          <dt>Composer</dt>
          <dd>valid composed text used in contract ${escapeHtml(phase72Check?.checks?.validModelComposedTextUsed ?? phase72Score.usedModelComposedTextInProof ? "yes" : "attention")} · fallback ${escapeHtml(phase72Check?.fallbackMode ?? phase72Score.fallbackMode ?? "deterministic_fallback")}</dd>
          <dt>Validator</dt>
          <dd>allowed source IDs ${escapeHtml(phase72Check?.checks?.allowedSourceIdsRequired ? "required" : "attention")} · unknown source ${escapeHtml(phase72Check?.checks?.unknownSourceRejected ? "rejected" : "attention")} · external action claim ${escapeHtml(phase72Check?.checks?.unsupportedExternalActionRejected ? "rejected" : "attention")}</dd>
          <dt>Source pointers</dt>
          <dd>${escapeHtml((phase72Check?.sourcePointerIds ?? []).join(", ") || "none")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase73Score ? `
      <article class="connector-card wide">
        <h3>Phase 73 First Testable MVP Readiness</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase73Score.score)} / ${escapeHtml(phase73Score.target)} · ${escapeHtml(phase73Score.status)}</dd>
          <dt>Decision</dt>
          <dd>first testable MVP ${escapeHtml(phase73Check?.decision?.firstTestableMvpReady ?? phase73Score.firstTestableMvpReady ? "ready" : "attention")} · production ${escapeHtml(phase73Check?.decision?.productionReady ?? phase73Score.productionReady ? "ready" : "blocked")}</dd>
          <dt>User entry</dt>
          <dd>${escapeHtml(phase73Check?.decision?.regularUserEntry ?? "/mvp")} · workflow ${escapeHtml(phase73Check?.decision?.firstWorkflow ?? "bill_verification_flow")}</dd>
          <dt>Proof endpoints</dt>
          <dd>${escapeHtml((phase73Check?.proofEndpoints ?? []).join(", ") || "/api/mvp/readiness")}</dd>
          <dt>Production blockers</dt>
          <dd>${escapeHtml((phase73Check?.productionBlockers ?? []).join(" · ") || "none")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase60Score ? `
      <article class="connector-card wide">
        <h3>Phase 60 Memory Skill Tree</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase60Score.score)} / ${escapeHtml(phase60Score.target)} · ${escapeHtml(phase60Score.status)}</dd>
          <dt>Authority</dt>
          <dd>${escapeHtml(phase60Check?.checks?.dbAuthoritative ? "DB authoritative" : "attention")} · Graphiti ${escapeHtml(phase60Check?.checks?.graphitiAdvisory ? "advisory" : "attention")}</dd>
          <dt>Selector</dt>
          <dd>${escapeHtml(phase60Check?.selectedProcedureMemory?.nonStandardDemand ? "non-standard demand route" : "standard route")} · ${escapeHtml(phase60Check?.selectedProcedureMemory?.selectedSkillKey ?? "memory-assisted route")}</dd>
          <dt>Loop</dt>
          <dd>${escapeHtml(phase60Check?.skillTree?.loop?.loopStyle ?? "ralph_rigg_sequential_goal_loop")} · ${escapeHtml(phase60Check?.skillTree?.loop?.steps?.length ?? 0)} gates</dd>
          <dt>Consolidation</dt>
          <dd>${escapeHtml(phase60Check?.consolidationCandidate?.status ?? "not evaluated")} · worktree write ${escapeHtml(phase60Check?.consolidationCandidate?.worktreeWriteAllowed ? "allowed" : "review-gated")}</dd>
          <dt>Safety</dt>
          <dd>production-driving ${escapeHtml(phase60Check?.safety?.productionDrivingAllowed ? "enabled" : "blocked")} · raw PHI ${escapeHtml(phase60Check?.safety?.noRawPhiReturned ? "hidden" : "attention")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase61Score ? `
      <article class="connector-card wide">
        <h3>Phase 61 Generated Skill PR</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase61Score.score)} / ${escapeHtml(phase61Score.target)} · ${escapeHtml(phase61Score.status)}</dd>
          <dt>Gate</dt>
          <dd>${escapeHtml(phase61Check?.gate?.status ?? "not evaluated")} · reviewers ${escapeHtml(phase61Check?.gate?.reviewCounts?.humanApprovals ?? 0)}/${escapeHtml(phase61Check?.gate?.requirements?.humanApprovals ?? 2)}</dd>
          <dt>Package</dt>
          <dd>${escapeHtml(phase61Check?.artifactPackage?.skillKey ?? "no package")} · files ${escapeHtml(phase61Check?.artifactPackage?.fileCount ?? 0)} · artifact ${escapeHtml(phase61Check?.artifactPackage?.validation?.valid ? "valid" : "attention")}</dd>
          <dt>PR</dt>
          <dd>${escapeHtml(phase61Check?.pullRequest?.branchName ?? "not prepared")} · auto-merge ${escapeHtml(phase61Check?.pullRequest?.autoMergeAllowed ? "allowed" : "blocked")}</dd>
          <dt>Side Effects</dt>
          <dd>files written ${escapeHtml(phase61Check?.sideEffects?.filesWritten ? "yes" : "no")} · worktree write ${escapeHtml(phase61Check?.sideEffects?.worktreeWriteAllowed ? "reviewer-approved" : "blocked")}</dd>
          <dt>Safety</dt>
          <dd>production-driving ${escapeHtml(phase61Check?.safety?.productionDrivingAllowed ? "enabled" : "blocked")} · raw PHI ${escapeHtml(phase61Check?.safety?.rawPhiStored ? "attention" : "hidden")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase62Score ? `
      <article class="connector-card wide">
        <h3>Phase 62 Generated Skill Queue</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase62Score.score)} / ${escapeHtml(phase62Score.target)} · ${escapeHtml(phase62Score.status)}</dd>
          <dt>Queue</dt>
          <dd>${escapeHtml(phase62Check?.queue?.count ?? 0)} package(s) · ${escapeHtml(phase62Check?.queue?.latestStatus ?? "none")} · ${escapeHtml(phase62Check?.queue?.skillKey ?? "no skill")}</dd>
          <dt>Executor</dt>
          <dd>${escapeHtml(phase62Check?.executor?.status ?? "not prepared")} · commands ${escapeHtml(phase62Check?.executor?.commandsPrepared ? "prepared" : "blocked")}</dd>
          <dt>Branch</dt>
          <dd>${escapeHtml(phase62Check?.queue?.prBranchName ?? "not queued")}</dd>
          <dt>Safety</dt>
          <dd>auto-run ${escapeHtml(phase62Check?.executor?.safety?.autoRunCommands ? "enabled" : "blocked")} · auto-merge ${escapeHtml(phase62Check?.executor?.safety?.autoMergeAllowed ? "enabled" : "blocked")} · production-driving ${escapeHtml(phase62Check?.safety?.productionDrivingAllowed ? "enabled" : "blocked")}</dd>
          <dt>Storage</dt>
          <dd>raw PHI ${escapeHtml(phase62Check?.safety?.rawPhiStored ? "attention" : "hidden")} · DB authoritative ${escapeHtml(phase62Check?.safety?.dbAuthoritative ? "yes" : "attention")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase63Score ? `
      <article class="connector-card wide">
        <h3>Phase 63 Generated Skill Executor</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase63Score.score)} / ${escapeHtml(phase63Score.target)} · ${escapeHtml(phase63Score.status)}</dd>
          <dt>Queue</dt>
          <dd>${escapeHtml(phase63Check?.queue?.status ?? "not approved")} · ${escapeHtml(phase63Check?.queue?.skillKey ?? "no skill")}</dd>
          <dt>Executor</dt>
          <dd>${escapeHtml(phase63Check?.executor?.status ?? "blocked")} · dry-run ${escapeHtml(phase63Check?.executor?.dryRun ? "recorded" : "attention")}</dd>
          <dt>Branch</dt>
          <dd>${escapeHtml(phase63Check?.executor?.branchName ?? "not prepared")}</dd>
          <dt>Files</dt>
          <dd>${escapeHtml((phase63Check?.executor?.files ?? []).length)} reviewed file(s) · writes ${escapeHtml(phase63Check?.run?.filesWritten ? "performed" : "not performed")}</dd>
          <dt>PR</dt>
          <dd>opened ${escapeHtml(phase63Check?.run?.pullRequestOpened ? "yes" : "no")} · auto-merge ${escapeHtml(phase63Check?.safety?.autoMergeAllowed ? "enabled" : "blocked")}</dd>
          <dt>Safety</dt>
          <dd>operator approval ${escapeHtml(phase63Check?.checks?.operatorApprovalRecorded ? "recorded" : "missing")} · production-driving ${escapeHtml(phase63Check?.safety?.productionDrivingAllowed ? "enabled" : "blocked")}</dd>
        </dl>
      </article>
    ` : ""}
    ${phase64Score ? `
      <article class="connector-card wide">
        <h3>Phase 64 MVP Completion Audit</h3>
        <dl>
          <dt>MVP Score</dt>
          <dd>${escapeHtml(phase64Score.score)} / ${escapeHtml(phase64Score.target)} · ${escapeHtml(phase64Score.status)}</dd>
          <dt>Production Score</dt>
          <dd>${escapeHtml(phase64Score.productionScore)} / ${escapeHtml(phase64Score.productionTarget)} · blockers ${escapeHtml(phase64Score.blockerCount ?? phase64Check?.blockers?.length ?? 0)}</dd>
          <dt>User MVP</dt>
          <dd>${escapeHtml(phase64Check?.userMvp?.readyForRegularUserPilot ? "pilot-ready" : "attention")} · ${escapeHtml(phase64Check?.userMvp?.finalAnswerPosture ?? "unknown")}</dd>
          <dt>Connector</dt>
          <dd>FastAPI ${escapeHtml(phase64Check?.userMvp?.connector?.fastApiRouteCount ?? 0)} routes · /api/v1 ${escapeHtml(phase64Check?.userMvp?.connector?.fastApiV1RouteCount ?? 0)}</dd>
          <dt>Memory</dt>
          <dd>${escapeHtml(phase64Check?.memoryPosture?.adapter ?? "unknown")} · ${escapeHtml(phase64Check?.memoryPosture?.status ?? "unknown")} · advisory ${escapeHtml(phase64Check?.memoryPosture?.advisoryOnly ? "yes" : "attention")}</dd>
          <dt>Recommendation</dt>
          <dd>${escapeHtml(phase64Check?.recommendation ?? "not evaluated")}</dd>
        </dl>
        ${(phase64Check?.blockers ?? []).length ? `<ul>${phase64Check.blockers.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join("")}</ul>` : ""}
      </article>
    ` : ""}
    ${phase65Score ? `
      <article class="connector-card wide">
        <h3>Phase 65 Final MVP Goal Evaluation</h3>
        <dl>
          <dt>Score</dt>
          <dd>${escapeHtml(phase65Score.score)} / ${escapeHtml(phase65Score.target)} · ${escapeHtml(phase65Score.status)}</dd>
          <dt>Decision</dt>
          <dd>local/pilot MVP ${escapeHtml(phase65Check?.decision?.localPilotMvp ?? "unknown")} · production launch ${escapeHtml(phase65Check?.decision?.productionLaunch ?? "unknown")}</dd>
          <dt>Final Answer</dt>
          <dd>${escapeHtml(phase65Check?.finalAnswer ?? "not evaluated")}</dd>
          <dt>Next</dt>
          <dd>${escapeHtml(phase65Check?.nextRecommendedPhase ?? "unknown")}</dd>
          <dt>Production Blockers</dt>
          <dd>${escapeHtml((phase65Check?.decision?.productionLaunchBlockedBy ?? []).length)} blocker(s)</dd>
        </dl>
        ${(phase65Check?.decision?.productionLaunchBlockedBy ?? []).length ? `<ul>${phase65Check.decision.productionLaunchBlockedBy.map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join("")}</ul>` : ""}
      </article>
    ` : ""}
    <article class="connector-card">
      <h3>Goals</h3>
      <ol>
        ${goals.map((goal) => `<li><b>${escapeHtml(goal.key)}</b><span>${escapeHtml(goal.status)} · ${escapeHtml(goal.target)}</span></li>`).join("")}
      </ol>
    </article>
    <article class="connector-card">
      <h3>Checks</h3>
      <ol>
        ${checks.map((check) => `<li><b>${escapeHtml(check.key)}</b><span>${escapeHtml(check.status ?? (check.ok ? "ok" : "attention"))}</span></li>`).join("")}
      </ol>
    </article>
    <article class="connector-card">
      <h3>Scores</h3>
      <ol>
        ${scores.map((score) => `<li><b>${escapeHtml(score.key)}</b><span>${escapeHtml(score.score)} / ${escapeHtml(score.target)} · ${escapeHtml(score.status ?? "")}</span></li>`).join("")}
      </ol>
    </article>
    <article class="connector-card wide">
      <h3>Visual Gates</h3>
      <ol>
        ${visuals.map((artifact) => `<li><b>${escapeHtml(artifact.route)}</b><span>${escapeHtml(artifact.status ?? (artifact.required ? "required" : "optional"))} · ${escapeHtml(artifact.proof)}</span></li>`).join("")}
      </ol>
    </article>
  `;
}

function renderConnectorProofError(error) {
  if (connectorProofStatus) connectorProofStatus.textContent = error.message;
  if (!connectorProof) return;
  connectorProof.innerHTML = `
    <article class="connector-card wide">
      <h3>Proof Load Failed</h3>
      <p>${escapeHtml(error.message)}</p>
    </article>
  `;
}

function latestPemsDraftAvailable(payload = latestPemsWorkbench) {
  return Boolean(payload?.latestDraft?.id && payload?.latestCandidate?.candidateId);
}

function pemsClaimRevisionResolved(payload = latestPemsWorkbench) {
  const revisionProof = payload?.reviewerClaimRevisions;
  return Boolean(revisionProof?.latestClaimRevision?.id && revisionProof?.deterministicReclosurePassed);
}

function pemsClaimClosureVetoed(payload = latestPemsWorkbench) {
  const closure = payload?.liveClaimCitationClosure ?? payload?.latestClaimCitationClosure ?? payload?.latestDraft?.claimCitationClosure;
  const vetoed = Boolean(closure?.reviewerEditRequired || (closure?.unsupportedCount ?? 0) > 0 || (closure?.lowConfidenceCount ?? 0) > 0);
  return vetoed && !pemsClaimRevisionResolved(payload);
}

function firstEditablePemsClaim(payload = latestPemsWorkbench) {
  const closure = payload?.liveClaimCitationClosure ?? payload?.latestClaimCitationClosure ?? payload?.latestDraft?.claimCitationClosure;
  const claims = closure?.claims ?? [];
  return claims.find((claim) => claim.requiresReviewerEdit) ?? claims.find((claim) => claim.status !== "supported") ?? claims[0] ?? null;
}

function setPemsReviewActionsEnabled(enabled, payload = latestPemsWorkbench) {
  const vetoed = pemsClaimClosureVetoed(payload);
  for (const button of pemsReviewActionButtons) {
    button.disabled = !enabled || (vetoed && button.dataset.pemsReviewAction === "approved");
  }
  if (recordPemsClaimRevisionButton) {
    recordPemsClaimRevisionButton.disabled = !enabled || !firstEditablePemsClaim(payload);
  }
  if (recordPemsFollowUpButton) {
    recordPemsFollowUpButton.disabled = !enabled || !payload?.reviewerClaimRevisions?.latestClaimRevision?.id || !payload?.reviewerFollowUps?.latestPromotionReview?.id;
  }
  if (recordPemsHistoryExportButton) {
    recordPemsHistoryExportButton.disabled = !enabled || !payload?.reviewerFollowUps?.latestReviewerFollowUp?.id;
  }
}

function pemsDecisionLabel(decision) {
  if (decision === "approved") return { reviewType: "human_review", decision: "approved", label: "approved" };
  if (decision === "rejected") return { reviewType: "human_review", decision: "rejected", label: "rejected" };
  return { reviewType: "safety_review", decision: "blocked", label: "blocked" };
}

function renderPemsComparisonRows(rows = []) {
  if (!rows.length) {
    return `<p>No deterministic/advisory comparison rows are available yet.</p>`;
  }
  return `
    <div class="pems-comparison-table" role="table" aria-label="Deterministic and advisory comparison">
      <div class="pems-comparison-head" role="row">
        <span>Check</span>
        <span>Deterministic</span>
        <span>Advisory</span>
        <span>Agreement</span>
      </div>
      ${rows
        .map(
          (row) => `
            <div class="pems-comparison-row" role="row">
              <span>${escapeHtml(row.label ?? row.key ?? "comparison")}</span>
              <span>${escapeHtml(row.deterministicValue ?? "n/a")}</span>
              <span>${escapeHtml(row.advisoryValue ?? "n/a")}</span>
              <span>${escapeHtml(row.agreement ? "aligned" : "review")}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderEvidenceChips(chips = []) {
  if (!chips.length) return `<p class="status-text">No source-pointer chips attached to this advisory draft.</p>`;
  return `<div class="pems-evidence-chips">${chips.map((chip) => `<span>${escapeHtml(chip.id)}</span>`).join("")}</div>`;
}

function renderPemsClaimCitationClosure(closure = {}) {
  const claims = closure.claims ?? [];
  if (!claims.length) return `<p class="status-text">No advisory claims are available for citation closure yet.</p>`;
  return `
    <div class="pems-claim-closure-table" role="table" aria-label="PEMS claim citation closure">
      <div class="pems-claim-closure-head" role="row">
        <span>Claim</span>
        <span>Label</span>
        <span>Source pointers</span>
        <span>Reviewer edit</span>
      </div>
      ${claims
        .map(
          (claim) => `
            <div class="pems-claim-closure-row ${escapeHtml(claim.status ?? "unsupported")}" role="row">
              <span>${escapeHtml(claim.claimPreview ?? "claim")}</span>
              <span>${escapeHtml(claim.status ?? "unsupported")}</span>
              <span>${escapeHtml((claim.sourcePointerIds ?? []).join(", ") || "none")}</span>
              <span>${escapeHtml(claim.requiresReviewerEdit ? claim.suggestedEditPreview || "required" : "not required")}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPemsClaimRevision(revisionProof = {}) {
  const revision = revisionProof.latestClaimRevision;
  if (!revision) return `<p class="status-text">No reviewer claim revision record exists yet.</p>`;
  return `
    <dl>
      <dt>Status</dt>
      <dd>${escapeHtml(revisionProof.status ?? revision.revisionStatus ?? "unknown")}</dd>
      <dt>Revision count</dt>
      <dd>${escapeHtml(revisionProof.claimRevisionCount ?? 0)} total · ${escapeHtml(revisionProof.claimRevisionReclosedCount ?? 0)} reclosed</dd>
      <dt>Reclosure</dt>
      <dd>${escapeHtml(revisionProof.deterministicReclosurePassed ? "passed" : "needs attention")}</dd>
      <dt>Hashes</dt>
      <dd>${escapeHtml(revisionProof.preservesOriginalAndRevisedHashes ? "original + revised preserved" : "attention")}</dd>
      <dt>Source pointers</dt>
      <dd>${escapeHtml((revision.sourcePointerIds ?? []).join(", ") || "none")}</dd>
      <dt>Raw revision/source</dt>
      <dd>not stored</dd>
    </dl>
    <div class="pems-revision-diff" role="table" aria-label="PEMS reviewer claim revision diff">
      <div role="row"><span>Original</span><span>${escapeHtml(revision.originalClaimPreview ?? "n/a")}</span></div>
      <div role="row"><span>Suggested</span><span>${escapeHtml(revision.suggestedEditPreview ?? "n/a")}</span></div>
      <div role="row"><span>Revised</span><span>${escapeHtml(revision.revisedClaimPreview ?? "n/a")}</span></div>
    </div>
  `;
}

function renderPemsReviewerFollowUp(followUpProof = {}) {
  const followUp = followUpProof.latestReviewerFollowUp;
  if (!followUp) return `<p class="status-text">No reviewer follow-up workflow binding exists yet.</p>`;
  return `
    <dl>
      <dt>Status</dt>
      <dd>${escapeHtml(followUpProof.status ?? followUp.followupStatus ?? "unknown")}</dd>
      <dt>Follow-ups</dt>
      <dd>${escapeHtml(followUpProof.reviewerFollowUpCount ?? 0)} total · ${escapeHtml(followUpProof.reviewerFollowUpResolvedCount ?? 0)} resolved · ${escapeHtml(followUpProof.reviewerFollowUpOpenCount ?? 0)} open</dd>
      <dt>Revision binding</dt>
      <dd>${escapeHtml(followUp.claimRevisionId ?? "none")}</dd>
      <dt>Review binding</dt>
      <dd>${escapeHtml(followUp.promotionReviewId ?? "none")}</dd>
      <dt>Workflow</dt>
      <dd>${escapeHtml(followUp.workflowStatus ?? "unknown")} · ${escapeHtml(followUp.revisionOutcome ?? "unknown")}</dd>
      <dt>Action required</dt>
      <dd>${escapeHtml(followUp.actionRequired ?? "none")}</dd>
      <dt>Raw revision/review</dt>
      <dd>not stored</dd>
    </dl>
    <div class="pems-followup-chain" role="table" aria-label="PEMS reviewer follow-up chain">
      <div role="row"><span>Claim revision</span><span>${escapeHtml(followUp.claimRevisionId ?? "none")}</span></div>
      <div role="row"><span>Review decision</span><span>${escapeHtml(followUpProof.latestPromotionReview?.decision ?? "not linked")}</span></div>
      <div role="row"><span>Outcome</span><span>${escapeHtml(followUpProof.revisionResolvedVeto ? "revision resolved advisory veto" : "follow-up still needs attention")}</span></div>
    </div>
  `;
}

function renderPemsReviewerHistoryExport(historyProof = {}) {
  const exportRow = historyProof.latestReviewerHistoryExport;
  if (!exportRow) return `<p class="status-text">No reviewer history audit export exists yet.</p>`;
  const counts = exportRow.historySnapshotPreview?.counts ?? {};
  const refs = exportRow.historySnapshotPreview?.latestRefs ?? [];
  return `
    <dl>
      <dt>Status</dt>
      <dd>${escapeHtml(historyProof.status ?? "phase43_reviewer_history_audit_export_waiting")}</dd>
      <dt>Export ref</dt>
      <dd>${escapeHtml(exportRow.exportRef ?? "none")}</dd>
      <dt>Snapshot hash</dt>
      <dd>${escapeHtml(exportRow.historySnapshotHash ?? "none")}</dd>
      <dt>History rows</dt>
      <dd>${escapeHtml(counts.historyRowCount ?? historyProof.historyRowCount ?? 0)} rows · ${escapeHtml(counts.claimRevisionCount ?? 0)} revisions · ${escapeHtml(counts.promotionReviewCount ?? 0)} reviews · ${escapeHtml(counts.reviewerFollowUpCount ?? 0)} follow-ups</dd>
      <dt>Raw history/source</dt>
      <dd>not stored</dd>
      <dt>Production authority</dt>
      <dd>${escapeHtml(historyProof.productionDrivingAllowed ? "enabled" : "disabled")}</dd>
    </dl>
    <div class="pems-history-export" role="table" aria-label="PEMS reviewer history audit export refs">
      <div role="row"><span>Type</span><span>Ref</span><span>Status</span></div>
      ${refs
        .map(
          (row) => `
            <div role="row">
              <span>${escapeHtml(row.type ?? "history")}</span>
              <span>${escapeHtml(row.id ?? "none")}</span>
              <span>${escapeHtml(row.status ?? row.decision ?? row.followupStatus ?? "recorded")}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPemsReviewerHistoryReview(historyReview = {}) {
  const rows = Array.isArray(historyReview.rows) ? historyReview.rows : [];
  const comparison = historyReview.comparison ?? {};
  const delta = comparison.delta ?? {};
  const added = comparison.changedRefs?.added ?? [];
  const removed = comparison.changedRefs?.removed ?? [];
  if (!rows.length) return `<p class="status-text">No history export rows match the current review filters.</p>`;
  return `
    <dl>
      <dt>Status</dt>
      <dd>${escapeHtml(historyReview.status ?? "phase44_reviewer_history_review_refinement_waiting")}</dd>
      <dt>Score</dt>
      <dd>${escapeHtml(historyReview.score ?? 98)} / ${escapeHtml(historyReview.target ?? 100)}</dd>
      <dt>Filtered exports</dt>
      <dd>${escapeHtml(historyReview.filteredExportCount ?? rows.length)} / ${escapeHtml(historyReview.reviewerHistoryExportReviewCount ?? rows.length)}</dd>
      <dt>Search keys</dt>
      <dd>${escapeHtml((historyReview.searchableBy ?? []).join(", ") || "candidate, draft, follow-up, export ref, snapshot hash")}</dd>
      <dt>Snapshot comparison</dt>
      <dd>${escapeHtml(comparison.status ?? "waiting")} · ${escapeHtml(comparison.ok ? "ready" : "needs second export")}</dd>
      <dt>Raw history/source</dt>
      <dd>not stored</dd>
      <dt>Production authority</dt>
      <dd>${escapeHtml(historyReview.productionDrivingAllowed ? "enabled" : "disabled")}</dd>
    </dl>
    <div class="pems-history-review" role="table" aria-label="PEMS reviewer history export search and sort">
      <div role="row"><span>Created</span><span>Export ref</span><span>Snapshot</span><span>Rows</span><span>Follow-ups</span></div>
      ${rows
        .map(
          (row) => `
            <div role="row">
              <span>${escapeHtml(row.createdAt ?? "n/a")}</span>
              <span>${escapeHtml(row.exportRef ?? "none")}</span>
              <span>${escapeHtml(row.historySnapshotHash ?? "none")}</span>
              <span>${escapeHtml(row.counts?.historyRowCount ?? 0)}</span>
              <span>${escapeHtml((row.followupStatuses ?? []).join(", ") || "none")}</span>
            </div>
          `
        )
        .join("")}
    </div>
    <div class="pems-history-review compact" role="table" aria-label="PEMS reviewer history export snapshot comparison">
      <div role="row"><span>Delta</span><span>Value</span><span>Refs</span></div>
      <div role="row"><span>History rows</span><span>${escapeHtml(delta.historyRowCount ?? 0)}</span><span>${escapeHtml(added.length)} added · ${escapeHtml(removed.length)} removed</span></div>
      <div role="row"><span>Claim revisions</span><span>${escapeHtml(delta.claimRevisionCount ?? 0)}</span><span>${escapeHtml(comparison.comparison?.historySnapshotHash ?? "no comparison")}</span></div>
      <div role="row"><span>Reviews</span><span>${escapeHtml(delta.promotionReviewCount ?? 0)}</span><span>${escapeHtml(comparison.baseline?.historySnapshotHash ?? "no baseline")}</span></div>
      <div role="row"><span>Follow-ups</span><span>${escapeHtml(delta.reviewerFollowUpCount ?? 0)}</span><span>safe refs only</span></div>
    </div>
  `;
}

function currentPemsWorkbenchQuery() {
  const params = new URLSearchParams();
  const draftStatus = pemsDraftStatusFilter?.value ?? "all";
  const evaluatorMode = pemsEvaluatorModeFilter?.value ?? "all";
  if (draftStatus && draftStatus !== "all") params.set("draftStatus", draftStatus);
  if (evaluatorMode && evaluatorMode !== "all") params.set("evaluatorMode", evaluatorMode);
  if (pemsLiveOnlyFilter?.checked) params.set("liveOnly", "true");
  const historyFollowup = pemsHistoryFollowupFilter?.value ?? "all";
  const historyExportRef = pemsHistoryExportRefFilter?.value?.trim() ?? "";
  const historySnapshotHash = pemsHistorySnapshotHashFilter?.value?.trim() ?? "";
  const historySortBy = pemsHistorySortBy?.value ?? "created_at";
  const historySortDirection = pemsHistorySortDirection?.value ?? "desc";
  if (historyFollowup && historyFollowup !== "all") params.set("followupStatus", historyFollowup);
  if (historyExportRef) params.set("exportRef", historyExportRef);
  if (historySnapshotHash) params.set("snapshotHash", historySnapshotHash);
  if (historySortBy && historySortBy !== "created_at") params.set("sortBy", historySortBy);
  if (historySortDirection && historySortDirection !== "desc") params.set("sortDirection", historySortDirection);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function renderPemsDraftQueue(drafts = []) {
  if (!drafts.length) return `<p class="status-text">No drafts match the current filter.</p>`;
  return `
    <div class="pems-draft-queue">
      ${drafts
        .map(
          (draft) => `
            <button type="button" class="pems-draft-pill" data-pems-candidate-id="${escapeHtml(draft.candidateId)}" data-pems-draft-id="${escapeHtml(draft.id)}">
              <strong>${escapeHtml(draft.status)}</strong>
              <span>${escapeHtml(draft.evaluatorMode)} · ${escapeHtml(draft.suggestedDecision)}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderPemsWorkbench(payload) {
  if (!pemsWorkbench) return;
  latestPemsWorkbench = payload;
  const draft = payload.latestDraft ?? {};
  const candidate = payload.latestCandidate ?? {};
  const gate = payload.latestGate ?? {};
  const safety = payload.safety ?? {};
  const comparison = payload.reviewerComparison ?? {
    status: "phase38_reviewer_comparison_waiting_for_draft",
    score: 88,
    target: 90,
    comparisonRows: [],
    evidenceChips: [],
    evaluatorProvenance: {},
    safety: { productionDrivingAllowed: false }
  };
  const provenance = comparison.evaluatorProvenance ?? {};
  const liveGate = payload.liveEvaluatorFiltering ?? {
    status: "phase39_live_evaluator_filtering_ready_no_live_draft",
    score: 90,
    target: 92,
    liveProofClaimed: false,
    appliedFilters: {}
  };
  const claimClosure = payload.liveClaimCitationClosure ?? payload.latestClaimCitationClosure ?? draft.claimCitationClosure ?? {
    status: "phase40_claim_citation_closure_waiting_for_claims",
    score: 90,
    target: 94,
    claimCount: 0,
    supportedCount: 0,
    unsupportedCount: 0,
    lowConfidenceCount: 0,
    reviewerEditRequired: false,
    claims: []
  };
  const claimRevision = payload.reviewerClaimRevisions ?? {
    status: "phase41_reviewer_claim_revision_waiting",
    score: 94,
    target: 96,
    claimRevisionCount: 0,
    latestClaimRevision: null,
    productionDrivingAllowed: false
  };
  const reviewerFollowUp = payload.reviewerFollowUps ?? {
    status: "phase42_reviewer_follow_up_workflow_waiting",
    score: 96,
    target: 98,
    reviewerFollowUpCount: 0,
    latestReviewerFollowUp: null,
    productionDrivingAllowed: false
  };
  const reviewerHistoryExport = payload.reviewerHistoryExports ?? {
    status: "phase43_reviewer_history_audit_export_waiting",
    score: 97,
    target: 99,
    reviewerHistoryExportCount: 0,
    latestReviewerHistoryExport: null,
    productionDrivingAllowed: false
  };
  const reviewerHistoryReview = payload.reviewerHistoryReview ?? {
    status: "phase44_reviewer_history_review_refinement_waiting",
    score: 98,
    target: 100,
    reviewerHistoryExportReviewCount: 0,
    filteredExportCount: 0,
    rows: [],
    comparison: {},
    productionDrivingAllowed: false
  };
  const reviewerUi = payload.reviewerUi ?? {
    status: "phase37_pems_reviewer_ui_ready",
    score: 88,
    target: 88,
    productionDrivingAllowed: false
  };
  const available = latestPemsDraftAvailable(payload);
  if (pemsWorkbenchStatus) {
    pemsWorkbenchStatus.textContent = `${reviewerHistoryReview.status ?? reviewerHistoryExport.status ?? "phase44_reviewer_history_review_refinement_waiting"} · ${reviewerHistoryReview.score ?? reviewerHistoryExport.score ?? 98} / ${reviewerHistoryReview.target ?? reviewerHistoryExport.target ?? 100}`;
  }
  setPemsReviewActionsEnabled(available, payload);
  pemsWorkbench.innerHTML = `
    <article class="connector-card wide pems-workbench-summary">
      <h3>Phase 44 Reviewer History Review Refinement</h3>
      <dl>
        <dt>Status</dt>
        <dd>${escapeHtml(reviewerHistoryReview.status ?? "phase44_reviewer_history_review_refinement_waiting")}</dd>
        <dt>Score</dt>
        <dd>${escapeHtml(reviewerHistoryReview.score ?? 98)} / ${escapeHtml(reviewerHistoryReview.target ?? 100)}</dd>
        <dt>Filtered history exports</dt>
        <dd>${escapeHtml(reviewerHistoryReview.filteredExportCount ?? 0)} visible · ${escapeHtml(reviewerHistoryReview.reviewerHistoryExportReviewCount ?? 0)} total</dd>
        <dt>Snapshot comparison</dt>
        <dd>${escapeHtml(reviewerHistoryReview.comparison?.status ?? "phase44_history_export_snapshot_comparison_waiting")}</dd>
        <dt>History exports</dt>
        <dd>${escapeHtml(reviewerHistoryExport.reviewerHistoryExportCount ?? 0)} total · ${escapeHtml(reviewerHistoryExport.historyRowCount ?? 0)} latest rows</dd>
        <dt>Follow-up records</dt>
        <dd>${escapeHtml(reviewerFollowUp.reviewerFollowUpCount ?? 0)} total · ${escapeHtml(reviewerFollowUp.reviewerFollowUpResolvedCount ?? 0)} resolved</dd>
        <dt>Revision records</dt>
        <dd>${escapeHtml(claimRevision.claimRevisionCount ?? 0)} total · ${escapeHtml(claimRevision.claimRevisionReclosedCount ?? 0)} reclosed</dd>
        <dt>Revision-to-review binding</dt>
        <dd>${escapeHtml(reviewerFollowUp.bindsRevision && reviewerFollowUp.bindsReviewDecision ? "linked" : "waiting")}</dd>
        <dt>Phase 40 gate</dt>
        <dd>${escapeHtml(claimClosure.status ?? "phase40_claim_citation_closure_waiting_for_claims")} · ${escapeHtml(claimClosure.score ?? 90)} / ${escapeHtml(claimClosure.target ?? 94)}</dd>
        <dt>Claim labels</dt>
        <dd>${escapeHtml(claimClosure.supportedCount ?? 0)} supported · ${escapeHtml(claimClosure.lowConfidenceCount ?? 0)} low confidence · ${escapeHtml(claimClosure.unsupportedCount ?? 0)} unsupported</dd>
        <dt>Reviewer edit</dt>
        <dd>${escapeHtml(claimClosure.reviewerEditRequired ? "required before approval" : "not required")}</dd>
        <dt>Phase 39 gate</dt>
        <dd>${escapeHtml(liveGate.status ?? "phase39_live_evaluator_filtering_waiting")} · ${escapeHtml(liveGate.score ?? 90)} / ${escapeHtml(liveGate.target ?? 92)}</dd>
        <dt>Live proof</dt>
        <dd>${escapeHtml(liveGate.liveProofClaimed ? "observed egress draft" : "not claimed")}</dd>
        <dt>Filtered drafts</dt>
        <dd>${escapeHtml(liveGate.filteredDraftCount ?? payload.filteredDraftCount ?? 0)} / ${escapeHtml(liveGate.draftCount ?? payload.draftCount ?? 0)}</dd>
        <dt>Underlying UI gate</dt>
        <dd>${escapeHtml(reviewerUi.status ?? "phase37_pems_reviewer_ui_ready")} · ${escapeHtml(reviewerUi.score ?? 88)} / ${escapeHtml(reviewerUi.target ?? 88)}</dd>
        <dt>Comparison gate</dt>
        <dd>${escapeHtml(comparison.status ?? "phase38_reviewer_comparison_waiting_for_draft")} · ${escapeHtml(comparison.score ?? 88)} / ${escapeHtml(comparison.target ?? 90)}</dd>
        <dt>Underlying workbench</dt>
        <dd>${escapeHtml(payload.status ?? "unknown")} · ${escapeHtml(payload.score ?? 0)} / ${escapeHtml(payload.target ?? 85)}</dd>
        <dt>Drafts</dt>
        <dd>${escapeHtml(payload.draftCount ?? 0)} total · ${escapeHtml(payload.readyDraftCount ?? 0)} ready · ${escapeHtml(payload.blockedDraftCount ?? 0)} blocked</dd>
        <dt>Linked reviews</dt>
        <dd>${escapeHtml(payload.advisoryLinkedReviewCount ?? 0)}</dd>
        <dt>Authority</dt>
        <dd>human reviewer + deterministic validator · production driving ${escapeHtml(reviewerUi.productionDrivingAllowed ? "enabled" : "disabled")}</dd>
      </dl>
    </article>
    <article class="connector-card wide">
      <h3>Reviewer Filters</h3>
      <dl>
        <dt>Status filter</dt>
        <dd>${escapeHtml(liveGate.appliedFilters?.draftStatus ?? payload.appliedFilters?.draftStatus ?? "all")}</dd>
        <dt>Mode filter</dt>
        <dd>${escapeHtml(liveGate.appliedFilters?.evaluatorMode ?? payload.appliedFilters?.evaluatorMode ?? "all")}</dd>
        <dt>Live only</dt>
        <dd>${escapeHtml((liveGate.appliedFilters?.liveOnly ?? payload.appliedFilters?.liveOnly) ? "yes" : "no")}</dd>
        <dt>History follow-up</dt>
        <dd>${escapeHtml(reviewerHistoryReview.appliedFilters?.followupStatus ?? "all")}</dd>
        <dt>History sort</dt>
        <dd>${escapeHtml(reviewerHistoryReview.appliedFilters?.sortBy ?? "created_at")} · ${escapeHtml(reviewerHistoryReview.appliedFilters?.sortDirection ?? "desc")}</dd>
      </dl>
      ${renderPemsDraftQueue(payload.draftQueue ?? [])}
    </article>
    <article class="connector-card">
      <h3>Latest Candidate</h3>
      <dl>
        <dt>Candidate</dt>
        <dd>${escapeHtml(candidate.candidateId ?? "none")}</dd>
        <dt>Workflow</dt>
        <dd>${escapeHtml(candidate.workflow ?? "n/a")}</dd>
        <dt>Shadow runs</dt>
        <dd>${escapeHtml(candidate.shadowRunCount ?? 0)}</dd>
        <dt>Promotion</dt>
        <dd>${escapeHtml(candidate.promotionStatus ?? "waiting")}</dd>
        <dt>Gate</dt>
        <dd>${escapeHtml(gate.status ?? "not evaluated")}</dd>
      </dl>
    </article>
    <article class="connector-card">
      <h3>Advisory Draft</h3>
      <dl>
        <dt>Draft</dt>
        <dd>${escapeHtml(draft.id ?? "none")}</dd>
        <dt>Mode</dt>
        <dd>${escapeHtml(draft.evaluatorMode ?? "n/a")}</dd>
        <dt>Suggested review</dt>
        <dd>${escapeHtml(draft.suggestedReviewType ?? "n/a")} · ${escapeHtml(draft.suggestedDecision ?? "n/a")}</dd>
        <dt>Validator</dt>
        <dd>${escapeHtml(draft.deterministicValidatorStatus ?? "n/a")}</dd>
        <dt>Trace ref</dt>
        <dd>${escapeHtml(draft.consistencyTraceRef ?? "none")}</dd>
      </dl>
    </article>
    <article class="connector-card wide">
      <h3>Ref-Only Review Material</h3>
      <p>${escapeHtml(draft.advisoryNotePreview ?? "No advisory note preview available.")}</p>
      <p class="status-text">${escapeHtml(draft.consistencyTracePreview ?? "No consistency trace preview available.")}</p>
      <dl>
        <dt>Raw advisory note</dt>
        <dd>${escapeHtml(safety.rawAdvisoryNoteStored ? "stored" : "not stored")}</dd>
        <dt>Raw consistency trace</dt>
        <dd>${escapeHtml(safety.rawConsistencyTraceStored ? "stored" : "not stored")}</dd>
        <dt>Decision boundary</dt>
        <dd>${escapeHtml(safety.advisoryDraftsOnly ? "advisory only" : "attention required")} · ${escapeHtml(safety.humanReviewerAuthority ? "human authority" : "missing human authority")}</dd>
      </dl>
    </article>
    <article class="connector-card wide">
      <h3>Claim Citation Closure</h3>
      <dl>
        <dt>Verdict</dt>
        <dd>${escapeHtml(claimClosure.verdict ?? "not evaluated")}</dd>
        <dt>Source-pointer bounded</dt>
        <dd>${escapeHtml(claimClosure.sourcePointerBounded === false ? "attention" : "yes")}</dd>
        <dt>Raw claim/source</dt>
        <dd>not stored</dd>
      </dl>
      ${renderPemsClaimCitationClosure(claimClosure)}
    </article>
    <article class="connector-card wide">
      <h3>Reviewer Claim Revision</h3>
      ${renderPemsClaimRevision(claimRevision)}
    </article>
    <article class="connector-card wide">
      <h3>Reviewer Follow-Up Workflow</h3>
      ${renderPemsReviewerFollowUp(reviewerFollowUp)}
    </article>
    <article class="connector-card wide">
      <h3>Reviewer History Audit Export</h3>
      ${renderPemsReviewerHistoryExport(reviewerHistoryExport)}
    </article>
    <article class="connector-card wide">
      <h3>Reviewer History Search And Snapshot Diff</h3>
      ${renderPemsReviewerHistoryReview(reviewerHistoryReview)}
    </article>
    <article class="connector-card wide">
      <h3>Deterministic Vs Advisory Comparison</h3>
      ${renderPemsComparisonRows(comparison.comparisonRows)}
    </article>
    <article class="connector-card">
      <h3>Cited Evidence Chips</h3>
      ${renderEvidenceChips(comparison.evidenceChips)}
      <p class="status-text">Raw source content is not stored in the reviewer UI.</p>
    </article>
    <article class="connector-card">
      <h3>Evaluator Provenance</h3>
      <dl>
        <dt>Mode</dt>
        <dd>${escapeHtml(provenance.evaluatorMode ?? "not_available")}</dd>
        <dt>Model ref</dt>
        <dd>${escapeHtml(provenance.evaluatorModelRef ?? "not_provided")}</dd>
        <dt>Egress ref</dt>
        <dd>${escapeHtml(provenance.egressTraceRef ?? "not_provided")}</dd>
        <dt>Live proof</dt>
        <dd>${escapeHtml(provenance.liveProofClaimed ? "observed" : "not claimed")}</dd>
        <dt>Mocked output proof</dt>
        <dd>${escapeHtml(provenance.mockedLlmOutputCountsAsProof ? "attention" : "never counted")}</dd>
        <dt>Raw prompt/output</dt>
        <dd>${escapeHtml(provenance.rawPromptStored || provenance.rawCompletionStored ? "attention" : "not stored")}</dd>
      </dl>
    </article>
  `;
}

function renderPemsWorkbenchError(error) {
  if (pemsWorkbenchStatus) pemsWorkbenchStatus.textContent = error.message;
  setPemsReviewActionsEnabled(false);
  if (!pemsWorkbench) return;
  pemsWorkbench.innerHTML = `
    <article class="connector-card wide">
      <h3>Workbench Load Failed</h3>
      <p>${escapeHtml(error.message)}</p>
    </article>
  `;
}

async function loadPemsWorkbench() {
  if (pemsWorkbenchLoadPromise) return pemsWorkbenchLoadPromise;
  if (pemsWorkbenchStatus) pemsWorkbenchStatus.textContent = "Loading workbench...";
  pemsWorkbenchLoadPromise = (async () => {
    const payload = await api(`/api/continuous-intelligence/pems/workbench${currentPemsWorkbenchQuery()}`, { timeoutMs: 15000 });
    renderPemsWorkbench(payload);
    trace.textContent = JSON.stringify(payload, null, 2);
    return payload;
  })();
  try {
    return await pemsWorkbenchLoadPromise;
  } finally {
    pemsWorkbenchLoadPromise = null;
  }
}

async function generatePemsLiveEvaluatorDraft() {
  const current = latestPemsWorkbench ?? (await loadPemsWorkbench());
  const candidateId = current.latestCandidate?.candidateId;
  if (!candidateId) throw new Error("No PEMS candidate is available for live evaluator generation.");
  const sourcePointerIds = (current.reviewerComparison?.evidenceChips ?? []).map((chip) => chip.id).filter(Boolean);
  if (!sourcePointerIds.length) throw new Error("Live evaluator generation requires source-pointer chips.");
  const result = await api("/api/continuous-intelligence/pems/live-evaluator-drafts", {
    method: "POST",
    body: JSON.stringify({
      candidateId,
      actorUserId: "operator_ui_live_evaluator",
      deterministicValidatorStatus: current.latestDraft?.deterministicValidatorStatus ?? "pass",
      reviewerQuestion: "Generate a ref-only advisory evaluator draft for this candidate using only cited source pointer IDs.",
      sourcePointerIds
    }),
    timeoutMs: 90000
  });
  const refreshed = await loadPemsWorkbench();
  trace.textContent = JSON.stringify({ liveEvaluator: result, workbench: refreshed }, null, 2);
  return result;
}

async function submitPemsWorkbenchReview(action) {
  const current = latestPemsWorkbench ?? (await loadPemsWorkbench());
  if (!latestPemsDraftAvailable(current)) throw new Error("No advisory draft is available for review.");
  const decision = pemsDecisionLabel(action);
  if (action === "approved" && pemsClaimClosureVetoed(current)) {
    throw new Error("Claim citation closure requires reviewer edits before approval. Use Reject or Block for this advisory draft.");
  }
  const rationale = pemsReviewRationale?.value?.trim() || `Reviewer ${decision.label} advisory draft by ref.`;
  const result = await api("/api/continuous-intelligence/pems/reviews", {
    method: "POST",
    body: JSON.stringify({
      candidateId: current.latestCandidate.candidateId,
      advisoryDraftId: current.latestDraft.id,
      actorUserId: "operator_ui",
      reviewType: decision.reviewType,
      decision: decision.decision,
      rationale,
      metadata: {
        phase: 42,
        reviewerUiAction: action,
        claimRevisionId: current.reviewerClaimRevisions?.latestClaimRevision?.id ?? null,
        claimCitationClosureVerdict: current.liveClaimCitationClosure?.verdict ?? current.latestClaimCitationClosure?.verdict ?? null,
        reviewerEditRequired: pemsClaimClosureVetoed(current),
        advisoryOnly: true,
        rawRationaleStored: false,
        productionDrivingAllowed: false
      }
    }),
    timeoutMs: 15000
  });
  const refreshed = await loadPemsWorkbench();
  trace.textContent = JSON.stringify({ review: result, workbench: refreshed }, null, 2);
  return result;
}

async function submitPemsClaimRevision() {
  const current = latestPemsWorkbench ?? (await loadPemsWorkbench());
  if (!latestPemsDraftAvailable(current)) throw new Error("No advisory draft is available for claim revision.");
  const claim = firstEditablePemsClaim(current);
  if (!claim) throw new Error("No advisory claim is available for revision.");
  const closure = current.liveClaimCitationClosure ?? current.latestClaimCitationClosure ?? current.latestDraft?.claimCitationClosure ?? {};
  const revisedClaim = pemsClaimRevisionText?.value?.trim() || claim.suggestedEditPreview || claim.claimPreview;
  const result = await api("/api/continuous-intelligence/pems/claim-revisions", {
    method: "POST",
    body: JSON.stringify({
      candidateId: current.latestCandidate.candidateId,
      advisoryDraftId: current.latestDraft.id,
      claimId: claim.id,
      claimHash: claim.claimHash,
      actorUserId: "operator_ui",
      revisedClaim,
      sourcePointerIds: closure.allowedSourcePointerIds ?? claim.sourcePointerIds ?? [],
      metadata: {
        phase: 41,
        reviewerUiAction: "record_claim_revision",
        originalClaimStatus: claim.status,
        advisoryOnly: true,
        rawOriginalClaimStored: false,
        rawSuggestedEditStored: false,
        rawRevisedClaimStored: false,
        rawSourceStored: false,
        productionDrivingAllowed: false
      }
    }),
    timeoutMs: 15000
  });
  const refreshed = await loadPemsWorkbench();
  trace.textContent = JSON.stringify({ claimRevision: result, workbench: refreshed }, null, 2);
  return result;
}

async function submitPemsReviewerFollowUp() {
  const current = latestPemsWorkbench ?? (await loadPemsWorkbench());
  if (!latestPemsDraftAvailable(current)) throw new Error("No advisory draft is available for reviewer follow-up.");
  const revision = current.reviewerClaimRevisions?.latestClaimRevision;
  if (!revision?.id) throw new Error("Record a reviewer claim revision before binding a follow-up workflow.");
  const review = current.reviewerFollowUps?.latestPromotionReview;
  if (!review?.id) throw new Error("Record an explicit reviewer decision before binding a follow-up workflow.");
  const result = await api("/api/continuous-intelligence/pems/follow-ups", {
    method: "POST",
    body: JSON.stringify({
      candidateId: current.latestCandidate.candidateId,
      advisoryDraftId: current.latestDraft.id,
      claimRevisionId: revision.id,
      promotionReviewId: review.id,
      actorUserId: "operator_ui",
      followupType: "revision_decision_binding",
      rationale: pemsFollowUpRationale?.value?.trim() || "Bound reviewer claim revision to explicit review decision.",
      actionRequired: "Advisory follow-up workflow closed only after reviewer decision and deterministic reclosure.",
      metadata: {
        phase: 42,
        reviewerUiAction: "record_reviewer_follow_up",
        advisoryOnly: true,
        rawRationaleStored: false,
        rawRevisionStored: false,
        rawReviewStored: false,
        followUpCreatesEvidence: false,
        followUpBypassesHumanReview: false,
        productionDrivingAllowed: false
      }
    }),
    timeoutMs: 15000
  });
  const refreshed = await loadPemsWorkbench();
  trace.textContent = JSON.stringify({ reviewerFollowUp: result, workbench: refreshed }, null, 2);
  return result;
}

async function submitPemsReviewerHistoryExport() {
  const current = latestPemsWorkbench ?? (await loadPemsWorkbench());
  if (!latestPemsDraftAvailable(current)) throw new Error("No advisory draft is available for reviewer history export.");
  const result = await api("/api/continuous-intelligence/pems/history-exports", {
    method: "POST",
    body: JSON.stringify({
      candidateId: current.latestCandidate.candidateId,
      advisoryDraftId: current.latestDraft.id,
      actorUserId: "operator_ui",
      exportReason: pemsHistoryExportReason?.value?.trim() || "Export reviewer history refs for longitudinal audit.",
      filters: {
        candidateId: current.latestCandidate.candidateId,
        advisoryDraftId: current.latestDraft.id,
        followupStatus: "all",
        reviewDecision: "all"
      },
      metadata: {
        phase: 43,
        reviewerUiAction: "record_reviewer_history_export",
        latestFollowUpId: current.reviewerFollowUps?.latestReviewerFollowUp?.id ?? null,
        advisoryOnly: true,
        rawHistoryStored: false,
        rawRevisionStored: false,
        rawReviewStored: false,
        rawSourceStored: false,
        exportCreatesEvidence: false,
        exportBypassesHumanReview: false,
        productionDrivingAllowed: false
      }
    }),
    timeoutMs: 15000
  });
  const refreshed = await loadPemsWorkbench();
  trace.textContent = JSON.stringify({ reviewerHistoryExport: result, workbench: refreshed }, null, 2);
  return result;
}

async function loadConnectorProof() {
  if (connectorProofLoadPromise) return connectorProofLoadPromise;
  if (connectorProofStatus) connectorProofStatus.textContent = "Loading connector proof...";
  connectorProofLoadPromise = (async () => {
    const payload = await api("/api/proof/runs/server-connector-next-mobile-mvp", { timeoutMs: 15000 });
    renderConnectorProof(payload);
    trace.textContent = JSON.stringify(payload, null, 2);
    return payload;
  })();
  try {
    return await connectorProofLoadPromise;
  } finally {
    connectorProofLoadPromise = null;
  }
}

function renderReview(tracePayload) {
  const balances = tracePayload.coverageBalances ?? [];
  const claims = tracePayload.claims ?? [];
  const priorAuths = tracePayload.priorAuthorizations ?? [];
  reviewStatus.textContent = `${balances.length} balances · ${claims.length} claims · ${priorAuths.length} prior auths`;

  const sections = [];
  sections.push(`
    <article class="review-card">
      <h3>Coverage Balances</h3>
      ${
        balances.length
          ? balances
              .map(
                (item) => `
                  <dl>
                    <dt>${escapeHtml(item.label)}</dt>
                    <dd>Total ${money(item.total_amount)} · Spent ${money(item.spent_amount)} · Remaining ${money(item.remaining_amount)}</dd>
                  </dl>
                `
              )
              .join("")
          : "<p>No structured balance records yet.</p>"
      }
    </article>
  `);
  sections.push(`
    <article class="review-card">
      <h3>Recent Claims</h3>
      ${
        claims.length
          ? claims
              .map(
                (item) => `
                  <dl>
                    <dt>${escapeHtml(item.description)}</dt>
                    <dd>${escapeHtml(item.member_name ?? "Unknown member")} · ${escapeHtml(item.service_date ?? "Unknown date")} · Share ${money(item.share_amount)}</dd>
                  </dl>
                `
              )
              .join("")
          : "<p>No structured claim records yet.</p>"
      }
    </article>
  `);
  sections.push(`
    <article class="review-card">
      <h3>Prior Authorizations</h3>
      ${
        priorAuths.length
          ? priorAuths
              .map(
                (item) => `
                  <dl>
                    <dt>${escapeHtml(item.provider_or_facility ?? "Unknown provider")}</dt>
                    <dd>${escapeHtml(item.service_date ?? "Unknown date")} · ${escapeHtml(item.status)}</dd>
                  </dl>
                `
              )
              .join("")
          : "<p>No structured prior authorization records yet.</p>"
      }
    </article>
  `);
  review.innerHTML = sections.join("");
}

function renderPortalPages(payload) {
  const pages = payload.pages ?? [];
  portalStatus.textContent = `${pages.length} captured page${pages.length === 1 ? "" : "s"}`;
  portalPages.innerHTML = pages.length
    ? pages
        .map(
          (page) => `
            <article class="page-proof">
              <div>
                <strong>${escapeHtml(page.page_kind)}</strong>
                <span>${escapeHtml(page.title)}</span>
              </div>
              <a href="${escapeHtml(page.url)}" target="_blank" rel="noreferrer">${escapeHtml(page.url)}</a>
              <p>${escapeHtml(textPreview(page.visible_text))}</p>
            </article>
          `
        )
        .join("")
    : "<p>No portal page snapshots have been captured yet.</p>";
}

function renderSessions(payload) {
  const rows = payload.sessions ?? [];
  sessionStatus.textContent = `${rows.length} session${rows.length === 1 ? "" : "s"}`;
  sessions.innerHTML = rows.length
    ? rows
        .map(
          (session) => `
            <article class="session-row" data-session-id="${escapeHtml(session.id)}">
              <button type="button" data-use-session="${escapeHtml(session.id)}">Use</button>
              <div>
                <strong>${escapeHtml(session.title)}</strong>
                <span>${escapeHtml(session.status)} · ${escapeHtml(session.current_step)} · v${escapeHtml(session.state_version)}</span>
                <code>${escapeHtml(session.langgraph_thread_id)}</code>
              </div>
            </article>
          `
        )
        .join("")
    : "<p>No sessions found for this member.</p>";
}

function renderHarness(payload) {
  const tasks = payload.tasks ?? [];
  const jobs = payload.jobs ?? [];
  const outbox = payload.outbox ?? [];
  const memories = payload.memories ?? [];
  harnessStatus.textContent = `${tasks.length} tasks · ${jobs.length} jobs · ${memories.length} memories`;
  harness.innerHTML = `
    <article class="review-card">
      <h3>OpenClaw Instance</h3>
      <dl>
        <dt>${escapeHtml(payload.instance?.status ?? "not created")}</dt>
        <dd>${escapeHtml(payload.instance?.dedicated_channel ?? "local")} · ${escapeHtml(payload.instance?.heartbeat_interval_minutes ?? "-")} min heartbeat</dd>
      </dl>
      <p>${escapeHtml(textPreview(payload.instance?.heartbeat_state_json ?? ""))}</p>
    </article>
    <article class="review-card">
      <h3>Tasks</h3>
      ${
        tasks.length
          ? tasks
              .slice(0, 5)
              .map(
                (task) => `
                  <dl>
                    <dt>${escapeHtml(task.task_type)}</dt>
                    <dd>${escapeHtml(task.status)} · ${escapeHtml(task.description)}</dd>
                  </dl>
                `
              )
              .join("")
          : "<p>No open tasks.</p>"
      }
    </article>
    <article class="review-card">
      <h3>Scheduled Jobs</h3>
      ${
        jobs.length
          ? jobs
              .slice(0, 5)
              .map(
                (job) => `
                  <dl>
                    <dt>${escapeHtml(job.job_type)}</dt>
                    <dd>${escapeHtml(job.status)} · ${escapeHtml(job.schedule_label)}</dd>
                  </dl>
                `
              )
              .join("")
          : "<p>No scheduled jobs.</p>"
      }
    </article>
    <article class="review-card">
      <h3>Approval Outbox</h3>
      ${
        outbox.length
          ? outbox
              .slice(0, 5)
              .map(
                (item) => `
                  <dl>
                    <dt>${escapeHtml(item.channel)} · ${escapeHtml(item.status)}</dt>
                    <dd>${escapeHtml(item.message)}</dd>
                  </dl>
                `
              )
              .join("")
          : "<p>No proposed external messages.</p>"
      }
    </article>
  `;
}

function renderProductMemory(payload) {
  const status = payload.status && typeof payload.status === "object" ? payload.status : payload;
  const retained = payload.retained ?? {};
  const recalled = payload.recalled ?? {};
  const facts = status.facts ?? recalled.facts ?? [];
  productMemoryStatus.textContent = `${status.adapter ?? "graphiti"} · ${status.schemaReady ? "schema ready" : status.status ?? "not ready"} · ${memoryRetainSummary(retained)}`;
  productMemory.innerHTML = `
    <article class="review-card">
      <h3>Graphiti Contract</h3>
      <dl>
        <dt>Enabled</dt>
        <dd>${escapeHtml(status.enabled ?? status.ok ?? false)}</dd>
        <dt>Backend</dt>
        <dd>${escapeHtml(status.backend ?? status.config?.backend ?? "unknown")}</dd>
        <dt>Group</dt>
        <dd>${escapeHtml(status.groupId ?? status.config?.groupId ?? "unknown")}</dd>
        <dt>Schema</dt>
        <dd>${escapeHtml(status.schemaReady ? "ready" : status.status ?? "unknown")}</dd>
        <dt>LLM</dt>
        <dd>${escapeHtml(status.llmModel ?? status.config?.llmModel ?? "unknown")}</dd>
        <dt>Raw portal text</dt>
        <dd>${escapeHtml(status.rawPortalTextStored ?? status.rawEpisodeStorage ?? false)}</dd>
      </dl>
    </article>
    <article class="review-card">
      <h3>Retain Proof</h3>
      <dl>
        <dt>Episode</dt>
        <dd>${escapeHtml(retained.episodeUuid ?? status.episodeUuid ?? "none")}</dd>
        <dt>Nodes</dt>
        <dd>${escapeHtml(retained.nodeCount ?? status.nodeCount ?? "n/a")}</dd>
        <dt>Edges</dt>
        <dd>${escapeHtml(retained.edgeCount ?? status.edgeCount ?? "n/a")}</dd>
        <dt>Status</dt>
        <dd>${escapeHtml(memoryRetainSummary(retained))}</dd>
        <dt>Repair</dt>
        <dd>${escapeHtml(memoryNextAction(retained))}</dd>
      </dl>
    </article>
    <article class="review-card wide">
      <h3>Recall Facts</h3>
      ${
        facts.length
          ? facts
              .slice(0, 5)
              .map(
                (fact) => `
                  <dl>
                    <dt>${escapeHtml(fact.uuid ?? "fact")}</dt>
                    <dd>${escapeHtml(fact.fact ?? fact.name ?? "no fact text")}</dd>
                  </dl>
                `
              )
              .join("")
          : "<p>No Graphiti facts returned yet.</p>"
      }
    </article>
  `;
}

function renderSkillCard(artifact) {
  return `
    <article class="skill-card">
      <div>
        <h3>${escapeHtml(artifact.manifest?.title ?? artifact.skillKey)}</h3>
        <span>${escapeHtml(artifact.manifest?.status ?? "unknown")} · ${escapeHtml(artifact.manifest?.risk_level ?? "unknown risk")}</span>
      </div>
      <dl>
        <dt>Credential boundary</dt>
        <dd>${escapeHtml(artifact.manifest?.approval_gates?.credential_entry ?? "unknown")}</dd>
        <dt>Fallback</dt>
        <dd>${escapeHtml((artifact.manifest?.fallback_strategy?.order ?? []).join(" > "))}</dd>
        <dt>Validation</dt>
        <dd>${artifact.validation?.valid ? "passed" : escapeHtml((artifact.validation?.issues ?? []).join("; "))}</dd>
      </dl>
    </article>
  `;
}

function renderSkills(payload) {
  const artifacts = payload.artifacts ?? [];
  skillStatus.textContent = `${artifacts.length} skill${artifacts.length === 1 ? "" : "s"} · ${artifacts.every((item) => item.validation?.valid) ? "valid" : "attention"}`;
  skills.innerHTML = artifacts.length
    ? artifacts.map((artifact) => renderSkillCard(artifact)).join("")
    : "<p>No OpenClaw skill artifacts found.</p>";
}

function renderSkillProposal(payload) {
  const validation = payload.validation ?? {};
  const proposal = payload.proposal ?? {};
  const workerPlan = payload.workerPlan ?? {};
  const dynamicSkillContext = payload.dynamicSkillContext ?? payload.graphRun?.state?.dynamic_skill_context ?? null;
  const task = proposal.task ?? {};
  const auditEvent = proposal.auditEvent ?? {};
  skillStatus.textContent = `${validation.status ?? "unknown"} · task ${task.id ? "recorded" : "not recorded"}`;
  skills.innerHTML = `
    ${renderSkillCard(payload.skillArtifact)}
    <article class="skill-card proposal-card">
      <div>
        <h3>Envelope Proposal</h3>
        <span>${escapeHtml(validation.executionMode ?? "proposal_only")} · ${validation.valid ? "valid" : "blocked"}</span>
      </div>
      <dl>
        <dt>Workflow</dt>
        <dd>${escapeHtml(validation.requiredInputs?.workflow_key ?? "unknown")}</dd>
        <dt>Approval gates</dt>
        <dd>${escapeHtml((validation.approvalsRequired ?? []).join(" · "))}</dd>
        <dt>Fallback path</dt>
        <dd>${escapeHtml((validation.fallbackPath ?? []).join(" > "))}</dd>
        <dt>Stop conditions</dt>
        <dd>${escapeHtml((validation.stopConditions ?? []).slice(0, 5).join(" · "))}</dd>
        <dt>Issues</dt>
        <dd>${escapeHtml((validation.issues ?? []).join("; ") || "none")}</dd>
        <dt>Proposal task</dt>
        <dd>${escapeHtml(task.id ?? "not recorded")} · ${escapeHtml(task.status ?? "unknown")}</dd>
        <dt>Worker plan</dt>
        <dd>${escapeHtml(workerPlan.planId ?? "not prepared")} · ${escapeHtml(workerPlan.dispatchStatus ?? "not_dispatched")}</dd>
        <dt>Worker jobs</dt>
        <dd>${escapeHtml((workerPlan.workerJobs ?? []).map((job) => `${job.worker?.agentId ?? "worker"}:${job.jobId}`).join(" · ") || "none")}</dd>
        <dt>Dynamic skills</dt>
        <dd>${escapeHtml(dynamicSkillSelectedLine(dynamicSkillContext ?? {}))} · chance ${escapeHtml(dynamicSkillContext?.successEstimate?.overallChance ?? "n/a")}</dd>
        <dt>Fan-out/Fan-in</dt>
        <dd>${escapeHtml(`${workerPlan.fanOut?.mode ?? "none"} / ${workerPlan.fanIn?.owner ?? "none"}`)}</dd>
        <dt>Audit event</dt>
        <dd>${escapeHtml(auditEvent.id ?? "not recorded")}</dd>
        <dt>Actions taken</dt>
        <dd>${escapeHtml((validation.actionsTaken ?? []).join(", ") || "none")}</dd>
      </dl>
    </article>
    ${renderDynamicSkillProof(dynamicSkillContext)}
  `;
}

function liveWorkerStatusClass(status) {
  if (status === "ready_for_read_only_approval") return "ready";
  if (status === "auth_required" || status === "auth_or_challenge_required" || status === "portal_page_required") return "waiting";
  return "blocked";
}

function compactList(items = [], limit = 8) {
  return items
    .slice(0, limit)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function renderLiveWorkerGuide(payload = null) {
  if (!liveWorkerStatus || !workerVersatility) return;
  const live = payload?.liveReadiness ?? payload;
  if (!live?.status) {
    liveWorkerGuide.className = "live-worker-guide waiting";
    liveWorkerStatus.innerHTML = "Check the dedicated project OpenClaw profile before approving a live read-only run.";
    workerVersatility.innerHTML = "";
    return;
  }
  const currentTab = live.currentTab ?? payload?.tabs?.currentTab ?? null;
  const statusClass = liveWorkerStatusClass(live.status);
  liveWorkerGuide.className = `live-worker-guide ${statusClass}`;
  liveWorkerStatus.innerHTML = `
    <div class="live-worker-state">
      <strong>${escapeHtml(live.status)}</strong>
      <span>${escapeHtml(live.nextAction ?? "Check the current OpenClaw browser tab.")}</span>
    </div>
    <dl>
      <dt>Current tab</dt>
      <dd>${escapeHtml(currentTab ? `${currentTab.title ?? "untitled"} · ${currentTab.url ?? "no url"}` : "none detected")}</dd>
      <dt>Approval</dt>
      <dd>${escapeHtml(live.approvalScope ?? "read_only_observation")} · ${escapeHtml(
        live.readyForReadOnlyObservation ? "ready to request" : "waiting for user action"
      )}</dd>
      <dt>Boundary</dt>
      <dd>${escapeHtml(live.safetyBoundary ?? "OpenClaw is approval-gated and read-only for this MVP.")}</dd>
    </dl>
  `;
  workerVersatility.innerHTML = `
    <div>
      <h4>Worker may try after approval</h4>
      <ul>${compactList(live.workerVersatility ?? [])}</ul>
    </div>
    <div>
      <h4>Always blocked</h4>
      <ul>${compactList(live.blockedActions ?? [])}</ul>
    </div>
    <div>
      <h4>Fallback chain</h4>
      <ol>${compactList(live.fallbackChain ?? [], 10)}</ol>
    </div>
  `;
}

function renderOfficialOpenClawStatus(payload) {
  const checks = payload.checks ?? {};
  const config = payload.config ?? {};
  const currentTab = payload.tabs?.currentTab ?? null;
  const live = payload.liveReadiness ?? {};
  skillStatus.textContent = `${payload.status ?? "unknown"} · ${payload.ready ? "ready" : "attention"}`;
  renderLiveWorkerGuide(payload);
  skills.innerHTML = `
    <article class="skill-card proposal-card">
      <div>
        <h3>Official OpenClaw Runtime</h3>
        <span>${escapeHtml(config.profile ?? "unknown profile")} · port ${escapeHtml(config.gatewayPort ?? "unknown")}</span>
      </div>
      <dl>
        <dt>Workspace</dt>
        <dd>${escapeHtml(config.workspace ?? "unknown")}</dd>
        <dt>Agent</dt>
        <dd>${escapeHtml(config.agentId ?? "unknown")}</dd>
        <dt>Browser profile</dt>
        <dd>${escapeHtml(payload.browser?.profile ?? config.browserProfile ?? "unknown")} · running ${escapeHtml(payload.browser?.running ?? false)}</dd>
        <dt>Current tab</dt>
        <dd>${escapeHtml(currentTab ? `${currentTab.title ?? "untitled"} · ${currentTab.url ?? "no url"}` : "none open")}</dd>
        <dt>Open tabs</dt>
        <dd>${escapeHtml(payload.tabs?.count ?? 0)}</dd>
        <dt>Skill</dt>
        <dd>${escapeHtml(config.skillKey ?? "unknown")} · ready ${escapeHtml(checks.skillReady ?? false)}</dd>
        <dt>Personal skills</dt>
        <dd>${checks.personalSkillsExcluded ? "excluded from project agent" : "check required"}</dd>
        <dt>Allowed actions</dt>
        <dd>${escapeHtml((config.allowedActions ?? []).join(", ") || "none")}</dd>
        <dt>Blocked actions</dt>
        <dd>${escapeHtml((config.blockedActions ?? []).join(", ") || "none")}</dd>
        <dt>Live readiness</dt>
        <dd>${escapeHtml(live.status ?? "not classified")} · ${escapeHtml(live.nextAction ?? "not checked")}</dd>
        <dt>Checks</dt>
        <dd>${escapeHtml(
          Object.entries(checks)
            .map(([key, value]) => `${key}=${value}`)
            .join(" · ")
        )}</dd>
      </dl>
    </article>
  `;
}

function renderPhase4Proof(payload) {
  const resumeState = payload.resume?.graphRun?.state ?? {};
  const evidence = resumeState.evidence_observation ?? {};
  const approval = payload.approval ?? {};
  const latestBrowserRun = payload.resume?.trace?.browserRuns?.at(-1) ?? {};
  const sourcePointers = resumeState.source_pointers ?? [];
  phase4Status.textContent = `${evidence.status ?? "unknown"} · approval ${approval.status ?? "unknown"}`;
  phase4.innerHTML = `
    <article class="phase4-card">
      <h3>Browser Proof Result</h3>
      <dl>
        <dt>Proposal</dt>
        <dd>${escapeHtml(payload.proposal?.graphRun?.state?.openclaw_skill_proposal?.task?.status ?? "unknown")}</dd>
        <dt>Approval</dt>
        <dd>${escapeHtml(approval.status ?? "unknown")} · actions ${escapeHtml((approval.approval?.actionsTaken ?? []).join(", ") || "none")}</dd>
        <dt>Resume</dt>
        <dd>${escapeHtml(resumeState.approval_resume?.status ?? "unknown")}</dd>
        <dt>Evidence</dt>
        <dd>${escapeHtml(evidence.status ?? "unknown")}</dd>
        <dt>Reason</dt>
        <dd>${escapeHtml(evidence.reason ?? "verified or not required")}</dd>
        <dt>Evidence actions</dt>
        <dd>${escapeHtml((evidence.actionsTaken ?? []).join(", ") || "none")}</dd>
        <dt>Source pointers</dt>
        <dd>${escapeHtml(sourcePointers.length)}</dd>
        <dt>Eligibility snapshots</dt>
        <dd>${escapeHtml(payload.resume?.trace?.snapshots?.length ?? 0)}</dd>
        <dt>Latest browser run</dt>
        <dd>${escapeHtml(latestBrowserRun.status ?? "none")}</dd>
        <dt>OpenClaw actions</dt>
        <dd>${escapeHtml((resumeState.openclaw_skill_validation?.actionsTaken ?? []).join(", ") || "none")}</dd>
      </dl>
    </article>
    ${
      sourcePointers.length
        ? sourcePointers
            .map(
              (pointer) => `
                <article class="phase4-card">
                  <h3>${escapeHtml(pointer.table ?? "source pointer")}</h3>
                  <dl>
                    <dt>URL</dt>
                    <dd>${escapeHtml(pointer.sourceUrl ?? "unknown")}</dd>
                    <dt>DOM hash</dt>
                    <dd>${escapeHtml(pointer.domHash ?? "not available")}</dd>
                    <dt>Extraction hash</dt>
                    <dd>${escapeHtml(pointer.extractionHash ?? "not available")}</dd>
                  </dl>
                </article>
              `
            )
            .join("")
        : ""
    }
  `;
}

function summarizeOpenClawJobs(jobs = []) {
  return jobs.length
    ? jobs
        .map(
          (job) => `
            <dl>
              <dt>${escapeHtml(job.agentId ?? "worker")}</dt>
              <dd>${escapeHtml(job.status ?? "unknown")} · ${escapeHtml(job.profile ?? "profile")} · choose workflow=${escapeHtml(job.mayChooseWorkflow)}</dd>
            </dl>
          `
        )
        .join("")
    : "<p>No OpenClaw jobs prepared.</p>";
}

function renderDecisionPoints(points = []) {
  return points.length
    ? points
        .map(
          (point) => `
            <dl>
              <dt>${escapeHtml(point.key)}</dt>
              <dd>${escapeHtml(point.status)}${point.detail ? ` · ${escapeHtml(point.detail)}` : ""}</dd>
            </dl>
          `
        )
        .join("")
    : "<p>No decision points returned.</p>";
}

function renderOrchestratorAuth(payload) {
  orchestratorStatus.textContent = `${payload.auth?.status ?? "unknown"} · ${payload.session?.id ?? "no session"}`;
  document.querySelector("#sessionId").value = payload.session?.id ?? "";
  orchestrator.innerHTML = `
    <article class="orchestrator-card">
      <h3>Authenticated Planned User</h3>
      <dl>
        <dt>User</dt>
        <dd>${escapeHtml(payload.user?.email ?? "unknown")}</dd>
        <dt>Session</dt>
        <dd>${escapeHtml(payload.auth?.sessionId ?? "none")}</dd>
        <dt>Thread</dt>
        <dd>${escapeHtml(payload.auth?.langgraphThreadId ?? "none")}</dd>
        <dt>Credentials</dt>
        <dd>${escapeHtml(payload.auth?.credentialHandling ?? "unknown")}</dd>
      </dl>
    </article>
  `;
}

function renderOrchestratorChat(payload) {
  const run = payload.run ?? {};
  orchestratorStatus.textContent = `${run.actualWorkflow ?? "unknown"} · ${run.modelInvocation?.mode ?? "no model"}`;
  document.querySelector("#sessionId").value = payload.session?.id ?? "";
  orchestrator.innerHTML = `
    <article class="orchestrator-card wide">
      <h3>LangGraph Chat Decision</h3>
      <dl>
        <dt>Workflow</dt>
        <dd>${escapeHtml(run.actualWorkflow ?? "unknown")} · journey ${escapeHtml(run.journeyStage ?? "unknown")}</dd>
        <dt>Route reason</dt>
        <dd>${escapeHtml(run.routeReason ?? "unknown")}</dd>
        <dt>GPT routing</dt>
        <dd>${escapeHtml(run.llmOrchestrationDecision?.mode ?? "not run")} · ${escapeHtml(run.llmOrchestrationDecision?.usedByRouter ? "used" : "not used")} · ${escapeHtml(run.llmOrchestrationDecision?.workflow ?? "none")}</dd>
        <dt>Model</dt>
        <dd>${escapeHtml(run.modelInvocation?.mode ?? "not_requested")} · ${escapeHtml(run.modelInvocation?.model ?? payload.openAI?.model ?? "unknown")}</dd>
        <dt>Worker plan</dt>
        <dd>${escapeHtml(run.workerPlan?.dispatchStatus ?? "not_prepared")} · ${escapeHtml(run.workerPlan?.fanOutMode ?? "none")}</dd>
      </dl>
      <h4>Decision Points</h4>
      ${renderDecisionPoints(run.decisionPoints)}
      <h4>OpenClaw Jobs</h4>
      ${summarizeOpenClawJobs(run.openclawJobs)}
    </article>
  `;
  addMessage("assistant", run.finalResponse ?? "LangGraph orchestration completed.");
}

function renderFlowCases(payload) {
  const aggregate = payload.aggregate ?? {};
  orchestratorStatus.textContent = `${aggregate.total ?? 0} cases · ${aggregate.matched ?? 0} matched · model ${payload.openAI?.model ?? "unknown"}`;
  document.querySelector("#sessionId").value = payload.session?.id ?? "";
  orchestrator.innerHTML = `
    <article class="orchestrator-card summary-card">
      <h3>Flow Test Summary</h3>
      <dl>
        <dt>Total</dt>
        <dd>${escapeHtml(aggregate.total ?? 0)}</dd>
        <dt>Matched</dt>
        <dd>${escapeHtml(aggregate.matched ?? 0)}</dd>
        <dt>Pending approval</dt>
        <dd>${escapeHtml(aggregate.pendingApproval ?? 0)}</dd>
        <dt>Pending integration</dt>
        <dd>${escapeHtml(aggregate.pendingIntegration ?? 0)}</dd>
        <dt>Worker dispatch</dt>
        <dd>${aggregate.notDispatched ? "not dispatched" : "attention"}</dd>
      </dl>
    </article>
    ${(payload.cases ?? [])
      .map(
        (run) => `
          <article class="orchestrator-card">
            <div class="case-heading">
              <h3>${escapeHtml(run.title)}</h3>
              <span>${run.workflowMatched ? "matched" : "review"} · ${escapeHtml(run.actualWorkflow)}</span>
            </div>
            <dl>
              <dt>Journey</dt>
              <dd>${escapeHtml(run.journeyStage ?? "unknown")}</dd>
              <dt>Policy</dt>
              <dd>${run.policy?.allowed ? "allowed" : "blocked"} · approval=${escapeHtml(run.policy?.approvalRequired)}</dd>
              <dt>Model</dt>
              <dd>${escapeHtml(run.modelInvocation?.mode ?? "not_requested")}</dd>
              <dt>Worker</dt>
              <dd>${escapeHtml(run.workerPlan?.dispatchStatus ?? "not_prepared")} · jobs ${(run.openclawJobs ?? []).length}</dd>
            </dl>
            <h4>Decision Points</h4>
            ${renderDecisionPoints(run.decisionPoints)}
            <h4>OpenClaw Jobs To Contract</h4>
            ${summarizeOpenClawJobs(run.openclawJobs)}
          </article>
        `
      )
      .join("")}
  `;
}

async function loadLatestReview() {
  const latest = await api("/api/review/latest");
  renderReview(latest);
  trace.textContent = JSON.stringify(latest, null, 2);
}

async function loadSessions() {
  const email = encodeURIComponent(value("email"));
  const result = await api(`/api/sessions?email=${email}&limit=10`);
  renderSessions(result);
  trace.textContent = JSON.stringify(result, null, 2);
}

async function loadSessionState() {
  const sessionId = value("sessionId");
  if (!sessionId) throw new Error("Choose or enter a session id first.");
  const result = await api(`/api/sessions/${encodeURIComponent(sessionId)}/state`);
  sessionStatus.textContent = `${result.session.current_step} · v${result.session.state_version}`;
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

function renderResearchConsole(payload, mode = "kpis") {
  if (!researchConsole) return;
  const candidateKpis = payload.kpis ?? payload;
  const hasKpiPayload =
    !Array.isArray(candidateKpis.sources) &&
    !Array.isArray(candidateKpis.runs) &&
    (candidateKpis.sources || candidateKpis.runs || candidateKpis.artifacts || candidateKpis.schedules || candidateKpis.reviewQueue);
  const kpis = hasKpiPayload ? candidateKpis : {};
  const sources = payload.sources ?? [];
  const runs = payload.runs ?? [];
  const schedules = payload.schedules ?? [];
  const run = payload.run ?? null;
  const events = payload.events ?? [];
  const artifacts = payload.artifacts ?? (payload.artifact ? [payload.artifact] : []);
  const researchEntities = payload.entities ?? [];
  const searchResults = payload.results ?? [];
  const worker = payload.worker ?? (payload.modes && payload.defaultMode ? payload : null);
  const workerResult = payload.workerResult ?? null;
  const budgetPayload = payload.budget ?? (payload.policy && payload.usage ? payload : null);
  const analyticsPayload = payload.distributions ? payload : null;
  const reviewQueuesPayload = payload.queues && payload.counts ? payload : null;
  const embeddingStatus = payload.route && (payload.counts || payload.job || payload.latestJob) ? payload : null;
  const graphPayload = payload.graph?.nodes && payload.graph?.edges ? payload : null;
  const researchDocumentUpload = payload.document && payload.artifact ? payload : null;
  const schedulerDaemon = payload.daemon
    ? payload
    : payload.schedulerDaemon
      ? { daemon: payload.schedulerDaemon, schedules: payload.schedules ?? {}, dueCount: payload.dueCount, safety: payload.safety ?? {} }
      : null;
  const sections = [];
  if (researchDocumentUpload) {
    const document = researchDocumentUpload.document ?? {};
    const artifact = researchDocumentUpload.artifact ?? {};
    const safety = researchDocumentUpload.safety ?? {};
    sections.push(`
      <article class="research-card wide">
        <h3>Research Knowledge-Base Upload</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(researchDocumentUpload.status ?? "uploaded")} · ${escapeHtml(document.extractionStatus ?? "unknown")} · ${escapeHtml(document.extractionMethod ?? "unknown")}</dd>
          <dt>Artifact</dt>
          <dd>${escapeHtml(`${artifact.id ?? "pending"} · ${artifact.citationStatus ?? "unknown"} · ${artifact.artifactType ?? "document"}`)}</dd>
          <dt>Document</dt>
          <dd>${escapeHtml(`${document.filename ?? "document"} · ${document.contentType ?? "unknown"} · ${document.byteSize ?? 0} bytes · pages ${document.pageCount ?? "unknown"}`)}</dd>
          <dt>Hashes</dt>
          <dd>${escapeHtml(`upload ${document.uploadSha256 ?? "none"} · extraction ${artifact.extractionHash ?? "none"}`)}</dd>
          <dt>Safety</dt>
          <dd>${escapeHtml(safety.artifactPendingReview ? "pending review · raw document/text hidden" : "verify upload safety")}</dd>
          <dt>Actions</dt>
          <dd>${escapeHtml((researchDocumentUpload.actionsTaken ?? []).join(", ") || "none")}</dd>
        </dl>
        <p>${escapeHtml(artifact.safeTextPreview ?? "")}</p>
      </article>
    `);
  }
  if (researchEntities.length || payload.counts?.byType || payload.status === "research_entities_extracted") {
    const counts = payload.counts ?? {};
    sections.push(`
      <article class="research-card wide">
        <h3>Research Entity Extraction</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(payload.status ?? "entities_loaded")} · ${escapeHtml(payload.entityCount ?? researchEntities.length)} entities shown</dd>
          <dt>Types</dt>
          <dd>${escapeHtml(JSON.stringify(counts.byType ?? researchEntities.reduce((acc, entity) => ({ ...acc, [entity.entityType]: (acc[entity.entityType] ?? 0) + 1 }), {})))}</dd>
          <dt>Artifact</dt>
          <dd>${escapeHtml(payload.artifact?.id ?? payload.filters?.artifactId ?? "all artifacts")}</dd>
          <dt>Safety</dt>
          <dd>${escapeHtml(payload.safety?.rawArtifactTextReturned === false ? "raw artifact hidden · previews only" : "verify entity safety")}</dd>
          <dt>Spans</dt>
          <dd>${escapeHtml(payload.safety?.spansAreCharacterOffsets === false ? "not verified" : "character offsets · confidence included")}</dd>
          <dt>Actions</dt>
          <dd>${escapeHtml((payload.actionsTaken ?? []).join(", ") || "none")}</dd>
        </dl>
        <ol class="research-artifact-list">
          ${researchEntities
            .slice(0, 30)
            .map(
              (entity) => `
                <li>
                  <b>${escapeHtml(entity.label ?? entity.entityType)}</b>
                  <span>${escapeHtml(entity.normalizedValue)} · ${escapeHtml(entity.entityType)} · confidence ${escapeHtml(entity.confidence)}</span>
                  <span>artifact ${escapeHtml(entity.artifactId)} · page ${escapeHtml(entity.pageNumber ?? "n/a")} · span ${escapeHtml(entity.spanStart)}-${escapeHtml(entity.spanEnd)}</span>
                  <span>source ${escapeHtml(entity.sourcePointer?.table ?? "research_artifacts")}:${escapeHtml(entity.sourcePointer?.id ?? entity.artifactId)}</span>
                  <p>${escapeHtml(entity.evidencePreview ?? "")}</p>
                </li>
              `
            )
            .join("") || "<li>No extracted entities yet. Extract from an artifact or upload a research document.</li>"}
        </ol>
      </article>
    `);
  }
  if (analyticsPayload) {
    const distributions = analyticsPayload.distributions ?? {};
    sections.push(`
      <article class="research-card wide">
        <h3>Research Analytics</h3>
        <dl>
          <dt>Generated</dt>
          <dd>${escapeHtml(analyticsPayload.generatedAt ?? "unknown")}</dd>
          <dt>Run statuses</dt>
          <dd>${escapeHtml(JSON.stringify(distributions.runStatuses ?? {}))}</dd>
          <dt>Artifact statuses</dt>
          <dd>${escapeHtml(JSON.stringify(distributions.artifactCitationStatuses ?? {}))}</dd>
          <dt>Source statuses</dt>
          <dd>${escapeHtml(JSON.stringify(distributions.sourceStatuses ?? {}))}</dd>
          <dt>Safety</dt>
          <dd>${escapeHtml(analyticsPayload.safety?.readOnly ? "read-only analytics · raw payloads hidden" : "verify analytics safety")}</dd>
        </dl>
      </article>
    `);
  }
  if (budgetPayload) {
    const policy = budgetPayload.policy ?? {};
    const usage = budgetPayload.usage ?? {};
    sections.push(`
      <article class="research-card wide">
        <h3>Research Budget And Kill Switch</h3>
        <dl>
          <dt>State</dt>
          <dd>${escapeHtml(`${budgetPayload.state ?? "enforcing"} · enabled ${policy.enabled !== false} · kill switch ${policy.killSwitchEnabled ? "on" : "off"}`)}</dd>
          <dt>Daily runs</dt>
          <dd>${escapeHtml(`${usage.queuedRuns ?? 0} / ${policy.dailyRunLimit ?? 0}`)}</dd>
          <dt>Daily estimated cost</dt>
          <dd>${escapeHtml(`${usage.estimatedCostCents ?? 0} / ${policy.dailyCostLimitCents ?? 0} cents`)}</dd>
          <dt>Blocked attempts</dt>
          <dd>${escapeHtml(usage.blockedEvents ?? 0)}</dd>
          <dt>Latest event</dt>
          <dd>${escapeHtml(usage.latestEvent ? `${usage.latestEvent.eventType} · ${usage.latestEvent.status} · ${usage.latestEvent.reason ?? ""}` : "none")}</dd>
          <dt>Safety</dt>
          <dd>${escapeHtml(budgetPayload.safety?.failClosed ? "fail-closed · persisted policy" : "verify budget safety")}</dd>
        </dl>
      </article>
    `);
  }
  if (reviewQueuesPayload) {
    const counts = reviewQueuesPayload.counts ?? {};
    const queues = reviewQueuesPayload.queues ?? {};
    sections.push(`
      <article class="research-card wide">
        <h3>Expanded Review Queues</h3>
        <dl>
          <dt>Pending artifacts</dt>
          <dd>${escapeHtml(counts.pendingArtifacts ?? 0)}</dd>
          <dt>Low confidence</dt>
          <dd>${escapeHtml(counts.lowConfidenceAnswers ?? 0)}</dd>
          <dt>Downvoted feedback</dt>
          <dd>${escapeHtml(counts.downvotedFeedback ?? 0)}</dd>
          <dt>Escalated handoffs</dt>
          <dd>${escapeHtml(counts.escalatedHandoffs ?? 0)}</dd>
          <dt>User-answer reviews</dt>
          <dd>${escapeHtml(counts.userAnswerReviews ?? 0)}</dd>
          <dt>Safety</dt>
          <dd>${escapeHtml(reviewQueuesPayload.safety?.reviewQueuesAreRefOnly ? "ref-only queues · raw text hidden" : "verify review queue safety")}</dd>
        </dl>
        <h4>Queue Samples</h4>
        <ol class="research-event-list">
          ${(queues.pendingArtifacts ?? [])
            .slice(0, 3)
            .map((item) => `<li><b>artifact</b><span>${escapeHtml(item.id)} · ${escapeHtml(item.citationStatus)} · ${escapeHtml(item.title ?? item.sourceUrl ?? "")}</span></li>`)
            .join("")}
          ${(queues.lowConfidenceAnswers ?? [])
            .slice(0, 3)
            .map((item) => `<li><b>low confidence</b><span>${escapeHtml(item.id)} · claims ${escapeHtml(item.claimCount)} · answer ${escapeHtml(item.answerHash)}</span></li>`)
            .join("")}
          ${(queues.downvotedFeedback ?? [])
            .slice(0, 3)
            .map((item) => `<li><b>${escapeHtml(item.rating)}</b><span>${escapeHtml(item.id)} · session ${escapeHtml(item.sessionId)} · comment ${escapeHtml(item.commentHash ?? "none")}</span></li>`)
            .join("")}
          ${(queues.escalatedHandoffs ?? [])
            .slice(0, 3)
            .map((item) => `<li><b>${escapeHtml(item.priority)}</b><span>${escapeHtml(item.id)} · ${escapeHtml(item.status)} · ${escapeHtml(item.summary)}</span></li>`)
            .join("")}
          ${(queues.userAnswerReviews ?? [])
            .slice(0, 3)
            .map((item) => `<li><b>${escapeHtml(item.queueType)}</b><span>${escapeHtml(item.id)} · unsupported ${escapeHtml(item.unsupportedCount)} · low ${escapeHtml(item.lowConfidenceCount)}</span></li>`)
            .join("") || "<li>No review queue samples yet.</li>"}
        </ol>
      </article>
    `);
  }
  if (payload.status && Array.isArray(payload.results)) {
    const embeddingSearch = payload.embeddingSearch ?? {};
    sections.push(`
      <article class="research-card wide">
        <h3>Trusted Evidence Search</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(payload.status)} · low confidence ${escapeHtml(payload.lowConfidence ?? false)}</dd>
          <dt>Trusted</dt>
          <dd>${escapeHtml(payload.trustedResultCount ?? 0)} results</dd>
          <dt>Pending</dt>
          <dd>${escapeHtml(payload.pendingReviewCount ?? 0)} matching artifacts unavailable to trusted retrieval</dd>
          <dt>Embedding route</dt>
          <dd>${escapeHtml(
            embeddingSearch.route
              ? `${embeddingSearch.route.provider}/${embeddingSearch.route.model} · ${embeddingSearch.status}`
              : embeddingSearch.status ?? "not used"
          )}</dd>
          <dt>Message</dt>
          <dd>${escapeHtml(payload.message ?? "")}</dd>
        </dl>
      </article>
    `);
  }
  if (embeddingStatus) {
    const route = embeddingStatus.route ?? {};
    const latestJob = embeddingStatus.latestJob ?? embeddingStatus.job ?? {};
    const counts = embeddingStatus.counts ?? {};
    sections.push(`
      <article class="research-card wide">
        <h3>Embedding Route</h3>
        <dl>
          <dt>Route</dt>
          <dd>${escapeHtml(`${route.routeKey ?? "default"} · ${route.provider ?? "unknown"} · ${route.model ?? "unknown"}`)}</dd>
          <dt>Dimensions</dt>
          <dd>${escapeHtml(route.dimensions ?? "unknown")}</dd>
          <dt>Trusted artifacts</dt>
          <dd>${escapeHtml(`${counts.trustedArtifacts ?? "-"} trusted · ${counts.activeIndexedArtifacts ?? "-"} indexed · ${counts.staleTrustedArtifacts ?? "-"} stale`)}</dd>
          <dt>Latest job</dt>
          <dd>${escapeHtml(latestJob.status ? `${latestJob.status} · ${latestJob.indexedCount ?? 0} indexed · ${latestJob.failureReason ?? "no failure"}` : "none")}</dd>
          <dt>Safety</dt>
          <dd>${escapeHtml(embeddingStatus.safety?.indexesOnlyApprovedEvidence ? "approved evidence only" : "review required")}</dd>
          <dt>Actions</dt>
          <dd>${escapeHtml((embeddingStatus.actionsTaken ?? []).join(", ") || "none")}</dd>
        </dl>
      </article>
    `);
  }
  if (graphPayload) {
    const graph = graphPayload.graph ?? {};
    const summary = graph.summary ?? {};
    const build = graphPayload.build ?? graphPayload.latestBuild ?? {};
    sections.push(`
      <article class="research-card wide">
        <h3>Research Evidence Graph</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(graph.status ?? "unknown")}</dd>
          <dt>Nodes</dt>
          <dd>${escapeHtml(`${summary.nodeCount ?? 0} nodes · ${summary.edgeCount ?? 0} edges`)}</dd>
          <dt>Sources</dt>
          <dd>${escapeHtml(`${summary.approvedSourceCount ?? 0} approved · ${summary.activeRunCount ?? 0} active runs`)}</dd>
          <dt>Artifacts</dt>
          <dd>${escapeHtml(`${summary.trustedArtifactCount ?? 0} trusted · ${summary.pendingArtifactCount ?? 0} pending`)}</dd>
          <dt>Latest build</dt>
          <dd>${escapeHtml(build.id ? `${build.status} · ${build.nodeCount ?? 0}/${build.edgeCount ?? 0} · ${build.graphHash ?? "no hash"}` : "none")}</dd>
          <dt>Safety</dt>
          <dd>${escapeHtml(graphPayload.safety?.rawArtifactTextReturned === false ? "metadata only · raw artifact text hidden" : "verify graph safety")}</dd>
          <dt>Actions</dt>
          <dd>${escapeHtml((graphPayload.actionsTaken ?? []).join(", ") || "none")}</dd>
        </dl>
        <h4>Node Types</h4>
        <ol class="research-event-list">
          ${Object.entries(summary.nodeTypes ?? {}).map(([key, count]) => `<li><b>${escapeHtml(key)}</b><span>${escapeHtml(count)}</span></li>`).join("") || "<li>No graph nodes yet.</li>"}
        </ol>
        <h4>Edges</h4>
        <ol class="research-event-list">
          ${(graph.edges ?? []).slice(0, 12).map((edge) => `<li><b>${escapeHtml(edge.type)}</b><span>${escapeHtml(`${edge.from} -> ${edge.to}`)}</span></li>`).join("") || "<li>No graph edges yet.</li>"}
        </ol>
      </article>
    `);
  }
  if (payload.evaluation || Array.isArray(payload.evaluations)) {
    const evaluation = payload.evaluation ?? payload.latest ?? {};
    const details = evaluation.evaluation ?? {};
    const claims = details.claims ?? [];
    sections.push(`
      <article class="research-card wide">
        <h3>Claim Citation Closure</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(payload.status ?? evaluation.status ?? "loaded")} · ${escapeHtml(payload.verdict ?? evaluation.verdict ?? "unknown")}</dd>
          <dt>Claims</dt>
          <dd>${escapeHtml(`${evaluation.claimCount ?? details.claimCount ?? 0} total · ${evaluation.supportedCount ?? details.supportedCount ?? 0} supported · ${evaluation.unsupportedCount ?? details.unsupportedCount ?? 0} unsupported · ${evaluation.lowConfidenceCount ?? details.lowConfidenceCount ?? 0} low confidence`)}</dd>
          <dt>Latest</dt>
          <dd>${escapeHtml(evaluation.id ? `${evaluation.id} · audit ${evaluation.auditEventId ?? "pending"}` : "none")}</dd>
          <dt>Safety</dt>
          <dd>${escapeHtml(payload.safety?.judgeCreatesEvidence === false || evaluation.safety?.judgeCreatesEvidence === false ? "labels only · no evidence invented" : "verify judge safety")}</dd>
          <dt>Actions</dt>
          <dd>${escapeHtml((payload.actionsTaken ?? details.actionsTaken ?? []).join(", ") || "none")}</dd>
        </dl>
        <h4>Claims</h4>
        <ol class="research-event-list">
          ${claims
            .slice(0, 8)
            .map(
              (claim) =>
                `<li><b>${escapeHtml(claim.status)}</b><span>${escapeHtml(claim.text)}${claim.citations?.length ? ` · cites ${escapeHtml(claim.citations.map((item) => item.artifactId).join(", "))}` : ""}</span></li>`
            )
            .join("") || "<li>No claim-level evaluation yet.</li>"}
        </ol>
      </article>
    `);
  }
  if (worker) {
    sections.push(`
      <article class="research-card wide">
        <h3>Worker Status</h3>
        <dl>
          <dt>Default mode</dt>
          <dd>${escapeHtml(worker.defaultMode ?? "unknown")}</dd>
          <dt>Deterministic fetch</dt>
          <dd>${escapeHtml(worker.modes?.deterministicFetch?.enabled ? "enabled" : "disabled")} · ${escapeHtml(worker.modes?.deterministicFetch?.description ?? "")}</dd>
          <dt>MockWorker</dt>
          <dd>${escapeHtml(worker.modes?.mockWorker?.enabled ? "enabled" : "disabled")} · trusted retrieval ${escapeHtml(worker.modes?.mockWorker?.trustedRetrieval ?? false)}</dd>
          <dt>OpenClaw</dt>
          <dd>${escapeHtml(worker.modes?.openclaw?.enabled ? "enabled" : "feature-gated")} · ${escapeHtml(worker.modes?.openclaw?.description ?? "")} · ${escapeHtml(worker.modes?.openclaw?.approvalGate ?? "")}</dd>
          <dt>Hermes</dt>
          <dd>${escapeHtml(worker.modes?.hermes?.enabled ? "enabled" : "feature-gated")} · ${escapeHtml(worker.modes?.hermes?.description ?? "")} · ${escapeHtml(worker.modes?.hermes?.approvalGate ?? "")}</dd>
        </dl>
      </article>
    `);
  }
  if (hasKpiPayload) {
    sections.push(`
      <article class="research-card">
        <h3>Research KPIs</h3>
        <dl>
          <dt>Sources</dt>
          <dd>${escapeHtml(`${kpis.sources?.approved ?? 0} approved · ${kpis.sources?.pendingReview ?? 0} pending · ${kpis.sources?.total ?? 0} total`)}</dd>
          <dt>Runs</dt>
          <dd>${escapeHtml(`${kpis.runs?.active ?? 0} active · ${kpis.runs?.total ?? 0} total`)}</dd>
          <dt>Artifacts</dt>
          <dd>${escapeHtml(`${kpis.artifacts?.trustedRetrieval ?? 0} trusted · ${kpis.artifacts?.pendingReview ?? 0} pending · ${kpis.artifacts?.total ?? 0} total`)}</dd>
          <dt>Feedback queue</dt>
          <dd>${escapeHtml(kpis.reviewQueue?.feedbackItems ?? 0)}</dd>
          <dt>Artifact queue</dt>
          <dd>${escapeHtml(kpis.reviewQueue?.pendingArtifacts ?? 0)}</dd>
          <dt>Audit events</dt>
          <dd>${escapeHtml(kpis.audit?.totalEvents ?? 0)}</dd>
          <dt>Schedules</dt>
          <dd>${escapeHtml(`${kpis.schedules?.active ?? 0} active · ${kpis.schedules?.paused ?? 0} paused · ${kpis.schedules?.due ?? 0} due`)}</dd>
        </dl>
      </article>
    `);
  }
  if (payload.scheduler) {
    sections.push(`
      <article class="research-card wide">
        <h3>Scheduled Research Tick</h3>
        <dl>
          <dt>Mode</dt>
          <dd>${escapeHtml(payload.scheduler.mode)}</dd>
          <dt>Processed</dt>
          <dd>${escapeHtml(payload.scheduler.processedCount ?? 0)}</dd>
          <dt>Blocked</dt>
          <dd>${escapeHtml(payload.scheduler.blockedCount ?? 0)}</dd>
          <dt>Actions</dt>
          <dd>${escapeHtml((payload.scheduler.actionsTaken ?? []).join(", ") || "none")}</dd>
        </dl>
      </article>
    `);
  }
  if (schedulerDaemon?.daemon) {
    const daemon = schedulerDaemon.daemon;
    const runtime = daemon.runtime ?? {};
    const safety = schedulerDaemon.safety ?? {};
    sections.push(`
      <article class="research-card wide">
        <h3>Scheduler Daemon</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(`${daemon.status ?? "unknown"} · process ${runtime.processStatus ?? "unknown"}`)}</dd>
          <dt>Cadence</dt>
          <dd>${escapeHtml(`${daemon.intervalMs ?? "-"} ms · limit ${daemon.tickLimit ?? "-"}`)}</dd>
          <dt>Due schedules</dt>
          <dd>${escapeHtml(`${schedulerDaemon.dueCount ?? schedulerDaemon.schedules?.dueCount ?? 0} due · ${schedulerDaemon.schedules?.activeCount ?? 0} active`)}</dd>
          <dt>Last tick</dt>
          <dd>${escapeHtml(`${daemon.lastTickAt ?? "never"} · processed ${daemon.lastProcessedCount ?? 0} · blocked ${daemon.lastBlockedCount ?? 0}`)}</dd>
          <dt>Tick count</dt>
          <dd>${escapeHtml(`${daemon.tickCount ?? 0} ticks · ${daemon.overlapSkippedCount ?? 0} overlaps skipped`)}</dd>
          <dt>Actions</dt>
          <dd>${escapeHtml((daemon.lastActions ?? []).join(", ") || "none")}</dd>
          <dt>Safety</dt>
          <dd>${escapeHtml(safety.onlyApprovedSchedules ? "approved schedules only · no hidden worker dispatch" : "verify scheduler safety")}</dd>
        </dl>
      </article>
    `);
  }
  if (sources.length) {
    sections.push(
      sources
        .slice(0, 8)
        .map(
          (source) => `
            <article class="research-card">
              <h3>${escapeHtml(source.title)}</h3>
              <dl>
                <dt>Status</dt>
                <dd>${escapeHtml(source.status)} · priority ${escapeHtml(source.priority)}</dd>
                <dt>Authority</dt>
                <dd>${escapeHtml(source.authorityLevel)}</dd>
                <dt>URL</dt>
                <dd>${escapeHtml(source.baseUrl)}</dd>
                <dt>Last run</dt>
                <dd>${escapeHtml(source.lastRunAt ?? "none")} · ${escapeHtml(source.lastStatus ?? "not run")}</dd>
              </dl>
              <div class="button-row">
                ${source.status === "pending_review" ? `<button type="button" data-research-source-approve="${escapeHtml(source.id)}">Approve</button>` : ""}
                ${source.status === "pending_review" ? `<button type="button" data-research-source-reject="${escapeHtml(source.id)}">Reject</button>` : ""}
                <button type="button" data-research-run-source="${escapeHtml(source.id)}">Run</button>
              </div>
            </article>
          `
        )
        .join("")
    );
  }
  if (runs.length) {
    sections.push(
      runs
        .slice(0, 8)
        .map(
          (item) => `
            <article class="research-card">
              <h3>${escapeHtml(item.topic || item.sourceKey || item.id)}</h3>
              <dl>
                <dt>Status</dt>
                <dd>${escapeHtml(item.status)}</dd>
                <dt>Source</dt>
                <dd>${escapeHtml(item.sourceKey ?? "none")}</dd>
                <dt>Started</dt>
                <dd>${escapeHtml(item.startedAt)}</dd>
                <dt>Summary</dt>
                <dd>${escapeHtml(item.summary)}</dd>
              </dl>
              <div class="button-row">
                <button type="button" data-research-run-open="${escapeHtml(item.id)}">Open</button>
                ${item.status === "queued" || item.status === "running" ? `<button type="button" data-research-run-cancel="${escapeHtml(item.id)}">Cancel</button>` : ""}
                ${item.status === "queued" ? `<button type="button" data-research-run-execute="${escapeHtml(item.id)}">Execute Fetch</button>` : ""}
                ${item.status === "queued" ? `<button type="button" data-research-run-mock="${escapeHtml(item.id)}">MockWorker</button>` : ""}
                ${item.status === "queued" ? `<button type="button" data-research-run-openclaw="${escapeHtml(item.id)}">OpenClaw</button>` : ""}
                ${item.status === "queued" ? `<button type="button" data-research-run-hermes="${escapeHtml(item.id)}">Hermes</button>` : ""}
                <button type="button" data-research-run-retry="${escapeHtml(item.id)}">Retry</button>
              </div>
            </article>
          `
        )
        .join("")
    );
  }
  if (schedules.length) {
    sections.push(
      schedules
        .slice(0, 8)
        .map(
          (schedule) => `
            <article class="research-card">
              <h3>${escapeHtml(schedule.scheduleLabel || schedule.scheduleKey)}</h3>
              <dl>
                <dt>Status</dt>
                <dd>${escapeHtml(schedule.status)} · approval ${escapeHtml(schedule.approvalStatus)}</dd>
                <dt>Next run</dt>
                <dd>${escapeHtml(schedule.nextRunAt)}</dd>
                <dt>Interval</dt>
                <dd>${escapeHtml(`${schedule.intervalHours}h · ${schedule.workerMode}`)}</dd>
                <dt>Source</dt>
                <dd>${escapeHtml(schedule.sourceKey ?? "priority approved source")}</dd>
                <dt>Runs</dt>
                <dd>${escapeHtml(`${schedule.runCount ?? 0} · last ${schedule.lastStatus ?? "none"}`)}</dd>
              </dl>
            </article>
          `
        )
        .join("")
    );
  }
  if (run) {
    sections.push(`
      <article class="research-card wide">
        <h3>Run Detail</h3>
        <dl>
          <dt>Run</dt>
          <dd>${escapeHtml(run.id)}</dd>
          <dt>Status</dt>
          <dd>${escapeHtml(run.status)}</dd>
          <dt>Source</dt>
          <dd>${escapeHtml(run.sourceKey ?? "none")}</dd>
          <dt>Summary</dt>
          <dd>${escapeHtml(run.summary)}</dd>
          ${workerResult ? `<dt>Worker result</dt><dd>${escapeHtml(`${workerResult.status} · ${(workerResult.actionsTaken ?? []).join(", ") || "no actions reported"}`)}</dd>` : ""}
        </dl>
        <div class="button-row">
          ${run.status === "queued" ? `<button type="button" data-research-run-execute="${escapeHtml(run.id)}">Execute Fetch</button>` : ""}
          ${run.status === "queued" ? `<button type="button" data-research-run-mock="${escapeHtml(run.id)}">MockWorker</button>` : ""}
          ${run.status === "queued" ? `<button type="button" data-research-run-openclaw="${escapeHtml(run.id)}">OpenClaw</button>` : ""}
          ${run.status === "queued" ? `<button type="button" data-research-run-hermes="${escapeHtml(run.id)}">Hermes</button>` : ""}
        </div>
        <h4>Events</h4>
        <ol class="research-event-list">
          ${events.map((event) => `<li><b>${escapeHtml(event.eventType)}</b><span>${escapeHtml(event.status)} · ${escapeHtml(event.summary)}</span></li>`).join("") || "<li>No events recorded.</li>"}
        </ol>
        <h4>Artifacts</h4>
        <ol class="research-artifact-list">
          ${
            artifacts
              .map(
                (artifact) => `
                  <li>
                    <b>${escapeHtml(artifact.artifactType ?? artifact.id)}</b>
                    <span>${escapeHtml(artifact.citationStatus ?? "unknown")} · ${escapeHtml(artifact.title ?? artifact.sourceUrl ?? "")}</span>
                    <span>content ${escapeHtml(artifact.contentHash ?? "none")} · extraction ${escapeHtml(artifact.extractionHash ?? "none")}</span>
                    <p>${escapeHtml(artifact.safeTextPreview ?? "")}</p>
                    <span>
                      <button type="button" data-research-entities-extract="${escapeHtml(artifact.id)}">Extract Entities</button>
                      ${artifact.citationStatus === "extracted_pending_review" ? `<button type="button" data-research-artifact-approve="${escapeHtml(artifact.id)}">Approve Citation</button>` : ""}
                      ${artifact.citationStatus === "extracted_pending_review" ? `<button type="button" data-research-artifact-quarantine="${escapeHtml(artifact.id)}">Quarantine</button>` : ""}
                    </span>
                  </li>
                `
              )
              .join("") || "<li>No artifacts recorded.</li>"
          }
        </ol>
      </article>
    `);
  }
  if (artifacts.length && !run) {
    sections.push(`
      <article class="research-card wide">
        <h3>Artifact Review Queue</h3>
        <ol class="research-artifact-list">
          ${artifacts
            .map(
              (artifact) => `
                <li>
                  <b>${escapeHtml(artifact.title ?? artifact.artifactType ?? artifact.id)}</b>
                  <span>${escapeHtml(artifact.citationStatus ?? "unknown")} · ${escapeHtml(artifact.sourceUrl ?? "")}</span>
                  <span>run ${escapeHtml(artifact.runId ?? "none")} · content ${escapeHtml(artifact.contentHash ?? "none")}</span>
                  <p>${escapeHtml(artifact.safeTextPreview ?? "")}</p>
                  <span>
                    <button type="button" data-research-entities-extract="${escapeHtml(artifact.id)}">Extract Entities</button>
                    ${artifact.citationStatus === "extracted_pending_review" ? `<button type="button" data-research-artifact-approve="${escapeHtml(artifact.id)}">Approve Citation</button>` : ""}
                    ${artifact.citationStatus === "extracted_pending_review" ? `<button type="button" data-research-artifact-quarantine="${escapeHtml(artifact.id)}">Quarantine</button>` : ""}
                  </span>
                </li>
              `
            )
            .join("")}
        </ol>
      </article>
    `);
  }
  if (searchResults.length) {
    sections.push(`
      <article class="research-card wide">
        <h3>Search Results</h3>
        <ol class="research-artifact-list">
          ${searchResults
            .map(
              (result) => `
                <li>
                  <b>${escapeHtml(result.title ?? result.artifactId)}</b>
                  <span>${escapeHtml(result.citationStatus)} · score ${escapeHtml(result.score)} · ${escapeHtml(result.confidence ?? "unknown")}</span>
                  <span>lexical ${escapeHtml(result.lexicalScore ?? 0)} · embedding ${escapeHtml(result.embeddingScore ?? 0)} · ${escapeHtml(result.embeddingRoute?.provider ?? "no embedding")}</span>
                  <span>${escapeHtml(result.sourceUrl ?? "")}</span>
                  <p>${escapeHtml(result.snippet ?? "")}</p>
                </li>
              `
            )
            .join("")}
        </ol>
      </article>
    `);
  }
  researchConsole.innerHTML = sections.join("") || `<p>No research ${escapeHtml(mode)} data yet.</p>`;
}

function renderAuditLog(payload) {
  if (!researchConsole) return;
  const events = payload.events ?? [];
  const chain = payload.chain ?? {};
  const eventTypes = payload.eventTypes ?? [];
  researchConsole.innerHTML = `
    <article class="research-card wide">
      <h3>Audit Log</h3>
      <dl>
        <dt>Status</dt>
        <dd>${escapeHtml(payload.status ?? "unknown")}</dd>
        <dt>Returned</dt>
        <dd>${escapeHtml(`${payload.pagination?.returned ?? events.length} of ${payload.pagination?.total ?? events.length}`)}</dd>
        <dt>Chain</dt>
        <dd>${escapeHtml(chain.valid ? "valid" : "attention")} · ${escapeHtml(chain.checkedChains ?? 0)} chains · ${escapeHtml(chain.hashedCount ?? 0)} hashed events</dd>
        <dt>Safety</dt>
        <dd>${escapeHtml(payload.safety?.rawDetailsReturned === false ? "raw details hidden" : "review")}</dd>
      </dl>
    </article>
    ${
      eventTypes.length
        ? `<article class="research-card">
            <h3>Event Types</h3>
            <ol class="research-event-list">
              ${eventTypes.map((item) => `<li><b>${escapeHtml(item.eventType)}</b><span>${escapeHtml(item.count)} events</span></li>`).join("")}
            </ol>
          </article>`
        : ""
    }
    ${
      events.length
        ? events
            .map(
              (event) => `
                <article class="research-card">
                  <h3>${escapeHtml(event.eventType)}</h3>
                  <dl>
                    <dt>Event</dt>
                    <dd>${escapeHtml(event.id)}</dd>
                    <dt>Kind</dt>
                    <dd>${escapeHtml(event.actionKind)}</dd>
                    <dt>Created</dt>
                    <dd>${escapeHtml(event.createdAt)}</dd>
                    <dt>Session</dt>
                    <dd>${escapeHtml(event.sessionId ?? "root")}</dd>
                    <dt>Hash</dt>
                    <dd>${escapeHtml(event.eventHash ?? "legacy")}</dd>
                    <dt>Details hash</dt>
                    <dd>${escapeHtml(event.detailsHash)}</dd>
                  </dl>
                  <pre>${escapeHtml(event.detailsPreview ?? "")}</pre>
                </article>
              `
            )
            .join("")
        : `<article class="research-card"><h3>No Audit Events</h3><p>No matching audit events found.</p></article>`
    }
  `;
}

function renderOperatorProposalCard(proposal) {
  const canDecide = proposal.status === "pending_approval" && Number(proposal.executionCount ?? 0) === 0;
  return `
    <article class="research-card">
      <h3>${escapeHtml(proposal.toolKey ?? proposal.id)}</h3>
      <dl>
        <dt>Proposal</dt>
        <dd>${escapeHtml(proposal.id)}</dd>
        <dt>Status</dt>
        <dd>${escapeHtml(proposal.status)} · ${escapeHtml(proposal.riskLevel ?? "unknown")} risk</dd>
        <dt>Effect</dt>
        <dd>${escapeHtml(proposal.expectedEffect ?? "none")}</dd>
        <dt>Request</dt>
        <dd>${escapeHtml(proposal.requestMessagePreview ?? "")}</dd>
        <dt>Args hash</dt>
        <dd>${escapeHtml(proposal.argsHash ?? "none")}</dd>
        <dt>Executions</dt>
        <dd>${escapeHtml(proposal.executionCount ?? 0)}</dd>
      </dl>
      <pre>${escapeHtml(JSON.stringify(proposal.args ?? {}, null, 2))}</pre>
      ${
        canDecide
          ? `<div class="button-row">
              <button type="button" data-operator-proposal-approve="${escapeHtml(proposal.id)}">Approve Proposal</button>
              <button type="button" data-operator-proposal-reject="${escapeHtml(proposal.id)}">Reject Proposal</button>
            </div>`
          : ""
      }
    </article>
  `;
}

function renderOperatorAssistantConsole(payload, mode = "assistant") {
  if (!operatorAssistantConsole) return;
  const sections = [];
  const tools = payload.tools ?? [];
  const proposals = payload.proposals ?? (payload.proposal ? [payload.proposal] : []);
  const toolResult = payload.toolResult ?? null;
  const result = payload.result ?? null;
  if (payload.status || payload.mode || payload.message) {
    sections.push(`
      <article class="research-card wide">
        <h3>Operator Assistant</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(payload.status ?? "ok")} · ${escapeHtml(payload.mode ?? mode)}</dd>
          <dt>Message</dt>
          <dd>${escapeHtml(payload.message ?? payload.error ?? "")}</dd>
          <dt>Tool</dt>
          <dd>${escapeHtml(payload.toolCall?.toolKey ?? payload.proposal?.toolKey ?? "none")}</dd>
          <dt>Actions taken</dt>
          <dd>${escapeHtml((payload.actionsTaken ?? []).join(", ") || "none")}</dd>
          <dt>Audit</dt>
          <dd>${escapeHtml(Array.isArray(payload.audit) ? payload.audit.map((item) => item.eventType).join(", ") : payload.audit?.eventType ?? "none")}</dd>
        </dl>
      </article>
    `);
  }
  if (tools.length) {
    const readCount = tools.filter((tool) => tool.type === "read").length;
    const writeCount = tools.filter((tool) => tool.type === "write").length;
    sections.push(`
      <article class="research-card wide">
        <h3>Registered Operator Tools</h3>
        <dl>
          <dt>Read tools</dt>
          <dd>${escapeHtml(readCount)}</dd>
          <dt>Write tools</dt>
          <dd>${escapeHtml(writeCount)} gated</dd>
          <dt>Version</dt>
          <dd>${escapeHtml(payload.version ?? "unknown")}</dd>
        </dl>
        <ol class="research-artifact-list">
          ${tools
            .map(
              (tool) => `
                <li>
                  <b>${escapeHtml(tool.key)}</b>
                  <span>${escapeHtml(tool.type)} · approval ${escapeHtml(tool.approvalRequired ? "required" : "not required")} · ${escapeHtml(tool.riskLevel)}</span>
                </li>
              `
            )
            .join("")}
        </ol>
      </article>
    `);
  }
  if (toolResult) {
    sections.push(`
      <article class="research-card wide">
        <h3>Read Tool Result</h3>
        <pre>${escapeHtml(JSON.stringify(toolResult, null, 2))}</pre>
      </article>
    `);
  }
  if (result) {
    sections.push(`
      <article class="research-card wide">
        <h3>Executed Proposal Result</h3>
        <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
      </article>
    `);
  }
  if (proposals.length) {
    sections.push(...proposals.slice(0, 12).map(renderOperatorProposalCard));
  }
  operatorAssistantConsole.innerHTML = sections.join("") || `<p>No operator ${escapeHtml(mode)} data yet.</p>`;
}

async function loadResearchKpis() {
  const result = await api("/api/research/kpis");
  researchStatus.textContent = `${result.sources?.approved ?? 0} approved sources · ${result.runs?.total ?? 0} runs`;
  renderResearchConsole(result, "kpis");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchAnalytics() {
  const result = await api("/api/research/analytics");
  const budget = result.budget ?? {};
  const usage = budget.usage ?? {};
  researchStatus.textContent = `${result.kpis?.runs?.total ?? 0} runs · budget ${usage.queuedRuns ?? 0}/${budget.policy?.dailyRunLimit ?? 0}`;
  renderResearchConsole(result, "analytics");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchBudget() {
  const result = await api("/api/research/budget");
  const policy = result.policy ?? {};
  const usage = result.usage ?? {};
  document.querySelector("#researchBudgetDailyRuns").value = String(policy.dailyRunLimit ?? 25);
  document.querySelector("#researchBudgetDailyCostCents").value = String(policy.dailyCostLimitCents ?? 1000);
  document.querySelector("#researchBudgetKillSwitch").value = policy.killSwitchEnabled ? "true" : "false";
  document.querySelector("#researchBudgetKillSwitchReason").value = policy.killSwitchReason ?? "";
  researchStatus.textContent = `Budget ${usage.queuedRuns ?? 0}/${policy.dailyRunLimit ?? 0} runs · kill switch ${policy.killSwitchEnabled ? "on" : "off"}`;
  renderResearchConsole(result, "budget");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchReviewQueues() {
  const result = await api("/api/research/review-queues");
  const counts = result.counts ?? {};
  researchStatus.textContent = `${counts.pendingArtifacts ?? 0} artifacts · ${counts.lowConfidenceAnswers ?? 0} low confidence · ${counts.downvotedFeedback ?? 0} downvotes`;
  renderResearchConsole(result, "review queues");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function saveResearchBudget() {
  const result = await api("/api/research/budget", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      enabled: true,
      dailyRunLimit: Number(value("researchBudgetDailyRuns") || 0),
      dailyCostLimitCents: Number(value("researchBudgetDailyCostCents") || 0),
      killSwitchEnabled: value("researchBudgetKillSwitch") === "true",
      killSwitchReason: value("researchBudgetKillSwitchReason") || ""
    })
  });
  const policy = result.policy ?? {};
  researchStatus.textContent = `Budget saved · ${policy.dailyRunLimit ?? 0} runs · kill switch ${policy.killSwitchEnabled ? "on" : "off"}`;
  renderResearchConsole(result, "budget");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

function renderHumanHandoffs(payload) {
  const handoffs = payload.handoffs ?? [];
  researchConsole.innerHTML =
    handoffs
      .map(
        (handoff) => `
          <article class="research-card wide handoff-card">
            <h3>Human Handoff</h3>
            <dl>
              <dt>Status</dt>
              <dd>${escapeHtml(handoff.status ?? "open")} · ${escapeHtml(handoff.priority ?? "urgent")}</dd>
              <dt>Type</dt>
              <dd>${escapeHtml(handoff.handoffType ?? "urgent_emergency")}</dd>
              <dt>Session</dt>
              <dd>${escapeHtml(handoff.sessionId ?? "not reported")}</dd>
              <dt>Task</dt>
              <dd>${escapeHtml(handoff.taskId ?? "not reported")}</dd>
              <dt>Summary</dt>
              <dd>${escapeHtml(handoff.summary ?? "")}</dd>
              <dt>Audit</dt>
              <dd>${escapeHtml(handoff.auditEventId ?? "not reported")}</dd>
            </dl>
          </article>
        `
      )
      .join("") || `<p>No human handoffs found for the current filter.</p>`;
}

async function loadHumanHandoffs() {
  const params = new URLSearchParams({ limit: "25" });
  const sessionId = value("sessionId");
  if (sessionId) params.set("sessionId", sessionId);
  const result = await api(`/api/handoffs?${params.toString()}`);
  researchStatus.textContent = `${result.openCount ?? 0} open handoff(s) · ${result.count ?? 0} listed`;
  renderHumanHandoffs(result);
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchWorkerStatus() {
  const result = await api("/api/research/worker-status");
  researchStatus.textContent = `${result.defaultMode ?? "unknown"} worker mode · mock ${result.modes?.mockWorker?.enabled ? "available" : "unavailable"}`;
  renderResearchConsole(result, "worker status");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchEmbeddingStatus() {
  const result = await api("/api/research/embeddings/status");
  const route = result.route ?? {};
  const counts = result.counts ?? {};
  researchStatus.textContent = `${route.provider ?? "unknown"} embeddings · ${counts.activeIndexedArtifacts ?? 0}/${counts.trustedArtifacts ?? 0} trusted indexed`;
  renderResearchConsole(result, "embedding status");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function chooseResearchEmbeddingRoute() {
  const dimensions = Number(value("researchEmbeddingDimensions") || 64);
  const result = await api("/api/research/embeddings/route", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      provider: value("researchEmbeddingProvider") || "local_tfidf",
      dimensions,
      reason: "Operator selected from local proof dashboard."
    })
  });
  researchStatus.textContent = `${result.route?.provider ?? "unknown"} route selected · ${result.route?.dimensions ?? "?"} dimensions`;
  renderResearchConsole({ ...result, counts: {} }, "embedding route");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function reindexResearchEmbeddings() {
  const result = await api("/api/research/embeddings/reindex", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      routeKey: "default"
    })
  });
  researchStatus.textContent = `${result.status ?? "reindex"} · ${result.job?.indexedCount ?? 0} indexed`;
  renderResearchConsole(result, "embedding reindex");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchGraph() {
  const result = await api("/api/research/graph");
  const summary = result.graph?.summary ?? {};
  researchStatus.textContent = `${summary.nodeCount ?? 0} graph nodes · ${summary.edgeCount ?? 0} edges`;
  renderResearchConsole(result, "research graph");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function buildResearchGraph() {
  const result = await api("/api/research/graph/build", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      limit: 250
    })
  });
  researchStatus.textContent = `${result.status ?? "graph build"} · ${result.build?.nodeCount ?? 0} nodes · ${result.build?.edgeCount ?? 0} edges`;
  renderResearchConsole(result, "research graph build");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadCitationClosure() {
  const result = await api("/api/research/citation-closure");
  const latest = result.latest ?? {};
  researchStatus.textContent = `${result.evaluations?.length ?? 0} citation evaluations · latest ${latest.verdict ?? "none"}`;
  renderResearchConsole(result, "citation closure");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function evaluateCitationClosure() {
  const result = await api("/api/research/citation-closure/evaluate", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      question: value("researchSearchQuery"),
      answer: value("researchAnswerToJudge"),
      limit: 12,
      minSupportScore: 3
    })
  });
  researchStatus.textContent = `${result.status ?? "citation closure"} · ${result.verdict ?? "unknown"}`;
  renderResearchConsole(result, "citation closure");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function uploadResearchDocument() {
  const input = document.querySelector("#researchDocumentFile");
  const file = input?.files?.[0];
  if (!file) throw new Error("Choose a research PDF or text file first.");
  const contentBase64 = await fileToBase64(file);
  const result = await api("/api/research/documents", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      filename: file.name,
      contentType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain"),
      contentBase64,
      title: value("researchDocumentTitle") || file.name,
      workflowKeys: ["general_rag", "eligibility_benefits_navigation"],
      documentKind: "research_knowledge_base_pdf",
      sourceStatus: "approved"
    })
  });
  researchStatus.textContent = `${result.status ?? "uploaded"} · ${result.artifact?.citationStatus ?? "pending review"}`;
  renderResearchConsole(result, "research document upload");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchSources() {
  const result = await api("/api/research/sources");
  researchStatus.textContent = `${result.sources?.length ?? 0} sources loaded`;
  renderResearchConsole(result, "sources");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchArtifacts() {
  const result = await api("/api/research/artifacts?citationStatus=extracted_pending_review");
  researchStatus.textContent = `${result.artifacts?.length ?? 0} pending artifacts`;
  renderResearchConsole(result, "artifacts");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchEntities() {
  const result = await api("/api/research/entities?limit=50");
  researchStatus.textContent = `${result.counts?.total ?? result.entities?.length ?? 0} extracted research entities`;
  renderResearchConsole(result, "research entities");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function extractResearchEntities(artifactId) {
  const result = await api(`/api/research/artifacts/${encodeURIComponent(artifactId)}/entities/extract`, {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email")
    })
  });
  researchStatus.textContent = `${result.entityCount ?? result.entities?.length ?? 0} entities extracted · ${result.artifact?.id ?? artifactId}`;
  renderResearchConsole(result, "research entities");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function searchResearchEvidence() {
  const query = encodeURIComponent(value("researchSearchQuery"));
  const result = await api(`/api/research/search?q=${query}`);
  researchStatus.textContent = `${result.status} · ${result.trustedResultCount ?? 0} trusted results`;
  renderResearchConsole(result, "evidence search");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchRuns() {
  const result = await api("/api/research/runs");
  researchStatus.textContent = `${result.runs?.length ?? 0} research runs loaded`;
  renderResearchConsole(result, "runs");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchSchedules() {
  const result = await api("/api/research/schedules");
  researchStatus.textContent = `${result.schedules?.length ?? 0} schedules loaded · ${result.dueCount ?? 0} due`;
  renderResearchConsole(result, "schedules");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadResearchSchedulerStatus() {
  const result = await api("/api/research/scheduler/status");
  const daemon = result.daemon ?? {};
  researchStatus.textContent = `${daemon.status ?? "unknown"} scheduler daemon · process ${daemon.runtime?.processStatus ?? "unknown"} · ${result.dueCount ?? 0} due`;
  renderResearchConsole(result, "scheduler daemon");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function tickResearchSchedulerDaemon() {
  const result = await api("/api/research/scheduler/tick", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      executeDueRuns: false,
      limit: 5,
      trigger: "operator_dashboard_daemon_tick"
    })
  });
  researchStatus.textContent = `${result.status ?? "scheduler tick"} · ${result.scheduler?.processedCount ?? 0} queued · ${result.scheduler?.blockedCount ?? 0} blocked`;
  renderResearchConsole(result, "scheduler daemon tick");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function tickResearchSchedules() {
  const result = await api("/api/research/schedules/tick", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      execute: false,
      limit: 5
    })
  });
  researchStatus.textContent = `${result.scheduler?.processedCount ?? 0} scheduled runs queued · ${result.scheduler?.blockedCount ?? 0} blocked`;
  renderResearchConsole({ ...result, runs: result.processed?.map((item) => item.run) ?? [], schedules: result.processed?.map((item) => item.schedule) ?? [] }, "schedule tick");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadAuditLog() {
  const params = new URLSearchParams({
    limit: "25"
  });
  const prefix = value("auditEventPrefix");
  const sessionId = value("sessionId");
  if (prefix) params.set("prefix", prefix);
  if (sessionId) params.set("sessionId", sessionId);
  const result = await api(`/api/audit?${params.toString()}`);
  researchStatus.textContent = `${result.events?.length ?? 0} audit events · chain ${result.chain?.valid ? "valid" : "attention"}`;
  renderAuditLog(result);
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadOperatorTools() {
  const result = await api("/api/operator/tools");
  const readCount = (result.tools ?? []).filter((tool) => tool.type === "read").length;
  const writeCount = (result.tools ?? []).filter((tool) => tool.type === "write").length;
  operatorAssistantStatus.textContent = `${readCount} read tools · ${writeCount} gated write tools`;
  renderOperatorAssistantConsole(result, "tools");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadOperatorProposals(status = null) {
  const params = new URLSearchParams({
    actorUserId: value("email"),
    limit: "25"
  });
  if (status) params.set("status", status);
  const result = await api(`/api/operator/proposals?${params.toString()}`);
  operatorAssistantStatus.textContent = `${result.proposals?.length ?? 0} assistant proposals loaded`;
  renderOperatorAssistantConsole(result, "proposals");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function runOperatorAssistant() {
  const message = value("operatorAssistantMessage");
  if (!message) throw new Error("Enter an operator request first.");
  const result = await api("/api/operator/assistant", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      message
    })
  });
  operatorAssistantStatus.textContent = `${result.status ?? "ok"} · actions ${(result.actionsTaken ?? []).join(", ") || "none"}`;
  renderOperatorAssistantConsole(result, "assistant result");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function decideOperatorProposal(proposalId, decision) {
  const result = await api(`/api/operator/proposals/${encodeURIComponent(proposalId)}/${decision}`, {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      reason: `Operator ${decision} from Phase 10J dashboard.`
    })
  });
  operatorAssistantStatus.textContent = `${result.status ?? "decided"} · actions ${(result.actionsTaken ?? []).join(", ") || "none"}`;
  renderOperatorAssistantConsole(result, "proposal decision");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function startResearchRun(sourceId = null) {
  const result = await api("/api/research/runs", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      sourceId,
      topic: value("researchTopic"),
      workflowKey: "general_rag",
      query: {
        requestedFrom: "operator_dashboard",
        topic: value("researchTopic")
      }
    })
  });
  researchStatus.textContent = `${result.run.status} · ${result.run.id}`;
  renderResearchConsole({ runs: [result.run], run: result.run, source: result.source, events: [result.event] }, "run");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function proposeResearchSource() {
  const result = await api("/api/research/sources/propose", {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      url: value("researchSourceUrl"),
      title: value("researchSourceTitle"),
      workflowKeys: ["general_rag", "eligibility_benefits_navigation"],
      reason: "Operator proposed from local proof dashboard."
    })
  });
  researchStatus.textContent = `${result.source.status} · ${result.source.sourceKey}`;
  renderResearchConsole({ sources: [result.source] }, "source proposal");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function reviewResearchSource(sourceId, decision) {
  const result = await api(`/api/research/sources/${encodeURIComponent(sourceId)}/${decision}`, {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      reason: `Operator ${decision} from local proof dashboard.`
    })
  });
  researchStatus.textContent = `${result.source.status} · ${result.source.sourceKey}`;
  renderResearchConsole({ sources: [result.source] }, "source review");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function openResearchRun(runId) {
  const result = await api(`/api/research/runs/${encodeURIComponent(runId)}`);
  researchStatus.textContent = `${result.run.status} · ${result.run.id}`;
  renderResearchConsole(result, "run detail");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function cancelResearchRun(runId) {
  const result = await api(`/api/research/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      reason: "Cancelled from operator dashboard."
    })
  });
  researchStatus.textContent = `${result.run.status} · ${result.run.id}`;
  renderResearchConsole({ runs: [result.run], run: result.run, events: [result.event] }, "cancelled run");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function retryResearchRun(runId) {
  const result = await api(`/api/research/runs/${encodeURIComponent(runId)}/retry`, {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      reason: "Retried from operator dashboard."
    })
  });
  researchStatus.textContent = `${result.run.status} retry · ${result.run.id}`;
  renderResearchConsole({ runs: [result.run], run: result.run, events: [result.event] }, "retry run");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function executeResearchRun(runId, workerMode = "deterministic_fetch") {
  const adaptiveWorker = workerMode === "openclaw" || workerMode === "hermes";
  const result = await api(`/api/research/runs/${encodeURIComponent(runId)}/execute`, {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      workerMode,
      approvedWorkerDispatch: adaptiveWorker
    })
  });
  researchStatus.textContent = `${result.run.status} · ${result.run.id} · ${workerMode}`;
  renderResearchConsole(result, "executed run");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function reviewResearchArtifact(artifactId, decision) {
  const result = await api(`/api/research/artifacts/${encodeURIComponent(artifactId)}/review`, {
    method: "POST",
    body: JSON.stringify({
      actorUserId: value("email"),
      decision,
      reason: `Operator ${decision} from local proof dashboard.`
    })
  });
  researchStatus.textContent = `${result.artifact.citationStatus} · ${result.artifact.id}`;
  renderResearchConsole({ artifacts: [result.artifact], events: [result.event] }, "artifact review");
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function loadPortalPages() {
  const latest = await api("/api/portal-pages/latest");
  renderPortalPages(latest);
  trace.textContent = JSON.stringify(latest, null, 2);
}

async function loadHarness() {
  const email = encodeURIComponent(value("email"));
  const result = await api(`/api/memory/harness?email=${email}`);
  renderHarness(result);
  trace.textContent = JSON.stringify(result, null, 2);
}

async function runHeartbeat() {
  const result = await api("/api/memory/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      email: value("email"),
      sessionId: value("sessionId") || null
    })
  });
  harnessStatus.textContent = `${result.dueJobs.length} due jobs · ${result.pendingActions.length} actions`;
  trace.textContent = JSON.stringify(result, null, 2);
  await loadHarness();
}

async function planClaimFollowup() {
  const result = await api("/api/memory/events", {
    method: "POST",
    body: JSON.stringify({
      email: value("email"),
      sessionId: value("sessionId") || null,
      eventType: "claim_submitted",
      payload: {
        sourceTable: "operator_event",
        sourceId: `ui_${Date.now()}`
      }
    })
  });
  renderHarness(result.harness);
  trace.textContent = JSON.stringify(result, null, 2);
}

async function checkProductMemory() {
  const result = await api("/api/product-memory/status", { timeoutMs: 90000 });
  renderProductMemory(result);
  trace.textContent = JSON.stringify(result, null, 2);
}

async function runProductMemoryProbe() {
  const result = await api("/api/product-memory/probe", {
    method: "POST",
    timeoutMs: 150000,
    body: JSON.stringify({
      ...memberPayload(),
      query: "deductible benefits source pointer"
    })
  });
  renderProductMemory(result);
  trace.textContent = JSON.stringify(result, null, 2);
}

async function loadSkills() {
  const result = await api("/api/openclaw/skills");
  renderSkills(result);
  trace.textContent = JSON.stringify(result, null, 2);
}

async function validateSkillEnvelope() {
  const result = await api("/api/openclaw/skills/insurance_portal_browser/validate-envelope", {
    method: "POST",
    body: JSON.stringify({
      message: "Validate the insurance portal browser envelope for read-only eligibility observation.",
      ...memberPayload()
    })
  });
  document.querySelector("#sessionId").value = result.session.id;
  renderSkillProposal(result);
  trace.textContent = JSON.stringify(result, null, 2);
  await loadHarness();
}

async function loadOfficialOpenClawStatus() {
  const result = await api("/api/openclaw/official/status");
  renderOfficialOpenClawStatus(result);
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function runPhase4Proof() {
  phase4Status.textContent = "Running proof gate...";
  const member = memberPayload();
  const message = "Use my Aetna portal memory to check eligibility and benefits.";
  const proposal = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      ...member,
      message,
      executeEvidenceObservation: false,
      useLiveModel: false
    })
  });
  const taskId = proposal.graphRun?.state?.openclaw_skill_proposal?.task?.id;
  const approval = await api("/api/orchestrator/approve", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: proposal.session.id,
      userId: proposal.user.id,
      approvalScope: "read_only_observation",
      allowedAction: "read_only_observation",
      expiresInMinutes: 15
    })
  });
  const resume = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      ...member,
      sessionId: proposal.session.id,
      message,
      approvalToken: approval.approvalToken,
      approvalTaskId: taskId,
      requireLivePortalProof: true,
      useOfficialOpenClawWorker: Boolean(useOfficialOpenClawWorker.checked),
      officialOpenClawUseCurrentTab: Boolean(officialOpenClawCurrentTab.checked),
      officialOpenClawMultiPage: Boolean(officialOpenClawMultiPage.checked),
      executeEvidenceObservation: true,
      useLiveModel: false
    })
  });
  document.querySelector("#sessionId").value = proposal.session.id;
  const payload = { proposal, approval, resume };
  renderPhase4Proof(payload);
  renderReview(resume.trace);
  trace.textContent = JSON.stringify(payload, null, 2);
}

async function markPortalReady() {
  if (!requireSignedInBeforeWorkflow()) return;
  requireLivePortalProof.checked = true;
  useOfficialOpenClawWorker.checked = true;
  officialOpenClawCurrentTab.checked = true;
  officialOpenClawMultiPage.checked = true;
  let officialStatus = null;
  try {
    officialStatus = await loadOfficialOpenClawStatus();
  } catch (error) {
    renderLiveWorkerGuide({
      status: "official_openclaw_profile_not_ready",
      readyForReadOnlyObservation: false,
      nextAction: error.message,
      workerVersatility: [],
      blockedActions: [],
      fallbackChain: []
    });
    addMessage("assistant", `I could not check the dedicated OpenClaw profile yet: ${error.message}`);
  }
  const live = officialStatus?.liveReadiness ?? null;
  const readinessMessage =
    live?.status === "ready_for_read_only_approval"
      ? "Live worker is ready for a read-only approval request. I can use the current dedicated OpenClaw tab, same-site navigation, DOM evidence, and OCR confirmation after you approve the task."
      : live?.nextAction
        ? `Live worker is not ready yet: ${live.nextAction}`
        : "Portal readiness preferences are enabled. Check the live worker status before approval if this is a real portal run.";
  addMessage(
    "assistant",
    `${readinessMessage} You handle all login, passwords, passkeys, SSN, and 2FA in the portal.`
  );
  renderJourneyState(latestChatRun);
  renderAnswerPanel(latestChatRun);
}

function closeRuntimeEventStream() {
  if (runtimeEventSource) runtimeEventSource.close();
  runtimeEventSource = null;
  runtimeStreamSessionId = null;
}

function resetMvpJourneySurface(options = {}) {
  closeRuntimeEventStream();
  latestChatRun = null;
  latestUserMessage = "";
  runtimeEvents = [];
  productSignedIn = false;
  document.querySelector("#sessionId").value = "";
  document.querySelector("#resumeLatestSession").checked = false;
  requireLivePortalProof.checked = false;
  useOfficialOpenClawWorker.checked = false;
  officialOpenClawCurrentTab.checked = false;
  officialOpenClawMultiPage.checked = false;
  renderLiveWorkerGuide();
  productAuthStatus.textContent = "Not signed in";
  sessionStatus.textContent = "No active session";
  reviewStatus.textContent = "No extraction yet";
  review.innerHTML = "";
  messages.innerHTML = "";
  renderJourneyState();
  renderRuntimeTimeline([], "reset");
  renderAnswerPanel(null, {
    status: "reset",
    body: "Clean local journey surface is ready. Replay starts a new real planned-user session before running Benefits."
  });
  trace.textContent = "MVP journey surface reset. Local database records were not deleted.";
  if (options.announce !== false) {
    addMessage(
      "assistant",
      "MVP journey reset. The next replay will create a fresh local session and route the Benefits question through LangGraph."
    );
  }
}

async function replayMvpBenefitsJourney() {
  resetMvpJourneySurface({ announce: false });
  await productAuthenticate();
  document.querySelector("#message").value = MVP_BENEFITS_MESSAGE;
  addMessage("user", MVP_BENEFITS_MESSAGE);
  return runProductChat(MVP_BENEFITS_MESSAGE);
}

async function productAuthenticate() {
  const result = await api("/api/orchestrator/auth-start", {
    method: "POST",
    body: JSON.stringify(memberPayload())
  });
  document.querySelector("#sessionId").value = result.session?.id ?? "";
  productSignedIn = true;
  productAuthStatus.textContent = `${result.auth?.status ?? "signed in"} · ${result.session?.id ?? "no session"}`;
  sessionStatus.textContent = `${result.session?.current_step ?? "created"} · v${result.session?.state_version ?? 0}`;
  renderJourneyState();
  renderAnswerPanel(null, {
    status: "signed in",
    body: "Local session is ready. Ask the benefits question or run the Benefits MVP replay."
  });
  startRuntimeEventStream(result.session?.id, result.user?.id);
  await loadRuntimeEventsForSession(result.session?.id);
  addMessage(
    "assistant",
    `
      <article class="chat-proof-card">
        <h3>Signed In</h3>
        <dl>
          <dt>User</dt>
          <dd>${escapeHtml(result.user?.email ?? "unknown")}</dd>
          <dt>Session</dt>
          <dd>${escapeHtml(result.session?.id ?? "none")}</dd>
          <dt>Credential boundary</dt>
          <dd>${escapeHtml(result.auth?.credentialHandling ?? "user_only")}</dd>
        </dl>
      </article>
    `,
    { html: true }
  );
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function runProductChat(message, options = {}) {
  if (!requireSignedInBeforeWorkflow()) return null;
  latestUserMessage = message;
  renderRuntimeTimeline(runtimeEvents, "running graph");
  const payload = {
    message,
    ...memberPayload(),
    executeEvidenceObservation: Boolean(options.executeEvidenceObservation),
    requireLivePortalProof: Boolean(options.requireLivePortalProof ?? requireLivePortalProof.checked),
    useOfficialOpenClawWorker: Boolean(options.useOfficialOpenClawWorker ?? useOfficialOpenClawWorker.checked),
    officialOpenClawUseCurrentTab: Boolean(options.officialOpenClawUseCurrentTab ?? officialOpenClawCurrentTab.checked),
    officialOpenClawMultiPage: Boolean(options.officialOpenClawMultiPage ?? officialOpenClawMultiPage.checked),
    useLiveModel: document.querySelector("#useLiveModel").checked,
    approvalToken: options.approvalToken,
    approvalTaskId: options.approvalTaskId,
    workerContinuationId: options.workerContinuationId,
    approvalScope: options.approvalScope,
    allowedAction: options.allowedAction,
    approvedDocumentCandidateId: options.approvedDocumentCandidateId
  };
  const result = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  latestChatRun = result;
  productSignedIn = true;
  document.querySelector("#sessionId").value = result.session.id;
  productAuthStatus.textContent = `Signed in · ${result.session.id}`;
  sessionStatus.textContent = `${result.session.current_step} · v${result.session.state_version}`;
  startRuntimeEventStream(result.session.id, result.user?.id);
  addMessage("assistant", result.finalResponse, { className: "latest-answer-message" });
  addMessage("assistant", renderChatProof(result), { html: true });
  addMessage("assistant", renderWorkerOutcomeCard(result), { html: true });
  upsertWorkerContinuationCard(workerContinuationFromResult(result));
  renderMissingInfoPrompt(result);
  renderJourneyState(result);
  renderAnswerPanel(result);
  await loadRuntimeEventsForSession(result.session.id);
  renderReview(result.trace);
  trace.textContent = JSON.stringify(result, null, 2);
  return result;
}

async function approveLatestReadOnly(taskId) {
  if (!latestChatRun) throw new Error("Run a workflow first.");
  const approval = await api("/api/orchestrator/approve", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: latestChatRun.session.id,
      userId: latestChatRun.user.id,
      approvalScope: "read_only_observation",
      allowedAction: "read_only_observation",
      expiresInMinutes: 15
    })
  });
  addMessage(
    "assistant",
    `
      <article class="chat-proof-card">
        <h3>Approval Recorded</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(approval.status)}</dd>
          <dt>Task</dt>
          <dd>${escapeHtml(taskId)}</dd>
          <dt>Allowed action</dt>
          <dd>${escapeHtml(approval.approval?.allowedAction ?? "read_only_observation")}</dd>
          <dt>Actions taken</dt>
          <dd>${escapeHtml((approval.approval?.actionsTaken ?? []).join(", ") || "none")}</dd>
        </dl>
      </article>
    `,
    { html: true }
  );
  await loadRuntimeEventsForSession(latestChatRun.session.id);
  return runProductChat(latestUserMessage || value("message"), {
    approvalToken: approval.approvalToken,
    approvalTaskId: taskId,
    executeEvidenceObservation: true,
    requireLivePortalProof: requireLivePortalProof.checked,
    useOfficialOpenClawWorker: useOfficialOpenClawWorker.checked,
    officialOpenClawUseCurrentTab: officialOpenClawCurrentTab.checked,
    officialOpenClawMultiPage: officialOpenClawMultiPage.checked
  });
}

async function createAsyncWorkerFollowup(taskId) {
  if (!latestChatRun) throw new Error("Run a workflow first.");
  const payload = await api("/api/worker-continuations", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: latestChatRun.session.id,
      userId: latestChatRun.user.id,
      correlationId: latestChatRun.graphRun?.state?.graph_trace_id ?? latestChatRun.session.langgraph_thread_id,
      approvalScope: "read_only_observation",
      allowedAction: "read_only_observation",
      reason: "The read-only worker task may take longer than this chat turn. Keep checking status without taking external action.",
      reportEverySeconds: 30,
      metadata: {
        source: "chat_worker_followup_button",
        workflow: latestChatRun.graphRun?.state?.workflow ?? null
      }
    })
  });
  if (!payload.ok) throw new Error(payload.error ?? payload.status ?? "Async follow-up was not created.");
  upsertWorkerContinuationCard(payload.continuation);
  await loadRuntimeEventsForSession(latestChatRun.session.id);
  if (payload.trace) renderReview(payload.trace);
  trace.textContent = JSON.stringify(payload, null, 2);
  return payload;
}

async function proposeDocumentCandidate(candidateId) {
  if (!latestChatRun) throw new Error("Run a workflow with Discovery first.");
  const payload = await api("/api/document-candidates/propose", {
    method: "POST",
    body: JSON.stringify({
      userId: latestChatRun.user.id,
      sessionId: latestChatRun.session.id,
      workflow: latestChatRun.graphRun?.state?.workflow ?? "eligibility_benefits_navigation",
      candidateId,
      portalUrl: value("portalUrl"),
      expiresInMinutes: 15
    })
  });
  addMessage(
    "assistant",
    `
      <article class="chat-proof-card">
        <h3>Document Candidate Approval Prepared</h3>
        <dl>
          <dt>Task</dt>
          <dd>${escapeHtml(payload.task.id)}</dd>
          <dt>Candidate</dt>
          <dd>${escapeHtml(payload.candidate.label)} · ${escapeHtml(payload.candidate.candidateId)}</dd>
          <dt>Scope</dt>
          <dd>${escapeHtml(payload.proposal.approvalScope)} · ${escapeHtml(payload.proposal.allowedAction)}</dd>
          <dt>Actions taken</dt>
          <dd>none</dd>
        </dl>
        <div class="button-row">
          <button type="button" data-document-candidate-observe="${escapeHtml(payload.task.id)}" data-document-candidate-id="${escapeHtml(candidateId)}">Approve + Observe Candidate</button>
        </div>
      </article>
    `,
    { html: true }
  );
  await loadRuntimeEventsForSession(latestChatRun.session.id);
  if (payload.trace) renderReview(payload.trace);
  trace.textContent = JSON.stringify(payload, null, 2);
  return payload;
}

async function approveAndObserveDocumentCandidate(taskId, candidateId) {
  if (!latestChatRun) throw new Error("Run a workflow first.");
  useOfficialOpenClawWorker.checked = true;
  const continuation = await api("/api/worker-continuations", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: latestChatRun.session.id,
      userId: latestChatRun.user.id,
      correlationId: latestChatRun.graphRun?.state?.graph_trace_id ?? latestChatRun.session.langgraph_thread_id,
      approvalScope: READ_ONLY_DOCUMENT_SCOPE,
      allowedAction: READ_ONLY_DOCUMENT_SCOPE,
      reason: "Observe exactly one approved read-only document candidate.",
      reportEverySeconds: 30,
      metadata: {
        source: "operator_document_candidate_button",
        candidateId,
        workflow: latestChatRun.graphRun?.state?.workflow ?? null
      }
    })
  });
  const approval = await api("/api/orchestrator/approve", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: latestChatRun.session.id,
      userId: latestChatRun.user.id,
      approvalScope: READ_ONLY_DOCUMENT_SCOPE,
      allowedAction: READ_ONLY_DOCUMENT_SCOPE,
      expiresInMinutes: 15
    })
  });
  addMessage(
    "assistant",
    `
      <article class="chat-proof-card">
        <h3>Document Candidate Approval Recorded</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(approval.status)}</dd>
          <dt>Task</dt>
          <dd>${escapeHtml(taskId)}</dd>
          <dt>Continuation</dt>
          <dd>${escapeHtml(continuation.continuation?.id ?? "not scheduled")}</dd>
          <dt>Allowed action</dt>
          <dd>${escapeHtml(approval.approval?.allowedAction ?? READ_ONLY_DOCUMENT_SCOPE)}</dd>
          <dt>Actions taken</dt>
          <dd>${escapeHtml((approval.approval?.actionsTaken ?? []).join(", ") || "none")}</dd>
        </dl>
      </article>
    `,
    { html: true }
  );
  return runProductChat(latestUserMessage || value("message") || MVP_BENEFITS_MESSAGE, {
    approvalToken: approval.approvalToken,
    approvalTaskId: taskId,
    workerContinuationId: continuation.continuation?.id,
    approvalScope: READ_ONLY_DOCUMENT_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_SCOPE,
    approvedDocumentCandidateId: candidateId,
    executeEvidenceObservation: true,
    requireLivePortalProof: true,
    useOfficialOpenClawWorker: true,
    officialOpenClawUseCurrentTab: false,
    officialOpenClawMultiPage: false
  });
}

async function continueAsyncWorkerFollowup(continuationId) {
  const payload = await api(`/api/worker-continuations/${encodeURIComponent(continuationId)}/continue`, {
    method: "POST",
    body: JSON.stringify({
      sessionId: currentSessionId(),
      userId: latestChatRun?.user?.id ?? null
    })
  });
  if (!payload.ok) throw new Error(payload.error ?? payload.status ?? "Could not request continuation.");
  upsertWorkerContinuationCard(payload.continuation);
  await loadRuntimeEventsForSession(payload.continuation.sessionId);
  trace.textContent = JSON.stringify(payload, null, 2);
  return payload;
}

async function runApprovedWorkerFollowup(continuationId, taskId) {
  if (!latestChatRun) throw new Error("Run a workflow first.");
  useOfficialOpenClawWorker.checked = true;
  const approval = await api("/api/orchestrator/approve", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: latestChatRun.session.id,
      userId: latestChatRun.user.id,
      approvalScope: "read_only_observation",
      allowedAction: "read_only_observation",
      expiresInMinutes: 15
    })
  });
  addMessage(
    "assistant",
    `
      <article class="chat-proof-card">
        <h3>Follow-Up Approval Recorded</h3>
        <dl>
          <dt>Status</dt>
          <dd>${escapeHtml(approval.status)}</dd>
          <dt>Continuation</dt>
          <dd>${escapeHtml(continuationId)}</dd>
          <dt>Allowed action</dt>
          <dd>${escapeHtml(approval.approval?.allowedAction ?? "read_only_observation")}</dd>
          <dt>Actions taken</dt>
          <dd>${escapeHtml((approval.approval?.actionsTaken ?? []).join(", ") || "none")}</dd>
        </dl>
      </article>
    `,
    { html: true }
  );
  await loadRuntimeEventsForSession(latestChatRun.session.id);
  return runProductChat(latestUserMessage || value("message"), {
    approvalToken: approval.approvalToken,
    approvalTaskId: taskId,
    workerContinuationId: continuationId,
    executeEvidenceObservation: true,
    requireLivePortalProof: requireLivePortalProof.checked,
    useOfficialOpenClawWorker: true,
    officialOpenClawUseCurrentTab: officialOpenClawCurrentTab.checked,
    officialOpenClawMultiPage: officialOpenClawMultiPage.checked
  });
}

async function cancelAsyncWorkerFollowup(continuationId) {
  const payload = await api(`/api/worker-continuations/${encodeURIComponent(continuationId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({
      sessionId: currentSessionId(),
      userId: latestChatRun?.user?.id ?? null,
      reason: "Cancelled from chat."
    })
  });
  if (!payload.ok) throw new Error(payload.error ?? payload.status ?? "Could not cancel continuation.");
  upsertWorkerContinuationCard(payload.continuation);
  await loadRuntimeEventsForSession(payload.continuation.sessionId);
  trace.textContent = JSON.stringify(payload, null, 2);
  return payload;
}

async function authStart() {
  const result = await api("/api/orchestrator/auth-start", {
    method: "POST",
    body: JSON.stringify(memberPayload())
  });
  renderOrchestratorAuth(result);
  trace.textContent = JSON.stringify(result, null, 2);
}

async function runOrchestratorChat() {
  const result = await api("/api/orchestrator/chat", {
    method: "POST",
    body: JSON.stringify({
      message: value("message"),
      useLiveModel: document.querySelector("#useLiveModel").checked,
      requireLiveModel: true,
      ...memberPayload()
    })
  });
  renderOrchestratorChat(result);
  trace.textContent = JSON.stringify(result, null, 2);
  await loadHarness();
}

async function runFlowCases() {
  const result = await api("/api/orchestrator/flow-tests", {
    method: "POST",
    body: JSON.stringify({
      useLiveModel: document.querySelector("#useLiveModel").checked,
      requireLiveModel: true,
      ...memberPayload()
    })
  });
  renderFlowCases(result);
  trace.textContent = JSON.stringify(result, null, 2);
  await loadHarness();
}

async function api(path, options = {}) {
  const liveModelEnabled = document.querySelector("#useLiveModel")?.checked;
  const timeoutMs = options.timeoutMs ?? (liveModelEnabled ? 180000 : 45000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
  let response;
  try {
    response = await fetch(path, {
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      ...fetchOptions
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s calling ${path}. Disable Live GPT or try again after the model call finishes.`);
    }
    throw new Error(`Network error calling ${path}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Invalid JSON from ${path}: ${error.message}`);
  }
  if (!response.ok) {
    const detail = payload.error ?? payload.message ?? payload.status ?? "Request failed";
    throw new Error(`${path} failed (${response.status}): ${detail}`);
  }
  return payload;
}

function memberPayload() {
  return {
    remoteDebuggerUrl: value("remoteDebuggerUrl"),
    sessionId: value("sessionId") || undefined,
    resumeLatestSession: document.querySelector("#resumeLatestSession").checked,
    member: {
      name: value("name"),
      email: value("email"),
      payer: value("payer"),
      portalUrl: value("portalUrl"),
      approvals: {
        screenshotPolicy: "all allowed",
        phiStorageFields: "all fields",
        readOnlyExtractionApproved: true,
        websiteActionsApproved: true
      }
    }
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = value("message");
  addMessage("user", message);
  const restore = setBusy(event.submitter, "Running...");
  trace.textContent = "Running LangGraph workflow through the real harness...";
  try {
    await runProductChat(message);
  } catch (error) {
    addMessage("assistant", `Error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#probe").addEventListener("click", async () => {
  trace.textContent = "Probing Chrome remote debugger...";
  const remoteDebuggerUrl = encodeURIComponent(value("remoteDebuggerUrl"));
  trace.textContent = JSON.stringify(await api(`/api/browser/probe?remoteDebuggerUrl=${remoteDebuggerUrl}`), null, 2);
});

document.querySelector("#health").addEventListener("click", async () => {
  trace.textContent = JSON.stringify(await api("/api/health"), null, 2);
});

document.querySelector("#loadReview").addEventListener("click", async () => {
  try {
    await loadLatestReview();
  } catch (error) {
    reviewStatus.textContent = error.message;
  }
});

document.querySelector("#loadPortalPages").addEventListener("click", async () => {
  try {
    await loadPortalPages();
  } catch (error) {
    portalStatus.textContent = error.message;
  }
});

document.querySelector("#loadSessions").addEventListener("click", async () => {
  try {
    await loadSessions();
  } catch (error) {
    sessionStatus.textContent = error.message;
  }
});

document.querySelector("#loadSessionState").addEventListener("click", async () => {
  try {
    await loadSessionState();
  } catch (error) {
    sessionStatus.textContent = error.message;
  }
});

document.querySelector("#loadResearchKpis").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchKpis"), "Loading...");
  try {
    await loadResearchKpis();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchAnalytics").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchAnalytics"), "Loading...");
  try {
    await loadResearchAnalytics();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchBudget").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchBudget"), "Loading...");
  try {
    await loadResearchBudget();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchReviewQueues").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchReviewQueues"), "Loading...");
  try {
    await loadResearchReviewQueues();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

loadHandoffsButton.addEventListener("click", async () => {
  const restore = setBusy(loadHandoffsButton, "Loading...");
  try {
    await loadHumanHandoffs();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchWorker").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchWorker"), "Loading...");
  try {
    await loadResearchWorkerStatus();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchEmbeddings").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchEmbeddings"), "Loading...");
  try {
    await loadResearchEmbeddingStatus();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#chooseResearchEmbeddingRoute").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#chooseResearchEmbeddingRoute"), "Saving...");
  try {
    await chooseResearchEmbeddingRoute();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#saveResearchBudget").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#saveResearchBudget"), "Saving...");
  try {
    await saveResearchBudget();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#reindexResearchEmbeddings").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#reindexResearchEmbeddings"), "Reindexing...");
  try {
    await reindexResearchEmbeddings();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchGraph").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchGraph"), "Loading...");
  try {
    await loadResearchGraph();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#buildResearchGraph").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#buildResearchGraph"), "Building...");
  try {
    await buildResearchGraph();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadCitationClosure").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadCitationClosure"), "Loading...");
  try {
    await loadCitationClosure();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#uploadResearchDocument").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#uploadResearchDocument"), "Uploading...");
  try {
    await uploadResearchDocument();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchArtifacts").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchArtifacts"), "Loading...");
  try {
    await loadResearchArtifacts();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchEntities").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchEntities"), "Loading...");
  try {
    await loadResearchEntities();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchSources").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchSources"), "Loading...");
  try {
    await loadResearchSources();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchRuns").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchRuns"), "Loading...");
  try {
    await loadResearchRuns();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchSchedules").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchSchedules"), "Loading...");
  try {
    await loadResearchSchedules();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadResearchSchedulerStatus").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadResearchSchedulerStatus"), "Loading...");
  try {
    await loadResearchSchedulerStatus();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#tickResearchSchedulerDaemon").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#tickResearchSchedulerDaemon"), "Running...");
  try {
    await tickResearchSchedulerDaemon();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#tickResearchSchedules").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#tickResearchSchedules"), "Running...");
  try {
    await tickResearchSchedules();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadAuditLog").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadAuditLog"), "Loading...");
  try {
    await loadAuditLog();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#startResearchRun").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#startResearchRun"), "Starting...");
  try {
    await startResearchRun();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#searchResearchEvidence").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#searchResearchEvidence"), "Searching...");
  try {
    await searchResearchEvidence();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#evaluateCitationClosure").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#evaluateCitationClosure"), "Judging...");
  try {
    await evaluateCitationClosure();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#proposeResearchSource").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#proposeResearchSource"), "Proposing...");
  try {
    await proposeResearchSource();
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadOperatorTools").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadOperatorTools"), "Loading...");
  try {
    await loadOperatorTools();
  } catch (error) {
    operatorAssistantStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadOperatorProposals").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#loadOperatorProposals"), "Loading...");
  try {
    await loadOperatorProposals();
  } catch (error) {
    operatorAssistantStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#runOperatorAssistant").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#runOperatorAssistant"), "Running...");
  try {
    await runOperatorAssistant();
  } catch (error) {
    operatorAssistantStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

operatorAssistantConsole.addEventListener("click", async (event) => {
  const proposalToApprove = event.target?.dataset?.operatorProposalApprove;
  const proposalToReject = event.target?.dataset?.operatorProposalReject;
  if (!(proposalToApprove || proposalToReject)) return;
  const restore = setBusy(event.target, "Deciding...");
  try {
    if (proposalToApprove) await decideOperatorProposal(proposalToApprove, "approve");
    else if (proposalToReject) await decideOperatorProposal(proposalToReject, "reject");
  } catch (error) {
    operatorAssistantStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

researchConsole.addEventListener("click", async (event) => {
  const sourceToApprove = event.target?.dataset?.researchSourceApprove;
  const sourceToReject = event.target?.dataset?.researchSourceReject;
  const sourceToRun = event.target?.dataset?.researchRunSource;
  const runToOpen = event.target?.dataset?.researchRunOpen;
  const runToCancel = event.target?.dataset?.researchRunCancel;
  const runToRetry = event.target?.dataset?.researchRunRetry;
  const runToExecute = event.target?.dataset?.researchRunExecute;
  const runToMock = event.target?.dataset?.researchRunMock;
  const runToOpenClaw = event.target?.dataset?.researchRunOpenclaw;
  const runToHermes = event.target?.dataset?.researchRunHermes;
  const artifactToExtractEntities = event.target?.dataset?.researchEntitiesExtract;
  const artifactToApprove = event.target?.dataset?.researchArtifactApprove;
  const artifactToQuarantine = event.target?.dataset?.researchArtifactQuarantine;
  if (
    !(
      sourceToApprove ||
      sourceToReject ||
      sourceToRun ||
      runToOpen ||
      runToCancel ||
      runToRetry ||
      runToExecute ||
      runToMock ||
      runToOpenClaw ||
      runToHermes ||
      artifactToExtractEntities ||
      artifactToApprove ||
      artifactToQuarantine
    )
  ) return;
  const restore = setBusy(event.target, "Working...");
  try {
    if (sourceToApprove) await reviewResearchSource(sourceToApprove, "approve");
    else if (sourceToReject) await reviewResearchSource(sourceToReject, "reject");
    else if (sourceToRun) await startResearchRun(sourceToRun);
    else if (runToOpen) await openResearchRun(runToOpen);
    else if (runToCancel) await cancelResearchRun(runToCancel);
    else if (runToRetry) await retryResearchRun(runToRetry);
    else if (runToExecute) await executeResearchRun(runToExecute, "deterministic_fetch");
    else if (runToMock) await executeResearchRun(runToMock, "mock_worker");
    else if (runToOpenClaw) await executeResearchRun(runToOpenClaw, "openclaw");
    else if (runToHermes) await executeResearchRun(runToHermes, "hermes");
    else if (artifactToExtractEntities) await extractResearchEntities(artifactToExtractEntities);
    else if (artifactToApprove) await reviewResearchArtifact(artifactToApprove, "approve");
    else if (artifactToQuarantine) await reviewResearchArtifact(artifactToQuarantine, "quarantine");
  } catch (error) {
    researchStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadHarness").addEventListener("click", async () => {
  try {
    await loadHarness();
  } catch (error) {
    harnessStatus.textContent = error.message;
  }
});

document.querySelector("#runHeartbeat").addEventListener("click", async () => {
  try {
    await runHeartbeat();
  } catch (error) {
    harnessStatus.textContent = error.message;
  }
});

document.querySelector("#planClaimFollowup").addEventListener("click", async () => {
  try {
    await planClaimFollowup();
  } catch (error) {
    harnessStatus.textContent = error.message;
  }
});

document.querySelector("#checkProductMemory").addEventListener("click", async () => {
  try {
    await checkProductMemory();
  } catch (error) {
    productMemoryStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  }
});

document.querySelector("#probeProductMemory").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#probeProductMemory"), "Running...");
  try {
    await runProductMemoryProbe();
  } catch (error) {
    productMemoryStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#loadSkills").addEventListener("click", async () => {
  try {
    await loadSkills();
  } catch (error) {
    skillStatus.textContent = error.message;
  }
});

document.querySelector("#validateSkillEnvelope").addEventListener("click", async () => {
  try {
    await validateSkillEnvelope();
  } catch (error) {
    skillStatus.textContent = error.message;
  }
});
document.querySelector("#loadOfficialOpenClawStatus").addEventListener("click", async () => {
  try {
    await loadOfficialOpenClawStatus();
  } catch (error) {
    skillStatus.textContent = error.message;
  }
});

checkLiveWorkerButton.addEventListener("click", async () => {
  const restore = setBusy(checkLiveWorkerButton, "Checking...");
  try {
    await loadOfficialOpenClawStatus();
  } catch (error) {
    renderLiveWorkerGuide({
      status: "official_openclaw_profile_not_ready",
      readyForReadOnlyObservation: false,
      nextAction: error.message,
      workerVersatility: [],
      blockedActions: [],
      fallbackChain: []
    });
    skillStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#runPhase4Proof").addEventListener("click", async () => {
  const restore = setBusy(document.querySelector("#runPhase4Proof"), "Running...");
  try {
    await runPhase4Proof();
  } catch (error) {
    phase4Status.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

productAuth.addEventListener("click", async () => {
  const restore = setBusy(productAuth, "Signing in...");
  try {
    await productAuthenticate();
  } catch (error) {
    productAuthStatus.textContent = error.message;
    addMessage("assistant", `Sign-in error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

resetMvpJourneyButton.addEventListener("click", () => {
  resetMvpJourneySurface();
});

replayMvpBenefitsButton.addEventListener("click", async () => {
  const restore = setBusy(replayMvpBenefitsButton, "Replaying...");
  trace.textContent = "Starting a clean auth-plus-chat Benefits MVP replay...";
  try {
    await replayMvpBenefitsJourney();
  } catch (error) {
    addMessage("assistant", `Replay error: ${error.message}`);
    renderAnswerPanel(null, { status: "error", body: error.message });
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

portalReady.addEventListener("click", async () => {
  const restore = setBusy(portalReady, "Checking...");
  try {
    await markPortalReady();
  } catch (error) {
    addMessage("assistant", `Portal readiness error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

loadRuntimeEventsButton.addEventListener("click", async () => {
  try {
    await loadRuntimeEventsForSession();
  } catch (error) {
    renderRuntimeTimeline(runtimeEvents, error.message);
  }
});

document.querySelector(".workflow-actions").addEventListener("click", async (event) => {
  const message = event.target?.dataset?.workflowMessage;
  if (!message) return;
  document.querySelector("#message").value = message;
  addMessage("user", message);
  const restore = setBusy(event.target, "Running...");
  try {
    await runProductChat(message);
  } catch (error) {
    addMessage("assistant", `Workflow error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

messages.addEventListener("click", async (event) => {
  const taskId = event.target?.dataset?.approveReadonly;
  if (!taskId) return;
  const restore = setBusy(event.target, "Approving...");
  try {
    await approveLatestReadOnly(taskId);
  } catch (error) {
    addMessage("assistant", `Approval error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

answerPanel.addEventListener("click", async (event) => {
  const taskId = event.target?.dataset?.answerApproveReadonly;
  if (!taskId) return;
  const restore = setBusy(event.target, "Approving...");
  try {
    await approveLatestReadOnly(taskId);
  } catch (error) {
    addMessage("assistant", `Approval error: ${error.message}`);
    renderAnswerPanel(latestChatRun, { status: "error", body: error.message });
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

messages.addEventListener("click", async (event) => {
  const taskId = event.target?.dataset?.workerFollowup;
  if (!taskId) return;
  const restore = setBusy(event.target, "Scheduling...");
  try {
    await createAsyncWorkerFollowup(taskId);
  } catch (error) {
    addMessage("assistant", `Async follow-up error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

messages.addEventListener("click", async (event) => {
  const candidateId = event.target?.dataset?.documentCandidatePropose;
  if (!candidateId) return;
  const restore = setBusy(event.target, "Preparing...");
  try {
    await proposeDocumentCandidate(candidateId);
  } catch (error) {
    addMessage("assistant", `Document candidate proposal error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

messages.addEventListener("click", async (event) => {
  const taskId = event.target?.dataset?.documentCandidateObserve;
  const candidateId = event.target?.dataset?.documentCandidateId;
  if (!taskId || !candidateId) return;
  const restore = setBusy(event.target, "Observing...");
  try {
    await approveAndObserveDocumentCandidate(taskId, candidateId);
  } catch (error) {
    addMessage("assistant", `Document observation error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

answerPanel.addEventListener("click", async (event) => {
  const taskId = event.target?.dataset?.answerWorkerFollowup;
  if (!taskId) return;
  const restore = setBusy(event.target, "Scheduling...");
  try {
    await createAsyncWorkerFollowup(taskId);
  } catch (error) {
    addMessage("assistant", `Async follow-up error: ${error.message}`);
    renderAnswerPanel(latestChatRun, { status: "error", body: error.message });
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

messages.addEventListener("click", async (event) => {
  const continuationId = event.target?.dataset?.workerFollowupContinue;
  if (!continuationId) return;
  const restore = setBusy(event.target, "Checking...");
  try {
    await continueAsyncWorkerFollowup(continuationId);
  } catch (error) {
    addMessage("assistant", `Continuation error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

messages.addEventListener("click", async (event) => {
  const continuationId = event.target?.dataset?.workerFollowupRun;
  const taskId = event.target?.dataset?.workerFollowupTask;
  if (!continuationId || !taskId) return;
  const restore = setBusy(event.target, "Approving...");
  try {
    await runApprovedWorkerFollowup(continuationId, taskId);
  } catch (error) {
    addMessage("assistant", `Follow-up run error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

messages.addEventListener("click", async (event) => {
  const continuationId = event.target?.dataset?.workerFollowupCancel;
  if (!continuationId) return;
  const restore = setBusy(event.target, "Cancelling...");
  try {
    await cancelAsyncWorkerFollowup(continuationId);
  } catch (error) {
    addMessage("assistant", `Cancel error: ${error.message}`);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

document.querySelector("#authStart").addEventListener("click", async () => {
  try {
    await authStart();
  } catch (error) {
    orchestratorStatus.textContent = error.message;
  }
});

document.querySelector("#runOrchestratorChat").addEventListener("click", async () => {
  try {
    await runOrchestratorChat();
  } catch (error) {
    orchestratorStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  }
});

document.querySelector("#runFlowCases").addEventListener("click", async () => {
  try {
    await runFlowCases();
  } catch (error) {
    orchestratorStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  }
});

loadConnectorProofButton?.addEventListener("click", async () => {
  const restore = setBusy(loadConnectorProofButton, "Loading...");
  try {
    await loadConnectorProof();
  } catch (error) {
    connectorProofStatus.textContent = error.message;
    renderConnectorProofError(error);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

loadPemsWorkbenchButton?.addEventListener("click", async () => {
  const restore = setBusy(loadPemsWorkbenchButton, "Loading...");
  try {
    await loadPemsWorkbench();
  } catch (error) {
    renderPemsWorkbenchError(error);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

generatePemsLiveDraftButton?.addEventListener("click", async () => {
  const restore = setBusy(generatePemsLiveDraftButton, "Generating...");
  try {
    const result = await generatePemsLiveEvaluatorDraft();
    if (pemsWorkbenchStatus) pemsWorkbenchStatus.textContent = `${result.status ?? "live evaluator draft requested"} · workbench refreshed`;
  } catch (error) {
    renderPemsWorkbenchError(error);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

recordPemsClaimRevisionButton?.addEventListener("click", async () => {
  const restore = setBusy(recordPemsClaimRevisionButton, "Recording...");
  try {
    const result = await submitPemsClaimRevision();
    if (pemsWorkbenchStatus) pemsWorkbenchStatus.textContent = `${result.status ?? "claim revision recorded"} · workbench refreshed`;
  } catch (error) {
    renderPemsWorkbenchError(error);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

recordPemsFollowUpButton?.addEventListener("click", async () => {
  const restore = setBusy(recordPemsFollowUpButton, "Recording...");
  try {
    const result = await submitPemsReviewerFollowUp();
    if (pemsWorkbenchStatus) pemsWorkbenchStatus.textContent = `${result.status ?? "reviewer follow-up recorded"} · workbench refreshed`;
  } catch (error) {
    renderPemsWorkbenchError(error);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

recordPemsHistoryExportButton?.addEventListener("click", async () => {
  const restore = setBusy(recordPemsHistoryExportButton, "Recording...");
  try {
    const result = await submitPemsReviewerHistoryExport();
    if (pemsWorkbenchStatus) pemsWorkbenchStatus.textContent = `${result.status ?? "reviewer history export recorded"} · workbench refreshed`;
  } catch (error) {
    renderPemsWorkbenchError(error);
    trace.textContent = error.stack ?? error.message;
  } finally {
    restore();
  }
});

for (const control of [pemsDraftStatusFilter, pemsEvaluatorModeFilter, pemsLiveOnlyFilter, pemsHistoryFollowupFilter, pemsHistorySortBy, pemsHistorySortDirection].filter(Boolean)) {
  control.addEventListener("change", async () => {
    try {
      await loadPemsWorkbench();
    } catch (error) {
      renderPemsWorkbenchError(error);
      trace.textContent = error.stack ?? error.message;
    }
  });
}

for (const control of [pemsHistoryExportRefFilter, pemsHistorySnapshotHashFilter].filter(Boolean)) {
  control.addEventListener("change", async () => {
    try {
      await loadPemsWorkbench();
    } catch (error) {
      renderPemsWorkbenchError(error);
      trace.textContent = error.stack ?? error.message;
    }
  });
}

for (const button of pemsReviewActionButtons) {
  button.addEventListener("click", async () => {
    const action = button.dataset.pemsReviewAction;
    const restore = setBusy(button, "Recording...");
    try {
      const result = await submitPemsWorkbenchReview(action);
      if (pemsWorkbenchStatus) pemsWorkbenchStatus.textContent = `Review ${result.review?.decision ?? action} recorded · workbench refreshed`;
    } catch (error) {
      renderPemsWorkbenchError(error);
      trace.textContent = error.stack ?? error.message;
    } finally {
      restore();
    }
  });
}

sessions.addEventListener("click", async (event) => {
  const sessionId = event.target?.dataset?.useSession;
  if (!sessionId) return;
  document.querySelector("#sessionId").value = sessionId;
  document.querySelector("#resumeLatestSession").checked = true;
  productSignedIn = true;
  productAuthStatus.textContent = `Signed in · ${sessionId}`;
  await loadSessionState();
  renderJourneyState();
  startRuntimeEventStream(sessionId);
  await loadRuntimeEventsForSession(sessionId);
});

async function hydrateOperatorFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("sessionId");
  const userId = params.get("userId");
  if (!sessionId) return;
  document.querySelector("#sessionId").value = sessionId;
  document.querySelector("#resumeLatestSession").checked = true;
  productSignedIn = true;
  productAuthStatus.textContent = `Proof session · ${sessionId}`;
  sessionStatus.textContent = "Loading linked session...";
  try {
    const state = await loadSessionState();
    startRuntimeEventStream(sessionId, userId || undefined);
    await loadRuntimeEventsForSession(sessionId);
    addMessage(
      "assistant",
      `Loaded operator proof for session ${sessionId}. The trace panel now shows the linked LangGraph state.`
    );
    if (state?.session) sessionStatus.textContent = `${state.session.current_step} · v${state.session.state_version}`;
  } catch (error) {
    sessionStatus.textContent = error.message;
    trace.textContent = error.stack ?? error.message;
  }
}

renderJourneyState();
renderAnswerPanel();
renderRuntimeTimeline();
renderLiveWorkerGuide();
setPemsReviewActionsEnabled(false);
loadConnectorProof().catch((error) => {
  renderConnectorProofError(error);
});
loadPemsWorkbench().catch((error) => {
  renderPemsWorkbenchError(error);
});
hydrateOperatorFromQuery();
addMessage(
  "assistant",
  "Sign in, choose a workflow, or type a benefits question. I will route it through the real LangGraph harness and show workflow proof here in chat. OpenClaw remains approval-gated."
);
