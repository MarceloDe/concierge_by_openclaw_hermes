const DEFAULT_BENEFITS_MESSAGE = "Do I still owe anything before insurance starts paying?";
const READ_ONLY_SCOPE = "read_only_observation";

const state = {
  user: null,
  session: null,
  latestRun: null,
  latestTaskId: null,
  latestMessage: DEFAULT_BENEFITS_MESSAGE,
  runtimeEvents: [],
  eventSource: null,
  workerStatus: null,
  busy: false
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  name: $("#name"),
  email: $("#email"),
  payer: $("#payer"),
  portalUrl: $("#portalUrl"),
  sessionId: $("#sessionId"),
  resumeLatestSession: $("#resumeLatestSession"),
  useLiveModel: $("#useLiveModel"),
  requireLivePortalProof: $("#requireLivePortalProof"),
  useOfficialOpenClawWorker: $("#useOfficialOpenClawWorker"),
  officialOpenClawCurrentTab: $("#officialOpenClawCurrentTab"),
  officialOpenClawMultiPage: $("#officialOpenClawMultiPage"),
  authStatus: $("#authStatus"),
  workerStatus: $("#workerStatus"),
  messages: $("#messages"),
  message: $("#message"),
  currentAnswer: $("#currentAnswer"),
  approvalPanel: $("#approvalPanel"),
  discoveryPanel: $("#discoveryPanel"),
  timeline: $("#timeline"),
  sequence: $("#sequence")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compact(value, fallback = "not reported") {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function memberPayload() {
  return {
    member: {
      name: elements.name.value.trim(),
      email: elements.email.value.trim(),
      payer: elements.payer.value.trim(),
      portalUrl: elements.portalUrl.value.trim()
    },
    sessionId: elements.sessionId.value.trim() || state.session?.id || undefined,
    resumeLatestSession: elements.resumeLatestSession.checked
  };
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 180000;
  const timeout = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(path, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = payload.error ?? payload.status ?? response.statusText;
      throw new Error(`${response.status} ${message}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function setBusy(label, busy = true) {
  state.busy = busy;
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
  if (label) addMessage("system", label);
}

async function runAction(label, action) {
  if (state.busy) return null;
  setBusy(label, true);
  try {
    return await action();
  } catch (error) {
    addMessage("system", `<strong class="error">Action failed:</strong> ${escapeHtml(error.message)}`, { html: true });
    renderSequence();
    return null;
  } finally {
    setBusy("", false);
  }
}

function addMessage(role, body, options = {}) {
  const message = document.createElement("article");
  message.className = `message ${role}`;
  if (options.html) {
    message.innerHTML = body;
  } else {
    message.textContent = body;
  }
  elements.messages.append(message);
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function updateSession(enrollment) {
  state.user = enrollment.user ?? state.user;
  state.session = enrollment.session ?? state.session;
  if (state.session?.id) elements.sessionId.value = state.session.id;
  elements.authStatus.textContent = state.session?.id
    ? `Signed in · ${state.session.id}`
    : "Not signed in";
  if (state.session?.id) startEventStream(state.session.id, state.user?.id);
}

function updateLatestRun(result) {
  state.latestRun = result;
  updateSession(result);
  state.latestTaskId = result.graphRun?.state?.openclaw_skill_proposal?.task?.id ?? null;
  renderAnswer(result);
  renderApproval(result);
  renderDiscovery(result);
  renderSequence(result);
}

function sourcePointers(result = state.latestRun) {
  return result?.sourcePointers ?? result?.graphRun?.state?.source_pointers ?? [];
}

function evidenceObservation(result = state.latestRun) {
  return result?.graphRun?.state?.evidence_observation ?? {};
}

function graphState(result = state.latestRun) {
  return result?.graphRun?.state ?? {};
}

function productMemoryRetain(result = state.latestRun) {
  return graphState(result).product_memory_retain ?? {};
}

function proposalStatus(result = state.latestRun) {
  const proposal = graphState(result).openclaw_skill_proposal;
  return proposal?.task?.status ?? proposal?.status ?? "not prepared";
}

function approvalStatus(result = state.latestRun) {
  const evidence = evidenceObservation(result);
  if (evidence.status?.includes("waiting_for_approval")) return "needed";
  if (evidence.approval?.status) return evidence.approval.status;
  if (sourcePointers(result).length) return "consumed";
  if (proposalStatus(result) === "pending_approval") return "pending";
  return "waiting";
}

function workerOutcome(result = state.latestRun) {
  const evidence = evidenceObservation(result);
  return evidence.workerTerminalOutcome ?? evidence.status ?? "not run";
}

function renderAnswer(result = null) {
  if (!result) {
    elements.currentAnswer.innerHTML = `
      <p class="eyebrow">Current Answer</p>
      <h2>Start a session to test the full sequence.</h2>
      <p>The existing proof dashboard stays available. This view uses the same local LangGraph, approval, OpenClaw, audit, and memory APIs.</p>
    `;
    return;
  }

  const stateSnapshot = graphState(result);
  const evidence = evidenceObservation(result);
  const pointers = sourcePointers(result);
  const memory = productMemoryRetain(result);
  const llmMode = stateSnapshot.llm_decision?.mode ?? stateSnapshot.llm_response?.mode ?? "not reported";
  const workflow = stateSnapshot.workflow ?? result.intent?.workflow ?? "not routed";
  const classifier = stateSnapshot.structured_intent;
  const pointerLabels = pointers
    .slice(0, 4)
    .map((pointer) => `${pointer.table ?? "source"}/${pointer.id ?? pointer.rowId ?? "pointer"}`)
    .join(", ");
  const finalResponse = result.finalResponse ?? "No final response returned.";

  elements.currentAnswer.innerHTML = `
    <p class="eyebrow">Current Answer</p>
    <h2>${escapeHtml(workflow)}</h2>
    <p>${escapeHtml(finalResponse)}</p>
    <div class="answer-grid" aria-label="Latest run proof">
      ${metric("Intent", classifier?.intent ?? stateSnapshot.intent ?? "not reported")}
      ${metric("LLM", llmMode)}
      ${metric("Approval", approvalStatus(result))}
      ${metric("Worker", workerOutcome(result))}
      ${metric("Source pointers", pointers.length)}
      ${metric("Memory", memory.status ?? (memory.enabled === false ? "disabled" : "not reported"))}
    </div>
    <div class="key-value-list">
      <dl>
        <dt>Trace</dt>
        <dd>${escapeHtml(stateSnapshot.graph_trace_id ?? result.session?.langgraph_thread_id ?? "not reported")}</dd>
        <dt>Source pointers</dt>
        <dd>${escapeHtml(pointerLabels || "none")}</dd>
        <dt>Evidence status</dt>
        <dd>${escapeHtml(evidence.status ?? "not requested")}</dd>
      </dl>
    </div>
  `;
}

function metric(label, value) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(compact(value))}</b>
    </div>
  `;
}

function renderApproval(result = state.latestRun) {
  if (!result) {
    elements.approvalPanel.textContent = "No pending worker proposal yet.";
    return;
  }
  const taskId = graphState(result).openclaw_skill_proposal?.task?.id;
  const status = proposalStatus(result);
  const approval = approvalStatus(result);
  if (!taskId) {
    elements.approvalPanel.innerHTML = `<p>No OpenClaw worker proposal for the latest run.</p>`;
    return;
  }
  elements.approvalPanel.innerHTML = `
    <div class="key-value-list">
      <dl>
        <dt>Task</dt>
        <dd>${escapeHtml(taskId)}</dd>
        <dt>Proposal</dt>
        <dd>${escapeHtml(status)}</dd>
        <dt>Approval</dt>
        <dd>${escapeHtml(approval)}</dd>
      </dl>
    </div>
    <div class="approval-actions">
      <button type="button" data-approve-run="${escapeHtml(taskId)}">Approve + Run Read-Only</button>
      <button class="secondary-button" type="button" data-save-followup="${escapeHtml(taskId)}">Save As Follow-Up</button>
    </div>
    <p class="danger-line">Read-only observation only. Login, passkey, 2FA, captcha, password manager, SSN entry, payer contact, form submission, and account changes stay outside this approval.</p>
  `;
}

function discoveryReport(result = state.latestRun) {
  return evidenceObservation(result).discoveryReport ?? result?.browserResult?.officialOpenClaw?.discoveryReport ?? null;
}

function renderDiscovery(result = state.latestRun) {
  const report = discoveryReport(result);
  if (!report) {
    elements.discoveryPanel.textContent = "No discovery report yet.";
    return;
  }
  const search = report.portalSearch ?? {};
  const documents = report.documentDiscovery ?? {};
  const sections = report.portalSections ?? {};
  const fallback = report.fallbackChain ?? [];
  elements.discoveryPanel.innerHTML = `
    <dl>
      <dt>Portal search</dt>
      <dd>${escapeHtml(search.status ?? "not reported")}</dd>
      <dt>Document candidates</dt>
      <dd>${escapeHtml(documents.candidateCount ?? 0)} total · ${escapeHtml(documents.readOnlyCandidateCount ?? 0)} read-only · ${escapeHtml(documents.blockedCandidateCount ?? 0)} blocked</dd>
      <dt>SBC/PDF candidates</dt>
      <dd>${escapeHtml(documents.sbcPdfCandidateCount ?? 0)}</dd>
      <dt>Sections tried</dt>
      <dd>${escapeHtml(compact(sections.tried))}</dd>
      <dt>Reachable sections</dt>
      <dd>${escapeHtml(compact(sections.reachable))}</dd>
      <dt>Fallback chain</dt>
      <dd>${escapeHtml(compact(fallback))}</dd>
    </dl>
  `;
}

function renderSequence(result = state.latestRun) {
  const sequence = {
    auth: state.session?.id ? ["done", "signed in"] : ["active", "waiting"],
    route: graphState(result).structured_intent ? ["done", graphState(result).workflow ?? "routed"] : ["active", "waiting"],
    approval: approvalStatus(result) === "consumed" ? ["done", "consumed"] : approvalStatus(result) === "needed" || approvalStatus(result) === "pending" ? ["active", approvalStatus(result)] : ["", "waiting"],
    worker: sourcePointers(result).length ? ["done", workerOutcome(result)] : workerOutcome(result) !== "not run" && workerOutcome(result) !== "not requested" ? ["active", workerOutcome(result)] : ["", "waiting"],
    evidence: sourcePointers(result).length ? ["done", `${sourcePointers(result).length} pointers`] : ["", evidenceObservation(result).status ?? "waiting"],
    memory: productMemoryRetain(result).status ? ["done", productMemoryRetain(result).status] : ["", "waiting"],
    answer: result?.finalResponse ? ["done", "ready"] : ["", "waiting"]
  };

  elements.sequence.querySelectorAll("li").forEach((item) => {
    const [className, label] = sequence[item.dataset.step] ?? ["", "waiting"];
    item.className = className;
    item.querySelector("b").textContent = label;
  });
}

function renderTimeline(events = state.runtimeEvents) {
  if (!events.length) {
    elements.timeline.textContent = "No runtime events yet.";
    return;
  }
  elements.timeline.innerHTML = events
    .slice(-14)
    .reverse()
    .map((event) => {
      const payload = event.payload ?? {};
      const summary =
        payload.status ??
        payload.workflow ??
        payload.outcome ??
        payload.evidenceObservationStatus ??
        payload.workerTerminalOutcome ??
        payload.nextAction ??
        "";
      return `
        <div class="timeline-item">
          <small>${escapeHtml(event.createdAt ?? event.created_at ?? "")}</small>
          <b>${escapeHtml(event.eventType ?? event.event_type ?? "event")}</b>
          <span>${escapeHtml(compact(summary, "recorded"))}</span>
        </div>
      `;
    })
    .join("");
}

function startEventStream(sessionId, userId) {
  if (!sessionId || state.eventSource?.brainstySessionId === sessionId) return;
  if (state.eventSource) state.eventSource.close();
  const params = new URLSearchParams({ sessionId });
  if (userId) params.set("userId", userId);
  const eventSource = new EventSource(`/api/runtime/events/stream?${params.toString()}`);
  eventSource.brainstySessionId = sessionId;
  eventSource.onmessage = (event) => appendRuntimeEvent(JSON.parse(event.data));
  [
    "runtime.stream.opened",
    "workflow.classified",
    "worker.plan.prepared",
    "approval.recorded",
    "approval.consumed",
    "worker.status.updated",
    "worker.followup.scheduled",
    "worker.followup.dispatching",
    "worker.followup.completed",
    "memory.retained",
    "llm.decision"
  ].forEach((eventName) => {
    eventSource.addEventListener(eventName, (event) => appendRuntimeEvent(JSON.parse(event.data)));
  });
  eventSource.onerror = () => {
    elements.timeline.classList.add("error");
  };
  state.eventSource = eventSource;
}

function appendRuntimeEvent(event) {
  state.runtimeEvents.push(event);
  state.runtimeEvents = state.runtimeEvents.slice(-80);
  renderTimeline();
}

async function loadRuntimeEvents() {
  if (!state.session?.id) return;
  const payload = await api(`/api/runtime/events?sessionId=${encodeURIComponent(state.session.id)}&limit=80`, { method: "GET" });
  state.runtimeEvents = payload.events ?? [];
  renderTimeline();
}

async function startSession() {
  const enrollment = await api("/api/orchestrator/auth-start", {
    method: "POST",
    body: JSON.stringify(memberPayload())
  });
  updateSession(enrollment);
  renderSequence();
  renderAnswer();
  await loadRuntimeEvents();
  addMessage("assistant", `Signed in locally for ${enrollment.user?.email ?? "the planned user"}.`);
  return enrollment;
}

async function ensureSession() {
  if (state.session?.id) return;
  await startSession();
}

async function runChat(message, options = {}) {
  await ensureSession();
  state.latestMessage = message;
  const payload = {
    ...memberPayload(),
    sessionId: state.session.id,
    message,
    executeEvidenceObservation: Boolean(options.executeEvidenceObservation),
    requireLivePortalProof: Boolean(options.requireLivePortalProof ?? elements.requireLivePortalProof.checked),
    useOfficialOpenClawWorker: Boolean(options.useOfficialOpenClawWorker ?? elements.useOfficialOpenClawWorker.checked),
    officialOpenClawUseCurrentTab: Boolean(options.officialOpenClawUseCurrentTab ?? elements.officialOpenClawCurrentTab.checked),
    officialOpenClawMultiPage: Boolean(options.officialOpenClawMultiPage ?? elements.officialOpenClawMultiPage.checked),
    useLiveModel: elements.useLiveModel.checked,
    approvalToken: options.approvalToken,
    approvalTaskId: options.approvalTaskId,
    workerContinuationId: options.workerContinuationId
  };
  const result = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 240000
  });
  updateLatestRun(result);
  await loadRuntimeEvents();
  addMessage("assistant", result.finalResponse ?? "The graph returned without a final response.");
  return result;
}

async function createWorkerContinuation(taskId) {
  const payload = await api("/api/worker-continuations", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: state.session.id,
      userId: state.user.id,
      approvalScope: READ_ONLY_SCOPE,
      allowedAction: READ_ONLY_SCOPE,
      correlationId: graphState().graph_trace_id ?? state.session.langgraph_thread_id,
      reason: "User-friendly MVP app saved the read-only OpenClaw worker as a follow-up.",
      reportEverySeconds: 30,
      metadata: {
        source: "mvp_user_ui",
        workflow: graphState().workflow ?? null
      }
    })
  });
  if (!payload.ok) throw new Error(payload.error ?? payload.status ?? "Could not create worker continuation.");
  return payload.continuation;
}

