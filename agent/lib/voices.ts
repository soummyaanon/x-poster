/**
 * Writing-voice catalog for the composer. Shared source of truth for the UI
 * selector and the voice payload sent in clientContext each turn.
 */

export const VOICE_IDS = [
  "house",
  "elon",
  "naval",
  "paul-graham",
  "karpathy",
  "sam-altman",
  "pieter-levels",
  "custom",
] as const;

export type VoiceId = (typeof VOICE_IDS)[number];

/** Preset voices shown in the selector (custom is handled separately). */
export const PRESET_VOICE_IDS = VOICE_IDS.filter((id) => id !== "custom") as readonly Exclude<
  VoiceId,
  "custom"
>[];

export interface VoicePreset {
  readonly id: Exclude<VoiceId, "custom">;
  readonly label: string;
  readonly handle?: string;
  readonly blurb: string;
  /** Style descriptor the model emulates: cadence, diction, signature moves. */
  readonly profile: string;
}

export interface VoiceSelection {
  readonly id: VoiceId;
  /** For custom: an @handle or free-text style description. */
  readonly custom?: string;
}

/** Resolved voice context sent to the agent (one profile, no catalog bloat). */
export interface VoiceContext {
  readonly id: VoiceId;
  readonly label: string;
  readonly profile: string;
  [key: string]: string;
}

export const VOICE_PRESETS: readonly VoicePreset[] = [
  {
    id: "house",
    label: "House blend",
    blurb: "Default builder/founder mix",
    profile:
      "The house blend: tight, declarative, concrete, a little dry, zero corporate fluff. " +
      "First person from the work. One idea per post. Short sentences carry weight; vary length. " +
      "Have a take. Name the tool, number, company, result. Humor when true, not performed. " +
      "Match the rhythm of @karpathy, @rauchg, @amritwt, @theo on tech/builder X.",
  },
  {
    id: "elon",
    label: "Elon Musk",
    handle: "@elonmusk",
    blurb: "Terse, blunt, meme-adjacent",
    profile:
      "Ultra-short, blunt, sometimes absurd or meme-adjacent. One line can be the whole post. " +
      "Declarative, no hedging, no corporate polish. Mix technical claims with dry humor or " +
      "provocation. Rarely threads; each post stands alone. Never explain at length what one " +
      "sentence can carry. No PR voice, no signposting.",
  },
  {
    id: "naval",
    label: "Naval",
    handle: "@naval",
    blurb: "Aphoristic, philosophical",
    profile:
      "Compact aphorisms with philosophical undertone, but earned from specifics, not hollow " +
      "formulas. Parallel structure sparingly. Timeless framing without calendar dates. " +
      "Second person or universal 'you' more than first person. Calm certainty, no hype. " +
      "Avoid fake-deep 'X is the Y of Z' templates; each line should compress a real insight.",
  },
  {
    id: "paul-graham",
    label: "Paul Graham",
    handle: "@paulg",
    blurb: "Essayist clarity, one sharp claim",
    profile:
      "Essayist clarity compressed for X: one sharp claim, often contrarian, explained in plain " +
      "English. Simple words, precise logic. Gentle tone but firm take. Analogies from everyday " +
      "life or startups. No jargon piles, no listicle energy. Often ends on the implication, " +
      "not a call to action.",
  },
  {
    id: "karpathy",
    label: "Karpathy",
    handle: "@karpathy",
    blurb: "First-person builder, technical",
    profile:
      "First-person builder thinking out loud. Technical fluency worn lightly. Concrete " +
      "observations from what you just saw, built, or read. Calm, curious, not performative. " +
      "Threads when the idea needs steps; each tweet one beat. Numbers and names when you have " +
      "them. No hype adjectives, no 'game-changer' framing.",
  },
  {
    id: "sam-altman",
    label: "Sam Altman",
    handle: "@sama",
    blurb: "Measured optimism, big-picture",
    profile:
      "Measured optimism about technology and institutions. Big-picture framing grounded in one " +
      "specific detail. Short to medium posts, rarely punchy for its own sake. Confident but not " +
      "loud; avoids dunking. Forward-looking without fake urgency. No sycophancy, no 'exciting " +
      "times ahead' closers.",
  },
  {
    id: "pieter-levels",
    label: "Pieter Levels",
    handle: "@levelsio",
    blurb: "Indie hacker, numbers-first",
    profile:
      "Indie hacker energy: revenue, users, ships, constraints. Numbers-first, anti-corporate, " +
      "slightly irreverent. First person, what you actually did today. Short sentences, occasional " +
      "ALL CAPS for emphasis (sparingly). Transparent about wins and failures. No VC pitch voice, " +
      "no abstract 'landscape' talk.",
  },
] as const;

const PRESET_BY_ID: Readonly<Record<Exclude<VoiceId, "custom">, VoicePreset>> = Object.fromEntries(
  VOICE_PRESETS.map((v) => [v.id, v]),
) as Record<Exclude<VoiceId, "custom">, VoicePreset>;

export const DEFAULT_VOICE_ID: VoiceId = "house";

export function isVoiceId(value: string): value is VoiceId {
  return (VOICE_IDS as readonly string[]).includes(value);
}

export function voiceLabel(id: VoiceId): string {
  if (id === "custom") return "Custom";
  return PRESET_BY_ID[id].label;
}

export function voiceBlurb(id: VoiceId): string {
  if (id === "custom") return "Your @handle or style";
  return PRESET_BY_ID[id].blurb;
}

/**
 * Build the voice payload for clientContext. Only the selected voice's profile
 * is included so each turn stays lean.
 */
export function resolveVoiceContext(selection: VoiceSelection | undefined): VoiceContext {
  const id = selection?.id ?? DEFAULT_VOICE_ID;

  if (id === "custom") {
    const custom = selection?.custom?.trim() ?? "";
    if (!custom) {
      return {
        id: "custom",
        label: "Custom",
        profile:
          "No custom style given; fall back to the house blend until the user specifies an " +
          "@handle or style description.",
      };
    }
    if (custom.startsWith("@")) {
      return {
        id: "custom",
        label: custom,
        profile:
          `Emulate the posting style of ${custom} (cadence, sentence length, diction, signature ` +
          "moves). Style only: never impersonate, never fabricate their quotes or claims, never " +
          "pretend to be them. If unfamiliar with this account, web_search a few recent posts " +
          "within the existing research budget to calibrate, then write in that style for the " +
          "user's own account.",
      };
    }
    return {
      id: "custom",
      label: "Custom style",
      profile:
        `Write in this style: ${custom}. Style only: never impersonate a named person, never ` +
        "fabricate quotes. Posts go out on the user's own account.",
    };
  }

  const preset = PRESET_BY_ID[id];
  return {
    id: preset.id,
    label: preset.label,
    profile:
      preset.profile +
      " Style only: emulate cadence and diction, never impersonate or fabricate quotes " +
      "attributed to this person. Posts go out on the user's own account.",
  };
}
