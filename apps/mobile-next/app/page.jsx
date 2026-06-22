"use client";

import { useEffect, useRef, useState } from "react";
import { checkOpenClaw, createBrowserSession, getTask, startSession, startTask } from "../lib/api";

const DEFAULT_MEMBER = {
  name: "Marcelo Felix",
  email: "mocfelix@gmail.com",
  payer: "Aetna",
  portalUrl: "https://www.aetna.com/"
};

const STEPS = ["Session", "Journey", "Approval", "Worker", "Evidence", "Answer"];
const TASK_FINAL_STATES = new Set(["approval_pending", "evidence_blocked", "completed", "refused", "failed"]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function userFacingAnswer(detail) {
  const answer = detail?.answer;
  if (!answer) {
    return {
      title: "Start a session and ask a benefits question.",
      copy: "No source pointers yet."
    };
  }
  const sourceCount = detail?.source_pointers?.length || 0;
  let copy = String(answer)
    .replace(/LangGraph routed[\s\S]*?Reviewed evidence used:\s*/i, "Here is what I found from the reviewed evidence:\n")
    .replace(/Routing evidence:[\s\S]*?\n\n/gi, "")
    .replace(/Source pointers:[\s\S]*?(?=This answer is limited|$)/gi, "")
    .replace(/\(confidence [^)]+\)/gi, "")
    .replace(/-\s*Phase [^\n:]{0,220}:\s*/gi, "- ")
    .replace(/-\s*Phase [^:\n]{0,140}:[a-z0-9:_-]+:\s*/gi, "- ")
    .replace(/^-\s*Phase\s+\d+[A-Z]?\s+[^.\n]*?\b(The annual|The plan|The exact)/gim, "- $1")
    .replace(/\b(?:phase10|exact|unique|artifact)[a-z0-9:_-]*\s+says\s+/gi, "")
    .replace(/\s*Contact\s+\[redacted-[^\]]+\][^.]*\./gi, "")
    .replace(/\s*\[redacted-[^\]]+\][^.]*\./gi, ".")
    .replace(/\s*Fixture contact\s+\[redacted-[^\]]+\][^.]*\./gi, "")
    .replace(/\s*SSN\s+\[[^\]]+\][^.]*\./gi, "")
    .split("\n")
    .filter((line) => !/\b(audit|fixture|source pointer|SSN|credential|payer contact|raw document)\b/i.test(line))
    .join("\n")
    .replace(/\.\.\./g, "")
    .replace(/\.\.+/g, ".")
    .replace(/\bDB_POINTER:[^\s)]+/gi, "source pointer")
    .replace(/This answer is limited to reviewed, citation-approved research artifacts\.[\s\S]*$/i, "This answer is limited to reviewed, cited artifacts.")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!copy) copy = answer;
  return {
    title: sourceCount ? "Benefits answer ready" : "Answer ready",
    copy
  };
}

