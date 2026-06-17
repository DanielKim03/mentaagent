import "server-only";
import crypto from "node:crypto";
import { pool } from "@/lib/db";
import { PLANS, tierForPriceId, type PlanTier } from "@/lib/plans";

// Paddle REST API wrapper (no SDK dependency — the surface we need is small
// and stable over fetch). Ported from Mentapath; adapted to MentaAgent's
// schema (question_quota is MentaAgent's equivalent of Mentapath's
// query_quota).
//
// Refs: https://developer.paddle.com/api-reference/overview
//       https://developer.paddle.com/webhooks/signature-verification

const apiKey = process.env.PADDLE_API_KEY ?? "";
const env = (process.env.PADDLE_ENVIRONMENT ?? "sandbox").toLowerCase();
const apiBase =
  env === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

export const PADDLE_WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET ?? "";

export const PADDLE_CONFIGURED =
  !!apiKey && (!!PLANS.pro.priceId || !!PLANS.max.priceId);

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled"
  | null;

export type WorkspaceBilling = {
  workspaceId: string;
  workspaceName: string;
  paddleCustomerId: string | null;
  paddleSubscriptionId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  plan: string | null;
};

export function isEntitled(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

async function paddleFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  if (!apiKey) throw new Error("Paddle is not configured. Set PADDLE_API_KEY.");
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Paddle ${method} ${path} failed: ${res.status} ${text}`);
  return JSON.parse(text) as T;
}

export async function getWorkspaceBilling(
  workspaceId: string
): Promise<WorkspaceBilling | null> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    paddle_customer_id: string | null;
    paddle_subscription_id: string | null;
    subscription_status: string | null;
    current_period_end: Date | null;
    plan: string | null;
  }>(
    `SELECT id, name, paddle_customer_id, paddle_subscription_id,
            subscription_status, current_period_end, plan
       FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    workspaceId: r.id,
    workspaceName: r.name,
    paddleCustomerId: r.paddle_customer_id,
    paddleSubscriptionId: r.paddle_subscription_id,
    status: r.subscription_status as SubscriptionStatus,
    currentPeriodEnd: r.current_period_end,
    plan: r.plan,
  };
}

export type WorkspaceUsage = {
  usedUsdMicros: bigint;
  capUsdMicros: bigint | null; // null = no cap (unlimited)
  totalTokens: number;
  periodStart: Date | null; // null = windowed on the UTC calendar month
  questionsLeft: number | null; // remaining free questions; null = unlimited
  uploadsLeft: number | null; // remaining free file uploads; null = unlimited
};

// LLM spend for the current billing period — the exact window the budget
// checker enforces in apps/api (current_period_start, else the UTC calendar
// month). Used to show "used / cap" on the billing page.
export async function getWorkspaceUsage(
  workspaceId: string
): Promise<WorkspaceUsage> {
  const { rows } = await pool.query<{
    used: string;
    tokens: string;
    cap: string | null;
    period_start: Date | null;
    questions_left: number | null;
    uploads_left: number | null;
  }>(
    `SELECT
        COALESCE(SUM(u.cost_usd_micros), 0)::text                       AS used,
        COALESCE(SUM(u.prompt_tokens + u.completion_tokens), 0)::text   AS tokens,
        (SELECT llm_cap_usd_micros::text FROM workspaces WHERE id = $1)  AS cap,
        (SELECT current_period_start FROM workspaces WHERE id = $1)      AS period_start,
        (SELECT question_quota FROM workspaces WHERE id = $1)            AS questions_left,
        (SELECT source_upload_quota FROM workspaces WHERE id = $1)       AS uploads_left
       FROM llm_usage u
      WHERE u.workspace_id = $1
        AND u.created_at >= COALESCE(
              (SELECT current_period_start FROM workspaces WHERE id = $1),
              date_trunc('month', NOW() AT TIME ZONE 'UTC'))`,
    [workspaceId]
  );
  const r = rows[0];
  return {
    usedUsdMicros: BigInt(r?.used ?? "0"),
    capUsdMicros: r?.cap != null ? BigInt(r.cap) : null,
    totalTokens: Number(r?.tokens ?? "0"),
    periodStart: r?.period_start ?? null,
    questionsLeft: r?.questions_left ?? null,
    uploadsLeft: r?.uploads_left ?? null,
  };
}

