from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import glob
import hashlib
import json
import os
import re
from typing import Any, AsyncIterator
from urllib.parse import urljoin
from uuid import uuid4

import httpx


SANDBOX_CONTRACT_VERSION = "browser-sandbox-provider.v1"
HOSTED_SANDBOX_CONTRACT_VERSION = "brainstyworkers.browser-sandbox-provider.v1"
HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION = "2026-06-17.browser-sandbox-provider.v1"
VISUAL_OCR_PROOF_SCHEMA_VERSION = "brainstyworkers.browser-sandbox-provider-visual-ocr-proof.v1"
DEFAULT_PROVIDER_CONFIG_PATH = "project/deployment/browser-sandbox-provider.example.json"
DEFAULT_PROVIDER_SELECTION_CONFIG_PATH = "project/deployment/browser-sandbox-provider.selection.example.json"
PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH = "project/deployment/browser-sandbox-provider.launch-readiness.example.env"
PROVIDER_LAUNCH_READINESS_RUNBOOK_PATH = "docs/HOSTED_BROWSER_SANDBOX_PROVIDER_LAUNCH_RUNBOOK.md"
PROVIDER_PRIVATE_LAUNCH_EXECUTION_ENV_EXAMPLE_PATH = "project/deployment/browser-sandbox-provider.private-launch-execution.example.env"
STEEL_OPERATIONS_CONFIG_PATH = "project/deployment/browser-sandbox-provider.steel-operations.example.json"
STEEL_COMPOSE_PATH = "infra/steel/compose.yaml"
STEEL_RUNBOOK_PATH = "infra/steel/README.md"
STEEL_REMOTE_COMPOSE_PATH = "infra/steel/remote/compose.yaml"
STEEL_REMOTE_CADDYFILE_PATH = "infra/steel/remote/Caddyfile"
STEEL_REMOTE_FIREWALL_PATH = "infra/steel/remote/firewall.md"
STEEL_REMOTE_WIREGUARD_PATH = "infra/steel/remote/wireguard.md"
STEEL_REMOTE_RECOVERY_SCRIPT_PATH = "infra/steel/remote/recover.sh"
DEFAULT_HOSTED_AUTH_TOKEN_REF = "env:WEFELLA_BROWSER_SANDBOX_API_TOKEN"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_host(value: Any) -> str | None:
    try:
        parsed = httpx.URL(str(value))
    except Exception:
        return None
    return parsed.host


def _is_allowed_member_portal_host(host: str | None) -> bool:
    value = (host or "").lower()
    return bool(
        value in {"health.aetna.com", "member.aetna.com", "member.cvsaetna.com"}
        or value.endswith(".member.aetna.com")
        or value.endswith(".member.cvsaetna.com")
    )


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _clean_lines(text: str) -> list[str]:
    return [line.strip() for line in re.split(r"[\r\n]+", text or "") if line.strip()]


def _money(value: str | None) -> float | None:
    if not value:
        return None
    match = re.search(r"\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+\.[0-9]{2})", value)
    return float(match.group(1).replace(",", "")) if match else None


def _extract_claim_rows(text: str) -> list[dict[str, Any]]:
    normalized = re.sub(r"\s+", " ", text or " ")
    patterns = [
        re.compile(
            r"Status\s+(?P<status>[A-Za-z ]+?)\s+(?P<description>.+?)\s+For\s+(?P<member>.+?)\s+"
            r"(?:Filled|Visited|Service(?:d)?)\s+on\s+(?P<date>[A-Z][a-z]+ \d{1,2}, \d{4})\s+"
            r".{0,160}?Your share\s+(?:Your share\s+)?(?P<share>\$[0-9][0-9,]*(?:\.[0-9]{2})?)",
            re.I,
        ),
        re.compile(
            r"(?P<description>.+?)\s+For\s+(?P<member>.+?)\s+-\s+(?P<date>[A-Z][a-z]+ \d{1,2}, \d{4})\s+"
            r"Your share\s+(?P<share>\$[0-9][0-9,]*(?:\.[0-9]{2})?)",
            re.I,
        ),
    ]
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for pattern in patterns:
        for match in pattern.finditer(normalized):
            item = {
                "status": (match.groupdict().get("status") or "visible_in_portal").strip(),
                "description": re.sub(r"\s+", " ", match.group("description")).strip()[:240],
                "member_name": re.sub(r"\s+", " ", match.group("member")).strip()[:120],
                "service_date": match.group("date").strip(),
                "share_amount": _money(match.group("share")),
            }
            key = _sha256(json.dumps(item, sort_keys=True, separators=(",", ":")))[:16]
            if key in seen:
                continue
            seen.add(key)
            item["claim_ref"] = f"portal-claim:{key}"
            rows.append(item)
            if len(rows) >= 12:
                return rows
    return rows


def _portal_login_required(url: str | None, title: str | None, text: str | None) -> bool:
    haystack = f"{url or ''}\n{title or ''}\n{text or ''}".lower()
    title_url = f"{url or ''}\n{title or ''}".lower()
    login_pattern = re.compile(
        r"\b(log[- ]?in|login|log[- ]?on|sign[- ]?in|signin|sign into|username|user id|password|passkey|captcha|2fa|mfa|verification code)\b",
        re.I,
    )
    authenticated_signals = ["claims", "view all claims", "deductible", "member home", "coverage", "benefits"]
    if login_pattern.search(title_url):
        return True
    return bool(login_pattern.search(haystack)) and not any(signal in haystack for signal in authenticated_signals)


def _safe_claims_link(href: str | None, text: str | None, *, current_url: str | None) -> str | None:
    if not href:
        return None
    try:
        target = httpx.URL(urljoin(current_url or "https://health.aetna.com/", href))
    except Exception:
        return None
    label = f"{text or ''} {target.path or ''} {target.query.decode() if target.query else ''}".lower()
    blocked = ["logout", "signout", "profile", "message", "contact", "payment", "pay", "submit", "upload", "appeal", "settings"]
    if "claim" not in label or any(term in label for term in blocked):
        return None
    host = (target.host or "").lower()
    if not _is_allowed_member_portal_host(host):
        return None
    if target.scheme != "https":
        return None
    return str(target)


class BrowserSandboxError(RuntimeError):
    pass


def _node_error_detail(stderr: bytes | None, stdout: bytes | None) -> str:
    """Extract the meaningful error line from a crashed node subprocess.

    Node prints "Node.js vX.Y.Z" as the LAST line after an uncaught exception, so taking
    splitlines()[-1] masked the real error (e.g. it reported "Node.js v24.15.0" instead of
    "Error: Page.enable timeout"). Prefer the actual Error/timeout/failed line.
    """
    text = (stderr or stdout or b"").decode("utf-8", errors="replace")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("Node.js v")]
    if not lines:
        return "unknown error"
    for ln in reversed(lines):
        low = ln.lower()
        if ln.startswith("Error:") or "timeout" in low or "failed" in low:
            return ln
    return lines[-1]


# ---------------------------------------------------------------------------
# Unified persistent CDP bridge (ONE node subprocess per browser session).
# Steel self-host tolerates only one page debugger client at a time, so separate
# subprocesses (screencast + per-call input) competed for the page session and the
# input one timed out. This single long-lived bridge holds ONE flat CDP session,
# streams Page.screencastFrame -> stdout, and reads operation requests on stdin
# (input/navigate/observe/extract/interact/capture) dispatching them over the SAME
# session. The user-controlled login + worker read-only observation share it.
# ---------------------------------------------------------------------------
STEEL_UNIFIED_BRIDGE_SCRIPT = r"""
const [cdpUrl, quality, everyNth] = process.argv.slice(1);
const cdpBase = new URL(cdpUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:"));
function out(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }
const targets = await fetch(new URL("/json/list", cdpBase)).then((res) => { if (!res.ok) throw new Error(`cdp target list ${res.status}`); return res.json(); });
const pageTarget = targets.find((item) => item.type === "page" && item.id) ?? targets.find((item) => item.id);
if (!pageTarget?.id) throw new Error("no page target available");
const __ver = await fetch(new URL("/json/version", cdpBase)).then((res) => res.json());
let __sessionId = null;
const wsTarget = new URL(__ver.webSocketDebuggerUrl);
wsTarget.protocol = cdpUrl.startsWith("wss:") ? "wss:" : "ws:";
wsTarget.hostname = cdpBase.hostname;
wsTarget.port = cdpBase.port;
const socket = new WebSocket(wsTarget);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("cdp websocket open timeout")), 8000);
  socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("cdp websocket error")); }, { once: true });
});
let nextId = 1;
const pending = new Map();
let lastMeta = {};
let loadedFlag = false;
socket.addEventListener("message", (event) => {
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); return; }
  if (message.method === "Page.loadEventFired") { loadedFlag = true; restartScreencast(); }
  if (message.method === "Page.frameNavigated" && message.params && message.params.frame && !message.params.frame.parentId) restartScreencast();
  if (message.method === "Runtime.executionContextsCleared") restartScreencast();
  if (message.method === "Page.screencastFrame") {
    const params = message.params || {};
    const md = params.metadata || {};
    out({ t: "frame", data: params.data || "", metadata: { url: lastMeta.url, title: lastMeta.title, width: md.deviceWidth || lastMeta.width, height: md.deviceHeight || lastMeta.height } });
    if (params.sessionId !== undefined) { try { socket.send(JSON.stringify({ id: nextId++, sessionId: __sessionId, method: "Page.screencastFrameAck", params: { sessionId: params.sessionId } })); } catch {} }
  }
});
async function send(method, params = {}) {
  if (!__sessionId && method !== "Target.attachToTarget") {
    const __a = await send("Target.attachToTarget", { targetId: pageTarget.id, flatten: true });
    __sessionId = __a.sessionId;
    if (!__sessionId) throw new Error("flat attach returned no sessionId");
  }
  const id = nextId++;
  const __msg = { id, method, params };
  if (__sessionId) __msg.sessionId = __sessionId;
  socket.send(JSON.stringify(__msg));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 12000);
    pending.set(id, (message) => { clearTimeout(timer); if (message.error) reject(new Error(message.error.message || method)); else resolve(message.result || {}); });
  });
}
async function refreshMeta() {
  try { const m = await send("Runtime.evaluate", { expression: "({ url: location.href, title: document.title, width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) })", returnByValue: true }); if (m.result && m.result.value) lastMeta = m.result.value; } catch {}
}
let __restartPending = false;
async function restartScreencast() {
  // After a (post-login) navigation Chrome stops emitting screencast frames for the new
  // renderer -> the viewer goes white. Re-arm the screencast (and refresh size) on each
  // main-frame navigation so the live view follows the user into the authenticated pages.
  if (__restartPending) return;
  __restartPending = true;
  try {
    await new Promise((r) => setTimeout(r, 400));
    await refreshMeta();
    await send("Page.bringToFront");
    await send("Page.startScreencast", { format: "jpeg", quality: Number(quality || 55), maxWidth: 1600, maxHeight: 1000, everyNthFrame: Math.max(1, Number(everyNth || 1)) });
  } catch {} finally { __restartPending = false; }
}
async function waitForLoad(ms) {
  loadedFlag = false;
  const started = Date.now();
  await new Promise((resolve) => { const tick = () => (loadedFlag || Date.now() - started > ms) ? resolve() : setTimeout(tick, 150); tick(); });
}
const WF_LIB = `
window.__wfClassify=function(el){try{
  var tag=(el.tagName||'').toLowerCase();
  var type=((el.getAttribute&&el.getAttribute('type'))||'').toLowerCase();
  var txt=((el.innerText||el.value||(el.getAttribute&&el.getAttribute('aria-label'))||(el.getAttribute&&el.getAttribute('title'))||'')+'').trim().slice(0,160).toLowerCase();
  var meta=((((el.getAttribute&&el.getAttribute('name'))||'')+' '+(el.id||'')+' '+((el.getAttribute&&el.getAttribute('autocomplete'))||'')+' '+((el.getAttribute&&el.getAttribute('placeholder'))||''))).toLowerCase();
  if(tag==='input'&&type==='password')return{allow:false,reason:'password_field'};
  if(/pass|pwd|user.?name|user.?id|ssn|social.?security|\\botp\\b|2fa|mfa|verification|security.?code|card.?number|\\bcvv\\b|\\bcvc\\b|account.?number|routing/.test(meta))return{allow:false,reason:'sensitive_field'};
  if(tag==='input'&&['text','email','tel','number','search','date','password'].indexOf(type)>=0)return{allow:false,reason:'free_text_input_human_only'};
  if(tag==='textarea')return{allow:false,reason:'free_text_input_human_only'};
  var deny=/(sign\\s?in|log\\s?in|log\\s?out|sign\\s?out|\\bsubmit\\b|\\bpay\\b|payment|checkout|place\\s?order|transfer|withdraw|\\bcancel\\b|\\bdelete\\b|\\bremove\\b|\\bupdate\\b|\\bsave\\b|\\bsend\\b|file\\s?(a\\s?)?(claim|appeal|grievance)|enroll|unenroll|change\\s?pcp|authorize|\\bconfirm\\b|\\bagree\\b|\\baccept\\b|deactivate|close\\s?account|\\breset\\b|\\bbuy\\b|add\\s?to\\s?cart)/;
  if(deny.test(txt))return{allow:false,reason:'write_or_submit_label'};
  if(tag==='button'&&type==='submit')return{allow:false,reason:'submit_button'};
  if(tag==='input'&&['submit','image'].indexOf(type)>=0)return{allow:false,reason:'submit_input'};
  var form=el.closest&&el.closest('form');
  if(form){var hasPwd=!!form.querySelector('input[type=password]');var f=((((form.getAttribute&&form.getAttribute('action'))||'')+' '+(form.id||'')+' '+((form.getAttribute&&form.getAttribute('name'))||''))).toLowerCase();
    if((hasPwd||/login|sign-?in|auth|payment|\\bpay\\b|checkout|card/.test(f))&&(type==='submit'||tag==='button'))return{allow:false,reason:'auth_or_payment_form_control'};}
  if(tag==='a'){try{var u=new URL(el.href,location.href);if(u.host&&u.host!==location.host&&!/(^|\\.)aetna\\.com$/.test(u.host))return{allow:false,reason:'offsite_link'};}catch(e){}}
  return{allow:true,reason:null};
}catch(e){return{allow:false,reason:'classify_error'};}};
window.__wfEnum=function(){var sel='a[href],button,[role=button],[role=tab],[role=menuitem],[aria-expanded],summary,select,[role=link],.pagination a,.pagination button';
  var nodes=Array.prototype.slice.call(document.querySelectorAll(sel)).filter(function(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';});
  nodes.forEach(function(el,i){el.setAttribute('data-wf-ref',String(i));});return nodes;};
window.__wfExtract=function(){var nodes=window.__wfEnum();
  var controls=nodes.map(function(el,i){var c=window.__wfClassify(el);var label=((el.innerText||el.value||(el.getAttribute&&el.getAttribute('aria-label'))||'')+'').replace(/\\s+/g,' ').trim().slice(0,80);
    var kind=(el.tagName||'').toLowerCase()==='select'?'filter':((el.getAttribute&&el.getAttribute('role'))==='tab'?'tab':((el.getAttribute&&el.getAttribute('aria-expanded'))!=null?'expander':'control'));
    return{ref:i,tag:(el.tagName||'').toLowerCase(),kind:kind,label:label,allow:c.allow,denyReason:c.reason};});
  var headings=Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,[role=heading]')).slice(0,40).map(function(h){return (h.innerText||'').replace(/\\s+/g,' ').trim().slice(0,120);}).filter(Boolean);
  var tables=Array.prototype.slice.call(document.querySelectorAll('table')).slice(0,12).map(function(t){
    var headers=Array.prototype.slice.call(t.querySelectorAll('thead th, tr:first-child th')).map(function(th){return (th.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60);});
    var rows=Array.prototype.slice.call(t.querySelectorAll('tbody tr')).slice(0,40).map(function(tr){return Array.prototype.slice.call(tr.querySelectorAll('td,th')).map(function(td){return (td.innerText||'').replace(/\\s+/g,' ').trim().slice(0,90);});});
    return{headers:headers,rows:rows};}).filter(function(t){return t.rows.length;});
  var kv=[];Array.prototype.slice.call(document.querySelectorAll('dl')).slice(0,20).forEach(function(dl){var dts=dl.querySelectorAll('dt'),dds=dl.querySelectorAll('dd');for(var i=0;i<Math.min(dts.length,dds.length);i++){kv.push({label:(dts[i].innerText||'').replace(/\\s+/g,' ').trim().slice(0,80),value:(dds[i].innerText||'').replace(/\\s+/g,' ').trim().slice(0,140)});}});
  return{url:location.href,title:document.title,headings:headings,tables:tables,keyValues:kv.slice(0,60),text:(document.body?document.body.innerText:'').slice(0,40000),controls:controls};};
window.__wfInteract=function(ref,value){var el=document.querySelector('[data-wf-ref="'+ref+'"]');if(!el){window.__wfEnum();el=document.querySelector('[data-wf-ref="'+ref+'"]');}if(!el)return{acted:false,denied:'ref_not_found'};
  var c=window.__wfClassify(el);if(!c.allow)return{acted:false,denied:c.reason,label:((el.innerText||'')+'').replace(/\\s+/g,' ').trim().slice(0,80)};
  try{if((el.tagName||'').toLowerCase()==='select'&&value!=null){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return{acted:true,action:'set_filter',label:(el.name||el.id||'select'),value:value};}
    el.scrollIntoView({block:'center'});el.click();return{acted:true,action:'click',label:((el.innerText||(el.getAttribute&&el.getAttribute('aria-label'))||'')+'').replace(/\\s+/g,' ').trim().slice(0,80)};}catch(e){return{acted:false,denied:'click_error'};}};
`;
async function runOp(operation, payload) {
  payload = payload || {};
  if (operation === "capture") {
    const screenshot = await send("Page.captureScreenshot", { format: "jpeg", quality: Number(payload.quality || 62), fromSurface: true });
    const meta = await send("Runtime.evaluate", { expression: "({ url: location.href, title: document.title, width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) })", returnByValue: true });
    return { mime: "image/jpeg", data: screenshot.data || "", metadata: meta.result?.value || {} };
  } else if (operation === "navigate") {
    const url = new URL(String(payload.url || payload.navigateUrl || ""));
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported navigation protocol");
    await send("Page.navigate", { url: url.href });
    await waitForLoad(10000);
    await refreshMeta();
    return { navigated: true, currentUrl: lastMeta.url || null, currentTitle: lastMeta.title || null };
  } else if (operation === "observe") {
    if (payload.navigateUrl) { await send("Page.navigate", { url: String(payload.navigateUrl) }); await waitForLoad(9000); }
    const observed = await send("Runtime.evaluate", { expression: `(() => {
        const links = Array.from(document.querySelectorAll("a[href]")).slice(0, 120).map((link) => ({ text: (link.innerText || link.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim().slice(0, 160), href: link.href }));
        return { url: location.href, title: document.title, text: (document.body?.innerText || "").slice(0, 60000), links };
      })()`, returnByValue: true });
    return { observation: observed.result?.value || {} };
  } else if (operation === "input") {
    const input = payload.input || {};
    // Use the cached page size (refreshMeta updates it ~1s) instead of a Runtime.evaluate per
    // input — a fresh eval can hang on heavy authenticated pages and was failing input dispatch.
    const size = { width: Number(lastMeta.width || 1280), height: Number(lastMeta.height || 720) };
    if (input.kind === "mouse") {
      const x = Math.max(0, Math.min(1, Number(input.x || 0))) * Number(size.width || 1280);
      const y = Math.max(0, Math.min(1, Number(input.y || 0))) * Number(size.height || 720);
      await send("Input.dispatchMouseEvent", { type: input.type || "mousePressed", x, y, button: input.button || "left", clickCount: Number(input.clickCount || 1) });
    } else if (input.kind === "wheel") {
      const x = Math.max(0, Math.min(1, Number(input.x || 0))) * Number(size.width || 1280);
      const y = Math.max(0, Math.min(1, Number(input.y || 0))) * Number(size.height || 720);
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: Number(input.deltaX || 0), deltaY: Number(input.deltaY || 0), button: "none" });
    } else if (input.kind === "text") {
      await send("Input.insertText", { text: String(input.text || "") });
    } else if (input.kind === "key") {
      await send("Input.dispatchKeyEvent", { type: input.type || "keyDown", key: input.key || "Enter", code: input.code || input.key || "Enter", windowsVirtualKeyCode: Number(input.keyCode || 13), nativeVirtualKeyCode: Number(input.keyCode || 13) });
    } else if (input.kind === "navigate") {
      const url = new URL(String(input.url || ""));
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported navigation protocol");
      await send("Page.navigate", { url: url.href });
      await waitForLoad(9000);
    }
    return { inputAccepted: true };
  } else if (operation === "extract" || operation === "interact") {
    await send("Runtime.evaluate", { expression: WF_LIB });
    if (operation === "extract") {
      const r = await send("Runtime.evaluate", { expression: "window.__wfExtract()", returnByValue: true });
      return { extract: r.result?.value || {} };
    } else {
      const r = await send("Runtime.evaluate", { expression: "window.__wfInteract(" + JSON.stringify(Number(payload.ref)) + "," + JSON.stringify(payload.value ?? null) + ")", returnByValue: true });
      const res = r.result?.value || {};
      if (res.acted) { await new Promise((rr) => setTimeout(rr, Number(payload.settleMs || 1200))); const after = await send("Runtime.evaluate", { expression: "window.__wfExtract()", returnByValue: true }); res.extract = after.result?.value || {}; }
      return { interaction: res };
    }
  }
  throw new Error(`unsupported operation ${operation}`);
}
// Bring the page up + start the single screencast.
await send("Page.enable");
await send("Runtime.enable");
await send("Page.bringToFront");
await refreshMeta();
const metaTimer = setInterval(refreshMeta, 1000);
await send("Page.startScreencast", { format: "jpeg", quality: Number(quality || 55), maxWidth: 1600, maxHeight: 1000, everyNthFrame: Math.max(1, Number(everyNth || 1)) });
out({ t: "ready" });
// stdin request loop: one JSON object per line -> dispatch over the SAME flat session.
let __buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  __buf += chunk;
  let idx;
  while ((idx = __buf.indexOf("\n")) >= 0) {
    const line = __buf.slice(0, idx); __buf = __buf.slice(idx + 1);
    if (!line.trim()) continue;
    let req; try { req = JSON.parse(line); } catch { continue; }
    runOp(req.operation, req.payload || {}).then(
      (result) => out({ t: "response", rid: req.rid, ok: true, result }),
      (err) => out({ t: "response", rid: req.rid, ok: false, error: String((err && err.message) || err) })
    );
  }
});
process.on("SIGTERM", () => { try { clearInterval(metaTimer); socket.close(); } catch {} process.exit(0); });
await new Promise(() => {});
"""


