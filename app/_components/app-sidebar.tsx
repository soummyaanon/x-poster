"use client";

import { PanelLeftCloseIcon, PlusIcon, XIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SIGNAL_LABELS, SIGNALS } from "@/agent/lib/drafts";
import { cn } from "@/lib/utils";
import { XConnect } from "./x-connect";

const BETA_TERMS_HREF = "https://vercel.com/docs/release-phases/public-beta-agreement";

export const CATEGORIES = [
  "Trending now",
  "AI & machine learning",
  "Startups & founder lessons",
  "Building / shipping in public",
  "Tech & business news",
  "Marketing & growth",
  "Money & investing",
  "Productivity & self-improvement",
  "Science & curiosity",
  "Culture & internet",
  "Health & fitness",
  "Sports",
] as const;

export function AppSidebar({
  busy,
  collapsed,
  mobileOpen,
  onCollapse,
  onMobileClose,
  onNewDraft,
  onPickCategory,
}: {
  readonly busy: boolean;
  readonly collapsed: boolean;
  readonly mobileOpen: boolean;
  readonly onCollapse: () => void;
  readonly onMobileClose: () => void;
  readonly onNewDraft: () => void;
  readonly onPickCategory: (category: string) => void;
}) {
  return (
    <>
      {mobileOpen ? (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-foreground/30 md:hidden"
          onClick={onMobileClose}
          type="button"
        />
      ) : null}

      <aside
        className={cn(
          "z-40 flex h-dvh w-64 shrink-0 flex-col border-border border-r bg-background",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:shadow-xl max-md:transition-transform max-md:duration-200",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          collapsed ? "md:hidden" : "md:flex",
        )}
      >
        <div className="flex h-14 items-center justify-between px-3">
          <span className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-foreground font-bold text-background text-sm">
              X
            </span>
            <span className="font-medium text-sm tracking-tight">Poster</span>
          </span>
          <button
            aria-label="Collapse sidebar"
            className="hidden size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent md:grid"
            onClick={onCollapse}
            type="button"
          >
            <PanelLeftCloseIcon className="size-4" />
          </button>
          <button
            aria-label="Close menu"
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent md:hidden"
            onClick={onMobileClose}
            type="button"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="px-3 pb-2">
          <button
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
            disabled={busy}
            onClick={onNewDraft}
            type="button"
          >
            <PlusIcon className="size-4 text-muted-foreground" />
            New draft
          </button>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-2">
          <SidebarSection label="Categories">
            {CATEGORIES.map((category, index) => (
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                disabled={busy}
                key={category}
                onClick={() => onPickCategory(category)}
                type="button"
              >
                <span className="w-4 shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
                  {index + 1}
                </span>
                <span className="truncate">{category}</span>
              </button>
            ))}
          </SidebarSection>

          <SidebarSection label="Ranked for">
            <ul className="space-y-1 px-2 py-0.5">
              {SIGNALS.map((signal) => (
                <li className="flex items-center gap-2 text-sm" key={signal}>
                  <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                  <span className="text-muted-foreground">{SIGNAL_LABELS[signal]}</span>
                </li>
              ))}
            </ul>
            <p className="px-2 pt-1.5 text-[11px] text-muted-foreground/70 leading-relaxed">
              Drafts target X&apos;s open-sourced For You signals.
            </p>
          </SidebarSection>
        </ScrollArea>

        <div className="space-y-2 border-border border-t px-3 py-3">
          <XConnect />
          <a
            className="inline-flex rounded-full border border-amber-500/30 px-2 py-0.5 font-medium text-amber-700 text-xs transition-colors hover:bg-amber-500/10 dark:text-amber-300"
            href={BETA_TERMS_HREF}
            rel="noreferrer"
            target="_blank"
          >
            Public preview
          </a>
        </div>
      </aside>
    </>
  );
}

function SidebarSection({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <div className="py-2">
      <p className="px-2 pb-1 font-medium text-[11px] text-muted-foreground/70 uppercase tracking-wider">
        {label}
      </p>
      {children}
    </div>
  );
}
