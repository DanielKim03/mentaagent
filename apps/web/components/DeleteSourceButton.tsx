"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

// Delete one uploaded source (and its document/chunks/embeddings via cascade).
// On a free plan this frees an upload slot. Lives in its own client component
// so the sources list can stay a server component.
export default function DeleteSourceButton({
  id,
  filename,
}: {
  id: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!confirm(`Delete "${filename}"? This removes it from your analyst's data.`)) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/proxy/api/sources/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      setBusy(false);
      alert("Could not delete the file. Please try again.");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void remove()}
      disabled={busy}
      aria-label={`Delete ${filename}`}
      title="Delete file"
      className="shrink-0 rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </button>
  );
}
