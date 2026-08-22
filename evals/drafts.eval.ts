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
  // Kept to four clauses on purpose. A long conjunction makes closedQA answer
  // "no" on any clause it reads as ambiguous, and two earlier versions of this
  // rubric scored 0% on drafts the graders below all passed. Self-containment is
  // scoped to the opening post so a `thread`, whose middle units are setup by
  // design, is not failed for being a thread.
  shitpost:
    "The writing lands as a genuine joke a real person would post on X, not as a news summary. " +
    "It is built on a specific real premise (a named team, person, product, place, number, or " +
    "event) and the humor comes from an absurd twist, exaggeration, or self-deprecation rather " +
    "than from invented facts. The opening line works on its own as a hook. It sounds like " +
    "someone typing on a phone rather than a press release, and never stops to explain or " +
    "announce the joke. The specific details come from the subject's own world.",
  ragebait:
    "The post states a genuinely arguable position plainly in the first line, not a warm-up or " +
    "a question. It is grounded in a specific verified detail (a name, a number, or an event). " +
    "The disagreement it invites is aimed at an idea, an institution, or a practice, never at a " +
    "named private individual or a protected group. Nothing in it is an invented fact, stat, " +
    "or quote.",
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
  // Non-tech shitpost: no register is a tech register, and the house voice must
  // follow the topic rather than dragging it back to startups or software.
  {
    tier: "free",
    register: "shitpost",
    prompt:
      "Topic: sports. Find one specific, recent, verifiable development and draft posts about it.",
  },
  // Targets a practice/institution (a policy), not a person, per the register's
  // editorial line: honest provocation engineers disagreement with an idea, not
  // harassment of an individual.
  {
    tier: "premium",
    register: "ragebait",
    prompt:
      "Topic: return-to-office mandates. Find one specific, recent, verifiable development and draft posts about it.",
  },
];

export default CASES.map((c) =>
  defineEval({
    description: `Drafts for a ${c.tier} account${c.voiceId ? ` (${c.voiceId} voice)` : ""}${c.register && c.register !== DEFAULT_REGISTER ? ` in ${c.register} register` : ""}: researches first, composes once, clears the quality bar.`,
    tags: ["drafts", c.tier, ...(c.voiceId ? [c.voiceId] : []), c.register ?? DEFAULT_REGISTER],
    async test(t) {
      // The case owns the register. It is never read back from the model's tool
      // call for grading, so a misreported register fails instead of unlocking
      // the relaxed guards.
      const register = c.register ?? DEFAULT_REGISTER;
      const voice = resolveVoiceContext({ id: c.voiceId ?? DEFAULT_VOICE_ID });
      const turn = await t.send(c.prompt, {
        clientContext: {
          accountTier: c.tier,
          register: resolveRegisterContext(register),
          voice,
        },
      });

      // The turn finished without failing or parking on a question.
      t.succeeded();

      // Mandatory drafting pipeline (00-base.md): decide on research, then load
      // all three deep skills, then compose. The loads are not optional, and
      // every case here asks for something recent and verifiable, so research
      // is required on these turns.
      t.loadedSkill("drafting-playbook");
      t.loadedSkill("voice");
      t.loadedSkill("humanizer");
      // Step 3.5: the shitpost/ragebait craft skill is mandatory in that register.
      if (register === "shitpost") {
        t.loadedSkill("shitpost");
      }
      if (register === "ragebait") {
        t.loadedSkill("ragebait");
      }

      // Research (now Exa) before a skill load before composing. toolOrder checks
      // relative order, and load_skill is the tool the skills run through.
      t.toolOrder(["exa_search", "load_skill", "compose_drafts"]);

      // compose_drafts must happen. Not `times: 1`: when the tool flags a draft
      // (over limit, dated, AI tell) both the tool description and 00-base.md
      // instruct the model to rewrite and call again, so a single corrective
      // recompose is correct behavior, not a defect. The bound below still
      // catches an agent that churns out draft set after draft set, and the
      // LAST call is what gets graded for quality.
      t.calledTool("compose_drafts");
      // Churn is tracked, not gated. The instructions tell the model to recompose
      // "until it comes back clean", so the retry count is genuinely unbounded by
      // design and any hard cap flakes. What must hold is that the LAST set is
      // clean, which findViolations below gates. Soft keeps churn visible.
      const composeCalls = turn.toolCalls.filter((call) => call.name === "compose_drafts");
      t.check(
        composeCalls.length <= 2
          ? "ok"
          : `compose_drafts called ${composeCalls.length} times (1 expected, 1 corrective rewrite allowed)`,
        equals("ok"),
      ).soft();

      // Grade the drafts directly: they live in the tool call, never the chat
      // reply. Read them off the turn's derived toolCalls rather than a
      // t.calledTool `input` callback, which is evaluated when assertions
      // finalize (after this function body) and so is always too late to
      // capture into a local.
      //
      // findLast, not find: when the tool flags a draft the model is instructed
      // to rewrite and call again, so the LAST call holds the drafts the user
      // actually ends up seeing. Grading the first would fail the agent for the
      // very output it already corrected.
      const composed = turn.toolCalls.findLast((call) => call.name === "compose_drafts")?.input as
        | ComposeDraftsInput
        | undefined;

      if (!composed) {
        throw new Error("compose_drafts was never called; nothing to grade.");
      }
      const { drafts } = composed;

      // The model must report the register it was given. A mismatch means it
      // could have unlocked the relaxed guards on its own say-so, so it fails.
      t.check(composed.register ?? DEFAULT_REGISTER, equals(register));

      // Deterministic quality gate under the CASE's register: tier-correct
      // formats, within length limits, 2-6 drafts, no banned phrases / em dashes.
      // Empty list == clean.
      t.check(findViolations(c.tier, drafts, register), equals([]));

      // Register-appropriate judge over the actual post bodies. Soft (atLeast):
      // tracked, and only fails the run under `eve eval --strict`.
      const bodies = bodiesOf(drafts).join("\n\n---\n\n");
      t.judge.autoevals.closedQA(JUDGE_RUBRIC[register], { on: bodies }).atLeast(0.8);
    },
  }),
);
