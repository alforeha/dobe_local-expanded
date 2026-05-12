import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { QuickActionsEvent } from '../../../../../../types/event';
import type { Task } from '../../../../../../types/task';
import {
  normalizeCircuitInputFields,
  type CircuitInputFields,
  type InputFields,
  type TaskTemplate,
  type TaskType,
} from '../../../../../../types/taskTemplate';
import type {
  AlbumEntry,
  ResourceRecurrenceRule,
  VehicleLayout,
  VehicleLayoutTemplate,
  VehicleMaintenanceTask,
  VehicleResource,
} from '../../../../../../types/resource';
import {
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  toRecurrenceRule,
  type RecurrenceDayOfWeek,
} from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { awardStat, awardXP } from '../../../../../../engine/awardPipeline';
import {
  buildVehicleInspectionTask,
  ensureVehicleInspectionTask,
  generateGTDItems,
  generateScheduledTasks,
  syncVehicleLayoutContainerAssignments,
} from '../../../../../../engine/resourceEngine';
import { getAppDate, getAppNowISO } from '../../../../../../utils/dateUtils';
import { ICON_MAP } from '../../../../../../constants/iconMap';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { ResourceFormShell, type ResourceFormTab } from '../../../../../shared/ResourceFormShell';
import { ResourceLinksTabNew } from '../../../../../shared/ResourceLinksTabNew';
import { AlbumViewer } from '../../../../../shared/AlbumViewer';
import { AlbumEntryEditor } from '../../../../../shared/AlbumEntryEditor';
import { TaskTypeConfigEditor } from '../../../../../shared/TaskTypeConfigEditor';
import { TaskTypeInputRenderer } from '../../../../../overlays/event/TaskTypeInputRenderer';
import { VehicleLayout as VehicleLayoutEditor } from './VehicleLayout';
import { buildVehicleLayout } from './vehicleLayoutTemplates';

interface VehicleFormNewProps {
  existing?: VehicleResource;
  onSaved: () => void;
  registerOnAutoSave?: (callback: (() => void) | null) => void;
}

interface VehicleTaskDraft extends VehicleMaintenanceTask {
  recurrenceMode: 'recurring' | 'never';
  inputFields?: Partial<InputFields>;
}

interface ExecuteCompletionSummary {
  taskId: string;
  taskName: string;
  note: string | null;
}

interface ExecuteTaskInputProps {
  taskId: string;
  executionTemplate: TaskTemplate;
  executionTask: Task;
  onCompleteTask: (taskId: string, result: Partial<InputFields>) => void;
  onResultChangeTask: (taskId: string, result: Partial<InputFields>) => void;
}

const tabs: ResourceFormTab[] = [
  { key: 'details', label: 'Details' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'links', label: 'Links' },
  { key: 'album', label: 'Album' },
  { key: 'layout', label: 'Layout' },
];

const VEHICLE_TASK_TYPE_OPTIONS: Array<{ value: TaskType; label: string }> = [
  { value: 'CHECK', label: 'Check' },
  { value: 'COUNTER', label: 'Counter' },
  { value: 'DURATION', label: 'Duration' },
  { value: 'TIMER', label: 'Timer' },
  { value: 'RATING', label: 'Rating' },
  { value: 'TEXT', label: 'Text' },
  { value: 'CHOICE', label: 'Choice' },
  { value: 'SCAN', label: 'Scan' },
  { value: 'CIRCUIT', label: 'Circuit' },
];

const DOW_LABELS: Array<{ key: RecurrenceDayOfWeek; label: string }> = [
  { key: 'sun', label: 'Su' },
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Tu' },
  { key: 'wed', label: 'We' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
];

const SELECT_CLS =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function ExecuteTaskInput({
  taskId,
  executionTemplate,
  executionTask,
  onCompleteTask,
  onResultChangeTask,
}: ExecuteTaskInputProps) {
  return (
    <TaskTypeInputRenderer
      taskType={executionTemplate.taskType}
      template={executionTemplate}
      task={executionTask}
      onComplete={(result) => onCompleteTask(taskId, result)}
      onResultChange={(result) => onResultChangeTask(taskId, result)}
    />
  );
}

function cloneRecurrenceRule(rule: ResourceRecurrenceRule): ResourceRecurrenceRule {
  return {
    ...rule,
    days: [...rule.days],
  };
}

function normaliseVehicleTaskType(taskType?: string | null): TaskType {
  switch (taskType) {
    case 'COUNTER':
    case 'DURATION':
    case 'TIMER':
    case 'RATING':
    case 'TEXT':
    case 'CHOICE':
    case 'SCAN':
    case 'CIRCUIT':
    case 'CHECK':
      return taskType;
    default:
      return 'CHECK';
  }
}

function buildTaskInputFields(taskType: string, title: string, inputFields?: Partial<InputFields> | null): Partial<InputFields> {
  const normalizedTaskType = normaliseVehicleTaskType(taskType);

  switch (normalizedTaskType) {
    case 'COUNTER':
      return { target: 1, unit: 'count', step: 1, ...(inputFields ?? {}) };
    case 'DURATION':
      return { target: 5, label: title || 'Duration', ...(inputFields ?? {}) };
    case 'TIMER':
      return { countdownFrom: 60, ...(inputFields ?? {}) };
    case 'RATING':
      return { scale: 5, label: title || 'Rate this', ...(inputFields ?? {}) };
    case 'TEXT':
      return { prompt: title || 'Add details', maxLength: null, ...(inputFields ?? {}) };
    case 'CHOICE':
      return { label: title || 'Choose', options: ['Pass', 'Fail'], ...(inputFields ?? {}) };
    case 'SCAN':
      return { label: title || 'Scan', ...(inputFields ?? {}) };
    case 'CIRCUIT':
      return normalizeCircuitInputFields(inputFields as CircuitInputFields | undefined);
    case 'CHECK':
    default:
      return { label: title || 'Done', ...(inputFields ?? {}) };
  }
}

function toTaskDraft(task: VehicleMaintenanceTask, defaultIcon: string): VehicleTaskDraft {
  return {
    id: task.id,
    icon: task.icon?.trim() || defaultIcon,
    name: task.name ?? '',
    kind: task.kind ?? 'maintenance',
    taskType: task.taskType ?? (task.kind === 'mileage-log' ? 'COUNTER' : 'CHECK'),
    recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
    recurrence: toRecurrenceRule(task.recurrence),
    reminderLeadDays: task.reminderLeadDays ?? -1,
    inputFields: task.taskType === 'CIRCUIT'
      ? normalizeCircuitInputFields(task.inputFields as CircuitInputFields | undefined)
      : buildTaskInputFields(task.taskType ?? 'CHECK', task.name, task.inputFields),
  };
}

function makeBlankTaskDraft(defaultIcon: string): VehicleTaskDraft {
  return {
    id: uuidv4(),
    icon: defaultIcon,
    name: '',
    kind: 'maintenance',
    taskType: 'CHECK',
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: -1,
    inputFields: buildTaskInputFields('CHECK', ''),
  };
}

function makeMileageLogTask(defaultIcon: string): VehicleTaskDraft {
  return {
    id: uuidv4(),
    icon: defaultIcon,
    name: 'Mileage Log',
    kind: 'mileage-log',
    taskType: 'COUNTER',
    inputFields: { target: 1, unit: 'miles', step: 1 },
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: -1,
  };
}

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
      return 'On demand';
  }
}

