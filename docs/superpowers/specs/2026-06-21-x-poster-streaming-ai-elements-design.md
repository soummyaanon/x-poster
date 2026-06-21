# x-poster — Full Streaming + AI Elements Upgrade

**Date:** 2026-06-21
**Status:** Approved (design) — pending spec review

## Summary

`x-poster` is a Next.js + eve agent that drafts high-performing X (Twitter) posts:
the user picks a category, the agent researches a timely angle, and returns three
copy-paste-ready drafts optimized for the X "For You" ranker. The user posts manually
— the agent never publishes.

Today the frontend (`app/_components/agent-chat.tsx` + `agent-message.tsx`) calls
`useEveAgent()` but renders only four part types (`text`, `reasoning`, `dynamic-tool`,
`step-start`). eve's stream emits far more, and the project already vendors the entire
AI Elements component library (~50 components) that goes almost entirely unused.

This upgrade surfaces eve's full stream through the matching AI Elements components and
turns the three final drafts into interactive cards with **Copy** and **one-click
Post on X** actions.

## Goals

1. **Proper streaming** of the whole eve event stream (research, reasoning, drafts, usage).
2. **Interactive post cards** for the three drafts — live character count, engagement-signal
   badge, **Copy** button, and a **Post on X** button that opens the X composer pre-filled.
3. Surface the four requested eve feature groups:
   - Research **sources + citations**
   - **Reasoning / chain-of-thought**
   - **Live token / context meter** (+ compaction indicator)
   - **Tasks/todo progress + follow-up suggestions** (and subagents, HITL)

## Non-goals (YAGNI)

- Auth/connection OAuth UI (the agent declares no connections).
- Audio / voice / canvas / web-preview AI Elements.
- Persisting the session to `localStorage` (can be added later via the `session` cursor).
- Changing the model (`openai("gpt-5.4-mini")` stays).
- Auto-posting via the X API. "Post on X" only **pre-fills** the composer; the human still
  presses Post. This preserves the existing "you post manually, no X API" guarantee.

## Key decision: structured drafts via a custom tool (Approach A)

The three final drafts become structured data via a custom `compose_drafts` tool the model
calls at the draft step.

- **Why A over a per-turn `outputSchema` (B):** an output schema forces *every* turn —
  including the greeting and category prompt — into structured output, and the result only
  lands at the very end (no progressive streaming). A tool lets the model decide *when* to
  present, keeps the rest of the conversation as normal streamed text, and streams the draft
  args progressively via the `dynamic-tool` part lifecycle.
- **Why A over client-side markdown parsing (C):** parsing "1./2./3." text is brittle and
  carries no clean signal/char metadata. A typed tool schema is robust.

Mechanics confirmed against eve's types (`EveDynamicToolPart`): a `dynamic-tool` part exposes
`input` during `input-streaming` (partial args), then `input-available`, then
`output-available` with `output`. So draft cards can render progressively as the model writes
the tool arguments and finalize when the args complete.

## Architecture / file layout

```
agent/tools/compose_drafts.ts   # NEW: structured-output tool (zod schema + validation)
agent/instructions.md           # EDIT: step 4 calls compose_drafts instead of printing text
lib/drafts.ts                   # NEW: shared Draft type + signal enum (tool + UI import)
lib/usage.ts                    # NEW: derive token usage from agent.events
app/_components/
  agent-chat.tsx                # EDIT: + context meter (header), + suggestions row
  agent-message.tsx             # EDIT: thin dispatcher over the part renderers below
  context-meter.tsx             # NEW: Context component fed by lib/usage + /eve/v1/info
  suggestions.tsx               # NEW: Suggestion chips
  parts/
    reasoning-part.tsx          # Reasoning / ChainOfThought
    tool-part.tsx               # generic tool; web_search/web_fetch -> Sources
    todo-part.tsx               # toolName === "todo" -> Task
    drafts-part.tsx             # toolName === "compose_drafts" -> PostDraft cards  [STAR]
    subagent-part.tsx           # eve.kind === "subagent-call"
    input-request.tsx           # HITL: confirmation / select / text
```

`@/*` path alias maps to project root (`tsconfig.json`), so the frontend imports
`@/lib/drafts`, `@/components/ai-elements/*`. The eve tool (app runtime) imports the shared
schema from `lib/drafts.ts` as documented for tools importing `lib/` code.

## Component / unit responsibilities

### `agent/tools/compose_drafts.ts`
- `inputSchema`: `z.object({ drafts: z.array(z.object({ text: z.string().max(280), signal: z.enum(["reply","repost","profile-click","dwell"]), note: z.string().optional() })).length(3) })`.
- `execute`: returns `{ validated: [{ text, chars, over }] }` (chars = `[...text].length`, over = chars > 280).
- `toModelOutput`: a one-line text summary so the model doesn't re-ingest full draft text.
- Description tells the model: call this exactly once with the three final posts.

