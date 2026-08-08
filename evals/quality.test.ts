import { describe, expect, it } from "vitest";
import type { Draft } from "#lib/drafts.ts";
import { findViolations } from "./quality.ts";

const DATED: Draft = {
  format: "single",
  signal: "reply",
  text: "it's december 2025. you wake up. you open x. a16z led another seed round.",
};
const CLEAN: Draft = {
  format: "long",
  signal: "dwell",
  text:
    "the new agent runtime reviews its own diffs before it opens the pull request. " +
    "that is the part nobody shipped last year and it changes what review is for. ",
};

describe("findViolations register handling", () => {
  it("flags the calendar date under sensible", () => {
    const v = findViolations("premium", [DATED, CLEAN]);
    expect(v.some((s) => s.includes("calendar date"))).toBe(true);
  });

  it("permits the calendar date under shitpost", () => {
    const v = findViolations("premium", [DATED, CLEAN], "shitpost");
    expect(v.some((s) => s.includes("calendar date"))).toBe(false);
  });

  it("permits a rule-of-three under shitpost but not sensible", () => {
    const triplet: Draft = {
      format: "single",
      signal: "repost",
      text: "shipping, scaling, and surviving is the entire founder job description",
    };
    expect(
      findViolations("premium", [triplet, CLEAN]).some((s) => s.includes("rule-of-three")),
    ).toBe(true);
    expect(
      findViolations("premium", [triplet, CLEAN], "shitpost").some((s) =>
        s.includes("rule-of-three"),
      ),
    ).toBe(false);
  });

  it("still flags an em dash under shitpost", () => {
    const dashed: Draft = { format: "single", signal: "reply", text: "live now — and fast" };
    expect(
      findViolations("premium", [dashed, CLEAN], "shitpost").some((s) => s.includes("em/en")),
    ).toBe(true);
  });

  it("still enforces tier formats under shitpost", () => {
    const wrongTier: Draft = { format: "short", signal: "reply", text: "a joke" };
    expect(
      findViolations("premium", [wrongTier, CLEAN], "shitpost").some((s) =>
        s.includes("format not allowed"),
      ),
    ).toBe(true);
  });

  it("defaults to sensible when no register is passed", () => {
    expect(findViolations("premium", [DATED, CLEAN])).toEqual(
      findViolations("premium", [DATED, CLEAN], "sensible"),
    );
  });
});
