"use client";

import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { DraftsPart } from "./parts/drafts-part";
import { InputRequest } from "./parts/input-request";
import type { AgentInputResponse } from "./parts/input-request";
import { ReasoningPart } from "./parts/reasoning-part";
import { SubagentPart } from "./parts/subagent-part";
import { TodoPart } from "./parts/todo-part";
import { ToolPart } from "./parts/tool-part";

export type { AgentInputResponse } from "./parts/input-request";

export function AgentMessage({
  canRespond,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
}) {
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );

  return (
    <Message
      data-optimistic={message.metadata?.optimistic ? "true" : undefined}
      from={message.role}
    >
      <MessageContent>
        {message.parts.map((part, index) => (
          <AgentMessagePart
            canRespond={canRespond}
            key={partKey(part, index)}
            onInputResponses={onInputResponses}
            part={part}
            showCaret={isStreaming && message.role === "assistant" && index === lastTextIndex}
          />
        ))}
      </MessageContent>
    </Message>
  );
}

function AgentMessagePart({
  canRespond,
  onInputResponses,
  part,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
}) {
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return (
        <MessageResponse caret="block" isAnimating={showCaret}>
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return <ReasoningPart streaming={part.state === "streaming"} text={part.text} />;
    case "dynamic-tool":
      return (
        <DynamicToolPart
          canRespond={canRespond}
          onInputResponses={onInputResponses}
          part={part}
        />
      );
    default:
      return null;
  }
}

function DynamicToolPart({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  if (part.toolMetadata?.eve?.inputRequest) {
    return (
      <InputRequest canRespond={canRespond} onInputResponses={onInputResponses} part={part} />
    );
  }
  if (part.toolName === "compose_drafts") {
    return <DraftsPart part={part} />;
  }
  if (part.toolName === "todo") {
    return <TodoPart part={part} />;
  }
  if (part.toolMetadata?.eve?.kind === "subagent-call") {
    return <SubagentPart part={part} />;
  }
  return <ToolPart part={part} />;
}

function partKey(part: EveMessagePart, index: number): string {
  if (part.type === "dynamic-tool") {
    return part.toolCallId;
  }
  return `${part.type}:${index}`;
}
