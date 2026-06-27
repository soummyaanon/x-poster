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

/**
 * AI "tells" the humanizer bans (see the Human voice section of the base
 * instructions and agent/instructions/25-humanizer.md). These are detected
 * deterministically so `compose_drafts` can force a rewrite in production, the
 * same way it does for calendar dates, instead of trusting the model's silent
 * self-audit (which has been letting tells through). The drafts eval grades the
 * same list, so the runtime gate and the eval can't drift.
 *
 * Matched case-insensitively. Kept deliberately tight (see the humanizer's "what
 * NOT to flag"): isolated common words are fine; these target the formulas and
 * clusters that read as machine-written. The dash pattern is here for the eval,
 * which checks raw model output; at runtime the check runs on humanized text
 * (dashes already stripped), so it never double-flags an auto-fixed dash.
 */
export const BANNED_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: "em/en/figure dash", re: /[‒–—―]/ },
  { label: `"X isn't Y, it's Z"`, re: /\bisn'?t\b[^.?!\n]{0,40}\bit'?s\b/i },
  // The same antithesis split across two sentences ("It does not make X feel
  // less Y. It makes it feel more Z."), the exact tell that shipped in the
  // flagged "single neurons" draft. Scoped to a re-asserting "It <verb>" so it
  // does not catch ordinary negation ("This does not work. The team is on it.").
  {
    label: "antithesis reversal",
    // Re-assertion verbs are limited to perception/transformation ("It makes /
    // feels / looks ...") so the plain "It is ..." that follows ordinary
    // negation ("The API is not ready. It is in beta.") is not flagged.
    re: /\b(?:does|do|did|is|are|was|were|will)\s+not\b[^.?!\n]{0,80}[.?!]+\s+It\s+(?:makes?|feels?|looks?|seems?|becomes?|turns?|reads?|sounds?)\b/,
  },
  // Significance filler ("the part I cannot stop thinking about") that announces
  // importance instead of showing it.
  {
    label: "significance filler",
    re: /\bthe (?:part|thing|bit)(?: that)? (?:i|you|we)(?:'?ll)? (?:can'?t|cannot|couldn'?t) stop thinking about\b/i,
  },
  { label: `"the real question is"`, re: /the real question is/i },
  { label: `"the quiet part out loud"`, re: /quiet part out loud/i },
  { label: `"let that sink in"`, re: /let that sink in/i },
  { label: `"make no mistake"`, re: /make no mistake/i },
  { label: `"a line in the sand"`, re: /line in the sand/i },
  { label: `"in a world where"`, re: /in a world where/i },
  { label: `"here's why that matters"`, re: /here'?s why (?:that|this) matters/i },
  { label: `"it's worth noting"`, re: /it'?s worth noting/i },
  { label: `"in today's world"`, re: /in today'?s world/i },
  { label: `"let's dive in"`, re: /let'?s dive in/i },
  { label: `"here's what you need to know"`, re: /here'?s what you need to know/i },
  { label: `"great question"`, re: /great question/i },
  { label: `"you're absolutely right"`, re: /you'?re absolutely right/i },
  // Scoped to the fake-profound noun forms the humanizer actually targets
  // ("Symmetry is the language of trust"), not every "is the X of Y" phrase.
  {
    label: "aphorism formula (the X of)",
    re: /\bis the (?:language|currency|architecture|art|science|mirror|enemy) of\b/i,
  },
  { label: "aphorism formula (not a X but a Y)", re: /\bis not a \w+,? but a \w+/i },
  { label: "rule-of-three triplet", re: /\b\w+ing, \w+ing, and \w+ing\b/i },
];

/**
 * AI tells (by label) found in a post body. Empty array means clean.
 * compose_drafts surfaces any hits so the model rewrites, the same contract as
 * findDateHits; the drafts eval asserts the same patterns against raw output.
 */
export function findBannedHits(text: string): string[] {
  const hits: string[] = [];
  for (const { label, re } of BANNED_PATTERNS) {
    if (re.test(text)) hits.push(label);
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
  /** AI tells found in this unit (by label, see BANNED_PATTERNS). Empty == clean. */
  readonly bannedHits: readonly string[];
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
        return {
          text,
          chars,
          over: chars > limit,
          dateHits: findDateHits(text),
          // Run on the humanized text so an em dash (already converted to a
          // comma) is never flagged here as a tell, only the formulas survive.
          bannedHits: findBannedHits(text),
        };
      }),
    };
  });
}
