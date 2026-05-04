import { useCallback } from "react";
import { UrlBar } from "./components/UrlBar";
import { PersonaCard } from "./components/PersonaCard";
import { SurfacingGrid } from "./components/SurfacingGrid";
import { SynthesisPanel } from "./components/SynthesisPanel";
import { AppHeader } from "./components/AppHeader";
import { NoiseOverlay } from "./components/NoiseOverlay";
import { usePersonaStream, type StreamState } from "./hooks/usePersonaStream";
import { PERSONA_METADATA } from "./lib/personaMetadata";

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
  const { state, start, cancel } = usePersonaStream();

  const handleRun = useCallback(
    (url: string) => {
      void start(url);
    },
    [start],
  );

  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  return (
    <div className="min-h-screen bg-bg text-text font-display">
      <NoiseOverlay />
      <AppHeader />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <UrlBar
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {PERSONA_METADATA.map((persona) => {
              const personaState = state.personas[persona.id] ?? {
                tokens: "",
                status: "pending" as const,
              };
              return (
                <PersonaCard key={persona.id} persona={persona} state={personaState} />
              );
            })}
          </div>
        </section>

        <SynthesisPanel
          report={state.synthesis.report}
          streamingText={state.synthesis.tokens}
        />
      </main>
    </div>
  );
}

export default App;
