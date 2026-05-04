/**
 * In-memory metrics counters. Exposed via the /metrics admin endpoint.
 * Resets on process restart. No persistence by design — this is for live ops, not history.
 */

const startedAt = Date.now();

let demosTotal = 0;
let totalCostUsd = 0;
let totalDurationMs = 0;
let personaSuccess = 0;
let personaAttempted = 0;
let surfacingSuccess = 0;
let surfacingAttempted = 0;
let demosErrored = 0;

export interface RecordDemoPayload {
  durationMs: number;
  costUsd: number;
  personaSuccess: number;
  personaAttempted: number;
  surfacingSuccess: number;
  surfacingAttempted: number;
  errored: boolean;
}

export function recordDemo(p: RecordDemoPayload): void {
  demosTotal += 1;
  totalCostUsd += p.costUsd;
  totalDurationMs += p.durationMs;
  personaSuccess += p.personaSuccess;
  personaAttempted += p.personaAttempted;
  surfacingSuccess += p.surfacingSuccess;
  surfacingAttempted += p.surfacingAttempted;
  if (p.errored) demosErrored += 1;
}

export interface MetricsSnapshot {
  uptime_ms: number;
  demos_total: number;
  demos_errored: number;
  total_cost_usd: number;
  avg_duration_ms: number;
  persona_success_rate: number;
  surfacing_success_rate: number;
  raw: {
    persona_attempted: number;
    persona_success: number;
    surfacing_attempted: number;
    surfacing_success: number;
  };
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return {
    uptime_ms: Date.now() - startedAt,
    demos_total: demosTotal,
    demos_errored: demosErrored,
    total_cost_usd: Number(totalCostUsd.toFixed(6)),
    avg_duration_ms: demosTotal > 0 ? Math.round(totalDurationMs / demosTotal) : 0,
    persona_success_rate:
      personaAttempted > 0
        ? Number((personaSuccess / personaAttempted).toFixed(4))
        : 0,
    surfacing_success_rate:
      surfacingAttempted > 0
        ? Number((surfacingSuccess / surfacingAttempted).toFixed(4))
        : 0,
    raw: {
      persona_attempted: personaAttempted,
      persona_success: personaSuccess,
      surfacing_attempted: surfacingAttempted,
      surfacing_success: surfacingSuccess,
    },
  };
}

/** Test-only reset helper. */
export function _resetMetricsForTest(): void {
  demosTotal = 0;
  totalCostUsd = 0;
  totalDurationMs = 0;
  personaSuccess = 0;
  personaAttempted = 0;
  surfacingSuccess = 0;
  surfacingAttempted = 0;
  demosErrored = 0;
}
