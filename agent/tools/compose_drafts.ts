import { defineTool } from "eve/tools";
import { composeDraftsInputSchema, validateDrafts } from "../lib/drafts.ts";

export default defineTool({
  description:
    "Present the three final X post drafts to the user. Call this exactly once, " +
    "after research, with the three finished posts. Each `text` is the post body only " +
    "(no preamble, no numbering, no surrounding quotes). Tag each with the single " +
    "engagement `signal` it most targets. Optionally add a short `note` explaining the " +
    "angle. Calling this tool IS how the user sees the drafts — never also print them as text.",
  inputSchema: composeDraftsInputSchema,
  execute({ drafts }) {
    return { drafts: validateDrafts(drafts) };
  },
  toModelOutput(output) {
    const summary = output.drafts
      .map(
        (draft, index) =>
          `#${index + 1} ${draft.chars}/280${draft.over ? " (OVER LIMIT — shorten this one)" : ""} [${draft.signal}]`,
      )
      .join("; ");
    return {
      type: "text",
      value: `Presented ${output.drafts.length} drafts to the user: ${summary}.`,
    };
  },
});
