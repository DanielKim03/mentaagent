-- TESTING: remove the source-upload quota. The free tier shipped with a
-- 3-upload cap (workspaces.source_upload_quota DEFAULT 3), which blocks
-- multi-file testing once exhausted. Clear it for every existing workspace
-- and make new workspaces unlimited too.
--
-- Re-introduce a real cap (driven by the Paddle plan tier) before charging
-- customers — see plan §"Not built yet: Paddle billing wiring".

UPDATE workspaces SET source_upload_quota = NULL;
ALTER TABLE workspaces ALTER COLUMN source_upload_quota SET DEFAULT NULL;
