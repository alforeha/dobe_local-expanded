// ─────────────────────────────────────────
// TASK — TASK / SCHEDULE CLUSTER
// Live instance of a TaskTemplate.
// Execution unit. Lives in User.lists.gtdList[] or inside an Event.
// UUID needed for undo and quest logging.
// ─────────────────────────────────────────

import type { InputFields, TaskSecondaryTag } from './taskTemplate';

// ── LOCATION ─────────────────────────────────────────────────────────────────

export interface TaskLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  placeName?: string;
}

/** STUB: MULTI-USER — reserved for users a Task is shared with once the MULTI-USER chapter ships. */
export type SharedWithStub = null;

// ── TASK ROOT ─────────────────────────────────────────────────────────────────

export type TaskCompletionState = 'pending' | 'complete' | 'skipped';

export interface Task {
  /** uuid */
  id: string;
  /** Ref to originating TaskTemplate. Unique one-off tasks store null. */
  templateRef: string | null;
  /** true for unique one-off tasks that do not resolve through a TaskTemplate. */
  isUnique?: boolean;
  /** Unique task display title. Template-backed tasks leave this null/absent. */
  title?: string | null;
  /** Unique task input type. Template-backed tasks resolve taskType from their TaskTemplate. */
  taskType?: string | null;
  completionState: TaskCompletionState;
  completedAt: string | null; // ISO date
  /** Recorded values matching inputFields shape of TaskTemplate (D41) */
  resultFields: Partial<InputFields>;
  /** STUB: TASK-EVIDENCE — reserved for a per-task evidence pointer once the TASK-EVIDENCE chapter is enabled. */
  attachmentRef: string | null;
  /**
   * Optional ref to Resource that contextualised completion.
   * Enables +2 defense bonus routing and links task history back to resource log (D40).
   */
  resourceRef: string | null;
  /** Optional coordinates recorded during completion */
  location: TaskLocation | null;
  /** STUB: MULTI-USER — stores users this Task is shared with once the MULTI-USER chapter is enabled. */
  sharedWith: SharedWithStub;
  /**
   * Encoded quest navigation path: "${actId}|${chainIndex}|${questIndex}".
   * Set by markerEngine.fireMarker() when this Task is a quest milestone check-in.
   * null for regular schedule tasks.
   */
  questRef: string | null;
  /**
   * Act uuid — mirrors the actId encoded in questRef for explicit cross-reference.
   * null for regular schedule tasks.
   */
  actRef: string | null;
  /**
   * Secondary tag copied from the TaskTemplate at materialisation.
   * Cached here so the display layer can show the tag without a template lookup.
   */
  secondaryTag: TaskSecondaryTag | null;
}

// ── MANUAL GTD ITEM (MVP11 W19) ───────────────────────────────────────────────

/**
 * Manual GTD item — user-created via the Quick Action room add popup.
 * Stored in User.lists.manualGtdList[].
 *
 * Distinct from system-generated Tasks in gtdList (resource / quest / marker).
 * isManual: true acts as the discriminant flag.
 */
export interface GTDItem {
  /** uuid */
  id: string;
  title: string;
  note: string | null;
  /** Optional TaskTemplate ref chosen in the Add GTD popup */
  templateRef?: string | null;
  /** Manual task type selected in the Add GTD popup. */
  taskType?: string;
  /** Initial input fields for the manual task, matching its task type shape. */
  parameters?: Record<string, unknown>;
  /** Optional ref to a Resource the user chose to link this item to */
  resourceRef: string | null;
  /** ISO date — null if no due date set */
  dueDate: string | null;
  /** Always true — distinguishes manual GTDItems from system Task refs in gtdList */
  isManual: true;
  completionState: 'pending' | 'complete';
  /** ISO datetime — null when pending */
  completedAt: string | null;
  /** When true, completeManualGTDItem() skips the QuickActionsEvent write (D99) */
  skipQAWrite?: boolean;
}
