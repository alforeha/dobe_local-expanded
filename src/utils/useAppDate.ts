import { useSystemStore } from '../stores/useSystemStore';
import { localISODate } from './dateUtils';

/**
 * Returns the app's current date as a midnight-local Date object.
 * Reads appDate from the system store (set on boot by AppShell — D91).
 * Falls back to the real local date if appDate is not yet initialised.
 *
 * Use this everywhere a component needs to know "what day is today"
 * so that dev-tool time travel is reflected throughout the UI.
 */
export function useAppDate(): Date {
  const appDate = useSystemStore((s) => s.appDate);
  const iso = appDate ?? localISODate(new Date());
  const d = new Date(iso + 'T00:00:00');
  d.setHours(0, 0, 0, 0);
  return d;
}
