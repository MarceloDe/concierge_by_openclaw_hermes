import { execFile, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { SCHEMA_SQL, TABLES } from "./schema.mjs";
import { seedRuntimeRegistries } from "./workflowArchitecture.mjs";

const execFileAsync = promisify(execFile);

export const DEFAULT_DB_PATH = resolve("data/brainstyworkers.sqlite");

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function quote(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function whereClause(where = {}) {
  const entries = Object.entries(where);
  if (entries.length === 0) return "";
  return ` WHERE ${entries.map(([key, value]) => `${key} = ${quote(value)}`).join(" AND ")}`;
}

async function runSqliteStatement(dbPath, statement) {
  await new Promise((resolve, reject) => {
    const child = spawn("sqlite3", ["-cmd", ".timeout 5000", dbPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || stdout || `sqlite3 exited with code ${code}`));
    });
    child.stdin.end(statement);
  });
}

export class SqliteStore {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
  }

  async initialize() {
    await mkdir(dirname(this.dbPath), { recursive: true });
    await this.exec(SCHEMA_SQL);
    await this.migrate();
    await seedRuntimeRegistries(this, { nowIso, createId });
    return this;
  }

  async migrate() {
    await this.migrateColumns("sessions", [
      ["title", "ALTER TABLE sessions ADD COLUMN title TEXT NOT NULL DEFAULT 'Eligibility and benefits session';"],
      ["current_step", "ALTER TABLE sessions ADD COLUMN current_step TEXT NOT NULL DEFAULT 'created';"],
      ["last_intent", "ALTER TABLE sessions ADD COLUMN last_intent TEXT;"],
      ["active_workflow_key", "ALTER TABLE sessions ADD COLUMN active_workflow_key TEXT;"],
      ["journey_stage", "ALTER TABLE sessions ADD COLUMN journey_stage TEXT;"],
      ["last_context_packet_id", "ALTER TABLE sessions ADD COLUMN last_context_packet_id TEXT;"],
      ["state_version", "ALTER TABLE sessions ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0;"],
      ["metadata_json", "ALTER TABLE sessions ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';"],
      ["last_active_at", "ALTER TABLE sessions ADD COLUMN last_active_at TEXT;"],
      ["expires_at", "ALTER TABLE sessions ADD COLUMN expires_at TEXT;"],
      ["closed_at", "ALTER TABLE sessions ADD COLUMN closed_at TEXT;"]
    ]);
    await this.migrateColumns("memory_items", [
      ["occurred_at", "ALTER TABLE memory_items ADD COLUMN occurred_at TEXT;"],
      ["valid_from_at", "ALTER TABLE memory_items ADD COLUMN valid_from_at TEXT;"],
      ["valid_until_at", "ALTER TABLE memory_items ADD COLUMN valid_until_at TEXT;"],
      ["last_verified_at", "ALTER TABLE memory_items ADD COLUMN last_verified_at TEXT;"],
      ["temporal_metadata_json", "ALTER TABLE memory_items ADD COLUMN temporal_metadata_json TEXT NOT NULL DEFAULT '{}';"]
    ]);
    await this.migrateColumns("context_packets", [
      ["generated_at", "ALTER TABLE context_packets ADD COLUMN generated_at TEXT;"]
    ]);
    await this.migrateColumns("openclaw_instances", [
      ["last_context_packet_id", "ALTER TABLE openclaw_instances ADD COLUMN last_context_packet_id TEXT;"],
      ["heartbeat_prompt_json", "ALTER TABLE openclaw_instances ADD COLUMN heartbeat_prompt_json TEXT NOT NULL DEFAULT '{}';"]
    ]);
    await this.migrateColumns("agent_tasks", [
      ["workflow_key", "ALTER TABLE agent_tasks ADD COLUMN workflow_key TEXT;"],
      ["journey_stage", "ALTER TABLE agent_tasks ADD COLUMN journey_stage TEXT;"]
    ]);
    await this.migrateColumns("scheduled_jobs", [
      ["workflow_key", "ALTER TABLE scheduled_jobs ADD COLUMN workflow_key TEXT;"],
      ["journey_stage", "ALTER TABLE scheduled_jobs ADD COLUMN journey_stage TEXT;"]
    ]);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS worker_continuations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        scheduled_job_id TEXT,
        workflow_key TEXT,
        approval_scope TEXT NOT NULL,
        allowed_action TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        status TEXT NOT NULL,
        terminal_outcome TEXT,
        last_runtime_event_id TEXT,
        last_progress_event_json TEXT NOT NULL DEFAULT '{}',
        next_check_at TEXT,
        expires_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.migrateColumns("audit_events", [
      ["previous_event_hash", "ALTER TABLE audit_events ADD COLUMN previous_event_hash TEXT;"],
      ["event_hash", "ALTER TABLE audit_events ADD COLUMN event_hash TEXT;"],
      ["chain_version", "ALTER TABLE audit_events ADD COLUMN chain_version TEXT;"]
    ]);
  }

  async migrateColumns(table, migrations) {
    const columns = await this.all(`PRAGMA table_info(${table});`);
    const names = new Set(columns.map((column) => column.name));
    for (const [column, sql] of migrations) {
      if (!names.has(column)) {
        try {
          await this.exec(sql);
        } catch (error) {
          if (!String(error.message ?? "").includes(`duplicate column name: ${column}`)) {
            throw error;
          }
        }
      }
    }
  }

  async exec(sql) {
    await runSqliteStatement(this.dbPath, sql);
  }

  async all(sql) {
    const { stdout } = await execFileAsync("sqlite3", ["-cmd", ".timeout 5000", "-json", this.dbPath, sql], {
      maxBuffer: 1024 * 1024 * 20
    });
    const trimmed = stdout.trim();
    return trimmed ? JSON.parse(trimmed) : [];
  }

  async get(sql) {
    const rows = await this.all(sql);
    return rows[0] ?? null;
  }

  async insert(table, values) {
    const keys = Object.keys(values);
    const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map((key) => quote(values[key])).join(", ")});`;
    await this.exec(sql);
    return values;
  }

  async update(table, values, where) {
    const assignments = Object.entries(values).map(([key, value]) => `${key} = ${quote(value)}`);
    await this.exec(`UPDATE ${table} SET ${assignments.join(", ")}${whereClause(where)};`);
  }

  async findOne(table, where) {
    return this.get(`SELECT * FROM ${table}${whereClause(where)} LIMIT 1;`);
  }

  async list(table, where = {}) {
    return this.all(`SELECT * FROM ${table}${whereClause(where)} ORDER BY created_at ASC;`);
  }

  async counts() {
    const counts = {};
    for (const table of TABLES) {
      const row = await this.get(`SELECT COUNT(*) AS count FROM ${table};`);
      counts[table] = row?.count ?? 0;
    }
    return counts;
  }
}
