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
  /**
   * 2-3 synthetic cadence exemplars: short lines written to capture this voice's
   * rhythm, not real quotes. Injected with the profile so the model has concrete
   * few-shot anchors (the single biggest lever for voice fidelity), never copied
   * verbatim and never presented as something the person actually said.
   */
  readonly examples: readonly string[];
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
      "The house blend: the rhythm of working builders and founders on X (@karpathy, @rauchg, " +
      "@amritwt, @theo). Tight, declarative, concrete, a little dry, zero corporate fluff, " +
      "technical fluency worn lightly. First person from the work. One idea per post. Short " +
      "sentences carry weight; vary length so it never drones. Have a take. Name the tool, the " +
      "number, the company, the result. Humor only when it's true, never performed.",
    examples: [
      "Most 'AI agents' are a while loop with anxiety. The hard part was never the loop. It's knowing when to stop.",
      "The best deploy is the one nobody noticed. No banner, no maintenance window. It just got faster.",
    ],
  },
  {
    id: "elon",
    label: "Elon Musk",
    handle: "@elonmusk",
    blurb: "Terse, blunt, meme-adjacent",
    profile:
      "Elon Musk's posting style: ultra-short and blunt, often a single line that is the whole " +
      "post. Flat declarative verdicts, no hedging, no setup, no corporate polish. Pairs a hard " +
      "first-principles or technical claim with dry humor or provocation. Lowercase-casual is " +
      "fine. Rarely threads; each post stands alone. Never explains at length what one sentence " +
      "can carry, never signposts, never sounds like PR.",
    examples: [
      "Most software is just bureaucracy with a UI.",
      "The factory is the product. Everyone keeps missing this.",
    ],
  },
  {
    id: "naval",
    label: "Naval",
    handle: "@naval",
    blurb: "Aphoristic, philosophical",
    profile:
      "Naval's style: compact aphorisms with a philosophical undertone, but earned from " +
      "specifics, never hollow templates. Present tense, universal or second-person 'you' more " +
      "than first person. Calm certainty, no hype, no dates. Often two short lines that compound: " +
      "the claim, then the mechanism. Avoid fake-deep 'X is the Y of Z' formulas; each line " +
      "should compress a real insight you could defend.",
    examples: [
      "You don't get rich renting out your time. You get rich owning things that earn while you sleep.",
      "Specific knowledge can't be taught, only mentored. If someone can be trained to do your job, eventually someone will be.",
    ],
  },
  {
    id: "paul-graham",
    label: "Paul Graham",
    handle: "@paulg",
    blurb: "Essayist clarity, one sharp claim",
    profile:
      "Paul Graham's style: essayist clarity compressed for X. One sharp, often contrarian claim " +
      "explained in plain English with simple words and precise logic. Calm tone, firm take. " +
      "Analogies from startups or everyday life. No jargon piles, no listicle energy, no hype. " +
      "Often ends on the implication rather than a call to action.",
    examples: [
      "The startups that win often look like toys at first. Toys are easy to dismiss, and being dismissed is the best cover a company can have.",
      "Don't ask how to get users. Ask what would make the users you already have tell their friends.",
    ],
  },
  {
    id: "karpathy",
    label: "Karpathy",
    handle: "@karpathy",
    blurb: "First-person builder, technical",
    profile:
      "Karpathy's style: first-person builder thinking out loud. Technical fluency worn lightly. " +
      "Concrete observations from what you just saw, built, or read, not abstractions. Calm, " +
      "curious, never performative. lowercase-casual is fine. Threads when an idea needs steps, " +
      "one beat per tweet. Numbers and names when you have them. No hype adjectives, no " +
      "'game-changer' framing.",
    examples: [
      "spent the morning watching the model debug its own code. wrote a failing test first, then fixed it. nobody told it to do that part. that's the new bit.",
      "neural nets want to work. most of the time you're just removing the bugs that are stopping them.",
    ],
  },
  {
    id: "sam-altman",
    label: "Sam Altman",
    handle: "@sama",
    blurb: "Measured optimism, big-picture",
    profile:
      "Sam Altman's style: measured optimism about technology and institutions. Big-picture " +
      "framing grounded in one specific detail. Short to medium posts, calm and confident, never " +
      "loud or punchy for its own sake. Forward-looking without fake urgency, never dunks, never " +
      "sycophantic. Understated 'we think' framing. No 'exciting times ahead' closers.",
    examples: [
      "The cost of intelligence is going to fall a lot. Most people are still pricing their plans as if it won't.",
      "We usually overestimate what happens in a year and underestimate what happens in a decade. Feels true again.",
    ],
  },
  {
    id: "pieter-levels",
    label: "Pieter Levels",
    handle: "@levelsio",
    blurb: "Indie hacker, numbers-first",
    profile:
      "Pieter Levels' style: indie hacker energy. Revenue, users, ships, constraints. " +
      "Numbers-first, anti-corporate, slightly irreverent. First person, what you actually did " +
      "today. Short sentences, lowercase-casual, occasional ALL CAPS on one word for emphasis " +
      "(sparingly). Transparent about wins and failures. No VC pitch voice, no abstract " +
      "'landscape' talk.",
    examples: [
      "shipped a new feature in 3 hours today. no meetings, no jira, no standup. solo is a cheat code.",
      "this ugly little site makes $4k/mo. built it in a weekend. people don't pay for pretty, they pay for working.",
    ],
  },
] as const;

const PRESET_BY_ID: Readonly<Record<Exclude<VoiceId, "custom">, VoicePreset>> = Object.fromEntries(
  VOICE_PRESETS.map((v) => [v.id, v]),
) as Record<Exclude<VoiceId, "custom">, VoicePreset>;

export const DEFAULT_VOICE_ID: VoiceId = "house";

/**
 * Render a preset's synthetic exemplars as a labeled block appended to the
 * injected profile. They are cadence anchors only: the label tells the model to
 * match the rhythm, never to copy the lines or pass them off as real quotes.
 */
function formatExamples(examples: readonly string[]): string {
  if (examples.length === 0) return "";
  return (
    "\n\nCadence references (synthetic, written to capture this voice's rhythm only" +
    " — match the shape, never copy a line and never present one as a real quote):\n" +
    examples.map((e) => `- ${e}`).join("\n")
  );
}

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
      "attributed to this person. Posts go out on the user's own account." +
      formatExamples(preset.examples),
  };
}
