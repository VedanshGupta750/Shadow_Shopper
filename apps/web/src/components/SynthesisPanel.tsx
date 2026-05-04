import type { Severity, SynthesisReport } from "../types/sse";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  report: SynthesisReport | null;
  streamingText: string;
}

const SEVERITY_DOT: Record<Severity, string> = {
  high: "bg-danger",
  med: "bg-warn",
  low: "bg-accent",
};

const SEVERITY_PILL: Record<Severity, string> = {
  high: "bg-danger/15 text-danger border-danger/40",
  med: "bg-warn/15 text-warn border-warn/40",
  low: "bg-accent/15 text-accent border-accent/40",
};

function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[severity])}
    />
  );
}

function ImpactPill({ impact }: { impact: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        SEVERITY_PILL[impact],
      )}
    >
      {impact}
    </span>
  );
}

function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </h3>
  );
}

function StreamingView({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-muted">
        {text || "synthesizer warming up…"}
      </pre>
    </div>
  );
}

function ReportView({ report }: { report: SynthesisReport }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2
          className={cn(
            "font-display text-2xl font-bold tracking-tight",
            "bg-gradient-to-r from-accent to-text bg-clip-text text-transparent",
          )}
        >
          SYNTHESIS REPORT
        </h2>
        <p className="font-mono text-sm text-muted">
          {report.would_not_buy_count}/10 would not buy
        </p>
        <p className="mt-2 font-display text-sm leading-relaxed text-text">
          {report.executive_summary}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="flex flex-col gap-3">
          <ColumnHeading>Top friction</ColumnHeading>
          <ul className="flex flex-col gap-3">
            {report.top_friction_points.map((f, i) => (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <SeverityDot severity={f.severity} />
                  <span className="font-display text-sm font-medium text-text">{f.headline}</span>
                </div>
                <p className="text-xs leading-relaxed text-muted">{f.evidence}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <ColumnHeading>Conversion levers</ColumnHeading>
          <ul className="flex flex-col gap-3">
            {report.top_conversion_levers.map((l, i) => (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-sm font-medium text-text">
                    {l.recommendation}
                  </span>
                  <ImpactPill impact={l.expected_impact} />
                </div>
                <p className="text-xs leading-relaxed text-muted">{l.reasoning}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <ColumnHeading>Winning competitor</ColumnHeading>
          {report.winning_competitor.name ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-sm font-medium text-text">
                  {report.winning_competitor.name}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {report.winning_competitor.votes}/10
                </span>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                {report.winning_competitor.why}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted">No clear winning competitor cited.</p>
          )}
        </section>
      </div>

      <footer className="flex flex-col gap-1 border-t border-border pt-4">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Estimated revenue at risk (monthly)
        </span>
        <span className="font-display text-xl font-semibold text-accent">
          ${report.revenue_at_risk_estimate.monthly_usd_low.toLocaleString()} – $
          {report.revenue_at_risk_estimate.monthly_usd_high.toLocaleString()}/mo
        </span>
        <p className="text-xs leading-relaxed text-muted">
          {report.revenue_at_risk_estimate.reasoning}
        </p>
      </footer>
    </div>
  );
}

export function SynthesisPanel({ report, streamingText }: Props) {
  return (
    <Card className="gap-0 border-border bg-surface p-6">
      {report ? (
        <ReportView report={report} />
      ) : streamingText.length > 0 ? (
        <StreamingView text={streamingText} />
      ) : (
        <div className="flex flex-col gap-2 text-center text-xs text-muted">
          synthesis appears here once all 10 personas finish
        </div>
      )}
    </Card>
  );
}