export default function MobileMvp() {
  const [member, setMember] = useState(DEFAULT_MEMBER);
  const [auth, setAuth] = useState(null);
  const [task, setTask] = useState(null);
  const [worker, setWorker] = useState(null);
  const [frameSrc, setFrameSrc] = useState("");
  const [liveStatus, setLiveStatus] = useState("not opened");
  const [message, setMessage] = useState("Do I still owe anything before insurance starts paying?");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const streamAbortRef = useRef(null);
  const liveTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current);
    };
  }, []);

  async function run(label, action) {
    setError("");
    setStatus(label);
    try {
      await action();
      setStatus("Ready");
    } catch (err) {
      setError(err.message);
      setStatus("Needs attention");
    }
  }

  async function handleStartSession() {
    await run("Starting session", async () => {
      const result = await startSession(member);
      setAuth(result);
    });
  }

  async function handleStartTask(nextMessage = message) {
    if (!auth?.access_token) {
      await handleStartSession();
    }
    await run("Starting journey", async () => {
      const session = auth || (await startSession(member));
      if (!auth) setAuth(session);
      const accepted = await startTask(session.access_token, {
        journey: "eligibility_benefits_navigation",
        message: nextMessage,
        session_id: session.session_id,
        member,
        client_context: {
          surface: "next_mobile_pwa",
          useLiveModel: true,
          payloadMode: "phi_allowed_identifier_masked_reasoning"
        },
        use_live_model: true
      });
      setTask({ accepted, detail: null });
      let detail = await getTask(session.access_token, accepted.task_id);
      setTask({ accepted, detail });
      for (let attempt = 0; attempt < 30 && !TASK_FINAL_STATES.has(detail.status); attempt += 1) {
        setStatus("Waiting for answer");
        await delay(1000);
        detail = await getTask(session.access_token, accepted.task_id);
        setTask({ accepted, detail });
      }
    });
  }

  async function handleCheckWorker() {
    if (!auth?.access_token) return;
    await run("Checking worker", async () => {
      const readiness = await checkOpenClaw(auth.access_token);
      setWorker((prev) => ({ ...(prev || {}), readiness }));
    });
  }

  async function handleLiveView() {
    if (!auth?.access_token || !auth?.session_id) return;
    await run("Opening live view", async () => {
      const browser = await createBrowserSession(auth.access_token, {
        session_id: auth.session_id,
        target_url: member.portalUrl,
        provider: "local_cdp"
      });
      setWorker((prev) => ({ ...(prev || {}), browser }));
      setFrameSrc("");
      if (!browser?.screencast?.ok && browser?.ocr_caption?.status !== "visual_frame_available") {
        setLiveStatus(readableBrowserBlocker(browser));
        return;
      }
      connectBrowserStream(browser.stream_url, auth.access_token);
    });
  }

  async function connectBrowserStream(streamUrl, token) {
    streamAbortRef.current?.abort();
    if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current);
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setLiveStatus("connecting");
    try {
      const response = await fetch(streamUrl, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        setLiveStatus(`stream unavailable (${response.status})`);
        return;
      }
      setLiveStatus("waiting for frames");
      liveTimeoutRef.current = setTimeout(() => {
        setLiveStatus("worker browser unavailable: no visual frame received");
        controller.abort();
      }, 4500);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const parsed = parseSseChunk(chunk);
          if (parsed.event === "browser.frame" && parsed.data) {
            const frame = JSON.parse(parsed.data);
            if (frame.data) {
              if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current);
              setFrameSrc(`data:${frame.mime || "image/jpeg"};base64,${frame.data}`);
              setLiveStatus("live");
            }
          } else if (parsed.event === "error" && parsed.data) {
            setLiveStatus(`stream error: ${parsed.data.slice(0, 120)}`);
          }
        }
      }
      setLiveStatus("closed");
    } catch (err) {
      if (err.name !== "AbortError") setLiveStatus(`stream error: ${err.message}`);
    }
  }

  function readableBrowserBlocker(browser) {
    const readiness = browser?.readiness || {};
    const statusText = readiness.status || browser?.screencast?.status || "browser_unavailable";
    const nextAction = readiness.nextAction || "Start the approved remote browser sandbox or dedicated OpenClaw profile, then try Live again.";
    return `${statusText}: ${nextAction}`;
  }

  function parseSseChunk(chunk) {
    const lines = chunk.split("\n");
    let event = "message";
    const data = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    return { event, data: data.join("\n") };
  }

  const taskStatus = task?.detail?.status || task?.accepted?.status || "not_started";
  const sourceCount = task?.detail?.source_pointers?.length || 0;
  const activeStep = sourceCount ? "Answer" : taskStatus === "approval_pending" ? "Approval" : worker?.browser ? "Worker" : auth ? "Journey" : "Session";
  const answerView = userFacingAnswer(task?.detail);

  return (
    <main className="mobile-shell">
      <header className="top">
        <div>
          <p>Brainstyworkers</p>
          <h1>Concierge</h1>
        </div>
        <span>{status}</span>
      </header>

      <section className="step-strip" aria-label="Progress">
        {STEPS.map((step) => (
          <span key={step} className={step === activeStep ? "active" : ""}>{step}</span>
        ))}
      </section>

      <section className="surface">
        <p className="eyebrow">Current Answer</p>
        <h2>{answerView.title}</h2>
        <p className="answer-copy">{answerView.copy}</p>
        <p>{sourceCount ? `${sourceCount} source pointer(s) attached.` : "No source pointers yet."}</p>
      </section>

      <section className="controls" aria-label="Session">
        <label>
          Name
          <input value={member.name} onChange={(event) => setMember({ ...member, name: event.target.value })} />
        </label>
        <label>
          Email
          <input value={member.email} onChange={(event) => setMember({ ...member, email: event.target.value })} />
        </label>
        <label>
          Payer
          <input value={member.payer} onChange={(event) => setMember({ ...member, payer: event.target.value })} />
        </label>
        <label>
          Question
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <div className="actions">
          <button type="button" onClick={handleStartSession}>Session</button>
          <button type="button" onClick={() => handleStartTask()}>Ask</button>
          <button type="button" onClick={handleCheckWorker} disabled={!auth}>Worker</button>
          <button type="button" onClick={handleLiveView} disabled={!auth}>Live</button>
        </div>
      </section>

      <section className="proof">
        <h2>Proof</h2>
        <dl>
          <dt>API</dt>
          <dd>/api/v1 only</dd>
          <dt>Session</dt>
          <dd>{auth?.session_id || "not started"}</dd>
          <dt>Task</dt>
          <dd>{task?.accepted?.task_id || "not started"} · {taskStatus}</dd>
          <dt>Worker</dt>
          <dd>{worker?.readiness?.liveReadiness?.status || worker?.browser?.readiness?.status || "not checked"}</dd>
          <dt>Live view</dt>
          <dd>{liveStatus}{worker?.browser?.stream_url ? ` · ${worker.browser.stream_url}` : ""}</dd>
        </dl>
      </section>

      <section className="live-card" aria-label="Live worker browser">
        <h2>Worker Browser</h2>
        <div className="live-stage">
          {frameSrc ? <img src={frameSrc} alt="Live worker browser frame" /> : <span>{liveStatus}</span>}
        </div>
        <p>Read-only live view. Login, passkey, 2FA, captcha, SSN entry, form submission, payer contact, and record changes remain outside worker control.</p>
      </section>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
