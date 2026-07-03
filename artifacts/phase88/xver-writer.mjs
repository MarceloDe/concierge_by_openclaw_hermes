// Cross-version arm WRITER — runs under PRE-Phase-88 code (the Phase 87 worktree).
// Creates a PENDING read-only approval interrupt in FILE checkpointer mode.
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const root = process.env.XVER_ROOT;
process.env.BRAINSTY_REDIS_URL = ""; process.env.REDIS_URL = "";
process.env.BRAINSTY_GRAPH_CHECKPOINTER = "file";
process.env.BRAINSTY_GRAPH_CHECKPOINTER_PATH = process.env.XVER_CKPT;
process.env.BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY = "xver-test-key-0123456789abcdef0123456789abcdef";
const { SqliteStore, createId, nowIso } = await import(`${root}/src/concierge/database.mjs`);
const { seedCapabilityCatalog } = await import(`${root}/src/concierge/capabilityCatalogSeed.mjs`);
const { enrollDefaultMember } = await import(`${root}/src/concierge/enrollment.mjs`);
const { runLangGraphOrchestration } = await import(`${root}/src/concierge/langgraphRunner.mjs`);
const { createReadOnlyObservationApproval } = await import(`${root}/src/concierge/approvalResume.mjs`);
const store = await new SqliteStore(process.env.XVER_DB).initialize();
await seedCapabilityCatalog(store, { nowIso, createId });
const { user, session } = await enrollDefaultMember(store);
const REPLAY = {
  workflow: "payer_portal_read_only_extraction", intent: "deductible_balance_lookup", confidence: 0.9,
  rationale: "portal balance", requiredEvidence: ["authenticated_portal_page"], missingEvidence: ["authenticated_portal_page"],
  approvalRequired: true, approvalScope: "read_only_observation", workerGoal: "read-only", responseStrategy: "offer_process_and_ask", userFacingNextQuestion: ""
};
const proposal = await runLangGraphOrchestration(store, {
  user, session, channel: session.channel,
  userInput: "Use my Aetna portal to check my deductible balance.",
  rawMessage: { source: "xver_writer", useLiveModel: false, executeEvidenceObservation: false, llmOrchestrationDecisionReplay: REPLAY }
});
const taskId = proposal.state.openclaw_skill_proposal.task.id;
const paused = await runLangGraphOrchestration(store, {
  user, session, channel: session.channel,
  userInput: "Use my Aetna portal to check my deductible balance.",
  rawMessage: { source: "xver_writer", useLiveModel: false, executeEvidenceObservation: true, requireLivePortalProof: true, approvalTaskId: taskId, llmOrchestrationDecisionReplay: REPLAY }
});
const approval = await createReadOnlyObservationApproval(store, { taskId, sessionId: session.id, userId: user.id, decision: "approved", expiresInMinutes: 15 });
console.log(JSON.stringify({
  outcome: paused.state.workflow_outcome,
  interruptType: paused.state.approval_interrupt?.payload?.type ?? null,
  sessionId: session.id, userId: user.id, userEmail: user.email, taskId,
  approvalToken: approval.approvalToken
}));
