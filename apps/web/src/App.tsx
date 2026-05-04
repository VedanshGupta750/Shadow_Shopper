import { useCallback } from "react";
import { UrlBar } from "./components/UrlBar";
import { PersonaCard } from "./components/PersonaCard";
import { usePersonaStream } from "./hooks/usePersonaStream";
import { PERSONA_METADATA } from "./lib/personaMetadata";
import type { Severity, SynthesisReport } from "./types/sse";

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

const sectionHeadingStyle: React.CSSProperties = {
  margin: "16px 0 6px 0",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#444",
};

const itemStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#f7f7f7",
  borderRadius: 4,
  marginBottom: 6,
};

function severityBadgeStyle(sev: Severity): React.CSSProperties {
  const colors = {
    high: { background: "#fdecec", color: "#a00", border: "1px solid #c00" },
    med: { background: "#fff7d6", color: "#7a5800", border: "1px solid #d4a500" },
    low: { background: "#eaf6ea", color: "#2a6b2a", border: "1px solid #4a9a4a" },
  } as const;
  return {
    ...colors[sev],
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    marginRight: 8,
  };
}

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

function ReportView({ report }: { report: SynthesisReport }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
        {report.would_not_buy_count}/10 would not buy
      </div>
      <p style={{ margin: "8px 0 0 0", lineHeight: 1.5 }}>{report.executive_summary}</p>

      <h4 style={sectionHeadingStyle}>Top friction points</h4>
      {report.top_friction_points.map((f, i) => (
        <div key={i} style={itemStyle}>
          <span style={severityBadgeStyle(f.severity)}>{f.severity}</span>
          <strong>{f.headline}</strong>
          <div style={{ marginTop: 4, color: "#444" }}>{f.evidence}</div>
        </div>
      ))}

      <h4 style={sectionHeadingStyle}>Top conversion levers</h4>
      {report.top_conversion_levers.map((l, i) => (
        <div key={i} style={itemStyle}>
          <span style={severityBadgeStyle(l.expected_impact)}>{l.expected_impact}</span>
          <strong>{l.recommendation}</strong>
          <div style={{ marginTop: 4, color: "#444" }}>{l.reasoning}</div>
        </div>
      ))}

      <h4 style={sectionHeadingStyle}>Winning competitor</h4>
      <div style={itemStyle}>
        {report.winning_competitor.name ? (
          <>
            <strong>{report.winning_competitor.name}</strong>{" "}
            <span style={{ color: "#666" }}>({report.winning_competitor.votes}/10 votes)</span>
            <div style={{ marginTop: 4, color: "#444" }}>{report.winning_competitor.why}</div>
          </>
        ) : (
          <span style={{ color: "#888" }}>No clear winning competitor cited.</span>
        )}
      </div>

      <h4 style={sectionHeadingStyle}>Revenue at risk (monthly)</h4>
      <div style={itemStyle}>
        <strong>
          ${report.revenue_at_risk_estimate.monthly_usd_low.toLocaleString()} - $
          {report.revenue_at_risk_estimate.monthly_usd_high.toLocaleString()}
        </strong>
        <div style={{ marginTop: 4, color: "#444" }}>
          {report.revenue_at_risk_estimate.reasoning}
        </div>
      </div>
    </div>
  );
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
          <ReportView report={state.synthesis.report} />
        ) : state.synthesis.tokens ? (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
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
