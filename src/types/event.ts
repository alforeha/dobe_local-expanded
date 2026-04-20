// ─────────────────────────────────────────
// EVENT — TASK / SCHEDULE CLUSTER
// Concrete execution record materialised from PlannedEvent.
// System log per D02 and D03.
// User can convert any past Event with location to an Experience post.
//
// Also contains: QuickActionsEvent (D12, D44).
// ─────────────────────────────────────────

import type { EventLocation } from './plannedEvent';

// ── EVENT TYPE DISCRIMINATOR (D44) ────────────────────────────────────────────

export type EventType = 'standard' | 'quickActions' | 'planned';

// ── EVENT COMPLETION STATE ────────────────────────────────────────────────────

export type EventCompletionState = 'pending' | 'complete' | 'skipped';

// ── STUBS ─────────────────────────────────────────────────────────────────────

/** STUB: MULTI-USER — reserved for users the Event is shared with once the MULTI-USER chapter ships. */
export type EventSharedWithStub = null;

/** STUB: MULTI-USER — reserved for additional attendee records once the MULTI-USER chapter ships. */
export type CoAttendeesStub = null;

// ── EVENT ROOT ────────────────────────────────────────────────────────────────

export interface Event {
  /** uuid */
  id: string;
  /** Discriminator for UI rendering and history filtering (D44) */
  eventType: EventType;
  /** Optional — null for manually created events */
  plannedEventRef: string | null;
  /** Inherited from PlannedEvent.icon at materialisation; overridable for manual events */
  icon?: string | null;
  /** Direct event color — used when no plannedEventRef; overrides PlannedEvent lookup when set */
  color?: string | null;
  name: string;
  startDate: string; // ISO date
  startTime: string; // HH:MM
  /** For multi-day events */
  endDate: string;   // ISO date
  endTime: string;   // HH:MM
  /** Task instance refs */
  tasks: string[];
  completionState: EventCompletionState;
  /** Sum of completed task XP */
  xpAwarded: number;
  /** Attachment refs — max 5, max 200 KB each (D09) */
  attachments: string[];
  /** STUB: LOCATION-SHARING — reserved for captured venue/location metadata once the LOCATION-SHARING chapter is enabled. */
  location: EventLocation | null;
  note: string | null;
  /** STUB: MULTI-USER — stores people this Event is shared with once the MULTI-USER chapter is enabled. */
  sharedWith: EventSharedWithStub;
  /** STUB: MULTI-USER — stores attendee identities beyond the owner once the MULTI-USER chapter is enabled. */
  coAttendees: CoAttendeesStub;
}

// ── QUICK ACTIONS EVENT (D12, D44) ───────────────────────────────────────────
// Daily singleton receiving quick-fire completions.
// Date-keyed in localStorage as qa:{YYYY-MM-DD}.
// Lives in User.events.active[] during the day, moves to history[] at midnight rollover.

export interface QuickActionsCompletion {
  /** Task ref */
  taskRef: string;
  completedAt: string; // ISO date
}

/** STUB: MULTI-USER — reserved for cross-user Quick Actions activity once the MULTI-USER chapter ships. */
export type SharedCompletionsStub = null;

export interface QuickActionsWeatherSnapshot {
  icon: string;
  high: number;
  low: number;
}

export interface QuickActionsEvent {
  /** qa-{YYYY-MM-DD} — date-keyed singleton (D12) */
  id: string;
  /** Always 'quickActions' — matches Event.eventType discriminator (D44) */
  eventType: 'quickActions';
  date: string; // ISO date
  /** Each: Task ref + completedAt timestamp. User-editable and deletable. Awards +2 agility (D39) */
  completions: QuickActionsCompletion[];
  /** Running daily total */
  xpAwarded: number;
  /** Weather snapshot captured at rollover when forecast data is available. */
  weatherSnapshot?: QuickActionsWeatherSnapshot | null;
  /** STUB: MULTI-USER — stores shared Quick Actions completions once the MULTI-USER chapter is enabled. */
  sharedCompletions: SharedCompletionsStub;
}
