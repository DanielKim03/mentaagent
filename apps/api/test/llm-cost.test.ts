import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";
import { computeCostMicros } from "../src/services/llm/client.js";

// Locks the token → cost math (micros = millionths of USD). Pricing is in
// micros per MILLION tokens, so a full million tokens costs exactly the
// listed rate. Pure function — no DB, no paid LLM — but importing the client
// constructs the (lazy, unconnected) pg pool, so close it for a clean exit.

afterAll(async () => {
  await pool.end();
});

describe("computeCostMicros", () => {
  it("prices Hermes-4-70B input and output separately ($0.13 / $0.40 per M)", () => {
    expect(computeCostMicros("NousResearch/Hermes-4-70B", 1_000_000, 0)).toBe(130_000);
    expect(computeCostMicros("NousResearch/Hermes-4-70B", 0, 1_000_000)).toBe(400_000);
    expect(computeCostMicros("NousResearch/Hermes-4-70B", 1_000_000, 1_000_000)).toBe(530_000);
  });

  it("prices the heavy model Hermes-4-405B ($1 / $3 per M)", () => {
    expect(computeCostMicros("NousResearch/Hermes-4-405B", 1_000_000, 1_000_000)).toBe(4_000_000);
  });

  it("prices embeddings on input only (bge-m3 has no output cost)", () => {
    expect(computeCostMicros("BAAI/bge-m3", 1_000_000, 999)).toBe(10_000);
  });

  it("rounds sub-micro costs up so we never systematically under-bill", () => {
    // 1 prompt token on Hermes-4-70B = 0.13 micros → ceils to 1.
    expect(computeCostMicros("NousResearch/Hermes-4-70B", 1, 0)).toBe(1);
    expect(computeCostMicros("NousResearch/Hermes-4-70B", 0, 0)).toBe(0);
  });

  it("falls back to the costliest tier ($1 / $3 per M) for an unknown model", () => {
    expect(computeCostMicros("some/unconfigured-model", 1_000_000, 1_000_000)).toBe(4_000_000);
  });
});
