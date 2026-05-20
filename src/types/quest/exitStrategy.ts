// Replaces exigency.ts — renamed for clarity
// ─────────────────────────────────────────
// Quest.exitStrategy{} — SMARTER: E
// Stub shape only in MVP07 (D06).
// Defines what happens when a Marker fires but the Quest finish line is missed.
// Handler execution logic is BUILD-time.
// ─────────────────────────────────────────

/**
 * Options for handling a missed Quest finish line (D06).
 * restart    — reset progress, reissue all Markers from the beginning
 * extend     — widen the interval or threshold to give more time
 * reschedule — issue a new Marker schedule with adjusted cadence
 * sleep      — pause the Quest, no further Markers fire until user reactivates
 */
export type ExitStrategyOption = 'restart' | 'extend' | 'reschedule' | 'sleep';

export interface QuestExitStrategy {
  /** Action taken when user misses the Quest finish line condition */
  onMissedFinish: ExitStrategyOption;
  // Handler execution logic — BUILD-time task (D06)
}
