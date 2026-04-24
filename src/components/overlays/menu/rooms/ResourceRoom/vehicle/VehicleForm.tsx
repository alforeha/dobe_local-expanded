import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { normalizeCircuitInputFields, type CircuitInputFields, type CircuitStep, type CircuitStepType, type LogInputFields } from '../../../../../../types/taskTemplate';
import type {
  ResourceRecurrenceRule,
  RecurrenceDayOfWeek,
  ResourceNote,
  VehicleLayout,
  VehicleLayoutTemplate,
  VehicleMaintenanceTask,
  VehicleResource,
} from '../../../../../../types/resource';
import { makeDefaultRecurrenceRule, normalizeRecurrenceMode, toRecurrenceRule } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { ensureVehicleInspectionTask, generateScheduledTasks, generateGTDItems, syncVehicleLayoutContainerAssignments } from '../../../../../../engine/resourceEngine';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { NumberInput } from '../../../../../shared/inputs/NumberInput';
import { IconPicker } from '../../../../../shared/IconPicker';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { NotesLogEditor } from '../../../../../shared/NotesLogEditor';
import { VehicleLayout as VehicleLayoutEditor, buildVehicleLayout } from './VehicleLayout';

const SMALL_INPUT_CLS = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

interface VehicleFormProps {
  existing?: VehicleResource;
  onSaved: () => void;
  onCancel: () => void;
}

interface TaskDraft {
  id: string;
  icon: string;
  name: string;
  kind?: 'maintenance' | 'mileage-log';
  taskType?: VehicleMaintenanceTask['taskType'];
  inputFields?: CircuitInputFields | LogInputFields;
  recurrenceMode: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  reminderLeadDays: number;
  areaId?: string;
}

const CIRCUIT_STEP_TYPES: CircuitStepType[] = ['CHECK', 'CHOICE', 'COUNTER', 'DURATION', 'TIMER', 'RATING', 'TEXT', 'SCAN'];

function makeDefaultCircuitStep(stepType: CircuitStepType = 'CHECK'): CircuitStep {
  switch (stepType) {
    case 'CHOICE':
      return { id: uuidv4(), label: '', stepType, options: ['Pass', 'Fail'], required: true };
    case 'COUNTER':
      return { id: uuidv4(), label: '', stepType, target: 1, unit: '', required: true };
    case 'DURATION':
      return { id: uuidv4(), label: '', stepType, target: 5, required: true };
    case 'TIMER':
      return { id: uuidv4(), label: '', stepType, seconds: 60, required: true };
    case 'RATING':
      return { id: uuidv4(), label: '', stepType, scale: 5, required: true };
    default:
      return { id: uuidv4(), label: '', stepType, required: true };
  }
}

function applyCircuitStepDefaults(step: CircuitStep, stepType: CircuitStepType): CircuitStep {
  const base: CircuitStep = { id: step.id, label: step.label, stepType, required: step.required ?? true };
  switch (stepType) {
    case 'CHOICE':
      return { ...base, options: step.options && step.options.length > 0 ? step.options : ['Pass', 'Fail'] };
    case 'COUNTER':
      return { ...base, target: step.target ?? 1, unit: step.unit ?? '' };
    case 'DURATION':
      return { ...base, target: step.target ?? 5 };
    case 'TIMER':
      return { ...base, seconds: step.seconds ?? 60 };
    case 'RATING':
      return { ...base, scale: step.scale ?? 5 };
    default:
      return base;
  }
}

function makeMileageLogTask(): TaskDraft {
  return {
    id: uuidv4(),
    icon: 'vehicle',
    name: 'Mileage Log',
    kind: 'mileage-log',
    taskType: 'LOG',
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: -1,
  };
}

