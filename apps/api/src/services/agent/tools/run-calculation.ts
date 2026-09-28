import { z } from "zod";
import { evaluateMath } from "./math.js";
import { registerTool } from "../registry.js";

// Math through a small arithmetic evaluator (./math.ts): numbers,
// operators and a fixed list of functions, nothing else. The expression
// comes from the model, which reads uploaded documents, so it is untrusted.
// LLMs are unreliable at arithmetic — every number in a finding should come
// through here or aggregate_table.
registerTool({
  name: "run_calculation",
  description:
    "Evaluate a math expression exactly (margins, runway, ratios, growth rates). Supports + - * / ^ %, parentheses, PI, E and the functions sqrt, abs, round(x, digits), floor, ceil, min, max, sum, avg, log (natural), log10, exp, pow. Dates written YYYY-MM-DD count as days, so 2026-09-28 - 2025-11-29 gives the days between two dates. Example: \"(48200 - 31000) / 48200 * 100\".",
  parameters: z.object({
    expression: z.string().min(1).max(500),
    note: z.string().optional().describe("What this calculation represents"),
  }),
  execute: async (args) => {
    try {
      const value = evaluateMath(args.expression);
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return JSON.stringify({ error: "expression did not produce a finite number" });
      }
      return JSON.stringify({
        expression: args.expression,
        result: value,
        ...(args.note ? { note: args.note } : {}),
      });
    } catch (err) {
      return JSON.stringify({
        error: `could not evaluate: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
});
