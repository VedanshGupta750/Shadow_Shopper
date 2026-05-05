import type {
  PersonaVerdict,
  ProductMeta,
  SurfaceResult,
  SynthesisReport,
} from "../types/sse";
import type { GeneratedFix } from "../types/synth";

const STORAGE_KEY = "shadow-shopper:history:v1";
const MAX_ENTRIES = 20;

export interface PersonaSnapshot {
  status: "done" | "error";
  verdict?: PersonaVerdict | undefined;
  error?: string | undefined;
}

export interface HistoryEntry {
  id: string;
  asin: string;
  productUrl: string;
  productMeta: ProductMeta;
  createdAt: number;
  totalMs: number;
  totalCostUsd: number;
  surfacing: { questions: string[]; cells: SurfaceResult[] };
  personas: Record<string, PersonaSnapshot>;
  synthesis: SynthesisReport | null;
  synthesisError: string | null;
  /** Generated-fix outputs keyed by lever index, keyed within this analysis only. */
  fixes: Record<number, GeneratedFix>;
  /** User-submitted custom surfacing questions and their Rufus + ChatGPT results. */
  customSurfacing: SurfaceResult[];
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["asin"] === "string" &&
    typeof v["createdAt"] === "number" &&
    typeof v["productMeta"] === "object" &&
    v["productMeta"] !== null
  );
}

function readAll(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry);
  } catch {
    return [];
  }
}

function writeAll(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage full or disabled — silently no-op.
  }
}

/** Most-recent first, capped at MAX_ENTRIES. */
export function listAnalyses(): HistoryEntry[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

export function getAnalysis(id: string): HistoryEntry | null {
  return readAll().find((e) => e.id === id) ?? null;
}

/** Insert or replace by id. Evicts oldest if cap exceeded. */
export function saveAnalysis(entry: HistoryEntry): void {
  const all = readAll();
  const filtered = all.filter((e) => e.id !== entry.id);
  filtered.push(entry);
  filtered.sort((a, b) => b.createdAt - a.createdAt);
  while (filtered.length > MAX_ENTRIES) filtered.pop();
  writeAll(filtered);
}

export function deleteAnalysis(id: string): void {
  const all = readAll();
  writeAll(all.filter((e) => e.id !== id));
}

export function clearAll(): void {
  writeAll([]);
}

/** Attach a generated fix to an analysis (keyed by lever index). */
export function attachFix(
  analysisId: string,
  leverIndex: number,
  fix: GeneratedFix,
): void {
  const all = readAll();
  const idx = all.findIndex((e) => e.id === analysisId);
  if (idx === -1) return;
  const entry = all[idx]!;
  const next: HistoryEntry = {
    ...entry,
    fixes: { ...entry.fixes, [leverIndex]: fix },
  };
  all[idx] = next;
  writeAll(all);
}

export function getFix(
  analysisId: string,
  leverIndex: number,
): GeneratedFix | null {
  const entry = getAnalysis(analysisId);
  return entry?.fixes[leverIndex] ?? null;
}

/** Append (or replace by question) custom surfacing results for an analysis. */
export function attachCustomSurfacing(
  analysisId: string,
  results: SurfaceResult[],
): void {
  if (results.length === 0) return;
  const all = readAll();
  const idx = all.findIndex((e) => e.id === analysisId);
  if (idx === -1) return;
  const entry = all[idx]!;
  const incomingQuestions = new Set(results.map((r) => r.question));
  const existing = (entry.customSurfacing ?? []).filter(
    (c) => !incomingQuestions.has(c.question),
  );
  all[idx] = {
    ...entry,
    customSurfacing: [...existing, ...results],
  };
  writeAll(all);
}

/** Generate a stable id for a new analysis. */
export function newAnalysisId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
