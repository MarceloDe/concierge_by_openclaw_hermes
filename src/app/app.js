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

let latestChatRun = null;
let latestUserMessage = "";

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

function renderChatProof(result) {
  const state = result.graphRun?.state ?? {};
  const proposalTask = state.openclaw_skill_proposal?.task ?? {};
  const workerPlan = state.openclaw_worker_plan ?? {};
  const evidence = state.evidence_observation ?? {};
  const productMemoryRecall = state.product_memory_recall ?? result.graphRun?.productMemory?.recall ?? {};
  const productMemoryRetain = state.product_memory_retain ?? result.graphRun?.productMemory?.retain ?? {};
  const missing = missingInfoLines(state);
  const sourcePointers = state.source_pointers ?? [];
  return `
    <article class="chat-proof-card">
      <h3>Workflow Proof</h3>
      <dl>
        <dt>Workflow</dt>
        <dd>${escapeHtml(state.workflow ?? "unknown")} · ${escapeHtml(state.route_reason ?? "unknown")}</dd>
        <dt>Intent</dt>
        <dd>${escapeHtml(state.structured_intent?.intent ?? state.intent ?? "unknown")} · confidence ${escapeHtml(state.structured_intent?.confidence ?? "n/a")}</dd>
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
        proposalTask.id
          ? `<button type="button" data-approve-readonly="${escapeHtml(proposalTask.id)}">Approve Read-Only Observation</button>`
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

async function productAuthenticate() {
  const result = await api("/api/orchestrator/auth-start", {
    method: "POST",
    body: JSON.stringify(memberPayload())
  });
  document.querySelector("#sessionId").value = result.session?.id ?? "";
  productAuthStatus.textContent = `${result.auth?.status ?? "signed in"} · ${result.session?.id ?? "no session"}`;
  sessionStatus.textContent = `${result.session?.current_step ?? "created"} · v${result.session?.state_version ?? 0}`;
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
  latestUserMessage = message;
  const payload = {
    message,
    ...memberPayload(),
    executeEvidenceObservation: Boolean(options.executeEvidenceObservation),
    requireLivePortalProof: Boolean(options.requireLivePortalProof ?? requireLivePortalProof.checked),
    useOfficialOpenClawWorker: Boolean(options.useOfficialOpenClawWorker ?? useOfficialOpenClawWorker.checked),
    useLiveModel: document.querySelector("#useLiveModel").checked,
    approvalToken: options.approvalToken,
    approvalTaskId: options.approvalTaskId
  };
  const result = await api("/api/chat", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  latestChatRun = result;
  document.querySelector("#sessionId").value = result.session.id;
  productAuthStatus.textContent = `Signed in · ${result.session.id}`;
  sessionStatus.textContent = `${result.session.current_step} · v${result.session.state_version}`;
  addMessage("assistant", result.finalResponse);
  addMessage("assistant", renderChatProof(result), { html: true });
  renderMissingInfoPrompt(result);
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
  return runProductChat(latestUserMessage || value("message"), {
    approvalToken: approval.approvalToken,
    approvalTaskId: taskId,
    executeEvidenceObservation: true,
    requireLivePortalProof: requireLivePortalProof.checked,
    useOfficialOpenClawWorker: useOfficialOpenClawWorker.checked
  });
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
  const timeoutMs = options.timeoutMs ?? 45000;
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
  await loadSessionState();
});

addMessage(
  "assistant",
  "Sign in, choose a workflow, or type a benefits question. I will route it through the real LangGraph harness and show workflow proof here in chat. OpenClaw remains approval-gated."
);