### `agent/instructions.md`
- Step 4 ("Present for copy/paste") becomes: call `compose_drafts` with the three posts,
  each tagged with its primary engagement `signal`; do not print the drafts as plain text.
- Steps 1–3 (greet, category list, research narration) stay conversational streamed text.
- Hard rules unchanged (≤280, never invent, no backfiring bait, one idea per post).

### `lib/drafts.ts`
- Exports the `Draft` type, the `SIGNALS` enum/labels, and (optionally) the zod schema so the
  tool and UI share one source of truth. Pure, no React, no server-only imports.

### `lib/usage.ts`
- Pure function: given `agent.events`, sum usage from `step.completed` events into
  `{ input, output, reasoning, cached, total }`. Detect `compaction.completed` presence.

### `app/_components/drafts-part.tsx`  [STAR]
- Reads `part.input.drafts` (works for partial `input-streaming` arrays).
- Per draft: post text, **live char count `n/280`** (neutral <260, amber ≥260, red >280),
  **signal badge**, **[Copy]** (AI Elements `Snippet` copy button), **[Post on X]**.
- **Post on X**: opens `https://x.com/intent/post?text=${encodeURIComponent(text)}` in a new
  tab/window (`target="_blank" rel="noreferrer"`), pre-filling the X composer.
- While `input-streaming` and a given draft is incomplete, show a `Shimmer` placeholder;
  finalize visuals on `input-available` / `output-available`.

### `app/_components/tool-part.tsx`
- `web_search` / `web_fetch` → `Sources` + `SourcesTrigger` ("Used N sources") + `Source`
  links from the tool output.
- Any other tool → existing `Tool` accordion (header/input/output) as a fallback.
- Best-effort `InlineCitation` if the model includes source URLs alongside drafts.

### `app/_components/reasoning-part.tsx`
- Streaming `Reasoning` (auto-collapse on done). Where reasoning interleaves with search,
  prefer `ChainOfThought`. Renders nothing when no reasoning parts arrive.

### `app/_components/context-meter.tsx`
- Header pill `Context ▸ N%`; HoverCard expands to input/output/reasoning/cache breakdown
  (AI Elements `Context*`). Fed by `lib/usage` (used tokens) + `/eve/v1/info` (model id →
  context window via `tokenlens`). Shows a "context compacted" chip when applicable.

### `app/_components/todo-part.tsx`, `subagent-part.tsx`, `input-request.tsx`, `suggestions.tsx`
- `todo` tool → `Task` list. `subagent-call` → distinct header. HITL `input.requested`
  rendered as `confirmation` / `select` / `text` per `inputRequest.display`, answered via
  `agent.send({ inputResponses })` (extends today's logic). Post-turn `Suggestion` chips
  ("Give me variations on #1", "Different angle", "New category") call `sendMessage`.

### `app/_components/agent-message.tsx`
- Becomes a thin dispatcher: switch on `part.type`, and for `dynamic-tool` branch on
  `toolName` (`compose_drafts` / `todo` / `web_*`) and `toolMetadata.eve.kind`
  (`subagent-call`) before falling back to the generic tool renderer.

## Data flow

```
user picks category
  -> agent streams text (greeting / category narration)        text part
  -> agent calls web_search / web_fetch                         dynamic-tool -> Sources
  -> agent streams reasoning                                    reasoning part -> Reasoning/CoT
  -> agent calls compose_drafts({ drafts: [...] })              dynamic-tool(compose_drafts)
       input-streaming -> input-available -> output-available     -> PostDraft cards (shimmer->fill)
  -> turn completes                                             -> Suggestion chips
header pill reads agent.events (usage) + /eve/v1/info (model)   -> Context meter
```

## Streaming / state

- Drive UI off `agent.status` (`ready`/`submitted`/`streaming`/`error`) and per-part `state`.
- Caret on the last streaming assistant text part (already implemented).
- Cards: shimmer while args stream, fill on completion.
- Composer disabled while busy; `stop` wired (already implemented).

## Error handling

- `agent.error` banner stays (already implemented).
- `compose_drafts` with a draft >280: card shows red count; `execute` flags `over:true` so the
  model can self-correct on the next turn.
- `/eve/v1/info` fetch failure: context meter degrades to showing the raw used-token count
  (or hides) rather than throwing.
- Tool `output-error` / `output-denied` states render the existing error/denied affordances.

## Testing / verification

- `npm run typecheck` passes clean.
- `npm run dev`, then manually: pick a category → observe research Sources + reasoning →
  three PostDraft cards stream in.
- **Copy** copies the exact post text; **Post on X** opens the X composer pre-filled.
- A deliberately long draft shows a red over-limit count.
- Context meter shows a non-zero context percentage after a turn.

## Open questions

None blocking. Inline-citation rendering is best-effort and may no-op if the model doesn't
emit source URLs with drafts.
