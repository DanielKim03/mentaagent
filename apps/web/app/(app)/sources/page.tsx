import { FileText } from "lucide-react";
import UploadForm from "@/components/UploadForm";
import DeleteSourceButton from "@/components/DeleteSourceButton";
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

const STATUS_TONE: Record<string, string> = {
  processed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-700",
  processing: "bg-amber-100 text-amber-700",
};

export default async function SourcesPage() {
  const { sources } = await apiGet<{ sources: SourceRow[] }>("/api/sources");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your business data</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything you share here is what your analyst reasons over. The more
          complete the picture, the sharper the advice.
        </p>
      </div>
      <UploadForm />
      <div className="space-y-2">
        {sources.length === 0 && (
          <p className="text-sm text-neutral-500">
            Nothing shared yet. Good starters: a customer/sales spreadsheet,
            your key contracts, last year&apos;s P&amp;L.
          </p>
        )}
        {sources.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4"
          >
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-medium">{s.filename}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[s.status] ?? "bg-neutral-100 text-neutral-600"}`}
                  >
                    {s.status}
                  </span>
                  <DeleteSourceButton id={s.id} filename={s.filename} />
                </div>
              </div>
              {s.summary && (
                <p className="mt-1 text-sm text-neutral-600">{s.summary}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
