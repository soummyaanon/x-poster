---
name: drafting-playbook
description: |
  Load this on EVERY drafting or revising turn, as step 2 of the mandatory drafting
  pipeline, before composing. It carries the full X "For You" ranker breakdown
  (xai-org/x-algorithm) and the complete viral post-pattern library: the agent's
  "x algorithm" and "virality" reference, both in this one skill. Always load it
  when you are about to draft or revise an X post; do not rely on the condensed
  summary alone.
---

# Writing for the X "For You" ranker

> Always apply this when drafting or revising. It is the law the patterns and the
> voice serve.

Distilled from X's open-sourced recommendation system, `xai-org/x-algorithm`
(the live For You stack, verified against the actual code in the repo). The
named services:

- `home-mixer`: orchestration. Runs the feed as a pipeline: query hydration,
  candidate sourcing, hydration, filtering, scoring, selection, post-filtering.
- `thunder`: the in-network source. An in-memory post store and realtime (Kafka)
  ingestion pipeline that tracks recent posts from followed accounts.
- `phoenix`: ML retrieval and ranking. A two-tower retrieval model (user tower +
  candidate tower) plus a transformer ranker that predicts engagement
  probabilities.
- `grox`: content understanding. Grok-based LLM classifiers that read every
  post: a "banger initial screen" quality-and-slop judge, spam detection, safety
  (PTOS) screening, reply ranking, plus the summarizers and multimodal embedders
  that retrieval runs on.
- `candidate-pipeline`: the shared framework. Defines the Source, Hydrator,
  Filter, Scorer, Selector, and SideEffect traits the rest is built from.

The goal is **ranked reach**: getting scored highly and surviving the filters, not
raw follower count, which we can't control from the text alone.

## The path a post takes (and where you can win)

1. **Sourcing.** Candidates come from two places: **Thunder** (in-network, shown
   to your followers) and **Phoenix retrieval** (out-of-network, a two-tower
   embedding similarity search across the global corpus). Out-of-network is how a
   post reaches people who don't follow you. To be retrievable there, a post must
   be *clearly about something*: a specific topic, entity, or claim the embedding
   can place. Vague subtweets and context-free hot takes don't embed well and stay
   stuck in-network.
2. **Pre-scoring filters.** Before ranking, candidates are dropped for being
   duplicates, too old (an age/freshness filter), self-posts, from blocked authors,
   matching muted keywords, already seen or served, or ineligible subscription
   content. Fresh and clean survives.
3. **Content understanding (`grox`): a Grok model reads your post first.** The
   "banger initial screen" classifier
   (`grox/classifiers/content/banger_initial_screen.py`) feeds the post, its
   media, and author context to a Grok vision-language model at near-zero
   temperature. Per post it returns:
   - a `quality_score` from 0 to 1; the code marks the post banger-positive at
     **`score >= 0.4`**;
   - an explicit **`slop_score`** (graded 1 to 3) that the pipeline counts and
     stores as an annotation on the post;
   - boolean flags (`isHighQuality`, `isSpam`, `isNsfw`, `isGore`, `isViolent`,
     ...);
   - a written `description`, `tags`, and taxonomy categories for what the post
     is about.

   Two consequences. First, **the first reader of every post is an LLM tuned to
   spot slop.** AI-tell phrasing is not a taste problem; it is machine-detected
   and stored on the post. The humanizer pass exists to beat exactly this
   classifier. Second, the model has to be able to *describe and tag* the post;
   grox also summarizes and embeds posts for retrieval, so if an LLM cannot say
   what your post is about, it cannot be tagged well here or retrieved well
   out-of-network. Also: low-follower accounts get a dedicated Grok spam screen
   (`SpamEapiLowFollowerClassifier`), so a small account gets *extra* scrutiny on
   anything that smells like engagement farming.
4. **Ranking (`phoenix`).** The transformer predicts probabilities for the
   engagement actions below, then a Weighted Scorer combines them:
   `Final Score = Σ (weight_i × P(action_i))`. Candidates are scored **in
   isolation** (special attention masking means a candidate cannot attend to its
   neighbors), so each post must earn its score on its own.
5. **More scorers.** On top of the Weighted Scorer: an **Author Diversity
   Scorer** re-sorts your posts within a single feed response and multiplies each
   later one by a decayed factor (`(1 - floor) × decay^n + floor`), so your own
   posts compete with and dilute each other when several are candidates at once.
   An **OON Scorer** then multiplies out-of-network candidates by a weight factor
   that prioritizes in-network content, so out-of-network reach must clear a
   higher bar.
