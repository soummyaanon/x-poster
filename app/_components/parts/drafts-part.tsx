"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  BarChart2Icon,
  BookmarkIcon,
  CheckIcon,
  CopyIcon,
  HeartIcon,
  MessageCircleIcon,
  QuoteIcon,
  Repeat2Icon,
  ShareIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useCallback, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import {
  FORMAT_LABELS,
  type Format,
  MAX_LONG_CHARS,
  MAX_TWEET_CHARS,
  SIGNAL_LABELS,
  type Signal,
  countChars,
  humanizeText,
} from "@/agent/lib/drafts";
import { type Register, isRegister } from "@/agent/lib/registers";
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
  readonly register?: Register;
}

/** Read drafts from the streaming tool input and humanize every post string. */
function readCompose(input: unknown): Compose {
  if (
    input &&
    typeof input === "object" &&
    Array.isArray((input as { drafts?: unknown }).drafts)
  ) {
    const raw = input as { drafts: PartialDraft[]; quoting?: unknown; register?: unknown };
    const drafts = raw.drafts.map((draft) => ({
      ...draft,
      text: draft.text === undefined ? undefined : humanizeText(draft.text),
      tweets: draft.tweets?.map((tweet) => humanizeText(tweet)),
    }));
    return {
      drafts,
      quoting: typeof raw.quoting === "string" ? raw.quoting : undefined,
      register:
        typeof raw.register === "string" && isRegister(raw.register) ? raw.register : undefined,
    };
  }
  return { drafts: [] };
}

function intentUrl(text: string): string {
  return `${X_INTENT_URL}?text=${encodeURIComponent(text)}`;
}

/**
 * Fire a short haptic tap. Uses the Web Vibration API, which is supported on
 * Android (Chrome/Firefox) but NOT on iOS Safari — iPhones silently no-op.
 */
function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
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
  haptic();
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
  const { drafts, quoting, register } = readCompose(part.input);
  const streaming = part.state === "input-streaming";

  if (drafts.length === 0) {
    return <Shimmer className="text-sm">Composing drafts…</Shimmer>;
  }

  return (
    <div className="flex flex-col gap-4">
      {quoting ? (
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <QuoteIcon className="size-3.5 shrink-0" />
          <span className="truncate">Quoting {quoting}</span>
        </p>
      ) : null}
      {drafts.map((draft, index) => (
        <DraftCard
          draft={draft}
          index={index}
          key={index}
          register={register}
          streaming={streaming}
        />
      ))}
    </div>
  );
}

function DraftCard({
  draft,
  index,
  register,
  streaming,
}: {
  readonly draft: PartialDraft;
  readonly index: number;
  readonly register?: Register;
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
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
      initial={{ opacity: 0, y: 12 }}
      transition={{ delay: index * 0.07, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <MetaRail draft={draft} format={format} index={index} register={register} />

      <div className="px-4 pt-3 pb-1">
        {format === "thread" ? (
          <ThreadBody tweets={tweets} />
        ) : (
          <>
            <PostHeader />
            <p
              className={cn(
                "mt-2 whitespace-pre-wrap text-foreground",
                format === "long"
                  ? "max-h-80 overflow-y-auto text-[14px] leading-relaxed"
                  : "text-[15px] leading-normal",
              )}
            >
              {formatPost(text)}
            </p>
            <EngagementRow />
          </>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-border/60 border-t bg-muted/20 px-4 py-2.5">
        <CharCounter format={format} text={text} tweets={tweets} />
        <span className="flex items-center gap-1.5">
          {format === "thread" ? (
            <>
              <CopyButton label="Copy all" text={tweets.join("\n\n")} />
              <PostButton label="Post 1st" text={tweets[0] ?? ""} />
            </>
          ) : (
            <>
              <CopyButton text={text} />
              <PostButton text={text} />
            </>
          )}
        </span>
      </footer>
    </motion.article>
  );
}

/** Compact strip above the post: option number, format, signal, register, note. */
function MetaRail({
  draft,
  format,
  index,
  register,
}: {
  readonly draft: PartialDraft;
  readonly format: Format;
  readonly index: number;
  readonly register?: Register;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-border/60 border-b bg-muted/30 px-3.5 py-2">
      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
        #{index + 1}
      </span>
      <FormatChip format={format} />
      {draft.signal ? (
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
          {SIGNAL_LABELS[draft.signal]}
        </span>
      ) : null}
      {register === "shitpost" ? (
        <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 font-medium text-[10px] text-orange-700 dark:text-orange-400">
          🔥 shitpost
        </span>
      ) : null}
      {register === "ragebait" ? (
        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-medium text-[10px] text-red-700 dark:text-red-400">
          😤 ragebait
        </span>
      ) : null}
      {draft.note ? (
        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground italic">
          {draft.note}
        </span>
      ) : null}
    </div>
  );
}

/** Format pill tinted by length: short is the punchy one, long is the essay. */
function FormatChip({ format }: { readonly format: Format }) {
  const tone: Record<Format, string> = {
    short: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    single: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    long: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    thread: "border-border bg-muted text-muted-foreground",
    quote: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  };
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 font-medium text-[10px] uppercase tracking-wide",
        tone[format],
      )}
    >
      {FORMAT_LABELS[format]}
    </span>
  );
}

/** The author row exactly like an X post: avatar, name, verified badge, handle, X logo. */
function PostHeader({ compact = false }: { readonly compact?: boolean }) {
  return (
    <header className="flex items-center gap-2.5">
      <Avatar size={compact ? "sm" : "md"} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1">
          <span className={cn("font-bold text-foreground", compact ? "text-[13px]" : "text-[15px]")}>
            You
          </span>
          <VerifiedBadge />
        </span>
        <span className={cn("block text-muted-foreground", compact ? "text-xs" : "text-[13px]")}>
          @you · now
        </span>
      </span>
      {compact ? null : <XLogo className="size-4 shrink-0 text-foreground/70" />}
    </header>
  );
}

function Avatar({ size = "md" }: { readonly size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 font-bold text-white",
        size === "md" ? "size-10 text-sm" : "size-8 text-xs",
      )}
    >
      Y
    </span>
  );
}

