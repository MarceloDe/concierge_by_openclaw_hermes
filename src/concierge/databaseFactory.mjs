import { DEFAULT_DB_PATH, SqliteStore } from "./database.mjs";
import { getDatabaseUrlFromEnv } from "./databaseSecretProfile.mjs";
import { DEFAULT_POSTGRES_URL, PostgresStore } from "./postgresStore.mjs";

export function normalizeDatabaseDriver(value) {
  const driver = String(value ?? "sqlite").trim().toLowerCase();
  return driver === "postgres" ? "postgres" : "sqlite";
}

export function isProductionDatabaseProfile(env = process.env) {
  const runtimeEnv = String(env.BRAINSTY_RUNTIME_ENV ?? env.NODE_ENV ?? env.APP_ENV ?? "").trim().toLowerCase();
  return ["production", "prod", "staging", "production-candidate"].includes(runtimeEnv);
}

export function resolveDatabaseDriver(env = process.env) {
  if (env.BRAINSTY_DB_DRIVER) return normalizeDatabaseDriver(env.BRAINSTY_DB_DRIVER);
  const target = String(env.BRAINSTY_DATABASE_TARGET ?? "postgres").trim().toLowerCase();
  if (isProductionDatabaseProfile(env) && target === "postgres") return "postgres";
  return "sqlite";
}

export function createDatabaseStore(env = process.env) {
  const driver = resolveDatabaseDriver(env);
  if (driver === "postgres") {
    return new PostgresStore(getDatabaseUrlFromEnv(env));
  }
  return new SqliteStore(env.BRAINSTY_DB_PATH ?? DEFAULT_DB_PATH);
}

export { DEFAULT_DB_PATH, DEFAULT_POSTGRES_URL, PostgresStore, SqliteStore };
