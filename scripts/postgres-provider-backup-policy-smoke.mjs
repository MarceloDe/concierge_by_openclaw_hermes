import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const POSTGRES_PROVIDER_BACKUP_POLICY_SMOKE_VERSION = "2026-06-17.postgres-provider-backup-policy.v1";

const DEFAULT_POLICY_PATH = "project/deployment/postgres-provider-backup-policy.example.json";
const ALLOWED_PROVIDERS = new Set(["neon", "supabase", "prisma_postgres", "managed_postgres", "self_managed_postgres"]);
const ALLOWED_SECRET_SOURCES = new Set(["managed_env", "docker_secret", "secret_file"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizePolicy(policy, policyPath) {
  return {
    schemaVersion: policy.schemaVersion ?? null,
    provider: policy.provider ?? null,
    environment: policy.environment ?? null,
    secretSource: policy.secretSource ?? null,
    databaseUrlRefPresent: Boolean(policy.databaseUrlRef),
    backupPolicy: {
      enabled: Boolean(policy.backupPolicy?.enabled),
      mode: policy.backupPolicy?.mode ?? null,
      pitrEnabled: Boolean(policy.backupPolicy?.pitrEnabled),
      retentionDays: Number(policy.backupPolicy?.retentionDays ?? 0),
      rpoHours: Number(policy.backupPolicy?.rpoHours ?? 0),
      rtoHours: Number(policy.backupPolicy?.rtoHours ?? 0),
      encryptedAtRest: Boolean(policy.backupPolicy?.encryptedAtRest)
    },
    restoreRehearsal: {
      enabled: Boolean(policy.restoreRehearsal?.enabled),
      cadenceDays: Number(policy.restoreRehearsal?.cadenceDays ?? 0),
      isolatedTargetRequired: Boolean(policy.restoreRehearsal?.isolatedTargetRequired),
      requiresEndpointRegression: Boolean(policy.restoreRehearsal?.requiresEndpointRegression),
      requiresBackupRunbookSmoke: Boolean(policy.restoreRehearsal?.requiresBackupRunbookSmoke)
    },
    promotionPolicy: {
      requiresOperatorApproval: Boolean(policy.promotionPolicy?.requiresOperatorApproval),
      requiresCredentialRotationOnCompromise: Boolean(policy.promotionPolicy?.requiresCredentialRotationOnCompromise),
      destructiveProductionRestoreAllowed: Boolean(policy.promotionPolicy?.destructiveProductionRestoreAllowed)
    },
    audit: {
      artifactRetentionDays: Number(policy.audit?.artifactRetentionDays ?? 0),
      redactDatabaseUrls: Boolean(policy.audit?.redactDatabaseUrls),
      redactSecretPaths: Boolean(policy.audit?.redactSecretPaths)
    },
    source: {
      policyPath,
      examplePolicy: policyPath === DEFAULT_POLICY_PATH
    }
  };
}

function validatePolicy(policy, policyPath) {
  const failures = [];
  if (!isObject(policy)) failures.push("policy_json_must_be_object");
  if (policy.schemaVersion !== "brainstyworkers.postgres-provider-backup-policy.v1") failures.push("schema_version_missing_or_unknown");
  if (!ALLOWED_PROVIDERS.has(policy.provider)) failures.push("provider_not_allowed");
  if (!["staging", "production"].includes(policy.environment)) failures.push("environment_must_be_staging_or_production");
  if (!ALLOWED_SECRET_SOURCES.has(policy.secretSource)) failures.push("secret_source_must_be_managed_or_file_backed");
  if (!policy.databaseUrlRef || String(policy.databaseUrlRef).includes("postgres://") || String(policy.databaseUrlRef).includes("postgresql://")) {
    failures.push("database_url_ref_must_not_be_raw_url");
  }
  if (!isObject(policy.backupPolicy) || !policy.backupPolicy.enabled) failures.push("backup_policy_must_be_enabled");
  if (!policy.backupPolicy?.pitrEnabled && policy.backupPolicy?.mode !== "daily_backup_plus_wal") {
    failures.push("pitr_or_wal_backup_required");
  }
  if (Number(policy.backupPolicy?.retentionDays ?? 0) < 7) failures.push("retention_days_must_be_at_least_7");
  if (Number(policy.backupPolicy?.rpoHours ?? Infinity) > 24) failures.push("rpo_hours_must_be_24_or_less");
  if (Number(policy.backupPolicy?.rtoHours ?? Infinity) > 4) failures.push("rto_hours_must_be_4_or_less");
  if (!policy.backupPolicy?.encryptedAtRest) failures.push("backup_encryption_required");
  if (!isObject(policy.restoreRehearsal) || !policy.restoreRehearsal.enabled) failures.push("restore_rehearsal_must_be_enabled");
  if (Number(policy.restoreRehearsal?.cadenceDays ?? Infinity) > 30) failures.push("restore_rehearsal_cadence_must_be_30_days_or_less");
  if (!policy.restoreRehearsal?.isolatedTargetRequired) failures.push("restore_rehearsal_requires_isolated_target");
  if (!policy.restoreRehearsal?.requiresEndpointRegression) failures.push("restore_rehearsal_requires_endpoint_regression");
  if (!policy.restoreRehearsal?.requiresBackupRunbookSmoke) failures.push("restore_rehearsal_requires_backup_runbook_smoke");
  if (!policy.promotionPolicy?.requiresOperatorApproval) failures.push("promotion_requires_operator_approval");
  if (policy.promotionPolicy?.destructiveProductionRestoreAllowed) failures.push("destructive_production_restore_must_not_be_allowed");
  if (!policy.audit?.redactDatabaseUrls || !policy.audit?.redactSecretPaths) failures.push("audit_redaction_required");
  return {
    ok: failures.length === 0,
    version: POSTGRES_PROVIDER_BACKUP_POLICY_SMOKE_VERSION,
    policyPath,
    failures,
    sanitizedPolicy: sanitizePolicy(policy, policyPath)
  };
}

function assertNoSecretLeak(payload) {
  const text = JSON.stringify(payload);
  return {
    rawDatabaseUrlWritten: /postgres(?:ql)?:\/\/[^"\\\s]+/i.test(text),
    rawSecretFilePathWritten: /\/run\/secrets\/|project\/deployment\/secrets\/\.runtime|\/var\/folders/i.test(text),
    destructiveProductionRestore: text.includes("\"destructiveProductionRestoreAllowed\":true")
  };
}

export async function validatePostgresProviderBackupPolicy({
  policyPath = process.env.BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE || DEFAULT_POLICY_PATH
} = {}) {
  const text = await readFile(resolve(policyPath), "utf8");
  const policy = JSON.parse(text);
  return validatePolicy(policy, policyPath);
}

export async function runPostgresProviderBackupPolicySmoke({
  policyPath = process.env.BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE || DEFAULT_POLICY_PATH,
  artifactPath = resolve("artifacts/postgres-provider-backup-policy-smoke.json"),
  providerReady = process.env.BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY === "1"
} = {}) {
  const validation = await validatePostgresProviderBackupPolicy({ policyPath });
  const hostedProviderReady = Boolean(providerReady && validation.ok && policyPath !== DEFAULT_POLICY_PATH);
  const result = {
    ok: validation.ok,
    version: POSTGRES_PROVIDER_BACKUP_POLICY_SMOKE_VERSION,
    status: hostedProviderReady ? "hosted_provider_backup_policy_ready" : "provider_policy_contract_valid_not_hosted",
    hostedProviderReady,
    validation,
    dashboard: {
      readinessKey: "postgres_provider_backup_policy",
      scoreKey: "database_provider_backup_policy",
      envGate: "BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_READY",
      policyFileEnv: "BRAINSTY_POSTGRES_PROVIDER_BACKUP_POLICY_FILE"
    },
    safety: {
      ...assertNoSecretLeak(validation),
      externalActions: false,
      phiSeeded: false
    }
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPostgresProviderBackupPolicySmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
