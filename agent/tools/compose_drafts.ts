import { defineTool } from "eve/tools";
import { composeDraftsInputSchema, validateDrafts } from "../lib/drafts.ts";

export default defineTool({
  description:
    "Present the final X drafts to the user. Call exactly once, after research. Produce 2-3 " +
    "drafts matched to the account tier given in this turn's context (accountTier).\n" +
    "PREMIUM tier: format \"single\" (one post, can run past 280, target ~200-600 chars) and " +
    "format \"long\" (a long-form post, ~600-1500 chars). Both go in `text`.\n" +
    "FREE tier: format \"short\" (one post, max 280 chars, in `text`) and format \"thread\" (a " +
    "`tweets` array of 3-6 connected posts, each max 280 chars, no '1/' numbering).\n" +
    "QUOTE mode (the user gave a post or link to react to): produce 2-3 format \"quote\" drafts, " +
    "each a take to post above the quoted post (max 280 chars, in `text`), and set top-level " +
    "`quoting` to the source URL or a short label.\n" +
    "For each draft set `format`, `signal`, and an optional one-line `note`. `text`/`tweets` is " +
    "the post body only: no preamble, numbering, or surrounding quotes. Never use em dashes. " +
    "Calling this tool IS how the user sees the drafts; never also print them as text.",
  inputSchema: composeDraftsInputSchema,
  execute({ drafts }) {
    return { drafts: validateDrafts(drafts) };
  },
  toModelOutput(output) {
    const summary = output.drafts
      .map((draft, index) => {
        const over = draft.units.filter((u) => u.over).length;
        const sizes = draft.units.map((u) => u.chars).join("/");
        return `#${index + 1} ${draft.format} [${draft.signal}] ${sizes}c${
          over > 0 ? ` (${over} OVER LIMIT, shorten)` : ""
        }`;
      })
      .join("; ");
    return {
      type: "text",
      value: `Presented ${output.drafts.length} drafts: ${summary}.`,
    };
  },
});
