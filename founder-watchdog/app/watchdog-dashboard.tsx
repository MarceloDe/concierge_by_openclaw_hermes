/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState } from "react";

type SourceRef = {
  path: string;
  line: number;
  symbol?: string | null;
  absolute: string;
  vscodeUrl: string;
  githubUrl: string;
};

type Manifest = Record<string, any>;

const views = [
  ["overview", "Command"],
  ["architecture", "Architecture"],
  ["runtime", "Runtime"],
  ["modules", "Modules"],
  ["prompts", "Prompts"],
  ["data", "Data & APIs"],
  ["config", "Configuration"],
  ["roadmap", "Roadmap"],
  ["proof", "Proof"]
] as const;

const statusCopy: Record<string, string> = {
  implemented_proven: "Implemented + proven",
  implemented_unproven: "Implemented · not live-proven",
  implemented_dev: "Implemented · non-production",
  contract_ready: "Contract ready",
  blocked_external: "Blocked externally",
  planned: "Planned",
  landed: "Landed",
  in_progress: "In progress",
  blocked_external_enrollment: "Enrollment blocked"
};

function human(value: string) {
  return String(value ?? "unknown").replaceAll("_", " ");
}

function utcDate(value: string) {
  return String(value).slice(0, 10);
}

function utcTimestamp(value: string) {
  return `${String(value).slice(0, 10)} ${String(value).slice(11, 16)} UTC`;
}

function statusTone(status: string) {
  if (["implemented_proven", "landed", "running", "loaded", "configured", "code_ready", "durable_dependency_running"].includes(status)) return "green";
  if (["implemented_dev", "implemented_unproven", "contract_ready", "in_progress", "test_only", "ingestion_on_demand", "deterministic_default", "host_service_running", "credential_present_in_source_workspace"].includes(status)) return "amber";
  if (["blocked_external", "blocked_external_enrollment", "stopped", "not_loaded", "dependency_stopped", "durable_dependency_stopped", "credential_missing", "not_selectable"].includes(status)) return "red";
  return "slate";
}

function StatusPill({ status, compact = false }: { status: string; compact?: boolean }) {
  return (
    <span className={`status-pill ${statusTone(status)} ${compact ? "compact" : ""}`}>
      <span className="status-dot" />
      {statusCopy[status] ?? human(status)}
    </span>
  );
}

function RuntimeSignal({ runtime }: { runtime: string }) {
  const tone = statusTone(runtime);
  return (
    <span className={`runtime-signal ${tone}`} title={`Current snapshot: ${human(runtime)}`}>
      <span className="status-dot" />
      {human(runtime)}
    </span>
  );
}

function SourceLinks({ source, minimal = false }: { source: SourceRef; minimal?: boolean }) {
  if (!source) return null;
  return (
    <span className={`source-links ${minimal ? "minimal" : ""}`}>
      <a href={source.vscodeUrl} title={`Open ${source.absolute}:${source.line} in VS Code`}>
        {minimal ? "Code" : "Open in VS Code"}
      </a>
      <a href={source.githubUrl} target="_blank" rel="noreferrer" title="Open the same line on GitHub">
        {minimal ? "GitHub" : `${source.path}:${source.line}`}
      </a>
    </span>
  );
}

