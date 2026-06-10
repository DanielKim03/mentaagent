import { env } from "../env.js";

// Minimal Resend client over fetch — the API only sends one kind of email
// (imminent-alert notifications from the Worker), so the SDK isn't worth a
// dependency. Mirrors the web app's Resend usage (apps/web/lib/admin-notify.ts)
// including the EMAIL_FROM fallback.

export function isMailerConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Send one email. Throws on failure so callers can retry/unwind. */
export async function sendEmail(args: {
  to: string[];
  subject: string;
  html: string;
}): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend rejected (${res.status}): ${body.slice(0, 300)}`);
  }
}
