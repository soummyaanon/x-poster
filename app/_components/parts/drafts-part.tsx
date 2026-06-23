"use client";

import type { EveDynamicToolPart } from "eve/react";
import { CheckIcon, CopyIcon, QuoteIcon, UserRoundIcon } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useCallback, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import {
  FORMAT_LABELS,
  FORMAT_TIER,
  type Format,
  MAX_LONG_CHARS,
  MAX_TWEET_CHARS,
  SIGNAL_LABELS,
  type Signal,
  countChars,
  humanizeText,
} from "@/agent/lib/drafts";
import { cn } from "@/lib/utils";

const X_INTENT_URL = "https://x.com/intent/post";
const NEAR_LIMIT = MAX_TWEET_CHARS - 20;

interface PartialDraft {
  readonly format?: Format;
  readonly signal?: Signal;
  readonly note?: string;
  readonly text?: string;
  readonly tweets?: string[];
}

interface Compose {
  readonly drafts: readonly PartialDraft[];
  readonly quoting?: string;
}

/** Read drafts from the streaming tool input and humanize every post string. */
function readCompose(input: unknown): Compose {
  if (
    input &&
    typeof input === "object" &&
    Array.isArray((input as { drafts?: unknown }).drafts)
  ) {
    const raw = input as { drafts: PartialDraft[]; quoting?: unknown };
    const drafts = raw.drafts.map((draft) => ({
      ...draft,
      text: draft.text === undefined ? undefined : humanizeText(draft.text),
      tweets: draft.tweets?.map((tweet) => humanizeText(tweet)),
    }));
    return { drafts, quoting: typeof raw.quoting === "string" ? raw.quoting : undefined };
  }
  return { drafts: [] };
}

function intentUrl(text: string): string {
  return `${X_INTENT_URL}?text=${encodeURIComponent(text)}`;
}

