import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const indexHtml = await readFile(new URL("../app/index.html", import.meta.url), "utf8");
const appJs = await readFile(new URL("../app/app.js", import.meta.url), "utf8");

test("chat MVP surface exposes guided auth, portal readiness, and runtime timeline", () => {
  assert.match(indexHtml, /id="chatJourney"/);
  assert.match(indexHtml, /id="portalReady"/);
  assert.match(indexHtml, /id="officialOpenClawCurrentTab"/);
  assert.match(indexHtml, /id="officialOpenClawMultiPage"/);
  assert.match(indexHtml, /id="resetMvpJourney"/);
  assert.match(indexHtml, /id="replayMvpBenefits"/);
  assert.match(indexHtml, /id="answerPanel"/);
  assert.match(indexHtml, /id="runtimeTimeline"/);
  assert.match(indexHtml, /id="loadRuntimeEvents"/);
  assert.match(indexHtml, /id="liveWorkerGuide"/);
  assert.match(indexHtml, /id="checkLiveWorker"/);
  assert.match(indexHtml, /id="liveWorkerStatus"/);
  assert.match(indexHtml, /id="workerVersatility"/);
  assert.match(indexHtml, /Runtime Timeline/);
  assert.match(indexHtml, /Use official OpenClaw worker/);
  assert.match(indexHtml, /Use current OpenClaw tab/);
  assert.match(indexHtml, /Multi-page read-only worker/);
  assert.match(indexHtml, /Live Worker Readiness/);
  assert.match(indexHtml, /Replay Benefits MVP/);
});

test("chat MVP JavaScript requires sign-in and renders runtime graph events", () => {
  assert.match(appJs, /requireSignedInBeforeWorkflow/);
  assert.match(appJs, /\/api\/runtime\/events\?sessionId=/);
  assert.match(appJs, /EventSource/);
  assert.match(appJs, /workflow\.classified/);
  assert.match(appJs, /worker\.plan\.prepared/);
  assert.match(appJs, /approval\.recorded/);
  assert.match(appJs, /approval\.consumed/);
  assert.match(appJs, /worker\.status\.updated/);
  assert.match(appJs, /llmDecision\.mode/);
  assert.match(appJs, /renderWorkerOutcomeCard/);
  assert.match(appJs, /friendlyWorkerBlocker/);
  assert.match(appJs, /structuredBenefitSummary/);
  assert.match(appJs, /Evidence channels/);
  assert.match(appJs, /renderLiveWorkerGuide/);
  assert.match(appJs, /liveReadiness/);
  assert.match(appJs, /ready_for_read_only_approval/);
  assert.match(appJs, /auth_required/);
  assert.match(appJs, /auth_or_challenge_required/);
  assert.match(appJs, /portal_page_required/);
  assert.match(appJs, /Worker may try after approval/);
  assert.match(appJs, /Always blocked/);
  assert.match(appJs, /Fallback chain/);
});

test("chat MVP exposes repeatable benefits replay and final answer surface", () => {
  assert.match(appJs, /MVP_BENEFITS_MESSAGE/);
  assert.match(appJs, /resetMvpJourneySurface/);
  assert.match(appJs, /replayMvpBenefitsJourney/);
  assert.match(appJs, /productAuthenticate/);
  assert.match(appJs, /runProductChat\(MVP_BENEFITS_MESSAGE\)/);
  assert.match(appJs, /renderAnswerPanel/);
  assert.match(appJs, /Current Answer/);
  assert.match(appJs, /data-answer-approve-readonly/);
  assert.match(appJs, /data-answer-worker-followup/);
  assert.match(appJs, /\/api\/orchestrator\/auth-start/);
  assert.match(appJs, /\/api\/chat/);
});

test("chat MVP keeps operator proof expandable", () => {
  assert.match(appJs, /renderOperatorProofDetails/);
  assert.match(appJs, /Workflow Proof/);
  assert.match(appJs, /Worker Result/);
  assert.match(appJs, /operator-proof/);
  assert.match(appJs, /Payload audits/);
  assert.match(appJs, /Source pointers/);
  assert.match(indexHtml, /runtime-proof/);
});

test("chat MVP exposes async worker continuation controls without worker actions", () => {
  assert.match(appJs, /worker\.followup\.scheduled/);
  assert.match(appJs, /worker\.followup\.continue_requested/);
  assert.match(appJs, /worker\.followup\.cancelled/);
  assert.match(appJs, /worker\.followup\.dispatching/);
  assert.match(appJs, /worker\.followup\.completed/);
  assert.match(appJs, /worker\.followup\.blocked/);
  assert.match(appJs, /renderWorkerContinuationCard/);
  assert.match(appJs, /Leave As Async Follow-Up/);
  assert.match(appJs, /Approve \+ Run Official Read-Only/);
  assert.match(appJs, /Continue Status Check/);
  assert.match(appJs, /Cancel Follow-Up/);
  assert.match(appJs, /Cancelled follow-up is closed/);
  assert.match(appJs, /\/api\/worker-continuations/);
  assert.match(appJs, /workerContinuationId/);
  assert.match(appJs, /officialOpenClawUseCurrentTab/);
  assert.match(appJs, /officialOpenClawMultiPage/);
  assert.match(appJs, /Actions taken/);
  assert.match(appJs, /read_only_observation/);
});

test("chat MVP closes completed worker continuations and suppresses stale portal prompts", () => {
  assert.match(appJs, /hasCapturedPortalEvidence/);
  assert.match(appJs, /isSatisfiedByCapturedPortalEvidence/);
  assert.match(appJs, /portal_accounts/);
  assert.match(appJs, /upsertWorkerContinuationCard/);
  assert.match(appJs, /workerContinuationFromResult/);
  assert.match(appJs, /Completed follow-up is closed\. Source pointers and worker actions are shown in Worker Result\./);
  assert.match(appJs, /existing\.replaceWith\(next\)/);
});

test("chat MVP exposes multi-page worker proof fields", () => {
  assert.match(indexHtml, /Multi-page read-only worker/);
  assert.match(appJs, /officialOpenClawMultiPage\.checked = true/);
  assert.match(appJs, /Navigation plan/);
  assert.match(appJs, /evidence\.navigationPlan/);
  assert.match(appJs, /verifiedPageCount/);
  assert.match(appJs, /pageCount/);
  assert.match(appJs, /captured_official_openclaw_multi_page_read_only_observation/);
  assert.match(appJs, /evidenceChannelSummary/);
});
