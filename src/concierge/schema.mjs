export const TABLES = [
  "users",
  "user_consents",
  "portal_accounts",
  "sessions",
  "session_state",
  "session_checkpoints",
  "session_events",
  "runtime_events",
  "runtime_hook_subscriptions",
  "runtime_hook_deliveries",
  "memory_items",
  "context_packets",
  "openclaw_instances",
  "agent_tasks",
  "scheduled_jobs",
  "worker_continuations",
  "agent_outbox",
  "memory_harness_runs",
  "workflow_definitions",
  "tool_registry",
  "workflow_tool_requirements",
  "knowledge_sources",
  "openclaw_skills",
  "workflow_runs",
  "user_journey_events",
  "memory_reflections",
  "conversation_messages",
  "browser_runs",
  "browser_actions",
  "portal_page_snapshots",
  "eligibility_snapshots",
  "benefit_items",
  "coverage_balances",
  "claim_items",
  "prior_authorizations",
  "extraction_artifacts",
  "extraction_reviews",
  "approval_gates",
  "audit_events"
];

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  screenshot_policy TEXT NOT NULL,
  phi_storage_fields TEXT NOT NULL,
  read_only_extraction_approved INTEGER NOT NULL,
  website_actions_approved INTEGER NOT NULL,
  credential_boundary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS portal_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payer TEXT NOT NULL,
  portal_url TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  langgraph_thread_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Eligibility and benefits session',
  current_step TEXT NOT NULL DEFAULT 'created',
  last_intent TEXT,
  active_workflow_key TEXT,
  journey_stage TEXT,
  last_context_packet_id TEXT,
  state_version INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  last_active_at TEXT,
  expires_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_state (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  langgraph_thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT 'brainstyworkers',
  state_json TEXT NOT NULL,
  state_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  langgraph_thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT 'brainstyworkers',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  step_name TEXT NOT NULL,
  state_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS runtime_events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  correlation_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS runtime_hook_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_url TEXT,
  secret TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS runtime_hook_deliveries (
  id TEXT PRIMARY KEY,
  subscription_id TEXT,
  runtime_event_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_url TEXT,
  status TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES runtime_hook_subscriptions(id),
  FOREIGN KEY (runtime_event_id) REFERENCES runtime_events(id)
);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  memory_scope TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  source_table TEXT,
  source_id TEXT,
  source_url TEXT,
  sensitivity TEXT NOT NULL,
  retention_policy TEXT NOT NULL,
  adapter_status TEXT NOT NULL,
  occurred_at TEXT,
  valid_from_at TEXT,
  valid_until_at TEXT,
  last_verified_at TEXT,
  temporal_metadata_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS context_packets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  packet_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  packet_json TEXT NOT NULL,
  generated_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS openclaw_instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  dedicated_channel TEXT NOT NULL,
  heartbeat_interval_minutes INTEGER NOT NULL,
  last_heartbeat_at TEXT,
  last_context_packet_id TEXT,
  heartbeat_state_json TEXT NOT NULL DEFAULT '{}',
  heartbeat_prompt_json TEXT NOT NULL DEFAULT '{}',
  persona_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  workflow_key TEXT,
  journey_stage TEXT,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  description TEXT NOT NULL,
  source_table TEXT,
  source_id TEXT,
  scheduled_job_id TEXT,
  due_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (scheduled_job_id) REFERENCES scheduled_jobs(id)
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  workflow_key TEXT,
  journey_stage TEXT,
  job_type TEXT NOT NULL,
  schedule_label TEXT NOT NULL,
  status TEXT NOT NULL,
  next_run_at TEXT,
  last_run_at TEXT,
  requires_integration TEXT,
  approval_status TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id),
  FOREIGN KEY (scheduled_job_id) REFERENCES scheduled_jobs(id),
  FOREIGN KEY (last_runtime_event_id) REFERENCES runtime_events(id)
);

CREATE TABLE IF NOT EXISTS agent_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  related_task_id TEXT,
  approval_status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (related_task_id) REFERENCES agent_tasks(id)
);

