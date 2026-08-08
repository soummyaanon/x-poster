import { describe, expect, it, vi } from "vitest";
import { buildExaRequest, exaSearchInputSchema, normalizeExaResults, searchExa } from "./exa";

describe("buildExaRequest", () => {
  it("uses deep search with a grounded synthesis contract under sensible", () => {
    const req = buildExaRequest("ai coding agents", "sensible");
    expect(req.type).toBe("deep");
    expect(req.systemPrompt).toBeDefined();
    expect(req.outputSchema).toBeDefined();
    expect(req.contents.text).toBeTruthy();
  });

  it("uses fast search with highlights only under shitpost", () => {
    const req = buildExaRequest("a16z seed round", "shitpost");
    expect(req.type).toBe("fast");
    expect(req.numResults).toBe(5);
    expect(req.contents.highlights).toBeTruthy();
    expect(req.contents.text).toBeUndefined();
    expect(req.outputSchema).toBeUndefined();
  });

  it("defaults to the sensible depth", () => {
    expect(buildExaRequest("q").type).toBe("deep");
  });

  it("asks for a fresh crawl rather than the deprecated livecrawl flag", () => {
    const req = buildExaRequest("q", "shitpost");
    expect(req.contents.maxAgeHours).toBe(0);
    expect(req).not.toHaveProperty("useAutoprompt");
    expect(req).not.toHaveProperty("includeUrls");
  });

  it("passes domain filters through", () => {
    const req = buildExaRequest("q", "sensible", { includeDomains: ["arxiv.org"] });
    expect(req.includeDomains).toEqual(["arxiv.org"]);
  });

  it("keeps the deep outputSchema within Exa's limits (depth 2, 10 properties)", () => {
    const schema = buildExaRequest("q", "sensible").outputSchema as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties).length).toBeLessThanOrEqual(10);
    for (const value of Object.values(schema.properties)) {
      const prop = value as { type: string; items?: { type: string; properties?: unknown } };
      if (prop.items) expect(prop.items.properties).toBeUndefined(); // depth 2 max
    }
  });
});

describe("normalizeExaResults", () => {
  it("prefers highlights, then summary, then trimmed text as evidence", () => {
    const out = normalizeExaResults({
      results: [
        { url: "https://a.test", title: "A", highlights: ["hl one", "hl two"] },
        { url: "https://b.test", title: "B", summary: "the summary" },
        { url: "https://c.test", title: "C", text: "x".repeat(2000) },
      ],
    });
    expect(out[0].evidence).toContain("hl one");
    expect(out[1].evidence).toBe("the summary");
    expect(out[2].evidence.length).toBeLessThanOrEqual(1200);
  });

  it("survives a payload with no results", () => {
    expect(normalizeExaResults({})).toEqual([]);
    expect(normalizeExaResults(null)).toEqual([]);
  });

  it("drops entries with no url", () => {
    expect(normalizeExaResults({ results: [{ title: "no url" }] })).toEqual([]);
  });
});

describe("exaSearchInputSchema", () => {
  it("defaults the register to sensible and requires a query", () => {
    expect(exaSearchInputSchema.parse({ query: "q" }).register).toBe("sensible");
    expect(exaSearchInputSchema.safeParse({ query: "" }).success).toBe(false);
    expect(exaSearchInputSchema.safeParse({ query: "q", register: "spicy" }).success).toBe(false);
  });
});

describe("searchExa", () => {
  const ok = () =>
    new Response(JSON.stringify({ results: [{ url: "https://a.test", title: "A" }] }), {
      status: 200,
    });

  it("returns ok with normalized results", async () => {
    const out = await searchExa("q", "shitpost", { apiKey: "k", fetchImpl: async () => ok() });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.results).toHaveLength(1);
  });

  it("reports a missing key without calling the network", async () => {
    const fetchImpl = vi.fn();
    const out = await searchExa("q", "sensible", { apiKey: "", fetchImpl });
    expect(out.kind).toBe("unauthorized");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not retry a 401", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    const out = await searchExa("q", "sensible", { apiKey: "k", fetchImpl });
    expect(out.kind).toBe("unauthorized");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 exactly once, then gives up", async () => {
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 }));
    const out = await searchExa("q", "sensible", { apiKey: "k", fetchImpl });
    expect(out.kind).toBe("rate-limited");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a network error once and succeeds on the second try", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(ok());
    const out = await searchExa("q", "sensible", { apiKey: "k", fetchImpl });
    expect(out.kind).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports a 500 as unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const out = await searchExa("q", "sensible", { apiKey: "k", fetchImpl });
    expect(out.kind).toBe("unavailable");
  });

  it("sends the key as the x-api-key header", async () => {
    let seen: HeadersInit | undefined;
    await searchExa("q", "sensible", {
      apiKey: "secret",
      fetchImpl: async (_url, init) => {
        seen = (init as RequestInit).headers;
        return ok();
      },
    });
    expect((seen as Record<string, string>)["x-api-key"]).toBe("secret");
  });
});
