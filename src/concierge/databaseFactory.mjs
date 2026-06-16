import { DEFAULT_DB_PATH, SqliteStore } from "./database.mjs";
import { DEFAULT_POSTGRES_URL, PostgresStore } from "./postgresStore.mjs";

export function normalizeDatabaseDriver(value) {
  const driver = String(value ?? "sqlite").trim().toLowerCase();
  return driver === "postgres" ? "postgres" : "sqlite";
}

export function createDatabaseStore(env = process.env) {
  const driver = normalizeDatabaseDriver(env.BRAINSTY_DB_DRIVER);
  if (driver === "postgres") {
    return new PostgresStore(env.BRAINSTY_DATABASE_URL || DEFAULT_POSTGRES_URL);
  }
  return new SqliteStore(env.BRAINSTY_DB_PATH ?? DEFAULT_DB_PATH);
}

export { DEFAULT_DB_PATH, DEFAULT_POSTGRES_URL, PostgresStore, SqliteStore };
