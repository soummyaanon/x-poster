# x-poster Streaming + AI Elements Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface eve's full event stream through the vendored AI Elements components and turn the three final post drafts into interactive cards (live char count, signal badge, Copy, one-click Post on X).

**Architecture:** A custom `compose_drafts` tool carries the three drafts as structured args that stream into the UI as cards. The current one-big-switch `agent-message.tsx` is decomposed into focused per-part renderers under `app/_components/parts/`. Pure logic (`lib/drafts.ts`, `lib/usage.ts`, `lib/model.ts`) is unit-tested with vitest; React renderers are gated by `npm run typecheck` plus a manual dev checklist.

**Tech Stack:** Next.js 16 (App Router) · React 19 · eve 0.11.10 (`useEveAgent`, `defineTool`) · AI SDK 7.0.0-beta.178 · AI Elements (vendored in `components/ai-elements/`) · tokenlens · zod 4 · vitest (new dev dep).

## Global Constraints

Every task inherits these (copied from the spec):

- **No auto-posting.** "Post on X" only opens `https://x.com/intent/post?text=<encoded>` to **pre-fill** the composer. The human still presses Post. No X API. This preserves the project's "you post manually" guarantee.
- **≤ 280 characters per post** is the target. The schema does NOT hard-cap text length; over-limit drafts render red and `validateDrafts` flags `over: true` so the model can self-correct.
- **Char counting** uses Unicode code points (`[...text].length`), a close approximation of X's counter. `MAX_TWEET_CHARS = 280`.
- **Model is unchanged:** `agent/agent.ts` stays `openai("gpt-5.4-mini")`. The frontend mirrors the id as `MODEL_ID` in `lib/model.ts` (keep in sync).
- **No new runtime deps.** Only `vitest` is added (devDependency). `tokenlens`, `lucide-react`, `zod`, `ai` are already installed.
- **Browser components** that use hooks/`useEveAgent`/`window` start with `"use client";`.
- **Imports:** frontend uses the `@/*` alias (maps to repo root); the eve tool imports shared logic from `lib/` via a relative path (`../../lib/drafts`), which eve's runtime supports.
- **eve docs first:** per `AGENTS.md`, the relevant guides live in `node_modules/eve/docs/` (`tools/overview.mdx`, `guides/frontend/overview.mdx`, `concepts/sessions-runs-and-streaming.md`).

---

## Task 1: Shared draft module + test infra

**Files:**
- Create: `lib/drafts.ts`
- Create: `lib/drafts.test.ts`
- Modify: `package.json` (add `vitest` dev dep + `test` script)

**Interfaces:**
- Produces:
  - `MAX_TWEET_CHARS: number` (= 280)
  - `SIGNALS: readonly ["reply","repost","profile-click","dwell"]`, `type Signal`
  - `SIGNAL_LABELS: Record<Signal, string>`
  - `draftSchema` (zod), `type Draft = { text: string; signal: Signal; note?: string }`
  - `composeDraftsInputSchema` (zod), `type ComposeDraftsInput = { drafts: Draft[] }`
  - `countChars(text: string): number`
  - `type ValidatedDraft = { text: string; signal: Signal; note?: string; chars: number; over: boolean }`
  - `validateDrafts(drafts: readonly Draft[]): ValidatedDraft[]`

- [ ] **Step 1: Install vitest and add the test script**

Run:
```bash
npm install -D vitest
npm pkg set scripts.test="vitest run"
```

- [ ] **Step 2: Write the failing test**

Create `lib/drafts.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  MAX_TWEET_CHARS,
  composeDraftsInputSchema,
  countChars,
  validateDrafts,
} from "./drafts";

describe("countChars", () => {
  it("counts plain ascii by length", () => {
    expect(countChars("hello")).toBe(5);
  });

  it("counts an emoji as one code point", () => {
    expect(countChars("👍")).toBe(2); // 👍 is a single code point -> 2? see note
  });
});

describe("validateDrafts", () => {
  it("flags an over-limit draft", () => {
    const long = "x".repeat(MAX_TWEET_CHARS + 1);
    const [result] = validateDrafts([{ text: long, signal: "reply" }]);
    expect(result.chars).toBe(MAX_TWEET_CHARS + 1);
    expect(result.over).toBe(true);
  });

  it("does not flag a draft at the limit", () => {
    const exact = "x".repeat(MAX_TWEET_CHARS);
    const [result] = validateDrafts([{ text: exact, signal: "dwell" }]);
    expect(result.over).toBe(false);
  });
});

describe("composeDraftsInputSchema", () => {
  it("requires exactly three drafts", () => {
    const ok = composeDraftsInputSchema.safeParse({
      drafts: [
        { text: "a", signal: "reply" },
        { text: "b", signal: "repost" },
        { text: "c", signal: "dwell" },
      ],
    });
    expect(ok.success).toBe(true);

    const tooFew = composeDraftsInputSchema.safeParse({
      drafts: [{ text: "a", signal: "reply" }],
    });
    expect(tooFew.success).toBe(false);
  });

  it("rejects an unknown signal", () => {
    const bad = composeDraftsInputSchema.safeParse({
      drafts: [
        { text: "a", signal: "viral" },
        { text: "b", signal: "reply" },
        { text: "c", signal: "dwell" },
      ],
    });
    expect(bad.success).toBe(false);
  });
});
```

