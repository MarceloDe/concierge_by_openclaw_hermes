import { createId, nowIso } from "./database.mjs";
import { persistStructuredExtraction } from "./structuredExtraction.mjs";

export async function persistEligibilitySnapshot(store, { user, session, portal, browserResult }) {
  const sourceUrl = browserResult?.page?.url ?? portal.portal_url;
  const extraction = browserResult?.extraction;
  const summary =
    extraction?.summary ??
    "Eligibility and benefits extraction is pending until Chrome remote debugging is available and the user is logged in.";
  const snapshot = {
    id: createId("elig"),
    user_id: user.id,
    session_id: session.id,
    portal_account_id: portal.id,
    source_url: sourceUrl,
    summary,
    raw_text: extraction?.fullText ?? extraction?.textPreview ?? "",
    created_at: nowIso()
  };
  await store.insert("eligibility_snapshots", snapshot);

  const items = [];
  for (const signal of extraction?.signals ?? []) {
    const item = {
      id: createId("benefit"),
      snapshot_id: snapshot.id,
      category: signal,
      detail: `Visible portal page included ${signal} language. Review the trace before treating this as verified coverage.`,
      source: sourceUrl,
      created_at: nowIso()
    };
    await store.insert("benefit_items", item);
    items.push(item);
  }

  if (items.length === 0) {
    const item = {
      id: createId("benefit"),
      snapshot_id: snapshot.id,
      category: "pending_manual_review",
      detail: "No explicit eligibility or benefit item was extracted from the visible page text.",
      source: sourceUrl,
      created_at: nowIso()
    };
    await store.insert("benefit_items", item);
    items.push(item);
  }

  const structured = await persistStructuredExtraction(store, { snapshot, source: sourceUrl });

  return { snapshot, items, structured };
}
