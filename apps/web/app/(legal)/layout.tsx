import Link from "next/link";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            Mentapath
          </Link>
          <nav className="flex gap-4 text-xs text-neutral-600 dark:text-neutral-400">
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/refund" className="hover:underline">
              Refunds
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
        <article className="space-y-4">{children}</article>
      </main>
      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-500 dark:border-neutral-800">
        <Link href="/" className="hover:underline">
          ← Back to mentapath.com
        </Link>
      </footer>
    </div>
  );
}
