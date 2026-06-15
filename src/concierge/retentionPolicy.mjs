import { audit } from "./audit.mjs";
import { nowIso } from "./database.mjs";

export const RETENTION_POLICY_VERSION = "2026-06-15.retention-policy.v1";

export async function sweepExpiredRuntimeState(store, { now = nowIso() } = {}) {
  const expiredSessions = await store.all("SELECT id FROM sessions WHERE expires_at IS NOT NULL AND expires_at < ? AND closed_at IS NULL;", [now]);
  for (const row of expiredSessions) {
    await store.update("sessions", { status: "expired", current_step: "expired_by_retention_sweeper", closed_at: now, last_active_at: now }, { id: row.id });
    await audit(store, row.id, "retention.session_expired", {
      sessionId: row.id,
      retentionPolicyVersion: RETENTION_POLICY_VERSION,
      expiredAt: now
    });
  }

  const expiredContinuations = await store.all(
    "SELECT id, session_id FROM worker_continuations WHERE expires_at IS NOT NULL AND expires_at < ? AND status NOT IN ('completed', 'expired', 'cancelled');",
    [now]
  );
  for (const row of expiredContinuations) {
    await store.update(
      "worker_continuations",
      { status: "expired", terminal_outcome: "not_possible_policy_or_approval_block", updated_at: now },
      { id: row.id }
    );
    await audit(store, row.session_id ?? null, "retention.worker_continuation_expired", {
      continuationId: row.id,
      retentionPolicyVersion: RETENTION_POLICY_VERSION,
      expiredAt: now,
      terminalOutcome: "not_possible_policy_or_approval_block"
    });
  }

  const expiredMemories = await store.all(
    "SELECT id, session_id, metadata_json FROM memory_items WHERE valid_until_at IS NOT NULL AND valid_until_at < ? AND retention_policy != 'tombstoned';",
    [now]
  );
  for (const row of expiredMemories) {
    await store.update(
      "memory_items",
      {
        content: "[expired memory tombstoned by retention sweeper]",
        retention_policy: "tombstoned",
        adapter_status: "expired_tombstoned",
        temporal_metadata_json: JSON.stringify({ tombstonedAt: now, previousMetadataHashPresent: Boolean(row.metadata_json) }),
        updated_at: now
      },
      { id: row.id }
    );
    await audit(store, row.session_id ?? null, "retention.memory_item_tombstoned", {
      memoryItemId: row.id,
      retentionPolicyVersion: RETENTION_POLICY_VERSION,
      tombstonedAt: now,
      previousMetadataHashPresent: Boolean(row.metadata_json)
    });
  }

  return {
    version: RETENTION_POLICY_VERSION,
    now,
    expiredSessions: expiredSessions.length,
    expiredContinuations: expiredContinuations.length,
    tombstonedMemoryItems: expiredMemories.length
  };
}
