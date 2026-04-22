import { useMemo, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { mergeInventoryItemTemplates } from '../../../../../utils/inventoryItems';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../../../../../coach/ItemLibrary';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { IconPicker } from '../../../../shared/IconPicker';
import { ColorPicker } from '../../../../shared/ColorPicker';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { TaskTemplateIcon } from '../../../../shared/TaskTemplateIcon';
import { materialisePlannedEvent } from '../../../../../engine/materialise';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { storageDelete, storageKey } from '../../../../../storage';
import { localISODate } from '../../../../../utils/dateUtils';
import { getLibraryTemplatePool } from '../../../../../utils/resolveTaskTemplate';
import type { PlannedEvent, ConflictMode } from '../../../../../types/plannedEvent';
import type { RecurrenceFrequency, RecurrenceRule, TaskTemplate, TaskType, Weekday } from '../../../../../types/taskTemplate';
import type { StatGroupKey } from '../../../../../types/user';

const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
];

const CONFLICT_MODES: { value: ConflictMode; label: string }[] = [
  { value: 'concurrent', label: 'Concurrent' },
  { value: 'override', label: 'Override' },
  { value: 'shift', label: 'Shift' },
  { value: 'truncate', label: 'Truncate' },
];

const STAT_PILLS: { key: 'all' | StatGroupKey; label: string; iconKey?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'health', label: '', iconKey: 'health' },
  { key: 'strength', label: '', iconKey: 'strength' },
  { key: 'agility', label: '', iconKey: 'agility' },
  { key: 'defense', label: '', iconKey: 'defense' },
  { key: 'charisma', label: '', iconKey: 'charisma' },
  { key: 'wisdom', label: '', iconKey: 'wisdom' },
];

const WEEKDAY_KEYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function todayISO(): string {
  return localISODate(new Date());
}

function isTodayARecurrenceDay(rule: RecurrenceRule): boolean {
  if (rule.frequency === 'daily') return true;
  if (rule.frequency === 'monthly') return true;
  if (rule.frequency === 'weekly') {
    if (!rule.days || rule.days.length === 0) return true;
    const todayKey = WEEKDAY_KEYS[new Date().getDay()];
    return todayKey !== undefined && rule.days.includes(todayKey);
  }
  return true;
}

function getPrimaryStat(template: TaskTemplate): StatGroupKey {
  const groups: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];
  let best: StatGroupKey = 'health';
  let bestValue = -1;

  for (const group of groups) {
    const value = template.xpAward[group] ?? 0;
    if (value > bestValue) {
      best = group;
      bestValue = value;
    }
  }

  return bestValue > 0 ? best : 'wisdom';
}

function getTaskTypeIconKey(taskType: TaskType): string {
  const map: Record<TaskType, string> = {
    CHECK: 'check',
    COUNTER: 'counter',
    SETS_REPS: 'sets_reps',
    CIRCUIT: 'circuit',
    DURATION: 'duration',
    TIMER: 'timer',
    RATING: 'rating',
    TEXT: 'text',
    FORM: 'form',
    CHOICE: 'choice',
    CHECKLIST: 'checklist',
    SCAN: 'scan',
    LOG: 'log',
    LOCATION_POINT: 'location_point',
    LOCATION_TRAIL: 'location_trail',
    ROLL: 'roll',
  };

  return map[taskType];
}

function reorderList<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return list;
  next.splice(to, 0, moved);
  return next;
}

function getIntervalHint(frequency: RecurrenceFrequency): string {
  if (frequency === 'daily') return '1 = daily, 2 = every 2 days';
  if (frequency === 'weekly') return '1 = weekly, 2 = every 2 weeks';
  if (frequency === 'monthly') return '1 = monthly, 3 = every 3 months';
  return 'Interval between each custom recurrence cycle';
}

