// Pure logic for the X (Twitter) publishing capability: which actions are
// exposed, which ones must be gated behind human approval, how to read a posted
// tweet out of a Composio response, and how to publish a thread by chaining
// replies. Everything here is network-free and deterministic so it can be unit
// tested without ever touching Composio or posting a real tweet. The only module
// that talks to Composio is `composio.ts`.

import { humanizeText } from "./drafts.ts";

/** Composio toolkit slug for X (formerly Twitter). */
export const TWITTER_TOOLKIT = "TWITTER";

/** The slug for creating a post; used for single posts, quotes, replies, and threads. */
export const CREATE_POST_SLUG = "TWITTER_CREATION_OF_A_POST";

/**
 * Actions withheld from the agent. The surface is broad on purpose (block-list,
 * not allow-list): every other `TWITTER_*` action Composio offers is available.
 * These are withheld only because they are irrelevant to this agent or need
 * elevated X API access that a normal account does not have.
 */
export const BLOCKED_SLUGS: ReadonlySet<string> = new Set([
  "TWITTER_CREATE_COMPLIANCE_JOB",
  "TWITTER_GET_COMPLIANCE_JOB",
  "TWITTER_GET_COMPLIANCE_JOBS",
  "TWITTER_STREAM_POST_LABELS",
  "TWITTER_CREATE_ACTIVITY_SUBSCRIPTION",
  "TWITTER_GET_OPENAPI_SPEC",
]);

/**
 * Slugs that only read state. Anything NOT in this set is treated as a write and
 * therefore gated behind approval (see `isWriteSlug`). Keeping reads explicit and
 * defaulting everything else to "write" is the fail-safe: a new or misremembered
 * slug errs toward asking for approval, never toward a silent state change.
 */
export const READ_SLUGS: ReadonlySet<string> = new Set([
  "TWITTER_BOOKMARKS_BY_USER",
  "TWITTER_FOLLOWERS_BY_USER_ID",
  "TWITTER_FOLLOWING_BY_USER_ID",
  "TWITTER_FULL_ARCHIVE_SEARCH",
  "TWITTER_GET_BLOCKED_USERS",
  "TWITTER_GET_DM_CONVERSATION_EVENTS",
  "TWITTER_GET_DM_EVENT",
  "TWITTER_GET_LIST",
  "TWITTER_GET_LIST_FOLLOWERS",
  "TWITTER_GET_LIST_MEMBERS",
  "TWITTER_GET_MEDIA_UPLOAD_STATUS",
  "TWITTER_GET_MUTED_USERS",
  "TWITTER_GET_POST_ANALYTICS",
  "TWITTER_GET_POST_RETWEETERS_ACTION",
  "TWITTER_GET_POST_RETWEETS",
  "TWITTER_GET_POST_USAGE",
  "TWITTER_GET_RECENT_DM_EVENTS",
  "TWITTER_GET_SPACE_BY_ID",
  "TWITTER_GET_SPACE_POSTS",
  "TWITTER_GET_SPACES_BY_CREATORS",
  "TWITTER_GET_SPACES_BY_IDS",
  "TWITTER_GET_SPACE_TICKET_BUYERS",
  "TWITTER_GET_USER_BY_ID",
  "TWITTER_GET_USER_FOLLOWED_LISTS",
  "TWITTER_GET_USER_LIST_MEMBERSHIPS",
  "TWITTER_GET_USER_OWNED_LISTS",
  "TWITTER_GET_USER_PINNED_LISTS",
  "TWITTER_GET_USERS_BY_IDS",
  "TWITTER_LIST_POST_LIKERS",
  "TWITTER_LIST_POSTS_TIMELINE_BY_LIST_ID",
  "TWITTER_POST_LOOKUP_BY_POST_ID",
  "TWITTER_POST_LOOKUP_BY_POST_IDS",
  "TWITTER_RECENT_SEARCH",
  "TWITTER_RETRIEVE_DM_CONVERSATION_EVENTS",
  "TWITTER_RETRIEVE_POSTS_THAT_QUOTE_A_POST",
  "TWITTER_RETURNS_POST_OBJECTS_LIKED_BY_THE_PROVIDED_USER_ID",
  "TWITTER_SEARCH_FULL_ARCHIVE_COUNTS",
  "TWITTER_SEARCH_RECENT_COUNTS",
  "TWITTER_SEARCH_SPACES",
  "TWITTER_USER_HOME_TIMELINE_BY_USER_ID",
  "TWITTER_USER_LOOKUP_BY_USERNAME",
  "TWITTER_USER_LOOKUP_BY_USERNAMES",
  "TWITTER_USER_LOOKUP_ME",
]);

