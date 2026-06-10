import UploadForm from "@/components/UploadForm";
import { apiGet } from "@/lib/api";

type SourceRow = {
  id: string;
  filename: string;
  file_type: string;
  status: string;
  created_at: string;
  doc_type: string | null;
  summary: string | null;
};

export default async function SourcesPage() {
  const { sources } = await apiGet<{ sources: SourceRow[] }>("/api/sources");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your business data</h1>
        <p className="text-sm text-neutral-500">
          Everything you share here is what your analyst reasons over. The
          more complete the picture, the sharper the advice.
        </p>
      </div>
      <UploadForm />
      <div className="space-y-3">
        {sources.length === 0 && (
          <p className="text-sm text-neutral-500">
            Nothing shared yet. Good starters: a customer/sales spreadsheet,
            your key contracts, last year&apos;s P&amp;L.
          </p>
        )}
        {sources.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{s.filename}</p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                  s.status === "processed"
                    ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                    : s.status === "failed"
                      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {s.status}
              </span>
            </div>
            {s.summary && (
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {s.summary}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
