# MentaAgent — deploy runbook

Same shape as Mentapath: **Railway**, three GitHub-deployed services (API,
Worker, Web) sharing one repo, plus managed Postgres + Redis. The API and
Worker run from the *same* image (`apps/api/Dockerfile`); the Worker just
overrides the start command.

## 0. Prereqs
- Railway account + this repo pushed to GitHub.
- An LLM key: **DeepSeek** (`api.deepseek.com`) or **Nebius** (Hermes 4).
- (Optional) DeepInfra key for embeddings; Resend key for emails; S3/R2 for
  uploaded files; Google OAuth client; Sentry DSN. Everything optional
  degrades gracefully (no embed key → FTS-only retrieval; no Resend → no
  emails; no S3 → local disk).

## 1. Secrets
```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 48   # INTERNAL_API_SECRET  (API refuses to boot in prod if <32 chars)
openssl rand -hex 32      # CONNECTOR_KEY        (only needed once connectors ship)
```

## 2. Managed data services (Railway → + New)
- **Postgres** — ideally an image with **pgvector** (use Railway's pgvector
  template, or any Postgres ≥16 with the `vector` extension). Without it,
  migration `002` no-ops and retrieval falls back to FTS-only — the app still
  runs. Capture the **internal** `DATABASE_URL` (`...railway.internal:5432`).
- **Redis** — capture the internal `REDIS_URL`.

## 3. Services (all deploy from `main`)

### 3.1 API
- Build → Dockerfile: `apps/api/Dockerfile`
- Public networking: **on** (note the `<api>.up.railway.app` URL).
- Start Command: leave blank (Dockerfile CMD runs migrations then the server).

### 3.2 Worker
- Same Dockerfile: `apps/api/Dockerfile`
- Start Command **override**: `node apps/api/dist/worker.js`
- Public networking: **off** (it serves no HTTP).

### 3.3 Web
- Build → Dockerfile: `apps/web/Dockerfile`
- Public networking: **on** (your public URL).
- Start Command: leave blank.

## 4. Environment variables

**API + Worker** (identical on both):
```
DATABASE_URL          = <internal Postgres URL>
REDIS_URL             = <internal Redis URL>
INTERNAL_API_SECRET   = <from step 1>            # must match the Web value
LLM_BASE_URL          = https://api.deepseek.com  # or Nebius
LLM_API_KEY           = <your key>
AGENT_MODEL           = deepseek-chat             # non-thinking; see .env.example
HEAVY_MODEL           = deepseek-chat
LLM_TOOL_MODE         = native
EMBEDDINGS_BASE_URL   = https://api.deepinfra.com/v1/openai   # optional
EMBEDDINGS_API_KEY    = <optional>
EMBEDDINGS_MODEL      = BAAI/bge-m3
LLM_DAILY_USD_CAP     = 0                         # instance-wide daily fail-safe (0=off)
WEB_ORIGIN            = https://<your-web-domain>
RESEND_API_KEY        = <optional>
EMAIL_FROM            = MentaAgent <noreply@yourdomain>
# Object storage — REQUIRED for multi-service (API writes uploads, Worker
# reads them; a Railway volume attaches to only one service). Without these
# the two services have separate disks and ingestion of uploaded files fails.
S3_BUCKET / S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_REGION
```

**Web**:
```
AUTH_SECRET           = <from step 1>
AUTH_URL              = https://<your-web-domain>
API_INTERNAL_URL      = http://<api>.railway.internal:3001   # private network
INTERNAL_API_SECRET   = <same as API>
DATABASE_URL          = <same internal Postgres URL>   # NextAuth adapter + signup
WEB_ORIGIN            = https://<your-web-domain>
AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET = <optional, for Google sign-in>
```

## 5. Deploy order & verify
1. **API** first — build log should show `apply NNN_*.sql` (migrations) then
   the server listening on `:3001`.
2. **Worker** — logs show `[worker] started: ingest + agent + maintenance`
   and `[skills] seeded N global skills` (no migration log; the API owns those).
3. **Web** — open the URL, sign up, complete onboarding, upload a sample file,
   ask a question in chat. Generate a report.

## 6. Notes / gotchas
- **Object storage is the main multi-service requirement.** For a quick
  single-box trial you can run API+Worker as one service, but the standard
  3-service layout needs S3/R2 for uploads to flow API → Worker.
- **pgvector**: optional but recommended; retrieval degrades to FTS-only
  without it.
- **Scheduled work** (weekly/monthly reports, monitor sweeps, nightly memory
  consolidation, dismissed-alert purge) runs off the Worker's 15-min
  maintenance tick — no external cron needed.
- **Paddle billing** is wired (landing-page pricing, `/settings/billing`,
  webhook). It's optional — leave the `PADDLE_*` vars unset and billing shows a
  "not configured" state; set them on the **Web** service to turn it on
  (`PADDLE_API_KEY`, `PADDLE_ENVIRONMENT`, `PADDLE_PRO_PRICE_ID`,
  `PADDLE_MAX_PRICE_ID`, `PADDLE_WEBHOOK_SECRET`; webhook →
  `https://<your-web-domain>/api/paddle/webhook`). See `apps/web/lib/plans.ts`.
- **Not yet wired** (schema/seams exist): email-in, connector OAuth. See the
  plan's "Not built yet" section.
