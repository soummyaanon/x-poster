import { describe, expect, it } from "vitest";
import {
  MAX_TWEET_CHARS,
  composeDraftsInputSchema,
  countChars,
  findDateHits,
  humanizeText,
  validateDrafts,
} from "./drafts";

describe("countChars", () => {
  it("counts plain ascii by length", () => {
    expect(countChars("hello")).toBe(5);
  });

  it("counts an emoji as one code point", () => {
    expect(countChars("👍")).toBe(1);
  });
});

describe("humanizeText", () => {
  it("turns an em dash clause break into a comma", () => {
    expect(humanizeText("WebSockets are live — and billing is per message")).toBe(
      "WebSockets are live, and billing is per message",
    );
  });

  it("turns an unspaced em dash into a comma", () => {
    expect(humanizeText("fast—cheap")).toBe("fast, cheap");
  });

  it("collapses a numeric en-dash range to a hyphen", () => {
    expect(humanizeText("aim for 180–270 chars")).toBe("aim for 180-270 chars");
  });

  it("leaves an ordinary hyphen alone", () => {
    expect(humanizeText("two-tower retrieval")).toBe("two-tower retrieval");
  });

  it("never leaves an em or en dash behind", () => {
    const out = humanizeText("a — b – c — 1–2");
    expect(out).not.toMatch(/[‒–—―]/);
  });

  it("normalizes curly quotes to straight quotes", () => {
    expect(humanizeText("He said \u201Chello\u201D")).toBe('He said "hello"');
    expect(humanizeText("it\u2019s fine")).toBe("it's fine");
  });
});

describe("findDateHits", () => {
  it("catches a four-digit year", () => {
    expect(findDateHits("the model that shipped in 2026")).toEqual(["2026"]);
  });

  it("catches a capitalized month and its abbreviation", () => {
    expect(findDateHits("the June release")).toEqual(["June"]);
    expect(findDateHits("back in Dec")).toEqual(["Dec"]);
  });

  it("catches a fiscal quarter", () => {
    expect(findDateHits("Q3 earnings beat")).toEqual(["Q3"]);
  });

  it("catches every date token in a body", () => {
    const hits = findDateHits("Launched June 2026, more in Q1");
    expect(hits).toEqual(expect.arrayContaining(["2026", "June", "Q1"]));
    expect(hits).toHaveLength(3);
  });

  it("ignores lowercase 'may' and 'march' used as ordinary words", () => {
    expect(findDateHits("this may work once companies march toward it")).toEqual([]);
  });

  it("ignores plain numbers that are not years", () => {
    expect(findDateHits("cut cold start to 240ms, aim for 280 chars")).toEqual([]);
  });

  it("does not treat a decade like 2010s as a bare year", () => {
    expect(findDateHits("the 2010s were a different web")).toEqual([]);
  });
});

describe("validateDrafts", () => {
  it("surfaces calendar dates per unit", () => {
    const [result] = validateDrafts([
      { format: "short", text: "huge news for June 2026", signal: "reply" },
    ]);
    expect(result.units[0].dateHits).toEqual(expect.arrayContaining(["2026", "June"]));
  });

  it("leaves dateHits empty for a clean post", () => {
    const [result] = validateDrafts([
      { format: "short", text: "the new model reviews its own diffs now", signal: "dwell" },
    ]);
    expect(result.units[0].dateHits).toEqual([]);
  });

  it("flags an over-limit short post", () => {
    const long = "x".repeat(MAX_TWEET_CHARS + 1);
    const [result] = validateDrafts([{ format: "short", text: long, signal: "reply" }]);
    expect(result.units).toHaveLength(1);
    expect(result.units[0].chars).toBe(MAX_TWEET_CHARS + 1);
    expect(result.units[0].over).toBe(true);
  });

  it("validates each tweet in a thread", () => {
    const [result] = validateDrafts([
      {
        format: "thread",
        signal: "repost",
        tweets: ["ok tweet", "y".repeat(MAX_TWEET_CHARS + 5)],
      },
    ]);
    expect(result.units).toHaveLength(2);
    expect(result.units[0].over).toBe(false);
    expect(result.units[1].over).toBe(true);
  });

  it("allows a premium single post past the tweet limit", () => {
    const body = "z".repeat(MAX_TWEET_CHARS + 400);
    const [result] = validateDrafts([{ format: "single", text: body, signal: "dwell" }]);
    expect(result.units[0].over).toBe(false);
  });

  it("strips em dashes from the post before counting", () => {
    const [result] = validateDrafts([
      { format: "short", text: "live now — and fast", signal: "reply" },
    ]);
    expect(result.units[0].text).toBe("live now, and fast");
    expect(result.units[0].text).not.toMatch(/[‒–—―]/);
  });
});

describe("composeDraftsInputSchema", () => {
  it("accepts a premium pair (single + long)", () => {
    const ok = composeDraftsInputSchema.safeParse({
      drafts: [
        { format: "single", text: "a".repeat(300), signal: "reply" },
        { format: "long", text: "b".repeat(700), signal: "dwell" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("accepts a free pair (short + thread)", () => {
    const ok = composeDraftsInputSchema.safeParse({
      drafts: [
        { format: "short", text: "a", signal: "reply" },
        { format: "thread", tweets: ["c", "d", "e"], signal: "dwell" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("accepts quote drafts with a quoting source", () => {
    const ok = composeDraftsInputSchema.safeParse({
      quoting: "https://x.com/some/post",
      drafts: [
        { format: "quote", text: "my take", signal: "repost" },
        { format: "quote", text: "another take", signal: "reply" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects fewer than two drafts", () => {
    const tooFew = composeDraftsInputSchema.safeParse({
      drafts: [{ format: "short", text: "a", signal: "reply" }],
    });
    expect(tooFew.success).toBe(false);
  });

  it("rejects more than four drafts", () => {
    const tooMany = composeDraftsInputSchema.safeParse({
      drafts: Array.from({ length: 5 }, () => ({
        format: "short" as const,
        text: "a",
        signal: "reply" as const,
      })),
    });
    expect(tooMany.success).toBe(false);
  });

  it("rejects an unknown format or signal", () => {
    expect(
      composeDraftsInputSchema.safeParse({
        drafts: [
          { format: "video", text: "a", signal: "reply" },
          { format: "short", text: "b", signal: "reply" },
        ],
      }).success,
    ).toBe(false);
  });
});
