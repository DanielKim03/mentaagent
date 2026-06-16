import "server-only";

// Cloudflare Turnstile server-side verification.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
//
// Both keys are read at runtime (plain env vars, not NEXT_PUBLIC) so they work
// as ordinary Railway service variables without build-time inlining. The site
// key is public — the signup server component reads it here and passes it to
// the client widget as a prop. When TURNSTILE_SECRET_KEY is unset the widget
// renders nothing and verification is a dev no-op; in production a missing
// secret FAILS CLOSED so a misconfig can't silently disable bot protection.

const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? "";
const SITE_KEY = process.env.TURNSTILE_SITE_KEY ?? "";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const TURNSTILE_CONFIGURED = !!SECRET_KEY && !!SITE_KEY;

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

// Verifies a token from the client widget. Pass the caller's IP when available
// — Cloudflare uses it to fingerprint replay attacks.
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<TurnstileResult> {
  if (!SECRET_KEY) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "turnstile_not_configured" };
    }
    return { ok: true }; // dev: no-op so local signup stays usable
  }
  if (!token) return { ok: false, reason: "missing_token" };

  const body = new URLSearchParams({ secret: SECRET_KEY, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) return { ok: false, reason: `siteverify_${res.status}` };
    const json = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (!json.success) {
      return {
        ok: false,
        reason: json["error-codes"]?.join(",") ?? "verify_failed",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "network_error",
    };
  }
}

export { SITE_KEY as TURNSTILE_SITE_KEY };
