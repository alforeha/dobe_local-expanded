import type { PlannedEvent } from '../types/plannedEvent';

/**
 * Returns true when a PlannedEvent is a one-off (W18).
 * One-off recurrence signature: frequency='daily', interval=1, endsOn=seedDate.
 */
export function isOneOffEvent(pe: PlannedEvent): boolean {
  return (
    pe.recurrenceInterval.frequency === 'daily' &&
    pe.recurrenceInterval.interval === 1 &&
    pe.recurrenceInterval.endsOn === pe.seedDate
  );
}
