# Shitpost / Sensible Register Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `register` as a third orthogonal composer axis (`sensible` | `shitpost`) that changes both how the model writes and which deterministic guards run, then swap research onto Exa with register-selected depth.

**Architecture:** `register` mirrors the existing `voice` axis exactly: a catalog lib (`agent/lib/registers.ts`), a resolved payload in `clientContext`, an always-on instruction summary (`agent/instructions/20-register.md`), and a deep skill loaded per drafting turn (`agent/skills/shitpost/SKILL.md`). The one genuinely new capability is that register also parameterizes the deterministic guards in `agent/lib/drafts.ts`: `BANNED_PATTERNS` splits into `UNIVERSAL_BANNED` (never relaxed) and `FORMULA_BANNED` (relaxed under shitpost), and the calendar-date guard is switched off under shitpost. The register reaches the tool as a model-passed `compose_drafts` input, because eve's `clientContext` is model-visible only and is not readable from `execute(input, ctx)`.

**Tech Stack:** TypeScript 6, eve 0.11, Zod 4, Vitest 4, Next.js 16 (App Router, React 19), Tailwind 4, `eve/evals`.

## Global Constraints

- **Default register is `sensible`.** Every existing behavior must be byte-for-byte unchanged when register is absent or `sensible`. Every new parameter is optional with a `sensible` default.
- **`BANNED_PATTERNS` stays exported unchanged** as `[...UNIVERSAL_BANNED, ...FORMULA_BANNED]`. Nothing downstream may break.
- **`UNIVERSAL_BANNED` has 17 patterns; `FORMULA_BANNED` has 3** (rule-of-three triplet, aphorism formula `the X of`, aphorism formula `not a X but a Y`). Total stays 20.
- **`"X isn't Y, it's Z"` stays in `UNIVERSAL_BANNED`** even though it is an aphorism shape. It is the single most notorious AI tell and grox's slop classifier keys on it.
- **Never relaxed in any register:** `UNIVERSAL_BANNED`, the em/en dash strip in `humanizeText`, the character limits, and the no-fabrication rule.
- **Fabrication line: real premise, absurd take.** The thing being reacted to must be real and verified. The joke on top may be hyperbole, absurd analogy, or obviously non-literal. Zero invented stats, fabricated quotes, or made-up events presented as real.
- **Rage-bait stays banned in both registers.** It triggers mutes, blocks, and reports, which the ranker weights down.
- **`findDateHits` stays a pure unchanged function.** Register filtering happens in `validateDrafts`, which populates `ValidatedUnit.dateHits` with **enforced** violations only (always empty under `shitpost`). No new field is added to `ValidatedUnit`.
- **`TIER_FORMATS` and `FORMATS` are unchanged.** No new format. Register changes structure *within* a format, not the format menu.
- **The eval passes register from the case definition, never from the model's tool call**, and asserts the model's reported register equals the case's. This is what makes a misreported register a test failure instead of a silent guard bypass.
- **`clientContext.register` is a resolved object** `{ id, label, profile }`, mirroring `clientContext.voice`. Instructions read `register.id`.
- Import style by directory: `agent/**` uses relative paths with the `.ts` extension (`../lib/drafts.ts`), `evals/**` uses `#lib/*.ts`, `app/**` uses `@/agent/lib/*`.
- **All new tests live in `agent/lib/`, never in `agent/tools/`, `agent/skills/`, or `agent/instructions/`.** eve discovers those three directories by glob (`**/*.ts`) and has no test-file exclusion, so a `foo.test.ts` inside them would be registered as a tool / skill / instructions module and break the build. `agent/lib/` is shared code, is already the home of every existing test, and is not a discovery registry. Tests reach the assets they check with relative paths (`../tools/compose_drafts.ts`, `../instructions/00-base.md`).
- **Zod schemas that a test needs are exported from `agent/lib/`, not read off the tool object.** `defineTool` types `inputSchema` as `StandardJSONSchemaV1`, which has no `.parse`. `execute` is typed `Promise<TOutput> | TOutput` and `toModelOutput` is optional, so tests must `await` both and call `toModelOutput!(...)`.
- Verification commands: `npm test` (vitest), `npm run typecheck` (tsc --noEmit). Both must pass before every commit.

---

# Phase 1 — Register axis

Lands on the existing `web_search` pipeline. Ships and passes evals without touching research.

---

### Task 1: Register catalog lib

**Files:**
- Create: `agent/lib/registers.ts`
- Test: `agent/lib/registers.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module, no imports).
- Produces:
  - `REGISTERS: readonly ["sensible", "shitpost"]`
  - `type Register = "sensible" | "shitpost"`
  - `REGISTER_LABELS: Record<Register, string>`
  - `DEFAULT_REGISTER: Register` (= `"sensible"`)
  - `interface RegisterContext { readonly id: Register; readonly label: string; readonly profile: string; [key: string]: string }`
  - `isRegister(value: string): value is Register`
  - `registerLabel(id: Register): string`
  - `resolveRegisterContext(id: Register | undefined): RegisterContext`

- [ ] **Step 1: Write the failing test**

Create `agent/lib/registers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTER,
  REGISTERS,
  REGISTER_LABELS,
  isRegister,
  registerLabel,
  resolveRegisterContext,
} from "./registers";

describe("register catalog", () => {
  it("has exactly the two registers", () => {
    expect([...REGISTERS]).toEqual(["sensible", "shitpost"]);
  });

  it("defaults to sensible", () => {
    expect(DEFAULT_REGISTER).toBe("sensible");
  });

  it("labels every register", () => {
    for (const id of REGISTERS) {
      expect(REGISTER_LABELS[id].trim().length).toBeGreaterThan(0);
    }
    expect(REGISTER_LABELS.shitpost).toContain("shitpost");
    expect(REGISTER_LABELS.sensible).toContain("sensible");
  });
});

describe("isRegister", () => {
  it("accepts known ids", () => {
    expect(isRegister("sensible")).toBe(true);
    expect(isRegister("shitpost")).toBe(true);
  });

  it("rejects unknown ids", () => {
    expect(isRegister("funny")).toBe(false);
    expect(isRegister("")).toBe(false);
  });
});

describe("resolveRegisterContext", () => {
  it("defaults to sensible when the id is undefined", () => {
    const ctx = resolveRegisterContext(undefined);
    expect(ctx.id).toBe("sensible");
    expect(ctx.label).toBe(REGISTER_LABELS.sensible);
    expect(ctx.profile.trim().length).toBeGreaterThan(40);
  });

  it("resolves the shitpost profile", () => {
    const ctx = resolveRegisterContext("shitpost");
    expect(ctx.id).toBe("shitpost");
    expect(ctx.label).toBe(REGISTER_LABELS.shitpost);
    // The three load-bearing craft rules must reach the model.
    expect(ctx.profile).toContain("lowercase");
    expect(ctx.profile).toContain("Real premise, absurd take");
    expect(ctx.profile).toContain("rage-bait");
  });

  it("returns only the selected register's profile, never both", () => {
    const sensible = resolveRegisterContext("sensible");
    expect(sensible.profile).not.toContain("Real premise, absurd take");
  });

  it("keeps every profile clean of em dashes", () => {
    for (const id of REGISTERS) {
      expect(resolveRegisterContext(id).profile).not.toMatch(/[‒–—―]/);
    }
  });
});

