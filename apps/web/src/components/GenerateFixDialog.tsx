import { Copy, RotateCw } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import type { GeneratedFix } from "../types/synth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  result: GeneratedFix | null;
  error: string | null;
  onRetry: () => void;
  leverRecommendation: string;
  /** True when the result was loaded from cache (history) rather than freshly generated. */
  cached?: boolean;
  /** Discard cached result and re-fetch a new one. */
  onRegenerate?: () => void;
}

function CopyButton({ getText }: { getText: () => string }) {
  const onCopy = (): void => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(getText());
        toast.success("Copied to clipboard.");
      } catch {
        toast.error("Could not copy to clipboard.");
      }
    })();
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={onCopy}
      className="absolute right-3 top-3 border-border bg-surface text-text hover:bg-surface-2"
    >
      <Copy className="h-3 w-3" />
      Copy
    </Button>
  );
}

function FixCardShell({
  title,
  children,
  copyText,
}: {
  title: string;
  children: React.ReactNode;
  copyText: string;
}) {
  return (
    <Card className="relative gap-3 border-border bg-surface p-4">
      <CopyButton getText={() => copyText} />
      <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </h3>
      {children}
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-sm leading-relaxed text-text">
        Could not generate fix: {message}
      </p>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="border-border bg-surface text-text hover:bg-surface-2"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    </div>
  );
}

function ResultView({ result }: { result: GeneratedFix }) {
  const bulletsText = result.bullet_rewrites
    .map((b, i) => `${i + 1}. ${b}`)
    .join("\n");

  return (
    <div className="flex flex-col gap-4">
      <FixCardShell title="Bullet Rewrites" copyText={bulletsText}>
        <ol className="flex flex-col gap-2 pr-16 font-mono text-sm leading-relaxed text-text">
          {result.bullet_rewrites.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-muted">{i + 1}.</span>
              <span>{b}</span>
            </li>
          ))}
        </ol>
      </FixCardShell>

      <FixCardShell title="A+ Content Suggestion" copyText={result.a_plus_suggestion}>
        <p className="pr-16 font-display text-sm leading-relaxed text-text">
          {result.a_plus_suggestion}
        </p>
      </FixCardShell>

      <FixCardShell title="Image Brief" copyText={result.image_brief}>
        <p className="pr-16 font-display text-sm leading-relaxed text-muted">
          {result.image_brief}
        </p>
      </FixCardShell>
    </div>
  );
}

export function GenerateFixDialog({
  open,
  onOpenChange,
  loading,
  result,
  error,
  onRetry,
  leverRecommendation,
  cached = false,
  onRegenerate,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-surface sm:max-w-2xl">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold text-text">
              Suggested Fix for: {leverRecommendation}
            </DialogTitle>
          </DialogHeader>

          {cached && result && !loading && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs">
              <span className="font-mono text-muted">
                Loaded from saved history. No new API call was made.
              </span>
              {onRegenerate && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={onRegenerate}
                  className="text-accent hover:text-accent"
                >
                  <RotateCw className="h-3 w-3" />
                  Generate again
                </Button>
              )}
            </div>
          )}

          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={onRetry} />
          ) : result ? (
            <ResultView result={result} />
          ) : null}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
