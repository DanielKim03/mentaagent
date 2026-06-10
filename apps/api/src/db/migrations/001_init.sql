-- MentaAgent consolidated initial schema.
-- Adapted from Mentapath's proven migrations (auth, billing, usage, alerts)
-- plus the new agent-product tables (documents/chunks, agent runs, memory,
-- skills, watchlist, reports, connections).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Tenancy, auth, billing (Mentapath shapes, wiki-free)
-- ---------------------------------------------------------------------------

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Onboarding profile: industry, business model, team size, revenue band,
  -- goals/pains, advisor_style (direct|coaching|detailed). Injected into
  -- every agent system prompt.
  business_profile JSONB NOT NULL DEFAULT '{}',
  -- Billing (Paddle is the single writer for paid-plan caps).
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'max')),
  llm_cap_usd_micros BIGINT,
  seat_limit INT DEFAULT 1,
  source_upload_quota INT DEFAULT 3,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  subscription_status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  last_billing_event_at TIMESTAMPTZ,
  -- Scheduled monitoring bookkeeping.
  last_monitor_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT,
  email_verified TIMESTAMPTZ,
  image TEXT,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'member',
  alert_emails BOOLEAN NOT NULL DEFAULT TRUE,
  session_token_version INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Case-insensitive uniqueness (sign-in normalizes, but belt and braces).
CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));

CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE accounts (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  PRIMARY KEY (provider, provider_account_id)
);
CREATE INDEX accounts_user_id_idx ON accounts(user_id);

-- Source of truth for "who belongs to which workspace, with what role".
-- The API trust boundary re-verifies this pair on every request.
CREATE TABLE memberships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, workspace_id)
);
CREATE INDEX memberships_workspace_idx ON memberships(workspace_id);

-- LLM usage metering: every chat/embedding call is pre-charged here under a
-- per-workspace advisory lock, then reconciled to real token counts.
CREATE TABLE llm_usage (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  prompt_tokens INT NOT NULL,
  completion_tokens INT NOT NULL,
  cost_usd_micros BIGINT NOT NULL
);
CREATE INDEX llm_usage_workspace_created_idx ON llm_usage(workspace_id, created_at);
CREATE INDEX llm_usage_created_at_idx ON llm_usage(created_at);

-- Deploy-surviving store for the web app's rate limiters.
CREATE TABLE rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX rate_limits_reset_at_idx ON rate_limits (reset_at);

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX activity_log_workspace_idx ON activity_log(workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Sources (raw uploads) and the knowledge layer (documents → chunks)
-- ---------------------------------------------------------------------------

CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}',
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sources_workspace_idx ON sources(workspace_id, created_at DESC);

-- A normalized document the agent can read. One upload may produce one
-- document; a connector sync inserts documents directly (same entry point —
-- that's the connector contract). external_id identifies a document within
-- a connection for incremental re-sync (changed docs replace by external_id).
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  connection_id UUID, -- FK added with connections table below
  external_id TEXT,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other',
  content_text TEXT NOT NULL,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  token_count INT,
  modified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX documents_workspace_idx ON documents(workspace_id, created_at DESC);
CREATE UNIQUE INDEX documents_external_idx
  ON documents(workspace_id, connection_id, external_id)
  WHERE connection_id IS NOT NULL AND external_id IS NOT NULL;

-- Retrieval units. fts is generated so FTS always works; embedding is filled
-- by the embed sweep when an embeddings key is configured (else FTS-only).
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  content TEXT NOT NULL,
  char_start INT,
  char_end INT,
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, seq)
);
CREATE INDEX chunks_workspace_idx ON chunks(workspace_id);
CREATE INDEX chunks_fts_idx ON chunks USING GIN (fts);

-- ---------------------------------------------------------------------------
-- Agent runtime: sessions → runs → messages (single source of truth)
-- ---------------------------------------------------------------------------

CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'chat',
  title TEXT,
  -- Rolling summary written by reflect runs when the session idles;
  -- recent summaries are injected into new chat prompts.
  summary TEXT,
  summarized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX agent_sessions_workspace_idx ON agent_sessions(workspace_id, created_at DESC);

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('chat', 'report', 'monitor', 'reflect', 'consolidate')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'paused_budget', 'cancelled')),
  trigger TEXT NOT NULL DEFAULT 'user' CHECK (trigger IN ('user', 'schedule', 'system')),
  model TEXT,
  iterations INT NOT NULL DEFAULT 0,
  max_iterations INT NOT NULL DEFAULT 12,
  cost_cap_usd_micros BIGINT NOT NULL DEFAULT 100000, -- $0.10 default (chat)
  cost_usd_micros BIGINT NOT NULL DEFAULT 0,
  report_id UUID, -- FK added with reports table below
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX agent_runs_workspace_idx ON agent_runs(workspace_id, created_at DESC);
CREATE INDEX agent_runs_session_idx ON agent_runs(session_id, created_at);
CREATE INDEX agent_runs_status_idx ON agent_runs(status) WHERE status IN ('queued', 'running');

-- Full OpenAI-shaped transcript per run. Streaming events derive from these
-- rows; resume = reload messages and continue; UI replay = fetch then tail.
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  session_id UUID REFERENCES agent_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  tool_calls JSONB,
  tool_call_id TEXT,
  name TEXT,
  prompt_tokens INT,
  completion_tokens INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, seq)
);
CREATE INDEX agent_messages_session_idx ON agent_messages(session_id, created_at);
-- Episodic recall (search_history tool): FTS over what the agent and user said.
CREATE INDEX agent_messages_fts_idx ON agent_messages
  USING GIN (to_tsvector('english', content))
  WHERE role IN ('user', 'assistant');

-- ---------------------------------------------------------------------------
-- Learning layer: curated memory, skills, watchlist
-- ---------------------------------------------------------------------------

-- Curated per-workspace memory. Four categories, each under a hard char
-- budget enforced in code (over-budget writes tell the agent to consolidate).
-- Injected into every system prompt. Writes only ever originate from
-- conversation-derived runs (never from raw document text) and carry
-- provenance. User-visible/editable in the "What your analyst knows" page.
CREATE TABLE workspace_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL
    CHECK (category IN ('business_facts', 'owner_preferences', 'advisor_notes', 'open_loops')),
  content TEXT NOT NULL,
  due_at TIMESTAMPTZ, -- open_loops may carry a follow-up date
  source_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX workspace_memory_idx ON workspace_memory(workspace_id, category);

-- Analysis playbooks. workspace_id NULL = global library (curated, seeded
-- from skills/*.md in the repo); non-NULL = per-workspace learned skill.
-- Skills are markdown instructions only — never executable code.
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'curated' CHECK (source IN ('curated', 'agent')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed', 'archived')),
  -- Optional applicability filter matched against business_profile.industry.
  industries TEXT[] NOT NULL DEFAULT '{}',
  use_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One name per scope (global vs per-workspace; workspace shadows global).
CREATE UNIQUE INDEX skills_global_name_idx ON skills(name) WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX skills_workspace_name_idx ON skills(workspace_id, name) WHERE workspace_id IS NOT NULL;

-- Things the analyst is watching for this business ("vendor contract renews
-- Aug 1", "review AR aging monthly"). Monitor runs load only DUE items.
CREATE TABLE watch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily', 'weekly', 'monthly', 'once')),
  next_due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'agent' CHECK (created_by IN ('user', 'agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX watch_items_due_idx ON watch_items(workspace_id, next_due_at);

-- ---------------------------------------------------------------------------
-- Alerts (findings) — Mentapath shape + agent provenance + outcome tracking
-- ---------------------------------------------------------------------------

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  recommended_action TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  due_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  -- Wins ledger: what actually happened after the recommendation.
  outcome TEXT,
  outcome_noted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX alerts_workspace_status_idx ON alerts(workspace_id, status, severity);
CREATE INDEX alerts_due_idx ON alerts(due_at) WHERE status = 'open' AND due_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'gap_analysis',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'ready', 'failed')),
  rubric JSONB NOT NULL DEFAULT '{}',
  overall_score SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX reports_workspace_idx ON reports(workspace_id, created_at DESC);

CREATE TABLE report_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  content_md TEXT NOT NULL DEFAULT '',
  citations JSONB NOT NULL DEFAULT '[]',
  score SMALLINT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'written')),
  UNIQUE (report_id, section_key)
);

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_report_fk
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Connectors (framework lands now; first connector ships Phase 3)
-- ---------------------------------------------------------------------------

CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'revoked')),
  auth_encrypted BYTEA,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  sync_cursor JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider)
);

ALTER TABLE documents
  ADD CONSTRAINT documents_connection_fk
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE;

CREATE TABLE sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  stats JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
