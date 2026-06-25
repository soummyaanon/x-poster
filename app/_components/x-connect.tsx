"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Status = "loading" | "connected" | "disconnected";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 180_000;

/**
 * Sidebar control for connecting the X (Twitter) account the agent posts as.
 * Shows connection status and, when disconnected, a button that opens the
 * Composio OAuth flow in a new tab and polls until the connection goes live.
 */
export function XConnect() {
  const [status, setStatus] = useState<Status>("loading");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/x/status", { cache: "no-store" });
      const data = (await res.json()) as { connected?: boolean };
      const connected = Boolean(data.connected);
      setStatus(connected ? "connected" : "disconnected");
      return connected;
    } catch {
      setStatus("disconnected");
      return false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const res = await fetch("/api/x/connect", { method: "POST" });
      const data = (await res.json()) as {
        redirectUrl?: string;
        alreadyConnected?: boolean;
        error?: string;
      };

      if (data.alreadyConnected) {
        setStatus("connected");
        return;
      }
      if (data.error || !data.redirectUrl) {
        setError(data.error ?? "Could not start the connection.");
        return;
      }

      window.open(data.redirectUrl, "_blank", "noopener,noreferrer");

      // Poll until the OAuth flow completes in the other tab (or we time out).
      pollingRef.current = true;
      const startedAt = Date.now();
      while (pollingRef.current && Date.now() - startedAt < POLL_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (await refresh()) return;
      }
      if (pollingRef.current) setError("Timed out waiting for authorization. Try again.");
    } catch {
      setError("Could not reach the connect endpoint.");
    } finally {
      pollingRef.current = false;
      setConnecting(false);
    }
  }, [refresh]);

  const disconnect = useCallback(async () => {
    setError(null);
    setDisconnecting(true);
    try {
      const res = await fetch("/api/x/disconnect", { method: "POST" });
      const data = (await res.json()) as { disconnected?: boolean; error?: string };
      if (data.error) {
        setError(data.error);
        return;
      }
      setStatus("disconnected");
      setConfirmDisconnect(false);
    } catch {
      setError("Could not reach the disconnect endpoint.");
    } finally {
      setDisconnecting(false);
    }
  }, []);

  // Stop polling if the component unmounts mid-flow.
  useEffect(() => () => void (pollingRef.current = false), []);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            status === "connected" && "bg-emerald-500",
            status === "disconnected" && "bg-amber-500",
            status === "loading" && "bg-muted-foreground/50",
          )}
        />
        <span className="text-muted-foreground">
          {status === "connected" && "X account connected"}
          {status === "disconnected" && "X not connected"}
          {status === "loading" && "Checking X…"}
        </span>
      </div>

      {status === "disconnected" ? (
        <button
          className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
          disabled={connecting}
          onClick={() => void connect()}
          type="button"
        >
          {connecting ? "Waiting for authorization…" : "Connect X account"}
        </button>
      ) : null}

      {status === "connected" ? (
        confirmDisconnect ? (
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-destructive/40 px-2 py-1 text-destructive text-xs transition-colors hover:bg-destructive/10 disabled:opacity-50"
              disabled={disconnecting}
              onClick={() => void disconnect()}
              type="button"
            >
              {disconnecting ? "Disconnecting…" : "Confirm disconnect"}
            </button>
            <button
              className="text-muted-foreground text-xs hover:text-foreground"
              disabled={disconnecting}
              onClick={() => setConfirmDisconnect(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="text-muted-foreground text-xs hover:text-foreground"
            onClick={() => setConfirmDisconnect(true)}
            type="button"
          >
            Disconnect
          </button>
        )
      ) : null}

      {error ? <p className="text-[11px] text-destructive leading-snug">{error}</p> : null}
    </div>
  );
}
