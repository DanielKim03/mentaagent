import { afterAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";
import { parseImage } from "../src/services/ingestion/parsers/image.js";
import { imageMime } from "../src/services/ingestion/parse.js";

// Hermetic: no DB rows, no network, no paid LLM. Importing the parser
// constructs the (lazy, unconnected) pg pool, so close it for a clean exit —
// same pattern as llm-cost.test.ts.

afterAll(async () => {
  await pool.end();
});

describe("image ingest", () => {
  it("maps image extensions to the right MIME type", () => {
    expect(imageMime("jpg")).toBe("image/jpeg");
    expect(imageMime("JPEG")).toBe("image/jpeg");
    expect(imageMime("png")).toBe("image/png");
    expect(imageMime("webp")).toBe("image/webp");
  });

  it("rejects an oversized image before any vision/network call", async () => {
    // 13 MB exceeds the 12 MB cap. Regardless of whether a vision key happens
    // to be configured in this env, parseImage must reject — either at the
    // "not configured" guard or the byte-cap guard, both of which run BEFORE
    // the provider call. This keeps the suite paid-LLM-free either way.
    const huge = Buffer.alloc(13 * 1024 * 1024, 0);
    await expect(
      parseImage("00000000-0000-0000-0000-000000000000", huge, "image/png")
    ).rejects.toThrow(/not configured|too large/);
  });
});
