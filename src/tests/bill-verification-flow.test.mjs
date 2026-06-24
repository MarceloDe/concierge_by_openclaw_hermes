import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeBillVerificationInput, buildPhase69BillVerificationProof } from "../concierge/billVerification.mjs";

const app = await readFile(new URL("../app/app.js", import.meta.url), "utf8");
const mvpHtml = await readFile(new URL("../app/mvp.html", import.meta.url), "utf8");
const mvpJs = await readFile(new URL("../app/mvp.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");

test("Phase 69 bill analyzer extracts obvious bill signals and preserves source-pointer-only posture", () => {
  const result = analyzeBillVerificationInput({
    text: "Provider: Example Clinic\nBill number: INV-445566\nDate: 2026-06-01\nAmount due: $184.22\nPayer: Aetna\nClaim number: CLM-123456",
    sessionId: "session-1",
    userId: "user-1"
  });

  assert.equal(result.status, "bill_verification_initial_evidence_ready");
  assert.equal(result.detected.provider, "Example Clinic");
  assert.equal(result.detected.amount, 184.22);
  assert.equal(result.detected.payer, "Aetna");
  assert.equal(result.detected.claim, "CLM-123456");
  assert.equal(result.sourcePointer.rawTextReturned, false);
  assert.equal(result.sourcePointer.phiPayloadStored, false);
  assert.equal(result.safety.payerContacted, false);
  assert.equal(result.safety.formSubmitted, false);
});

test("Phase 69 bill analyzer gives missing-evidence checklist and no-login fallback", () => {
  const result = analyzeBillVerificationInput({ text: "I got a bill for $99.00 and I do not understand it." });

  assert.equal(result.status, "bill_verification_needs_more_evidence");
  assert.ok(result.missingEvidence.includes("provider_or_facility_name"));
  assert.ok(result.requiredEvidence.includes("portal_login_optional_for_current_claim_status"));
  assert.equal(result.noLoginFallback.available, true);
  assert.ok(result.parallelAgents.some((agent) => agent.key === "openclaw_portal_observer" && /approval/.test(agent.status)));
});

test("Phase 69 proof and UI/API wiring are registered", () => {
  const proof = buildPhase69BillVerificationProof();

  assert.equal(proof.status, "phase69_bill_verification_mvp_flow_ready");
  assert.equal(proof.score, 100);
  assert.match(server, /\/api\/bill-verification\/analyze/);
  assert.match(server, /phase69_bill_verification_mvp_flow/);
  assert.match(app, /Phase 69 Bill Verification MVP/);
  assert.match(mvpHtml, /Analyze Bill/);
  assert.match(mvpJs, /function analyzeBill/);
  assert.match(mvpJs, /\/api\/bill-verification\/analyze/);
});
