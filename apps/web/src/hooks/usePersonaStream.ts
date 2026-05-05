import { useCallback, useReducer, useRef } from "react";
import { toast } from "sonner";
import { API_BASE_URL } from "../lib/api";
import { PERSONA_METADATA } from "../lib/personaMetadata";
import {
  attachCustomSurfacing,
  attachFix,
  newAnalysisId,
  saveAnalysis,
  type HistoryEntry,
  type PersonaSnapshot,
} from "../lib/history";
import type { GeneratedFix } from "../types/synth";
import type {
  AiSurface,
  PersonaVerdict,
  ProductMeta,
  SseEvent,
  SsePhase,
  SurfaceResult,
  SynthesisReport,
} from "../types/sse";

export type PersonaStatus = "pending" | "streaming" | "done" | "error";

export interface PersonaState {
  tokens: string;
  status: PersonaStatus;
  verdict?: PersonaVerdict | undefined;
  error?: string | undefined;
}

export type SurfacingStatus = "pending" | "running" | "done";

export interface SurfacingState {
  questions: string[];
  cells: SurfaceResult[];
  /** Cells currently in flight (started, no result yet). */
  pendingCells: { question: string; surface: AiSurface }[];
  status: SurfacingStatus;
  /** User-submitted custom questions (in submission order). */
  customQuestions: string[];
  /** Results for custom questions: 2 SurfaceResult entries per question (rufus + chatgpt). */
  customCells: SurfaceResult[];
  /** Custom questions currently in flight. */
  customPending: string[];
}

export interface SynthesisStateSlice {
  tokens: string;
  report: SynthesisReport | null;
  /** Set when synthesis fails non-fatally — UI shows inline fallback below personas. */
  error: string | null;
}

export interface StreamState {
  /** Stable id for the current run / loaded history entry. Null when idle. */
  analysisId: string | null;
  /** Product URL the current analysis is bound to (used for history storage). */
  productUrl: string | null;
  /** Product metadata captured from the SSE product-meta event. Null until scrape completes. */
  productMeta: ProductMeta | null;
  /** Generated-Fix outputs cached for the current analysis, keyed by lever index. */
  fixes: Record<number, GeneratedFix>;
  /** True when the state was hydrated from a saved history entry, rather than a live run. */
  loadedFromHistory: boolean;
  phase: "idle" | SsePhase;
  scrapeStage: { stage: string; message: string } | null;
  surfacing: SurfacingState;
  personas: Record<string, PersonaState>;
  synthesis: SynthesisStateSlice;
  totalMs: number;
  totalCostUsd: number;
  error: string | null;
  isStreaming: boolean;
  cancelled: boolean;
}

type Action =
  | { type: "RESET" }
  | { type: "START"; analysisId: string; productUrl: string }
  | { type: "CANCEL" }
  | { type: "LOCAL_ERROR"; message: string }
  | { type: "PHASE"; phase: SsePhase }
  | { type: "SCRAPE_PROGRESS"; stage: string; message: string }
  | { type: "PRODUCT_META"; meta: ProductMeta }
  | { type: "SURFACING_QUESTIONS"; questions: string[] }
  | { type: "SURFACING_CELL_START"; question: string; surface: AiSurface }
  | { type: "SURFACING_CELL_RESULT"; result: SurfaceResult }
  | { type: "SURFACING_COMPLETE"; results: SurfaceResult[] }
  | { type: "PERSONA_TOKEN"; personaId: string; token: string }
  | { type: "PERSONA_COMPLETE"; personaId: string; verdict: PersonaVerdict }
  | { type: "PERSONA_ERROR"; personaId: string; message: string }
  | { type: "SYNTHESIS_TOKEN"; token: string }
  | { type: "SYNTHESIS_COMPLETE"; report: SynthesisReport }
  | { type: "SYNTHESIS_ERROR"; message: string }
  | { type: "DONE"; totalMs: number; totalCostUsd: number }
  | { type: "STREAM_ERROR"; message: string; code: string }
  | { type: "LOAD_HISTORY"; entry: HistoryEntry }
  | { type: "ATTACH_FIX"; leverIndex: number; fix: GeneratedFix }
  | { type: "CUSTOM_SURFACING_START"; question: string }
  | { type: "CUSTOM_SURFACING_RESULT"; question: string; results: SurfaceResult[] }
  | { type: "CUSTOM_SURFACING_ERROR"; question: string; message: string };

