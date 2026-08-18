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

  it("names every register and the default", () => {
    expect(md).toContain("sensible");
    expect(md).toContain("shitpost");
    expect(md).toContain("ragebait");
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

  it("states that every register works on any topic, not just tech", () => {
    expect(md).toMatch(/any topic/i);
    expect(md).toMatch(/sports|food|culture|health/i);
    expect(md).toMatch(/do not drag[\s\S]{0,140}(?:startup|software|tech)/i);
  });

  it("names the third register and its skill load", () => {
    expect(md).toContain("ragebait");
    expect(md).toContain('load_skill("ragebait")');
  });

  it("teaches the ragebait toolkit while keeping the two rails absolute", () => {
    expect(md).toContain("Real premise, real position");
    expect(md).toContain("Hot Take");
    expect(md).toContain("Victim Flip");
    expect(md).toContain("Strawman Setup");
    expect(md).toContain("Bait and Switch");
    expect(md).toContain("Personal Attack Disguised as Concern");
    expect(md).toMatch(/never a private individual/i);
    expect(md).toMatch(/protected group/i);
  });

  it("routes ragebait through the same deep research path as sensible", () => {
    expect(md).toMatch(/ragebait[\s\S]{0,300}deep/i);
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

  it("keeps the truly absolute rules absolute", () => {
    expect(md).toContain("Never invent");
    expect(md).toContain("No em dashes, ever");
  });

  // Rage-bait itself is no longer banned in every register: `ragebait` is the
  // one register built to provoke on purpose, taught through five named plays
  // (see 20-register.md). It stays banned in `sensible` and `shitpost`, and
  // fabrication / private-individual / protected-group targeting stay
  // absolute everywhere. This just confirms the term still appears so the
  // register-scoping rule was not silently dropped; it is deliberately a
  // separate test from "keeps the truly absolute rules absolute" above,
  // because this one is not.
  it("mentions rage-bait, now register-scoped rather than an absolute ban", () => {
    expect(md).toMatch(/rage-?bait/i);
  });

  it("dispatches step 3.5 to the ragebait skill too", () => {
    expect(md).toContain('load_skill("ragebait")');
  });

  it("keeps the person/protected-group rail visible in the base instructions", () => {
    expect(md).toMatch(/protected group/i);
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

  it("keeps drafting-from-memory absolutely banned in every register", () => {
    expect(base).toMatch(/never draft from memory/i);
    expect(register).toMatch(/never draft from memory/i);
  });
});
