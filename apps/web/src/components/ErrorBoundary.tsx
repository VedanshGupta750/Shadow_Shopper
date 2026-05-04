import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Telemetry hook. Replace with a real provider (Sentry, Bugsnag, etc.) later. */
function reportToTelemetry(_error: Error, _info: ErrorInfo): void {
  // intentionally noop
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("ErrorBoundary caught:", error, info);
    }
    reportToTelemetry(error, info);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-bg text-text font-display flex items-center justify-center px-6">
        <div className="max-w-lg w-full rounded-xl border border-border bg-surface p-8 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-3 rounded-full bg-danger" />
            <h2 className="font-display text-lg font-semibold">Something broke</h2>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            The UI hit an unexpected error. Resetting clears the error state and re-renders the
            page; your in-progress run is gone but you can paste a URL again.
          </p>
          {this.state.error?.message && (
            <pre className="rounded-md border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-danger whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReset}
            className="self-start rounded-md bg-accent px-4 py-2 font-display text-sm font-medium text-bg hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Reset
          </button>
        </div>
      </div>
    );
  }
}