function freshPersonas(): Record<string, PersonaState> {
  const out: Record<string, PersonaState> = {};
  for (const meta of PERSONA_METADATA) {
    out[meta.id] = { tokens: "", status: "pending" };
  }
  return out;
}

function freshSurfacing(): SurfacingState {
  return {
    questions: [],
    cells: [],
    pendingCells: [],
    status: "pending",
    customQuestions: [],
    customCells: [],
    customPending: [],
  };
}

function freshSynthesis(): SynthesisStateSlice {
  return { tokens: "", report: null, error: null };
}

const initialState: StreamState = {
  analysisId: null,
  productUrl: null,
  productMeta: null,
  fixes: {},
  loadedFromHistory: false,
  phase: "idle",
  scrapeStage: null,
  surfacing: freshSurfacing(),
  personas: freshPersonas(),
  synthesis: freshSynthesis(),
  totalMs: 0,
  totalCostUsd: 0,
  error: null,
  isStreaming: false,
  cancelled: false,
};

function updatePersona(
  state: StreamState,
  personaId: string,
  patch: Partial<PersonaState>,
): StreamState {
  const current = state.personas[personaId] ?? { tokens: "", status: "pending" as PersonaStatus };
  return {
    ...state,
    personas: {
      ...state.personas,
      [personaId]: { ...current, ...patch },
    },
  };
}

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.type) {
    case "RESET":
      return {
        ...initialState,
        personas: freshPersonas(),
        surfacing: freshSurfacing(),
        synthesis: freshSynthesis(),
        fixes: {},
      };

    case "START":
      return {
        ...initialState,
        analysisId: action.analysisId,
        productUrl: action.productUrl,
        productMeta: null,
        fixes: {},
        loadedFromHistory: false,
        personas: freshPersonas(),
        surfacing: freshSurfacing(),
        synthesis: freshSynthesis(),
        isStreaming: true,
      };

    case "PRODUCT_META":
      return { ...state, productMeta: action.meta };

    case "LOAD_HISTORY": {
      const e = action.entry;
      const personas: Record<string, PersonaState> = {};
      for (const meta of PERSONA_METADATA) {
        const snap = e.personas[meta.id];
        if (snap?.status === "done" && snap.verdict) {
          personas[meta.id] = {
            tokens: snap.verdict.inner_monologue,
            status: "done",
            verdict: snap.verdict,
          };
        } else if (snap?.status === "error") {
          personas[meta.id] = {
            tokens: "",
            status: "error",
            error: snap.error ?? "error",
          };
        } else {
          personas[meta.id] = { tokens: "", status: "pending" };
        }
      }
      return {
        ...initialState,
        analysisId: e.id,
        productUrl: e.productUrl,
        productMeta: e.productMeta,
        fixes: { ...e.fixes },
        loadedFromHistory: true,
        phase: "done",
        scrapeStage: null,
        surfacing: {
          questions: e.surfacing.questions,
          cells: e.surfacing.cells,
          pendingCells: [],
          status: "done",
          customQuestions: Array.from(
            new Set((e.customSurfacing ?? []).map((c) => c.question)),
          ),
          customCells: e.customSurfacing ?? [],
          customPending: [],
        },
        personas,
        synthesis: {
          tokens: "",
          report: e.synthesis,
          error: e.synthesisError,
        },
        totalMs: e.totalMs,
        totalCostUsd: e.totalCostUsd,
        isStreaming: false,
      };
    }

    case "ATTACH_FIX":
      return {
        ...state,
        fixes: { ...state.fixes, [action.leverIndex]: action.fix },
      };

    case "CANCEL": {
      const personas = { ...state.personas };
      for (const id of Object.keys(personas)) {
        const p = personas[id];
        if (p && p.status === "streaming") {
          personas[id] = { ...p, status: "error", error: "cancelled" };
        }
      }
      return {
        ...state,
        personas,
        surfacing: { ...state.surfacing, pendingCells: [] },
        isStreaming: false,
        cancelled: true,
      };
    }

    case "LOCAL_ERROR":
      return { ...state, error: action.message, isStreaming: false };

    case "PHASE":
      return {
        ...state,
        phase: action.phase,
        surfacing: {
          ...state.surfacing,
          status:
            action.phase === "surfacing"
              ? "running"
              : state.surfacing.status === "running"
                ? "done"
                : state.surfacing.status,
        },
      };

    case "SCRAPE_PROGRESS":
      return { ...state, scrapeStage: { stage: action.stage, message: action.message } };

    case "SURFACING_QUESTIONS":
      return {
        ...state,
        surfacing: {
          ...state.surfacing,
          questions: action.questions,
          status: "running",
        },
      };

    case "SURFACING_CELL_START":
      return {
        ...state,
        surfacing: {
          ...state.surfacing,
          pendingCells: [
            ...state.surfacing.pendingCells,
            { question: action.question, surface: action.surface },
          ],
        },
      };

    case "SURFACING_CELL_RESULT":
      return {
        ...state,
        surfacing: {
          ...state.surfacing,
          cells: [...state.surfacing.cells, action.result],
          pendingCells: state.surfacing.pendingCells.filter(
            (p) => !(p.question === action.result.question && p.surface === action.result.surface),
          ),
        },
      };

    case "SURFACING_COMPLETE":
      return {
        ...state,
        surfacing: {
          ...state.surfacing,
          cells: action.results,
          pendingCells: [],
          status: "done",
        },
      };

    case "PERSONA_TOKEN": {
      const current = state.personas[action.personaId] ?? { tokens: "", status: "pending" as PersonaStatus };
      return updatePersona(state, action.personaId, {
        tokens: current.tokens + action.token,
        status: "streaming",
      });
    }

    case "PERSONA_COMPLETE":
      return updatePersona(state, action.personaId, {
        status: "done",
        verdict: action.verdict,
      });

    case "PERSONA_ERROR":
      return updatePersona(state, action.personaId, {
        status: "error",
        error: action.message,
      });

    case "SYNTHESIS_TOKEN":
      return {
        ...state,
        synthesis: { ...state.synthesis, tokens: state.synthesis.tokens + action.token },
      };

    case "SYNTHESIS_COMPLETE":
      return {
        ...state,
        synthesis: { ...state.synthesis, report: action.report, error: null },
      };

    case "SYNTHESIS_ERROR":
      return {
        ...state,
        synthesis: { ...state.synthesis, error: action.message },
      };

    case "DONE":
      return {
        ...state,
        phase: "done",
        totalMs: action.totalMs,
        totalCostUsd: action.totalCostUsd,
        isStreaming: false,
      };

    case "STREAM_ERROR":
      return {
        ...state,
        error: action.message,
        isStreaming: false,
      };

    case "CUSTOM_SURFACING_START": {
      const q = action.question;
      const alreadyTracked = state.surfacing.customQuestions.includes(q);
      return {
        ...state,
        surfacing: {
          ...state.surfacing,
          customQuestions: alreadyTracked
            ? state.surfacing.customQuestions
            : [...state.surfacing.customQuestions, q],
          // Drop any prior cells for this question so a re-run replaces them cleanly.
          customCells: state.surfacing.customCells.filter((c) => c.question !== q),
          customPending: state.surfacing.customPending.includes(q)
            ? state.surfacing.customPending
            : [...state.surfacing.customPending, q],
        },
      };
    }

    case "CUSTOM_SURFACING_RESULT":
      return {
        ...state,
        surfacing: {
          ...state.surfacing,
          customCells: [
            ...state.surfacing.customCells.filter((c) => c.question !== action.question),
            ...action.results,
          ],
          customPending: state.surfacing.customPending.filter((q) => q !== action.question),
        },
      };

    case "CUSTOM_SURFACING_ERROR":
      return {
        ...state,
        surfacing: {
          ...state.surfacing,
          customPending: state.surfacing.customPending.filter((q) => q !== action.question),
        },
      };

    default:
      return state;
  }
}

