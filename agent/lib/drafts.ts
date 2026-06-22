import { z } from "zod";

export const MAX_TWEET_CHARS = 280;
// X Premium allows very long single posts; keep them tight and readable.
export const MAX_LONG_CHARS = 2500;

export const SIGNALS = ["reply", "repost", "profile-click", "dwell"] as const;
export type Signal = (typeof SIGNALS)[number];

export const SIGNAL_LABELS: Record<Signal, string> = {
  reply: "Invites replies",
  repost: "Worth reposting",
  "profile-click": "Earns profile clicks",
  dwell: "Rewards dwell time",
};

/** Account tier a draft is written for. The UI toggle picks this per turn. */
export const TIERS = ["premium", "free"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  premium: "Premium",
  free: "Free",
};

export const FORMATS = ["short", "single", "long", "thread", "quote"] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABELS: Record<Format, string> = {
  short: "Short",
  single: "Single",
  long: "Long-form",
  thread: "Thread",
  quote: "Quote",
};

/**
 * Which tier each format belongs to. `quote` is tier-agnostic (a quote take is
 * just your commentary above someone else's post; it works for either account).
 */
export const FORMAT_TIER: Record<Format, Tier | "quote"> = {
  short: "free",
  thread: "free",
  single: "premium",
  long: "premium",
  quote: "quote",
};

/** Formats produced for each account tier in normal (non-quote) compose mode. */
export const TIER_FORMATS: Record<Tier, readonly Format[]> = {
  premium: ["single", "long"],
  free: ["short", "thread"],
};

// Unicode dashes that read as an "AI tell": figure, en, em, horizontal bar.
const NUMERIC_RANGE = /(\d)\s*[‒–—―]\s*(\d)/g;
const CLAUSE_DASH = /\s*[‒–—―]\s*/g;
const SPACED_DOUBLE_HYPHEN = / +-{2,} +/g;

/**
 * Deterministic safety net so a draft never ships with an em dash, no matter
 * what the model writes. Numeric ranges (180–270) collapse to a hyphen; every
 * other dash used as a clause break (em/en/figure/bar, or a spaced ASCII "--")
 * becomes a comma. Cleans up the spacing that leaves behind.
 */
export function humanizeText(text: string): string {
  let out = text
    .replace(NUMERIC_RANGE, "$1-$2")
    .replace(CLAUSE_DASH, ", ")
    .replace(SPACED_DOUBLE_HYPHEN, ", ");
  out = out
    .replace(/[ \t]+([,.;:!?])/g, "$1") // no space before punctuation
    .replace(/,\s*,/g, ",") // collapse doubled commas
    .replace(/ {2,}/g, " ") // collapse runs of spaces
    .replace(/(^|\n)[ \t]*,[ \t]*/g, "$1") // drop a comma left at a line start
    .replace(/,[ \t]*$/g, ""); // drop a comma left at the very end
  return out;
}

export const draftSchema = z.object({
  format: z.enum(FORMATS),
  signal: z.enum(SIGNALS),
  note: z.string().optional(),
  // `text` for short/single/long/quote; `tweets` (2+ posts) for thread.
  text: z.string().optional(),
  tweets: z.array(z.string()).optional(),
});
export type Draft = z.infer<typeof draftSchema>;

export const composeDraftsInputSchema = z.object({
  drafts: z.array(draftSchema).min(2).max(4),
  // When the user gave a post/link to react to, the source being quoted
  // (a URL or a short label). Lets the UI show "Quoting …" above quote takes.
  quoting: z.string().optional(),
});
export type ComposeDraftsInput = z.infer<typeof composeDraftsInputSchema>;

export function countChars(text: string): number {
  return [...text].length;
}

/** The per-format character ceiling a single unit (post/tweet) is checked against. */
export function limitFor(format: Format): number {
  // Free single posts, thread tweets, and quote takes all cap at the classic
  // 280; premium single/long posts get the long ceiling.
  if (format === "single" || format === "long") {
    return MAX_LONG_CHARS;
  }
  return MAX_TWEET_CHARS;
}

/** The text units of a draft: one for short/single/long/quote, the tweet list for a thread. */
export function unitsOf(draft: { format: Format; text?: string; tweets?: string[] }): string[] {
  if (draft.format === "thread") {
    return draft.tweets ?? [];
  }
  return [draft.text ?? ""];
}

export interface ValidatedUnit {
  readonly text: string;
  readonly chars: number;
  readonly over: boolean;
}
export interface ValidatedDraft {
  readonly format: Format;
  readonly signal: Signal;
  readonly note?: string;
  readonly units: readonly ValidatedUnit[];
}

export function validateDrafts(drafts: readonly Draft[]): ValidatedDraft[] {
  return drafts.map((draft) => {
    const limit = limitFor(draft.format);
    return {
      format: draft.format,
      signal: draft.signal,
      note: draft.note,
      units: unitsOf(draft).map((raw) => {
        const text = humanizeText(raw);
        const chars = countChars(text);
        return { text, chars, over: chars > limit };
      }),
    };
  });
}
