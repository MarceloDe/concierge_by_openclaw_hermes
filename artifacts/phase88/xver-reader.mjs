// Cross-version arm READER — runs under PHASE 88 code (the current tree). Resumes the
// PRE-pivot pending interrupt via the same Command.resume path.
const root = "/Users/mfelix/projects/workerprototype_openclaw";
process.env.BRAINSTY_REDIS_URL = ""; process.env.REDIS_URL = "";
process.env.BRAINSTY_GRAPH_CHECKPOINTER = "file";
process.env.BRAINSTY_GRAPH_CHECKPOINTER_PATH = process.env.XVER_CKPT;
process.env.BRAINSTY_GRAPH_CHECKPOINTER_ENCRYPTION_KEY = "xver-test-key-0123456789abcdef0123456789abcdef";
const { SqliteStore } = await import(`${root}/src/concierge/database.mjs`);
const { runLangGraphOrchestration } = await import(`${root}/src/concierge/langgraphRunner.mjs`);
const args = JSON.parse(process.env.XVER_ARGS);
const store = await new SqliteStore(process.env.XVER_DB).initialize();
const user = await store.findOne("users", { id: args.userId });
const session = await store.findOne("sessions", { id: args.sessionId });
const REPLAY = {
  workflow: "payer_portal_read_only_extraction", intent: "deductible_balance_lookup", confidence: 0.9,
  rationale: "portal balance", requiredEvidence: ["authenticated_portal_page"], missingEvidence: ["authenticated_portal_page"],
  approvalRequired: true, approvalScope: "read_only_observation", workerGoal: "read-only", responseStrategy: "offer_process_and_ask", userFacingNextQuestion: ""
};
const resumed = await runLangGraphOrchestration(store, {
  user, session, channel: session.channel,
  userInput: "Use my Aetna portal to check my deductible balance.",
  rawMessage: {
    source: "xver_reader_phase88", useLiveModel: false, executeEvidenceObservation: true, requireLivePortalProof: true,
    approvalTaskId: args.taskId, approvalToken: args.approvalToken, llmOrchestrationDecisionReplay: REPLAY
  }
});
console.log(JSON.stringify({
  resumedOutcome: resumed.state.workflow_outcome,
  approvalResume: resumed.state.approval_resume?.status ?? null,
  interruptStatus: resumed.state.approval_interrupt?.status ?? null,
  evidenceStatus: resumed.state.evidence_observation?.status ?? null
}));
