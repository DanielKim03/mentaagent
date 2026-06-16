import Link from "next/link";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight hover:text-neutral-600"
          >
            Mentapath
          </Link>
          <nav className="flex gap-4 text-xs text-neutral-600">
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
      <main className="mx-auto max-w-3xl px-6 py-10 text-sm leading-relaxed text-neutral-800">
        <article className="space-y-4">{children}</article>
      </main>
      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-500">
        <Link href="/" className="hover:underline">
          ← Back to mentapath.com
        </Link>
      </footer>
    </div>
  );
}
