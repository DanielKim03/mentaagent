import { z } from "zod";
import { Parser } from "expr-eval";
import { registerTool } from "../registry.js";

// Sandboxed math via expr-eval: a real expression parser, no eval, no
// filesystem, no property access on host objects. LLMs are unreliable at
// arithmetic — every number in a finding should come through here or
// aggregate_table.

const parser = new Parser({
  operators: {
    logical: false,
    comparison: true,
    concatenate: false,
    assignment: false,
  },
});

registerTool({
  name: "run_calculation",
  description:
    "Evaluate a math expression exactly (margins, runway, ratios, growth rates). Supports + - * / ^ %, parentheses, and functions like sqrt, abs, round, min, max, log. Example: \"(48200 - 31000) / 48200 * 100\".",
  parameters: z.object({
    expression: z.string().min(1).max(500),
    note: z.string().optional().describe("What this calculation represents"),
  }),
  execute: async (args) => {
    try {
      const value = parser.evaluate(args.expression);
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
