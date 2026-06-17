import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";

// Locks create_alert's dedup contract (mirrors the SQL in
// services/agent/tools/create-alert.ts): a new finding is suppressed if a
// similar OPEN or DISMISSED alert already exists, but a RESOLVED ("win") may
// recur. DB-backed, random-UUID workspace, never calls a paid LLM.

const ws = randomUUID();
const SIMILARITY_THRESHOLD = 0.55;

async function isDuplicate(title: string): Promise<{ matched: boolean; status?: string }> {
  const { rows } = await pool.query<{ title: string; status: string }>(
    `SELECT title, status FROM alerts
      WHERE workspace_id = $1 AND status IN ('open', 'dismissed')
        AND similarity(title, $2) > $3
      ORDER BY (status = 'open') DESC
      LIMIT 1`,
    [ws, title, SIMILARITY_THRESHOLD]
  );
  return { matched: rows.length > 0, status: rows[0]?.status };
}

async function seedAlert(title: string, status: string): Promise<void> {
  await pool.query(
    `INSERT INTO alerts (workspace_id, alert_type, severity, title, status)
     VALUES ($1, 'suggestion:risk', 'high', $2, $3)`,
    [ws, title, status]
  );
}

beforeAll(async () => {
  await pool.query("INSERT INTO workspaces (id, name) VALUES ($1, 'alert-dedup-test')", [ws]);
  await seedAlert("Customer concentration: Acme is 38% of revenue", "dismissed");
  await seedAlert("Vendor contract auto-renew is enabled", "resolved");
});

afterAll(async () => {
  await pool.query("DELETE FROM workspaces WHERE id = $1", [ws]);
  await pool.end();
});

describe("create_alert dedup", () => {
  it("suppresses a finding similar to a DISMISSED alert", async () => {
    const dup = await isDuplicate("Customer concentration risk — Acme is 38% of revenue");
    expect(dup.matched).toBe(true);
    expect(dup.status).toBe("dismissed");
  });

  it("allows a finding similar only to a RESOLVED alert (a fixed issue may recur)", async () => {
    const dup = await isDuplicate("Vendor contract auto-renew is enabled again");
    expect(dup.matched).toBe(false);
  });

  it("allows a genuinely new, dissimilar finding", async () => {
    const dup = await isDuplicate("Marketing spend has no attribution tracking");
    expect(dup.matched).toBe(false);
  });
});
