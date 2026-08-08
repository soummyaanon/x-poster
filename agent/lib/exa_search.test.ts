// Lives in lib/, not tools/, because eve registers every .ts under agent/tools/
// as a tool.
import { describe, expect, it } from "vitest";
import exaSearch from "../tools/exa_search.ts";
import { exaSearchInputSchema } from "./exa";

describe("exa_search input", () => {
  it("accepts a query and defaults the register to sensible", () => {
    expect(exaSearchInputSchema.parse({ query: "a16z seed round" }).register).toBe("sensible");
    expect(exaSearchInputSchema.parse({ query: "q", register: "shitpost" }).register).toBe(
      "shitpost",
    );
  });

  it("rejects an empty query and an unknown register", () => {
    expect(exaSearchInputSchema.safeParse({ query: "" }).success).toBe(false);
    expect(exaSearchInputSchema.safeParse({ query: "q", register: "spicy" }).success).toBe(false);
  });
});

describe("exa_search model output", () => {
  // toModelOutput is optional on ToolDefinition; this tool always defines it.
  const render = (output: Parameters<NonNullable<typeof exaSearch.toModelOutput>>[0]) =>
    exaSearch.toModelOutput!(output) as { type: "text"; value: string };

  it("tells the model to fall back to web_search when Exa is unauthorized", () => {
    const summary = render({
      ok: false,
      failure: "unauthorized",
      message: "Exa key invalid or rotated.",
      results: [],
    });
    expect(summary.value).toContain("web_search");
    expect(summary.value).toContain("invalid or rotated");
  });

  it("never lets a failure read like a clean empty result", () => {
    const summary = render({
      ok: false,
      failure: "rate-limited",
      message: "Exa rate limited the request.",
      results: [],
    });
    expect(summary.value).not.toMatch(/^No results/i);
    expect(summary.value).toContain("Do not draft from memory");
  });

  it("renders results with url and evidence so the model can cite them", () => {
    const summary = render({
      ok: true,
      results: [{ title: "A16z leads round", url: "https://a.test", evidence: "raised 475m" }],
    });
    expect(summary.value).toContain("https://a.test");
    expect(summary.value).toContain("raised 475m");
  });
});
