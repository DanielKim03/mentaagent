"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Upload + live ingest status via the source SSE stream.

export default function UploadForm() {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(file: File) {
    setBusy(true);
    setStatus(`Uploading ${file.name}…`);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/proxy/api/sources", { method: "POST", body });
    if (res.status === 402) {
      setStatus("Upload quota exhausted — upgrade your plan.");
      setBusy(false);
      return;
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus(err?.error ?? "Upload failed.");
      setBusy(false);
      return;
    }
    const { source_id } = (await res.json()) as { source_id: string };
    setStatus("Processing…");

    const es = new EventSource(`/api/proxy/api/sources/${source_id}/events`);
    es.addEventListener("status", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        status: string;
        message?: string;
      };
      if (data.status === "processed") {
        setStatus(`Done: ${data.message ?? file.name}`);
        es.close();
        setBusy(false);
        router.refresh();
      } else if (data.status === "failed") {
        setStatus(`Failed: ${data.message ?? "could not process the file"}`);
        es.close();
        setBusy(false);
        router.refresh();
      } else {
        setStatus(`Processing (${data.status})…`);
      }
    });
    es.onerror = () => {
      es.close();
      setBusy(false);
      router.refresh();
    };
  }

  return (
    <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.pdf,.docx,.txt,.eml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
      >
        Upload a file
      </button>
      <p className="mt-2 text-sm text-neutral-500">
        Spreadsheets (CSV/XLSX), PDFs, Word docs, text, emails (.eml)
      </p>
      {status && <p className="mt-3 text-sm">{status}</p>}
    </div>
  );
}
