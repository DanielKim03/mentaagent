import { pool } from "../../db/client.js";
import { callEmbeddings, getEmbeddingsClient } from "../llm/client.js";

// Hybrid retrieval over chunks: pgvector cosine + Postgres FTS fused with
// Reciprocal Rank Fusion (adapted from Mentapath's query/retrieval.ts, link-
// graph hop dropped — no wiki). Degrades to FTS-only when embeddings are
// unavailable (no key, no pgvector, or nothing embedded yet).

const RRF_K = 60;
const SEED_LIMIT = 30;

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  docType: string;
  content: string;
  score: number;
};

let vectorColumnExists: boolean | null = null;
async function hasVectorColumn(): Promise<boolean> {
  if (vectorColumnExists !== null) return vectorColumnExists;
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'chunks' AND column_name = 'embedding'`
  );
  vectorColumnExists = rows.length > 0;
  return vectorColumnExists;
}

export async function searchChunks(
  workspaceId: string,
  query: string,
  topK = 5
): Promise<RetrievedChunk[]> {
  type SeedRow = { id: string };
  // rank position per chunk id, per signal
  const ranks = new Map<string, { fts?: number; vec?: number }>();

  // --- FTS signal (always available; fts is a generated column) ------------
  const { rows: ftsRows } = await pool.query<SeedRow>(
    `SELECT id FROM chunks
      WHERE workspace_id = $1 AND fts @@ plainto_tsquery('english', $2)
      ORDER BY ts_rank_cd(fts, plainto_tsquery('english', $2)) DESC
      LIMIT $3`,
    [workspaceId, query, SEED_LIMIT]
  );
  ftsRows.forEach((r, i) => {
    ranks.set(r.id, { ...ranks.get(r.id), fts: i + 1 });
  });

  // --- Vector signal (best-effort) ------------------------------------------
  if (getEmbeddingsClient() && (await hasVectorColumn())) {
    try {
      const [vec] = await callEmbeddings({ workspaceId, input: [query] });
      const { rows: vecRows } = await pool.query<SeedRow>(
        `SELECT id FROM chunks
          WHERE workspace_id = $1 AND embedding IS NOT NULL
          ORDER BY embedding <=> $2
          LIMIT $3`,
        [workspaceId, `[${vec.join(",")}]`, SEED_LIMIT]
      );
      vecRows.forEach((r, i) => {
        ranks.set(r.id, { ...ranks.get(r.id), vec: i + 1 });
      });
    } catch (err) {
      console.error("[retrieval] vector search failed (FTS-only):", err);
    }
  }

  if (ranks.size === 0) return [];

  // --- RRF fusion --------------------------------------------------------------
  const fused = [...ranks.entries()]
    .map(([id, r]) => ({
      id,
      score:
        (r.fts ? 1 / (RRF_K + r.fts) : 0) + (r.vec ? 1 / (RRF_K + r.vec) : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const { rows } = await pool.query<{
    id: string;
    document_id: string;
    title: string;
    doc_type: string;
    content: string;
  }>(
    `SELECT c.id, c.document_id, d.title, d.doc_type, c.content
       FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.id = ANY($1)`,
    [fused.map((f) => f.id)]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  return fused.flatMap((f) => {
    const row = byId.get(f.id);
    return row
      ? [
          {
            chunkId: row.id,
            documentId: row.document_id,
            documentTitle: row.title,
            docType: row.doc_type,
            content: row.content,
            score: f.score,
          },
        ]
      : [];
  });
}
