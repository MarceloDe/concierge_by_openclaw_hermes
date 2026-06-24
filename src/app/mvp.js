import { mountRemoteBrowser } from "./remoteBrowser.js";

const DEFAULT_BENEFITS_MESSAGE = "Do I still owe anything before insurance starts paying?";
const READ_ONLY_SCOPE = "read_only_observation";
const READ_ONLY_DOCUMENT_SCOPE = "read_only_document_observation";
const AI2UI_BLOCK_CONTRACT_VERSION = "brainstyworkers.ai2ui.blocks.v2";
const UI_MODES = ["chat", "split", "guided", "bento"];
const AI2UI_MODE_BLOCKS = {
  chat: ["answer_markdown", "degraded_answer_with_options", "cost_comparison", "pharmacy_formulary", "procedure_checklist", "provider_network", "source_citations", "human_handoff", "next_steps"],
  split: ["answer_markdown", "degraded_answer_with_options", "cost_comparison", "pharmacy_formulary", "procedure_checklist", "provider_network", "workflow_status", "approval_gate", "worker_status", "source_citations", "memory_status", "human_handoff", "safety_notice", "next_steps"],
  guided: ["workflow_status", "degraded_answer_with_options", "cost_comparison", "pharmacy_formulary", "procedure_checklist", "provider_network", "approval_gate", "worker_status", "source_citations", "memory_status", "human_handoff", "next_steps", "safety_notice"],
  bento: ["answer_markdown", "degraded_answer_with_options", "cost_comparison", "pharmacy_formulary", "procedure_checklist", "provider_network", "workflow_status", "approval_gate", "worker_status", "source_citations", "memory_status", "human_handoff", "safety_notice", "next_steps"]
};
const AI2UI_SUPPORTED_TYPES = new Set([...AI2UI_MODE_BLOCKS.bento, "unknown"]);

