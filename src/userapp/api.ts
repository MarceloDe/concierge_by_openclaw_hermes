// Thin client over the EXISTING backend. Nothing new server-side:
//   - Node runtime (same-origin, :4226): session + chat + ai2ui blocks
//   - FastAPI facade (:8000): hosted Steel remote browser sessions + takeover
//
// The app is served by the Node server, so Node calls are same-origin ("").
// The facade is cross-origin; its base is configurable for device/prod builds.

export interface Member {
  name: string;
  email: string;
  payer: string;
  portalUrl: string;
}

export interface SessionState {
  sessionId: string;
  userId: string;
  facadeToken: string | null;
  member: Member;
}

export interface Ai2UiOption {
  label: string;
  id?: string;
  description?: string;
  requiresApproval?: boolean;
  taskId?: string;
  approvalScope?: string;
}

export interface Ai2UiBlock {
  id?: string;
  type: string;
  title?: string;
  payload?: Record<string, any>;
  renderHints?: Record<string, any>;
}

export interface ChatResult {
  finalResponse: string;
  ai2uiBlocks: Ai2UiBlock[];
  sourcePointers: Array<{ table?: string; id?: string; displayLabel?: string }>;
  intent?: string;
  raw: any;
}

export interface ChatMessageContext {
  role: "user" | "assistant" | "system";
  text: string;
}

export interface ChatOptions {
  useLiveModel?: boolean;
  recentMessages?: ChatMessageContext[];
  compact?: boolean;
  interactiveFastPath?: boolean;
}

export interface BrowserSession {
  browserSessionId: string;
  sessionViewerUrl: string | null;
  streamUrl: string | null;
  readiness: Record<string, any>;
  providerLiveConnected: boolean;
  currentTitle: string | null;
  reusedPersistentProfile?: boolean;
}

export interface ClaimsObservationResult {
  ok: boolean;
  status?: string;
  finalResponse?: string | null;
  sourcePointers: Array<{ table?: string; id?: string; displayLabel?: string; summary?: string }>;
  claimRows: Array<Record<string, any>>;
  proof?: {
    schemaVersion?: string;
    artifactPath?: string;
    status?: string;
    sourcePointerCount?: number;
    claimRowCount?: number;
    rawPortalTextReturned?: boolean;
    rawFrameRecorded?: boolean;
    externalWriteActionsAllowed?: boolean;
  } | null;
  safety: Record<string, any>;
  raw: any;
}

const NODE_BASE = ""; // same-origin
// Facade base: ?facade= query override (testing) > window.__FACADE_BASE (packaged) > default.
function resolveFacadeBase(): string {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("facade");
    if (q) return q.replace(/\/$/, "");
    if ((window as any).__FACADE_BASE) return String((window as any).__FACADE_BASE).replace(/\/$/, "");
  }
  return "http://127.0.0.1:8000";
}
const FACADE_BASE: string = resolveFacadeBase();

export const DEFAULT_MEMBER: Member = {
  name: "Marcelo Felix",
  email: "mocfelix@gmail.com",
  payer: "Aetna",
  // Must be an allow-listed read-only portal host (member.aetna.com / health.aetna.com).
  // www.aetna.com is rejected fail-closed by the facade.
  portalUrl: "https://member.aetna.com"
};

// Steel's interactive viewer UI is served at /sessions/<id> (port 5173 behind Caddy).
// The facade's viewer template currently emits /v1/sessions/<id>/viewer, which hits the
// Steel API (port 3000) and 404s. Normalize to the real viewer route here.
export function steelViewerUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/(?:v1\/)?sessions\/([0-9a-fA-F-]{8,})/);
    return m ? `${u.origin}/sessions/${m[1]}` : raw;
  } catch {
    return raw;
  }
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = 240000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = payload?.detail ?? payload?.error?.message ?? payload?.status ?? res.statusText;
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

/** Opaque "start session": create the Node session and (best-effort) a facade token for the live browser. */
export async function startSession(member: Member = DEFAULT_MEMBER): Promise<SessionState> {
  const auth = await postJson(`${NODE_BASE}/api/orchestrator/auth-start`, { member });
  const sessionId: string = auth?.auth?.sessionId ?? auth?.session?.id;
  const userId: string = auth?.auth?.userId ?? auth?.user?.id;

  let facadeToken: string | null = null;
  try {
    const facadeAuth = await postJson(`${FACADE_BASE}/api/auth/local-session`, { member }, {}, 30000);
    facadeToken = facadeAuth?.access_token ?? null;
  } catch {
    // Facade may be down in some dev setups; chat still works, live view will report it.
    facadeToken = null;
  }

  return { sessionId, userId, facadeToken, member };
}

