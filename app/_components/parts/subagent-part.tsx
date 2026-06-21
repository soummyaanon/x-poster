"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";

function describeState(state: EveDynamicToolPart["state"]): string {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return "Delegating…";
    case "output-available":
      return "Subagent finished.";
    case "output-error":
      return "Subagent failed.";
    case "output-denied":
      return "Delegation denied.";
    default:
      return "Working…";
  }
}

export function SubagentPart({ part }: { readonly part: EveDynamicToolPart }) {
  const name = part.toolMetadata?.eve?.name ?? part.toolName;
  return (
    <Task>
      <TaskTrigger title={`Delegated to ${name}`} />
      <TaskContent>
        <TaskItem>{describeState(part.state)}</TaskItem>
      </TaskContent>
    </Task>
  );
}