const DOW_LABELS: { key: RecurrenceDayOfWeek; label: string }[] = [
  { key: 'sun', label: 'Su' },
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Tu' },
  { key: 'wed', label: 'We' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
];

function formatDayOfMonth(day: number): string {
  const mod10 = day % 10;
  const mod100 = day % 100;
  if (mod10 === 1 && mod100 !== 11) return `${day}st`;
  if (mod10 === 2 && mod100 !== 12) return `${day}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${day}rd`;
  return `${day}th`;
}

function getDayOfMonth(isoDate: string): number {
  const parsed = Number(isoDate.split('-')[2] ?? 1);
  return Math.min(31, Math.max(1, parsed || 1));
}

function describeTaskRecurrence(rule: ResourceRecurrenceRule): string {
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly': {
      const days = rule.days.length > 0
        ? rule.days.map((day) => DOW_LABELS.find((entry) => entry.key === day)?.label ?? day).join(', ')
        : 'Seed day';
      return interval === 1 ? `Weekly · ${days}` : `Every ${interval} weeks · ${days}`;
    }
    case 'monthly': {
      const day = rule.monthlyDay ?? getDayOfMonth(rule.seedDate);
      return interval === 1 ? `Monthly · ${formatDayOfMonth(day)}` : `Every ${interval} months · ${formatDayOfMonth(day)}`;
    }
    case 'yearly':
      return interval === 1 ? 'Yearly' : `Every ${interval} years`;
    default:
      return 'Recurring';
  }
}

function describeTaskSchedule(task: TaskDraft): string {
  return normalizeRecurrenceMode(task.recurrenceMode) === 'never' ? 'Intermittent' : describeTaskRecurrence(task.recurrence);
}

function describeReminder(leadDays: number): string {
  if (leadDays < 0) return 'No reminder';
  if (leadDays === 0) return 'Day of';
  if (leadDays === 1) return '1 day before';
  return `${leadDays} days before`;
}

