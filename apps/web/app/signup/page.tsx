import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { auth, signIn } from "@/auth";
import { pool } from "@/lib/db";
import { TURNSTILE_SITE_KEY, verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit } from "@/lib/rate-limit";
import { Turnstile } from "@/components/Turnstile";

const PLAN_LABELS: Record<string, string> = { pro: "Pro", max: "Max" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string; plan?: string };
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/chat");

  // Plan chosen on the landing page (?plan=pro|max). Paid plans land on the
  // billing page after signup to complete checkout; anything else is "free".
  const selectedPlan =
    searchParams.plan === "pro" || searchParams.plan === "max"
      ? searchParams.plan
      : null;

  async function signup(formData: FormData) {
    "use server";

    // IP rate limit first — rejects before captcha verify, bcrypt, and DB work.
    const rl = await checkRateLimit("signup", { max: 5, windowSeconds: 60 });
    if (!rl.ok) {
      redirect("/signup?error=rate_limited");
    }

    const name = String(formData.get("name") ?? "").trim();
    const businessName = String(formData.get("business") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || password.length < 8 || !businessName) {
      redirect("/signup?error=invalid");
    }

    // Cloudflare Turnstile — reject bots before the existing-email probe,
    // bcrypt, and DB writes. remoteip helps Cloudflare catch replay/abuse.
    const remoteIp =
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const captcha = await verifyTurnstile(
      String(formData.get("cf-turnstile-response") ?? ""),
      remoteIp
    );
    if (!captcha.ok) {
      redirect("/signup?error=captcha");
    }

    const { rows: existing } = await pool.query(
      "SELECT 1 FROM users WHERE lower(email) = lower($1)",
      [email]
    );
    if (existing.length > 0) redirect("/signup?error=exists");

    const plan = formData.get("plan");
    const paidPlan = plan === "pro" || plan === "max" ? plan : null;

    const hash = await bcrypt.hash(password, 10);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ws = await client.query<{ id: string }>(
        "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
        [businessName]
      );
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, name, password_hash, email_verified, workspace_id, role)
         VALUES ($1, $2, $3, NOW(), $4, 'admin')
         RETURNING id`,
        [email, name || null, hash, ws.rows[0].id]
      );
      await client.query(
        "INSERT INTO memberships (user_id, workspace_id, role) VALUES ($1, $2, 'admin')",
        [user.rows[0].id, ws.rows[0].id]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Chose a paid plan on the landing page → straight to billing to complete
    // checkout; otherwise into onboarding. (Onboarding stays available via the
    // Profile nav for paid users.)
    const redirectTo = paidPlan
      ? `/settings/billing?plan=${paidPlan}`
      : "/onboarding";
    await signIn("credentials", { email, password, redirectTo });
  }

  const field =
    "rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2.5 outline-none transition-colors focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

  const errMsg =
    searchParams.error === "exists"
      ? "An account with that email already exists."
      : searchParams.error === "captcha"
          ? "Captcha verification failed. Reload the page and try again."
          : searchParams.error === "rate_limited"
            ? "Too many sign-up attempts from your network. Wait a minute and try again."
          : searchParams.error === "invalid"
            ? "Fill in every field; password needs 8+ characters."
            : searchParams.error
              ? "Sign-up failed. Try again."
              : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div>
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.jpg" alt="" className="h-7 w-7 rounded-lg object-cover" />
          MentaAgent
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Set up your AI business analyst in minutes.
        </p>
      </div>
      {errMsg && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errMsg}</p>
      )}
      {selectedPlan && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-700">
          You picked the <strong>{PLAN_LABELS[selectedPlan]}</strong> plan —
          create your account and you&apos;ll finish checkout next.
        </p>
      )}
      <form action={signup} className="flex flex-col gap-3">
        {selectedPlan && <input type="hidden" name="plan" value={selectedPlan} />}
        <input name="name" placeholder="Your name" className={field} />
        <input name="business" required placeholder="Business name" className={field} />
        <input name="email" type="email" required placeholder="you@business.com" className={field} />
        <input name="password" type="password" required minLength={8} placeholder="Password (8+ chars)" className={field} />
        <Turnstile siteKey={TURNSTILE_SITE_KEY} />
        <button
          type="submit"
          className="mt-1 rounded-lg bg-white px-4 py-2.5 font-medium text-stone-950 transition-colors hover:bg-stone-200"
        >
          Create account
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-neutral-700 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
