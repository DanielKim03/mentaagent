import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { pool } from "../../db/client.js";

// Skills = markdown analysis playbooks. Progressive disclosure: only the
// catalog (name + description) goes into the system prompt; the agent
// fetches a full body on demand via use_skill (usage telemetry recorded).
//
// Scopes: workspace_id NULL = global library (curated, seeded from repo
// skills/*.md, improving it improves every customer); non-NULL = learned
// per-workspace skill (agent-proposed via propose_skill, owner-approved).
// A workspace skill with the same name shadows the global one for that
// tenant. Skills are instructions only — never executable code — and are
// NEVER shared across tenants.

export type SkillRow = {
  id: string;
  workspace_id: string | null;
  name: string;
  description: string;
  body: string;
  source: "curated" | "agent";
  status: "active" | "proposed" | "archived";
  use_count: number;
};

// Active skills visible to a workspace: global ∪ workspace, workspace wins
// on name collision. Optional industry filter (empty industries[] = all).
export async function catalogForWorkspace(
  workspaceId: string,
  industry?: string | null
): Promise<Pick<SkillRow, "name" | "description">[]> {
  const { rows } = await pool.query<SkillRow>(
    `SELECT DISTINCT ON (name) name, description, workspace_id
       FROM skills
      WHERE status = 'active'
        AND (workspace_id IS NULL OR workspace_id = $1)
        AND (cardinality(industries) = 0 OR $2::text IS NULL OR $2 = ANY(industries))
      ORDER BY name, workspace_id NULLS LAST`,
    [workspaceId, industry ?? null]
  );
  return rows.map((r) => ({ name: r.name, description: r.description }));
}

export async function getSkillBody(
  workspaceId: string,
  name: string
): Promise<string | null> {
  const { rows } = await pool.query<SkillRow>(
    `SELECT id, body FROM skills
      WHERE status = 'active' AND name = $2
        AND (workspace_id IS NULL OR workspace_id = $1)
      ORDER BY workspace_id NULLS LAST
      LIMIT 1`,
    [workspaceId, name]
  );
  if (rows.length === 0) return null;
  await pool.query(
    "UPDATE skills SET use_count = use_count + 1, last_used_at = NOW() WHERE id = $1",
    [rows[0].id]
  );
  return rows[0].body;
}

const MAX_SKILL_BODY_CHARS = 15_000;

// Reflect runs propose new/updated per-workspace skills. Proposals land as
// status='proposed' and surface in the "Your analyst is learning" approval
// queue — the OpenClaw Skill Workshop pattern. Patching an existing ACTIVE
// agent skill also goes through a proposal (a proposed row shadows nothing
// until approved).
export async function proposeSkill(args: {
  workspaceId: string;
  name: string;
  description: string;
  body: string;
  sourceRunId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (args.body.length > MAX_SKILL_BODY_CHARS) {
    return { ok: false, error: `skill body too long (max ${MAX_SKILL_BODY_CHARS} chars)` };
  }
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(args.name)) {
    return {
      ok: false,
      error: "skill name must be kebab-case, 3-64 chars (e.g. seasonal-cashflow-check)",
    };
  }
  // One pending proposal per name per workspace; a re-proposal replaces it.
  await pool.query(
    `INSERT INTO skills (workspace_id, name, description, body, source, status)
     VALUES ($1, $2, $3, $4, 'agent', 'proposed')
     ON CONFLICT (workspace_id, name) WHERE workspace_id IS NOT NULL
     DO UPDATE SET description = EXCLUDED.description,
                   body = EXCLUDED.body,
                   status = CASE WHEN skills.status = 'active' THEN 'active' ELSE 'proposed' END,
                   updated_at = NOW()`,
    [args.workspaceId, args.name, args.description.slice(0, 500), args.body]
  );
  return { ok: true };
}

export async function reviewSkill(
  workspaceId: string,
  id: string,
  decision: "approve" | "reject"
): Promise<boolean> {
  const { rowCount } = await pool.query(
    decision === "approve"
      ? `UPDATE skills SET status = 'active', updated_at = NOW()
          WHERE id = $2 AND workspace_id = $1 AND status = 'proposed'`
      : `DELETE FROM skills WHERE id = $2 AND workspace_id = $1 AND status = 'proposed'`,
    [workspaceId, id]
  );
  return (rowCount ?? 0) > 0;
}

export async function listSkills(
  workspaceId: string
): Promise<Omit<SkillRow, "body">[]> {
  const { rows } = await pool.query<SkillRow>(
    `SELECT id, workspace_id, name, description, source, status, use_count
       FROM skills
      WHERE workspace_id = $1 OR workspace_id IS NULL
      ORDER BY workspace_id NULLS LAST, name`,
    [workspaceId]
  );
  return rows;
}

// Seed/refresh the global library from repo files (skills/*.md with
// frontmatter: name, description, industries?). Idempotent upsert keyed on
// name; called at worker boot. Repo files are the source of truth for
// curated skills — editing one and redeploying updates every customer.
const skillsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../skills"
);

export async function seedGlobalSkills(): Promise<number> {
  let files: string[];
  try {
    files = (await readdir(skillsDir)).filter((f) => f.endsWith(".md"));
  } catch {
    return 0; // no skills dir in this deploy — fine
  }
  let count = 0;
  for (const file of files) {
    const raw = await readFile(join(skillsDir, file), "utf8");
    const { data, content } = matter(raw);
    const name = typeof data.name === "string" ? data.name : file.replace(/\.md$/, "");
    const description = typeof data.description === "string" ? data.description : "";
    const industries = Array.isArray(data.industries)
      ? data.industries.filter((i: unknown): i is string => typeof i === "string")
      : [];
    if (!description) continue;
    await pool.query(
      `INSERT INTO skills (workspace_id, name, description, body, source, status, industries)
       VALUES (NULL, $1, $2, $3, 'curated', 'active', $4)
       ON CONFLICT (name) WHERE workspace_id IS NULL
       DO UPDATE SET description = EXCLUDED.description,
                     body = EXCLUDED.body,
                     industries = EXCLUDED.industries,
                     updated_at = NOW()`,
      [name, description.slice(0, 500), content.trim(), industries]
    );
    count += 1;
  }
  return count;
}
