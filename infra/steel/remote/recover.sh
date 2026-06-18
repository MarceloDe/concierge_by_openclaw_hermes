#!/usr/bin/env bash
set -euo pipefail

STEEL_API_LOCAL_URL="${STEEL_API_LOCAL_URL:-http://127.0.0.1:3000}"
RECOVERY_EVENT_PATH="${RECOVERY_EVENT_PATH:-/var/lib/workerprototype_openclaw/steel/recovery-events.jsonl}"
SMOKE_TARGET_URL="${SMOKE_TARGET_URL:-https://example.com}"

wait_for_health() {
  for _ in $(seq 1 60); do
    if curl -fsS "${STEEL_API_LOCAL_URL}/v1/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

emit_recovery_event() {
  local status="$1"
  local detail="$2"
  mkdir -p "$(dirname "${RECOVERY_EVENT_PATH}")"
  printf '{"eventType":"steel.remote.recovery","status":"%s","detail":"%s","targetRef":"non_phi_example_com","createdAt":"%s"}\n' \
    "${status}" "${detail}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${RECOVERY_EVENT_PATH}"
}

wait_for_health

create_payload="$(curl -fsS -X POST "${STEEL_API_LOCAL_URL}/v1/sessions" \
  -H 'content-type: application/json' \
  --data "{\"url\":\"${SMOKE_TARGET_URL}\",\"dimensions\":{\"width\":1280,\"height\":720},\"skipFingerprintInjection\":true}")"

session_id="$(CREATE_PAYLOAD="${create_payload}" python3 - <<'PY'
import json, os
payload = json.loads(os.environ.get("CREATE_PAYLOAD", "{}") or "{}")
print(payload.get("id") or payload.get("sessionId") or payload.get("session", {}).get("id") or "")
PY
)"

if [ -n "${session_id}" ]; then
  curl -fsS -X POST "${STEEL_API_LOCAL_URL}/v1/sessions/${session_id}/release" \
    -H 'content-type: application/json' \
    --data '{"reason":"container_recovery_smoke_complete"}' >/dev/null || true
  emit_recovery_event "ok" "health_and_one_session_smoke_passed"
else
  emit_recovery_event "blocked" "session_id_missing_after_create"
  exit 1
fi
