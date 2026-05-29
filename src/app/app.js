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
const productAuthStatus = document.querySelector("#productAuthStatus");
const productAuth = document.querySelector("#productAuth");
const requireLivePortalProof = document.querySelector("#requireLivePortalProof");
const useOfficialOpenClawWorker = document.querySelector("#useOfficialOpenClawWorker");
const chatJourney = document.querySelector("#chatJourney");
const runtimeTimeline = document.querySelector("#runtimeTimeline");
const portalReady = document.querySelector("#portalReady");
const loadRuntimeEventsButton = document.querySelector("#loadRuntimeEvents");

let latestChatRun = null;
let latestUserMessage = "";
let runtimeEvents = [];
let runtimeEventSource = null;
let runtimeStreamSessionId = null;
let productSignedIn = false;

function value(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function addMessage(role, content, options = {}) {
  const node = document.createElement("div");
  node.className = `message ${role}`;
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

function missingInfoLines(state) {
  return [
    ...(state.structured_intent?.missingEvidence ?? []).map((item) => `Missing evidence: ${item}`),
    ...(state.workflow_route?.missingUserFields ?? []).map((item) => `Missing user field: ${item}`),
    ...(state.workflow_route?.missingDataPointers ?? []).map((item) => `Missing data pointer: ${item}`),
    ...(state.workflow_route?.disabledTools ?? []).map((item) => `Tool disabled: ${item}`)
  ];
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

function currentSessionId() {
  return value("sessionId") || latestChatRun?.session?.id || "";
}

function journeyClass(ok, waiting = false) {
  if (ok) return "done";
  return waiting ? "waiting" : "";
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
      detail: memoryRetain.adapter ? `${memoryRetain.adapter} retain=${Boolean(memoryRetain.retained)}` : "waiting",
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
    return `${payload.status ?? "unknown"}${payload.terminalOutcome ? ` · ${payload.terminalOutcome}` : ""} · actions ${(payload.actionsTaken ?? []).join(", ") || "none"}`;
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
    return `${payload.productMemoryAdapter ?? "disabled"} · retained ${payload.productMemoryRetained ?? false}`;
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
  const sourcePointers = state.source_pointers ?? [];
  const workerHasCapturedEvidence =
    ["captured_visible_page", "captured_official_openclaw_read_only_observation", "captured_multi_page_scan"].includes(
      evidence.status
    ) || sourcePointers.length > 0;
  const canRequestWorkerAction = proposalTask.id && !workerHasCapturedEvidence;
  return `
    <article class="chat-proof-card">
      <h3>Workflow Proof</h3>
      <dl>
        <dt>Workflow</dt>
        <dd>${escapeHtml(state.workflow ?? "unknown")} · ${escapeHtml(state.route_reason ?? "unknown")}</dd>
        <dt>Intent</dt>
        <dd>${escapeHtml(state.structured_intent?.intent ?? state.intent ?? "unknown")} · confidence ${escapeHtml(state.structured_intent?.confidence ?? "n/a")}</dd>
        <dt>GPT decision</dt>
        <dd>${escapeHtml(llmDecision.mode ?? "not run")} · ${escapeHtml(llmDecision.usedByRouter ? "used by router" : "not used")} · ${escapeHtml(llmDecision.workflow ?? "no workflow")} · confidence ${escapeHtml(llmDecision.confidence ?? "n/a")}</dd>
        <dt>Missing info</dt>
        <dd>${escapeHtml(missing.join(" · ") || "none")}</dd>
        <dt>OpenClaw proposal</dt>
        <dd>${escapeHtml(proposalTask.status ?? "not prepared")} · ${escapeHtml(proposalTask.id ?? "no task")}</dd>
        <dt>Worker plan</dt>
        <dd>${escapeHtml(workerPlan.dispatchStatus ?? "not prepared")} · jobs ${escapeHtml(workerPlan.workerJobs?.length ?? 0)}</dd>
        <dt>Approval</dt>
        <dd>${escapeHtml(state.approval_resume?.status ?? "not consumed")}</dd>
        <dt>Evidence</dt>
        <dd>${escapeHtml(evidence.status ?? "not requested")} · actions ${escapeHtml((evidence.actionsTaken ?? []).join(", ") || "none")}</dd>
        <dt>Sources</dt>
        <dd>${escapeHtml(sourcePointers.map(sourcePointerLabel).join(" · ") || "none")}</dd>
        <dt>Product memory</dt>
        <dd>${escapeHtml(productMemoryRecall.adapter ?? "disabled")} recall ${escapeHtml(productMemoryRecall.facts?.length ?? 0)} · retain ${escapeHtml(productMemoryRetain.retained ?? false)}</dd>
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
    </article>
  `;
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

function evidenceChannelSummary(channels = []) {
  if (!channels.length) return "not reported";
  return channels
    .map((channel) => {
      const parts = [channel.channel, channel.status];
      if (channel.confidence !== null && channel.confidence !== undefined) parts.push(`confidence ${channel.confidence}`);
      if (channel.wordCount !== null && channel.wordCount !== undefined) parts.push(`${channel.wordCount} words`);
      return parts.filter(Boolean).join(" · ");
    })
    .join(" | ");
}

function renderWorkerContinuationCard(continuation) {
  const progress = continuation.lastProgressEvent?.payload ?? {};
  const isTerminal = ["cancelled", "completed", "blocked", "expired"].includes(continuation.status);
  const terminalNote =
    continuation.status === "cancelled"
      ? "Cancelled follow-up is closed. Actions taken remain none."
      : "This follow-up is closed. Actions taken are shown above.";
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

function renderWorkerOutcomeCard(result) {
  const state = result.graphRun?.state ?? {};
  const evidence = state.evidence_observation ?? {};
  const sourcePointers = state.source_pointers ?? [];
  const balances = result.trace?.coverageBalances ?? [];
  const reason = friendlyWorkerBlocker(evidence);
  const terminalOutcome =
    sourcePointers.length > 0
      ? "completed_with_sourced_result"
      : evidence.status === "missing_approval_token"
        ? "not_possible_policy_or_approval_block"
        : evidence.status?.startsWith("blocked")
          ? "not_possible_insurance_or_portal_block"
          : evidence.status ?? "pending";
  return `
    <article class="chat-proof-card">
      <h3>Worker Result</h3>
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
        <dt>Evidence channels</dt>
        <dd>${escapeHtml(evidenceChannelSummary(evidence.evidenceChannels ?? []))}</dd>
        <dt>Blocker</dt>
        <dd>${escapeHtml(sourcePointers.length ? "none" : reason)}</dd>
      </dl>
    </article>
  `;
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
  const status = payload.status ?? payload;
  const retained = payload.retained ?? {};
  const recalled = payload.recalled ?? {};
  const facts = status.facts ?? recalled.facts ?? [];
  productMemoryStatus.textContent = `${status.adapter ?? "graphiti"} · ${status.schemaReady ? "schema ready" : status.status ?? "not ready"}`;
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
        <dt>Fan-out/Fan-in</dt>
        <dd>${escapeHtml(`${workerPlan.fanOut?.mode ?? "none"} / ${workerPlan.fanIn?.owner ?? "none"}`)}</dd>
        <dt>Audit event</dt>
        <dd>${escapeHtml(auditEvent.id ?? "not recorded")}</dd>
        <dt>Actions taken</dt>
        <dd>${escapeHtml((validation.actionsTaken ?? []).join(", ") || "none")}</dd>
      </dl>
    </article>
  `;
}

function renderOfficialOpenClawStatus(payload) {
  const checks = payload.checks ?? {};
  const config = payload.config ?? {};
  skillStatus.textContent = `${payload.status ?? "unknown"} · ${payload.ready ? "ready" : "attention"}`;
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
        <dt>Skill</dt>
        <dd>${escapeHtml(config.skillKey ?? "unknown")} · ready ${escapeHtml(checks.skillReady ?? false)}</dd>
        <dt>Personal skills</dt>
        <dd>${checks.personalSkillsExcluded ? "excluded from project agent" : "check required"}</dd>
        <dt>Allowed actions</dt>
        <dd>${escapeHtml((config.allowedActions ?? []).join(", ") || "none")}</dd>
        <dt>Blocked actions</dt>
        <dd>${escapeHtml((config.blockedActions ?? []).join(", ") || "none")}</dd>
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

function markPortalReady() {
  if (!requireSignedInBeforeWorkflow()) return;
  requireLivePortalProof.checked = true;
  useOfficialOpenClawWorker.checked = true;
  addMessage(
    "assistant",
    "Portal readiness noted. I will still ask for read-only approval before any OpenClaw observation. You handle all login, passwords, passkeys, SSN, and 2FA in the portal."
  );
  renderJourneyState(latestChatRun);
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
    useLiveModel: document.querySelector("#useLiveModel").checked,
    approvalToken: options.approvalToken,
    approvalTaskId: options.approvalTaskId,
    workerContinuationId: options.workerContinuationId
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
  addMessage("assistant", result.finalResponse);
  addMessage("assistant", renderChatProof(result), { html: true });
  addMessage("assistant", renderWorkerOutcomeCard(result), { html: true });
  renderMissingInfoPrompt(result);
  renderJourneyState(result);
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
    useOfficialOpenClawWorker: useOfficialOpenClawWorker.checked
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
  addMessage("assistant", renderWorkerContinuationCard(payload.continuation), { html: true });
  await loadRuntimeEventsForSession(latestChatRun.session.id);
  if (payload.trace) renderReview(payload.trace);
  trace.textContent = JSON.stringify(payload, null, 2);
  return payload;
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
  addMessage("assistant", renderWorkerContinuationCard(payload.continuation), { html: true });
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
    useOfficialOpenClawWorker: true
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
  addMessage("assistant", renderWorkerContinuationCard(payload.continuation), { html: true });
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

portalReady.addEventListener("click", () => {
  markPortalReady();
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

renderJourneyState();
renderRuntimeTimeline();
addMessage(
  "assistant",
  "Sign in, choose a workflow, or type a benefits question. I will route it through the real LangGraph harness and show workflow proof here in chat. OpenClaw remains approval-gated."
);
