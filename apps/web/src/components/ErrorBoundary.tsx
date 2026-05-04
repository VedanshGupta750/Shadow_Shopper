import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const fallbackStyle: React.CSSProperties = {
  fontFamily: "system-ui, sans-serif",
  margin: "4rem auto",
  maxWidth: 600,
  padding: 24,
  border: "1px solid #c00",
  background: "#fff7f7",
  color: "#a00",
  borderRadius: 6,
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={fallbackStyle}>
          <h2 style={{ marginTop: 0 }}>Something went wrong.</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {this.state.error?.message ?? "Unknown error"}
          </pre>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
            }}
            style={{ marginTop: 12, padding: "6px 12px" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
