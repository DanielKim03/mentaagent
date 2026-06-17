import { Share2 } from "lucide-react";
import GraphView, { type GEdge, type GNode } from "@/components/GraphView";
import { apiGet } from "@/lib/api";

export default async function GraphPage() {
  const { nodes, edges } = await apiGet<{ nodes: GNode[]; edges: GEdge[] }>(
    "/api/graph"
  );
  const docCount = nodes.filter((n) => n.kind === "document").length;
  const entCount = nodes.filter((n) => n.kind === "entity").length;

  return (
    <div className="flex h-full flex-col p-6 md:p-8">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Knowledge graph</h1>
        <p className="mt-1 text-sm text-neutral-500">
          How your data connects. Documents link to the people, customers,
          vendors, products, and contracts they mention — and the analyst
          traverses these links to reason across your whole dataset.
          {nodes.length > 0 && (
            <>
              {" "}
              <span className="text-neutral-400">
                {docCount} documents · {entCount} entities
              </span>
            </>
          )}
        </p>
      </div>
      <div className="min-h-0 flex-1">
        {nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-100 text-center">
            <Share2 className="mb-3 h-8 w-8 text-neutral-400" />
            <p className="text-sm text-neutral-500">
              No connections yet. Upload business data on the{" "}
              <a href="/sources" className="font-medium text-neutral-900 underline">
                Data
              </a>{" "}
              page — the graph builds itself as documents are analyzed.
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              (Already uploaded? Entity extraction runs in the background — give
              it a moment, then refresh.)
            </p>
          </div>
        ) : (
          <GraphView nodes={nodes} edges={edges} />
        )}
      </div>
    </div>
  );
}
