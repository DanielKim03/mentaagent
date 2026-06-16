"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

export default function GenerateReportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/proxy/api/reports", { method: "POST" });
    if (res.status === 409) {
      setError("A report is already being generated.");
    } else if (res.status === 402) {
      setError("You've reached your plan's usage limit this period.");
    } else if (!res.ok) {
      setError("Could not start the report.");
    } else {
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="shrink-0 text-right">
      <button
        onClick={() => void generate()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {busy ? "Starting…" : "Generate report"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
