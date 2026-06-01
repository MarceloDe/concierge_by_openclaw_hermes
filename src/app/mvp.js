const DEFAULT_BENEFITS_MESSAGE = "Do I still owe anything before insurance starts paying?";
const READ_ONLY_SCOPE = "read_only_observation";
const READ_ONLY_DOCUMENT_SCOPE = "read_only_document_observation";

const state = {
  user: null,
  session: null,
  latestRun: null,
  latestTaskId: null,
  latestMessage: DEFAULT_BENEFITS_MESSAGE,
  runtimeEvents: [],
  documentCandidates: [],
  eventSource: null,
  runtimeStreamAbortController: null,
  facadeAccessToken: null,
  latestFacadeTask: null,
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
  backendRoute: $("#backendRoute"),
  facadeUrl: $("#facadeUrl"),
  facadeStatus: $("#facadeStatus"),
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
  if (Array.isArray(value)) return value.length ? value.map(formatListValue).join(", ") : fallback;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatListValue(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "object") return String(value);
  return (
    value.section ??
    value.label ??
    value.type ??
    value.status ??
    value.url ??
    JSON.stringify(value)
  );
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

function backendMode() {
  return elements.backendRoute?.value ?? "node";
}

function usingFacade() {
  return backendMode() === "wefella";
}

function facadeBaseUrl() {
  return (elements.facadeUrl?.value ?? "http://127.0.0.1:8000").trim().replace(/\/$/, "");
}

function setFacadeStatus(message, className = "") {
  elements.facadeStatus.textContent = message;
  elements.facadeStatus.className = `status-text ${className}`.trim();
}

function facadeHeaders(extra = {}) {
  return {
    "content-type": "application/json",
    ...(state.facadeAccessToken ? { authorization: `Bearer ${state.facadeAccessToken}` } : {}),
    ...extra
  };
}

async function facadeApi(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 180000;
  const timeout = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(`${facadeBaseUrl()}${path}`, {
      ...options,
      headers: facadeHeaders(options.headers ?? {}),
      signal: controller.signal
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = payload.detail ?? payload.error ?? payload.status ?? response.statusText;
      throw new Error(`${response.status} ${message}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function routeApi(path, options = {}) {
  return usingFacade() ? facadeApi(path, options) : api(path, options);
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
  loadDocumentCandidates().catch(() => {});
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

function memoryStatus(result = state.latestRun) {
  const memory = productMemoryRetain(result);
  if (memory.status) return memory.status;
  if (memory.productMemoryRetained) return "retained";
  if (memory.repairStatus) return memory.repairStatus;
  if (memory.enabled === false || memory.productMemoryEnabled === false) return "disabled";
  return "not reported";
}

function proposalStatus(result = state.latestRun) {
  const proposal = graphState(result).openclaw_skill_proposal;
  return proposal?.task?.status ?? proposal?.status ?? "not prepared";
}

function approvalStatus(result = state.latestRun) {
  const evidence = evidenceObservation(result);
  if (evidence.status?.includes("waiting_for_approval")) return "needed";
  if (evidence.approval?.status) return evidence.approval.status;
  if (sourcePointers(result).length) return "approved_consumed";
  if (proposalStatus(result) === "pending_approval") return "pending";
  return "waiting";
}

function approvalConsumed(result = state.latestRun) {
  const approval = approvalStatus(result);
  return approval === "consumed" || approval.includes("consumed") || sourcePointers(result).length > 0;
}

function approvalTaskId(result = state.latestRun) {
  const evidence = evidenceObservation(result);
  return evidence.workerContinuation?.taskId ?? graphState(result).openclaw_skill_proposal?.task?.id ?? null;
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
      ${metric("Memory", memoryStatus(result))}
      ${metric("Backend", usingFacade() ? "FastAPI facade" : "Node direct")}
      ${metric("Facade task", state.latestFacadeTask?.task_id ?? "none")}
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
  const taskId = approvalTaskId(result);
  const status = proposalStatus(result);
  const approval = approvalStatus(result);
  if (!taskId) {
    elements.approvalPanel.innerHTML = `<p>No OpenClaw worker proposal for the latest run.</p>`;
    return;
  }
  const canApprove = status === "pending_approval" && !approvalConsumed(result);
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
    ${
      canApprove
        ? `<div class="approval-actions">
            <button type="button" data-approve-run="${escapeHtml(taskId)}">Approve + Run Read-Only</button>
            <button class="secondary-button" type="button" data-save-followup="${escapeHtml(taskId)}">Save As Follow-Up</button>
          </div>`
        : `<p class="success-line">Read-only approval has already been consumed or evidence has already been captured for this run.</p>`
    }
    <p class="danger-line">Read-only observation only. Login, passkey, 2FA, captcha, password manager, SSN entry, payer contact, form submission, and account changes stay outside this approval.</p>
  `;
}

function discoveryReport(result = state.latestRun) {
  return evidenceObservation(result).discoveryReport ?? result?.browserResult?.officialOpenClaw?.discoveryReport ?? null;
}

function documentCandidatesFromState(result = state.latestRun) {
  const reportCandidates = discoveryReport(result)?.documentDiscovery?.candidates ?? [];
  const candidates = state.documentCandidates.length ? state.documentCandidates : reportCandidates;
  return candidates.map((candidate) => ({
    ...candidate,
    candidateId: candidate.candidateId ?? candidate.id ?? "",
    proposal: candidate.proposal ?? null
  }));
}

function renderDocumentCandidateCard(candidate) {
  const proposal = candidate.proposal;
  const taskId = proposal?.task?.id ?? proposal?.taskId ?? null;
  const status = candidate.readOnlyOpenAllowed ? "read-only candidate" : `blocked: ${candidate.blockedReason ?? "policy"}`;
  const action = (() => {
    if (!candidate.readOnlyOpenAllowed) return `<span class="danger-line">Blocked by candidate policy.</span>`;
    if (!taskId) {
      return `<button class="secondary-button" type="button" data-propose-document-candidate="${escapeHtml(candidate.candidateId)}">Prepare Approval</button>`;
    }
    return `<button type="button" data-approve-document-candidate="${escapeHtml(taskId)}" data-document-candidate-id="${escapeHtml(candidate.candidateId)}">Approve + Observe</button>`;
  })();
  return `
    <article class="candidate-card ${candidate.readOnlyOpenAllowed ? "" : "blocked"}">
      <div>
        <strong>${escapeHtml(candidate.label ?? candidate.type ?? "Document candidate")}</strong>
        <span>${escapeHtml(status)}</span>
      </div>
      <small>${escapeHtml(candidate.url ?? "no URL")}</small>
      <dl>
        <dt>Type</dt>
        <dd>${escapeHtml(candidate.type ?? "document")}</dd>
        <dt>Candidate</dt>
        <dd>${escapeHtml(candidate.candidateId || "not assigned")}</dd>
        <dt>Proposal</dt>
        <dd>${escapeHtml(proposal?.task?.status ?? proposal?.status ?? "not prepared")}</dd>
      </dl>
      <div class="approval-actions">${action}</div>
    </article>
  `;
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
  const candidates = documentCandidatesFromState(result);
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
    <div class="candidate-grid">
      ${candidates.length ? candidates.map(renderDocumentCandidateCard).join("") : '<p class="eyebrow">No selectable document candidates yet.</p>'}
    </div>
  `;
}

function renderSequence(result = state.latestRun) {
  const approval = approvalStatus(result);
  const sequence = {
    auth: state.session?.id ? ["done", "signed in"] : ["active", "waiting"],
    route: graphState(result).structured_intent ? ["done", graphState(result).workflow ?? "routed"] : ["active", "waiting"],
    approval: approvalConsumed(result) ? ["done", approval] : approval === "needed" || approval === "pending" ? ["active", approval] : ["", "waiting"],
    worker: sourcePointers(result).length ? ["done", workerOutcome(result)] : workerOutcome(result) !== "not run" && workerOutcome(result) !== "not requested" ? ["active", workerOutcome(result)] : ["", "waiting"],
    evidence: sourcePointers(result).length ? ["done", `${sourcePointers(result).length} pointers`] : ["", evidenceObservation(result).status ?? "waiting"],
    memory: memoryStatus(result) !== "not reported" ? ["done", memoryStatus(result)] : ["", "waiting"],
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
  const mode = backendMode();
  if (!sessionId || (state.eventSource?.brainstySessionId === sessionId && state.eventSource?.brainstyBackendMode === mode)) return;
  if (state.eventSource) state.eventSource.close();
  if (usingFacade()) {
    startFacadeRuntimeEventStream(sessionId, userId);
    return;
  }
  const params = new URLSearchParams({ sessionId });
  if (userId) params.set("userId", userId);
  const eventSource = new EventSource(`/api/runtime/events/stream?${params.toString()}`);
  eventSource.brainstySessionId = sessionId;
  eventSource.brainstyBackendMode = mode;
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

function startFacadeRuntimeEventStream(sessionId, userId) {
  if (state.runtimeStreamAbortController) state.runtimeStreamAbortController.abort();
  const controller = new AbortController();
  state.runtimeStreamAbortController = controller;
  const params = new URLSearchParams({ sessionId });
  if (userId) params.set("userId", userId);
  state.eventSource = {
    brainstySessionId: sessionId,
    brainstyBackendMode: backendMode(),
    close: () => controller.abort()
  };
  fetch(`${facadeBaseUrl()}/api/runtime/events/stream?${params.toString()}`, {
    headers: facadeHeaders({ accept: "text/event-stream" }),
    signal: controller.signal
  })
    .then(async (response) => {
      if (!response.ok || !response.body) throw new Error(`runtime stream unavailable (${response.status})`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const event = parseSseBlock(block);
          if (event?.data?.eventType || event?.data?.event_type) {
            appendRuntimeEvent(event.data);
          }
        }
        if (done) break;
      }
    })
    .catch((error) => {
      if (controller.signal.aborted) return;
      elements.timeline.classList.add("error");
      appendRuntimeEvent({
        createdAt: new Date().toISOString(),
        eventType: "facade.runtime_stream.error",
        payload: { error: error.message }
      });
    });
}

function appendRuntimeEvent(event) {
  state.runtimeEvents.push(event);
  state.runtimeEvents = state.runtimeEvents.slice(-80);
  renderTimeline();
}

async function loadRuntimeEvents() {
  if (!state.session?.id) return;
  const payload = await routeApi(`/api/runtime/events?sessionId=${encodeURIComponent(state.session.id)}&limit=80`, { method: "GET" });
  state.runtimeEvents = payload.events ?? [];
  renderTimeline();
}

async function startSession() {
  if (usingFacade()) return startFacadeSession();
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

async function startFacadeSession() {
  const payload = await facadeApi("/api/auth/local-session", {
    method: "POST",
    body: JSON.stringify({
      member: memberPayload().member,
      session_id: elements.sessionId.value.trim() || state.session?.id || undefined,
      resume_latest_session: elements.resumeLatestSession.checked
    }),
    timeoutMs: 90000
  });
  state.facadeAccessToken = payload.access_token;
  updateSession(payload.enrollment);
  setFacadeStatus(`FastAPI facade active · token for ${payload.user_id}`);
  renderSequence();
  renderAnswer();
  await loadRuntimeEvents();
  addMessage("assistant", `Signed in through the Wefella FastAPI facade for ${payload.enrollment?.user?.email ?? "the planned user"}.`);
  return payload.enrollment;
}

async function ensureSession() {
  if (state.session?.id && (!usingFacade() || state.facadeAccessToken)) return;
  await startSession();
}

async function runChat(message, options = {}) {
  await ensureSession();
  state.latestMessage = message;
  if (usingFacade()) return runFacadeChat(message, options);
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
    workerContinuationId: options.workerContinuationId,
    approvalScope: options.approvalScope,
    allowedAction: options.allowedAction,
    approvedDocumentCandidateId: options.approvedDocumentCandidateId
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

function facadeChatPayload(message, options = {}) {
  return {
    user_id: state.user.id,
    session_id: state.session.id,
    member: memberPayload().member,
    message,
    execute_evidence_observation: Boolean(options.executeEvidenceObservation),
    require_live_portal_proof: Boolean(options.requireLivePortalProof ?? elements.requireLivePortalProof.checked),
    use_official_openclaw_worker: Boolean(options.useOfficialOpenClawWorker ?? elements.useOfficialOpenClawWorker.checked),
    official_openclaw_use_current_tab: Boolean(options.officialOpenClawUseCurrentTab ?? elements.officialOpenClawCurrentTab.checked),
    official_openclaw_multi_page: Boolean(options.officialOpenClawMultiPage ?? elements.officialOpenClawMultiPage.checked),
    use_live_model: elements.useLiveModel.checked,
    resume_latest_session: elements.resumeLatestSession.checked,
    payload_mode: "phi_allowed_identifier_masked_reasoning",
    approval_token: options.approvalToken,
    approval_task_id: options.approvalTaskId,
    worker_continuation_id: options.workerContinuationId,
    approval_scope: options.approvalScope,
    allowed_action: options.allowedAction,
    approved_document_candidate_id: options.approvedDocumentCandidateId
  };
}

async function runFacadeChat(message, options = {}) {
  const accepted = await facadeApi("/api/chat", {
    method: "POST",
    body: JSON.stringify(facadeChatPayload(message, options)),
    timeoutMs: 30000
  });
  state.latestFacadeTask = accepted;
  setFacadeStatus(`FastAPI task queued · ${accepted.task_id}`);
  addMessage("system", `Wefella FastAPI accepted task ${accepted.task_id}. Streaming status now.`);
  const result = await waitForFacadeTask(accepted.task_id);
  updateLatestRun(result);
  await loadRuntimeEvents();
  addMessage("assistant", result.finalResponse ?? "The facade task completed without a final response.");
  return result;
}

async function waitForFacadeTask(taskId) {
  try {
    return await streamFacadeTask(taskId);
  } catch (error) {
    setFacadeStatus(`Stream fallback to polling · ${error.message}`, "error");
    return pollFacadeTask(taskId);
  }
}

async function streamFacadeTask(taskId) {
  const response = await fetch(`${facadeBaseUrl()}/api/chat/stream/${encodeURIComponent(taskId)}`, {
    headers: facadeHeaders({ accept: "text/event-stream" })
  });
  if (!response.ok || !response.body) {
    throw new Error(`stream unavailable (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (!event) continue;
      appendRuntimeEvent({
        createdAt: new Date().toISOString(),
        eventType: `facade.${event.type}`,
        payload: event.data
      });
      if (event.type === "done") {
        if (event.data.status !== "completed") throw new Error(event.data.error ?? event.data.status ?? "facade task failed");
        setFacadeStatus(`FastAPI task completed · ${taskId}`, "success-line");
        return event.data.result;
      }
    }
    if (done) break;
  }
  throw new Error("stream ended before terminal event");
}

function parseSseBlock(block) {
  const lines = block.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  if (!dataLines.length) return null;
  const type = eventLine ? eventLine.slice("event:".length).trim() : "message";
  const rawData = dataLines.map((line) => line.slice("data:".length).trim()).join("\n");
  return { type, data: JSON.parse(rawData) };
}

async function pollFacadeTask(taskId) {
  for (let index = 0; index < 160; index += 1) {
    const status = await facadeApi(`/api/chat/status/${encodeURIComponent(taskId)}`, { method: "GET", timeoutMs: 30000 });
    appendRuntimeEvent({
      createdAt: new Date().toISOString(),
      eventType: "facade.poll",
      payload: { status: status.status, taskId }
    });
    if (status.status === "completed") {
      setFacadeStatus(`FastAPI task completed · ${taskId}`, "success-line");
      return status.result;
    }
    if (status.status === "failed") throw new Error(status.error ?? "facade task failed");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("facade task did not finish before timeout");
}

async function createWorkerContinuation(taskId, options = {}) {
  const scope = options.approvalScope ?? READ_ONLY_SCOPE;
  const payload = await routeApi("/api/worker-continuations", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: state.session.id,
      userId: state.user.id,
      approvalScope: scope,
      allowedAction: options.allowedAction ?? scope,
      correlationId: graphState().graph_trace_id ?? state.session.langgraph_thread_id,
      reason: options.reason ?? "User-friendly MVP app saved the read-only OpenClaw worker as a follow-up.",
      reportEverySeconds: 30,
      metadata: {
        source: "mvp_user_ui",
        candidateId: options.candidateId ?? null,
        workflow: graphState().workflow ?? null
      }
    })
  });
  if (!payload.ok) throw new Error(payload.error ?? payload.status ?? "Could not create worker continuation.");
  return payload.continuation;
}

async function approveReadOnly(taskId, options = {}) {
  const scope = options.approvalScope ?? READ_ONLY_SCOPE;
  const approval = await routeApi("/api/orchestrator/approve", {
    method: "POST",
    body: JSON.stringify({
      taskId,
      sessionId: state.session.id,
      userId: state.user.id,
      approvalScope: scope,
      allowedAction: options.allowedAction ?? scope,
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

async function loadDocumentCandidates() {
  if (!state.session?.id) return null;
  const params = new URLSearchParams({ sessionId: state.session.id });
  if (state.user?.id) params.set("userId", state.user.id);
  if (elements.portalUrl.value.trim()) params.set("portalUrl", elements.portalUrl.value.trim());
  const payload = await routeApi(`/api/document-candidates?${params.toString()}`, { method: "GET", timeoutMs: 30000 });
  state.documentCandidates = payload.candidates ?? [];
  renderDiscovery();
  return payload;
}

async function proposeDocumentCandidate(candidateId) {
  await ensureSession();
  const payload = await routeApi("/api/document-candidates/propose", {
    method: "POST",
    body: JSON.stringify({
      userId: state.user.id,
      sessionId: state.session.id,
      workflow: graphState().workflow ?? "eligibility_benefits_navigation",
      candidateId,
      portalUrl: elements.portalUrl.value.trim(),
      expiresInMinutes: 15
    })
  });
  addMessage("system", `Prepared document candidate approval ${payload.task.id}. Actions taken: none.`);
  await loadDocumentCandidates();
  await loadRuntimeEvents();
  return payload;
}

async function approveAndObserveDocumentCandidate(taskId, candidateId) {
  await ensureSession();
  const continuation = await createWorkerContinuation(taskId, {
    approvalScope: READ_ONLY_DOCUMENT_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_SCOPE,
    candidateId,
    reason: "User-friendly MVP app saved the approved document candidate observation as a follow-up."
  });
  const approval = await approveReadOnly(taskId, {
    approvalScope: READ_ONLY_DOCUMENT_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_SCOPE
  });
  addMessage("system", `Approved one read-only document candidate for task ${taskId}. Actions taken so far: none.`);
  await runChat(state.latestMessage || elements.message.value || DEFAULT_BENEFITS_MESSAGE, {
    approvalToken: approval.approvalToken,
    approvalTaskId: taskId,
    workerContinuationId: continuation?.id,
    approvedDocumentCandidateId: candidateId,
    approvalScope: READ_ONLY_DOCUMENT_SCOPE,
    allowedAction: READ_ONLY_DOCUMENT_SCOPE,
    executeEvidenceObservation: true,
    requireLivePortalProof: true,
    useOfficialOpenClawWorker: true,
    officialOpenClawUseCurrentTab: false,
    officialOpenClawMultiPage: false
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
  const payload = await routeApi("/api/openclaw/official/status", { method: "GET", timeoutMs: 60000 });
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

async function checkFacade() {
  const payload = await facadeApi("/api/health", { method: "GET", timeoutMs: 15000 });
  const status = payload.node_runtime_ok ? "reachable and connected to Node" : "reachable but Node runtime is unavailable";
  setFacadeStatus(`FastAPI ${payload.version} · ${status}`);
  addMessage("system", `Wefella facade health: ${status}.`);
  return payload;
}

function activateFacadeRoute() {
  elements.backendRoute.value = "wefella";
  state.facadeAccessToken = null;
  state.latestFacadeTask = null;
  setFacadeStatus("FastAPI facade selected. Start Session will mint a local MVP bearer token.");
  renderAnswer(state.latestRun);
}

function handleBackendRouteChange() {
  state.facadeAccessToken = null;
  state.latestFacadeTask = null;
  if (usingFacade()) {
    setFacadeStatus("FastAPI facade selected. Check Facade, then Start Session.");
  } else {
    setFacadeStatus("Direct Node route active.");
  }
  renderAnswer(state.latestRun);
}

function resetView() {
  if (state.eventSource) state.eventSource.close();
  state.user = null;
  state.session = null;
  state.latestRun = null;
  state.latestTaskId = null;
  state.facadeAccessToken = null;
  state.latestFacadeTask = null;
  state.runtimeEvents = [];
  state.documentCandidates = [];
  state.eventSource = null;
  elements.sessionId.value = "";
  elements.authStatus.textContent = "Not signed in";
  elements.workerStatus.textContent = "Worker not checked";
  setFacadeStatus(usingFacade() ? "FastAPI facade selected. Check Facade, then Start Session." : "Direct Node route active.");
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
    return;
  }
  const proposeDocumentButton = event.target.closest("[data-propose-document-candidate]");
  if (proposeDocumentButton) {
    runAction("Preparing document candidate approval...", () => proposeDocumentCandidate(proposeDocumentButton.dataset.proposeDocumentCandidate));
    return;
  }
  const approveDocumentButton = event.target.closest("[data-approve-document-candidate]");
  if (approveDocumentButton) {
    runAction("Running approved document observation...", () =>
      approveAndObserveDocumentCandidate(approveDocumentButton.dataset.approveDocumentCandidate, approveDocumentButton.dataset.documentCandidateId)
    );
  }
});

$("#startSession").addEventListener("click", () => runAction("Starting local planned-user session...", startSession));
$("#checkWorker").addEventListener("click", () => runAction("Checking official OpenClaw readiness...", checkWorker));
$("#portalReady").addEventListener("click", () => runAction("Checking portal readiness...", markPortalReady));
$("#checkFacade").addEventListener("click", () => runAction("Checking Wefella FastAPI facade...", checkFacade));
$("#useFacade").addEventListener("click", activateFacadeRoute);
elements.backendRoute.addEventListener("change", handleBackendRouteChange);
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
