import { useEffect, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import type { Severity, SynthesisReport, SsePhase } from "../types/sse";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  phase: "idle" | SsePhase;
  report: SynthesisReport | null;
  streamingText: string;
  error: string | null;
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

/** Count up from 0 → target over duration ms. Respects reduced motion (sets immediately). */
function useCountUp(target: number, duration = 1200): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const controls = animate(0, target, {
      duration: duration / 1000,
      ease: "easeOut",
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [target, duration, reduced]);

  return Math.round(value);
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

const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.15 + i * 0.08, duration: 0.4, ease: "easeOut" },
  }),
};

const REDUCED_SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  show: (_i: number) => ({ opacity: 1, transition: { duration: 0.2 } }),
};

function ReportView({ report }: { report: SynthesisReport }) {
  const reduced = useReducedMotion();
  const sectionVariants = reduced ? REDUCED_SECTION_VARIANTS : SECTION_VARIANTS;

  const wouldNotBuy = useCountUp(report.would_not_buy_count, 1200);
  const revLow = useCountUp(report.revenue_at_risk_estimate.monthly_usd_low, 1200);
  const revHigh = useCountUp(report.revenue_at_risk_estimate.monthly_usd_high, 1200);

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
          <motion.span
            initial={false}
            animate={{ opacity: 1 }}
            className="tabular-nums"
          >
            {wouldNotBuy}
          </motion.span>
          /10 would not buy
        </p>
        <p className="mt-2 font-display text-sm leading-relaxed text-text">
          {report.executive_summary}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <motion.section
          custom={0}
          variants={sectionVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-3"
        >
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
        </motion.section>

        <motion.section
          custom={1}
          variants={sectionVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-3"
        >
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
        </motion.section>

        <motion.section
          custom={2}
          variants={sectionVariants}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-3"
        >
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
        </motion.section>
      </div>

      <footer className="flex flex-col gap-1 border-t border-border pt-4">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          Estimated revenue at risk (monthly)
        </span>
        <span className="font-display text-xl font-semibold text-accent tabular-nums">
          ${revLow.toLocaleString()} – ${revHigh.toLocaleString()}/mo
        </span>
        <p className="text-xs leading-relaxed text-muted">
          {report.revenue_at_risk_estimate.reasoning}
        </p>
      </footer>
    </div>
  );
}

function FallbackView({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-2 w-2 rounded-full bg-warn" />
        <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
          Synthesis unavailable
        </h2>
      </div>
      <p className="font-display text-sm leading-relaxed text-text">{message}</p>
      <p className="text-xs text-muted">
        The persona verdicts above remain valid. Try re-running the analysis to retry the
        synthesizer.
      </p>
    </div>
  );
}

export function SynthesisPanel({ phase, report, streamingText, error }: Props) {
  const reduced = useReducedMotion();
  const visible = phase === "synthesis" || phase === "done";

  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          key="synthesis"
          initial={reduced ? { opacity: 0 } : { y: 60, opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: 30, opacity: 0 }}
          transition={
            reduced
              ? { duration: 0.2 }
              : { type: "spring", stiffness: 90, damping: 18 }
          }
        >
          <Card className="gap-0 border-border bg-surface p-6">
            {report ? (
              <ReportView report={report} />
            ) : error ? (
              <FallbackView message={error} />
            ) : (
              <StreamingView text={streamingText} />
            )}
          </Card>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
