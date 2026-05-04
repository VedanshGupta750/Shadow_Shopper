import { getAvatarUrl, type PersonaMetadata } from "../lib/personaMetadata";
import type { PersonaState } from "../hooks/usePersonaStream";

interface Props {
  persona: PersonaMetadata;
  state: PersonaState;
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  padding: "12px",
  borderRadius: 6,
  background: "#fff",
  fontSize: 13,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 200,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const tokensStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 11,
  background: "#f7f7f7",
  padding: 6,
  borderRadius: 4,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 200,
  overflowY: "auto",
  margin: 0,
  fontFamily: "var(--font-mono)",
};

const verdictStyle: React.CSSProperties = {
  ...tokensStyle,
  background: "#eef7ee",
};

const errorStyle: React.CSSProperties = {
  ...tokensStyle,
  background: "#fdecec",
  color: "#a00",
};

function statusColor(status: PersonaState["status"]): string {
  if (status === "done") return "#070";
  if (status === "streaming") return "#06c";
  if (status === "error") return "#a00";
  return "#888";
}

export function PersonaCard({ persona, state }: Props) {
  const avatar = getAvatarUrl(persona.name, persona.age);

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <img
          src={avatar}
          alt={`${persona.name} avatar`}
          width={40}
          height={40}
          style={{ borderRadius: "50%", background: "#121212" }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>
            {persona.name}, {persona.age}
          </div>
          <div style={{ fontSize: 11, color: "#666" }}>
            {persona.role} - {persona.city}
          </div>
        </div>
        <span
          style={{
            fontSize: 10,
            color: statusColor(state.status),
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {state.status}
        </span>
      </div>

      {state.status === "error" ? (
        <pre style={errorStyle}>error: {state.error ?? "unknown"}</pre>
      ) : state.verdict ? (
        <pre style={verdictStyle}>{JSON.stringify(state.verdict, null, 2)}</pre>
      ) : (
        <pre style={tokensStyle}>{state.tokens || "(waiting...)"}</pre>
      )}
    </div>
  );
}
