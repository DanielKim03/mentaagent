import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";
import {
  duePhrase,
  NOTIFY_WINDOW_DAYS,
  OVERDUE_GRACE_DAYS,
} from "../src/services/notify/imminent.js";

// Locks which alerts the imminent-email sweep selects (mirrors the claim WHERE
// in services/notify/imminent.ts, scoped to one workspace so it's safe under
// parallel test files), plus the human due-date phrasing. No paid LLM/email.

const ws = randomUUID();

// Mirror of claimDueAlerts's predicate, scoped to this test's workspace.
async function dueIds(): Promise<Set<string>> {
  const { rows } = await pool.query<{ id: string; label: string }>(
    `SELECT id, title AS label FROM alerts
      WHERE workspace_id = $1
        AND status = 'open'
        AND notified_at IS NULL
        AND due_at IS NOT NULL
        AND due_at >= NOW() - make_interval(days => $2)
        AND due_at <= NOW() + make_interval(days => $3)`,
    [ws, OVERDUE_GRACE_DAYS, NOTIFY_WINDOW_DAYS]
  );
  return new Set(rows.map((r) => r.label));
}

beforeAll(async () => {
  await pool.query("INSERT INTO workspaces (id, name) VALUES ($1, 'imminent-test')", [ws]);
  await pool.query(
    `INSERT INTO alerts (workspace_id, alert_type, severity, title, status, due_at, notified_at) VALUES
       ($1, 'suggestion:risk', 'high', 'within-window',  'open',      NOW() + INTERVAL '2 days', NULL),
       ($1, 'suggestion:risk', 'high', 'too-far',        'open',      NOW() + INTERVAL '10 days', NULL),
       ($1, 'suggestion:risk', 'high', 'long-overdue',   'open',      NOW() - INTERVAL '5 days', NULL),
       ($1, 'suggestion:risk', 'high', 'recently-overdue','open',     NOW() - INTERVAL '1 days', NULL),
       ($1, 'suggestion:risk', 'high', 'no-due-date',    'open',      NULL, NULL),
       ($1, 'suggestion:risk', 'high', 'dismissed-soon', 'dismissed', NOW() + INTERVAL '1 days', NULL),
       ($1, 'suggestion:risk', 'high', 'already-emailed','open',      NOW() + INTERVAL '1 days', NOW())`,
    [ws]
  );
});

afterAll(async () => {
  await pool.query("DELETE FROM workspaces WHERE id = $1", [ws]);
  await pool.end();
});

describe("imminent-alert selection", () => {
  it("selects only open, dated, un-notified alerts inside the window", async () => {
    const ids = await dueIds();
    expect(ids.has("within-window")).toBe(true);
    expect(ids.has("recently-overdue")).toBe(true); // within the overdue grace
    expect(ids.has("too-far")).toBe(false); // beyond the notify window
    expect(ids.has("long-overdue")).toBe(false); // beyond the overdue grace
    expect(ids.has("no-due-date")).toBe(false); // undated never emails
    expect(ids.has("dismissed-soon")).toBe(false); // not open
    expect(ids.has("already-emailed")).toBe(false); // notified_at already set
    expect(ids.size).toBe(2);
  });
});

describe("duePhrase", () => {
  const now = new Date("2026-06-17T12:00:00Z");
  it("phrases upcoming and overdue deadlines", () => {
    expect(duePhrase(new Date("2026-06-17T15:00:00Z"), now)).toBe("due today");
    expect(duePhrase(new Date("2026-06-18T12:00:00Z"), now)).toBe("due tomorrow");
    expect(duePhrase(new Date("2026-06-20T12:00:00Z"), now)).toBe("due in 3 days");
    expect(duePhrase(new Date("2026-06-16T12:00:00Z"), now)).toBe("overdue by 1 day");
    expect(duePhrase(new Date("2026-06-14T12:00:00Z"), now)).toBe("overdue by 3 days");
  });
});