const state = {
  user: null,
  session: null,
  uiMode: localStorage.getItem("brainstyworkers.mvp.uiMode") || "split",
  latestRun: null,
  latestTaskId: null,
  latestMessage: DEFAULT_BENEFITS_MESSAGE,
  runtimeEvents: [],
  documentCandidates: [],
  latestUpload: null,
  latestBillVerification: null,
  latestBillAnswer: null,
  sessionHistory: null,
  latestFeedback: null,
  latestExport: null,
  handoffs: [],
  eventSource: null,
  runtimeStreamAbortController: null,
  facadeAccessToken: null,
  latestFacadeTask: null,
  parityResult: null,
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
  documentFile: $("#documentFile"),
  documentKind: $("#documentKind"),
  billText: $("#billText"),
  billPanel: $("#billPanel"),
  uploadPanel: $("#uploadPanel"),
  feedbackComment: $("#feedbackComment"),
  historyPanel: $("#historyPanel"),
  handoffPanel: $("#handoffPanel"),
  messages: $("#messages"),
  message: $("#message"),
  currentAnswer: $("#currentAnswer"),
  approvalPanel: $("#approvalPanel"),
  discoveryPanel: $("#discoveryPanel"),
  phase9fPanel: $("#phase9fPanel"),
  parityPanel: $("#parityPanel"),
  timeline: $("#timeline"),
  sequence: $("#sequence"),
  modeButtons: document.querySelectorAll("[data-ui-mode]")
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

function setUiMode(mode, options = {}) {
  const nextMode = UI_MODES.includes(mode) ? mode : "split";
  state.uiMode = nextMode;
  document.body.dataset.uiMode = nextMode;
  localStorage.setItem("brainstyworkers.mvp.uiMode", nextMode);
  elements.modeButtons.forEach((button) => {
    const active = button.dataset.uiMode === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (!options.skipRender) renderAnswer(state.latestRun);
}

function ai2uiBlocks(result = state.latestRun) {
  const blocks = result?.ai2uiBlocks ?? graphState(result).ai2ui_blocks ?? [];
  return normalizeUiBlocks(blocks);
}

function normalizeUiBlocks(blocks = []) {
  return (Array.isArray(blocks) ? blocks : []).map(normalizeUiBlock);
}

function normalizeUiBlock(block, index) {
  const type = String(block?.type ?? "unknown");
  if (!AI2UI_SUPPORTED_TYPES.has(type) || type === "unknown") {
    return {
      id: block?.id ?? `unknown:${index}`,
      type: "unknown",
      version: AI2UI_BLOCK_CONTRACT_VERSION,
      title: "Unsupported UI block",
      payload: {
        originalType: type,
        safePreview: compact(block?.payload ?? block, "No payload")
      },
      renderHints: { severity: "warning", fallback: "safe_json_preview" }
    };
  }
  return {
    id: block.id ?? `${type}:${index}`,
    type,
    version: block.version ?? AI2UI_BLOCK_CONTRACT_VERSION,
    title: block.title ?? type,
    payload: block.payload ?? {},
    renderHints: block.renderHints ?? {}
  };
}

function blocksForMode(result, mode = state.uiMode) {
  const order = AI2UI_MODE_BLOCKS[mode] ?? AI2UI_MODE_BLOCKS.split;
  const blocks = ai2uiBlocks(result);
  const unknownBlocks = blocks.filter((block) => block.type === "unknown");
  const ordered = order
    .map((type) => blocks.find((block) => block.type === type))
    .filter(Boolean);
  return [...ordered, ...unknownBlocks];
}

function renderAi2UiBlocks(result, mode = state.uiMode) {
  const blocks = blocksForMode(result, mode);
  if (!blocks.length) {
    return `
      <section class="ai2ui-empty">
        <p class="eyebrow">AI2UI</p>
        <h3>No typed block payload returned</h3>
        <p class="status-text">The latest backend response did not include typed UI blocks. This is a contract gap to investigate.</p>
      </section>
    `;
  }
  return `
    <section class="ai2ui-section ai2ui-mode-${escapeHtml(mode)}" aria-label="AI2UI typed blocks">
      <div class="ai2ui-section-header">
        <div>
          <p class="eyebrow">AI2UI</p>
          <h3>${escapeHtml(modeLabel(mode))} mode</h3>
        </div>
        <span>${escapeHtml(blocks[0]?.version ?? AI2UI_BLOCK_CONTRACT_VERSION)}</span>
      </div>
      <div class="ai2ui-block-grid">
        ${blocks.map((block) => renderAi2UiBlock(block, result)).join("")}
      </div>
    </section>
  `;
}

function modeLabel(mode) {
  return {
    chat: "Chat",
    split: "Split",
    guided: "Guided",
    bento: "Bento"
  }[mode] ?? "Split";
}

function renderAi2UiBlock(block, result) {
  if (block.type === "unknown") return renderUnknownAi2UiBlock(block);
  const payload = block.payload ?? {};
  const className = `ai2ui-block block-${block.type} ${block.renderHints?.severity ?? ""}`.trim();
  if (block.type === "answer_markdown") {
    return `
      <article class="${className}">
        <h3>${escapeHtml(block.title)}</h3>
        <p class="answer-text">${escapeHtml(payload.markdown || result?.finalResponse || "No final answer returned.")}</p>
      </article>
    `;
  }
  if (block.type === "workflow_status") {
    return renderDefinitionBlock(block, [
      ["Workflow", payload.workflow],
      ["Intent", payload.intent],
      ["Confidence", payload.confidence],
      ["Route reason", payload.routeReason],
      ["Trace", payload.traceId],
      ["LLM decision", payload.llmDecisionMode]
    ]);
  }
  if (block.type === "cost_comparison") {
    return renderCostComparisonBlock(block);
  }
  if (block.type === "pharmacy_formulary") {
    return renderPharmacyFormularyBlock(block);
  }
  if (block.type === "procedure_checklist") {
    return renderProcedureChecklistBlock(block);
  }
  if (block.type === "provider_network") {
    return renderProviderNetworkBlock(block);
  }
  if (block.type === "degraded_answer_with_options") {
    return renderDegradedAnswerBlock(block);
  }
  if (block.type === "approval_gate") {
    return renderDefinitionBlock(block, [
      ["Status", payload.status],
      ["Task", payload.taskId],
      ["Scope", payload.approvalScope],
      ["Execution mode", payload.executionMode],
      ["Consumed", payload.approvalTokenConsumed],
      ["Actions taken", payload.actionsTaken?.length ? payload.actionsTaken.join(", ") : "none"]
    ]);
  }
  if (block.type === "worker_status") {
    return renderDefinitionBlock(block, [
      ["Status", payload.status],
      ["Outcome", payload.terminalOutcome],
      ["Continuation", payload.continuationId],
      ["Source pointers", payload.sourcePointerCount],
      ["Discovery", payload.discoveryAvailable ? "available" : "not available"],
      ["Blocker", payload.blocker || "none"],
      ["Actions taken", payload.actionsTaken?.length ? payload.actionsTaken.join(", ") : "none"]
    ]);
  }
  if (block.type === "source_citations") {
    const pointers = payload.sourcePointers ?? [];
    return `
      <article class="${className}">
        <h3>${escapeHtml(block.title)}</h3>
        <p class="status-text">${escapeHtml(payload.sourcePointerCount ?? pointers.length)} stored source pointer(s) · ${escapeHtml(payload.evidenceStatus ?? "not requested")}</p>
        <div class="ai2ui-citation-list">
          ${
            pointers.length
              ? pointers.slice(0, 6).map((pointer) => `
                  <div class="ai2ui-citation-row">
                    <b>${escapeHtml(pointer.displayLabel ?? "source pointer")}</b>
                    <span>${escapeHtml([pointer.table, pointer.id].filter(Boolean).join("/") || pointer.kind || "source")}</span>
                    <small>${escapeHtml(pointer.extractionHash ?? pointer.sourceUrl ?? "hash/url not reported")}</small>
                  </div>
                `).join("")
              : '<p class="status-text">No stored citations yet.</p>'
          }
        </div>
      </article>
    `;
  }
  if (block.type === "memory_status") {
    return renderDefinitionBlock(block, [
      ["Adapter", payload.adapter],
      ["Recall", `${payload.recallStatus ?? "not reported"} · ${payload.recalledFactCount ?? 0} fact(s)`],
      ["Retain", payload.retainStatus],
      ["Episode", payload.episodeUuid],
      ["Next action", payload.nextAction || "none"],
      ["Cortex product memory", payload.cortexProductMemory ? "yes" : "no"]
    ]);
  }
  if (block.type === "human_handoff") {
    return renderDefinitionBlock(block, [
      ["Status", `${payload.status ?? "open"} · ${payload.priority ?? "urgent"}`],
      ["Type", payload.handoffType],
      ["Task", payload.taskId],
      ["Summary", payload.summary]
    ]);
  }
  if (block.type === "safety_notice") {
    return `
      <article class="${className}">
        <h3>${escapeHtml(block.title)}</h3>
        <p>${escapeHtml(payload.message ?? "Safety boundary active.")}</p>
        <ul class="ai2ui-checklist">
          ${(payload.blockedActions ?? []).slice(0, 8).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>
    `;
  }
  if (block.type === "next_steps") {
    return `
      <article class="${className}">
        <h3>${escapeHtml(block.title)}</h3>
        <ol class="ai2ui-checklist">
          ${(payload.items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ol>
      </article>
    `;
  }
  return renderUnknownAi2UiBlock(block);
}

function renderCostComparisonBlock(block) {
  const payload = block.payload ?? {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const className = `ai2ui-block block-${block.type} ${block.renderHints?.severity ?? ""}`.trim();
  return `
    <article class="${className}">
      <h3>${escapeHtml(block.title)}</h3>
      <p class="status-text">${escapeHtml(payload.status ?? "not ready")} · ${escapeHtml(payload.rowCount ?? rows.length)} source-backed row(s)</p>
      ${
        rows.length
          ? `<div class="cost-comparison-grid">
              ${rows.map((row) => `
                <div class="cost-comparison-row">
                  <strong>${escapeHtml(row.optionLabel ?? "Cost option")}</strong>
                  <b>${escapeHtml(row.costSignal ?? "cost signal")}</b>
                  <span>${escapeHtml(row.tradeoff ?? row.assumption ?? "Review cited evidence before acting.")}</span>
                  <small>${escapeHtml((row.sourcePointerIds ?? []).join(", ") || "source pointer required")}</small>
                </div>
              `).join("")}
            </div>`
          : '<p class="status-text">No cost comparison row is shown because no cited source pointer carried enough cost evidence.</p>'
      }
      <ul class="ai2ui-checklist">
        ${(payload.assumptions ?? []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderPharmacyFormularyBlock(block) {
  const payload = block.payload ?? {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const className = `ai2ui-block block-${block.type} ${block.renderHints?.severity ?? ""}`.trim();
  return `
    <article class="${className}">
      <h3>${escapeHtml(block.title)}</h3>
      <p class="status-text">${escapeHtml(payload.status ?? "not ready")} · ${escapeHtml(payload.rowCount ?? rows.length)} source-backed row(s)</p>
      ${
        rows.length
          ? `<div class="pharmacy-formulary-grid">
              ${rows.map((row) => `
                <div class="pharmacy-formulary-row">
                  <strong>${escapeHtml(row.medicationLabel ?? "Medication or pharmacy benefit")}</strong>
                  <b>${escapeHtml(row.formularySignal ?? "formulary signal")}</b>
                  <span>${escapeHtml((row.requirements ?? []).length ? row.requirements.join(", ") : "No requirement signal extracted from cited evidence.")}</span>
                  <small>${escapeHtml((row.sourcePointerIds ?? []).join(", ") || "source pointer required")}</small>
                </div>
              `).join("")}
            </div>`
          : '<p class="status-text">No pharmacy/formulary row is shown because no cited source pointer carried formulary, drug tier, prior authorization, quantity-limit, specialty, or mail-order evidence.</p>'
      }
      <ul class="ai2ui-checklist">
        ${rows.length
          ? [
              "This card is evidence navigation, not medication advice.",
              "Clinical substitutions or medication changes belong with the prescriber or pharmacist."
            ].map((item) => `<li>${escapeHtml(item)}</li>`).join("")
          : (payload.missingEvidence ?? []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderProcedureChecklistBlock(block) {
  const payload = block.payload ?? {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const className = `ai2ui-block block-${block.type} ${block.renderHints?.severity ?? ""}`.trim();
  return `
    <article class="${className}">
      <h3>${escapeHtml(block.title)}</h3>
      <p class="status-text">${escapeHtml(payload.status ?? "not ready")} · ${escapeHtml(payload.rowCount ?? rows.length)} source-backed item(s)</p>
      ${
        rows.length
          ? `<div class="procedure-checklist-grid">
              ${rows.map((row) => `
                <div class="procedure-checklist-row">
                  <strong>${escapeHtml(row.taskLabel ?? "Procedure preparation item")}</strong>
                  <b>${escapeHtml(row.category ?? "administrative_preparation")}</b>
                  <span>${escapeHtml([(row.signals ?? []).join(", "), row.timing ? `timing: ${row.timing}` : null].filter(Boolean).join(" · ") || "Source-backed checklist item.")}</span>
                  <small>${escapeHtml((row.sourcePointerIds ?? []).join(", ") || "source pointer required")}</small>
                </div>
              `).join("")}
            </div>`
          : '<p class="status-text">No procedure checklist is shown because no cited source pointer carried procedure, facility, authorization, referral, document, arrival, or support evidence.</p>'
      }
      <ul class="ai2ui-checklist">
        ${rows.length
          ? [
              "This card is administrative preparation support, not medical advice.",
              "Follow clinical prep or medication instructions only from the cited clinician/facility source and confirm questions with the care team."
            ].map((item) => `<li>${escapeHtml(item)}</li>`).join("")
          : (payload.missingEvidence ?? []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderProviderNetworkBlock(block) {
  const payload = block.payload ?? {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const className = `ai2ui-block block-${block.type} ${block.renderHints?.severity ?? ""}`.trim();
  return `
    <article class="${className}">
      <h3>${escapeHtml(block.title)}</h3>
      <p class="status-text">${escapeHtml(payload.status ?? "not ready")} · ${escapeHtml(payload.rowCount ?? rows.length)} source-backed option(s)</p>
      ${
        rows.length
          ? `<div class="provider-network-grid">
              ${rows.map((row) => `
                <div class="provider-network-row">
                  <strong>${escapeHtml(row.providerLabel ?? "Provider or facility option")}</strong>
                  <b>${escapeHtml(row.networkSignal ?? "network evidence")}</b>
                  <span>${escapeHtml((row.details ?? []).length ? row.details.join(", ") : "Source-backed network evidence.")}</span>
                  <small>${escapeHtml((row.sourcePointerIds ?? []).join(", ") || "source pointer required")}</small>
                </div>
              `).join("")}
            </div>`
          : '<p class="status-text">No provider/facility option is shown because no cited source pointer carried provider directory, plan network, portal, referral, or facility evidence.</p>'
      }
      <ul class="ai2ui-checklist">
        ${rows.length
          ? [
              "This card is evidence navigation, not a live network guarantee.",
              "Confirm network status with the plan and provider before scheduling or care decisions."
            ].map((item) => `<li>${escapeHtml(item)}</li>`).join("")
          : (payload.missingEvidence ?? []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderDegradedAnswerBlock(block) {
  const payload = block.payload ?? {};
  const options = Array.isArray(payload.options) ? payload.options : [];
  const unverified = Array.isArray(payload.unverified) ? payload.unverified : [];
  const className = `ai2ui-block block-${block.type} ${block.renderHints?.severity ?? ""}`.trim();
  return `
    <article class="${className}">
      <h3>${escapeHtml(block.title)}</h3>
      <p class="status-text">${escapeHtml(payload.status ?? "best_effort_degraded")} · ${escapeHtml(payload.reason ?? "missing evidence")}</p>
      <div class="degraded-options-grid">
        ${options.map((option) => `
          <div class="degraded-option-row">
            <strong>${escapeHtml(option.label ?? option.id ?? "Option")}</strong>
            <b>${escapeHtml(option.requiresApproval ? "approval" : "no approval")}</b>
            <span>${escapeHtml(option.description ?? "")}</span>
            ${option.taskId ? `<small>Task ${escapeHtml(option.taskId)} · ${escapeHtml(option.approvalScope ?? "read_only_observation")}</small>` : ""}
          </div>
        `).join("")}
      </div>
      <ul class="ai2ui-checklist">
        ${unverified.length
          ? unverified.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")
          : "<li>Missing evidence is labeled as unverified instead of treated as a safety refusal.</li>"}
      </ul>
    </article>
  `;
}

function renderDefinitionBlock(block, rows) {
  return `
    <article class="ai2ui-block block-${escapeHtml(block.type)} ${escapeHtml(block.renderHints?.severity ?? "")}">
      <h3>${escapeHtml(block.title)}</h3>
      <dl>
        ${rows.map(([label, value]) => `
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(compact(value))}</dd>
        `).join("")}
      </dl>
    </article>
  `;
}

function renderUnknownAi2UiBlock(block) {
  return `
    <article class="ai2ui-block block-unknown warning">
      <h3>${escapeHtml(block.title ?? "Unsupported UI block")}</h3>
      <dl>
        <dt>Original type</dt>
        <dd>${escapeHtml(block.payload?.originalType ?? "unknown")}</dd>
        <dt>Fallback</dt>
        <dd>${escapeHtml(block.renderHints?.fallback ?? "safe_json_preview")}</dd>
      </dl>
      <p class="status-text">${escapeHtml(block.payload?.safePreview ?? "No safe preview available.")}</p>
    </article>
  `;
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
      const message = apiErrorMessage(payload, response.statusText);
      throw new Error(`${response.status} ${message}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function backendMode() {
  return elements.backendRoute?.value ?? "wefella";
}

function usingFacade() {
  return backendMode() === "wefella";
}

function facadeBaseUrl() {
  // ?facade= query override (points at a working facade, e.g. :8001) > the input field > default.
  const q = new URLSearchParams(location.search).get("facade");
  if (q) return q.trim().replace(/\/$/, "");
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
      const message = apiErrorMessage(payload, response.statusText);
      throw new Error(`${response.status} ${message}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function apiErrorMessage(payload, fallback) {
  if (payload?.detail) return payload.detail;
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error?.message) return payload.error.message;
  return payload?.status ?? fallback;
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
  if (state.session?.id) mountWorkerBrowser();
}

// Mount the live worker-browser widget once per session/backend route. Regular-user
// facade mode must use the hosted browser sandbox API; the local CDP path is kept for
// explicit Node/operator parity only.
function mountWorkerBrowser() {
  const mount = document.getElementById("remoteBrowserMount");
  const panel = document.getElementById("workerBrowserPanel");
  if (!mount || !panel) return;
  const facadeSelected = usingFacade();
  const providerMode = facadeSelected ? "facade_remote" : "local_cdp";
  const remoteBrowserKey = [
    state.session.id,
    providerMode,
    providerMode === "facade_remote" ? facadeBaseUrl() : "same-origin-node"
  ].join("::");
  if (state.remoteBrowserSession === remoteBrowserKey) return;
  state.remoteBrowser?.destroy?.();
  state.remoteBrowser = mountRemoteBrowser(mount, {
    sessionId: state.session.id,
    userId: state.user?.id ?? null,
    apiBase: "",
    targetUrl: elements.portalUrl.value.trim() || null,
    providerMode,
    facadeBaseUrl: facadeBaseUrl(),
    authToken: state.facadeAccessToken,
    provider: "hosted_remote"
  });
  state.remoteBrowserSession = remoteBrowserKey;
  panel.hidden = false;
}

function updateLatestRun(result) {
  state.latestRun = result;
  updateSession(result);
  state.latestTaskId = result.graphRun?.state?.openclaw_skill_proposal?.task?.id ?? null;
  renderAnswer(result);
  renderApproval(result);
  renderDiscovery(result);
  renderPhase9FProof(result);
  renderHandoffPanel({ handoffs: [humanHandoff(result)].filter(Boolean) });
  loadDocumentCandidates().catch(() => {});
  loadSessionHistory().catch(() => {});
  loadHandoffs().catch(() => {});
  renderSequence(result);
}

function sourcePointers(result = state.latestRun) {
  return result?.sourcePointers ?? result?.graphRun?.state?.source_pointers ?? [];
}

function sourcePointerLabel(pointer = {}) {
  return pointer.displayLabel || [pointer.table, pointer.id ?? pointer.rowId].filter(Boolean).join("/") || pointer.sourceUrl || "source pointer";
}

function uploadedDocumentForPointer(pointer = {}, result = state.latestRun) {
  const uploadId = pointer.id ?? pointer.citation?.uploadId;
  return (graphState(result).uploaded_document_context?.documents ?? []).find((document) => document.uploadId === uploadId) ?? null;
}

function renderCitationDetails(result = state.latestRun) {
  const pointers = sourcePointers(result);
  if (!pointers.length) {
    return `
      <section class="citation-panel" aria-label="Source details">
        <div class="panel-heading">
          <p class="eyebrow">Citations</p>
          <h3>No stored source pointer yet</h3>
        </div>
        <p class="status-text">Run an uploaded-document question or approve read-only evidence observation to create source-backed citations.</p>
      </section>
    `;
  }
  return `
    <section class="citation-panel" aria-label="Source details">
      <div class="panel-heading">
        <p class="eyebrow">Citations</p>
        <h3>Source details</h3>
      </div>
      <div class="citation-grid">
        ${pointers.map((pointer) => renderCitationCard(pointer, result)).join("")}
      </div>
    </section>
  `;
}

function renderCitationCard(pointer, result) {
  const document = uploadedDocumentForPointer(pointer, result);
  const fields = pointer.evidenceFields ?? document?.fields ?? [];
  const spans = pointer.citation?.sourceSpans ?? document?.sourceSpans ?? [];
  const fieldRows = fields
    .slice(0, 8)
    .map((field) => `
      <div class="citation-field">
        <b>${escapeHtml(field.label ?? "field")}</b>
        <span>${escapeHtml(compact(field.value ?? field.text))}</span>
        <small>${escapeHtml(field.confidence ?? document?.confidence ?? "unknown")}</small>
      </div>
    `)
    .join("");
  const spanRows = spans
    .slice(0, 4)
    .map((span) => `
      <li>
        <span>${escapeHtml(span.spanId ?? span.span_id ?? "span")}</span>
        <p>${escapeHtml(span.snippet ?? "No snippet.")}</p>
      </li>
    `)
    .join("");
  return `
    <article class="citation-card">
      <div class="citation-card-header">
        <strong>${escapeHtml(sourcePointerLabel(pointer))}</strong>
        <span>${escapeHtml(pointer.kind ?? pointer.table ?? "source")}</span>
      </div>
      <dl>
        <dt>Pointer</dt>
        <dd>${escapeHtml(`${pointer.table ?? "source"}/${pointer.id ?? pointer.rowId ?? "unknown"}`)}</dd>
        <dt>URL</dt>
        <dd>${escapeHtml(pointer.sourceUrl ?? "not reported")}</dd>
        <dt>Method</dt>
        <dd>${escapeHtml(pointer.extractionMethod ?? pointer.citation?.extractionMethod ?? "not reported")}</dd>
        <dt>Hash</dt>
        <dd>${escapeHtml(pointer.extractionHash ?? pointer.sha256 ?? "not reported")}</dd>
      </dl>
      ${fieldRows ? `<div class="citation-fields">${fieldRows}</div>` : '<p class="status-text">No structured fields attached.</p>'}
      ${spanRows ? `<ol class="citation-spans">${spanRows}</ol>` : ""}
    </article>
  `;
}

function renderMemoryDetails(result = state.latestRun) {
  const recall = graphState(result).product_memory_recall ?? result?.graphRun?.productMemory?.recall ?? {};
  const retain = productMemoryRetain(result);
  const facts = recall.facts ?? [];
  return `
    <section class="memory-panel" aria-label="Product memory proof">
      <div class="panel-heading">
        <p class="eyebrow">Product Memory</p>
        <h3>Graphiti retain/recall</h3>
      </div>
      <div class="key-value-list">
        <dl>
          <dt>Recall</dt>
          <dd>${escapeHtml(recall.enabled === false ? "disabled" : `${recall.adapter ?? "graphiti"} · ${facts.length} fact(s)`)}</dd>
          <dt>Retain</dt>
          <dd>${escapeHtml(memoryStatus(result))}</dd>
          <dt>Episode</dt>
          <dd>${escapeHtml(retain.episodeUuid ?? "none")}</dd>
          <dt>Next action</dt>
          <dd>${escapeHtml(retain.repairPlan?.nextAction ?? retain.message ?? retain.error ?? (retain.retained ? "retained" : "not reported"))}</dd>
        </dl>
      </div>
      ${
        facts.length
          ? `<div class="memory-facts">${facts.slice(0, 3).map((fact) => `<p>${escapeHtml(fact.fact ?? fact.name ?? fact.uuid ?? "fact")}</p>`).join("")}</div>`
          : '<p class="status-text">No recalled facts returned for this run.</p>'
      }
    </section>
  `;
}

function evidenceObservation(result = state.latestRun) {
  return result?.graphRun?.state?.evidence_observation ?? {};
}

function graphState(result = state.latestRun) {
  return result?.graphRun?.state ?? {};
}

function dynamicSkillContext(result = state.latestRun) {
  const snapshot = graphState(result);
  return snapshot.dynamic_skill_context ?? snapshot.dynamicSkillContext ?? null;
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

function renderDynamicSkillCard(result = state.latestRun) {
  const context = dynamicSkillContext(result);
  if (!context) {
    return `
      <section class="dynamic-skill-panel" aria-label="Dynamic skill resolution">
        <div class="panel-heading">
          <p class="eyebrow">Dynamic Skills</p>
          <h3>Waiting for workflow</h3>
        </div>
        <p class="status-text">Run a chat workflow to resolve insurance, journey, and execution skills.</p>
      </section>
    `;
  }
  const missing = dynamicSkillMissingData(context);
  const matches = context.matches ?? [];
  return `
    <section class="dynamic-skill-panel" aria-label="Dynamic skill resolution">
      <div class="panel-heading">
        <p class="eyebrow">Dynamic Skills</p>
        <h3>${escapeHtml(dynamicSkillSelectedLine(context))}</h3>
      </div>
      <div class="key-value-list">
        <dl>
          <dt>Success estimate</dt>
          <dd>${escapeHtml(context.successEstimate?.overallChance ?? "n/a")}</dd>
          <dt>Missing data</dt>
          <dd>${escapeHtml(missing.join(" · ") || "none")}</dd>
          <dt>OpenClaw tasks</dt>
          <dd>${escapeHtml((context.requiredOpenClawTasks ?? []).join(" · ") || "none")}</dd>
          <dt>Search</dt>
          <dd>${escapeHtml((context.requiredSearch ?? []).join(" · ") || "none")}</dd>
          <dt>APIs</dt>
          <dd>${escapeHtml((context.requiredApis ?? []).join(" · ") || "none")}</dd>
        </dl>
      </div>
      <div class="dynamic-skill-match-grid">
        ${
          matches.length
            ? matches.slice(0, 4).map((match) => `
                <article class="dynamic-skill-match-card">
                  <strong>${escapeHtml(match.title ?? match.skillKey)}</strong>
                  <span>${escapeHtml(match.skillKind ?? "skill")} · fit ${escapeHtml(match.fit?.score ?? 0)} · success ${escapeHtml(match.success?.chance ?? "n/a")}</span>
                  <small>${escapeHtml((match.requiredWorkers?.openclawTasks ?? match.requiredOpenClawTasks ?? []).slice(0, 2).join(" · ") || "no worker task listed")}</small>
                </article>
              `).join("")
            : '<p class="status-text">No skill match returned.</p>'
        }
      </div>
    </section>
  `;
}

function humanHandoff(result = state.latestRun) {
  return graphState(result).human_handoff?.handoff ?? result?.trace?.humanHandoffs?.at?.(-1) ?? null;
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

function operatorDashboardUrl(result = state.latestRun) {
  const sessionId = result?.session?.id ?? state.session?.id ?? "";
  const userId = result?.user?.id ?? state.user?.id ?? "";
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  if (userId) params.set("userId", userId);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function evidenceBlocker(result = state.latestRun) {
  const evidence = evidenceObservation(result);
  return (
    evidence.blocker ??
    evidence.reason ??
    evidence.error ??
    evidence.officialOpenClaw?.blocker ??
    evidence.workerContinuation?.blocker ??
    ""
  );
}

function phase9FStatus(result = state.latestRun) {
  if (!result) return "ready_to_test";
  if (sourcePointers(result).length > 0) return "sourced_result";
  const blocker = evidenceBlocker(result);
  const evidence = evidenceObservation(result);
  if (blocker || String(evidence.status ?? "").includes("blocked")) return "precise_blocker";
  if (approvalStatus(result) === "pending" || approvalStatus(result) === "needed") return "pending_approval";
  if (state.latestFacadeTask?.status === "queued") return "facade_task_queued";
  return "in_progress_or_waiting";
}

function renderPhase9FProof(result = state.latestRun) {
  if (!elements.phase9fPanel) return;
  if (!result) {
    elements.phase9fPanel.innerHTML = `
      <p>Run Benefits through the Wefella FastAPI facade, approve read-only observation, and expect either verified source pointers or a precise external blocker.</p>
      <p class="status-text">No worker action is allowed before approval.</p>
    `;
    return;
  }
  const evidence = evidenceObservation(result);
  const pointers = sourcePointers(result);
  const status = phase9FStatus(result);
  const blocker = evidenceBlocker(result);
  const sessionId = result.session?.id ?? state.session?.id ?? "not reported";
  const traceId = graphState(result).graph_trace_id ?? result.session?.langgraph_thread_id ?? "not reported";
  const pointerLabels = pointers
    .slice(0, 3)
    .map(sourcePointerLabel)
    .join(" · ");
  elements.phase9fPanel.innerHTML = `
    <div class="phase-proof-state ${escapeHtml(status)}">
      <strong>${escapeHtml(status)}</strong>
      <span>${escapeHtml(usingFacade() ? "FastAPI facade" : "Node parity route")}</span>
    </div>
    <div class="key-value-list">
      <dl>
        <dt>Session</dt>
        <dd>${escapeHtml(sessionId)}</dd>
        <dt>Trace</dt>
        <dd>${escapeHtml(traceId)}</dd>
        <dt>Approval</dt>
        <dd>${escapeHtml(approvalStatus(result))}</dd>
        <dt>Worker</dt>
        <dd>${escapeHtml(workerOutcome(result))}</dd>
        <dt>Evidence</dt>
        <dd>${escapeHtml(evidence.status ?? "not requested")}</dd>
        <dt>Source pointers</dt>
        <dd>${escapeHtml(pointerLabels || String(pointers.length))}</dd>
        <dt>Memory</dt>
        <dd>${escapeHtml(memoryStatus(result))}</dd>
        <dt>Blocker</dt>
        <dd>${escapeHtml(blocker || "none")}</dd>
      </dl>
    </div>
    <a class="proof-link" href="${escapeHtml(operatorDashboardUrl(result))}">Open operator proof for this session</a>
  `;
}

function renderAnswer(result = null) {
  if (!result) {
    elements.currentAnswer.dataset.mode = state.uiMode;
    elements.currentAnswer.innerHTML = `
      <div class="answer-mode-header">
        <div>
          <p class="eyebrow">Current Answer</p>
          <h2>Start a session to test the full sequence.</h2>
        </div>
        <span>${escapeHtml(modeLabel(state.uiMode))} mode</span>
      </div>
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
    .map(sourcePointerLabel)
    .join(", ");
  const finalResponse = result.finalResponse ?? "No final response returned.";
  const handoff = humanHandoff(result);
  const typedBlocks = ai2uiBlocks(result);
  const skills = dynamicSkillContext(result);

  elements.currentAnswer.dataset.mode = state.uiMode;
  elements.currentAnswer.innerHTML = `
    <div class="answer-mode-header">
      <div>
        <p class="eyebrow">Current Answer</p>
        <h2>${escapeHtml(workflow)}</h2>
      </div>
      <span>${escapeHtml(modeLabel(state.uiMode))} mode · ${escapeHtml(typedBlocks.length)} typed block(s)</span>
    </div>
    ${state.uiMode === "guided" ? '<p class="status-text">Guided mode emphasizes the workflow sequence and the next operator/user decision point.</p>' : ""}
    ${state.uiMode === "bento" ? '<p class="status-text">Bento mode shows every typed AI2UI block returned by LangGraph in a compact proof grid.</p>' : ""}
    ${state.uiMode === "chat" ? `<p>${escapeHtml(finalResponse)}</p>` : ""}
    <div class="answer-grid" aria-label="Latest run proof">
      ${metric("Intent", classifier?.intent ?? stateSnapshot.intent ?? "not reported")}
      ${metric("LLM", llmMode)}
      ${metric("Approval", approvalStatus(result))}
      ${metric("Worker", workerOutcome(result))}
      ${metric("Source pointers", pointers.length)}
      ${metric("Skills", dynamicSkillSelectedLine(skills ?? {}))}
      ${metric("Memory", memoryStatus(result))}
      ${metric("Handoff", handoff ? `${handoff.priority} · ${handoff.status}` : "none")}
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
        <dt>Skill success</dt>
        <dd>${escapeHtml(skills?.successEstimate?.overallChance ?? "n/a")}</dd>
        <dt>Operator proof</dt>
        <dd><a href="${escapeHtml(operatorDashboardUrl(result))}">Open same session in dashboard</a></dd>
      </dl>
    </div>
    ${renderDynamicSkillCard(result)}
    ${renderAi2UiBlocks(result, state.uiMode)}
    ${state.uiMode === "split" ? `${handoff ? renderHandoffCard(handoff) : ""}${renderCitationDetails(result)}${renderMemoryDetails(result)}` : ""}
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

function renderHandoffCard(handoff) {
  if (!handoff) return "";
  return `
    <article class="handoff-card">
      <h3>Human Handoff</h3>
      <dl>
        <dt>Status</dt>
        <dd>${escapeHtml(handoff.status ?? "open")} · ${escapeHtml(handoff.priority ?? "urgent")}</dd>
        <dt>Type</dt>
        <dd>${escapeHtml(handoff.handoffType ?? handoff.handoff_type ?? "urgent_emergency")}</dd>
        <dt>Task</dt>
        <dd>${escapeHtml(handoff.taskId ?? handoff.task_id ?? "not reported")}</dd>
        <dt>Summary</dt>
        <dd>${escapeHtml(handoff.summary ?? "Handoff created.")}</dd>
      </dl>
    </article>
  `;
}

function renderHandoffPanel(payload = {}) {
  if (!elements.handoffPanel) return;
  const handoffs = payload.handoffs ?? state.handoffs ?? [];
  if (!handoffs.length) {
    elements.handoffPanel.textContent = "No handoff created for this session.";
    return;
  }
  elements.handoffPanel.innerHTML = handoffs.slice(0, 5).map(renderHandoffCard).join("");
}

async function loadHandoffs() {
  if (!state.session?.id || !state.user?.id) return null;
  const params = new URLSearchParams({
    sessionId: state.session.id,
    userId: state.user.id,
    limit: "10"
  });
  const payload = await routeApi(`/api/handoffs?${params.toString()}`, {
    method: "GET",
    timeoutMs: 30000
  });
  state.handoffs = payload.handoffs ?? [];
  renderHandoffPanel(payload);
  return payload;
}

function renderSequence(result = state.latestRun) {
  const approval = approvalStatus(result);
  const handoff = humanHandoff(result);
  const sequence = {
    auth: state.session?.id ? ["done", "signed in"] : ["active", "waiting"],
    route: graphState(result).structured_intent ? ["done", graphState(result).workflow ?? "routed"] : ["active", "waiting"],
    skill: dynamicSkillContext(result) ? ["done", dynamicSkillSelectedLine(dynamicSkillContext(result))] : ["", "waiting"],
    approval: approvalConsumed(result) ? ["done", approval] : approval === "needed" || approval === "pending" ? ["active", approval] : ["", "waiting"],
    worker: handoff
      ? ["done", "bypassed"]
      : sourcePointers(result).length
        ? ["done", workerOutcome(result)]
        : workerOutcome(result) !== "not run" && workerOutcome(result) !== "not requested"
          ? ["active", workerOutcome(result)]
          : ["", "waiting"],
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

function lastAssistantMessage(history = state.sessionHistory) {
  return (history?.messages ?? []).filter((message) => message.role === "assistant").at(-1) ?? null;
}

function renderSessionHistory(history = state.sessionHistory) {
  if (!elements.historyPanel) return;
  if (!history) {
    elements.historyPanel.textContent = "No session history loaded yet.";
    return;
  }
  const messages = history.messages ?? [];
  const feedback = history.feedback ?? [];
  const handoffs = history.handoffs ?? [];
  const latestFeedback = state.latestFeedback?.feedback ?? feedback.at(-1) ?? null;
  const rows = messages
    .slice(-6)
    .map((message) => `
      <article class="history-message ${escapeHtml(message.role)}">
        <b>${escapeHtml(message.role)}</b>
        <p>${escapeHtml(message.content).slice(0, 360)}</p>
        <small>${escapeHtml(message.createdAt ?? "")}</small>
      </article>
    `)
    .join("");
  elements.historyPanel.innerHTML = `
    <div class="key-value-list">
      <dl>
        <dt>Session</dt>
        <dd>${escapeHtml(history.session?.id ?? "not reported")}</dd>
        <dt>Messages</dt>
        <dd>${escapeHtml(messages.length)}</dd>
        <dt>Source pointers</dt>
        <dd>${escapeHtml(history.sourcePointerCount ?? (history.sourcePointers ?? []).length ?? 0)}</dd>
        <dt>Feedback</dt>
        <dd>${escapeHtml(latestFeedback ? `${latestFeedback.rating} · ${latestFeedback.status}` : `${feedback.length} recorded`)}</dd>
        <dt>Handoffs</dt>
        <dd>${escapeHtml(handoffs.length ? `${handoffs.length} · ${handoffs.at(-1)?.status ?? "open"}` : "none")}</dd>
        <dt>Export</dt>
        <dd>${escapeHtml(state.latestExport?.filename ?? (history.exportAvailable ? "available" : "waiting for answer"))}</dd>
      </dl>
    </div>
    <div class="history-list">${rows || '<p class="status-text">No messages recorded yet.</p>'}</div>
  `;
}

async function loadSessionHistory() {
  if (!state.session?.id) return null;
  const params = new URLSearchParams();
  if (state.user?.id) params.set("userId", state.user.id);
  const query = params.toString();
  const payload = await routeApi(`/api/sessions/${encodeURIComponent(state.session.id)}${query ? `?${query}` : ""}`, {
    method: "GET",
    timeoutMs: 30000
  });
  state.sessionHistory = payload;
  renderSessionHistory(payload);
  return payload;
}

async function submitFeedback(rating) {
  await ensureSession();
  if (!state.sessionHistory) await loadSessionHistory();
  const latestAssistant = lastAssistantMessage();
  const payload = await routeApi("/api/feedback", {
    method: "POST",
    body: JSON.stringify({
      userId: state.user.id,
      sessionId: state.session.id,
      messageId: latestAssistant?.id ?? null,
      taskId: state.latestFacadeTask?.task_id ?? state.latestTaskId ?? null,
      answerHash: latestAssistant?.contentHash ?? null,
      rating,
      comment: elements.feedbackComment?.value ?? "",
      metadata: {
        source: "mvp_user_ui",
        workflow: graphState().workflow ?? null,
        sourcePointerCount: sourcePointers().length,
        backend: usingFacade() ? "fastapi_facade" : "node_direct"
      }
    }),
    timeoutMs: 30000
  });
  state.latestFeedback = payload;
  elements.feedbackComment.value = "";
  await loadSessionHistory();
  addMessage("system", `Feedback recorded: ${payload.feedback?.rating ?? rating}.`);
  return payload;
}

async function exportSessionAnswer() {
  await ensureSession();
  const params = new URLSearchParams();
  if (state.user?.id) params.set("userId", state.user.id);
  const query = params.toString();
  const payload = await routeApi(`/api/sessions/${encodeURIComponent(state.session.id)}/export${query ? `?${query}` : ""}`, {
    method: "GET",
    timeoutMs: 30000
  });
  state.latestExport = payload;
  downloadTextFile(payload.filename ?? "brainstyworkers-session-export.md", payload.content ?? "");
  renderSessionHistory(state.sessionHistory);
  addMessage("system", `Export ready: ${payload.filename ?? "session export"}.`);
  return payload;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderUploadPanel(upload = state.latestUpload) {
  if (!elements.uploadPanel) return;
  if (!upload) {
    elements.uploadPanel.textContent = "No uploaded document yet.";
    return;
  }
  const extraction = upload.extraction ?? {};
  const fields = extraction.fields ?? [];
  const blockers = extraction.blockers ?? [];
  const spans = extraction.source_spans ?? extraction.sourceSpans ?? [];
  const fieldItems = fields
    .slice(0, 10)
    .map((item) => `
      <div class="upload-field">
        <b>${escapeHtml(item.label)}</b>
        <span>${escapeHtml(item.value)}</span>
      </div>
    `)
    .join("");
  const spanItems = spans
    .slice(0, 5)
    .map((span) => `
      <li>
        <span>${escapeHtml(span.span_id ?? span.spanId ?? "span")}</span>
        <p>${escapeHtml(span.snippet ?? "No snippet.")}</p>
      </li>
    `)
    .join("");
  elements.uploadPanel.innerHTML = `
    <div class="phase-proof-state ${escapeHtml(extraction.status ?? "partial")}">
      <strong>${escapeHtml(extraction.status ?? "not extracted")}</strong>
      <span>${escapeHtml(extraction.method ?? upload.content_type ?? "local extraction")}</span>
    </div>
    <div class="key-value-list">
      <dl>
        <dt>Upload</dt>
        <dd>${escapeHtml(upload.upload_id ?? "not stored")}</dd>
        <dt>File</dt>
        <dd>${escapeHtml(upload.filename ?? "not reported")}</dd>
        <dt>Size</dt>
        <dd>${escapeHtml(upload.byte_size ?? "not reported")} bytes</dd>
        <dt>Text hash</dt>
        <dd>${escapeHtml(extraction.text_hash ?? "none")}</dd>
        <dt>Blockers</dt>
        <dd>${escapeHtml(blockers.length ? blockers.join("; ") : "none")}</dd>
      </dl>
    </div>
    <div class="upload-fields">${fieldItems || '<p class="status-text">No recognized insurance fields yet.</p>'}</div>
    ${spanItems ? `<ol class="citation-spans">${spanItems}</ol>` : ""}
    <p class="upload-preview">${escapeHtml(extraction.safe_text_preview || "No redacted preview available.")}</p>
  `;
}

function renderBillPanel(result = state.latestBillVerification) {
  if (!elements.billPanel) return;
  if (!result) {
    elements.billPanel.textContent = "No bill verification run yet.";
    return;
  }
  const detected = result.detected ?? {};
  const agents = result.parallelAgents ?? [];
  const missing = result.missingEvidence ?? [];
  const answer = state.latestBillAnswer;
  const fields = [
    ["Provider", detected.provider],
    ["Amount", detected.amount ? `$${detected.amount}` : null],
    ["Date", detected.date],
    ["Payer", detected.payer],
    ["Claim", detected.claim],
    ["Bill", detected.billNumberMasked],
    ["CPT/HCPCS", detected.cpt?.join(", ")]
  ];
  elements.billPanel.innerHTML = `
    <div class="phase-proof-state ${escapeHtml(result.status ?? "unknown")}">
      <strong>${escapeHtml(result.status ?? "not analyzed")}</strong>
      <span>${escapeHtml(result.sourcePointer?.kind ?? "bill note")}</span>
    </div>
    <div class="key-value-list">
      <dl>
        <dt>Source pointer</dt>
        <dd>${escapeHtml(result.sourcePointer?.id ?? "none")}</dd>
        <dt>Raw text stored</dt>
        <dd>${escapeHtml(result.sourcePointer?.rawTextReturned ? "attention" : "no")}</dd>
        <dt>Missing</dt>
        <dd>${escapeHtml(missing.length ? missing.join(", ") : "none")}</dd>
      </dl>
    </div>
    <div class="upload-fields">
      ${fields.map(([label, value]) => `<div class="upload-field"><b>${escapeHtml(label)}</b><span>${escapeHtml(value || "not found")}</span></div>`).join("")}
    </div>
    <ol class="citation-spans">
      ${agents.map((agent) => `<li><span>${escapeHtml(agent.key)}</span><p>${escapeHtml(agent.status)} · ${escapeHtml(agent.task)}</p></li>`).join("")}
    </ol>
    <p class="upload-preview">${escapeHtml(result.noLoginFallback?.message ?? "No no-login fallback reported.")}</p>
    ${
      answer
        ? `
          <section class="citation-panel" aria-label="Bill sourced answer">
            <div class="panel-heading">
              <p class="eyebrow">Final Answer</p>
              <h3>${escapeHtml(answer.mode ?? "deterministic_fallback")}</h3>
            </div>
            <p class="upload-preview">${escapeHtml(answer.finalResponse ?? "No final response composed yet.")}</p>
            <div class="key-value-list">
              <dl>
                <dt>Validation</dt>
                <dd>${escapeHtml(answer.validation?.valid ? "valid" : (answer.validation?.issues ?? []).join(", ") || "fallback")}</dd>
                <dt>Model text used</dt>
                <dd>${escapeHtml(answer.usedModelComposedText ? "yes" : "no")}</dd>
                <dt>Sources</dt>
                <dd>${escapeHtml((answer.sourcePointerIds ?? []).join(", ") || result.sourcePointer?.id || "none")}</dd>
              </dl>
            </div>
          </section>
        `
        : ""
    }
  `;
}

async function analyzeBill() {
  await ensureSession();
  const text = elements.billText?.value?.trim() ?? "";
  if (!text) {
    elements.billPanel.textContent = "Paste or type the visible bill details first.";
    addMessage("system", "Paste or type the visible bill details before running bill verification.");
    return { ok: false, status: "bill_text_required" };
  }
  const payload = await api("/api/bill-verification/analyze", {
    method: "POST",
    body: JSON.stringify({
      text,
      filename: "mvp-bill-note.txt",
      userId: state.user?.id,
      sessionId: state.session?.id,
      payer: elements.payer?.value
    }),
    timeoutMs: 30000
  });
  state.latestBillVerification = payload;
  state.latestBillAnswer = {
    mode: "preparing_sourced_answer",
    usedModelComposedText: false,
    finalResponse: "Preparing a sourced answer from the bill source pointer and validation rails.",
    sourcePointerIds: payload.sourcePointer?.id ? [`${payload.sourcePointer.kind}/${payload.sourcePointer.id}`] : [],
    validation: { valid: false, issues: ["composition_in_progress"] }
  };
  renderBillPanel(payload);
  state.latestBillAnswer = await api("/api/bill-verification/final-answer", {
    method: "POST",
    body: JSON.stringify({
      analysis: payload,
      useLiveModel: Boolean(elements.useLiveModel?.checked)
    }),
    timeoutMs: 90000
  });
  renderBillPanel(payload);
  const message = `Help me verify this bill. Use the bill source pointer ${payload.sourcePointer?.id}, ask for missing evidence if needed, and explain what you can verify without portal login.`;
  elements.message.value = message;
  addMessage("system", `Bill analyzed and answer prepared: ${payload.userVisibleSummary}`);
  return payload;
}

async function uploadDocument() {
  if (!usingFacade()) {
    elements.uploadPanel.textContent = "Document upload requires the Wefella FastAPI facade. Start the facade or use the Node route for non-upload MVP testing.";
    addMessage("system", "Document upload requires the Wefella FastAPI facade. Node / LangGraph runtime remains available for chat and worker testing.");
    return { ok: false, status: "facade_required" };
  }
  const file = elements.documentFile.files?.[0];
  if (!file) {
    elements.uploadPanel.textContent = "Choose a document file before running extraction.";
    addMessage("system", "Choose a document file before running extraction.");
    return { ok: false, status: "document_file_required" };
  }
  await ensureSession();
  if (!usingFacade() || !state.facadeAccessToken) {
    elements.uploadPanel.textContent = "Document upload requires the Wefella FastAPI facade. Start the facade, then try the upload again.";
    addMessage("system", "Document upload requires the Wefella FastAPI facade. Node / LangGraph runtime remains available for chat and worker testing.");
    return { ok: false, status: "facade_required" };
  }
  const contentBase64 = await readFileAsDataUrl(file);
  const payload = await facadeApi("/api/uploads", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || guessContentType(file.name),
      content_base64: contentBase64,
      session_id: state.session.id,
      document_kind: elements.documentKind.value
    }),
    timeoutMs: 120000
  });
  state.latestUpload = payload;
  renderUploadPanel();
  addMessage("system", `Uploaded and extracted ${payload.filename}. Extraction status: ${payload.extraction?.status ?? "not reported"}.`);
  return payload;
}

async function askAboutUploadedDocument() {
  if (!state.latestUpload?.upload_id) {
    elements.uploadPanel.textContent = "Upload and extract a document before asking about it.";
    addMessage("system", "Upload and extract a document before asking about it.");
    return { ok: false, status: "uploaded_document_required" };
  }
  const message = `Please explain the uploaded ${state.latestUpload.filename} and cite the stored extraction source pointer.`;
  elements.message.value = message;
  addMessage("user", message);
  return runChat(message, { executeEvidenceObservation: false });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function guessContentType(filename) {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "md") return "text/markdown";
  if (extension === "csv") return "text/csv";
  return "text/plain";
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
  maybeHighlightWorkerBrowser(event);
}

// When the worker reports a login / 2FA / captcha wall, draw attention to the live
// worker-browser panel so the user can take over and clear it themselves.
function maybeHighlightWorkerBrowser(event) {
  const panel = document.getElementById("workerBrowserPanel");
  if (!panel || panel.hidden) return;
  const blob = JSON.stringify(event ?? {}).toLowerCase();
  const wall = /(login|sign[\s-]?in|2fa|passkey|captcha|password|credential|authenticate)/.test(blob);
  const workerish = /(worker|evidence|browser|portal|openclaw)/.test(blob);
  if (wall && workerish) {
    panel.classList.add("is-attention");
    const hint = document.getElementById("workerBrowserHint");
    if (hint) hint.textContent = "The portal needs a login, 2FA, or captcha. Tap Start live view, then Take over to enter it yourself — the assistant never types your credentials.";
    panel.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }
}

async function loadRuntimeEvents() {
  if (!state.session?.id) return;
  const payload = await routeApi(`/api/runtime/events?sessionId=${encodeURIComponent(state.session.id)}&limit=80`, { method: "GET" });
  state.runtimeEvents = payload.events ?? [];
  renderTimeline();
}

async function startSession() {
  if (usingFacade()) {
    try {
      return await startFacadeSession();
    } catch (error) {
      if (!isFacadeUnavailableError(error)) throw error;
      elements.backendRoute.value = "node";
      state.facadeAccessToken = null;
      state.latestFacadeTask = null;
      setFacadeStatus("FastAPI facade unavailable; using same-origin Node / LangGraph runtime.");
      addMessage("system", `FastAPI facade was unavailable (${error.message}). Continuing with the local Node / LangGraph runtime.`);
      return startNodeSession();
    }
  }
  return startNodeSession();
}

function isFacadeUnavailableError(error) {
  return error?.name === "TypeError" || /Failed to fetch|NetworkError|Load failed|Timed out/i.test(error?.message ?? "");
}

async function startNodeSession() {
  const enrollment = await api("/api/orchestrator/auth-start", {
    method: "POST",
    body: JSON.stringify(memberPayload())
  });
  updateSession(enrollment);
  renderSequence();
  renderAnswer();
  await loadRuntimeEvents();
  await loadSessionHistory();
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
  await loadSessionHistory();
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
    approvedDocumentCandidateId: options.approvedDocumentCandidateId,
    uploadedDocumentIds: state.latestUpload?.upload_id ? [state.latestUpload.upload_id] : []
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
    approved_document_candidate_id: options.approvedDocumentCandidateId,
    uploaded_document_ids: state.latestUpload?.upload_id ? [state.latestUpload.upload_id] : []
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

function parityMemberPayload() {
  return {
    name: elements.name.value.trim(),
    email: elements.email.value.trim(),
    payer: elements.payer.value.trim(),
    portalUrl: elements.portalUrl.value.trim()
  };
}

function summarizeParityResult(result) {
  const stateSnapshot = graphState(result);
  const workflow = stateSnapshot.workflow ?? result.intent?.workflow ?? "not routed";
  const classifier = stateSnapshot.structured_intent ?? {};
  const evidence = evidenceObservation(result);
  const pointers = sourcePointers(result);
  return {
    workflow,
    intent: classifier.intent ?? stateSnapshot.intent ?? "not reported",
    approval: approvalStatus(result),
    proposalStatus: proposalStatus(result),
    evidenceStatus: evidence.status ?? "not requested",
    sourcePointerCount: pointers.length,
    finalResponseAvailable: Boolean(result.finalResponse),
    tracePresent: Boolean(stateSnapshot.graph_trace_id ?? result.session?.langgraph_thread_id),
    traceId: stateSnapshot.graph_trace_id ?? result.session?.langgraph_thread_id ?? "not reported"
  };
}

async function runNodeParity(message) {
  const member = parityMemberPayload();
  const enrollment = await api("/api/orchestrator/auth-start", {
    method: "POST",
    body: JSON.stringify({ member, resumeLatestSession: false }),
    timeoutMs: 90000
  });
  const result = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      member,
      sessionId: enrollment.session?.id,
      resumeLatestSession: false,
      message,
      executeEvidenceObservation: false,
      requireLivePortalProof: false,
      useOfficialOpenClawWorker: false,
      officialOpenClawUseCurrentTab: false,
      officialOpenClawMultiPage: false,
      useLiveModel: false,
      source: "mvp_phase9d_node_parity"
    }),
    timeoutMs: 240000
  });
  return {
    route: "Node direct",
    sessionId: result.session?.id ?? enrollment.session?.id ?? "not reported",
    result,
    summary: summarizeParityResult(result)
  };
}

async function runFacadeParity(message) {
  const previousToken = state.facadeAccessToken;
  const previousTask = state.latestFacadeTask;
  const member = parityMemberPayload();
  try {
    const auth = await facadeApi("/api/auth/local-session", {
      method: "POST",
      body: JSON.stringify({
        member,
        resume_latest_session: false
      }),
      timeoutMs: 90000
    });
    state.facadeAccessToken = auth.access_token;
    const accepted = await facadeApi("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        user_id: auth.user_id,
        session_id: auth.session_id,
        member,
        message,
        execute_evidence_observation: false,
        require_live_portal_proof: false,
        use_official_openclaw_worker: false,
        official_openclaw_use_current_tab: false,
        official_openclaw_multi_page: false,
        use_live_model: false,
        resume_latest_session: false,
        payload_mode: "phi_allowed_identifier_masked_reasoning",
        source: "mvp_phase9d_fastapi_parity"
      }),
      timeoutMs: 30000
    });
    const result = await waitForFacadeTask(accepted.task_id);
    return {
      route: "FastAPI facade",
      sessionId: result.session?.id ?? auth.session_id ?? "not reported",
      taskId: accepted.task_id,
      result,
      summary: summarizeParityResult(result)
    };
  } finally {
    state.facadeAccessToken = previousToken;
    state.latestFacadeTask = previousTask;
  }
}

function compareParityRuns(nodeRun, facadeRun) {
  const fieldSpecs = [
    ["workflow", "Workflow"],
    ["intent", "Intent"],
    ["approval", "Approval"],
    ["proposalStatus", "Proposal"],
    ["evidenceStatus", "Evidence"],
    ["sourcePointerCount", "Source pointers"],
    ["finalResponseAvailable", "Answer present"],
    ["tracePresent", "Trace present"]
  ];
  const fields = fieldSpecs.map(([key, label]) => {
    const nodeValue = nodeRun.summary[key];
    const facadeValue = facadeRun.summary[key];
    return {
      key,
      label,
      nodeValue,
      facadeValue,
      matched: nodeValue === facadeValue
    };
  });
  const matched = fields.every((field) => field.matched);
  return {
    status: matched ? "passed" : "mismatch",
    matched,
    prompt: DEFAULT_BENEFITS_MESSAGE,
    node: nodeRun,
    facade: facadeRun,
    fields
  };
}

function renderParity(result = state.parityResult) {
  if (!elements.parityPanel) return;
  if (!result) {
    elements.parityPanel.textContent = "No parity run yet.";
    return;
  }
  if (result.status === "running") {
    elements.parityPanel.innerHTML = `
      <p class="status-text">Running the same Benefits prompt through Node direct and the FastAPI facade. No worker action is approved in this check.</p>
    `;
    return;
  }
  if (result.status === "error") {
    elements.parityPanel.innerHTML = `<p class="danger-line">${escapeHtml(result.message)}</p>`;
    return;
  }
  if (result.status === "facade_unavailable") {
    elements.parityPanel.innerHTML = `
      <p class="danger-line">FastAPI facade unavailable.</p>
      <p class="status-text">${escapeHtml(result.message)}</p>
      ${result.node?.sessionId ? `<p class="status-text">Node direct completed for session ${escapeHtml(result.node.sessionId)}.</p>` : ""}
    `;
    return;
  }
  const fieldRows = result.fields
    .map((field) => `
      <div class="parity-row ${field.matched ? "match" : "mismatch"}">
        <b>${escapeHtml(field.label)}</b>
        <span>${escapeHtml(compact(field.nodeValue))}</span>
        <span>${escapeHtml(compact(field.facadeValue))}</span>
      </div>
    `)
    .join("");
  elements.parityPanel.innerHTML = `
    <p class="${result.matched ? "success-line" : "danger-line"}">${result.matched ? "Parity passed" : "Parity needs review"} for the proposal-only Benefits route.</p>
    <div class="parity-grid" aria-label="Node and FastAPI parity fields">
      <div class="parity-row header">
        <b>Field</b>
        <span>Node direct</span>
        <span>FastAPI facade</span>
      </div>
      ${fieldRows}
    </div>
    <div class="key-value-list">
      <dl>
        <dt>Node session</dt>
        <dd>${escapeHtml(result.node.sessionId)}</dd>
        <dt>FastAPI session</dt>
        <dd>${escapeHtml(result.facade.sessionId)}</dd>
        <dt>FastAPI task</dt>
        <dd>${escapeHtml(result.facade.taskId ?? "not reported")}</dd>
        <dt>Node trace</dt>
        <dd>${escapeHtml(result.node.summary.traceId)}</dd>
        <dt>FastAPI trace</dt>
        <dd>${escapeHtml(result.facade.summary.traceId)}</dd>
      </dl>
    </div>
  `;
}

async function runParityCheck() {
  state.parityResult = { status: "running" };
  renderParity();
  try {
    const message = DEFAULT_BENEFITS_MESSAGE;
    const nodeRun = await runNodeParity(message);
    const facadeRun = await runFacadeParity(message);
    state.parityResult = compareParityRuns(nodeRun, facadeRun);
    renderParity();
    addMessage(
      "system",
      `Phase 9D parity ${state.parityResult.matched ? "passed" : "needs review"} for Node direct versus FastAPI facade. No evidence observation or worker action was approved.`
    );
    return state.parityResult;
  } catch (error) {
    if (isFacadeUnavailableError(error)) {
      state.parityResult = {
        status: "facade_unavailable",
        message: `FastAPI facade was unavailable (${error.message}). Node direct remains available for the MVP.`,
        node: null,
        facade: null
      };
      setFacadeStatus("FastAPI facade unavailable; use Node / LangGraph runtime for local MVP testing.");
      renderParity();
      addMessage("system", state.parityResult.message);
      return state.parityResult;
    }
    state.parityResult = { status: "error", message: `Parity check failed: ${error.message}` };
    renderParity();
    throw error;
  }
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

async function checkFacade() {
  try {
    const payload = await facadeApi("/api/health", { method: "GET", timeoutMs: 15000 });
    const status = payload.node_runtime_ok ? "reachable and connected to Node" : "reachable but Node runtime is unavailable";
    setFacadeStatus(`FastAPI ${payload.version} · ${status}`);
    addMessage("system", `Wefella facade health: ${status}.`);
    return payload;
  } catch (error) {
    if (!isFacadeUnavailableError(error)) throw error;
    const payload = { ok: false, status: "facade_unavailable", error: error.message };
    setFacadeStatus("FastAPI facade unavailable; use Node / LangGraph runtime for local MVP testing.");
    addMessage("system", `Wefella FastAPI facade unavailable (${error.message}). Node / LangGraph runtime remains available.`);
    return payload;
  }
}

function activateFacadeRoute() {
  elements.backendRoute.value = "wefella";
  state.facadeAccessToken = null;
  state.latestFacadeTask = null;
  state.remoteBrowserSession = null;
  if (state.session?.id) mountWorkerBrowser();
  setFacadeStatus("FastAPI facade selected. Start Session will mint a local MVP bearer token.");
  renderAnswer(state.latestRun);
}

function handleBackendRouteChange() {
  state.facadeAccessToken = null;
  state.latestFacadeTask = null;
  state.remoteBrowserSession = null;
  if (usingFacade()) {
    setFacadeStatus("FastAPI facade selected. Check Facade, then Start Session.");
  } else {
    setFacadeStatus("Direct Node route active for operator parity.");
  }
  if (state.session?.id) mountWorkerBrowser();
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
  state.parityResult = null;
  state.latestUpload = null;
  state.latestBillVerification = null;
  state.latestBillAnswer = null;
  state.sessionHistory = null;
  state.latestFeedback = null;
  state.latestExport = null;
  state.runtimeEvents = [];
  state.documentCandidates = [];
  state.eventSource = null;
  elements.sessionId.value = "";
  elements.authStatus.textContent = "Not signed in";
  elements.workerStatus.textContent = "Worker not checked";
  setFacadeStatus(usingFacade() ? "FastAPI facade route active by default. Check Facade, then Start Session." : "Direct Node route active for operator parity.");
  elements.messages.innerHTML = "";
  elements.approvalPanel.textContent = "No pending worker proposal yet.";
  elements.discoveryPanel.textContent = "No discovery report yet.";
  if (elements.feedbackComment) elements.feedbackComment.value = "";
  renderSessionHistory();
  renderUploadPanel();
  renderBillPanel();
  renderPhase9FProof();
  renderParity();
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
$("#runParity").addEventListener("click", () => runAction("Running Node versus FastAPI parity check...", runParityCheck));
$("#uploadDocument").addEventListener("click", () => runAction("Uploading document and running local extraction...", uploadDocument));
$("#askUploadedDocument").addEventListener("click", () => runAction("Routing uploaded document question through LangGraph...", askAboutUploadedDocument));
$("#analyzeBill").addEventListener("click", () => runAction("Analyzing bill and preparing verification plan...", analyzeBill));
$("#loadHistory").addEventListener("click", () => runAction("Loading protected session history...", loadSessionHistory));
$("#loadHandoffs").addEventListener("click", () => runAction("Loading human handoff queue...", loadHandoffs));
$("#exportSession").addEventListener("click", () => runAction("Exporting the latest sourced answer...", exportSessionAnswer));
$("#submitUsefulFeedback").addEventListener("click", () => runAction("Recording feedback for this answer...", () => submitFeedback("useful")));
$("#submitNeedsFollowupFeedback").addEventListener("click", () => runAction("Recording follow-up feedback for this answer...", () => submitFeedback("needs_follow_up")));
elements.backendRoute.addEventListener("change", handleBackendRouteChange);
$("#resetApp").addEventListener("click", resetView);
elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setUiMode(button.dataset.uiMode));
});

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

setUiMode(state.uiMode, { skipRender: true });
renderSequence();
renderParity();
renderPhase9FProof();
renderUploadPanel();
renderSessionHistory();
renderAnswer();