/** Codes that indicate a non-fatal synthesis fallback rather than a stream-killing error. */
const SYNTH_FALLBACK_CODES = new Set(["SYNTHESIS_FAILED", "NO_VERDICTS"]);

function sseEventToAction(evt: SseEvent): Action | null {
  switch (evt.event) {
    case "phase":
      return { type: "PHASE", phase: evt.data.phase };
    case "scrape-progress":
      return { type: "SCRAPE_PROGRESS", stage: evt.data.stage, message: evt.data.message };
    case "product-meta":
      return { type: "PRODUCT_META", meta: evt.data };
    case "surfacing-questions":
      return { type: "SURFACING_QUESTIONS", questions: evt.data.questions };
    case "surfacing-cell-start":
      return {
        type: "SURFACING_CELL_START",
        question: evt.data.question,
        surface: evt.data.surface,
      };
    case "surfacing-cell-result":
      return { type: "SURFACING_CELL_RESULT", result: evt.data };
    case "surfacing-complete":
      return { type: "SURFACING_COMPLETE", results: evt.data.results };
    case "persona-token":
      return { type: "PERSONA_TOKEN", personaId: evt.data.personaId, token: evt.data.token };
    case "persona-complete":
      return { type: "PERSONA_COMPLETE", personaId: evt.data.personaId, verdict: evt.data.verdict };
    case "persona-error":
      return { type: "PERSONA_ERROR", personaId: evt.data.personaId, message: evt.data.message };
    case "synthesis-token":
      return { type: "SYNTHESIS_TOKEN", token: evt.data.token };
    case "synthesis-complete":
      return { type: "SYNTHESIS_COMPLETE", report: evt.data.report };
    case "done":
      return { type: "DONE", totalMs: evt.data.totalMs, totalCostUsd: evt.data.totalCostUsd };
    case "error":
      if (SYNTH_FALLBACK_CODES.has(evt.data.code)) {
        return { type: "SYNTHESIS_ERROR", message: evt.data.message };
      }
      return { type: "STREAM_ERROR", message: evt.data.message, code: evt.data.code };
    default:
      return null;
  }
}

