import { useMemo, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PopupShell } from '../../../../shared/popups/PopupShell';
import { IconPicker } from '../../../../shared/IconPicker';
import { ColorPicker } from '../../../../shared/ColorPicker';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { TaskTemplateIcon } from '../../../../shared/TaskTemplateIcon';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { materialisePlannedEvent } from '../../../../../engine/materialise';
import { storageDelete, storageKey } from '../../../../../storage';
import { localISODate } from '../../../../../utils/dateUtils';
import type { PlannedEvent, ConflictMode } from '../../../../../types/plannedEvent';
import type { TaskTemplate, TaskType } from '../../../../../types/taskTemplate';
import type { StatGroupKey } from '../../../../../types/user';

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

function todayISO(): string {
  return localISODate(new Date());
}

function addHour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = ((hours * 60 + minutes + 60) % 1440 + 1440) % 1440;
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
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

interface OneOffEventPopupProps {
  editEvent: PlannedEvent | null;
  onClose: () => void;
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
}

function ScheduleTaskPool({ templates, taskPool, setTaskPool }: ScheduleTaskPoolProps) {
  const [statFilter, setStatFilter] = useState<'all' | StatGroupKey>('all');
  const [orderMode, setOrderMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const templateMap = useMemo(
    () => Object.fromEntries(templates.map((entry) => [entry.id, entry.template])),
    [templates],
  );

  const filteredTemplates = useMemo(() => {
    const alphabetized = [...templates].sort((a, b) => a.template.name.localeCompare(b.template.name));
    return alphabetized.filter(({ template }) => statFilter === 'all' || getPrimaryStat(template) === statFilter);
  }, [statFilter, templates]);

  const selectedTemplates = useMemo(() => {
    return taskPool
      .map((id) => {
        const template = templateMap[id];
        return template ? { id, template } : null;
      })
      .filter((entry): entry is { id: string; template: TaskTemplate } => entry !== null);
  }, [taskPool, templateMap]);

  function togglePoolItem(id: string) {
    setTaskPool((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }

  function moveSelectedItem(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setTaskPool((prev) => reorderList(prev, prev.indexOf(draggedId), prev.indexOf(targetId)));
  }

  const rows = orderMode ? selectedTemplates : filteredTemplates;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!orderMode && STAT_PILLS.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => setStatFilter(pill.key)}
              className={`inline-flex items-center justify-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
                statFilter === pill.key
                  ? 'border-purple-500 bg-purple-500 text-white'
                  : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {pill.iconKey ? <IconDisplay iconKey={pill.iconKey} size={14} className="h-3.5 w-3.5 object-contain" alt="" /> : null}
              {pill.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOrderMode((current) => !current)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            orderMode
              ? 'border-purple-500 bg-purple-500 text-white'
              : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          {orderMode ? 'Select tasks' : 'Order tasks'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {rows.length === 0 && (
          <div className="flex h-full min-h-24 items-center justify-center px-4 text-sm text-gray-400">
            {orderMode ? 'No tasks selected yet.' : 'No templates match this filter.'}
          </div>
        )}

        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {rows.map(({ id, template }) => {
            const checked = taskPool.includes(id);
            const primaryStat = getPrimaryStat(template);

            return (
              <div
                key={id}
                draggable={orderMode}
                onDragStart={() => setDraggedId(id)}
                onDragOver={(event) => {
                  if (orderMode) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault();
                  moveSelectedItem(id);
                }}
                onDragEnd={() => setDraggedId(null)}
                className="flex items-center gap-3 px-3 py-2"
              >
                {orderMode ? (
                  <span className="w-5 text-center text-sm text-gray-400">☰</span>
                ) : (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePoolItem(id)}
                    className="h-4 w-4 accent-purple-500"
                  />
                )}
                <span className="w-6 text-center text-base" aria-hidden="true"><IconDisplay iconKey={primaryStat} size={16} className="mx-auto h-4 w-4 object-contain" alt="" /></span>
                <span className="w-6 text-center text-base" aria-hidden="true"><IconDisplay iconKey={getTaskTypeIconKey(template.taskType)} size={16} className="mx-auto h-4 w-4 object-contain" alt="" /></span>
                <span className="w-6 text-center text-base" aria-hidden="true"><TaskTemplateIcon iconKey={template.icon} size={16} className="mx-auto h-4 w-4 object-contain" alt="" /></span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">{template.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function OneOffEventPopup({ editEvent, onClose }: OneOffEventPopupProps) {
  const setPlannedEvent = useScheduleStore((s) => s.setPlannedEvent);
  const removePlannedEvent = useScheduleStore((s) => s.removePlannedEvent);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);

  const isEditMode = editEvent !== null;

  const allTemplates = useMemo(() => {
    return Object.entries(taskTemplates)
      .filter(([, template]) => template.isSystem !== true)
      .map(([id, template]) => ({ id, template }));
  }, [taskTemplates]);

  const [name, setName] = useState(isEditMode ? editEvent.name : '');
  const [iconKey, setIconKey] = useState(isEditMode ? editEvent.icon : 'event');
  const [startDate, setStartDate] = useState(isEditMode ? editEvent.seedDate : todayISO());
  const [startTime, setStartTime] = useState(isEditMode ? editEvent.startTime : '09:00');
  const [endDate, setEndDate] = useState(isEditMode ? (editEvent.dieDate ?? editEvent.seedDate) : todayISO());
  const [endTime, setEndTime] = useState(isEditMode ? editEvent.endTime : addHour('09:00'));
  const [color, setColor] = useState(isEditMode ? editEvent.color : '#6366f1');
  const [taskPool, setTaskPool] = useState<string[]>(isEditMode ? editEvent.taskPool : []);
  const [conflictMode, setConflictMode] = useState<ConflictMode>(isEditMode ? editEvent.conflictMode : 'concurrent');
  const [description, setDescription] = useState(isEditMode ? editEvent.description : '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const inputCls =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200';
  const startsAt = `${startDate}T${startTime}:00`;
  const endsAt = `${endDate}T${endTime}:00`;
  const endsAfterStart = new Date(endsAt).getTime() > new Date(startsAt).getTime();

  function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!endsAfterStart) {
      setError('End date and time must be after the start.');
      return;
    }

    const today = todayISO();
    const recurrenceInterval = {
      frequency: 'daily' as const,
      days: [],
      interval: 1,
      endsOn: startDate,
      customCondition: null,
    };

    if (isEditMode) {
      const updated: PlannedEvent = {
        ...editEvent,
        name: name.trim(),
        description,
        icon: iconKey,
        color,
        seedDate: startDate,
        dieDate: endDate,
        recurrenceInterval,
        conflictMode,
        startTime,
        endTime,
        taskPool,
      };
      setPlannedEvent(updated);

      if (startDate <= today) {
        const currentTemplates = useScheduleStore.getState().taskTemplates;
        materialisePlannedEvent(updated, today, currentTemplates);
        // One-off event is now active — remove from plannedEvents
        removePlannedEvent(editEvent.id);
        storageDelete(storageKey.plannedEvent(editEvent.id));
      }
    } else {
      const id = uuidv4();
      const newEvent: PlannedEvent = {
        id,
        name: name.trim(),
        description,
        icon: iconKey,
        color,
        seedDate: startDate,
        dieDate: endDate,
        recurrenceInterval,
        activeState: 'active',
        taskPool,
        taskPoolCursor: 0,
        taskList: [],
        conflictMode,
        startTime,
        endTime,
        location: null,
        sharedWith: null,
        pushReminder: null,
      };

      if (startDate <= today) {
        // Materialise immediately — no need to keep in plannedEvents
        setPlannedEvent(newEvent);
        const currentTemplates = useScheduleStore.getState().taskTemplates;
        materialisePlannedEvent(newEvent, today, currentTemplates);
        removePlannedEvent(id);
        storageDelete(storageKey.plannedEvent(id));
      } else {
        // Future event — keep in plannedEvents for midnight rollover
        setPlannedEvent(newEvent);
      }
    }

    onClose();
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (editEvent) {
      removePlannedEvent(editEvent.id);
      storageDelete(storageKey.plannedEvent(editEvent.id));
    }
    onClose();
  }

  return (
    <PopupShell title={isEditMode ? 'Edit Event' : 'Add One-off Event'} onClose={onClose} size="large">
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
              placeholder="Doctor appointment"
              className={inputCls}
            />
          </Field>

          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} align="right" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                const nextDate = event.target.value;
                setStartDate(nextDate);
                if (endDate < nextDate) {
                  setEndDate(nextDate);
                }
                setError('');
              }}
              className={inputCls}
            />
          </Field>
          <Field label="Start time">
            <input
              type="time"
              value={startTime}
              onChange={(event) => {
                const nextTime = event.target.value;
                setStartTime(nextTime);
                if (!isEditMode && startDate === endDate) {
                  setEndTime(addHour(nextTime));
                }
              }}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Field label="End date">
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setError('');
              }}
              className={inputCls}
            />
          </Field>
          <Field label="End time" hint={!endsAfterStart ? 'End date/time must be after the start.' : undefined}>
            <input
              type="time"
              value={endTime}
              onChange={(event) => {
                setEndTime(event.target.value);
                setError('');
              }}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <Field
            label="Task pool"
            hint="Filter by stat, toggle selected-only, and drag rows to control task order."
            className="h-full min-h-0"
          >
            <ScheduleTaskPool templates={allTemplates} taskPool={taskPool} setTaskPool={setTaskPool} />
          </Field>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:gap-4">
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

          <Field label="Description">
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="Optional notes"
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

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
    </PopupShell>
  );
}
