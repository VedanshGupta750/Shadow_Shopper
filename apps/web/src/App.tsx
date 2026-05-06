import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { UrlBar, type UrlBarHandle } from "./components/UrlBar";
import { PersonaGrid } from "./components/PersonaGrid";
import { SurfacingGrid } from "./components/SurfacingGrid";
import { SynthesisPanel } from "./components/SynthesisPanel";
import { AppHeader } from "./components/AppHeader";
import { NoiseOverlay } from "./components/NoiseOverlay";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { Button } from "@/components/ui/button";
import { usePersonaStream, type StreamState } from "./hooks/usePersonaStream";
import { listAnalyses, type HistoryEntry } from "./lib/history";

function statusLine(state: StreamState): string {
  if (state.cancelled) return "cancelled — click Run to try again";
  if (state.phase === "idle") return "ready — paste an Amazon URL to start";
  if (state.phase === "scraping") {
    if (state.scrapeStage) {
      return `scraping → ${state.scrapeStage.stage}: ${state.scrapeStage.message}`;
    }
    return "scraping…";
  }
  if (state.phase === "surfacing") {
    const cells = state.surfacing.cells.length;
    const total = state.surfacing.questions.length * 2;
    if (total === 0) return "surfacing → generating questions";
    return `surfacing → ${cells}/${total} cells answered`;
  }
  if (state.phase === "personas") {
    const states = Object.values(state.personas);
    const done = states.filter((p) => p.status === "done" || p.status === "error").length;
    return `personas → ${done}/10 verdicts in`;
  }
  if (state.phase === "synthesis") return "synthesizing report…";
  if (state.phase === "done") {
    return `done in ${(state.totalMs / 1000).toFixed(1)}s · cost $${state.totalCostUsd.toFixed(4)}`;
  }
  return "";
}

function App() {
  const {
    state,
    start,
    cancel,
    reset,
    loadFromHistory,
    saveFix,
    runCustomQuestion,
  } = usePersonaStream();
  const urlBarRef = useRef<UrlBarHandle>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const refreshHistoryCount = useCallback(() => {
    setHistoryCount(listAnalyses().length);
    setHistoryRefreshKey((k) => k + 1);
  }, []);

  // Keep header badge accurate. Refresh on mount, after a save (synthesis-complete + done),
  // and after any drawer mutation.
  useEffect(() => {
    refreshHistoryCount();
  }, [refreshHistoryCount]);

  useEffect(() => {
    if (state.synthesis.report) refreshHistoryCount();
  }, [state.synthesis.report, refreshHistoryCount]);

  useEffect(() => {
    if (state.phase === "done") refreshHistoryCount();
  }, [state.phase, refreshHistoryCount]);

  const handleRun = useCallback(
    (url: string) => {
      void start(url);
    },
    [start],
  );

  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  const handleTryAnother = useCallback(() => {
    reset();
    // Defer focus so the input is interactable after the state reset paints.
    requestAnimationFrame(() => urlBarRef.current?.focus());
  }, [reset]);

  const handleLoadHistory = useCallback(
    (entry: HistoryEntry) => {
      loadFromHistory(entry);
      toast.success(`Loaded: ${entry.productMeta.name.slice(0, 60)}`);
    },
    [loadFromHistory],
  );

  return (
    <div className="min-h-screen bg-bg text-text font-display">
      <NoiseOverlay />
      <AppHeader
        onOpenHistory={() => setHistoryOpen(true)}
        historyCount={historyCount}
      />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <UrlBar
          ref={urlBarRef}
          onRun={handleRun}
          onCancel={handleCancel}
          isStreaming={state.isStreaming}
          statusLine={statusLine(state)}
          errorLine={state.error}
        />

        {state.loadedFromHistory && state.productMeta && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/5 px-4 py-2 text-xs">
            <span className="font-mono text-muted">
              Viewing saved analysis ·{" "}
              <span className="text-text">{state.productMeta.asin}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleTryAnother}
              className="text-accent hover:text-accent"
            >
              Start a new run
            </Button>
          </div>
        )}

        {state.productMeta && state.productMeta.platform !== "amazon" && (
          <div
            role="status"
            className="flex flex-col gap-1 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-xs"
          >
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 rounded-full bg-warn" />
              <span className="font-display text-sm font-medium text-text">
                Running on {state.productMeta.hostname} (non-Amazon)
              </span>
            </div>
            <p className="leading-relaxed text-muted">
              The personas, conversion levers, and Generate-Fix copy are tuned
              for Amazon Seller Central. Treat results as directional. The AI
              Surfacing audit (Rufus + ChatGPT shopping mode) is skipped — those
              are Amazon-only surfaces.
            </p>
          </div>
        )}

        {(!state.productMeta || state.productMeta.platform === "amazon") && (
          <SurfacingGrid
            state={state.surfacing}
            productLoaded={!!state.productMeta}
            onSubmitCustom={runCustomQuestion}
          />
        )}

        <section aria-labelledby="personas-heading" className="flex flex-col gap-3">
          <h2
            id="personas-heading"
            className="font-display text-xs font-semibold uppercase tracking-wide text-muted"
          >
            10 BUYER PERSONAS
          </h2>
          <PersonaGrid personaStates={state.personas} />
        </section>

        <SynthesisPanel
          phase={state.phase}
          report={state.synthesis.report}
          streamingText={state.synthesis.tokens}
          error={state.synthesis.error}
          productMeta={state.productMeta}
          fixCache={state.fixes}
          onFixGenerated={saveFix}
        />

        {(state.phase === "done" || state.error || state.cancelled) && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleTryAnother}
              className="border-border bg-surface text-text hover:bg-surface-2"
            >
              <RotateCcw className="h-4 w-4" />
              {state.loadedFromHistory ? "Start a new run" : "Try another listing"}
            </Button>
          </div>
        )}
      </main>

      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        refreshKey={historyRefreshKey}
        onLoad={handleLoadHistory}
        onAfterMutate={refreshHistoryCount}
      />
      <SpeedInsights />
    </div>
  );
}

export default App;
