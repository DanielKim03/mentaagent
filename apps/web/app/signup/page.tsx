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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Create your account</h1>
      {searchParams.error === "exists" && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          An account with that email already exists.
        </p>
      )}
      {searchParams.error === "invalid" && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Fill in every field; password needs 8+ characters.
        </p>
      )}
      <form action={signup} className="flex flex-col gap-3">
        <input name="name" placeholder="Your name" className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
        <input name="business" required placeholder="Business name" className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
        <input name="email" type="email" required placeholder="you@business.com" className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
        <input name="password" type="password" required minLength={8} placeholder="Password (8+ chars)" className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" />
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900">
          Create account
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
