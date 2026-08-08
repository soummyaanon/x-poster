// Lives in lib/, not tools/, because eve registers every .ts under agent/tools/
// as a tool. The input schema is imported from drafts.ts rather than read off the
// tool object: defineTool types `inputSchema` as StandardJSONSchemaV1 (no .parse).
import { describe, expect, it } from "vitest";
import composeDrafts from "../tools/compose_drafts.ts";
import { composeDraftsInputSchema } from "./drafts";

const DATED = "it's december 2025. you wake up. you open x. nothing has changed.";
const CLEAN = { format: "short", text: "clean post", signal: "dwell" } as const;

async function run(input: Record<string, unknown>) {
  // execute is typed `Promise<T> | T`; await normalizes both.
  return await composeDrafts.execute(composeDraftsInputSchema.parse(input), {} as never);
}

describe("compose_drafts execute", () => {
  it("applies the sensible policy by default and flags the date", async () => {
    const out = await run({ drafts: [{ format: "short", text: DATED, signal: "reply" }, CLEAN] });
    expect(out.register).toBe("sensible");
    expect(out.drafts[0].units[0].dateHits.length).toBeGreaterThan(0);
  });

  it("applies the shitpost policy and permits the dated setup", async () => {
    const out = await run({
      register: "shitpost",
      drafts: [{ format: "short", text: DATED, signal: "reply" }, CLEAN],
    });
    expect(out.register).toBe("shitpost");
    expect(out.drafts[0].units[0].dateHits).toEqual([]);
  });

  it("tells the model to fix a dated draft in sensible", async () => {
    const out = await run({ drafts: [{ format: "short", text: DATED, signal: "reply" }, CLEAN] });
    // toModelOutput is optional on ToolDefinition; this tool always defines it.
    const summary = await composeDrafts.toModelOutput!(out);
    expect(summary.value).toContain("REMOVE the date");
    expect(summary.value).toContain("sensible");
  });

  it("does not ask for a rewrite of a clean shitpost", async () => {
    const out = await run({
      register: "shitpost",
      drafts: [{ format: "short", text: DATED, signal: "reply" }, CLEAN],
    });
    const summary = await composeDrafts.toModelOutput!(out);
    expect(summary.value).not.toContain("REMOVE the date");
    expect(summary.value).toContain("shitpost");
  });
});
