import { useCallback, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { UrlBar, type UrlBarHandle } from "./components/UrlBar";
import { PersonaGrid } from "./components/PersonaGrid";
import { SurfacingGrid } from "./components/SurfacingGrid";
import { SynthesisPanel } from "./components/SynthesisPanel";
import { AppHeader } from "./components/AppHeader";
import { NoiseOverlay } from "./components/NoiseOverlay";
import { Button } from "@/components/ui/button";
import { usePersonaStream, type StreamState } from "./hooks/usePersonaStream";

function statusLine(state: StreamState): string {
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
  const { state, start, cancel, reset } = usePersonaStream();
  const urlBarRef = useRef<UrlBarHandle>(null);

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

  return (
    <div className="min-h-screen bg-bg text-text font-display">
      <NoiseOverlay />
      <AppHeader />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <UrlBar
          ref={urlBarRef}
          onRun={handleRun}
          onCancel={handleCancel}
          isStreaming={state.isStreaming}
          statusLine={statusLine(state)}
          errorLine={state.error}
        />

        <SurfacingGrid state={state.surfacing} />

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
        />

        {(state.phase === "done" || state.error) && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={handleTryAnother}
              className="border-border bg-surface text-text hover:bg-surface-2"
            >
              <RotateCcw className="h-4 w-4" />
              Try another listing
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
