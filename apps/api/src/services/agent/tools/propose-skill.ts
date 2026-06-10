import { z } from "zod";
import { proposeSkill } from "../../skills/store.js";
import { registerTool } from "../registry.js";

// Reflect runs only (run-kind whitelist). Proposals land in the owner's
// "Your analyst is learning" approval queue — the OpenClaw Skill Workshop
// pattern: the agent never silently changes its own playbooks.

registerTool({
  name: "propose_skill",
  description:
    "Propose a new (or improved) reusable analysis playbook for THIS business, learned from the conversation you reviewed. The owner approves proposals before they take effect. Prefer improving an existing playbook over creating a near-duplicate. Body is markdown: method, what good looks like, pitfalls specific to this business's data.",
  parameters: z.object({
    name: z
      .string()
      .describe("kebab-case identifier, e.g. seasonal-cashflow-check"),
    description: z.string().min(10).max(300).describe("One line: when to use this playbook"),
    body: z.string().min(50).max(15000),
  }),
  execute: async (args, ctx) => {
    const result = await proposeSkill({
      workspaceId: ctx.workspaceId,
      name: args.name,
      description: args.description,
      body: args.body,
      sourceRunId: ctx.runId,
    });
    return JSON.stringify(
      result.ok ? { proposed: args.name, pending_owner_approval: true } : result
    );
  },
});
