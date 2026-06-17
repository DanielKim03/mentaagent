import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { TURNSTILE_SITE_KEY, verifyTurnstile } from "@/lib/turnstile";
import { Turnstile } from "@/components/Turnstile";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string; error?: string };
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/chat");
  const from =
    searchParams.from && searchParams.from.startsWith("/") ? searchParams.from : "/chat";

  async function login(formData: FormData) {
    "use server";
    const fromParam = encodeURIComponent(from);

    // Brute-force defense: throttle per source IP and (separately) per target
    // email, so an attacker can't dodge a per-account lockout by rotating IPs.
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const ipLimit = await checkRateLimit("login-ip", { max: 10, windowSeconds: 60 });
    if (!ipLimit.ok) redirect(`/login?error=rate_limited&from=${fromParam}`);
    if (email) {
      const emailLimit = await checkRateLimit("login-email", {
        max: 5,
        windowSeconds: 300,
        bucketKey: email,
      });
      if (!emailLimit.ok) redirect(`/login?error=rate_limited&from=${fromParam}`);
    }

    // Captcha (no-op until Turnstile keys are set).
    const remoteIp =
      headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const captcha = await verifyTurnstile(
      String(formData.get("cf-turnstile-response") ?? ""),
      remoteIp
    );
    if (!captcha.ok) redirect(`/login?error=captcha&from=${fromParam}`);

    try {
      await signIn("credentials", {
        email,
        password: formData.get("password"),
        redirectTo: from,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/login?error=1&from=${fromParam}`);
      }
      throw err; // NEXT_REDIRECT
    }
  }

  const field =
    "rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2.5 outline-none transition-colors focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

  const errMsg =
    searchParams.error === "rate_limited"
      ? "Too many sign-in attempts. Wait a minute and try again."
      : searchParams.error === "captcha"
        ? "Captcha verification failed. Reload the page and try again."
        : searchParams.error
          ? "Invalid email or password."
          : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div>
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.jpg" alt="" className="h-7 w-7 rounded-lg object-cover" />
          MentaAgent
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in to your analyst.</p>
      </div>
      {errMsg && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errMsg}</p>
      )}
      <form action={login} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="you@business.com" className={field} />
        <input name="password" type="password" required placeholder="Password" className={field} />
        <Turnstile siteKey={TURNSTILE_SITE_KEY} />
        <button
          type="submit"
          className="mt-1 rounded-lg bg-white px-4 py-2.5 font-medium text-stone-950 transition-colors hover:bg-stone-200"
        >
          Sign in
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        No account?{" "}
        <Link href="/signup" className="font-medium text-neutral-700 hover:underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
