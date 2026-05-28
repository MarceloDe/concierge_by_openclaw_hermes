import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteStore } from "../concierge/database.mjs";
import { enrollDefaultMember } from "../concierge/enrollment.mjs";
import { loadOpenClawSkillArtifact } from "../concierge/openclawSkillArtifacts.mjs";
import {
  recordOpenClawSkillInvocationProposal,
  validateOpenClawEnvelopeAgainstSkill
} from "../concierge/openclawSkillInvocation.mjs";

async function createStore() {
  const dir = await mkdtemp(join(tmpdir(), "brainsty-openclaw-invocation-"));
  return new SqliteStore(join(dir, "test.sqlite")).initialize();
}

function baseEnvelope(overrides = {}) {
  return {
    envelope_type: "openclaw_channel_task",
    user_id: "user_test",
    session_id: "session_test",
    channel: "local_web_chat",
    raw_input: {
      source: "test",
      approvalScope: "read_only_observation"
    },
    user_input: "Review my eligibility and benefits in read-only mode.",
    workflow_architecture: {
      route_candidates: [{ workflowKey: "eligibility_benefits_navigation", journeyStage: "coverage_understanding" }],
      knowledge_sources: [
        {
          source_key: "aetna_member_portal",
          source_type: "user_authenticated_payer_portal",
          base_url: "https://www.aetna.com/"
        }
      ],
      openclaw_skills: [{ skill_key: "insurance_portal_browser" }]
    },
    db_pointers: [],
    approval_policy: {
      external_messaging: "requires_explicit_approval_gate",
      payer_communication: "requires_explicit_approval_gate",
      credential_entry: "user_only",
      medical_advice: "not_allowed"
    },
    ...overrides
  };
}

test("valid read-only OpenClaw browser proposal passes without actions", async () => {
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const validation = validateOpenClawEnvelopeAgainstSkill(baseEnvelope(), artifact);

  assert.equal(validation.valid, true, validation.issues.join("; "));
  assert.equal(validation.status, "validated_proposal_not_executed");
  assert.equal(validation.executionMode, "proposal_only");
  assert.equal(validation.workflowAllowed, true);
  assert.deepEqual(validation.actionsTaken, []);
  assert.ok(validation.fallbackPath.includes("manual_user_export"));
  assert.ok(validation.approvalsRequired.some((item) => item.includes("credential_entry:user_only")));
});

test("disallowed workflow is blocked by the skill contract", async () => {
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const validation = validateOpenClawEnvelopeAgainstSkill(
    baseEnvelope({
      workflow_architecture: {
        ...baseEnvelope().workflow_architecture,
        route_candidates: [{ workflowKey: "denial_appeal_preparation", journeyStage: "appeal" }]
      }
    }),
    artifact
  );

  assert.equal(validation.valid, false);
  assert.match(validation.issues.join("\n"), /not allowed/);
});

test("missing required inputs are reported before any worker execution", async () => {
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const envelope = baseEnvelope({
    session_id: null,
    workflow_architecture: {
      route_candidates: [],
      knowledge_sources: [],
      openclaw_skills: []
    }
  });
  const validation = validateOpenClawEnvelopeAgainstSkill(envelope, artifact);

  assert.equal(validation.valid, false);
  assert.match(validation.issues.join("\n"), /session_id/);
  assert.match(validation.issues.join("\n"), /workflow_key/);
  assert.match(validation.issues.join("\n"), /portal_url/);
  assert.deepEqual(validation.actionsTaken, []);
});

test("credential, external action, and medical advice requests are blocked", async () => {
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const validation = validateOpenClawEnvelopeAgainstSkill(
    baseEnvelope({
      user_input: "Log in with my password, submit the authorization form, email Aetna, and tell me what treatment I should take."
    }),
    artifact
  );

  assert.equal(validation.valid, false);
  assert.ok(validation.blockedActions.some((item) => item.key === "credential_entry"));
  assert.ok(validation.blockedActions.some((item) => item.key === "external_message_send"));
  assert.ok(validation.blockedActions.some((item) => item.key === "form_submit_or_record_change"));
  assert.ok(validation.blockedActions.some((item) => item.key === "medical_advice"));
  assert.deepEqual(validation.actionsTaken, []);
});

test("recorded OpenClaw proposal uses approval-gated task and audit tables", async () => {
  const store = await createStore();
  const { user, session } = await enrollDefaultMember(store);
  const artifact = await loadOpenClawSkillArtifact("insurance_portal_browser");
  const envelope = baseEnvelope({ user_id: user.id, session_id: session.id });
  const validation = validateOpenClawEnvelopeAgainstSkill(envelope, artifact);
  const proposal = await recordOpenClawSkillInvocationProposal(store, {
    user,
    session,
    contextPacketId: "ctx_test",
    envelope,
    validation
  });

  assert.equal(proposal.executionMode, "proposal_only");
  assert.equal(proposal.task.task_type, "openclaw_skill_invocation_proposal");
  assert.equal(proposal.task.status, "pending_approval");
  assert.equal(proposal.auditEvent.event_type, "openclaw_skill_invocation_proposed");
  assert.deepEqual(proposal.actionsTaken, []);
});
