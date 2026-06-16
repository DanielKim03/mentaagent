import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";

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
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: from,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/login?error=1&from=${encodeURIComponent(from)}`);
      }
      throw err; // NEXT_REDIRECT
    }
  }

  const field =
    "rounded-lg border border-neutral-300 bg-white px-3 py-2.5 outline-none transition-colors focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div>
        <Link href="/" className="text-lg font-semibold tracking-tight">
          MentaAgent
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in to your analyst.</p>
      </div>
      {searchParams.error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Invalid email or password.
        </p>
      )}
      <form action={login} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="you@business.com" className={field} />
        <input name="password" type="password" required placeholder="Password" className={field} />
        <button
          type="submit"
          className="mt-1 rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white transition-colors hover:bg-neutral-700"
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
