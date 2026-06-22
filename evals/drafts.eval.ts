// End-to-end eval for the post composer. Each case drives a real drafting turn
// (live research + model + the compose_drafts tool) and grades the result. One
// file, fanned out over a premium and a free account so both tier paths run.
//
// Ids derive from the file + array index: `drafts/0000` (premium), `drafts/0001`
// (free). Run with `eve eval drafts` (add `--strict` to also fail on the soft
// tone judge falling below its bar).
import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import type { ComposeDraftsInput, Tier } from "#lib/drafts.ts";
import { bodiesOf, findViolations } from "./quality.ts";

interface DraftCase {
  readonly tier: Tier;
  readonly prompt: string;
}

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
];

export default CASES.map((c) =>
  defineEval({
    description: `Drafts for a ${c.tier} account: researches first, composes once, clears the quality bar.`,
    tags: ["drafts", c.tier],
    async test(t) {
      // accountTier rides in clientContext exactly as the web UI sends it
      // (app/_components/agent-chat.tsx).
      await t.send({ message: c.prompt, clientContext: { accountTier: c.tier } });

      // The turn finished without failing or parking on a question.
      t.completed();

      // Hard rule (instructions.md): research before composing.
      t.toolOrder(["web_search", "compose_drafts"]);

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

      // Expected per instructions, but the model occasionally skips it; track
      // it as a metric instead of gating the build.
      t.loadedSkill("x_algorithm_playbook").soft();

      if (!composed) {
        throw new Error("compose_drafts was never called; nothing to grade.");
      }
      const { drafts } = composed;

      // Deterministic quality gate: tier-correct formats, within length limits,
      // 2-3 drafts, no banned phrases / em dashes. Empty list == clean.
      t.check(findViolations(c.tier, drafts), equals([]));

      // Human-voice judge over the actual post bodies. Soft (atLeast): tracked,
      // and only fails the run under `eve eval --strict`.
      const bodies = bodiesOf(drafts).join("\n\n---\n\n");
      t.judge.autoevals
        .closedQA(
          "Each post reads like a sharp, specific person wrote it: a real hook in the first line, " +
            "at least one concrete detail (a name, number, or date), and no generic AI filler, " +
            "throat-clearing, or hype phrases that only announce significance.",
          { on: bodies },
        )
        .atLeast(0.7);
    },
  }),
);
