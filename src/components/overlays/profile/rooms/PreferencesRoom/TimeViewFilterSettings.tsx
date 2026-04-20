import { useSystemStore } from '../../../../../stores/useSystemStore';
import type { TimePreferences, WeekViewPreferences } from '../../../../../types/settings';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const DEFAULTS: TimePreferences = {
  dayView: { startTime: '06:00', endTime: '23:00' },
  weekView: { startTime: '06:00', endTime: '22:00', visibleDays: ALL_DAYS },
  explorerView: { startTime: '00:00', endTime: '23:59', visibleDays: ALL_DAYS },
};

interface TimePreferenceRowProps {
  label: string;
  startTime: string;
  endTime: string;
  visibleDays?: number[];
  onTimeChange: (field: 'startTime' | 'endTime', value: string) => void;
  onDaysChange?: (days: number[]) => void;
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((entry) => entry !== day) : [...value, day].sort((a, b) => a - b);
    if (next.length === 0) return;
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_DAYS.map((day) => {
        const active = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => toggle(day)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {DAY_LABELS[day]}
          </button>
        );
      })}
    </div>
  );
}

function TimePreferenceRow({
  label,
  startTime,
  endTime,
  visibleDays,
  onTimeChange,
  onDaysChange,
}: TimePreferenceRowProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white/90 p-3 dark:border-gray-700 dark:bg-gray-800/80">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <span>From</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => onTimeChange('startTime', e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <span>To</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => onTimeChange('endTime', e.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </label>
      </div>

      {visibleDays && onDaysChange ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Visible days</p>
          <DayPicker value={visibleDays} onChange={onDaysChange} />
        </div>
      ) : null}
    </div>
  );
}

export function TimeViewFilterSettings() {
  const settings = useSystemStore((s) => s.settings);
  const setSettings = useSystemStore((s) => s.setSettings);

  const prefs: TimePreferences = {
    dayView: settings?.timePreferences?.dayView ?? DEFAULTS.dayView,
    weekView: {
      ...DEFAULTS.weekView,
      ...settings?.timePreferences?.weekView,
      visibleDays: settings?.timePreferences?.weekView?.visibleDays ?? DEFAULTS.weekView.visibleDays,
    },
    explorerView: {
      ...DEFAULTS.explorerView,
      ...settings?.timePreferences?.explorerView,
      visibleDays: settings?.timePreferences?.explorerView?.visibleDays ?? DEFAULTS.explorerView.visibleDays,
    },
  };

  const updateTime = (
    view: 'dayView' | 'weekView' | 'explorerView',
    field: 'startTime' | 'endTime',
    value: string,
  ) => {
    if (!settings) return;
    setSettings({
      ...settings,
      timePreferences: {
        ...prefs,
        [view]: {
          ...prefs[view],
          [field]: value,
        },
      },
    });
  };

  const updateDays = (view: 'weekView' | 'explorerView', days: number[]) => {
    if (!settings) return;
    setSettings({
      ...settings,
      timePreferences: {
        ...prefs,
        [view]: {
          ...(prefs[view] as WeekViewPreferences),
          visibleDays: days,
        },
      },
    });
  };

  return (
    <div className="space-y-3">
      <TimePreferenceRow
        label="Day view"
        startTime={prefs.dayView.startTime}
        endTime={prefs.dayView.endTime}
        onTimeChange={(field, value) => updateTime('dayView', field, value)}
      />
      <TimePreferenceRow
        label="Week view"
        startTime={prefs.weekView.startTime}
        endTime={prefs.weekView.endTime}
        visibleDays={prefs.weekView.visibleDays}
        onTimeChange={(field, value) => updateTime('weekView', field, value)}
        onDaysChange={(days) => updateDays('weekView', days)}
      />
      <TimePreferenceRow
        label="Month view"
        startTime={prefs.explorerView.startTime}
        endTime={prefs.explorerView.endTime}
        visibleDays={prefs.explorerView.visibleDays}
        onTimeChange={(field, value) => updateTime('explorerView', field, value)}
        onDaysChange={(days) => updateDays('explorerView', days)}
      />
    </div>
  );
}
