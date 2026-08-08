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
      const turn = await t.send({
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

      // compose_drafts is called exactly once.
      t.calledTool("compose_drafts", { times: 1 });

      // Grade the drafts directly: they live in the tool call, never the chat
      // reply. Read them off the turn's derived toolCalls rather than a
      // t.calledTool `input` callback, which is evaluated when assertions
      // finalize (after this function body) and so is always too late to
      // capture into a local.
      const composed = turn.toolCalls.find((call) => call.name === "compose_drafts")?.input as
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