> Note on the emoji assertion: `[..."👍"].length` is `1` (👍 is one code point). Correct the expectation to `1` in Step 4 after running — written here as a deliberate failing value to confirm the test runs.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- lib/drafts.test.ts`
Expected: FAIL — `Cannot find module './drafts'` (file not created yet).

- [ ] **Step 4: Implement `lib/drafts.ts`**

Create `lib/drafts.ts`:
```ts
import { z } from "zod";

export const MAX_TWEET_CHARS = 280;

export const SIGNALS = ["reply", "repost", "profile-click", "dwell"] as const;
export type Signal = (typeof SIGNALS)[number];

export const SIGNAL_LABELS: Record<Signal, string> = {
  reply: "Invites replies",
  repost: "Worth reposting",
  "profile-click": "Earns profile clicks",
  dwell: "Rewards dwell time",
};

export const draftSchema = z.object({
  text: z.string().min(1),
  signal: z.enum(SIGNALS),
  note: z.string().optional(),
});
export type Draft = z.infer<typeof draftSchema>;

export const composeDraftsInputSchema = z.object({
  drafts: z.array(draftSchema).length(3),
});
export type ComposeDraftsInput = z.infer<typeof composeDraftsInputSchema>;

export function countChars(text: string): number {
  return [...text].length;
}

export interface ValidatedDraft {
  readonly text: string;
  readonly signal: Signal;
  readonly note?: string;
  readonly chars: number;
  readonly over: boolean;
}

export function validateDrafts(drafts: readonly Draft[]): ValidatedDraft[] {
  return drafts.map((draft) => {
    const chars = countChars(draft.text);
    return {
      text: draft.text,
      signal: draft.signal,
      note: draft.note,
      chars,
      over: chars > MAX_TWEET_CHARS,
    };
  });
}
```

Then fix the emoji expectation in `lib/drafts.test.ts` Step 2 from `toBe(2)` to `toBe(1)`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- lib/drafts.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.
```bash
git add lib/drafts.ts lib/drafts.test.ts package.json package-lock.json
git commit -m "feat: shared draft schema + validation with vitest"
```

---

## Task 2: `compose_drafts` tool + instructions update

**Files:**
- Create: `agent/tools/compose_drafts.ts`
- Modify: `agent/instructions.md` (rewrite step 4)

**Interfaces:**
- Consumes: `composeDraftsInputSchema`, `validateDrafts` from `lib/drafts` (Task 1).
- Produces: a tool named `compose_drafts` whose `dynamic-tool` part carries `input = { drafts: Draft[] }` and `output = { drafts: ValidatedDraft[] }`.

- [ ] **Step 1: Implement the tool**

Create `agent/tools/compose_drafts.ts`:
```ts
import { defineTool } from "eve/tools";
import { composeDraftsInputSchema, validateDrafts } from "../../lib/drafts";

export default defineTool({
  description:
    "Present the three final X post drafts to the user. Call this exactly once, " +
    "after research, with the three finished posts. Each `text` is the post body only " +
    "(no preamble, no numbering, no surrounding quotes). Tag each with the single " +
    "engagement `signal` it most targets. Optionally add a short `note` explaining the " +
    "angle. Calling this tool IS how the user sees the drafts — never also print them as text.",
  inputSchema: composeDraftsInputSchema,
  execute({ drafts }) {
    return { drafts: validateDrafts(drafts) };
  },
  toModelOutput(output) {
    const summary = output.drafts
      .map(
        (draft, index) =>
          `#${index + 1} ${draft.chars}/280${draft.over ? " (OVER LIMIT — shorten this one)" : ""} [${draft.signal}]`,
      )
      .join("; ");
    return {
      type: "text",
      value: `Presented ${output.drafts.length} drafts to the user: ${summary}.`,
    };
  },
});
```

- [ ] **Step 2: Rewrite step 4 of `agent/instructions.md`**

Replace the existing step 4 block (the "**Present for copy/paste.**" paragraph, lines ~28-32) with:
```md
4. **Present via the `compose_drafts` tool.** Call `compose_drafts` exactly once with the
   three posts. For each, pass the post `text` (the body only — no numbering, no preamble,
   no surrounding quotes), the primary engagement `signal` it targets
   (`reply` | `repost` | `profile-click` | `dwell`), and optionally a short `note` on the
   angle. Do NOT print the drafts as plain text — the tool call is how the user sees them.
   After the tool returns, briefly ask whether they want variations on any option, a
   different angle, or a new category.