class SteelUnifiedBridge:
    """One persistent node CDP subprocess per browser session. Holds a single flat
    session; fans screencast frames out to stream subscribers; serializes operation
    requests (input/navigate/observe/extract/interact/capture) over the same session."""

    def __init__(self, cdp_url: str, quality: str, every_nth: str) -> None:
        self.cdp_url = cdp_url
        self.quality = quality
        self.every_nth = every_nth
        self.process: "asyncio.subprocess.Process | None" = None
        self._frame_subs: "set[asyncio.Queue]" = set()
        self._pending: "dict[int, asyncio.Future]" = {}
        self._rid = 0
        self._stdin_lock = asyncio.Lock()
        self._start_lock = asyncio.Lock()
        self._reader_task: "asyncio.Task | None" = None
        self._ready = False

    def alive(self) -> bool:
        return bool(self.process is not None and self.process.returncode is None)

    async def start(self) -> None:
        async with self._start_lock:
            if self.alive():
                return
            self.process = await asyncio.create_subprocess_exec(
                "node", "--input-type=module", "-e", STEEL_UNIFIED_BRIDGE_SCRIPT,
                self.cdp_url, str(self.quality), str(self.every_nth),
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
                limit=16 * 1024 * 1024,
            )
            self._ready = False
            self._reader_task = asyncio.create_task(self._read_stdout())
            # Wait briefly for the {"t":"ready"} marker (screencast started + flat attached).
            for _ in range(60):
                if self._ready or not self.alive():
                    break
                await asyncio.sleep(0.1)
            if not self.alive():
                err = b""
                try:
                    err = await asyncio.wait_for(self.process.stderr.read(), timeout=1) if self.process else b""
                except Exception:
                    err = b""
                raise BrowserSandboxError(f"Steel unified CDP bridge failed to start: {_node_error_detail(err, b'')}")

    async def _read_stdout(self) -> None:
        proc = self.process
        if proc is None or proc.stdout is None:
            return
        try:
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line)
                except Exception:
                    continue
                t = msg.get("t")
                if t == "frame":
                    for q in list(self._frame_subs):
                        try:
                            q.put_nowait(msg)
                        except asyncio.QueueFull:
                            try:
                                q.get_nowait()
                                q.put_nowait(msg)
                            except Exception:
                                pass
                elif t == "response":
                    fut = self._pending.pop(msg.get("rid"), None)
                    if fut is not None and not fut.done():
                        fut.set_result(msg)
                elif t == "ready":
                    self._ready = True
        except Exception:
            pass
        finally:
            # Fail any in-flight requests so callers don't hang.
            for fut in list(self._pending.values()):
                if not fut.done():
                    fut.set_exception(BrowserSandboxError("Steel unified CDP bridge closed"))
            self._pending.clear()

    async def request(self, operation: str, payload: "dict[str, Any] | None" = None, timeout: float = 20.0) -> "dict[str, Any]":
        await self.start()
        self._rid += 1
        rid = self._rid
        fut: "asyncio.Future" = asyncio.get_event_loop().create_future()
        self._pending[rid] = fut
        line = json.dumps({"rid": rid, "operation": operation, "payload": payload or {}}, separators=(",", ":")) + "\n"
        async with self._stdin_lock:
            if self.process is None or self.process.stdin is None:
                raise BrowserSandboxError("Steel unified CDP bridge has no stdin")
            self.process.stdin.write(line.encode("utf-8"))
            await self.process.stdin.drain()
        try:
            msg = await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError as exc:
            self._pending.pop(rid, None)
            raise BrowserSandboxError(f"Steel self-host CDP {operation} timed out") from exc
        if not msg.get("ok"):
            raise BrowserSandboxError(f"Steel self-host CDP {operation} failed: {msg.get('error', 'unknown error')}")
        return msg.get("result") or {}

    async def frames(self) -> AsyncIterator["dict[str, Any]"]:
        await self.start()
        q: "asyncio.Queue" = asyncio.Queue(maxsize=4)
        self._frame_subs.add(q)
        try:
            while self.alive():
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=20)
                except asyncio.TimeoutError:
                    if not self.alive():
                        break
                    continue
                yield msg
        finally:
            self._frame_subs.discard(q)

    async def stop(self) -> None:
        proc = self.process
        if proc is not None:
            try:
                proc.terminate()
                await asyncio.wait_for(proc.wait(), timeout=3)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        if self._reader_task is not None:
            self._reader_task.cancel()


# Registry of live bridges keyed by browser_session_id (survives across /stream,
# /input, /takeover, observe calls; one Steel page client total).
_UNIFIED_BRIDGES: "dict[str, SteelUnifiedBridge]" = {}


async def get_unified_bridge(browser_session_id: str) -> SteelUnifiedBridge:
    cdp_url = os.environ.get("WEFELLA_BROWSER_SANDBOX_CDP_URL")
    if not cdp_url:
        raise BrowserSandboxError("Steel self-host CDP tunnel URL is not configured.")
    bridge = _UNIFIED_BRIDGES.get(browser_session_id)
    if bridge is None or not bridge.alive():
        # This Steel self-host has a single page client slot, so only one bridge may hold it.
        # Stop any other live bridges before starting this one (avoids the competing-session hang).
        for other_id, other in list(_UNIFIED_BRIDGES.items()):
            if other_id != browser_session_id and other.alive():
                try:
                    await other.stop()
                except Exception:
                    pass
                _UNIFIED_BRIDGES.pop(other_id, None)
        bridge = SteelUnifiedBridge(
            cdp_url,
            os.environ.get("WEFELLA_BROWSER_SANDBOX_SCREENCAST_QUALITY", "55"),
            os.environ.get("WEFELLA_BROWSER_SANDBOX_SCREENCAST_EVERY_NTH_FRAME", "1"),
        )
        _UNIFIED_BRIDGES[browser_session_id] = bridge
        await bridge.start()
    return bridge


async def stop_unified_bridge(browser_session_id: str) -> None:
    bridge = _UNIFIED_BRIDGES.pop(browser_session_id, None)
    if bridge is not None:
        await bridge.stop()


class BrowserSandboxProvider:
    provider_key = "abstract"

    async def create_session(
        self,
        *,
        node_client: Any,
        user_id: str,
        session_id: str,
        target_url: str | None = None,
        options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def request_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        reason: str | None = None
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def grant_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        approved_by: str | None = None
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def end_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str
    ) -> dict[str, Any]:
        raise NotImplementedError

    async def send_input(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        grant_token: str,
        input_payload: dict[str, Any]
    ) -> dict[str, Any]:
        raise NotImplementedError


class LocalCdpBrowserSandboxProvider(BrowserSandboxProvider):
    provider_key = "local_cdp"

    async def create_session(
        self,
        *,
        node_client: Any,
        user_id: str,
        session_id: str,
        target_url: str | None = None,
        options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        screencast = await node_client.post_json(
            "/api/runtime/browser/screencast/start",
            {
                "sessionId": session_id,
                "userId": user_id,
                "targetUrl": target_url,
                "options": options or {}
            }
        )
        screencast_probe = await node_client.get_json(
            "/api/runtime/browser/screencast/status",
            params={"sessionId": session_id, "userId": user_id}
        )
        readiness = await node_client.get_json("/api/openclaw/official/status")
        current_tab = readiness.get("tabs", {}).get("currentTab") if isinstance(readiness.get("tabs"), dict) else None
        live = readiness.get("liveReadiness") if isinstance(readiness.get("liveReadiness"), dict) else {}
        return {
            "browser_session_id": f"browser_{uuid4()}",
            "contract_version": SANDBOX_CONTRACT_VERSION,
            "provider": self.provider_key,
            "session_id": session_id,
            "user_id": user_id,
            "target_url": target_url,
            "created_at": now_iso(),
            "takeover_state": "not_requested",
            "readiness": {
                "status": live.get("status") or readiness.get("status") or "unknown",
                "ready": bool(readiness.get("ready")),
                "userActionRequired": live.get("userActionRequired"),
                "nextAction": live.get("nextAction"),
                "safetyBoundary": live.get("safetyBoundary", "read_only_approval_required")
            },
            "current_url": current_tab.get("url") if isinstance(current_tab, dict) else None,
            "current_title": current_tab.get("title") if isinstance(current_tab, dict) else None,
            "ocr_caption": {
                "status": "visual_frame_available" if screencast_probe.get("hasFrame") else "pending_visual_frame",
                "requiredForEvidence": True,
                "rawOcrTextReturned": False,
                "frameSource": screencast_probe.get("frameSource"),
                "lastFrameAt": screencast_probe.get("lastFrameAt")
            },
            "screencast": {**screencast, "status_probe": screencast_probe}
        }

    async def request_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        reason: str | None = None
    ) -> dict[str, Any]:
        return await node_client.post_json(
            "/api/runtime/browser/takeover/request",
            {
                "sessionId": browser_session["session_id"],
                "userId": browser_session["user_id"],
                "reason": reason or "user_password_or_captcha"
            }
        )

    async def grant_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        approved_by: str | None = None
    ) -> dict[str, Any]:
        return await node_client.post_json(
            "/api/runtime/browser/takeover/grant",
            {
                "takeoverId": takeover_id,
                "sessionId": browser_session["session_id"],
                "userId": browser_session["user_id"],
                "approvedBy": approved_by or "user"
            }
        )

    async def end_takeover(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str
    ) -> dict[str, Any]:
        return await node_client.post_json(
            "/api/runtime/browser/takeover/end",
            {
                "takeoverId": takeover_id,
                "sessionId": browser_session["session_id"],
                "userId": browser_session["user_id"]
            }
        )

    async def send_input(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        grant_token: str,
        input_payload: dict[str, Any]
    ) -> dict[str, Any]:
        return await node_client.post_json(
            "/api/runtime/browser/takeover/input",
            {
                "takeoverId": takeover_id,
                "grantToken": grant_token,
                "sessionId": browser_session["session_id"],
                "userId": browser_session["user_id"],
                "input": input_payload
            }
        )


