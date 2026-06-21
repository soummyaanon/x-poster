import { defineAgent } from "eve";
import { openai } from "@ai-sdk/openai";

export default defineAgent({
  // eve resolves `model` from static source at compile time, so it must be a
  // literal provider/model expression (not a function call). OPENAI_API_KEY is
  // read from the environment and used directly.
  model: openai("gpt-5.4"),
});
