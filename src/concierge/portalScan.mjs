import { audit } from "./audit.mjs";
import { createId, nowIso } from "./database.mjs";
import { persistEligibilitySnapshot } from "./portalExtraction.mjs";

function pageSummary(pageKind, snapshot) {
  const text = snapshot.text ?? "";
  const signals = [];
  if (/\bbenefits?\b/i.test(text)) signals.push("benefits");
  if (/\bcoverage\b/i.test(text)) signals.push("coverage");
  if (/\bclaims?\b/i.test(text)) signals.push("claims");
  if (/\bprior authorization\b/i.test(text)) signals.push("prior_authorization");
  if (/\bdeductible\b/i.test(text)) signals.push("deductible");
  if (/\bout-of-pocket\b/i.test(text)) signals.push("out_of_pocket");
  return {
    fullText: text,
    textPreview: text.replace(/\s+/g, " ").trim().slice(0, 4000),
    signals,
    summary: `${pageKind} page extracted from ${snapshot.url}; signals: ${signals.length ? signals.join(", ") : "none"}`
  };
}

function shouldCreateEligibilitySnapshot(pageKind) {
  const normalized = String(pageKind ?? "").toLowerCase();
  return (
    normalized === "home" ||
    normalized.startsWith("home_") ||
    normalized.includes("benefits") ||
    normalized.includes("spending") ||
    normalized === "claims" ||
    normalized.startsWith("claims_") ||
    normalized === "prior_authorizations" ||
    normalized.startsWith("prior_authorizations_")
  );
}

export async function persistPortalPageScan(store, { user, session, portal, pages }) {
  const startedAt = nowIso();
  const browserRun = {
    id: createId("browser"),
    session_id: session.id,
    portal_account_id: portal.id,
    status: "multi_page_scan",
    remote_debugger_url: "codex_chrome_extension_claimed_tab",
    start_url: portal.portal_url,
    current_url: pages.at(-1)?.url ?? portal.portal_url,
    page_title: pages.at(-1)?.title ?? "Aetna portal scan",
    created_at: startedAt,
    updated_at: startedAt
  };
  await store.insert("browser_runs", browserRun);
  await audit(store, session.id, "portal_scan_started", {
    browserRunId: browserRun.id,
    pageCount: pages.length,
    pageKinds: pages.map((page) => page.pageKind)
  });

  const pageRows = [];
  const eligibilityResults = [];
  for (const page of pages) {
    const pageRow = {
      id: createId("page"),
      browser_run_id: browserRun.id,
      session_id: session.id,
      portal_account_id: portal.id,
      page_kind: page.pageKind,
      title: page.title,
      url: page.url,
      visible_text: page.text ?? "",
      links_json: JSON.stringify(page.links ?? []),
      extracted_at: page.extractedAt ?? nowIso(),
      created_at: nowIso()
    };
    await store.insert("portal_page_snapshots", pageRow);
    pageRows.push(pageRow);

    await store.insert("browser_actions", {
      id: createId("action"),
      browser_run_id: browserRun.id,
      action_type: "extract_portal_page",
      target_url: page.url,
      description: `Extracted ${page.pageKind} page through already-open Chrome.`,
      status: "completed",
      created_at: nowIso()
    });

    const extraction = pageSummary(page.pageKind, page);
    await store.insert("extraction_artifacts", {
      id: createId("artifact"),
      browser_run_id: browserRun.id,
      artifact_type: `portal_page_${page.pageKind}`,
      content: JSON.stringify({
        title: page.title,
        url: page.url,
        pageKind: page.pageKind,
        text: extraction.textPreview,
        links: page.links ?? []
      }),
      created_at: nowIso()
    });

    if (shouldCreateEligibilitySnapshot(page.pageKind)) {
      eligibilityResults.push(
        await persistEligibilitySnapshot(store, {
          user,
          session,
          portal,
          browserResult: {
            page: {
              title: page.title,
              url: page.url,
              text: page.text ?? "",
              links: page.links ?? []
            },
            extraction
          }
        })
      );
    }
  }

  await audit(store, session.id, "portal_scan_completed", {
    browserRunId: browserRun.id,
    pages: pageRows.map((page) => ({ pageKind: page.page_kind, url: page.url, title: page.title })),
    snapshotsCreated: eligibilityResults.length
  });

  return { browserRun, pageRows, eligibilityResults };
}
