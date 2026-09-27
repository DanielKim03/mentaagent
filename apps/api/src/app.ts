import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import { env } from "./env.js";
import { pool } from "./db/client.js";
import { registerAuthHook } from "./lib/auth.js";
import { BudgetExceededError } from "./services/llm/client.js";
import { alertsRoutes } from "./routes/alerts.js";
import { graphRoutes } from "./routes/graph.js";
import { memoryRoutes } from "./routes/memory.js";
import { notificationsRoutes } from "./routes/notifications.js";
import { reportsRoutes } from "./routes/reports.js";
import { runRoutes } from "./routes/runs.js";
import { sessionRoutes } from "./routes/sessions.js";
import { skillsRoutes } from "./routes/skills.js";
import { sourcesRoutes } from "./routes/sources.js";
import { settingsRoutes } from "./routes/settings.js";
import { workspaceRoutes } from "./routes/workspace.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['set-cookie']",
          "res.headers['set-cookie']",
        ],
        remove: true,
      },
    },
    genReqId: () => randomUUID(),
    trustProxy: true,
  });

  const allowedOrigins = new Set(env.WEB_ORIGIN);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, allowedOrigins.has(origin));
    },
    credentials: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  // Redis-backed limiter that fails open — a limiter outage must not become
  // an API outage (the API is network-private; auth rejects unknown pairs
  // cheaply). Dedicated fast-failing client, NOT the BullMQ connection.
  const rateLimitRedis = new IORedis(env.REDIS_URL, {
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  rateLimitRedis.on("error", (err) =>
    app.log.warn({ err }, "rate-limit redis error")
  );
  app.addHook("onClose", async () => {
    await rateLimitRedis.quit().catch(() => {});
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    redis: rateLimitRedis,
    skipOnError: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.get("/health", async () => {
    const { rows } = await pool.query<{ now: Date }>("SELECT NOW() as now");
    return { ok: true, db_time: rows[0].now };
  });

  await registerAuthHook(app);

  // BudgetExceededError → 402 (the optional LLM_DAILY_USD_CAP was hit).
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BudgetExceededError) {
      return reply.code(402).send({
        error: "budget_exceeded",
        scope: err.scope,
        used_usd: err.usedUsd,
        cap_usd: err.capUsd,
        message: err.message,
      });
    }
    reply.send(err);
  });

  await app.register(settingsRoutes);
  await app.register(sessionRoutes);
  await app.register(runRoutes);
  await app.register(sourcesRoutes);
  await app.register(reportsRoutes);
  await app.register(memoryRoutes);
  await app.register(skillsRoutes);
  await app.register(alertsRoutes);
  await app.register(notificationsRoutes);
  await app.register(graphRoutes);
  await app.register(workspaceRoutes);

  return app;
}
