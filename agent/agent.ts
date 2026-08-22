import { defineAgent } from "eve";
import { openai } from "@ai-sdk/openai";

export default defineAgent({
  // eve resolves `model` from static source at compile time, so it must be a
  // literal provider/model expression (not a function call). OPENAI_API_KEY is
  // read from the environment and used directly.
  model: openai("gpt-5.6-terra"),
  // The instructions ask the model to reason about whether a turn needs
  // research before reaching for a search tool; give it real thinking room.
  reasoning: "medium",
  modelOptions: {
    providerOptions: {
      openai: {
        // Without a summary the model reasons invisibly: eve only emits
        // `reasoning` message parts (rendered by ReasoningPart in the chat UI)
        // when the provider streams reasoning summaries.
        reasoningSummary: "detailed",
      },
    },
  },
});
