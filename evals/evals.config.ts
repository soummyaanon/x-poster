import { defineEvalConfig } from "eve/evals";
import { openai } from "@ai-sdk/openai";

// Defaults shared by every eval under evals/.
export default defineEvalConfig({
  // Judge model for t.judge.* assertions. Passing an AI SDK LanguageModel
  // instance (not a "provider/model" string) uses OPENAI_API_KEY directly, the
  // same credential the agent uses, so judging needs no AI Gateway setup. The
  // judge is only ever used for scoring, never as the agent under test. Swap to
  // a cheaper id (e.g. a mini model) if you have one.
  judge: { model: openai("gpt-5.4") },
  // Each drafting turn does live web research before composing, so give it room.
  timeoutMs: 180_000,
});
