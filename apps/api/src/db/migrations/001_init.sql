-- MentaAgent schema.
--
-- Single user, self-hosted: there is one workspace (seeded at the bottom),
-- but every table keeps a workspace_id so the data model stays explicit.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Workspace and model settings
-- ---------------------------------------------------------------------------

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Onboarding profile: industry, business model, team size, revenue band,
  -- goals/pains, advisor_style (direct|coaching|detailed). Injected into
  -- every agent system prompt.
  business_profile JSONB NOT NULL DEFAULT '{}',
  -- Scheduled monitoring and report bookkeeping.
  last_monitor_at TIMESTAMPTZ,
  last_weekly_report_at TIMESTAMPTZ,
  last_monthly_report_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Model provider settings entered on the web Settings page. One row. A NULL
-- column falls back to the matching environment variable. Stored in plain
-- text: the database is on the owner's own machine.
CREATE TABLE llm_settings (
  id                  BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  llm_base_url        TEXT,
  llm_api_key         TEXT,
  agent_model         TEXT,
  heavy_model         TEXT,
  llm_tool_mode       TEXT CHECK (llm_tool_mode IN ('native', 'hermes-xml')),
  embeddings_base_url TEXT,
  embeddings_api_key  TEXT,
  embeddings_model    TEXT,
  vision_model        TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LLM usage metering: every chat/embedding call is pre-charged here under an
-- advisory lock, then reconciled to real token counts. Feeds the optional
-- daily spend cap and the per-run cost caps.
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
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sources_workspace_idx ON sources(workspace_id, created_at DESC);

-- A normalized document the agent can read. One upload produces one document;
-- re-uploading a file with the same name replaces it.
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'other',
  content_text TEXT NOT NULL,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  token_count INT,
  modified_at TIMESTAMPTZ,
  -- When the document went through entity extraction (knowledge graph).
  entities_extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX documents_workspace_idx ON documents(workspace_id, created_at DESC);

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
-- Alerts (findings) with agent provenance and outcome tracking
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
  resolved_at TIMESTAMPTZ,
  -- Dismissed alerts stay visible and restorable for 24h, then are purged.
  dismissed_at TIMESTAMPTZ,
  agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  -- Wins ledger: what actually happened after the recommendation.
  outcome TEXT,
  outcome_noted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX alerts_workspace_status_idx ON alerts(workspace_id, status, severity);
CREATE INDEX alerts_due_idx ON alerts(due_at) WHERE status = 'open' AND due_at IS NOT NULL;
CREATE INDEX alerts_dismissed_idx ON alerts(dismissed_at) WHERE status = 'dismissed';

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'gap_analysis',
  -- weekly | monthly (scheduled) or manual
  period TEXT NOT NULL DEFAULT 'manual',
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
-- Knowledge graph: entities extracted from documents, and the edges that
-- connect documents through them. Powers the /graph page and the
-- find_connections agent tool.
-- ---------------------------------------------------------------------------

CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- lowercased/trimmed key for dedup within a workspace
  norm TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'other'
    CHECK (entity_type IN ('customer', 'vendor', 'product', 'person', 'contract', 'location', 'other')),
  mention_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, norm)
);
CREATE INDEX entities_workspace_idx ON entities(workspace_id);

CREATE TABLE document_entities (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, entity_id)
);
CREATE INDEX document_entities_entity_idx ON document_entities(entity_id);
CREATE INDEX document_entities_workspace_idx ON document_entities(workspace_id);

-- ---------------------------------------------------------------------------
-- Semantic retrieval: per-chunk embeddings (pgvector), fused with full-text
-- search at query time. If Postgres has no pgvector this block does nothing
-- and search stays full-text only. vector(1024) matches BAAI/bge-m3; a model
-- with another dimension needs a column rebuild.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector unavailable (%) — semantic retrieval disabled, FTS-only', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(1024);
    CREATE INDEX IF NOT EXISTS chunks_embedding_idx
      ON chunks USING hnsw (embedding vector_cosine_ops);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Seed: the one workspace (fixed id, see DEFAULT_WORKSPACE_ID in the API) and
-- the one settings row.
-- ---------------------------------------------------------------------------

INSERT INTO workspaces (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'My business');

INSERT INTO llm_settings (id) VALUES (TRUE);
