import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Neutralizes real LLM keys from .env so tests use the stub provider and
    // never call a paid model (see test/setup.ts). Runs before env.ts loads.
    setupFiles: ["./test/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: "forks",
  },
});
