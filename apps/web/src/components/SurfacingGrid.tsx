import { useState } from "react";
import { Loader2, CheckCircle2, Circle, XCircle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiSurface, SurfaceResult } from "../types/sse";
import type { SurfacingState } from "../hooks/usePersonaStream";

const SURFACES: readonly AiSurface[] = ["rufus", "chatgpt"] as const;

interface Props {
  state: SurfacingState;
}

interface CellState {
  result: SurfaceResult | null;
  pending: boolean;
}

function CellContent({ result, pending }: CellState) {
  if (pending) {
    return (
      <>
        <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden />
        <span className="text-[10px] uppercase tracking-wider text-muted">running</span>
      </>
    );
  }
  if (!result) {
    return (
      <>
        <Circle className="h-4 w-4 text-muted/40" aria-hidden />
        <span className="text-[10px] uppercase tracking-wider text-muted">queued</span>
      </>
    );
  }
  if (result.error) {
    return (
      <>
        <AlertCircle className="h-4 w-4 text-muted" aria-hidden />
        <span className="text-[10px] uppercase tracking-wider text-muted">error</span>
      </>
    );
  }
  if (result.score === "green") {
    return (
      <>
        <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden />
        <span className="text-[11px] font-medium text-accent">Top pick</span>
      </>
    );
  }
  if (result.score === "yellow") {
    return (
      <>
        <Circle className="h-4 w-4 text-warn" aria-hidden fill="currentColor" />
        <span className="text-[11px] font-medium text-warn">
          Mentioned
          {result.mentioned_position !== null ? ` #${result.mentioned_position}` : ""}
        </span>
      </>
    );
  }
  return (
    <>
      <XCircle className="h-4 w-4 text-danger" aria-hidden />
      <span className="text-[11px] font-medium text-danger">Invisible</span>
    </>
  );
}

function cellChromeClasses(state: CellState): string {
  if (state.pending) return "bg-surface-2 border-border";
  if (!state.result) return "bg-surface-2 border-border";
  if (state.result.error) return "bg-surface-2 border-border";
  if (state.result.score === "green") return "bg-accent/10 border-accent/40";
  if (state.result.score === "yellow") return "bg-warn/10 border-warn/40";
  return "bg-danger/10 border-danger/40";
}

function cellAriaLabel(question: string, surface: AiSurface, state: CellState): string {
  const label = state.pending
    ? "running"
    : !state.result
      ? "queued"
      : state.result.error
        ? "error"
        : state.result.score === "green"
          ? "top pick"
          : state.result.score === "yellow"
            ? "mentioned"
            : "invisible";
  return `${surface}: ${label} for "${question}"`;
}

export function SurfacingGrid({ state }: Props) {
  const [openCell, setOpenCell] = useState<SurfaceResult | null>(null);
  const questions = state.questions;

  const cellLookup = new Map<string, SurfaceResult>();
  for (const c of state.cells) cellLookup.set(`${c.question}|${c.surface}`, c);
  const pendingLookup = new Set(state.pendingCells.map((p) => `${p.question}|${p.surface}`));

  return (
    <section aria-labelledby="surfacing-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2
          id="surfacing-heading"
          className="font-display text-xs font-semibold uppercase tracking-wide text-muted"
        >
          AI SURFACING AUDIT
        </h2>
        <p className="text-xs text-muted">
          How buyers find this product when they ask Rufus or ChatGPT.
        </p>
      </div>

      <Card className="gap-0 border-border bg-surface px-4 py-4">
        {questions.length === 0 ? (
          <div className="py-6 text-center font-mono text-xs text-muted">
            questions appear here once generated
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_repeat(2,minmax(120px,140px))] gap-x-3 gap-y-2">
            <div />
            {SURFACES.map((s) => (
              <div
                key={s}
                className="text-center font-mono text-xs uppercase tracking-wider text-muted"
              >
                {s === "rufus" ? "Rufus" : "ChatGPT"}
              </div>
            ))}

            {questions.map((q, i) => (
              <div key={i} className="contents">
                <div
                  className="flex items-center font-mono text-xs text-text"
                  title={q}
                >
                  <span className="mr-2 text-muted">{i + 1}</span>
                  <span className="line-clamp-2">{q.length > 70 ? `${q.slice(0, 70)}…` : q}</span>
                </div>
                {SURFACES.map((s) => {
                  const key = `${q}|${s}`;
                  const result = cellLookup.get(key) ?? null;
                  const pending = pendingLookup.has(key);
                  const cellState: CellState = { result, pending };
                  const interactive = !!result && !result.error;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!interactive}
                      onClick={() => result && setOpenCell(result)}
                      aria-label={cellAriaLabel(q, s, cellState)}
                      className={cn(
                        "flex h-[60px] items-center justify-center gap-2 rounded-md border transition-colors",
                        cellChromeClasses(cellState),
                        interactive
                          ? "cursor-pointer hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          : "cursor-default",
                      )}
                    >
                      <CellContent {...cellState} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-[10px] text-muted">
          Simulated using GPT-4o tuned to Rufus's published answer style. Live Rufus access pending API release.
        </p>
      </Card>

      <Dialog open={openCell !== null} onOpenChange={(open) => !open && setOpenCell(null)}>
        <DialogContent className="bg-surface text-text border-border max-w-2xl">
          {openCell && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">
                  {openCell.surface === "rufus" ? "Rufus" : "ChatGPT"}{" "}
                  <span className="font-mono text-[10px] text-muted">(simulated)</span>
                </DialogTitle>
                <DialogDescription className="font-mono text-xs text-muted">
                  Q: {openCell.question}
                </DialogDescription>
              </DialogHeader>
              <div
                className={cn(
                  "rounded-md border px-3 py-2 text-xs",
                  cellChromeClasses({ result: openCell, pending: false }),
                )}
              >
                {openCell.error ? (
                  <span className="text-muted">error: {openCell.error}</span>
                ) : openCell.mentioned_position !== null ? (
                  <span className="font-mono">
                    Position #{openCell.mentioned_position} ·{" "}
                    {openCell.score === "green" ? "Top pick" : "Mentioned"}
                  </span>
                ) : (
                  <span className="font-mono">Not surfaced · Invisible</span>
                )}
              </div>
              <p className="font-display text-sm leading-relaxed whitespace-pre-wrap text-text">
                {openCell.answer_text || "(no answer)"}
              </p>
              <p className="text-[10px] text-muted">
                Simulated answer. GPT-4o imitating the published style of{" "}
                {openCell.surface === "rufus" ? "Amazon Rufus" : "ChatGPT shopping mode"}. Not a
                real call to the live system.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
