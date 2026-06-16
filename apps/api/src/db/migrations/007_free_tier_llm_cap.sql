-- Every workspace needs an LLM spend cap, not just paid ones. Until now a
-- new (never-subscribed) workspace had llm_cap_usd_micros = NULL, which the
-- budget checker treats as "no cap" — i.e. free users could run up unbounded
-- model spend. Give the column a default so signups are capped, and backfill
-- existing uncapped free workspaces.
--
-- Paid tiers are still written by the Paddle webhook from lib/plans.ts; this
-- value is the freemium floor (also where a lapsed/canceled subscription
-- lands). The budget checker windows spend per UTC calendar month for
-- workspaces without an active billing period, so this is a ~$1.00/month
-- allowance that resets monthly. Keep this in sync with PLANS.free in
-- apps/web/lib/plans.ts.
ALTER TABLE workspaces ALTER COLUMN llm_cap_usd_micros SET DEFAULT 1000000;

UPDATE workspaces
   SET llm_cap_usd_micros = 1000000
 WHERE llm_cap_usd_micros IS NULL
   AND plan = 'free'
   -- Leave the dev default workspace unlimited (seeded NULL in 003).
   AND id <> '00000000-0000-0000-0000-000000000001';