function describeCollapsedTaskRecurrence(task: VehicleTaskDraft): string {
  return normalizeRecurrenceMode(task.recurrenceMode) === 'never'
    ? 'On demand'
    : describeTaskRecurrence(task.recurrence);
}

function extractExecutionNote(result: Partial<InputFields>): string | null {
  const fields = result as Record<string, unknown>;
  const candidates = ['value', 'note', 'text', 'description', 'comment']
    .map((key) => fields[key]);
  const match = candidates.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return match?.trim() ?? null;
}

function isVehicleLayoutCustomized(layout: VehicleLayout | undefined): boolean {
  if (!layout) return false;
  const defaultLayout = buildVehicleLayout(layout.template);
  if (layout.areas.length !== defaultLayout.areas.length) return true;

  return layout.areas.some((area, index) => {
    const seededArea = defaultLayout.areas[index];
    if (!seededArea) return true;
    return area.name !== seededArea.name
      || area.icon !== seededArea.icon
      || area.zoneId !== seededArea.zoneId
      || area.containerIds.length > 0
      || (area.inspectionHistory?.length ?? 0) > 0;
  });
}

function remapAreaIdsForTemplateChange(
  currentLayout: VehicleLayout,
  nextLayout: VehicleLayout,
  keepContainers: boolean,
): VehicleLayout {
  const nextAreas = nextLayout.areas.map((area) => ({ ...area, containerIds: [] as string[] }));
  const matchAreaByName = (name: string) => nextAreas.find((area) => area.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? nextAreas[0];

  if (keepContainers) {
    for (const existingArea of currentLayout.areas) {
      const targetArea = matchAreaByName(existingArea.name);
      if (!targetArea) continue;
      targetArea.containerIds = [...new Set([...targetArea.containerIds, ...existingArea.containerIds])];
    }
  }

  return {
    ...nextLayout,
    areas: nextAreas,
  };
}

function remapMaintenanceTasksForLayoutChange(
  tasks: VehicleTaskDraft[],
  nextLayout: VehicleLayout | undefined,
): VehicleTaskDraft[] {
  return tasks.map((task) => {
    if (task.taskType === 'CIRCUIT' && task.name === 'Vehicle Inspection') {
      const seededInspection = nextLayout ? buildVehicleInspectionTask(nextLayout) : null;
      return {
        ...task,
        inputFields: seededInspection?.inputFields ?? task.inputFields,
      };
    }

    return task;
  });
}

export function VehicleFormNew({ existing, onSaved, registerOnAutoSave }: VehicleFormNewProps) {
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const setScheduleTask = useScheduleStore((s) => s.setTask);
  const setActiveEvent = useScheduleStore((s) => s.setActiveEvent);

  const [draftVehicleId] = useState(() => existing?.id ?? uuidv4());
  const currentExisting = resources[draftVehicleId]?.type === 'vehicle'
    ? resources[draftVehicleId] as VehicleResource
    : undefined;
  const vehicleIconKeys = useMemo(
    () => Object.keys(ICON_MAP).filter((key) => key.startsWith('vehicle-icon-')),
    [],
  );
  const defaultVehicleIcon = vehicleIconKeys[0] ?? 'vehicle-icon-car';

  const [activeTab, setActiveTab] = useState('details');
  const [iconKey, setIconKey] = useState(existing?.icon ?? currentExisting?.icon ?? defaultVehicleIcon);
  const [displayName, setDisplayName] = useState(existing?.name ?? currentExisting?.name ?? '');
  const [year, setYear] = useState<number | ''>(existing?.year ?? currentExisting?.year ?? '');
  const [make, setMake] = useState(existing?.make ?? currentExisting?.make ?? '');
  const [model, setModel] = useState(existing?.model ?? currentExisting?.model ?? '');
  const [mileage, setMileage] = useState<number | ''>(existing?.mileage ?? currentExisting?.mileage ?? '');
  const [licensePlate, setLicensePlate] = useState(existing?.licensePlate ?? currentExisting?.licensePlate ?? '');
  const [insuranceExpiry, setInsuranceExpiry] = useState(existing?.insuranceExpiry ?? currentExisting?.insuranceExpiry ?? '');
  const [insuranceLeadDays, setInsuranceLeadDays] = useState<number | ''>(existing?.insuranceLeadDays ?? currentExisting?.insuranceLeadDays ?? '');
  const [serviceNextDate, setServiceNextDate] = useState(existing?.serviceNextDate ?? currentExisting?.serviceNextDate ?? '');
  const [serviceLeadDays, setServiceLeadDays] = useState<number | ''>(existing?.serviceLeadDays ?? currentExisting?.serviceLeadDays ?? '');
  const [album, setAlbum] = useState<AlbumEntry[]>(existing?.album ?? currentExisting?.album ?? []);
  const [layoutSelection, setLayoutSelection] = useState<'none' | VehicleLayoutTemplate>(existing?.layout?.template ?? currentExisting?.layout?.template ?? 'none');
  const [layout, setLayout] = useState<VehicleLayout | undefined>(existing?.layout ?? currentExisting?.layout);
  const [taskDrafts, setTaskDrafts] = useState<VehicleTaskDraft[]>(
    (existing?.maintenanceTasks ?? currentExisting?.maintenanceTasks)?.map((task) => toTaskDraft(task, defaultVehicleIcon))
      ?? [makeMileageLogTask(defaultVehicleIcon)],
  );
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedTaskDraft, setExpandedTaskDraft] = useState<VehicleTaskDraft | null>(null);
  const [expandedTaskIsNew, setExpandedTaskIsNew] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [taskEditorTabs, setTaskEditorTabs] = useState<Record<string, 'schedule' | 'action'>>({});
  const [confirmRemoveTaskId, setConfirmRemoveTaskId] = useState<string | null>(null);
  const [executingTaskIds, setExecutingTaskIds] = useState<Record<string, boolean>>({});
  const [taskExecutionDrafts, setTaskExecutionDrafts] = useState<Record<string, Partial<InputFields>>>({});
  const [executeCompletionSummary, setExecuteCompletionSummary] = useState<ExecuteCompletionSummary | null>(null);
  const [gtdPushFeedbackTaskId, setGtdPushFeedbackTaskId] = useState<string | null>(null);
  const [isAlbumEditorOpen, setIsAlbumEditorOpen] = useState(false);
  const [editingAlbumEntry, setEditingAlbumEntry] = useState<AlbumEntry | undefined>(undefined);

  useEffect(() => {
    if (!executeCompletionSummary) return undefined;
    const timeoutId = window.setTimeout(() => {
      setExecuteCompletionSummary((current) => (
        current?.taskId === executeCompletionSummary.taskId ? null : current
      ));
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [executeCompletionSummary]);

  useEffect(() => {
    if (!gtdPushFeedbackTaskId) return undefined;
    const timeoutId = window.setTimeout(() => {
      setGtdPushFeedbackTaskId((current) => (current === gtdPushFeedbackTaskId ? null : current));
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [gtdPushFeedbackTaskId]);

  const canSave = displayName.trim().length > 0;
  const expandedTask = expandedTaskDraft ?? (
    expandedTaskId
      ? taskDrafts.find((task) => task.id === expandedTaskId) ?? null
      : null
  );
  const hasExpandedTask = expandedTask != null;

  function updateTaskDraft(taskId: string, patch: Partial<VehicleTaskDraft>) {
    setExpandedTaskDraft((prev) => (
      prev && prev.id === taskId ? { ...prev, ...patch } : prev
    ));
  }

  function updateTaskRecurrence(taskId: string, patch: Partial<ResourceRecurrenceRule>) {
    setExpandedTaskDraft((prev) => (
      prev && prev.id === taskId
        ? { ...prev, recurrence: { ...prev.recurrence, ...patch } }
        : prev
    ));
  }

  function toggleTaskDay(taskId: string, day: RecurrenceDayOfWeek) {
    setExpandedTaskDraft((prev) => {
      if (!prev || prev.id !== taskId) return prev;
      const days = prev.recurrence.days.includes(day)
        ? prev.recurrence.days.filter((entry) => entry !== day)
        : [...prev.recurrence.days, day];
      return { ...prev, recurrence: { ...prev.recurrence, days } };
    });
  }

  function openExistingTaskEditor(task: VehicleTaskDraft) {
    setIsCreatingTask(false);
    setNewTaskName('');
    setExpandedTaskId(task.id);
    setExpandedTaskDraft({
      ...task,
      recurrence: cloneRecurrenceRule(task.recurrence),
      inputFields: task.inputFields ? { ...task.inputFields } : undefined,
    });
    setExpandedTaskIsNew(false);
    setTaskEditorTabs((prev) => ({ ...prev, [task.id]: prev[task.id] ?? 'schedule' }));
    setActiveTab('tasks');
    setConfirmRemoveTaskId(null);
    setExecuteCompletionSummary(null);
  }

  const normalizeTaskDraft = useCallback((task: VehicleTaskDraft): VehicleTaskDraft => ({
    ...task,
    icon: task.icon.trim() || defaultVehicleIcon,
    kind: task.kind ?? 'maintenance',
    taskType: task.taskType ?? (task.kind === 'mileage-log' ? 'COUNTER' : 'CHECK'),
    recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
    recurrence: cloneRecurrenceRule(task.recurrence),
    inputFields: task.taskType === 'CIRCUIT'
      ? normalizeCircuitInputFields(task.inputFields as CircuitInputFields | undefined)
      : buildTaskInputFields(task.taskType ?? 'CHECK', task.name.trim(), task.inputFields),
  }), [defaultVehicleIcon]);

  const mergeExpandedTaskIntoTaskDrafts = useCallback((sourceTaskDrafts: VehicleTaskDraft[]): VehicleTaskDraft[] => {
    if (!expandedTaskId || !expandedTaskDraft || expandedTaskDraft.id !== expandedTaskId) {
      return sourceTaskDrafts;
    }

    const normalizedTask = normalizeTaskDraft(expandedTaskDraft);
    if (expandedTaskIsNew) {
      return normalizedTask.name.trim() ? [...sourceTaskDrafts, normalizedTask] : sourceTaskDrafts;
    }

    return sourceTaskDrafts.map((task) => (task.id === normalizedTask.id ? normalizedTask : task));
  }, [expandedTaskDraft, expandedTaskId, expandedTaskIsNew, normalizeTaskDraft]);

  const buildPersistedMaintenanceTasks = useCallback((sourceTaskDrafts: VehicleTaskDraft[], sourceLayout: VehicleLayout | undefined) => {
    let finalTasks = mergeExpandedTaskIntoTaskDrafts(sourceTaskDrafts)
      .filter((task) => task.name.trim().length > 0)
      .map((task) => ({
        id: task.id,
        icon: task.icon.trim() || defaultVehicleIcon,
        name: task.name.trim(),
        kind: task.kind ?? 'maintenance',
        taskType: task.taskType ?? (task.kind === 'mileage-log' ? 'COUNTER' : 'CHECK'),
        inputFields: task.taskType === 'CIRCUIT'
          ? normalizeCircuitInputFields(task.inputFields as CircuitInputFields | undefined)
          : buildTaskInputFields(task.taskType ?? 'CHECK', task.name.trim(), task.inputFields),
        recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
        recurrence: cloneRecurrenceRule(task.recurrence),
        reminderLeadDays: task.reminderLeadDays,
      })) as VehicleMaintenanceTask[];

    if (!existing && !currentExisting && !finalTasks.some((task) => task.kind === 'mileage-log')) {
      finalTasks = [{
        id: uuidv4(),
        icon: defaultVehicleIcon,
        name: 'Mileage Log',
        kind: 'mileage-log',
        taskType: 'COUNTER',
        inputFields: { target: 1, unit: 'miles', step: 1 },
        recurrenceMode: 'never',
        recurrence: makeDefaultRecurrenceRule(),
        reminderLeadDays: -1,
      }, ...finalTasks];
    }

    return ensureVehicleInspectionTask(finalTasks, sourceLayout, Boolean(existing?.layout ?? currentExisting?.layout)) ?? [];
  }, [currentExisting, defaultVehicleIcon, existing, mergeExpandedTaskIntoTaskDrafts]);

  function commitExpandedTaskAndClose() {
    const nextTaskDrafts = mergeExpandedTaskIntoTaskDrafts(taskDrafts);
    setTaskDrafts(nextTaskDrafts);
    setExpandedTaskDraft(null);
    setExpandedTaskId(null);
    setExpandedTaskIsNew(false);
    setConfirmRemoveTaskId(null);
  }

  function discardExpandedNewTask() {
    setExpandedTaskDraft(null);
    setExpandedTaskId(null);
    setExpandedTaskIsNew(false);
    setConfirmRemoveTaskId(null);
  }

  function beginTaskCreation() {
    setIsCreatingTask(true);
    setNewTaskName('');
    setExpandedTaskDraft(null);
    setExpandedTaskId(null);
    setExpandedTaskIsNew(false);
    setConfirmRemoveTaskId(null);
    setExecuteCompletionSummary(null);
  }

  function cancelTaskCreation() {
    setIsCreatingTask(false);
    setNewTaskName('');
  }

  function createTaskFromPrompt() {
    const trimmedName = newTaskName.trim();
    if (!trimmedName) return;
    const nextTask = {
      ...makeBlankTaskDraft(defaultVehicleIcon),
      name: trimmedName,
      inputFields: buildTaskInputFields('CHECK', trimmedName),
    };
    setIsCreatingTask(false);
    setNewTaskName('');
    setExpandedTaskId(nextTask.id);
    setExpandedTaskDraft(nextTask);
    setExpandedTaskIsNew(true);
    setTaskEditorTabs((prev) => ({ ...prev, [nextTask.id]: 'schedule' }));
    setActiveTab('tasks');
    setConfirmRemoveTaskId(null);
    setExecuteCompletionSummary(null);
  }

  const handleTaskExecutionResultChange = useCallback((taskId: string, result: Partial<InputFields>) => {
    setTaskExecutionDrafts((prev) => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        ...result,
      },
    }));
  }, []);

  const handleTaskExecutionComplete = useCallback((taskId: string, result: Partial<InputFields>) => {
    const task = expandedTaskDraft?.id === taskId
      ? expandedTaskDraft
      : taskDrafts.find((entry) => entry.id === taskId);
    const userId = user?.system.id;
    if (!task || !userId) return;

    const now = getAppNowISO();
    const today = getAppDate();
    const qaEventId = `qa-${today}`;
    const existingQaEvent = useScheduleStore.getState().activeEvents[qaEventId];
    const qaEvent: QuickActionsEvent =
      existingQaEvent && 'completions' in existingQaEvent
        ? existingQaEvent
        : {
            id: qaEventId,
            eventType: 'quickActions',
            date: today,
            completions: [],
            xpAwarded: 0,
            sharedCompletions: null,
          };

    const completionTaskId = crypto.randomUUID();
    const completionTask: Task = ({
      id: completionTaskId,
      templateRef: null,
      isUnique: true,
      title: task.name.trim() || 'Untitled vehicle task',
      taskType: normaliseVehicleTaskType(task.taskType),
      completionState: 'complete',
      completedAt: now,
      resultFields: {
        ...(result ?? {}),
        resourceTaskId: existing ? `resource-task:${existing.id}:vehicle-task:${task.id}` : undefined,
      },
      icon: task.icon.trim() || iconKey,
      resourceRef: existing?.id ?? null,
      attachmentRef: null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    } as unknown) as Task;

    setScheduleTask(completionTask);
    setActiveEvent({
      ...qaEvent,
      completions: [...qaEvent.completions, { taskRef: completionTaskId, completedAt: now }],
      xpAwarded: (qaEvent.xpAwarded ?? 0) + 5,
    });
    awardXP(userId, 5, {
      statGroup: 'agility',
      source: 'vehicle-task.execute.quickActions',
    });
    awardStat(userId, 'agility', 5, 'vehicle-task.execute.quickActions');
    setTaskExecutionDrafts((prev) => ({ ...prev, [taskId]: { ...result } }));
    setExecuteCompletionSummary({
      taskId,
      taskName: task.name.trim() || 'Untitled vehicle task',
      note: extractExecutionNote(result),
    });
    setExecutingTaskIds((prev) => ({ ...prev, [taskId]: false }));
  }, [existing, expandedTaskDraft, iconKey, setActiveEvent, setScheduleTask, taskDrafts, user]);

  const pushTaskToGtd = useCallback((task: VehicleTaskDraft) => {
    const latestUser = useUserStore.getState().user ?? user;
    const persistedVehicleId = existing?.id ?? currentExisting?.id;
    if (!persistedVehicleId || !latestUser || gtdPushFeedbackTaskId === task.id) return;

    const dueDate = getAppDate();
    const resourceTaskId = `resource-task:${persistedVehicleId}:vehicle-task:${task.id}`;
    const existingPendingTaskId = latestUser.lists.gtdList.find((taskId) => {
      const existingTask = useScheduleStore.getState().tasks[taskId];
      if (!existingTask || existingTask.completionState !== 'pending') return false;
      const fields = existingTask.resultFields as Record<string, unknown>;
      return fields.resourceTaskId === resourceTaskId && fields.dueDate === dueDate;
    });
    if (existingPendingTaskId) {
      setGtdPushFeedbackTaskId(task.id);
      return;
    }

    const taskType = normaliseVehicleTaskType(task.taskType);
    const nextTask: Task = {
      id: uuidv4(),
      templateRef: resourceTaskId,
      isUnique: true,
      title: task.name.trim() || 'Untitled vehicle task',
      taskType,
      completionState: 'pending',
      completedAt: null,
      resultFields: ({
        ...buildTaskInputFields(taskType, task.name.trim(), task.inputFields),
        resourceTaskId,
        dueDate,
        label: task.name.trim() || 'Untitled vehicle task',
      } as unknown) as Task['resultFields'],
      attachmentRef: null,
      resourceRef: persistedVehicleId,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    };

    setScheduleTask(nextTask);
    setUser({
      ...latestUser,
      lists: {
        ...latestUser.lists,
        gtdList: [...new Set([...latestUser.lists.gtdList, nextTask.id])],
      },
    });
    setGtdPushFeedbackTaskId(task.id);
  }, [currentExisting?.id, existing?.id, gtdPushFeedbackTaskId, setScheduleTask, setUser, user]);

  function handleLayoutSelectionChange(nextSelection: 'none' | VehicleLayoutTemplate) {
    if (nextSelection === layoutSelection) return;

    const shouldConfirm = isVehicleLayoutCustomized(layout);

    if (!shouldConfirm) {
      if (nextSelection === 'none') {
        setLayout(undefined);
        setTaskDrafts((prev) => remapMaintenanceTasksForLayoutChange(prev, undefined));
      } else {
        const nextLayout = buildVehicleLayout(nextSelection);
        setLayout(nextLayout);
        setTaskDrafts((prev) => remapMaintenanceTasksForLayoutChange(prev, nextLayout));
      }
      setLayoutSelection(nextSelection);
      return;
    }

    const confirmed = window.confirm(
      nextSelection === 'none'
        ? 'Disable the current vehicle layout?\n\nChoose OK to continue to the keep/delete step.'
        : `Switch the vehicle layout to ${nextSelection}?\n\nChoose OK to continue to the keep/delete step.`,
    );
    if (!confirmed) return;

    const keepContainers = window.confirm(
      'Keep existing linked containers?\n\nChoose OK to keep them and remap them into the new layout.\nChoose Cancel to clear existing container assignments.',
    );

    if (nextSelection === 'none') {
      setLayout(undefined);
      setTaskDrafts((prev) => remapMaintenanceTasksForLayoutChange(prev, undefined));
      setLayoutSelection('none');
      return;
    }

    const reseededLayout = remapAreaIdsForTemplateChange(layout ?? buildVehicleLayout(nextSelection), buildVehicleLayout(nextSelection), keepContainers);
    setLayout(reseededLayout);
    setTaskDrafts((prev) => remapMaintenanceTasksForLayoutChange(prev, reseededLayout));
    setLayoutSelection(nextSelection);
  }

  function handleResetCurrentLayout() {
    if (layoutSelection === 'none') return;

    const shouldConfirm = isVehicleLayoutCustomized(layout);
    if (shouldConfirm) {
      const confirmed = window.confirm(
        'Reset the current layout template?\n\nChoose OK to continue to the keep/delete step.',
      );
      if (!confirmed) return;
    }

    const keepContainers = shouldConfirm
      ? window.confirm(
          'Keep existing linked containers?\n\nChoose OK to keep them and remap them into the reset layout.\nChoose Cancel to clear existing container assignments.',
        )
      : true;

    const nextLayout = remapAreaIdsForTemplateChange(layout ?? buildVehicleLayout(layoutSelection), buildVehicleLayout(layoutSelection), keepContainers);
    setLayout(nextLayout);
    setTaskDrafts((prev) => remapMaintenanceTasksForLayoutChange(prev, nextLayout));
  }

  const handleSave = useCallback((options?: { closeAfterSave?: boolean }) => {
    if (!canSave) return false;

    const nextTaskDrafts = mergeExpandedTaskIntoTaskDrafts(taskDrafts);
    if (nextTaskDrafts !== taskDrafts) {
      setTaskDrafts(nextTaskDrafts);
    }

    const now = new Date().toISOString();
    const resolvedLayout = layoutSelection === 'none'
      ? undefined
      : (layout ?? buildVehicleLayout(layoutSelection));
    const finalTasks = buildPersistedMaintenanceTasks(nextTaskDrafts, resolvedLayout);
    const resourceId = existing?.id ?? currentExisting?.id ?? draftVehicleId;

    const resource: VehicleResource = {
      id: resourceId,
      type: 'vehicle',
      icon: iconKey,
      name: displayName.trim(),
      createdAt: existing?.createdAt ?? currentExisting?.createdAt ?? now,
      updatedAt: now,
      make: make.trim() || undefined,
      model: model.trim() || undefined,
      year: year === '' ? undefined : year,
      mileage: mileage === '' ? undefined : mileage,
      licensePlate: licensePlate.trim() || undefined,
      insuranceExpiry: insuranceExpiry || undefined,
      insuranceLeadDays: insuranceLeadDays === '' ? undefined : insuranceLeadDays,
      serviceNextDate: serviceNextDate || undefined,
      serviceLeadDays: serviceLeadDays === '' ? undefined : serviceLeadDays,
      layout: resolvedLayout,
      maintenanceTasks: finalTasks.length > 0 ? finalTasks : undefined,
      notes: currentExisting?.notes ?? existing?.notes,
      links: currentExisting?.links ?? existing?.links,
      album: album.length > 0 ? album : undefined,
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

    if (!existing && !currentExisting && user) {
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
    if (options?.closeAfterSave !== false) {
      onSaved();
    }
    return true;
  }, [
    album,
    buildPersistedMaintenanceTasks,
    canSave,
    currentExisting,
    displayName,
    draftVehicleId,
    existing,
    iconKey,
    insuranceExpiry,
    insuranceLeadDays,
    layout,
    layoutSelection,
    licensePlate,
    make,
    mergeExpandedTaskIntoTaskDrafts,
    mileage,
    model,
    onSaved,
    resources,
    serviceLeadDays,
    serviceNextDate,
    setResource,
    setUser,
    taskDrafts,
    user,
    year,
  ]);

  useEffect(() => {
    registerOnAutoSave?.(() => {
      handleSave({ closeAfterSave: false });
    });
  }, [handleSave, registerOnAutoSave]);

  function handleAddAlbumEntry() {
    setEditingAlbumEntry(undefined);
    setIsAlbumEditorOpen(true);
  }

  function handleEditAlbumEntry(entry: AlbumEntry) {
    setEditingAlbumEntry(entry);
    setIsAlbumEditorOpen(true);
  }

  function handleDeleteAlbumEntry(entryId: string) {
    setAlbum((prev) => prev.filter((entry) => entry.id !== entryId));
  }

  function handleSaveAlbumEntry(entry: AlbumEntry) {
    setAlbum((prev) => {
      const exists = prev.some((current) => current.id === entry.id);
      if (exists) {
        return prev.map((current) => (current.id === entry.id ? entry : current));
      }
      return [entry, ...prev];
    });
    setIsAlbumEditorOpen(false);
    setEditingAlbumEntry(undefined);
  }

  function renderDetailsTab() {
    return (
      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-row items-center gap-2">
          <div className="shrink-0">
            <IconPicker
              value={iconKey}
              onChange={setIconKey}
              allowedKeys={vehicleIconKeys}
              align="left"
            />
          </div>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Vehicle name"
            maxLength={100}
            className={`${SELECT_CLS} min-w-0 flex-1`}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Year</label>
            <input
              type="number"
              min={1900}
              max={2100}
              value={year}
              onChange={(event) => setYear(event.target.value === '' ? '' : Number(event.target.value))}
              className={SELECT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Make</label>
            <input
              type="text"
              value={make}
              onChange={(event) => setMake(event.target.value)}
              maxLength={80}
              className={SELECT_CLS}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Model</label>
          <input
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            maxLength={80}
            className={SELECT_CLS}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Mileage</label>
            <input
              type="number"
              min={0}
              value={mileage}
              onChange={(event) => setMileage(event.target.value === '' ? '' : Number(event.target.value))}
              className={SELECT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">License Plate</label>
            <input
              type="text"
              value={licensePlate}
              onChange={(event) => setLicensePlate(event.target.value)}
              maxLength={40}
              className={SELECT_CLS}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Insurance Expiry</label>
            <input
              type="date"
              value={insuranceExpiry}
              onChange={(event) => setInsuranceExpiry(event.target.value)}
              className={SELECT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Insurance Lead Days</label>
            <input
              type="number"
              min={0}
              max={365}
              value={insuranceLeadDays}
              onChange={(event) => setInsuranceLeadDays(event.target.value === '' ? '' : Number(event.target.value))}
              className={SELECT_CLS}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Service Next Date</label>
            <input
              type="date"
              value={serviceNextDate}
              onChange={(event) => setServiceNextDate(event.target.value)}
              className={SELECT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Service Lead Days</label>
            <input
              type="number"
              min={0}
              max={365}
              value={serviceLeadDays}
              onChange={(event) => setServiceLeadDays(event.target.value === '' ? '' : Number(event.target.value))}
              className={SELECT_CLS}
            />
          </div>
        </div>
      </div>
    );
  }

  function renderTaskRow(task: VehicleTaskDraft) {
    const rowIcon = task.icon?.trim() || defaultVehicleIcon;
    const isLockedTask = task.kind === 'mileage-log';
    return (
      <button
        key={task.id}
        type="button"
        onClick={() => openExistingTaskEditor(task)}
        className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 dark:border-gray-700 dark:bg-gray-900/60 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
          <IconDisplay iconKey={rowIcon} size={20} className="h-5 w-5 object-contain" alt="" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {task.name.trim() || 'Untitled maintenance task'}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate">{describeCollapsedTaskRecurrence(task)}</span>
            <div className="flex items-center gap-2">
              {task.reminderLeadDays > -1 ? <span className="shrink-0 text-sm leading-none">{'\u{1F514}'}</span> : null}
              {isLockedTask ? <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide">Required</span> : null}
            </div>
          </div>
        </div>
      </button>
    );
  }

  function renderExpandedTask(task: VehicleTaskDraft) {
    const activeEditorTab = taskEditorTabs[task.id] ?? 'schedule';
    const selectedTaskType = normaliseVehicleTaskType(task.taskType);
    const taskInputFields = buildTaskInputFields(selectedTaskType, task.name.trim(), task.inputFields);
    const isPeriodic = normalizeRecurrenceMode(task.recurrenceMode) === 'recurring';
    const sendToGtd = task.reminderLeadDays >= 0;
    const isExecutingTask = executingTaskIds[task.id] === true;
    const summary = executeCompletionSummary?.taskId === task.id ? executeCompletionSummary : null;
    const isShowingGtdPushFeedback = gtdPushFeedbackTaskId === task.id;
    const isLockedTask = task.kind === 'mileage-log';

    const executionTemplate: TaskTemplate = {
      name: task.name.trim() || 'Untitled vehicle task',
      description: '',
      icon: task.icon?.trim() || iconKey,
      taskType: selectedTaskType,
      inputFields: taskInputFields as TaskTemplate['inputFields'],
      xpAward: { health: 0, strength: 0, agility: 5, defense: 0, charisma: 0, wisdom: 0 },
      cooldown: null,
      media: null,
      items: [],
      secondaryTag: null,
    };
    const executionTask: Task = {
      id: `vehicle-task-preview:${task.id}`,
      templateRef: null,
      isUnique: true,
      title: task.name.trim() || 'Untitled vehicle task',
      taskType: selectedTaskType,
      completionState: 'pending',
      completedAt: null,
      resultFields: taskExecutionDrafts[task.id] ?? {},
      attachmentRef: null,
      resourceRef: existing?.id ?? currentExisting?.id ?? null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    };

    return (
      <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-800">
        <div className="shrink-0 space-y-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700">
          <div className="flex min-w-0 items-center gap-3">
            <IconPicker
              value={task.icon?.trim() || defaultVehicleIcon}
              onChange={(value) => updateTaskDraft(task.id, { icon: value })}
              allowedKeys={vehicleIconKeys}
              align="left"
            />
            {isLockedTask ? (
              <div className={`${SELECT_CLS} min-w-0 flex-1 cursor-not-allowed bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400`}>
                {task.name}
              </div>
            ) : (
              <input
                type="text"
                value={task.name}
                onChange={(event) => {
                  const name = event.target.value;
                  updateTaskDraft(task.id, {
                    name,
                    inputFields: buildTaskInputFields(task.taskType ?? 'CHECK', name, task.inputFields),
                  });
                }}
                placeholder="Task name"
                className={`${SELECT_CLS} min-w-0 flex-1`}
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            {(['schedule', 'action'] as const).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setTaskEditorTabs((prev) => ({ ...prev, [task.id]: tabKey }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  activeEditorTab === tabKey
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                }`}
              >
                {tabKey === 'schedule' ? 'Schedule' : 'Action'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {summary ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-800 dark:bg-emerald-950/40">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <span className="text-lg leading-none">✓</span>
                <span className="text-sm font-semibold">Success</span>
              </div>
              <div className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">{summary.taskName}</div>
              {summary.note ? (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{summary.note}</div>
              ) : null}
              <div className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                XP awarded: +5 Agility
              </div>
            </div>
          ) : activeEditorTab === 'schedule' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
                <button
                  type="button"
                  onClick={() => updateTaskDraft(task.id, { recurrenceMode: 'recurring' })}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    isPeriodic
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                  }`}
                >
                  Periodic
                </button>
                <button
                  type="button"
                  onClick={() => updateTaskDraft(task.id, { recurrenceMode: 'never' })}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    !isPeriodic
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                  }`}
                >
                  On Demand
                </button>
              </div>

              {isPeriodic ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Frequency</label>
                      <select
                        value={task.recurrence.frequency}
                        onChange={(event) => updateTaskRecurrence(task.id, {
                          frequency: event.target.value as ResourceRecurrenceRule['frequency'],
                          days: event.target.value === 'weekly' ? task.recurrence.days : [],
                          monthlyDay: event.target.value === 'monthly'
                            ? (task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate))
                            : null,
                        })}
                        className={SELECT_CLS}
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Interval</label>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={task.recurrence.interval}
                        onChange={(event) => updateTaskRecurrence(task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                        className={SELECT_CLS}
                      />
                    </div>
                  </div>

                  {task.recurrence.frequency === 'weekly' ? (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days</label>
                      <div className="flex flex-wrap gap-1.5">
                        {DOW_LABELS.map(({ key, label }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleTaskDay(task.id, key)}
                            className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium transition-colors ${
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

                  {task.recurrence.frequency === 'monthly' ? (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Day of Month</label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate)}
                        onChange={(event) => updateTaskRecurrence(task.id, {
                          monthlyDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                        })}
                        className={SELECT_CLS}
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start Date</label>
                      <input
                        type="date"
                        value={task.recurrence.seedDate}
                        onChange={(event) => updateTaskRecurrence(task.id, {
                          seedDate: event.target.value,
                          monthlyDay: task.recurrence.frequency === 'monthly'
                            ? (task.recurrence.monthlyDay ?? getDayOfMonth(event.target.value))
                            : task.recurrence.monthlyDay,
                        })}
                        className={SELECT_CLS}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">End Date</label>
                      <input
                        type="date"
                        value={task.recurrence.endsOn ?? ''}
                        onChange={(event) => updateTaskRecurrence(task.id, { endsOn: event.target.value || null })}
                        className={SELECT_CLS}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-900/70">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={sendToGtd}
                        onChange={(event) => updateTaskDraft(task.id, { reminderLeadDays: event.target.checked ? Math.max(0, task.reminderLeadDays) : -1 })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-500"
                      />
                      <span>Send to GTD list</span>
                    </label>

                    {sendToGtd ? (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days before (0 = on the day)</label>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={Math.max(0, task.reminderLeadDays)}
                          onChange={(event) => updateTaskDraft(task.id, { reminderLeadDays: Math.max(0, Number(event.target.value) || 0) })}
                          className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">Available to execute on demand.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {isExecutingTask ? (
                <div className="space-y-3">
                  <ExecuteTaskInput
                    taskId={task.id}
                    executionTemplate={executionTemplate}
                    executionTask={executionTask}
                    onCompleteTask={handleTaskExecutionComplete}
                    onResultChangeTask={handleTaskExecutionResultChange}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setExecutingTaskIds((prev) => ({ ...prev, [task.id]: false }))}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Task Type</label>
                    {isLockedTask ? (
                      <div className={`${SELECT_CLS} cursor-not-allowed bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400`}>
                        {selectedTaskType}
                      </div>
                    ) : (
                      <select
                        value={selectedTaskType}
                        onChange={(event) => {
                          const nextType = normaliseVehicleTaskType(event.target.value);
                          updateTaskDraft(task.id, {
                            taskType: nextType,
                            inputFields: buildTaskInputFields(nextType, task.name.trim(), task.inputFields),
                          });
                        }}
                        className={SELECT_CLS}
                      >
                        {VEHICLE_TASK_TYPE_OPTIONS.map((taskType) => (
                          <option key={taskType.value} value={taskType.value}>{taskType.label}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-600 dark:bg-gray-800/40">
                    <TaskTypeConfigEditor
                      taskType={selectedTaskType}
                      inputFields={task.inputFields ?? {}}
                      onChange={(fields) => updateTaskDraft(task.id, {
                        inputFields: {
                          ...buildTaskInputFields(selectedTaskType, task.name.trim(), task.inputFields),
                          ...fields,
                        },
                      })}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          {isShowingGtdPushFeedback ? (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Added to GTD list
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            {expandedTaskIsNew ? (
              <button
                type="button"
                onClick={discardExpandedNewTask}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            ) : isLockedTask ? (
              <span className="text-sm font-medium text-gray-400">Required task</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (confirmRemoveTaskId === task.id) {
                    setTaskDrafts((prev) => prev.filter((entry) => entry.id !== task.id));
                    setExpandedTaskDraft(null);
                    setExpandedTaskId(null);
                    setExpandedTaskIsNew(false);
                    setConfirmRemoveTaskId(null);
                    return;
                  }
                  setConfirmRemoveTaskId(task.id);
                }}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  confirmRemoveTaskId === task.id
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40'
                }`}
              >
                {confirmRemoveTaskId === task.id ? 'Tap again to remove' : 'Remove'}
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => pushTaskToGtd(task)}
                disabled={!(existing ?? currentExisting) || !task.name.trim() || isShowingGtdPushFeedback}
                className="rounded-md border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
              >
                Push to GTD
              </button>
              <button
                type="button"
                onClick={() => {
                  setTaskEditorTabs((prev) => ({ ...prev, [task.id]: 'action' }));
                  setExecutingTaskIds((prev) => ({ ...prev, [task.id]: true }));
                  setExecuteCompletionSummary(null);
                }}
                disabled={!task.name.trim()}
                className="rounded-md bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Execute
              </button>
              <button
                type="button"
                onClick={commitExpandedTaskAndClose}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderTasksTab() {
    if (expandedTask) {
      return renderExpandedTask(expandedTask);
    }

    return (
      <div className="space-y-5 px-4 py-4">
        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Maintenance Tasks</div>
          <div className="space-y-2">
            {taskDrafts.length > 0 ? taskDrafts.map((task) => renderTaskRow(task)) : (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No maintenance tasks yet.
              </div>
            )}
          </div>
          {isCreatingTask ? (
            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-4 dark:border-blue-900 dark:bg-blue-950/20">
              <input
                type="text"
                value={newTaskName}
                onChange={(event) => setNewTaskName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    createTaskFromPrompt();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelTaskCreation();
                  }
                }}
                placeholder="Task name..."
                maxLength={100}
                className={SELECT_CLS}
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelTaskCreation}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createTaskFromPrompt}
                  disabled={!newTaskName.trim()}
                  className="rounded-md bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={beginTaskCreation}
            className="w-full rounded-xl border border-dashed border-blue-300 px-4 py-3 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
          >
            Add Task
          </button>
        </section>
      </div>
    );
  }

  function renderLinksTab() {
    const linkedResource = currentExisting ?? existing;

    return (
      <div className="space-y-4 px-4 py-4">
        {linkedResource ? (
          <ResourceLinksTabNew resource={linkedResource} />
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
            Save first to add links.
          </div>
        )}
      </div>
    );
  }

  function renderAlbumTab() {
    return (
      <div className="px-4 py-4">
        <AlbumViewer
          entries={album}
          onAdd={handleAddAlbumEntry}
          onEdit={handleEditAlbumEntry}
          onDelete={handleDeleteAlbumEntry}
          title="Inspection & Service Photos"
        />
      </div>
    );
  }

  function renderLayoutTab() {
    const previewLayout = layoutSelection === 'none'
      ? undefined
      : (layout ?? buildVehicleLayout(layoutSelection));
    const previewResource: VehicleResource = {
      id: draftVehicleId,
      type: 'vehicle',
      icon: iconKey,
      name: displayName.trim() || 'Vehicle',
      createdAt: existing?.createdAt ?? currentExisting?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      layout: previewLayout,
      maintenanceTasks: buildPersistedMaintenanceTasks(taskDrafts, previewLayout),
      notes: currentExisting?.notes ?? existing?.notes,
      links: currentExisting?.links ?? existing?.links,
      album: album.length > 0 ? album : undefined,
      linkedContactId: currentExisting?.linkedContactId ?? existing?.linkedContactId,
      linkedAccountId: currentExisting?.linkedAccountId ?? existing?.linkedAccountId,
      linkedDocIds: currentExisting?.linkedDocIds ?? existing?.linkedDocIds,
      sharedWith: currentExisting?.sharedWith ?? existing?.sharedWith ?? null,
    };

    return (
      <div className="space-y-4 px-4 py-4">
        <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Vehicle layout</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Group areas and link inventory containers to this vehicle.</p>
            </div>
            <select
              value={layoutSelection}
              onChange={(event) => handleLayoutSelectionChange(event.target.value as 'none' | VehicleLayoutTemplate)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="none">None</option>
              <option value="bike">Bike</option>
              <option value="car">Car</option>
              <option value="truck">Truck</option>
              <option value="plane">Plane</option>
            </select>
          </div>

          {layoutSelection !== 'none' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Current template: <span className="font-medium text-gray-700 dark:text-gray-200">{(previewLayout?.template ?? layoutSelection).slice(0, 1).toUpperCase() + (previewLayout?.template ?? layoutSelection).slice(1)}</span>
                </p>
                <button
                  type="button"
                  onClick={handleResetCurrentLayout}
                  className="ml-auto text-xs font-medium text-blue-500 hover:text-blue-600 disabled:opacity-40"
                >
                  Reset areas
                </button>
              </div>

              {previewLayout ? (
                <VehicleLayoutEditor
                  resource={previewResource}
                  isEditMode
                  onLayoutChange={setLayout}
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Select a vehicle layout template to enable the editable inspection view.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <ResourceFormShell
        title={existing ? 'Edit Vehicle' : 'New Vehicle'}
        onSave={() => {
          handleSave();
        }}
        resourceIcon={iconKey}
        resourceName={displayName}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hideChrome={hasExpandedTask}
      >
        {activeTab === 'details' ? renderDetailsTab() : null}
        {activeTab === 'tasks' ? renderTasksTab() : null}
        {activeTab === 'links' ? renderLinksTab() : null}
        {activeTab === 'album' ? renderAlbumTab() : null}
        {activeTab === 'layout' ? renderLayoutTab() : null}
      </ResourceFormShell>

      {isAlbumEditorOpen ? (
        <AlbumEntryEditor
          entry={editingAlbumEntry}
          onSave={handleSaveAlbumEntry}
          onCancel={() => {
            setIsAlbumEditorOpen(false);
            setEditingAlbumEntry(undefined);
          }}
        />
      ) : null}
    </>
  );
}