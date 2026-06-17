import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { LandingDemo } from "@/components/LandingDemo";
import { PricingTable } from "@/components/PricingTable";

export const metadata = {
  title: "MentaAgent — your AI business analyst",
  description:
    "Connect your business files and get an AI analyst that tells you what you're lacking, where the risks are, and what to improve — grounded in your real data.",
};

const FEATURES = [
  {
    title: "Ask anything about your business",
    body: "Upload spreadsheets, contracts, PDFs, and emails. Your analyst investigates the real numbers and answers with citations back to the source.",
  },
  {
    title: "Gap-analysis reports",
    body: "A full health check across finance, customers, contracts, operations, and more — each dimension scored, with the top gaps and what to do next.",
  },
  {
    title: "It remembers and improves",
    body: "Per-business memory and learned playbooks mean it gets sharper at advising you over time — and proactively flags new risks on a schedule.",
  },
];

export default async function PublicLandingPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/chat");

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-100/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.jpg" alt="MentaAgent" className="h-7 w-7 rounded-lg object-cover" />
            MentaAgent
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="rounded-md px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100">
              Log in
            </Link>
            <Link href="/signup" className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-stone-950 transition-colors hover:bg-stone-200">
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-16 md:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
            <Sparkles className="h-3.5 w-3.5" />
            Free to start — no credit card required
          </span>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            An AI business analyst that actually knows your business.
          </h1>
          <p className="mt-4 text-lg text-neutral-600">
            Connect your files and MentaAgent tells you what you&apos;re lacking,
            where the risks are, and what to improve — grounded in your real
            data, remembered across every conversation.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center justify-center rounded-md bg-white px-5 py-2.5 text-sm font-medium text-stone-950 transition-colors hover:bg-stone-200">
              Start free →
            </Link>
            <Link href="/login" className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-500">
              Log in
            </Link>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Free includes 4 files + 8 questions. Upgrade anytime.
          </p>
        </div>
      </section>

      {/* Live demo — the first content block, right under the hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-semibold">See it in action</h2>
            <p className="mt-1 text-sm text-neutral-600">
              A sample workspace — click a question on the right.
            </p>
          </div>
          <span className="text-xs text-neutral-500">Illustrative — no sign-up needed</span>
        </div>
        <LandingDemo />
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="text-center text-2xl font-semibold">
          Everything you need to understand your business
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-neutral-600">
          Connect your files and let the analyst do the digging.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-neutral-200 bg-neutral-100 p-6">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-neutral-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-neutral-200 bg-neutral-100 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-semibold">Simple pricing</h2>
          <p className="mt-2 text-center text-sm text-neutral-600">
            Start free. Pick a plan — upgrade when you want full reports, monitoring, and more seats.
          </p>
          <PricingTable />
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold">Ready to see your business clearly?</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Sign up in under a minute, share a file or two, and ask your first
          question — enough to see if the answers match what you already know.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-white px-5 py-2.5 text-sm font-medium text-stone-950 transition-colors hover:bg-stone-200"
        >
          Start free →
        </Link>
      </section>

      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-500">
        <div>© {new Date().getFullYear()} MentaAgent</div>
        <nav className="mt-2 flex justify-center gap-4">
          <Link href="/terms" className="hover:underline">Terms</Link>
          <Link href="/privacy" className="hover:underline">Privacy</Link>
          <Link href="/refund" className="hover:underline">Refunds</Link>
        </nav>
      </footer>
    </main>
  );
}
