# Design: X publishing capability for the post-composer agent

**Date:** 2026-06-26
**Status:** Approved for planning
**Author:** brainstormed with the maintainer

## Problem

The `x-poster` eve agent drafts excellent X (Twitter) posts but cannot publish
them. Its core contract (`agent/instructions/00-base.md`) states *"The user posts
manually by copy/paste... You never publish anything and never claim to."* The
maintainer wants the agent to publish to a real X account, plus access a broad
slice of the X API, through [Composio](https://composio.dev).

As of February 2026 Composio no longer ships managed Twitter credentials; this
runs on the maintainer's own X developer app and OAuth connection. That setup is
already done on the Composio side. The `TWITTER` toolkit (slug `TWITTER`, OAuth2,
79 tools) is connected for a Composio user id.

## Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Posting control | **Approve every write.** eve `always()` gate on every state-changing action. |
| Capability surface | **Broad.** Expose most of the 79 Twitter tools. |
| Integration approach | **A — tool-router pattern** (search + execute) on `@composio/core`. |
| Allow-list scope | **Broad, writes gated.** Block only the irrelevant: compliance jobs, streaming, activity subscriptions, OpenAPI-spec fetch. |

### Why Approach A (not dynamic typed tools or an MCP connection)

- **Approach A (chosen):** two authored eve tools — a read-only `x_find_tools`
  discovery tool and a gated `x_run_tool` executor — mirror Composio's own
  search+execute router. The model pulls in only the action it needs, so the
  79-tool surface never bloats context or dilutes the drafting core. Per-tool
  `needsApproval` predicate gives exactly "approve every write, never nag on a
  read" — the only approach that delivers it.
- **Approach B (dynamic typed tools via `defineDynamic`):** one native typed tool
  per action. Best per-action ergonomics, but injects ~70 schemas into context
  every session (token cost, worse drafting focus) and carries eve's
  inline-`execute`/replay constraints. Overkill.
- **Approach C (Composio MCP connection):** least custom code, but connection-level
  approval is all-or-nothing — `always()` would gate even a timeline read,
  `never()` gates nothing. Fights the chosen control model.

## Architecture

### New files

**`agent/lib/composio.ts`** — the only module that touches Composio.
- Singleton `Composio` client from `@composio/core`, constructed lazily from
  `COMPOSIO_API_KEY`. Keyed to `COMPOSIO_USER_ID` (the Composio user whose X
  account is connected).
- `findTwitterTools(query)` — returns curated matching Twitter actions
  (`{ slug, description, inputParams }`) for the discovery tool.
- `executeTwitter(slug, args)` — runs `composio.tools.execute(slug, { userId, arguments })`
  and returns Composio's `{ successful, data, error }`.
- `isWriteSlug(slug)` — the write/read classifier (pure function; the spine of
  approval gating). It holds an explicit set of **read** slugs (lookups, search,
  timeline, analytics, get-* / list-* style actions). **Fail safe:** any slug not
  positively known to be a read is treated as a write and therefore gated. A new
  or misremembered slug errs toward asking for approval, never toward a silent
  write.
- **Surface = block-list, not allow-list** (matches the "broad" decision):
  `isAllowedSlug(slug)` accepts any `TWITTER_*` slug *except* those in
  `BLOCKED_SLUGS` = { `TWITTER_CREATE_COMPLIANCE_JOB`, `TWITTER_GET_COMPLIANCE_JOB`,
  `TWITTER_GET_COMPLIANCE_JOBS`, `TWITTER_STREAM_POST_LABELS`,
  `TWITTER_CREATE_ACTIVITY_SUBSCRIPTION`, `TWITTER_GET_OPENAPI_SPEC` }. New
  Twitter actions Composio adds are available by default; only the listed ones
  are withheld.
- **Not-configured mode:** if `COMPOSIO_API_KEY` is absent, every call returns a
  clean `{ successful: false, error: "X is not configured" }` instead of throwing.
  This is what keeps tests and evals from ever needing the network.

**`agent/tools/x_find_tools.ts`** — `defineTool`, input `{ query: string }`.
Returns the matching allowed actions and their params so the model knows what to
call. Read-only discovery → `needsApproval: never()`.

**`agent/tools/x_run_tool.ts`** — `defineTool`, input `{ slug: string, arguments: record }`.
- `needsApproval`: predicate that returns `true` when `isWriteSlug(toolInput?.slug)`,
  else `false`. Writes pause at `session.waiting`; reads run immediately.
- `execute`: rejects a slug where `isAllowedSlug` is false (blocked or non-Twitter);
  otherwise calls `executeTwitter`. For `TWITTER_CREATION_OF_A_POST`, runs `humanizeText` on
  `arguments.text` first (see "Voice guarantee on live posts").
- `toModelOutput`: shrinks Composio's verbose response to one line, including the
  posted tweet id/URL on success. Never returns raw tokens or unbounded payloads.

**`agent/tools/x_post_thread.ts`** — typed convenience tool, input
`{ tweets: string[] (min 2), replyToId?: string }`.
- Posts the whole thread in code: post 1 → capture id → post 2 with
  `reply_in_reply_to_tweet_id = id1` → and so on. Optional `replyToId` makes the
  thread a reply to an existing tweet.
- One `always()` approval for the entire thread (not N prompts).
- Records each posted id as it goes; on a mid-thread failure it stops and reports
  which tweets landed (with ids) and which did not — never silently half-posts,
  and a replay cannot double-post the already-sent tweets.
- Runs `humanizeText` on each tweet before posting.

### Changed files

**`agent/instructions/00-base.md`** — replace the "never publish" contract with a
publish flow:
- Still research → draft → preview via `compose_drafts`. Previewing is unchanged.
- Publish **only** the specific draft the user chose, and only when they ask.
  Never publish a draft the user has not explicitly picked.
- Map format → tool: `short`/`single`/`long`/`quote` → `x_run_tool` with
  `TWITTER_CREATION_OF_A_POST` (`text`, plus `quote_tweet_id` for a quote);
  `thread` → `x_post_thread` with the `tweets` array.
- The X tool requires your approval; tell the user it is awaiting their OK, and
  report the result (posted URL, or the failure) honestly — never claim a post
  that did not succeed.
- Anything published must have cleared the existing voice / no-date / no-em-dash
  quality bar. Never edit or delete a live post unless the user explicitly says so
  (delete is a gated write).
- Broad reads (search, lookups, timeline, analytics) are available without
  approval to inform drafting; use them, don't spam them.

**`.env.example`** — document `COMPOSIO_API_KEY` and `COMPOSIO_USER_ID`.
**`.env.local`** — add the real values locally (gitignored; never committed).
**`package.json`** — add `@composio/core`.

## Data flow

**Single post / quote (gated):**
user picks draft → model calls `x_run_tool({ slug: "TWITTER_CREATION_OF_A_POST",
arguments: { text, quote_tweet_id? } })` → eve sees a write slug → parks at
`session.waiting` → user approves in the UI → `humanizeText(text)` →
`composio.tools.execute(...)` posts via the X app → returns tweet id/url →
`toModelOutput` → model confirms "posted: ⟨url⟩".

**Thread (gated, one approval):**
model calls `x_post_thread({ tweets })` → one approval → sequential posts with
reply-chaining in code → returns the list of posted ids/urls (or a partial-result
report on failure).

**Read (ungated):**
model calls `x_run_tool` with a read slug (e.g. `TWITTER_RECENT_SEARCH`) → runs
immediately → trimmed result back to the model.

## Voice guarantee on live posts

`compose_drafts` shows the user the **humanized** text (`validateDrafts` runs
`humanizeText`, which strips em/en dashes). The publish path therefore re-runs
`humanizeText` on the text it posts, so the live tweet is byte-for-byte what the
user approved and the no-em-dash guarantee holds on X, not just in the preview.

## Error handling

- Honor Composio's `{ successful, error }`. On `successful === false`, surface a
  concise error and **do not** claim the post went out.
- 401/403 → "reconnect your X account" (token revoked or insufficient access
  tier). X over-length 4xx → tell the model to shorten and retry.
- Thread partial failure → report posted ids vs the failed index.
- Non-idempotent posting is made replay-safe by the approval gate (a re-run step
  can't re-fire a write without a fresh human decision) and, for threads, by
  recording posted ids so already-sent tweets are skipped on resume.
- The Composio token is resolved server-side and never enters model context;
  tool outputs are minimized via `toModelOutput`.

## Testing

- Unit-test `isWriteSlug` and the allow/block list (pure functions, the spine of
  safety) — same style as the existing `agent/lib/drafts.test.ts`.
- Unit-test `x_post_thread` chaining + partial-failure reporting against a mocked
  `executeTwitter`.
- Mock `@composio/core` everywhere; **no test or eval ever hits the network or
  posts a real tweet.** Missing `COMPOSIO_API_KEY` → tools return the clean
  "not configured" error, which tests assert on.
- `npm run typecheck` and `npm test` must pass.

## Out of scope (YAGNI)

- Media upload (images/video) and polls — the chunked-upload flow is its own
  project; v1 publishes text, threads, and quotes.
- Multi-user / per-end-user X accounts — this is a single connected account keyed
  by one `COMPOSIO_USER_ID`.
- Scheduling / a post queue — publishing is synchronous and user-approved.
- A UI "post" button — v1 drives publishing through the chat flow + approval gate.
