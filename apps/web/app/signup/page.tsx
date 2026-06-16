import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { auth, signIn } from "@/auth";
import { pool } from "@/lib/db";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/chat");

  async function signup(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const businessName = String(formData.get("business") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || password.length < 8 || !businessName) {
      redirect("/signup?error=invalid");
    }

    const { rows: existing } = await pool.query(
      "SELECT 1 FROM users WHERE lower(email) = lower($1)",
      [email]
    );
    if (existing.length > 0) redirect("/signup?error=exists");

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

    await signIn("credentials", { email, password, redirectTo: "/onboarding" });
  }

  const field =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2.5 outline-none transition-colors focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div>
        <Link href="/" className="text-lg font-semibold tracking-tight">
          MentaAgent
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Two minutes to your own AI business analyst.
        </p>
      </div>
      {searchParams.error === "exists" && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          An account with that email already exists.
        </p>
      )}
      {searchParams.error === "invalid" && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Fill in every field; password needs 8+ characters.
        </p>
      )}
      <form action={signup} className="flex flex-col gap-3">
        <input name="name" placeholder="Your name" className={field} />
        <input name="business" required placeholder="Business name" className={field} />
        <input name="email" type="email" required placeholder="you@business.com" className={field} />
        <input name="password" type="password" required minLength={8} placeholder="Password (8+ chars)" className={field} />
        <button
          type="submit"
          className="mt-1 rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white transition-colors hover:bg-neutral-700"
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