6. **Post-selection filters.** Visibility filtering removes deleted/spam/violence/
   gore, and conversations are deduplicated.

> The exact numeric weights are **not** published: the `params.rs` module the
> scorers import is withheld from the repo. Positive actions carry positive
> weights, negative actions carry negative weights, but the values, thresholds,
> and training details are not public. Don't invent numbers. Optimize for the
> *portfolio* of positive actions while avoiding the negatives.

> Key design fact from the repo: X "eliminated every single hand-engineered feature
> and most heuristics", the Grok-based transformer does the heavy lifting. So
> formatting tricks don't move ranking; the content does.

## The engagement actions, and how to earn each

These are the exact signals summed in `home-mixer/scorers/weighted_scorer.rs`.

**Positive (write to cause these):**

- **Reply**: ask a real question, make a claim worth correcting, leave a
  deliberate gap ("the one thing nobody mentions is ___"). Replies under your
  post are themselves Grok-ranked 0 to 3, so a post that draws *substantive*
  replies builds a better conversation surface than one that draws one-word noise.
- **Retweet / Quote / quoted-click**: give a self-contained, re-broadcastable
  payload: a crisp insight, a tight list, a surprising-but-true fact someone looks
  smart sharing. A defensible take people want to argue with or add to earns the
  quote *and* the click back into the quoted post; both are scored.
- **Share, share-via-DM, share-via-copy-link**: three *separate* predicted
  signals. The underused lever is DM-worthiness: write posts someone would send to
  one specific friend or coworker ("you need to see this"). Useful, save-worthy
  specifics beat broadcast-y hype here.
- **Profile click / Follow author**: make *this* point so specific and high-signal
  that the reader wants more from you.
- **Dwell (plus a continuous dwell-time signal)**: both "did they stop" and "how
  long they stayed" are scored. A complete thought beats a vague tease, and a
  longer post has to hold attention all the way down, not front-load and trail off.
- **Favorite / Click / Photo expand / Video quality view**: supporting signals; a
  clean hook and a clear payoff lift all of them. Photo-expand and video view only
  exist when there is media (the video signal only counts past a minimum
  duration), so a text-only post is simply not competing for those; make the text
  signals count.

**Negative (one of these can sink the post and drag the account):**

- **Not interested / Mute author / Block author / Report**: these carry negative
  weights in the same weighted sum. Triggered by fake urgency, misleading hooks,
  spam, clickbait the reader regrets, and outrage aimed at a private individual
  or a protected group. The model is explicitly built to push these down.

  This weighting is the exact split the `ragebait` register is built around. A
  reply arguing with your claim is a positive signal; a report is a hard negative
  one. That is why a provocation has to land on an idea, a practice, or an
  institution to be worth running at all, and why aiming one at a private person
  loses on the platform's own math, not just on taste.

## Structural facts that shape the draft

- **Out-of-network reach is earned by being *about* something.** Concrete topic plus
  a specific claim is embeddable, which reaches non-followers (Phoenix retrieval).
  And the OON Scorer multiplies out-of-network scores down relative to in-network,
  so an OON post needs both embeddability *and* strong predicted engagement to
  break through.
- **Quality gate is real, and it is an LLM (`grox`).** A Grok classifier writes a
  0-to-1 quality score (banger at 0.4+), an explicit slop score, and quality/spam
  flags on every post before anything ranks. Substance is a prerequisite, not a
  bonus, and AI-sounding slop is detected by a machine, not just noticed by
  readers.
- **Timeliness helps (age filter).** Fresh, current angles survive; this is why
  research looks for *recent* developments. Note: this is about picking a *fresh
  topic*, not about writing a date into the post. Name the new thing, don't stamp
  the calendar.
- **Space posts out (Author Diversity Scorer).** Your posts competing in the same
  feed load decay each other: the second-best gets multiplied down, the third more
  so. A burst of takes cannibalizes itself; one strong post beats three rushed ones.
- **Each post stands alone (candidate isolation).** No thread context props it up;
  the first line and the single idea have to carry it.
- **No hand-engineered features.** Hashtags, keyword stuffing, and formatting tricks
  do little. Hooks, substance, and honest reply-bait do the work.

## Checklist before finalizing a post

