import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { routineLibrary, type PrebuiltRoutine, type RoutineTag } from '../../../../coach/RoutineLibrary';
import { resolveIcon } from '../../../../constants/iconMap';
import { materialisePlannedEvent } from '../../../../engine/materialise';
import { autoCompleteSystemTask } from '../../../../engine/resourceEngine';
import { useScheduleStore } from '../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../stores/useUserStore';
import { localISODate } from '../../../../utils/dateUtils';
import { getLibraryTemplatePool } from '../../../../utils/resolveTaskTemplate';
import { ColorPicker } from '../../../shared/ColorPicker';
import { IconDisplay } from '../../../shared/IconDisplay';
import { IconPicker } from '../../../shared/IconPicker';
import type { PlannedEvent } from '../../../../types/plannedEvent';
import type { RecurrenceRule, TaskTemplate } from '../../../../types/taskTemplate';

const ALL_TAGS: RoutineTag[] = [
  'health',
  'morning',
  'mindfulness',
  'evening',
  'work',
  'fitness',
  'nutrition',
  'home',
  'admin',
  'wisdom',
];

function todayISO(): string {
  return localISODate(new Date());
}

function isTodayARecurrenceDay(rule: RecurrenceRule): boolean {
  if (rule.frequency === 'daily' || rule.frequency === 'monthly') return true;
  if (rule.frequency === 'weekly') {
    if (rule.days.length === 0) return true;
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    const todayKey = dayKeys[new Date().getDay()];
    return rule.days.includes(todayKey);
  }
  return true;
}

function formatRecurrence(rule: RecurrenceRule): string {
  if (rule.frequency === 'daily') return rule.interval > 1 ? `Every ${rule.interval} days` : 'Daily';
  if (rule.frequency === 'weekly') {
    if (rule.days.length === 0) return rule.interval > 1 ? `Every ${rule.interval} weeks` : 'Weekly';
    return rule.days.map((day) => day.slice(0, 1).toUpperCase() + day.slice(1, 3)).join(' ');
  }
  if (rule.frequency === 'monthly') {
    return rule.monthlyDay ? `Monthly on day ${rule.monthlyDay}` : 'Monthly';
  }
  return rule.customCondition ?? 'Custom';
}

export function RecommendedRoutinesTab() {
  const [filterTag, setFilterTag] = useState<RoutineTag | 'All'>('All');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return [...routineLibrary]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((routine) => {
        if (filterTag !== 'All' && !routine.tags.includes(filterTag)) return false;
        if (search.trim()) {
          const query = search.trim().toLowerCase();
          if (!routine.name.toLowerCase().includes(query)) return false;
        }
        return true;
      });
  }, [filterTag, search]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-2">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search routines..."
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear routine search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-lg leading-none text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                >
                  ×
                </button>
              ) : null}
            </div>
            <select
              value={filterTag}
              onChange={(event) => setFilterTag(event.target.value as RoutineTag | 'All')}
              className="min-h-10 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="All">All Tags</option>
              {ALL_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-3">
          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              No routines match the current filters.
            </p>
          ) : null}

          {visible.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              expanded={expandedId === routine.id}
              onToggleExpand={() => setExpandedId((current) => current === routine.id ? null : routine.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoutineCard({ routine, expanded, onToggleExpand }: { routine: PrebuiltRoutine; expanded: boolean; onToggleExpand: () => void }) {
  const shownTags = routine.tags.slice(0, 2);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className="h-12 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: routine.color }}
          aria-hidden="true"
        />
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl"
          style={{ backgroundColor: `${routine.color}22` }}
          aria-hidden="true"
        >
          <IconDisplay iconKey={routine.icon} size={28} className="h-7 w-7 object-contain" alt="" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{routine.name}</p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{routine.description}</p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          {shownTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-600 dark:bg-gray-700 dark:text-gray-300"
            >
              {tag}
            </span>
          ))}
        </div>
        <span className="shrink-0 text-sm text-gray-400" aria-hidden="true">
          {expanded ? resolveIcon('collapse') : resolveIcon('expand')}
        </span>
      </button>

      {expanded ? <RoutineExpandedEditor routine={routine} /> : null}
    </div>
  );
}

