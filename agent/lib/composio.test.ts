import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Composio SDK so these tests never hit the network or post a real
// tweet; we only assert what `executeTwitter` sends to the client.
const { executeSpy, getRawSpy, ComposioCtor } = vi.hoisted(() => ({
  executeSpy: vi.fn(),
  getRawSpy: vi.fn(),
  ComposioCtor: vi.fn(),
}));

vi.mock("@composio/core", () => ({
  Composio: ComposioCtor,
}));

describe("executeTwitter", () => {
  beforeEach(() => {
    vi.resetModules();
    executeSpy.mockReset();
    getRawSpy.mockReset();
    ComposioCtor.mockReset();
    ComposioCtor.mockImplementation(function () {
      return { tools: { execute: executeSpy, getRawComposioTools: getRawSpy } };
    });
    executeSpy.mockResolvedValue({ successful: true, data: { data: { id: "1" } }, error: null });
    process.env.COMPOSIO_API_KEY = "test-key";
    process.env.COMPOSIO_USER_ID = "default";
  });

  it("forwards a toolkit version (fixes 'Toolkit version not specified')", async () => {
    const { executeTwitter } = await import("./composio.ts");
    await executeTwitter("TWITTER_CREATION_OF_A_POST", { text: "hi" });

    expect(executeSpy).toHaveBeenCalledTimes(1);
    const [slug, body] = executeSpy.mock.calls[0];
    expect(slug).toBe("TWITTER_CREATION_OF_A_POST");
    expect(body.version).toBeTruthy();
    expect(body.userId).toBe("default");
    expect(body.arguments).toEqual({ text: "hi" });
  });

  it("honors COMPOSIO_TWITTER_VERSION when set", async () => {
    process.env.COMPOSIO_TWITTER_VERSION = "20991231_00";
    const { executeTwitter } = await import("./composio.ts");
    await executeTwitter("TWITTER_RECENT_SEARCH", { query: "ai" });
    const [, body] = executeSpy.mock.calls[0];
    expect(body.version).toBe("20991231_00");
    delete process.env.COMPOSIO_TWITTER_VERSION;
  });

  it("surfaces the real Composio error (not the opaque generic one) when execute throws", async () => {
    executeSpy.mockReset();
    executeSpy.mockRejectedValueOnce(
      Object.assign(new Error("Error executing the tool TWITTER_CREATION_OF_A_POST"), {
        cause: { error: { error: { message: "No connected account found for user ID default for toolkit twitter" } } },
      }),
    );
    const { executeTwitter } = await import("./composio.ts");
    const res = await executeTwitter("TWITTER_CREATION_OF_A_POST", { text: "hi" });
    expect(res.successful).toBe(false);
    expect(res.error).toContain("No connected account found");
  });
});

describe("findTwitterTools", () => {
  beforeEach(() => {
    vi.resetModules();
    getRawSpy.mockReset();
    ComposioCtor.mockReset();
    ComposioCtor.mockImplementation(function () {
      return { tools: { execute: executeSpy, getRawComposioTools: getRawSpy } };
    });
    process.env.COMPOSIO_API_KEY = "test-key";
  });

  it("falls back to the unfiltered toolkit list when a search returns nothing", async () => {
    getRawSpy.mockResolvedValueOnce([]); // long NL query → empty
    getRawSpy.mockResolvedValueOnce([
      { slug: "TWITTER_CREATION_OF_A_POST", name: "Create a post", description: "" },
    ]);
    const { findTwitterTools } = await import("./composio.ts");
    const tools = await findTwitterTools("publish a post to X with the connected account");
    expect(tools.map((t) => t.slug)).toContain("TWITTER_CREATION_OF_A_POST");
    expect(getRawSpy).toHaveBeenCalledTimes(2);
    expect(getRawSpy.mock.calls[1][0].search).toBeUndefined();
  });

  it("filters out blocked slugs", async () => {
    getRawSpy.mockResolvedValueOnce([
      { slug: "TWITTER_CREATION_OF_A_POST", name: "Create a post", description: "" },
      { slug: "TWITTER_GET_OPENAPI_SPEC", name: "OpenAPI", description: "" },
    ]);
    const { findTwitterTools } = await import("./composio.ts");
    const slugs = (await findTwitterTools("post")).map((t) => t.slug);
    expect(slugs).toContain("TWITTER_CREATION_OF_A_POST");
    expect(slugs).not.toContain("TWITTER_GET_OPENAPI_SPEC");
  });
});
