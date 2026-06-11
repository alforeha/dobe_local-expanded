import type { Weekday } from '../../../types/taskTemplate';

/** Ordered Mon–Sun weekday slots shared by WeeklyPlanView and its consumers. */
export const WEEK_DAYS: ReadonlyArray<{ key: Weekday; label: string }> = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;
