/** Shared date formatting utilities for time views */

import { STARTER_TEMPLATE_IDS } from '../coach/StarterQuestLibrary';
import type { QuickActionsEvent } from '../types/event';
import { useScheduleStore } from '../stores/useScheduleStore';
import { useSystemStore } from '../stores/useSystemStore';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

type FormatType = 'display' | 'iso' | 'short' | 'monthYear' | 'time';

/**
 * Returns a YYYY-MM-DD string in the user's LOCAL timezone.
 * Use instead of toISOString().slice(0,10) which gives the UTC date and
 * causes events to appear one day off for users ahead of UTC.
 */
export function localISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format a Date into a string of the given type */
export function format(date: Date, type: FormatType): string {
  switch (type) {
    case 'display':
      // DDD MMM DD
      return `${DAY_NAMES[date.getDay()]} ${MONTH_NAMES[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')}`;
    case 'iso':
      // YYYY-MM-DD in local timezone (not UTC)
      return localISODate(date);
    case 'short':
      // MM/DD
      return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    case 'monthYear':
      // MMM YYYY
      return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
    case 'time': {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
    default:
      return date.toLocaleDateString();
  }
}

/** Return HH:MM string for a given hour number */
export function hourLabel(h: number): string {
  return String(h).padStart(2, '0');
}

/** Get the previous Monday from (or equal to) a given date */
export function getPrevMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Add N days to a date, returning new Date */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Return array of 7 dates Mon-Sun for the week containing `date` */
export function getWeekDays(date: Date): Date[] {
  const monday = getPrevMonday(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** True if two dates are the same calendar day */
export function isSameDay(a: Date, b: Date): boolean {
  return format(a, 'iso') === format(b, 'iso');
}

/** Format a Date to HH:MM string */
export function formatHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ── APP TIME REFERENCE (D91) ─────────────────────────────────────────────────
// All engine and UI code reads "what date/time is it" from these functions.
// The values are set once on app boot by AppShell and stored in useSystemStore.
// timeOffset (dev tool) is applied to getAppTime() only — not to getAppDate().

/**
 * Returns the app's current date as YYYY-MM-DD.
 * Reads appDate from useSystemStore; falls back to local date if not yet set.
 */
export function getAppDate(): string {
  const { appDate } = useSystemStore.getState();
  return appDate ?? localISODate(new Date());
}

/**
 * Returns the app's current time as HH:MM, with timeOffset applied.
 * Reads appTime + timeOffset from useSystemStore; falls back to real local time.
 */
export function getAppTime(): string {
  const { appTime, timeOffset } = useSystemStore.getState();
  const base = appTime ?? formatHHMM(new Date());
  if (!timeOffset) return base;
  const [hh, mm] = base.split(':').map(Number) as [number, number];
  const totalMinutes = hh * 60 + mm + timeOffset * 60;
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Convenience wrapper returning both app date and time.
 */
export function getAppDateTime(): { date: string; time: string } {
  return { date: getAppDate(), time: getAppTime() };
}

export function getTodayRollResult(): number {
  const qaId = `qa-${getAppDate()}`;
  const scheduleStore = useScheduleStore.getState();
  const qa = scheduleStore.activeEvents[qaId] as QuickActionsEvent | undefined;
  if (!qa) return 0;

  const rollCompletion = qa.completions.find((completion) => {
    const task = scheduleStore.tasks[completion.taskRef];
    return task?.templateRef === STARTER_TEMPLATE_IDS.roll;
  });
  if (!rollCompletion) return 0;

  const task = scheduleStore.tasks[rollCompletion.taskRef];
  const result = (task?.resultFields as { result?: unknown } | undefined)?.result;
  return typeof result === 'number' ? result : 0;
}

export function getAppNowISO(): string {
  return getOffsetNow().toISOString();
}

/**
 * Returns a Date object representing "now" with the dev time offset applied.
 * Use this anywhere the live clock is needed but should respect the offset
 * (e.g. the day-view time indicator, coach hour checks).
 * Does NOT replace the boot-time appDate — it is always real-clock + offset ms.
 */
export function getOffsetNow(): Date {
  const { timeOffset } = useSystemStore.getState();
  const d = new Date();
  if (timeOffset) d.setHours(d.getHours() + timeOffset);
  return d;
}

/** Return the number of the ISO week */
export function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}
