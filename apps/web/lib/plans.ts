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
  // NULL = unlimited. Otherwise a lifetime ceiling on questions (chat turns)
  // the free tier may ask before upgrading.
  questionQuota: number | null;
};

export const PLANS: Record<PlanTier, PlanConfig> = {
  // The freemium floor: a monthly LLM allowance so free (and lapsed/canceled)
  // workspaces are capped, not unlimited and not hard-blocked. The budget
  // checker windows this per UTC calendar month. Brand-new workspaces get the
  // same values from the SQL column defaults (migrations 007 + 008) — keep
  // these in sync. seat/upload/question limits stay tight: a taste of the
  // product, then upgrade.
  free: {
    priceId: null,
    label: "Free",
    priceLabel: "$0",
    seatLimit: 1,
    llmCapUsdMicros: 1_000_000, // $1/mo of model spend (resets monthly)
    sourceUploadQuota: 4, // 4 files (migration 008)
    questionQuota: 8, // 8 questions, lifetime (migration 008)
  },
  pro: {
    priceId: process.env.PADDLE_PRO_PRICE_ID || null,
    label: "Pro",
    priceLabel: "$10 / mo",
    seatLimit: 5,
    llmCapUsdMicros: 7_000_000, // $7/mo of model spend
    sourceUploadQuota: 2_000, // roomy guardrail, not a squeeze
    questionQuota: null, // unlimited; gated only by the LLM spend cap
  },
  max: {
    priceId: process.env.PADDLE_MAX_PRICE_ID || null,
    label: "Max",
    priceLabel: "$40 / mo",
    seatLimit: 25,
    llmCapUsdMicros: 30_000_000, // $30/mo — ~4× Pro
    sourceUploadQuota: 10_000,
    questionQuota: null, // unlimited; gated only by the LLM spend cap
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
