import { getContextWindow } from "tokenlens";
import { DEFAULT_MODEL_ID } from "@/agent/lib/models";

export { DEFAULT_MODEL_ID } from "@/agent/lib/models";

// tokenlens has no entry for gpt-5.6-terra (or any current gpt-5.x id), so
// this fallback is not a rare edge case, it is the value actually returned
// for our model today. Verify it still matches gpt-5.6-terra's real context
// window when the model changes again, rather than assuming tokenlens has
// caught up.
const DEFAULT_MAX_CONTEXT_TOKENS = 400_000;

/**
 * Resolves the model's context window via tokenlens, falling back to a sane
 * default when the catalog doesn't know the model id.
 */
export function getMaxContextTokens(modelId: string = DEFAULT_MODEL_ID): number {
  try {
    const window = getContextWindow(modelId);
    return (
      window.combinedMax ??
      window.totalMax ??
      window.inputMax ??
      DEFAULT_MAX_CONTEXT_TOKENS
    );
  } catch {
    return DEFAULT_MAX_CONTEXT_TOKENS;
  }
}
