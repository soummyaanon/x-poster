// Shared, deterministic draft-quality checks for the drafts eval. Not an eval
// file itself (no `.eval.ts` suffix), so the runner treats it as a helper.
//
// Everything here reuses agent/lib/drafts.ts, the single source of truth the
// compose_drafts tool also runs, so the eval's notion of "valid" can't drift
// from the app's.
import {
  type Draft,
  type Tier,
  TIER_FORMATS,
  unitsOf,
  validateDrafts,
} from "#lib/drafts.ts";

/**
 * AI "tells" the agent's instructions explicitly ban (agent/instructions.md,
 * "Human voice"). Checked case-insensitively against each *raw* post body, so a
 * model that writes an em dash or a tired formula is caught even though
 * humanizeText() would later scrub the dash. The dash check is the load-bearing
 * one; the phrase list mirrors the banned formulas in the instructions.
 */
export const BANNED_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: "em/en/figure dash", re: /[‒–—―]/ },
  { label: `"X isn't Y, it's Z"`, re: /\bisn'?t\b[^.?!\n]{0,40}\bit'?s\b/i },
  { label: `"the quiet part out loud"`, re: /quiet part out loud/i },
  { label: `"let that sink in"`, re: /let that sink in/i },
  { label: `"make no mistake"`, re: /make no mistake/i },
  { label: `"a line in the sand"`, re: /line in the sand/i },
  { label: `"in a world where"`, re: /in a world where/i },
  { label: `"here's why that matters"`, re: /here'?s why (that|this) matters/i },
  { label: `"it's worth noting"`, re: /it'?s worth noting/i },
  { label: `"in today's world"`, re: /in today'?s world/i },
];

/** Every post body in the set: one for short/single/long/quote, N for a thread. */
export function bodiesOf(drafts: readonly Draft[]): string[] {
  return drafts.flatMap((d) => unitsOf(d));
}

/**
 * Deterministic quality gate for one composed draft set. Returns human-readable
 * violation strings; an empty array means the set passed. Asserting this equals
 * `[]` makes a failure print exactly which rules broke.
 *
 * Length is checked against the humanized text (the real ceiling the tool
 * enforces); formats, counts, and banned phrases are checked against the raw
 * model output, so cleanup never hides a bad draft.
 */
export function findViolations(tier: Tier, drafts: readonly Draft[]): string[] {
  const v: string[] = [];
  const allowed = TIER_FORMATS[tier]; // premium: single/long; free: short/thread

  if (drafts.length < 2 || drafts.length > 3) {
    v.push(`expected 2-3 drafts, got ${drafts.length}`);
  }

  const validated = validateDrafts(drafts);

  drafts.forEach((draft, i) => {
    const tag = `draft #${i + 1} (${draft.format})`;
    const rawUnits = unitsOf(draft);
    const placeAt = (j: number) =>
      draft.format === "thread" ? `${tag} tweet ${j + 1}` : tag;

    if (!allowed.includes(draft.format)) {
      v.push(`${tag}: format not allowed for ${tier} tier (expected ${allowed.join(" or ")})`);
    }

    if (draft.format === "thread" && (rawUnits.length < 3 || rawUnits.length > 6)) {
      v.push(`${tag}: thread has ${rawUnits.length} tweets, expected 3-6`);
    }

    rawUnits.forEach((raw, j) => {
      for (const { label, re } of BANNED_PATTERNS) {
        if (re.test(raw)) v.push(`${placeAt(j)}: banned phrase ${label}`);
      }
    });

    validated[i].units.forEach((u, j) => {
      if (u.over) v.push(`${placeAt(j)}: ${u.chars} chars is over the limit`);
    });
  });

  return v;
}
