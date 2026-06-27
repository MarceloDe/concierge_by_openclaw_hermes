// Stateful OpenClaw cross-process proof — TURN 1 (writer). Records a worker
// dispatch into the Redis-backed worker runtime state for the given session.
import { loadLocalEnvOnce } from "../src/concierge/secrets.mjs";
import { recordWorkerDispatchState } from "../src/concierge/workerRuntimeState.mjs";
await loadLocalEnvOnce();
const sessionId = process.argv[2];
const r = await recordWorkerDispatchState({
  sessionId,
  threadId: "thread_" + sessionId,
  dispatch: { dispatchedAt: new Date().toISOString(), workflow: "prior_authorization_navigation", skillKey: "insurance_portal_browser", executionMode: "proposal_only", plannerSelectedSkillKeys: ["insurance_portal_browser"], hydratedCapabilityCount: 3 }
});
console.log(JSON.stringify({ sessionId, backend: r.cacheBackend, stored: r.stored, dispatchCount: r.state.dispatchCount }));