```

Leave steps 1-3, Categories, and Hard rules unchanged. In the Hard rules, change the
"**Post text only.**" bullet to read:
```md
- **Post text only.** Each draft's `text` is just the post body. Put any commentary in the
  draft's `note` field or in your message — never inside the post text.
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the relative import `../../lib/drafts` resolves).

- [ ] **Step 4: Commit**

```bash
git add agent/tools/compose_drafts.ts agent/instructions.md
git commit -m "feat: compose_drafts tool for structured post drafts"
```

---

## Task 3: Usage aggregation + model context window

**Files:**
- Create: `lib/usage.ts`
- Create: `lib/usage.test.ts`
- Create: `lib/model.ts`

**Interfaces:**
- Produces:
  - `lib/usage.ts`: `type DerivedUsage = { usedTokens: number; usage: LanguageModelUsage; compacted: boolean }`; `deriveUsage(events): DerivedUsage`.
  - `lib/model.ts`: `MODEL_ID: string`; `getMaxContextTokens(modelId?: string): number`.

- [ ] **Step 1: Write the failing test for `deriveUsage`**

Create `lib/usage.test.ts`:
```ts
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
      { type: "step.completed", data: { usage: { inputTokens: 250, outputTokens: 40, cacheReadTokens: 30 } } },
    ]);
    expect(result.usedTokens).toBe(290);
    expect(result.usage.inputTokens).toBe(250);
    expect(result.usage.outputTokens).toBe(40);
    expect(result.usage.cachedInputTokens).toBe(30);
  });

  it("detects compaction", () => {
    const result = deriveUsage([{ type: "compaction.completed", data: {} }]);
    expect(result.compacted).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/usage.test.ts`
Expected: FAIL — `Cannot find module './usage'`.

- [ ] **Step 3: Implement `lib/usage.ts`**

Create `lib/usage.ts`:
```ts
import type { LanguageModelUsage } from "ai";

export interface DerivedUsage {
  readonly usedTokens: number;
  readonly usage: LanguageModelUsage;
  readonly compacted: boolean;
}

type StreamEventLike = {
  readonly type: string;
  readonly data?: Record<string, unknown>;
};

const EMPTY_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

/**
 * Derives a context-occupancy snapshot from the eve stream. Uses the most
 * recent `step.completed` usage (the prompt size of the latest model call is
 * the most meaningful "how full is the window" gauge), and reports whether the
 * session was compacted.
 */
export function deriveUsage(events: readonly StreamEventLike[]): DerivedUsage {
  let usage: LanguageModelUsage = EMPTY_USAGE;
  let usedTokens = 0;
  let compacted = false;

  for (const event of events) {
    if (event.type === "compaction.completed") {
      compacted = true;
    }
    if (event.type === "step.completed") {
      const stepUsage = (event.data as { usage?: Record<string, number | undefined> } | undefined)
        ?.usage;
      if (stepUsage) {
        const inputTokens = stepUsage.inputTokens ?? 0;
        const outputTokens = stepUsage.outputTokens ?? 0;
        const cachedInputTokens = stepUsage.cacheReadTokens ?? 0;
        usage = {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cachedInputTokens,
        };
        usedTokens = inputTokens + outputTokens;
      }
    }
  }

  return { usedTokens, usage, compacted };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/usage.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `lib/model.ts`**

Create `lib/model.ts`:
```ts
import { getContextWindow } from "tokenlens";

// Keep in sync with the model string in agent/agent.ts.
export const MODEL_ID = "gpt-5.4-mini";

const DEFAULT_MAX_CONTEXT_TOKENS = 400_000;

/**
 * Resolves the model's context window via tokenlens, falling back to a sane
 * default when the catalog doesn't know the model id.
 */
