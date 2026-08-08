# Shitpost / Sensible register modes

Status: approved, ready for implementation planning
Date: 2026-08-06

## Problem

The composer has two axes of control: `accountTier` (which formats to produce) and
`voice` (who the post sounds like). It has no control over **register**: how
serious the post is. Every draft comes out in the same earnest, researched,
insight-delivering mode.

That mode is correct for a hot take on a funding round. It is wrong for a joke
about one, and jokes are a large fraction of what actually travels on X.

Reference: [bangersonly.xyz](https://www.bangersonly.xyz/) ships exactly this as
two pills in its composer toolbar (`write | edit | voice | 🔥 shitpost |
💡 sensible`). Its own schema.org `featureList` names the capability
"Shitpost and Sensible Modes". The pattern is worth borrowing; we already have
the harder pieces it lacks (a ranker playbook, a deterministic humanizer, voice
presets, real publishing).

## The actual difficulty

Shitpost register collides head-on with hard rules already enforced in
`agent/lib/drafts.ts`. This is not a prompt tweak.

Craft mechanics a shitpost needs (from research, sources below):

- lowercase default, which signals "typing on a phone" rather than an approval flow
- setup → bait → sudden absurd twist or non-sequitur
- roughly 80% real observation, 20% cringe or self-deprecation
- self-contained: the single unit is both hook and punchline
- immediate remix of live events; it is a town-square reaction
- typos and rough edges as deliberate persona

Against current enforcement:

| Shitpost needs | Current rule | Verdict |
| --- | --- | --- |
| absurd twist, non-sequitur | `Never invent. No made-up facts` (`00-base.md`) | hard conflict |
| `it's december 2025. you wake up…` | `DATE_PATTERNS` rejects any year | hard conflict |
| ironic use of tired formats | `BANNED_PATTERNS` blocks rule-of-three, aphorism shapes | conflict |
| lowercase + typos | humanizer wants clean prose | soft conflict |
| reaction to live events | mandatory research gate | compatible, must be fast |
| edgy | `No bait that backfires` | compatible; research confirms rage-bait fails |

The site's best-performing live example (`it's december 2025. you wake up. you
open x. "a16z leads 475m seed round for unconventional ai." …`, 1.8K impressions)
would be **rejected outright** by our `findDateHits` guard. So the design
question is not "how do we prompt for funny" but **which guards are
register-scoped and which are absolute**.

### Resolved decisions

1. **Fabrication line: real premise, absurd take.** The thing being reacted to
   must be real and verified. The joke layered on top may be hyperbole, absurd
   analogy, or obviously non-literal. Still zero invented stats, fabricated
   quotes, or made-up events presented as real. This matches how good shitposts
   actually work (the 80/20 split).
2. **Relaxed in shitpost:** calendar dates, formula bans (rule-of-three,
   aphorism shapes), lowercase + deliberate typos.
3. **Research depth comes from Exa search types, not from cutting the pipeline.**

## Architecture

Register becomes a third orthogonal axis, mirroring the existing `voice`
pattern exactly: a catalog lib, a resolved payload in `clientContext`, an
always-on instruction summary, and a deep skill loaded per drafting turn. The
one genuinely new capability is that register also parameterizes the
deterministic guards.

Rejected alternatives:

- **Prompt-only** (a paragraph in `00-base.md`). The deterministic guards would
  still reject the output, so the mode would silently fail.
- **Separate shitpost voice presets** (`shitpost-elon`, `shitpost-naval`, …).
  7 voices x 2 registers = 14 presets to maintain. Combinatorial explosion.

### Axis composition

Three independent axes ride in `clientContext` every turn:

- `accountTier` — which formats (premium: single/long, free: short/thread)
- `voice` — who it sounds like
- `register` — how serious

They compose. A Naval shitpost is an absurd aphorism; a Levels shitpost is a
numbers joke. Register defaults to `sensible`, so **every existing behavior is
unchanged** unless the user flips the pill.

## Components

### `agent/lib/registers.ts` (new)

Direct mirror of `voices.ts`.

```ts
export const REGISTERS = ["sensible", "shitpost"] as const;
export type Register = (typeof REGISTERS)[number];

export const REGISTER_LABELS: Record<Register, string> = {
  sensible: "💡 sensible",
  shitpost: "🔥 shitpost",
};

export const DEFAULT_REGISTER: Register = "sensible";

export interface RegisterContext {
  readonly id: Register;
  readonly label: string;
  /** Injected register charter the model writes against. */
  readonly profile: string;
  [key: string]: string;
}

export function isRegister(value: string): value is Register;
export function resolveRegisterContext(id: Register | undefined): RegisterContext;
```

`resolveRegisterContext` returns only the selected register's profile, keeping
each turn lean, the same reason `resolveVoiceContext` does.

### `agent/lib/drafts.ts` (modified)

`BANNED_PATTERNS` splits in two. The combined export is preserved so nothing
downstream breaks.

```ts
/** Never relaxed, any register. 17 patterns. */
export const UNIVERSAL_BANNED: readonly BannedPattern[];

/** Relaxed in shitpost register: ironic use is a real move. 3 patterns. */
export const FORMULA_BANNED: readonly BannedPattern[];
//   - rule-of-three triplet            /\b\w+ing, \w+ing, and \w+ing\b/i
//   - aphorism formula (the X of)      /\bis the (?:language|currency|…) of\b/i
//   - aphorism formula (not a X but a Y) /\bis not a \w+,? but a \w+/i

/** Unchanged export, preserved for back-compat. */
export const BANNED_PATTERNS = [...UNIVERSAL_BANNED, ...FORMULA_BANNED];

export interface GuardPolicy {
  readonly banned: readonly BannedPattern[];
  readonly enforceDates: boolean;
}

export function guardPolicyFor(register: Register): GuardPolicy;
// sensible: { banned: BANNED_PATTERNS,  enforceDates: true  }
// shitpost: { banned: UNIVERSAL_BANNED, enforceDates: false }

export function findBannedHits(text: string, policy?: GuardPolicy): string[];
export function validateDrafts(
  drafts: readonly Draft[],
  register?: Register, // defaults to "sensible"
): ValidatedDraft[];
```

`composeDraftsInputSchema` also gains the register (see "How the tool learns the
register" below):

```ts
export const composeDraftsInputSchema = z.object({
  drafts: z.array(draftSchema).min(2).max(4),
  quoting: z.string().optional(),
  register: z.enum(REGISTERS).default("sensible"),
});
```

Two deliberate scope decisions:

- **`"X isn't Y, it's Z"` stays in `UNIVERSAL_BANNED`.** It is technically an
  aphorism shape, but it is the single most notorious AI tell and grox's slop
  classifier keys on it. A shitpost using it reads generated, not funny.
- **Lowercase and typos require no code.** `humanizeText` never touches case and
  nothing blocks misspellings. This is an instruction-level change plus *not*
  correcting it during the humanizer pass.

`findDateHits` stays a pure function, unchanged. `validateDrafts` populates
`ValidatedUnit.dateHits` with **enforced** violations only: it is always empty
under `shitpost`, since an unenforced flag that still reaches `toModelOutput`
would make the model rewrite a draft the policy just permitted. No new field is
added to `ValidatedUnit`; the raw hits are not needed anywhere downstream, and
carrying them would only create a second thing to keep in sync.

The `register?` default parameter keeps `evals/quality.ts` and `drafts.test.ts`
compiling with no change required. `compose_drafts.ts` does change, because it
must pass the register through.

### How the tool learns the register

`clientContext` is JSON-serialized into a **user-role context message for the
model only**. It is never exposed programmatically to tools: `execute(input, ctx)`
receives a `ctx` carrying `ctx.session`, `ctx.getSandbox()`, and
`ctx.getSkill(id)`, with no accessor for client context. Verified against
`node_modules/eve/docs/tools/overview.mdx` and
`node_modules/eve/docs/guides/frontend/overview.mdx`.

So the register reaches `compose_drafts` as a **tool input the model passes**,
mirroring how the model already reads `accountTier` from context and produces
tier-correct formats. `execute` returns it alongside the drafts so
`toModelOutput` flags consistently with the policy that was applied:

```ts
execute({ drafts, register }) {
  return { drafts: validateDrafts(drafts, register), register };
}
```

**Tradeoff, stated plainly:** guard relaxation becomes model-attested rather than
server-enforced. A model that passed `register: "shitpost"` while the user had
`💡 sensible` selected would unlock the date and formula guards.

This is not a new weakness; it is the existing contract. The runtime already
never verifies `accountTier` either, and `TIER_FORMATS` is only enforced in
`findViolations`, which the eval runs. The mitigation is the same one already in
place: **the eval passes register from the case definition, not from the model's
tool call**, so a model that misreports its register fails the eval. The UI
toggle is the user's own, and neither register can bypass `UNIVERSAL_BANNED`,
the em dash strip in `humanizeText`, the character limits, or the
no-fabrication rule, so the blast radius of a misreport is a dated or
formula-shaped post, not an unsafe one.

### `agent/tools/exa_search.ts` (new)

One tool, depth selected by register.

| Register | Exa call | Pipeline gate |
| --- | --- | --- |
| sensible | `type:"deep"` + `outputSchema` + `systemPrompt`, grounded synthesis | 2-3 searches + 2 `web_fetch` reads (rigor unchanged) |
| shitpost | `type:"fast"` (~450 ms), `highlights` only, `numResults: 5` | 1-2 searches, no mandatory fetch |

Shitpost still verifies the premise is real; that is the "real premise, absurd
take" line holding. It just does not deep-read. eve's `web_fetch` stays for
quote mode, where the actual page is needed.

API contract per the [Exa coding-agents guide](https://docs.exa.ai/reference/search-api-guide-for-coding-agents).
Notes that matter, since they are easy to get wrong:

- `text` / `highlights` / `summary` nest **inside** `contents` on `/search`, but
  are **top-level** on `/contents`.
- `useAutoprompt`, `includeUrls`/`excludeUrls`, `numSentences`, `tokensNum`, and
  `livecrawl:"always"` do not exist or are deprecated. Use `includeDomains` /
  `excludeDomains` and `contents.maxAgeHours: 0`.
- `outputSchema` max nesting depth 2, max 10 total properties. Do not add
  citation or confidence fields; `/search` returns `output.grounding` already.

Environment: `EXA_API_KEY` added to `.env.local`, `.env.example`, and Vercel via
`vercel env add`. **The key shared during design is in a chat transcript and
must be rotated at dashboard.exa.ai before production.**

Failure handling:

- `401` → surface "Exa key invalid or rotated", do not retry.
- `429` or timeout → one retry, then fall back to eve's `web_search` and note the
  fallback.
- Never silently draft from memory on a research failure. That rule is already
  absolute in `00-base.md` and stays absolute in **both** registers.

### Formats: shitpost respects the tier toggle

`TIER_FORMATS` and `FORMATS` are unchanged; no new format is introduced. The
proven greentext shape (`it's december 2025. you wake up…`, ~400 chars) is a
premium `single`, so capping shitposts at 280 would cut the format that
demonstrably works. Register changes structure *within* a format, not the format
menu.

### Instructions

- `agent/instructions/20-register.md` (new) — always-on register summary. Slots
  between `10-ranker-and-patterns.md` and `25-humanizer.md`, following the
  established numbering. States the two registers, the "real premise, absurd
  take" line, and which guards relax.
- `agent/skills/shitpost/SKILL.md` (new) — the deep craft skill, loaded only when
  register is `shitpost`. Contents grounded in the research: setup → bait →
  absurd twist; the 80/20 real-to-cringe split; self-contained hook and
  punchline; lowercase default; remix live events. Plus its antipatterns:
  press-release formatting, over-explaining the joke, arguing with people who
  miss it, and rage-bait (which stays banned; the research confirms it triggers
  blocks and reports rather than engagement, so that existing hard rule survives
  intact).
- `agent/instructions/00-base.md` (modified) — the mandatory pipeline gains a
  register read and a conditional skill load at step 3.5. The humanizer step
  gains a register-aware caveat so it stops "correcting" intentional lowercase.

### UI

`RegisterToggle` in `app/_components/agent-chat.tsx`, inside
`PromptInputTools`, immediately left of `TierToggle`, reusing the existing
segmented-pill pattern from `TierToggle`.

- `🔥 shitpost` renders orange (amber is already taken by Premium tier).
- `💡 sensible` stays muted, since it is the default.
- Local state `const [register, setRegister] = useState<Register>("sensible")`,
  shipped in `sendMessage`'s `clientContext` alongside `accountTier` and `voice`.
- Empty-state copy gains one line naming the two modes.

## Data flow

```
UI RegisterToggle  ("sensible" | "shitpost")
  │
  └─ clientContext.register ──► serialized into a user-role context message
                                 (model-visible only, not readable by tools)
        │
        ├─ 20-register.md instructs the model to read it every turn
        ├─ pipeline step 3.5: load_skill("shitpost")  [shitpost only]
        ├─ exa_search called with type: "deep" | "fast"
        │
        └─ model passes register as a compose_drafts INPUT
              └─ execute({ drafts, register })
                    ├─ validateDrafts(drafts, register)
                    │     └─ guardPolicyFor(register)
                    │           ├─ banned: UNIVERSAL vs UNIVERSAL+FORMULA
                    │           └─ enforceDates: false vs true
                    └─ returns { drafts, register }
                          └─ toModelOutput flags only what the policy enforces
```

The dashed hop is the one place the chain is model-mediated rather than
mechanical. That is a constraint of eve's `clientContext` design, not a choice;
see "How the tool learns the register".

## Testing

- `agent/lib/registers.test.ts` (new) — mirrors `voices.test.ts`: id guards,
  label lookup, `resolveRegisterContext` for both registers and for `undefined`.
- `agent/lib/drafts.test.ts` (modified):
  - `guardPolicyFor` returns the right pattern set per register.
  - A dated body passes under `shitpost`, fails under `sensible`.
  - A rule-of-three body passes under `shitpost`, fails under `sensible`.
  - An em dash fails under **both** registers.
  - `UNIVERSAL_BANNED.length + FORMULA_BANNED.length === BANNED_PATTERNS.length`,
    so a pattern can never be silently dropped from both sets.
- `evals/quality.ts` (modified) — `findViolations(tier, drafts, register)`,
  threading the policy through so the eval cannot drift from production.
- `evals/drafts.eval.ts` (modified) — a fourth case with `register: "shitpost"`.
  Two things it must do:
  - Use its **own judge rubric**. The existing one ("sharp, specific builder…
    no calendar date") would fail a correct shitpost. The shitpost rubric grades
    on landing a joke, a verifiably real premise, and self-containment.
  - Pass `register` to `findViolations` from the **case definition**, never from
    the model's `compose_drafts` input. Also assert the model's reported
    `register` equals the case's. This is what makes a misreported register a
    test failure instead of a silent guard bypass.

## Sequencing

Two independently shippable features. The Exa swap touches every drafting turn
including sensible mode, so it carries the larger regression risk. One spec
(register's fast path depends on Exa) but a two-phase plan:

1. **Phase 1 — register axis** on the existing `web_search` pipeline. Lands and
   passes evals without touching research.
2. **Phase 2 — Exa swap** behind the now-stable register axis.

## Out of scope

- Credits, billing, and usage metering (bangersonly's model; not ours).
- Image and meme generation, though the research notes visual shitposts perform
  well. Separate feature.
- Reading the user's own X posts to auto-derive a voice profile. Adjacent and
  worth doing, but it belongs to the `voice` axis, not `register`.
- Additional registers beyond the two. The catalog shape supports adding more
  later without further refactoring.

## Sources

- [bangersonly.xyz](https://www.bangersonly.xyz/) and its [how-it-works page](https://www.bangersonly.xyz/how)
- [Chris Bakke: The Art of Shitposting and Working with Elon Musk at X](https://creatoreconomy.so/p/chris-bakke-x-shitposting-and-elon-musk)
- [So You Wanna Shitpost: A Creator's Guide to Weaponized Nonsense](https://com.manychat.com/article/so-you-wanna-shitpost)
- [No one cares about your Twitter Launch posts](https://kylejeong.com/blog/how-to-go-viral-on-x)
- [The anatomy of a viral tweet: the "rehashing old news" variant](https://weaponizedspaces.substack.com/p/the-anatomy-of-a-viral-tweet-the)
- [Exa search API guide for coding agents](https://docs.exa.ai/reference/search-api-guide-for-coding-agents)
