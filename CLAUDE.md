# MentaAgent

Self-hosted AI business analyst: the owner uploads business files and an
agent tells them what the business is lacking and what to improve — with
memory and skills so it gets better at advising the business over time.
Open source (Apache 2.0). Started as a subscription SaaS; accounts and billing
were removed for the open release.

**Single-user, local.** No login, no accounts, no plans. Every request and job
uses the one seeded workspace (`DEFAULT_WORKSPACE_ID`, migration 003).
docker compose binds published ports to 127.0.0.1 because there is no auth.
The `users`/`memberships` tables and the workspace quota columns still exist
in the schema but are unused (quotas are NULL = unlimited, migration 009).

## Services

pnpm monorepo, three deployable processes + Postgres 16 (pgvector) + Redis:

- **web** (`apps/web`) — Next.js 14 App Router, no auth. Browser calls go
  through `/api/proxy/*`, which adds the `INTERNAL_API_SECRET` bearer.
  Server components use `lib/api.ts` (same header, direct). `/` redirects to
  `/chat`.
- **api** (`apps/api/src/server.ts`) — Fastify on :3001, private network.
  `lib/auth.ts` checks the shared secret when set and pins every request to
  the default workspace with the admin role.
- **worker** (`apps/api/src/worker.ts`) — BullMQ consumers: `ingest`
  (parse→chunk→embed→summarize), `agent` (runs the loop), `maintenance`
  repeatable tick every 15 min (idle-session reflect sweep, weekly monitor
  fan-out, nightly memory consolidation, embed backfill).

## Run it (no setup)

`docker compose up` builds and runs everything (postgres, redis, api, worker,
web) at http://localhost:3000 with zero API keys. The internal secret is
generated on first run. The model key is entered on the web Settings page
(`/settings`) or in `.env`.

## Local dev

```bash
docker compose up -d postgres redis   # postgres :5433, redis :6380 (offset ports)
cp .env.example .env           # blank vars are fine: treated as unset, dev AUTH_SECRET fallback
pnpm install
pnpm --filter api migrate
pnpm --filter api dev          # API :3001
pnpm --filter api dev:worker   # worker (separate terminal)
pnpm --filter web dev          # web :3000
pnpm --filter api test         # DB-backed vitest (needs docker up; never calls paid LLMs)
```

No `LLM_API_KEY` → **stub provider**: deterministic canned turns so the whole
pipeline (queue → loop → tools → SSE → persistence → reports) runs with zero
spend. Tests script it via `setStubScript()` in `services/agent/provider.ts`.

## LLM

`services/llm/client.ts` — OpenAI SDK against any compatible host. Default:
DeepSeek V4 Flash/Pro on DeepInfra (one key also serves bge-m3 embeddings and
Qwen3-VL vision). **Config comes from `services/llm/settings.ts`**: the
one-row `llm_settings` table (written by the web Settings page) over env
vars; API and worker re-read it every 5 s, and clients are rebuilt when the
URL or key changes. Tests (`NODE_ENV=test`) ignore the table so they never
pick up a real key. Fallback
mode `LLM_TOOL_MODE=hermes-xml` for hosts without native tool calling
(schemas in system prompt, `<tool_call>` parsed from text). Embeddings:
bge-m3 on DeepInfra (separate key). Vision (image ingest): Qwen3-VL on
DeepInfra via `callVision` (`VISION_*` env; key/URL fall back to the
embeddings provider). **Budget discipline (load-bearing, copied from
Mentapath): every chat/embed/vision call atomically pre-charges `llm_usage`
under a per-workspace advisory lock, reconciles to real tokens after;
per-workspace billing-period cap + instance daily cap → HTTP 402.**

## Agent runtime (`apps/api/src/services/agent/`)

- `agent_sessions` → `agent_runs` (kind: `chat|report|monitor|reflect|
  consolidate`) → `agent_messages` (OpenAI-shaped transcript, UNIQUE(run_id,
  seq)) = single source of truth for streaming replay, resume, UI.