CREATE TABLE IF NOT EXISTS memory_harness_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT PRIMARY KEY,
  workflow_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  journey_stage TEXT NOT NULL,
  description TEXT NOT NULL,
  required_user_fields_json TEXT NOT NULL DEFAULT '[]',
  required_data_pointers_json TEXT NOT NULL DEFAULT '[]',
  required_tools_json TEXT NOT NULL DEFAULT '[]',
  memory_scopes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_registry (
  id TEXT PRIMARY KEY,
  tool_key TEXT NOT NULL UNIQUE,
  tool_type TEXT NOT NULL,
  title TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  integration_status TEXT NOT NULL,
  approval_required TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_tool_requirements (
  id TEXT PRIMARY KEY,
  workflow_key TEXT NOT NULL,
  tool_key TEXT NOT NULL,
  required_for TEXT NOT NULL,
  fallback_tool_keys_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  authority_level TEXT NOT NULL,
  base_url TEXT NOT NULL,
  workflow_keys_json TEXT NOT NULL DEFAULT '[]',
  refresh_policy TEXT NOT NULL,
  access_method TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS openclaw_skills (
  id TEXT PRIMARY KEY,
  skill_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  allowed_tools_json TEXT NOT NULL DEFAULT '[]',
  fallback_strategy_json TEXT NOT NULL DEFAULT '{}',
  prompt_contract_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  workflow_key TEXT NOT NULL,
  journey_stage TEXT NOT NULL,
  status TEXT NOT NULL,
  route_reason TEXT NOT NULL,
  readiness_json TEXT NOT NULL DEFAULT '{}',
  memory_context_ids_json TEXT NOT NULL DEFAULT '[]',
  tool_plan_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS user_journey_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  workflow_key TEXT NOT NULL,
  journey_stage TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS memory_reflections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT,
  reflection_type TEXT NOT NULL,
  workflow_key TEXT,
  content TEXT NOT NULL,
  memory_item_ids_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS browser_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  portal_account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  remote_debugger_url TEXT NOT NULL,
  start_url TEXT NOT NULL,
  current_url TEXT,
  page_title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (portal_account_id) REFERENCES portal_accounts(id)
);

CREATE TABLE IF NOT EXISTS browser_actions (
  id TEXT PRIMARY KEY,
  browser_run_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_url TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (browser_run_id) REFERENCES browser_runs(id)
);

CREATE TABLE IF NOT EXISTS portal_page_snapshots (
  id TEXT PRIMARY KEY,
  browser_run_id TEXT,
  session_id TEXT NOT NULL,
  portal_account_id TEXT NOT NULL,
  page_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  visible_text TEXT NOT NULL,
  links_json TEXT NOT NULL,
  extracted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (browser_run_id) REFERENCES browser_runs(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (portal_account_id) REFERENCES portal_accounts(id)
);

CREATE TABLE IF NOT EXISTS eligibility_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  portal_account_id TEXT NOT NULL,
  source_url TEXT,
  summary TEXT NOT NULL,
  raw_text TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (portal_account_id) REFERENCES portal_accounts(id)
);

CREATE TABLE IF NOT EXISTS benefit_items (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  category TEXT NOT NULL,
  detail TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES eligibility_snapshots(id)
);

CREATE TABLE IF NOT EXISTS coverage_balances (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  balance_type TEXT NOT NULL,
  label TEXT NOT NULL,
  total_amount REAL,
  spent_amount REAL,
  remaining_amount REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES eligibility_snapshots(id)
);

CREATE TABLE IF NOT EXISTS claim_items (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  description TEXT NOT NULL,
  member_name TEXT,
  service_date TEXT,
  share_amount REAL,
  raw_text TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES eligibility_snapshots(id)
);

CREATE TABLE IF NOT EXISTS prior_authorizations (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  provider_or_facility TEXT,
  service_date TEXT,
  status TEXT,
  raw_text TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES eligibility_snapshots(id)
);

CREATE TABLE IF NOT EXISTS extraction_artifacts (
  id TEXT PRIMARY KEY,
  browser_run_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (browser_run_id) REFERENCES browser_runs(id)
);

CREATE TABLE IF NOT EXISTS extraction_reviews (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  status TEXT NOT NULL,
  review_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES eligibility_snapshots(id)
);

CREATE TABLE IF NOT EXISTS approval_gates (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  gate_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  event_type TEXT NOT NULL,
  details TEXT NOT NULL,
  previous_event_hash TEXT,
  event_hash TEXT,
  chain_version TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
`;
