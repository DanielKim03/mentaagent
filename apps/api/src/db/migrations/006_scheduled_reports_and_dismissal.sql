-- Scheduled reports + alert dismissal lifecycle.

-- Reports can now be generated on a cadence (weekly/monthly) by the worker,
-- not just on demand. `period` distinguishes them; the per-workspace
-- timestamps gate the sweep so a report is generated at most once per window.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS last_weekly_report_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_monthly_report_at TIMESTAMPTZ;

-- Dismissed alerts are kept (visible + restorable) for 24h, then purged by
-- the maintenance sweep. dismissed_at records when the clock started.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS alerts_dismissed_idx
  ON alerts(dismissed_at) WHERE status = 'dismissed';
