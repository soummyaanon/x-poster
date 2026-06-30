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
(the live For You stack). The named services:

- `home-mixer`: orchestration. Runs the feed as a pipeline: query hydration,
  candidate sourcing, hydration, filtering, scoring, selection, post-filtering.
- `thunder`: the in-network source. An in-memory post store and realtime (Kafka)
  ingestion pipeline that tracks recent posts from followed accounts.
- `phoenix`: ML retrieval and ranking. A two-tower retrieval model (user tower +
  candidate tower) plus a transformer ranker that predicts engagement
  probabilities.
- `grox`: content understanding. Classifiers and embedders for spam detection,
  post-category classification, and policy enforcement.
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
3. **Content understanding (`grox`).** Classifiers judge quality and spam/abuse.
   Low-quality, spammy, or abusive content gets suppressed. Write like a real
   person with a real point; avoid anything that reads as engagement-farming.
4. **Ranking (`phoenix`).** The transformer predicts probabilities for the
   engagement actions below, then a Weighted Scorer combines them:
   `Final Score = Σ (weight_i × P(action_i))`. Candidates are scored **in
   isolation** (special attention masking means a candidate cannot attend to its
   neighbors), so each post must earn its score on its own.
5. **More scorers.** On top of the Weighted Scorer: an **Author Diversity Scorer**
   attenuates repeated posts from the same author, and an **OON Scorer** adjusts
   out-of-network scores.
6. **Post-selection filters.** Visibility filtering removes deleted/spam/violence/
   gore, and conversations are deduplicated.

> The exact numeric weights are **not** published in the repo. Positive actions
> carry positive weights, negative actions carry negative weights, but the values,
> thresholds, and training details are withheld. Don't invent numbers. Optimize for
> the *portfolio* of positive actions while avoiding the negatives.

> Key design fact from the repo: X "eliminated every single hand-engineered feature
> and most heuristics", the Grok-based transformer does the heavy lifting. So
> formatting tricks don't move ranking; the content does.

## The engagement actions, and how to earn each

**Positive (write to cause these):**

- **Reply**: ask a real question, make a claim worth correcting, leave a
  deliberate gap ("the one thing nobody mentions is ___").
- **Repost / Quote / Share**: give a self-contained, re-broadcastable payload: a
  crisp insight, a tight list, a surprising-but-true fact someone looks smart sharing.
- **Profile click / Follow author**: make *this* point so specific and high-signal
  that the reader wants more from you.
- **Dwell**: a complete thought beats a vague tease; make them stop and read, not bounce.
- **Favorite / Click / Video view / Photo expand**: supporting signals; a clean hook
  and a clear payoff lift all of them.

**Negative (one of these can sink the post and drag the account):**

- **Not interested / Mute author / Block author / Report**: triggered by rage-bait,
  fake urgency, misleading hooks, spam, and clickbait the reader regrets. The model
  is explicitly built to push these down.

## Structural facts that shape the draft

- **Out-of-network reach is earned by being *about* something.** Concrete topic plus
  a specific claim is embeddable, which reaches non-followers (Phoenix retrieval).
- **Quality gate is real (`grox`).** Spammy, low-effort, or abusive patterns get
  filtered before ranking. Substance is a prerequisite, not a bonus.
- **Timeliness helps (age filter).** Fresh, current angles survive; this is why
  research looks for *recent* developments. Note: this is about picking a *fresh
  topic*, not about writing a date into the post. Name the new thing, don't stamp
  the calendar.
- **Space posts out (Author Diversity Scorer).** Bursts from one author get
  attenuated; one strong post beats three rushed ones.
- **Each post stands alone (candidate isolation).** No thread context props it up;
  the first line and the single idea have to carry it.
- **No hand-engineered features.** Hashtags, keyword stuffing, and formatting tricks
  do little. Hooks, substance, and honest reply-bait do the work.

## Checklist before finalizing a post

1. Does the first line hook in under a second?
2. Is it *about* a specific topic/claim (so it can reach out-of-network)?
3. Is there a clear reason to reply, repost, or click the profile?
4. Is every fact real and current (so it clears the age filter and grox)?
5. Would `grox` read this as genuine, not spam/rage-bait? Could it provoke a
   mute / block / report? If so, soften or cut.
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
- Fake urgency, rage-bait, or a hook the body can't honestly pay off.
- Engagement-farming polls or "one word: ___" with no substance.
- Hashtag stuffing and keyword stuffing. 0-1 hashtags, max.

The `grox` quality classifier and the negative-feedback signals (mute, block,
not-interested) are built to punish all of the above. A pattern that wins a click
but earns a regret costs you reach.
