import React from "react";
import type { Ai2UiBlock, Ai2UiOption } from "../api";

// Renders the AI2UI blocks the model returns. Each block can carry option arrays;
// those become tappable buttons whose label is fed back into the chat. This is the
// "buttons rendered dynamically as a function of the model response" mechanism.

export function Ai2UiBlocks({
  blocks,
  onAction
}: {
  blocks: Ai2UiBlock[];
  onAction: (label: string, opt?: Ai2UiOption) => void;
}) {
  if (!blocks?.length) return null;
  return (
    <div className="ai2ui">
      {blocks.map((b, i) => (
        <Block key={b.id ?? `${b.type}-${i}`} block={b} onAction={onAction} />
      ))}
    </div>
  );
}

function optionsFrom(b: Ai2UiBlock): Ai2UiOption[] {
  const p = b.payload ?? {};
  const raw = p.options ?? p.choices ?? p.steps ?? p.actions ?? [];
  return (Array.isArray(raw) ? raw : [])
    .map((o: any) => (typeof o === "string" ? { label: o } : o))
    .filter((o: any) => o && (o.label || o.title))
    .map((o: any) => ({ ...o, label: o.label ?? o.title }));
}

function Block({ block, onAction }: { block: Ai2UiBlock; onAction: (l: string, o?: Ai2UiOption) => void }) {
  const p = block.payload ?? {};
  const opts = optionsFrom(block);

  // answer_markdown is already shown as the main bubble text; skip to avoid duplication.
  if (block.type === "answer_markdown") return null;

  const rows: Array<{ label: string; value: string; signal?: boolean }> = [];
  if (Array.isArray(p.rows)) {
    for (const r of p.rows) {
      const label = r.optionLabel ?? r.name ?? r.label ?? r.term ?? "";
      const value = r.costSignal ?? r.you ?? r.value ?? r.tradeoff ?? r.spec ?? r.detail ?? "";
      if (label) rows.push({ label: String(label), value: String(value ?? ""), signal: Boolean(r.costSignal || r.you) });
    }
  }

  const isNotice = block.type === "safety_notice" || block.renderHints?.severity === "warning";
  const title =
    block.title ??
    ({
      cost_comparison: "Cost comparison",
      pharmacy_formulary: "Pharmacy & formulary",
      procedure_checklist: "Procedure checklist",
      provider_network: "In-network providers",
      degraded_answer_with_options: "Options",
      approval_gate: "Approval needed",
      worker_status: "Worker status",
      source_citations: "Sources",
      next_steps: "Next steps",
      human_handoff: "Talk to a person",
      safety_notice: "Notice"
    } as Record<string, string>)[block.type];

  const hasBody = rows.length > 0 || p.markdown || p.status || isNotice || (block.type === "source_citations");
  if (!hasBody && opts.length === 0) return null;

  return (
    <div className="ai2ui-card">
      {title && <h4>{title}</h4>}

      {isNotice && p.markdown && <div className="ai2ui-notice">{p.markdown}</div>}

      {!isNotice && p.markdown && <div style={{ fontSize: ".9rem", lineHeight: 1.45 }}>{p.markdown}</div>}

      {rows.map((r, i) => (
        <div className="ai2ui-row" key={i}>
          <span className="label">{r.label}</span>
          <span className={"value" + (r.signal ? " signal" : "")}>{r.value}</span>
        </div>
      ))}

      {block.type === "source_citations" && Array.isArray(p.sourcePointers) && (
        <div className="ai2ui-cite">
          {p.sourcePointers.map((s: any, i: number) => (
            <div key={i}>• {s.displayLabel ?? `${s.table ?? "source"}/${s.id}`}</div>
          ))}
        </div>
      )}

      {p.status && !rows.length && <div className="ai2ui-cite">{String(p.status)}</div>}

      {opts.length > 0 && (
        <div className="ai2ui-buttons">
          {opts.map((o, i) => (
            <button
              key={o.id ?? i}
              className={"chip" + (o.requiresApproval ? " approval" : i === 0 ? " primary" : "")}
              onClick={() => onAction(o.label, o)}
              title={o.description}
            >
              {o.requiresApproval ? "✓ " : ""}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
