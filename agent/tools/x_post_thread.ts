import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { executeTwitter } from "../lib/composio.ts";
import { postThread } from "../lib/x_twitter.ts";

export default defineTool({
  description:
    "Publish a thread to X: a list of connected posts, each posted as a reply to the " +
    "one before it. Use this for a `thread` draft instead of calling TWITTER_CREATION_OF_A_POST " +
    "yourself per tweet. `tweets` is the post bodies in order (2+, each <= 280 chars, no " +
    "\"1/\" numbering); optional `replyToId` makes the whole thread a reply to an existing " +
    "tweet. The entire thread is published under ONE approval. If a tweet fails partway, " +
    "posting stops and you are told exactly which tweets went out, so report that honestly " +
    "and never imply the whole thread posted. Publish only a thread draft the user chose.",
  inputSchema: z.object({
    tweets: z
      .array(z.string().min(1))
      .min(2)
      .describe("The tweet bodies in order. Each <= 280 chars, no numbering, post text only."),
    replyToId: z
      .string()
      .optional()
      .describe("Optional id of an existing tweet to start the thread as a reply to."),
  }),
  needsApproval: always(),
  async execute({ tweets, replyToId }) {
    return await postThread(tweets, { replyToId }, executeTwitter);
  },
  toModelOutput(output) {
    if (output.failedAt !== undefined) {
      const posted = output.posted.map((p) => p.url).join(", ") || "none";
      return {
        type: "text",
        value:
          `Thread only partially posted. Tweet #${output.failedAt + 1} failed: ` +
          `${output.error ?? "unknown error"}. Tweets that DID go out: ${posted}. ` +
          "Tell the user the thread is incomplete and stopped at that tweet; do not retry blindly.",
      };
    }
    const first = output.posted[0]?.url ?? "(unknown)";
    return {
      type: "text",
      value: `Thread posted: ${output.posted.length} tweets. First tweet: ${first}`,
    };
  },
});
