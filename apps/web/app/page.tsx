import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/chat");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">MentaAgent</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-300">
        An AI business analyst on subscription. Share your business documents
        and get concrete answers: what you&apos;re lacking, where the risks
        are, and what to improve — grounded in your real data, remembered
        across every conversation.
      </p>
      <div className="flex gap-4">
        <Link
          href="/signup"
          className="rounded-lg bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-neutral-300 px-6 py-3 font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
