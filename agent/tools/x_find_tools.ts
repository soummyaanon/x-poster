import { defineTool } from "eve/tools";
import { never } from "eve/tools/approval";
import { z } from "zod";
import { findTwitterTools } from "../lib/composio.ts";

export default defineTool({
  description:
    "Discover which X (Twitter) actions are available before calling one. Pass a " +
    "free-text query for what you want to do (e.g. \"like a post\", \"search recent " +
    "tweets\", \"follow a user\", \"look up a user by username\") and get back the " +
    "matching action slugs with a short description of each. Then call `x_run_tool` " +
    "with the slug you want. Read-only: this never changes anything on X, so it runs " +
    "without approval. Posting a normal draft does NOT need this; for that just call " +
    "`x_run_tool` with TWITTER_CREATION_OF_A_POST (or `x_post_thread` for a thread).",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("What you want to do on X, in plain words. Used to search the action catalog."),
  }),
  needsApproval: never(),
  async execute({ query }) {
    const tools = await findTwitterTools(query);
    return { tools };
  },
  toModelOutput(output) {
    if (output.tools.length === 0) {
      return {
        type: "text",
        value:
          "No matching X actions found (or X is not configured). For a normal post, " +
          "call x_run_tool with slug TWITTER_CREATION_OF_A_POST.",
      };
    }
    const lines = output.tools.map((t) => `${t.slug}: ${t.description}`).join("\n");
    return { type: "text", value: `Matching X actions:\n${lines}` };
  },
});
