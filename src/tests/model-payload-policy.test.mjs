import test from "node:test";
import assert from "node:assert/strict";
import { buildPhiAllowedReasoningPayload, buildRouteProofPayload, maskDirectIdentifiers, selectModelPayload } from "../concierge/modelPayloadPolicy.mjs";

const state = {
  workflow: "eligibility_benefits_navigation",
  workflow_route: {
    workflowKey: "eligibility_benefits_navigation",
    journeyStage: "coverage_understanding",
    executableNow: true,
    routeScore: 4,
    missingUserFields: [],
    missingDataPointers: ["portal_accounts"],
    disabledTools: [],
    toolStatus: [
      {
        toolKey: "openclaw_authenticated_browser",
        present: true,
        enabled: true,
        integrationStatus: "adapter_contract_ready",
        approvalRequired: "per_browser_action_scope"
      }
    ]
  },
  safety: {
    policyAllowed: true,
    approvalRequired: false,
    checks: [{ name: "credential_boundary", passed: true }]
  },
  user_input:
    "Marcelo Felix asks whether Aetna claim CPT 99213 with diagnosis E11.9 was denied. Member ID W123456789 and SSN 123-45-6789.",
  memory_context:
    "Marcelo has Aetna claims, deductible data, diagnosis E11.9, prior authorization notes, email mocfelix@gmail.com, and subscriber number ABC123456.",
  context_packet: {
    user: { id: "user_123", name: "Marcelo Felix", email: "mocfelix@gmail.com" },
    openTasks: [{ id: "task_1", description: "Review claim for Marcelo Felix" }],
    scheduledJobs: [{ id: "job_1" }],
    dbPointers: [{ table: "claim_items", id: "claim_1" }],
    workflowArchitecture: {
      routeCandidates: [{ workflowKey: "eligibility_benefits_navigation" }],
      readiness: [],
      knowledgeSources: [],
      openclawSkills: []
    }
  }
};

test("PHI allowed payload includes insurance and clinical context but masks direct identifiers", () => {
  const payload = buildPhiAllowedReasoningPayload(state);
  const text = JSON.stringify(payload);

  assert.equal(payload.disclosureMode, "phi_allowed_identifier_masked_reasoning");
  assert.match(text, /CPT 99213/);
  assert.match(text, /E11\.9/);
  assert.match(text, /deductible/);
  assert.match(text, /claim_1/);
  assert.ok(!text.includes("Marcelo"));
  assert.ok(!text.includes("Felix"));
  assert.ok(!text.includes("mocfelix@gmail.com"));
  assert.ok(!text.includes("123-45-6789"));
  assert.ok(!text.includes("W123456789"));
  assert.match(text, /DB_POINTER:users:user_123:name/);
  assert.match(text, /DB_POINTER:sensitive_identifiers:ssn:not_stored/);
});

test("route proof payload remains available for low-disclosure checks", () => {
  const payload = buildRouteProofPayload(state);
  const text = JSON.stringify(payload);

  assert.equal(payload.disclosureMode, "route_proof_only");
  assert.ok(!text.includes("E11.9"));
  assert.ok(!text.includes("claim_1"));
});

test("payload selector defaults to PHI allowed identifier-masked reasoning", () => {
  const selected = selectModelPayload(state);

  assert.equal(selected.mode, "phi_allowed_identifier_masked_reasoning");
  assert.match(selected.warning, /PHI/);
  assert.match(JSON.stringify(selected.payload), /E11\.9/);
});

test("direct identifier masking covers name, email, SSN, and subscription labels", () => {
  const masked = maskDirectIdentifiers(
    "Marcelo Felix email mocfelix@gmail.com SSN 123456789 subscriber ID SUB-999000 and member number W123456789",
    state
  );

  assert.ok(!masked.includes("Marcelo"));
  assert.ok(!masked.includes("mocfelix@gmail.com"));
  assert.ok(!masked.includes("123456789"));
  assert.ok(!masked.includes("SUB-999000"));
  assert.match(masked, /DB_POINTER:insurance_identifiers:member_or_subscriber_id/);
});