async function approveReadOnly(taskId) {
  const approval = await api("/api/orchestrator/approve", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: state.session.id,
      userId: state.user.id,
      approvalScope: READ_ONLY_SCOPE,
      allowedAction: READ_ONLY_SCOPE,
      expiresInMinutes: 15
    })
  });
  if (!approval.ok && approval.status !== "approved") {
    throw new Error(approval.error ?? approval.status ?? "Approval was not accepted.");
  }
  return approval;
}

async function approveAndRun(taskId) {
  await ensureSession();
  const shouldUseOfficialWorker = elements.useOfficialOpenClawWorker.checked;
  const continuation = shouldUseOfficialWorker ? await createWorkerContinuation(taskId) : null;
  const approval = await approveReadOnly(taskId);
  addMessage("system", `Approved read-only observation for task ${taskId}. Actions taken so far: none.`);
  await runChat(state.latestMessage || elements.message.value, {
    approvalToken: approval.approvalToken,
    approvalTaskId: taskId,
    workerContinuationId: continuation?.id,
    executeEvidenceObservation: true,
    requireLivePortalProof: elements.requireLivePortalProof.checked,
    useOfficialOpenClawWorker: shouldUseOfficialWorker,
    officialOpenClawUseCurrentTab: elements.officialOpenClawCurrentTab.checked,
    officialOpenClawMultiPage: elements.officialOpenClawMultiPage.checked
  });
}

