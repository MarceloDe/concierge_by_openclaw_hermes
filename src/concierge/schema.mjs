export const TABLES = [
  "schema_migrations",
  "users",
  "user_consents",
  "portal_accounts",
  "sessions",
  "session_state",
  "session_checkpoints",
  "session_events",
  "runtime_events",
  "worker_leases",
  "runtime_hook_subscriptions",
  "runtime_hook_deliveries",
  "memory_items",
  "product_memory_replay_queue",
  "context_packets",
  "openclaw_instances",
  "agent_tasks",
  "human_handoff_items",
  "scheduled_jobs",
  "worker_continuations",
  "agent_outbox",
  "memory_harness_runs",
  "workflow_definitions",
  "tool_registry",
  "workflow_tool_requirements",
  "knowledge_sources",
  "research_runs",
  "research_run_events",
  "research_artifacts",
  "research_embedding_routes",
  "research_embedding_jobs",
  "research_embedding_index",
  "research_graph_builds",
  "research_claim_evaluations",
  "research_schedules",
  "research_scheduler_daemon_state",
  "continuous_intelligence_shadow_runs",
  "pems_candidate_maturity",
  "pems_candidate_promotion_reviews",
  "pems_candidate_evaluator_drafts",
  "pems_candidate_claim_revisions",
  "pems_candidate_review_followups",
  "operator_tool_proposals",
  "openclaw_skills",
  "workflow_runs",
  "user_journey_events",
  "memory_reflections",
  "conversation_messages",
  "feedback_items",
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

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  migration_key TEXT NOT NULL UNIQUE,
  details_json TEXT NOT NULL DEFAULT '{}',
  applied_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS worker_leases (
  id TEXT PRIMARY KEY,
  lease_key TEXT NOT NULL UNIQUE,
  worker_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  claim_count INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  claimed_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  released_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS product_memory_replay_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  adapter TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  source_pointer_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  first_error TEXT,
  last_error TEXT,
  next_attempt_at TEXT,
  last_attempt_at TEXT,
  completed_at TEXT,
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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id),
  FOREIGN KEY (message_id) REFERENCES conversation_messages(id)
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
  priority INTEGER NOT NULL DEFAULT 100,
  last_run_at TEXT,
  last_status TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  proposed_by TEXT,
  approved_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  source_key TEXT,
  actor_user_id TEXT,
  run_type TEXT NOT NULL,
  workflow_key TEXT,
  status TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  query_json TEXT NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  retry_of_run_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES knowledge_sources(id),
  FOREIGN KEY (retry_of_run_id) REFERENCES research_runs(id)
);

CREATE TABLE IF NOT EXISTS research_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES research_runs(id)
);

CREATE TABLE IF NOT EXISTS research_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_id TEXT,
  artifact_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT,
  content_hash TEXT NOT NULL,
  extraction_hash TEXT NOT NULL,
  safe_text_preview TEXT NOT NULL DEFAULT '',
  citation_status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES research_runs(id),
  FOREIGN KEY (source_id) REFERENCES knowledge_sources(id)
);

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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (artifact_id) REFERENCES research_artifacts(id),
  FOREIGN KEY (job_id) REFERENCES research_embedding_jobs(id)
);

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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES knowledge_sources(id),
  FOREIGN KEY (last_run_id) REFERENCES research_runs(id)
);

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
  updated_at TEXT NOT NULL,
  FOREIGN KEY (last_tick_event_id) REFERENCES runtime_events(id)
);

