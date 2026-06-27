// Stateful OpenClaw cross-process proof — TURN 2 (reader, fresh process).
import { loadLocalEnvOnce } from "../src/concierge/secrets.mjs";
import { readWorkerRuntimeState } from "../src/concierge/workerRuntimeState.mjs";
await loadLocalEnvOnce();
const r = await readWorkerRuntimeState(process.argv[2]);
console.log(JSON.stringify({ backend: r.cacheBackend, cacheHit: r.cacheHit, dispatchCount: r.prior?.dispatchCount ?? 0, lastWorkflow: r.prior?.latestDispatch?.workflow ?? null }));
