import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTER,
  REGISTERS,
  REGISTER_LABELS,
  isRegister,
  registerLabel,
  resolveRegisterContext,
} from "./registers";

describe("register catalog", () => {
  it("has exactly the two registers", () => {
    expect([...REGISTERS]).toEqual(["sensible", "shitpost"]);
  });

  it("defaults to sensible", () => {
    expect(DEFAULT_REGISTER).toBe("sensible");
  });

  it("labels every register", () => {
    for (const id of REGISTERS) {
      expect(REGISTER_LABELS[id].trim().length).toBeGreaterThan(0);
    }
    expect(REGISTER_LABELS.shitpost).toContain("shitpost");
    expect(REGISTER_LABELS.sensible).toContain("sensible");
  });
});

describe("isRegister", () => {
  it("accepts known ids", () => {
    expect(isRegister("sensible")).toBe(true);
    expect(isRegister("shitpost")).toBe(true);
  });

  it("rejects unknown ids", () => {
    expect(isRegister("funny")).toBe(false);
    expect(isRegister("")).toBe(false);
  });
});

describe("resolveRegisterContext", () => {
  it("defaults to sensible when the id is undefined", () => {
    const ctx = resolveRegisterContext(undefined);
    expect(ctx.id).toBe("sensible");
    expect(ctx.label).toBe(REGISTER_LABELS.sensible);
    expect(ctx.profile.trim().length).toBeGreaterThan(40);
  });

  it("resolves the shitpost profile", () => {
    const ctx = resolveRegisterContext("shitpost");
    expect(ctx.id).toBe("shitpost");
    expect(ctx.label).toBe(REGISTER_LABELS.shitpost);
    // The three load-bearing craft rules must reach the model.
    expect(ctx.profile).toContain("lowercase");
    expect(ctx.profile).toContain("Real premise, absurd take");
    expect(ctx.profile).toContain("rage-bait");
  });

  it("returns only the selected register's profile, never both", () => {
    const sensible = resolveRegisterContext("sensible");
    expect(sensible.profile).not.toContain("Real premise, absurd take");
  });

  it("tells both registers they are topic-agnostic, not tech-only", () => {
    for (const id of REGISTERS) {
      const { profile } = resolveRegisterContext(id);
      expect(profile).toMatch(/any topic/i);
      // Must explicitly block the "drag it back to startups" failure mode.
      expect(profile).toMatch(/(?:startup|software|tech)/i);
    }
  });

  it("keeps every profile clean of em dashes", () => {
    for (const id of REGISTERS) {
      expect(resolveRegisterContext(id).profile).not.toMatch(/[‒–—―]/);
    }
  });
});

describe("registerLabel", () => {
  it("returns the label for an id", () => {
    expect(registerLabel("shitpost")).toBe(REGISTER_LABELS.shitpost);
  });
});
