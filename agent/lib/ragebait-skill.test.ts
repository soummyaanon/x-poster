// Lives in lib/, not next to the skill, because eve registers every .ts under
// agent/skills/ as a skill module.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SKILL = readFileSync(
  fileURLToPath(new URL("../skills/ragebait/SKILL.md", import.meta.url)),
  "utf8",
);

describe("ragebait skill", () => {
  it("declares a name and a routing description in frontmatter", () => {
    expect(SKILL.startsWith("---\n")).toBe(true);
    const frontmatter = SKILL.split("---")[1];
    expect(frontmatter).toContain("name: ragebait");
    expect(frontmatter).toContain("description:");
    expect(frontmatter).toContain("register");
    expect(frontmatter).toContain("ragebait");
  });

  it("carries every load-bearing craft section", () => {
    for (const heading of [
      "## The shape",
      "## The plays",
      "## What never relaxes",
      "## Works on any topic",
      "## The defusal test",
      "## Antipatterns",
      "## Audit before compose_drafts",
    ]) {
      expect(SKILL).toContain(heading);
    }
  });

  it("names all five plays as craft, not a banned list", () => {
    for (const play of [
      "Hot Take",
      "Victim Flip",
      "Strawman Setup",
      "Bait and Switch",
      "Personal Attack Disguised as Concern",
    ]) {
      expect(SKILL).toContain(play);
    }
  });

  it("bans targeting a private individual or a protected group", () => {
    expect(SKILL).toMatch(/private individual/i);
    expect(SKILL).toMatch(/protected group/i);
  });

  it("states the fabrication line verbatim", () => {
    expect(SKILL).toContain("Real premise, real position");
  });

  it("states that no guards relax in this register", () => {
    expect(SKILL).toMatch(/relaxes nothing/i);
  });

  it("works outside tech: names non-tech domains explicitly", () => {
    for (const domain of ["sports", "food", "money", "health"]) {
      expect(SKILL.toLowerCase()).toContain(domain);
    }
  });

  it("bans dragging a non-tech topic back to startups or software", () => {
    expect(SKILL).toMatch(/do not (?:drag|pull)[\s\S]{0,120}(?:startup|software|tech)/i);
  });

  it("ships worked examples from more than one domain", () => {
    const examples = SKILL.match(/^> /gm) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(4);
  });

  it("uses no em dashes (it is the one rule that never relaxes)", () => {
    expect(SKILL).not.toMatch(/[‒–—―]/);
  });
});
