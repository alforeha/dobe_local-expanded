/**
 * useWeatherSnapshotSync
 *
 * Keeps today's QuickActionsEvent.locationSnapshots in sync with the current
 * saved locations list whenever locations are added or removed at runtime.
 *
 * - Added location  → fetch weather for today and patch it into locationSnapshots.
 * - Removed location → prune its entry from locationSnapshots.
 * - weatherSnapshot (active-location shortcut) is kept consistent.
 *
 * Mounts once in AppShell so it is always active.
 */

import { useEffect, useRef } from 'react';
import { useSystemStore } from '../stores/useSystemStore';
import { useScheduleStore } from '../stores/useScheduleStore';
import { fetchWeatherSummaryForDate } from '../utils/weatherService';
import { getAppDate } from '../utils/dateUtils';
import type { NamedLocation } from '../types';
import type { QuickActionsEvent, QuickActionsWeatherSnapshot } from '../types/event';

function isQaEvent(ev: unknown): ev is QuickActionsEvent {
  return (
    typeof ev === 'object' &&
    ev !== null &&
    (ev as QuickActionsEvent).eventType === 'quickActions'
  );
}

export function useWeatherSnapshotSync(): void {
  const locationPreferences = useSystemStore((s) => s.settings?.locationPreferences);
  const locations = locationPreferences?.locations ?? [];
  const activeLocationId = locationPreferences?.activeLocationId ?? null;

  // Stable ref to previous locations array so we can diff on change
  const prevLocationsRef = useRef<NamedLocation[]>(locations);

  useEffect(() => {
    const prev = prevLocationsRef.current;
    const prevIds = new Set(prev.map((l) => l.id));
    const currIds = new Set(locations.map((l) => l.id));

    const added = locations.filter((l) => !prevIds.has(l.id));
    const removedIds = prev.filter((l) => !currIds.has(l.id)).map((l) => l.id);

    prevLocationsRef.current = locations;

    // Nothing changed
    if (added.length === 0 && removedIds.length === 0) return;

    const today = getAppDate();
    const qaId = `qa-${today}`;
    const scheduleStore = useScheduleStore.getState();
    const existing = scheduleStore.activeEvents[qaId] ?? scheduleStore.historyEvents[qaId];
    if (!isQaEvent(existing)) return;

    // ── Handle removals synchronously ────────────────────────────────────────
    if (removedIds.length > 0) {
      const currentSnapshots = { ...(existing.locationSnapshots ?? {}) };
      for (const id of removedIds) {
        delete currentSnapshots[id];
      }

      const activeLocation = locations.find((l) => l.id === activeLocationId) ?? locations[0];
      const updatedWeatherSnapshot =
        activeLocation ? (currentSnapshots[activeLocation.id] ?? existing.weatherSnapshot ?? null) : null;

      scheduleStore.setActiveEvent({
        ...existing,
        weatherSnapshot: updatedWeatherSnapshot,
        locationSnapshots: Object.keys(currentSnapshots).length > 0 ? currentSnapshots : null,
      });
    }

    // ── Handle additions asynchronously ────────────────────────────────────
    if (added.length === 0) return;

    void (async () => {
      // Re-read the QA after any removal patch above
      const schedStore = useScheduleStore.getState();
      const qa = schedStore.activeEvents[qaId] ?? schedStore.historyEvents[qaId];
      if (!isQaEvent(qa)) return;

      const newEntries = await Promise.all(
        added.map(async (loc) => {
          try {
            const weather = await fetchWeatherSummaryForDate(loc.lat, loc.lng, today);
            if (!weather) return null;
            const snapshot: QuickActionsWeatherSnapshot = {
              icon: weather.icon,
              high: weather.high,
              low: weather.low,
              ...(weather.precipitation !== undefined ? { precipitation: weather.precipitation } : {}),
            };
            return [loc.id, snapshot] as [string, QuickActionsWeatherSnapshot];
          } catch {
            return null;
          }
        }),
      );

      const mergedSnapshots: Record<string, QuickActionsWeatherSnapshot> = {
        ...(qa.locationSnapshots ?? {}),
        ...Object.fromEntries(
          newEntries.filter((e): e is [string, QuickActionsWeatherSnapshot] => e !== null),
        ),
      };

      // Derive active-location weatherSnapshot from merged map
      const sysState = useSystemStore.getState();
      const currentActiveId = sysState.settings?.locationPreferences?.activeLocationId ?? null;
      const currentLocs = sysState.settings?.locationPreferences?.locations ?? [];
      const activeLoc = currentLocs.find((l) => l.id === currentActiveId) ?? currentLocs[0];
      const updatedWeatherSnapshot = activeLoc
        ? (mergedSnapshots[activeLoc.id] ?? qa.weatherSnapshot ?? null)
        : (qa.weatherSnapshot ?? null);

      useScheduleStore.getState().setActiveEvent({
        ...qa,
        weatherSnapshot: updatedWeatherSnapshot,
        locationSnapshots: Object.keys(mergedSnapshots).length > 0 ? mergedSnapshots : null,
      });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);
}
