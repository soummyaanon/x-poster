import { describe, expect, it } from "vitest";
import {
  BANNED_PATTERNS,
  FORMULA_BANNED,
  MAX_TWEET_CHARS,
  UNIVERSAL_BANNED,
  composeDraftsInputSchema,
  countChars,
  findBannedHits,
  findDateHits,
  guardPolicyFor,
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

describe("findBannedHits", () => {
  it("catches a plain banned formula", () => {
    expect(findBannedHits("ok but let that sink in for a second")).toContain(
      '"let that sink in"',
    );
  });

  it("catches the persuasive-authority opener", () => {
    expect(findBannedHits("the real question is whether anyone ships it")).toContain(
      '"the real question is"',
    );
  });

  it("catches the antithesis reversal that shipped in production", () => {
    // From the live "single neurons" draft the user flagged.
    const hits = findBannedHits(
      "It does not make the brain feel less mysterious. It makes it feel more engineered.",
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("catches the 'does not look X. It looks Y' rhythm", () => {
    const hits = findBannedHits(
      "language does not look fuzzy at that scale. It looks organized.",
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("catches significance filler", () => {
    const hits = findBannedHits("That is the part I cannot stop thinking about.");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("returns nothing for a clean, specific line", () => {
    expect(findBannedHits("the new model reviews its own diffs now")).toEqual([]);
  });

  it("does not flag ordinary negation that is not the reversal formula", () => {
    expect(findBannedHits("This does not work yet. The team is on it.")).toEqual([]);
  });

  it("does not flag plain 'It is' re-assertion after negation", () => {
    expect(findBannedHits("The API is not ready. It is in beta.")).toEqual([]);
  });
});

describe("validateDrafts", () => {
  it("surfaces banned AI tells per unit", () => {
    const [result] = validateDrafts([
      { format: "short", text: "the real question is whether it ships", signal: "reply" },
    ]);
    expect(result.units[0].bannedHits).toContain('"the real question is"');
  });

  it("leaves bannedHits empty for a clean post", () => {
    const [result] = validateDrafts([
      { format: "short", text: "the new model reviews its own diffs now", signal: "dwell" },
    ]);
    expect(result.units[0].bannedHits).toEqual([]);
  });

  it("does not double-flag an em dash as a banned tell (it is auto-stripped first)", () => {
    const [result] = validateDrafts([
      { format: "short", text: "live now — and fast", signal: "reply" },
    ]);
    expect(result.units[0].text).toBe("live now, and fast");
    expect(result.units[0].bannedHits).toEqual([]);
  });

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

describe("guard policy split", () => {
  it("partitions BANNED_PATTERNS with nothing dropped and nothing duplicated", () => {
    expect(UNIVERSAL_BANNED.length + FORMULA_BANNED.length).toBe(BANNED_PATTERNS.length);
    expect(UNIVERSAL_BANNED).toHaveLength(17);
    expect(FORMULA_BANNED).toHaveLength(3);
    const labels = BANNED_PATTERNS.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps the notorious \"X isn't Y, it's Z\" tell universal, not a relaxable formula", () => {
    const universalLabels = UNIVERSAL_BANNED.map((p) => p.label);
    expect(universalLabels).toContain(`"X isn't Y, it's Z"`);
    expect(FORMULA_BANNED.map((p) => p.label)).not.toContain(`"X isn't Y, it's Z"`);
  });

  it("puts exactly the three relaxable formulas in FORMULA_BANNED", () => {
    expect(FORMULA_BANNED.map((p) => p.label).sort()).toEqual(
      [
        "aphorism formula (not a X but a Y)",
        "aphorism formula (the X of)",
        "rule-of-three triplet",
      ].sort(),
    );
  });
});

describe("guardPolicyFor", () => {
  it("enforces everything under sensible", () => {
    const policy = guardPolicyFor("sensible");
    expect(policy.banned).toHaveLength(BANNED_PATTERNS.length);
    expect(policy.enforceDates).toBe(true);
  });

  it("drops the formula bans and the date guard under shitpost", () => {
    const policy = guardPolicyFor("shitpost");
    expect(policy.banned).toHaveLength(UNIVERSAL_BANNED.length);
    expect(policy.enforceDates).toBe(false);
  });

  it("defaults to sensible when no register is given", () => {
    expect(guardPolicyFor()).toEqual(guardPolicyFor("sensible"));
  });
});

describe("findBannedHits with a policy", () => {
  const ruleOfThree = "shipping, scaling, and surviving is the whole job";
  const emDash = "live now — and fast";

  it("flags a rule-of-three triplet under sensible", () => {
    expect(findBannedHits(ruleOfThree, guardPolicyFor("sensible"))).toContain(
      "rule-of-three triplet",
    );
  });

  it("allows a rule-of-three triplet under shitpost", () => {
    expect(findBannedHits(ruleOfThree, guardPolicyFor("shitpost"))).toEqual([]);
  });

  it("flags an em dash under BOTH registers", () => {
    expect(findBannedHits(emDash, guardPolicyFor("sensible"))).toContain("em/en/figure dash");
    expect(findBannedHits(emDash, guardPolicyFor("shitpost"))).toContain("em/en/figure dash");
  });

  it("flags \"X isn't Y, it's Z\" under BOTH registers", () => {
    const text = "this isn't a feature, it's a whole product";
    expect(findBannedHits(text, guardPolicyFor("sensible")).length).toBeGreaterThan(0);
    expect(findBannedHits(text, guardPolicyFor("shitpost")).length).toBeGreaterThan(0);
  });

  it("defaults to the full sensible set when no policy is passed", () => {
    expect(findBannedHits(ruleOfThree)).toContain("rule-of-three triplet");
  });
});

describe("validateDrafts under a register", () => {
  const dated = "it's december 2025. you wake up. you open x. nothing has changed.";

  it("reports calendar dates under sensible", () => {
    const [result] = validateDrafts(
      [{ format: "short", text: dated, signal: "reply" }],
      "sensible",
    );
    expect(result.units[0].dateHits).toEqual(expect.arrayContaining(["2025"]));
  });

  it("reports NO calendar dates under shitpost", () => {
    const [result] = validateDrafts(
      [{ format: "short", text: dated, signal: "reply" }],
      "shitpost",
    );
    expect(result.units[0].dateHits).toEqual([]);
  });

  it("reports a rule-of-three tell under sensible but not shitpost", () => {
    const body = "shipping, scaling, and surviving is the whole job";
    const [strict] = validateDrafts([{ format: "short", text: body, signal: "reply" }], "sensible");
    const [loose] = validateDrafts([{ format: "short", text: body, signal: "reply" }], "shitpost");
    expect(strict.units[0].bannedHits).toContain("rule-of-three triplet");
    expect(loose.units[0].bannedHits).toEqual([]);
  });

  it("still strips em dashes and enforces limits under shitpost", () => {
    const [result] = validateDrafts(
      [{ format: "short", text: `live now — and fast ${"x".repeat(300)}`, signal: "reply" }],
      "shitpost",
    );
    expect(result.units[0].text).not.toMatch(/[‒–—―]/);
    expect(result.units[0].over).toBe(true);
  });

  it("behaves exactly like sensible when the register is omitted", () => {
    const drafts = [{ format: "short" as const, text: dated, signal: "reply" as const }];
    expect(validateDrafts(drafts)).toEqual(validateDrafts(drafts, "sensible"));
  });
});

describe("composeDraftsInputSchema register field", () => {
  const twoDrafts = [
    { format: "short", text: "a", signal: "reply" },
    { format: "short", text: "b", signal: "dwell" },
  ];

  it("defaults register to sensible when absent", () => {
    const parsed = composeDraftsInputSchema.parse({ drafts: twoDrafts });
    expect(parsed.register).toBe("sensible");
  });

  it("accepts an explicit shitpost register", () => {
    const parsed = composeDraftsInputSchema.parse({ drafts: twoDrafts, register: "shitpost" });
    expect(parsed.register).toBe("shitpost");
  });

  it("rejects an unknown register", () => {
    expect(
      composeDraftsInputSchema.safeParse({ drafts: twoDrafts, register: "spicy" }).success,
    ).toBe(false);
  });
});
