import { defineTool } from "eve/tools";
import { z } from "zod";
import { executeTwitter } from "../lib/composio.ts";
import { CREATE_POST_SLUG, extractTweet, isAllowedSlug, isWriteSlug } from "../lib/x_twitter.ts";
import { humanizeText } from "../lib/drafts.ts";

export default defineTool({
  description:
    "Run a single X (Twitter) action against the connected account. `slug` is a " +
    "Composio Twitter action (discover them with `x_find_tools`); `arguments` is that " +
    "action's input object.\n" +
    "Most common use is publishing a post: slug TWITTER_CREATION_OF_A_POST with " +
    "{ text }. Add quote_tweet_id to quote a post, or reply_in_reply_to_tweet_id to " +
    "reply. Publish ONLY a draft the user explicitly chose, and only what cleared the " +
    "quality bar. For a multi-tweet thread use `x_post_thread`, not this.\n" +
    "Anything that changes the account or posts publicly (post, reply, quote, delete, " +
    "like, retweet, follow, DM, list edits, mute/block) PAUSES for the user's approval " +
    "before it runs; pure reads (search, lookups, timeline, analytics) run immediately. " +
    "Report the real result: never claim a post went out if it did not.",
  inputSchema: z.object({
    slug: z
      .string()
      .describe("The Composio Twitter action slug, e.g. TWITTER_CREATION_OF_A_POST."),
    arguments: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("The action's input object. For a post: { text, quote_tweet_id?, reply_in_reply_to_tweet_id? }."),
  }),
  // Fail-safe: every write is gated; only known reads run without approval.
  needsApproval: ({ toolInput }) => isWriteSlug(toolInput?.slug ?? ""),
  async execute({ slug, arguments: args }) {
    if (!isAllowedSlug(slug)) {
      return {
        successful: false,
        error: `${slug} is not an allowed X action.`,
        tweet: null,
        data: {} as Record<string, unknown>,
      };
    }
    const finalArgs: Record<string, unknown> = { ...(args ?? {}) };
    // What goes live must match the humanized preview the user approved (no em dashes).
    if (slug === CREATE_POST_SLUG && typeof finalArgs.text === "string") {
      finalArgs.text = humanizeText(finalArgs.text);
    }
    const res = await executeTwitter(slug, finalArgs);
    // Only a freshly created post counts as "posted"; a lookup also carries a tweet id.
    const tweet = slug === CREATE_POST_SLUG && res.successful ? extractTweet(res.data) : null;
    return { successful: res.successful, error: res.error, tweet, data: res.data };
  },
  toModelOutput(output) {
    if (!output.successful) {
      return {
        type: "text",
        value: `X action failed: ${output.error ?? "unknown error"}. Do not claim it succeeded; tell the user it failed.`,
      };
    }
    if (output.tweet) {
      return { type: "text", value: `Posted to X: ${output.tweet.url}` };
    }
    // Reads (and writes with no tweet payload) hand their data back to the model.
    return { type: "json", value: output.data };
  },
});
