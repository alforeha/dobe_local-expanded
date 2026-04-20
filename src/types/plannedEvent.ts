// ─────────────────────────────────────────
// PLANNED EVENT — TASK / SCHEDULE CLUSTER
// Self-contained schedule and task pool.
// Materialises into Events via midnight rollover (D14).
// Serves as both planned event and routine (D36).
// Same-day creation triggers immediate materialisation.
// ─────────────────────────────────────────

import type { RecurrenceRule } from './taskTemplate';

// ── EVENT LOCATION ────────────────────────────────────────────────────────────

export interface EventLocation {
  latitude: number;
  longitude: number;
  placeName?: string;
}

// ── CONFLICT MODE (D08) ───────────────────────────────────────────────────────

export type ConflictMode = 'override' | 'shift' | 'truncate' | 'concurrent';

// ── ACTIVE STATE ──────────────────────────────────────────────────────────────

export type PlannedEventActiveState = 'active' | 'sleep';

/** STUB: MULTI-USER — reserved for invitees and shared access on a PlannedEvent once the MULTI-USER chapter ships. */
export type PlannedEventSharedWithStub = null;

/** STUB: APP-STORE — reserved for scheduled local/device reminder metadata once the APP-STORE chapter ships. */
export type PushReminderStub = null;

// ── PLANNED EVENT ROOT ────────────────────────────────────────────────────────

export interface PlannedEvent {
  /** uuid */
  id: string;
  name: string;
  description: string;
  /** Ref to icon asset */
  icon: string;
  color: string;
  /**
   * First occurrence — serves as RecurrenceRule anchor
   * for nth-weekday monthly resolution (D37).
   */
  seedDate: string; // ISO date
  /** Optional end date for multi-day or one-off events */
  dieDate: string | null; // ISO date
  /** RecurrenceRule ref (D37) — seedDate is the anchor */
  recurrenceInterval: RecurrenceRule;
  activeState: PlannedEventActiveState;
  /** D07 — full set of interchangeable TaskTemplate refs */
  taskPool: string[];
  /**
   * Current rotation pulled from pool.
   * Index into taskPool[] — advances and wraps at pool end (D47).
   */
  taskPoolCursor: number;
  /** Current rotation pulled from pool — snapshot of templateRefs for the materialised day */
  taskList: string[];
  /** D08 — schedule conflict resolution mode */
  conflictMode: ConflictMode;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  /** True when the routine ends after midnight on the following day. */
  isOvernight?: boolean;
  /** STUB: LOCATION-SHARING — reserved for saved venue/location metadata once the LOCATION-SHARING chapter is enabled. */
  location: EventLocation | null;
  /** STUB: MULTI-USER — stores invitees and shared ownership once the MULTI-USER chapter is enabled. */
  sharedWith: PlannedEventSharedWithStub;
  /** STUB: APP-STORE — stores reminder scheduling/config once the APP-STORE chapter is enabled. */
  pushReminder: PushReminderStub;
}
