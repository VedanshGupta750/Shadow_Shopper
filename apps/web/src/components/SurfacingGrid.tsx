import { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Circle,
  XCircle,
  AlertCircle,
  MessageSquarePlus,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AiSurface, SurfaceResult } from "../types/sse";
import type { SurfacingState } from "../hooks/usePersonaStream";

const SURFACES: readonly AiSurface[] = ["rufus", "chatgpt"] as const;

const EXAMPLE_QUESTIONS = [
  "Is this good for someone who travels a lot?",
  "How does this compare to the most popular alternative?",
];

interface Props {
  state: SurfacingState;
  /** True once productMeta has loaded and the custom-question form should be enabled. */
  productLoaded?: boolean;
  /** Submit handler for custom buyer questions. */
  onSubmitCustom?: (question: string) => Promise<void>;
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

/** Animation key changes when state shifts (queued → pending → resolved), driving the spring re-mount. */
function cellKey(result: SurfaceResult | null, pending: boolean): string {
  if (result) return `r:${result.score}${result.error ? ":err" : ""}`;
  if (pending) return "pending";
  return "queued";
}

export function SurfacingGrid({ state, productLoaded = false, onSubmitCustom }: Props) {
  const reduced = useReducedMotion();
  const [openCell, setOpenCell] = useState<SurfaceResult | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const questions = state.questions;

  const cellLookup = new Map<string, SurfaceResult>();
  for (const c of state.cells) cellLookup.set(`${c.question}|${c.surface}`, c);
  const pendingLookup = new Set(state.pendingCells.map((p) => `${p.question}|${p.surface}`));

  const customCellLookup = new Map<string, SurfaceResult>();
  for (const c of state.customCells) customCellLookup.set(`${c.question}|${c.surface}`, c);
  const customPendingSet = new Set(state.customPending);

  const customQuestions = state.customQuestions;
  const formAvailable = productLoaded && !!onSubmitCustom;
  const draftTrimmed = draft.trim();
  const draftValid = draftTrimmed.length >= 5 && draftTrimmed.length <= 300;

  async function submit(q: string): Promise<void> {
    if (!onSubmitCustom) return;
    if (q.trim().length < 5) return;
    setSubmitting(true);
    try {
      await onSubmitCustom(q);
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  }

  function renderQuestionRow(
    q: string,
    rowIndex: number,
    isCustom: boolean,
  ): React.ReactNode {
    const lookup = isCustom ? customCellLookup : cellLookup;
    const isPendingRow = isCustom
      ? customPendingSet.has(q)
      : false; // auto rows use per-cell pending
    return (
      <div key={`${isCustom ? "c" : "a"}-${rowIndex}`} className="contents">
        <div
          className="flex items-center font-mono text-xs text-text"
          title={q}
        >
          <span
            className={cn(
              "mr-2",
              isCustom ? "text-accent" : "text-muted",
            )}
          >
            {isCustom ? "★" : rowIndex + 1}
          </span>
          <span className="line-clamp-2">
            {q.length > 70 ? `${q.slice(0, 70)}…` : q}
          </span>
        </div>
        {SURFACES.map((s) => {
          const key = `${q}|${s}`;
          const result = lookup.get(key) ?? null;
          const pending = isCustom
            ? isPendingRow && !result
            : pendingLookup.has(key);
          const cellState: CellState = { result, pending };
          const interactive = !!result && !result.error;
          const innerKey = cellKey(result, pending);
          return (
            <motion.button
              key={s}
              type="button"
              disabled={!interactive}
              onClick={() => result && setOpenCell(result)}
              aria-label={cellAriaLabel(q, s, cellState)}
              {...(interactive && !reduced
                ? { whileHover: { scale: 1.03 } }
                : {})}
              transition={
                reduced
                  ? { duration: 0.15 }
                  : { type: "spring", stiffness: 400, damping: 24 }
              }
              className={cn(
                "flex h-[60px] items-center justify-center gap-2 rounded-md border transition-colors",
                cellChromeClasses(cellState),
                interactive
                  ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  : "cursor-default",
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={innerKey}
                  initial={
                    reduced ? { opacity: 0 } : { scale: 0.95, opacity: 0 }
                  }
                  animate={
                    reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }
                  }
                  exit={
                    reduced ? { opacity: 0 } : { scale: 0.95, opacity: 0 }
                  }
                  transition={
                    reduced
                      ? { duration: 0.15 }
                      : { type: "spring", stiffness: 400, damping: 24 }
                  }
                  className="flex items-center gap-2"
                >
                  <CellContent {...cellState} />
                </motion.div>
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
    );
  }

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
        {questions.length === 0 && customQuestions.length === 0 ? (
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

            {questions.map((q, i) => renderQuestionRow(q, i, false))}

            {customQuestions.length > 0 && (
              <div
                key="custom-divider"
                className="col-span-3 mt-3 flex items-center gap-2 border-t border-border pt-3"
              >
                <span className="text-accent" aria-hidden>
                  ★
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  Your custom questions
                </span>
              </div>
            )}

            {customQuestions.map((q, i) => renderQuestionRow(q, i, true))}
          </div>
        )}

        {formAvailable && (
          <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
                Test a real buyer question
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              Type a question a real shopper would ask. We'll run it through both Rufus and
              ChatGPT and show whether your listing surfaces.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!draftValid || submitting) return;
                void submit(draft);
              }}
              className="flex flex-col gap-2"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. Is this monitor good if my baby's room is two floors away?"
                maxLength={300}
                rows={2}
                className={cn(
                  "w-full resize-none rounded-md border border-border bg-bg/50 px-3 py-2 font-mono text-xs text-text placeholder:text-muted/60",
                  "focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/40",
                )}
                disabled={submitting}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLE_QUESTIONS.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setDraft(ex)}
                      disabled={submitting}
                      className="rounded-full border border-border bg-surface-2/40 px-2 py-0.5 font-mono text-[10px] text-muted hover:border-accent/40 hover:text-accent disabled:opacity-50"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted">
                    {draftTrimmed.length}/300
                  </span>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={!draftValid || submitting}
                    className="border-accent/40 bg-surface text-accent hover:bg-accent/10 hover:text-accent disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running…
                      </>
                    ) : (
                      "Test question"
                    )}
                  </Button>
                </div>
              </div>
            </form>
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
