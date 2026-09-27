-- MentaAgent is self-hosted and single-user: no accounts, no plans, one
-- workspace (the one seeded in 003). Lift every free-tier limit the hosted
-- version put on it, and make sure any other workspace row is unlimited too.
ALTER TABLE workspaces ALTER COLUMN source_upload_quota SET DEFAULT NULL;
ALTER TABLE workspaces ALTER COLUMN question_quota SET DEFAULT NULL;
ALTER TABLE workspaces ALTER COLUMN llm_cap_usd_micros SET DEFAULT NULL;

UPDATE workspaces
   SET source_upload_quota = NULL,
       question_quota = NULL,
       llm_cap_usd_micros = NULL,
       current_period_start = NULL;

-- Model provider settings entered in the web app (Settings page). One row.
-- A NULL column falls back to the matching environment variable, so a .env
-- setup keeps working. Stored in plain text: the database is on the owner's
-- own machine.
CREATE TABLE IF NOT EXISTS llm_settings (
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
INSERT INTO llm_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;
