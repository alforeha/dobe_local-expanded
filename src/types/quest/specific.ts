// ─────────────────────────────────────────
// Quest.specific{} — SMARTER: S
// Holds the end-state condition and evaluation routing for the Quest.
// goalType drives the S tab UI and determines how completion is evaluated.
// sourceType is derived from goalType for engine compatibility.
// ─────────────────────────────────────────

export type QuestSourceType = 'taskInput' | 'resourceRef';

export type GoalType =
  | 'numeric'       // log a value, compare ≥ target (lose 15 lbs)
  | 'taskCount'     // count task completions ≥ target (read 100 pages)
  | 'resourceLinked'// read resource property ≥ target (save $5000)
  | 'progression'   // user-defined milestone % (launch product)
  | 'binary'        // single completion event — done or not done
  | 'streak'        // consecutive completions ≥ target (meditate 30 days)
  | 'reduction'     // value must go ≤ target (reduce screen time, quit smoking)
  | 'acquisition';  // item/stash count ≥ target (collect 10 rocks)

export interface QuestSpecific {
  goalType: GoalType;
  targetValue: number;
  unit: string | null;
  startValue: number | null;   // numeric/reduction: where you are starting from
  sourceType: QuestSourceType; // derived from goalType — kept for engine compat
  resourceRef: string | null;
  resourceProperty: string | null;
}
