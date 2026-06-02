import test from "node:test";
import assert from "node:assert/strict";
import { composeResponse } from "../concierge/outputPolicy.mjs";
import { SOURCE_POINTER_RESPONSE_STATUSES } from "../concierge/langgraphRunner.mjs";

test("multi-page official OpenClaw evidence composes a sourced executed answer", () => {
  assert.equal(SOURCE_POINTER_RESPONSE_STATUSES.has("captured_official_openclaw_multi_page_read_only_observation"), true);

  const response = composeResponse({
    user: { name: "Pointer User", email: "pointer@example.com" },
    portal: { portal_url: "https://health.aetna.com/" },
    policyResult: { checks: [] },
    intent: "check_benefits",
    browserResult: {
      page: {
        title: "Claims - Aetna",
        url: "https://health.aetna.com/manage/claims#page1"
      }
    },
    eligibility: {
      structured: {
        coverageBalances: [
          {
            label: "Deductible",
            total_amount: 600,
            spent_amount: 558.72,
            remaining_amount: 41.28,
            source: "coverage_balances/bal_123"
          }
        ],
        claims: [
          {
            description: "Office visit",
            service_date: "May 1, 2026",
            share_amount: 42.5,
            source: "claim_items/claim_123"
          }
        ],
        priorAuthorizations: []
      }
    },
    sourcePointers: [
      { table: "eligibility_snapshots", id: "elig_123" },
      { table: "extraction_artifacts", id: "artifact_123" }
    ],
    evidenceObservation: {
      status: "captured_official_openclaw_multi_page_read_only_observation",
      pageCount: 2,
      verifiedPageCount: 2,
      discoveryReport: {
        version: "2026-05-30.phase8o.openclaw-discovery.v1",
        portalSearch: { status: "portal_search_available_not_submitted", available: true },
        documentDiscovery: { candidateCount: 3, sbcPdfCandidateCount: 1 },
        portalSections: { tried: ["benefits", "claims"] }
      }
    }
  });

  assert.match(response, /I captured approved read-only portal evidence/);
  assert.match(response, /approved multi-page read-only observation was executed/);
  assert.match(response, /2\/2 page\(s\) were verified/);
  assert.match(response, /Source pointers: eligibility_snapshots\/elig_123, extraction_artifacts\/artifact_123/);
  assert.match(response, /OpenClaw discovery proof: portal search portal_search_available_not_submitted; document candidates 3; SBC\/PDF candidates 1/);
  assert.match(response, /Deductible: total \$600\.00, spent \$558\.72, remaining \$41\.28/);
  assert.match(response, /Structured claims\/prior authorization evidence: claims Office visit on May 1, 2026 with share \$42\.50/);
  assert.doesNotMatch(response, /not executed in this slice/i);
  assert.doesNotMatch(response, /Enrollment complete/i);
});

test("approved document candidate observation composes a sourced single-candidate answer", () => {
  assert.equal(SOURCE_POINTER_RESPONSE_STATUSES.has("captured_official_openclaw_document_read_only_observation"), true);

  const response = composeResponse({
    user: { name: "Pointer User", email: "pointer@example.com" },
    portal: { portal_url: "https://health.aetna.com/" },
    policyResult: { checks: [] },
    intent: "check_benefits",
    browserResult: {
      page: {
        title: "Plan document",
        url: "https://health.aetna.com/member/documents/plan"
      }
    },
    eligibility: null,
    sourcePointers: [{ table: "extraction_artifacts", id: "artifact_doc_123" }],
    evidenceObservation: {
      status: "captured_official_openclaw_document_read_only_observation",
      approvedDocumentCandidate: {
        label: "Plan document",
        url: "https://health.aetna.com/member/documents/plan"
      },
      discoveryReport: {
        version: "2026-05-30.phase8o.openclaw-discovery.v1",
        portalSearch: { status: "portal_search_available_not_submitted", available: true },
        documentDiscovery: { candidateCount: 1, sbcPdfCandidateCount: 0 }
      }
    }
  });

  assert.match(response, /approved read-only document observation was executed/);
  assert.match(response, /exactly one candidate/);
  assert.match(response, /Approved candidate: Plan document/);
  assert.match(response, /Source pointers: extraction_artifacts\/artifact_doc_123/);
  assert.doesNotMatch(response, /raw document/i);
});
