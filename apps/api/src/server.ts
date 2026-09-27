import { env } from "./env.js";
import { buildApp } from "./app.js";
import { pool } from "./db/client.js";
import { startEventBridge } from "./queue/events.js";
import { refreshLlmConfig, startLlmConfigRefresh } from "./services/llm/settings.js";

await refreshLlmConfig();
startLlmConfigRefresh();

const app = await buildApp();

// Workers run in a separate process — see src/worker.ts. In dev, run both:
//   pnpm --filter api dev          # this file
//   pnpm --filter api dev:worker   # worker.ts

// Bridge worker→API events (ingest status + agent run streams) across
// processes onto the local SSE buses.
const eventBridge = startEventBridge();

// Bind on the IPv6 wildcard so Node 20's fetch (which resolves "localhost"
// to ::1 first) can reach us. On Linux this dual-stacks IPv4 too.
const host = "::";

try {
  await app.listen({ port: env.PORT, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Bound the drain so open SSE streams can't make app.close() hang a deploy.
const SHUTDOWN_TIMEOUT_MS = 25_000;

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`received ${signal}, shutting down`);

  const watchdog = setTimeout(() => {
    app.log.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  watchdog.unref();

  try {
    await app.close();
    await eventBridge.quit();
    await pool.end();
    clearTimeout(watchdog);
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    clearTimeout(watchdog);
    process.exit(1);
  }
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
