import "server-only";
import { headers } from "next/headers";
import { pool } from "@/lib/db";

// Postgres-backed rate limiter for abuse-sensitive server actions (signup,
// login brute-force). Backed by the `rate_limits` table (migration 001) rather
// than an in-process Map so counters SURVIVE deploys (which otherwise reopen
// the abuse window) and are SHARED across web replicas. One row per
// "scope:subject" key.
//
// x-forwarded-for is the proxy chain; we take the FIRST entry — the original
// client IP per Railway's proxy contract.

function callerIp(): string {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

export async function checkRateLimit(
  scope: string,
  options: { max: number; windowSeconds: number; bucketKey?: string }
): Promise<RateLimitResult> {
  // Default key is the caller IP. Pass `bucketKey` to throttle on a stable
  // identity instead (e.g. the target email on login) so an attacker can't
  // dodge a per-account lockout simply by rotating source IPs.
  const subject = options.bucketKey ?? callerIp();
  const key = `${scope}:${subject}`;

  // Atomic check-and-increment. On a fresh/expired window the row resets to
  // count=1 with a new reset_at; otherwise count increments. The row lock on
  // ON CONFLICT serializes concurrent requests for the same key.
  try {
    const { rows } = await pool.query<{ count: number; reset_at: Date }>(
      `INSERT INTO rate_limits (key, count, reset_at)
         VALUES ($1, 1, NOW() + make_interval(secs => $2))
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at <= NOW()
                      THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= NOW()
                         THEN NOW() + make_interval(secs => $2)
                         ELSE rate_limits.reset_at END
       RETURNING count, reset_at`,
      [key, options.windowSeconds]
    );

    const { count, reset_at } = rows[0];
    if (count > options.max) {
      const retryAfter = Math.max(
        1,
        Math.ceil((new Date(reset_at).getTime() - Date.now()) / 1000)
      );
      return { ok: false, retryAfter };
    }
    return { ok: true };
  } catch (err) {
    // Fail OPEN on a DB error: a limiter hiccup must not turn login/signup
    // into a 500. The underlying operation still needs the DB, so a real
    // outage fails there.
    // eslint-disable-next-line no-console
    console.error("[rate-limit] check failed, allowing:", err);
    return { ok: true };
  }
}
