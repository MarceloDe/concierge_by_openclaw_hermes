import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const indexHtml = await readFile(new URL("../app/index.html", import.meta.url), "utf8");
const appJs = await readFile(new URL("../app/app.js", import.meta.url), "utf8");

test("chat MVP surface exposes guided auth, portal readiness, and runtime timeline", () => {
  assert.match(indexHtml, /id="chatJourney"/);
  assert.match(indexHtml, /id="portalReady"/);
  assert.match(indexHtml, /id="runtimeTimeline"/);
  assert.match(indexHtml, /id="loadRuntimeEvents"/);
  assert.match(indexHtml, /Use official OpenClaw worker/);
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
  assert.match(appJs, /Actions taken/);
  assert.match(appJs, /read_only_observation/);
});
