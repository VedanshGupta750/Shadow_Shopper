import { useState, type CSSProperties } from "react";
import type { AiSurface, SurfaceResult } from "../types/sse";
import type { SurfacingState } from "../hooks/usePersonaStream";

const SURFACES: readonly AiSurface[] = ["rufus", "chatgpt"] as const;

const containerStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: 16,
  marginBottom: 24,
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  marginBottom: 8,
};

const subtitleStyle: CSSProperties = {
  color: "#666",
  fontSize: 12,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid #ccc",
  fontWeight: 600,
  fontSize: 12,
  color: "#444",
  textTransform: "uppercase",
  letterSpacing: 1,
};

const tdStyle: CSSProperties = {
  padding: "8px",
  borderBottom: "1px solid #eee",
  verticalAlign: "middle",
};

const cellButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  background: "#fafafa",
  border: "1px solid #ddd",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
  width: "100%",
  textAlign: "left",
  fontFamily: "inherit",
};

const cellButtonDisabledStyle: CSSProperties = {
  ...cellButtonStyle,
  cursor: "default",
  background: "#f5f5f5",
};

function dotStyle(color: string): CSSProperties {
  return {
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: color,
    flexShrink: 0,
  };
}

const spinnerStyle: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: "50%",
  border: "2px solid #ccc",
  borderTopColor: "#666",
  animation: "spin 0.8s linear infinite",
  flexShrink: 0,
};

const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  padding: 24,
};

const modalStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: 20,
  maxWidth: 720,
  width: "100%",
  maxHeight: "80vh",
  overflowY: "auto",
};

const modalCloseStyle: CSSProperties = {
  float: "right",
  background: "transparent",
  border: "1px solid #ccc",
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
  fontSize: 12,
};

const SCORE_COLORS: Record<string, string> = {
  green: "#2a8a2a",
  yellow: "#d4a500",
  red: "#c33",
  gray: "#999",
};

function SurfaceLabel({ surface }: { surface: AiSurface }) {
  const label = surface === "rufus" ? "Rufus (sim)" : "ChatGPT (sim)";
  return <span style={{ fontWeight: 600, fontSize: 12 }}>{label}</span>;
}

function CellButton({
  result,
  pending,
  onClick,
}: {
  result: SurfaceResult | null;
  pending: boolean;
  onClick: () => void;
}) {
  if (pending) {
    return (
      <div style={cellButtonDisabledStyle}>
        <div style={spinnerStyle} />
        <span style={{ color: "#888" }}>running...</span>
      </div>
    );
  }
  if (!result) {
    return (
      <div style={cellButtonDisabledStyle}>
        <div style={dotStyle("#ddd")} />
        <span style={{ color: "#aaa" }}>queued</span>
      </div>
    );
  }
  const color = result.error ? SCORE_COLORS["gray"]! : SCORE_COLORS[result.score]!;
  const label = result.error
    ? "error"
    : result.mentioned_position !== null
      ? `position #${result.mentioned_position}`
      : "not surfaced";

  return (
    <button type="button" style={cellButtonStyle} onClick={onClick}>
      <div style={dotStyle(color)} />
      <span>{label}</span>
    </button>
  );
}

interface Props {
  state: SurfacingState;
}

export function SurfacingGrid({ state }: Props) {
  const [openCell, setOpenCell] = useState<SurfaceResult | null>(null);
  const questions = state.questions;

  const cellLookup = new Map<string, SurfaceResult>();
  for (const c of state.cells) cellLookup.set(`${c.question}|${c.surface}`, c);
  const pendingLookup = new Set(state.pendingCells.map((p) => `${p.question}|${p.surface}`));

  return (
    <>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <h3 style={{ margin: 0 }}>AI Surfacing Audit</h3>
          <span style={subtitleStyle}>
            Simulated based on Rufus's and ChatGPT's published answer styles. Does this listing
            surface for the questions a real shopper asks?
          </span>
        </div>

        {questions.length === 0 ? (
          <div style={{ color: "#888", fontSize: 13, padding: "12px 0" }}>
            (questions appear here once generated)
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "60%" }}>Question</th>
                {SURFACES.map((s) => (
                  <th key={s} style={thStyle}>
                    <SurfaceLabel surface={s} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {questions.map((q, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <span style={{ color: "#666", marginRight: 6 }}>{i + 1}.</span>
                    {q}
                  </td>
                  {SURFACES.map((s) => {
                    const key = `${q}|${s}`;
                    const result = cellLookup.get(key) ?? null;
                    const pending = pendingLookup.has(key);
                    return (
                      <td key={s} style={tdStyle}>
                        <CellButton
                          result={result}
                          pending={pending}
                          onClick={() => result && setOpenCell(result)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {openCell && (
        <div style={modalBackdropStyle} onClick={() => setOpenCell(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <button type="button" style={modalCloseStyle} onClick={() => setOpenCell(null)}>
              close
            </button>
            <h3 style={{ margin: "0 0 4px 0" }}>
              <SurfaceLabel surface={openCell.surface} />
            </h3>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
              Q: {openCell.question}
            </div>
            <div
              style={{
                fontSize: 12,
                marginBottom: 8,
                padding: "4px 8px",
                background: "#f7f7f7",
                borderRadius: 4,
              }}
            >
              {openCell.error ? (
                <span style={{ color: "#a00" }}>error: {openCell.error}</span>
              ) : openCell.mentioned_position !== null ? (
                <>
                  <strong>Position #{openCell.mentioned_position}</strong> ·{" "}
                  <span style={{ color: SCORE_COLORS[openCell.score] }}>{openCell.score}</span>
                </>
              ) : (
                <>
                  <strong>Not surfaced</strong> ·{" "}
                  <span style={{ color: SCORE_COLORS[openCell.score] }}>{openCell.score}</span>
                </>
              )}
            </div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "system-ui, sans-serif",
                fontSize: 13,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {openCell.answer_text || "(no answer)"}
            </pre>
            <div style={{ fontSize: 11, color: "#999", marginTop: 12 }}>
              Simulated answer. Generated by GPT-4o imitating the published style of{" "}
              {openCell.surface === "rufus" ? "Amazon Rufus" : "ChatGPT shopping mode"}. Not a real
              call to the live system.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
