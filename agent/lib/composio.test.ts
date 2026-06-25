import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Composio SDK so these tests never hit the network or post a real
// tweet; we only assert what `executeTwitter` sends to the client.
const { executeSpy, getRawSpy, listSpy, deleteSpy, ComposioCtor } = vi.hoisted(() => ({
  executeSpy: vi.fn(),
  getRawSpy: vi.fn(),
  listSpy: vi.fn(),
  deleteSpy: vi.fn(),
  ComposioCtor: vi.fn(),
}));

vi.mock("@composio/core", () => ({
  Composio: ComposioCtor,
}));

// The full mocked instance shape used across these tests.
function mockComposioInstance() {
  return {
    tools: { execute: executeSpy, getRawComposioTools: getRawSpy },
    connectedAccounts: { list: listSpy, delete: deleteSpy },
  };
}

describe("executeTwitter", () => {
  beforeEach(() => {
    vi.resetModules();
    executeSpy.mockReset();
    getRawSpy.mockReset();
    ComposioCtor.mockReset();
    ComposioCtor.mockImplementation(mockComposioInstance);
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
    ComposioCtor.mockImplementation(mockComposioInstance);
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

describe("disconnectX", () => {
  beforeEach(() => {
    vi.resetModules();
    listSpy.mockReset();
    deleteSpy.mockReset();
    ComposioCtor.mockReset();
    ComposioCtor.mockImplementation(mockComposioInstance);
    process.env.COMPOSIO_API_KEY = "test-key";
    process.env.COMPOSIO_USER_ID = "default";
  });

  it("deletes the active X account and reports disconnected", async () => {
    listSpy.mockResolvedValueOnce({
      items: [{ id: "ca_1", toolkit: { slug: "twitter" }, status: "ACTIVE" }],
    });
    deleteSpy.mockResolvedValueOnce({});
    const { disconnectX } = await import("./composio.ts");
    const res = await disconnectX();
    expect(deleteSpy).toHaveBeenCalledWith("ca_1");
    expect(res.disconnected).toBe(true);
  });

  it("is idempotent when nothing is connected (no delete call)", async () => {
    listSpy.mockResolvedValueOnce({ items: [] });
    const { disconnectX } = await import("./composio.ts");
    const res = await disconnectX();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(res.disconnected).toBe(true);
  });

  it("reports the error when delete fails", async () => {
    listSpy.mockResolvedValueOnce({
      items: [{ id: "ca_1", toolkit: { slug: "twitter" }, status: "ACTIVE" }],
    });
    deleteSpy.mockRejectedValueOnce(new Error("boom"));
    const { disconnectX } = await import("./composio.ts");
    const res = await disconnectX();
    expect(res.disconnected).toBe(false);
    expect(res.error).toContain("boom");
  });
});
