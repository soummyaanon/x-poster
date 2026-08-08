/**
 * Register catalog for the composer. Register is the third orthogonal axis next
 * to `accountTier` (which formats) and `voice` (who it sounds like): it controls
 * **how serious** the post is. Shared source of truth for the UI toggle, the
 * register payload sent in clientContext each turn, and the deterministic guard
 * policy in drafts.ts.
 */

export const REGISTERS = ["sensible", "shitpost"] as const;
export type Register = (typeof REGISTERS)[number];

export const REGISTER_LABELS: Record<Register, string> = {
  sensible: "💡 sensible",
  shitpost: "🔥 shitpost",
};

export const DEFAULT_REGISTER: Register = "sensible";

/** Resolved register context sent to the agent (one profile, no catalog bloat). */
export interface RegisterContext {
  readonly id: Register;
  readonly label: string;
  /** Injected register charter the model writes against. */
  readonly profile: string;
  [key: string]: string;
}

const REGISTER_PROFILES: Record<Register, string> = {
  sensible:
    "Sensible register, the default. An earnest, researched take: lead with the specific thing " +
    "you verified, deliver one insight, and let the specificity do the work. Standard sentence " +
    "case, clean prose, no calendar dates, no formula shapes, no joke bolted on the end. This is " +
    "the register the existing quality bar was written for; every rule in the base instructions " +
    "applies as written.",
  shitpost:
    "Shitpost register. The post is a joke first and it has to actually land. Setup, bait, then a " +
    "sudden absurd twist or non-sequitur. Roughly 80% real observation, 20% cringe or " +
    "self-deprecation. lowercase by default (it should read like someone typing on a phone, not " +
    "like an approval flow), fragments are fine, and a rough edge or a deliberate typo is persona, " +
    "not sloppiness. Self-contained: the single unit carries both the hook and the punchline, so " +
    "it still works when reposted alone. React to something happening right now. " +
    "Real premise, absurd take: the thing you are reacting to must be real and verified, and the " +
    "joke layered on top can be hyperbole, an absurd analogy, or obviously non-literal. Still zero " +
    "invented stats, fabricated quotes, or made-up events presented as real. Never rage-bait and " +
    "never punch at a person or group; it earns blocks and reports, not reach. Never explain the " +
    "joke and never argue with someone who missed it.",
};

export function isRegister(value: string): value is Register {
  return (REGISTERS as readonly string[]).includes(value);
}

export function registerLabel(id: Register): string {
  return REGISTER_LABELS[id];
}

/**
 * Build the register payload for clientContext. Only the selected register's
 * profile is included so each turn stays lean, the same reason
 * `resolveVoiceContext` does it.
 */
export function resolveRegisterContext(id: Register | undefined): RegisterContext {
  const resolved = id ?? DEFAULT_REGISTER;
  return {
    id: resolved,
    label: REGISTER_LABELS[resolved],
    profile: REGISTER_PROFILES[resolved],
  };
}
