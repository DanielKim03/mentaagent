import "server-only";

// Single source of truth for what each plan tier means. The Paddle webhook is
// the only writer that translates a tier into workspace row values
// (workspaces.plan / seat_limit / llm_cap_usd_micros / source_upload_quota).
// The API reads those columns directly; it never reads this file.

export type PlanTier = "free" | "pro" | "max";

export type PlanConfig = {
  priceId: string | null; // Paddle price id (pri_...). Null until set in env.
  label: string;
  priceLabel: string;
  seatLimit: number;
  // NULL = no LLM cap. > 0 = monthly cap in micro-USD. 0 = blocked.
  llmCapUsdMicros: number | null;
  // NULL = unlimited. Otherwise a ceiling on stored sources.
  sourceUploadQuota: number | null;
};

export const PLANS: Record<PlanTier, PlanConfig> = {
  // The freemium floor: a monthly LLM allowance so free (and lapsed/canceled)
  // workspaces are capped, not unlimited and not hard-blocked. The budget
  // checker windows this per UTC calendar month. Brand-new workspaces get the
  // same value from the SQL column default (migration 007) — keep these in
  // sync. seat/upload limits stay tight.
  free: {
    priceId: null,
    label: "Free",
    priceLabel: "$0",
    seatLimit: 1,
    llmCapUsdMicros: 1_000_000, // $1/mo of model spend (resets monthly)
    sourceUploadQuota: null, // uploads still uncapped (migration 005); re-cap separately
  },
  pro: {
    priceId: process.env.PADDLE_PRO_PRICE_ID || null,
    label: "Pro",
    priceLabel: "$10 / mo",
    seatLimit: 5,
    llmCapUsdMicros: 7_000_000, // $7/mo of model spend
    sourceUploadQuota: 2_000, // roomy guardrail, not a squeeze
  },
  max: {
    priceId: process.env.PADDLE_MAX_PRICE_ID || null,
    label: "Max",
    priceLabel: "$40 / mo",
    seatLimit: 25,
    llmCapUsdMicros: 30_000_000, // $30/mo — ~4× Pro
    sourceUploadQuota: 10_000,
  },
};

// Paddle price.id → tier. Returns 'free' for an unrecognized price so the gate
// stays safe.
export function tierForPriceId(priceId: string | null): PlanTier {
  if (priceId && priceId === PLANS.pro.priceId) return "pro";
  if (priceId && priceId === PLANS.max.priceId) return "max";
  return "free";
}

export function isPaidTier(tier: PlanTier): boolean {
  return tier === "pro" || tier === "max";
}
