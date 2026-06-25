import { describe, expect, it } from "vitest";
import {
  BLOCKED_SLUGS,
  describeComposioError,
  extractTweet,
  isAllowedSlug,
  isWriteSlug,
  postThread,
  type ExecResult,
  type TwitterExec,
} from "./x_twitter";

describe("isAllowedSlug", () => {
  it("accepts an ordinary Twitter slug", () => {
    expect(isAllowedSlug("TWITTER_CREATION_OF_A_POST")).toBe(true);
    expect(isAllowedSlug("TWITTER_RECENT_SEARCH")).toBe(true);
  });

  it("rejects a blocked slug", () => {
    for (const slug of BLOCKED_SLUGS) {
      expect(isAllowedSlug(slug)).toBe(false);
    }
  });

  it("rejects a non-Twitter slug", () => {
    expect(isAllowedSlug("GITHUB_CREATE_ISSUE")).toBe(false);
    expect(isAllowedSlug("")).toBe(false);
  });
});

describe("isWriteSlug", () => {
  it("treats a known read as a non-write", () => {
    expect(isWriteSlug("TWITTER_RECENT_SEARCH")).toBe(false);
    expect(isWriteSlug("TWITTER_USER_LOOKUP_ME")).toBe(false);
    expect(isWriteSlug("TWITTER_GET_POST_ANALYTICS")).toBe(false);
    expect(isWriteSlug("TWITTER_USER_HOME_TIMELINE_BY_USER_ID")).toBe(false);
  });

  it("treats a known state-changing action as a write", () => {
    expect(isWriteSlug("TWITTER_CREATION_OF_A_POST")).toBe(true);
    expect(isWriteSlug("TWITTER_POST_DELETE_BY_POST_ID")).toBe(true);
    expect(isWriteSlug("TWITTER_FOLLOW_USER")).toBe(true);
    expect(isWriteSlug("TWITTER_SEND_A_NEW_MESSAGE_TO_A_USER")).toBe(true);
  });

  it("fails safe: an unknown or misremembered slug is treated as a write", () => {
    expect(isWriteSlug("TWITTER_SOME_NEW_ACTION")).toBe(true);
    expect(isWriteSlug("")).toBe(true);
  });
});

describe("extractTweet", () => {
  it("reads an id nested under data.data (Composio wrapping the X response)", () => {
    const t = extractTweet({ data: { id: "1755", text: "hi" } });
    expect(t?.id).toBe("1755");
    expect(t?.url).toContain("1755");
  });

  it("reads a flat id", () => {
    const t = extractTweet({ id: "1900" });
    expect(t?.id).toBe("1900");
  });

  it("returns null when no id is present", () => {
    expect(extractTweet({})).toBeNull();
    expect(extractTweet({ data: {} })).toBeNull();
  });
});

describe("describeComposioError", () => {
  it("extracts the nested Composio API message and suggested fix", () => {
    // The exact shape a Composio ComposioToolExecutionError carries.
    const err = {
      message: "Error executing the tool TWITTER_USER_LOOKUP_ME",
      cause: {
        status: 400,
        error: {
          error: {
            message: "No connected account found for user ID default for toolkit twitter",
            code: 1810,
            suggested_fix: "Connect your twitter account first.",
          },
        },
      },
    };
    const out = describeComposioError(err);
    expect(out).toContain("No connected account found");
    expect(out).toContain("Connect your twitter account");
    // The opaque generic message must not be all the user sees.
    expect(out).not.toBe("Error executing the tool TWITTER_USER_LOOKUP_ME");
  });

  it("falls back to the error message when there is no nested cause", () => {
    expect(describeComposioError(new Error("boom"))).toBe("boom");
  });

  it("handles a plain string or unknown value", () => {
    expect(describeComposioError("weird")).toBe("weird");
  });
});

// A fake executor that records calls and returns successive tweet ids,
// so the chaining behaviour is tested without any network or real posting.
function fakeExec(ids: string[]): { exec: TwitterExec; calls: Array<{ slug: string; args: Record<string, unknown> }> } {
  const calls: Array<{ slug: string; args: Record<string, unknown> }> = [];
  let i = 0;
  const exec: TwitterExec = async (slug, args) => {
    calls.push({ slug, args });
    const id = ids[i++];
    return { successful: true, data: { data: { id } }, error: null };
  };
  return { exec, calls };
}

describe("postThread", () => {
  it("chains each tweet as a reply to the previous one", async () => {
    const { exec, calls } = fakeExec(["100", "101", "102"]);
    const result = await postThread(["one", "two", "three"], {}, exec);

    expect(result.failedAt).toBeUndefined();
    expect(result.posted.map((p) => p.id)).toEqual(["100", "101", "102"]);
    // first tweet has no reply target
    expect(calls[0].args.reply_in_reply_to_tweet_id).toBeUndefined();
    // each subsequent tweet replies to the prior tweet's id
    expect(calls[1].args.reply_in_reply_to_tweet_id).toBe("100");
    expect(calls[2].args.reply_in_reply_to_tweet_id).toBe("101");
  });

  it("seeds the chain from replyToId when the thread replies to an existing tweet", async () => {
    const { exec, calls } = fakeExec(["200", "201"]);
    await postThread(["a", "b"], { replyToId: "999" }, exec);
    expect(calls[0].args.reply_in_reply_to_tweet_id).toBe("999");
    expect(calls[1].args.reply_in_reply_to_tweet_id).toBe("200");
  });

  it("strips em dashes from each tweet before posting (matches the approved preview)", async () => {
    const { exec, calls } = fakeExec(["300", "301"]);
    await postThread(["live now — and fast", "b"], {}, exec);
    expect(calls[0].args.text).toBe("live now, and fast");
    expect(String(calls[0].args.text)).not.toMatch(/[‒–—―]/);
  });

  it("stops and reports the failed index when a tweet fails mid-thread, never half-posting silently", async () => {
    const calls: string[] = [];
    const exec: TwitterExec = async (_slug, args) => {
      calls.push(String(args.text));
      if (calls.length === 2) {
        return { successful: false, data: {}, error: "over the limit" };
      }
      return { successful: true, data: { data: { id: String(calls.length) } }, error: null };
    };
    const result = await postThread(["ok", "bad", "never"], {}, exec);

    expect(result.posted.map((p) => p.id)).toEqual(["1"]);
    expect(result.failedAt).toBe(1);
    expect(result.error).toContain("over the limit");
    // the third tweet must never be attempted
    expect(calls).toHaveLength(2);
  });

  it("reports failure when a post succeeds but no id can be read (cannot chain)", async () => {
    const exec: TwitterExec = async () => ({ successful: true, data: {}, error: null });
    const result = await postThread(["a", "b"], {}, exec);
    expect(result.failedAt).toBe(0);
    expect(result.posted).toHaveLength(0);
  });

  it("surfaces a not-configured executor as a clean failure with nothing posted", async () => {
    const notConfigured: ExecResult = { successful: false, data: {}, error: "X is not configured" };
    const exec: TwitterExec = async () => notConfigured;
    const result = await postThread(["a", "b"], {}, exec);
    expect(result.posted).toHaveLength(0);
    expect(result.failedAt).toBe(0);
    expect(result.error).toContain("not configured");
  });
});
