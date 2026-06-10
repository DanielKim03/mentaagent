import { z } from "zod";
import {
  addMemory,
  MEMORY_CATEGORIES,
  MemoryBudgetError,
  removeMemory,
  replaceMemory,
  type MemoryCategory,
} from "../../memory/store.js";
import { registerTool } from "../registry.js";

// Hermes-style memory tool: add / replace / remove, no read (memory is
// injected into the system prompt). Hard per-category char budgets push the
// agent toward consolidation instead of unbounded appending.

registerTool({
  name: "remember",
  description:
    "Persist durable knowledge about this business across all future conversations. Categories: business_facts (facts beyond the profile), owner_preferences (how they like to work), advisor_notes (lessons on analyzing THIS business's data), open_loops (commitments/pending outcomes to follow up on, with a due date when known). Use replace/remove to keep memory lean — each category has a size budget.",
  parameters: z.object({
    action: z.enum(["add", "replace", "remove"]),
    category: z.enum(MEMORY_CATEGORIES as [MemoryCategory, ...MemoryCategory[]]),
    content: z
      .string()
      .max(500)
      .optional()
      .describe("The fact to store (required for add/replace). One concise sentence."),
    old_text: z
      .string()
      .optional()
      .describe("Distinctive substring of the existing entry (required for replace/remove)"),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("For open_loops: when to follow up (YYYY-MM-DD)"),
  }),
  execute: async (args, ctx) => {
    try {
      switch (args.action) {
        case "add": {
          if (!args.content) return JSON.stringify({ error: "content is required for add" });
          await addMemory({
            workspaceId: ctx.workspaceId,
            category: args.category,
            content: args.content,
            dueAt: args.due_date ? `${args.due_date}T12:00:00Z` : null,
            sourceRunId: ctx.runId,
          });
          return JSON.stringify({ saved: true });
        }
        case "replace": {
          if (!args.content || !args.old_text) {
            return JSON.stringify({ error: "replace requires both old_text and content" });
          }
          const { replaced } = await replaceMemory({
            workspaceId: ctx.workspaceId,
            category: args.category,
            oldText: args.old_text,
            content: args.content,
            sourceRunId: ctx.runId,
          });
          return JSON.stringify(
            replaced
              ? { replaced: true }
              : { error: `no ${args.category} entry matches "${args.old_text}"` }
          );
        }
        case "remove": {
          if (!args.old_text) return JSON.stringify({ error: "remove requires old_text" });
          const { removed } = await removeMemory({
            workspaceId: ctx.workspaceId,
            category: args.category,
            oldText: args.old_text,
          });
          return JSON.stringify(
            removed
              ? { removed: true }
              : { error: `no ${args.category} entry matches "${args.old_text}"` }
          );
        }
      }
    } catch (err) {
      if (err instanceof MemoryBudgetError) {
        return JSON.stringify({ error: err.message });
      }
      throw err;
    }
  },
});