async function saveFollowup(taskId) {
  await ensureSession();
  const continuation = await createWorkerContinuation(taskId);
  addMessage("system", `Saved read-only worker follow-up ${continuation.id}. It will still need approval before execution.`);
  await loadRuntimeEvents();
}

function renderWorkerStatus(payload) {
  state.workerStatus = payload;
  const live = payload.liveReadiness ?? {};
  const currentTab = live.currentTab ?? payload.currentTab ?? {};
  const status = live.status ?? (payload.ready ? "ready" : "not ready");
  elements.workerStatus.innerHTML = `
    <span>${escapeHtml(status)}</span>
    <br />
    <span>${escapeHtml(live.nextAction ?? currentTab.title ?? payload.version ?? "No next action reported.")}</span>
  `;
}

async function checkWorker() {
  const payload = await api("/api/openclaw/official/status", { method: "GET", timeoutMs: 60000 });
  renderWorkerStatus(payload);
  addMessage("system", `OpenClaw readiness: ${payload.liveReadiness?.status ?? (payload.ready ? "ready" : "not ready")}.`);
  return payload;
}

async function markPortalReady() {
  elements.requireLivePortalProof.checked = true;
  elements.useOfficialOpenClawWorker.checked = true;
  elements.officialOpenClawCurrentTab.checked = true;
  elements.officialOpenClawMultiPage.checked = true;
  const payload = await checkWorker();
  const status = payload.liveReadiness?.status ?? "not reported";
  addMessage(
    "system",
    status === "ready_for_read_only_approval"
      ? "Portal is ready for a read-only approval-gated worker run."
      : `Portal preferences are enabled, but worker readiness is ${status}. Complete any login or challenge yourself in the dedicated OpenClaw browser.`
  );
}

