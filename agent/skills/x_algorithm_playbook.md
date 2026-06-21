---
description: "How X's open-sourced 'For You' ranker scores posts, and how to write drafts that earn ranked reach. Load when drafting or revising X posts."
---

# Writing for the X "For You" ranker

Grounded in X's open-sourced recommendation system, `xai-org/x-algorithm`
(the live For You stack): `thunder` (in-network store), `phoenix` (retrieval +
the Phoenix ranking transformer), `grox` (content understanding + spam/quality
classifiers), `home-mixer` (orchestration: sources → hydration → scorers →
filters → selectors), and `candidate-pipeline` (the shared framework).

Use this when drafting or revising posts. The goal is **ranked reach** — getting
scored highly and surviving the filters — not raw follower count, which we can't
control from the text alone.

## The path a post takes (and where you can win)

1. **Sourcing.** Candidates come from two places: **Thunder** (in-network —
   shown to your followers) and **Phoenix retrieval** (out-of-network — a
   two-tower embedding similarity search across the global corpus). Out-of-network
   is how a post reaches people who don't follow you. To be retrievable there, a
   post must be *clearly about something* — a specific topic, entity, or claim the
   embedding can place. Vague subtweets and context-free hot takes don't embed well
   and stay stuck in-network.
2. **Content understanding (`grox`).** Classifiers judge quality and spam/abuse.
   Low-quality, spammy, or abusive content gets suppressed before ranking. Write
   like a real person with a real point; avoid anything that reads as engagement-farming.
3. **Ranking (`phoenix`).** The Phoenix transformer predicts probabilities for
   **15 engagement actions** and combines them: `Final Score = Σ (weight_i × P(action_i))`.
   Candidates are scored **in isolation** (a post can't lean on its neighbors), so
   each post must earn its score on its own.
4. **Orchestration (`home-mixer`).** Scorers, filters, and selectors apply on top:
   an **Author Diversity Scorer** attenuates repeated posts from the same author,
   and an **Age Filter** drops posts past a freshness threshold.

> The exact numeric weights are **not** published in the repo. Don't invent them.
> Optimize for the *portfolio* of positive actions while avoiding the negatives.

## The 15 signals — and how to earn each

**Positive (write to cause these):**

- **Reply** — ask a real question, make a claim worth correcting, leave a
  deliberate gap ("the one thing nobody mentions is ___").
- **Repost / Quote / Share** — give a self-contained, re-broadcastable payload: a
  crisp insight, a tight list, a surprising-but-true fact someone looks smart sharing.
- **Profile click / Follow author** — make *this* point so specific and high-signal
  that the reader wants more from you.
- **Dwell** — a complete thought beats a vague tease; make them stop and read, not bounce.
- **Click / Video view / Photo expand / Favorite** — supporting signals; a clean hook
  and a clear payoff lift all of them.

**Negative (one of these can sink the post and drag the account):**

- **Not interested / Mute author / Block author / Report** — triggered by rage-bait,
  fake urgency, misleading hooks, spam, and clickbait the reader regrets. The model is
  explicitly built to push these down.

## Structural facts that shape the draft

- **Out-of-network reach is earned by being *about* something.** Concrete topic +
  specific claim = embeddable = reaches non-followers (Phoenix retrieval).
- **Quality gate is real (`grox`).** Spammy, low-effort, or abusive patterns get
  filtered before ranking — substance is a prerequisite, not a bonus.
- **Timeliness helps (Age Filter).** Fresh, current angles survive; this is why
  research looks for *recent* developments.
- **Space posts out (Author Diversity Scorer).** Bursts from one author get attenuated;
  one strong post beats three rushed ones.
- **Each post stands alone (candidate isolation).** No thread context props it up —
  the first line and the single idea have to carry it.
- **No hand-engineered features.** Hashtags, keyword stuffing, and formatting tricks do
  little. Hooks, substance, and reply-bait (the honest kind) do the work.

## Checklist before finalizing a post

1. Does the first line hook in under a second?
2. Is it *about* a specific topic/claim (so it can reach out-of-network)?
3. Is there a clear reason to reply, repost, or click the profile?
4. Is every fact real and current?
5. Would `grox` read this as genuine, not spam/rage-bait? Could it provoke a
   mute / block / report? If so, soften or cut.
6. One idea, ≤ 280 characters, 0–1 hashtags.
