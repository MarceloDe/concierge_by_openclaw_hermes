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
        claims: [],
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
      verifiedPageCount: 2
    }
  });

  assert.match(response, /I captured approved read-only portal evidence/);
  assert.match(response, /approved multi-page read-only observation was executed/);
  assert.match(response, /2\/2 page\(s\) were verified/);
  assert.match(response, /Source pointers: eligibility_snapshots\/elig_123, extraction_artifacts\/artifact_123/);
  assert.match(response, /Deductible: total \$600\.00, spent \$558\.72, remaining \$41\.28/);
  assert.doesNotMatch(response, /not executed in this slice/i);
  assert.doesNotMatch(response, /Enrollment complete/i);
});
