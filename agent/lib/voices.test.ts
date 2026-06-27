import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_ID,
  PRESET_VOICE_IDS,
  VOICE_IDS,
  VOICE_PRESETS,
  isVoiceId,
  resolveVoiceContext,
  voiceLabel,
} from "./voices";

describe("voice catalog", () => {
  it("has unique ids", () => {
    const ids = VOICE_PRESETS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("custom");
  });

  it("every preset has a non-empty profile", () => {
    for (const preset of VOICE_PRESETS) {
      expect(preset.profile.trim().length).toBeGreaterThan(20);
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(preset.blurb.trim().length).toBeGreaterThan(0);
    }
  });

  it("every preset ships at least two cadence exemplars", () => {
    for (const preset of VOICE_PRESETS) {
      expect(preset.examples.length).toBeGreaterThanOrEqual(2);
      for (const ex of preset.examples) {
        expect(ex.trim().length).toBeGreaterThan(15);
        // Exemplars must be clean: no em dashes, no calendar dates (same bar as drafts).
        expect(ex).not.toMatch(/[‒–—―]/);
        expect(ex).not.toMatch(/\b(?:19|20)\d{2}\b/);
      }
    }
  });

  it("includes house as the default preset", () => {
    expect(DEFAULT_VOICE_ID).toBe("house");
    expect(PRESET_VOICE_IDS).toContain("house");
    expect(VOICE_PRESETS.some((v) => v.id === "house")).toBe(true);
  });

  it("covers all non-custom voice ids", () => {
    const presetIds = new Set(VOICE_PRESETS.map((v) => v.id));
    for (const id of VOICE_IDS) {
      if (id === "custom") continue;
      expect(presetIds.has(id)).toBe(true);
    }
  });
});

describe("isVoiceId", () => {
  it("accepts known ids", () => {
    expect(isVoiceId("house")).toBe(true);
    expect(isVoiceId("karpathy")).toBe(true);
    expect(isVoiceId("custom")).toBe(true);
  });

  it("rejects unknown ids", () => {
    expect(isVoiceId("unknown")).toBe(false);
  });
});

describe("resolveVoiceContext", () => {
  it("defaults to house when selection is undefined", () => {
    const ctx = resolveVoiceContext(undefined);
    expect(ctx.id).toBe("house");
    expect(ctx.label).toBe("House blend");
    expect(ctx.profile).toContain("house blend");
  });

  it("resolves a preset by id", () => {
    const ctx = resolveVoiceContext({ id: "karpathy" });
    expect(ctx.id).toBe("karpathy");
    expect(ctx.label).toBe("Karpathy");
    expect(ctx.profile).toContain("Style only");
  });

  it("injects the preset's cadence exemplars into the resolved profile", () => {
    const ctx = resolveVoiceContext({ id: "naval" });
    expect(ctx.profile).toContain("Cadence references");
    // The actual exemplar text reaches the model, not just the label.
    expect(ctx.profile).toContain("earn while you sleep");
  });

  it("builds custom @handle profile", () => {
    const ctx = resolveVoiceContext({ id: "custom", custom: "@somebuilder" });
    expect(ctx.id).toBe("custom");
    expect(ctx.label).toBe("@somebuilder");
    expect(ctx.profile).toContain("@somebuilder");
    expect(ctx.profile).toContain("web_search");
  });

  it("builds free-text custom profile", () => {
    const ctx = resolveVoiceContext({ id: "custom", custom: "dry academic skeptic" });
    expect(ctx.profile).toContain("dry academic skeptic");
  });

  it("falls back when custom is empty", () => {
    const ctx = resolveVoiceContext({ id: "custom" });
    expect(ctx.profile).toContain("house blend");
  });
});

describe("voiceLabel", () => {
  it("returns labels for presets", () => {
    expect(voiceLabel("naval")).toBe("Naval");
    expect(voiceLabel("custom")).toBe("Custom");
  });
});
