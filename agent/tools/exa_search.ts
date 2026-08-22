import { defineTool } from "eve/tools";
import { exaSearchInputSchema, searchExa } from "../lib/exa.ts";

interface ExaToolResult {
  readonly ok: boolean;
  readonly failure?: "unauthorized" | "rate-limited" | "unavailable";
  readonly message?: string;
  readonly results: readonly { title: string; url: string; published?: string; evidence: string }[];
  readonly synthesis?: unknown;
}

export default defineTool({
  description:
    "Primary research search. Call it when the drafts need fresh or checkable information: " +
    "news, a trending angle, a specific fact/number/quote headed for a post, or a premise you " +
    "only half know. Skip it when the user supplied the material, a revision leaves the facts " +
    "alone, or this session already verified the claim; a checkable specific still never goes " +
    "in a draft unverified. Depth follows this turn's register.\n" +
    "SENSIBLE: a deep, grounded search that returns a source-backed synthesis. Run 2-3 distinct " +
    "queries with different angles, then web_fetch the 2+ most promising URLs and actually read " +
    "them. Research rigor is unchanged.\n" +
    "RAGEBAIT: the same deep search as sensible, not the shitpost fast path. A rage-bait post " +
    "gets fact-checked in the replies, so an unverified premise is how it turns into a ratio and " +
    "a Community Note instead of an argument worth having.\n" +
    "SHITPOST: a fast search that returns highlights from 5 results. Run 1-2 queries; no " +
    "mandatory fetch. It still exists to confirm the premise is REAL before you joke about it.\n" +
    "Set `register` to this turn's `register.id`. If this tool reports a failure, fall back to " +
    "the built-in `web_search` and say in your message that you fell back. Never draft from " +
    "memory on a research failure, in any register.",
  inputSchema: exaSearchInputSchema,
  async execute({ query, register, includeDomains, excludeDomains }): Promise<ExaToolResult> {
    const outcome = await searchExa(query, register, { includeDomains, excludeDomains });
    if (outcome.kind !== "ok") {
      return { ok: false, failure: outcome.kind, message: outcome.message, results: [] };
    }
    return { ok: true, results: outcome.results, synthesis: outcome.synthesis };
  },
  toModelOutput(output: ExaToolResult) {
    if (!output.ok) {
      return {
        type: "text" as const,
        value:
          `Exa search FAILED (${output.failure}): ${output.message ?? "no detail"} ` +
          "Fall back to the built-in web_search for this query and tell the user you fell back. " +
          "Do not draft from memory.",
      };
    }
    if (output.results.length === 0) {
      return {
        type: "text" as const,
        value:
          "Exa returned no results for that query. Try a different angle, or fall back to " +
          "web_search. Do not draft from memory.",
      };
    }
    const lines = output.results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   ${r.url}${r.published ? ` (${r.published})` : ""}\n   ${r.evidence}`,
      )
      .join("\n");
    const synthesis = output.synthesis
      ? `\n\nGrounded synthesis:\n${JSON.stringify(output.synthesis)}`
      : "";
    return {
      type: "text" as const,
      value: `${output.results.length} results:\n${lines}${synthesis}`,
    };
  },
});