/** Touch devices where the native X app can claim the intent link. */
function isMobile(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Open the X composer. On mobile we navigate the same tab so iOS Universal
 * Links / Android App Links can hand off to the installed X app — a
 * `window.open(_blank)` call is not eligible for that handoff and always lands
 * in the mobile web composer. Desktop keeps the new-tab behaviour.
 */
function openIntent(text: string): void {
  const url = intentUrl(text);
  if (isMobile()) {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** Render a post like X does: @mentions, #hashtags and links get the brand tint. */
function formatPost(text: string): ReactNode[] {
  return text.split(/(@\w+|#\w+|https?:\/\/\S+)/g).map((token, index) => {
    if (token.length === 0) {
      return null;
    }
    const isEntity = /^[@#]\w/.test(token) || /^https?:\/\//.test(token);
    return (
      <span className={isEntity ? "text-sky-500" : undefined} key={index}>
        {token}
      </span>
    );
  });
}

export function DraftsPart({ part }: { readonly part: EveDynamicToolPart }) {
  const { drafts, quoting } = readCompose(part.input);
  const streaming = part.state === "input-streaming";

  if (drafts.length === 0) {
    return <Shimmer className="text-sm">Composing drafts…</Shimmer>;
  }

  return (
    <div className="flex flex-col gap-3">
      {quoting ? (
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <QuoteIcon className="size-3.5 shrink-0" />
          <span className="truncate">Quoting {quoting}</span>
        </p>
      ) : null}
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
  const format: Format = draft.format ?? "short";
  const tweets = draft.tweets ?? [];
  const text = draft.text ?? "";
  const hasContent = format === "thread" ? tweets.some((t) => t.length > 0) : text.length > 0;

  if (streaming && !hasContent) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <Shimmer className="text-sm">{`Drafting option ${index + 1}…`}</Shimmer>
      </div>
    );
  }

  return (
    <motion.article
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-4"
      initial={{ opacity: 0, y: 10 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
    >
      <header className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <UserRoundIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block font-semibold text-foreground text-sm">You</span>
          <span className="block text-muted-foreground text-xs">@you · now</span>
        </span>
        <TierBadge format={format} />
        {draft.signal ? (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
            {SIGNAL_LABELS[draft.signal]}
          </span>
        ) : null}
      </header>

      {format === "thread" ? (
        <ThreadBody tweets={tweets} />
      ) : (
        <p
          className={cn(
            "mt-2.5 whitespace-pre-wrap text-foreground",
            format === "long"
              ? "max-h-80 overflow-y-auto text-[14px] leading-relaxed"
              : "text-[15px] leading-normal",
          )}
        >
          {formatPost(text)}
        </p>
      )}

      {draft.note ? (
        <p className="mt-2 text-muted-foreground text-xs italic">{draft.note}</p>
      ) : null}

      <Footer format={format} text={text} tweets={tweets} />
    </motion.article>
  );
}

/** Tier-colored pill: "Premium · Long-form", "Free · Thread", or "Quote". */
function TierBadge({ format }: { readonly format: Format }) {
  const tier = FORMAT_TIER[format];
  const tone =
    tier === "premium"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : tier === "quote"
        ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400"
        : "border-border bg-muted text-muted-foreground";
  const label =
    tier === "quote"
      ? "Quote"
      : `${tier === "premium" ? "Premium" : "Free"} · ${FORMAT_LABELS[format]}`;

  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 font-medium text-[10px] uppercase tracking-wide",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function ThreadBody({ tweets }: { readonly tweets: readonly string[] }) {
  return (
    <ol className="mt-3 space-y-0">
      {tweets.map((tweet, i) => {
        const chars = countChars(tweet);
        const over = chars > MAX_TWEET_CHARS;
        return (
          <li className="relative flex gap-3 pb-4 last:pb-0" key={i}>
            <span className="flex flex-col items-center">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              {i < tweets.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block whitespace-pre-wrap text-[15px] text-foreground leading-normal">
                {formatPost(tweet)}
              </span>
              <span className="mt-1 flex items-center gap-2">
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    over ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {chars}/{MAX_TWEET_CHARS}
                </span>
                <CopyButton size="tiny" text={tweet} />
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Footer({
  format,
  text,
  tweets,
}: {
  readonly format: Format;
  readonly text: string;
  readonly tweets: readonly string[];
}) {
  if (format === "thread") {
    const first = tweets[0] ?? "";
    const all = tweets.join("\n\n");
    return (
      <footer className="mt-3 flex items-center justify-between gap-2 border-border border-t pt-2.5">
        <span className="text-muted-foreground text-xs">{tweets.length} posts</span>
        <span className="flex items-center gap-1.5">
          <CopyButton label="Copy all" text={all} />
          <PostButton label="Post 1st" text={first} />
        </span>
      </footer>
    );
  }

  const chars = countChars(text);
  const limit = format === "long" ? MAX_LONG_CHARS : MAX_TWEET_CHARS;
  const over = chars > limit;
  const near = format === "short" && !over && chars >= NEAR_LIMIT;
  const tone = over
    ? "text-destructive"
    : near
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";

  return (
    <footer className="mt-3 flex items-center justify-between gap-2 border-border border-t pt-2.5">
      <span className={cn("flex items-center gap-1.5", tone)}>
        {format === "short" ? <CharRing ratio={chars / MAX_TWEET_CHARS} /> : null}
        <span className="font-mono text-xs tabular-nums">
          {chars}
          <span className="text-muted-foreground">{format === "short" ? `/${limit}` : " chars"}</span>
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <CopyButton text={text} />
        <PostButton text={text} />
      </span>
    </footer>
  );
}

function PostButton({ label = "Post on X", text }: { readonly label?: string; readonly text: string }) {
  return (
    <Button
      className="rounded-full"
      onClick={() => openIntent(text)}
      size="sm"
      type="button"
      variant="default"
    >
      {label}
    </Button>
  );
}

function CharRing({ ratio }: { readonly ratio: number }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(Math.max(ratio, 0), 1);
  const dashOffset = circumference * (1 - filled);

  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 18 18" width="16">
      <circle cx="9" cy="9" fill="none" opacity="0.2" r={radius} stroke="currentColor" strokeWidth="2" />
      <circle
        cx="9"
        cy="9"
        fill="none"
        r={radius}
        stroke="currentColor"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth="2"
        style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 0.4s ease" }}
      />
    </svg>
  );
}

function CopyButton({
  label,
  size = "sm",
  text,
}: {
  readonly label?: string;
  readonly size?: "sm" | "tiny";
  readonly text: string;
}) {
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

  if (size === "tiny") {
    return (
      <button
        className="text-muted-foreground text-xs hover:text-foreground"
        onClick={onCopy}
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    );
  }

  return (
    <Button className="rounded-full" onClick={onCopy} size="sm" type="button" variant="outline">
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </Button>
  );
}
