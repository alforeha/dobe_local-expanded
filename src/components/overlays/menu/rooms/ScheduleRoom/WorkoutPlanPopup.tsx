import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { materialisePlannedEvent } from '../../../../../engine/materialise';
import { getAppDate, localISODate } from '../../../../../utils/dateUtils';
import { getLibraryTemplatePool } from '../../../../../utils/resolveTaskTemplate';
import { MUSCLE_GROUPS, normalizeTemplateMuscleGroups } from '../../../../../types';
import type { MuscleGroup, TaskTemplate, Weekday } from '../../../../../types';
import type { PlannedEvent, TaskEntry } from '../../../../../types/plannedEvent';

const WEEKDAY_OPTIONS: ReadonlyArray<{ key: Weekday; label: string }> = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
] as const;

const WEEKDAY_KEYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Category used for the warmup slot — same 'workout-' prefix convention as the 8 groups. */
export const WARMUP_CATEGORY = 'workout-warmup';

export interface WorkoutPlanPopupProps {
  /** Preselected muscle group (e.g. opened from a side-panel group's "+"). */
  initialGroup?: MuscleGroup;
  /** Preselected weekday (e.g. opened from a weekly-plan day slot's "+"). */
  initialDay?: Weekday;
  /** Warmup mode — daily recurrence, category 'workout-warmup'. */
  warmup?: boolean;
  onClose: () => void;
}

/**
 * Workout Plan popup — assigns a workout routine to weekdays.
 * Creates a PlannedEvent with weekly recurrence locked and the
 * `category: 'workout-<group>'` convention (A5).
 */
export function WorkoutPlanPopup({ initialGroup, initialDay, warmup = false, onClose }: WorkoutPlanPopupProps) {
  const setPlannedEvent = useScheduleStore((s) => s.setPlannedEvent);
  const customTemplates = useScheduleStore((s) => s.taskTemplates);
  const addRoutineRef = useUserStore((s) => s.addRoutineRef);
  const libraryTemplates = useMemo(() => getLibraryTemplatePool(), []);

  const [name, setName] = useState(warmup ? 'Warmup' : '');
  const [group, setGroup] = useState<MuscleGroup | ''>(initialGroup ?? '');
  const [days, setDays] = useState<Weekday[]>(initialDay ? [initialDay] : []);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [error, setError] = useState('');

  // Exercise pool — user custom fitness templates plus library fitness templates.
  const exercisePool = useMemo(() => {
    const custom = Object.entries(customTemplates)
      .filter(([, t]) => t.secondaryTag === 'fitness')
      .map(([key, t]) => ({ ...t, id: t.id ?? key }));
    const clonedIds = new Set(custom.map((t) => t.sourceTemplateId).filter(Boolean));
    const library = libraryTemplates.filter(
      (t): t is TaskTemplate & { id: string } =>
        t.secondaryTag === 'fitness' && !!t.id && !clonedIds.has(t.id),
    );
    return [...custom, ...library];
  }, [customTemplates, libraryTemplates]);

  const filteredPool = group === ''
    ? exercisePool
    : exercisePool.filter((t) => normalizeTemplateMuscleGroups(t).includes(group));

  function toggleDay(day: Weekday) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function toggleExercise(ref: string) {
    setSelectedRefs((prev) => (prev.includes(ref) ? prev.filter((r) => r !== ref) : [...prev, ref]));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!warmup && group === '') {
      setError('Pick a muscle group.');
      return;
    }
    if (!warmup && days.length === 0) {
      setError('Pick at least one day.');
      return;
    }

    const id = uuidv4();
    const today = getAppDate();
    const entries: TaskEntry[] = selectedRefs.map((ref) => ({
      kind: 'template',
      id: uuidv4(),
      templateRef: ref,
    }));

    const routine: PlannedEvent = {
      id,
      name: name.trim(),
      description: '',
      icon: 'fitness-dumbbell',
      color: '#6366f1',
      seedDate: localISODate(new Date()),
      dieDate: null,
      // Weekly recurrence is locked for workout assignments (warmup runs daily).
      recurrenceInterval: {
        frequency: warmup ? 'daily' : 'weekly',
        days: warmup ? [] : days,
        monthlyDay: null,
        interval: 1,
        endsOn: null,
        customCondition: null,
      },
      activeState: 'active',
      pools: [{ id: uuidv4(), name: 'Workout', entries }],
      taskPoolCursor: 0,
      taskList: [],
      conflictMode: 'concurrent',
      startTime,
      endTime,
      location: null,
      coAttendees: [],
      sharedWith: null,
      pushReminder: null,
      category: warmup ? WARMUP_CATEGORY : `workout-${group}`,
    };

    setPlannedEvent(routine);
    addRoutineRef(id);

    const todayKey = WEEKDAY_KEYS[new Date().getDay()];
    const firesToday = warmup || (todayKey !== undefined && days.includes(todayKey));
    if (firesToday) {
      const materialiseTemplates = Object.fromEntries([
        ...libraryTemplates
          .filter((template): template is TaskTemplate & { id: string } => !!template.id)
          .map((template) => [template.id, template] as const),
        ...Object.entries(useScheduleStore.getState().taskTemplates),
      ]);
      materialisePlannedEvent(routine, today, materialiseTemplates);
    }

    onClose();
  }

  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200';

  return (
    <PopupShell title={warmup ? 'Assign Warmup' : 'Assign Workout'} onClose={onClose}>
      <div className="flex flex-col gap-4 px-4 py-3">
        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
            Name
          </label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push Day" />
        </div>

        {/* Muscle group */}
        {!warmup && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
              Muscle Group
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLE_GROUPS.map((mg) => (
                <button
                  key={mg}
                  type="button"
                  onClick={() => setGroup(mg)}
                  className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${
                    group === mg
                      ? 'border-accent-border bg-accent-bg text-accent'
                      : 'border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {mg}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Days — weekly recurrence locked */}
        {!warmup && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
              Days (weekly)
            </label>
            <div className="flex gap-1.5">
              {WEEKDAY_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  onClick={() => toggleDay(key)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                    days.includes(key)
                      ? 'border-accent bg-accent text-white'
                      : 'border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Time */}
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
              Start
            </label>
            <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
              End
            </label>
            <input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        {/* Exercises */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
            Exercises
          </label>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-gray-600">
            {filteredPool.length === 0 ? (
              <span className="py-2 text-center text-xs text-gray-400 dark:text-gray-500">
                No matching exercises.
              </span>
            ) : (
              filteredPool.map((template) => {
                const ref = template.id ?? '';
                const active = selectedRefs.includes(ref);
                const groups = normalizeTemplateMuscleGroups(template);
                return (
                  <button
                    key={ref}
                    type="button"
                    onClick={() => toggleExercise(ref)}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      active
                        ? 'bg-accent-bg text-accent'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="truncate">{template.name}</span>
                    {groups.length > 0 && (
                      <span className="ml-2 shrink-0 text-xs capitalize text-gray-400 dark:text-gray-500">
                        {groups.join(' · ')}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2 pb-2">
          <button
            type="button"
            className="rounded-lg bg-gray-100 px-4 py-1.5 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-200"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-accent px-4 py-1.5 text-sm text-white"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
