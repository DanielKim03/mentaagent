import { z } from "zod";
import { loadWorkspaceProfile } from "../prompts.js";
import { registerTool } from "../registry.js";

registerTool({
  name: "get_business_profile",
  description:
    "The owner's onboarding profile: industry, business model, team size, revenue band, stated goals and pains.",
  parameters: z.object({}),
  execute: async (_args, ctx) => {
    const profile = await loadWorkspaceProfile(ctx.workspaceId);
    return JSON.stringify(
      { business: profile.name, ...profile.business_profile },
      null,
      2
    );
  },
});
