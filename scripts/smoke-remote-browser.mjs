// Isolated end-to-end smoke test for Phase 11 remote-browser control.
// Drives browserStreamController against the LIVE brainstyworkers OpenClaw browser:
//   1. starts a screencast and asserts a real frame arrives,
//   2. takes over and relays a human click + text,
//   3. reads the input value back over CDP to PROVE the keystrokes landed.
// Run only against a safe local page (http://127.0.0.1:8899/remote-browser-smoke.html).

import {
  startScreencast,
  stopScreencast,
  subscribeBrowserFrames,
  requestTakeover,
  grantTakeover,
  relayHumanInput,
  endTakeover
} from "../src/concierge/browserStreamController.mjs";
import { resolveActivePageCdpTarget, getOfficialOpenClawConfig } from "../src/concierge/openclawOfficialRuntime.mjs";
import { SqliteStore } from "../src/concierge/database.mjs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// OpenClaw's browser blocks file:// and non-allowlisted hosts, so we drive an
// already-allowed page (example.com) and DOM-inject a focused test input via CDP.
// This proves the relay identically: a real keystroke must land in a real field.
const TARGET = "https://example.com/";
const SESSION = "smoke-session";
const RELAY_TEXT = "captcha-7421";
const streamKey = `anon::${SESSION}`;

function waitForFrame(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsub(); reject(new Error("no screencast frame within timeout")); }, timeoutMs);
    const unsub = subscribeBrowserFrames(streamKey, (frame) => {
      clearTimeout(timer); unsub(); resolve(frame);
    });
  });
}

async function cdpEval(expression) {
  const target = await resolveActivePageCdpTarget({ config: getOfficialOpenClawConfig(), targetUrl: TARGET });
  if (!target.ok) throw new Error(`cdp target: ${target.status}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.addEventListener("open", res); socket.addEventListener("error", () => rej(new Error("cdp ws error"))); });
  const value = await new Promise((resolve, reject) => {
    const id = 99;
    socket.addEventListener("message", (e) => {
      const p = JSON.parse(e.data);
      if (p.id === id) resolve(p.result?.result?.value ?? null);
    });
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    setTimeout(() => reject(new Error("cdp eval timeout")), 8000);
  });
  socket.close();
  return value;
}

// Inject a fixed, autofocused input so a relayed tap+type has a real target.
function injectTestInput() {
  return cdpEval(`(() => {
    let el = document.getElementById('t');
    if (!el) {
      el = document.createElement('input');
      el.id = 't';
      el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:120px;font-size:40px;z-index:2147483647;background:#fff;color:#000';
      document.body.appendChild(el);
    }
    el.value = '';
    el.focus();
    return document.activeElement === el;
  })()`);
}

const readInputValueViaCdp = () => cdpEval("document.getElementById('t')?.value || ''");

async function main() {
  const results = {};
  const dir = await mkdtemp(join(tmpdir(), "brainsty-smoke-rb-"));
  const store = await new SqliteStore(join(dir, "smoke.sqlite")).initialize();

  results.test_input_focused = await injectTestInput();

  // Subscribe BEFORE starting so we never miss the initial frame of a static page.
  const framePromise = waitForFrame();
  const started = await startScreencast({ store, sessionId: SESSION, targetUrl: TARGET, options: { everyNthFrame: 1, quality: 50 } });
  results.screencast_started = started;
  if (!started.ok) throw new Error(`startScreencast failed: ${started.status}`);

  const frame = await framePromise;
  results.first_frame = { mime: frame.mime, bytes: Buffer.byteLength(frame.data, "base64"), hasMetadata: Boolean(frame.metadata), device: frame.metadata ? `${frame.metadata.deviceWidth}x${frame.metadata.deviceHeight}` : null };

  const req = await requestTakeover({ store, sessionId: SESSION, reason: "smoke" });
  const grant = await grantTakeover({ store, takeoverId: req.takeoverId, sessionId: SESSION });
  results.takeover_granted = grant.ok;

  // click the input (top of page), then relay text like a phone keyboard would.
  await relayHumanInput({ store, takeoverId: req.takeoverId, grantToken: grant.grantToken, origin: "human", input: { kind: "mouse", type: "mousePressed", x: 0.5, y: 0.06, button: "left", clickCount: 1 } });
  await relayHumanInput({ store, takeoverId: req.takeoverId, grantToken: grant.grantToken, origin: "human", input: { kind: "mouse", type: "mouseReleased", x: 0.5, y: 0.06, button: "left", clickCount: 1 } });
  const relayed = await relayHumanInput({ store, takeoverId: req.takeoverId, grantToken: grant.grantToken, origin: "human", input: { kind: "text", text: RELAY_TEXT } });
  results.text_relay = relayed;

  // negative control: an agent-origin relay MUST be refused even with a valid token.
  const blocked = await relayHumanInput({ store, takeoverId: req.takeoverId, grantToken: grant.grantToken, origin: "agent", input: { kind: "text", text: "should-not-land" } });
  results.agent_blocked = blocked.status;

  await new Promise((r) => setTimeout(r, 400)); // let the input event settle
  const readBack = await readInputValueViaCdp();
  results.input_value_readback = readBack;

  await endTakeover({ store, takeoverId: req.takeoverId });
  await stopScreencast({ store, sessionId: SESSION });

  const framePass = results.first_frame.bytes > 1000;
  const inputPass = typeof readBack === "string" && readBack.includes(RELAY_TEXT);
  const agentBlockedPass = results.agent_blocked === "interactive_takeover_human_origin_required";

  console.log(JSON.stringify(results, null, 2));
  console.log(`\nFRAME:  ${framePass ? "PASS" : "FAIL"} (${results.first_frame.bytes} bytes)`);
  console.log(`INPUT:  ${inputPass ? "PASS" : "FAIL"} (read back: "${readBack}")`);
  console.log(`SAFETY: ${agentBlockedPass ? "PASS" : "FAIL"} (agent-origin relay rejected)`);
  const ok = framePass && inputPass && agentBlockedPass;
  console.log(`\nOVERALL: ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error("SMOKE ERROR:", err.message); process.exit(1); });
