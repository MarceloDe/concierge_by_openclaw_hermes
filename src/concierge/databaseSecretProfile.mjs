import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { DEFAULT_POSTGRES_URL } from "./postgresStore.mjs";

export const DATABASE_SECRET_PROFILE_VERSION = "2026-06-16.database-secret-profile.v1";

const SECRET_BACKED_SOURCES = new Set([
  "managed_env",
  "cloud_secret",
  "docker_secret",
  "secret_file",
  "local_secret_file",
  "ephemeral_local_secret_file"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function redactDatabaseUrl(rawUrl) {
  const value = clean(rawUrl);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.password) url.password = "redacted";
    if (url.username) url.username = url.username ? "redacted" : "";
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://redacted:redacted@");
  }
}

function parsePostgresUrl(rawUrl) {
  const value = clean(rawUrl);
  if (!value) return { valid: false, error: "missing_database_url" };
  try {
    const url = new URL(value);
    const validProtocol = ["postgres:", "postgresql:"].includes(url.protocol);
    return {
      valid: validProtocol,
      protocol: url.protocol.replace(":", ""),
      host: url.hostname,
      port: url.port || null,
      database: url.pathname.replace(/^\//, "") || null,
      hasUsername: Boolean(url.username),
      hasPassword: Boolean(url.password),
      devCredentialDetected: /dev-only|change-me|placeholder|dummy|secret-password/i.test(url.password)
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

function readSecretFile(filePath) {
  const absolutePath = filePath ? resolve(filePath) : "";
  if (!absolutePath) return { ok: false, value: "", error: "missing_secret_file_path" };
  if (!existsSync(absolutePath)) return { ok: false, value: "", error: "secret_file_missing", absolutePath };
  const value = readFileSync(absolutePath, "utf8").trim();
  return { ok: Boolean(value), value, error: value ? null : "secret_file_empty", absolutePath };
}

function classifySource(env, fileRead) {
  const explicit = clean(env.BRAINSTY_DATABASE_SECRET_SOURCE).toLowerCase();
  if (explicit) return explicit;
  if (fileRead?.absolutePath?.startsWith("/run/secrets/")) return "docker_secret";
  if (fileRead?.ok) return "secret_file";
  return env.BRAINSTY_DATABASE_URL ? "direct_env" : "default_dev";
}

function sourceAllowsSecretProfile(source) {
  return SECRET_BACKED_SOURCES.has(clean(source).toLowerCase());
}

function redactionOk(rawUrl, redactedUrl) {
  const parsed = parsePostgresUrl(rawUrl);
  if (!parsed.hasPassword) return true;
  try {
    const password = new URL(rawUrl).password;
    return !password || !String(redactedUrl ?? "").includes(password);
  } catch {
    return true;
  }
}

export function evaluateDatabaseSecretProfile(env = process.env, { allowDefault = true } = {}) {
  const filePath = clean(env.BRAINSTY_DATABASE_URL_FILE);
  const fileRead = filePath ? readSecretFile(filePath) : null;
  const rawUrl = fileRead?.ok ? fileRead.value : clean(env.BRAINSTY_DATABASE_URL) || (allowDefault ? DEFAULT_POSTGRES_URL : "");
  const source = classifySource(env, fileRead);
  const url = parsePostgresUrl(rawUrl);
  const redactedUrl = redactDatabaseUrl(rawUrl);
  const issues = [];
  if (!rawUrl) issues.push("database_url_missing");
  if (fileRead && !fileRead.ok) issues.push(fileRead.error);
  if (!url.valid) issues.push("database_url_not_valid_postgres");
  if (!url.hasUsername) issues.push("database_url_username_missing");
  if (!url.hasPassword) issues.push("database_url_password_missing");
  if (!sourceAllowsSecretProfile(source)) issues.push("database_url_not_secret_backed");
  if (!redactionOk(rawUrl, redactedUrl)) issues.push("database_url_redaction_failed");

  const ready = issues.length === 0;
  return {
    version: DATABASE_SECRET_PROFILE_VERSION,
    ready,
    status: ready ? "database_secret_profile_ready" : "database_secret_profile_not_ready",
    source,
    secretBacked: sourceAllowsSecretProfile(source),
    urlPresent: Boolean(rawUrl),
    redactedUrl,
    urlHash: rawUrl ? sha256(rawUrl) : null,
    fileConfigured: Boolean(filePath),
    filePathHash: filePath ? sha256(resolve(filePath)) : null,
    validPostgresUrl: url.valid,
    protocol: url.protocol ?? null,
    host: url.host ?? null,
    port: url.port ?? null,
    database: url.database ?? null,
    hasUsername: Boolean(url.hasUsername),
    hasPassword: Boolean(url.hasPassword),
    devCredentialDetected: Boolean(url.devCredentialDetected),
    profileReadyClaimed: env.BRAINSTY_DATABASE_SECRET_PROFILE_READY === "1",
    issues,
    databaseUrl: rawUrl
  };
}

export function publicDatabaseSecretProfile(profile) {
  const { databaseUrl, ...publicProfile } = profile ?? {};
  return publicProfile;
}

export function getDatabaseUrlFromEnv(env = process.env) {
  return evaluateDatabaseSecretProfile(env).databaseUrl || DEFAULT_POSTGRES_URL;
}
