-- Re-introduce real free-tier consumption limits, now that the landing page
-- advertises them: a free workspace gets 4 uploaded files and 8 questions (a
-- taste of the product), then must upgrade. Both are lifetime counters the API
-- decrements (and refunds on a failure the owner didn't cause); the Paddle
-- webhook resets them when the plan actually changes. NULL = unlimited (paid /
-- grandfathered / the seeded dev workspace). Keep in sync with PLANS in
-- apps/web/lib/plans.ts.

-- Files: migration 005 lifted the cap to NULL for everyone while testing.
-- Re-cap new signups at 4 and backfill existing *free* workspaces that are
-- still uncapped — leave paid workspaces (whose real cap the webhook writes)
-- and the seeded dev workspace alone.
ALTER TABLE workspaces ALTER COLUMN source_upload_quota SET DEFAULT 4;

UPDATE workspaces
   SET source_upload_quota = 4
 WHERE source_upload_quota IS NULL
   AND plan = 'free'
   AND id <> '00000000-0000-0000-0000-000000000001';

-- Questions: a brand-new counter. Default 8 so new (free) signups are capped;
-- NULL means unlimited. ADD COLUMN backfills every existing row to 8 — then
-- lift the cap back off for paid plans and the seeded dev workspace.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS question_quota INT DEFAULT 8;

UPDATE workspaces
   SET question_quota = NULL
 WHERE plan IN ('pro', 'max')
    OR id = '00000000-0000-0000-0000-000000000001';
