// ─────────────────────────────────────────
// Quest.specific{} — SMARTER: S
// Holds the end-state condition and evaluation routing for the Quest.
// D01: sourceType drives two evaluation paths at Milestone completion —
//   taskInput reads result fields from the completed Milestone Task,
//   resourceRef reads a named property on a linked Resource.
// TI01, TI02: resourceProperty is a string key ref, not a typed enum in LOCAL v1.
//   Rationale: Resource properties vary per ResourceType and meta shape —
//   an enum would need to union all possible keys across all 6 ResourceMeta types.
//   String key ref is sufficient for LOCAL v1 and keeps the type narrow.
// ─────────────────────────────────────────

/** Routes condition evaluation path at Milestone completion (D01) */
export type QuestSourceType = 'taskInput' | 'resourceRef';

export interface QuestSpecific {
  /** Numeric target value — compared against at Milestone completion */
  targetValue: number;
  /**
   * Display unit label (e.g. 'kg', 'km', 'sessions', 'reps').
   * null if the unit is dimensionless or implicit.
   */
  unit: string | null;
  /**
   * Routes condition evaluation (D01):
   *   taskInput — reads result fields from the completed Milestone Task
   *   resourceRef — reads resourceProperty on the linked Resource
   */
  sourceType: QuestSourceType;
  /**
   * Resource id ref to read from.
   * null when sourceType is taskInput.
   */
  resourceRef: string | null;
  /**
   * Property key on the Resource to evaluate against targetValue.
   * e.g. 'balance' for an Account resource.
   * null when sourceType is taskInput.
   * String key ref — not a typed enum in LOCAL v1 (see TI02 decision above).
   */
  resourceProperty: string | null;
}
