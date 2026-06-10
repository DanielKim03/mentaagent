import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../env.js";

// BullMQ requires `maxRetriesPerRequest: null` on the underlying connection.
export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// --- Ingest: parse + chunk + embed an uploaded source --------------------

export type IngestJobData = {
  sourceId: string;
  workspaceId: string;
};

export const INGEST_QUEUE = "ingest";

export const ingestQueue = new Queue<IngestJobData>(INGEST_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// --- Agent: execute one agent run (chat turn, report, monitor, reflect) ---

export type AgentJobData = {
  runId: string;
  workspaceId: string;
};

export const AGENT_QUEUE = "agent";

// Agent runs are NOT retried automatically: the loop persists every message,
// so a failed run is resumable explicitly (a retry enqueues a continuation),
// and auto-retry of an LLM loop could double-spend the cost cap.
export const agentQueue = new Queue<AgentJobData>(AGENT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});
