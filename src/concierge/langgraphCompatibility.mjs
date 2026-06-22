import { normalizeWebChat } from "./channelAdapter.mjs";
import { createReadOnlyObservationApproval } from "./approvalResume.mjs";
import { enrollDefaultMember } from "./enrollment.mjs";
import { runLangGraphOrchestration } from "./langgraphRunner.mjs";
import { traceForSession } from "./traceSession.mjs";

export async function runConciergeSlice(store, input = {}) {
  const envelope = normalizeWebChat(input);
  const enrollment = await enrollDefaultMember(store, input.member ?? {}, {
    sessionId: input.sessionId,
    resumeLatestSession: Boolean(input.resumeLatestSession),
    title: input.sessionTitle
  });
  const { user, session } = enrollment;
  const hasFixtureEvidence = Boolean(input.browserSnapshot || input.portalPageSnapshots?.length || input.uploadedDocuments?.length);
  const rawMessage = {
    ...input,
    useLiveModel: input.useLiveModel ?? false,
    persistConversation: input.persistConversation,
    executeEvidenceObservation:
      input.executeEvidenceObservation ??
      Boolean(hasFixtureEvidence || input.remoteDebuggerUrl)
  };
  let graphRun = await runLangGraphOrchestration(store, {
    user,
    session,
    channel: session.channel,
    userInput: envelope.user_input,
    rawMessage:
      hasFixtureEvidence && input.compatibilityAutoApproveReadOnlyEvidence !== false
        ? {
            ...rawMessage,
            browserSnapshot: undefined,
            portalPageSnapshots: undefined,
            uploadedDocuments: undefined,
            executeEvidenceObservation: false
          }
        : rawMessage
  });
  if (hasFixtureEvidence && input.compatibilityAutoApproveReadOnlyEvidence !== false) {
    const taskId = graphRun.state.openclaw_skill_proposal?.task?.id;
    if (taskId) {
      const approval = await createReadOnlyObservationApproval(store, {
        taskId,
        sessionId: session.id,
        userId: user.id,
        decision: "approved",
        expiresInMinutes: 15
      });
      if (approval.ok) {
        graphRun = await runLangGraphOrchestration(store, {
          user,
          session,
          channel: session.channel,
          userInput: envelope.user_input,
          rawMessage: {
            ...rawMessage,
            approvalToken: approval.approvalToken,
            approvalTaskId: taskId
          }
        });
      }
    }
  }
  const state = graphRun.state;
  return {
    ...enrollment,
    envelope,
    policyResult: state.policy_result,
    intent: state.intent,
    browserResult: state.browser_result,
    eligibility: state.eligibility_result,
    portalScan: state.portal_scan,
    finalResponse: state.final_response,
    memoryContext: graphRun.contextPacket,
    retainedMemory: graphRun.retainedMemory,
    productMemory: graphRun.productMemory,
    state
  };
}

export { traceForSession };
