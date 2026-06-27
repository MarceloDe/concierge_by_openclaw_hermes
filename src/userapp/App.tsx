import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  startSession,
  sendChat,
  createBrowserSession,
  observeClaimsReadOnly,
  DEFAULT_MEMBER,
  type SessionState,
  type Ai2UiBlock,
  type Ai2UiOption,
  type BrowserSession,
  type ClaimsObservationResult
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
const RECENT_MESSAGE_LIMIT = 6;

// Premade "canvas" functions from the original interface, as opaque one-tap actions.
const QUICK = [
  { key: "benefits", label: "Benefits", sub: "What do I still owe?", Icon: Wallet, message: "Do I still owe anything before my insurance starts paying this year?" },
  { key: "claim", label: "Claim status", sub: "Why wasn't this paid?", Icon: Receipt, message: "Why didn't my insurance pay my last visit? Walk me through the claim." },
  { key: "bill", label: "Bill investigation", sub: "Check a bill", Icon: DocSearch, message: "Help me investigate a medical bill — find overcharges and explain what I actually owe." }
];

function recentChatContext(messages: Msg[]) {
  return messages
    .filter((m) => !m.typing)
    .slice(-RECENT_MESSAGE_LIMIT)
    .map((m) => ({ role: m.role, text: m.text }));
}

function previousAssistantOfferedReadOnly(messages: Msg[]) {
  return [...messages]
    .reverse()
    .some((m) => m.role === "assistant" && /option\s*b|read[- ]only extraction|read[- ]only access|read[- ]only claim scan/i.test(m.text));
}

function previousAssistantOfferedStepGuidance(messages: Msg[]) {
  return [...messages]
    .reverse()
    .some((m) => m.role === "assistant" && /option\s*a|step[- ]by[- ]step|login steps|log in/i.test(m.text));
}

function isPortalConnectRequest(text: string) {
  const normalized = text.toLowerCase();
  return (
    /\b(connect|open|access|sign ?in|log ?in)\b.*\b(aetna|insurance|insurer|portal)\b/i.test(normalized) ||
    /\b(aetna|insurance|insurer|portal)\b.*\b(connect|open|access|sign ?in|log ?in)\b/i.test(normalized) ||
    /\b(help|guide|walk|support)\b.{0,80}\b(log|login|sign|connect|access)\b.{0,80}\b(aetna|insurance|insurer|portal)\b/i.test(normalized) ||
    /\b(log|login|sign)\b.{0,30}\b(in|into|to|at)\b.{0,30}\b(aetna|insurance|insurer|portal)\b/i.test(normalized)
  );
}

function isReadOnlyExtractionChoice(text: string, messages: Msg[]) {
  return (
    (/\b(option|choice)\s*b\b/i.test(text) && previousAssistantOfferedReadOnly(messages)) ||
    /\bread[- ]?only\b.*\b(extraction|scan|observe|access|portal)\b/i.test(text)
  );
}

function isStepGuidanceChoice(text: string, messages: Msg[]) {
  return (/\b(option|choice)\s*a\b/i.test(text) && previousAssistantOfferedStepGuidance(messages)) || /\bstep[- ]by[- ]step\b/i.test(text);
}

function isUserControlledAuthGuidance(text: string, messages: Msg[]) {
  return (
    /\b(guide|walk|help|support)\b/i.test(text) &&
    /\b(password|passcode|passkey|2fa|two[- ]factor|one[- ]time code|otp|verification code|mfa|captcha|log ?in|sign ?in)\b/i.test(text) &&
    (previousAssistantOfferedReadOnly(messages) ||
      previousAssistantOfferedStepGuidance(messages) ||
      /\b(portal|aetna|insurance|insurer|browser)\b/i.test(text))
  );
}

function portalAssistText(member: SessionState["member"]) {
  return (
    `Yes — I'll check whether your ${member.payer} portal is already connected. If the saved remote session needs login, I'll open the live browser for you. You stay in control for username, password, 2FA, and captcha; ` +
    `I will not type credentials or submit forms for you.\n\n` +
    `After you finish login and return control, I will hide the browser window, keep the AWS session alive, and continue read-only OpenClaw work from the signed-in portal.`
  );
}

function userControlledAuthGuidanceText(member: SessionState["member"]) {
  return (
    `Yes. I can guide you while you type your own ${member.payer} password, 2FA, or captcha in the live browser. ` +
    `I will not ask for, see, store, or enter your credentials.\n\n` +
    `Tap Take control, complete the login yourself, then return control. If you prefer not to log in, I can still explain the general portal steps and what evidence to upload instead.`
  );
}

function stepGuidanceText(member: SessionState["member"]) {
  return (
    `Use the Connect ${member.payer} portal button when you're ready. Keep your username, password, phone or authenticator app, insurance card, and photo ID nearby.\n\n` +
    `If the portal asks for a password, 2FA, or captcha, take control and complete it yourself. After login, return control so I can continue read-only observation.`
  );
}