export function VehicleForm({ existing, onSaved, onCancel }: VehicleFormProps) {
  const [iconKey, setIconKey] = useState<string>(existing?.icon ?? 'vehicle');
  const [displayName, setDisplayName] = useState(existing?.name ?? '');
  const [make, setMake] = useState(existing?.make ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  const [mileage, setMileage] = useState<number | ''>(existing?.mileage ?? '');
  const [year, setYear] = useState<number | ''>(existing?.year ?? '');
  const [showVehicleInfo, setShowVehicleInfo] = useState(
    Boolean(existing?.year || existing?.make || existing?.model),
  );
  const [layoutEnabled, setLayoutEnabled] = useState(existing ? Boolean(existing.layout) : true);
  const [layoutTemplateSelection, setLayoutTemplateSelection] = useState<VehicleLayoutTemplate>(existing?.layout?.template ?? 'car');
  const [layout, setLayout] = useState<VehicleLayout | undefined>(existing?.layout ?? (existing ? undefined : buildVehicleLayout('car')));
  const [maintenanceTasks, setMaintenanceTasks] = useState<TaskDraft[]>(
    existing?.maintenanceTasks?.map((task) => ({
      id: task.id,
      icon: task.icon ?? '',
      name: task.name,
      kind: task.kind ?? 'maintenance',
      taskType: task.taskType,
      inputFields: task.taskType === 'CIRCUIT'
        ? normalizeCircuitInputFields(task.inputFields as CircuitInputFields)
        : task.inputFields,
      recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
      recurrence: toRecurrenceRule(task.recurrence),
      reminderLeadDays: task.reminderLeadDays ?? 14,
      areaId: task.areaId,
    })) ?? [makeMileageLogTask()],
  );
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [notes, setNotes] = useState<ResourceNote[]>(existing?.notes ?? []);

  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const currentExisting = existing ? resources[existing.id] as VehicleResource | undefined : undefined;

  const canSave = displayName.trim().length > 0;
  const layoutAreas = layout?.areas ?? [];
  const draftVehicleId = existing?.id ?? 'vehicle-draft';

  function getAreaName(areaId: string | undefined): string | null {
    if (!areaId) return null;
    return layoutAreas.find((area) => area.id === areaId)?.name ?? null;
  }

  function addTask() {
    const nextId = uuidv4();
    setMaintenanceTasks((prev) => [
      ...prev,
      {
        id: nextId,
        icon: '',
        name: '',
        kind: 'maintenance',
        recurrenceMode: 'never',
        recurrence: makeDefaultRecurrenceRule(),
        reminderLeadDays: 14,
        areaId: layout?.areas[0]?.id,
      },
    ]);
    setExpandedTaskId(nextId);
  }

  function updateTask(id: string, field: keyof TaskDraft, value: string | number | ResourceRecurrenceRule) {
    setMaintenanceTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, [field]: value } : task)),
    );
  }

  function updateTaskPatch(id: string, patch: Partial<TaskDraft>) {
    setMaintenanceTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  function updateTaskRecurrence(id: string, patch: Partial<ResourceRecurrenceRule>) {
    setMaintenanceTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, recurrence: { ...task.recurrence, ...patch } }
          : task,
      ),
    );
  }

  function toggleTaskDay(id: string, day: RecurrenceDayOfWeek) {
    setMaintenanceTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        const days = task.recurrence.days.includes(day)
          ? task.recurrence.days.filter((entry) => entry !== day)
          : [...task.recurrence.days, day];
        return { ...task, recurrence: { ...task.recurrence, days } };
      }),
    );
  }

  function removeTask(id: string) {
    const taskToRemove = maintenanceTasks.find((task) => task.id === id);
    if (taskToRemove?.kind === 'mileage-log') return;

    setMaintenanceTasks((prev) => prev.filter((task) => task.id !== id));
    setExpandedTaskId((prev) => (prev === id ? null : prev));
  }

  function updateCircuitInputFields(taskId: string, nextInputFields: CircuitInputFields) {
    updateTaskPatch(taskId, { taskType: 'CIRCUIT', inputFields: nextInputFields });
  }

  function handleSave() {
    if (!canSave) return;

    const resourceId = existing?.id ?? uuidv4();
    const resolvedLayout = layoutEnabled ? (layout ?? buildVehicleLayout(layoutTemplateSelection)) : undefined;
    const validAreaIds = new Set((resolvedLayout?.areas ?? []).map((area) => area.id));

    let finalTasks: VehicleMaintenanceTask[] = maintenanceTasks
      .filter((task) => task.name.trim().length > 0)
      .map((task) => ({
        id: task.id,
        icon: task.icon.trim(),
        name: task.name.trim(),
        kind: task.kind ?? 'maintenance',
        taskType: task.taskType,
        inputFields: task.taskType === 'CIRCUIT'
          ? normalizeCircuitInputFields(task.inputFields as CircuitInputFields | undefined)
          : task.inputFields,
        recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
        recurrence: task.recurrence,
        reminderLeadDays: normalizeRecurrenceMode(task.recurrenceMode) === 'recurring' ? task.reminderLeadDays : -1,
        areaId: task.areaId && validAreaIds.has(task.areaId) ? task.areaId : undefined,
      }));

    if (!existing && !finalTasks.some((task) => task.kind === 'mileage-log')) {
      finalTasks.unshift({
        id: uuidv4(),
        icon: 'vehicle',
        name: 'Mileage Log',
        kind: 'mileage-log',
        taskType: 'LOG',
        recurrenceMode: 'never',
        recurrence: makeDefaultRecurrenceRule(),
        reminderLeadDays: -1,
      });
    }

    finalTasks = ensureVehicleInspectionTask(finalTasks, resolvedLayout, Boolean(existing?.layout)) ?? [];

    if (!resolvedLayout) {
      finalTasks = finalTasks.map((task) => ({ ...task, areaId: undefined }));
    }

    const now = new Date().toISOString();
    const resource: VehicleResource = {
      id: resourceId,
      type: 'vehicle',
      icon: iconKey,
      name: displayName.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      make: showVehicleInfo ? (make.trim() || undefined) : undefined,
      model: showVehicleInfo ? (model.trim() || undefined) : undefined,
      year: showVehicleInfo ? (year === '' ? undefined : year) : undefined,
      mileage: mileage === '' ? undefined : mileage,
      licensePlate: existing?.licensePlate,
      insuranceExpiry: existing?.insuranceExpiry,
      insuranceLeadDays: existing?.insuranceLeadDays,
      serviceNextDate: existing?.serviceNextDate,
      serviceLeadDays: existing?.serviceLeadDays,
      layout: resolvedLayout,
      maintenanceTasks: finalTasks.length > 0 ? finalTasks : undefined,
      notes,
      links: currentExisting?.links ?? existing?.links,
      linkedContactId: currentExisting?.linkedContactId ?? existing?.linkedContactId,
      linkedAccountId: currentExisting?.linkedAccountId ?? existing?.linkedAccountId,
      linkedDocIds: currentExisting?.linkedDocIds ?? existing?.linkedDocIds,
      sharedWith: currentExisting?.sharedWith ?? existing?.sharedWith ?? null,
    };

    setResource(resource);

    const updatedInventories = syncVehicleLayoutContainerAssignments(resources, resource.id, resolvedLayout);
    for (const inventory of updatedInventories) {
      setResource(inventory);
    }

    if (!existing && user) {
      setUser({
        ...user,
        resources: {
          ...user.resources,
          vehicles: user.resources.vehicles.includes(resource.id)
            ? user.resources.vehicles
            : [...user.resources.vehicles, resource.id],
        },
      });
    }

    generateScheduledTasks(resource);
    generateGTDItems(resource);
    onSaved();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          Back
        </button>
        <h3 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          {existing ? 'Edit Vehicle' : 'New Vehicle'}
        </h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={`text-sm font-semibold transition-colors ${
            canSave ? 'text-blue-500 hover:text-blue-600' : 'text-gray-300'
          }`}
        >
          Save
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <IconPicker value={iconKey} onChange={setIconKey} />
          <TextInput
            label="Name *"
            value={displayName}
            onChange={setDisplayName}
            placeholder="e.g. Family Car"
            maxLength={100}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <NumberInput
            label="Mileage"
            value={mileage}
            onChange={setMileage}
            placeholder="45000"
            min={0}
          />
          <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              checked={showVehicleInfo}
              onChange={(event) => setShowVehicleInfo(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-500"
            />
            <span>Add vehicle info</span>
          </label>
        </div>

        {showVehicleInfo ? (
          <div className="grid grid-cols-3 gap-3">
            <NumberInput
              label="Year"
              value={year}
              onChange={setYear}
              placeholder="2020"
              min={1900}
              max={2100}
            />
            <TextInput
              label="Make"
              value={make}
              onChange={setMake}
              placeholder="Toyota"
              maxLength={80}
            />
            <TextInput
              label="Model"
              value={model}
              onChange={setModel}
              placeholder="Camry"
              maxLength={80}
            />
          </div>
        ) : null}

        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Vehicle layout</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Group areas and link inventory containers to this vehicle.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-200">
              <input
                type="checkbox"
                checked={layoutEnabled}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setLayoutEnabled(checked);
                  if (checked && !layout) {
                    setLayout(buildVehicleLayout(layoutTemplateSelection));
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-500"
              />
              Enable layout
            </label>
          </div>

          {layoutEnabled ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['bike', 'car', 'truck', 'plane'] as const).map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => {
                      setLayoutTemplateSelection(template);
                      if (!layout) {
                        setLayout(buildVehicleLayout(template));
                      }
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      (layout?.template ?? layoutTemplateSelection) === template
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {template.slice(0, 1).toUpperCase() + template.slice(1)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setLayout(buildVehicleLayout(layoutTemplateSelection))}
                  className="ml-auto text-xs font-medium text-blue-500 hover:text-blue-600"
                >
                  Reset areas
                </button>
              </div>

              {layout ? (
                <VehicleLayoutEditor
                  resource={{
                    ...(existing ?? {
                      id: draftVehicleId,
                      type: 'vehicle',
                      icon: iconKey,
                      name: displayName || 'Vehicle',
                      createdAt: currentExisting?.createdAt ?? new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      sharedWith: null,
                    }),
                    id: draftVehicleId,
                    type: 'vehicle',
                    icon: iconKey,
                    name: displayName || existing?.name || 'Vehicle',
                    createdAt: existing?.createdAt ?? new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    layout,
                    maintenanceTasks,
                    sharedWith: currentExisting?.sharedWith ?? existing?.sharedWith ?? null,
                  }}
                  isEditMode
                  onLayoutChange={setLayout}
                  onMaintenanceTasksChange={(tasks) => setMaintenanceTasks(tasks.map((task) => ({
                    id: task.id,
                    icon: task.icon,
                    name: task.name,
                    kind: task.kind,
                    taskType: task.taskType,
                    inputFields: task.taskType === 'CIRCUIT'
                      ? normalizeCircuitInputFields(task.inputFields as CircuitInputFields | undefined)
                      : task.inputFields,
                    recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
                    recurrence: toRecurrenceRule(task.recurrence),
                    reminderLeadDays: task.reminderLeadDays,
                    areaId: task.areaId,
                  })))}
                />
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">Layout is disabled for this vehicle.</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Maintenance tasks
            </span>
            <button
              type="button"
              onClick={addTask}
              className="text-xs font-medium text-blue-500 hover:text-blue-600"
            >
              + Add task
            </button>
          </div>
          {maintenanceTasks.length === 0 ? (
            <p className="text-xs italic text-gray-400">No maintenance tasks added yet.</p>
          ) : null}
          {maintenanceTasks.map((task) => {
            const isExpanded = expandedTaskId === task.id;
            const isLockedTask = task.kind === 'mileage-log';
            return (
              <div key={task.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-700">
                <button
                  type="button"
                  onClick={() => setExpandedTaskId((prev) => (prev === task.id ? null : task.id))}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white dark:bg-gray-800">
                    <IconDisplay iconKey={task.icon?.trim() || 'vehicle'} size={20} className="h-5 w-5 object-contain" alt="" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                      {task.name.trim() || 'Untitled maintenance task'}
                    </div>
                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {normalizeRecurrenceMode(task.recurrenceMode) === 'recurring'
                        ? `${describeTaskSchedule(task)} · ${describeReminder(task.reminderLeadDays)}`
                        : describeTaskSchedule(task)}
                      {getAreaName(task.areaId) ? ` · ${getAreaName(task.areaId)}` : ''}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-blue-500">{isExpanded ? 'Close' : 'Edit'}</span>
                </button>

                {isExpanded ? (
                  <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-600">
                    <div className="flex items-center gap-2">
                      <IconPicker value={task.icon || 'vehicle'} onChange={(value) => updateTask(task.id, 'icon', value)} align="left" />
                      {isLockedTask ? (
                        <div className="flex-1 rounded-md border border-gray-200 bg-gray-100 px-2 py-1.5 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {task.name}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={task.name}
                          onChange={(event) => updateTask(task.id, 'name', event.target.value)}
                          placeholder="Task name"
                          maxLength={80}
                          className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex rounded-full bg-white p-1 dark:bg-gray-800">
                        {(['recurring', 'never'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => updateTask(task.id, 'recurrenceMode', mode)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                              normalizeRecurrenceMode(task.recurrenceMode) === mode
                                ? 'bg-blue-500 text-white'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            }`}
                          >
                            {mode === 'recurring' ? 'Recurring' : 'Intermittent'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {normalizeRecurrenceMode(task.recurrenceMode) === 'recurring' ? (
                      <div className="space-y-2 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
                        {task.recurrence.frequency === 'monthly' ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Every</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={task.recurrence.interval}
                                  onChange={(event) => updateTaskRecurrence(task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                                  className={SMALL_INPUT_CLS}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Day of month</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={31}
                                  value={task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate)}
                                  onChange={(event) =>
                                    updateTaskRecurrence(task.id, {
                                      monthlyDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                                    })
                                  }
                                  className={SMALL_INPUT_CLS}
                                />
                              </div>
                            </div>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                              Days 29-31 use the last day of shorter months automatically.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Interval</label>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={task.recurrence.interval}
                              onChange={(event) => updateTaskRecurrence(task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                              className={SMALL_INPUT_CLS}
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <div className="ml-auto">
                            <select
                              value={task.recurrence.frequency}
                              onChange={(event) =>
                                updateTaskRecurrence(task.id, {
                                  frequency: event.target.value as ResourceRecurrenceRule['frequency'],
                                  days: event.target.value === 'weekly' ? task.recurrence.days : [],
                                  monthlyDay:
                                    event.target.value === 'monthly'
                                      ? (task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate))
                                      : null,
                                })
                              }
                              className={`w-36 ${SMALL_INPUT_CLS}`}
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                              <option value="yearly">Yearly</option>
                            </select>
                          </div>
                        </div>

                        {task.recurrence.frequency === 'weekly' ? (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days</label>
                            <div className="flex gap-1">
                              {DOW_LABELS.map(({ key, label }) => (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => toggleTaskDay(task.id, key)}
                                  className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
                                    task.recurrence.days.includes(key)
                                      ? 'bg-blue-500 text-white'
                                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start date</label>
                          <input
                            type="date"
                            value={task.recurrence.seedDate}
                            onChange={(event) =>
                              updateTaskRecurrence(task.id, {
                                seedDate: event.target.value,
                                monthlyDay:
                                  task.recurrence.frequency === 'monthly'
                                    ? (task.recurrence.monthlyDay ?? getDayOfMonth(event.target.value))
                                    : task.recurrence.monthlyDay,
                              })
                            }
                            className={SMALL_INPUT_CLS}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Ends on</label>
                          <input
                            type="date"
                            value={task.recurrence.endsOn ?? ''}
                            onChange={(event) => updateTaskRecurrence(task.id, { endsOn: event.target.value || null })}
                            className={SMALL_INPUT_CLS}
                          />
                        </div>
                      </div>
                    ) : null}

                    {normalizeRecurrenceMode(task.recurrenceMode) === 'recurring' ? (
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Reminder:</span>
                        <select
                          value={task.reminderLeadDays}
                          onChange={(event) => updateTask(task.id, 'reminderLeadDays', Number(event.target.value))}
                          className="ml-auto w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value={-1}>No reminder</option>
                          <option value={0}>Day of</option>
                          <option value={3}>3 days before</option>
                          <option value={7}>7 days before</option>
                          <option value={14}>14 days before</option>
                          <option value={30}>30 days before</option>
                        </select>
                      </div>
                    ) : null}

                    {layoutAreas.length > 0 && task.kind !== 'mileage-log' ? (
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">Area:</span>
                        <select
                          value={task.areaId ?? ''}
                          onChange={(event) => updateTaskPatch(task.id, { areaId: event.target.value || undefined })}
                          className="ml-auto w-40 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        >
                          <option value="">No area link</option>
                          {layoutAreas.map((area) => (
                            <option key={area.id} value={area.id}>{area.name || 'Untitled area'}</option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {task.taskType === 'CIRCUIT' ? (() => {
                      const circuitFields = normalizeCircuitInputFields(task.inputFields as CircuitInputFields | undefined);
                      return (
                        <div className="space-y-3 rounded-md border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800/70">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Inspection steps</p>
                              <p className="text-[11px] text-gray-400 dark:text-gray-500">{circuitFields.steps.length} step{circuitFields.steps.length === 1 ? '' : 's'} in template</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => updateCircuitInputFields(task.id, { ...circuitFields, steps: [...circuitFields.steps, makeDefaultCircuitStep()] })}
                              className="text-xs font-medium text-blue-500 hover:text-blue-600"
                            >
                              + Add step
                            </button>
                          </div>
                          <input
                            type="text"
                            value={circuitFields.label}
                            onChange={(event) => updateCircuitInputFields(task.id, { ...circuitFields, label: event.target.value })}
                            placeholder="Circuit label"
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                          />
                          <div className="space-y-2">
                            {circuitFields.steps.map((step, stepIndex) => (
                              <div key={step.id} className="space-y-2 rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-700">
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      type="button"
                                      disabled={stepIndex === 0}
                                      onClick={() => {
                                        const nextSteps = [...circuitFields.steps];
                                        [nextSteps[stepIndex - 1], nextSteps[stepIndex]] = [nextSteps[stepIndex], nextSteps[stepIndex - 1]];
                                        updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                      }}
                                      className="flex h-5 w-5 items-center justify-center rounded text-xs text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      disabled={stepIndex === circuitFields.steps.length - 1}
                                      onClick={() => {
                                        const nextSteps = [...circuitFields.steps];
                                        [nextSteps[stepIndex], nextSteps[stepIndex + 1]] = [nextSteps[stepIndex + 1], nextSteps[stepIndex]];
                                        updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                      }}
                                      className="flex h-5 w-5 items-center justify-center rounded text-xs text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                                    >
                                      ▼
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={step.label}
                                    onChange={(event) => {
                                      const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? { ...entry, label: event.target.value } : entry);
                                      updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                    }}
                                    placeholder="Step label"
                                    className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  />
                                  <select
                                    value={step.stepType}
                                    onChange={(event) => {
                                      const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? applyCircuitStepDefaults(entry, event.target.value as CircuitStepType) : entry);
                                      updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                    }}
                                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  >
                                    {CIRCUIT_STEP_TYPES.map((stepType) => (
                                      <option key={stepType} value={stepType}>{stepType}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => updateCircuitInputFields(task.id, { ...circuitFields, steps: circuitFields.steps.filter((entry) => entry.id !== step.id) })}
                                    className="text-xs text-gray-400 hover:text-red-400"
                                  >
                                    Remove
                                  </button>
                                </div>

                                {step.stepType === 'CHOICE' ? (
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Options</p>
                                    {(step.options ?? []).map((option, optionIndex) => (
                                      <div key={`${step.id}-option-${optionIndex}`} className="flex gap-2">
                                        <input
                                          type="text"
                                          value={option}
                                          onChange={(event) => {
                                            const nextOptions = [...(step.options ?? [])];
                                            nextOptions[optionIndex] = event.target.value;
                                            const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? { ...entry, options: nextOptions } : entry);
                                            updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                          }}
                                          className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? { ...entry, options: (step.options ?? []).filter((_, idx) => idx !== optionIndex) } : entry);
                                            updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                          }}
                                          className="text-xs text-gray-400 hover:text-red-400"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? { ...entry, options: [...(step.options ?? []), ''] } : entry);
                                        updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                      }}
                                      className="text-xs font-medium text-blue-500 hover:text-blue-600"
                                    >
                                      + Add option
                                    </button>
                                  </div>
                                ) : null}

                                {step.stepType === 'RATING' ? (
                                  <input
                                    type="number"
                                    value={step.scale ?? 5}
                                    min={2}
                                    onChange={(event) => {
                                      const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? { ...entry, scale: Math.max(2, Number(event.target.value) || 5) } : entry);
                                      updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                    }}
                                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  />
                                ) : null}

                                {step.stepType === 'COUNTER' ? (
                                  <div className="grid grid-cols-2 gap-2">
                                    <input
                                      type="number"
                                      value={step.target ?? 1}
                                      min={1}
                                      onChange={(event) => {
                                        const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? { ...entry, target: Math.max(1, Number(event.target.value) || 1) } : entry);
                                        updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                      }}
                                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                    />
                                    <input
                                      type="text"
                                      value={step.unit ?? ''}
                                      onChange={(event) => {
                                        const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? { ...entry, unit: event.target.value } : entry);
                                        updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                      }}
                                      placeholder="Unit"
                                      className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                    />
                                  </div>
                                ) : null}

                                {step.stepType === 'DURATION' ? (
                                  <input
                                    type="number"
                                    value={step.target ?? 5}
                                    min={1}
                                    onChange={(event) => {
                                      const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? { ...entry, target: Math.max(1, Number(event.target.value) || 1) } : entry);
                                      updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                    }}
                                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  />
                                ) : null}

                                {step.stepType === 'TIMER' ? (
                                  <input
                                    type="number"
                                    value={step.seconds ?? 60}
                                    min={1}
                                    onChange={(event) => {
                                      const nextSteps = circuitFields.steps.map((entry) => entry.id === step.id ? { ...entry, seconds: Math.max(1, Number(event.target.value) || 1) } : entry);
                                      updateCircuitInputFields(task.id, { ...circuitFields, steps: nextSteps });
                                    }}
                                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })() : null}

                    <div className="flex items-center justify-between pt-1">
                      {isLockedTask ? (
                        <span className="text-xs text-gray-400">Required task</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeTask(task.id)}
                          className="text-xs text-gray-400 hover:text-red-400"
                        >
                          Remove
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedTaskId(null)}
                        className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <NotesLogEditor
          notes={notes}
          onChange={setNotes}
          resource={existing}
          linkTabLabel="Users"
          allowedLinkTypes={['contact']}
        />
      </div>
    </div>
  );
}
