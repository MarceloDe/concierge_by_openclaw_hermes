import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPhase70AuthenticatedOpenClawBillProof } from "../concierge/authenticatedOpenClawBillProof.mjs";

const app = await readFile(new URL("../app/app.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");

test("Phase 70 keeps authenticated OpenClaw bill proof live-gated when user is not signed in", () => {
  const proof = buildPhase70AuthenticatedOpenClawBillProof({
    liveReadiness: {
      status: "portal_page_required",
      readyForReadOnlyObservation: false,
      nextAction: "User must sign in manually."
    }
  });

  assert.equal(proof.status, "phase70_authenticated_openclaw_bill_flow_live_gate_ready_user_login_required");
  assert.equal(proof.ok, true);
  assert.equal(proof.score, 100);
  assert.equal(proof.liveReadiness.readyForReadOnlyObservation, false);
  assert.equal(proof.approvalBoundary.agentMayEnterCredentials, false);
  assert.equal(proof.approvalBoundary.agentMaySubmitForms, false);
  assert.equal(proof.approvalBoundary.agentMayContactPayer, false);
  assert.ok(proof.approvalBoundary.humanOnly.includes("2fa"));
});

test("Phase 70 reports ready only when live readiness is user-controlled and approved", () => {
  const proof = buildPhase70AuthenticatedOpenClawBillProof({
    liveReadiness: {
      status: "ready_for_read_only_approval",
      readyForReadOnlyObservation: true,
      nextAction: "Ask for read-only approval."
    }
  });

  assert.equal(proof.status, "phase70_authenticated_openclaw_bill_flow_ready_for_read_only_approval");
  assert.equal(proof.liveReadiness.readyForReadOnlyObservation, true);
  assert.equal(proof.approvalBoundary.approvalScope, "read_only_observation");
});

test("Phase 70 proof is visible in server and dashboard", () => {
  assert.match(server, /buildPhase70AuthenticatedOpenClawBillProof/);
  assert.match(server, /phase70_authenticated_openclaw_bill_flow/);
  assert.match(app, /Phase 70 Authenticated OpenClaw Bill Proof/);
  assert.match(app, /Human-only/);
});
