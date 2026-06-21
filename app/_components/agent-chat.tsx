"use client";

import { useEveAgent } from "eve/react";
import type { EveMessage } from "eve/react";
import { AlertCircleIcon, MenuIcon, PanelLeftIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { DEFAULT_MODEL_ID, MODEL_LABEL } from "@/agent/lib/models";
import { deriveUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { AgentMessage } from "./agent-message";
import { AppSidebar, CATEGORIES } from "./app-sidebar";
import { ContextMeter } from "./context-meter";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];

const EXAMPLES = [
  "What's trending on X right now",
  "A surprising science finding this week",
  "One hard founder lesson",
] as const;

const FOLLOW_UPS = [
  "Give me variations on option 1",
  "Sharper, more contrarian angle",
  "Make them shorter and punchier",
  "Pick a new category",
] as const;

export function AgentChat() {
  const agent = useEveAgent();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isEmpty = agent.data.messages.length === 0;
  const derivedUsage = useMemo(() => deriveUsage(agent.events), [agent.events]);
  const activity = useActivityLabel(agent.status, agent.data.messages);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) {
      return;
    }
    setMobileOpen(false);
    await agent.send({ message: trimmed });
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    await sendMessage(message.text ?? "");
  };

  const promptSuggestions = isEmpty ? EXAMPLES : FOLLOW_UPS;

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <AppSidebar
        busy={isBusy}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapse={() => setCollapsed(true)}
        onMobileClose={() => setMobileOpen(false)}
        onNewDraft={() => {
          agent.reset();
          setMobileOpen(false);
        }}
        onPickCategory={(category) => void sendMessage(category)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-border border-b px-3">
          <button
            aria-label="Open menu"
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent md:hidden"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <MenuIcon className="size-4" />
          </button>
          {collapsed ? (
            <button
              aria-label="Show sidebar"
              className="hidden size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent md:grid"
              onClick={() => setCollapsed(false)}
              type="button"
            >
              <PanelLeftIcon className="size-4" />
            </button>
          ) : null}
          <span className="flex items-center gap-2">
            <StatusDot status={agent.status} />
            <span className="text-muted-foreground text-sm">{statusLabel(agent.status)}</span>
          </span>
          <span className="flex-1" />
          <ContextMeter
            compacted={derivedUsage.compacted}
            modelId={DEFAULT_MODEL_ID}
            usage={derivedUsage.usage}
            usedTokens={derivedUsage.usedTokens}
          />
        </header>

        {agent.error ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-3 sm:px-6">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Request failed</p>
                <p className="mt-0.5 text-muted-foreground">{agent.error.message}</p>
              </div>
            </div>
          </div>
        ) : null}

        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
            {isEmpty ? (
              <ConversationEmptyState className="h-full">
                <div className="flex max-w-md flex-col items-center gap-4 text-center">
                  <h1 className="font-medium text-4xl tracking-tighter">Draft posts that rank</h1>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Pick a category in the sidebar or type a topic. I&apos;ll research a timely
                    angle and return three copy-paste-ready posts, each tuned for X&apos;s For You
                    ranking.
                  </p>
                </div>
              </ConversationEmptyState>
            ) : (
              <>
                {agent.data.messages.map((message, index) => (
                  <AgentMessage
                    canRespond={!isBusy}
                    isStreaming={
                      agent.status === "streaming" && index === agent.data.messages.length - 1
                    }
                    key={message.id}
                    message={message}
                    onInputResponses={(inputResponses) => agent.send({ inputResponses })}
                  />
                ))}
                {activity ? <Shimmer className="px-1 text-sm">{activity}</Shimmer> : null}
              </>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="mx-auto w-full max-w-3xl shrink-0 space-y-2 px-4 pb-4 sm:px-6">
          <Suggestions>
            {promptSuggestions.map((suggestion) => (
              <Suggestion
                key={suggestion}
                onClick={(text) => void sendMessage(text)}
                suggestion={suggestion}
              />
            ))}
          </Suggestions>
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="Pick a category, type a topic, or say hi…" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <span className="rounded-md px-1.5 py-1 font-medium text-muted-foreground text-xs">
                  {MODEL_LABEL}
                </span>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    {CATEGORIES.map((category) => (
                      <PromptInputActionMenuItem
                        key={category}
                        onClick={() => void sendMessage(category)}
                      >
                        {category}
                      </PromptInputActionMenuItem>
                    ))}
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
              </PromptInputTools>
              <PromptInputSubmit onStop={agent.stop} status={agent.status} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </main>
    </div>
  );
}

function useActivityLabel(status: AgentStatus, messages: readonly EveMessage[]): string | null {
  if (status === "submitted") {
    return "Thinking…";
  }
  if (status !== "streaming") {
    return null;
  }

  const last = messages.at(-1);
  if (!last || last.role !== "assistant") {
    return "Thinking…";
  }

  const searching = last.parts.some(
    (part) =>
      part.type === "dynamic-tool" &&
      (part.toolName === "web_search" || part.toolName === "web_fetch") &&
      part.state !== "output-available" &&
      part.state !== "output-error",
  );
  if (searching) {
    return "Researching the latest…";
  }

  const lastPart = last.parts.at(-1);
  if (lastPart?.type === "reasoning" && lastPart.state === "streaming") {
    return "Thinking…";
  }
  if (lastPart?.type === "dynamic-tool" && lastPart.state === "input-streaming") {
    return null;
  }
  if (lastPart?.type === "text") {
    return null;
  }
  return "Working…";
}

function statusLabel(status: AgentStatus): string {
  switch (status) {
    case "submitted":
      return "Thinking";
    case "streaming":
      return "Writing";
    case "error":
      return "Error";
    default:
      return "Ready";
  }
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const tone =
    status === "error"
      ? "bg-destructive"
      : isLive
        ? "bg-emerald-500"
        : "bg-muted-foreground/50";

  return (
    <span className="relative flex size-1.5">
      {isLive ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            tone,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-1.5 rounded-full transition-colors", tone)} />
    </span>
  );
}
