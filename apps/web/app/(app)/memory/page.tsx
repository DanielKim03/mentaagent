import MemoryList from "@/components/MemoryList";
import { apiGet } from "@/lib/api";

type MemoryRow = {
  id: string;
  category: string;
  content: string;
  due_at: string | null;
  updated_at: string;
};

export default async function MemoryPage() {
  const { memory } = await apiGet<{ memory: MemoryRow[] }>("/api/memory");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">What your analyst knows</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Everything remembered about your business. Edit anything that&apos;s
            wrong; delete anything you&apos;d rather it forget.
          </p>
        </div>
        <a
          href="/api/proxy/api/memory/export"
          className="shrink-0 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          Export
        </a>
      </div>
      <MemoryList memory={memory} />
    </div>
  );
}
