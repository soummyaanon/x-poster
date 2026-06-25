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
