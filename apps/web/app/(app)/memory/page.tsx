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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">What your analyst knows</h1>
          <p className="text-sm text-neutral-500">
            Everything remembered about your business. Edit anything that&apos;s
            wrong; delete anything you&apos;d rather it forget.
          </p>
        </div>
        <a
          href="/api/proxy/api/memory/export"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Export
        </a>
      </div>
      <MemoryList memory={memory} />
    </div>
  );
}