export function getMaxContextTokens(modelId: string = MODEL_ID): number {
  try {
    const window = getContextWindow(modelId);
    return (
      window.combinedMax ??
      window.totalMax ??
      window.inputMax ??
      DEFAULT_MAX_CONTEXT_TOKENS
    );
  } catch {
    return DEFAULT_MAX_CONTEXT_TOKENS;
  }
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.
```bash
git add lib/usage.ts lib/usage.test.ts lib/model.ts
git commit -m "feat: usage aggregation + model context-window helper"
```

---

## Task 4: Draft cards renderer ★

**Files:**
- Create: `app/_components/parts/drafts-part.tsx`

**Interfaces:**
- Consumes: `MAX_TWEET_CHARS`, `SIGNAL_LABELS`, `countChars`, `type Signal` from `@/lib/drafts`; `EveDynamicToolPart` from `eve/react`; `Card`/`CardContent`/`CardFooter` from `@/components/ui/card`; `Button` from `@/components/ui/button`; `Badge` from `@/components/ui/badge`; `Shimmer` from `@/components/ai-elements/shimmer`.
- Produces: `export function DraftsPart({ part }: { readonly part: EveDynamicToolPart })`.

- [ ] **Step 1: Implement the component**

Create `app/_components/parts/drafts-part.tsx`:
```tsx
"use client";

import type { EveDynamicToolPart } from "eve/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  MAX_TWEET_CHARS,
  SIGNAL_LABELS,
  type Signal,
  countChars,
} from "@/lib/drafts";
import { cn } from "@/lib/utils";

const X_INTENT_URL = "https://x.com/intent/post";
const NEAR_LIMIT = MAX_TWEET_CHARS - 20;

interface PartialDraft {
  readonly text?: string;
  readonly signal?: Signal;
  readonly note?: string;
}

function readDrafts(input: unknown): readonly PartialDraft[] {
  if (
    input &&
    typeof input === "object" &&
    Array.isArray((input as { drafts?: unknown }).drafts)
  ) {
    return (input as { drafts: PartialDraft[] }).drafts;
  }
  return [];
}

export function DraftsPart({ part }: { readonly part: EveDynamicToolPart }) {
  const drafts = readDrafts(part.input);
  const streaming = part.state === "input-streaming";

  if (drafts.length === 0) {
    return <Shimmer>Composing drafts…</Shimmer>;
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.map((draft, index) => (
        <DraftCard draft={draft} index={index} key={index} streaming={streaming} />
      ))}
    </div>
  );
}

function DraftCard({
  draft,
  index,
  streaming,
}: {
  readonly draft: PartialDraft;
  readonly index: number;
  readonly streaming: boolean;
}) {
  const text = draft.text ?? "";
  const chars = countChars(text);
  const over = chars > MAX_TWEET_CHARS;
  const near = !over && chars >= NEAR_LIMIT;

  if (streaming && text.length === 0) {
    return (
      <Card className="p-4">
        <Shimmer>Drafting option {index + 1}…</Shimmer>
      </Card>
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Option {index + 1}</span>
          {draft.signal ? (
            <Badge variant="secondary">{SIGNAL_LABELS[draft.signal]}</Badge>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
        {draft.note ? (
          <p className="text-muted-foreground text-xs italic">{draft.note}</p>
        ) : null}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2">
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            over
              ? "text-destructive"
              : near
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
          )}
        >
          {chars}/{MAX_TWEET_CHARS}
        </span>
        <div className="flex items-center gap-2">
          <CopyButton text={text} />
          <Button
            onClick={() =>
              window.open(
                `${X_INTENT_URL}?text=${encodeURIComponent(text)}`,
                "_blank",
                "noopener,noreferrer",
              )
            }
            size="sm"
            type="button"
            variant="default"
          >
            Post on X
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function CopyButton({ text }: { readonly text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [text]);

  return (
    <Button onClick={onCopy} size="sm" type="button" variant="outline">
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/_components/parts/drafts-part.tsx
git commit -m "feat: interactive post-draft cards (copy + post on X)"
```

---

## Task 5: Tool + Sources renderer

**Files:**
- Create: `app/_components/parts/tool-part.tsx`

**Interfaces:**
- Consumes: `EveDynamicToolPart` from `eve/react`; `Sources`/`SourcesContent`/`SourcesTrigger`/`Source` from `@/components/ai-elements/sources`; `Tool`/`ToolContent`/`ToolHeader`/`ToolInput`/`ToolOutput` from `@/components/ai-elements/tool`.
- Produces: `export function ToolPart({ part }: { readonly part: EveDynamicToolPart })`.

- [ ] **Step 1: Implement the component**

Create `app/_components/parts/tool-part.tsx`:
```tsx
"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

const SEARCH_TOOLS = new Set(["web_search", "web_fetch"]);

interface SourceLink {
  readonly url: string;
  readonly title?: string;
}

function readSources(output: unknown): SourceLink[] {
  const found: SourceLink[] = [];

  const visit = (value: unknown) => {
    if (!value) {
      return;
    }
    if (typeof value === "string") {
      if (/^https?:\/\//.test(value)) {
        found.push({ url: value });
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.url === "string") {
        found.push({
          url: record.url,
          title: typeof record.title === "string" ? record.title : undefined,
        });
      }
      for (const item of Object.values(record)) {
        visit(item);
      }
    }
  };

  visit(output);

  const seen = new Set<string>();
  return found.filter((source) => {
    if (seen.has(source.url)) {
      return false;
    }
    seen.add(source.url);
    return true;
  });
}

export function ToolPart({ part }: { readonly part: EveDynamicToolPart }) {
  const isSearch = SEARCH_TOOLS.has(part.toolName);
  const output = part.state === "output-available" ? part.output : undefined;
  const sources = isSearch && output ? readSources(output) : [];

  return (
    <div className="flex flex-col gap-2">
      {sources.length > 0 ? (
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source) => (
              <Source href={source.url} key={source.url} title={source.title ?? source.url} />
            ))}
          </SourcesContent>
        </Sources>
      ) : null}
      <Tool>
        <ToolHeader
          state={part.state}
          title={part.toolName}
          toolName={part.toolName}
          type="dynamic-tool"
        />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput
            errorText={part.state === "output-error" ? part.errorText : undefined}
            output={part.state === "output-available" ? part.output : undefined}
          />
        </ToolContent>
      </Tool>
    </div>
  );
}
```

> If `npm run typecheck` rejects the extra `toolName` prop on `ToolHeader`, drop it — the current `agent-message.tsx` passes it today, so it is expected to compile. Match whatever the existing file does.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/_components/parts/tool-part.tsx
git commit -m "feat: tool renderer with research sources"
```

---

## Task 6: Todo (Task) renderer

**Files:**
- Create: `app/_components/parts/todo-part.tsx`

**Interfaces:**
- Consumes: `EveDynamicToolPart` from `eve/react`; `Task`/`TaskContent`/`TaskItem`/`TaskTrigger` from `@/components/ai-elements/task`. Reads `part.input.todos` (built-in todo tool shape: `{ content, priority, status }[]`).
- Produces: `export function TodoPart({ part }: { readonly part: EveDynamicToolPart })`.

- [ ] **Step 1: Implement the component**

Create `app/_components/parts/todo-part.tsx`:
```tsx
"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";

type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

interface Todo {
  readonly content: string;
  readonly status?: TodoStatus;
}

const STATUS_MARK: Record<TodoStatus, string> = {
  pending: "○",
  in_progress: "◐",
  completed: "●",
  cancelled: "✕",
};

function readTodos(input: unknown): readonly Todo[] {
  if (
    input &&
    typeof input === "object" &&
    Array.isArray((input as { todos?: unknown }).todos)
  ) {
    return (input as { todos: Todo[] }).todos;
  }
  return [];
}

export function TodoPart({ part }: { readonly part: EveDynamicToolPart }) {
  const todos = readTodos(part.input);
  if (todos.length === 0) {
    return null;
  }

  const done = todos.filter((todo) => todo.status === "completed").length;

  return (
    <Task>
      <TaskTrigger title={`Tasks (${done}/${todos.length})`} />
      <TaskContent>
        {todos.map((todo, index) => (
          <TaskItem key={index}>
            <span className="mr-2 text-muted-foreground">
              {STATUS_MARK[todo.status ?? "pending"]}
            </span>
            <span className={todo.status === "completed" ? "text-muted-foreground line-through" : ""}>
              {todo.content}
            </span>
          </TaskItem>
        ))}
      </TaskContent>
    </Task>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/_components/parts/todo-part.tsx
git commit -m "feat: todo progress renderer (Task)"
```

---

## Task 7: Reasoning + Subagent renderers

**Files:**
- Create: `app/_components/parts/reasoning-part.tsx`
- Create: `app/_components/parts/subagent-part.tsx`

**Interfaces:**
- Produces:
  - `export function ReasoningPart({ text, streaming }: { readonly text: string; readonly streaming: boolean })`
  - `export function SubagentPart({ part }: { readonly part: EveDynamicToolPart })`

- [ ] **Step 1: Implement `reasoning-part.tsx`**

Create `app/_components/parts/reasoning-part.tsx`:
```tsx
"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";

export function ReasoningPart({
  text,
  streaming,
}: {
  readonly text: string;
  readonly streaming: boolean;
}) {
  return (
    <Reasoning defaultOpen={false} isStreaming={streaming}>
      <ReasoningTrigger />
      <ReasoningContent>{text}</ReasoningContent>
    </Reasoning>
  );
}
```

- [ ] **Step 2: Implement `subagent-part.tsx`**

Create `app/_components/parts/subagent-part.tsx`:
```tsx
"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";

function describeState(state: EveDynamicToolPart["state"]): string {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return "Delegating…";
    case "output-available":
      return "Subagent finished.";
    case "output-error":
      return "Subagent failed.";
    case "output-denied":
      return "Delegation denied.";
    default:
      return "Working…";
  }
}

export function SubagentPart({ part }: { readonly part: EveDynamicToolPart }) {
  const name = part.toolMetadata?.eve?.name ?? part.toolName;
  return (
    <Task>
      <TaskTrigger title={`Delegated to ${name}`} />
      <TaskContent>
        <TaskItem>{describeState(part.state)}</TaskItem>
      </TaskContent>
    </Task>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.
```bash
git add app/_components/parts/reasoning-part.tsx app/_components/parts/subagent-part.tsx
git commit -m "feat: reasoning + subagent renderers"
```

---

## Task 8: HITL input-request renderer

**Files:**
- Create: `app/_components/parts/input-request.tsx`

**Interfaces:**
- Consumes: `EveDynamicToolPart` from `eve/react`; `Button` from `@/components/ui/button`. Reads `part.toolMetadata.eve.inputRequest` / `inputResponse`.
- Produces: `export type AgentInputResponse = { optionId?: string; requestId: string; text?: string }`; `export function InputRequest({ canRespond, part, onInputResponses })`.

- [ ] **Step 1: Implement the component**

Create `app/_components/parts/input-request.tsx`:
```tsx
"use client";

import type { EveDynamicToolPart } from "eve/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

export function InputRequest({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  const [freeform, setFreeform] = useState("");

  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId,
  );

  if (inputResponse) {
    return (
      <div className="space-y-1 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
        <p className="text-muted-foreground text-sm">{inputRequest.prompt}</p>
        <p className="font-medium text-sm">
          Responded: {selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId}
        </p>
      </div>
    );
  }

  const allowFreeform = inputRequest.allowFreeform || inputRequest.display === "text";

  return (
    <div className="space-y-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
      <p className="text-muted-foreground text-sm">{inputRequest.prompt}</p>

      {inputRequest.options && inputRequest.options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  { optionId: option.id, requestId: inputRequest.requestId },
                ]);
              }}
              size="sm"
              type="button"
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}

      {allowFreeform ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = freeform.trim();
            if (!text) {
              return;
            }
            void onInputResponses([{ requestId: inputRequest.requestId, text }]);
            setFreeform("");
          }}
        >
          <input
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
            disabled={!canRespond}
            onChange={(event) => setFreeform(event.target.value)}
            placeholder="Type your answer…"
            value={freeform}
          />
          <Button disabled={!canRespond} size="sm" type="submit" variant="default">
            Send
          </Button>
        </form>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.
```bash
git add app/_components/parts/input-request.tsx
git commit -m "feat: HITL input-request renderer with freeform support"
```

---

## Task 9: Message dispatcher rewrite

**Files:**
- Modify: `app/_components/agent-message.tsx` (replace entire file)

**Interfaces:**
- Consumes: all Task 4-8 renderers; `EveMessage`/`EveMessagePart`/`EveDynamicToolPart` from `eve/react`; `Message`/`MessageContent`/`MessageResponse` from `@/components/ai-elements/message`; `AgentInputResponse` from `./parts/input-request`.
- Produces: `export { AgentMessage }`; re-exports `export type { AgentInputResponse } from "./parts/input-request"` (so `agent-chat.tsx` keeps compiling).

- [ ] **Step 1: Replace `app/_components/agent-message.tsx`**

```tsx
"use client";

import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { DraftsPart } from "./parts/drafts-part";
import { InputRequest } from "./parts/input-request";
import { ReasoningPart } from "./parts/reasoning-part";
import { SubagentPart } from "./parts/subagent-part";
import { TodoPart } from "./parts/todo-part";
import { ToolPart } from "./parts/tool-part";

export type { AgentInputResponse } from "./parts/input-request";
import type { AgentInputResponse } from "./parts/input-request";

export function AgentMessage({
  canRespond,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
}) {
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );

  return (
    <Message
      data-optimistic={message.metadata?.optimistic ? "true" : undefined}
      from={message.role}
    >
      <MessageContent>
        {message.parts.map((part, index) => (
          <AgentMessagePart
            canRespond={canRespond}
            key={partKey(part, index)}
            onInputResponses={onInputResponses}
            part={part}
            showCaret={isStreaming && message.role === "assistant" && index === lastTextIndex}
          />
        ))}
      </MessageContent>
    </Message>
  );
}

function AgentMessagePart({
  canRespond,
  onInputResponses,
  part,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
}) {
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return (
        <MessageResponse caret="block" isAnimating={showCaret}>
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return <ReasoningPart streaming={part.state === "streaming"} text={part.text} />;
    case "dynamic-tool":
      return (
        <DynamicToolPart
          canRespond={canRespond}
          onInputResponses={onInputResponses}
          part={part}
        />
      );
    default:
      return null;
  }
}

function DynamicToolPart({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  if (part.toolMetadata?.eve?.inputRequest) {
    return (
      <InputRequest canRespond={canRespond} onInputResponses={onInputResponses} part={part} />
    );
  }
  if (part.toolName === "compose_drafts") {
    return <DraftsPart part={part} />;
  }
  if (part.toolName === "todo") {
    return <TodoPart part={part} />;
  }
  if (part.toolMetadata?.eve?.kind === "subagent-call") {
    return <SubagentPart part={part} />;
  }
  return <ToolPart part={part} />;
}

function partKey(part: EveMessagePart, index: number): string {
  if (part.type === "dynamic-tool") {
    return part.toolCallId;
  }
  return `${part.type}:${index}`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (`agent-chat.tsx` is unchanged and still imports `AgentMessage`.)

- [ ] **Step 3: Commit**

```bash
git add app/_components/agent-message.tsx
git commit -m "refactor: agent-message as thin part dispatcher"
```

---

## Task 10: Suggestions component + wiring

**Files:**
- Create: `app/_components/suggestions.tsx`
- Modify: `app/_components/agent-chat.tsx` (render suggestions above the composer when idle)

**Interfaces:**
- Consumes: `Suggestion`/`Suggestions` from `@/components/ai-elements/suggestion`.
- Produces: `export function FollowUpSuggestions({ onPick }: { readonly onPick: (text: string) => void })`.

- [ ] **Step 1: Implement `suggestions.tsx`**

Create `app/_components/suggestions.tsx`:
```tsx
"use client";

import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";

const FOLLOW_UPS = [
  "Give me variations on option 1",
  "Try a sharper, more contrarian angle",
  "Make them shorter and punchier",
  "Pick a new category",
] as const;

export function FollowUpSuggestions({
  onPick,
}: {
  readonly onPick: (text: string) => void;
}) {
  return (
    <Suggestions>
      {FOLLOW_UPS.map((suggestion) => (
        <Suggestion key={suggestion} onClick={onPick} suggestion={suggestion} />
      ))}
    </Suggestions>
  );
}
```

- [ ] **Step 2: Wire into `agent-chat.tsx`**

In `app/_components/agent-chat.tsx`, add the import near the other local imports:
```tsx
import { FollowUpSuggestions } from "./suggestions";
```

Then, in the non-empty branch, render suggestions directly above the composer. Locate the closing of the conversation block and the composer container:
```tsx
        {isEmpty ? null : (
          <Conversation className="min-h-0 flex-1">
            {/* ...unchanged... */}
          </Conversation>
        )}
```
Replace the `<div className="w-full">{composer}</div>` line (inside the non-empty footer area) with:
```tsx
        {isEmpty ? null : (
          <FollowUpSuggestions onPick={(text) => void sendMessage(text)} />
        )}
        <div className="w-full">{composer}</div>
```

> The existing footer `<div>` already wraps both empty and non-empty layouts; only the non-empty path should show follow-ups. Guard with `isEmpty ? null :` as shown so the empty-state quick-picks remain the only chips before the first turn.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/_components/suggestions.tsx app/_components/agent-chat.tsx
git commit -m "feat: follow-up suggestion chips"
```

---

## Task 11: Context meter + header wiring

**Files:**
- Create: `app/_components/context-meter.tsx`
- Modify: `app/_components/agent-chat.tsx` (compute usage from `agent.events`, render meter in header)

**Interfaces:**
- Consumes: `deriveUsage` from `@/lib/usage`; `MODEL_ID`/`getMaxContextTokens` from `@/lib/model`; the `Context*` family from `@/components/ai-elements/context`; `LanguageModelUsage` from `ai`.
- Produces: `export function ContextMeter({ usedTokens, usage, compacted })`.

- [ ] **Step 1: Implement `context-meter.tsx`**

Create `app/_components/context-meter.tsx`:
```tsx
"use client";

import type { LanguageModelUsage } from "ai";
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { MODEL_ID, getMaxContextTokens } from "@/lib/model";

export function ContextMeter({
  compacted,
  usage,
  usedTokens,
}: {
  readonly compacted: boolean;
  readonly usage: LanguageModelUsage;
  readonly usedTokens: number;
}) {
  if (usedTokens <= 0) {
    return null;
  }

  const maxTokens = getMaxContextTokens();

  return (
    <span className="flex items-center gap-2">
      <Context maxTokens={maxTokens} modelId={MODEL_ID} usage={usage} usedTokens={usedTokens}>
        <ContextTrigger />
        <ContextContent>
          <ContextContentHeader />
          <ContextContentBody>
            <div className="space-y-1">
              <ContextInputUsage />
              <ContextOutputUsage />
              <ContextCacheUsage />
            </div>
          </ContextContentBody>
          <ContextContentFooter />
        </ContextContent>
      </Context>
      {compacted ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
          context compacted
        </span>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 2: Wire into `agent-chat.tsx`**

In `app/_components/agent-chat.tsx`:

Add imports:
```tsx
import { useMemo } from "react";
import { deriveUsage } from "@/lib/usage";
import { ContextMeter } from "./context-meter";
```

Inside `AgentChat`, after `const agent = useEveAgent();`, add:
```tsx
  const derivedUsage = useMemo(() => deriveUsage(agent.events), [agent.events]);
```

In the header block, add the meter next to the status dot. Replace the existing
`<span className="flex min-w-0 items-center gap-2">…</span>` group's trailing content by
inserting the meter after the `Public preview` link, so the header becomes:
```tsx
        <header className="flex h-14 shrink-0 items-center justify-center gap-3 pl-4 pr-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-muted-foreground text-sm">{AGENT_NAME}</span>
            <StatusDot status={agent.status} />
          </span>
          <a
            className="rounded-full border border-amber-500/30 px-2 py-0.5 font-medium text-amber-700 text-xs transition-colors hover:bg-amber-500/10 dark:text-amber-300"
            href={BETA_TERMS_HREF}
            rel="noreferrer"
            target="_blank"
          >
            Public preview
          </a>
          <ContextMeter
            compacted={derivedUsage.compacted}
            usage={derivedUsage.usage}
            usedTokens={derivedUsage.usedTokens}
          />
        </header>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/_components/context-meter.tsx app/_components/agent-chat.tsx
git commit -m "feat: live token/context meter in header"
```

---

## Task 12: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + tests**

Run:
```bash
npm run typecheck
npm test
```
Expected: typecheck clean; all vitest suites pass.

- [ ] **Step 2: Run the dev server**

Run: `npm run dev`
Expected: Next.js + eve dev server boots; open the printed localhost URL.

- [ ] **Step 3: Manual behavioral checklist**

Confirm in the browser:
- Picking a category streams assistant text, then research shows a **"Used N sources"** collapsible with working links.
- If the model emits reasoning, a **Reasoning** block streams and collapses when done.
- The three drafts appear as **cards**: each with a signal badge, post text, and an `n/280` count.
- A draft over 280 shows a **red** count; near-limit shows amber.
- **Copy** copies the exact post text (paste to confirm).
- **Post on X** opens `x.com/intent/post` in a new tab with the post **pre-filled** in the composer.
- The header **Context** pill shows a non-zero % after a turn; hovering shows input/output/cache breakdown.
- **Follow-up suggestion** chips appear after a turn and send the chosen prompt when clicked.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for streaming + AI Elements upgrade"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** sources (T5), reasoning/CoT (T7), token/context meter + compaction (T3/T11), tasks (T6) + suggestions (T10) + subagents (T7) + HITL (T8), interactive post cards with Copy + Post on X (T1/T2/T4). All spec sections map to a task.
- **Placeholder scan:** every code step contains complete code; the only conditional notes (ToolHeader `toolName` prop, emoji expectation) include the exact fallback.
- **Type consistency:** `Draft`/`Signal`/`ValidatedDraft`/`composeDraftsInputSchema` defined in T1 and consumed unchanged in T2/T4; `AgentInputResponse` defined in T8 and re-exported from `agent-message.tsx` (T9) so `agent-chat.tsx` keeps compiling; `deriveUsage`/`DerivedUsage` (T3) consumed by `ContextMeter` (T11) with matching field names (`usedTokens`, `usage`, `compacted`).
- **Deviation from spec:** the context meter sources the model id from a `MODEL_ID` constant (`lib/model.ts`) instead of fetching `/eve/v1/info`, because the info JSON shape is non-trivial; this is simpler and removes a network dependency. Behavior (the meter) is unchanged.