1. Does the first line hook in under a second?
2. Is it *about* a specific topic/claim? Could an LLM write a one-line description
   and tags for it? (That is literally what grox does, and what retrieval embeds.)
3. Is there a clear reason to reply, repost, or click the profile? Would anyone
   DM this to a specific person?
4. Is every fact real and current (so it clears the age filter and grox)?
5. Read it as the Grok slop grader will: any AI tells left, any engagement-bait
   smell? A small account gets extra spam scrutiny, so anything formulaic costs
   more than it earns. Could it provoke a mute / block / report? Fix before
   shipping.
6. One idea, 0-1 hashtags. Within the limit for the format.

# Viral post patterns (use as starting shapes, not fill-in-the-blank scripts)

These are battle-tested structures for X posts. Treat them as scaffolding for a
point you already have and verified, never as a way to manufacture a point you
don't. The ranker playbook above is the law: a pattern only helps if the post
is still specific, honest, and human. Adapt the shape in your own voice; do not
paste the formula words.

## How to use these

1. You already did the research and have a concrete, verified point.
2. Pick the ONE pattern that fits that point best (not the other way around).
3. Rewrite it in a natural human voice (see the Voice charter). The reader should
   never feel a template.
4. Run it past the quality bar and the algorithm checklist before shipping.

## Hook shapes (the first line does the work)

- **Be specific, not round.** Exact numbers and durations beat round ones. "cut
  cold-start to 240ms" lands; "much faster" does not. Round numbers read as made up.
  (Durations like "240ms" or "in a weekend" are great; a calendar date is not.)
- **Curiosity gap.** State a surprising result, hold back the mechanism for one
  beat. "I shipped this in a weekend. The hard part wasn't the code."
- **Bold claim, then proof.** Make the assertion, then immediately back it with
  the real detail. Never leave the claim naked.
- **Question that challenges an assumption.** "Why is X still the default when Y
  is faster and cheaper?" Only if you actually answer it.

## Single-post structures

- **Contrarian take.** "You don't need [popular thing]. You need [the real lever]."
  Earns replies and reposts when the take is defensible, not just edgy.
- **Myth buster.** "[Topic] isn't about [common belief]. It's about [the actual
  driver]." Use sparingly; the "X isn't Y, it's Z" phrasing is overused, so vary
  the wording so it doesn't read as a formula.
- **Hard-won lesson.** "[Specific thing] I got wrong about [topic], and what
  changed." Vulnerability plus a concrete takeaway builds trust.
- **Data point.** "I looked at [specific N] and found [surprising, specific
  result]." Only with real numbers you can defend.
- **Stop / start.** "Stop [common practice]. Start [better one]. Here's the
  difference it made: [concrete result]."
- **Before / after.** "Went from [specific start] to [specific result] in
  [timeframe]. The one thing that moved the needle: [the real cause]."

## Long-form and thread structures

- **Hook, then beats, then payoff.** Open with the sharpest line, develop 2-4
  concrete beats (one idea each), land a real payoff. No filler between beats.
- **Story arc.** Setup, the turn, what it cost, what you learned. Works for
  founder and building-in-public posts.
- **Tight list.** A numbered or bulleted set where every item carries a specific,
  re-usable detail. Highly bookmarkable when each line stands alone.
- For threads: tweet 1 is a standalone hook, each middle tweet adds one concrete
  point or number, the last lands a payoff or a genuine question. Do NOT write
  "1/", "2/" inside the text; the UI numbers them.

## Quote-post takes (your line above someone else's post)

- Add something the original doesn't say: the implication, the counterpoint, the
  missing context, or why it matters to a specific audience.
- Make it self-contained so it reposts well even detached from the quoted post.
- Keep it tight (max 280). A sharp one-liner with a real angle beats a summary.

## Patterns to avoid (they trigger the negative signals in the playbook)

- Reciprocity bait ("drop your link and I'll...", "comment X for the guide").
- Fake urgency, a hook the body can't honestly pay off, or outrage aimed at a
  private individual or a protected group. Provocation aimed at an idea is the
  `ragebait` register, which is a deliberate mode with its own skill; it never
  relaxes these three.
- Engagement-farming polls or "one word: ___" with no substance.
- Hashtag stuffing and keyword stuffing. 0-1 hashtags, max.

The `grox` quality classifier and the negative-feedback signals (mute, block,
not-interested) are built to punish all of the above. A pattern that wins a click
but earns a regret costs you reach.
