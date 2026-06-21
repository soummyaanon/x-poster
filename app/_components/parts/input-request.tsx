"use client";

import type { EveDynamicToolPart } from "eve/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

export function InputRequest({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const inputRequest = part.toolMetadata?.eve?.inputRequest;
  const [freeform, setFreeform] = useState("");

  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId,
  );

  if (inputResponse) {
    return (
      <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-muted-foreground text-sm">{inputRequest.prompt}</p>
        <p className="font-medium text-sm">
          {selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId}
        </p>
      </div>
    );
  }

  const allowFreeform = inputRequest.allowFreeform || inputRequest.display === "text";

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-muted-foreground text-sm">{inputRequest.prompt}</p>

      {inputRequest.options && inputRequest.options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  { optionId: option.id, requestId: inputRequest.requestId },
                ]);
              }}
              size="sm"
              type="button"
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}

      {allowFreeform ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = freeform.trim();
            if (!text) {
              return;
            }
            void onInputResponses([{ requestId: inputRequest.requestId, text }]);
            setFreeform("");
          }}
        >
          <input
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            disabled={!canRespond}
            onChange={(event) => setFreeform(event.target.value)}
            placeholder="Type your answer…"
            value={freeform}
          />
          <Button disabled={!canRespond} size="sm" type="submit" variant="default">
            Send
          </Button>
        </form>
      ) : null}
    </div>
  );
}
