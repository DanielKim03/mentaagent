import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";
import { MAX_OPEN_ALERTS } from "../src/services/agent/tools/create-alert.js";

// Locks the global open-alert ceiling in create_alert: once the workspace is
// at MAX_OPEN_ALERTS open, non-critical findings are held back but critical
// ones still get through. Mirrors the count+severity gate in the tool.
// DB-backed, random-UUID workspace, no paid LLM.

const ws = randomUUID();

// The tool's decision for a new finding of `severity`, given current open count.
function wouldFile(openCount: number, severity: string): boolean {
  if (severity === "critical") return true;
  return openCount < MAX_OPEN_ALERTS;
}

async function openCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM alerts WHERE workspace_id = $1 AND status = 'open'",
    [ws]
  );
  return Number(rows[0].n);
}

beforeAll(async () => {
  await pool.query("INSERT INTO workspaces (id, name) VALUES ($1, 'alert-cap-test')", [ws]);
  // Fill the backlog exactly to the ceiling.
  const values = Array.from({ length: MAX_OPEN_ALERTS }, (_, i) =>
    `($1, 'suggestion:risk', 'medium', 'Open backlog item ${i}', 'open')`
  ).join(", ");
  await pool.query(
    `INSERT INTO alerts (workspace_id, alert_type, severity, title, status) VALUES ${values}`,
    [ws]
  );
});

afterAll(async () => {
  await pool.query("DELETE FROM workspaces WHERE id = $1", [ws]);
  await pool.end();
});

describe("create_alert global open-alert cap", () => {
  it("is at the ceiling after seeding", async () => {
    expect(await openCount()).toBe(MAX_OPEN_ALERTS);
  });

  it("holds back medium/high findings once the backlog is full", async () => {
    const n = await openCount();
    expect(wouldFile(n, "medium")).toBe(false);
    expect(wouldFile(n, "high")).toBe(false);
  });

  it("still lets a critical finding through at the ceiling", async () => {
    expect(wouldFile(await openCount(), "critical")).toBe(true);
  });

  it("accepts non-critical findings again below the ceiling", () => {
    expect(wouldFile(MAX_OPEN_ALERTS - 1, "medium")).toBe(true);
  });
});
