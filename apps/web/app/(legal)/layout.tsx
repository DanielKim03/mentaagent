import Link from "next/link";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← MentaAgent
      </Link>
      <div className="prose prose-neutral mt-6 max-w-none">{children}</div>
    </div>
  );
}
