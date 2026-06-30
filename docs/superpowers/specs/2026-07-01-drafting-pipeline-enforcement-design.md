# Drafting pipeline enforcement — design

Date: 2026-07-01

## Problem

The composer agent does not reliably load its deep skills (`drafting-playbook`,
which holds the X-algo ranker **and** the viral pattern library; `humanizer`; and
`voice`) before drafting. It also under-researches and frequently defaults to the
house voice even when a different voice is selected.

### Root cause

The behavior matches the instructions. Skill loading is written as optional:

- `agent/instructions/00-base.md:13` — "Deeper references load on demand, pull
  them in when the essentials aren't enough."
- `agent/skills/humanizer/SKILL.md:6` — "load this skill when those are not enough."
- `agent/skills/drafting-playbook/SKILL.md:8` — "load this when you need the deep
  reasoning."

A compliant model reads "the condensed essentials are already in front of you" and
concludes it never *needs* to load the deep skills. Research and voice rules exist
(`00-base.md:82` and `00-base.md:37`; voice is injected every turn via
`agent/lib/voices.ts`) but are buried in a ~262-line always-on prompt, so the model
skims them.

There is no separate "virality" skill: the ranker breakdown and the viral pattern
library both live in `drafting-playbook`.

## Goal

Make a **mandatory, ordered drafting pipeline** the salient thing the model sees,
so every drafting turn researches, loads all three deep skills in order, writes in
the selected voice, runs the humanizer audit, and only then composes. Add a
feedback-as-instruction loop so user reactions to drafts are treated as binding
constraints, not hints.

## Decisions (confirmed with user)

- **Enforcement: hard pipeline every draft.** No "optional" language anywhere.
- **Voice skill loads on every draft** (house or not), in addition to the
  always-injected voice profile.
- **Feedback is an instruction**, not a suggestion: re-enter the pipeline and
  re-compose, and the constraint persists for the rest of the session.

## The pipeline (every drafting turn, in order)

`compose_drafts` is forbidden until steps 1–5 are done.

0. **Topic.** Greet + show categories and ask **only** if no topic/category was
   given. Otherwise go straight to step 1. No `ask_question` once a topic exists.
1. **Research (gate).** 2–3 distinct `web_search` queries + `web_fetch` of 2+ real
   results from those searches. Never draft from memory. Verify the exact
   fact/number/name before it goes in a post.
2. **`load_skill("drafting-playbook")`** — the X-algo ranker + virality patterns.
3. **`load_skill("voice")`** — then state, in the chat message, which voice
   (from the injected `voice` object) the drafts are written in. A non-house voice
   must not drift to the house blend.
4. **Draft** for the account tier, in that voice, using the ONE best pattern. Each
   draft clears the quality bar (specific, real hook, complete thought, human
   voice, no calendar date, earns its signal).
5. **`load_skill("humanizer")`** — run the draft → "what still sounds AI?" → final
   loop on every draft body; fix every tell.
6. **`compose_drafts`** — only after 1–5. If the tool reports a length/date
   violation, fix and call again until clean.
7. **Feedback loop.** When the user reacts to drafts ("punchier", "less hype",
   "wrong angle", "doesn't sound like me", "redo #2"), treat it as a binding
   constraint: re-enter at the right step (re-research a fact, re-apply voice,
   re-humanize, or re-draft), then call `compose_drafts` again. The constraint
   persists for the session's later drafts.

Quote mode (pasted post/link) keeps its own flow but still runs research →
drafting-playbook → voice → humanizer before composing the quote takes.

## Changes

### `agent/instructions/00-base.md`
- Add the numbered **DRAFTING PIPELINE** as the first section after the contract,
  phrased as a hard gate ("you MUST", "do not call `compose_drafts` until…").
- Replace every "load on demand / when the essentials aren't enough" phrasing with
  "the pipeline loads this every draft."
- Add a **Feedback is an instruction** subsection.
- Keep the existing Publishing, Human-voice, Categories, and Hard-rules content;
  trim wording that now duplicates the pipeline.

### `agent/instructions/10-ranker-and-patterns.md`, `25-humanizer.md`, `30-voice.md`
- Reframe headers from "always-on, load deeper on demand" to "always-visible
  summary; the full skill loads in the pipeline every draft." No behavior change to
  the summaries themselves, just remove the optional framing so they don't
  contradict the mandatory pipeline.

### `agent/skills/drafting-playbook/SKILL.md`, `humanizer/SKILL.md`, `voice/SKILL.md`
- Update the `description` frontmatter so it reads as a pipeline step that always
  fires for a drafting turn (eve uses the description as the routing hint and tells
  the model to "call load_skill before proceeding" when a request matches). Remove
  "load this when the essentials aren't enough."

### `evals/drafts.eval.ts`
- Add deterministic pipeline assertions to every case:
  - `t.loadedSkill("drafting-playbook")`, `t.loadedSkill("voice")`,
    `t.loadedSkill("humanizer")` (all gate).
  - `t.toolOrder(["web_search", "load_skill", "compose_drafts"])` to assert
    research → skill load → compose ordering.
- Keep the existing tier/format/banned-phrase gate and the soft human-voice judge.

## Verification

- `npx eve eval drafts` — all three cases must call the three `load_skill`s, keep
  the research→load→compose order, and pass the deterministic quality gate.
- Run with `--strict` to confirm the human-voice judge still clears 0.8.
- `npm test` / `vitest` for `agent/lib/*.test.ts` to confirm no lib regressions
  (instructions/skills are not unit-tested, but the libs they reference are).

## Out of scope

- No change to `compose_drafts`, `voices.ts`, channels, or the publishing tools.
- No new skills; "virality" stays inside `drafting-playbook`.
- No framework-level auto-load (eve loads skills only when the model calls
  `load_skill`; the lever is instructions + descriptions + evals).
