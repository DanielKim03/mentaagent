import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import {
  consumePasswordToken,
  findEmailForToken,
} from "@/lib/password-tokens";
import { logAudit, workspaceForUser } from "@/lib/audit";

const MIN_PASSWORD_LENGTH = 8;

type SearchParams = { token?: string; error?: string };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = searchParams ?? {};
  const token = sp.token ?? "";

  // Validate the token up front so we can show an error before the user
  // bothers to type a password.
  const email = token ? await findEmailForToken(token) : null;

  async function submit(formData: FormData) {
    "use server";
    const t = String(formData.get("token") ?? "");
    const pw = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (pw.length < MIN_PASSWORD_LENGTH) {
      redirect(`/set-password?token=${encodeURIComponent(t)}&error=short`);
    }
    if (pw !== confirm) {
      redirect(`/set-password?token=${encodeURIComponent(t)}&error=mismatch`);
    }

    const ident = await findEmailForToken(t);
    if (!ident) {
      redirect(`/set-password?token=${encodeURIComponent(t)}&error=expired`);
    }

    const ok = await consumePasswordToken(ident, t);
    if (!ok) {
      redirect(`/set-password?token=${encodeURIComponent(t)}&error=expired`);
    }

    const hash = await bcrypt.hash(pw, 10);
    // Bump session_token_version so every JWT issued before this set/reset is
    // invalidated on its next request — a stolen/phished session can't outlive
    // the recovery action (see the jwt() callback in auth.ts).
    const { rows: updated } = await pool.query<{ id: string }>(
      `UPDATE users
          SET password_hash = $1,
              email_verified = NOW(),
              session_token_version = session_token_version + 1
        WHERE lower(email) = lower($2)
        RETURNING id`,
      [hash, ident]
    );
    const userId = updated[0]?.id ?? null;
    if (userId) {
      const workspaceId = await workspaceForUser(userId);
      if (workspaceId) {
        await logAudit({
          workspaceId,
          actorUserId: userId,
          action: "auth.password_set",
          description: ident,
        });
      }
    }

    redirect("/login?reset=1");
  }

  if (!email) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Link invalid or expired</h1>
          <p className="text-sm text-neutral-500">
            This password setup link has expired or already been used. Ask your
            workspace admin to send you a new one.
          </p>
          <div className="flex justify-center">
            <Link
              href="/login"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const errMsg =
    sp.error === "short"
      ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      : sp.error === "mismatch"
        ? "Passwords don't match."
        : sp.error === "expired"
          ? "Link expired — ask your admin for a new one."
          : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Set your password</h1>
          <p className="text-sm text-neutral-500">
            For <span className="font-mono">{email}</span>
          </p>
        </div>

        {errMsg && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
            {errMsg}
          </div>
        )}

        <form action={submit} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <label className="block">
            <span className="text-xs font-medium text-neutral-700">
              New password
            </span>
            <input
              name="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              autoFocus
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-neutral-700">
              Confirm password
            </span>
            <input
              name="confirm"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Save password
          </button>
        </form>
      </div>
    </main>
  );
}
