import { z } from "zod";

export const MAX_TWEET_CHARS = 280;
// Long-form (X Premium) allows up to 25k, but keep posts tight and readable.
export const MAX_LONG_CHARS = 2500;

export const SIGNALS = ["reply", "repost", "profile-click", "dwell"] as const;
export type Signal = (typeof SIGNALS)[number];

export const SIGNAL_LABELS: Record<Signal, string> = {
  reply: "Invites replies",
  repost: "Worth reposting",
  "profile-click": "Earns profile clicks",
  dwell: "Rewards dwell time",
};

export const FORMATS = ["short", "long", "thread"] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABELS: Record<Format, string> = {
  short: "Single post",
  long: "Long-form",
  thread: "Thread",
};

export const draftSchema = z.object({
  format: z.enum(FORMATS),
  signal: z.enum(SIGNALS),
  note: z.string().optional(),
  // `text` for `short` and `long`; `tweets` (2+ posts) for `thread`.
  text: z.string().optional(),
  tweets: z.array(z.string()).optional(),
});
export type Draft = z.infer<typeof draftSchema>;

export const composeDraftsInputSchema = z.object({
  drafts: z.array(draftSchema).length(3),
});
export type ComposeDraftsInput = z.infer<typeof composeDraftsInputSchema>;

export function countChars(text: string): number {
  return [...text].length;
}

/** The per-format character ceiling a single unit (post/tweet) is checked against. */
export function limitFor(format: Format): number {
  return format === "long" ? MAX_LONG_CHARS : MAX_TWEET_CHARS;
}

/** The text units of a draft: one for short/long, the tweet list for a thread. */
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
      units: unitsOf(draft).map((text) => {
        const chars = countChars(text);
        return { text, chars, over: chars > limit };
      }),
    };
  });
}
