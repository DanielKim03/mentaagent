import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AgentContext, ToolDef } from "./types.js";

// Central tool registry. Tools self-register at import time (see tools/
// index.ts); the loop selects a per-run-kind subset by name (RUN_POLICY).

const tools = new Map<string, ToolDef<never>>();

export function registerTool<T>(tool: ToolDef<T>): void {
  if (tools.has(tool.name)) {
    throw new Error(`tool already registered: ${tool.name}`);
  }
  tools.set(tool.name, tool as unknown as ToolDef<never>);
}

export function getTools(names: string[]): ToolDef<never>[] {
  return names
    .map((n) => tools.get(n))
    .filter((t): t is ToolDef<never> => t !== undefined);
}

// OpenAI function-calling schema for a tool subset (also embedded in the
// system prompt in hermes-xml mode).
export function toolSchemas(
  defs: ToolDef<never>[]
): { type: "function"; function: { name: string; description: string; parameters: object } }[] {
  return defs.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.parameters, { $refStrategy: "none" }),
    },
  }));
}

// Tool results are truncated so one verbose tool can't blow the context
// budget; the hint teaches the model to page with offset params instead.
const MAX_RESULT_CHARS = 5_000;

export function truncateResult(result: string): string {
  if (result.length <= MAX_RESULT_CHARS) return result;
  return (
    result.slice(0, MAX_RESULT_CHARS) +
    "\n[truncated — result too long; use offset/limit parameters to read more]"
  );
}

const TOOL_TIMEOUT_MS = 30_000;

// Execute one tool call: validate args (zod), run with a timeout, never
// throw — errors become the tool result string so the model self-corrects.
// Returns { result, isError } so the loop can track consecutive failures.
export async function executeTool(
  def: ToolDef<never> | undefined,
  name: string,
  rawArgs: string,
  ctx: AgentContext
): Promise<{ result: string; isError: boolean }> {
  if (!def) {
    return {
      result: JSON.stringify({
        error: `unknown tool: ${name}. Available tools are listed in your tool definitions.`,
      }),
      isError: true,
    };
  }

  let parsed: unknown;
  try {
    parsed = rawArgs.trim() === "" ? {} : JSON.parse(rawArgs);
  } catch {
    return {
      result: JSON.stringify({
        error: "tool arguments were not valid JSON — re-send the call with a valid JSON object",
      }),
      isError: true,
    };
  }

  const validated = (def.parameters as z.ZodType).safeParse(parsed);
  if (!validated.success) {
    return {
      result: JSON.stringify({
        error: `invalid arguments: ${validated.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
      }),
      isError: true,
    };
  }

  try {
    const result = await Promise.race([
      def.execute(validated.data as never, ctx),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("tool timed out after 30s")), TOOL_TIMEOUT_MS)
      ),
    ]);
    return { result: truncateResult(result), isError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { result: JSON.stringify({ error: message }), isError: true };
  }
}