function SectionHead({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy?: string; action?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {copy ? <p className="section-copy">{copy}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function Metric({ label, value, detail, accent = "plain" }: { label: string; value: React.ReactNode; detail: string; accent?: string }) {
  return (
    <article className={`metric-card ${accent}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function ProbeCard({ name, probe, note }: { name: string; probe: any; note: string }) {
  const running = Boolean(probe?.reachable);
  return (
    <article className={`probe-card ${running ? "is-up" : "is-down"}`}>
      <div className="probe-top">
        <span className="live-lamp" />
        <span>{running ? "REACHABLE" : "NOT REACHABLE"}</span>
      </div>
      <h3>{name}</h3>
      <p>{note}</p>
      <code>{probe?.url ?? `${probe?.host}:${probe?.port}`}</code>
    </article>
  );
}

function Overview({ m, go }: { m: Manifest; go: (view: string) => void }) {
  const phase = m.phases.find((item: any) => item.phase === m.summary.currentPhase);
  const blockers = phase?.blockers ?? [];
  const runningCount = m.modules.filter((module: any) => ["running", "loaded", "configured", "code_ready", "durable_dependency_running"].includes(module.runtime)).length;
  return (
    <div className="view-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="watchdog-mark">W</span> Founder Watchdog / deployment snapshot</div>
          <h1>The system truth, <em>without the theater.</em></h1>
          <p>A generated, source-linked view of what is implemented, what is running, what is merely contract-ready, and what remains blocked by real-world gates.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => go("architecture")}>Explore architecture <span>→</span></button>
            <button className="secondary-button" onClick={() => go("proof")}>Inspect proof</button>
          </div>
        </div>
        <div className="hero-telemetry">
          <div className="telemetry-ring"><span>{runningCount}</span><small>live signals</small></div>
          <div className="telemetry-list">
            <div><span>Snapshot</span><strong>{m.snapshot.shortCommit}</strong></div>
            <div><span>Current phase</span><strong>{m.summary.currentPhase}</strong></div>
            <div><span>Control bridge</span><strong className="warn">read-only</strong></div>
            <div><span>Generated</span><strong>{utcDate(m.generatedAt)}</strong></div>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <Metric label="Roadmap truth" value={`${m.summary.landedPhases} / ${m.phases.length}`} detail="canonical phases landed" accent="green" />
        <Metric label="Curated runtime" value={m.summary.moduleCount} detail={`${m.summary.sourceModuleCount} first-party source modules scanned`} />
        <Metric label="Data authority" value={m.summary.tableCount} detail="live-derived Postgres schema tables" accent="cyan" />
        <Metric label="Active gates" value={m.summary.blockedPhases + m.summary.inProgressPhases} detail="in progress or externally blocked" accent="amber" />
      </section>

      <section className="two-column command-grid">
        <article className="panel phase-focus">
          <div className="panel-topline"><span>NOW BUILDING</span><StatusPill status={phase.status} compact /></div>
          <div className="phase-number">{phase.phase}</div>
          <h3>{phase.title}</h3>
          <p>The code rails exist, but external credentials and enrollment determine which connectors become executable.</p>
          <ul className="blocker-list">
            {blockers.map((blocker: string) => <li key={blocker}><span>!</span>{blocker}</li>)}
          </ul>
          <button className="text-button" onClick={() => go("roadmap")}>Open the machine-readable ledger →</button>
        </article>
        <article className="panel architecture-mini">
          <div className="panel-topline"><span>SYSTEM SPINE</span><span className="tiny-tag">3 DATA LAYERS</span></div>
          <div className="layer-mini-grid">
            <div><b>L1</b><span>Public</span><small>RAG · CMS · MRF</small></div>
            <div><b>L2</b><span>Member API</span><small>OAuth · FHIR</small></div>
            <div><b>L3</b><span>Portal</span><small>OpenClaw · HITL</small></div>
          </div>
          <div className="mini-flow"><span>POLICY</span><i>→</i><span>LLM PLAN</span><i>→</i><span>CATALOG</span><i>→</i><span>WORKER</span></div>
          <div className="authority-bar"><span>Postgres authority</span><span>Redis mirror</span><span>Graphiti advisory</span><span>Langfuse traces</span></div>
          <button className="text-button" onClick={() => go("architecture")}>Inspect the complete flow →</button>
        </article>
      </section>

      <section className="panel">
        <SectionHead eyebrow="Live capture" title="Running now is not the same as implemented" copy="A red runtime light does not erase a green implementation proof. It says the dependency was not reachable when this deploy snapshot was generated." action={<button className="secondary-button small" onClick={() => go("runtime")}>Full runtime view</button>} />
        <div className="probe-grid compact-grid">
          <ProbeCard name="OpenClaw" probe={m.liveProbes.openclaw} note="Worker gateway" />
          <ProbeCard name="Application" probe={m.liveProbes.app} note="Node API" />
          <ProbeCard name="Postgres" probe={m.liveProbes.postgres} note="Authority" />
          <ProbeCard name="Redis" probe={m.liveProbes.redis} note="Runtime mirror" />
          <ProbeCard name="FalkorDB" probe={m.liveProbes.falkordb} note="Product memory" />
          <ProbeCard name="Langfuse" probe={m.liveProbes.langfuse} note="Trace UI" />
        </div>
      </section>
    </div>
  );
}

function Architecture({ m }: { m: Manifest }) {
  const [sequence, setSequence] = useState(m.sequences[0].id);
  const selected = m.sequences.find((item: any) => item.id === sequence) ?? m.sequences[0];
  return (
    <div className="view-stack">
      <SectionHead eyebrow="Architecture" title="Three data layers. One dispatch truth." copy="Planned capabilities may be visible to the founder and planner, but only backed executable-catalog entries can cross the dispatch boundary." action={<SourceLinks source={m.configuration.source} />} />
      <section className="system-canvas panel">
        <div className="canvas-header"><span>REQUEST / CHANNEL</span><span>DETERMINISTIC SAFETY RAILS</span><span>OUTPUT / EVIDENCE</span></div>
        <div className="architecture-layout">
          <div className="layer-stack">
            <article className="data-layer public"><div className="layer-index">01</div><div><h3>Public evidence</h3><p>CMS · payer docs · MRF · provider directory · RAG</p></div><StatusPill status="implemented_proven" compact /></article>
            <article className="data-layer api"><div className="layer-index">02</div><div><h3>Member-authorized API</h3><p>Consent · SMART-on-FHIR · OAuth vault pointers</p></div><StatusPill status="contract_ready" compact /></article>
            <article className="data-layer portal"><div className="layer-index">03</div><div><h3>Portal control</h3><p>Human login · scoped approval · OpenClaw worker</p></div><StatusPill status="implemented_proven" compact /></article>
          </div>
          <div className="arch-arrow-column"><span>→</span><span>→</span><span>→</span></div>
          <div className="orchestrator-core">
            <div className="core-ring outer"><span>LANGGRAPH</span>
              <div className="core-ring middle"><span>POLICY</span>
                <div className="core-ring inner"><strong>LLM</strong><small>Decision v2</small></div>
              </div>
            </div>
            <div className="core-note">One normalizer · risk floor · fail loud</div>
          </div>
          <div className="arch-arrow-column"><span>→</span><span>→</span><span>→</span></div>
          <div className="catalog-stack">
            <article><span>REGISTRY</span><h3>Capability visibility</h3><p>Implemented + planned roadmap surface</p></article>
            <article className="selected"><span>EXECUTABLE CATALOG</span><h3>Runtime dispatch</h3><p>runtime_selectable=1 + backing gates</p></article>
            <article><span>EXPOSURE CONTRACT</span><h3>Prepare / explain</h3><p>What the planner may say when blocked</p></article>
          </div>
        </div>
        <div className="storage-rail">
          <div><b>POSTGRES</b><span>authority</span></div><i>↔</i><div><b>REDIS</b><span>fast mirror</span></div><i>↔</i><div><b>LANGGRAPH</b><span>checkpoints</span></div><i>↔</i><div><b>GRAPHITI</b><span>advisory memory</span></div><i>↔</i><div><b>LANGFUSE</b><span>trace plane</span></div>
        </div>
      </section>

      <section className="panel">
        <SectionHead eyebrow="Orchestrator graph" title="The exact runtime node order" copy="Every node opens the source definition used by the running graph." action={<SourceLinks source={m.modules.find((x: any) => x.id === "langgraph").source} />} />
        <div className="graph-flow">
          {m.graphFlow.map((node: any, index: number) => (
            <div className="flow-pair" key={node.id}>
              <a className="flow-node" href={node.source.vscodeUrl}>
                <small>{String(node.order).padStart(2, "0")}</small>
                <b>{node.id}</b>
                <span>{node.label}</span>
              </a>
              {index < m.graphFlow.length - 1 ? <i>→</i> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <SectionHead eyebrow="Sequence diagrams" title="How each trust path behaves" copy="The write path deliberately ends in preparation and a blocker until signature and delegation gates are real." />
        <div className="sequence-tabs">
          {m.sequences.map((item: any) => <button className={sequence === item.id ? "active" : ""} onClick={() => setSequence(item.id)} key={item.id}>{item.name}</button>)}
        </div>
        <div className="sequence-board">
          <div className="sequence-title"><div><h3>{selected.name}</h3><StatusPill status={selected.status} compact /></div><span>{selected.steps.length} interactions</span></div>
          <div className="sequence-line">
            {selected.steps.map((step: string, index: number) => (
              <div className="sequence-step" key={step}><span>{index + 1}</span><p>{step}</p>{index < selected.steps.length - 1 ? <i>›</i> : null}</div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Runtime({ m }: { m: Manifest }) {
  const liveEntries = Object.entries(m.liveProbes);
  return (
    <div className="view-stack">
      <SectionHead eyebrow="Runtime" title="Two-axis truth: proof and process" copy="Implementation status is derived from source and phase evidence. Runtime state is a bounded local reachability probe captured during generation." action={<a className="primary-button link-button" href={m.links.langfuse} target="_blank" rel="noreferrer">Open Langfuse ↗</a>} />
      <section className="probe-grid">
        {liveEntries.map(([name, probe]: [string, any]) => <ProbeCard key={name} name={name} probe={probe} note={name === "openclaw" ? "Bounded worker gateway" : name === "app" ? "Concierge Node API" : "Infrastructure dependency"} />)}
      </section>
      <section className="panel">
        <SectionHead eyebrow="Models" title="Models selected by source policy" copy="A configured credential is not the same as a successful current invocation. Exact real calls and prompt versions belong in Langfuse." />
        <div className="model-grid">
          {m.modelRuntimes.map((model: any) => (
            <article className="model-card" key={model.name}>
              <div className="model-icon">AI</div>
              <div className="model-main"><div><h3>{model.name}</h3><span>{model.step}</span></div><p><b>{model.defaultModel}</b> · {model.implementation}</p><small>{model.liveProof}</small></div>
              <div className="model-status"><StatusPill status={model.defaultModel === "none" ? "blocked_external" : "implemented_proven"} compact /><RuntimeSignal runtime={model.credentialConfigured ? "configured" : "credential_missing"} /><SourceLinks source={model.source} minimal /></div>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <SectionHead eyebrow="Loaded modules" title="Implementation proof beside live dependency state" />
        <div className="runtime-table table-shell">
          <div className="table-row table-header"><span>Module</span><span>Domain</span><span>Implementation</span><span>Current snapshot</span><span>Source</span></div>
          {m.modules.map((module: any) => (
            <div className="table-row" key={module.id}><span><b>{module.name}</b><small>{module.description}</small></span><span>{module.domain}</span><span><StatusPill status={module.status} compact /></span><span><RuntimeSignal runtime={module.runtime} /></span><span><SourceLinks source={module.source} minimal /></span></div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Modules({ m }: { m: Manifest }) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("All");
  const domains = ["All", ...new Set(m.modules.map((module: any) => module.domain))];
  const filtered = m.modules.filter((module: any) => (domain === "All" || module.domain === domain) && `${module.name} ${module.description} ${module.status}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="view-stack">
      <SectionHead eyebrow="Module catalog" title="Every curated runtime boundary" copy="The repository contains hundreds of source modules. This view groups the load-bearing founder-level boundaries and links each back to code." />
      <section className="filter-bar"><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules, states, responsibilities…" /></label><div className="filter-chips">{domains.map((item: any) => <button key={item} className={domain === item ? "active" : ""} onClick={() => setDomain(item)}>{item}</button>)}</div></section>
      <section className="module-grid">
        {filtered.map((module: any) => (
          <article className="module-card" key={module.id}>
            <div className="module-card-head"><span className="module-domain">{module.domain}</span><RuntimeSignal runtime={module.runtime} /></div>
            <h3>{module.name}</h3><p>{module.description}</p>
            <div className="module-meta"><StatusPill status={module.status} compact /><span>Phase {module.phase}</span></div>
            <SourceLinks source={module.source} />
          </article>
        ))}
      </section>
    </div>
  );
}

function Prompts({ m }: { m: Manifest }) {
  const [promptId, setPromptId] = useState(m.prompts[0].id);
  const [showPayload, setShowPayload] = useState(false);
  const selected = m.prompts.find((prompt: any) => prompt.id === promptId) ?? m.prompts[0];
  return (
    <div className="view-stack">
      <SectionHead eyebrow="Prompt observatory" title="Founder-visible prompt truth" copy="Static templates and their source are visible here. Live user payloads, identifiers, secrets, and chain traces remain outside this site; exact runtime calls belong in Langfuse." action={<a className="primary-button link-button" href={m.links.langfuse} target="_blank" rel="noreferrer">Open exact runtime traces ↗</a>} />
      <section className="prompt-layout">
        <aside className="prompt-list panel">
          <p className="eyebrow">Prompt surfaces</p>
          {m.prompts.map((prompt: any) => (
            <button key={prompt.id} className={prompt.id === promptId ? "active" : ""} onClick={() => { setPromptId(prompt.id); setShowPayload(false); }}>
              <span>{prompt.name}</span><small>{prompt.callSite}</small><StatusPill status={prompt.status} compact />
            </button>
          ))}
          <div className="prompt-policy"><b>Runtime capture policy</b><p>Full prompts are on by default in development and off in production unless explicitly enabled. Redaction and PHI policy still apply.</p></div>
        </aside>
        <article className="prompt-viewer panel">
          <div className="prompt-viewer-head"><div><p className="eyebrow">{selected.callSite}</p><h2>{selected.name}</h2><p>{selected.description}</p></div><div><span className="model-label">{selected.modelTier} / {selected.defaultModel}</span><SourceLinks source={selected.source} /></div></div>
          {selected.payloadPreview ? <div className="prompt-switch"><button className={!showPayload ? "active" : ""} onClick={() => setShowPayload(false)}>System template</button><button className={showPayload ? "active" : ""} onClick={() => setShowPayload(true)}>Safe payload preview</button></div> : null}
          <div className="code-window"><div className="code-window-bar"><span /><span /><span /><b>{showPayload ? "sanitized-runtime-payload.json" : selected.source.path}</b></div><pre>{showPayload ? selected.payloadPreview : selected.text}</pre></div>
        </article>
      </section>
    </div>
  );
}

function DataApis({ m }: { m: Manifest }) {
  const [tableGroup, setTableGroup] = useState(m.data.postgres.groups[0].name);
  const [tableQuery, setTableQuery] = useState("");
  const [redisOpen, setRedisOpen] = useState(m.data.redis.namespaces[0].name);
  const group = m.data.postgres.groups.find((item: any) => item.name === tableGroup) ?? m.data.postgres.groups[0];
  const tables = group.tables.filter((table: any) => table.name.includes(tableQuery.toLowerCase()));
  return (
    <div className="view-stack">
      <SectionHead eyebrow="Data & APIs" title="Authority, mirrors, drivers, and connector rails" copy="The database view is generated from the checked-in schema snapshot produced by a real Postgres information_schema query." />
      <section className="driver-grid">{m.data.drivers.map((driver: any) => <article key={driver.name}><div className="driver-mark">DB</div><h3>{driver.name}</h3><p>{driver.role}</p><code>{driver.package}</code><div><StatusPill status={driver.status} compact /><SourceLinks source={driver.source} minimal /></div></article>)}</section>
      <section className="panel">
        <SectionHead eyebrow="Postgres authority" title={`${m.data.postgres.tableCount} schema tables`} copy={`${m.data.postgres.engine}. Snapshot source: ${m.data.postgres.generatedFrom}.`} action={<SourceLinks source={m.data.postgres.authoritySource} />} />
        <div className="schema-layout">
          <aside className="schema-groups">{m.data.postgres.groups.map((item: any) => <button className={tableGroup === item.name ? "active" : ""} onClick={() => setTableGroup(item.name)} key={item.name}><span>{item.name}</span><b>{item.tables.length}</b></button>)}</aside>
          <div className="schema-browser"><label className="schema-search">⌕ <input value={tableQuery} onChange={(event) => setTableQuery(event.target.value)} placeholder={`Filter ${group.name.toLowerCase()} tables`} /></label><div className="schema-table-grid">{tables.map((table: any) => <details key={table.name}><summary><div><b>{table.name}</b><span>{table.columnCount} columns · PK {table.primaryKey.join(", ") || "—"}</span></div><i>＋</i></summary><div className="column-list">{table.columns.map((column: any) => <div key={column.name}><code>{column.name}</code><span>{column.type}</span><small>{column.nullable ? "nullable" : "required"}</small></div>)}</div></details>)}</div></div>
        </div>
      </section>
      <section className="panel">
        <SectionHead eyebrow="Redis mirror" title={`${m.data.redis.namespaces.length} runtime namespaces`} copy="Redis is losable and never authoritative. A cache miss rebuilds from Postgres; production fails loud when Redis is required." action={<SourceLinks source={m.data.redis.source} />} />
        <div className="redis-grid">{m.data.redis.namespaces.map((item: any) => <button className={redisOpen === item.name ? "active" : ""} onClick={() => setRedisOpen(redisOpen === item.name ? "" : item.name)} key={item.name}><div><span className="redis-icon">R</span><h3>{item.name}</h3><code>{item.keyPattern}</code><p>{item.purpose}</p></div><div className="redis-meta"><span>TTL {item.ttlSeconds}s</span><b>{redisOpen === item.name ? "−" : "+"}</b></div>{redisOpen === item.name ? <pre>{JSON.stringify(item.jsonShape, null, 2)}</pre> : null}</button>)}</div>
      </section>
      <section className="panel">
        <SectionHead eyebrow="API surface" title="Internal routes and external rails" />
        <div className="api-table table-shell"><div className="table-row table-header"><span>Group</span><span>Method</span><span>Route / rail</span><span>Purpose</span><span>Truth</span><span>Source</span></div>{m.APIs.map((api: any) => <div className="table-row" key={`${api.group}-${api.path}`}><span>{api.group}</span><span><code>{api.method}</code></span><span><b>{api.path}</b></span><span>{api.purpose}</span><span><StatusPill status={api.status} compact /></span><span><SourceLinks source={api.source} minimal /></span></div>)}</div>
      </section>
    </div>
  );
}

function Configuration({ m }: { m: Manifest }) {
  const [section, setSection] = useState("all");
  const lines = m.configuration.rawYaml.split("\n");
  const start = section === "all" ? 0 : lines.findIndex((line: string) => line.startsWith(`${section}:`));
  const next = section === "all" ? -1 : lines.findIndex((line: string, index: number) => index > start && /^[a-zA-Z_][a-zA-Z0-9_]*:/.test(line));
  const visibleYaml = section === "all" ? m.configuration.rawYaml : lines.slice(start, next === -1 ? lines.length : next).join("\n");
  return (
    <div className="view-stack">
      <SectionHead eyebrow="Configuration" title="The visual YAML spine" copy="This is the full founder-owned, versioned configuration—rendered read-only. Production toggles must flow through code, database policy derivation, tests, and approval gates." action={<SourceLinks source={m.configuration.source} />} />
      <section className="control-warning"><div className="lock-mark">⌁</div><div><b>Authenticated local control bridge: not connected</b><p>Hosted Sites cannot safely mutate local OpenClaw, databases, credentials, or runtime_selectable rows. Visual filters work here; operational controls remain intentionally locked until a signed local bridge is designed and approved.</p></div><span>READ ONLY</span></section>
      <section className="config-grid">
        <article className="panel env-panel"><p className="eyebrow">Configuration presence</p><h3>Required runtime variables</h3><p>Presence only. Values never leave the local generator.</p><div className="env-list">{m.configuration.configuredEnvNames.map((item: any) => <div key={item.name}><code>{item.name}</code><span className={item.configured ? "configured" : "missing"}>{item.configured ? "configured" : "not configured"}</span></div>)}</div><small>{m.configuration.secretsPolicy}</small></article>
        <article className="panel registry-panel"><p className="eyebrow">Non-negotiable registry split</p><h3>Visibility ≠ executability</h3><div className="registry-rule"><span>1</span><div><b>Capability Registry</b><p>Roadmap and planner visibility. May include unimplemented rows.</p></div></div><div className="registry-rule active"><span>2</span><div><b>Executable Tool Catalog</b><p>The only LangGraph dispatch authority. Requires real backing.</p></div></div><div className="registry-rule"><span>3</span><div><b>Planner Exposure Contract</b><p>Defines explain, prepare, ask, or escalate behavior.</p></div></div></article>
      </section>
      <section className="panel yaml-panel">
        <div className="yaml-head"><div><p className="eyebrow">{m.configuration.file}</p><h3>Founder spine configuration</h3></div><div className="yaml-tabs"><button className={section === "all" ? "active" : ""} onClick={() => setSection("all")}>All</button>{m.configuration.topLevelSections.map((item: string) => <button className={section === item ? "active" : ""} onClick={() => setSection(item)} key={item}>{human(item)}</button>)}</div></div>
        <div className="code-window yaml-window"><div className="code-window-bar"><span /><span /><span /><b>{section === "all" ? "complete spine" : section}</b></div><pre>{visibleYaml}</pre></div>
      </section>
    </div>
  );
}

function Roadmap({ m }: { m: Manifest }) {
  const [expanded, setExpanded] = useState<number>(m.summary.currentPhase);
  return (
    <div className="view-stack">
      <SectionHead eyebrow="Roadmap" title="Machine-readable phase truth" copy="Phase order is read from docs/db/phase-ledger.json—not inferred from prose. Click any phase for dependencies, blockers, and source documentation." action={<SourceLinks source={m.sourceEvidence.canonicalDocs.at(-1)} />} />
      <section className="roadmap-board">
        <div className="roadmap-line" />
        {m.phases.map((phase: any) => (
          <article className={`phase-card ${phase.status} ${expanded === phase.phase ? "expanded" : ""}`} key={phase.phase}>
            <button onClick={() => setExpanded(expanded === phase.phase ? -1 : phase.phase)}>
              <span className="phase-node">{phase.phase}</span><div><small>{statusCopy[phase.status] ?? human(phase.status)}</small><h3>{phase.title}</h3><p>Depends on {phase.dependencies.length ? phase.dependencies.join(", ") : "canonical pivot"}</p></div><i>{expanded === phase.phase ? "−" : "+"}</i>
            </button>
            {expanded === phase.phase ? <div className="phase-details"><div><b>Implementation owner</b><span>{phase.owner}</span></div><div><b>Acceptance source</b><span>{phase.acceptance_criteria_file}</span></div><div className="phase-blockers"><b>Blockers / constraints</b>{phase.blockers.length ? <ul>{phase.blockers.map((blocker: string) => <li key={blocker}>{blocker}</li>)}</ul> : <span>No open blockers recorded.</span>}</div><div><b>Docs touched</b><span>{phase.docs_touched?.join(" · ") || "—"}</span></div></div> : null}
          </article>
        ))}
      </section>
    </div>
  );
}

function Proof({ m }: { m: Manifest }) {
  return (
    <div className="view-stack">
      <SectionHead eyebrow="Proof ledger" title="Why every light has its color" copy="The Watchdog is conservative by design: source presence, prior acceptance proof, current process reachability, and external authorization are reported independently." />
      <section className="proof-hero panel"><div><span>SNAPSHOT INTEGRITY</span><h2>{m.snapshot.shortCommit}</h2><p>{m.snapshot.repo} · {m.snapshot.branch}</p></div><div className="proof-facts"><div><b>{m.sourceEvidence.graphify?.nodes ?? "—"}</b><span>Graphify nodes</span></div><div><b>{m.sourceEvidence.graphify?.edges ?? "—"}</b><span>Graphify edges</span></div><div><b>{m.summary.sourceModuleCount}</b><span>source modules</span></div><div><b>{m.summary.tableCount}</b><span>schema tables</span></div></div></section>
      <section className="truth-grid">{m.truthLegend.map((item: any) => <article className={`truth-card ${item.color}`} key={item.id}><StatusPill status={item.id} /><p>{item.meaning}</p></article>)}</section>
      <section className="two-column proof-columns">
        <article className="panel"><p className="eyebrow">Catalog inventory</p><h3>Registry claims need a runtime overlay</h3><div className="proof-facts catalog-facts"><div><b>{m.capabilityInventory.total}</b><span>capabilities</span></div><div><b>{m.capabilityInventory.implementedRuntimeClaim}</b><span>runtime claims</span></div><div><b>{m.capabilityInventory.activeProcesses}</b><span>processes</span></div><div><b>{m.capabilityInventory.processSteps}</b><span>steps</span></div></div><p className="section-copy">{m.capabilityInventory.caveat}</p><SourceLinks source={m.capabilityInventory.source} /></article>
        <article className="panel"><p className="eyebrow">Focused verification</p><h3>{m.sourceEvidence.focusedVerification.passed} passed · {m.sourceEvidence.focusedVerification.failed} failed · {m.sourceEvidence.focusedVerification.skippedLoud} loud skips</h3><ul className="verification-list">{m.sourceEvidence.focusedVerification.claims.map((claim: string) => <li key={claim}>{claim}</li>)}</ul></article>
      </section>
      <section className="panel"><SectionHead eyebrow="Drift watchdog" title="Source-of-truth conflicts detected during review" copy="These are not hidden. Each card points to the stale or conflicting source that future implementation should reconcile." /><div className="drift-grid">{m.sourceEvidence.driftWarnings.map((warning: any) => <article className={warning.severity} key={warning.title}><div><span>{warning.severity}</span><h3>{warning.title}</h3></div><p>{warning.detail}</p><SourceLinks source={warning.source} minimal /></article>)}</div></section>
      <section className="two-column proof-columns">
        <article className="panel"><p className="eyebrow">Canonical inputs</p><h3>Sources refreshed before implementation</h3><div className="proof-doc-list">{m.sourceEvidence.canonicalDocs.map((doc: SourceRef) => <div key={doc.path}><span>{doc.path}</span><SourceLinks source={doc} minimal /></div>)}</div></article>
        <article className="panel"><p className="eyebrow">Deployment contract</p><h3>How the dashboard stays current</h3><ol className="deploy-loop"><li><span>1</span><p><b>Implement</b>Change source, schema, ledger, or spine configuration.</p></li><li><span>2</span><p><b>Generate</b><code>npm run generate:watchdog</code> reads the repo and safe probes.</p></li><li><span>3</span><p><b>Verify</b>Build and browser-check every clickable view.</p></li><li><span>4</span><p><b>Deploy</b>Publish a private, immutable Sites version.</p></li></ol></article>
      </section>
      <section className="panel"><SectionHead eyebrow="Current reachability evidence" title="Local probe results at generation time" /><div className="raw-proof-grid">{Object.entries(m.liveProbes).map(([name, probe]: [string, any]) => <div key={name}><div><b>{name}</b><RuntimeSignal runtime={probe.reachable ? "running" : "stopped"} /></div><pre>{JSON.stringify(probe, null, 2)}</pre></div>)}</div></section>
      <section className="panel caveat-panel"><div className="caveat-mark">!</div><div><h3>What this site deliberately does not do</h3><p>No agent trace duplication, no PHI, no secrets, no credential values, no cookies, no arbitrary runtime toggles, and no claim that a scaffold is real. Langfuse remains the trace plane; Postgres remains authority; a future control bridge requires separate authentication and threat-model approval.</p></div></section>
    </div>
  );
}

export function WatchdogDashboard({ manifest }: { manifest: Manifest }) {
  const [activeView, setActiveView] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const activeLabel = useMemo(() => views.find(([id]) => id === activeView)?.[1] ?? "Command", [activeView]);
  const go = (view: string) => { setActiveView(view); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const contents: Record<string, React.ReactNode> = {
    overview: <Overview m={manifest} go={go} />,
    architecture: <Architecture m={manifest} />,
    runtime: <Runtime m={manifest} />,
    modules: <Modules m={manifest} />,
    prompts: <Prompts m={manifest} />,
    data: <DataApis m={manifest} />,
    config: <Configuration m={manifest} />,
    roadmap: <Roadmap m={manifest} />,
    proof: <Proof m={manifest} />
  };
  return (
    <main className="watchdog-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark">W</span><div><b>FOUNDER</b><strong>WATCHDOG</strong></div></div>
        <p className="nav-label">CONTROL PLANE</p>
        <nav>{views.map(([id, label], index) => <button className={activeView === id ? "active" : ""} onClick={() => go(id)} key={id}><span>{String(index + 1).padStart(2, "0")}</span>{label}<i>›</i></button>)}</nav>
        <div className="sidebar-bottom"><div className="snapshot-chip"><span className={manifest.snapshot.dirty ? "amber" : "green"} /><div><small>DEPLOY SNAPSHOT</small><b>{manifest.snapshot.shortCommit}</b></div></div><a href={manifest.links.repository} target="_blank" rel="noreferrer">Repository ↗</a></div>
      </aside>
      <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">{menuOpen ? "×" : "☰"}</button>
      <section className="workspace">
        <header className="topbar"><div><span>Brainstyworkers /</span><b>{activeLabel}</b></div><div className="topbar-actions"><span className="read-only-badge">READ-ONLY DEPLOY</span><a href={manifest.links.langfuse} target="_blank" rel="noreferrer">Langfuse ↗</a><a href={manifest.links.application} target="_blank" rel="noreferrer">Local app ↗</a></div></header>
        <div className="content-frame">{contents[activeView]}</div>
        <footer><span>Founder Watchdog · {manifest.schemaVersion}</span><span>Generated {utcTimestamp(manifest.generatedAt)} · commit {manifest.snapshot.shortCommit}</span></footer>
      </section>
    </main>
  );
}
