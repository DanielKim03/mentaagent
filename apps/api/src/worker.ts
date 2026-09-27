import { env } from "./env.js";
import * as Sentry from "@sentry/node";

if (env.SENTRY_DSN && env.NODE_ENV === "production") {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0,
  });
}

import { Queue, Worker } from "bullmq";
import { pool } from "./db/client.js";
import { closeEventPublisher, emitStatus } from "./queue/events.js";
import {
  AGENT_QUEUE,
  INGEST_QUEUE,
  redisConnection,
  type AgentJobData,
  type IngestJobData,
} from "./queue/queue.js";
import { handleAgentJob } from "./services/agent/runner.js";
import { processSource } from "./services/ingestion/pipeline.js";
import {
  backfillEntities,
  enqueueNewDataReview,
  sweepConsolidation,
  sweepEmbedBackfill,
  sweepIdleSessions,
  sweepMonitorRuns,
  sweepScheduledReports,
} from "./services/monitor/schedule.js";
import { runImminentAlertSweep } from "./services/notify/imminent.js";
import { seedGlobalSkills } from "./services/skills/store.js";
import { llmConfig, refreshLlmConfig, startLlmConfigRefresh } from "./services/llm/settings.js";

// The worker process: ingest jobs, agent runs, and the maintenance tick.
// Deployed as its own service (separate from the API) — events cross back
// over Redis pub/sub.

// --- ingest ------------------------------------------------------------------

const ingestWorker = new Worker<IngestJobData>(
  INGEST_QUEUE,
  async (job) => {
    const { sourceId, workspaceId } = job.data;
    await pool.query("UPDATE sources SET status = 'processing' WHERE id = $1", [
      sourceId,
    ]);
    emitStatus({ sourceId, status: "processing" });
    try {
      const result = await processSource({ sourceId, workspaceId });
      await pool.query(
        "UPDATE sources SET status = 'processed', processed_at = NOW() WHERE id = $1",
        [sourceId]
      );
      emitStatus({
        sourceId,
        status: "processed",
        message: result.summary,
        details: result.details,
      });
      // Proactively review the freshly added data for crucial fixes (files
      // alerts, deduped against open + dismissed). Best-effort: a failure here
      // must not fail the ingest.
      await enqueueNewDataReview(workspaceId).catch((err) =>
        console.error("[ingest] new-data review enqueue failed:", err)
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await pool.query(
        "UPDATE sources SET status = 'failed', metadata = metadata || $2::jsonb WHERE id = $1",
        [sourceId, JSON.stringify({ error: message })]
      );
      // Refund the quota slot ONCE, after all retries are exhausted, so a
      // failure the user didn't cause doesn't burn a scarce slot.
      const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await pool.query(
          `UPDATE workspaces
              SET source_upload_quota = source_upload_quota + 1
            WHERE id = $1 AND source_upload_quota IS NOT NULL`,
          [workspaceId]
        );
      }
      emitStatus({ sourceId, status: "failed", message });
      throw err;
    }
  },
  { connection: redisConnection, concurrency: 4 }
);
ingestWorker.on("error", (err) => console.error("[ingest worker] error:", err));

// --- agent runs ----------------------------------------------------------------

const agentWorker = new Worker<AgentJobData>(
  AGENT_QUEUE,
  async (job) => handleAgentJob(job.data),
  { connection: redisConnection, concurrency: 4 }
);
agentWorker.on("error", (err) => console.error("[agent worker] error:", err));

// --- maintenance tick (idle reflect, monitor fan-out, consolidation, backfill) --

const MAINTENANCE_QUEUE = "maintenance";
const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, {
  connection: redisConnection,
});

const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE,
  async () => {
    const [reflected, monitored, consolidated, embedded, entities, reports, notified] =
      await Promise.all([
        sweepIdleSessions(),
        sweepMonitorRuns(),
        sweepConsolidation(),
        sweepEmbedBackfill(),
        backfillEntities(),
        sweepScheduledReports(),
        runImminentAlertSweep(),
      ]);
    if (reflected || monitored || consolidated || embedded || entities || reports || notified.emailed) {
      console.log(
        `[maintenance] reflect=${reflected} monitor=${monitored} consolidate=${consolidated} embed=${embedded} entities=${entities} reports=${reports} alert-emails=${notified.emailed}`
      );
    }
  },
  { connection: redisConnection, concurrency: 1 }
);
maintenanceWorker.on("error", (err) =>
  console.error("[maintenance worker] error:", err)
);

async function ensureMaintenanceSchedule(): Promise<void> {
  await maintenanceQueue.upsertJobScheduler("maintenance-tick", {
    every: 15 * 60 * 1000, // 15 minutes
  });
}

// --- boot ------------------------------------------------------------------------

const seeded = await seedGlobalSkills();
if (seeded > 0) console.log(`[skills] seeded ${seeded} global skills`);
await ensureMaintenanceSchedule();
console.log("[worker] started: ingest + agent + maintenance");
// Model settings saved in the web app reach this process within seconds.
await refreshLlmConfig();
startLlmConfigRefresh();
{
  const c = llmConfig();
  console.log(
    `[llm] base=${c.baseUrl} model=${c.agentModel} ` +
      `key=${c.apiKey ? "set" : "<unset → stub>"}`
  );
  // Host only (no credentials): confirms DB/Redis are on the internal Railway
  // network (…railway.internal) vs the slower public proxy (…proxy.rlwy.net).
  const host = (u: string) => {
    try {
      return new URL(u).host;
    } catch {
      return "?";
    }
  };
  console.log(`[infra] db=${host(env.DATABASE_URL)} redis=${host(env.REDIS_URL)}`);
}

// --- graceful shutdown (drain in-flight jobs under Railway's SIGKILL window) ----

const SHUTDOWN_TIMEOUT_MS = 25_000;
let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] received ${signal}, draining`);
  const watchdog = setTimeout(() => {
    console.error("[worker] shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  watchdog.unref();
  try {
    await Promise.all([
      ingestWorker.close(),
      agentWorker.close(),
      maintenanceWorker.close(),
    ]);
    await maintenanceQueue.close();
    await closeEventPublisher();
    await redisConnection.quit().catch(() => {});
    await pool.end();
    clearTimeout(watchdog);
    process.exit(0);
  } catch (err) {
    console.error(err);
    clearTimeout(watchdog);
    process.exit(1);
  }
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
