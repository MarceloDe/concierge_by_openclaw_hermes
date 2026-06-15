const API_BASE = process.env.NEXT_PUBLIC_BRAINSTY_CLIENT_API_BASE || "";

export async function connectorFetch(path, { token, ...options } = {}) {
  if (!path.startsWith("/api/v1/")) {
    throw new Error(`Mobile client may only call /api/v1 endpoints: ${path}`);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.detail || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export async function startSession(member) {
  return connectorFetch("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ member })
  });
}

export async function startTask(token, task) {
  return connectorFetch("/api/v1/tasks", {
    token,
    method: "POST",
    body: JSON.stringify(task)
  });
}

export async function getTask(token, taskId) {
  return connectorFetch(`/api/v1/tasks/${encodeURIComponent(taskId)}`, { token });
}

export async function checkOpenClaw(token) {
  return connectorFetch("/api/v1/openclaw/readiness", { token });
}

export async function createBrowserSession(token, body) {
  return connectorFetch("/api/v1/browser/sessions", {
    token,
    method: "POST",
    body: JSON.stringify(body)
  });
}