export function App() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [retainedBrowser, setRetainedBrowser] = useState<BrowserSession | null>(null);
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
      setRetainedBrowser(null);
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

  function portalConnectedText(member: SessionState["member"], result?: ClaimsObservationResult | null) {
    const sources = result?.sourcePointers?.length ?? 0;
    const rows = result?.claimRows?.length ?? 0;
    return (
      `We are connected to your ${member.payer} insurance portal account. I hid the remote browser window and kept the AWS browser session alive, so you can stay in chat while OpenClaw continues read-only navigation.\n\n` +
      `You can now ask what you want me to verify. I can inspect benefits, claim status, copay evidence, plan documents, and portal pages without entering credentials, submitting forms, contacting ${member.payer}, or changing account data.` +
      (sources || rows ? `\n\nCurrent read-only proof: ${rows} claim row(s), ${sources} source pointer(s).` : "")
    );
  }

  const startPortalFlow = useCallback(
    async (userMsg?: Msg) => {
      if (!session || busy) return;
      setBusy(true);
      if (userMsg) {
        setMessages((m) => [...m, userMsg, { id: mkId(), role: "assistant", text: portalAssistText(session.member) }]);
      } else {
        setMessages((m) => [...m, { id: mkId(), role: "assistant", text: `Checking whether your ${session.member.payer} portal is already connected...` }]);
      }
      try {
        const browser = retainedBrowser ?? await createBrowserSession(session, session.member.portalUrl, { hiddenUntilAuthRequired: true });
        setRetainedBrowser(browser);
        const readiness = await observeClaimsReadOnly(session, browser.browserSessionId);
        if (readiness.ok) {
          setMessages((m) => [...m, { id: mkId(), role: "assistant", text: portalConnectedText(session.member, readiness) }]);
          setLiveOpen(false);
          return;
        }
        const status = readiness.status ?? "login_needed";
        setMessages((m) => [
          ...m,
          {
            id: mkId(),
            role: "assistant",
            text:
              status === "human_login_required"
                ? `The retained AWS browser session needs your ${session.member.payer} login again. I am opening the live browser for takeover; after you return control, I will hide it and continue in read-only mode.`
                : `I could not confirm a signed-in ${session.member.payer} portal page yet (${status}). I am opening the live browser so you can guide it or sign in yourself.`
          }
        ]);
        setLiveOpen(true);
      } catch (e: any) {
        setMessages((m) => [
          ...m,
          {
            id: mkId(),
            role: "assistant",
            text: `I could not silently verify the retained portal session (${e?.message ?? "unknown error"}). I am opening the live browser so you can take control.`
          }
        ]);
        setLiveOpen(true);
      } finally {
        setBusy(false);
      }
    },
    [session, busy, retainedBrowser]
  );

  const ask = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || !session || busy) return;
      const userMsg: Msg = { id: mkId(), role: "user", text };

      if (isPortalConnectRequest(text) || isReadOnlyExtractionChoice(text, messages)) {
        void startPortalFlow(userMsg);
        return;
      }

      if (isUserControlledAuthGuidance(text, messages)) {
        setMessages((m) => [...m, userMsg, { id: mkId(), role: "assistant", text: userControlledAuthGuidanceText(session.member) }]);
        setLiveOpen(true);
        return;
      }

      if (isStepGuidanceChoice(text, messages)) {
        setMessages((m) => [...m, userMsg, { id: mkId(), role: "assistant", text: stepGuidanceText(session.member) }]);
        return;
      }

      setBusy(true);
      const typingMsg: Msg = { id: mkId(), role: "assistant", text: "", typing: true };
      setMessages((m) => [...m, userMsg, typingMsg]);
      try {
        const res = await sendChat(session, text, {
          recentMessages: recentChatContext([...messages, userMsg]),
          compact: true,
          interactiveFastPath: true
        });
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
    [session, busy, messages, startPortalFlow]
  );

  const onAction = useCallback(
    (label: string, opt?: Ai2UiOption) => {
      // Approval-scoped portal options open the live browser; everything else is a follow-up turn.
      if (opt?.approvalScope === "read_only_observation" || /portal|sign in|log in|aetna/i.test(label)) {
        void startPortalFlow();
        return;
      }
      void ask(label);
    },
    [ask, startPortalFlow]
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
        <button className="live" onClick={() => startPortalFlow()} disabled={busy}>
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
          initialBrowserSession={retainedBrowser}
          onBrowserSessionReady={setRetainedBrowser}
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
          onPortalConnected={(_answer, result) => {
            setMessages((m) => [...m, { id: mkId(), role: "assistant", text: portalConnectedText(session.member, result) }]);
          }}
          onClose={() => setLiveOpen(false)}
        />
      )}
    </div>
  );
}