export async function ensurePaddleCustomer(args: {
  workspaceId: string;
  workspaceName: string;
  adminEmail: string;
}): Promise<string> {
  const existing = await getWorkspaceBilling(args.workspaceId);
  if (existing?.paddleCustomerId) return existing.paddleCustomerId;

  type Res = { data: { id: string } };
  let customerId: string;
  try {
    const res = await paddleFetch<Res>("POST", "/customers", {
      email: args.adminEmail,
      name: args.workspaceName,
      custom_data: { workspace_id: args.workspaceId },
    });
    customerId = res.data.id;
  } catch (err) {
    // Reusing a Paddle account that already has this email (e.g. carried over
    // from a prior deployment) → Paddle replies 409 customer_already_exists.
    // Recover by looking the customer up by email and adopting it for this
    // workspace, instead of failing the checkout.
    if (!(err instanceof Error && err.message.includes("customer_already_exists"))) {
      throw err;
    }
    type List = { data: Array<{ id: string; email: string }> };
    const found = await paddleFetch<List>(
      "GET",
      `/customers?email=${encodeURIComponent(args.adminEmail)}`
    );
    const adopted = found.data.find(
      (c) => c.email.toLowerCase() === args.adminEmail.toLowerCase()
    )?.id;
    if (!adopted) throw err; // can't recover — surface the original 409
    customerId = adopted;
  }
  await pool.query("UPDATE workspaces SET paddle_customer_id = $1 WHERE id = $2", [
    customerId,
    args.workspaceId,
  ]);
  return customerId;
}

// Creates a Paddle transaction and returns the path the browser should visit
// to pay. Paddle Billing has no standalone hosted checkout page — checkout
// runs through Paddle.js on an approved domain — so we create the transaction
// server-side (keeping customer + custom_data server-controlled) and send the
// browser to our own /checkout page, which opens the Paddle.js overlay for
// this transaction id.
export async function createCheckoutUrl(args: {
  customerId: string;
  priceId: string;
  workspaceId: string;
  tier: PlanTier;
}): Promise<string> {
  type Res = { data: { id: string } };
  const res = await paddleFetch<Res>("POST", "/transactions", {
    items: [{ price_id: args.priceId, quantity: 1 }],
    customer_id: args.customerId,
    collection_mode: "automatic",
    custom_data: { workspace_id: args.workspaceId, tier: args.tier },
  });
  return `/checkout?_ptxn=${encodeURIComponent(res.data.id)}`;
}

export async function createPortalUrl(args: {
  customerId: string;
  subscriptionId: string | null;
}): Promise<string> {
  type Res = { data: { urls: { general: { overview: string } } } };
  const body: Record<string, unknown> = {};
  if (args.subscriptionId) body.subscription_ids = [args.subscriptionId];
  const res = await paddleFetch<Res>(
    "POST",
    `/customers/${args.customerId}/portal-sessions`,
    body
  );
  const url = res.data.urls?.general?.overview;
  if (!url) throw new Error("Paddle did not return a portal URL.");
  return url;
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await paddleFetch("POST", `/subscriptions/${subscriptionId}/cancel`, {
    effective_from: "immediately",
  });
}

