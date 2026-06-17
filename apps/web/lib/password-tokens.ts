import "server-only";
import { randomBytes } from "node:crypto";
import { pool } from "@/lib/db";

const TOKEN_TTL_MINUTES = 60;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

function tokenUrl(origin: string, token: string): string {
  const u = new URL("/set-password", origin);
  u.searchParams.set("token", token);
  return u.toString();
}

// Reuses the verification_tokens table (originally the NextAuth magic-link
// store) for invite / password-reset links. Identifier is the email; token is
// a 32-byte random hex string. A workspace admin triggers these from the Team
// page so an invited teammate can set their own password.
export async function createPasswordToken(email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
  // Clear any prior token for this email so an old link can't be replayed.
  await pool.query("DELETE FROM verification_tokens WHERE identifier = $1", [
    email,
  ]);
  await pool.query(
    `INSERT INTO verification_tokens (identifier, token, expires)
     VALUES ($1, $2, $3)`,
    [email, token, expires]
  );
  return token;
}

export async function consumePasswordToken(
  email: string,
  token: string
): Promise<boolean> {
  const { rows } = await pool.query<{ expires: Date }>(
    `DELETE FROM verification_tokens
      WHERE identifier = $1 AND token = $2
      RETURNING expires`,
    [email, token]
  );
  if (rows.length === 0) return false;
  return rows[0].expires.getTime() > Date.now();
}

export async function findEmailForToken(token: string): Promise<string | null> {
  const { rows } = await pool.query<{ identifier: string; expires: Date }>(
    "SELECT identifier, expires FROM verification_tokens WHERE token = $1",
    [token]
  );
  if (rows.length === 0) return null;
  if (rows[0].expires.getTime() <= Date.now()) return null;
  return rows[0].identifier;
}

type SendArgs = {
  email: string;
  token: string;
  origin: string;
  kind: "invite" | "reset";
};

export async function sendPasswordEmail({
  email,
  token,
  origin,
  kind,
}: SendArgs): Promise<{ ok: boolean; previewUrl?: string; error?: string }> {
  const link = tokenUrl(origin, token);
  const apiKey = process.env.RESEND_API_KEY;

  // The raw link grants password set/reset for the target account, so it must
  // NEVER be surfaced to the caller in production — doing so would hand a
  // password-reset link to whoever triggered the flow (account takeover). Only
  // expose it outside production, as a local first-run convenience.
  const allowPreview = process.env.NODE_ENV !== "production";

  if (!apiKey) {
    // Dev: surface the URL so the invite flow works without Resend. Prod: a
    // missing key is a misconfiguration — fail rather than leak the link.
    if (allowPreview) return { ok: true, previewUrl: link };
    return { ok: false, error: "email delivery is not configured" };
  }

  const subject =
    kind === "invite"
      ? "Set up your MentaAgent account"
      : "Reset your MentaAgent password";
  const heading =
    kind === "invite"
      ? "You've been added to a MentaAgent workspace"
      : "Reset your MentaAgent password";
  const cta = kind === "invite" ? "Set your password" : "Choose a new password";

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px;">${heading}</h2>
      <p>Click the button below to ${kind === "invite" ? "set your password and finish creating your account" : "choose a new password"}. This link expires in ${TOKEN_TTL_MINUTES} minutes.</p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="display: inline-block; background: #171717; color: #fff; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-weight: 500;">${cta}</a>
      </p>
      <p style="color: #666; font-size: 13px;">If you didn't expect this email, you can ignore it.</p>
      <p style="color: #999; font-size: 12px; word-break: break-all;">Or paste this link into your browser:<br>${link}</p>
    </div>
  `;

  try {
    // Resend REST API directly — the web app doesn't bundle the resend SDK
    // (that lives in the worker's mailer). Same contract, one fetch.
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: email, subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend ${res.status} ${detail}`.trim(),
        previewUrl: allowPreview ? link : undefined,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      previewUrl: allowPreview ? link : undefined,
    };
  }
}