/** X's verified checkmark seal. */
function VerifiedBadge() {
  return (
    <svg aria-label="Verified" className="size-[18px] shrink-0 fill-sky-500" viewBox="0 0 24 24">
      <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
    </svg>
  );
}

/** The X wordmark glyph. */
function XLogo({ className }: { readonly className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("fill-current", className)} viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** Decorative action bar so the draft reads as a real X post. Not interactive. */
function EngagementRow() {
  return (
    <div
      aria-hidden="true"
      className="mt-3 flex max-w-sm items-center justify-between text-muted-foreground/50"
    >
      <MessageCircleIcon className="size-[17px]" />
      <Repeat2Icon className="size-[18px]" />
      <HeartIcon className="size-[17px]" />
      <BarChart2Icon className="size-[17px]" />
      <span className="flex items-center gap-3">
        <BookmarkIcon className="size-[17px]" />
        <ShareIcon className="size-[16px]" />
      </span>
    </div>
  );
}

/** Thread rendered the way X renders one: avatar rail, connector line, a card per post. */
function ThreadBody({ tweets }: { readonly tweets: readonly string[] }) {
  return (
    <ol className="space-y-0">
      {tweets.map((tweet, i) => {
        const chars = countChars(tweet);
        const over = chars > MAX_TWEET_CHARS;
        return (
          <li className="relative flex gap-3 pb-4 last:pb-0" key={i}>
            <span className="flex flex-col items-center">
              <Avatar size="sm" />
              {i < tweets.length - 1 ? (
                <span className="mt-1 w-0.5 flex-1 rounded-full bg-border" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="flex items-center gap-1 leading-tight">
                <span className="font-bold text-[13px] text-foreground">You</span>
                <VerifiedBadge />
                <span className="text-muted-foreground text-xs">@you · now</span>
              </span>
              <span className="mt-1 block whitespace-pre-wrap text-[15px] text-foreground leading-normal">
                {formatPost(tweet)}
              </span>
              <span className="mt-1.5 flex items-center gap-2">
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

function CharCounter({
  format,
  text,
  tweets,
}: {
  readonly format: Format;
  readonly text: string;
  readonly tweets: readonly string[];
}) {
  if (format === "thread") {
    return <span className="text-muted-foreground text-xs">{tweets.length} posts</span>;
  }

  const chars = countChars(text);
  const limit = format === "long" || format === "single" ? MAX_LONG_CHARS : MAX_TWEET_CHARS;
  const over = chars > limit;
  const near = (format === "short" || format === "quote") && !over && chars >= NEAR_LIMIT;
  const tone = over
    ? "text-destructive"
    : near
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";

  return (
    <span className={cn("flex items-center gap-1.5", tone)}>
      {format === "short" || format === "quote" ? (
        <CharRing ratio={chars / MAX_TWEET_CHARS} />
      ) : null}
      <span className="font-mono text-xs tabular-nums">
        {chars}
        <span className="text-muted-foreground">
          {format === "short" || format === "quote" ? `/${MAX_TWEET_CHARS}` : " chars"}
        </span>
      </span>
    </span>
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
      <XLogo className="size-3.5" />
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
      haptic([10, 30, 10]);
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
