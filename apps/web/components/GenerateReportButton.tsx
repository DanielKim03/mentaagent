"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileBarChart, Loader2 } from "lucide-react";

// Starts a report now instead of waiting for the weekly/monthly schedule.
// While one is generating, the button is disabled and the page refreshes
// every few seconds so the new report appears when it's ready.
export default function GenerateReportButton({ generating }: { generating: boolean }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [generating, router]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/api/reports", { method: "POST" });
      if (!res.ok && res.status !== 409) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not start a report.");
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setStarting(false);
    }
  }

  const busy = starting || generating;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-stone-950 transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart className="h-4 w-4" />}
        {generating ? "Generating a report…" : "Generate report now"}
      </button>
      <p className="text-xs text-neutral-500">
        Takes a few minutes. It runs on your model key: usually a few cents, never more than $2.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
