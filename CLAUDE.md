# MentaAgent

Managed AI business analyst SaaS: business owners connect their files and an
agent tells them what the business is lacking and what to improve — with
per-workspace memory and skills so it gets better at advising each business
over time. Architecture and patterns adapted from Mentapath, the founder's
earlier production SaaS.

## Services

pnpm monorepo, three deployable processes + Postgres 16 (pgvector) + Redis:

- **web** (`apps/web`) — Next.js 14 App Router. Owns auth (NextAuth v5:
  credentials + Google). Browser calls go through `/api/proxy/*` which
  injects `INTERNAL_API_SECRET` + server-derived `x-user-id`/`x-workspace-id`.
  Server components use `lib/api.ts` (same headers, direct).
- **api** (`apps/api/src/server.ts`) — Fastify on :3001, private network.
  Trust boundary: `lib/auth.ts` re-verifies every (user, workspace)
  membership; never trusts workspace id from the body. Dev fallback (no
  `INTERNAL_API_SECRET` set): default workspace, admin role.
- **worker** (`apps/api/src/worker.ts`) — BullMQ consumers: `ingest`
  (parse→chunk→embed→summarize), `agent` (runs the loop), `maintenance`
  repeatable tick every 15 min (idle-session reflect sweep, weekly monitor
  fan-out, nightly memory consolidation, embed backfill).

## Local dev

```bash
docker compose up -d           # postgres :5433, redis :6380 (offset to coexist with Mentapath)
cp .env.example .env           # blank optional vars are fine (treated as unset)
pnpm install
pnpm --filter api migrate && pnpm --filter api seed   # dev@example.com / devpassword
pnpm --filter api dev          # API :3001
pnpm --filter api dev:worker   # worker (separate terminal)
pnpm --filter web dev          # web :3000
pnpm --filter api test         # DB-backed vitest (needs docker up; never calls paid LLMs)
```

No `LLM_API_KEY` → **stub provider**: deterministic canned turns so the whole
pipeline (queue → loop → tools → SSE → persistence → reports) runs with zero
spend. Tests script it via `setStubScript()` in `services/agent/provider.ts`.

## LLM

`services/llm/client.ts` — OpenAI SDK against any compatible host. Primary:
Nous Hermes 4 70B/405B on Nebius (`LLM_BASE_URL`, native `tools`). Fallback
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

Paddle billing is wired (checkout in `lib/billing-actions.ts` → `lib/paddle.ts`,
webhook at `app/api/paddle/webhook`, plan activation + per-period caps in
`syncSubscriptionFromPaddle`); it just needs `PADDLE_*` env vars to go live.
Reports are generated automatically for PAID workspaces only (scheduled sweep,
no manual trigger); the free tier is interactive-only. Free tier enforces 4
files + 8 questions (migration 008); `create_alert` dedups against open +
dismissed alerts and caps the open backlog at 15 (critical overrides). New
uploads trigger an on-ingest review run; imminent alert deadlines are emailed.