function RoutineExpandedEditor({ routine }: { routine: PrebuiltRoutine }) {
  const setPlannedEvent = useScheduleStore((state) => state.setPlannedEvent);
  const taskTemplates = useScheduleStore((state) => state.taskTemplates);
  const addRoutineRef = useUserStore((state) => state.addRoutineRef);
  const libraryTemplates = useMemo(() => getLibraryTemplatePool(), []);

  const [iconKey, setIconKey] = useState(routine.icon);
  const [name, setName] = useState(routine.name);
  const [color, setColor] = useState(routine.color);
  const [startTime, setStartTime] = useState(routine.startTime);
  const [endTime, setEndTime] = useState(routine.endTime);
  const [seedDate, setSeedDate] = useState(todayISO());
  const [addedState, setAddedState] = useState<'idle' | 'added'>('idle');
  const [error, setError] = useState('');

  const routineTemplates = useMemo(() => {
    const bundledById = new Map(
      libraryTemplates
        .filter((template): template is TaskTemplate & { id: string } => !!template.id)
        .map((template) => [template.id, template]),
    );

    return routine.taskPool
      .map((templateId) => taskTemplates[templateId] ?? bundledById.get(templateId) ?? null)
      .filter((template): template is TaskTemplate => template !== null);
  }, [libraryTemplates, routine.taskPool, taskTemplates]);

  function handleAddToSchedule() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    const plannedEvent: PlannedEvent = {
      id: uuidv4(),
      name: name.trim(),
      description: routine.description,
      icon: iconKey,
      color,
      seedDate,
      dieDate: null,
      recurrenceInterval: routine.recurrenceInterval,
      activeState: 'active',
      taskPool: routine.taskPool,
      taskPoolCursor: 0,
      taskList: [],
      conflictMode: 'concurrent',
      startTime,
      endTime,
      isOvernight: routine.isOvernight === true || endTime < startTime,
      location: null,
      sharedWith: null,
      pushReminder: null,
    };

    setPlannedEvent(plannedEvent);
    addRoutineRef(plannedEvent.id);
    autoCompleteSystemTask('task-sys-add-routine');

    if (seedDate <= todayISO() && isTodayARecurrenceDay(routine.recurrenceInterval)) {
      const currentTemplates = useScheduleStore.getState().taskTemplates;
      const materialiseTemplates = Object.fromEntries([
        ...libraryTemplates
          .filter((template): template is TaskTemplate & { id: string } => !!template.id)
          .map((template) => [template.id, template] as const),
        ...Object.entries(currentTemplates),
      ]);
      materialisePlannedEvent(plannedEvent, todayISO(), materialiseTemplates);
    }

    setError('');
    setAddedState('added');
    window.setTimeout(() => setAddedState('idle'), 1400);
  }

  return (
    <div className="border-t border-gray-100 px-4 py-4 dark:border-gray-700">
      <div className="grid gap-4 sm:grid-cols-[72px_minmax(0,1fr)_72px]">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Icon</p>
          <IconPicker value={iconKey} onChange={setIconKey} align="left" />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          />
        </label>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Color</p>
          <ColorPicker value={color} onChange={setColor} align="right" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Start time</span>
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">End time</span>
          <input
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Seed date</span>
          <input
            type="date"
            value={seedDate}
            onChange={(event) => setSeedDate(event.target.value)}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          />
        </label>
        <div className="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Recurrence</p>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{formatRecurrence(routine.recurrenceInterval)}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Task List</p>
        <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
          {routineTemplates.map((template) => (
            <div
              key={template.id ?? template.name}
              className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 dark:border-gray-700"
            >
              <IconDisplay iconKey={template.icon} size={18} className="h-[18px] w-[18px] shrink-0 object-contain" alt="" />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">{template.name}</span>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleAddToSchedule}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            addedState === 'added'
              ? 'bg-emerald-600 text-white'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {addedState === 'added' ? '✓ Added' : '+ Add to Schedule'}
        </button>
      </div>
    </div>
  );
}