- `loop.ts` guards each iteration: per-kind max iterations + cost cap +
  wall clock (RUN_POLICY in `types.ts`), Redis cancel flag
  (`agent-cancel:{runId}`), consecutive-tool-failure nudge (2) / abort (4).
  Tool errors are returned to the model as tool results (self-correction).
- Tools self-register on import (`tools/index.ts`); per-kind whitelists in
  `RUN_POLICY`. All read-only over tenant data except `create_alert` (carries
  Mentapath's quality gates: severity floor, pg_trgm dedup vs open alerts,
  max 5/run) and `write_report_section` (validates section_key + citations).
- `workspaceId` flows from job data, never from model output.
- Streaming: worker publishes typed events to Redis `agent-events` channel;
  API bridges to SSE (`/api/runs/:id/events`); reconnect = fetch run from DB.

## Learning layer

- **Memory** (`services/memory/store.ts`): 4 categories (business_facts,
  owner_preferences, advisor_notes, open_loops) with HARD char budgets —
  over-budget writes error with "consolidate first". Injected into every
  system prompt. Written only via the `remember` tool from conversation-
  derived runs — never from document text (prompt-injection firewall).
  User-visible/editable at `/memory`.
- **Skills** (`services/skills/store.ts`): markdown playbooks, instructions
  only (never code). Global library seeded from repo `skills/*.md` at worker
  boot — editing those files + redeploy updates every customer. Per-workspace
  learned skills arrive via `propose_skill` (reflect runs only) → owner
  approval queue at `/skills`. Catalog (name+description) in prompt; full
  body via `use_skill` (telemetry: use_count).
- **Reflect runs**: after a chat session idles 30 min, the maintenance sweep
  feeds the transcript to a tool-whitelisted reflect run (remember /
  propose_skill / update_watchlist); its final text becomes the session
  summary (recent summaries injected into chat prompts).
- **Monitor runs**: weekly per workspace; prompt = due `watch_items` + docs
  changed since last sweep; `NOTHING_NOTEWORTHY` reply = suppressed.

## Reports (`services/report/`)

`rubric.ts` defines 7 dimensions; `orchestrator.ts` runs ONE report-kind
agent run that walks dimensions sequentially with a FRESH context per
dimension (that reset is how 7 investigations fit in 131K), each ending in
`write_report_section`; executive summary synthesized on `HEAVY_MODEL`.
Resume after failure re-runs only pending sections.

## Conventions

- Mentapath conventions carry over: graceful degradation when keys are
  missing (no embed key → FTS-only retrieval; no Resend → no emails; no
  vision/embeddings key → image uploads rejected at the door), quota refund on
  final ingest failure, re-upload of same-named file replaces the old source,
  byte-stable prompts, document content wrapped in `<document>` markers and
  treated as untrusted data (image transcriptions included — the VLM is told to
  ignore instructions inside the image).
- Tests: DB-backed vitest in `apps/api/test/`, random-UUID workspaces,
  cascade cleanup in `afterAll`, stub provider — must never call paid LLMs.
- Migrations: plain SQL in `apps/api/src/db/migrations/`, applied in
  filename order by `migrate.ts`.

## Not built yet (per the plan)

Resend periodic digest emails (report emails + imminent due-date alert emails
ARE built — `services/report/email.ts`, `services/notify/imminent.ts`, sent from
the worker), connectors (schema + `services/connectors/` seam exist; Google
Drive Picker first), skill curator job, pre-compaction memory flush, report PDF
export beyond print CSS, the 30-case Hermes tool-calling eval. In-app email
opt-out UI (the `users.alert_emails` column exists, defaults TRUE, but isn't
user-editable yet).

Report emails and imminent-alert emails exist in code but have no recipients
since accounts were removed. Reports are generated automatically (weekly and
monthly) for any workspace with documents; there is no manual trigger.