export interface RoutinePopupPrefill {
  name: string;
  icon: string;
  color: string;
  startTime?: string;
  endTime?: string;
  isOvernight?: boolean;
  taskPool: string[];
  recurrenceInterval: RecurrenceRule;
}

interface RoutinePopupProps {
  editRoutine: PlannedEvent | null;
  prefill?: RoutinePopupPrefill;
  onClose: () => void;
  isPrebuilt?: boolean;
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

function Field({ label, hint, children, className }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label className="text-xs font-medium uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 italic">{hint}</p>}
    </div>
  );
}

interface ScheduleTaskPoolProps {
  templates: { id: string; template: TaskTemplate }[];
  taskPool: string[];
  setTaskPool: React.Dispatch<React.SetStateAction<string[]>>;
  readOnly?: boolean;
  note?: string;
}

type PoolView = 'stat' | 'resource';

const PILL_CLS = (active: boolean) =>
  `rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'border-purple-500 bg-purple-500 text-white'
      : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
  }`;

function ScheduleTaskPool({ templates, taskPool, setTaskPool, readOnly = false, note }: ScheduleTaskPoolProps) {
  const resources = useResourceStore((s) => s.resources);
  const user = useUserStore((s) => s.user);
  const libraryTemplates = useMemo(() => getLibraryTemplatePool(), []);
  const libraryTemplateById = useMemo(
    () => new Map(libraryTemplates.filter((template): template is TaskTemplate & { id: string } => !!template.id).map((template) => [template.id, template])),
    [libraryTemplates],
  );
  const [poolView, setPoolView] = useState<PoolView>('stat');
  const [statFilter, setStatFilter] = useState<'all' | StatGroupKey>('all');
  const [orderMode, setOrderMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Synthesize resource task entries for home chores and inventory item tasks.
  // These are only written to the schedule store when within the reminder lead window,
  // so we scan resources directly to always show them in the pool.
  const syntheticResourceEntries = useMemo(() => {
    const existingKeys = new Set(templates.map((t) => t.id));
    const entries: { id: string; template: TaskTemplate }[] = [];

    for (const resource of Object.values(resources)) {
      if (resource.type === 'home') {
        for (const chore of resource.chores ?? []) {
          const key = `resource-task:${resource.id}:chore:${chore.id}`;
          if (!existingKeys.has(key)) {
            entries.push({
              id: key,
              template: {
                name: `${resource.name} - ${chore.name}`,
                description: '',
                icon: chore.icon || 'resource-task',
                isSystem: true,
                taskType: 'CHECK',
                inputFields: { label: chore.name },
                xpAward: { health: 0, strength: 0, agility: 5, defense: 0, charisma: 0, wisdom: 0 },
                cooldown: null,
                media: null,
                items: [],
                secondaryTag: null,
              },
            });
          }
        }
      } else if (resource.type === 'inventory') {
        const mergedItemTemplates = mergeInventoryItemTemplates(
          user?.lists.inventoryItemTemplates,
          resource.itemTemplates,
        );
        for (const container of resource.containers ?? []) {
          for (const item of container.items) {
            for (const recurringTask of item.recurringTasks ?? []) {
              const key = `resource-task:${resource.id}:inventory:${item.id}:${recurringTask.id}`;
              if (!existingKeys.has(key)) {
                // Resolve task name the same way ResourceTasksTab does
                let taskName = recurringTask.taskTemplateRef;
                if (item.itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
                  const tpl = mergedItemTemplates.find((t) => t.id === item.itemTemplateRef);
                  const ct = tpl?.customTaskTemplates?.find((c) => c.name.trim() === recurringTask.taskTemplateRef);
                  if (ct) taskName = ct.name;
                } else {
                  const coachTask = libraryTemplateById.get(recurringTask.taskTemplateRef);
                  if (coachTask) taskName = coachTask.name;
                  else {
                    const meta = getItemTaskTemplateMeta(recurringTask.taskTemplateRef);
                    if (meta) taskName = meta.name;
                  }
                }
                const itemTpl = mergedItemTemplates.find((t) => t.id === item.itemTemplateRef);
                const itemName = itemTpl?.name ?? 'Item';
                entries.push({
                  id: key,
                  template: {
                    name: `${itemName} - ${taskName}`,
                    description: '',
                    icon: 'resource-task',
                    isSystem: true,
                    taskType: 'CHECK',
                    inputFields: { label: taskName },
                    xpAward: { health: 0, strength: 0, agility: 0, defense: 5, charisma: 0, wisdom: 3 },
                    cooldown: null,
                    media: null,
                    items: [],
                    secondaryTag: null,
                  },
                });
              }
            }
          }
        }
      }
    }
    return entries;
  }, [libraryTemplateById, templates, resources, user]);

  // Split templates into stat vs resource-derived (including synthesized entries)
  const { statTemplates, resourceTemplates } = useMemo(() => {
    const stat: typeof templates = [];
    const res: typeof templates = [];
    for (const entry of templates) {
      if (entry.id.startsWith('resource-task:')) res.push(entry);
      else stat.push(entry);
    }
    for (const entry of syntheticResourceEntries) {
      res.push(entry);
    }
    return { statTemplates: stat, resourceTemplates: res };
  }, [templates, syntheticResourceEntries]);

  const templateMap = useMemo(
    () => Object.fromEntries(
      [...templates, ...syntheticResourceEntries].map((entry) => [entry.id, entry.template])
    ),
    [templates, syntheticResourceEntries],
  );

  const filteredStatTemplates = useMemo(() => {
    const sorted = [...statTemplates].sort((a, b) => a.template.name.localeCompare(b.template.name));
    return sorted.filter(({ template }) => statFilter === 'all' || getPrimaryStat(template) === statFilter);
  }, [statFilter, statTemplates]);

  // Group resource templates by container (for inventory) or resource (for everything else)
  const resourceGroups = useMemo(() => {
    // Build item → container lookup from all inventory resources
    const itemContainerMap = new Map<string, { groupId: string; groupName: string; groupIcon: string }>();
    for (const resource of Object.values(resources)) {
      if (resource.type === 'inventory') {
        for (const container of resource.containers ?? []) {
          for (const item of container.items) {
            itemContainerMap.set(item.id, {
              groupId: container.id,
              groupName: container.name,
              groupIcon: container.icon || 'resource-inventory',
            });
          }
        }
      }
    }

    const map = new Map<string, { groupId: string; groupName: string; groupIcon: string; entries: { id: string; template: TaskTemplate }[] }>();
    for (const entry of resourceTemplates) {
      const parts = entry.id.split(':');
      const resourceId = parts[1] ?? 'unknown';
      const taskKind = parts[2]; // 'inventory' | 'chore' | 'maintenance' | etc.

      let group: { groupId: string; groupName: string; groupIcon: string };
      if (taskKind === 'inventory') {
        const itemId = parts[3] ?? '';
        const containerInfo = itemContainerMap.get(itemId);
        if (containerInfo) {
          group = containerInfo;
        } else {
          const res = resources[resourceId];
          group = { groupId: resourceId, groupName: res?.name ?? resourceId, groupIcon: res?.icon ?? 'resource-inventory' };
        }
      } else {
        const res = resources[resourceId];
        group = { groupId: resourceId, groupName: res?.name ?? resourceId, groupIcon: res?.icon ?? 'task' };
      }

      if (!map.has(group.groupId)) map.set(group.groupId, { ...group, entries: [] });
      map.get(group.groupId)!.entries.push(entry);
    }

    return Array.from(map.values()).sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [resourceTemplates, resources]);

  const selectedTemplates = useMemo(() => {
    return taskPool
      .map((id) => {
        const template = templateMap[id];
        return template ? { id, template } : null;
      })
      .filter((entry): entry is { id: string; template: TaskTemplate } => entry !== null);
  }, [taskPool, templateMap]);

  function togglePoolItem(id: string) {
    if (readOnly) return;
    setTaskPool((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }

  function moveSelectedItem(targetId: string) {
    if (readOnly || !draggedId || draggedId === targetId) return;
    setTaskPool((prev) => reorderList(prev, prev.indexOf(draggedId), prev.indexOf(targetId)));
  }

  function renderTaskRow(id: string, template: TaskTemplate) {
    const checked = taskPool.includes(id);
    const primaryStat = getPrimaryStat(template);
    return (
      <div
        key={id}
        draggable={orderMode && !readOnly}
        onDragStart={() => setDraggedId(id)}
        onDragOver={(e) => { if (orderMode && !readOnly) e.preventDefault(); }}
        onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); moveSelectedItem(id); }}
        onDragEnd={() => setDraggedId(null)}
        className="flex items-center gap-3 px-3 py-2"
      >
        {orderMode ? (
          <span className="w-5 shrink-0 text-center text-sm text-gray-400">{readOnly ? '' : '☰'}</span>
        ) : (
          <input type="checkbox" checked={checked} disabled={readOnly}
            onChange={() => togglePoolItem(id)} className="h-4 w-4 accent-purple-500 shrink-0" />
        )}
        <span className="w-6 shrink-0 text-center" aria-hidden="true">
          <IconDisplay iconKey={primaryStat} size={16} className="mx-auto h-4 w-4 object-contain" alt="" />
        </span>
        <span className="w-6 shrink-0 text-center" aria-hidden="true">
          <IconDisplay iconKey={getTaskTypeIconKey(template.taskType)} size={16} className="mx-auto h-4 w-4 object-contain" alt="" />
        </span>
        <span className="w-6 shrink-0 text-center" aria-hidden="true">
          <TaskTemplateIcon iconKey={template.icon} size={16} className="mx-auto h-4 w-4 object-contain" alt="" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">{template.name}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/20">

      {/* Top control row */}
      <div className="mb-2 flex items-center gap-2">
        <button type="button" onClick={() => { setPoolView('stat'); setOrderMode(false); }} className={PILL_CLS(!orderMode && poolView === 'stat')}>
          Stat tasks
        </button>
        <button type="button" onClick={() => { setPoolView('resource'); setOrderMode(false); }} className={PILL_CLS(!orderMode && poolView === 'resource')}>
          Resource tasks
        </button>
        <div className="flex-1" />
        <button type="button" onClick={() => setOrderMode((v) => !v)} className={PILL_CLS(orderMode)}>
          Order tasks
        </button>
      </div>

      {/* Stat filter pills — only in stat view, not order mode */}
      {!orderMode && poolView === 'stat' && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {STAT_PILLS.map((pill) => (
            <button key={pill.key} type="button" onClick={() => setStatFilter(pill.key)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                statFilter === pill.key
                  ? 'border-purple-500 bg-purple-500 text-white'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}>
              {pill.iconKey && <IconDisplay iconKey={pill.iconKey} size={12} className="h-3 w-3 object-contain" alt="" />}
              {pill.label}
            </button>
          ))}
        </div>
      )}

      {note && <p className="mb-2 text-xs italic text-gray-400">{note}</p>}

      {/* Task list */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">

        {/* Order mode — show selected tasks in order */}
        {orderMode && (
          <>
            {selectedTemplates.length === 0 && (
              <div className="flex min-h-24 items-center justify-center px-4 text-sm text-gray-400">No tasks selected yet.</div>
            )}
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {selectedTemplates.map(({ id, template }) => renderTaskRow(id, template))}
            </div>
          </>
        )}

        {/* Stat tasks view */}
        {!orderMode && poolView === 'stat' && (
          <>
            {filteredStatTemplates.length === 0 && (
              <div className="flex min-h-24 items-center justify-center px-4 text-sm text-gray-400">No templates match this filter.</div>
            )}
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredStatTemplates.map(({ id, template }) => renderTaskRow(id, template))}
            </div>
          </>
        )}

        {/* Resource tasks view */}
        {!orderMode && poolView === 'resource' && (
          <>
            {resourceGroups.length === 0 && (
              <div className="flex min-h-24 items-center justify-center px-4 text-sm text-gray-400">No resource tasks found. Add tasks to your resources first.</div>
            )}
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {resourceGroups.map(({ groupId, groupName, groupIcon, entries }) => (
                <div key={groupId}>
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 dark:bg-gray-700/50">
                    <IconDisplay iconKey={groupIcon} size={13} className="h-3.5 w-3.5 shrink-0 object-contain" alt="" />
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{groupName}</span>
                  </div>
                  {entries.map(({ id, template }) => renderTaskRow(id, template))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function RoutinePopup({ editRoutine, prefill, onClose, isPrebuilt = false }: RoutinePopupProps) {
  const setPlannedEvent = useScheduleStore((s) => s.setPlannedEvent);
  const removePlannedEvent = useScheduleStore((s) => s.removePlannedEvent);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const addRoutineRef = useUserStore((s) => s.addRoutineRef);
  const removeRoutineRef = useUserStore((s) => s.removeRoutineRef);
  const libraryTemplates = useMemo(() => getLibraryTemplatePool(), []);

  const isEditMode = editRoutine !== null;

  const allTemplates = useMemo(() => {
    const map = new Map<string, TaskTemplate>();

    for (const [id, template] of Object.entries(taskTemplates)) {
      // Include resource-task templates even though they're marked isSystem
      // (isSystem just hides them from the stat task picker, not from routines)
      const isResourceTask = id.startsWith('resource-task:');
      if (template.isSystem !== true || isResourceTask) {
        map.set(id, template);
      }
    }

    if (isPrebuilt) {
      const selectedIds = new Set(prefill?.taskPool ?? []);
      for (const template of libraryTemplates) {
        if (!template.id || template.isSystem === true) continue;
        if (!selectedIds.has(template.id)) continue;
        if (!map.has(template.id)) {
          map.set(template.id, template);
        }
      }
    }

    return Array.from(map.entries()).map(([id, template]) => ({ id, template }));
  }, [isPrebuilt, libraryTemplates, prefill?.taskPool, taskTemplates]);

  const [name, setName] = useState(isEditMode ? editRoutine.name : (prefill?.name ?? ''));
  const [iconKey, setIconKey] = useState(isEditMode ? editRoutine.icon : (prefill?.icon ?? 'routine'));
  const [color, setColor] = useState(isEditMode ? editRoutine.color : (prefill?.color ?? '#6366f1'));
  const [taskPool, setTaskPool] = useState<string[]>(isEditMode ? editRoutine.taskPool : (prefill?.taskPool ?? []));
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    isEditMode ? editRoutine.recurrenceInterval.frequency : (prefill?.recurrenceInterval.frequency ?? 'daily'),
  );
  const [days, setDays] = useState<Weekday[]>(
    isEditMode ? editRoutine.recurrenceInterval.days : (prefill?.recurrenceInterval.days ?? []),
  );
  const [interval, setInterval] = useState<number | ''>(
    isEditMode ? editRoutine.recurrenceInterval.interval : (prefill?.recurrenceInterval.interval ?? 1),
  );
  const [monthlyDay, setMonthlyDay] = useState<number | ''>(
    isEditMode
      ? (editRoutine.recurrenceInterval.monthlyDay ?? Number(editRoutine.seedDate.split('-')[2] ?? 1))
      : (prefill?.recurrenceInterval.monthlyDay ?? Number((prefill ? todayISO() : todayISO()).split('-')[2] ?? 1)),
  );
  const [dieDate, setDieDate] = useState<string>(isEditMode ? (editRoutine.dieDate ?? '') : '');
  const [customCondition, setCustomCondition] = useState<string>(
    isEditMode && editRoutine.recurrenceInterval.customCondition
      ? editRoutine.recurrenceInterval.customCondition
      : (prefill?.recurrenceInterval.customCondition ?? ''),
  );
  const [conflictMode, setConflictMode] = useState<ConflictMode>(isEditMode ? editRoutine.conflictMode : 'concurrent');
  const [startTime, setStartTime] = useState(isEditMode ? editRoutine.startTime : (prefill?.startTime ?? '09:00'));
  const [endTime, setEndTime] = useState(isEditMode ? editRoutine.endTime : (prefill?.endTime ?? '10:00'));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [seedDate, setSeedDate] = useState(isEditMode ? editRoutine.seedDate : todayISO());

  const isOvernight = prefill?.isOvernight === true || (startTime !== '' && endTime !== '' && endTime < startTime);
  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200';

  function toggleDay(day: Weekday) {
    setDays((prev) => (prev.includes(day) ? prev.filter((entry) => entry !== day) : [...prev, day]));
  }

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    if (interval !== '' && interval < 1) {
      setError('Recurrence interval must be at least 1.');
      return;
    }
    if (frequency === 'monthly' && (monthlyDay === '' || monthlyDay < 1 || monthlyDay > 31)) {
      setError('Monthly day must be between 1 and 31.');
      return;
    }

    if (dieDate && dieDate < seedDate) {
      setError('Die date cannot be before seed date.');
      return;
    }

    const today = todayISO();

    const recurrenceInterval: RecurrenceRule = {
      frequency,
      days: frequency === 'weekly' ? days : [],
      monthlyDay: frequency === 'monthly' ? (monthlyDay === '' ? null : monthlyDay) : null,
      interval: interval === '' ? 1 : interval,
      endsOn: dieDate || null,
      customCondition: frequency === 'custom' ? (customCondition.trim() || null) : null,
    };

    if (isEditMode) {
      const updated: PlannedEvent = {
        ...editRoutine,
        name: name.trim(),
        icon: iconKey,
        color,
        seedDate,
        dieDate: dieDate || null,
        taskPool,
        recurrenceInterval,
        conflictMode,
        startTime,
        endTime,
        isOvernight,
      };
      setPlannedEvent(updated);
    } else {
      const id = uuidv4();
      const newRoutine: PlannedEvent = {
        id,
        name: name.trim(),
        description: '',
        icon: iconKey,
        color,
        seedDate,
        dieDate: dieDate || null,
        recurrenceInterval,
        activeState: 'active',
        taskPool,
        taskPoolCursor: 0,
        taskList: [],
        conflictMode,
        startTime,
        endTime,
        isOvernight,
        location: null,
        sharedWith: null,
        pushReminder: null,
      };

      setPlannedEvent(newRoutine);
      addRoutineRef(id);
      autoCompleteSystemTask('task-sys-add-routine');

      if (seedDate <= today && isTodayARecurrenceDay(recurrenceInterval)) {
        const currentTemplates = useScheduleStore.getState().taskTemplates;
        const materialiseTemplates = Object.fromEntries([
          ...libraryTemplates
            .filter((template): template is TaskTemplate & { id: string } => !!template.id)
            .map((template) => [template.id, template] as const),
          ...Object.entries(currentTemplates),
        ]);
        materialisePlannedEvent(newRoutine, today, materialiseTemplates);
      }
    }

    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (editRoutine) {
      removePlannedEvent(editRoutine.id);
      storageDelete(storageKey.plannedEvent(editRoutine.id));
      removeRoutineRef(editRoutine.id);
    }
    onClose();
  }

  return (
    <PopupShell title={isEditMode ? 'Edit Routine' : 'Add Routine'} onClose={onClose} size="large">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="grid grid-cols-[56px_minmax(0,1fr)_56px] gap-3 sm:gap-4">
          <Field label="Icon">
            <IconPicker value={iconKey} onChange={setIconKey} align="left" />
          </Field>

          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              placeholder="Morning routine"
              className={inputCls}
            />
          </Field>

          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} align="right" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Field label="Start time">
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputCls} />
          </Field>
          <Field label="End time" hint={isOvernight ? 'Overnight routine: ends the following day.' : undefined}>
            <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Field label="Seed date" hint="When this routine begins.">
            <input type="date" value={seedDate} onChange={(event) => setSeedDate(event.target.value)} className={inputCls} />
          </Field>
          <Field label="Die date" hint="Leave empty to keep this routine forever.">
            <input type="date" value={dieDate} onChange={(event) => setDieDate(event.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/20">
          <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h4 className="min-w-0 text-base font-semibold text-gray-700 dark:text-gray-100">Recurrence rule</h4>
            <div className="flex items-center justify-end gap-2 self-center">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-300">Frequency</label>
              <select
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}
                className={`${inputCls} w-[8.5rem] shrink-0`}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
              {(frequency === 'daily' || frequency === 'monthly') && (
                <div className={`grid gap-3 sm:gap-4 ${frequency === 'monthly' ? 'grid-cols-[110px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
                  {frequency === 'monthly' && (
                    <Field label="Day" hint="31 uses the last day in shorter months.">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        step={1}
                        value={monthlyDay}
                        onChange={(event) => setMonthlyDay(event.target.value === '' ? '' : Number(event.target.value))}
                        className={inputCls}
                      />
                    </Field>
                  )}
                  <Field label="Interval" hint={getIntervalHint(frequency)}>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={interval}
                      onChange={(event) => setInterval(event.target.value === '' ? '' : Number(event.target.value))}
                      className={inputCls}
                    />
                  </Field>
                </div>
              )}

              {frequency === 'weekly' && (
                <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3 sm:gap-4">
                  <Field label="Days">
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleDay(key)}
                          className={`h-9 w-9 rounded-full border text-xs font-semibold transition-colors ${
                            days.includes(key)
                              ? 'border-purple-500 bg-purple-500 text-white'
                              : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Interval" hint={getIntervalHint(frequency)}>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={interval}
                      onChange={(event) => setInterval(event.target.value === '' ? '' : Number(event.target.value))}
                      className={inputCls}
                    />
                  </Field>
                </div>
              )}

              {frequency === 'custom' && (
                <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 sm:gap-4">
                  <Field label="Interval" hint={getIntervalHint(frequency)}>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={interval}
                      onChange={(event) => setInterval(event.target.value === '' ? '' : Number(event.target.value))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Expression">
                    <input
                      type="text"
                      value={customCondition}
                      onChange={(event) => setCustomCondition(event.target.value)}
                      placeholder="last-monday-of-month"
                      className={inputCls}
                    />
                  </Field>
                </div>
              )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <Field
            label="Task pool"
            hint="Filter by stat, switch to selected-only to drag the order, and use the list below as the rotation pool."
            className="h-full min-h-0"
          >
            <ScheduleTaskPool
              templates={allTemplates}
              taskPool={taskPool}
              setTaskPool={setTaskPool}
              readOnly={isPrebuilt}
              note={isPrebuilt ? 'Task pool set by coach. You can review it here, but editing is disabled for this prebuilt routine.' : undefined}
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:gap-4">
          <Field label="Conflict mode">
            <select
              value={conflictMode}
              onChange={(event) => setConflictMode(event.target.value as ConflictMode)}
              className={inputCls}
            >
              {CONFLICT_MODES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>

          <div className="flex items-center justify-end gap-2">
            {isEditMode && (
              <button
                type="button"
                onClick={handleDelete}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  confirmDelete
                    ? 'bg-red-600 text-white'
                    : 'border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                {confirmDelete ? 'Confirm Delete' : 'Delete'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </PopupShell>
  );
}
