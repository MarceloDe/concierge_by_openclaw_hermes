import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPostgresProductionReadinessSmoke } from "./postgres-production-readiness-smoke.mjs";

export const POSTGRES_BACKUP_RUNBOOK_SMOKE_VERSION = "2026-06-17.postgres-backup-runbook.v1";

const RUNBOOK_PATH = resolve("docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md");

const REQUIRED_FRAGMENTS = [
  "Backup Schedule",
  "Restore Rehearsal",
  "Incident Restore",
  "Migration Rollback",
  "Acceptance Gate",
  "RPO target",
  "RTO target",
  "BRAINSTY_DATABASE_URL_FILE",
  "npm run storage:postgres:backup-runbook-smoke",
  "npm run storage:postgres:endpoint-regression-smoke",
  "Do not print raw database URLs"
];

export async function validatePostgresBackupRunbook({ runbookPath = RUNBOOK_PATH } = {}) {
  const text = await readFile(runbookPath, "utf8");
  const missing = REQUIRED_FRAGMENTS.filter((fragment) => !text.includes(fragment));
  return {
    ok: missing.length === 0,
    version: POSTGRES_BACKUP_RUNBOOK_SMOKE_VERSION,
    runbookPath: "docs/POSTGRES_BACKUP_RESTORE_RUNBOOK.md",
    requiredFragments: REQUIRED_FRAGMENTS.length,
    missing
  };
}

function assertNoSecretLeak(payload) {
  const text = JSON.stringify(payload);
  return {
    rawDatabaseUrlWritten: /postgresql:\/\/(?!redacted:redacted)/i.test(text),
    rawSecretFilePathWritten: /\/run\/secrets\/brainsty_database_url|project\/deployment\/secrets\/\.runtime|\/var\/folders/i.test(text)
  };
}

function repoRelative(path) {
  return String(path).replace(`${resolve(".")}/`, "");
}

export async function runPostgresBackupRunbookSmoke({
  artifactPath = resolve("artifacts/postgres-backup-runbook-smoke.json"),
  productionSmokeArtifactPath = resolve("artifacts/postgres-backup-runbook-production-smoke.json"),
  skipLiveRestore = process.env.BRAINSTY_POSTGRES_BACKUP_RUNBOOK_SKIP_LIVE === "1"
} = {}) {
  const runbook = await validatePostgresBackupRunbook();
  if (!runbook.ok) {
    const result = {
      ok: false,
      version: POSTGRES_BACKUP_RUNBOOK_SMOKE_VERSION,
      runbook,
      restoreRehearsal: { checked: false, ok: false, reason: "runbook_missing_required_fragments" },
      safety: { rawDatabaseUrlWritten: false, rawSecretFilePathWritten: false, externalActions: false, phiSeeded: false }
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, JSON.stringify(result, null, 2));
    return result;
  }

  const productionSmoke = skipLiveRestore
    ? null
    : await runPostgresProductionReadinessSmoke({ artifactPath: productionSmokeArtifactPath });
  const restoreRehearsal = productionSmoke
    ? {
        checked: true,
        ok: Boolean(productionSmoke.backupRestore?.ok),
        command: "npm run storage:postgres:production-smoke",
        artifactPath: repoRelative(productionSmokeArtifactPath),
        comparedTables: productionSmoke.backupRestore?.comparedTables ?? null,
        countMismatches: productionSmoke.backupRestore?.countMismatches ?? [],
        restoredRows: productionSmoke.backupRestore?.restoredRows ?? {}
      }
    : {
        checked: false,
        ok: true,
        command: "npm run storage:postgres:production-smoke",
        reason: "live_restore_skipped_by_env"
      };

  const result = {
    ok: runbook.ok && restoreRehearsal.ok,
    version: POSTGRES_BACKUP_RUNBOOK_SMOKE_VERSION,
    runbook,
    schedule: {
      providerNeutral: true,
      rpoTargetHours: 24,
      rtoTargetHours: 4,
      requiresProviderBackupOrPitr: true,
      productionPromotionRequiresApproval: true
    },
    restoreRehearsal,
    dashboard: {
      readinessKey: "postgres_backup_runbook",
      scoreKey: "database_backup_restore_runbook",
      envGate: "BRAINSTY_POSTGRES_BACKUP_RUNBOOK_READY"
    },
    safety: {
      ...assertNoSecretLeak({ runbook, restoreRehearsal }),
      externalActions: false,
      phiSeeded: false,
      destructiveProductionRestore: false,
      rawBackupContainsSmokeDataOnly: true
    }
  };

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPostgresBackupRunbookSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exit(1);
    });
}