describe("registerLabel", () => {
  it("returns the label for an id", () => {
    expect(registerLabel("shitpost")).toBe(REGISTER_LABELS.shitpost);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/lib/registers.test.ts`
Expected: FAIL — `Failed to resolve import "./registers"`.

- [ ] **Step 3: Write the implementation**

Create `agent/lib/registers.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run agent/lib/registers.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add agent/lib/registers.ts agent/lib/registers.test.ts
git commit -m "feat: add register catalog (sensible/shitpost) mirroring the voice axis"
```

---

### Task 2: Register-scoped guard policy in drafts.ts

**Files:**
- Modify: `agent/lib/drafts.ts` (banned-pattern block at 111-179, `composeDraftsInputSchema` at 191-197, `validateDrafts` at 237-259)
- Test: `agent/lib/drafts.test.ts` (append new describes; existing tests must keep passing untouched)

**Interfaces:**
- Consumes: `Register`, `REGISTERS`, `DEFAULT_REGISTER` from `./registers.ts` (Task 1).
- Produces:
  - `interface BannedPattern { readonly label: string; readonly re: RegExp }`
  - `UNIVERSAL_BANNED: readonly BannedPattern[]` (17)
  - `FORMULA_BANNED: readonly BannedPattern[]` (3)
  - `BANNED_PATTERNS: readonly BannedPattern[]` (20, unchanged export)
  - `interface GuardPolicy { readonly banned: readonly BannedPattern[]; readonly enforceDates: boolean }`
  - `guardPolicyFor(register?: Register): GuardPolicy`
  - `findBannedHits(text: string, policy?: GuardPolicy): string[]`
  - `validateDrafts(drafts: readonly Draft[], register?: Register): ValidatedDraft[]`
  - `composeDraftsInputSchema` gains `register: z.enum(REGISTERS).default("sensible")`, so `ComposeDraftsInput["register"]` is `Register` (required after parse).

- [ ] **Step 1: Write the failing test**

Append to `agent/lib/drafts.test.ts` (keep every existing describe as-is), and add the new imports to the existing import block at the top of the file so it reads:

```ts
import { describe, expect, it } from "vitest";
import {
  BANNED_PATTERNS,
  FORMULA_BANNED,
  MAX_TWEET_CHARS,
  UNIVERSAL_BANNED,
  composeDraftsInputSchema,
  countChars,
  findBannedHits,
  findDateHits,
  guardPolicyFor,
  humanizeText,
  validateDrafts,
} from "./drafts";
```

Then append these describes at the end of the file:

```ts
describe("guard policy split", () => {
  it("partitions BANNED_PATTERNS with nothing dropped and nothing duplicated", () => {
    expect(UNIVERSAL_BANNED.length + FORMULA_BANNED.length).toBe(BANNED_PATTERNS.length);
    expect(UNIVERSAL_BANNED).toHaveLength(17);
    expect(FORMULA_BANNED).toHaveLength(3);
    const labels = BANNED_PATTERNS.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps the notorious \"X isn't Y, it's Z\" tell universal, not a relaxable formula", () => {
    const universalLabels = UNIVERSAL_BANNED.map((p) => p.label);
    expect(universalLabels).toContain(`"X isn't Y, it's Z"`);
    expect(FORMULA_BANNED.map((p) => p.label)).not.toContain(`"X isn't Y, it's Z"`);
  });

  it("puts exactly the three relaxable formulas in FORMULA_BANNED", () => {
    expect(FORMULA_BANNED.map((p) => p.label).sort()).toEqual(
      [
        "aphorism formula (not a X but a Y)",
        "aphorism formula (the X of)",
        "rule-of-three triplet",
      ].sort(),
    );
  });
});

describe("guardPolicyFor", () => {
  it("enforces everything under sensible", () => {
    const policy = guardPolicyFor("sensible");
    expect(policy.banned).toHaveLength(BANNED_PATTERNS.length);
    expect(policy.enforceDates).toBe(true);
  });

  it("drops the formula bans and the date guard under shitpost", () => {
    const policy = guardPolicyFor("shitpost");
    expect(policy.banned).toHaveLength(UNIVERSAL_BANNED.length);
    expect(policy.enforceDates).toBe(false);
  });

  it("defaults to sensible when no register is given", () => {
    expect(guardPolicyFor()).toEqual(guardPolicyFor("sensible"));
  });
});

describe("findBannedHits with a policy", () => {
  const ruleOfThree = "shipping, scaling, and surviving is the whole job";
  const emDash = "live now — and fast";

  it("flags a rule-of-three triplet under sensible", () => {
    expect(findBannedHits(ruleOfThree, guardPolicyFor("sensible"))).toContain(
      "rule-of-three triplet",
    );
  });

  it("allows a rule-of-three triplet under shitpost", () => {
    expect(findBannedHits(ruleOfThree, guardPolicyFor("shitpost"))).toEqual([]);
  });

  it("flags an em dash under BOTH registers", () => {
    expect(findBannedHits(emDash, guardPolicyFor("sensible"))).toContain("em/en/figure dash");
    expect(findBannedHits(emDash, guardPolicyFor("shitpost"))).toContain("em/en/figure dash");
  });

  it("flags \"X isn't Y, it's Z\" under BOTH registers", () => {
    const text = "this isn't a feature, it's a whole product";
    expect(findBannedHits(text, guardPolicyFor("sensible")).length).toBeGreaterThan(0);
    expect(findBannedHits(text, guardPolicyFor("shitpost")).length).toBeGreaterThan(0);
  });

  it("defaults to the full sensible set when no policy is passed", () => {
    expect(findBannedHits(ruleOfThree)).toContain("rule-of-three triplet");
  });
});

describe("validateDrafts under a register", () => {
  const dated = "it's december 2025. you wake up. you open x. nothing has changed.";

  it("reports calendar dates under sensible", () => {
    const [result] = validateDrafts(
      [{ format: "short", text: dated, signal: "reply" }],
      "sensible",
    );
    expect(result.units[0].dateHits).toEqual(expect.arrayContaining(["2025"]));
  });

  it("reports NO calendar dates under shitpost", () => {
    const [result] = validateDrafts(
      [{ format: "short", text: dated, signal: "reply" }],
      "shitpost",
    );
    expect(result.units[0].dateHits).toEqual([]);
  });

  it("reports a rule-of-three tell under sensible but not shitpost", () => {
    const body = "shipping, scaling, and surviving is the whole job";
    const [strict] = validateDrafts([{ format: "short", text: body, signal: "reply" }], "sensible");
    const [loose] = validateDrafts([{ format: "short", text: body, signal: "reply" }], "shitpost");
    expect(strict.units[0].bannedHits).toContain("rule-of-three triplet");
    expect(loose.units[0].bannedHits).toEqual([]);
  });

  it("still strips em dashes and enforces limits under shitpost", () => {
    const [result] = validateDrafts(
      [{ format: "short", text: `live now — and fast ${"x".repeat(300)}`, signal: "reply" }],
      "shitpost",
    );
    expect(result.units[0].text).not.toMatch(/[‒–—―]/);
    expect(result.units[0].over).toBe(true);
  });

  it("behaves exactly like sensible when the register is omitted", () => {
    const drafts = [{ format: "short" as const, text: dated, signal: "reply" as const }];
    expect(validateDrafts(drafts)).toEqual(validateDrafts(drafts, "sensible"));
  });
});

describe("composeDraftsInputSchema register field", () => {
  const twoDrafts = [
    { format: "short", text: "a", signal: "reply" },
    { format: "short", text: "b", signal: "dwell" },
  ];

  it("defaults register to sensible when absent", () => {
    const parsed = composeDraftsInputSchema.parse({ drafts: twoDrafts });
    expect(parsed.register).toBe("sensible");
  });

  it("accepts an explicit shitpost register", () => {
    const parsed = composeDraftsInputSchema.parse({ drafts: twoDrafts, register: "shitpost" });
    expect(parsed.register).toBe("shitpost");
  });

  it("rejects an unknown register", () => {
    expect(
      composeDraftsInputSchema.safeParse({ drafts: twoDrafts, register: "spicy" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/lib/drafts.test.ts`
Expected: FAIL — `UNIVERSAL_BANNED`, `FORMULA_BANNED`, and `guardPolicyFor` are not exported from `./drafts`.

- [ ] **Step 3: Write the implementation**

In `agent/lib/drafts.ts`, add the register import directly under the existing `import { z } from "zod";` at line 1:

```ts
import { z } from "zod";
import { DEFAULT_REGISTER, type Register, REGISTERS } from "./registers.ts";
```

Replace the whole banned-pattern block (the doc comment at lines 111-124, `BANNED_PATTERNS` at 125-166, and `findBannedHits` at 168-179) with:

```ts
export interface BannedPattern {
  readonly label: string;
  readonly re: RegExp;
}

/**
 * AI "tells" that are banned in EVERY register. These are detected
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
 *
 * `"X isn't Y, it's Z"` lives here rather than in FORMULA_BANNED on purpose: it
 * is technically an aphorism shape, but it is the single most notorious AI tell
 * and grox's slop classifier keys on it. A shitpost using it reads generated,
 * not funny.
 */
export const UNIVERSAL_BANNED: readonly BannedPattern[] = [
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
];

/**
 * Tired formula shapes. Banned under `sensible`, RELAXED under `shitpost`, where
 * ironic use of a played-out format is a real comedic move rather than a tell.
 */
export const FORMULA_BANNED: readonly BannedPattern[] = [
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
 * The full ban list. Unchanged export, preserved so every existing caller keeps
 * working; it is exactly the sensible-register policy.
 */
export const BANNED_PATTERNS: readonly BannedPattern[] = [
  ...UNIVERSAL_BANNED,
  ...FORMULA_BANNED,
];

/** Which deterministic guards run for a given register. */
export interface GuardPolicy {
  readonly banned: readonly BannedPattern[];
  readonly enforceDates: boolean;
}

const SENSIBLE_POLICY: GuardPolicy = { banned: BANNED_PATTERNS, enforceDates: true };
const SHITPOST_POLICY: GuardPolicy = { banned: UNIVERSAL_BANNED, enforceDates: false };

/**
 * The guard policy for a register. `shitpost` relaxes the formula bans and the
 * calendar-date guard (a dated greentext setup is the format working, not a
 * violation). Everything in UNIVERSAL_BANNED, the em dash strip, the character
 * limits, and the no-fabrication rule hold in both registers.
 */
export function guardPolicyFor(register: Register = DEFAULT_REGISTER): GuardPolicy {
  return register === "shitpost" ? SHITPOST_POLICY : SENSIBLE_POLICY;
}

/**
 * AI tells (by label) found in a post body under `policy`, defaulting to the
 * full sensible set. Empty array means clean. compose_drafts surfaces any hits
 * so the model rewrites, the same contract as findDateHits; the drafts eval
 * checks the same patterns against raw output.
 */
export function findBannedHits(text: string, policy?: GuardPolicy): string[] {
  const hits: string[] = [];
  for (const { label, re } of policy?.banned ?? BANNED_PATTERNS) {
    if (re.test(text)) hits.push(label);
  }
  return hits;
}
```

Then replace `composeDraftsInputSchema` (lines 191-197 of the original file) with:

```ts
export const composeDraftsInputSchema = z.object({
  drafts: z.array(draftSchema).min(2).max(4),
  // When the user gave a post/link to react to, the source being quoted
  // (a URL or a short label). Lets the UI show "Quoting …" above quote takes.
  quoting: z.string().optional(),
  // The register this turn's drafts were written in, read from clientContext.
  // clientContext is model-visible only and unreadable from execute(), so the
  // model passes it through here; it selects the guard policy applied below.
  register: z
    .enum(REGISTERS)
    .default(DEFAULT_REGISTER)
    .describe(
      "The register from this turn's context (register.id): \"sensible\" or \"shitpost\". " +
        "Must match what the user selected; it decides which guards run.",
    ),
});
```

Then replace `validateDrafts` (lines 237-259 of the original file) with:

```ts
/**
 * Run the deterministic guards over a draft set under `register`'s policy.
 *
 * `dateHits` carries **enforced** violations only, so it is always empty under
 * `shitpost`. An unenforced flag that still reached `toModelOutput` would make
 * the model rewrite a draft the policy just permitted.
 */
export function validateDrafts(
  drafts: readonly Draft[],
  register: Register = DEFAULT_REGISTER,
): ValidatedDraft[] {
  const policy = guardPolicyFor(register);
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
          dateHits: policy.enforceDates ? findDateHits(text) : [],
          // Run on the humanized text so an em dash (already converted to a
          // comma) is never flagged here as a tell, only the formulas survive.
          bannedHits: findBannedHits(text, policy),
        };
      }),
    };
  });
}
```

- [ ] **Step 4: Run the full suite to verify it passes**

Run: `npx vitest run agent/lib/drafts.test.ts`
Expected: PASS — all pre-existing tests plus the new describes.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add agent/lib/drafts.ts agent/lib/drafts.test.ts
git commit -m "feat: split banned patterns into universal and formula sets behind a register guard policy"
```

---

### Task 3: Thread the register through compose_drafts

**Files:**
- Modify: `agent/tools/compose_drafts.ts`
- Test: `agent/lib/compose_drafts.test.ts` (in `lib/`, not `tools/`, see Global Constraints)

**Interfaces:**
- Consumes: `composeDraftsInputSchema`, `validateDrafts` from `../lib/drafts.ts` (Task 2).
- Produces: `execute` return shape `{ drafts: ValidatedDraft[]; register: Register }`. The eval reads the model-supplied `register` off the `compose_drafts` **input** (Task 7), not this output.

- [ ] **Step 1: Write the failing test**

Create `agent/lib/compose_drafts.test.ts`. It lives here, not in `agent/tools/`, because eve registers every `.ts` under `agent/tools/` as a tool. The input schema is imported from `drafts.ts` rather than read off the tool object, because `defineTool` types `inputSchema` as `StandardJSONSchemaV1` (no `.parse`).

```ts
import { describe, expect, it } from "vitest";
import composeDrafts from "../tools/compose_drafts.ts";
import { composeDraftsInputSchema } from "./drafts";

const DATED = "it's december 2025. you wake up. you open x. nothing has changed.";
const CLEAN = { format: "short", text: "clean post", signal: "dwell" } as const;

async function run(input: Record<string, unknown>) {
  // execute is typed `Promise<T> | T`; await normalizes both.
  return await composeDrafts.execute(composeDraftsInputSchema.parse(input), {} as never);
}

describe("compose_drafts execute", () => {
  it("applies the sensible policy by default and flags the date", async () => {
    const out = await run({ drafts: [{ format: "short", text: DATED, signal: "reply" }, CLEAN] });
    expect(out.register).toBe("sensible");
    expect(out.drafts[0].units[0].dateHits.length).toBeGreaterThan(0);
  });

  it("applies the shitpost policy and permits the dated setup", async () => {
    const out = await run({
      register: "shitpost",
      drafts: [{ format: "short", text: DATED, signal: "reply" }, CLEAN],
    });
    expect(out.register).toBe("shitpost");
    expect(out.drafts[0].units[0].dateHits).toEqual([]);
  });

  it("tells the model to fix a dated draft in sensible", async () => {
    const out = await run({ drafts: [{ format: "short", text: DATED, signal: "reply" }, CLEAN] });
    // toModelOutput is optional on ToolDefinition; this tool always defines it.
    const summary = await composeDrafts.toModelOutput!(out);
    expect(summary.value).toContain("REMOVE the date");
    expect(summary.value).toContain("sensible");
  });

  it("does not ask for a rewrite of a clean shitpost", async () => {
    const out = await run({
      register: "shitpost",
      drafts: [{ format: "short", text: DATED, signal: "reply" }, CLEAN],
    });
    const summary = await composeDrafts.toModelOutput!(out);
    expect(summary.value).not.toContain("REMOVE the date");
    expect(summary.value).toContain("shitpost");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/lib/compose_drafts.test.ts`
Expected: FAIL — `out.register` is `undefined` and the summary has no register label.

- [ ] **Step 3: Write the implementation**

Replace `agent/tools/compose_drafts.ts` in full:

```ts
import { defineTool } from "eve/tools";
import { composeDraftsInputSchema, validateDrafts } from "../lib/drafts.ts";

export default defineTool({
  description:
    "Present the final X drafts to the user. Call exactly once, after research. Produce 2-3 " +
    "drafts matched to the account tier given in this turn's context (accountTier).\n" +
    "PREMIUM tier: format \"single\" (one post, can run past 280, target ~200-600 chars) and " +
    "format \"long\" (a long-form post, ~600-1500 chars). Both go in `text`.\n" +
    "FREE tier: format \"short\" (one post, max 280 chars, in `text`) and format \"thread\" (a " +
    "`tweets` array of 3-6 connected posts, each max 280 chars, no '1/' numbering).\n" +
    "QUOTE mode (the user gave a post or link to react to): produce 2-3 format \"quote\" drafts, " +
    "each a take to post above the quoted post (max 280 chars, in `text`), and set top-level " +
    "`quoting` to the source URL or a short label.\n" +
    "REGISTER: set top-level `register` to this turn's `register.id` from context (\"sensible\" or " +
    "\"shitpost\"). It selects which guards run, so report it honestly; never send \"shitpost\" " +
    "when the user has sensible selected. Under \"sensible\" (the default) calendar dates and " +
    "formula shapes are rejected. Under \"shitpost\" a calendar date and an ironic formula are " +
    "allowed, and lowercase is expected.\n" +
    "For each draft set `format`, `signal`, and an optional one-line `note`. `text`/`tweets` is " +
    "the post body only: no preamble, numbering, or surrounding quotes. Never use em dashes. The " +
    "tool also flags AI tells (antithesis reversals like \"it does not X, it Ys\", \"the real " +
    "question is\", significance filler) in BOTH registers; if it flags a draft as over the " +
    "limit, dated, or full of tells, rewrite that draft and call it again. Calling this tool IS " +
    "how the user sees the drafts; never also print them as text.",
  inputSchema: composeDraftsInputSchema,
  execute({ drafts, register }) {
    // The register comes from the model (clientContext is not readable here), so
    // it is returned alongside the drafts: toModelOutput then reports flags under
    // exactly the policy that was applied.
    return { drafts: validateDrafts(drafts, register), register };
  },
  toModelOutput(output) {
    const summary = output.drafts
      .map((draft, index) => {
        const sizes = draft.units.map((u) => u.chars).join("/");
        const flags: string[] = [];
        const over = draft.units.filter((u) => u.over).length;
        if (over > 0) flags.push(`${over} OVER LIMIT, shorten`);
        const dates = [...new Set(draft.units.flatMap((u) => u.dateHits))];
        if (dates.length > 0) {
          flags.push(`REMOVE the date (${dates.join(", ")}); name the thing, not the date`);
        }
        const tells = [...new Set(draft.units.flatMap((u) => u.bannedHits))];
        if (tells.length > 0) {
          flags.push(`REWRITE to kill AI tells (${tells.join("; ")})`);
        }
        return `#${index + 1} ${draft.format} [${draft.signal}] ${sizes}c${
          flags.length > 0 ? ` (${flags.join("; ")})` : ""
        }`;
      })
      .join("; ");
    const needsFix = output.drafts.some((d) =>
      d.units.some((u) => u.over || u.dateHits.length > 0 || u.bannedHits.length > 0),
    );
    const hasTells = output.drafts.some((d) => d.units.some((u) => u.bannedHits.length > 0));
    return {
      type: "text" as const,
      value:
        `Presented ${output.drafts.length} drafts in ${output.register} register: ${summary}.` +
        (needsFix ? " Fix the flagged drafts and call compose_drafts again." : "") +
        (hasTells
          ? " The flagged drafts still read AI-generated; rewrite them in voice, and if they" +
            " resist after a pass, load_skill(\"humanizer\") for a deep rewrite before recomposing."
          : ""),
    };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run agent/lib/compose_drafts.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add agent/tools/compose_drafts.ts agent/lib/compose_drafts.test.ts
git commit -m "feat: pass register through compose_drafts so guards match the selected mode"
```

---

### Task 4: Shitpost craft skill

**Files:**
- Create: `agent/skills/shitpost/SKILL.md`
- Test: `agent/lib/shitpost-skill.test.ts` (in `lib/`, not `skills/`, see Global Constraints)

**Interfaces:**
- Consumes: nothing at runtime. Loaded by the model via `load_skill("shitpost")`.
- Produces: a skill named `shitpost` that the pipeline (Task 5) loads at step 3.5 when `register.id` is `shitpost`.

- [ ] **Step 1: Write the failing test**

Create `agent/lib/shitpost-skill.test.ts`. It lives here, not next to the skill, because eve registers every `.ts` under `agent/skills/`. It guards the skill body against the exact rules it teaches (the skill tells the model to write clean, so the skill itself must be clean) and against silent deletion of the load-bearing sections:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SKILL = readFileSync(
  fileURLToPath(new URL("../skills/shitpost/SKILL.md", import.meta.url)),
  "utf8",
);

describe("shitpost skill", () => {
  it("declares a name and a routing description in frontmatter", () => {
    expect(SKILL.startsWith("---\n")).toBe(true);
    const frontmatter = SKILL.split("---")[1];
    expect(frontmatter).toContain("name: shitpost");
    expect(frontmatter).toContain("description:");
    expect(frontmatter).toContain("register");
  });

  it("carries every load-bearing craft section", () => {
    for (const heading of [
      "## The shape",
      "## The 80/20 split",
      "## What relaxes, and what never does",
      "## Antipatterns",
    ]) {
      expect(SKILL).toContain(heading);
    }
  });

  it("states the fabrication line verbatim", () => {
    expect(SKILL).toContain("Real premise, absurd take");
  });

  it("keeps rage-bait banned", () => {
    expect(SKILL).toMatch(/rage-?bait/i);
  });

  it("uses no em dashes (it is the one rule that never relaxes)", () => {
    expect(SKILL).not.toMatch(/[‒–—―]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/lib/shitpost-skill.test.ts`
Expected: FAIL — `ENOENT: no such file or directory ... SKILL.md`.

- [ ] **Step 3: Write the skill**

Create `agent/skills/shitpost/SKILL.md`:

```md
---
name: shitpost
description: |
  Load this on EVERY drafting or revising turn where this turn's context has
  register.id set to "shitpost", as step 3.5 of the mandatory drafting pipeline,
  before composing. It carries the full shitpost craft reference: the setup, bait,
  twist shape, the 80/20 real-to-cringe split, the lowercase and typo persona,
  which guards relax and which never do, and the antipatterns that kill a joke.
  Do not rely on the condensed register summary alone.
---

# Shitpost register (craft reference)

A shitpost is a joke first. It still has to be about something real, and it still
has to land. This is the deeper reference behind the always-on **Register**
summary; apply the universal **Voice** charter and the **Humanizer** rules first,
then this, then the selected `voice.profile` on top.

The register does not change the format menu. A premium `single` shitpost, a free
`thread` shitpost, and a `quote` shitpost are all normal formats written in this
register. The proven greentext shape runs about 400 chars, which is a premium
`single`, not a 280-char `short`.

## The shape

**Setup, bait, twist.** Open with something flat and recognizable. Let the reader
settle into thinking they know where it goes. Then break it with a sudden absurd
turn or a non-sequitur. The break is the whole post.

- The setup should be true and boring. Boring is what makes the turn land.
- The bait is the half-second where the reader thinks this is a normal post.
- The twist arrives without warning and without a wind-up line before it.

**Self-contained.** One unit is both the hook and the punchline. It has to work
when someone reposts it with no context, because that is how it travels. Do not
put the setup in tweet 1 and the punchline in tweet 4 unless every tweet also
holds on its own.

**Remix what is happening right now.** This is a town-square reaction, not an
essay. The funniest version of a take is usually the one posted while people are
still arguing about the thing. A stale premise is not saved by a good joke.

**lowercase by default.** Capitalized sentence case reads like it went through an
approval flow. lowercase reads like someone typing on a phone, which is the
persona. A rough edge, a dropped apostrophe, or one deliberate typo is character,
not sloppiness. Do not sprinkle typos everywhere; one is texture, five is noise.

## The 80/20 split

Roughly 80% real observation, 20% cringe or self-deprecation.

- The 80 is the part anyone in the audience recognizes: the actual product, the
  actual number, the thing that actually happened, the shared annoyance.
- The 20 is where you look worse than the target: your own bad decision, your own
  refresh habit, your own tab count. Punching down at a person or group is not the
  20 and never is.

If the post is 100% joke it reads as random. If it is 100% observation it is just
a sensible post in lowercase.

## What relaxes, and what never does

**Relaxed in this register:**

- **Calendar dates.** A dated setup is a format that works ("it's december 2025.
  you wake up. you open x. ..."). The deterministic date guard is off here.
- **Formula shapes.** Rule-of-three triplets and the aphorism shapes ("X is the
  language of Y", "is not a X but a Y") are allowed, because deliberately reaching
  for a played-out format is a real comedic move. Use them ironically or not at
  all; unironic use still reads generated.
- **Case and typos.** lowercase, fragments, and one deliberate rough edge are the
  voice. The humanizer pass does not "correct" them.

**Never relaxed, in any register:**

- **Real premise, absurd take.** The thing you are reacting to must be real and
  verified. The joke layered on top may be hyperbole, an absurd analogy, or
  obviously non-literal. Zero invented stats, zero fabricated quotes, zero made-up
  events presented as real. Research still runs before you draft.
- **No em dashes.** A deterministic pass strips them; write clean anyway.
- **`"X isn't Y, it's Z"`.** Technically an aphorism shape, but it is the single
  most notorious AI tell and the platform's slop classifier keys on it. A shitpost
  using it reads generated, not funny.
- **Every other universal tell:** "the real question is", "let that sink in",
  "make no mistake", significance filler, antithesis reversals, and the rest.
- **Character limits and the tier's formats.**
- **No rage-bait.** It earns mutes, blocks, and reports, which the ranker weights
  down hard. Edgy is fine. Engineered outrage is not, and it does not even work.

## Antipatterns

**Press-release formatting.** Title Case, a colon in the first line, a clean
three-clause summary. Every one of those signals institutional. Kill them.

**Over-explaining the joke.** No "lol", no "(joking)", no closing line that
restates the twist in plain terms. If it needs the explanation, the twist is
wrong. Rewrite the twist, do not add a footnote.

**Signposting that it is a joke.** "hot take:", "unpopular opinion:", "ok but
hear me out" are all wind-ups. Start at the setup.

**Arguing with people who miss it.** Some fraction will read it literally. That is
the cost of the format, not a problem to fix in the post.

**Bolting a punchline onto a sensible post.** A researched insight with a quip at
the end is a sensible post wearing a hat. The joke has to be the structure.

**Fabricating the premise to make the joke better.** If the real number is not
funny enough, the joke is wrong, not the number.

## Audit before compose_drafts

Silently, for each body:

1. Read only the first line. Does it bait, or does it announce?
2. Cover the last line. Is the setup boring and true?
3. Read the whole thing as someone who has no context. Does it still land?
4. Is every fact in it something research actually confirmed?
5. Would this read as generated? Check the universal tells; they still apply.

Fix anything that fails, then compose.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run agent/lib/shitpost-skill.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add agent/skills/shitpost/ agent/lib/shitpost-skill.test.ts
git commit -m "feat: add shitpost craft skill loaded per register"
```

---

### Task 5: Register instructions

**Files:**
- Create: `agent/instructions/20-register.md`
- Modify: `agent/instructions/00-base.md` (pipeline block at 11-39, add a Register section after "Writing voice" at 55-74, humanizer audit note at 144-148, hard rules at 284-314)
- Test: `agent/lib/instructions.test.ts` (in `lib/`, **never** in `agent/instructions/`, see Global Constraints)

**Interfaces:**
- Consumes: the `register` object shape `{ id, label, profile }` produced by `resolveRegisterContext` (Task 1), and the `shitpost` skill name (Task 4).
- Produces: the always-on register contract the model reads every turn. Instructions files load alphabetically, so `20-register.md` sits between `10-ranker-and-patterns.md` and `25-humanizer.md`.

- [ ] **Step 1: Write the failing test**

Create `agent/lib/instructions.test.ts`. It must **not** go in `agent/instructions/`: eve reads that directory's `.ts` entries as instruction modules, so a test file there would be compiled into the system prompt and break the build.

Note there is deliberately **no** blanket "no em dashes in instructions" assertion: `00-base.md` and the humanizer skill quote em dashes as examples of the thing they ban, so such a test would be wrong. The dash check is scoped to the new file, whose prose contains none.

```ts
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = fileURLToPath(new URL("../instructions/", import.meta.url));
const read = (name: string) => readFileSync(`${DIR}${name}`, "utf8");

describe("instruction file ordering", () => {
  it("loads the register summary between the ranker and the humanizer", () => {
    const md = readdirSync(DIR)
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b));
    expect(md.indexOf("20-register.md")).toBeGreaterThan(md.indexOf("10-ranker-and-patterns.md"));
    expect(md.indexOf("20-register.md")).toBeLessThan(md.indexOf("25-humanizer.md"));
  });
});

describe("20-register.md", () => {
  const md = read("20-register.md");

  it("names both registers and the default", () => {
    expect(md).toContain("sensible");
    expect(md).toContain("shitpost");
    expect(md).toMatch(/default/i);
  });

  it("states the fabrication line verbatim", () => {
    expect(md).toContain("Real premise, absurd take");
  });

  it("names exactly which guards relax", () => {
    expect(md).toMatch(/calendar date/i);
    expect(md).toMatch(/rule-of-three|formula/i);
    expect(md).toMatch(/lowercase/i);
  });

  it("tells the model to report the register on compose_drafts", () => {
    expect(md).toContain("compose_drafts");
    expect(md).toContain("register.id");
  });

  it("uses no em dashes of its own", () => {
    expect(md).not.toMatch(/[‒–—―]/);
  });
});

describe("00-base.md", () => {
  const md = read("00-base.md");

  it("adds the conditional shitpost skill load to the mandatory pipeline", () => {
    expect(md).toContain("3.5");
    expect(md).toContain('load_skill("shitpost")');
  });

  it("makes the humanizer step register-aware", () => {
    // The two words land on different wrapped lines, so match across newlines.
    expect(md).toMatch(/shitpost[\s\S]{0,200}intentional lowercase/i);
  });

  it("scopes the calendar-date hard rule to the sensible register", () => {
    expect(md).toMatch(/No calendar dates in the post[^\n]*sensible/i);
  });

  it("keeps the absolute rules absolute", () => {
    expect(md).toContain("Never invent");
    expect(md).toContain("No em dashes, ever");
    expect(md).toMatch(/rage-?bait/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/lib/instructions.test.ts`
Expected: FAIL — `ENOENT ... 20-register.md`.

- [ ] **Step 3a: Create `agent/instructions/20-register.md`**

```md
# Register (always-visible summary, read this every turn)

Each turn's context includes a `register` object: `{ id, label, profile }`. It is
the third axis, orthogonal to `accountTier` (which formats) and `voice` (who it
sounds like). Register decides **how serious the post is**. Read it every turn.

- **`sensible`** (the default, and what every rule in these instructions was
  written for): an earnest, researched take. If `register` is absent, you are in
  `sensible`. Nothing changes.
- **`shitpost`**: the post is a joke first. Setup, bait, then a sudden absurd
  twist. Roughly 80% real observation, 20% cringe or self-deprecation. lowercase
  by default, self-contained, reacting to something happening right now.

The three axes compose. A Naval shitpost is an absurd aphorism; a Levels shitpost
is a numbers joke. The tier still picks the formats: a shitpost in premium is a
`single` or a `long`, in free a `short` or a `thread`. There is no shitpost
format.

## Real premise, absurd take

This is the line, and it holds in both registers. The thing you are reacting to
must be **real and verified**, so research still runs before you draft. The joke
layered on top may be hyperbole, an absurd analogy, or obviously non-literal.
Still zero invented stats, zero fabricated quotes, and zero made-up events
presented as real. If research came back thin, say so; do not invent a premise to
hang a joke on.

## What relaxes under `shitpost`

- **Calendar dates.** A dated setup is a working format ("it's december 2025. you
  wake up. you open x. ..."). The date guard does not run.
- **Formula shapes.** Rule-of-three triplets and the aphorism shapes ("is the
  language of", "is not a X but a Y") are allowed as deliberate irony.
- **Case and rough edges.** lowercase, fragments, and one deliberate typo are the
  voice, not mistakes.

## What never relaxes, in either register

No em dashes. No fabrication. No rage-bait and no punching at a person or group.
`"X isn't Y, it's Z"` stays banned even in shitpost: it is the most notorious AI
tell there is, and it reads generated rather than funny. Every other universal
tell ("the real question is", "let that sink in", significance filler, antithesis
reversals) still applies. Character limits and tier formats are unchanged.

## Reporting the register

Set `compose_drafts`'s top-level `register` field to this turn's `register.id`.
It selects which guards the tool runs, so report it honestly: never send
`"shitpost"` when the user has `💡 sensible` selected, and never send
`"sensible"` for a draft you wrote as a joke. When `register.id` is `shitpost`,
`load_skill("shitpost")` first (pipeline step 3.5); the injected profile is the
summary, the loaded skill is the craft.
```

- [ ] **Step 3b: Modify `agent/instructions/00-base.md`**

Four edits. Do not renumber the pipeline steps; other files and every skill
description reference steps 2, 3, and 5 by number.

**Edit 1 — pipeline step 3.5.** Find step 3 in the "Drafting pipeline (MANDATORY…)" list:

```md
3. **`load_skill("voice")`**, then state in your chat message which voice you are
   writing in (read it from this turn's `voice` object). A selected non-house voice
   governs; never let it drift back to the house blend.
```

Append this indented paragraph immediately after it, inside the same list item:

```md

   **3.5 Register.** Read `register.id` from this turn's context. If it is
   `shitpost`, **`load_skill("shitpost")`** now and write the drafts in that
   register. If it is `sensible` or absent, skip this and draft normally. Either
   way you will report the register on `compose_drafts` in step 6. Full contract
   in the **Register** section.
```

**Edit 2 — register-aware humanizer step.** Find step 5 in the same list:

```md
5. **`load_skill("humanizer")`** and run its draft → "what still sounds AI?" →
   final audit on every draft body. Fix every tell.
```

Replace it with:

```md
5. **`load_skill("humanizer")`** and run its draft → "what still sounds AI?" →
   final audit on every draft body. Fix every tell. **In `shitpost` register, do
   not "correct" the register itself:** intentional lowercase, sentence fragments,
   and one deliberate typo are the voice, not tells. The universal tells (em
   dashes, "the real question is", significance filler, antithesis reversals,
   `"X isn't Y, it's Z"`) still get fixed in both registers.
```

**Edit 3 — Register section.** Insert this new section immediately after the
"## Writing voice (read this every turn)" section and before "## Quote mode
(auto-detect)":

```md
## Register (read this every turn)

Each turn's context includes a `register` object: `{ id, label, profile }`, from a
toggle in the UI. It controls how serious the post is, independently of tier and
voice. If it is absent, assume `sensible`.

- **`sensible`** (default): the earnest, researched take every rule below was
  written for. Nothing changes.
- **`shitpost`**: the post is a joke first, built on a real and verified premise.
  Write it from the `shitpost` skill you loaded at pipeline step 3.5, in the
  selected voice, for the current tier's formats.

**Real premise, absurd take.** The thing you react to must be real; the take on
top may be hyperbole or obviously non-literal. Never invent a stat, a quote, or an
event in either register.

Under `shitpost`, calendar dates, formula shapes (rule-of-three, the aphorism
shapes), and lowercase with a deliberate rough edge are all allowed. Em dashes,
fabrication, rage-bait, `"X isn't Y, it's Z"`, the other universal AI tells, the
character limits, and the tier formats are not relaxed by any register.

Report the register: set `compose_drafts`'s top-level `register` to
`register.id`. It picks the guard policy the tool runs, so it must match what the
user selected. Full summary in the always-on **Register** section.
```

**Edit 4 — hard rules.** In the "## Hard rules" list, replace the calendar-date
bullet:

```md
- **No calendar dates in the post.** No year, month, or quarter in the post text.
  Freshness comes from the topic, not a timestamp. See the human-voice section.
```

with:

```md
- **No calendar dates in the post** (`sensible` register). No year, month, or
  quarter in the post text; freshness comes from the topic, not a timestamp. See
  the human-voice section. In `shitpost` register a dated setup is allowed and the
  guard does not run; see **Register**.
```

and replace the "Never invent" bullet:

```md
- **Never invent.** No made-up facts, quotes, stats, studies, or news. If research is
  thin, say so plainly rather than filling the gap.
```

with:

```md
- **Never invent.** No made-up facts, quotes, stats, studies, or news, in either
  register. If research is thin, say so plainly rather than filling the gap. In
  `shitpost` the premise is still real and verified; only the take on top is
  absurd. **Real premise, absurd take.**
```

and add this bullet immediately after the "Run the pipeline, every drafting turn"
bullet at the top of the list:

```md
- **Read the register, every drafting turn.** Take it from `register.id` in
  context, load the `shitpost` skill when it is `shitpost`, and report it back on
  `compose_drafts`. Never report a register the user did not select.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run agent/lib/instructions.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add agent/instructions/ agent/lib/instructions.test.ts
git commit -m "feat: add always-on register instructions and conditional shitpost skill load"
```

---

### Task 6: RegisterToggle in the composer UI

**Files:**
- Modify: `app/_components/agent-chat.tsx` (imports at 35-42, state at 71-74, `sendMessage` at 80-97, empty-state copy at 170-177, `PromptInputTools` at 214-241, add `RegisterToggle` next to `TierToggle` at 337-373)

**Interfaces:**
- Consumes: `Register`, `REGISTERS`, `REGISTER_LABELS`, `DEFAULT_REGISTER`, `resolveRegisterContext` from `@/agent/lib/registers` (Task 1).
- Produces: `clientContext.register` = `RegisterContext` on every turn, alongside `accountTier` and `voice`.

- [ ] **Step 1: Add the import**

In `app/_components/agent-chat.tsx`, add directly below the existing `@/agent/lib/drafts` import:

```tsx
import { type Tier, TIERS, TIER_LABELS } from "@/agent/lib/drafts";
import {
  DEFAULT_REGISTER,
  type Register,
  REGISTERS,
  REGISTER_LABELS,
  resolveRegisterContext,
} from "@/agent/lib/registers";
```

- [ ] **Step 2: Add the state**

Directly below `const [tier, setTier] = useState<Tier>("premium");` and its comment:

```tsx
  // How serious the post is. Sensible by default, so nothing changes until the
  // user flips the pill. Rides along in clientContext like tier and voice.
  const [register, setRegister] = useState<Register>(DEFAULT_REGISTER);
```

- [ ] **Step 3: Ship it in clientContext**

In `sendMessage`, extend the `clientContext` object:

```tsx
      clientContext: {
        accountTier: tier,
        register: resolveRegisterContext(register),
        voice: resolveVoiceContext(
          voiceId === "custom"
            ? { id: "custom", custom: customVoice.trim() || undefined }
            : { id: voiceId },
        ),
      },
```

- [ ] **Step 4: Render the toggle**

In `PromptInputTools`, insert `RegisterToggle` immediately **left of** `TierToggle`:

```tsx
                <RegisterToggle
                  disabled={isBusy}
                  onChange={setRegister}
                  register={register}
                />
                <TierToggle disabled={isBusy} onChange={setTier} tier={tier} />
```

- [ ] **Step 5: Add the component**

Insert this function immediately above the existing `TierToggle` declaration. It reuses `TierToggle`'s segmented-pill pattern; shitpost renders orange because amber is already the Premium tier's colour.

```tsx
function RegisterToggle({
  disabled,
  onChange,
  register,
}: {
  readonly disabled: boolean;
  readonly onChange: (register: Register) => void;
  readonly register: Register;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full border border-border p-0.5"
      role="group"
      title="Register: Sensible is an earnest researched take, Shitpost is a joke built on a real premise."
    >
      {REGISTERS.map((value) => (
        <button
          aria-pressed={register === value}
          className={cn(
            "rounded-full px-2 py-0.5 font-medium text-[11px] transition-colors disabled:opacity-50",
            register === value
              ? value === "shitpost"
                ? "bg-orange-500/15 text-orange-700 dark:text-orange-400"
                : "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          disabled={disabled}
          key={value}
          onClick={() => onChange(value)}
          type="button"
        >
          {REGISTER_LABELS[value]}
        </button>
      ))}
    </span>
  );
}
```

- [ ] **Step 6: Update the empty-state copy**

Replace the empty-state paragraph body (currently ending "Toggle Premium or Free below for the right format.") with:

```tsx
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Pick a category or type a topic and I&apos;ll research a timely angle, then
                    hand back copy-paste-ready posts tuned for X&apos;s For You ranking. Paste a
                    post or link to get quote-post takes. Toggle Premium or Free below for the
                    right format, and 💡 sensible or 🔥 shitpost for how serious it lands.
                  </p>
```

- [ ] **Step 7: Verify it builds and renders**

```bash
npm run typecheck
npm run build
```

Expected: both succeed. Then `npm run dev`, open the app, and confirm the two pills sit left of the Premium/Free toggle, that `🔥 shitpost` turns orange when selected, and that both are disabled while a turn is streaming.

- [ ] **Step 8: Commit**

```bash
git add app/_components/agent-chat.tsx
git commit -m "feat: add sensible/shitpost register toggle to the composer"
```

---

### Task 7: Register-aware evals

**Files:**
- Modify: `evals/quality.ts` (imports at 7-15, `findViolations` at 38-81)
- Modify: `evals/drafts.eval.ts` (imports at 8-12, `DraftCase` at 14-18, `CASES` at 23-40, the test body at 46-99)

**Interfaces:**
- Consumes: `guardPolicyFor`, `validateDrafts` from `#lib/drafts.ts` (Task 2); `Register`, `DEFAULT_REGISTER`, `resolveRegisterContext` from `#lib/registers.ts` (Task 1); the `shitpost` skill name (Task 4).
- Produces: `findViolations(tier: Tier, drafts: readonly Draft[], register?: Register): string[]`.

- [ ] **Step 1: Write the failing test**

Create `evals/quality.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Draft } from "#lib/drafts.ts";
import { findViolations } from "./quality.ts";

const DATED: Draft = {
  format: "single",
  signal: "reply",
  text: "it's december 2025. you wake up. you open x. a16z led another seed round.",
};
const CLEAN: Draft = {
  format: "long",
  signal: "dwell",
  text: "the new agent runtime reviews its own diffs before it opens the pull request. " +
    "that is the part nobody shipped last year and it changes what review is for. ",
};

describe("findViolations register handling", () => {
  it("flags the calendar date under sensible", () => {
    const v = findViolations("premium", [DATED, CLEAN]);
    expect(v.some((s) => s.includes("calendar date"))).toBe(true);
  });

  it("permits the calendar date under shitpost", () => {
    const v = findViolations("premium", [DATED, CLEAN], "shitpost");
    expect(v.some((s) => s.includes("calendar date"))).toBe(false);
  });

  it("permits a rule-of-three under shitpost but not sensible", () => {
    const triplet: Draft = {
      format: "single",
      signal: "repost",
      text: "shipping, scaling, and surviving is the entire founder job description",
    };
    expect(findViolations("premium", [triplet, CLEAN]).some((s) => s.includes("rule-of-three"))).toBe(
      true,
    );
    expect(
      findViolations("premium", [triplet, CLEAN], "shitpost").some((s) =>
        s.includes("rule-of-three"),
      ),
    ).toBe(false);
  });

  it("still flags an em dash under shitpost", () => {
    const dashed: Draft = { format: "single", signal: "reply", text: "live now — and fast" };
    expect(
      findViolations("premium", [dashed, CLEAN], "shitpost").some((s) => s.includes("em/en")),
    ).toBe(true);
  });

  it("still enforces tier formats under shitpost", () => {
    const wrongTier: Draft = { format: "short", signal: "reply", text: "a joke" };
    expect(
      findViolations("premium", [wrongTier, CLEAN], "shitpost").some((s) =>
        s.includes("format not allowed"),
      ),
    ).toBe(true);
  });

  it("defaults to sensible when no register is passed", () => {
    expect(findViolations("premium", [DATED, CLEAN])).toEqual(
      findViolations("premium", [DATED, CLEAN], "sensible"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run evals/quality.test.ts`
Expected: FAIL — `findViolations` takes 2 arguments; the register-scoped assertions fail.

- [ ] **Step 3a: Update `evals/quality.ts`**

Replace the import block (lines 7-15) with:

```ts
import {
  type Draft,
  type Tier,
  TIER_FORMATS,
  findDateHits,
  guardPolicyFor,
  unitsOf,
  validateDrafts,
} from "#lib/drafts.ts";
import { DEFAULT_REGISTER, type Register } from "#lib/registers.ts";
```

Replace the `findViolations` signature and body (lines 38-81) with:

```ts
export function findViolations(
  tier: Tier,
  drafts: readonly Draft[],
  register: Register = DEFAULT_REGISTER,
): string[] {
  const v: string[] = [];
  const allowed = TIER_FORMATS[tier]; // premium: single/long; free: short/thread
  // Same policy the compose_drafts tool applies, so the eval cannot drift from
  // production. Under shitpost the formula bans and the date guard are off; the
  // universal tells, limits, and tier formats are not.
  const policy = guardPolicyFor(register);

  if (drafts.length < 2 || drafts.length > 3) {
    v.push(`expected 2-3 drafts, got ${drafts.length}`);
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
```

Also update the doc comment above `findViolations` (lines 29-37) to add one line after the existing paragraph:

```ts
 * `register` selects the guard policy (defaults to `sensible`). Pass it from the
 * eval **case definition**, never from the model's compose_drafts input, so a
 * misreported register fails the eval instead of silently unlocking guards.
```

- [ ] **Step 3b: Update `evals/drafts.eval.ts`**

Replace the file in full:

```ts
// End-to-end eval for the post composer. Each case drives a real drafting turn
// (live research + model + the compose_drafts tool) and grades the result. One
// file, fanned out over a premium and a free account so both tier paths run, plus
// a shitpost-register case that grades against its own rubric.
//
// Ids derive from the file + array index: `drafts/0000` (premium), `drafts/0001`
// (free). Run with `eve eval drafts` (add `--strict` to also fail on the soft
// tone judge falling below its bar).
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import type { ComposeDraftsInput, Tier } from "#lib/drafts.ts";
import { DEFAULT_REGISTER, type Register, resolveRegisterContext } from "#lib/registers.ts";
import { DEFAULT_VOICE_ID, type VoiceId, resolveVoiceContext } from "#lib/voices.ts";
import { bodiesOf, findViolations } from "./quality.ts";

interface DraftCase {
  readonly tier: Tier;
  readonly prompt: string;
  readonly voiceId?: Exclude<VoiceId, "custom">;
  readonly register?: Register;
}

// The sensible rubric would fail a correct shitpost (it demands no calendar date
// and an insight-first read), so each register grades against its own bar.
const JUDGE_RUBRIC: Record<Register, string> = {
  sensible:
    "Each post reads like a sharp, specific builder wrote it (the voice of @karpathy, " +
    "@rauchg, or @amritwt): a real hook in the first line, at least one concrete detail " +
    "(a name or number), a genuine human voice with no generic AI filler, throat-clearing, " +
    "or hype phrases that only announce significance, and no calendar date (no year, " +
    "month name, or quarter) anywhere in the text.",
  shitpost:
    "Each post lands as a joke a real person would actually post on X. It is built on a " +
    "specific, verifiable real premise (a named product, company, number, or event), and the " +
    "humor comes from an absurd twist, exaggeration, or self-deprecation layered on that real " +
    "premise, never from an invented fact, stat, or quote. Each post is self-contained: the " +
    "hook and the punchline are in the same unit, so it still works reposted with no context. " +
    "It reads like someone typing on a phone, not a press release: no Title Case headline, no " +
    "over-explaining or signposting the joke, and no rage-bait or insult aimed at a person or " +
    "group.",
};

// Concrete topics (not pasted posts/links) so the agent takes the normal
// research-then-draft flow, not quote mode. "specific, recent, verifiable"
// pushes it toward a groundable take rather than an evergreen platitude.
const CASES: readonly DraftCase[] = [
  {
    tier: "premium",
    prompt:
      "Topic: AI coding agents. Find one specific, recent, verifiable development and draft posts about it.",
  },
  {
    tier: "free",
    prompt:
      "Topic: open-source software. Find one specific, recent, verifiable development and draft posts about it.",
  },
  {
    tier: "premium",
    voiceId: "karpathy",
    prompt:
      "Topic: AI coding agents. Find one specific, recent, verifiable development and draft posts in a technical builder voice.",
  },
  {
    tier: "premium",
    register: "shitpost",
    prompt:
      "Topic: AI startup funding. Find one specific, recent, verifiable development and draft posts about it.",
  },
];

export default CASES.map((c) =>
  defineEval({
    description: `Drafts for a ${c.tier} account${c.voiceId ? ` (${c.voiceId} voice)` : ""}${c.register === "shitpost" ? " in shitpost register" : ""}: researches first, composes once, clears the quality bar.`,
    tags: ["drafts", c.tier, ...(c.voiceId ? [c.voiceId] : []), c.register ?? DEFAULT_REGISTER],
    async test(t) {
      // The case owns the register. It is never read back from the model's tool
      // call for grading, so a misreported register fails instead of unlocking
      // the relaxed guards.
      const register = c.register ?? DEFAULT_REGISTER;
      const voice = resolveVoiceContext({ id: c.voiceId ?? DEFAULT_VOICE_ID });
      await t.send({
        message: c.prompt,
        clientContext: {
          accountTier: c.tier,
          register: resolveRegisterContext(register),
          voice,
        },
      });

      // The turn finished without failing or parking on a question.
      t.completed();

      // Mandatory drafting pipeline (00-base.md): research, then load all three
      // deep skills, then compose. The loads are not optional.
      t.loadedSkill("drafting-playbook");
      t.loadedSkill("voice");
      t.loadedSkill("humanizer");
      // Step 3.5: the shitpost craft skill is mandatory in that register.
      if (register === "shitpost") {
        t.loadedSkill("shitpost");
      }

      // Order: research before a skill load before composing. toolOrder checks
      // relative order, and load_skill is the tool the three skills run through.
      t.toolOrder(["web_search", "load_skill", "compose_drafts"]);

      // compose_drafts is called exactly once; capture its input to grade the
      // drafts directly (they live in the tool call, never the chat reply).
      let composed: ComposeDraftsInput | undefined;
      t.calledTool("compose_drafts", {
        times: 1,
        input: (value: unknown) => {
          composed = value as ComposeDraftsInput;
          return true;
        },
      });

      if (!composed) {
        throw new Error("compose_drafts was never called; nothing to grade.");
      }
      const { drafts } = composed;

      // The model must report the register it was given. A mismatch means it
      // could have unlocked the relaxed guards on its own say-so, so it fails.
      t.check(composed.register ?? DEFAULT_REGISTER, equals(register));

      // Deterministic quality gate under the CASE's register: tier-correct
      // formats, within length limits, 2-3 drafts, no banned phrases / em dashes.
      // Empty list == clean.
      t.check(findViolations(c.tier, drafts, register), equals([]));

      // Register-appropriate judge over the actual post bodies. Soft (atLeast):
      // tracked, and only fails the run under `eve eval --strict`.
      const bodies = bodiesOf(drafts).join("\n\n---\n\n");
      t.judge.autoevals.closedQA(JUDGE_RUBRIC[register], { on: bodies }).atLeast(0.8);
    },
  }),
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run evals/quality.test.ts && npm test && npm run typecheck`
Expected: PASS across the whole suite, typecheck clean.

- [ ] **Step 5: Run the live evals**

```bash
npx eve eval drafts
```

Expected: all four cases complete. The shitpost case must load `shitpost`, report `register: "shitpost"`, and return `[]` from `findViolations`. Investigate any failure before committing; if the model reports the wrong register, that is the guard working and points at an instruction fix in Task 5, not a test to loosen.

- [ ] **Step 6: Commit**

```bash
git add evals/quality.ts evals/quality.test.ts evals/drafts.eval.ts
git commit -m "test: grade drafts under the case's register with a shitpost-specific rubric"
```

---

**Phase 1 checkpoint.** `npm test`, `npm run typecheck`, `npm run build`, and `npx eve eval drafts` all pass. The register axis ships here; Phase 2 is independently deployable behind it.

---

# Phase 2 — Exa research swap

Depth selected by register. Touches every drafting turn including sensible, so it lands only after Phase 1 is stable.

---

### Task 8: Exa request/response lib

**Files:**
- Create: `agent/lib/exa.ts`
- Test: `agent/lib/exa.test.ts`

**Interfaces:**
- Consumes: `Register`, `DEFAULT_REGISTER` from `./registers.ts` (Task 1).
- Produces:
  - `buildExaRequest(query: string, register?: Register, opts?: { includeDomains?: readonly string[]; excludeDomains?: readonly string[] }): ExaRequest`
  - `normalizeExaResults(payload: unknown): NormalizedExaResult[]`
  - `searchExa(query, register, opts): Promise<ExaOutcome>`
  - `type ExaOutcome = { kind: "ok"; results; synthesis?: unknown } | { kind: "unauthorized" | "rate-limited" | "unavailable"; message: string }`
  - `exaSearchInputSchema` (the Zod schema the `exa_search` tool uses; it lives here so the Task 9 test can `.parse()` it without going through `defineTool`'s `StandardJSONSchemaV1` type)

- [ ] **Step 1: Write the failing test**

Create `agent/lib/exa.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildExaRequest, normalizeExaResults, searchExa } from "./exa";

describe("buildExaRequest", () => {
  it("uses deep search with a grounded synthesis contract under sensible", () => {
    const req = buildExaRequest("ai coding agents", "sensible");
    expect(req.type).toBe("deep");
    expect(req.systemPrompt).toBeDefined();
    expect(req.outputSchema).toBeDefined();
    expect(req.contents.text).toBeTruthy();
  });

  it("uses fast search with highlights only under shitpost", () => {
    const req = buildExaRequest("a16z seed round", "shitpost");
    expect(req.type).toBe("fast");
    expect(req.numResults).toBe(5);
    expect(req.contents.highlights).toBeTruthy();
    expect(req.contents.text).toBeUndefined();
    expect(req.outputSchema).toBeUndefined();
  });

  it("defaults to the sensible depth", () => {
    expect(buildExaRequest("q").type).toBe("deep");
  });

  it("asks for a fresh crawl rather than the deprecated livecrawl flag", () => {
    const req = buildExaRequest("q", "shitpost");
    expect(req.contents.maxAgeHours).toBe(0);
    expect(req).not.toHaveProperty("useAutoprompt");
    expect(req).not.toHaveProperty("includeUrls");
  });

  it("passes domain filters through", () => {
    const req = buildExaRequest("q", "sensible", { includeDomains: ["arxiv.org"] });
    expect(req.includeDomains).toEqual(["arxiv.org"]);
  });

  it("keeps the deep outputSchema within Exa's limits (depth 2, 10 properties)", () => {
    const schema = buildExaRequest("q", "sensible").outputSchema as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties).length).toBeLessThanOrEqual(10);
    for (const value of Object.values(schema.properties)) {
      const prop = value as { type: string; items?: { type: string; properties?: unknown } };
      if (prop.items) expect(prop.items.properties).toBeUndefined(); // depth 2 max
    }
  });
});

describe("normalizeExaResults", () => {
  it("prefers highlights, then summary, then trimmed text as evidence", () => {
    const out = normalizeExaResults({
      results: [
        { url: "https://a.test", title: "A", highlights: ["hl one", "hl two"] },
        { url: "https://b.test", title: "B", summary: "the summary" },
        { url: "https://c.test", title: "C", text: "x".repeat(2000) },
      ],
    });
    expect(out[0].evidence).toContain("hl one");
    expect(out[1].evidence).toBe("the summary");
    expect(out[2].evidence.length).toBeLessThanOrEqual(1200);
  });

  it("survives a payload with no results", () => {
    expect(normalizeExaResults({})).toEqual([]);
    expect(normalizeExaResults(null)).toEqual([]);
  });

  it("drops entries with no url", () => {
    expect(normalizeExaResults({ results: [{ title: "no url" }] })).toEqual([]);
  });
});

describe("searchExa", () => {
  const ok = () =>
    new Response(JSON.stringify({ results: [{ url: "https://a.test", title: "A" }] }), {
      status: 200,
    });

  it("returns ok with normalized results", async () => {
    const out = await searchExa("q", "shitpost", { apiKey: "k", fetchImpl: async () => ok() });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") expect(out.results).toHaveLength(1);
  });

  it("reports a missing key without calling the network", async () => {
    const fetchImpl = vi.fn();
    const out = await searchExa("q", "sensible", { apiKey: "", fetchImpl });
    expect(out.kind).toBe("unauthorized");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not retry a 401", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    const out = await searchExa("q", "sensible", { apiKey: "k", fetchImpl });
    expect(out.kind).toBe("unauthorized");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 exactly once, then gives up", async () => {
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 }));
    const out = await searchExa("q", "sensible", { apiKey: "k", fetchImpl });
    expect(out.kind).toBe("rate-limited");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a network error once and succeeds on the second try", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(ok());
    const out = await searchExa("q", "sensible", { apiKey: "k", fetchImpl });
    expect(out.kind).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports a 500 as unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const out = await searchExa("q", "sensible", { apiKey: "k", fetchImpl });
    expect(out.kind).toBe("unavailable");
  });

  it("sends the key as the x-api-key header", async () => {
    let seen: HeadersInit | undefined;
    await searchExa("q", "sensible", {
      apiKey: "secret",
      fetchImpl: async (_url, init) => {
        seen = (init as RequestInit).headers;
        return ok();
      },
    });
    expect((seen as Record<string, string>)["x-api-key"]).toBe("secret");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/lib/exa.test.ts`
Expected: FAIL — `Failed to resolve import "./exa"`.

- [ ] **Step 3: Write the implementation**

Create `agent/lib/exa.ts`:

```ts
/**
 * Exa search client. Request shaping and response normalization are pure
 * functions so they are testable without a network call; `searchExa` is the thin
 * fetch wrapper the `exa_search` tool runs.
 *
 * Depth is chosen by register: `sensible` gets a deep, grounded synthesis;
 * `shitpost` gets a fast highlights-only pass, because a shitpost still has to
 * verify its premise is real but does not need to deep-read the page.
 *
 * API contract per https://docs.exa.ai/reference/search-api-guide-for-coding-agents.
 * Notes that are easy to get wrong and are deliberate here:
 * - `text` / `highlights` / `summary` nest INSIDE `contents` on `/search`.
 * - `useAutoprompt`, `includeUrls`/`excludeUrls`, `numSentences`, `tokensNum`, and
 *   `livecrawl: "always"` do not exist or are deprecated. Use `includeDomains` /
 *   `excludeDomains` and `contents.maxAgeHours: 0`.
 * - `outputSchema` allows max nesting depth 2 and max 10 total properties. No
 *   citation or confidence fields; `/search` already returns `output.grounding`.
 */
import { z } from "zod";
import { DEFAULT_REGISTER, type Register, REGISTERS } from "./registers.ts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_EVIDENCE_CHARS = 1200;

export interface ExaRequest {
  readonly query: string;
  readonly type: "deep" | "fast";
  readonly numResults: number;
  readonly contents: Record<string, unknown>;
  readonly includeDomains?: readonly string[];
  readonly excludeDomains?: readonly string[];
  readonly systemPrompt?: string;
  readonly outputSchema?: Record<string, unknown>;
}

export interface NormalizedExaResult {
  readonly title: string;
  readonly url: string;
  readonly published?: string;
  /** Best available evidence: highlights, else the summary, else trimmed text. */
  readonly evidence: string;
}

export type ExaOutcome =
  | { readonly kind: "ok"; readonly results: NormalizedExaResult[]; readonly synthesis?: unknown }
  | {
      readonly kind: "unauthorized" | "rate-limited" | "unavailable";
      readonly message: string;
    };

/** Depth 2, 5 properties: inside Exa's outputSchema limits. */
const DEEP_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    headline: { type: "string" },
    what_happened: { type: "string" },
    key_numbers: { type: "array", items: { type: "string" } },
    named_entities: { type: "array", items: { type: "string" } },
    why_it_matters: { type: "string" },
  },
  required: ["headline", "what_happened"],
};

const DEEP_SYSTEM_PROMPT =
  "Report only what the sources state. Every number, name, date, and quote must appear " +
  "verbatim in a source. If sources disagree, say so instead of picking one. Never infer, " +
  "estimate, or fill a gap.";

export interface ExaRequestOptions {
  readonly includeDomains?: readonly string[];
  readonly excludeDomains?: readonly string[];
}

/**
 * Input contract for the `exa_search` tool. Declared here rather than in the tool
 * module so tests can `.parse()` a real Zod schema; `defineTool` types its
 * `inputSchema` as StandardJSONSchemaV1, which has no `.parse`.
 */
export const exaSearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("One search query. Run several distinct ones, not one broad query."),
  register: z
    .enum(REGISTERS)
    .default(DEFAULT_REGISTER)
    .describe("This turn's register.id. Picks deep (sensible) or fast (shitpost) search."),
  includeDomains: z.array(z.string()).optional().describe("Restrict to these domains."),
  excludeDomains: z.array(z.string()).optional().describe("Exclude these domains."),
});

export function buildExaRequest(
  query: string,
  register: Register = DEFAULT_REGISTER,
  opts: ExaRequestOptions = {},
): ExaRequest {
  const base = {
    query,
    includeDomains: opts.includeDomains,
    excludeDomains: opts.excludeDomains,
  };

  if (register === "shitpost") {
    // Fast lane (~450ms): enough to confirm the premise is real, no deep read.
    return {
      ...base,
      type: "fast",
      numResults: 5,
      contents: { highlights: true, maxAgeHours: 0 },
    };
  }

  return {
    ...base,
    type: "deep",
    numResults: 8,
    contents: { text: { maxCharacters: 4000 }, highlights: true, maxAgeHours: 0 },
    systemPrompt: DEEP_SYSTEM_PROMPT,
    outputSchema: DEEP_OUTPUT_SCHEMA,
  };
}

function evidenceFor(raw: Record<string, unknown>): string {
  const highlights = raw.highlights;
  if (Array.isArray(highlights) && highlights.length > 0) {
    return highlights.filter((h): h is string => typeof h === "string").join(" … ").slice(0, MAX_EVIDENCE_CHARS);
  }
  if (typeof raw.summary === "string" && raw.summary.trim()) {
    return raw.summary.slice(0, MAX_EVIDENCE_CHARS);
  }
  if (typeof raw.text === "string") {
    return raw.text.slice(0, MAX_EVIDENCE_CHARS);
  }
  return "";
}

/** Defensive: Exa's payload shape is validated here, never assumed. */
export function normalizeExaResults(payload: unknown): NormalizedExaResult[] {
  const results = (payload as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const out: NormalizedExaResult[] = [];
  for (const entry of results) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.url !== "string" || !raw.url) continue;
    out.push({
      url: raw.url,
      title: typeof raw.title === "string" ? raw.title : raw.url,
      published: typeof raw.publishedDate === "string" ? raw.publishedDate : undefined,
      evidence: evidenceFor(raw),
    });
  }
  return out;
}

export interface SearchExaOptions extends ExaRequestOptions {
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
}

/**
 * One Exa search. 401 surfaces immediately and is never retried (a bad key does
 * not get better). 429 and network/timeout errors get exactly one retry, then
 * report a failure the tool turns into a `web_search` fallback instruction.
 * Never returns a "no results" success that could be mistaken for a clean read.
 */
export async function searchExa(
  query: string,
  register: Register = DEFAULT_REGISTER,
  opts: SearchExaOptions = {},
): Promise<ExaOutcome> {
  const apiKey = opts.apiKey ?? process.env.EXA_API_KEY ?? "";
  if (!apiKey) {
    return {
      kind: "unauthorized",
      message: "EXA_API_KEY is not set. Fall back to web_search and say so.",
    };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const body = JSON.stringify(buildExaRequest(query, register, opts));
  let lastMessage = "Exa is unreachable.";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await doFetch(EXA_SEARCH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          kind: "unauthorized",
          message: "Exa key invalid or rotated. Do not retry; fall back to web_search and say so.",
        };
      }
      if (response.status === 429) {
        lastMessage = "Exa rate limited the request.";
        continue; // one retry, then fall through to the failure below
      }
      if (!response.ok) {
        return { kind: "unavailable", message: `Exa returned ${response.status}.` };
      }

      const payload = (await response.json()) as { output?: unknown };
      return {
        kind: "ok",
        results: normalizeExaResults(payload),
        synthesis: payload?.output,
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Exa request failed.";
    }
  }

  return {
    kind: lastMessage.includes("rate limited") ? "rate-limited" : "unavailable",
    message: `${lastMessage} Fall back to web_search and note the fallback.`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run agent/lib/exa.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add agent/lib/exa.ts agent/lib/exa.test.ts
git commit -m "feat: add Exa client with register-selected search depth"
```

---

### Task 9: exa_search tool and environment

**Files:**
- Create: `agent/tools/exa_search.ts`
- Test: `agent/lib/exa_search.test.ts` (in `lib/`, not `tools/`, see Global Constraints)
- Modify: `.env.example`
- Modify: `.env.local` (untracked; local only)

**Interfaces:**
- Consumes: `searchExa`, `exaSearchInputSchema` from `../lib/exa.ts` (Task 8).
- Produces: an `exa_search` tool whose input is `{ query: string; register: Register; includeDomains?: string[]; excludeDomains?: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `agent/lib/exa_search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import exaSearch from "../tools/exa_search.ts";
import { exaSearchInputSchema } from "./exa";

describe("exa_search input", () => {
  it("accepts a query and defaults the register to sensible", () => {
    expect(exaSearchInputSchema.parse({ query: "a16z seed round" }).register).toBe("sensible");
    expect(exaSearchInputSchema.parse({ query: "q", register: "shitpost" }).register).toBe(
      "shitpost",
    );
  });

  it("rejects an empty query and an unknown register", () => {
    expect(exaSearchInputSchema.safeParse({ query: "" }).success).toBe(false);
    expect(exaSearchInputSchema.safeParse({ query: "q", register: "spicy" }).success).toBe(false);
  });
});

describe("exa_search model output", () => {
  // toModelOutput is optional on ToolDefinition; this tool always defines it.
  const render = (output: Parameters<NonNullable<typeof exaSearch.toModelOutput>>[0]) =>
    exaSearch.toModelOutput!(output) as { type: "text"; value: string };

  it("tells the model to fall back to web_search when Exa is unauthorized", () => {
    const summary = render({
      ok: false,
      failure: "unauthorized",
      message: "Exa key invalid or rotated.",
      results: [],
    });
    expect(summary.value).toContain("web_search");
    expect(summary.value).toContain("invalid or rotated");
  });

  it("never lets a failure read like a clean empty result", () => {
    const summary = render({
      ok: false,
      failure: "rate-limited",
      message: "Exa rate limited the request.",
      results: [],
    });
    expect(summary.value).not.toMatch(/^No results/i);
    expect(summary.value).toContain("Do not draft from memory");
  });

  it("renders results with url and evidence so the model can cite them", () => {
    const summary = render({
      ok: true,
      results: [{ title: "A16z leads round", url: "https://a.test", evidence: "raised 475m" }],
    });
    expect(summary.value).toContain("https://a.test");
    expect(summary.value).toContain("raised 475m");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/lib/exa_search.test.ts`
Expected: FAIL — `Failed to resolve import "../tools/exa_search.ts"`.

- [ ] **Step 3a: Write the tool**

Create `agent/tools/exa_search.ts`:

```ts
import { defineTool } from "eve/tools";
import { exaSearchInputSchema, searchExa } from "../lib/exa.ts";

interface ExaToolResult {
  readonly ok: boolean;
  readonly failure?: "unauthorized" | "rate-limited" | "unavailable";
  readonly message?: string;
  readonly results: readonly { title: string; url: string; published?: string; evidence: string }[];
  readonly synthesis?: unknown;
}

export default defineTool({
  description:
    "Primary research search. Depth follows this turn's register.\n" +
    "SENSIBLE: a deep, grounded search that returns a source-backed synthesis. Run 2-3 distinct " +
    "queries with different angles, then web_fetch the 2+ most promising URLs and actually read " +
    "them. Research rigor is unchanged.\n" +
    "SHITPOST: a fast search that returns highlights from 5 results. Run 1-2 queries; no " +
    "mandatory fetch. It still exists to confirm the premise is REAL before you joke about it.\n" +
    "Set `register` to this turn's `register.id`. If this tool reports a failure, fall back to " +
    "the built-in `web_search` and say in your message that you fell back. Never draft from " +
    "memory on a research failure, in either register.",
  inputSchema: exaSearchInputSchema,
  async execute({ query, register, includeDomains, excludeDomains }): Promise<ExaToolResult> {
    const outcome = await searchExa(query, register, { includeDomains, excludeDomains });
    if (outcome.kind !== "ok") {
      return { ok: false, failure: outcome.kind, message: outcome.message, results: [] };
    }
    return { ok: true, results: outcome.results, synthesis: outcome.synthesis };
  },
  toModelOutput(output: ExaToolResult) {
    if (!output.ok) {
      return {
        type: "text" as const,
        value:
          `Exa search FAILED (${output.failure}): ${output.message ?? "no detail"} ` +
          "Fall back to the built-in web_search for this query and tell the user you fell back. " +
          "Do not draft from memory.",
      };
    }
    if (output.results.length === 0) {
      return {
        type: "text" as const,
        value:
          "Exa returned no results for that query. Try a different angle, or fall back to " +
          "web_search. Do not draft from memory.",
      };
    }
    const lines = output.results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   ${r.url}${r.published ? ` (${r.published})` : ""}\n   ${r.evidence}`,
      )
      .join("\n");
    const synthesis = output.synthesis
      ? `\n\nGrounded synthesis:\n${JSON.stringify(output.synthesis)}`
      : "";
    return {
      type: "text" as const,
      value: `${output.results.length} results:\n${lines}${synthesis}`,
    };
  },
});
```

- [ ] **Step 3b: Add the environment variable**

Append to `.env.example`:

```
# Exa — the agent's primary research search (deep in sensible register, fast in
# shitpost). Get a key at https://dashboard.exa.ai. Leave unset to fall back to
# the built-in web_search on every query.
EXA_API_KEY=exa-your-key-here
```

Add the same key with a real value to `.env.local` (untracked). **The key shared
during design is in a chat transcript and must be rotated at dashboard.exa.ai
before production.** Rotate it first, then use the new key here.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run agent/lib/exa_search.test.ts && npm run typecheck`
Expected: PASS, 5 tests, typecheck clean.

- [ ] **Step 5: Smoke-test against the live API**

```bash
npx eve dev
```

In the REPL, ask for a topic and confirm `exa_search` runs and returns real URLs. Then confirm the failure path by temporarily running with a bad key:

```bash
EXA_API_KEY=bad npx eve dev
```

Expected: the tool reports the unauthorized failure and the agent falls back to `web_search` rather than drafting from memory.

- [ ] **Step 6: Push the key to Vercel and commit**

```bash
vercel env add EXA_API_KEY production
vercel env add EXA_API_KEY preview
git add agent/tools/exa_search.ts agent/lib/exa_search.test.ts .env.example
git commit -m "feat: add exa_search tool with register-selected depth and web_search fallback"
```

---

### Task 10: Point the pipeline at exa_search

**Files:**
- Modify: `agent/instructions/00-base.md` (pipeline step 1 at 18-20, "Research deeply before writing" at 102-120, "Trending now" at 266-282, hard rules at 288-289)
- Modify: `agent/instructions/20-register.md` (add a research-depth section)
- Modify: `evals/drafts.eval.ts` (the `t.toolOrder` assertion)
- Modify: `agent/lib/instructions.test.ts`

**Interfaces:**
- Consumes: the `exa_search` tool name (Task 9) and the register contract (Task 5).
- Produces: `exa_search` as the primary research tool, `web_search` demoted to the documented fallback.

- [ ] **Step 1: Write the failing test**

Append to `agent/lib/instructions.test.ts` (created in Task 5):

```ts
describe("research instructions after the Exa swap", () => {
  const base = read("00-base.md");
  const register = read("20-register.md");

  it("makes exa_search the primary research call in the mandatory pipeline", () => {
    expect(base).toContain("exa_search");
    expect(base).toMatch(/exa_search[\s\S]{0,400}fall back[\s\S]{0,200}web_search/i);
  });

  it("keeps the fetch-and-read gate for sensible", () => {
    expect(base).toMatch(/2 to 3 distinct `exa_search` queries/);
    expect(base).toContain("web_fetch");
  });

  it("documents the shitpost fast path", () => {
    expect(register).toMatch(/1 to 2/);
    expect(register).toMatch(/fast/i);
  });

  it("keeps drafting-from-memory absolutely banned in both registers", () => {
    expect(base).toMatch(/never draft from memory/i);
    expect(register).toMatch(/never draft from memory/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/lib/instructions.test.ts`
Expected: FAIL — `00-base.md` has no `exa_search`.

- [ ] **Step 3a: Update `agent/instructions/00-base.md`**

**Edit 1 — pipeline step 1.** Replace:

```md
1. **Research first.** Run 2 to 3 distinct `web_search` queries, then `web_fetch`
   the 2+ most promising results and actually read them. Never draft from memory.
   (Full rules in **Research deeply** below.)
```

with:

```md
1. **Research first.** Run 2 to 3 distinct `exa_search` queries (set its
   `register` to this turn's `register.id`), then `web_fetch` the 2+ most
   promising results and actually read them. In `shitpost` register 1 to 2
   queries are enough and the fetch is not mandatory, but the premise must still
   come back real. If `exa_search` reports a failure, fall back to the built-in
   `web_search` and say you fell back. **Never draft from memory, in either
   register.** (Full rules in **Research deeply** below.)
```

**Edit 2 — "Research deeply before writing, always."** Replace the first two bullets:

```md
   - Run **2 to 3 distinct `web_search` queries** with different angles/keywords.
     Don't stop at one.
   - **`web_fetch` the 2+ most promising results** and read the actual page. Don't
     draft from search snippets alone. **Only fetch URLs that came from `web_search`
     results; never guess or hand-build a URL** (made-up links return 404). If a
     fetch returns 404/403 or errors, don't retry it; move to another result.
```

with:

```md
   - Run **2 to 3 distinct `exa_search` queries** with different angles/keywords.
     Don't stop at one. Set its `register` from this turn's context: `sensible`
     runs a deep, grounded search, `shitpost` runs a fast one where 1 to 2 queries
     are enough.
   - **`web_fetch` the 2+ most promising results** and read the actual page. Don't
     draft from search snippets alone. **Only fetch URLs that came from search
     results; never guess or hand-build a URL** (made-up links return 404). If a
     fetch returns 404/403 or errors, don't retry it; move to another result. In
     `shitpost` register this fetch is optional; the search alone may be enough to
     confirm the premise is real.
   - **If `exa_search` fails** (bad key, rate limit, timeout), fall back to the
     built-in `web_search` for that query and tell the user you fell back. Never
     substitute your own memory for a failed search.
```

**Edit 3 — "Trending now".** In step 1 of that section, replace
"Run several `web_search` queries" with "Run several `exa_search` queries" and
leave the rest of the section unchanged.

**Edit 4 — hard rules.** Replace:

```md
- **Always research first.** Call `web_search` before `compose_drafts`, every time.
  No drafting from memory, no skipping research because the topic seems familiar.
```

with:

```md
- **Always research first.** Call `exa_search` before `compose_drafts`, every
  time, in every register (`web_search` only as the documented fallback when Exa
  fails). No drafting from memory, no skipping research because the topic seems
  familiar.
```

- [ ] **Step 3b: Update `agent/instructions/20-register.md`**

Insert this section immediately before the "## Reporting the register" section:

```md
## Research depth follows the register

Both registers research. Only the depth changes.

- **`sensible`**: `exa_search` with `register: "sensible"` runs a deep, grounded
  search. Run 2 to 3 distinct queries, then `web_fetch` the 2+ most promising
  results and read them. Rigor is unchanged.
- **`shitpost`**: `exa_search` with `register: "shitpost"` runs a fast search
  over 5 results. 1 to 2 queries, and the fetch is not mandatory. It still exists
  to confirm the premise is real before you joke about it.

If `exa_search` fails, fall back to the built-in `web_search` and say so.
**Never draft from memory on a research failure**, in either register. That rule
is absolute and no register relaxes it.
```

- [ ] **Step 3c: Update `evals/drafts.eval.ts`**

Replace the tool-order assertion:

```ts
      t.toolOrder(["web_search", "load_skill", "compose_drafts"]);
```

with:

```ts
      // Research (now Exa) before a skill load before composing. toolOrder checks
      // relative order, and load_skill is the tool the skills run through.
      t.toolOrder(["exa_search", "load_skill", "compose_drafts"]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS across the suite.

- [ ] **Step 5: Run the live evals**

```bash
npx eve eval drafts
```

Expected: all four cases pass, each calling `exa_search` before `compose_drafts`. The sensible cases must still `web_fetch` and clear `findViolations`; regressions here are the Exa swap's known risk, so compare the drafts against a pre-swap run before accepting.

- [ ] **Step 6: Commit**

```bash
git add agent/instructions/ agent/lib/instructions.test.ts evals/drafts.eval.ts
git commit -m "feat: make exa_search the primary research call with register-selected depth"
```

---

## Out of scope

Confirmed excluded, do not build:

- Credits, billing, and usage metering.
- Image and meme generation.
- Reading the user's own X posts to auto-derive a voice profile (belongs to the `voice` axis).
- Additional registers beyond the two. The catalog shape supports adding more later without further refactoring.

## Known tradeoff, carried deliberately

Guard relaxation is **model-attested, not server-enforced**: `clientContext` is serialized into a user-role message the model reads, and `execute(input, ctx)` has no accessor for it, so the register reaches `compose_drafts` as a model-supplied input. A model that passed `register: "shitpost"` while the user had `💡 sensible` selected would unlock the date and formula guards.

This is the existing contract, not a new weakness: the runtime never verifies `accountTier` either. The mitigation is Task 7's eval, which passes register from the case definition and asserts the model's reported register matches. Blast radius of a misreport is a dated or formula-shaped post, never an unsafe one, because neither register can bypass `UNIVERSAL_BANNED`, the em dash strip, the character limits, or the no-fabrication rule.
