"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, Check, X, Loader2 } from "lucide-react";

// Multi-file upload with drag-and-drop. Each file is uploaded independently
// (one request → its own quota/ingest/SSE), with up to 3 in flight at once,
// and shows its own live progress row.

type Phase = "uploading" | "processing" | "done" | "failed";
type Item = { key: string; name: string; phase: Phase; message?: string };

const ACCEPT = ".csv,.xlsx,.xls,.pdf,.docx,.txt,.eml";
const MAX_CONCURRENT = 3;

export default function UploadForm() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const setItem = useCallback(
    (key: string, patch: Partial<Item>) =>
      setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it))),
    []
  );

  const uploadOne = useCallback(
    async (file: File, key: string) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/proxy/api/sources", { method: "POST", body });
      if (res.status === 402) {
        setItem(key, { phase: "failed", message: "Upload quota exhausted — upgrade your plan." });
        return;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setItem(key, { phase: "failed", message: err?.error ?? "Upload failed." });
        return;
      }
      const { source_id } = (await res.json()) as { source_id: string };
      setItem(key, { phase: "processing" });

      await new Promise<void>((resolve) => {
        const es = new EventSource(`/api/proxy/api/sources/${source_id}/events`);
        es.addEventListener("status", (e) => {
          const data = JSON.parse((e as MessageEvent).data) as {
            status: string;
            message?: string;
          };
          if (data.status === "processed") {
            setItem(key, { phase: "done", message: data.message });
            es.close();
            resolve();
          } else if (data.status === "failed") {
            setItem(key, { phase: "failed", message: data.message ?? "Could not process the file." });
            es.close();
            resolve();
          }
        });
        es.onerror = () => {
          es.close();
          resolve();
        };
      });
    },
    [setItem]
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const queued: { file: File; key: string }[] = files.map((file, i) => ({
        file,
        key: `${Date.now()}-${i}-${file.name}`,
      }));
      setItems((prev) => [
        ...queued.map((q) => ({ key: q.key, name: q.file.name, phase: "uploading" as Phase })),
        ...prev,
      ]);

      // Bounded concurrency.
      let cursor = 0;
      const worker = async () => {
        while (cursor < queued.length) {
          const idx = cursor++;
          await uploadOne(queued[idx].file, queued[idx].key);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(MAX_CONCURRENT, queued.length) }, worker)
      );
      router.refresh();
    },
    [uploadOne, router]
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-neutral-500 bg-neutral-100"
            : "border-neutral-300 bg-neutral-100 hover:border-neutral-400 hover:bg-neutral-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            void handleFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <UploadCloud className="mb-3 h-8 w-8 text-neutral-400" />
        <p className="font-medium text-neutral-700">
          Drop files here, or click to choose
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Upload several at once — spreadsheets (CSV/XLSX), PDFs, Word docs, text, emails
        </p>
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((it) => (
            <li
              key={it.key}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2.5"
            >
              <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{it.name}</p>
                {it.message && (
                  <p className="truncate text-xs text-neutral-500">{it.message}</p>
                )}
              </div>
              <span className="shrink-0">
                {it.phase === "uploading" && (
                  <span className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading
                  </span>
                )}
                {it.phase === "processing" && (
                  <span className="flex items-center gap-1.5 text-xs text-neutral-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing
                  </span>
                )}
                {it.phase === "done" && (
                  <Check className="h-4 w-4 text-green-600" />
                )}
                {it.phase === "failed" && <X className="h-4 w-4 text-red-600" />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
