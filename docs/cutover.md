# Cutover: replace Mentapath with MentaAgent on mentapath.com

Chosen path: **in-place** — re-point the three existing Railway Mentapath
services (API / Worker / Web) at the `DanielKim03/mentapath2` repo, against a
**fresh empty database**. The custom domain stays attached to the same Web
service the whole time, so **there is no DNS change and no domain
detach/reattach**.

- **Fresh start** — new empty Postgres; existing Mentapath accounts/data are
  NOT carried over.
- **No active payers** — nothing to migrate, but **Paddle billing IS wired**
  in this build (landing-page pricing, `/settings/billing`, webhook), so set
  the `PADDLE_*` vars below to turn it on.
- **LLM = DeepInfra** (`DeepSeek-V4-Flash`) — one DeepInfra key serves both
  chat and embeddings.

Prerequisites already done: `mentapath2` pushed to GitHub; a fresh Railway
Postgres provisioned; Paddle + DeepInfra wired in code.

---

## 1. Fresh Postgres (+ pgvector)
You provisioned it already. On the Railway **services**, use its **internal**
URL (`...railway.internal:5432`) — the public proxy host
(`*.proxy.rlwy.net`) is only for connecting from your laptop. Use Railway's
pgvector template; without the `vector` extension, migration `002` no-ops and
retrieval degrades to FTS-only (app still runs).

## 2. Re-point each service's Source → `DanielKim03/mentapath2` (branch `main`)
The repo layout differs from Mentapath, so after switching the repo you must
also fix each service's **build config**:

| Service | Dockerfile path | Start command | Public networking |
|---|---|---|---|
| **API** | `apps/api/Dockerfile` | *(blank — CMD runs migrations then the server)* | on |
| **Worker** | `apps/api/Dockerfile` | `node apps/api/dist/worker.js` | off |
| **Web** | `apps/web/Dockerfile` | *(blank)* | on |

## 3. Environment variables

**API + Worker** (identical on both):
```
DATABASE_URL        = <fresh internal Postgres URL>
REDIS_URL           = <internal Redis URL>
INTERNAL_API_SECRET = <32+ char secret — SAME on all three services>
LLM_BASE_URL        = https://api.deepinfra.com/v1/openai
LLM_API_KEY         = <your DeepInfra key>
AGENT_MODEL         = deepseek-ai/DeepSeek-V4-Flash
HEAVY_MODEL         = deepseek-ai/DeepSeek-V4-Flash
LLM_TOOL_MODE       = native
EMBEDDINGS_BASE_URL = https://api.deepinfra.com/v1/openai
EMBEDDINGS_API_KEY  = <same DeepInfra key>
EMBEDDINGS_MODEL    = BAAI/bge-m3
LLM_DAILY_USD_CAP   = 0
WEB_ORIGIN          = https://mentapath.com
# Object storage — REQUIRED for the 3-service layout (API writes uploads,
# Worker reads them; a Railway volume attaches to only one service). Reuse
# Mentapath's existing R2/S3 bucket.
S3_BUCKET / S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_REGION
RESEND_API_KEY / EMAIL_FROM   # optional — reuse the verified mentapath.com domain
```

**Web**:
```
AUTH_SECRET         = <openssl rand -base64 32>
AUTH_URL            = https://mentapath.com
WEB_ORIGIN          = https://mentapath.com
API_INTERNAL_URL    = http://<api>.railway.internal:3001
INTERNAL_API_SECRET = <same as API/Worker>
DATABASE_URL        = <same fresh internal Postgres URL>   # NextAuth adapter + signup
AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET   # reuse the existing Google client (redirect URI is identical)
# --- Paddle (billing IS wired; set these to turn it on) ---
PADDLE_API_KEY        = <your Paddle API key>
PADDLE_ENVIRONMENT    = production          # sandbox while testing
PADDLE_PRO_PRICE_ID   = pri_...             # Pro plan price id
PADDLE_MAX_PRICE_ID   = pri_...             # Max plan price id
PADDLE_WEBHOOK_SECRET = pdl_ntfset_...      # from the Paddle notification destination
```

## 4. Deploy order & verify
1. **API** first — build log shows `apply NNN_*.sql` (migrations on the empty
   DB) then the server listening on `:3001`. Migrations run automatically;
   **do not** run the seed (dev-only).
2. **Worker** — logs show `[worker] started: ingest + agent + maintenance` and
   `[skills] seeded N global skills`.
3. **Web** — builds and comes up. The moment it deploys, **mentapath.com is
   serving MentaAgent** (the domain never moved).

Smoke test on the live domain: sign up → onboarding → upload a sample CSV →
ask a chat question (watch it stream) → generate a report → check the graph.

## 5. Turn on Paddle
1. Set the `PADDLE_*` vars (step 3) on the Web service.
2. In the Paddle dashboard, create/point a **notification destination
   (webhook)** at `https://mentapath.com/api/paddle/webhook` and copy its
   signing secret into `PADDLE_WEBHOOK_SECRET`.
3. Use the `pri_...` ids of your Pro/Max prices for `PADDLE_PRO_PRICE_ID` /
   `PADDLE_MAX_PRICE_ID` (these map to plan tiers in `apps/web/lib/plans.ts`).
4. Verify: open `/settings/billing` (the "not configured" note disappears once
   the vars are set), run a checkout, and confirm `subscription.created` lands
   and flips the workspace plan. Start in `sandbox`, then switch
   `PADDLE_ENVIRONMENT=production` with live keys when ready.

You can reuse Mentapath's existing Paddle account and products — just repoint
the webhook destination at the new URL above.

## 6. Decommission the old app (after MentaAgent is confirmed live)
- Disable the **old** Mentapath Paddle webhook destination (only the new one
  should be active).
- Remove any Cloudflare email-routing / inbound rules tied to the old app.

**Rollback:** switch each service's Source back to the old Mentapath repo and
redeploy.

---

## Notes
- **In-place has no staging on the real domain.** When the Web build deploys,
  `mentapath.com` flips to the new app instantly, and rollback is a rebuild
  (a few minutes), not an instant switch. Low-risk here given the fresh DB and
  no payers; de-risk further by running the app locally against the fresh
  Railway Postgres first. If you want zero-downtime staging with instant
  rollback instead, deploy `mentapath2` as *new* services and swap the domain
  last — but that reintroduces a DNS step.
- **Name mismatch:** the product is "MentaAgent" but the domain is
  `mentapath.com` — purely cosmetic; nothing in the code depends on the name.
  Ask if you want a branding pass (sidebar logo, titles, landing copy).
- **DeepInfra model:** if `DeepSeek-V4-Flash` returns empty/cut-off replies
  (a reasoning-burn symptom), the proven fallback is DeepSeek's first-party
  non-thinking model — `LLM_BASE_URL=https://api.deepseek.com`,
  `AGENT_MODEL=deepseek-chat` (no embeddings endpoint there, so keep
  `EMBEDDINGS_*` on DeepInfra).
