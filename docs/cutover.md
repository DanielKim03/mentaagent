# Cutover: replace Mentapath with MentaAgent on mentapath.com

Chosen path: **fresh start** (new empty DB — existing Mentapath accounts/data
are NOT carried over), **no active payers** (Paddle/billing intentionally
dropped for now), **staged** (verify on a temp URL, then repoint the domain;
instant rollback).

This does NOT migrate anything from Mentapath. It stands MentaAgent up as a
separate deployment, then moves the domain to it.

---

## Phase 1 — Deploy MentaAgent fresh (nothing user-facing changes yet)
Do the full [deploy.md](deploy.md) runbook in a **new Railway project** (leave
Mentapath's project running, untouched):
- New Postgres (pgvector) + Redis.
- Three services from `DanielKim03/mentapath2` (API / Worker / Web), per
  deploy.md.
- For now set `AUTH_URL` / `WEB_ORIGIN` to the Railway-assigned temp Web URL
  (`https://<web>.up.railway.app`).

## Phase 2 — Verify on the temp URL
Open the temp Web URL and run the smoke test: sign up, complete onboarding,
upload a sample CSV, ask a chat question (watch it stream), generate a report,
check the graph. Mentapath is still live the whole time.

## Phase 3 — Move the connections to MentaAgent
Reuse what transfers cleanly; the only hard requirement is the LLM key.
- **Google OAuth** (if used): reuse the existing Google client — the redirect
  URI `https://mentapath.com/api/auth/callback/google` is identical, so just
  set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` on the new Web service. (Also add
  the temp Railway URL's callback if you want OAuth to work pre-cutover.)
- **Resend** (optional): reuse the verified `mentapath.com` domain — set
  `RESEND_API_KEY` + `EMAIL_FROM` on API + Worker.
- **Sentry** (optional): new project or reuse; set `SENTRY_DSN`.
- **Paddle**: skip. No payers, and MentaAgent has no billing yet. Leave the
  old webhook alone (or disable it) — nothing in MentaAgent listens for it.

## Phase 4 — Repoint the domain (the actual cutover)
A custom domain in Railway attaches to exactly ONE service. So:
1. Railway → **old Mentapath Web service** → Settings → Domains → **remove**
   `mentapath.com`.
2. Railway → **new MentaAgent Web service** → Settings → Domains → **add**
   `mentapath.com`. Railway shows a CNAME target.
3. Cloudflare (or your DNS) → point `mentapath.com` (and `www`) CNAME at the
   target Railway shows. If it's already a Railway CNAME it may just work; set
   it to the new target to be safe.
4. On the new API + Web services, change `AUTH_URL` and `WEB_ORIGIN` to
   `https://mentapath.com` and redeploy (NextAuth callbacks + CORS depend on
   these).

**Rollback:** re-attach `mentapath.com` to the old Mentapath Web service in
Railway. That's why the domain swap is the last step.

## Phase 5 — Decommission Mentapath (only after MentaAgent is confirmed live)
- Stop/delete the old Railway services (web, api, worker) and its Postgres/
  Redis once you're satisfied.
- Cancel/disable the old Paddle webhook and any Cloudflare Email Routing /
  inbound rules tied to the old app.

---

## Notes
- **Name mismatch:** the product is "MentaAgent" but the domain is
  `mentapath.com`. Purely cosmetic — nothing in the code depends on the name.
  If you want the UI to read "Mentapath", that's a small branding pass
  (sidebar logo, titles, landing copy) — ask and I'll do it before cutover.
- **DNS TTL:** lower the `mentapath.com` record TTL a day before cutover so
  the switch propagates fast.
- The dashboard steps (Railway, Cloudflare DNS, Google, Resend) are yours to
  click — same as the original Mentapath deploy. I can prep anything in the
  repo (branding, a `railway.json`, env templates).
