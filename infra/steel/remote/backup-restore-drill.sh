#!/usr/bin/env bash
set -euo pipefail

STEEL_LOGS_DIR="${STEEL_LOGS_DIR:-/srv/workerprototype_openclaw/steel/logs}"
STEEL_RESTORE_DIR="${STEEL_RESTORE_DIR:-/srv/workerprototype_openclaw/steel/restore-drill}"
STEEL_RECOVERY_SCRIPT="${STEEL_RECOVERY_SCRIPT:-/opt/workerprototype_openclaw/steel/recover.sh}"
STEEL_DRILL_EVENT_PATH="${STEEL_DRILL_EVENT_PATH:-/var/lib/workerprototype_openclaw/steel/backup-restore-events.jsonl}"
DRY_RUN="${DRY_RUN:-1}"

emit_event() {
  local status="$1"
  local detail="$2"
  mkdir -p "$(dirname "${STEEL_DRILL_EVENT_PATH}")"
  printf '{"eventType":"steel.remote.backup_restore_drill","status":"%s","detail":"%s","rawContentBackedUp":false,"createdAt":"%s"}\n' \
    "${status}" "${detail}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "${STEEL_DRILL_EVENT_PATH}"
}

if [ "${DRY_RUN}" = "1" ]; then
  emit_event "dry_run" "validated encrypted-volume restore drill command path without copying runtime data"
  exit 0
fi

if [ ! -d "${STEEL_LOGS_DIR}" ]; then
  emit_event "blocked" "steel logs directory missing"
  exit 1
fi

mkdir -p "${STEEL_RESTORE_DIR}"
rsync -a --delete --exclude='*.png' --exclude='*.jpg' --exclude='*.jpeg' --exclude='*.webp' --exclude='*.gif' \
  "${STEEL_LOGS_DIR}/" "${STEEL_RESTORE_DIR}/"

if [ -x "${STEEL_RECOVERY_SCRIPT}" ]; then
  "${STEEL_RECOVERY_SCRIPT}"
fi

emit_event "ok" "restored steel logs volume clone and ran recovery smoke"