function resetView() {
  if (state.eventSource) state.eventSource.close();
  state.user = null;
  state.session = null;
  state.latestRun = null;
  state.latestTaskId = null;
  state.runtimeEvents = [];
  state.eventSource = null;
  elements.sessionId.value = "";
  elements.authStatus.textContent = "Not signed in";
  elements.workerStatus.textContent = "Worker not checked";
  elements.messages.innerHTML = "";
  elements.approvalPanel.textContent = "No pending worker proposal yet.";
  elements.discoveryPanel.textContent = "No discovery report yet.";
  renderAnswer();
  renderTimeline([]);
  renderSequence();
}

document.addEventListener("click", (event) => {
  const approveButton = event.target.closest("[data-approve-run]");
  if (approveButton) {
    runAction("Preparing approved read-only worker run...", () => approveAndRun(approveButton.dataset.approveRun));
    return;
  }
  const followupButton = event.target.closest("[data-save-followup]");
  if (followupButton) {
    runAction("Saving worker follow-up...", () => saveFollowup(followupButton.dataset.saveFollowup));
  }
});

$("#startSession").addEventListener("click", () => runAction("Starting local planned-user session...", startSession));
$("#checkWorker").addEventListener("click", () => runAction("Checking official OpenClaw readiness...", checkWorker));
$("#portalReady").addEventListener("click", () => runAction("Checking portal readiness...", markPortalReady));
$("#resetApp").addEventListener("click", resetView);

document.querySelectorAll(".workflow-button").forEach((button) => {
  button.addEventListener("click", () => {
    const message = button.dataset.message;
    elements.message.value = message;
    addMessage("user", message);
    runAction("Routing workflow through LangGraph...", () => runChat(message, { executeEvidenceObservation: false }));
  });
});

$("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = elements.message.value.trim();
  if (!message) return;
  addMessage("user", message);
  runAction("Routing message through LangGraph...", () => runChat(message, { executeEvidenceObservation: false }));
});

renderSequence();
