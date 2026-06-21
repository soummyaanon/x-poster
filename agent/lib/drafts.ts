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
