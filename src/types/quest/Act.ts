// ─────────────────────────────────────────
// Act.commitment{} — ACTS: C
// D07: Two lists only in LOCAL v1 — trackedTaskRefs and routineRefs.
//   No lastReviewed field.
// D08: ACTS — A (accountability) and T (toggle) remain stubs in LOCAL v1.
//   S (system) has no property — it is engine behaviour.
//   C (commitment) is this shape per D07.
// ─────────────────────────────────────────

export interface ActCommitment {
  /**
   * TaskTemplate id refs the user has committed to scheduling.
   * These are the task templates the user intends to complete regularly
   * as part of this Act's progression.
   */
  trackedTaskRefs: string[];
  /**
   * PlannedEvent id refs where the tracked tasks live in the user's routine.
   * Links commitment intent to concrete schedule slots.
   * Routine review UI tie-in is BUILD-time (D07).
   */
  routineRefs: string[];
}
