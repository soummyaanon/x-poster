// Lives in lib/, not next to the skill, because eve registers every .ts under
// agent/skills/ as a skill module.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SKILL = readFileSync(
  fileURLToPath(new URL("../skills/shitpost/SKILL.md", import.meta.url)),
  "utf8",
);

describe("shitpost skill", () => {
  it("declares a name and a routing description in frontmatter", () => {
    expect(SKILL.startsWith("---\n")).toBe(true);
    const frontmatter = SKILL.split("---")[1];
    expect(frontmatter).toContain("name: shitpost");
    expect(frontmatter).toContain("description:");
    expect(frontmatter).toContain("register");
  });

  it("carries every load-bearing craft section", () => {
    for (const heading of [
      "## The shape",
      "## The 80/20 split",
      "## Works on any topic",
      "## What relaxes, and what never does",
      "## Antipatterns",
    ]) {
      expect(SKILL).toContain(heading);
    }
  });

  it("works outside tech: names non-tech domains explicitly", () => {
    // The craft is universal; the skill must not read as a tech-only guide.
    for (const domain of ["sports", "food", "money", "health"]) {
      expect(SKILL.toLowerCase()).toContain(domain);
    }
  });

  it("bans dragging a non-tech topic back to startups or software", () => {
    expect(SKILL).toMatch(/do not (?:drag|pull)[\s\S]{0,120}(?:startup|software|tech)/i);
  });

  it("ships worked examples from more than one domain", () => {
    const examples = SKILL.match(/^> /gm) ?? [];
    expect(examples.length).toBeGreaterThanOrEqual(3);
  });

  it("states the fabrication line verbatim", () => {
    expect(SKILL).toContain("Real premise, absurd take");
  });

  it("keeps rage-bait banned", () => {
    expect(SKILL).toMatch(/rage-?bait/i);
  });

  it("uses no em dashes (it is the one rule that never relaxes)", () => {
    expect(SKILL).not.toMatch(/[‒–—―]/);
  });
});
