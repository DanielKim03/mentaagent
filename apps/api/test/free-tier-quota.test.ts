import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";

// DB-backed test for the free-tier consumption gate (migration 008). Mirrors
// the atomic decrement/refund SQL used by the sessions route + runner so the
// "8 questions then blocked, refund on failure" contract is locked down.
// Random-UUID workspaces, cascade cleanup, never calls a paid LLM.

const created: string[] = [];

async function makeWorkspace(quota: number | null): Promise<string> {
  const id = randomUUID();
  created.push(id);
  await pool.query(
    "INSERT INTO workspaces (id, name, question_quota) VALUES ($1, 'quota-test', $2)",
    [id, quota]
  );
  return id;
}

// The exact gate from apps/api/src/routes/sessions.ts: returns true if a
// question was available (and was decremented), false if blocked.
async function askQuestion(workspaceId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE workspaces
        SET question_quota = CASE
              WHEN question_quota IS NULL THEN NULL
              ELSE question_quota - 1 END
      WHERE id = $1 AND (question_quota IS NULL OR question_quota > 0)
      RETURNING TRUE AS ok`,
    [workspaceId]
  );
  return rows.length > 0;
}

async function refundQuestion(workspaceId: string): Promise<void> {
  await pool.query(
    `UPDATE workspaces SET question_quota = question_quota + 1
      WHERE id = $1 AND question_quota IS NOT NULL`,
    [workspaceId]
  );
}

afterAll(async () => {
  if (created.length) {
    await pool.query("DELETE FROM workspaces WHERE id = ANY($1)", [created]);
  }
  await pool.end();
});

describe("free-tier question quota", () => {
  it("gives brand-new (free) workspaces the migration-008 defaults", async () => {
    const id = randomUUID();
    created.push(id);
    // A bare insert — the path web signup takes — relies on column defaults.
    await pool.query("INSERT INTO workspaces (id, name) VALUES ($1, 'defaults-test')", [id]);
    const { rows } = await pool.query<{
      plan: string;
      question_quota: number | null;
      source_upload_quota: number | null;
    }>(
      "SELECT plan, question_quota, source_upload_quota FROM workspaces WHERE id = $1",
      [id]
    );
    expect(rows[0].plan).toBe("free");
    expect(rows[0].question_quota).toBe(8);
    expect(rows[0].source_upload_quota).toBe(4);
  });

  it("allows exactly N questions, then blocks", async () => {
    const id = await makeWorkspace(2);
    expect(await askQuestion(id)).toBe(true); // 2 -> 1
    expect(await askQuestion(id)).toBe(true); // 1 -> 0
    expect(await askQuestion(id)).toBe(false); // blocked
  });

  it("refunds a question (e.g. on a failed run) so it can be re-asked", async () => {
    const id = await makeWorkspace(1);
    expect(await askQuestion(id)).toBe(true); // 1 -> 0
    expect(await askQuestion(id)).toBe(false); // blocked
    await refundQuestion(id); // 0 -> 1
    expect(await askQuestion(id)).toBe(true); // available again
  });

  it("treats NULL quota as unlimited and never decrements it", async () => {
    const id = await makeWorkspace(null);
    for (let i = 0; i < 5; i++) expect(await askQuestion(id)).toBe(true);
    await refundQuestion(id); // no-op when NULL
    const { rows } = await pool.query<{ question_quota: number | null }>(
      "SELECT question_quota FROM workspaces WHERE id = $1",
      [id]
    );
    expect(rows[0].question_quota).toBeNull();
  });
});
