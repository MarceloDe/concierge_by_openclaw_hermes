import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import {
  cancelResearchRun,
  buildResearchGraph,
  chooseResearchEmbeddingRoute,
  createResearchSchedule,
  evaluateCitationClosure,
  executeResearchRun,
  getResearchEmbeddingStatus,
  getResearchGraph,
  getResearchKpis,
  getResearchRun,
  getResearchWorkerStatus,
  ingestResearchDocumentUpload,
  listCitationClosureEvaluations,
  listResearchArtifacts,
  listResearchRunEvents,
  listResearchRuns,
  listResearchSchedules,
  listResearchSources,
  pauseResearchSchedule,
  proposeResearchSource,
  ResearchOpsError,
  retryResearchRun,
  resumeResearchSchedule,
  reviewResearchArtifact,
  reviewResearchSource,
  reindexResearchEmbeddings,
  runDueResearchSchedules,
  searchResearchEvidence,
  startManualResearchRun,
  updateResearchSource
} from "../concierge/researchOps.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-research-ops-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

async function withHttpFixture(handler, callback) {
  const headers = {};
  let body = "";
  const response = {
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = String(value);
    },
    end(chunk = "") {
      body += String(chunk);
    }
  };
  handler({ method: "GET", url: "/fixture" }, response);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(body, {
      status: 200,
      headers: {
        "content-type": headers["content-type"] ?? "text/html; charset=utf-8",
        "content-length": String(Buffer.byteLength(body, "utf8"))
      }
    });
  try {
    return await callback("https://fixture.brainstyworkers.local");
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test("operator research sources can be proposed, approved, run, cancelled, and retried with audit proof", async () => {
  const store = await createStore();
  const actorUserId = "operator_research_test";
  const proposed = await proposeResearchSource(store, {
    actorUserId,
    url: "https://example.invalid/research/source-alpha",
    title: "Example Research Source Alpha",
    workflowKeys: ["general_rag", "eligibility_benefits_navigation"],
    reason: "Test source proposal."
  });

  assert.equal(proposed.ok, true);
  assert.equal(proposed.source.status, "pending_review");
  assert.equal(proposed.source.proposedBy, actorUserId);
  assert.equal(proposed.audit.eventType, "research_source_proposed");

  await assert.rejects(
    () => startManualResearchRun(store, { actorUserId, sourceId: proposed.source.id, topic: "Should not start yet" }),
    (error) => error instanceof ResearchOpsError && error.statusCode === 409
  );

  const approved = await reviewResearchSource(store, {
    sourceId: proposed.source.id,
    actorUserId,
    decision: "approved",
    reason: "Approved for manual read-only research queue."
  });
  assert.equal(approved.source.status, "approved");
  assert.equal(approved.source.approvedBy, actorUserId);

  const updated = await updateResearchSource(store, {
    sourceId: proposed.source.id,
    actorUserId,
    patch: { priority: 42, metadata: { operatorNote: "ranked for this MVP" } }
  });
  assert.equal(updated.source.priority, 42);
  assert.equal(updated.source.metadata.operatorNote, "ranked for this MVP");

  const run = await startManualResearchRun(store, {
    actorUserId,
    sourceId: proposed.source.id,
    topic: "Eligibility benefits source review",
    workflowKey: "general_rag",
    query: { search: "benefits evidence" }
  });
  assert.equal(run.run.status, "queued");
  assert.equal(run.event.eventType, "research_run_queued");
  assert.equal(run.run.actorUserId, actorUserId);
  assert.equal(run.audit.eventType, "research_run_started");

  const runDetail = await getResearchRun(store, { runId: run.run.id });
  assert.equal(runDetail.run.id, run.run.id);
  assert.equal(runDetail.events.length, 1);

  const events = await listResearchRunEvents(store, { runId: run.run.id });
  assert.equal(events.events[0].eventType, "research_run_queued");

  const cancelled = await cancelResearchRun(store, {
    runId: run.run.id,
    actorUserId,
    reason: "Operator cancelled before dispatch."
  });
  assert.equal(cancelled.run.status, "cancelled");
  assert.equal(cancelled.event.eventType, "research_run_cancelled");

  const retry = await retryResearchRun(store, {
    runId: run.run.id,
    actorUserId,
    reason: "Retry after operator changed queue priority."
  });
  assert.equal(retry.run.status, "queued");
  assert.equal(retry.run.retryOfRunId, run.run.id);
  assert.equal(retry.audit.eventType, "research_run_retry_created");

  const sources = await listResearchSources(store);
  assert.ok(sources.sources.some((source) => source.id === proposed.source.id && source.approved));

  const runs = await listResearchRuns(store);
  assert.ok(runs.runs.some((item) => item.id === retry.run.id));

  const kpis = await getResearchKpis(store);
  assert.ok(kpis.sources.approved >= 1);
  assert.ok(kpis.runs.total >= 2);
  assert.ok(kpis.audit.totalEvents >= 5);

  const auditRows = await store.all("SELECT event_type FROM audit_events ORDER BY rowid ASC;");
  const eventTypes = auditRows.map((row) => row.event_type);
  assert.ok(eventTypes.includes("research_source_proposed"));
  assert.ok(eventTypes.includes("research_source_approved"));
  assert.ok(eventTypes.includes("research_run_started"));
  assert.ok(eventTypes.includes("research_run_cancelled"));
  assert.ok(eventTypes.includes("research_run_retry_created"));
});

test("operator research rejects invalid source URLs and disallows runs from rejected sources", async () => {
  const store = await createStore();

  await assert.rejects(
    () => proposeResearchSource(store, { url: "file:///tmp/source.txt", title: "Local File" }),
    (error) => error instanceof ResearchOpsError && error.statusCode === 400
  );

  const proposed = await proposeResearchSource(store, {
    actorUserId: "operator_research_test",
    url: "https://example.invalid/research/rejected-source",
    title: "Rejected Research Source"
  });
  const rejected = await reviewResearchSource(store, {
    sourceId: proposed.source.id,
    actorUserId: "operator_research_test",
    decision: "rejected",
    reason: "Not relevant."
  });

  assert.equal(rejected.source.status, "rejected");
  await assert.rejects(
    () => startManualResearchRun(store, { sourceId: proposed.source.id }),
    (error) => error instanceof ResearchOpsError && error.statusCode === 409
  );
});

test("operator research execution fetches approved source, stores artifact, and avoids raw identifiers in audit/events", async () => {
  const store = await createStore();
  const artifactDir = await mkdtemp(join(tmpdir(), "brainsty-research-artifacts-"));
  const previousArtifactDir = process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = artifactDir;

  try {
    await withHttpFixture(
      (req, res) => {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(`
          <html>
            <head><title>Fixture Benefits Policy</title></head>
            <body>
              <h1>Benefits Policy</h1>
              <p>Evidence for deductible and out-of-pocket research.</p>
              <p>Contact test@example.com and SSN 123-45-6789 are fixture redaction probes.</p>
            </body>
          </html>
        `);
      },
      async (baseUrl) => {
        const actorUserId = "operator_research_executor";
        const proposed = await proposeResearchSource(store, {
          actorUserId,
          url: `${baseUrl}/benefits-policy`,
          title: "Fixture Benefits Policy",
          workflowKeys: ["general_rag"],
          reason: "Execution test."
        });
        await reviewResearchSource(store, {
          sourceId: proposed.source.id,
          actorUserId,
          decision: "approved",
          reason: "Approved for deterministic fetch."
        });
        const run = await startManualResearchRun(store, {
          actorUserId,
          sourceId: proposed.source.id,
          topic: "Benefits source execution"
        });

        const executed = await executeResearchRun(store, {
          runId: run.run.id,
          actorUserId,
          workerMode: "deterministic_fetch"
        });

        assert.equal(executed.run.status, "completed");
        assert.equal(executed.event.eventType, "research_run_execution_completed");
        assert.equal(executed.artifact.artifactType, "deterministic_fetch_text");
        assert.equal(executed.artifact.citationStatus, "extracted_pending_review");
        assert.match(executed.artifact.safeTextPreview, /Benefits Policy/);
        assert.match(executed.artifact.safeTextPreview, /\[redacted-email\]/);
        assert.match(executed.artifact.safeTextPreview, /\[DB_POINTER:sensitive_identifiers:ssn:not_stored\]/);

        const rawArtifact = await readFile(executed.artifact.metadata.rawArtifactPath, "utf8");
        assert.match(rawArtifact, /test@example\.com/);

        const detail = await getResearchRun(store, { runId: run.run.id });
        assert.equal(detail.artifacts.length, 1);
        assert.equal(detail.artifacts[0].contentHash, executed.artifact.contentHash);
        assert.ok(detail.events.some((event) => event.eventType === "research_run_execution_started"));
        assert.ok(detail.events.some((event) => event.eventType === "research_run_execution_completed"));

        const auditRows = await store.all("SELECT event_type, details FROM audit_events ORDER BY rowid ASC;");
        const auditText = JSON.stringify(auditRows);
        assert.match(auditText, /research_run_executed/);
        assert.doesNotMatch(auditText, /test@example\.com/);
        assert.doesNotMatch(auditText, /123-45-6789/);
      }
    );
  } finally {
    if (previousArtifactDir === undefined) delete process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
    else process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = previousArtifactDir;
  }
});

test("operator research document upload creates pending-review KB artifact with safe metadata only", async () => {
  const store = await createStore();
  const artifactDir = await mkdtemp(join(tmpdir(), "brainsty-research-upload-artifacts-"));
  const previousArtifactDir = process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = artifactDir;

  try {
    const rawDocument = [
      "Summary of Benefits and Coverage",
      "The annual deductible is $1,500 before coinsurance starts.",
      "Email upload-probe@example.com and SSN 123-45-6789 are redaction probes."
    ].join("\n");
    const uploaded = await ingestResearchDocumentUpload(store, {
      actorUserId: "operator_research_pdf_upload",
      filename: "benefits-summary.pdf",
      contentType: "application/pdf",
      contentBase64: Buffer.from(rawDocument, "utf8").toString("base64"),
      title: "Uploaded Benefits Summary PDF",
      workflowKeys: ["general_rag", "eligibility_benefits_navigation"],
      documentKind: "research_knowledge_base_pdf"
    });

    assert.equal(uploaded.ok, true);
    assert.equal(uploaded.status, "research_document_upload_extracted");
    assert.equal(uploaded.document.contentType, "application/pdf");
    assert.equal(uploaded.artifact.artifactType, "operator_uploaded_pdf_extraction");
    assert.equal(uploaded.artifact.citationStatus, "extracted_pending_review");
    assert.equal(uploaded.source.status, "approved");
    assert.equal(uploaded.run.status, "completed");
    assert.equal(uploaded.event.eventType, "research_document_upload_extracted");
    assert.equal(uploaded.audit.eventType, "research_document_uploaded");
    assert.equal(uploaded.safety.rawDocumentReturned, false);
    assert.equal(uploaded.safety.rawTextReturned, false);
    assert.equal(uploaded.safety.artifactPendingReview, true);
    assert.match(uploaded.artifact.safeTextPreview, /Summary of Benefits/);
    assert.match(uploaded.artifact.safeTextPreview, /\[redacted-email\]/);
    assert.match(uploaded.artifact.safeTextPreview, /\[DB_POINTER:sensitive_identifiers:ssn:not_stored\]/);

    const pendingSearch = await searchResearchEvidence(store, { query: "annual deductible" });
    assert.equal(pendingSearch.status, "pending_review_only");
    assert.equal(pendingSearch.trustedResultCount, 0);

    const queue = await listResearchArtifacts(store, { citationStatus: "extracted_pending_review" });
    assert.ok(queue.artifacts.some((artifact) => artifact.id === uploaded.artifact.id));

    const auditRows = await store.all("SELECT event_type, details FROM audit_events ORDER BY rowid ASC;");
    const auditText = JSON.stringify(auditRows);
    assert.match(auditText, /research_document_uploaded/);
    assert.doesNotMatch(auditText, /upload-probe@example\.com/);
    assert.doesNotMatch(auditText, /123-45-6789/);
    assert.doesNotMatch(auditText, /annual deductible is \$1,500/);
  } finally {
    if (previousArtifactDir === undefined) delete process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
    else process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = previousArtifactDir;
  }
});

test("operator review gate controls trusted evidence search over research artifacts", async () => {
  const store = await createStore();
  const artifactDir = await mkdtemp(join(tmpdir(), "brainsty-research-artifacts-"));
  const previousArtifactDir = process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = artifactDir;

  try {
    await withHttpFixture(
      (req, res) => {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(`
          <html>
            <head><title>Deductible Evidence Fixture</title></head>
            <body>
              <h1>Deductible Evidence</h1>
              <p>The plan deductible evidence says reviewed claims apply to the annual deductible.</p>
            </body>
          </html>
        `);
      },
      async (baseUrl) => {
        const actorUserId = "operator_research_reviewer";
        const proposed = await proposeResearchSource(store, {
          actorUserId,
          url: `${baseUrl}/deductible`,
          title: "Deductible Evidence Fixture"
        });
        await reviewResearchSource(store, {
          sourceId: proposed.source.id,
          actorUserId,
          decision: "approved"
        });
        const run = await startManualResearchRun(store, {
          actorUserId,
          sourceId: proposed.source.id,
          topic: "Deductible evidence review"
        });
        const executed = await executeResearchRun(store, {
          runId: run.run.id,
          actorUserId,
          workerMode: "deterministic_fetch"
        });

        assert.equal(executed.artifact.citationStatus, "extracted_pending_review");
        const beforeReview = await searchResearchEvidence(store, { query: "annual deductible" });
        assert.equal(beforeReview.status, "pending_review_only");
        assert.equal(beforeReview.trustedResultCount, 0);
        assert.equal(beforeReview.results.length, 0);
        assert.ok(beforeReview.pendingReviewCount >= 1);

        const queue = await listResearchArtifacts(store, { citationStatus: "extracted_pending_review" });
        assert.ok(queue.artifacts.some((artifact) => artifact.id === executed.artifact.id));
        assert.ok(queue.reviewQueue.pendingArtifacts >= 1);

        const approved = await reviewResearchArtifact(store, {
          artifactId: executed.artifact.id,
          actorUserId,
          decision: "approve",
          reason: "Source title and extracted preview support the query."
        });
        assert.equal(approved.artifact.citationStatus, "trusted_retrieval_approved");
        assert.equal(approved.artifact.metadata.trustedRetrieval, true);
        assert.equal(approved.event.eventType, "research_artifact_approved");

        const afterReview = await searchResearchEvidence(store, { query: "annual deductible" });
        assert.equal(afterReview.status, "trusted_evidence_found");
        assert.equal(afterReview.trustedResultCount, 1);
        assert.equal(afterReview.results[0].artifactId, executed.artifact.id);
        assert.equal(afterReview.results[0].citationStatus, "trusted_retrieval_approved");
        assert.match(afterReview.results[0].snippet, /deductible/i);

        const quarantined = await reviewResearchArtifact(store, {
          artifactId: executed.artifact.id,
          actorUserId,
          decision: "quarantine",
          reason: "Operator found the source no longer suitable."
        });
        assert.equal(quarantined.artifact.citationStatus, "quarantined");

        const afterQuarantine = await searchResearchEvidence(store, { query: "annual deductible" });
        assert.equal(afterQuarantine.status, "no_evidence_found");
        assert.equal(afterQuarantine.trustedResultCount, 0);

        const auditRows = await store.all("SELECT event_type, details FROM audit_events ORDER BY rowid ASC;");
        const auditText = JSON.stringify(auditRows);
        assert.match(auditText, /research_artifact_approved/);
        assert.match(auditText, /research_artifact_quarantined/);
        assert.doesNotMatch(auditText, /Source title and extracted preview support the query/);
      }
    );
  } finally {
    if (previousArtifactDir === undefined) delete process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
    else process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = previousArtifactDir;
  }
});

test("claim citation closure judges answer claims against trusted reviewed evidence only", async () => {
  const store = await createStore();
  const artifactDir = await mkdtemp(join(tmpdir(), "brainsty-claim-closure-artifacts-"));
  const previousArtifactDir = process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = artifactDir;

  try {
    await withHttpFixture(
      (req, res) => {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(`
          <html>
            <head><title>Claim Closure Deductible Fixture</title></head>
            <body>
              <h1>Claim Closure Deductible Fixture</h1>
              <p>The annual deductible applies before coinsurance starts for covered services.</p>
            </body>
          </html>
        `);
      },
      async (baseUrl) => {
        const actorUserId = "operator_claim_closure";
        const proposed = await proposeResearchSource(store, {
          actorUserId,
          url: `${baseUrl}/claim-closure-deductible`,
          title: "Claim Closure Deductible Fixture"
        });
        await reviewResearchSource(store, { sourceId: proposed.source.id, actorUserId, decision: "approved" });
        const run = await startManualResearchRun(store, {
          actorUserId,
          sourceId: proposed.source.id,
          topic: "Claim closure fixture"
        });
        const executed = await executeResearchRun(store, { runId: run.run.id, actorUserId, workerMode: "deterministic_fetch" });
        await reviewResearchArtifact(store, {
          artifactId: executed.artifact.id,
          actorUserId,
          decision: "approve",
          reason: "Trusted for claim-level closure."
        });

        const beforeArtifactCount = await store.get("SELECT COUNT(*) AS count FROM research_artifacts;");
        const judged = await evaluateCitationClosure(store, {
          actorUserId,
          question: "What happens before coinsurance starts?",
          answer:
            "The annual deductible applies before coinsurance starts for covered services. Skydiving vacations are fully reimbursed.",
          minSupportScore: 3
        });

        assert.equal(judged.status, "citation_closure_failed");
        assert.equal(judged.verdict, "unsupported_claims_found");
        assert.equal(judged.evaluation.claimCount, 2);
        assert.equal(judged.evaluation.supportedCount, 1);
        assert.equal(judged.evaluation.unsupportedCount, 1);
        assert.equal(judged.safety.judgeCreatesEvidence, false);
        assert.equal(judged.safety.trustedEvidenceOnly, true);
        assert.equal(judged.audit.eventType, "research_claim_citation_closure_evaluated");
        assert.deepEqual(judged.actionsTaken, ["research_claims_extracted", "trusted_research_evidence_scored", "claim_citation_labels_written"]);

        const claims = judged.evaluation.evaluation.claims;
        const supported = claims.find((claim) => claim.status === "supported");
        const unsupported = claims.find((claim) => claim.status === "unsupported");
        assert.ok(supported);
        assert.equal(supported.citations[0].artifactId, executed.artifact.id);
        assert.equal(Object.hasOwn(supported.citations[0], "sourceUrl"), false);
        assert.ok(supported.citations[0].sourceUrlHash);
        assert.ok(unsupported);
        assert.equal(unsupported.citations.length, 0);

        const afterArtifactCount = await store.get("SELECT COUNT(*) AS count FROM research_artifacts;");
        assert.equal(afterArtifactCount.count, beforeArtifactCount.count);

        const list = await listCitationClosureEvaluations(store);
        assert.equal(list.latest.id, judged.evaluation.id);
        assert.equal(list.counts.unsupported_claims_found, 1);
        assert.equal(list.safety.judgeCreatesEvidence, false);

        const auditRows = await store.all("SELECT event_type, details FROM audit_events ORDER BY rowid ASC;");
        const closureAudit = auditRows.find((row) => row.event_type === "research_claim_citation_closure_evaluated");
        assert.ok(closureAudit);
        assert.doesNotMatch(closureAudit.details, /Skydiving vacations are fully reimbursed/i);
      }
    );
  } finally {
    if (previousArtifactDir === undefined) delete process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
    else process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = previousArtifactDir;
  }
});

test("research embedding route indexes only approved evidence and influences search", async () => {
  const store = await createStore();
  const artifactDir = await mkdtemp(join(tmpdir(), "brainsty-research-artifacts-"));
  const previousArtifactDir = process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = artifactDir;

  try {
    await withHttpFixture(
      (req, res) => {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(`
          <html>
            <head><title>Embedding Deductible Fixture</title></head>
            <body>
              <h1>Deductible and out-of-pocket evidence</h1>
              <p>The annual deductible applies before coinsurance starts for covered services.</p>
            </body>
          </html>
        `);
      },
      async (baseUrl) => {
        const actorUserId = "operator_research_embedding";
        const proposed = await proposeResearchSource(store, {
          actorUserId,
          url: `${baseUrl}/embedding-deductible`,
          title: "Embedding Deductible Fixture"
        });
        await reviewResearchSource(store, { sourceId: proposed.source.id, actorUserId, decision: "approved" });
        const run = await startManualResearchRun(store, { actorUserId, sourceId: proposed.source.id, topic: "Embedding route proof" });
        const executed = await executeResearchRun(store, { runId: run.run.id, actorUserId, workerMode: "deterministic_fetch" });

        const beforeReview = await reindexResearchEmbeddings(store, { actorUserId });
        assert.equal(beforeReview.status, "completed_no_trusted_artifacts");
        assert.equal(beforeReview.job.indexedCount, 0);

        await reviewResearchArtifact(store, {
          artifactId: executed.artifact.id,
          actorUserId,
          decision: "approve",
          reason: "Approved for embedding route test."
        });
        const selected = await chooseResearchEmbeddingRoute(store, {
          actorUserId,
          provider: "local_tfidf",
          dimensions: 32,
          reason: "Use local deterministic embeddings for reproducible retrieval tests."
        });
        assert.equal(selected.route.provider, "local_tfidf");
        assert.equal(selected.route.dimensions, 32);

        const reindexed = await reindexResearchEmbeddings(store, { actorUserId });
        assert.equal(reindexed.ok, true);
        assert.equal(reindexed.status, "completed");
        assert.equal(reindexed.job.indexedCount, 1);
        assert.equal(reindexed.indexed[0].artifactId, executed.artifact.id);

        const pendingIndexCount = await store.get("SELECT COUNT(*) AS count FROM research_embedding_index idx JOIN research_artifacts artifacts ON artifacts.id = idx.artifact_id WHERE artifacts.citation_status <> 'trusted_retrieval_approved';");
        assert.equal(pendingIndexCount.count, 0);

        const status = await getResearchEmbeddingStatus(store);
        assert.equal(status.route.provider, "local_tfidf");
        assert.equal(status.counts.trustedArtifacts, 1);
        assert.equal(status.counts.activeIndexedArtifacts, 1);
        assert.equal(status.counts.staleTrustedArtifacts, 0);
        assert.equal(status.safety.indexesOnlyApprovedEvidence, true);

        const search = await searchResearchEvidence(store, { query: "covered deductible coinsurance" });
        assert.equal(search.status, "trusted_evidence_found");
        assert.equal(search.embeddingSearch.used, true);
        assert.equal(search.results[0].artifactId, executed.artifact.id);
        assert.ok(search.results[0].embeddingScore > 0);
      }
    );
  } finally {
    if (previousArtifactDir === undefined) delete process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
    else process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = previousArtifactDir;
  }
});

test("research graph builds from safe metadata and audits the build job", async () => {
  const store = await createStore();
  const artifactDir = await mkdtemp(join(tmpdir(), "brainsty-research-graph-artifacts-"));
  const previousArtifactDir = process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = artifactDir;

  try {
    await withHttpFixture(
      (req, res) => {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(`
          <html>
            <head><title>Graph Benefits Fixture</title></head>
            <body>
              <h1>Benefits graph fixture</h1>
              <p>Graph-only raw phrase should stay out of graph payloads.</p>
            </body>
          </html>
        `);
      },
      async (baseUrl) => {
        const actorUserId = "operator_research_graph";
        const proposed = await proposeResearchSource(store, {
          actorUserId,
          url: `${baseUrl}/graph-benefits`,
          title: "Graph Benefits Fixture",
          workflowKeys: ["general_rag", "eligibility_benefits_navigation"]
        });
        await reviewResearchSource(store, { sourceId: proposed.source.id, actorUserId, decision: "approved" });
        const run = await startManualResearchRun(store, {
          actorUserId,
          sourceId: proposed.source.id,
          topic: "Research graph proof",
          workflowKey: "general_rag"
        });
        const executed = await executeResearchRun(store, { runId: run.run.id, actorUserId, workerMode: "deterministic_fetch" });
        await reviewResearchArtifact(store, {
          artifactId: executed.artifact.id,
          actorUserId,
          decision: "approve",
          reason: "Trusted for graph metadata proof."
        });
        await chooseResearchEmbeddingRoute(store, { actorUserId, provider: "local_tfidf", dimensions: 16 });
        await reindexResearchEmbeddings(store, { actorUserId });
        await createResearchSchedule(store, {
          actorUserId,
          sourceId: proposed.source.id,
          scheduleLabel: "Graph proof refresh",
          intervalHours: 24,
          workflowKey: "general_rag",
          topic: "Graph proof refresh"
        });

        const readGraph = await getResearchGraph(store);
        assert.equal(readGraph.ok, true);
        assert.equal(readGraph.graph.status, "ready");
        assert.equal(readGraph.safety.rawArtifactTextReturned, false);
        assert.equal(readGraph.safety.safeTextPreviewReturned, false);
        assert.ok(readGraph.graph.nodes.some((node) => node.id === `source:${proposed.source.id}`));
        assert.ok(readGraph.graph.edges.some((edge) => edge.type === "run_produced_artifact"));
        assert.ok(readGraph.graph.edges.some((edge) => edge.type === "artifact_indexed_by_route"));
        assert.ok(readGraph.graph.edges.some((edge) => edge.type === "schedule_targets_source"));
        assert.equal(readGraph.graph.summary.trustedArtifactCount, 1);
        assert.doesNotMatch(JSON.stringify(readGraph.graph), /Graph-only raw phrase/);
        const artifactNode = readGraph.graph.nodes.find((node) => node.id === `artifact:${executed.artifact.id}`);
        assert.equal(Object.hasOwn(artifactNode.metadata, "safeTextPreview"), false);
        assert.equal(artifactNode.metadata.safePreviewReturned, false);

        const built = await buildResearchGraph(store, { actorUserId, limit: 50 });
        assert.equal(built.status, "graph_build_completed");
        assert.equal(built.build.status, "completed");
        assert.equal(built.build.actorUserId, actorUserId);
        assert.equal(built.audit.eventType, "research_graph_build_completed");
        assert.deepEqual(built.actionsTaken, ["research_graph_metadata_snapshot_built", "research_graph_build_recorded"]);

        const buildRow = await store.findOne("research_graph_builds", { id: built.build.id });
        assert.equal(buildRow.status, "completed");
        assert.equal(buildRow.audit_event_id, built.audit.id);
        assert.ok(Number(buildRow.node_count) >= 4);
        assert.ok(Number(buildRow.edge_count) >= 4);
      }
    );
  } finally {
    if (previousArtifactDir === undefined) delete process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
    else process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = previousArtifactDir;
  }
});

test("research embedding reindex fails safely on dimension mismatch without deleting prior index rows", async () => {
  const store = await createStore();
  const time = new Date().toISOString();
  await store.insert("knowledge_sources", {
    id: "source_embedding_mismatch",
    source_key: "source_embedding_mismatch",
    title: "Embedding Mismatch Source",
    source_type: "web_source",
    authority_level: "operator_proposed",
    base_url: "https://example.invalid/embedding-mismatch",
    workflow_keys_json: "[]",
    refresh_policy: "manual_review_required",
    access_method: "manual_or_deterministic_fetch_after_approval",
    status: "approved",
    priority: 100,
    last_run_at: null,
    last_status: null,
    metadata_json: "{}",
    proposed_by: "operator_embedding_mismatch",
    approved_by: "operator_embedding_mismatch",
    reviewed_at: time,
    created_at: time,
    updated_at: time
  });
  await store.insert("research_runs", {
    id: "run_embedding_mismatch",
    source_id: "source_embedding_mismatch",
    source_key: "source_embedding_mismatch",
    actor_user_id: "operator_embedding_mismatch",
    run_type: "manual_operator_run",
    workflow_key: "general_rag",
    status: "completed",
    topic: "Embedding mismatch proof",
    query_json: "{}",
    summary: "Completed fixture run.",
    retry_of_run_id: null,
    metadata_json: "{}",
    started_at: time,
    completed_at: time,
    created_at: time,
    updated_at: time
  });
  await store.insert("research_artifacts", {
    id: "artifact_embedding_mismatch",
    run_id: "run_embedding_mismatch",
    source_id: "source_embedding_mismatch",
    artifact_type: "deterministic_fetch_text",
    source_url: "https://example.invalid/embedding-mismatch",
    title: "Embedding Mismatch Artifact",
    content_hash: "content_hash_embedding_mismatch",
    extraction_hash: "extraction_hash_embedding_mismatch",
    safe_text_preview: "Trusted deductible evidence for mismatch handling.",
    citation_status: "trusted_retrieval_approved",
    metadata_json: "{}",
    created_at: time
  });
  await chooseResearchEmbeddingRoute(store, {
    actorUserId: "operator_embedding_mismatch",
    provider: "local_tfidf",
    dimensions: 16
  });
  await store.insert("research_embedding_index", {
    id: "embedding_index_mismatch",
    artifact_id: "artifact_embedding_mismatch",
    route_key: "default",
    provider: "local_tfidf",
    model: "local-tfidf-v1",
    dimensions: 8,
    vector_json: "[1,0,0,0,0,0,0,0]",
    vector_hash: "vector_hash_mismatch",
    text_hash: "text_hash_mismatch",
    source_hash: "source_hash_mismatch",
    status: "active",
    job_id: null,
    metadata_json: "{}",
    created_at: time,
    updated_at: time
  });

  const blocked = await reindexResearchEmbeddings(store, { actorUserId: "operator_embedding_mismatch" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, "blocked_dimension_mismatch");
  assert.deepEqual(blocked.actionsTaken, []);

  const activeRows = await store.get("SELECT COUNT(*) AS count FROM research_embedding_index WHERE id = 'embedding_index_mismatch' AND status = 'active';");
  assert.equal(activeRows.count, 1);
  const failedJobs = await store.get("SELECT COUNT(*) AS count FROM research_embedding_jobs WHERE status = 'failed' AND failure_reason = 'blocked_dimension_mismatch';");
  assert.equal(failedJobs.count, 1);
});

test("operator research MockWorker mode is visible, untrusted, and terminal", async () => {
  const store = await createStore();
  const artifactDir = await mkdtemp(join(tmpdir(), "brainsty-research-artifacts-"));
  const previousArtifactDir = process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = artifactDir;

  try {
    const worker = getResearchWorkerStatus();
    assert.equal(worker.modes.mockWorker.enabled, true);
    assert.equal(worker.modes.mockWorker.trustedRetrieval, false);

    const proposed = await proposeResearchSource(store, {
      actorUserId: "operator_research_mock",
      url: "https://example.invalid/mock-worker-source",
      title: "Mock Worker Source"
    });
    await reviewResearchSource(store, {
      sourceId: proposed.source.id,
      actorUserId: "operator_research_mock",
      decision: "approved"
    });
    const run = await startManualResearchRun(store, {
      actorUserId: "operator_research_mock",
      sourceId: proposed.source.id,
      topic: "Mock worker fallback run"
    });
    const executed = await executeResearchRun(store, {
      runId: run.run.id,
      actorUserId: "operator_research_mock",
      workerMode: "mock_worker"
    });

    assert.equal(executed.run.status, "completed");
    assert.equal(executed.artifact.artifactType, "mock_worker_generated_evidence");
    assert.equal(executed.artifact.citationStatus, "mock_worker_untrusted");
    assert.equal(executed.artifact.metadata.trustedRetrieval, false);
    await assert.rejects(
      () =>
        reviewResearchArtifact(store, {
          artifactId: executed.artifact.id,
          actorUserId: "operator_research_mock",
          decision: "approve",
          reason: "Try to approve an explicitly untrusted mock worker result."
        }),
      (error) => error instanceof ResearchOpsError && error.statusCode === 409
    );
    await assert.rejects(
      () => executeResearchRun(store, { runId: run.run.id, workerMode: "mock_worker" }),
      (error) => error instanceof ResearchOpsError && error.statusCode === 409
    );
  } finally {
    if (previousArtifactDir === undefined) delete process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
    else process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = previousArtifactDir;
  }
});

test("adaptive OpenClaw and Hermes research workers require approval and write pending-review artifacts only", async () => {
  const store = await createStore();
  const artifactDir = await mkdtemp(join(tmpdir(), "brainsty-adaptive-worker-artifacts-"));
  const previousArtifactDir = process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
  const previousOpenClawEnabled = process.env.BRAINSTY_RESEARCH_OPENCLAW_ENABLED;
  const previousHermesEnabled = process.env.BRAINSTY_RESEARCH_HERMES_ENABLED;
  process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = artifactDir;

  try {
    const proposed = await proposeResearchSource(store, {
      actorUserId: "operator_adaptive_worker",
      url: "https://example.invalid/adaptive-worker-source",
      title: "Adaptive Worker Source"
    });
    await reviewResearchSource(store, {
      sourceId: proposed.source.id,
      actorUserId: "operator_adaptive_worker",
      decision: "approved"
    });
    const blockedRun = await startManualResearchRun(store, {
      actorUserId: "operator_adaptive_worker",
      sourceId: proposed.source.id,
      topic: "Adaptive worker approval gate"
    });
    await assert.rejects(
      () =>
        executeResearchRun(store, {
          runId: blockedRun.run.id,
          actorUserId: "operator_adaptive_worker",
          workerMode: "openclaw"
        }),
      (error) => error instanceof ResearchOpsError && error.statusCode === 409
    );
    const blockedArtifacts = await listResearchArtifacts(store, { runId: blockedRun.run.id });
    assert.equal(blockedArtifacts.artifacts.length, 0);

    process.env.BRAINSTY_RESEARCH_OPENCLAW_ENABLED = "1";
    process.env.BRAINSTY_RESEARCH_HERMES_ENABLED = "1";
    const workerStatus = getResearchWorkerStatus();
    assert.equal(workerStatus.modes.openclaw.enabled, true);
    assert.equal(workerStatus.modes.openclaw.trustedRetrieval, false);
    assert.equal(workerStatus.modes.hermes.enabled, true);
    assert.equal(workerStatus.modes.hermes.artifactReviewRequired, true);

    const openclawRun = await startManualResearchRun(store, {
      actorUserId: "operator_adaptive_worker",
      sourceId: proposed.source.id,
      topic: "OpenClaw worker source read"
    });
    const openclawExecuted = await executeResearchRun(store, {
      runId: openclawRun.run.id,
      actorUserId: "operator_adaptive_worker",
      workerMode: "openclaw",
      approvedWorkerDispatch: true,
      workerRunners: {
        openclaw: async (taskEnvelope) => ({
          provider: "official_openclaw_cli",
          command: "openclaw --profile brainstyworkers agent --json",
          stdout: JSON.stringify({
            status: "success",
            answer: `Observed ${taskEnvelope.source.title} in read-only mode.`,
            evidence: [{ source: taskEnvelope.source.url, details: "The approved source contained benefits policy language.", confidence: "high" }],
            sourcePointers: [{ url: taskEnvelope.source.url, title: taskEnvelope.source.title, kind: "approved_source" }],
            actionsTaken: ["openclaw_agent_read_only_source_observation"],
            uncertainties: [],
            recommendedNextSteps: ["Operator should review citation before trusted retrieval."],
            confidence: 0.91
          }),
          stderr: ""
        })
      }
    });

    assert.equal(openclawExecuted.run.status, "completed");
    assert.equal(openclawExecuted.artifact.artifactType, "openclaw_research_worker_result");
    assert.equal(openclawExecuted.artifact.citationStatus, "extracted_pending_review");
    assert.equal(openclawExecuted.artifact.metadata.taskEnvelope.schemaVersion, "brainstyworkers.research_worker_task.v1");
    assert.equal(openclawExecuted.artifact.metadata.taskEnvelope.controls.approvedSourceOnly, true);
    assert.equal(openclawExecuted.artifact.metadata.trustedRetrieval, false);
    assert.equal(openclawExecuted.workerResult.status, "success");
    assert.deepEqual(openclawExecuted.workerResult.actionsTaken, ["openclaw_agent_read_only_source_observation"]);

    const search = await searchResearchEvidence(store, { query: "benefits policy language" });
    assert.equal(search.status, "pending_review_only");
    assert.equal(search.trustedResultCount, 0);
    assert.equal(search.pendingReviewCount, 1);

    const hermesRun = await startManualResearchRun(store, {
      actorUserId: "operator_adaptive_worker",
      sourceId: proposed.source.id,
      topic: "Hermes worker source read"
    });
    const hermesExecuted = await executeResearchRun(store, {
      runId: hermesRun.run.id,
      actorUserId: "operator_adaptive_worker",
      workerMode: "hermes",
      approvedWorkerDispatch: true,
      workerRunners: {
        hermes: async (taskEnvelope) => ({
          provider: "hermes_cli",
          command: "hermes --oneshot [redacted-task-envelope]",
          stdout: JSON.stringify({
            status: "partial",
            answer: `Hermes checked ${taskEnvelope.source.title} and found partial source evidence.`,
            evidence: [{ source: taskEnvelope.source.url, details: "Partial public-source observation returned.", confidence: "medium" }],
            actionsTaken: ["hermes_cli_read_only_source_observation"],
            blockers: ["Some dynamic content required browser tooling not available in this run."]
          }),
          stderr: ""
        })
      }
    });

    assert.equal(hermesExecuted.artifact.artifactType, "hermes_research_worker_result");
    assert.equal(hermesExecuted.artifact.citationStatus, "extracted_pending_review");
    assert.equal(hermesExecuted.workerResult.status, "partial");

    const events = await listResearchRunEvents(store, { runId: openclawRun.run.id });
    assert.ok(events.events.some((event) => event.eventType === "research_worker_dispatch_requested"));
    const auditRows = await store.all("SELECT event_type FROM audit_events WHERE event_type LIKE 'research_worker_%' ORDER BY created_at ASC;");
    assert.ok(auditRows.some((row) => row.event_type === "research_worker_dispatch_requested"));
  } finally {
    if (previousArtifactDir === undefined) delete process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR;
    else process.env.BRAINSTY_RESEARCH_ARTIFACT_DIR = previousArtifactDir;
    if (previousOpenClawEnabled === undefined) delete process.env.BRAINSTY_RESEARCH_OPENCLAW_ENABLED;
    else process.env.BRAINSTY_RESEARCH_OPENCLAW_ENABLED = previousOpenClawEnabled;
    if (previousHermesEnabled === undefined) delete process.env.BRAINSTY_RESEARCH_HERMES_ENABLED;
    else process.env.BRAINSTY_RESEARCH_HERMES_ENABLED = previousHermesEnabled;
  }
});

test("approved research schedules queue due runs and pause or resume with audit proof", async () => {
  const store = await createStore();
  const actorUserId = "operator_research_scheduler";
  const proposed = await proposeResearchSource(store, {
    actorUserId,
    url: "https://example.invalid/scheduled-source",
    title: "Scheduled Source"
  });
  await reviewResearchSource(store, {
    sourceId: proposed.source.id,
    actorUserId,
    decision: "approved",
    reason: "Approved for scheduled automation."
  });

  const schedule = await createResearchSchedule(store, {
    actorUserId,
    sourceId: proposed.source.id,
    scheduleLabel: "Nightly Scheduled Source Refresh",
    intervalHours: 24,
    nextRunAt: "2026-06-01T00:00:00.000Z",
    topic: "Scheduled benefits research",
    workflowKey: "general_rag",
    query: { q: "scheduled benefits" }
  });
  assert.equal(schedule.schedule.status, "active");
  assert.equal(schedule.schedule.approvalStatus, "approved");
  assert.equal(schedule.schedule.sourceId, proposed.source.id);
  assert.equal(schedule.audit.eventType, "research_schedule_created");

  const listBefore = await listResearchSchedules(store);
  assert.equal(listBefore.dueCount, 1);
  assert.ok(listBefore.schedules.some((item) => item.id === schedule.schedule.id));

  const tick = await runDueResearchSchedules(store, {
    actorUserId,
    now: "2026-06-01T00:00:00.000Z",
    limit: 5
  });
  assert.equal(tick.scheduler.mode, "queue_due_runs");
  assert.equal(tick.scheduler.processedCount, 1);
  assert.equal(tick.processed[0].run.status, "queued");
  assert.equal(tick.processed[0].run.runType, "scheduled_research_run");
  assert.equal(tick.processed[0].schedule.runCount, 1);
  assert.equal(tick.processed[0].schedule.lastRunId, tick.processed[0].run.id);
  assert.deepEqual(tick.scheduler.actionsTaken, [`queued:${tick.processed[0].run.id}`]);

  const detail = await getResearchRun(store, { runId: tick.processed[0].run.id });
  assert.equal(detail.run.query.scheduledAutomation, true);
  assert.equal(detail.run.metadata.scheduledRun, true);
  assert.equal(detail.run.metadata.scheduleId, schedule.schedule.id);

  const paused = await pauseResearchSchedule(store, {
    scheduleId: schedule.schedule.id,
    actorUserId,
    reason: "Pause while source is being reviewed."
  });
  assert.equal(paused.schedule.status, "paused");

  const resumed = await resumeResearchSchedule(store, {
    scheduleId: schedule.schedule.id,
    actorUserId,
    reason: "Resume after review.",
    nextRunAt: "2026-06-02T00:00:00.000Z"
  });
  assert.equal(resumed.schedule.status, "active");
  assert.equal(resumed.schedule.nextRunAt, "2026-06-02T00:00:00.000Z");

  const kpis = await getResearchKpis(store);
  assert.ok(kpis.schedules.total >= 1);
  assert.ok(kpis.schedules.active >= 1);

  const auditRows = await store.all("SELECT event_type, details FROM audit_events ORDER BY rowid ASC;");
  const auditText = JSON.stringify(auditRows);
  assert.match(auditText, /research_schedule_created/);
  assert.match(auditText, /research_schedule_tick_run_created/);
  assert.match(auditText, /research_schedule_paused/);
  assert.match(auditText, /research_schedule_resumed/);
  assert.doesNotMatch(auditText, /Pause while source is being reviewed/);
});
