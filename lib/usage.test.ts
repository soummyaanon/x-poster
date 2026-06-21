import { describe, expect, it } from "vitest";
import { deriveUsage } from "./usage";

describe("deriveUsage", () => {
  it("returns zeros for no events", () => {
    const result = deriveUsage([]);
    expect(result.usedTokens).toBe(0);
    expect(result.compacted).toBe(false);
  });

  it("uses the most recent step.completed usage", () => {
    const result = deriveUsage([
      { type: "step.completed", data: { usage: { inputTokens: 100, outputTokens: 10 } } },
      {
        type: "step.completed",
        data: { usage: { inputTokens: 250, outputTokens: 40, cacheReadTokens: 30 } },
      },
    ]);
    expect(result.usedTokens).toBe(290);
    expect(result.usage.inputTokens).toBe(250);
    expect(result.usage.outputTokens).toBe(40);
    expect(result.usage.inputTokenDetails.cacheReadTokens).toBe(30);
  });

  it("detects compaction", () => {
    const result = deriveUsage([{ type: "compaction.completed", data: {} }]);
    expect(result.compacted).toBe(true);
  });
});
