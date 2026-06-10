-- Seed a default workspace for local development (the API's dev fallback
-- when INTERNAL_API_SECRET is unset). Fixed UUID so the API can reference it
-- without a lookup. Unlimited quotas in dev.
INSERT INTO workspaces (id, name, source_upload_quota, llm_cap_usd_micros)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Workspace', NULL, NULL)
ON CONFLICT (id) DO NOTHING;
