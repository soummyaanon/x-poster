"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";

export function ReasoningPart({
  text,
  streaming,
}: {
  readonly text: string;
  readonly streaming: boolean;
}) {
  return (
    <Reasoning defaultOpen={false} isStreaming={streaming}>
      <ReasoningTrigger />
      <ReasoningContent>{text}</ReasoningContent>
    </Reasoning>
  );
}
