"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";

type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

interface Todo {
  readonly content: string;
  readonly status?: TodoStatus;
}

const STATUS_MARK: Record<TodoStatus, string> = {
  pending: "○",
  in_progress: "◐",
  completed: "●",
  cancelled: "✕",
};

function readTodos(input: unknown): readonly Todo[] {
  if (
    input &&
    typeof input === "object" &&
    Array.isArray((input as { todos?: unknown }).todos)
  ) {
    return (input as { todos: Todo[] }).todos;
  }
  return [];
}

export function TodoPart({ part }: { readonly part: EveDynamicToolPart }) {
  const todos = readTodos(part.input);
  if (todos.length === 0) {
    return null;
  }

  const done = todos.filter((todo) => todo.status === "completed").length;

  return (
    <Task>
      <TaskTrigger title={`Plan (${done}/${todos.length})`} />
      <TaskContent>
        {todos.map((todo, index) => (
          <TaskItem key={index}>
            <span className="mr-2 text-muted-foreground">
              {STATUS_MARK[todo.status ?? "pending"]}
            </span>
            <span
              className={
                todo.status === "completed" ? "text-muted-foreground line-through" : undefined
              }
            >
              {todo.content}
            </span>
          </TaskItem>
        ))}
      </TaskContent>
    </Task>
  );
}
