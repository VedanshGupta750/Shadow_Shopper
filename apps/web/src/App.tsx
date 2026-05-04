import { useCallback } from "react";
import { UrlBar } from "./components/UrlBar";
import { PersonaCard } from "./components/PersonaCard";
import { usePersonaStream } from "./hooks/usePersonaStream";
import { PERSONA_METADATA } from "./lib/personaMetadata";

const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  maxWidth: 1500,
  margin: "0 auto",
  padding: "24px",
  background: "#fafafa",
  minHeight: "100vh",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 16,
  marginBottom: 16,
};

const statusBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 6,
  marginBottom: 16,
  fontSize: 13,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 12,
  marginBottom: 24,
};

const synthesisStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: 16,
  fontSize: 13,
};

const errorStyle: React.CSSProperties = {
  background: "#fdecec",
  color: "#a00",
  border: "1px solid #c00",
  borderRadius: 6,
  padding: "10px 14px",
  marginBottom: 16,
  fontSize: 13,
};

const cancelButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 13,
  background: "#c33",
  color: "#fff",
  border: "1px solid #a00",
  borderRadius: 4,
  cursor: "pointer",
};

function phaseLabel(state: ReturnType<typeof usePersonaStream>["state"]): string {
  if (state.error) return `error: ${state.error}`;
  if (state.phase === "idle") return "idle - paste a URL and run";
  if (state.phase === "scraping") {
    return state.scrapeStage
      ? `scraping (${state.scrapeStage.stage}: ${state.scrapeStage.message})`
      : "scraping...";
  }
  if (state.phase === "personas") {
    const states = Object.values(state.personas);
    const done = states.filter((p) => p.status === "done" || p.status === "error").length;
    return `personas (${done}/10 complete)`;
  }
  if (state.phase === "synthesis") return "synthesizing...";
  if (state.phase === "done") return `done in ${(state.totalMs / 1000).toFixed(1)}s`;
  return state.phase;
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
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={{ margin: 0 }}>Shadow Shopper</h1>
        <span style={{ color: "#666", fontSize: 14 }}>
          10 buyer personas review one Amazon listing
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <UrlBar onRun={handleRun} disabled={state.isStreaming} />
      </div>

      {state.error && <div style={errorStyle}>{state.error}</div>}

      <div style={statusBarStyle}>
        <span>
          <strong>Status:</strong> {phaseLabel(state)}
        </span>
        {state.isStreaming && (
          <button type="button" style={cancelButtonStyle} onClick={handleCancel}>
            Cancel
          </button>
        )}
        {state.phase === "done" && (
          <span style={{ marginLeft: "auto", color: "#666" }}>
            cost: ${state.totalCostUsd.toFixed(4)}
          </span>
        )}
      </div>

      <div style={gridStyle}>
        {PERSONA_METADATA.map((persona) => {
          const personaState = state.personas[persona.id] ?? {
            tokens: "",
            status: "pending" as const,
          };
          return <PersonaCard key={persona.id} persona={persona} state={personaState} />;
        })}
      </div>

      <div style={synthesisStyle}>
        <h3 style={{ margin: "0 0 8px 0" }}>Synthesis</h3>
        {state.synthesis.report ? (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace" }}>
            {JSON.stringify(state.synthesis.report, null, 2)}
          </pre>
        ) : state.synthesis.tokens ? (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace" }}>
            {state.synthesis.tokens}
          </pre>
        ) : (
          <span style={{ color: "#888" }}>(synthesis appears here after personas finish)</span>
        )}
      </div>
    </div>
  );
}

export default App;
