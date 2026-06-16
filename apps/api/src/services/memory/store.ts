import { pool } from "../../db/client.js";

// Curated per-workspace memory (the Hermes/OpenClaw-style file pair, rebuilt
// as DB rows for hostile multi-tenancy). Four categories, each under a hard
// char budget enforced HERE — over-budget writes return an error telling the
// agent to consolidate (merge/replace/remove) instead of appending forever.
// Storage is never truncated; only what's injected is bounded.

export type MemoryCategory =
  | "business_facts"
  | "owner_preferences"
  | "advisor_notes"
  | "open_loops";

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  "business_facts",
  "owner_preferences",
  "advisor_notes",
  "open_loops",
];

// Char budget per category (~800 tokens each, ~3K total in the prompt).
export const CATEGORY_BUDGET_CHARS: Record<MemoryCategory, number> = {
  business_facts: 3000,
  owner_preferences: 1500,
  advisor_notes: 3000,
  open_loops: 2000,
};

export type MemoryRow = {
  id: string;
  category: MemoryCategory;
  content: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listMemory(
  workspaceId: string,
  category?: MemoryCategory
): Promise<MemoryRow[]> {
  const { rows } = await pool.query<MemoryRow>(
    `SELECT id, category, content, due_at, created_at, updated_at
       FROM workspace_memory
      WHERE workspace_id = $1 ${category ? "AND category = $2" : ""}
      ORDER BY category, created_at`,
    category ? [workspaceId, category] : [workspaceId]
  );
  return rows;
}

async function categoryUsedChars(
  workspaceId: string,
  category: MemoryCategory
): Promise<number> {
  const { rows } = await pool.query<{ used: string }>(
    `SELECT COALESCE(SUM(LENGTH(content)), 0)::text AS used
       FROM workspace_memory
      WHERE workspace_id = $1 AND category = $2`,
    [workspaceId, category]
  );
  return Number(rows[0].used);
}

export class MemoryBudgetError extends Error {
  constructor(category: MemoryCategory, used: number, budget: number) {
    super(
      `${category} is at ${used}/${budget} chars — over budget. Consolidate first: ` +
        `use action "replace" to merge overlapping entries or "remove" to drop stale ones, then re-add.`
    );
    this.name = "MemoryBudgetError";
  }
}

// Trigram similarity at/above which a new entry is treated as a duplicate of
// an existing one in the same category (same wording or a minor reword).
// Genuinely different facts that merely share an entity name score well below
// this; deeper semantic paraphrase merging is handled by the nightly
// consolidate run.
const DEDUP_SIMILARITY = 0.55;

export type AddMemoryResult =
  | { duplicate: false; row: MemoryRow }
  | { duplicate: true; existing: string };

export async function addMemory(args: {
  workspaceId: string;
  category: MemoryCategory;
  content: string;
  dueAt?: string | null;
  sourceRunId?: string | null;
}): Promise<AddMemoryResult> {
  const content = args.content.trim();

  // Dedup FIRST (before the budget check) so re-saving a known fact is a
  // cheap no-op. Matches an exact (case-insensitive) entry OR one with high
  // trigram similarity, within the same category.
  const { rows: dup } = await pool.query<{ content: string }>(
    `SELECT content
       FROM workspace_memory
      WHERE workspace_id = $1 AND category = $2
        AND (LOWER(content) = LOWER($3) OR similarity(content, $3) >= $4)
      ORDER BY similarity(content, $3) DESC
      LIMIT 1`,
    [args.workspaceId, args.category, content, DEDUP_SIMILARITY]
  );
  if (dup.length > 0) {
    return { duplicate: true, existing: dup[0].content };
  }

  const budget = CATEGORY_BUDGET_CHARS[args.category];
  const used = await categoryUsedChars(args.workspaceId, args.category);
  if (used + content.length > budget) {
    throw new MemoryBudgetError(args.category, used, budget);
  }
  const { rows } = await pool.query<MemoryRow>(
    `INSERT INTO workspace_memory (workspace_id, category, content, due_at, source_run_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, category, content, due_at, created_at, updated_at`,
    [args.workspaceId, args.category, content, args.dueAt ?? null, args.sourceRunId ?? null]
  );
  return { duplicate: false, row: rows[0] };
}

// Replace by substring match within a category (the Hermes memory-tool
// shape: the model quotes the old text rather than tracking row ids).
export async function replaceMemory(args: {
  workspaceId: string;
  category: MemoryCategory;
  oldText: string;
  content: string;
  sourceRunId?: string | null;
}): Promise<{ replaced: boolean }> {
  const { rows } = await pool.query<{ id: string; content: string }>(
    `SELECT id, content FROM workspace_memory
      WHERE workspace_id = $1 AND category = $2 AND content ILIKE '%' || $3 || '%'
      ORDER BY created_at LIMIT 1`,
    [args.workspaceId, args.category, args.oldText]
  );
  if (rows.length === 0) return { replaced: false };

  // Budget check against the post-replace total.
  const budget = CATEGORY_BUDGET_CHARS[args.category];
  const used = await categoryUsedChars(args.workspaceId, args.category);
  const next = used - rows[0].content.length + args.content.length;
  if (next > budget) {
    throw new MemoryBudgetError(args.category, used, budget);
  }
  await pool.query(
    `UPDATE workspace_memory
        SET content = $2, source_run_id = COALESCE($3, source_run_id), updated_at = NOW()
      WHERE id = $1`,
    [rows[0].id, args.content.trim(), args.sourceRunId ?? null]
  );
  return { replaced: true };
}

export async function removeMemory(args: {
  workspaceId: string;
  category: MemoryCategory;
  oldText: string;
}): Promise<{ removed: boolean }> {
  const { rowCount } = await pool.query(
    `DELETE FROM workspace_memory
      WHERE id IN (
        SELECT id FROM workspace_memory
         WHERE workspace_id = $1 AND category = $2 AND content ILIKE '%' || $3 || '%'
         ORDER BY created_at LIMIT 1
      )`,
    [args.workspaceId, args.category, args.oldText]
  );
  return { removed: (rowCount ?? 0) > 0 };
}

// Direct row ops for the "What your analyst knows" UI (trust feature).
export async function updateMemoryRow(
  workspaceId: string,
  id: string,
  content: string
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE workspace_memory SET content = $3, updated_at = NOW()
      WHERE id = $2 AND workspace_id = $1`,
    [workspaceId, id, content.trim()]
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteMemoryRow(
  workspaceId: string,
  id: string
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM workspace_memory WHERE id = $2 AND workspace_id = $1",
    [workspaceId, id]
  );
  return (rowCount ?? 0) > 0;
}

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  business_facts: "Business facts",
  owner_preferences: "Owner preferences",
  advisor_notes: "Advisor notes (how to analyze this business)",
  open_loops: "Open loops (commitments / pending outcomes to follow up on)",
};

// Frozen per-run snapshot for the system prompt. Byte-stable ordering so
// prompt-prefix caching holds within a run.
export async function renderMemoryForPrompt(
  workspaceId: string
): Promise<string> {
  const rows = await listMemory(workspaceId);
  if (rows.length === 0) return "";
  const byCategory = new Map<MemoryCategory, MemoryRow[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }
  const parts: string[] = [];
  for (const cat of MEMORY_CATEGORIES) {
    const list = byCategory.get(cat);
    if (!list?.length) continue;
    const lines = list.map((r) => {
      // due_at comes back from pg as a Date (or string) — normalize to YYYY-MM-DD.
      const due = r.due_at
        ? ` (due ${new Date(r.due_at).toISOString().slice(0, 10)})`
        : "";
      return `- ${r.content}${due}`;
    });
    parts.push(`### ${CATEGORY_LABELS[cat]}\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}
