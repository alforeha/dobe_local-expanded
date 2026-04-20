// ─────────────────────────────────────────
// Marker — virtual fire indicator for Quest check-ins
// Lives inside Quest.timely.markers[].
// D02: conditionTypes: interval, xpThreshold, taskCount (D76).
// D03: One TaskTemplate per Quest, shared across all Milestone check-ins.
//   Marker holds taskTemplateRef — instantiated into a Task on each fire.
// D77: taskCount Marker supports a scope filter field.
// D80: Marker supports triggerSource for non-rollover fires (e.g. plannedEvent.created).
// D81: Marker supports sideEffects[] for dual output (Milestone + gtdWrite).
// ─────────────────────────────────────────

import type { RecurrenceRule } from '../taskTemplate';

/**
 * Determines which field drives Marker fire condition (D02, D76).
 * interval     — fires on RecurrenceRule schedule anchored to lastFired.
 * xpThreshold  — fires when the qualifying XP amount is reached.
 * taskCount    — fires when tracked task/event count reaches threshold (D76).
 */
export type MarkerConditionType = 'interval' | 'xpThreshold' | 'taskCount' | 'none';

/**
 * Trigger source for non-rollover Marker evaluation (D80).
 * rollover            — evaluated during nightly rollover step5 (default).
 * plannedEvent.created — evaluated when a new PlannedEvent is created.
 */
export type MarkerTriggerSource = 'rollover' | 'plannedEvent.created';

/**
 * taskCount scope filter (D77).
 * Determines what counts toward the threshold.
 */
export interface TaskCountScope {
  /**
   * taskTemplateRef — count completions of a specific TaskTemplate id.
   * statGroup       — count completions of any task in the named stat group.
   * systemEvent     — count system-level events (login, event.completed, etc.).
   */
  type: 'taskTemplateRef' | 'statGroup' | 'systemEvent';
  /** The ref value — template id, stat group key, or system event name */
  ref: string;
}

/**
 * Side effect executed after Marker fires (D81).
 * gtdWrite — push a GTDItem to User.lists.manualGtdList[].
 */
export interface MarkerSideEffect {
  type: 'gtdWrite';
  /** TaskTemplate id ref to use as the basis for the GTD item */
  taskTemplateRef: string;
  /** Optional note to attach to the GTD item */
  note?: string;
}

export interface Marker {
  /** Parent Quest id ref */
  questRef: string;
  /**
   * Determines fire condition (D02, D76):
   *   interval      — uses interval field (RecurrenceRule)
   *   xpThreshold   — uses xpThreshold field (number)
   *   taskCount     — uses taskCountScope + threshold fields (D76)
   */
  conditionType: MarkerConditionType;
  /**
   * When this Marker is evaluated (D80).
   * rollover (default) — evaluated in nightly rollover step5.
   * plannedEvent.created — evaluated when a PlannedEvent is created.
   * null defaults to 'rollover' for backward compatibility.
   */
  triggerSource: MarkerTriggerSource | null;
  /**
   * Recurrence schedule for firing.
   * Set when conditionType is interval; null otherwise.
   * Anchor is Marker.lastFired — same nth-weekday resolution as PlannedEvent (D37).
   */
  interval: RecurrenceRule | null;
  /**
   * XP interval that fires this Marker repeatedly (Q03 decision: since-last-fired).
   * Set when conditionType is xpThreshold; null otherwise.
   */
  xpThreshold: number | null;
  /**
   * Cumulative count threshold for taskCount conditionType (D76).
   * Marker fires when the count of qualifying completions reaches this value.
   * null when conditionType is not taskCount.
   */
  threshold: number | null;
  /**
   * Scope filter for taskCount evaluation (D77).
   * null when conditionType is not taskCount.
   */
  taskCountScope: TaskCountScope | null;
  /** Shared TaskTemplate id ref — one per Quest, instantiated into a Task on each fire (D03) */
  taskTemplateRef: string;
  /** ISO date — timestamp of last fire. null if this Marker has never fired. */
  lastFired: string | null;
  /**
   * Snapshot of User.progression.stats.xp at the time this Marker last fired.
   * Used to compute XP delta for xpThreshold condition evaluation (Q03).
   * null if never fired — engine uses 0 as baseline.
   */
  xpAtLastFire: number | null;
  /**
   * Snapshot of task count at last fire for taskCount markers.
   * Prevents re-firing for the same threshold on subsequent evaluations.
   * null when conditionType is not taskCount or Marker has never fired.
   */
  taskCountAtLastFire: number | null;
  /**
   * ISO date — next projected fire date.
   * Computed from lastFired + interval for interval markers.
   * null for xpThreshold / taskCount markers (condition is not date-driven).
   * null for interval markers before first fire.
   */
  nextFire: string | null;
  /** true while Quest is active. Deactivated when Quest completes or pauses. */
  activeState: boolean;
  /**
   * Optional side effects executed after this Marker fires (D81).
   * Currently supports: gtdWrite — push a GTDItem to manualGtdList.
   */
  sideEffects: MarkerSideEffect[] | null;
}
