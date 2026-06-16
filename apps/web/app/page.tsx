import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { auth } from "@/auth";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/chat");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-900 text-white">
        <Sparkles className="h-7 w-7" />
      </span>
      <h1 className="text-4xl font-bold tracking-tight">MentaAgent</h1>
      <p className="max-w-xl text-lg text-neutral-600">
        An AI business analyst on subscription. Share your business documents
        and get concrete answers — what you&apos;re lacking, where the risks
        are, and what to improve — grounded in your real data and remembered
        across every conversation.
      </p>
      <div className="flex gap-3">
        <Link
          href="/signup"
          className="rounded-xl bg-neutral-900 px-6 py-3 font-medium text-white transition-colors hover:bg-neutral-700"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-neutral-300 bg-white px-6 py-3 font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
