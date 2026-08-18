/**
 * Register catalog for the composer. Register is the third orthogonal axis next
 * to `accountTier` (which formats) and `voice` (who it sounds like): it controls
 * **how serious** the post is. Shared source of truth for the UI toggle, the
 * register payload sent in clientContext each turn, and the deterministic guard
 * policy in drafts.ts.
 */

export const REGISTERS = ["sensible", "shitpost", "ragebait"] as const;
export type Register = (typeof REGISTERS)[number];

export const REGISTER_LABELS: Record<Register, string> = {
  sensible: "💡 sensible",
  shitpost: "🔥 shitpost",
  ragebait: "😤 ragebait",
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
    "applies as written. " +
    "Earnest does not mean flat: let one real felt emotion show (genuine curiosity, quiet awe, " +
    "disbelief at a number you verified). A take with no pulse reads generated no matter how " +
    "clean the prose is; the emotion is in the word choice and what you chose to notice, never " +
    "announced ('I find this fascinating' is filler, the fascinating detail is the emotion). " +
    "Works on any topic, not just tech: sports, food, money, health, culture, science, whatever " +
    "the user asked for. Do not drag a non-tech topic back to startups, software, or shipping " +
    "analogies; the specific detail comes from inside that topic's own world.",
  shitpost:
    "Shitpost register. The post is a joke first and it has to actually land. Setup, bait, then a " +
    "sudden absurd twist or non-sequitur. Roughly 80% real observation, 20% cringe or " +
    "self-deprecation. The emotional core is unhinged glee: you find the thing genuinely funny " +
    "and it shows in the typing. Write like you hit send while still laughing, mid-scroll, " +
    "slightly feral, not like you constructed a joke and sanded it down. If the draft reads " +
    "composed, it is dead; it should read blurted. " +
    "lowercase by default (it should read like someone typing on a phone, not " +
    "like an approval flow), fragments are fine, and a rough edge or a deliberate typo is persona, " +
    "not sloppiness. Self-contained: the single unit carries both the hook and the punchline, so " +
    "it still works when reposted alone. React to something happening right now. " +
    "Real premise, absurd take: the thing you are reacting to must be real and verified, and the " +
    "joke layered on top can be hyperbole, an absurd analogy, or obviously non-literal. Still zero " +
    "invented stats, fabricated quotes, or made-up events presented as real. Never rage-bait and " +
    "never punch at a person or group; it earns blocks and reports, not reach. Never explain the " +
    "joke and never argue with someone who missed it. " +
    "Works on any topic, not just tech: sports, food, money, health, culture, dating, commuting, " +
    "whatever the user asked for. Some of the best shitposts are about ordinary life. Do not drag " +
    "a non-tech topic back to startups, software, or shipping analogies; the joke has to come " +
    "from inside that topic's own world, using the details its audience already recognizes.",
  ragebait:
    "Ragebait register. Honest provocation, not manipulation: it engineers disagreement on " +
    "purpose. Take a position you would actually defend, stated plainly in the first line, " +
    "standard sentence case, no hedging; if someone sharp quote-tweets it, the post has to " +
    "survive that. A take you do not hold is not a hot take, it is a lie with better formatting. " +
    "The emotional core is mischief, written with a grin, not a scowl: you are the person at the " +
    "dinner table saying the thing everyone was too polite to say, and visibly enjoying it. " +
    "Gleeful, a little smug, mock-innocent when it fits ('I am just asking why the invoice " +
    "tripled'), a wink under the straight face. Never clinical and never actually furious: cold " +
    "anger reads corporate, hot anger reads unhinged, but mischief is what travels and what makes " +
    "people argue instead of report. The provocation is the structure; the mischief is the " +
    "delivery. " +
    "Five plays from the rage-bait literature are the craft here, taught, not banned: the Hot " +
    "Take (a genuinely arguable position, stated flat, no hedge), the Victim Flip (state the " +
    "position, then let the replies write the second act; it only works if the original claim " +
    "was defensible, and you quote the reaction, never a replier's identity), the Strawman " +
    "Setup (argue " +
    "against a position's weakest common form, never a fabricated one), the Bait and Switch (open " +
    "on the expected take, pivot to the real, defensible one you actually hold), and the Personal " +
    "Attack Disguised as Concern (frame the criticism as worry about what an idea or an " +
    "institution does to people). Two rails hold across all five and never relax: never " +
    "fabricate, quote, or misrepresent what a specific named person actually said, because " +
    "someone will paste the real quote in the replies and your post becomes the setup for their " +
    "win; and target public figures acting in public, companies, institutions, practices, " +
    "incentives, and consensus positions, never a private individual, never a protected group. " +
    "Real premise, real position. Research still runs: zero invented stats, zero fabricated " +
    "quotes, zero made-up events. Same seriousness as sensible: no calendar dates, no formula " +
    "shapes, because a provocation in a tired formula reads as AI slop, not conviction. " +
    "Works on any topic, not just tech: sports, food, money, health, culture, science, whatever " +
    "the user asked for. Do not drag a non-tech topic back to startups, software, or shipping " +
    "analogies; the position and the grounding detail come from inside that topic's own world.",
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
