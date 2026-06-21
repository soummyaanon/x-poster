import { describe, expect, it } from "vitest";
import {
  MAX_TWEET_CHARS,
  composeDraftsInputSchema,
  countChars,
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

describe("validateDrafts", () => {
  it("flags an over-limit draft", () => {
    const long = "x".repeat(MAX_TWEET_CHARS + 1);
    const [result] = validateDrafts([{ text: long, signal: "reply" }]);
    expect(result.chars).toBe(MAX_TWEET_CHARS + 1);
    expect(result.over).toBe(true);
  });

  it("does not flag a draft at the limit", () => {
    const exact = "x".repeat(MAX_TWEET_CHARS);
    const [result] = validateDrafts([{ text: exact, signal: "dwell" }]);
    expect(result.over).toBe(false);
  });
});

describe("composeDraftsInputSchema", () => {
  it("requires exactly three drafts", () => {
    const ok = composeDraftsInputSchema.safeParse({
      drafts: [
        { text: "a", signal: "reply" },
        { text: "b", signal: "repost" },
        { text: "c", signal: "dwell" },
      ],
    });
    expect(ok.success).toBe(true);

    const tooFew = composeDraftsInputSchema.safeParse({
      drafts: [{ text: "a", signal: "reply" }],
    });
    expect(tooFew.success).toBe(false);
  });

  it("rejects an unknown signal", () => {
    const bad = composeDraftsInputSchema.safeParse({
      drafts: [
        { text: "a", signal: "viral" },
        { text: "b", signal: "reply" },
        { text: "c", signal: "dwell" },
      ],
    });
    expect(bad.success).toBe(false);
  });
});