function parseSseBlock(block: string): SseEvent | null {
  if (!block || block.startsWith(":")) return null;
  const lines = block.split("\n");
  let eventName = "";
  const dataParts: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event: ")) eventName = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataParts.push(line.slice(6));
  }
  if (!eventName || dataParts.length === 0) return null;
  try {
    const data = JSON.parse(dataParts.join("\n")) as unknown;
    return { event: eventName, data } as SseEvent;
  } catch {
    return null;
  }
}

export interface UsePersonaStreamReturn {
  state: StreamState;
  start: (productUrl: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  loadFromHistory: (entry: HistoryEntry) => void;
  saveFix: (leverIndex: number, fix: GeneratedFix) => void;
  runCustomQuestion: (question: string) => Promise<void>;
}

function snapshotPersonas(
  personas: Record<string, PersonaState>,
): Record<string, PersonaSnapshot> {
  const out: Record<string, PersonaSnapshot> = {};
  for (const [id, p] of Object.entries(personas)) {
    if (p.status === "done") {
      out[id] = { status: "done", verdict: p.verdict };
    } else if (p.status === "error") {
      out[id] = { status: "error", error: p.error };
    }
    // skip pending/streaming — only persist terminal states
  }
  return out;
}

function persistFromState(state: StreamState, totalMs: number, totalCostUsd: number): void {
  if (!state.analysisId || !state.productUrl || !state.productMeta) return;
  if (!state.synthesis.report) return; // only persist when the synthesis report exists
  const entry: HistoryEntry = {
    id: state.analysisId,
    asin: state.productMeta.asin,
    productUrl: state.productUrl,
    productMeta: state.productMeta,
    createdAt: Date.now(),
    totalMs,
    totalCostUsd,
    surfacing: {
      questions: state.surfacing.questions,
      cells: state.surfacing.cells,
    },
    personas: snapshotPersonas(state.personas),
    synthesis: state.synthesis.report,
    synthesisError: state.synthesis.error,
    fixes: state.fixes,
    customSurfacing: state.surfacing.customCells,
  };
  saveAnalysis(entry);
}

export function usePersonaStream(): UsePersonaStreamReturn {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  // Live mirror of state so the SSE event handler can persist using the latest snapshot
  // without recreating callbacks on every re-render.
  const stateRef = useRef<StreamState>(state);
  stateRef.current = state;

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    dispatch({ type: "CANCEL" });
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    dispatch({ type: "RESET" });
  }, []);

  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    dispatch({ type: "LOAD_HISTORY", entry });
  }, []);

  const saveFix = useCallback((leverIndex: number, fix: GeneratedFix) => {
    const id = stateRef.current.analysisId;
    dispatch({ type: "ATTACH_FIX", leverIndex, fix });
    if (id) attachFix(id, leverIndex, fix);
  }, []);

  const runCustomQuestion = useCallback(async (question: string): Promise<void> => {
    const trimmed = question.trim();
    if (trimmed.length < 5) {
      toast.error("Question must be at least 5 characters.");
      return;
    }
    if (trimmed.length > 300) {
      toast.error("Question must be 300 characters or fewer.");
      return;
    }
    const productUrl = stateRef.current.productUrl;
    if (!productUrl) {
      toast.error("No product loaded. Run an analysis first.");
      return;
    }

    dispatch({ type: "CUSTOM_SURFACING_START", question: trimmed });

    try {
      const response = await fetch(`${API_BASE_URL}/api/surface-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productUrl, question: trimmed }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let message = text || `HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          if (parsed.error?.message) message = parsed.error.message;
        } catch {
          // raw text fallback
        }
        toast.error(`Custom question failed: ${message.slice(0, 200)}`);
        dispatch({
          type: "CUSTOM_SURFACING_ERROR",
          question: trimmed,
          message: message.slice(0, 200),
        });
        return;
      }

      const json = (await response.json()) as { results: SurfaceResult[] };
      const results = json.results ?? [];
      dispatch({
        type: "CUSTOM_SURFACING_RESULT",
        question: trimmed,
        results,
      });

      const id = stateRef.current.analysisId;
      if (id) attachCustomSurfacing(id, results);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Custom question failed: ${message.slice(0, 200)}`);
      dispatch({
        type: "CUSTOM_SURFACING_ERROR",
        question: trimmed,
        message,
      });
    }
  }, []);

  const start = useCallback(async (productUrl: string): Promise<void> => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const analysisId = newAnalysisId();
    dispatch({ type: "START", analysisId, productUrl });

    try {
      const response = await fetch(`${API_BASE_URL}/api/stream-personas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productUrl }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let message = text || `HTTP ${response.status}`;
        // Server returns JSON error bodies via errorHandler middleware. Extract the
        // human-readable message instead of dumping the raw JSON in the status line.
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          if (parsed.error?.message) message = parsed.error.message;
        } catch {
          // Not JSON — fall back to raw text.
        }
        const clean = message.replace(/\s+/g, " ").trim().slice(0, 200);
        toast.error(`Backend error: ${clean}`);
        dispatch({ type: "STREAM_ERROR", message: clean, code: `HTTP_${response.status}` });
        return;
      }

      if (!response.body) {
        const message = "Response body is null";
        toast.error(`Backend error: ${message}`);
        dispatch({ type: "LOCAL_ERROR", message });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const evt = parseSseBlock(block);
          if (!evt) continue;

          // Side effects (toasts) happen here, before the reducer dispatch.
          if (evt.event === "done") {
            toast.success(
              `Analysis complete. Total cost: $${evt.data.totalCostUsd.toFixed(4)}`,
            );
          } else if (evt.event === "error") {
            // Only toast hard errors. Synthesis fallback is shown inline.
            if (!SYNTH_FALLBACK_CODES.has(evt.data.code)) {
              toast.error(`Backend error: ${evt.data.message.slice(0, 200)}`);
            }
          }

          const action = sseEventToAction(evt);
          if (action) dispatch(action);

          // Persist to history at two points:
          //  1) synthesis-complete — the report is rendered and the user can interact.
          //     Saving here means generating fixes works even if the stream cuts off before `done`.
          //  2) done — overwrite with final timing/cost data.
          // We use stateRef + a microtask so the dispatch above has applied first.
          if (evt.event === "synthesis-complete") {
            queueMicrotask(() => persistFromState(stateRef.current, 0, 0));
          } else if (evt.event === "done") {
            const { totalMs, totalCostUsd } = evt.data;
            queueMicrotask(() =>
              persistFromState(stateRef.current, totalMs, totalCostUsd),
            );
          }
        }
      }
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      if (!isAbort) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error("Lost connection. Click Run to retry.");
        dispatch({ type: "LOCAL_ERROR", message });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  return {
    state,
    start,
    cancel,
    reset,
    loadFromHistory,
    saveFix,
    runCustomQuestion,
  };
}