export async function sendChat(session: SessionState, message: string, opts: ChatOptions = {}): Promise<ChatResult> {
  const compact = opts.compact ?? true;
  const payload = {
    member: session.member,
    sessionId: session.sessionId,
    message,
    recentMessages: opts.recentMessages ?? [],
    useLiveModel: opts.useLiveModel ?? true,
    executeEvidenceObservation: false,
    compact,
    responseMode: compact ? "compact" : "full",
    includeDebug: !compact,
    interactiveFastPath: opts.interactiveFastPath ?? true
  };
  const raw = await postJson(`${NODE_BASE}/api/chat`, payload);
  return {
    finalResponse: raw?.finalResponse ?? raw?.final_response ?? "",
    ai2uiBlocks: Array.isArray(raw?.ai2uiBlocks)
      ? raw.ai2uiBlocks
      : (raw?.graphRun?.state?.ai2ui_blocks ?? raw?.graphSummary?.ai2uiBlocks ?? []),
    sourcePointers: raw?.sourcePointers ?? raw?.source_pointers ?? [],
    intent: raw?.intent,
    raw
  };
}

function viewport() {
  const dpr = Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1)));
  const w = Math.max(1, Math.round(window.innerWidth));
  const h = Math.max(1, Math.round(window.innerHeight));
  return {
    width: Math.max(1024, Math.min(1920, w)),
    height: Math.max(640, Math.min(1200, h)),
    deviceScaleFactor: dpr
  };
}

export interface BrowserSessionOptions {
  hiddenUntilAuthRequired?: boolean;
  forceNew?: boolean;
}

function browserProfileRef(session: SessionState, targetUrl: string | null) {
  const host = (() => {
    try {
      return new URL(targetUrl ?? session.member.portalUrl).host.toLowerCase();
    } catch {
      return "approved-portal";
    }
  })();
  return `${session.userId}:${session.member.payer.toLowerCase()}:${host}`;
}

/** Create or reuse a live Steel remote-browser session via the facade. */
export async function createBrowserSession(
  session: SessionState,
  targetUrl: string | null = null,
  options: BrowserSessionOptions = {}
): Promise<BrowserSession> {
  if (!session.facadeToken) {
    throw new Error("Live browser needs a facade session token (facade unreachable at start).");
  }
  const raw = await postJson(
    `${FACADE_BASE}/api/v1/browser/sessions`,
    {
      session_id: session.sessionId,
      target_url: targetUrl,
      provider: "hosted_remote",
      options: {
        client: "brainsty_userapp_live_view",
        requireHostedAwsSandbox: true,
        persistentProfile: true,
        reuseAuthenticatedSession: true,
        keepAliveAfterViewerHidden: true,
        hiddenUntilAuthRequired: Boolean(options.hiddenUntilAuthRequired),
        forceNew: Boolean(options.forceNew),
        profileRef: browserProfileRef(session, targetUrl),
        portalAccountRef: `${session.member.payer.toLowerCase()}:member-portal`,
        consentRef: "user_consented_remote_browser_session_retention",
        persistSessionCookies: true,
        rawPasswordStorageAllowed: false,
        agentCredentialEntryAllowed: false,
        passwordManagerAutomationAllowed: false,
        ...viewport(),
        targetUrlRef: targetUrl ? "userapp-selected-target-url-ref" : "approved-target-url-ref-redacted"
      }
    },
    { authorization: `Bearer ${session.facadeToken}` },
    60000
  );
  const screencast = raw?.screencast ?? {};
  return {
    browserSessionId: raw?.browser_session_id,
    sessionViewerUrl: steelViewerUrl(
      screencast?.sessionViewerUrl ?? screencast?.viewerUrl ?? raw?.sessionViewerUrl ?? raw?.viewerUrl ?? null
    ),
    streamUrl: raw?.stream_url ?? null,
    readiness: raw?.readiness ?? {},
    providerLiveConnected: Boolean(screencast?.providerLiveConnected ?? raw?.readiness?.providerLiveConnected),
    currentTitle: raw?.current_title ?? null,
    reusedPersistentProfile: Boolean(raw?.readiness?.reusedPersistentProfile)
  };
}

