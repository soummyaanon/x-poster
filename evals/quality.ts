// Shared, deterministic draft-quality checks for the drafts eval. Not an eval
// file itself (no `.eval.ts` suffix), so the runner treats it as a helper.
//
// Everything here reuses agent/lib/drafts.ts, the single source of truth the
// compose_drafts tool also runs, so the eval's notion of "valid" can't drift
// from the app's.
import {
  type Draft,
  MAX_DRAFTS,
  MIN_DRAFTS,
  type Tier,
  TIER_FORMATS,
  findDateHits,
  guardPolicyFor,
  unitsOf,
  validateDrafts,
} from "#lib/drafts.ts";
import { DEFAULT_REGISTER, type Register } from "#lib/registers.ts";

// AI "tells" are defined once in agent/lib/drafts.ts (the same source the
// compose_drafts tool runs) and imported here, so the eval's notion of a tell
// can't drift from what production actually enforces. The eval checks them
// against each *raw* post body (so an em dash is caught even though
// humanizeText() would later scrub it); the runtime tool checks the humanized
// text. Same patterns, slightly stricter input on the eval side.

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
 *
 * `register` selects the guard policy (defaults to `sensible`). Pass it from the
 * eval **case definition**, never from the model's compose_drafts input, so a
 * misreported register fails the eval instead of silently unlocking guards.
 */
export function findViolations(
  tier: Tier,
  drafts: readonly Draft[],
  register: Register = DEFAULT_REGISTER,
): string[] {
  const v: string[] = [];
  const allowed = TIER_FORMATS[tier]; // premium: short/single/long; free: short/thread
  // Same policy the compose_drafts tool applies, so the eval cannot drift from
  // production. Under shitpost the formula bans and the date guard are off; the
  // universal tells, limits, and tier formats are not.
  const policy = guardPolicyFor(register);

  if (drafts.length < MIN_DRAFTS || drafts.length > MAX_DRAFTS) {
    v.push(`expected ${MIN_DRAFTS}-${MAX_DRAFTS} drafts, got ${drafts.length}`);
  }

  const validated = validateDrafts(drafts, register);

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
      for (const { label, re } of policy.banned) {
        if (re.test(raw)) v.push(`${placeAt(j)}: banned phrase ${label}`);
      }
      // Hard date ban under sensible: no year, month name, or quarter in the post
      // text. Shitpost turns this off (a dated setup is the format working).
      if (policy.enforceDates) {
        const dates = findDateHits(raw);
        if (dates.length > 0) {
          v.push(
            `${placeAt(j)}: calendar date ${dates.map((d) => `"${d}"`).join(", ")} (no year/month/quarter in post text)`,
          );
        }
      }
    });

    validated[i].units.forEach((u, j) => {
      if (u.over) v.push(`${placeAt(j)}: ${u.chars} chars is over the limit`);
    });
  });

  return v;
}
