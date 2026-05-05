import { History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onOpenHistory?: () => void;
  historyCount?: number;
}

export function AppHeader({ onOpenHistory, historyCount = 0 }: Props) {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-bg/80 border-b border-border">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-accent text-lg leading-none" aria-hidden>
            ◐
          </span>
          <span className="font-display font-semibold tracking-tight">shadow shopper</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
            azure · gpt-4o
          </span>
          {onOpenHistory && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onOpenHistory}
              className="border border-border bg-surface/60 text-text hover:bg-surface-2"
              aria-label={`Open history${historyCount > 0 ? ` (${historyCount} saved)` : ""}`}
            >
              <HistoryIcon className="h-3.5 w-3.5" />
              History
              {historyCount > 0 && (
                <span className="ml-1 rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                  {historyCount}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
