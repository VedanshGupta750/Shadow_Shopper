import { Check, X, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getAvatarUrl, type PersonaMetadata } from "../lib/personaMetadata";
import type { PersonaState, PersonaStatus } from "../hooks/usePersonaStream";
import type { PersonaVerdict } from "../types/sse";

interface Props {
  persona: PersonaMetadata;
  state: PersonaState;
}

const STATUS_DOT: Record<PersonaStatus, string> = {
  pending: "bg-muted",
  streaming: "bg-warn",
  done: "bg-accent",
  error: "bg-danger",
};

interface VerdictStyle {
  pillBg: string;
  pillText: string;
  pillBorder: string;
  progressBar: string;
  icon: typeof Check;
  label: string;
}

const VERDICT_STYLE: Record<PersonaVerdict["verdict"], VerdictStyle> = {
  "would-buy": {
    pillBg: "bg-accent/15",
    pillText: "text-accent",
    pillBorder: "border-accent/40",
    progressBar: "bg-accent",
    icon: Check,
    label: "would buy",
  },
  "would-not-buy": {
    pillBg: "bg-danger/15",
    pillText: "text-danger",
    pillBorder: "border-danger/40",
    progressBar: "bg-danger",
    icon: X,
    label: "would not buy",
  },
  "would-buy-competitor": {
    pillBg: "bg-warn/15",
    pillText: "text-warn",
    pillBorder: "border-warn/40",
    progressBar: "bg-warn",
    icon: ArrowRight,
    label: "buy competitor",
  },
};

function VerdictPill({ verdict }: { verdict: PersonaVerdict["verdict"] }) {
  const s = VERDICT_STYLE[verdict];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        s.pillBg,
        s.pillText,
        s.pillBorder,
      )}
    >
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

export function PersonaCard({ persona, state }: Props) {
  const avatar = getAvatarUrl(persona.name, persona.age);
  const titleId = `persona-${persona.id}-title`;
  const verdict = state.verdict;
  const verdictStyle = verdict ? VERDICT_STYLE[verdict.verdict] : null;
  const confidence = verdict?.confidence ?? 0;
  const frictionPreview = verdict?.friction_points.slice(0, 2) ?? [];
  const isStreaming = state.status === "streaming";
  const isError = state.status === "error";

  return (
    <article
      role="article"
      aria-labelledby={titleId}
      className={cn(
        "flex min-h-[280px] flex-col rounded-xl border border-border bg-surface p-4",
      )}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATUS_DOT[state.status])}
        />
        <img
          src={avatar}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full bg-surface-2"
        />
        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
          <div
            id={titleId}
            className="font-display font-medium text-sm text-text leading-tight whitespace-nowrap"
          >
            {persona.name}, {persona.age}
          </div>
          <div className="text-xs text-muted truncate">{persona.city}</div>
          <Badge
            variant="secondary"
            title={persona.role}
            className="mt-1 max-w-full !justify-start truncate font-mono text-[10px]"
          >
            {persona.role}
          </Badge>
        </div>
      </header>

      <Separator className="mt-3" />

      <ScrollArea className="my-3 flex-1">
        {isError ? (
          <p className="font-mono text-xs leading-relaxed text-danger">
            error: {state.error ?? "unknown"}
          </p>
        ) : verdict ? (
          <p className="font-display text-xs leading-relaxed text-text">
            "{verdict.headline_quote}"
          </p>
        ) : state.tokens.length > 0 ? (
          <p className="font-mono text-xs leading-relaxed text-text">
            {state.tokens}
            {isStreaming && (
              <span aria-hidden className="animate-pulse text-accent">
                ▎
              </span>
            )}
          </p>
        ) : (
          <p className="font-mono text-xs text-muted">waiting…</p>
        )}
      </ScrollArea>

      <footer className="flex flex-col gap-2">
        {verdict ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <VerdictPill verdict={verdict.verdict} />
              <span className="font-mono text-[10px] text-muted">
                {confidence}% confidence
              </span>
            </div>
            <Progress
              value={confidence}
              className="h-1 bg-surface-2"
              aria-label={`${confidence}% confidence`}
              {...(verdictStyle
                ? {
                    style: {
                      // Tailwind class on indicator (set via descendant in shadcn) — override via inline.
                    },
                  }
                : {})}
            />
            <style>{`article[aria-labelledby="${titleId}"] [data-slot="progress-indicator"] { background-color: var(--color-${verdictStyle === VERDICT_STYLE["would-buy"] ? "accent" : verdictStyle === VERDICT_STYLE["would-not-buy"] ? "danger" : "warn"}); }`}</style>
            {frictionPreview.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {frictionPreview.map((f, i) => (
                  <li key={i} className="text-xs text-muted leading-snug">
                    <span aria-hidden className="mr-1">•</span>
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                {state.status}
              </span>
              {isStreaming && (
                <span className="font-mono text-[10px] text-muted">streaming…</span>
              )}
            </div>
            <Progress
              value={isStreaming ? 30 : 0}
              className="h-1 bg-surface-2"
              aria-label="awaiting verdict"
            />
          </>
        )}
      </footer>
    </article>
  );
}
