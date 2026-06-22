import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { SCHEMA_SQL, TABLES } from "./schema.mjs";
import { seedRuntimeRegistries } from "./workflowArchitecture.mjs";

export const DEFAULT_DB_PATH = resolve("data/brainstyworkers.sqlite");
const SQLITE_BUSY_TIMEOUT_MS = Number(process.env.BRAINSTY_SQLITE_BUSY_TIMEOUT_MS ?? 30000);
export const DATABASE_ADAPTER_VERSION = "2026-06-15.node-sqlite-bound-store.v1";
const TABLE_ALLOWLIST = new Set(TABLES);
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

function normalizeParam(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function normalizeParams(params = []) {
  return Array.isArray(params) ? params.map(normalizeParam) : [normalizeParam(params)];
}

function whereClause(where = {}, params = null) {
  const entries = Object.entries(where);
  if (entries.length === 0) return "";
  return ` WHERE ${entries
    .map(([key, value]) => {
      const column = assertSafeSqlIdentifier(key, "column");
      if (params) {
        params.push(normalizeParam(value));
        return `${column} = ?`;
      }
      return `${column} = ${quote(value)}`;
    })
    .join(" AND ")}`;
}

export function assertSafeSqlIdentifier(identifier, kind = "identifier") {
  const value = String(identifier ?? "");
  if (!IDENTIFIER_RE.test(value)) throw new Error(`Unsafe SQL ${kind}: ${value || "empty"}`);
  return value;
}

export function assertSafeTableName(table) {
  const value = assertSafeSqlIdentifier(table, "table");
  if (!TABLE_ALLOWLIST.has(value)) throw new Error(`SQL table is not allowlisted: ${value}`);
  return value;
}

export class SqliteStore {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.adapterVersion = DATABASE_ADAPTER_VERSION;
    this.db = null;
  }

  async initialize() {
    await mkdir(dirname(this.dbPath), { recursive: true });
    this.open();
    await this.exec(SCHEMA_SQL);
    await this.recordMigration("schema:base", { adapterVersion: this.adapterVersion });
    await this.migrate();
    await seedRuntimeRegistries(this, { nowIso, createId });
    return this;
  }

  open() {
    if (this.db) return this.db;
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${Math.max(1, Math.trunc(SQLITE_BUSY_TIMEOUT_MS))};
      PRAGMA journal_mode = WAL;
    `);
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async recordMigration(migrationKey, details = {}) {
    const now = nowIso();
    this.open()
      .prepare(
        `INSERT OR IGNORE INTO schema_migrations (id, migration_key, details_json, applied_at)
         VALUES (?, ?, ?, ?);`
      )
      .run(createId("migration"), migrationKey, JSON.stringify(details), now);
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
    await this.migrateColumns("pems_candidate_maturity", [
      ["supervised_advisory_allowed", "ALTER TABLE pems_candidate_maturity ADD COLUMN supervised_advisory_allowed INTEGER NOT NULL DEFAULT 0;"],
      ["promotion_status", "ALTER TABLE pems_candidate_maturity ADD COLUMN promotion_status TEXT NOT NULL DEFAULT 'shadow_review_required';"],
      ["last_reviewed_at", "ALTER TABLE pems_candidate_maturity ADD COLUMN last_reviewed_at TEXT;"],
      ["promotion_json", "ALTER TABLE pems_candidate_maturity ADD COLUMN promotion_json TEXT NOT NULL DEFAULT '{}';"]
    ]);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS pems_candidate_promotion_reviews (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        actor_user_id TEXT,
        review_type TEXT NOT NULL,
        decision TEXT NOT NULL,
        evidence_ref_count INTEGER NOT NULL DEFAULT 0,
        validator_pass_count INTEGER NOT NULL DEFAULT 0,
        safety_incident_count INTEGER NOT NULL DEFAULT 0,
        rationale_hash TEXT NOT NULL,
        rationale_preview TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (candidate_id) REFERENCES pems_candidate_maturity(candidate_id)
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS pems_candidate_evaluator_drafts (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        actor_user_id TEXT,
        draft_type TEXT NOT NULL,
        evaluator_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        deterministic_validator_status TEXT NOT NULL,
        suggested_review_type TEXT NOT NULL,
        suggested_decision TEXT NOT NULL,
        advisory_note_hash TEXT NOT NULL,
        advisory_note_preview TEXT NOT NULL DEFAULT '',
        consistency_trace_ref TEXT NOT NULL,
        consistency_trace_hash TEXT NOT NULL,
        consistency_trace_preview TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (candidate_id) REFERENCES pems_candidate_maturity(candidate_id)
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS worker_procedural_memory (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        workflow TEXT,
        selected_skill_key TEXT,
        selected_executor_key TEXT,
        terminal_outcome TEXT NOT NULL,
        procedure_ref TEXT NOT NULL,
        procedure_hash TEXT NOT NULL,
        sequence_json TEXT NOT NULL DEFAULT '[]',
        source_pointer_ids_json TEXT NOT NULL DEFAULT '[]',
        pems_candidate_id TEXT NOT NULL,
        cortex_product_memory INTEGER NOT NULL DEFAULT 0,
        production_driving_allowed INTEGER NOT NULL DEFAULT 0,
        masked_preview TEXT NOT NULL DEFAULT '',
        safety_json TEXT NOT NULL DEFAULT '{}',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS pems_trusted_answer_driving_controls (
        control_key TEXT PRIMARY KEY,
        kill_switch_enabled INTEGER NOT NULL DEFAULT 0,
        actor_user_id TEXT,
        reason_hash TEXT NOT NULL DEFAULT '',
        reason_preview TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS generated_skill_review_queue (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL,
        skill_key TEXT NOT NULL,
        package_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_action TEXT NOT NULL,
        gate_status TEXT NOT NULL,
        reviewer_user_id TEXT,
        review_decision TEXT,
        review_rationale_hash TEXT NOT NULL DEFAULT '',
        review_rationale_preview TEXT NOT NULL DEFAULT '',
        pr_branch_name TEXT NOT NULL,
        pr_title TEXT NOT NULL,
        package_json TEXT NOT NULL DEFAULT '{}',
        executor_json TEXT NOT NULL DEFAULT '{}',
        safety_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        reviewed_at TEXT
      );
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS generated_skill_pr_executor_runs (
        id TEXT PRIMARY KEY,
        queue_item_id TEXT NOT NULL,
        status TEXT NOT NULL,
        actor_user_id TEXT NOT NULL,
        operator_approval INTEGER NOT NULL DEFAULT 0,
        dry_run INTEGER NOT NULL DEFAULT 1,
        package_hash TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        files_written INTEGER NOT NULL DEFAULT 0,
        git_branch_created INTEGER NOT NULL DEFAULT 0,
        pr_open_requested INTEGER NOT NULL DEFAULT 0,
        pr_opened INTEGER NOT NULL DEFAULT 0,
        output_json TEXT NOT NULL DEFAULT '{}',
        safety_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
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
      CREATE TABLE IF NOT EXISTS research_entities (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        source_id TEXT,
        entity_type TEXT NOT NULL,
        label TEXT NOT NULL,
        normalized_value TEXT NOT NULL,
        value_hash TEXT NOT NULL,
        page_number INTEGER,
        span_start INTEGER NOT NULL,
        span_end INTEGER NOT NULL,
        confidence REAL NOT NULL,
        evidence_preview TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (artifact_id) REFERENCES research_artifacts(id),
        FOREIGN KEY (run_id) REFERENCES research_runs(id),
        FOREIGN KEY (source_id) REFERENCES knowledge_sources(id)
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
          await this.recordMigration(`column:${table}.${column}`, { table, column, sql });
        } catch (error) {
          if (!String(error.message ?? "").includes(`duplicate column name: ${column}`)) {
            throw error;
          }
        }
      }
    }
  }

  async exec(sql) {
    this.open().exec(sql);
  }

  async all(sql, params = []) {
    return this.open().prepare(sql).all(...normalizeParams(params));
  }

  async get(sql, params = []) {
    return this.open().prepare(sql).get(...normalizeParams(params)) ?? null;
  }

  async insert(table, values) {
    const safeTable = assertSafeTableName(table);
    const keys = Object.keys(values);
    const safeKeys = keys.map((key) => assertSafeSqlIdentifier(key, "column"));
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO ${safeTable} (${safeKeys.join(", ")}) VALUES (${placeholders});`;
    this.open()
      .prepare(sql)
      .run(...keys.map((key) => normalizeParam(values[key])));
    return values;
  }

  async update(table, values, where) {
    const safeTable = assertSafeTableName(table);
    const entries = Object.entries(values);
    if (!entries.length) throw new Error("Cannot update with no values.");
    const params = [];
    const assignments = entries.map(([key, value]) => {
      params.push(normalizeParam(value));
      return `${assertSafeSqlIdentifier(key, "column")} = ?`;
    });
    const whereSql = whereClause(where, params);
    this.open()
      .prepare(`UPDATE ${safeTable} SET ${assignments.join(", ")}${whereSql};`)
      .run(...params);
  }

  async findOne(table, where) {
    const params = [];
    return this.get(`SELECT * FROM ${assertSafeTableName(table)}${whereClause(where, params)} LIMIT 1;`, params);
  }

  async list(table, where = {}) {
    const params = [];
    return this.all(`SELECT * FROM ${assertSafeTableName(table)}${whereClause(where, params)} ORDER BY created_at ASC;`, params);
  }

  async counts() {
    const counts = {};
    for (const table of TABLES) {
      const row = await this.get(`SELECT COUNT(*) AS count FROM ${table};`);
      counts[table] = row?.count ?? 0;
    }
    return counts;
  }

  async transaction(callback) {
    const db = this.open();
    db.exec("BEGIN IMMEDIATE;");
    try {
      const result = await callback(this);
      db.exec("COMMIT;");
      return result;
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
}
