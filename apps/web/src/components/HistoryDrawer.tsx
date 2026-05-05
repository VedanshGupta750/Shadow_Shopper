import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Trash2, X, History as HistoryIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  clearAll,
  deleteAnalysis,
  listAnalyses,
  type HistoryEntry,
} from "../lib/history";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bumped externally whenever the history is mutated, so the drawer re-reads. */
  refreshKey: number;
  onLoad: (entry: HistoryEntry) => void;
  onAfterMutate: () => void;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function countDoneVerdicts(entry: HistoryEntry): {
  done: number;
  notBuy: number;
} {
  let done = 0;
  let notBuy = 0;
  for (const p of Object.values(entry.personas)) {
    if (p.status === "done") done++;
    if (p.verdict?.verdict === "would-not-buy") notBuy++;
  }
  return { done, notBuy };
}

export function HistoryDrawer({
  open,
  onOpenChange,
  refreshKey,
  onLoad,
  onAfterMutate,
}: Props) {
  const reduced = useReducedMotion();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    setEntries(listAnalyses());
  }, [open, refreshKey]);

  const handleDelete = (id: string): void => {
    deleteAnalysis(id);
    setEntries(listAnalyses());
    onAfterMutate();
  };

  const handleClear = (): void => {
    if (entries.length === 0) return;
    const confirmed = window.confirm(
      `Clear all ${entries.length} saved analyses? This cannot be undone.`,
    );
    if (!confirmed) return;
    clearAll();
    setEntries([]);
    onAfterMutate();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="history-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 z-50 bg-black/50"
            aria-hidden
          />
          <motion.aside
            key="history-drawer"
            role="dialog"
            aria-label="Analysis history"
            initial={reduced ? { opacity: 0 } : { x: "100%" }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: "100%" }}
            transition={
              reduced
                ? { duration: 0.2 }
                : { type: "spring", stiffness: 320, damping: 32 }
            }
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <HistoryIcon className="h-4 w-4 text-accent" aria-hidden />
                <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-text">
                  History
                </h2>
                <span className="font-mono text-[10px] text-muted">
                  {entries.length}/20
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleClear}
                  disabled={entries.length === 0}
                  className="text-muted hover:text-danger"
                  aria-label="Clear all history"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close history"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {entries.length === 0 ? (
                <div className="mx-auto mt-12 flex max-w-xs flex-col items-center gap-3 px-4 text-center">
                  <HistoryIcon
                    className="h-10 w-10 text-muted/40"
                    aria-hidden
                  />
                  <p className="font-display text-sm text-text">
                    No saved analyses yet.
                  </p>
                  <p className="text-xs leading-relaxed text-muted">
                    Run a Shadow Shopper analysis on any Amazon URL. Every
                    completed run is saved here automatically, on this device.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {entries.map((entry) => {
                    const { done, notBuy } = countDoneVerdicts(entry);
                    const fixCount = Object.keys(entry.fixes).length;
                    return (
                      <li key={entry.id}>
                        <article
                          className={cn(
                            "group relative flex flex-col gap-2 rounded-lg border border-border bg-surface-2/40 p-3 transition-colors",
                            "hover:border-accent/40 hover:bg-surface-2",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onLoad(entry);
                              onOpenChange(false);
                            }}
                            className="flex flex-col items-start gap-1.5 text-left"
                          >
                            <div className="flex w-full items-baseline justify-between gap-2">
                              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                                {entry.asin}
                              </span>
                              <span className="font-mono text-[10px] text-muted">
                                {formatRelative(entry.createdAt)}
                              </span>
                            </div>
                            <h3 className="line-clamp-2 font-display text-sm font-medium leading-snug text-text">
                              {entry.productMeta.name || "Unnamed listing"}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="rounded-full border border-border bg-bg/50 px-2 py-0.5 font-mono text-[10px] text-muted">
                                {notBuy}/{done} won't buy
                              </span>
                              {entry.synthesis && (
                                <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
                                  ${entry.synthesis.revenue_at_risk_estimate.monthly_usd_low.toLocaleString()}
                                  -$
                                  {entry.synthesis.revenue_at_risk_estimate.monthly_usd_high.toLocaleString()}/mo
                                </span>
                              )}
                              {fixCount > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 font-mono text-[10px] text-warn">
                                  <Sparkles
                                    className="h-2.5 w-2.5"
                                    aria-hidden
                                  />
                                  {fixCount} fix{fixCount === 1 ? "" : "es"}
                                </span>
                              )}
                            </div>
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDelete(entry.id)}
                            className="absolute right-2 top-2 text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={`Delete history entry ${entry.asin}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="shrink-0 border-t border-border px-5 py-3">
              <p className="text-[10px] leading-relaxed text-muted">
                History is stored on this device only. Clearing your browser
                data will remove it.
              </p>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
