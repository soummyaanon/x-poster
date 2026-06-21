"use client";

import type { EveDynamicToolPart } from "eve/react";
import { CheckIcon, CopyIcon, UserRoundIcon } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useCallback, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import {
  MAX_TWEET_CHARS,
  SIGNAL_LABELS,
  type Signal,
  countChars,
} from "@/agent/lib/drafts";
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
  const drafts = readDrafts(part.input);
  const streaming = part.state === "input-streaming";

  if (drafts.length === 0) {
    return <Shimmer className="text-sm">Composing drafts…</Shimmer>;
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
  const tone = over
    ? "text-destructive"
    : near
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";

  if (streaming && text.length === 0) {
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
      <header className="flex items-start gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <UserRoundIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block font-semibold text-foreground text-sm">You</span>
          <span className="block text-muted-foreground text-xs">@you · now</span>
        </span>
        {draft.signal ? (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
            {SIGNAL_LABELS[draft.signal]}
          </span>
        ) : null}
      </header>

      <p className="mt-2.5 whitespace-pre-wrap text-[15px] text-foreground leading-normal">
        {formatPost(text)}
      </p>

      {draft.note ? (
        <p className="mt-2 text-muted-foreground text-xs italic">{draft.note}</p>
      ) : null}

      <footer className="mt-3 flex items-center justify-between gap-2 border-border border-t pt-2.5">
        {/* action bar */}
        <span className="flex items-center gap-2.5">
          <span className="text-muted-foreground text-xs">Option {index + 1}</span>
          <span className={cn("flex items-center gap-1.5", tone)}>
            <CharRing ratio={chars / MAX_TWEET_CHARS} />
            <span className="font-mono text-xs tabular-nums">
              {chars}
              <span className="text-muted-foreground">/{MAX_TWEET_CHARS}</span>
            </span>
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <CopyButton text={text} />
          <Button
            className="rounded-full"
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
        </span>
      </footer>
    </motion.article>
  );
}

function CharRing({ ratio }: { readonly ratio: number }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(Math.max(ratio, 0), 1);
  const dashOffset = circumference * (1 - filled);

  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 18 18" width="16">
      <circle
        cx="9"
        cy="9"
        fill="none"
        opacity="0.2"
        r={radius}
        stroke="currentColor"
        strokeWidth="2"
      />
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
        style={{
          transform: "rotate(-90deg)",
          transformOrigin: "center",
          transition: "stroke-dashoffset 0.4s ease",
        }}
      />
    </svg>
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
    <Button
      className="rounded-full"
      onClick={onCopy}
      size="sm"
      type="button"
      variant="outline"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