class HostedRemoteBrowserSandboxProvider(BrowserSandboxProvider):
    provider_key = "hosted_remote"

    def __init__(self, *, config_path: str | None = None, ready: bool | None = None):
        self.config_path = config_path or os.environ.get(
            "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE",
            DEFAULT_PROVIDER_CONFIG_PATH
        )
        self.ready = bool(ready if ready is not None else os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_READY") == "1")

    def describe(self) -> dict[str, Any]:
        return describe_browser_sandbox_provider_contract(config_path=self.config_path, ready=self.ready)

    def _require_harness(self) -> dict[str, Any]:
        contract = self.describe()
        if not contract.get("adapterHarnessReady"):
            raise BrowserSandboxError("Hosted browser sandbox adapter harness is not enabled for this session.")
        return contract

    def _load_private_config(self) -> dict[str, Any]:
        with open(self.config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
        if not isinstance(config, dict):
            raise BrowserSandboxError("Hosted browser sandbox provider config is not a JSON object.")
        return config

    def _can_create_read_only_live_session(self, contract: dict[str, Any]) -> bool:
        resolver = contract.get("hostedProviderResolver", {}) if isinstance(contract.get("hostedProviderResolver"), dict) else {}
        return bool(
            resolver.get("status") == "hosted_browser_sandbox_provider_ready"
            and resolver.get("resolverReady") is True
            and resolver.get("endpointResolved") is True
            and resolver.get("authResolved") is True
            and resolver.get("liveVerified") is True
            and resolver.get("liveVerificationReady") is True
            and resolver.get("webrtcSignalingReady") is True
            and resolver.get("providerLiveConnected") is True
            and contract.get("hostedProviderSteelRemoteHostReady") is True
            and contract.get("approvalPolicy", {}).get("agentCredentialEntryAllowed") is not True
            and contract.get("approvalPolicy", {}).get("externalWriteActionsAllowed") is not True
        )

    def _endpoint_and_token(self, config: dict[str, Any]) -> tuple[str, str]:
        endpoint_env = _env_name_from_ref(config.get("endpointRef"))
        token_env = _env_name_from_ref(config.get("auth", {}).get("tokenRef", DEFAULT_HOSTED_AUTH_TOKEN_REF))
        endpoint = os.environ.get(endpoint_env or "")
        token = os.environ.get(token_env or "")
        if not endpoint or not _is_https_endpoint(endpoint):
            raise BrowserSandboxError("Hosted browser sandbox provider endpoint is not resolved to an HTTPS URL.")
        if not token:
            raise BrowserSandboxError("Hosted browser sandbox provider auth token is not resolved.")
        return endpoint.rstrip("/") + "/", token

    def _provider_strategy(self) -> str:
        return os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_NAME", "generic-hosted-provider")

    async def _provider_json(self, *, path: str, method: str = "POST", body: dict[str, Any] | None = None) -> dict[str, Any]:
        config = self._load_private_config()
        endpoint, token = self._endpoint_and_token(config)
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.request(
                method,
                str(httpx.URL(endpoint).join(path.lstrip("/"))),
                headers={
                    "content-type": "application/json",
                    "authorization": f"Bearer {token}",
                    "x-brainstyworkers-contract-version": HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION
                },
                json=body if method != "GET" else None
            )
        try:
            payload = response.json()
        except Exception as exc:
            raise BrowserSandboxError(f"Hosted browser sandbox provider returned invalid JSON: {exc}") from exc
        return {"status_code": response.status_code, "payload": payload}

    async def _steel_api_json(self, *, path: str, method: str = "POST", body: dict[str, Any] | None = None) -> dict[str, Any]:
        """Dev-direct Steel API caller: hits a local/tunneled Steel API (http allowed, token
        optional) without the production private-config + HTTPS + token requirement."""
        base = os.environ.get("WEFELLA_BROWSER_SANDBOX_STEEL_API_URL", "").rstrip("/")
        if not base:
            raise BrowserSandboxError("Steel self-host API URL (WEFELLA_BROWSER_SANDBOX_STEEL_API_URL) is not configured.")
        token = os.environ.get("WEFELLA_BROWSER_SANDBOX_API_TOKEN")
        headers = {"content-type": "application/json"}
        if token:
            headers["authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.request(
                method,
                f"{base}/{path.lstrip('/')}",
                headers=headers,
                json=body if method != "GET" else None
            )
        try:
            payload = response.json()
        except Exception as exc:
            raise BrowserSandboxError(f"Steel self-host API returned invalid JSON: {exc}") from exc
        return {"status_code": response.status_code, "payload": payload}

    def _steel_api_caller(self):
        if (
            os.environ.get("WEFELLA_BROWSER_SANDBOX_STEEL_DEV_DIRECT") == "1"
            and os.environ.get("WEFELLA_BROWSER_SANDBOX_STEEL_API_URL")
        ):
            return self._steel_api_json
        return self._provider_json

    def _assert_live_create_response(self, payload: dict[str, Any]) -> None:
        serialized = json.dumps(payload, separators=(",", ":"))
        failures: list[str] = []
        if payload.get("contractVersion") != HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION:
            failures.append("contract_version_mismatch")
        if not payload.get("providerSessionRef"):
            failures.append("provider_session_ref_required")
        if payload.get("providerLiveConnected") is not True:
            failures.append("provider_live_connected_required")
        if payload.get("stream", {}).get("rawFrameReturned") is True:
            failures.append("raw_frame_returned")
        if payload.get("stream", {}).get("transport") in {"webrtc", "webrtc_or_sse_frames"}:
            signaling = payload.get("webrtcSignaling", {})
            if signaling and signaling.get("rawSdpReturned") is True:
                failures.append("raw_sdp_returned")
            if signaling and signaling.get("rawIceCandidateReturned") is True:
                failures.append("raw_ice_candidate_returned")
        if payload.get("ocrCaption", {}).get("rawOcrTextReturned") is True:
            failures.append("raw_ocr_text_returned")
        if payload.get("takeover", {}).get("inputRelay") != "approval_gated_human_only":
            failures.append("input_relay_not_human_only")
        if payload.get("safety", {}).get("agentCredentialEntryAllowed") is True:
            failures.append("agent_credential_entry_allowed")
        if payload.get("safety", {}).get("externalWriteActionsWithoutApproval") is True:
            failures.append("external_write_actions_without_approval")
        if any(marker in serialized.lower() for marker in ["data:image", "<html", "member id", "subscriber id", "password", "captcha"]):
            failures.append("raw_frame_or_ocr_or_secret_content_returned")
        if failures:
            raise BrowserSandboxError(f"Hosted browser sandbox provider live response failed contract: {', '.join(failures)}")

    def _steel_viewer_url(self, provider_session_ref: str, payload: dict[str, Any]) -> str | None:
        template = os.environ.get("WEFELLA_BROWSER_SANDBOX_VIEWER_URL")
        return (
            (template.replace("{id}", provider_session_ref) if template else None)
            or payload.get("sessionViewerUrl")
            or payload.get("viewerUrl")
        )

    def _is_allowed_steel_target_url(self, target_url: str) -> bool:
        try:
            parsed = httpx.URL(target_url)
        except Exception:
            return False
        host = (parsed.host or "").lower()
        return bool(
            parsed.scheme == "https"
            and (
                host == "example.com"
                or _is_allowed_member_portal_host(host)
            )
        )

    async def _navigate_steel_self_host_session(self, *, target_url: str) -> dict[str, Any]:
        if not self._is_allowed_steel_target_url(target_url):
            raise BrowserSandboxError("Steel self-host target URL is outside the approved read-only portal allowlist.")
        cdp_url = os.environ.get("WEFELLA_BROWSER_SANDBOX_CDP_URL")
        if not cdp_url:
            raise BrowserSandboxError("Steel self-host CDP tunnel URL is not configured.")
        script = r"""
const [cdpUrl, targetUrl] = process.argv.slice(1);
const cdpBase = new URL(cdpUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:"));
const listUrl = new URL("/json/list", cdpBase);
const targets = await fetch(listUrl).then((res) => {
  if (!res.ok) throw new Error(`cdp target list ${res.status}`);
  return res.json();
});
const pageTarget = targets.find((item) => item.type === "page" && item.id) ?? targets.find((item) => item.id);
if (!pageTarget?.id) throw new Error("no page target available");
const __ver = await fetch(new URL("/json/version", cdpBase)).then((res) => res.json());
let __sessionId = null;
const wsTarget = new URL(__ver.webSocketDebuggerUrl);
wsTarget.protocol = cdpUrl.startsWith("wss:") ? "wss:" : "ws:";
wsTarget.hostname = cdpBase.hostname;
wsTarget.port = cdpBase.port;
const socket = new WebSocket(wsTarget);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("cdp websocket open timeout")), 8000);
  socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("cdp websocket error")); }, { once: true });
});
let nextId = 1;
const pending = new Map();
let loaded = false;
socket.addEventListener("message", (event) => {
  const payload = JSON.parse(event.data);
  if (payload.method === "Page.loadEventFired") loaded = true;
  if (payload.id && pending.has(payload.id)) {
    pending.get(payload.id)(payload);
    pending.delete(payload.id);
  }
});
async function send(method, params = {}) {
  if (!__sessionId && method !== "Target.attachToTarget") {
    const __a = await send("Target.attachToTarget", { targetId: pageTarget.id, flatten: true });
    __sessionId = __a.sessionId;
    if (!__sessionId) throw new Error("flat attach returned no sessionId");
  }
  const id = nextId++;
  const __msg = { id, method, params };
  if (__sessionId) __msg.sessionId = __sessionId;
  socket.send(JSON.stringify(__msg));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timeout`));
    }, 12000);
    pending.set(id, (payload) => {
      clearTimeout(timer);
      if (payload.error) reject(new Error(payload.error.message || method));
      else resolve(payload.result || {});
    });
  });
}
await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: targetUrl });
await Promise.race([
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => loaded || Date.now() - started > 10000 ? resolve() : setTimeout(tick, 150);
    tick();
  }),
  new Promise((resolve) => setTimeout(resolve, 11000))
]);
const current = await send("Runtime.evaluate", {
  expression: "({ url: location.href, title: document.title })",
  returnByValue: true
});
socket.close();
console.log(JSON.stringify({
  ok: true,
  currentUrl: current.result?.value?.url || null,
  currentTitle: current.result?.value?.title || null
}));
"""
        process = await asyncio.create_subprocess_exec(
            "node",
            "--input-type=module",
            "-e",
            script,
            cdp_url,
            target_url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)
        if process.returncode != 0:
            raise BrowserSandboxError(f"Steel self-host CDP navigation failed: {_node_error_detail(stderr, stdout)}")
        try:
            payload = json.loads(stdout.decode("utf-8"))
        except Exception as exc:
            raise BrowserSandboxError(f"Steel self-host CDP navigation returned invalid JSON: {exc}") from exc
        return payload

    async def _steel_cdp_bridge(self, *, operation: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        cdp_url = os.environ.get("WEFELLA_BROWSER_SANDBOX_CDP_URL")
        if not cdp_url:
            raise BrowserSandboxError("Steel self-host CDP tunnel URL is not configured.")
        script = r"""
const [cdpUrl, operation, payloadJson] = process.argv.slice(1);
const payload = JSON.parse(payloadJson || "{}");
const cdpBase = new URL(cdpUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:"));
const listUrl = new URL("/json/list", cdpBase);
const targets = await fetch(listUrl).then((res) => {
  if (!res.ok) throw new Error(`cdp target list ${res.status}`);
  return res.json();
});
const pageTarget = targets.find((item) => item.type === "page" && item.id) ?? targets.find((item) => item.id);
if (!pageTarget?.id) throw new Error("no page target available");
const __ver = await fetch(new URL("/json/version", cdpBase)).then((res) => res.json());
let __sessionId = null;
const wsTarget = new URL(__ver.webSocketDebuggerUrl);
wsTarget.protocol = cdpUrl.startsWith("wss:") ? "wss:" : "ws:";
wsTarget.hostname = cdpBase.hostname;
wsTarget.port = cdpBase.port;
const socket = new WebSocket(wsTarget);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("cdp websocket open timeout")), 8000);
  socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("cdp websocket error")); }, { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
async function send(method, params = {}) {
  if (!__sessionId && method !== "Target.attachToTarget") {
    const __a = await send("Target.attachToTarget", { targetId: pageTarget.id, flatten: true });
    __sessionId = __a.sessionId;
    if (!__sessionId) throw new Error("flat attach returned no sessionId");
  }
  const id = nextId++;
  const __msg = { id, method, params };
  if (__sessionId) __msg.sessionId = __sessionId;
  socket.send(JSON.stringify(__msg));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timeout`));
    }, 10000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message || method));
      else resolve(message.result || {});
    });
  });
}
try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.bringToFront");
  if (operation === "capture") {
    const screenshot = await send("Page.captureScreenshot", {
      format: "jpeg",
      quality: Number(payload.quality || 62),
      fromSurface: true
    });
    const meta = await send("Runtime.evaluate", {
      expression: "({ url: location.href, title: document.title, width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) })",
      returnByValue: true
    });
    console.log(JSON.stringify({
      ok: true,
      mime: "image/jpeg",
      data: screenshot.data || "",
      metadata: meta.result?.value || {}
    }));
  } else if (operation === "observe") {
    if (payload.navigateUrl) {
      let loaded = false;
      const onMessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.method === "Page.loadEventFired") loaded = true;
        } catch {}
      };
      socket.addEventListener("message", onMessage);
      await send("Page.navigate", { url: String(payload.navigateUrl) });
      await Promise.race([
        new Promise((resolve) => {
          const started = Date.now();
          const tick = () => loaded || Date.now() - started > 9000 ? resolve() : setTimeout(tick, 150);
          tick();
        }),
        new Promise((resolve) => setTimeout(resolve, 10000))
      ]);
      socket.removeEventListener("message", onMessage);
    }
    const observed = await send("Runtime.evaluate", {
      expression: `(() => {
        const links = Array.from(document.querySelectorAll("a[href]")).slice(0, 120).map((link) => ({
          text: (link.innerText || link.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim().slice(0, 160),
          href: link.href
        }));
        return {
          url: location.href,
          title: document.title,
          text: (document.body?.innerText || "").slice(0, 60000),
          links
        };
      })()`,
      returnByValue: true
    });
    console.log(JSON.stringify({ ok: true, observation: observed.result?.value || {} }));
  } else if (operation === "input") {
    const input = payload.input || {};
    const viewport = await send("Runtime.evaluate", {
      expression: "({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) })",
      returnByValue: true
    });
    const size = viewport.result?.value || { width: 1280, height: 720 };
    if (input.kind === "mouse") {
      const x = Math.max(0, Math.min(1, Number(input.x || 0))) * Number(size.width || 1280);
      const y = Math.max(0, Math.min(1, Number(input.y || 0))) * Number(size.height || 720);
      await send("Input.dispatchMouseEvent", {
        type: input.type || "mousePressed",
        x,
        y,
        button: input.button || "left",
        clickCount: Number(input.clickCount || 1)
      });
    } else if (input.kind === "wheel") {
      const x = Math.max(0, Math.min(1, Number(input.x || 0))) * Number(size.width || 1280);
      const y = Math.max(0, Math.min(1, Number(input.y || 0))) * Number(size.height || 720);
      await send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x,
        y,
        deltaX: Number(input.deltaX || 0),
        deltaY: Number(input.deltaY || 0),
        button: "none"
      });
    } else if (input.kind === "text") {
      await send("Input.insertText", { text: String(input.text || "") });
    } else if (input.kind === "key") {
      await send("Input.dispatchKeyEvent", {
        type: input.type || "keyDown",
        key: input.key || "Enter",
        code: input.code || input.key || "Enter",
        windowsVirtualKeyCode: Number(input.keyCode || 13),
        nativeVirtualKeyCode: Number(input.keyCode || 13)
      });
    } else if (input.kind === "navigate") {
      const url = new URL(String(input.url || ""));
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported navigation protocol");
      let loaded = false;
      const onMessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.method === "Page.loadEventFired") loaded = true;
        } catch {}
      };
      socket.addEventListener("message", onMessage);
      await send("Page.navigate", { url: url.href });
      await Promise.race([
        new Promise((resolve) => {
          const started = Date.now();
          const tick = () => loaded || Date.now() - started > 9000 ? resolve() : setTimeout(tick, 150);
          tick();
        }),
        new Promise((resolve) => setTimeout(resolve, 10000))
      ]);
      socket.removeEventListener("message", onMessage);
    }
    console.log(JSON.stringify({ ok: true, inputAccepted: true }));
  } else if (operation === "extract" || operation === "interact") {
    const WF_LIB = `
window.__wfClassify=function(el){try{
  var tag=(el.tagName||'').toLowerCase();
  var type=((el.getAttribute&&el.getAttribute('type'))||'').toLowerCase();
  var txt=((el.innerText||el.value||(el.getAttribute&&el.getAttribute('aria-label'))||(el.getAttribute&&el.getAttribute('title'))||'')+'').trim().slice(0,160).toLowerCase();
  var meta=((((el.getAttribute&&el.getAttribute('name'))||'')+' '+(el.id||'')+' '+((el.getAttribute&&el.getAttribute('autocomplete'))||'')+' '+((el.getAttribute&&el.getAttribute('placeholder'))||''))).toLowerCase();
  if(tag==='input'&&type==='password')return{allow:false,reason:'password_field'};
  if(/pass|pwd|user.?name|user.?id|ssn|social.?security|\\botp\\b|2fa|mfa|verification|security.?code|card.?number|\\bcvv\\b|\\bcvc\\b|account.?number|routing/.test(meta))return{allow:false,reason:'sensitive_field'};
  if(tag==='input'&&['text','email','tel','number','search','date','password'].indexOf(type)>=0)return{allow:false,reason:'free_text_input_human_only'};
  if(tag==='textarea')return{allow:false,reason:'free_text_input_human_only'};
  var deny=/(sign\\s?in|log\\s?in|log\\s?out|sign\\s?out|\\bsubmit\\b|\\bpay\\b|payment|checkout|place\\s?order|transfer|withdraw|\\bcancel\\b|\\bdelete\\b|\\bremove\\b|\\bupdate\\b|\\bsave\\b|\\bsend\\b|file\\s?(a\\s?)?(claim|appeal|grievance)|enroll|unenroll|change\\s?pcp|authorize|\\bconfirm\\b|\\bagree\\b|\\baccept\\b|deactivate|close\\s?account|\\breset\\b|\\bbuy\\b|add\\s?to\\s?cart)/;
  if(deny.test(txt))return{allow:false,reason:'write_or_submit_label'};
  if(tag==='button'&&type==='submit')return{allow:false,reason:'submit_button'};
  if(tag==='input'&&['submit','image'].indexOf(type)>=0)return{allow:false,reason:'submit_input'};
  var form=el.closest&&el.closest('form');
  if(form){var hasPwd=!!form.querySelector('input[type=password]');var f=((((form.getAttribute&&form.getAttribute('action'))||'')+' '+(form.id||'')+' '+((form.getAttribute&&form.getAttribute('name'))||''))).toLowerCase();
    if((hasPwd||/login|sign-?in|auth|payment|\\bpay\\b|checkout|card/.test(f))&&(type==='submit'||tag==='button'))return{allow:false,reason:'auth_or_payment_form_control'};}
  if(tag==='a'){try{var u=new URL(el.href,location.href);if(u.host&&u.host!==location.host&&!/(^|\\.)aetna\\.com$/.test(u.host))return{allow:false,reason:'offsite_link'};}catch(e){}}
  return{allow:true,reason:null};
}catch(e){return{allow:false,reason:'classify_error'};}};
window.__wfEnum=function(){var sel='a[href],button,[role=button],[role=tab],[role=menuitem],[aria-expanded],summary,select,[role=link],.pagination a,.pagination button';
  var nodes=Array.prototype.slice.call(document.querySelectorAll(sel)).filter(function(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';});
  nodes.forEach(function(el,i){el.setAttribute('data-wf-ref',String(i));});return nodes;};
window.__wfExtract=function(){var nodes=window.__wfEnum();
  var controls=nodes.map(function(el,i){var c=window.__wfClassify(el);var label=((el.innerText||el.value||(el.getAttribute&&el.getAttribute('aria-label'))||'')+'').replace(/\\s+/g,' ').trim().slice(0,80);
    var kind=(el.tagName||'').toLowerCase()==='select'?'filter':((el.getAttribute&&el.getAttribute('role'))==='tab'?'tab':((el.getAttribute&&el.getAttribute('aria-expanded'))!=null?'expander':'control'));
    return{ref:i,tag:(el.tagName||'').toLowerCase(),kind:kind,label:label,allow:c.allow,denyReason:c.reason};});
  var headings=Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,[role=heading]')).slice(0,40).map(function(h){return (h.innerText||'').replace(/\\s+/g,' ').trim().slice(0,120);}).filter(Boolean);
  var tables=Array.prototype.slice.call(document.querySelectorAll('table')).slice(0,12).map(function(t){
    var headers=Array.prototype.slice.call(t.querySelectorAll('thead th, tr:first-child th')).map(function(th){return (th.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60);});
    var rows=Array.prototype.slice.call(t.querySelectorAll('tbody tr')).slice(0,40).map(function(tr){return Array.prototype.slice.call(tr.querySelectorAll('td,th')).map(function(td){return (td.innerText||'').replace(/\\s+/g,' ').trim().slice(0,90);});});
    return{headers:headers,rows:rows};}).filter(function(t){return t.rows.length;});
  var kv=[];Array.prototype.slice.call(document.querySelectorAll('dl')).slice(0,20).forEach(function(dl){var dts=dl.querySelectorAll('dt'),dds=dl.querySelectorAll('dd');for(var i=0;i<Math.min(dts.length,dds.length);i++){kv.push({label:(dts[i].innerText||'').replace(/\\s+/g,' ').trim().slice(0,80),value:(dds[i].innerText||'').replace(/\\s+/g,' ').trim().slice(0,140)});}});
  return{url:location.href,title:document.title,headings:headings,tables:tables,keyValues:kv.slice(0,60),text:(document.body?document.body.innerText:'').slice(0,40000),controls:controls};};
window.__wfInteract=function(ref,value){var el=document.querySelector('[data-wf-ref="'+ref+'"]');if(!el){window.__wfEnum();el=document.querySelector('[data-wf-ref="'+ref+'"]');}if(!el)return{acted:false,denied:'ref_not_found'};
  var c=window.__wfClassify(el);if(!c.allow)return{acted:false,denied:c.reason,label:((el.innerText||'')+'').replace(/\\s+/g,' ').trim().slice(0,80)};
  try{if((el.tagName||'').toLowerCase()==='select'&&value!=null){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return{acted:true,action:'set_filter',label:(el.name||el.id||'select'),value:value};}
    el.scrollIntoView({block:'center'});el.click();return{acted:true,action:'click',label:((el.innerText||(el.getAttribute&&el.getAttribute('aria-label'))||'')+'').replace(/\\s+/g,' ').trim().slice(0,80)};}catch(e){return{acted:false,denied:'click_error'};}};
`;
    await send("Runtime.evaluate", { expression: WF_LIB });
    if (operation === "extract") {
      const r = await send("Runtime.evaluate", { expression: "window.__wfExtract()", returnByValue: true });
      console.log(JSON.stringify({ ok: true, extract: r.result?.value || {} }));
    } else {
      const r = await send("Runtime.evaluate", { expression: "window.__wfInteract(" + JSON.stringify(Number(payload.ref)) + "," + JSON.stringify(payload.value ?? null) + ")", returnByValue: true });
      const res = r.result?.value || {};
      if (res.acted) {
        await new Promise((rr) => setTimeout(rr, Number(payload.settleMs || 1200)));
        const after = await send("Runtime.evaluate", { expression: "window.__wfExtract()", returnByValue: true });
        res.extract = after.result?.value || {};
      }
      console.log(JSON.stringify({ ok: true, interaction: res }));
    }
  } else {
    throw new Error(`unsupported operation ${operation}`);
  }
} finally {
  try { socket.close(); } catch {}
}
"""
        process = await asyncio.create_subprocess_exec(
            "node",
            "--input-type=module",
            "-e",
            script,
            cdp_url,
            operation,
            json.dumps(payload or {}, separators=(",", ":")),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=18)
        if process.returncode != 0:
            raise BrowserSandboxError(f"Steel self-host CDP {operation} failed: {_node_error_detail(stderr, stdout)}")
        try:
            parsed = json.loads(stdout.decode("utf-8"))
        except Exception as exc:
            raise BrowserSandboxError(f"Steel self-host CDP {operation} returned invalid JSON: {exc}") from exc
        return parsed

    async def _capture_steel_self_host_frame(self) -> dict[str, Any]:
        return await self._steel_cdp_bridge(operation="capture", payload={"quality": 62})

    async def _start_steel_self_host_screencast(self) -> "asyncio.subprocess.Process":
        """Persistent CDP bridge: connect once and stream Page.screencastFrame events
        (10-30 fps) to stdout as newline-delimited JSON, instead of spawning a subprocess
        and capturing a single screenshot per second. The process runs until terminated."""
        cdp_url = os.environ.get("WEFELLA_BROWSER_SANDBOX_CDP_URL")
        if not cdp_url:
            raise BrowserSandboxError("Steel self-host CDP tunnel URL is not configured.")
        quality = os.environ.get("WEFELLA_BROWSER_SANDBOX_SCREENCAST_QUALITY", "55")
        every_nth = os.environ.get("WEFELLA_BROWSER_SANDBOX_SCREENCAST_EVERY_NTH_FRAME", "1")
        script = r"""
const [cdpUrl, quality, everyNth] = process.argv.slice(1);
const cdpBase = new URL(cdpUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:"));
const targets = await fetch(new URL("/json/list", cdpBase)).then((res) => {
  if (!res.ok) throw new Error(`cdp target list ${res.status}`);
  return res.json();
});
const pageTarget = targets.find((item) => item.type === "page" && item.id) ?? targets.find((item) => item.id);
if (!pageTarget?.id) throw new Error("no page target available");
const __ver = await fetch(new URL("/json/version", cdpBase)).then((res) => res.json());
let __sessionId = null;
const wsTarget = new URL(__ver.webSocketDebuggerUrl);
wsTarget.protocol = cdpUrl.startsWith("wss:") ? "wss:" : "ws:";
wsTarget.hostname = cdpBase.hostname;
wsTarget.port = cdpBase.port;
const socket = new WebSocket(wsTarget);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("cdp websocket open timeout")), 8000);
  socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
  socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("cdp websocket error")); }, { once: true });
});
let nextId = 1;
const pending = new Map();
let lastMeta = {};
socket.addEventListener("message", (event) => {
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === "Page.screencastFrame") {
    const params = message.params || {};
    const md = params.metadata || {};
    process.stdout.write(JSON.stringify({
      data: params.data || "",
      metadata: {
        url: lastMeta.url,
        title: lastMeta.title,
        width: md.deviceWidth || lastMeta.width,
        height: md.deviceHeight || lastMeta.height
      }
    }) + "\n");
    if (params.sessionId !== undefined) {
      try { socket.send(JSON.stringify({ id: nextId++, sessionId: __sessionId, method: "Page.screencastFrameAck", params: { sessionId: params.sessionId } })); } catch {}
    }
  }
});
async function send(method, params = {}) {
  if (!__sessionId && method !== "Target.attachToTarget") {
    const __a = await send("Target.attachToTarget", { targetId: pageTarget.id, flatten: true });
    __sessionId = __a.sessionId;
    if (!__sessionId) throw new Error("flat attach returned no sessionId");
  }
  const id = nextId++;
  const __msg = { id, method, params };
  if (__sessionId) __msg.sessionId = __sessionId;
  socket.send(JSON.stringify(__msg));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 10000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message || method));
      else resolve(message.result || {});
    });
  });
}
async function refreshMeta() {
  try {
    const m = await send("Runtime.evaluate", {
      expression: "({ url: location.href, title: document.title, width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) })",
      returnByValue: true
    });
    if (m.result && m.result.value) lastMeta = m.result.value;
  } catch {}
}
await send("Page.enable");
await send("Runtime.enable");
await send("Page.bringToFront");
await refreshMeta();
const metaTimer = setInterval(refreshMeta, 1000);
await send("Page.startScreencast", {
  format: "jpeg",
  quality: Number(quality || 55),
  maxWidth: 1600,
  maxHeight: 1000,
  everyNthFrame: Math.max(1, Number(everyNth || 1))
});
process.on("SIGTERM", () => { try { clearInterval(metaTimer); socket.close(); } catch {} process.exit(0); });
await new Promise(() => {});
"""
        return await asyncio.create_subprocess_exec(
            "node", "--input-type=module", "-e", script, cdp_url, str(quality), str(every_nth),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            # each base64 JPEG frame line is well over the default 64KB StreamReader limit
            limit=16 * 1024 * 1024
        )

    async def _relay_steel_self_host_input(self, *, browser_session_id: str, input_payload: dict[str, Any]) -> dict[str, Any]:
        bridge = await get_unified_bridge(browser_session_id)
        result = await bridge.request("input", {"input": input_payload or {}}, timeout=15)
        return {"ok": True, **result}

    async def _extract_steel_self_host(self, *, browser_session_id: str) -> dict[str, Any]:
        bridge = await get_unified_bridge(browser_session_id)
        result = await bridge.request("extract", {}, timeout=20)
        return result.get("extract") or {}

    async def _interact_steel_self_host(self, *, browser_session_id: str, ref: int, value: Any = None, settle_ms: int = 1200) -> dict[str, Any]:
        bridge = await get_unified_bridge(browser_session_id)
        result = await bridge.request("interact", {"ref": int(ref), "value": value, "settleMs": int(settle_ms)}, timeout=20)
        return result.get("interaction") or {}

    async def explore_portal_read_only(self, *, browser_session: dict[str, Any], max_steps: int = 8, user_message: str | None = None) -> dict[str, Any]:
        """Autonomous BROAD read-only traversal: open tabs/expanders/filters/pagination to
        reveal data and extract structured content. Every click is re-classified in-browser;
        credentials/2FA/captcha entry, submits, and writes are hard-denied (never actioned)."""
        if browser_session.get("provider_strategy") != "steel-self-host":
            raise BrowserSandboxError("Portal exploration is implemented for steel-self-host sessions only.")
        browser_session_id = browser_session.get("browser_session_id")
        safety = {
            "readOnly": True,
            "agentCredentialEntryAllowed": False,
            "formSubmitAllowed": False,
            "writeActionsAllowed": False,
            "offsiteFailClosed": True,
        }
        first = await self._extract_steel_self_host(browser_session_id=browser_session_id)
        if _portal_login_required(first.get("url"), first.get("title"), first.get("text")):
            return {
                "ok": False,
                "status": "human_login_required",
                "current_url_host": _safe_host(first.get("url")),
                "current_title": first.get("title"),
                "pages": [],
                "actions": [],
                "denied_controls": [{"label": c.get("label"), "reason": c.get("denyReason")} for c in first.get("controls", []) if not c.get("allow")][:40],
                "next_action": "User must take over and complete login/2FA/captcha before the worker can explore.",
                "safety": safety,
            }

        def snapshot(ex: dict[str, Any]) -> dict[str, Any]:
            return {
                "url_host": _safe_host(ex.get("url")),
                "title": ex.get("title"),
                "headings": (ex.get("headings") or [])[:25],
                "tables": (ex.get("tables") or [])[:8],
                "keyValues": (ex.get("keyValues") or [])[:50],
            }

        pages: list[dict[str, Any]] = [snapshot(first)]
        actions: list[dict[str, Any]] = []
        denied: list[dict[str, Any]] = []
        visited: set[tuple[str, str]] = set()
        seen_denied: set[str] = set()

        def record_denied(controls: list[dict[str, Any]]) -> None:
            for c in controls:
                if not c.get("allow"):
                    key = f"{c.get('label')}|{c.get('denyReason')}"
                    if key not in seen_denied:
                        seen_denied.add(key)
                        denied.append({"label": c.get("label"), "reason": c.get("denyReason")})

        record_denied(first.get("controls", []))
        priority = {"tab": 0, "expander": 1, "filter": 2, "control": 3}
        current = first
        steps = 0
        while steps < max_steps:
            candidates = [
                c for c in current.get("controls", [])
                if c.get("allow") and c.get("label") and (c.get("kind"), c.get("label")) not in visited
            ]
            if not candidates:
                break
            candidates.sort(key=lambda c: priority.get(c.get("kind"), 9))
            target = candidates[0]
            visited.add((target.get("kind"), target.get("label")))
            steps += 1
            try:
                inter = await self._interact_steel_self_host(browser_session_id=browser_session_id, ref=target.get("ref"))
            except BrowserSandboxError as exc:
                actions.append({"label": target.get("label"), "kind": target.get("kind"), "acted": False, "error": str(exc)[:160]})
                continue
            actions.append({"label": target.get("label"), "kind": target.get("kind"), "acted": bool(inter.get("acted")), "action": inter.get("action"), "denied": inter.get("denied")})
            if not inter.get("acted"):
                if inter.get("denied"):
                    key = f"{target.get('label')}|{inter.get('denied')}"
                    if key not in seen_denied:
                        seen_denied.add(key)
                        denied.append({"label": target.get("label"), "reason": inter.get("denied")})
                continue
            new_ex = inter.get("extract") or {}
            if new_ex:
                pages.append(snapshot(new_ex))
                record_denied(new_ex.get("controls", []))
                current = new_ex

        return {
            "ok": True,
            "status": "explored_read_only",
            "current_url_host": _safe_host(current.get("url")),
            "current_title": current.get("title"),
            "pages": pages,
            "actions": actions,
            "denied_controls": denied[:40],
            "safety": safety,
        }

    async def _observe_steel_self_host_page(self, *, browser_session_id: str, navigate_url: str | None = None) -> dict[str, Any]:
        if navigate_url and not self._is_allowed_steel_target_url(navigate_url):
            raise BrowserSandboxError("Steel self-host read-only observation blocked an offsite or unsafe claims navigation target.")
        bridge = await get_unified_bridge(browser_session_id)
        result = await bridge.request("observe", {"navigateUrl": navigate_url} if navigate_url else {}, timeout=20)
        return {"ok": True, **result}

    async def observe_claims_read_only(self, *, browser_session: dict[str, Any], user_message: str | None = None) -> dict[str, Any]:
        if browser_session.get("provider_strategy") != "steel-self-host":
            raise BrowserSandboxError("Remote read-only claims observation is currently implemented for steel-self-host browser sessions only.")
        browser_session_id = browser_session.get("browser_session_id")
        first = await self._observe_steel_self_host_page(browser_session_id=browser_session_id)
        observation = first.get("observation") or {}
        current_url = str(observation.get("url") or "")
        title = str(observation.get("title") or "")
        text = str(observation.get("text") or "")
        links = observation.get("links") if isinstance(observation.get("links"), list) else []
        current_host = _safe_host(current_url)

        if not _is_allowed_member_portal_host(current_host):
            return {
                "ok": False,
                "status": "portal_page_required",
                "browser_session_id": browser_session.get("browser_session_id"),
                "current_url_host": current_host,
                "current_title": title,
                "source_pointers": [],
                "claim_rows": [],
                "actions_taken": ["steel_self_host_read_only_observation", "offsite_or_unapproved_host_detected_stop"],
                "next_action": "Navigate the remote browser to the signed-in Aetna member portal before OpenClaw observes claims.",
                "safety": {
                    "readOnly": True,
                    "agentCredentialEntryAllowed": False,
                    "formSubmitAllowed": False,
                    "rawPortalTextReturned": False,
                    "rawFrameRecorded": False,
                    "allowedHost": False
                }
            }

        if _portal_login_required(current_url, title, text):
            return {
                "ok": False,
                "status": "human_login_required",
                "browser_session_id": browser_session.get("browser_session_id"),
                "current_url_host": _safe_host(current_url),
                "current_title": title,
                "source_pointers": [],
                "claim_rows": [],
                "actions_taken": ["steel_self_host_read_only_observation", "login_page_detected_stop"],
                "next_action": "User must take over, complete login/captcha/2FA, then return control before OpenClaw observes claims.",
                "safety": {
                    "readOnly": True,
                    "agentCredentialEntryAllowed": False,
                    "formSubmitAllowed": False,
                    "rawPortalTextReturned": False
                }
            }

        selected_url = None
        claims = _extract_claim_rows(text)
        observed = observation
        if not claims:
            for link in links:
                selected_url = _safe_claims_link(link.get("href"), link.get("text"), current_url=current_url)
                if selected_url:
                    navigated = await self._observe_steel_self_host_page(browser_session_id=browser_session_id, navigate_url=selected_url)
                    observed = navigated.get("observation") or {}
                    current_url = str(observed.get("url") or selected_url)
                    title = str(observed.get("title") or "")
                    text = str(observed.get("text") or "")
                    claims = _extract_claim_rows(text)
                    break

        text_hash = _sha256(text or f"{current_url}:{title}")
        source_pointer_id = f"aetna-portal-claims:{text_hash[:16]}"
        source_pointer_ref = f"portal_page_snapshots/{source_pointer_id}"
        evidence_fields = [
            {"label": "Portal page title", "value": title or "Aetna portal", "confidence": "remote_cdp_visible_page"},
            {"label": "Portal host", "value": _safe_host(current_url), "confidence": "remote_cdp_visible_page"},
            {"label": "Claim rows detected", "value": len(claims), "confidence": "remote_cdp_structured_extraction"}
        ]
        for claim in claims[:8]:
            evidence_fields.append({
                "label": "Claim row",
                "value": f"{claim.get('description')} | {claim.get('service_date')} | share ${claim.get('share_amount')}",
                "confidence": "remote_cdp_structured_extraction",
                "claim_ref": claim.get("claim_ref")
            })
        source_pointers = [
            {
                "table": "portal_page_snapshots",
                "id": source_pointer_id,
                "sourceUrl": f"aetna-portal://{_safe_host(current_url) or 'unknown'}/claims",
                "summary": f"Read-only Aetna claims observation from {title or 'portal page'}; {len(claims)} claim row(s) detected.",
                "evidenceFields": evidence_fields,
                "rawTextHash": text_hash,
                "rawTextReturned": False
            }
        ] if claims else []
        return {
            "ok": bool(claims),
            "status": "claims_observed_with_source_pointers" if claims else "claims_not_found",
            "browser_session_id": browser_session.get("browser_session_id"),
            "current_url_host": _safe_host(current_url),
            "current_title": title,
            "claims_navigation_used": bool(selected_url),
            "claims_navigation_ref": "same-site-claims-link" if selected_url else None,
            "source_pointers": source_pointers,
            "claim_rows": claims,
            "user_message": user_message,
            "actions_taken": [
                "steel_self_host_read_only_observation",
                *("same_site_claims_navigation" if selected_url else "current_page_claims_scan",),
                "structured_claim_rows_extracted" if claims else "no_claim_rows_detected"
            ],
            "next_action": "Pass source pointers to LangChain sourced answer composer." if claims else "Ask user to navigate to claims page or upload EOB/bill evidence.",
            "safety": {
                "readOnly": True,
                "agentCredentialEntryAllowed": False,
                "formSubmitAllowed": False,
                "rawPortalTextReturned": False,
                "rawFrameRecorded": False,
                "allowedHost": _is_allowed_member_portal_host(_safe_host(current_url))
            }
        }

    async def _create_steel_self_host_session(
        self,
        *,
        user_id: str,
        session_id: str,
        target_url: str | None = None,
        options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        provider_session_id = str(uuid4())
        _api = self._steel_api_caller()
        health = await _api(path="v1/health", method="GET")
        if health["status_code"] >= 400 or health["payload"].get("status") != "ok":
            raise BrowserSandboxError("Steel self-host browser sandbox health check failed.")
        # This Steel self-host allows one live session at a time. Release any existing live
        # session before creating a new one so reconnect (after a refresh/restart) never hits
        # the 1-session cap. (Durable per-user reuse is the persistence follow-up.)
        try:
            listed = await _api(path="v1/sessions", method="GET")
            for sess in (listed.get("payload") or {}).get("sessions", []) or []:
                if sess.get("status") == "live" and sess.get("id"):
                    await _api(path=f"v1/sessions/{sess['id']}/release", method="POST")
        except Exception:
            pass
        result = await _api(
            path="v1/sessions",
            body={
                "sessionId": provider_session_id,
                "skipFingerprintInjection": True,
                "dimensions": {
                    "width": int((options or {}).get("width", 1280)),
                    "height": int((options or {}).get("height", 720))
                }
            }
        )
        if result["status_code"] >= 400:
            raise BrowserSandboxError("Steel self-host browser sandbox rejected session creation.")
        payload = result["payload"]
        provider_session_ref = str(payload.get("id") or payload.get("sessionId") or payload.get("session", {}).get("id") or provider_session_id)
        session_viewer_url = self._steel_viewer_url(provider_session_ref, payload)
        # Start the SINGLE persistent CDP bridge for this session and navigate through it, so
        # navigate + screencast + input/observe all share one flat session (no competing clients).
        browser_session_id = f"hosted_browser_{uuid4()}"
        navigation = None
        if target_url:
            try:
                bridge = await get_unified_bridge(browser_session_id)
                navigation = await bridge.request("navigate", {"url": target_url}, timeout=20)
            except Exception:
                navigation = None
        return {
            "browser_session_id": browser_session_id,
            "contract_version": HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION,
            "provider": self.provider_key,
            "adapter_mode": "hosted_provider",
            "provider_strategy": "steel-self-host",
            "provider_live_connected": True,
            "provider_session_ref": provider_session_ref,
            "provider_paths": {
                "stream": f"v1/sessions/{provider_session_ref}/live-details",
                "teardown": f"v1/sessions/{provider_session_ref}/release"
            },
            "session_id": session_id,
            "user_id": user_id,
            "target_url": target_url,
            "created_at": now_iso(),
            "takeover_state": "not_requested",
            "readiness": {
                "status": "hosted_browser_sandbox_provider_ready",
                "ready": True,
                "adapterMode": "hosted_provider",
                "providerStrategy": "steel-self-host",
                "providerLiveConnected": True,
                "userActionRequired": None,
                "nextAction": "use_embedded_steel_viewer_and_human_takeover",
                "navigationStatus": "remote_cdp_navigated" if navigation else "remote_session_created_waiting_for_target",
                "safetyBoundary": "read_only_approval_required"
            },
            "current_url": navigation.get("currentUrl") if navigation else None,
            "current_title": navigation.get("currentTitle") if navigation else "Steel remote browser session",
            "ocr_caption": {
                "status": "pending_steel_viewer_caption",
                "requiredForEvidence": True,
                "rawOcrTextReturned": False,
                "captionRefPresent": False
            },
            "screencast": {
                "ok": True,
                "status": "hosted_provider_session_created",
                "frameSource": "steel_self_host_cdp_screenshot_stream",
                "sessionViewerUrl": session_viewer_url,
                "streamTransport": "sse_cdp_jpeg_frames",
                "webrtcSignaling": {
                    "required": False,
                    "offerPathReady": False,
                    "rawSdpReturned": False,
                    "rawIceCandidateReturned": False
                },
                "rawFrameRecorded": False,
                "providerLiveConnected": True
            },
            "navigation": {
                "ok": bool(navigation),
                "status": "remote_cdp_navigated" if navigation else "not_requested",
                "targetUrlRef": "approved-target-url-ref-redacted",
                "currentUrlPresent": bool(navigation.get("currentUrl")) if navigation else False,
                "currentTitlePresent": bool(navigation.get("currentTitle")) if navigation else False
            }
        }

    async def _create_live_session(
        self,
        *,
        user_id: str,
        session_id: str,
        target_url: str | None = None,
        options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if self._provider_strategy() == "steel-self-host":
            return await self._create_steel_self_host_session(
                user_id=user_id,
                session_id=session_id,
                target_url=target_url,
                options=options
            )
        request_body = {
            "sessionId": session_id,
            "userId": user_id,
            "targetUrlRef": (options or {}).get("targetUrlRef", "approved-target-url-ref-redacted"),
            "options": {"liveProvider": True, **{k: v for k, v in (options or {}).items() if k != "targetUrlRef"}},
            "approvalContract": {
                "readOnlyApprovalRequired": True,
                "humanTakeoverApprovalRequired": True,
                "humanInputRelay": "approval_gated_human_only"
            },
            "safetyContract": {
                "agentCredentialEntryAllowed": False,
                "externalWriteActionsAllowed": False,
                "frameRecordingAllowed": False,
                "rawOcrPersistenceAllowed": False,
                "offsiteFailClosed": True,
                "credentialPagesUserOnly": True
            }
        }
        result = await self._provider_json(path="browser/sessions", body=request_body)
        if result["status_code"] >= 400:
            raise BrowserSandboxError("Hosted browser sandbox provider rejected session creation.")
        payload = result["payload"]
        self._assert_live_create_response(payload)
        provider_session_ref = str(payload["providerSessionRef"])
        session_viewer_url = (
            payload.get("sessionViewerUrl")
            or payload.get("viewerUrl")
            or payload.get("stream", {}).get("sessionViewerUrl")
            or payload.get("stream", {}).get("viewerUrl")
        )
        return {
            "browser_session_id": f"hosted_browser_{uuid4()}",
            "contract_version": HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION,
            "provider": self.provider_key,
            "adapter_mode": "hosted_provider",
            "provider_live_connected": True,
            "provider_session_ref": provider_session_ref,
            "provider_paths": {
                "stream": payload.get("stream", {}).get("streamPath") or f"browser/sessions/{provider_session_ref}/stream",
                "webrtc_offer": payload.get("webrtcSignaling", {}).get("offerPath") or f"browser/sessions/{provider_session_ref}/webrtc/offer",
                "webrtc_ice_candidate": payload.get("webrtcSignaling", {}).get("iceCandidatePath") or f"browser/sessions/{provider_session_ref}/webrtc/ice-candidate",
                "takeover": payload.get("takeover", {}).get("takeoverPath") or f"browser/sessions/{provider_session_ref}/takeover",
                "input": payload.get("takeover", {}).get("inputPath") or f"browser/sessions/{provider_session_ref}/input",
                "teardown": f"browser/sessions/{provider_session_ref}/teardown"
            },
            "session_id": session_id,
            "user_id": user_id,
            "target_url": target_url,
            "created_at": now_iso(),
            "takeover_state": payload.get("takeover", {}).get("state", "not_requested"),
            "readiness": {
                "status": "hosted_browser_sandbox_provider_ready",
                "ready": True,
                "adapterMode": "hosted_provider",
                "providerLiveConnected": True,
                "userActionRequired": None,
                "nextAction": "use_public_stream_and_takeover_routes",
                "safetyBoundary": "read_only_approval_required"
            },
            "current_url": None,
            "current_title": "Hosted remote browser session",
            "ocr_caption": {
                "status": "provider_caption_ref_ready" if payload.get("ocrCaption", {}).get("captionRef") else "pending_provider_caption",
                "requiredForEvidence": True,
                "rawOcrTextReturned": False,
                "captionRefPresent": bool(payload.get("ocrCaption", {}).get("captionRef"))
            },
            "screencast": {
                "ok": True,
                "status": "hosted_provider_session_created",
                "frameSource": "hosted_provider_stream_ref",
                "sessionViewerUrl": session_viewer_url,
                "streamTransport": payload.get("stream", {}).get("transport", "webrtc_or_sse_frames"),
                "webrtcSignaling": {
                    "required": payload.get("stream", {}).get("transport") in {"webrtc", "webrtc_or_sse_frames"},
                    "offerPathReady": True,
                    "rawSdpReturned": False,
                    "rawIceCandidateReturned": False
                },
                "rawFrameRecorded": False,
                "providerLiveConnected": True
            }
        }

    async def create_session(
        self,
        *,
        node_client: Any,
        user_id: str,
        session_id: str,
        target_url: str | None = None,
        options: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        # Local dev/test ONLY: when explicitly enabled and the Steel CDP is reachable, create a
        # steel-self-host session directly, bypassing the production hosted-provider launch-proof
        # gate (private config file + proof files + readiness flags). Default off — production
        # readiness behavior is unchanged. Used to exercise the live local Steel + screencast.
        if (
            os.environ.get("WEFELLA_BROWSER_SANDBOX_STEEL_DEV_DIRECT") == "1"
            and self._provider_strategy() == "steel-self-host"
            and os.environ.get("WEFELLA_BROWSER_SANDBOX_CDP_URL")
        ):
            return await self._create_steel_self_host_session(
                user_id=user_id,
                session_id=session_id,
                target_url=target_url,
                options=options or {}
            )
        contract = self.describe()
        read_only_live_session_ready = self._can_create_read_only_live_session(contract)
        if not contract["ready"] and not read_only_live_session_ready and not contract.get("adapterHarnessReady"):
            if contract.get("status") == "hosted_browser_sandbox_provider_missing_endpoint_or_secret":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider endpoint or secret is not resolved. "
                    "Set the endpoint and auth token environment references from the provider config before creating hosted sessions."
                )
            if contract.get("status") == "hosted_browser_sandbox_provider_configured_unverified":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider endpoint and secret are configured, but live provider verification has not passed. "
                    "Set WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1 only after hosted stream, screenshot/OCR, takeover, input, and teardown proof passes."
                )
            if contract.get("status") == "hosted_browser_sandbox_provider_adapter_contract_ready":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider adapter contract is ready, but live provider verification has not passed. "
                    "The adapter smoke does not create real hosted sessions until live stream, screenshot/OCR, takeover, input, and teardown proof passes."
                )
            if contract.get("status") == "hosted_browser_sandbox_provider_http_adapter_harness_ready":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider HTTP adapter harness is ready, but live provider verification has not passed. "
                    "The local provider-compatible harness proves request plumbing only and does not create real hosted sessions."
                )
            if contract.get("status") == "hosted_browser_sandbox_provider_live_lifecycle_harness_ready":
                raise BrowserSandboxError(
                    "Hosted browser sandbox provider live lifecycle harness is ready, but live provider verification has not passed. "
                    "The local provider-compatible harness proves stream, screenshot/OCR, takeover, input, teardown, and offsite fail-closed plumbing only."
                )
            raise BrowserSandboxError(
                "Hosted browser sandbox provider is not configured. "
                "Set WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE to a non-example provider config and "
                "WEFELLA_BROWSER_SANDBOX_PROVIDER_READY=1 after hosted proof passes."
            )
        if contract.get("ready") or read_only_live_session_ready:
            return await self._create_live_session(
                user_id=user_id,
                session_id=session_id,
                target_url=target_url,
                options=options
            )
        if contract.get("adapterHarnessReady"):
            return {
                "browser_session_id": f"hosted_browser_{uuid4()}",
                "contract_version": HOSTED_SANDBOX_CONTRACT_VERSION,
                "provider": self.provider_key,
                "adapter_mode": "contract_harness",
                "provider_live_connected": False,
                "session_id": session_id,
                "user_id": user_id,
                "target_url": target_url,
                "created_at": now_iso(),
                "takeover_state": "not_requested",
                "readiness": {
                    "status": "hosted_browser_sandbox_adapter_harness_ready",
                    "ready": True,
                    "adapterMode": "contract_harness",
                    "providerLiveConnected": False,
                    "userActionRequired": None,
                    "nextAction": "configure_real_hosted_provider_for_production",
                    "safetyBoundary": "read_only_approval_required"
                },
                "current_url": target_url,
                "current_title": "Hosted browser sandbox contract harness",
                "ocr_caption": {
                    "status": "caption_contract_ready",
                    "requiredForEvidence": True,
                    "rawOcrTextReturned": False,
                    "frameSource": "hosted_contract_harness",
                    "lastFrameAt": now_iso()
                },
                "screencast": {
                    "ok": True,
                    "status": "hosted_adapter_harness_session_created",
                    "frameSource": "hosted_contract_harness",
                    "streamTransport": "sse_frames",
                    "rawFrameRecorded": False,
                    "providerLiveConnected": False
                }
            }
        raise BrowserSandboxError("Hosted browser sandbox provider adapter is configured but not implemented in this local runtime.")

    async def request_takeover(self, *, node_client: Any, browser_session: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
        if browser_session.get("provider_strategy") == "steel-self-host":
            return {
                "ok": True,
                "status": "interactive_takeover_pending_approval",
                "takeoverId": f"steel_takeover_{uuid4()}",
                "approvalRequired": True,
                "reason": reason or "user_password_or_captcha",
                "providerLiveConnected": True,
                "inputRelay": "embedded_steel_viewer_human_only",
                "actionsTaken": []
            }
        if browser_session.get("provider_live_connected") is True:
            path = browser_session.get("provider_paths", {}).get("takeover") or f"browser/sessions/{browser_session['provider_session_ref']}/takeover"
            result = await self._provider_json(path=path, body={"reason": reason or "user_password_or_captcha"})
            payload = result["payload"]
            return {
                "ok": result["status_code"] < 400 and payload.get("approvalRequired") is True,
                "status": payload.get("status", "interactive_takeover_pending_approval"),
                "takeoverId": payload.get("takeoverId"),
                "approvalRequired": payload.get("approvalRequired") is True,
                "inputRelay": payload.get("inputRelay", "approval_gated_human_only"),
                "providerLiveConnected": True,
                "actionsTaken": []
            }
        self._require_harness()
        return {
            "ok": True,
            "status": "interactive_takeover_pending_approval",
            "takeoverId": f"hosted_takeover_{uuid4()}",
            "approvalRequired": True,
            "reason": reason or "user_password_or_captcha",
            "providerLiveConnected": False,
            "actionsTaken": []
        }

    async def grant_takeover(self, *, node_client: Any, browser_session: dict[str, Any], takeover_id: str, approved_by: str | None = None) -> dict[str, Any]:
        if browser_session.get("provider_strategy") == "steel-self-host":
            return {
                "ok": True,
                "status": "interactive_takeover_granted",
                "takeoverId": takeover_id,
                "grantToken": f"hosted_provider_grant_{uuid4()}",
                "approvedBy": approved_by or "user",
                "providerLiveConnected": True,
                "inputRelay": "embedded_steel_viewer_human_only",
                "actionsTaken": []
            }
        if browser_session.get("provider_live_connected") is True:
            return {
                "ok": True,
                "status": "interactive_takeover_granted",
                "takeoverId": takeover_id,
                "grantToken": f"hosted_provider_grant_{uuid4()}",
                "approvedBy": approved_by or "user",
                "providerLiveConnected": True,
                "inputRelay": "approval_gated_human_only",
                "actionsTaken": []
            }
        self._require_harness()
        return {
            "ok": True,
            "status": "interactive_takeover_granted",
            "takeoverId": takeover_id,
            "grantToken": f"hosted_grant_{uuid4()}",
            "approvedBy": approved_by or "user",
            "providerLiveConnected": False,
            "actionsTaken": []
        }

    async def end_takeover(self, *, node_client: Any, browser_session: dict[str, Any], takeover_id: str) -> dict[str, Any]:
        if browser_session.get("provider_strategy") == "steel-self-host":
            return {
                "ok": True,
                "status": "interactive_takeover_ended",
                "takeoverId": takeover_id,
                "providerLiveConnected": True,
                "actionsTaken": []
            }
        if browser_session.get("provider_live_connected") is True:
            path = f"browser/sessions/{browser_session['provider_session_ref']}/takeover/end"
            result = await self._provider_json(path=path, body={"takeoverId": takeover_id})
            return {
                "ok": result["status_code"] < 400,
                "status": result["payload"].get("status", "interactive_takeover_ended"),
                "takeoverId": takeover_id,
                "providerLiveConnected": True,
                "actionsTaken": []
            }
        self._require_harness()
        return {
            "ok": True,
            "status": "interactive_takeover_ended",
            "takeoverId": takeover_id,
            "providerLiveConnected": False,
            "actionsTaken": []
        }

    async def send_input(
        self,
        *,
        node_client: Any,
        browser_session: dict[str, Any],
        takeover_id: str,
        grant_token: str,
        input_payload: dict[str, Any]
    ) -> dict[str, Any]:
        if browser_session.get("provider_strategy") == "steel-self-host":
            if not grant_token.startswith("hosted_provider_grant_"):
                raise BrowserSandboxError("Steel self-host browser input requires a valid human takeover grant token.")
            relay = await self._relay_steel_self_host_input(browser_session_id=browser_session.get("browser_session_id"), input_payload=input_payload)
            return {
                "ok": relay.get("ok") is True,
                "status": "interactive_takeover_input_relayed",
                "takeoverId": takeover_id,
                "inputAccepted": relay.get("inputAccepted") is True,
                "inputRelay": "steel_self_host_cdp_human_only",
                "rawInputReturned": False,
                "providerLiveConnected": True,
                "actionsTaken": ["steel_self_host_cdp_input_dispatched"]
            }
        if browser_session.get("provider_live_connected") is True:
            if not grant_token.startswith("hosted_provider_grant_"):
                raise BrowserSandboxError("Hosted browser sandbox input requires a valid human takeover grant token.")
            path = browser_session.get("provider_paths", {}).get("input") or f"browser/sessions/{browser_session['provider_session_ref']}/input"
            result = await self._provider_json(
                path=path,
                body={
                    "takeoverId": takeover_id,
                    "approvalGrantRef": "approval-grant-ref-redacted",
                    "inputType": input_payload.get("type"),
                    "inputValue": "[redacted]"
                }
            )
            payload = result["payload"]
            return {
                "ok": result["status_code"] < 400 and payload.get("rawInputReturned") is not True,
                "status": payload.get("status", "interactive_takeover_input_relayed"),
                "takeoverId": takeover_id,
                "inputAccepted": payload.get("inputAccepted") is True,
                "inputRelay": "approval_gated_human_only",
                "rawInputReturned": False,
                "providerLiveConnected": True,
                "actionsTaken": []
            }
        self._require_harness()
        if not grant_token.startswith("hosted_grant_"):
            raise BrowserSandboxError("Hosted browser sandbox input requires a valid harness grant token.")
        return {
            "ok": True,
            "status": "interactive_takeover_input_relayed",
            "takeoverId": takeover_id,
            "inputAccepted": True,
            "inputRelay": "sanitized_contract_harness",
            "inputType": input_payload.get("type"),
            "rawInputReturned": False,
            "providerLiveConnected": False,
            "actionsTaken": []
        }

    async def exchange_webrtc_offer(
        self,
        *,
        browser_session: dict[str, Any],
        offer_ref: str,
        ice_candidate_ref: str | None = None
    ) -> dict[str, Any]:
        if browser_session.get("provider_live_connected") is not True:
            raise BrowserSandboxError("WebRTC signaling is available only for a live hosted provider session.")
        if not offer_ref or any(marker in offer_ref.lower() for marker in ["v=0", "candidate:", "password", "captcha", "member id", "subscriber id"]):
            raise BrowserSandboxError("WebRTC signaling requires an opaque offer reference, not raw SDP or private data.")
        if ice_candidate_ref and any(marker in ice_candidate_ref.lower() for marker in ["candidate:", "typ host", "password", "captcha"]):
            raise BrowserSandboxError("WebRTC signaling requires an opaque ICE candidate reference, not raw candidate text.")
        offer_path = browser_session.get("provider_paths", {}).get("webrtc_offer") or f"browser/sessions/{browser_session['provider_session_ref']}/webrtc/offer"
        result = await self._provider_json(
            path=offer_path,
            body={
                "offerRef": offer_ref,
                "rawSdpReturned": False,
                "clientCapabilities": {
                    "receiveVideo": True,
                    "receiveAudio": False,
                    "dataChannelInput": True
                }
            }
        )
        payload = result["payload"]
        serialized = json.dumps(payload, separators=(",", ":")).lower()
        if (
            result["status_code"] >= 400
            or payload.get("rawSdpReturned") is True
            or payload.get("rawIceCandidateReturned") is True
            or any(marker in serialized for marker in ["v=0", "candidate:", "a=fingerprint", "a=ice-ufrag", "turn:", "stun:", "bearer ", "token", "secret", "data:image", "member id", "subscriber id", "password", "captcha"])
        ):
            raise BrowserSandboxError("Hosted browser sandbox provider returned unsafe WebRTC signaling payload.")
        candidate_result: dict[str, Any] | None = None
        if ice_candidate_ref:
            candidate_path = browser_session.get("provider_paths", {}).get("webrtc_ice_candidate") or f"browser/sessions/{browser_session['provider_session_ref']}/webrtc/ice-candidate"
            candidate_result = await self._provider_json(
                path=candidate_path,
                body={
                    "candidateRef": ice_candidate_ref,
                    "rawIceCandidateReturned": False
                }
            )
            candidate_payload = candidate_result["payload"]
            candidate_serialized = json.dumps(candidate_payload, separators=(",", ":")).lower()
            if (
                candidate_result["status_code"] >= 400
                or candidate_payload.get("rawIceCandidateReturned") is True
                or any(marker in candidate_serialized for marker in ["candidate:", "a=fingerprint", "a=ice-ufrag", "turn:", "stun:", "bearer ", "token", "secret", "member id", "subscriber id", "password", "captcha"])
            ):
                raise BrowserSandboxError("Hosted browser sandbox provider returned unsafe ICE candidate payload.")
        return {
            "ok": True,
            "status": payload.get("status", "webrtc_signaling_answer_ready"),
            "browserSessionId": browser_session.get("browser_session_id"),
            "providerLiveConnected": True,
            "transport": payload.get("transport", "webrtc"),
            "answerRefPresent": bool(payload.get("answerRef")),
            "iceServerRefsPresent": bool(payload.get("iceServerRefs")),
            "candidateAccepted": bool(candidate_result and candidate_result["payload"].get("candidateAccepted") is True),
            "rawSdpReturned": False,
            "rawIceCandidateReturned": False,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "actionsTaken": []
        }


def _read_json_if_present(path: str | None) -> dict[str, Any] | None:
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            parsed = json.load(handle)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _read_text_if_present(path: str | None) -> str | None:
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except Exception:
        return None


def _path_is_inside_repo(path: str | None) -> bool:
    if not path:
        return False
    try:
        relative = os.path.relpath(os.path.abspath(path), os.getcwd())
    except ValueError:
        return False
    return bool(relative and not relative.startswith("..") and not os.path.isabs(relative))


def _public_path_ref(path: str | None, *, private_label: str) -> str | None:
    if not path:
        return None
    return path if _path_is_inside_repo(path) else private_label


def _latest_steel_self_host_proof() -> tuple[str | None, dict[str, Any] | None]:
    explicit_path = os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_STEEL_SELF_HOST_PROOF_FILE")
    if explicit_path:
        return _public_path_ref(explicit_path, private_label="[private-steel-self-host-proof-outside-git]"), _read_json_if_present(explicit_path)
    candidates = sorted(glob.glob(os.path.join("artifacts", "phase28", "steel-self-host-live-lifecycle-*.json")))
    if not candidates:
        return None, None
    latest = candidates[-1]
    return latest, _read_json_if_present(latest)


def _summarize_steel_self_host_proof() -> dict[str, Any]:
    artifact_ref, proof = _latest_steel_self_host_proof()
    lifecycle = proof.get("liveLifecycle", {}) if isinstance(proof, dict) and isinstance(proof.get("liveLifecycle"), dict) else {}
    create_session = lifecycle.get("createSession", {}) if isinstance(lifecycle.get("createSession"), dict) else {}
    stream = lifecycle.get("stream", {}) if isinstance(lifecycle.get("stream"), dict) else {}
    screenshot = lifecycle.get("screenshot", {}) if isinstance(lifecycle.get("screenshot"), dict) else {}
    ocr_caption = lifecycle.get("ocrCaption", {}) if isinstance(lifecycle.get("ocrCaption"), dict) else {}
    input_proof = lifecycle.get("input", {}) if isinstance(lifecycle.get("input"), dict) else {}
    takeover = lifecycle.get("takeover", {}) if isinstance(lifecycle.get("takeover"), dict) else {}
    teardown = lifecycle.get("teardown", {}) if isinstance(lifecycle.get("teardown"), dict) else {}
    offsite = lifecycle.get("offsite", {}) if isinstance(lifecycle.get("offsite"), dict) else {}
    safety = lifecycle.get("safety", {}) if isinstance(lifecycle.get("safety"), dict) else {}
    checks = [
        {"key": "session_create", "ok": create_session.get("ok") is True and lifecycle.get("providerLiveConnected") is True},
        {"key": "cdp_connect", "ok": create_session.get("cdpConnected") is True},
        {"key": "live_viewer_stream_ref", "ok": stream.get("ok") is True and stream.get("viewerUrlAvailable") is True},
        {"key": "screenshot_ref", "ok": screenshot.get("ok") is True and screenshot.get("screenshotRefPresent") is True and screenshot.get("rawImageReturned") is False},
        {"key": "ocr_caption_ref", "ok": ocr_caption.get("ok") is True and ocr_caption.get("captionRefPresent") is True and ocr_caption.get("rawOcrTextReturned") is False},
        {"key": "approved_input_relay", "ok": input_proof.get("ok") is True and input_proof.get("inputAccepted") is True and input_proof.get("rawInputReturned") is False},
        {"key": "takeover_approval_scope", "ok": takeover.get("ok") is True and takeover.get("approvalRequired") is True and takeover.get("inputRelay") == "approval_gated_human_only"},
        {"key": "teardown_release", "ok": teardown.get("ok") is True and teardown.get("teardownComplete") is True},
        {"key": "offsite_fail_closed", "ok": offsite.get("ok") is True and offsite.get("statusCode") == 403 and offsite.get("offsiteFailClosed") is True},
        {"key": "phi_redaction_policy", "ok": safety.get("rawFrameReturned") is False and safety.get("rawImageReturned") is False and safety.get("rawOcrTextReturned") is False and safety.get("rawInputReturned") is False}
    ]
    passed = sum(1 for check in checks if check["ok"])
    return {
        "status": "steel_self_host_live_proof_ready" if passed == len(checks) else "steel_self_host_live_proof_incomplete" if artifact_ref else "steel_self_host_live_proof_missing",
        "ok": passed == len(checks),
        "score": passed * 10,
        "target": 100,
        "passed": passed,
        "total": len(checks),
        "checks": checks,
        "artifactRef": artifact_ref,
        "providerStrategy": lifecycle.get("providerStrategy"),
        "viewerUrlEnvRef": "WEFELLA_BROWSER_SANDBOX_VIEWER_URL",
        "lifecycleRefPresent": bool(lifecycle.get("status")),
        "rawEndpointReturned": False,
        "rawSecretReturned": False,
        "rawFrameReturned": False,
        "rawOcrTextReturned": False,
        "rawInputReturned": False
    }


def _validate_steel_operations_config(config: dict[str, Any]) -> dict[str, Any]:
    failures: list[str] = []
    if config.get("schemaVersion") != "brainstyworkers.browser-sandbox-provider-steel-operations.v1":
        failures.append("steel_operations_schema_version_missing_or_unknown")
    if config.get("providerStrategy") != "steel-self-host":
        failures.append("steel_operations_provider_strategy_must_be_steel_self_host")
    if config.get("status") != "operations_contract_only":
        failures.append("steel_operations_status_must_be_contract_only")
    if config.get("composeFile") != STEEL_COMPOSE_PATH:
        failures.append("steel_operations_compose_file_mismatch")
    if config.get("runbook") != STEEL_RUNBOOK_PATH:
        failures.append("steel_operations_runbook_mismatch")
    session = config.get("sessionPolicy", {}) if isinstance(config.get("sessionPolicy"), dict) else {}
    if not isinstance(session.get("maxConcurrentSessions"), int) or not 1 <= session.get("maxConcurrentSessions", 0) <= 5:
        failures.append("steel_operations_concurrency_cap_required")
    if session.get("maxSessionMinutes", 999) > 30:
        failures.append("steel_operations_max_session_minutes_must_be_30_or_less")
    if session.get("idleTimeoutMinutes", 999) > 5:
        failures.append("steel_operations_idle_timeout_minutes_must_be_5_or_less")
    for key, failure in [
        ("releaseOnTeardown", "steel_operations_release_on_teardown_required"),
        ("releaseStaleSessions", "steel_operations_stale_session_release_required"),
        ("teardownOnFailure", "steel_operations_teardown_on_failure_required")
    ]:
        if session.get(key) is not True:
            failures.append(failure)
    retention = config.get("retentionPolicy", {}) if isinstance(config.get("retentionPolicy"), dict) else {}
    for key, failure in [
        ("recordFrames", "steel_operations_frame_recording_must_be_disabled"),
        ("persistRawOcrText", "steel_operations_raw_ocr_persistence_must_be_disabled"),
        ("rawScreenshotsInGit", "steel_operations_raw_screenshots_in_git_must_be_disabled"),
        ("browserLogStorageEnabled", "steel_operations_browser_log_storage_must_be_disabled_by_default"),
        ("logStorageContainsPhi", "steel_operations_log_storage_phi_must_be_false")
    ]:
        if retention.get(key) is not False:
            failures.append(failure)
    if not isinstance(retention.get("proofArtifactRetentionDays"), int) or not 1 <= retention.get("proofArtifactRetentionDays", 0) <= 30:
        failures.append("steel_operations_proof_retention_days_must_be_1_to_30")
    network = config.get("networkPolicy", {}) if isinstance(config.get("networkPolicy"), dict) else {}
    expected_network = {
        "apiLoopbackOnly": True,
        "cdpLoopbackOnly": True,
        "viewerLoopbackOnly": True,
        "directPublicCdpAllowed": False,
        "remoteAccessViaFastApiOnly": True
    }
    for key, expected in expected_network.items():
        if network.get(key) is not expected:
            failures.append(f"steel_operations_network_{key}_invalid")
    image = config.get("imagePolicy", {}) if isinstance(config.get("imagePolicy"), dict) else {}
    if image.get("pinnedByDigest") is not True:
        failures.append("steel_operations_images_must_be_pinned_by_digest")
    if image.get("latestTagsAllowed") is not False:
        failures.append("steel_operations_latest_tags_must_be_forbidden")
    if image.get("patchReviewRequired") is not True:
        failures.append("steel_operations_patch_review_required")
    approval = config.get("approvalPolicy", {}) if isinstance(config.get("approvalPolicy"), dict) else {}
    if approval.get("requiresReadOnlyApproval") is not True or approval.get("requiresHumanTakeoverApproval") is not True:
        failures.append("steel_operations_approval_required")
    if approval.get("agentCredentialEntryAllowed") is not False or approval.get("externalWriteActionsAllowed") is not False:
        failures.append("steel_operations_external_or_credential_actions_must_be_blocked")
    serialized = json.dumps(config, separators=(",", ":"))
    if re.search(r"https?://[^\"\\\s]+|ws://[^\"\\\s]+", serialized, re.I):
        failures.append("steel_operations_raw_endpoint_forbidden")
    if re.search(r"Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9]|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]", serialized, re.I):
        failures.append("steel_operations_secret_literal_forbidden")
    return {"ok": len(failures) == 0, "failures": failures}


def _summarize_steel_operations() -> dict[str, Any]:
    config = _read_json_if_present(STEEL_OPERATIONS_CONFIG_PATH)
    compose_text = _read_text_if_present(STEEL_COMPOSE_PATH) or ""
    runbook_text = _read_text_if_present(STEEL_RUNBOOK_PATH) or ""
    validation = _validate_steel_operations_config(config if isinstance(config, dict) else {})
    checks = [
        {"key": "api_image_pinned_digest", "ok": bool(re.search(r"ghcr\.io/steel-dev/steel-browser-api@sha256:[a-f0-9]{64}", compose_text))},
        {"key": "ui_image_pinned_digest", "ok": bool(re.search(r"ghcr\.io/steel-dev/steel-browser-ui@sha256:[a-f0-9]{64}", compose_text))},
        {"key": "no_latest_tags", "ok": ":latest" not in compose_text},
        {"key": "api_port_loopback_only", "ok": '"127.0.0.1:3000:3000"' in compose_text},
        {"key": "cdp_port_loopback_only", "ok": '"127.0.0.1:9223:9223"' in compose_text},
        {"key": "viewer_port_loopback_only", "ok": '"127.0.0.1:5173:80"' in compose_text},
        {"key": "log_storage_disabled_by_default", "ok": "LOG_STORAGE_ENABLED=false" in compose_text},
        {"key": "fastapi_remote_boundary_documented", "ok": "FastAPI connector" in runbook_text and "Do not expose Steel API, UI, or CDP directly" in runbook_text},
        {"key": "cleanup_documented", "ok": "release stale sessions" in runbook_text and "docker compose -f infra/steel/compose.yaml down" in runbook_text}
    ]
    passed = sum(1 for check in checks if check["ok"])
    static_ready = bool(validation["ok"] and passed == len(checks))
    operations_gate = os.environ.get("WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_READY") == "1"
    live_probe_requested = os.environ.get("WEFELLA_BROWSER_SANDBOX_STEEL_OPERATIONS_LIVE_PROBE") == "1"
    live_probe_config_present = bool(
        os.environ.get("WEFELLA_BROWSER_SANDBOX_ENDPOINT_URL")
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_CDP_URL")
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_VIEWER_URL")
    )
    ready = bool(static_ready and operations_gate and (not live_probe_requested or live_probe_config_present))
    return {
        "status": (
            "steel_self_host_operations_ready"
            if ready
            else "steel_self_host_operations_contract_ready"
            if static_ready
            else "steel_self_host_operations_contract_incomplete"
        ),
        "ok": ready,
        "contractReady": static_ready,
        "score": 100 if ready else 85 if static_ready else int((passed / max(len(checks), 1)) * 60),
        "target": 100,
        "checks": checks + [
            {"key": "operations_gate", "ok": operations_gate},
            {"key": "live_probe_requested", "ok": live_probe_requested},
            {"key": "live_probe_config_present", "ok": live_probe_config_present}
        ],
        "failures": validation["failures"],
        "composeFile": STEEL_COMPOSE_PATH,
        "configFile": STEEL_OPERATIONS_CONFIG_PATH,
        "runbook": STEEL_RUNBOOK_PATH,
        "command": "npm run sandbox:browser:steel-operations",
        "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
        "rawEndpointReturned": False,
        "rawSecretReturned": False,
        "rawFrameReturned": False,
        "rawOcrTextReturned": False,
        "rawInputReturned": False
    }


def _latest_steel_remote_proof() -> tuple[str | None, dict[str, Any] | None]:
    explicit_path = os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_STEEL_REMOTE_PROOF_FILE")
    if explicit_path:
        return _public_path_ref(explicit_path, private_label="[private-steel-remote-proof-outside-git]"), _read_json_if_present(explicit_path)
    candidates = sorted(glob.glob(os.path.join("artifacts", "phase30", "steel-remote-live-lifecycle-*.json")))
    if not candidates:
        return None, None
    latest = candidates[-1]
    return latest, _read_json_if_present(latest)


def _summarize_steel_remote_host() -> dict[str, Any]:
    compose_text = _read_text_if_present(STEEL_REMOTE_COMPOSE_PATH) or ""
    caddy_text = _read_text_if_present(STEEL_REMOTE_CADDYFILE_PATH) or ""
    firewall_text = _read_text_if_present(STEEL_REMOTE_FIREWALL_PATH) or ""
    wireguard_text = _read_text_if_present(STEEL_REMOTE_WIREGUARD_PATH) or ""
    recovery_text = _read_text_if_present(STEEL_REMOTE_RECOVERY_SCRIPT_PATH) or ""
    deployment_checks = [
        {"key": "remote_api_image_pinned_digest", "ok": bool(re.search(r"ghcr\.io/steel-dev/steel-browser-api@sha256:[a-f0-9]{64}", compose_text))},
        {"key": "remote_ui_image_pinned_digest", "ok": bool(re.search(r"ghcr\.io/steel-dev/steel-browser-ui@sha256:[a-f0-9]{64}", compose_text))},
        {"key": "remote_no_latest_tags", "ok": ":latest" not in compose_text},
        {"key": "remote_api_loopback_only", "ok": '"127.0.0.1:3000:3000"' in compose_text},
        {"key": "remote_cdp_loopback_only", "ok": '"127.0.0.1:9223:9223"' in compose_text},
        {"key": "remote_healthcheck_local", "ok": "http://127.0.0.1:3000/v1/health" in compose_text},
        {"key": "remote_encrypted_logs_mount_documented", "ok": "/srv/workerprototype_openclaw/steel/logs:/data/steel/logs" in compose_text},
        {"key": "remote_tls_placeholder_host", "ok": "STEEL_REMOTE_HOST" in caddy_text and ":443" in caddy_text},
        {"key": "remote_ip_allowlist_matcher", "ok": "@allow_backend" in caddy_text and "remote_ip" in caddy_text},
        {"key": "remote_blocks_everything_else", "ok": "respond 404" in caddy_text},
        {"key": "remote_no_cdp_proxy", "ok": not re.search(r"9223|cdp", caddy_text, re.I)},
        {"key": "remote_firewall_inbound_documented", "ok": all(fragment in firewall_text for fragment in ["22/tcp", "443/tcp", "backend egress", "9223"])},
        {"key": "remote_firewall_outbound_allowlist_documented", "ok": all(fragment in firewall_text for fragment in ["outbound", "allowlist", "ACME", "ghcr.io", "drop"])},
        {"key": "remote_wireguard_private_cdp_documented", "ok": all(fragment in wireguard_text for fragment in ["WireGuard", "127.0.0.1:9223", "ssh -L 9223:127.0.0.1:9223"])},
        {"key": "remote_recovery_script_health_and_smoke", "ok": all(fragment in recovery_text for fragment in ["v1/health", "v1/sessions", "release", "recovery"])}
    ]
    deployment_ready = all(check["ok"] for check in deployment_checks)
    artifact_ref, proof = _latest_steel_remote_proof()
    ten_checks = proof.get("tenChecks", {}).get("checks", []) if isinstance(proof, dict) else []
    ten_passed = sum(1 for check in ten_checks if isinstance(check, dict) and check.get("ok") is True)
    lifecycle_ready = bool(isinstance(proof, dict) and proof.get("ok") is True and ten_passed == 10 and len(ten_checks) == 10)
    return {
        "status": (
            "steel_remote_host_lifecycle_verified"
            if lifecycle_ready
            else "steel_remote_host_contract_ready_waiting_live_10_of_10"
            if deployment_ready
            else "steel_remote_host_contract_incomplete"
        ),
        "ok": lifecycle_ready,
        "contractReady": deployment_ready,
        "score": 100 if lifecycle_ready else 0,
        "target": 100,
        "checks": deployment_checks,
        "tenChecks": ten_checks,
        "lifecycleArtifactRef": artifact_ref,
        "composeFile": STEEL_REMOTE_COMPOSE_PATH,
        "proxyConfig": STEEL_REMOTE_CADDYFILE_PATH,
        "firewallRunbook": STEEL_REMOTE_FIREWALL_PATH,
        "tunnelRunbook": STEEL_REMOTE_WIREGUARD_PATH,
        "recoveryScript": STEEL_REMOTE_RECOVERY_SCRIPT_PATH,
        "command": "npm run sandbox:browser:steel-remote-readiness",
        "contractReadinessLabel": "contract readiness",
        "localHostReadinessLabel": "local-host readiness",
        "remoteHostReadinessLabel": "remote-host readiness",
        "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
        "rawEndpointReturned": False,
        "rawSecretReturned": False,
        "rawFrameReturned": False,
        "rawOcrTextReturned": False,
        "rawInputReturned": False
    }


def validate_visual_ocr_proof_manifest(manifest: dict[str, Any], *, proof_path: str | None = None) -> dict[str, Any]:
    failures: list[str] = []
    if manifest.get("schemaVersion") != VISUAL_OCR_PROOF_SCHEMA_VERSION:
        failures.append("visual_ocr_schema_version_missing_or_unknown")
    if manifest.get("providerLiveConnected") is not True:
        failures.append("provider_live_connected_required")
    session = manifest.get("session", {}) if isinstance(manifest.get("session"), dict) else {}
    stream = manifest.get("stream", {}) if isinstance(manifest.get("stream"), dict) else {}
    screenshot = manifest.get("screenshot", {}) if isinstance(manifest.get("screenshot"), dict) else {}
    ocr_caption = manifest.get("ocrCaption", {}) if isinstance(manifest.get("ocrCaption"), dict) else {}
    takeover = manifest.get("takeover", {}) if isinstance(manifest.get("takeover"), dict) else {}
    input_proof = manifest.get("input", {}) if isinstance(manifest.get("input"), dict) else {}
    teardown = manifest.get("teardown", {}) if isinstance(manifest.get("teardown"), dict) else {}
    visual_proof = manifest.get("visualProof", {}) if isinstance(manifest.get("visualProof"), dict) else {}
    safety = manifest.get("safety", {}) if isinstance(manifest.get("safety"), dict) else {}
    if session.get("sessionRefPresent") is not True:
        failures.append("session_ref_required")
    if session.get("rawSessionRefReturned") is True:
        failures.append("raw_session_ref_must_not_be_returned")
    if stream.get("frameRefPresent") is not True:
        failures.append("frame_ref_required")
    if stream.get("rawFrameReturned") is True or stream.get("rawFramePersisted") is True:
        failures.append("raw_frame_must_not_be_returned_or_persisted")
    if screenshot.get("screenshotRefPresent") is not True:
        failures.append("screenshot_ref_required")
    if screenshot.get("rawImageReturned") is True:
        failures.append("raw_image_must_not_be_returned")
    if ocr_caption.get("captionRefPresent") is not True:
        failures.append("caption_ref_required")
    if ocr_caption.get("rawOcrTextReturned") is True or ocr_caption.get("rawOcrTextPersisted") is True:
        failures.append("raw_ocr_text_must_not_be_returned_or_persisted")
    if ocr_caption.get("visualCaptionSafe") is not True:
        failures.append("visual_caption_safety_required")
    if takeover.get("approvalRequired") is not True:
        failures.append("takeover_approval_required")
    if takeover.get("inputRelay") != "approval_gated_human_only":
        failures.append("input_relay_must_be_human_only")
    if input_proof.get("rawInputReturned") is True:
        failures.append("raw_input_must_not_be_returned")
    if input_proof.get("externalWriteActionsWithoutApproval") is True:
        failures.append("external_write_actions_without_approval")
    if teardown.get("teardownComplete") is not True:
        failures.append("teardown_required")
    if teardown.get("rawFramePersisted") is True or teardown.get("rawOcrTextPersisted") is True:
        failures.append("raw_replay_content_must_not_be_persisted")
    if visual_proof.get("dashboardScreenshotRefPresent") is not True:
        failures.append("dashboard_screenshot_ref_required")
    if visual_proof.get("mobileLiveBlockRefPresent") is not True:
        failures.append("mobile_live_block_ref_required")
    if visual_proof.get("ocrCaptionRefPresent") is not True:
        failures.append("visual_ocr_caption_ref_required")
    if safety.get("agentCredentialEntryAllowed") is True:
        failures.append("agent_credential_entry_allowed")
    if safety.get("externalWriteActionsWithoutApproval") is True:
        failures.append("external_write_actions_without_approval")
    if safety.get("rawEndpointReturned") is True:
        failures.append("raw_endpoint_returned")
    if safety.get("rawSecretReturned") is True:
        failures.append("raw_secret_returned")
    if proof_path and _path_is_inside_repo(proof_path):
        failures.append("visual_ocr_proof_file_must_live_outside_git")
    serialized = json.dumps(manifest, separators=(",", ":"))
    if re.search(r"https?://[^\"\\\s]+", serialized, re.I):
        failures.append("raw_provider_url_forbidden")
    if re.search(r"Bearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9]|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]", serialized, re.I):
        failures.append("raw_secret_forbidden")
    if re.search(r"data:image|<html|member id|subscriber id|password|captcha|typed-password", serialized, re.I):
        failures.append("raw_frame_ocr_or_credential_content_forbidden")
    if re.search(r"/Users/|/private/|/tmp/|/var/folders|[A-Za-z]:\\", serialized, re.I):
        failures.append("raw_local_path_forbidden")
    return {
        "ok": len(failures) == 0,
        "failures": failures,
        "sanitizedProof": {
            "providerLiveConnected": manifest.get("providerLiveConnected") is True,
            "sessionRefPresent": session.get("sessionRefPresent") is True,
            "streamFrameRefPresent": stream.get("frameRefPresent") is True,
            "screenshotRefPresent": screenshot.get("screenshotRefPresent") is True,
            "captionRefPresent": ocr_caption.get("captionRefPresent") is True,
            "visualCaptionSafe": ocr_caption.get("visualCaptionSafe") is True,
            "approvalRequired": takeover.get("approvalRequired") is True,
            "inputRelay": takeover.get("inputRelay"),
            "teardownComplete": teardown.get("teardownComplete") is True,
            "dashboardScreenshotRefPresent": visual_proof.get("dashboardScreenshotRefPresent") is True,
            "mobileLiveBlockRefPresent": visual_proof.get("mobileLiveBlockRefPresent") is True,
            "rawFrameReturned": stream.get("rawFrameReturned") is True,
            "rawImageReturned": screenshot.get("rawImageReturned") is True,
            "rawOcrTextReturned": ocr_caption.get("rawOcrTextReturned") is True,
            "rawInputReturned": input_proof.get("rawInputReturned") is True,
            "proofFileOutsideGit": bool(proof_path and not _path_is_inside_repo(proof_path))
        }
    }


def describe_browser_sandbox_provider_contract(
    *,
    provider: str | None = None,
    config_path: str | None = None,
    ready: bool | None = None
) -> dict[str, Any]:
    selected_provider = provider or os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER", "local_cdp")
    selected_config_path = config_path or os.environ.get(
        "WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE",
        DEFAULT_PROVIDER_CONFIG_PATH
    )
    selected_ready = bool(ready if ready is not None else os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_READY") == "1")
    selection_contract = describe_browser_sandbox_provider_selection_contract()
    config = None
    config_ok = False
    failures: list[str] = []
    try:
        with open(selected_config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
    except Exception as exc:
        failures.append(f"config_unreadable:{exc}")
    if isinstance(config, dict):
        adapter_mode = config.get("adapter", {}).get("mode", "contract_only")
        provider_live_connected = config.get("adapter", {}).get("providerLiveConnected") is True
        contract_harness_only = config.get("adapter", {}).get("contractHarnessOnly") is True
        config_ok = (
            config.get("schemaVersion") == HOSTED_SANDBOX_CONTRACT_VERSION
            and config.get("provider") == "hosted_remote"
            and config.get("endpointRef")
            and not str(config.get("endpointRef")).startswith(("http://", "https://"))
            and adapter_mode in {"contract_only", "contract_harness", "hosted_provider"}
            and not (adapter_mode == "contract_harness" and provider_live_connected)
            and not (adapter_mode == "hosted_provider" and contract_harness_only)
            and not (adapter_mode == "hosted_provider" and not _is_env_ref(config.get("endpointRef")))
            and not (adapter_mode == "hosted_provider" and not _is_env_ref(config.get("auth", {}).get("tokenRef", DEFAULT_HOSTED_AUTH_TOKEN_REF)))
            and config.get("approvalPolicy", {}).get("agentCredentialEntryAllowed") is False
            and config.get("approvalPolicy", {}).get("externalWriteActionsAllowed") is False
            and config.get("sessionPolicy", {}).get("recordFrames") is False
            and config.get("sessionPolicy", {}).get("persistRawOcrText") is False
        )
        if not config_ok:
            failures.append("config_contract_failed")
    adapter_mode = config.get("adapter", {}).get("mode", "contract_only") if isinstance(config, dict) else "missing"
    hosted_resolution = resolve_hosted_browser_sandbox_provider_config(
        config=config if isinstance(config, dict) else None,
        config_path=selected_config_path,
        config_ok=config_ok,
        selected_provider=selected_provider,
        selected_ready=selected_ready
    )
    non_example_config = selected_config_path != DEFAULT_PROVIDER_CONFIG_PATH
    adapter_harness_ready = bool(
        selected_provider == "hosted_remote"
        and selected_ready
        and config_ok
        and non_example_config
        and adapter_mode == "contract_harness"
    )
    live_preflight_ready = bool(
        selection_contract["preflightReady"]
        and hosted_resolution["resolverReady"]
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_READY") == "1"
    )
    live_verification_ready = bool(
        live_preflight_ready
        and hosted_resolution["resolverReady"]
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY") == "1"
    )
    webrtc_signaling_ready = bool(
        live_verification_ready
        and hosted_resolution["resolverReady"]
        and hosted_resolution["streamRequiresWebrtc"]
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY") == "1"
    )
    visual_ocr_proof_path = os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_PROOF_FILE")
    visual_ocr_proof_manifest = _read_json_if_present(visual_ocr_proof_path)
    visual_ocr_proof_validation = (
        validate_visual_ocr_proof_manifest(visual_ocr_proof_manifest, proof_path=visual_ocr_proof_path)
        if visual_ocr_proof_manifest
        else {
            "ok": False,
            "failures": ["visual_ocr_proof_file_required"],
            "sanitizedProof": {}
        }
    )
    visual_ocr_replay_ready = bool(
        live_verification_ready
        and (not hosted_resolution["streamRequiresWebrtc"] or webrtc_signaling_ready)
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY") == "1"
        and visual_ocr_proof_path
        and visual_ocr_proof_validation["ok"]
    )
    steel_self_host_proof = _summarize_steel_self_host_proof()
    steel_operations = _summarize_steel_operations()
    steel_remote_host = _summarize_steel_remote_host()
    launch_runbook_text = _read_text_if_present(PROVIDER_LAUNCH_READINESS_RUNBOOK_PATH)
    launch_env_text = _read_text_if_present(PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH)
    launch_runbook_ready = bool(
        launch_runbook_text
        and "Launch Readiness Sequence" in launch_runbook_text
        and "hosted_remote_browser_sandbox" in launch_runbook_text
        and launch_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY=0" in launch_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0" in launch_env_text
    )
    private_proof_chain_ready = bool(
        launch_runbook_ready
        and selection_contract["preflightReady"]
        and hosted_resolution["resolverReady"]
        and live_verification_ready
        and (not hosted_resolution["streamRequiresWebrtc"] or webrtc_signaling_ready)
        and visual_ocr_replay_ready
        and selected_config_path
        and not _path_is_inside_repo(selected_config_path)
        and visual_ocr_proof_path
        and not _path_is_inside_repo(visual_ocr_proof_path)
    )
    final_enablement_allowed = bool(
        os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY") == "1"
        and private_proof_chain_ready
        and hosted_resolution["resolverReady"]
        and hosted_resolution["liveVerified"]
        and hosted_resolution["liveVerificationReady"]
        and hosted_resolution["providerLiveConnected"]
    )
    private_launch_execution_env_text = _read_text_if_present(PROVIDER_PRIVATE_LAUNCH_EXECUTION_ENV_EXAMPLE_PATH)
    private_launch_execution_env_ready = bool(
        private_launch_execution_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY=0" in private_launch_execution_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED=0" in private_launch_execution_env_text
        and "WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=0" in private_launch_execution_env_text
    )
    private_launch_execution_ready = bool(
        private_launch_execution_env_ready
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY") == "1"
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED") == "1"
        and private_proof_chain_ready
        and final_enablement_allowed
    )
    execution_write_gate = {
        "status": (
            "execution_v2_write_gate_ready"
            if os.environ.get("WEFELLA_EXECUTION_WRITE_ENABLED") == "1" and private_launch_execution_ready
            else "execution_v2_write_gate_blocked"
        ),
        "writeEnabled": os.environ.get("WEFELLA_EXECUTION_WRITE_ENABLED") == "1",
        "requiresPrivateLaunchExecution": True,
        "privateLaunchExecutionReady": private_launch_execution_ready,
        "committedDefaultOff": True,
        "credentialEntryAllowed": False,
        "autonomousWritesAllowed": False
    }
    provider_ready = bool(
        selected_provider == "hosted_remote"
        and selected_ready
        and config_ok
        and non_example_config
        and adapter_mode == "hosted_provider"
        and hosted_resolution["resolverReady"]
        and hosted_resolution["liveVerified"]
        and hosted_resolution["liveVerificationReady"]
        and hosted_resolution["webrtcSignalingReady"]
        and hosted_resolution["visualOcrReplayReady"]
        and visual_ocr_replay_ready
        and hosted_resolution["providerLiveConnected"]
        and private_launch_execution_ready
        and steel_remote_host["ok"]
    )
    adapter_contract_ready = bool(
        selected_provider == "hosted_remote"
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_ADAPTER_CONTRACT_READY") == "1"
        and config_ok
        and non_example_config
        and adapter_mode == "hosted_provider"
        and hosted_resolution["resolverReady"]
        and not provider_ready
    )
    http_adapter_harness_ready = bool(
        adapter_contract_ready
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_HTTP_ADAPTER_HARNESS_READY") == "1"
    )
    live_lifecycle_harness_ready = bool(
        http_adapter_harness_ready
        and os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_LIFECYCLE_HARNESS_READY") == "1"
    )
    status = (
        "hosted_browser_sandbox_provider_ready"
        if provider_ready
        else "hosted_browser_sandbox_adapter_harness_ready" if adapter_harness_ready
        else "hosted_browser_sandbox_provider_visual_ocr_replay_ready" if visual_ocr_replay_ready
        else "hosted_browser_sandbox_provider_live_lifecycle_harness_ready" if live_lifecycle_harness_ready
        else "hosted_browser_sandbox_provider_http_adapter_harness_ready" if http_adapter_harness_ready
        else "hosted_browser_sandbox_provider_adapter_contract_ready" if adapter_contract_ready
        else "local_cdp_default" if selected_provider == "local_cdp"
        else hosted_resolution["status"] if adapter_mode == "hosted_provider" and config_ok
        else "hosted_browser_sandbox_contract_valid_not_configured" if config_ok
        else "hosted_browser_sandbox_contract_missing_or_invalid"
    )
    return {
        "version": HOSTED_SANDBOX_CONTRACT_VERSION,
        "provider": selected_provider,
        "configPath": _public_path_ref(selected_config_path, private_label="[private-provider-config-outside-git]"),
        "configOk": config_ok,
        "adapterMode": adapter_mode,
        "ready": provider_ready,
        "adapterHarnessReady": adapter_harness_ready,
        "hostedProviderResolverReady": hosted_resolution["resolverReady"],
        "hostedProviderSelectionReady": selection_contract["contractReady"],
        "hostedProviderSelectionPreflightReady": selection_contract["preflightReady"],
        "hostedProviderSelection": selection_contract,
        "hostedProviderLivePreflightReady": live_preflight_ready,
        "hostedProviderLivePreflight": {
            "status": (
                "hosted_browser_sandbox_provider_live_preflight_ready"
                if live_preflight_ready
                else "hosted_browser_sandbox_provider_live_preflight_requires_explicit_gate"
                if selection_contract["preflightReady"] and hosted_resolution["resolverReady"]
                else "hosted_browser_sandbox_provider_live_preflight_blocked"
            ),
            "resolverReady": hosted_resolution["resolverReady"],
            "selectionPreflightReady": selection_contract["preflightReady"],
            "liveProbeEnabled": os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_PROBE") == "1",
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False
        },
        "hostedProviderLiveVerificationReady": live_verification_ready,
        "hostedProviderLiveVerification": {
            "status": (
                "hosted_browser_sandbox_provider_live_verification_ready"
                if live_verification_ready
                else "hosted_browser_sandbox_provider_live_verification_requires_explicit_gate"
                if live_preflight_ready
                else "hosted_browser_sandbox_provider_live_verification_blocked"
            ),
            "resolverReady": hosted_resolution["resolverReady"],
            "livePreflightReady": live_preflight_ready,
            "providerLiveConnected": hosted_resolution.get("providerLiveConnected") is True,
            "liveVerified": hosted_resolution.get("liveVerified") is True,
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False
        },
        "hostedProviderSteelSelfHostProofReady": steel_self_host_proof["ok"],
        "hostedProviderSteelSelfHostProof": steel_self_host_proof,
        "hostedProviderSteelOperationsReady": steel_operations["ok"],
        "hostedProviderSteelOperations": steel_operations,
        "hostedProviderSteelRemoteHostReady": steel_remote_host["ok"],
        "hostedProviderSteelRemoteHost": steel_remote_host,
        "hostedProviderWebrtcSignalingReady": webrtc_signaling_ready,
        "hostedProviderWebrtcSignaling": {
            "status": (
                "hosted_browser_sandbox_provider_webrtc_signaling_ready"
                if webrtc_signaling_ready
                else "hosted_browser_sandbox_provider_webrtc_signaling_requires_explicit_gate"
                if live_verification_ready and hosted_resolution["streamRequiresWebrtc"]
                else "hosted_browser_sandbox_provider_webrtc_signaling_not_required"
                if not hosted_resolution["streamRequiresWebrtc"]
                else "hosted_browser_sandbox_provider_webrtc_signaling_blocked"
            ),
            "resolverReady": hosted_resolution["resolverReady"],
            "liveVerificationReady": live_verification_ready,
            "streamRequiresWebrtc": hosted_resolution["streamRequiresWebrtc"],
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawSdpReturned": False,
            "rawIceCandidateReturned": False
        },
        "hostedProviderVisualOcrReplayReady": visual_ocr_replay_ready,
        "hostedProviderVisualOcrReplay": {
            "status": (
                "hosted_browser_sandbox_provider_visual_ocr_replay_ready"
                if visual_ocr_replay_ready
                else "hosted_browser_sandbox_provider_visual_ocr_replay_requires_private_proof"
                if os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY") == "1"
                else "hosted_browser_sandbox_provider_visual_ocr_replay_blocked"
            ),
            "liveVerificationReady": live_verification_ready,
            "webrtcSignalingReady": webrtc_signaling_ready,
            "streamRequiresWebrtc": hosted_resolution["streamRequiresWebrtc"],
            "proofFilePresent": bool(visual_ocr_proof_path),
            "proofFileOutsideGit": bool(visual_ocr_proof_validation.get("sanitizedProof", {}).get("proofFileOutsideGit")),
            "proofValidationOk": visual_ocr_proof_validation["ok"],
            "failures": visual_ocr_proof_validation.get("failures", []),
            "sanitizedProof": visual_ocr_proof_validation.get("sanitizedProof", {}),
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawFrameReturned": False,
            "rawOcrTextReturned": False,
            "rawInputReturned": False
        },
        "hostedProviderLaunchReadinessRunbookReady": launch_runbook_ready,
        "hostedProviderPrivateProofChainReady": private_proof_chain_ready,
        "hostedProviderFinalEnablementAllowed": final_enablement_allowed,
        "hostedProviderLaunchReadiness": {
            "status": (
                "hosted_browser_sandbox_provider_launch_ready"
                if final_enablement_allowed
                else "hosted_browser_sandbox_provider_launch_waiting_final_enablement"
                if private_proof_chain_ready
                else "hosted_browser_sandbox_provider_launch_runbook_ready"
                if launch_runbook_ready
                else "hosted_browser_sandbox_provider_launch_runbook_incomplete"
            ),
            "runbookReady": launch_runbook_ready,
            "privateProofChainReady": private_proof_chain_ready,
            "finalEnablementAllowed": final_enablement_allowed,
            "envExample": PROVIDER_LAUNCH_READINESS_ENV_EXAMPLE_PATH,
            "runbook": PROVIDER_LAUNCH_READINESS_RUNBOOK_PATH,
            "command": "npm run sandbox:browser:provider-launch-readiness",
            "configOutsideGit": bool(selected_config_path and not _path_is_inside_repo(selected_config_path)),
            "proofFileOutsideGit": bool(visual_ocr_proof_path and not _path_is_inside_repo(visual_ocr_proof_path)),
            "missing": (
                ([] if selection_contract["preflightReady"] else ["selection_preflight"])
                + ([] if live_verification_ready else ["live_verification"])
                + ([] if (not hosted_resolution["streamRequiresWebrtc"] or webrtc_signaling_ready) else ["webrtc_signaling"])
                + ([] if visual_ocr_replay_ready else ["visual_ocr_replay_private_proof"])
                + ([] if selected_config_path and not _path_is_inside_repo(selected_config_path) else ["private_provider_config_outside_git"])
                + ([] if visual_ocr_proof_path and not _path_is_inside_repo(visual_ocr_proof_path) else ["private_visual_ocr_proof_outside_git"])
                + ([] if hosted_resolution.get("status") == "hosted_browser_sandbox_provider_ready" else ["final_live_verified_switch"])
            ),
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawFrameReturned": False,
            "rawOcrTextReturned": False,
            "rawInputReturned": False
        },
        "hostedProviderPrivateLaunchExecutionReady": private_launch_execution_ready,
        "hostedProviderPrivateLaunchExecution": {
            "status": (
                "hosted_browser_sandbox_provider_private_launch_executed"
                if private_launch_execution_ready
                else "hosted_browser_sandbox_provider_private_launch_execution_blocked"
                if os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY") == "1"
                else "hosted_browser_sandbox_provider_private_launch_execution_not_enabled"
            ),
            "envExampleReady": private_launch_execution_env_ready,
            "executionGate": os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY") == "1",
            "finalHumanReviewed": os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED") == "1",
            "privateProofChainReady": private_proof_chain_ready,
            "finalEnablementAllowed": final_enablement_allowed,
            "command": "npm run sandbox:browser:provider-private-launch-execution",
            "envExample": PROVIDER_PRIVATE_LAUNCH_EXECUTION_ENV_EXAMPLE_PATH,
            "missing": (
                ([] if private_launch_execution_env_ready else ["private_launch_execution_env_template"])
                + ([] if os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY") == "1" else ["private_launch_execution_gate"])
                + ([] if private_proof_chain_ready else ["private_proof_chain_ready"])
                + ([] if final_enablement_allowed else ["launch_final_enablement_allowed"])
                + ([] if os.environ.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED") == "1" else ["final_human_review"])
            ),
            "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawFrameReturned": False,
            "rawOcrTextReturned": False,
            "rawInputReturned": False
        },
        "executionV2WriteGate": execution_write_gate,
        "hostedProviderAdapterReady": adapter_contract_ready,
        "hostedProviderHttpAdapterReady": http_adapter_harness_ready,
        "hostedProviderLiveLifecycleHarnessReady": live_lifecycle_harness_ready,
        "hostedProviderResolver": hosted_resolution,
        "status": status,
        "failures": failures,
        "safety": {
            "rawEndpointReturned": False,
            "rawSecretReturned": False,
            "rawOcrTextReturned": False,
            "agentCredentialEntryAllowed": False,
            "externalWriteActionsAllowed": False
        }
    }


def describe_browser_sandbox_provider_selection_contract(
    *,
    config_path: str | None = None,
    environ: dict[str, str] | None = None
) -> dict[str, Any]:
    env = environ if environ is not None else os.environ
    selected_config_path = config_path or env.get(
        "WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_FILE",
        DEFAULT_PROVIDER_SELECTION_CONFIG_PATH
    )
    failures: list[str] = []
    config: dict[str, Any] | None = None
    try:
        with open(selected_config_path, "r", encoding="utf-8") as handle:
            config = json.load(handle)
    except Exception as exc:
        failures.append(f"selection_config_unreadable:{exc}")
    candidate_keys: list[str] = []
    if isinstance(config, dict):
        candidates = config.get("candidateProviders")
        candidate_list = candidates if isinstance(candidates, list) else []
        candidate_keys = [str(candidate.get("key")) for candidate in candidate_list if isinstance(candidate, dict) and candidate.get("key")]
        required_policy = config.get("selectionPolicy", {})
        required_visual = config.get("visualProof", {})
        contract_ok = (
            config.get("schemaVersion") == "brainstyworkers.browser-sandbox-provider-selection.v1"
            and config.get("status") == "selection_contract_only"
            and config.get("environment") in {"staging", "production"}
            and len(candidate_keys) >= 3
            and required_policy.get("privateConfigRequired") is True
            and required_policy.get("publicApiOnly") is True
            and required_policy.get("noProviderSecretsInGit") is True
            and required_policy.get("liveProviderVerificationRequired") is True
            and required_policy.get("guiOcrProofRequired") is True
            and required_policy.get("hostedRemoteScoreMustRemainBlockedUntilLive") is True
            and required_visual.get("dashboardRequired") is True
            and required_visual.get("mobilePwaRequired") is True
            and required_visual.get("liveWorkerBlockRequired") is True
            and required_visual.get("ocrCaptionRequired") is True
            and not any("://" in str(candidate) for candidate in candidate_list)
        )
    else:
        contract_ok = False
    if not contract_ok and "selection_config_unreadable" not in ",".join(failures):
        failures.append("selection_contract_failed")
    selected_provider = env.get("WEFELLA_BROWSER_SANDBOX_SELECTED_PROVIDER")
    selected_provider_known = bool(selected_provider and selected_provider in candidate_keys)
    preflight_ready = bool(
        contract_ok
        and env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY") == "1"
        and selected_provider_known
    )
    return {
        "status": (
            "hosted_browser_sandbox_provider_selection_preflight_ready"
            if preflight_ready
            else "hosted_browser_sandbox_provider_selection_contract_ready" if contract_ok
            else "hosted_browser_sandbox_provider_selection_missing_or_invalid"
        ),
        "contractReady": contract_ok,
        "preflightReady": preflight_ready,
        "configPath": _public_path_ref(selected_config_path, private_label="[private-selection-config-outside-git]"),
        "candidateKeys": candidate_keys,
        "selectedProviderKnown": selected_provider_known,
        "selectedProviderKey": selected_provider if selected_provider_known else None,
        "rawEndpointReturned": False,
        "rawSecretReturned": False,
        "hostedRemoteScoreMayPassOnlyAfterLiveVerified": True,
        "failures": failures
    }


def _is_env_ref(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("env:") and len(value) > 4


def _env_name_from_ref(value: Any) -> str | None:
    return value[4:] if _is_env_ref(value) else None


def _ref_kind(value: Any) -> str | None:
    if not value:
        return None
    text = str(value)
    if _is_env_ref(text):
        return "env"
    if text.startswith(("http://", "https://")):
        return "raw_url"
    return "logical_ref"


def _is_https_endpoint(value: Any) -> bool:
    return isinstance(value, str) and value.startswith("https://") and len(value) > len("https://")


def resolve_hosted_browser_sandbox_provider_config(
    *,
    config: dict[str, Any] | None,
    config_path: str,
    config_ok: bool,
    selected_provider: str,
    selected_ready: bool,
    environ: dict[str, str] | None = None
) -> dict[str, Any]:
    env = environ if environ is not None else os.environ
    adapter_mode = config.get("adapter", {}).get("mode", "missing") if isinstance(config, dict) else "missing"
    non_example_config = config_path != DEFAULT_PROVIDER_CONFIG_PATH
    endpoint_ref = config.get("endpointRef") if isinstance(config, dict) else None
    auth_token_ref = config.get("auth", {}).get("tokenRef", DEFAULT_HOSTED_AUTH_TOKEN_REF) if isinstance(config, dict) else DEFAULT_HOSTED_AUTH_TOKEN_REF
    endpoint_env_name = _env_name_from_ref(endpoint_ref)
    auth_env_name = _env_name_from_ref(auth_token_ref)
    endpoint_resolved = bool(endpoint_env_name and _is_https_endpoint(env.get(endpoint_env_name)))
    auth_resolved = bool(auth_env_name and env.get(auth_env_name))
    live_verified = env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED") == "1"
    live_verification_ready = env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFICATION_READY") == "1"
    provider_live_connected = bool(isinstance(config, dict) and config.get("adapter", {}).get("providerLiveConnected") is True)
    stream_transport = config.get("transport", {}).get("stream") if isinstance(config, dict) else None
    stream_requires_webrtc = stream_transport in {"webrtc", "webrtc_or_sse_frames"}
    webrtc_signaling_ready = (not stream_requires_webrtc) or env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_WEBRTC_SIGNALING_READY") == "1"
    visual_ocr_replay_ready = env.get("WEFELLA_BROWSER_SANDBOX_PROVIDER_VISUAL_OCR_REPLAY_READY") == "1"
    resolver_ready = bool(
        selected_provider == "hosted_remote"
        and selected_ready
        and config_ok
        and non_example_config
        and adapter_mode == "hosted_provider"
        and endpoint_resolved
        and auth_resolved
    )
    status = (
        "hosted_browser_sandbox_provider_ready"
        if resolver_ready and live_verified and live_verification_ready and webrtc_signaling_ready and visual_ocr_replay_ready and provider_live_connected
        else "hosted_browser_sandbox_provider_configured_unverified" if resolver_ready
        else "hosted_browser_sandbox_provider_missing_endpoint_or_secret"
        if selected_provider == "hosted_remote" and selected_ready and config_ok and non_example_config and adapter_mode == "hosted_provider"
        else "hosted_browser_sandbox_provider_not_selected"
    )
    return {
        "status": status,
        "resolverReady": resolver_ready,
        "endpointResolved": endpoint_resolved,
        "authResolved": auth_resolved,
        "liveVerified": live_verified,
        "liveVerificationReady": live_verification_ready,
        "providerLiveConnected": provider_live_connected,
        "streamRequiresWebrtc": stream_requires_webrtc,
        "webrtcSignalingReady": webrtc_signaling_ready,
        "visualOcrReplayReady": visual_ocr_replay_ready,
        "endpointRefKind": _ref_kind(endpoint_ref),
        "authTokenRefKind": _ref_kind(auth_token_ref),
        "endpointEnvPresent": bool(endpoint_env_name),
        "authEnvPresent": bool(auth_env_name),
        "rawEndpointReturned": False,
        "rawSecretReturned": False,
        "rawSecretPathReturned": False
    }


async def hosted_browser_sandbox_harness_stream(browser_session: dict[str, Any]) -> AsyncIterator[str]:
    payload = {
        "eventType": "hosted.sandbox.contract_frame",
        "browserSessionId": browser_session.get("browser_session_id"),
        "sessionId": browser_session.get("session_id"),
        "provider": "hosted_remote",
        "adapterMode": "contract_harness",
        "providerLiveConnected": False,
        "frameSource": "hosted_contract_harness",
        "caption": {
            "status": "caption_contract_ready",
            "rawOcrTextReturned": False
        },
        "safety": {
            "rawFrameReturned": False,
            "rawOcrTextReturned": False,
            "externalWriteActionsWithoutApproval": False
        }
    }
    yield f"event: hosted.sandbox.contract_frame\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


async def hosted_browser_sandbox_provider_stream(browser_session: dict[str, Any]) -> AsyncIterator[str]:
    provider = HostedRemoteBrowserSandboxProvider()
    if browser_session.get("provider_strategy") == "steel-self-host":
        # Preferred path: persistent CDP screencast (10-30 fps). Falls back to the legacy
        # one-screenshot-per-second loop below if the screencast bridge can't start.
        bridge = None
        if os.environ.get("WEFELLA_BROWSER_SANDBOX_SCREENCAST_DISABLED") != "1":
            try:
                bridge = await get_unified_bridge(browser_session.get("browser_session_id"))
            except Exception:
                bridge = None
        if bridge is not None:
            # Subscribe to the SINGLE persistent bridge's frame stream. The bridge is NOT
            # torn down when this stream ends (keep the logged-in session alive after the
            # viewer is hidden); only this subscriber unsubscribes.
            loop = asyncio.get_event_loop()
            start = loop.time()
            max_seconds = max(5, min(900, int(os.environ.get("WEFELLA_BROWSER_SANDBOX_SCREENCAST_MAX_SECONDS", "240"))))
            frame_count = 0
            async for frame in bridge.frames():
                if loop.time() - start >= max_seconds:
                    break
                metadata = frame.get("metadata") if isinstance(frame.get("metadata"), dict) else {}
                safe_payload = {
                    "eventType": "hosted.sandbox.steel_cdp_screencast_frame",
                    "browserSessionId": browser_session.get("browser_session_id"),
                    "sessionId": browser_session.get("session_id"),
                    "provider": "hosted_remote",
                    "adapterMode": "hosted_provider",
                    "providerStrategy": "steel-self-host",
                    "providerLiveConnected": True,
                    "mime": "image/jpeg",
                    "data": frame.get("data", ""),
                    "metadata": {
                        "title": metadata.get("title"),
                        "urlHost": _safe_host(metadata.get("url")),
                        "width": metadata.get("width"),
                        "height": metadata.get("height"),
                        "capturedAt": now_iso()
                    },
                    "safety": {
                        "rawFrameReturnedToAuthorizedUser": True,
                        "rawFrameRecorded": False,
                        "rawOcrTextReturned": False,
                        "externalWriteActionsWithoutApproval": False
                    }
                }
                yield f"event: hosted.sandbox.frame\ndata: {json.dumps(safe_payload, separators=(',', ':'))}\n\n"
                frame_count += 1
            yield "event: hosted.sandbox.frame_stream_complete\ndata: " + json.dumps({
                "eventType": "hosted.sandbox.frame_stream_complete",
                "browserSessionId": browser_session.get("browser_session_id"),
                "providerLiveConnected": True,
                "frameSource": "steel_self_host_cdp_screencast_stream",
                "frameCount": frame_count,
                "safety": {"rawFrameRecorded": False, "rawOcrTextReturned": False}
            }, separators=(',', ':')) + "\n\n"
            return
        frame_limit = max(1, min(300, int(os.environ.get("WEFELLA_BROWSER_SANDBOX_STREAM_FRAME_LIMIT", "180"))))
        for _ in range(frame_limit):
            try:
                frame = await provider._capture_steel_self_host_frame()
                metadata = frame.get("metadata") if isinstance(frame.get("metadata"), dict) else {}
                safe_payload = {
                    "eventType": "hosted.sandbox.steel_cdp_frame",
                    "browserSessionId": browser_session.get("browser_session_id"),
                    "sessionId": browser_session.get("session_id"),
                    "provider": "hosted_remote",
                    "adapterMode": "hosted_provider",
                    "providerStrategy": "steel-self-host",
                    "providerLiveConnected": True,
                    "mime": frame.get("mime", "image/jpeg"),
                    "data": frame.get("data", ""),
                    "metadata": {
                        "title": metadata.get("title"),
                        "urlHost": _safe_host(metadata.get("url")),
                        "width": metadata.get("width"),
                        "height": metadata.get("height"),
                        "capturedAt": now_iso()
                    },
                    "safety": {
                        "rawFrameReturnedToAuthorizedUser": True,
                        "rawFrameRecorded": False,
                        "rawOcrTextReturned": False,
                        "externalWriteActionsWithoutApproval": False
                    }
                }
                yield f"event: hosted.sandbox.frame\ndata: {json.dumps(safe_payload, separators=(',', ':'))}\n\n"
            except Exception as exc:
                error_payload = {
                    "eventType": "hosted.sandbox.frame_error",
                    "browserSessionId": browser_session.get("browser_session_id"),
                    "providerLiveConnected": True,
                    "error": "steel_cdp_frame_unavailable",
                    "detail": str(exc)[:200]
                }
                yield f"event: hosted.sandbox.frame_error\ndata: {json.dumps(error_payload, separators=(',', ':'))}\n\n"
            await asyncio.sleep(1)
        done_payload = {
            "eventType": "hosted.sandbox.frame_stream_complete",
            "browserSessionId": browser_session.get("browser_session_id"),
            "providerLiveConnected": True,
            "frameSource": "steel_self_host_cdp_screenshot_stream",
            "safety": {
                "rawFrameRecorded": False,
                "rawOcrTextReturned": False
            }
        }
        yield f"event: hosted.sandbox.frame_stream_complete\ndata: {json.dumps(done_payload, separators=(',', ':'))}\n\n"
        return
    config = provider._load_private_config()
    endpoint, token = provider._endpoint_and_token(config)
    stream_path = browser_session.get("provider_paths", {}).get("stream") or f"browser/sessions/{browser_session['provider_session_ref']}/stream"
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "GET",
            str(httpx.URL(endpoint).join(str(stream_path).lstrip("/"))),
            headers={
                "accept": "text/event-stream",
                "authorization": f"Bearer {token}",
                "x-brainstyworkers-contract-version": HOSTED_PROVIDER_ADAPTER_CONTRACT_VERSION
            }
        ) as response:
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                try:
                    event_payload = json.loads(line.removeprefix("data:").strip())
                except Exception:
                    continue
                safe_payload = {
                    "eventType": event_payload.get("eventType", "hosted.sandbox.provider_frame"),
                    "browserSessionId": browser_session.get("browser_session_id"),
                    "sessionId": browser_session.get("session_id"),
                    "provider": "hosted_remote",
                    "adapterMode": "hosted_provider",
                    "providerLiveConnected": event_payload.get("providerLiveConnected") is True,
                    "frameRefPresent": bool(event_payload.get("frameRef")),
                    "captionRefPresent": bool(event_payload.get("ocrCaption", {}).get("captionRef")),
                    "safety": {
                        "rawFrameReturned": event_payload.get("rawFrameReturned") is True,
                        "rawOcrTextReturned": event_payload.get("ocrCaption", {}).get("rawOcrTextReturned") is True,
                        "externalWriteActionsWithoutApproval": False
                    }
                }
                if safe_payload["safety"]["rawFrameReturned"] or safe_payload["safety"]["rawOcrTextReturned"]:
                    yield f"event: hosted.sandbox.provider_blocked\ndata: {json.dumps({'eventType': 'hosted.sandbox.provider_blocked', 'reason': 'raw_frame_or_ocr_blocked'}, separators=(',', ':'))}\n\n"
                    return
                yield f"event: hosted.sandbox.provider_frame\ndata: {json.dumps(safe_payload, separators=(',', ':'))}\n\n"


def get_browser_sandbox_provider(provider: str | None) -> BrowserSandboxProvider:
    if provider in {None, "local_cdp"}:
        return LocalCdpBrowserSandboxProvider()
    if provider == "hosted_remote":
        return HostedRemoteBrowserSandboxProvider()
    raise BrowserSandboxError(f"Unsupported browser sandbox provider: {provider}")
