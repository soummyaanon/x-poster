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

  it("allows a long-form post past the tweet limit", () => {
    const body = "z".repeat(MAX_TWEET_CHARS + 400);
    const [result] = validateDrafts([{ format: "long", text: body, signal: "dwell" }]);
    expect(result.units[0].over).toBe(false);
  });
});

describe("composeDraftsInputSchema", () => {
  it("accepts one of each format", () => {
    const ok = composeDraftsInputSchema.safeParse({
      drafts: [
        { format: "short", text: "a", signal: "reply" },
        { format: "long", text: "b".repeat(400), signal: "dwell" },
        { format: "thread", tweets: ["c", "d"], signal: "repost" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("requires exactly three drafts", () => {
    const tooFew = composeDraftsInputSchema.safeParse({
      drafts: [{ format: "short", text: "a", signal: "reply" }],
    });
    expect(tooFew.success).toBe(false);
  });

  it("rejects an unknown format or signal", () => {
    expect(
      composeDraftsInputSchema.safeParse({
        drafts: [
          { format: "video", text: "a", signal: "reply" },
          { format: "short", text: "b", signal: "reply" },
          { format: "short", text: "c", signal: "dwell" },
        ],
      }).success,
    ).toBe(false);
  });
});
