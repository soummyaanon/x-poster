import { defineTool } from "eve/tools";
import { composeDraftsInputSchema, validateDrafts } from "../lib/drafts.ts";

export default defineTool({
  description:
    "Present the three final X drafts to the user — ONE of each format. Call exactly once, " +
    "after research. For each draft set `format`, `signal`, and an optional one-line `note`:\n" +
    "- format \"short\": a single post ≤280 chars in `text`.\n" +
    "- format \"long\": a long-form X post (~600–1500 chars) in `text`.\n" +
    "- format \"thread\": a `tweets` array of 3–6 connected posts, each ≤280 chars (no '1/' numbering).\n" +
    "`text`/`tweets` is the post body only — no preamble, numbering, or surrounding quotes. " +
    "Calling this tool IS how the user sees the drafts — never also print them as text.",
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
          over > 0 ? ` (${over} OVER LIMIT — shorten)` : ""
        }`;
      })
      .join("; ");
    return {
      type: "text",
      value: `Presented ${output.drafts.length} drafts: ${summary}.`,
    };
  },
});
