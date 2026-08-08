// Lives in lib/, NOT in agent/instructions/: eve reads that directory's .ts
// entries as instruction modules, so a test file there would be compiled into
// the system prompt and break the build.
//
// There is deliberately no blanket "no em dashes in instructions" assertion:
// 00-base.md and the humanizer skill quote em dashes as examples of the thing
// they ban. The dash check is scoped to the new file.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL("../instructions/", import.meta.url));
const read = (name: string) => readFileSync(`${DIR}${name}`, "utf8");

describe("instruction file ordering", () => {
  it("loads the register summary between the ranker and the humanizer", () => {
    const md = readdirSync(DIR)
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b));
    expect(md.indexOf("20-register.md")).toBeGreaterThan(md.indexOf("10-ranker-and-patterns.md"));
    expect(md.indexOf("20-register.md")).toBeLessThan(md.indexOf("25-humanizer.md"));
  });
});

describe("20-register.md", () => {
  const md = read("20-register.md");

  it("names both registers and the default", () => {
    expect(md).toContain("sensible");
    expect(md).toContain("shitpost");
    expect(md).toMatch(/default/i);
  });

  it("states the fabrication line verbatim", () => {
    expect(md).toContain("Real premise, absurd take");
  });

  it("names exactly which guards relax", () => {
    expect(md).toMatch(/calendar date/i);
    expect(md).toMatch(/rule-of-three|formula/i);
    expect(md).toMatch(/lowercase/i);
  });

  it("tells the model to report the register on compose_drafts", () => {
    expect(md).toContain("compose_drafts");
    expect(md).toContain("register.id");
  });

  it("uses no em dashes of its own", () => {
    expect(md).not.toMatch(/[‒–—―]/);
  });
});

describe("00-base.md", () => {
  const md = read("00-base.md");

  it("adds the conditional shitpost skill load to the mandatory pipeline", () => {
    expect(md).toContain("3.5");
    expect(md).toContain('load_skill("shitpost")');
  });

  it("makes the humanizer step register-aware", () => {
    // The two words land on different wrapped lines, so match across newlines.
    expect(md).toMatch(/shitpost[\s\S]{0,200}intentional lowercase/i);
  });

  it("scopes the calendar-date hard rule to the sensible register", () => {
    expect(md).toMatch(/No calendar dates in the post[^\n]*sensible/i);
  });

  it("keeps the absolute rules absolute", () => {
    expect(md).toContain("Never invent");
    expect(md).toContain("No em dashes, ever");
    expect(md).toMatch(/rage-?bait/i);
  });
});

describe("research instructions after the Exa swap", () => {
  const base = read("00-base.md");
  const register = read("20-register.md");

  it("makes exa_search the primary research call in the mandatory pipeline", () => {
    expect(base).toContain("exa_search");
    expect(base).toMatch(/exa_search[\s\S]{0,400}fall back[\s\S]{0,200}web_search/i);
  });

  it("keeps the fetch-and-read gate for sensible", () => {
    expect(base).toMatch(/2 to 3 distinct `exa_search` queries/);
    expect(base).toContain("web_fetch");
  });

  it("documents the shitpost fast path", () => {
    expect(register).toMatch(/1 to 2/);
    expect(register).toMatch(/fast/i);
  });

  it("keeps drafting-from-memory absolutely banned in both registers", () => {
    expect(base).toMatch(/never draft from memory/i);
    expect(register).toMatch(/never draft from memory/i);
  });
});
