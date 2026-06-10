import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "@/lib/api";

type Section = {
  section_key: string;
  title: string;
  position: number;
  content_md: string;
  score: number | null;
  status: string;
};

type ReportDetail = {
  report: {
    id: string;
    title: string;
    status: string;
    overall_score: number | null;
    created_at: string;
  };
  sections: Section[];
};

function ScoreChip({ score }: { score: number | null }) {
  if (score === null) return null;
  const tone =
    score >= 70
      ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
      : score >= 40
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>
      {score}/100
    </span>
  );
}

export default async function ReportDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const res = await apiFetch(`/api/reports/${params.id}`);
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("failed to load report");
  const { report, sections } = (await res.json()) as ReportDetail;

  return (
    <div className="mx-auto max-w-3xl space-y-8 print:max-w-none">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{report.title}</h1>
          <p className="text-sm text-neutral-500">
            {new Date(report.created_at).toLocaleDateString()} ·{" "}
            {report.status === "generating"
              ? "still generating — refresh in a minute"
              : report.status}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScoreChip score={report.overall_score} />
        </div>
      </div>

      {sections
        .filter((s) => s.status === "written")
        .map((s) => (
          <section key={s.section_key} className="space-y-2">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-2 dark:border-neutral-800">
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <ScoreChip score={s.score} />
            </div>
            <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {s.content_md}
              </ReactMarkdown>
            </div>
          </section>
        ))}

      {sections.some((s) => s.status === "pending") && (
        <p className="text-sm text-neutral-500">
          Sections still being investigated:{" "}
          {sections
            .filter((s) => s.status === "pending")
            .map((s) => s.title)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
