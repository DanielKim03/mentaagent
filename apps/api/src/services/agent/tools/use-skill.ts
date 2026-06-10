import { z } from "zod";
import { getSkillBody } from "../../skills/store.js";
import { registerTool } from "../registry.js";

// Progressive disclosure: the system prompt carries only the skills catalog
// (name + description); this tool fetches a full playbook on demand and
// records usage telemetry (feeds the curator).

registerTool({
  name: "use_skill",
  description:
    "Fetch the full text of an analysis playbook from the skills catalog (listed in your instructions). Read the playbook BEFORE performing that type of analysis.",
  parameters: z.object({
    name: z.string().min(1),
  }),
  execute: async (args, ctx) => {
    const body = await getSkillBody(ctx.workspaceId, args.name);
    if (!body) {
      return JSON.stringify({
        error: `no active skill named "${args.name}" — use a name from the catalog in your instructions`,
      });
    }
    return body;
  },
});