/** Whether the agent may call this slug at all (a Twitter action that is not blocked). */
export function isAllowedSlug(slug: string): boolean {
  return slug.startsWith("TWITTER_") && !BLOCKED_SLUGS.has(slug);
}

/**
 * Whether a call to this slug must be approved by a human first. Fail-safe: only
 * a slug positively known to be read-only is ungated; everything else is a write.
 */
export function isWriteSlug(slug: string): boolean {
  return !READ_SLUGS.has(slug);
}

/**
 * Turn a Composio SDK error into a concise, actionable message. Composio throws
 * a `ComposioToolExecutionError` whose top-level `message` is opaque ("Error
 * executing the tool X"); the real reason and fix are nested under
 * `cause.error.error` (e.g. "No connected account found... Connect your twitter
 * account first"). Surface that so the user sees what to actually do.
 */
export function describeComposioError(err: unknown): string {
  if (err && typeof err === "object") {
    const cause = (err as { cause?: unknown }).cause;
    // Dig through the known nesting: cause.error.error, cause.error, then cause.
    const layers = [
      (cause as { error?: { error?: unknown } } | undefined)?.error?.error,
      (cause as { error?: unknown } | undefined)?.error,
      cause,
    ];
    for (const layer of layers) {
      if (layer && typeof layer === "object" && "message" in layer) {
        const msg = (layer as { message?: unknown }).message;
        const fix = (layer as { suggested_fix?: unknown }).suggested_fix;
        if (typeof msg === "string" && msg) {
          return typeof fix === "string" && fix ? `${msg} (${fix})` : msg;
        }
      }
    }
    const top = (err as { message?: unknown }).message;
    if (typeof top === "string" && top) return top;
  }
  return String(err);
}

/** A posted tweet: its id and a permalink the user can open. */
export interface PostedTweet {
  readonly id: string;
  readonly url: string;
}

/** The shape Composio returns from `tools.execute`, and what our executor passes through. */
export interface ExecResult {
  readonly successful: boolean;
  readonly data: Record<string, unknown>;
  readonly error: string | null;
}

/** Executes a single Twitter action. Injected so thread logic stays network-free. */
export type TwitterExec = (slug: string, args: Record<string, unknown>) => Promise<ExecResult>;

/** A username-agnostic permalink that redirects to the tweet. */
export function tweetUrl(id: string): string {
  return `https://x.com/i/web/status/${id}`;
}

/**
 * Pull the created tweet's id out of a Composio response. The X v2 API nests the
 * tweet under `data.id`; Composio wraps its own payload under `data`, so the id
 * commonly lands at `data.data.id`. We also accept a flat `data.id`. Returns null
 * when no id is present, so the caller can report "posted but unreadable" rather
 * than fabricate a link.
 */
export function extractTweet(data: Record<string, unknown>): PostedTweet | null {
  const inner = (data as { data?: unknown }).data;
  const id =
    pickId(inner) ?? pickId(data) ?? null;
  return id ? { id, url: tweetUrl(id) } : null;
}

function pickId(value: unknown): string | null {
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
    if (typeof id === "number") return String(id);
  }
  return null;
}

/** The result of publishing a thread. */
export interface ThreadResult {
  /** Tweets that went out, in order. */
  readonly posted: PostedTweet[];
  /** Index (0-based) of the tweet that failed, if the thread did not fully post. */
  readonly failedAt?: number;
  /** Why it stopped, if it stopped early. */
  readonly error?: string;
}

/**
 * Publish a thread by posting each tweet as a reply to the previous one. The
 * first tweet replies to `replyToId` when the thread is itself a reply to an
 * existing tweet. Each tweet is humanized (em dashes stripped) so what goes live
 * matches the approved preview. On any failure it stops immediately and returns
 * what was already posted, so a thread never silently half-posts and a resume can
 * see exactly where it stopped.
 */
export async function postThread(
  tweets: readonly string[],
  opts: { readonly replyToId?: string },
  exec: TwitterExec,
): Promise<ThreadResult> {
  const posted: PostedTweet[] = [];
  let inReplyTo = opts.replyToId;

  for (let i = 0; i < tweets.length; i++) {
    const args: Record<string, unknown> = { text: humanizeText(tweets[i]) };
    if (inReplyTo) args.reply_in_reply_to_tweet_id = inReplyTo;

    const res = await exec(CREATE_POST_SLUG, args);
    if (!res.successful) {
      return { posted, failedAt: i, error: res.error ?? "post failed" };
    }
    const tweet = extractTweet(res.data);
    if (!tweet) {
      return { posted, failedAt: i, error: "posted but could not read the tweet id from the response" };
    }
    posted.push(tweet);
    inReplyTo = tweet.id;
  }

  return { posted };
}
