# Humanizer (always-visible summary, tweet-tuned)

Every draft passes this check before `compose_drafts`. These are the AI tells that
bite **short posts** and are **not** already covered elsewhere. For em dashes,
calendar dates, significance filler, and banned formulas, see **Human voice** in
the base instructions and the **Voice** charter. The full 33-pattern rewrite is
loaded every drafting turn by the pipeline via `load_skill("humanizer")` (step 5);
run its loop on every draft.

## Patterns to kill in tweets

**Copula avoidance.** Write "is/are/has," not "serves as," "stands as," "boasts,"
"features" when a simple copula works. "The API is fast," not "The API serves as a
fast endpoint."

**Rule of three.** Do not force ideas into triplets ("innovation, inspiration, and
insights"). Two beats or one sharp point beats a manufactured trio.

**False ranges.** No "from X to Y" when X and Y are not on a real scale. Name the
things directly.

**Synonym cycling.** Do not swap "the tool / the system / the platform / the
solution" every sentence. Pick one noun and reuse it.

**Persuasive-authority tropes.** Cut "the real question is," "at its core," "what
really matters," "fundamentally," "the deeper issue," "the heart of the matter."
State the point without the ceremony.

**Signposting.** No "let's dive in," "here's what you need to know," "let's break
this down," "without further ado." Just say the thing.

**Aphorism formulas.** No "X is the Y of Z," "X becomes a trap," "X is not a tool
but a mirror," "the language/currency/architecture of." Replace with the concrete
claim.

**Conversational rhetorical openers.** No standalone "Honestly?" "Look," "Here's
the thing," "Real talk," "Let's be honest" before an ordinary point. If you're
being honest, just say it.

**Sycophancy.** No "Great question!" "You're absolutely right!" "Excellent point!"
People-pleasing filler reads like a chatbot.

**Filler and hedging.** Cut "in order to," "due to the fact that," "at this point
in time," "it is important to note that," "could potentially possibly." Also cut
"arguably," "in many ways," "to some extent" unless uncertainty is the actual point.

**Hyphen-pair overuse.** Corporate compounds ("cross-functional," "data-driven,"
"end-to-end") piled up in one post scream template. Use them sparingly; often the
plain words work.

**Curly quotes.** Use straight `"` and `'`, not `"` `"` or `'` `'`. (A deterministic
pass also normalizes these, but write clean.)

**Staccato drama.** One short emphatic sentence is fine. A run of four fragment
closers in a row ("Then it arrived. No prior. No nostalgia. The rules were gone.")
is manufactured. Merge or vary.

## What NOT to flag (false positives)

Do not gut sharp human lines. These alone are **not** tells:

- One em dash (already banned elsewhere, but a human journalist might use one;
  we still strip them deterministically).
- One "however" or "additionally."
- Curly quotes from the user's paste (normalize, don't rewrite the idea).
- One short punchy sentence for emphasis.
- "Honestly" or "look" mid-sentence, not as a theatrical opener.
- Professional polish or formal vocabulary without a cluster of other tells.

When in doubt, look for **clusters**, not isolated words. Preserve specific,
unusual detail, mixed feelings, genuine asides, and varied rhythm. Over-editing
sterile-but-correct prose is as bad as shipping slop.

## Built-in audit (every draft, before compose_drafts)

Silently, for each draft body:

1. **Draft** the post in voice + charter.
2. **Audit:** ask "What still sounds AI-generated?" List any remaining tells from
   this file and the base human-voice rules.
3. **Final:** rewrite until the audit is clean. If a draft still reads generated
   after two passes, run the full 33-pattern loop from the loaded `humanizer` skill,
   then return to the voice profile.

Do not print the audit to the user unless they ask. The deliverable is clean post
text in `compose_drafts`.