// --- Webhook signature verification (HMAC-SHA256 over "<ts>:<rawBody>") ---
export function verifyWebhookSignature(args: {
  rawBody: string;
  signatureHeader: string | null;
  toleranceSeconds?: number;
}): boolean {
  if (!PADDLE_WEBHOOK_SECRET || !args.signatureHeader) return false;
  const parts = Object.fromEntries(
    args.signatureHeader.split(";").map((kv) => {
      const eq = kv.indexOf("=");
      return eq < 0 ? [kv, ""] : [kv.slice(0, eq), kv.slice(eq + 1)];
    })
  ) as Record<string, string | undefined>;
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  const tolerance = args.toleranceSeconds ?? 5 * 60;
  if (Math.abs(Date.now() / 1000 - tsNum) > tolerance) return false;
  const expected = crypto
    .createHmac("sha256", PADDLE_WEBHOOK_SECRET)
    .update(`${ts}:${args.rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(h1, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- Subscription sync ---
export type PaddleSubscriptionEvent = {
  id: string;
  status: SubscriptionStatus;
  customer_id: string;
  current_billing_period: { starts_at?: string | null; ends_at?: string | null } | null;
  items: Array<{ price?: { id?: string } | null }>;
  custom_data?: { workspace_id?: string } | null;
};

// Syncs a Paddle subscription event onto the owning workspace; returns the
// workspace id. Throws if it can't be mapped (→ webhook 500 → Paddle retries)
// so a paid plan is never silently lost.
export async function syncSubscriptionFromPaddle(
  sub: PaddleSubscriptionEvent,
  occurredAt?: string | null
): Promise<string> {
  let workspaceId: string | null = null;

  const byCustomer = await pool.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE paddle_customer_id = $1",
    [sub.customer_id]
  );
  if (byCustomer.rows.length > 0) {
    workspaceId = byCustomer.rows[0].id;
  } else if (sub.custom_data?.workspace_id) {
    const byCustom = await pool.query<{ id: string }>(
      "SELECT id FROM workspaces WHERE id = $1",
      [sub.custom_data.workspace_id]
    );
    if (byCustom.rows.length > 0) {
      workspaceId = byCustom.rows[0].id;
      await pool.query("UPDATE workspaces SET paddle_customer_id = $1 WHERE id = $2", [
        sub.customer_id,
        workspaceId,
      ]);
    }
  }
  if (!workspaceId) {
    throw new Error(
      `Paddle subscription ${sub.id}: no workspace for customer ${sub.customer_id}`
    );
  }

  // active/trialing/past_due (dunning) retain access; paused/canceled drop to free.
  const retainsAccess =
    sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
  const priceId = sub.items[0]?.price?.id ?? null;
  const tier: PlanTier = retainsAccess ? tierForPriceId(priceId) : "free";
  const config = PLANS[tier];

  const periodEndStr = sub.current_billing_period?.ends_at ?? null;
  const periodEnd = periodEndStr ? new Date(periodEndStr) : null;
  const periodStartStr = sub.current_billing_period?.starts_at ?? null;
  const periodStart =
    !retainsAccess || !periodStartStr ? null : new Date(periodStartStr);
  const occurred = occurredAt ? new Date(occurredAt) : null;

  // Reset the consumption counters (source_upload_quota, question_quota) only
  // when the plan actually changes; seat_limit + llm_cap are ceilings, always
  // take the tier's value. Stale-event guard via last_billing_event_at.
  const res = await pool.query(
    `UPDATE workspaces
        SET paddle_subscription_id = $1,
            subscription_status    = $2,
            current_period_end     = $3,
            current_period_start   = $4,
            seat_limit             = $6,
            llm_cap_usd_micros     = $7,
            source_upload_quota    = CASE WHEN plan IS DISTINCT FROM $5
                                          THEN $8 ELSE source_upload_quota END,
            question_quota         = CASE WHEN plan IS DISTINCT FROM $5
                                          THEN $11 ELSE question_quota END,
            plan                   = $5,
            last_billing_event_at  = COALESCE($9::timestamptz, last_billing_event_at)
      WHERE id = $10
        AND ($9::timestamptz IS NULL
             OR last_billing_event_at IS NULL
             OR last_billing_event_at <= $9::timestamptz)`,
    [
      sub.id,
      sub.status,
      periodEnd,
      periodStart,
      tier,
      config.seatLimit,
      config.llmCapUsdMicros,
      config.sourceUploadQuota,
      occurred,
      workspaceId,
      config.questionQuota,
    ]
  );
  if (res.rowCount === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `Paddle subscription ${sub.id}: skipped stale event for workspace ${workspaceId}`
    );
  }
  return workspaceId;
}
