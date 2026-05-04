import { useEffect, useState } from "react";
import { Check, X, ArrowRight } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
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
  icon: typeof Check;
  label: string;
  cssVarColor: string;
}

const VERDICT_STYLE: Record<PersonaVerdict["verdict"], VerdictStyle> = {
  "would-buy": {
    pillBg: "bg-accent/15",
    pillText: "text-accent",
    pillBorder: "border-accent/40",
    icon: Check,
    label: "would buy",
    cssVarColor: "var(--color-accent)",
  },
  "would-not-buy": {
    pillBg: "bg-danger/15",
    pillText: "text-danger",
    pillBorder: "border-danger/40",
    icon: X,
    label: "would not buy",
    cssVarColor: "var(--color-danger)",
  },
  "would-buy-competitor": {
    pillBg: "bg-warn/15",
    pillText: "text-warn",
    pillBorder: "border-warn/40",
    icon: ArrowRight,
    label: "buy competitor",
    cssVarColor: "var(--color-warn)",
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

const FRICTION_LIST_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const FRICTION_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, x: -4 },
  show: { opacity: 1, x: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

const REDUCED_FRICTION_LIST_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0 } },
};

const REDUCED_FRICTION_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
};

export function PersonaCard({ persona, state }: Props) {
  const reduced = useReducedMotion();
  const avatar = getAvatarUrl(persona.name, persona.age);
  const titleId = `persona-${persona.id}-title`;
  const verdict = state.verdict;
  const verdictStyle = verdict ? VERDICT_STYLE[verdict.verdict] : null;
  const confidence = verdict?.confidence ?? 0;
  const frictionPreview = verdict?.friction_points.slice(0, 2) ?? [];
  const isStreaming = state.status === "streaming";
  const isError = state.status === "error";

  // Animated confidence (0 → confidence over 600ms)
  const [animatedConf, setAnimatedConf] = useState(0);
  useEffect(() => {
    if (!verdict) {
      setAnimatedConf(0);
      return;
    }
    if (reduced) {
      setAnimatedConf(confidence);
      return;
    }
    const controls = animate(0, confidence, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setAnimatedConf(v),
    });
    return () => controls.stop();
  }, [confidence, verdict, reduced]);

  // Card variants: full vs reduced
  const cardVariants: Variants = reduced
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: 0.2 } },
        streaming: { opacity: 1 },
      }
    : {
        hidden: {
          opacity: 0,
          y: 8,
          scale: 1,
          boxShadow: "0 0 0px -20px transparent",
        },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          boxShadow: "0 0 0px -20px transparent",
          transition: { duration: 0.4, ease: "easeOut" },
        },
        streaming: {
          opacity: [0.92, 1, 0.92],
          y: 0,
          scale: [1, 1.012, 1],
          boxShadow: "0 0 60px -20px var(--color-accent)",
          transition: {
            duration: 3.2,
            repeat: Infinity,
            ease: "easeInOut",
            boxShadow: { duration: 0.5, repeat: 0 },
          },
        },
      };

  const animateState = isStreaming ? "streaming" : "show";

  const frictionListVariants = reduced
    ? REDUCED_FRICTION_LIST_VARIANTS
    : FRICTION_LIST_VARIANTS;
  const frictionItemVariants = reduced
    ? REDUCED_FRICTION_ITEM_VARIANTS
    : FRICTION_ITEM_VARIANTS;

  return (
    <motion.article
      role="article"
      aria-labelledby={titleId}
      variants={cardVariants}
      animate={animateState}
      {...(isStreaming ? { style: { willChange: "transform" as const } } : {})}
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
        <AnimatePresence mode="wait">
          {state.status === "done" && verdict ? (
            <motion.div
              key="done"
              initial={reduced ? { opacity: 0 } : { scale: 0.6, rotate: -12, opacity: 0 }}
              animate={reduced ? { opacity: 1 } : { scale: 1, rotate: 0, opacity: 1 }}
              transition={
                reduced
                  ? { duration: 0.2 }
                  : { type: "spring", stiffness: 500, damping: 22 }
              }
              className="flex items-center justify-between gap-2"
            >
              <VerdictPill verdict={verdict.verdict} />
              <span className="font-mono text-[10px] text-muted">
                {confidence}% confidence
              </span>
            </motion.div>
          ) : (
            <div
              key="pending"
              className="flex items-center justify-between gap-2"
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                {state.status}
              </span>
              {isStreaming && (
                <span className="font-mono text-[10px] text-muted">streaming…</span>
              )}
            </div>
          )}
        </AnimatePresence>

        <Progress
          value={verdict ? animatedConf : isStreaming ? 30 : 0}
          className="h-1 bg-surface-2"
          aria-label={verdict ? `${confidence}% confidence` : "awaiting verdict"}
        />
        {verdictStyle && (
          <style>{`article[aria-labelledby="${titleId}"] [data-slot="progress-indicator"] { background-color: ${verdictStyle.cssVarColor}; }`}</style>
        )}

        {verdict && frictionPreview.length > 0 && (
          <motion.ul
            variants={frictionListVariants}
            initial="hidden"
            animate="show"
            className="mt-1 space-y-0.5"
          >
            {frictionPreview.map((f, i) => (
              <motion.li
                key={i}
                variants={frictionItemVariants}
                className="text-xs text-muted leading-snug"
              >
                <span aria-hidden className="mr-1">•</span>
                {f}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </footer>
    </motion.article>
  );
}
