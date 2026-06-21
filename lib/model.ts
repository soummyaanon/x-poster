import { getContextWindow } from "tokenlens";
import { DEFAULT_MODEL_ID } from "@/agent/lib/models";

export { DEFAULT_MODEL_ID } from "@/agent/lib/models";

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
