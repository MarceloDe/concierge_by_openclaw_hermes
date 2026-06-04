import { execFile, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { SCHEMA_SQL, TABLES } from "./schema.mjs";
import { seedRuntimeRegistries } from "./workflowArchitecture.mjs";

const execFileAsync = promisify(execFile);

export const DEFAULT_DB_PATH = resolve("data/brainstyworkers.sqlite");
const SQLITE_BUSY_TIMEOUT_MS = Number(process.env.BRAINSTY_SQLITE_BUSY_TIMEOUT_MS ?? 30000);

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
    const child = spawn("sqlite3", ["-cmd", `.timeout ${SQLITE_BUSY_TIMEOUT_MS}`, dbPath], {
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
    await this.exec(`
      CREATE TABLE IF NOT EXISTS human_handoff_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id TEXT,
        message_id TEXT,
        handoff_type TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        reason TEXT NOT NULL,
        response_guidance TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        audit_event_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.migrateColumns("knowledge_sources", [
      ["priority", "ALTER TABLE knowledge_sources ADD COLUMN priority INTEGER NOT NULL DEFAULT 100;"],
      ["last_run_at", "ALTER TABLE knowledge_sources ADD COLUMN last_run_at TEXT;"],
      ["last_status", "ALTER TABLE knowledge_sources ADD COLUMN last_status TEXT;"],
      ["metadata_json", "ALTER TABLE knowledge_sources ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';"],
      ["proposed_by", "ALTER TABLE knowledge_sources ADD COLUMN proposed_by TEXT;"],
      ["approved_by", "ALTER TABLE knowledge_sources ADD COLUMN approved_by TEXT;"],
      ["reviewed_at", "ALTER TABLE knowledge_sources ADD COLUMN reviewed_at TEXT;"]
    ]);
    await this.migrateColumns("scheduled_jobs", [
      ["workflow_key", "ALTER TABLE scheduled_jobs ADD COLUMN workflow_key TEXT;"],
      ["journey_stage", "ALTER TABLE scheduled_jobs ADD COLUMN journey_stage TEXT;"]
    ]);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS research_schedules (
        id TEXT PRIMARY KEY,
        schedule_key TEXT NOT NULL UNIQUE,
        actor_user_id TEXT,
        source_id TEXT,
        source_key TEXT,
        schedule_label TEXT NOT NULL,
        interval_hours INTEGER NOT NULL,
        workflow_key TEXT NOT NULL,
        topic TEXT NOT NULL DEFAULT '',
        query_json TEXT NOT NULL DEFAULT '{}',
        worker_mode TEXT NOT NULL DEFAULT 'deterministic_fetch',
        status TEXT NOT NULL,
        approval_status TEXT NOT NULL,
        next_run_at TEXT NOT NULL,
        last_run_at TEXT,
        last_run_id TEXT,
        last_status TEXT,
        run_count INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS research_scheduler_daemon_state (
        id TEXT PRIMARY KEY,
        daemon_key TEXT NOT NULL UNIQUE,
        actor_user_id TEXT,
        status TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        interval_ms INTEGER NOT NULL,
        tick_limit INTEGER NOT NULL,
        execute_due_runs INTEGER NOT NULL DEFAULT 0,
        approved_worker_dispatch INTEGER NOT NULL DEFAULT 0,
        worker_mode TEXT,
        last_tick_at TEXT,
        last_tick_event_id TEXT,
        last_success_at TEXT,
        last_failure_at TEXT,
        last_error TEXT,
        last_processed_count INTEGER NOT NULL DEFAULT 0,
        last_blocked_count INTEGER NOT NULL DEFAULT 0,
        last_actions_json TEXT NOT NULL DEFAULT '[]',
        tick_count INTEGER NOT NULL DEFAULT 0,
        overlap_skipped_count INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS research_embedding_routes (
        id TEXT PRIMARY KEY,
        route_key TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        status TEXT NOT NULL,
        selected_by TEXT,
        selected_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS research_embedding_jobs (
        id TEXT PRIMARY KEY,
        route_key TEXT NOT NULL,
        actor_user_id TEXT,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        artifact_count INTEGER NOT NULL DEFAULT 0,
        indexed_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        failure_reason TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS research_embedding_index (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        route_key TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        vector_json TEXT NOT NULL,
        vector_hash TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        job_id TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS research_graph_builds (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        status TEXT NOT NULL,
        node_count INTEGER NOT NULL DEFAULT 0,
        edge_count INTEGER NOT NULL DEFAULT 0,
        graph_hash TEXT NOT NULL,
        graph_json TEXT NOT NULL DEFAULT '{}',
        safety_json TEXT NOT NULL DEFAULT '{}',
        audit_event_id TEXT,
        failure_reason TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS research_claim_evaluations (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        question_hash TEXT,
        question_preview TEXT,
        answer_hash TEXT NOT NULL,
        answer_preview TEXT NOT NULL,
        status TEXT NOT NULL,
        verdict TEXT NOT NULL,
        claim_count INTEGER NOT NULL DEFAULT 0,
        supported_count INTEGER NOT NULL DEFAULT 0,
        unsupported_count INTEGER NOT NULL DEFAULT 0,
        low_confidence_count INTEGER NOT NULL DEFAULT 0,
        evaluation_json TEXT NOT NULL DEFAULT '{}',
        safety_json TEXT NOT NULL DEFAULT '{}',
        audit_event_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
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
    const { stdout } = await execFileAsync(
      "sqlite3",
      ["-cmd", `.timeout ${SQLITE_BUSY_TIMEOUT_MS}`, "-json", this.dbPath, sql],
      {
        maxBuffer: 1024 * 1024 * 20,
        timeout: SQLITE_BUSY_TIMEOUT_MS + 10000
      }
    );
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
