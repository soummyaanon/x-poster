"use client";

import type { LanguageModelUsage } from "ai";
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { getMaxContextTokens } from "@/lib/model";

export function ContextMeter({
  compacted,
  modelId,
  usage,
  usedTokens,
}: {
  readonly compacted: boolean;
  readonly modelId: string;
  readonly usage: LanguageModelUsage;
  readonly usedTokens: number;
}) {
  if (usedTokens <= 0) {
    return null;
  }

  const maxTokens = getMaxContextTokens(modelId);

  return (
    <span className="flex items-center gap-2">
      <Context maxTokens={maxTokens} modelId={modelId} usage={usage} usedTokens={usedTokens}>
        <ContextTrigger />
        <ContextContent>
          <ContextContentHeader />
          <ContextContentBody>
            <div className="space-y-1">
              <ContextInputUsage />
              <ContextOutputUsage />
              <ContextCacheUsage />
            </div>
          </ContextContentBody>
          <ContextContentFooter />
        </ContextContent>
      </Context>
      {compacted ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
          context compacted
        </span>
      ) : null}
    </span>
  );
}
