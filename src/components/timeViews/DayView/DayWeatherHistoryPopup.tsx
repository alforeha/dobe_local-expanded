import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { IconDisplay } from '../../shared/IconDisplay';
import { PopupShell } from '../../shared/popups/PopupShell';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { useSystemStore } from '../../../stores/useSystemStore';
import { format } from '../../../utils/dateUtils';
import type { QuickActionsEvent, QuickActionsWeatherSnapshot } from '../../../types/event';

interface DayWeatherHistoryPopupProps {
  date: Date;
  onClose: () => void;
}

function isQuickActionsEvent(event: unknown): event is QuickActionsEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as QuickActionsEvent).eventType === 'quickActions'
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function precipLabel(mm: number | undefined): string {
  if (mm === undefined) return '—';
  if (mm === 0) return 'None';
  return `${mm} mm`;
}

interface LocationCardProps {
  name: string;
  isActive: boolean;
  snapshot: QuickActionsWeatherSnapshot;
}

function LocationCard({ name, isActive, snapshot }: LocationCardProps) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 ${
        isActive
          ? 'border-purple-400 bg-purple-50 dark:border-purple-500 dark:bg-purple-900/20'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">
          {name}
        </span>
        {isActive && (
          <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:bg-purple-800/40 dark:text-purple-300">
            Active
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <IconDisplay iconKey={snapshot.icon} size={40} className="h-10 w-10 object-contain" alt="" />
        <div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {snapshot.high}°
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Low {snapshot.low}°</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Precipitation</div>
          <div className="font-semibold text-gray-800 dark:text-gray-100">
            {precipLabel(snapshot.precipitation)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DayWeatherHistoryPopup({ date, onClose }: DayWeatherHistoryPopupProps) {
  const { activeEvents, historyEvents } = useScheduleStore(
    useShallow((s) => ({ activeEvents: s.activeEvents, historyEvents: s.historyEvents })),
  );
  const locationPreferences = useSystemStore((s) => s.settings?.locationPreferences);

  const dateISO = format(date, 'iso');
  const qaId = `qa-${dateISO}`;

  const qa = useMemo(() => {
    const ev = historyEvents[qaId] ?? activeEvents[qaId];
    return isQuickActionsEvent(ev) ? ev : null;
  }, [activeEvents, historyEvents, qaId]);

  const locations = useMemo(() => locationPreferences?.locations ?? [], [locationPreferences]);
  const activeLocationId = locationPreferences?.activeLocationId ?? null;

  // Build display list: prefer locationSnapshots (multi-location), fall back to
  // weatherSnapshot alone when locationSnapshots is absent (older records).
  const entries = useMemo(() => {
    if (!qa) return [];

    if (qa.locationSnapshots && Object.keys(qa.locationSnapshots).length > 0) {
      return Object.entries(qa.locationSnapshots).map(([locId, snapshot]) => {
        const loc = locations.find((l) => l.id === locId);
        const name = loc
          ? `${loc.label}${loc.cityName ? ` — ${loc.cityName}` : ''}`
          : 'Unknown location';
        return { locId, name, isActive: locId === activeLocationId, snapshot };
      });
    }

    // Fallback: single weatherSnapshot entry
    if (qa.weatherSnapshot) {
      const activeLoc = locations.find((l) => l.id === activeLocationId) ?? locations[0];
      const name = activeLoc
        ? `${activeLoc.label}${activeLoc.cityName ? ` — ${activeLoc.cityName}` : ''}`
        : 'Location';
      return [{ locId: activeLocationId ?? 'active', name, isActive: true, snapshot: qa.weatherSnapshot }];
    }

    return [];
  }, [qa, locations, activeLocationId]);

  // Sort: active location first
  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        return a.name.localeCompare(b.name);
      }),
    [entries],
  );

  return (
    <PopupShell title={`Weather — ${formatDate(date)}`} onClose={onClose} size="large">
      {sortedEntries.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedEntries.map((entry) => (
            <LocationCard
              key={entry.locId}
              name={entry.name}
              isActive={entry.isActive}
              snapshot={entry.snapshot}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          No weather data recorded for this day.
        </div>
      )}
    </PopupShell>
  );
}
