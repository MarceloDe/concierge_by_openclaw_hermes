import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  startSession,
  sendChat,
  DEFAULT_MEMBER,
  type SessionState,
  type Ai2UiBlock,
  type Ai2UiOption
} from "./api";
import { Ai2UiBlocks } from "./components/Ai2Ui";
import { LiveView } from "./components/LiveView";
import { Shield, Send, Wallet, Receipt, DocSearch, Globe } from "./components/icons";

interface Msg {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  blocks?: Ai2UiBlock[];
  typing?: boolean;
}

let nid = 0;
const mkId = () => `m${++nid}`;

// Premade "canvas" functions from the original interface, as opaque one-tap actions.
const QUICK = [
  { key: "benefits", label: "Benefits", sub: "What do I still owe?", Icon: Wallet, message: "Do I still owe anything before my insurance starts paying this year?" },
  { key: "claim", label: "Claim status", sub: "Why wasn't this paid?", Icon: Receipt, message: "Why didn't my insurance pay my last visit? Walk me through the claim." },
  { key: "bill", label: "Bill investigation", sub: "Check a bill", Icon: DocSearch, message: "Help me investigate a medical bill — find overcharges and explain what I actually owe." }
];

export function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Demo deep-link (?demo=session|live|chat) lets a screenshot/runner land on a post-start state.
  const autoLive = useRef(false);
  const autoChat = useRef(false);
  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo === "session" || demo === "live" || demo === "chat") {
      autoLive.current = demo === "live";
      autoChat.current = demo === "chat";
      void begin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (session && autoLive.current) {
      autoLive.current = false;
      setLiveOpen(true);
    }
    if (session && autoChat.current) {
      autoChat.current = false;
      void ask(QUICK[0].message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const begin = useCallback(async () => {
    setStarting(true);
    setStartErr(null);
    try {
      const s = await startSession(DEFAULT_MEMBER);
      setSession(s);
      setMessages([
        {
          id: mkId(),
          role: "assistant",
          text:
            `Hi ${s.member.name.split(" ")[0]} — I'm your Brainsty shield. I'm independent; no insurer pays me.\n\n` +
            `Ask me anything about your ${s.member.payer} coverage, or pick a shortcut below. ` +
            `When we need your portal, I'll open the live ${s.member.payer} browser and hand you the keyboard for login.`
        }
      ]);
    } catch (e: any) {
      setStartErr(e?.message ?? "Could not start the session.");
    } finally {
      setStarting(false);
    }
  }, []);

  const ask = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || !session || busy) return;
      setBusy(true);
      const userMsg: Msg = { id: mkId(), role: "user", text };
      const typingMsg: Msg = { id: mkId(), role: "assistant", text: "", typing: true };
      setMessages((m) => [...m, userMsg, typingMsg]);
      try {
        const res = await sendChat(session, text);
        setMessages((m) =>
          m.map((x) =>
            x.id === typingMsg.id
              ? { ...x, typing: false, text: res.finalResponse || "(no answer returned)", blocks: res.ai2uiBlocks }
              : x
          )
        );
      } catch (e: any) {
        setMessages((m) =>
          m.map((x) =>
            x.id === typingMsg.id ? { ...x, typing: false, text: `Something went wrong: ${e?.message ?? "unknown error"}` } : x
          )
        );
      } finally {
        setBusy(false);
      }
    },
    [session, busy]
  );

  const onAction = useCallback(
    (label: string, opt?: Ai2UiOption) => {
      // Approval-scoped portal options open the live browser; everything else is a follow-up turn.
      if (opt?.approvalScope === "read_only_observation" || /portal|sign in|log in|aetna/i.test(label)) {
        setLiveOpen(true);
        return;
      }
      void ask(label);
    },
    [ask]
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = input;
    setInput("");
    void ask(v);
  }

  if (!session) {
    return (
      <div className="app">
        <div className="gate">
          <div className="hero">
            <Shield size={44} />
          </div>
          <h1>Brainsty</h1>
          <p>Your independent healthcare shield. Understand your coverage, fight surprise bills, and reach your insurer's portal — safely.</p>
          <button className="start" onClick={begin} disabled={starting}>
            {starting ? "Starting…" : "Start session"}
          </button>
          {startErr && <div className="err">{startErr}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <Shield size={20} />
        </div>
        <div>
          <div className="title">Brainsty</div>
          <div className="sub">{session.member.payer} · {session.member.name}</div>
        </div>
        <div className="spacer" />
        <div className={"status-dot" + (session.facadeToken ? " live" : "")} title={session.facadeToken ? "Live browser ready" : "Live browser unavailable"} />
      </header>

      <div className="thread" ref={threadRef}>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.typing ? (
              <span className="typing">
                <i /><i /><i />
              </span>
            ) : (
              <>
                {m.text}
                {m.blocks && m.blocks.length > 0 && <Ai2UiBlocks blocks={m.blocks} onAction={onAction} />}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="quick">
        {QUICK.map((q) => (
          <button key={q.key} onClick={() => ask(q.message)} disabled={busy}>
            <span className="ic">
              <q.Icon size={17} />
            </span>
            <span>
              <span className="qt">{q.label}</span>
              <span className="qs">{q.sub}</span>
            </span>
          </button>
        ))}
        <button className="live" onClick={() => setLiveOpen(true)}>
          <span className="ic">
            <Globe size={17} />
          </span>
          <span>
            <span className="qt">Connect {session.member.payer} portal (live)</span>
            <span className="qs">Open the live browser & sign in yourself</span>
          </span>
        </button>
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
          placeholder="Ask about coverage, a claim, or a bill…"
          rows={1}
        />
        <button className="send" type="submit" disabled={busy || !input.trim()} aria-label="Send">
          <Send size={18} />
        </button>
      </form>

      {liveOpen && (
        <LiveView
          session={session}
          targetUrl={session.member.portalUrl}
          onObservationAnswer={(answer, result) => {
            setMessages((m) => [
              ...m,
              {
                id: mkId(),
                role: "assistant",
                text:
                  `${answer}\n\n` +
                  `I observed the signed-in portal in read-only mode only. I did not enter credentials, submit forms, contact Aetna, or change account data. ` +
                  `Status: ${result.status ?? "claim observation complete"}.`
              }
            ]);
          }}
          onClose={() => setLiveOpen(false)}
        />
      )}
    </div>
  );
}
