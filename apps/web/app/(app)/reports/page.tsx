import Link from "next/link";
import { FileBarChart, ChevronRight } from "lucide-react";
import GenerateReportButton from "@/components/GenerateReportButton";
import { apiGet } from "@/lib/api";

type ReportRow = {
  id: string;
  title: string;
  status: string;
  overall_score: number | null;
  created_at: string;
};

function scoreTone(score: number) {
  if (score >= 70) return "bg-green-100 text-green-700";
  if (score >= 40) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export default async function ReportsPage() {
  const { reports } = await apiGet<{ reports: ReportRow[] }>("/api/reports");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business health reports</h1>
          <p className="mt-1 text-sm text-neutral-500">
            A full investigation across finance, customers, contracts,
            operations, and more — scored and cited from your data.
          </p>
        </div>
        <GenerateReportButton />
      </div>
      <div className="space-y-2">
        {reports.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
            <FileBarChart className="mx-auto mb-3 h-8 w-8 text-neutral-400" />
            <p className="text-sm text-neutral-500">
              No reports yet. Upload some business data, then generate your
              first report.
            </p>
          </div>
        )}
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/reports/${r.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-400 hover:bg-neutral-100"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{r.title}</p>
              <p className="text-xs text-neutral-500">
                {new Date(r.created_at).toLocaleDateString()} ·{" "}
                {r.status === "generating" ? "generating…" : r.status}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {r.overall_score !== null && (
                <span
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${scoreTone(r.overall_score)}`}
                >
                  {r.overall_score}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-neutral-400" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
