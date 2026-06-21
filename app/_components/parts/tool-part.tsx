"use client";

import type { EveDynamicToolPart } from "eve/react";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

const SEARCH_TOOLS = new Set(["web_search", "web_fetch"]);

interface SourceLink {
  readonly url: string;
  readonly title?: string;
}

function readSources(output: unknown): SourceLink[] {
  const found: SourceLink[] = [];

  const visit = (value: unknown) => {
    if (!value) {
      return;
    }
    if (typeof value === "string") {
      if (/^https?:\/\//.test(value)) {
        found.push({ url: value });
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.url === "string") {
        found.push({
          url: record.url,
          title: typeof record.title === "string" ? record.title : undefined,
        });
      }
      for (const item of Object.values(record)) {
        visit(item);
      }
    }
  };

  visit(output);

  const seen = new Set<string>();
  return found.filter((source) => {
    if (seen.has(source.url)) {
      return false;
    }
    seen.add(source.url);
    return true;
  });
}

export function ToolPart({ part }: { readonly part: EveDynamicToolPart }) {
  const isSearch = SEARCH_TOOLS.has(part.toolName);
  const output = part.state === "output-available" ? part.output : undefined;
  const sources = isSearch && output ? readSources(output) : [];

  return (
    <div className="flex flex-col gap-2">
      {sources.length > 0 ? (
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source) => (
              <Source href={source.url} key={source.url} title={source.title ?? source.url} />
            ))}
          </SourcesContent>
        </Sources>
      ) : null}
      <Tool>
        <ToolHeader
          state={part.state}
          title={part.toolName}
          toolName={part.toolName}
          type="dynamic-tool"
        />
        <ToolContent>
          <ToolInput input={part.input} />
          <ToolOutput
            errorText={part.state === "output-error" ? part.errorText : undefined}
            output={part.state === "output-available" ? part.output : undefined}
          />
        </ToolContent>
      </Tool>
    </div>
  );
}
