import type { LanguageModelUsage } from "ai";

export interface DerivedUsage {
  readonly usedTokens: number;
  readonly usage: LanguageModelUsage;
  readonly compacted: boolean;
}

type StreamEventLike = {
  readonly type: string;
  readonly data?: Record<string, unknown>;
};

function makeUsage(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): LanguageModelUsage {
  return {
    inputTokens,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens,
      cacheWriteTokens,
    },
    outputTokens,
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
    totalTokens: inputTokens + outputTokens,
  };
}

const EMPTY_USAGE: LanguageModelUsage = makeUsage(0, 0, 0, 0);

/**
 * Derives a context-occupancy snapshot from the eve stream. Uses the most
 * recent `step.completed` usage (the prompt size of the latest model call is
 * the most meaningful "how full is the window" gauge), and reports whether the
 * session was compacted.
 */
export function deriveUsage(events: readonly StreamEventLike[]): DerivedUsage {
  let usage: LanguageModelUsage = EMPTY_USAGE;
  let usedTokens = 0;
  let compacted = false;

  for (const event of events) {
    if (event.type === "compaction.completed") {
      compacted = true;
    }
    if (event.type === "step.completed") {
      const stepUsage = (event.data as { usage?: Record<string, number | undefined> } | undefined)
        ?.usage;
      if (stepUsage) {
        const inputTokens = stepUsage.inputTokens ?? 0;
        const outputTokens = stepUsage.outputTokens ?? 0;
        usage = makeUsage(
          inputTokens,
          outputTokens,
          stepUsage.cacheReadTokens ?? 0,
          stepUsage.cacheWriteTokens ?? 0,
        );
        usedTokens = inputTokens + outputTokens;
      }
    }
  }

  return { usedTokens, usage, compacted };
}
