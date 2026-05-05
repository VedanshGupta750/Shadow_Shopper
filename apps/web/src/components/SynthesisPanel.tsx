import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import type {
  ProductMeta,
  Severity,
  SynthesisReport,
  SsePhase,
} from "../types/sse";
import type { GeneratedFix } from "../types/synth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { GenerateFixDialog } from "./GenerateFixDialog";
import { API_BASE_URL } from "../lib/api";
import { cn } from "@/lib/utils";

interface FixModalState {
  open: boolean;
  leverIndex: number | null;
  loading: boolean;
  result: GeneratedFix | null;
  error: string | null;
  cached: boolean;
}

const INITIAL_FIX_MODAL: FixModalState = {
  open: false,
  leverIndex: null,
  loading: false,
  result: null,
  error: null,
  cached: false,
};

interface Props {
  phase: "idle" | SsePhase;
  report: SynthesisReport | null;
  streamingText: string;
  error: string | null;
  productMeta?: ProductMeta | null;
  /** Cached generated fixes for this analysis, keyed by lever index. */
  fixCache?: Record<number, GeneratedFix>;
  /** Called after a successful generate-fix fetch so the parent can persist the result. */
  onFixGenerated?: (leverIndex: number, fix: GeneratedFix) => void;
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

function ReportView({
  report,
  onGenerateFix,
  fixCache,
}: {
  report: SynthesisReport;
  onGenerateFix: (leverIndex: number) => void;
  fixCache: Record<number, GeneratedFix> | undefined;
}) {
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
              <li key={i} className="flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-sm font-medium text-text">
                    {l.recommendation}
                  </span>
                  <ImpactPill impact={l.expected_impact} />
                </div>
                <p className="text-xs leading-relaxed text-muted">{l.reasoning}</p>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onGenerateFix(i)}
                    className="border-accent/40 bg-surface text-accent hover:bg-accent/10 hover:text-accent"
                  >
                    {fixCache?.[i] ? "View saved copy" : "Generate copy"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
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

export function SynthesisPanel({
  phase,
  report,
  streamingText,
  error,
  productMeta,
  fixCache,
  onFixGenerated,
}: Props) {
  const reduced = useReducedMotion();
  const visible = phase === "synthesis" || phase === "done";

  const [fixModal, setFixModal] = useState<FixModalState>(INITIAL_FIX_MODAL);

  const runGenerateFix = useCallback(
    async (leverIndex: number, currentReport: SynthesisReport) => {
      const lever = currentReport.top_conversion_levers[leverIndex];
      if (!lever) return;

      const personaSignals = currentReport.top_friction_points
        .map((f) => f.evidence)
        .slice(0, 5);

      try {
        const response = await fetch(`${API_BASE_URL}/api/generate-fix`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lever: {
              recommendation: lever.recommendation,
              reasoning: lever.reasoning,
            },
            productContext: {
              title: productMeta?.name ?? "",
              brand: productMeta?.brand ?? "",
              currentBullets: productMeta?.bullets ?? [],
            },
            personaSignals,
          }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          let message = text || `HTTP ${response.status}`;
          try {
            const parsed = JSON.parse(text) as { error?: { message?: string } };
            if (parsed.error?.message) message = parsed.error.message;
          } catch {
            // fall back to raw text
          }
          setFixModal((prev) => ({
            ...prev,
            loading: false,
            error: message.slice(0, 200),
          }));
          return;
        }

        const json = (await response.json()) as GeneratedFix;
        setFixModal((prev) => ({
          ...prev,
          loading: false,
          result: json,
          cached: false,
        }));
        onFixGenerated?.(leverIndex, json);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setFixModal((prev) => ({ ...prev, loading: false, error: message }));
      }
    },
    [productMeta, onFixGenerated],
  );

  const handleGenerateFix = useCallback(
    (leverIndex: number) => {
      if (!report) return;
      const cachedFix = fixCache?.[leverIndex];
      if (cachedFix) {
        setFixModal({
          open: true,
          leverIndex,
          loading: false,
          result: cachedFix,
          error: null,
          cached: true,
        });
        return;
      }
      setFixModal({
        open: true,
        leverIndex,
        loading: true,
        result: null,
        error: null,
        cached: false,
      });
      void runGenerateFix(leverIndex, report);
    },
    [report, fixCache, runGenerateFix],
  );

  const handleRetry = useCallback(() => {
    if (!report || fixModal.leverIndex === null) return;
    setFixModal((prev) => ({
      ...prev,
      loading: true,
      result: null,
      error: null,
      cached: false,
    }));
    void runGenerateFix(fixModal.leverIndex, report);
  }, [report, fixModal.leverIndex, runGenerateFix]);

  const handleRegenerate = useCallback(() => {
    if (!report || fixModal.leverIndex === null) return;
    setFixModal((prev) => ({
      ...prev,
      loading: true,
      result: null,
      error: null,
      cached: false,
    }));
    void runGenerateFix(fixModal.leverIndex, report);
  }, [report, fixModal.leverIndex, runGenerateFix]);

  const handleOpenChange = useCallback((open: boolean) => {
    setFixModal((prev) =>
      open ? { ...prev, open: true } : { ...INITIAL_FIX_MODAL },
    );
  }, []);

  const activeLeverRecommendation =
    fixModal.leverIndex !== null && report
      ? (report.top_conversion_levers[fixModal.leverIndex]?.recommendation ?? "")
      : "";

  return (
    <>
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
                <ReportView
                  report={report}
                  onGenerateFix={handleGenerateFix}
                  fixCache={fixCache}
                />
              ) : error ? (
                <FallbackView message={error} />
              ) : (
                <StreamingView text={streamingText} />
              )}
            </Card>
          </motion.section>
        )}
      </AnimatePresence>

      <GenerateFixDialog
        open={fixModal.open}
        onOpenChange={handleOpenChange}
        loading={fixModal.loading}
        result={fixModal.result}
        error={fixModal.error}
        onRetry={handleRetry}
        leverRecommendation={activeLeverRecommendation}
        cached={fixModal.cached}
        onRegenerate={handleRegenerate}
      />
    </>
  );
}