CREATE TABLE IF NOT EXISTS continuous_intelligence_shadow_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  graph_trace_id TEXT,
  case_ref TEXT NOT NULL,
  workflow TEXT,
  mode TEXT NOT NULL,
  gate_score INTEGER NOT NULL DEFAULT 0,
  gate_passed INTEGER NOT NULL DEFAULT 0,
  gate_total INTEGER NOT NULL DEFAULT 0,
  pems_candidate_id TEXT NOT NULL,
  pems_score INTEGER NOT NULL DEFAULT 0,
  pems_trusted INTEGER NOT NULL DEFAULT 0,
  production_driving_allowed INTEGER NOT NULL DEFAULT 0,
  source_pointer_count INTEGER NOT NULL DEFAULT 0,
  workflow_outcome TEXT,
  final_response_prepared INTEGER NOT NULL DEFAULT 0,
  shadow_json TEXT NOT NULL DEFAULT '{}',
  safety_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS pems_candidate_maturity (
  candidate_id TEXT PRIMARY KEY,
  workflow TEXT,
  selected_skill_key TEXT,
  shadow_run_count INTEGER NOT NULL DEFAULT 0,
  evidence_ref_count INTEGER NOT NULL DEFAULT 0,
  successful_outcome_count INTEGER NOT NULL DEFAULT 0,
  reviewer_approval_count INTEGER NOT NULL DEFAULT 0,
  authority_citation_count INTEGER NOT NULL DEFAULT 0,
  validator_pass_count INTEGER NOT NULL DEFAULT 0,
  safety_incident_count INTEGER NOT NULL DEFAULT 0,
  latest_score INTEGER NOT NULL DEFAULT 0,
  trusted INTEGER NOT NULL DEFAULT 0,
  supervised_advisory_allowed INTEGER NOT NULL DEFAULT 0,
  promotion_status TEXT NOT NULL DEFAULT 'shadow_review_required',
  last_reviewed_at TEXT,
  production_driving_allowed INTEGER NOT NULL DEFAULT 0,
  maturity_json TEXT NOT NULL DEFAULT '{}',
  promotion_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS pems_candidate_claim_revisions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  advisory_draft_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  actor_user_id TEXT,
  revision_status TEXT NOT NULL,
  original_claim_hash TEXT NOT NULL,
  original_claim_preview TEXT NOT NULL DEFAULT '',
  suggested_edit_hash TEXT NOT NULL,
  suggested_edit_preview TEXT NOT NULL DEFAULT '',
  revised_claim_hash TEXT NOT NULL,
  revised_claim_preview TEXT NOT NULL DEFAULT '',
  source_pointer_ids_json TEXT NOT NULL DEFAULT '[]',
  deterministic_reclosure_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES pems_candidate_maturity(candidate_id),
  FOREIGN KEY (advisory_draft_id) REFERENCES pems_candidate_evaluator_drafts(id)
);

CREATE TABLE IF NOT EXISTS pems_candidate_review_followups (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  advisory_draft_id TEXT NOT NULL,
  claim_revision_id TEXT NOT NULL,
  promotion_review_id TEXT NOT NULL,
  actor_user_id TEXT,
  followup_type TEXT NOT NULL,
  followup_status TEXT NOT NULL,
  workflow_status TEXT NOT NULL,
  revision_outcome TEXT NOT NULL,
  action_required TEXT NOT NULL,
  rationale_hash TEXT NOT NULL,
  rationale_preview TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (candidate_id) REFERENCES pems_candidate_maturity(candidate_id),
  FOREIGN KEY (advisory_draft_id) REFERENCES pems_candidate_evaluator_drafts(id),
  FOREIGN KEY (claim_revision_id) REFERENCES pems_candidate_claim_revisions(id),
  FOREIGN KEY (promotion_review_id) REFERENCES pems_candidate_promotion_reviews(id)
);

CREATE TABLE IF NOT EXISTS operator_tool_proposals (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  tool_key TEXT NOT NULL,
  tool_type TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL,
  request_message_hash TEXT NOT NULL,
  request_message_preview TEXT NOT NULL DEFAULT '',
  args_json TEXT NOT NULL DEFAULT '{}',
  args_hash TEXT NOT NULL,
  expected_effect TEXT NOT NULL,
  approval_required TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  approved_by TEXT,
  rejected_by TEXT,
  decided_at TEXT,
  executed_at TEXT,
  execution_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
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

CREATE TABLE IF NOT EXISTS feedback_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_id TEXT,
  task_id TEXT,
  answer_hash TEXT,
  rating TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  source_pointer_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (message_id) REFERENCES conversation_messages(id)
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
