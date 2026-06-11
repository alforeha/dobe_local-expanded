// ─────────────────────────────────────────
// Meal Plan popup — assigns planned meals (Cook Book recipes) to weekdays.
// Mirrors WorkoutPlanPopup: creates a PlannedEvent with weekly recurrence
// locked and the `category: 'meal-plan'` convention (A4).
// ─────────────────────────────────────────

import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { materialisePlannedEvent } from '../../../../../../engine/materialise';
import { getAppDate, localISODate } from '../../../../../../utils/dateUtils';
import { taskTemplateLibrary } from '../../../../../../coach';
import type { TaskTemplate, Weekday } from '../../../../../../types';
import type { PlannedEvent, TaskEntry } from '../../../../../../types/plannedEvent';
import { isRecipeTemplate } from './gastroNutrition';

/** Category convention for meal-plan routines — same pattern as 'workout-<group>'. */
export const MEAL_PLAN_CATEGORY = 'meal-plan';

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

interface MealPlanPopupProps {
  /** Preselected weekday (opened from a weekly-plan day slot's "+"). */
  initialDay?: Weekday;
  onClose: () => void;
}

export function MealPlanPopup({ initialDay, onClose }: MealPlanPopupProps) {
  const setPlannedEvent = useScheduleStore((s) => s.setPlannedEvent);
  const customTemplates = useScheduleStore((s) => s.taskTemplates);
  const addRoutineRef = useUserStore((s) => s.addRoutineRef);

  const [name, setName] = useState('');
  const [days, setDays] = useState<Weekday[]>(initialDay ? [initialDay] : []);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:00');
  const [error, setError] = useState('');

  // Recipe pool — custom recipes plus library recipe templates.
  const recipePool = useMemo(() => {
    const custom = Object.entries(customTemplates)
      .filter(([, template]) => isRecipeTemplate(template))
      .map(([key, template]) => ({ ...template, id: template.id ?? key }));
    const clonedIds = new Set(custom.map((t) => t.sourceTemplateId).filter(Boolean));
    const library = (taskTemplateLibrary as TaskTemplate[]).filter(
      (template): template is TaskTemplate & { id: string } =>
        isRecipeTemplate(template) && !!template.id && !clonedIds.has(template.id),
    );
    return [...custom, ...library];
  }, [customTemplates]);

  function toggleDay(day: Weekday) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function toggleRecipe(ref: string) {
    setSelectedRefs((prev) =>
      prev.includes(ref) ? prev.filter((r) => r !== ref) : [...prev, ref],
    );
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (days.length === 0) {
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
      icon: 'schedule-tab-mealplan',
      color: '#6366f1',
      seedDate: localISODate(new Date()),
      dieDate: null,
      // Weekly recurrence is locked for meal assignments (A4 — same lock as Power Bay).
      recurrenceInterval: {
        frequency: 'weekly',
        days,
        monthlyDay: null,
        interval: 1,
        endsOn: null,
        customCondition: null,
      },
      activeState: 'active',
      pools: [{ id: uuidv4(), name: 'Meals', entries }],
      taskPoolCursor: 0,
      taskList: [],
      conflictMode: 'concurrent',
      startTime,
      endTime,
      location: null,
      coAttendees: [],
      sharedWith: null,
      pushReminder: null,
      category: MEAL_PLAN_CATEGORY,
    };

    setPlannedEvent(routine);
    addRoutineRef(id);

    const todayKey = WEEKDAY_KEYS[new Date().getDay()];
    if (todayKey !== undefined && days.includes(todayKey)) {
      const materialiseTemplates = Object.fromEntries([
        ...(taskTemplateLibrary as TaskTemplate[])
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
  const labelCls =
    'text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400';

  return (
    <PopupShell title="Assign Meal" onClose={onClose}>
      <div className="flex flex-col gap-4 px-4 py-3">
        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Name</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Taco Tuesday"
          />
        </div>

        {/* Days */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Days</label>
          <div className="flex gap-1.5">
            {WEEKDAY_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                onClick={() => toggleDay(key)}
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                  days.includes(key)
                    ? 'border-accent bg-accent text-white'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Times */}
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelCls}>Start</label>
            <input
              className={inputCls}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className={labelCls}>End</label>
            <input
              className={inputCls}
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        {/* Recipes */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Meals (from Cook Book)</label>
          {recipePool.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              No recipes yet — create one in the Cook Book first.
            </p>
          ) : (
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {recipePool.map((template) => {
                const ref = template.id as string;
                const selected = selectedRefs.includes(ref);
                return (
                  <button
                    key={ref}
                    type="button"
                    onClick={() => toggleRecipe(ref)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? 'border-accent bg-accent-bg text-accent'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <span className="truncate">{template.name}</span>
                    {selected && <span aria-hidden="true">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-accent">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Assign
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
