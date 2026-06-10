"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div>
      <button
        onClick={() => void generate()}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
      >
        {busy ? "Starting…" : "Generate Business Health Report"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