export type TakeoverMode = "request" | "grant" | "end";

export async function takeover(
  session: SessionState,
  browserSessionId: string,
  mode: TakeoverMode,
  takeoverId?: string
) {
  const body: Record<string, unknown> = { mode, reason: "user_password_or_captcha" };
  if (mode === "grant") {
    body.takeover_id = takeoverId;
    body.approved_by = "user";
  }
  if (mode === "end") {
    body.takeover_id = takeoverId;
    body.reason = "user_returned_control";
  }
  return postJson(
    `${FACADE_BASE}/api/v1/browser/sessions/${encodeURIComponent(browserSessionId)}/takeover`,
    body,
    { authorization: `Bearer ${session.facadeToken}` },
    30000
  );
}

export interface Frame {
  mime: string;
  data: string; // base64
  metadata: { width?: number; height?: number; title?: string; urlHost?: string; capturedAt?: string };
}

// Consume the facade's verified SSE CDP JPEG stream. EventSource can't send an
// Authorization header, so we read the body stream manually.
export function streamFrames(
  session: SessionState,
  streamUrl: string,
  handlers: { onFrame: (f: Frame) => void; onStatus?: (s: string) => void },
  signal: AbortSignal
): void {
  void (async () => {
    try {
      const res = await fetch(`${FACADE_BASE}${streamUrl}`, {
        headers: { accept: "text/event-stream", authorization: `Bearer ${session.facadeToken}` },
        signal
      });
      if (!res.ok || !res.body) {
        handlers.onStatus?.(`Live stream unavailable: ${res.status} ${res.statusText}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const ev of parts) {
          const data = ev
            .split(/\r?\n/)
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("");
          if (!data) continue;
          try {
            const j = JSON.parse(data);
            if (j.data && j.mime) handlers.onFrame({ mime: j.mime, data: j.data, metadata: j.metadata ?? {} });
          } catch {
            /* skip malformed frame */
          }
        }
      }
    } catch (e: any) {
      if (!signal.aborted) handlers.onStatus?.(`Live stream interrupted: ${e?.message ?? "error"}`);
    }
  })();
}

export type RemoteInput =
  | { kind: "mouse"; type: "mousePressed" | "mouseReleased" | "mouseMoved"; x: number; y: number; button: "left"; clickCount: number }
  | { kind: "wheel"; x: number; y: number; deltaX: number; deltaY: number }
  | { kind: "key"; type: "keyDown" | "keyUp"; key: string; code: string; keyCode: number }
  | { kind: "text"; text: string }
  | { kind: "navigate"; url: string };

export async function relayInput(
  session: SessionState,
  browserSessionId: string,
  takeoverId: string,
  grantToken: string,
  input: RemoteInput
) {
  return postJson(
    `${FACADE_BASE}/api/v1/browser/sessions/${encodeURIComponent(browserSessionId)}/input`,
    { takeover_id: takeoverId, grant_token: grantToken, input },
    { authorization: `Bearer ${session.facadeToken}` },
    15000
  );
}

export async function observeClaimsReadOnly(session: SessionState, browserSessionId: string): Promise<ClaimsObservationResult> {
  const raw = await postJson(
    `${FACADE_BASE}/api/v1/browser/sessions/${encodeURIComponent(browserSessionId)}/openclaw/claims-observe`,
    {
      message: "After human login, observe Aetna claims in read-only mode and compose a cited answer.",
      useLiveModel: true
    },
    { authorization: `Bearer ${session.facadeToken}` },
    120000
  );
  return {
    ok: Boolean(raw?.ok),
    status: raw?.status,
    finalResponse: raw?.final_response ?? raw?.finalResponse ?? raw?.langchain_answer?.finalResponse ?? null,
    sourcePointers: raw?.source_pointers ?? raw?.sourcePointers ?? [],
    claimRows: raw?.claim_rows ?? raw?.claimRows ?? [],
    proof: raw?.proof ?? null,
    safety: raw?.safety ?? {},
    raw
  };
}

export const FACADE_BASE_URL = FACADE_BASE;
