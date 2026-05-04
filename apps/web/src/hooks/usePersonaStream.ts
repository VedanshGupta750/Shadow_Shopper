import { useCallback, useReducer, useRef } from "react";
import { API_BASE_URL } from "../lib/api";
import { PERSONA_METADATA } from "../lib/personaMetadata";
import type {
  AiSurface,
  PersonaVerdict,
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
}

export interface StreamState {
  phase: "idle" | SsePhase;
  scrapeStage: { stage: string; message: string } | null;
  surfacing: SurfacingState;
  personas: Record<string, PersonaState>;
  synthesis: { tokens: string; report: SynthesisReport | null };
  totalMs: number;
  totalCostUsd: number;
  error: string | null;
  isStreaming: boolean;
}

type Action =
  | { type: "RESET" }
  | { type: "START" }
  | { type: "CANCEL" }
  | { type: "LOCAL_ERROR"; message: string }
  | { type: "PHASE"; phase: SsePhase }
  | { type: "SCRAPE_PROGRESS"; stage: string; message: string }
  | { type: "SURFACING_QUESTIONS"; questions: string[] }
  | { type: "SURFACING_CELL_START"; question: string; surface: AiSurface }
  | { type: "SURFACING_CELL_RESULT"; result: SurfaceResult }
  | { type: "SURFACING_COMPLETE"; results: SurfaceResult[] }
  | { type: "PERSONA_TOKEN"; personaId: string; token: string }
  | { type: "PERSONA_COMPLETE"; personaId: string; verdict: PersonaVerdict }
  | { type: "PERSONA_ERROR"; personaId: string; message: string }
  | { type: "SYNTHESIS_TOKEN"; token: string }
  | { type: "SYNTHESIS_COMPLETE"; report: SynthesisReport }
  | { type: "DONE"; totalMs: number; totalCostUsd: number }
  | { type: "STREAM_ERROR"; message: string; code: string };

function freshPersonas(): Record<string, PersonaState> {
  const out: Record<string, PersonaState> = {};
  for (const meta of PERSONA_METADATA) {
    out[meta.id] = { tokens: "", status: "pending" };
  }
  return out;
}

function freshSurfacing(): SurfacingState {
  return { questions: [], cells: [], pendingCells: [], status: "pending" };
}

const initialState: StreamState = {
  phase: "idle",
  scrapeStage: null,
  surfacing: freshSurfacing(),
  personas: freshPersonas(),
  synthesis: { tokens: "", report: null },
  totalMs: 0,
  totalCostUsd: 0,
  error: null,
  isStreaming: false,
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
      };

    case "START":
      return {
        ...initialState,
        personas: freshPersonas(),
        surfacing: freshSurfacing(),
        isStreaming: true,
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
      return { ...state, synthesis: { ...state.synthesis, report: action.report } };

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
        error: `${action.code}: ${action.message}`,
        isStreaming: false,
      };

    default:
      return state;
  }
}

function sseEventToAction(evt: SseEvent): Action | null {
  switch (evt.event) {
    case "phase":
      return { type: "PHASE", phase: evt.data.phase };
    case "scrape-progress":
      return { type: "SCRAPE_PROGRESS", stage: evt.data.stage, message: evt.data.message };
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
}

export function usePersonaStream(): UsePersonaStreamReturn {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

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

  const start = useCallback(async (productUrl: string): Promise<void> => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "START" });

    try {
      const response = await fetch(`${API_BASE_URL}/api/stream-personas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productUrl }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        dispatch({
          type: "STREAM_ERROR",
          message: text || `HTTP ${response.status}`,
          code: `HTTP_${response.status}`,
        });
        return;
      }

      if (!response.body) {
        dispatch({ type: "LOCAL_ERROR", message: "Response body is null" });
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
          const action = sseEventToAction(evt);
          if (action) dispatch(action);
        }
      }
    } catch (err) {
      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
      if (!isAbort) {
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: "LOCAL_ERROR", message });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  return { state, start, cancel, reset };
}
