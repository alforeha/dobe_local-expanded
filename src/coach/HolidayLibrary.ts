// ─────────────────────────────────────────
// HOLIDAY LIBRARY — prebuilt holiday blocks for the Events tab Holidays view
// (Sprint 4, A3 — stub foundation).
//
// Each HolidayBlock describes a holiday card with a prebuilt task list. The
// working version (next sprint) surfaces these as Routine-style cards that
// push to one-off events, reusing PlannedEventBlock's existing
// push-to-one-off flow: build a PlannedEvent with seedDate = dieDate = the
// chosen date, a single-entry recurrenceInterval ending on that date, and
// materialise it when the date is today or past (see
// PlannedEventBlock.handlePushToOneOff).
//
// The library ships empty this sprint — HolidaysTab renders a labeled
// placeholder until blocks land here.
// ─────────────────────────────────────────

export interface HolidayTaskSeed {
  /** TaskTemplate ref from the coach library, or a display-only label for unique tasks. */
  templateRef?: string;
  /** Title for unique (non-template) tasks. */
  title?: string;
  taskType?: string;
}

export interface HolidayBlock {
  id: string;
  name: string;
  /** Ref to icon asset (iconMap key). */
  icon: string;
  description: string;
  /** Fixed annual date as MM-DD, or null for floating holidays the user dates themselves. */
  monthDay: string | null;
  /** Prebuilt task list pushed into the one-off event's task pool. */
  tasks: HolidayTaskSeed[];
  /** Suggested event color token-compatible value; null = default accent. */
  color: string | null;
}

/** Holiday blocks surfaced by the Holidays view. Populated next sprint. */
export const holidayLibrary: HolidayBlock[] = [];
