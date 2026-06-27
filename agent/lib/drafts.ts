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
// Curly/smart quotes → straight (safe normalization backstop).
const CURLY_DOUBLE_QUOTES = /[\u201C\u201D]/g;
const CURLY_SINGLE_QUOTES = /[\u2018\u2019]/g;

/**
 * Deterministic safety net so a draft never ships with an em dash, no matter
 * what the model writes. Numeric ranges (180–270) collapse to a hyphen; every
 * other dash used as a clause break (em/en/figure/bar, or a spaced ASCII "--")
 * becomes a comma. Cleans up the spacing that leaves behind.
 */
export function humanizeText(text: string): string {
  let out = text
    .replace(CURLY_DOUBLE_QUOTES, '"')
    .replace(CURLY_SINGLE_QUOTES, "'")
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

// Calendar references a post must not contain: explicit years (2026), month
// names (June), and fiscal quarters (Q3). Timeliness comes from naming the
// actual thing, the version, the launch, the number, never from stamping the
// date. Month names are matched case-sensitively (a leading capital) so the
// everyday words "may" and "march" used as verbs don't trip the guard; a
// lowercase month sitting next to a year is still caught by the year pattern.
const DATE_PATTERNS: readonly RegExp[] = [
  /\b(?:19|20)\d{2}\b/g, // a four-digit year, 1900-2099
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\b/g, // a capitalized month
  /\bQ[1-4]\b/g, // a fiscal quarter
];

/**
 * Calendar tokens (years, month names, quarters) found in a post body. An empty
 * array means the body is clean. compose_drafts surfaces any hits so the model
 * rewrites the draft without the date, and the drafts eval asserts none survive.
 */
export function findDateHits(text: string): string[] {
  const hits: string[] = [];
  for (const re of DATE_PATTERNS) {
    const matches = text.match(re);
    if (matches) hits.push(...matches);
  }
  return hits;
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
  /** Calendar tokens found in this unit (years, months, quarters). Empty == clean. */
  readonly dateHits: readonly string[];
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
        return { text, chars, over: chars > limit, dateHits: findDateHits(text) };
      }),
    };
  });
}
