import { EventEmitter } from "node:events";
import IORedis from "ioredis";
import { env } from "../env.js";

// Cross-process event bridge (worker → API → SSE subscribers).
//
// The API process owns the SSE streams; the worker runs agent loops and the
// ingest pipeline in a SEPARATE process, so it can't reach the API's
// in-memory emitter directly — it publishes to Redis and the API bridges
// those messages back onto a local bus. Best-effort: terminal states are
// also persisted to Postgres and the SSE endpoints re-read the DB as a
// fallback, so a transient publish failure won't strand a stream.

// --- Source ingest status (upload progress UX) -----------------------------

export type SourceStatusEvent = {
  sourceId: string;
  status: "pending" | "processing" | "processed" | "failed";
  message?: string;
  details?: Record<string, unknown>;
};

// --- Agent run events (live chat/report streaming) --------------------------

export type AgentEvent =
  | { type: "run.started"; runId: string }
  | { type: "assistant.delta"; runId: string; seq: number; delta: string }
  | {
      type: "tool.call";
      runId: string;
      seq: number;
      toolCallId: string;
      name: string;
      args: unknown;
    }
  | {
      type: "tool.result";
      runId: string;
      seq: number;
      toolCallId: string;
      name: string;
      result: string;
    }
  | { type: "cost.updated"; runId: string; costUsdMicros: number }
  | { type: "run.finished"; runId: string; content: string }
  | { type: "run.failed"; runId: string; error: string }
  | { type: "run.paused"; runId: string; reason: string };

class Bus extends EventEmitter {}

export const sourceEvents = new Bus();
sourceEvents.setMaxListeners(100);

export const agentEvents = new Bus();
agentEvents.setMaxListeners(200);

const SOURCE_CHANNEL = "source-status";
const AGENT_CHANNEL = "agent-events";

// Lazily-created publisher connection (worker side). Lazy so importing this
// module — e.g. in tests that never emit — doesn't open a Redis socket.
let publisher: IORedis | null = null;
function getPublisher(): IORedis {
  if (!publisher) {
    publisher = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    publisher.on("error", (err) =>
      console.error("[events] publisher error:", err)
    );
  }
  return publisher;
}

export function emitStatus(event: SourceStatusEvent): void {
  getPublisher()
    .publish(SOURCE_CHANNEL, JSON.stringify(event))
    .catch((err) => console.error("[events] publish failed:", err));
}

export function emitAgentEvent(event: AgentEvent): void {
  getPublisher()
    .publish(AGENT_CHANNEL, JSON.stringify(event))
    .catch((err) => console.error("[events] agent publish failed:", err));
}

// API-side bridge: subscribe to the Redis channels and re-emit each event
// onto the local buses that SSE subscribers listen on. Call once on API
// boot. Returns the subscriber connection so it can be closed on shutdown.
// A connection in subscribe mode can't issue other commands, so this is a
// dedicated connection.
export function startEventBridge(): IORedis {
  const sub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  sub.on("error", (err) => console.error("[events] subscriber error:", err));
  sub
    .subscribe(SOURCE_CHANNEL, AGENT_CHANNEL)
    .catch((err) => console.error("[events] subscribe failed:", err));
  sub.on("message", (channel, payload) => {
    try {
      if (channel === SOURCE_CHANNEL) {
        const event = JSON.parse(payload) as SourceStatusEvent;
        sourceEvents.emit(event.sourceId, event);
        sourceEvents.emit("*", event);
      } else if (channel === AGENT_CHANNEL) {
        const event = JSON.parse(payload) as AgentEvent;
        agentEvents.emit(event.runId, event);
        agentEvents.emit("*", event);
      }
    } catch (err) {
      console.error("[events] bad payload:", err);
    }
  });
  return sub;
}

// Close the lazily-created publisher (worker shutdown). No-op if never opened.
export async function closeEventPublisher(): Promise<void> {
  if (publisher) {
    await publisher.quit().catch(() => {});
    publisher = null;
  }
}
