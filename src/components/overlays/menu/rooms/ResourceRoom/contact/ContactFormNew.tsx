import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AlbumEntry,
  ContactGroup,
  ContactResource,
  ContactTask,
  ResourceNote,
  ResourceRecurrenceRule,
} from '../../../../../../types/resource';
import {
  CONTACT_GROUPS,
  makeDefaultRecurrenceRule,
  normalizeRecurrenceMode,
  toRecurrenceRule,
  type RecurrenceDayOfWeek,
} from '../../../../../../types/resource';
import type { QuickActionsEvent } from '../../../../../../types/event';
import type { Task } from '../../../../../../types/task';
import type { InputFields, TaskTemplate, TaskType } from '../../../../../../types/taskTemplate';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { awardStat, awardXP } from '../../../../../../engine/awardPipeline';
import { generateGTDItems, generateScheduledTasks } from '../../../../../../engine/resourceEngine';
import { getAppDate, getAppNowISO } from '../../../../../../utils/dateUtils';
import { IconPicker } from '../../../../../shared/IconPicker';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceFormShell, type ResourceFormTab } from '../../../../../shared/ResourceFormShell';
import { ResourceLinksTabNew } from '../../../../../shared/ResourceLinksTabNew';
import { AlbumViewer } from '../../../../../shared/AlbumViewer';
import { AlbumEntryEditor } from '../../../../../shared/AlbumEntryEditor';
import { TaskTypeConfigEditor } from '../../../../../shared/TaskTypeConfigEditor';
import { TaskTypeInputRenderer } from '../../../../../overlays/event/TaskTypeInputRenderer';
import { ICON_MAP } from '../../../../../../constants/iconMap';

interface ContactFormNewProps {
  existing?: ContactResource;
  onSaved: () => void;
  registerOnAutoSave?: (callback: (() => void) | null) => void;
}

interface ContactTaskDraft extends ContactTask {
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

type ContactTaskType = NonNullable<ContactTask['taskType']>;

const tabs: ResourceFormTab[] = [
  { key: 'details', label: 'Details' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'links', label: 'Links' },
  { key: 'album', label: 'Album' },
];

const CONTACT_TASK_TYPE_OPTIONS: Array<{ value: TaskType; label: string }> = [
  { value: 'CHECK', label: 'Check' },
  { value: 'TEXT', label: 'Text' },
  { value: 'COUNTER', label: 'Counter' },
  { value: 'RATING', label: 'Rating' },
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

function normaliseContactTaskType(taskType?: string | null): ContactTaskType {
  switch (taskType) {
    case 'TEXT':
    case 'COUNTER':
    case 'RATING':
      return taskType;
    case 'CHECK':
    default:
      return 'CHECK';
  }
}

function buildTaskInputFields(taskType: string, title: string, inputFields?: Partial<InputFields> | null): Partial<InputFields> {
  const normalizedTaskType = normaliseContactTaskType(taskType);

  switch (normalizedTaskType) {
    case 'COUNTER':
      return { target: 1, unit: 'count', step: 1, ...(inputFields ?? {}) };
    case 'RATING':
      return { scale: 5, label: title || 'Rate this', ...(inputFields ?? {}) };
    case 'TEXT':
      return { prompt: title || 'Add details', maxLength: null, ...(inputFields ?? {}) };
    case 'CHECK':
    default:
      return { label: title || 'Done', ...(inputFields ?? {}) };
  }
}

function toTaskDraft(task: ContactTask): ContactTaskDraft {
  const persisted = task as ContactTaskDraft;
  return {
    id: task.id,
    icon: task.icon ?? 'contact-icon-person',
    name: task.name ?? '',
    taskType: normaliseContactTaskType(task.taskType),
    recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
    recurrence: toRecurrenceRule(task.recurrence),
    reminderLeadDays: task.reminderLeadDays ?? -1,
    inputFields: buildTaskInputFields(
      task.taskType ?? 'CHECK',
      task.name,
      persisted.inputFields,
    ),
  };
}

function makeBlankTaskDraft(): ContactTaskDraft {
  return {
    id: uuidv4(),
    icon: 'contact-icon-person',
    name: '',
    taskType: 'CHECK',
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: -1,
    inputFields: buildTaskInputFields('CHECK', ''),
  };
}

function formatNextOccurrenceLabel(dateIso: string): string {
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveNextAnnualOccurrence(birthday: string, referenceDate: string): string | null {
  if (!birthday) return null;
  const [, month = '', day = ''] = birthday.split('-');
  if (!month || !day) return null;
  const [yearPart, refMonthPart, refDayPart] = referenceDate.split('-');
  const year = Number(yearPart);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const refMonth = Number(refMonthPart);
  const refDay = Number(refDayPart);
  if (!year || !monthNumber || !dayNumber) return null;
  const hasPassed = refMonth > monthNumber || (refMonth === monthNumber && refDay > dayNumber);
  const targetYear = hasPassed ? year + 1 : year;
  const lastDayOfMonth = new Date(targetYear, monthNumber, 0).getDate();
  const safeDay = Math.min(dayNumber, lastDayOfMonth);
  return `${String(targetYear).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function describeCollapsedTaskRecurrence(task: ContactTaskDraft): string {
  if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') return 'On demand';

  switch (task.recurrence.frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    default:
      return 'On demand';
  }
}

function extractExecutionNote(result: Partial<InputFields>): string | null {
  const fields = result as Record<string, unknown>;
  const candidates = ['value', 'note', 'text', 'description', 'comment']
    .map((key) => fields[key]);
  const match = candidates.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return match?.trim() ?? null;
}

export function ContactFormNew({ existing, onSaved, registerOnAutoSave }: ContactFormNewProps) {
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const setScheduleTask = useScheduleStore((s) => s.setTask);
  const setActiveEvent = useScheduleStore((s) => s.setActiveEvent);

  const currentExisting = existing ? resources[existing.id] as ContactResource | undefined : undefined;
  const contactIconKeys = useMemo(
    () => Object.keys(ICON_MAP).filter((key) => key.startsWith('contact-icon-')),
    [],
  );
  const defaultTaskIcon = contactIconKeys[0] ?? 'contact-icon-person';

  const [activeTab, setActiveTab] = useState('details');
  const [iconKey, setIconKey] = useState(existing?.icon ?? defaultTaskIcon);
  const [displayName, setDisplayName] = useState(existing?.displayName ?? existing?.name ?? '');
  const [groups, setGroups] = useState<ContactGroup[]>(existing?.groups ?? []);
  const [customGroups, setCustomGroups] = useState<string[]>(existing?.customGroups ?? []);
  const [groupsMenuOpen, setGroupsMenuOpen] = useState(false);
  const [isEditingCustomGroups, setIsEditingCustomGroups] = useState(false);
  const [isAddingCustomGroup, setIsAddingCustomGroup] = useState(false);
  const [customGroupInput, setCustomGroupInput] = useState('');
  const [editingCustomGroupValues, setEditingCustomGroupValues] = useState<Record<string, string>>({});
  const [birthday, setBirthday] = useState(existing?.birthday ?? '');
  const [birthdayLeadDays, setBirthdayLeadDays] = useState<number>(existing?.birthdayLeadDays ?? 14);
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [album, setAlbum] = useState<AlbumEntry[]>(existing?.album ?? []);
  const [notes] = useState<ResourceNote[]>(existing?.notes ?? []);
  const [taskDrafts, setTaskDrafts] = useState<ContactTaskDraft[]>(
    (existing?.tasks ?? []).map((task) => toTaskDraft(task)),
  );
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedTaskDraft, setExpandedTaskDraft] = useState<ContactTaskDraft | null>(null);
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

  const customGroupOptions = useMemo(() => {
    const allTags = new Set<string>();
    for (const resource of Object.values(resources)) {
      if (resource.type !== 'contact') continue;
      for (const tag of resource.customGroups ?? []) {
        const normalizedTag = tag.trim();
        if (normalizedTag) allTags.add(normalizedTag);
      }
    }
    for (const tag of customGroups) {
      const normalizedTag = tag.trim();
      if (normalizedTag) allTags.add(normalizedTag);
    }
    return Array.from(allTags).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }, [customGroups, resources]);

  const selectedGroupSummary = useMemo(() => {
    const selected = [...groups, ...customGroups];
    if (selected.length === 0) return 'Select groups';
    if (selected.length <= 2) return selected.join(', ');
    return `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`;
  }, [customGroups, groups]);

  const canSave = displayName.trim().length > 0;
  const expandedTask = expandedTaskDraft ?? (
    expandedTaskId
      ? taskDrafts.find((task) => task.id === expandedTaskId) ?? null
      : null
  );
  const hasExpandedTask = expandedTask != null;
  const nextBirthdayDate = birthday ? resolveNextAnnualOccurrence(birthday, getAppDate()) : null;

  function toggleGroup(group: ContactGroup) {
    setGroups((prev) => (
      prev.includes(group)
        ? prev.filter((entry) => entry !== group)
        : [...prev, group]
    ));
  }

  function addCustomGroup() {
    const nextTag = customGroupInput.trim();
    if (!nextTag) return;
    setCustomGroups((prev) => (prev.includes(nextTag) ? prev : [...prev, nextTag]));
    setCustomGroupInput('');
    setIsAddingCustomGroup(false);
  }

  function removeCustomGroup(tag: string) {
    setCustomGroups((prev) => prev.filter((entry) => entry !== tag));
  }

  function toggleCustomGroup(tag: string) {
    setCustomGroups((prev) => (
      prev.includes(tag)
        ? prev.filter((entry) => entry !== tag)
        : [...prev, tag]
    ));
  }

  function beginCustomGroupEditing() {
    setEditingCustomGroupValues(
      Object.fromEntries(customGroups.map((tag) => [tag, tag])),
    );
    setIsEditingCustomGroups(true);
  }

  function cancelCustomGroupEditing() {
    setEditingCustomGroupValues({});
    setIsEditingCustomGroups(false);
  }

  function saveEditedCustomGroup(originalTag: string) {
    const nextValue = (editingCustomGroupValues[originalTag] ?? '').trim();
    if (!nextValue) return;
    setCustomGroups((prev) => (
      prev
        .map((tag) => (tag === originalTag ? nextValue : tag))
        .filter((tag, index, arr) => arr.indexOf(tag) === index)
    ));
    setEditingCustomGroupValues((prev) => {
      const next = { ...prev };
      delete next[originalTag];
      next[nextValue] = nextValue;
      return next;
    });
  }

  function deleteEditedCustomGroup(tag: string) {
    removeCustomGroup(tag);
    setEditingCustomGroupValues((prev) => {
      const next = { ...prev };
      delete next[tag];
      return next;
    });
  }

  function updateTaskDraft(taskId: string, patch: Partial<ContactTaskDraft>) {
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

  function openExistingTaskEditor(task: ContactTaskDraft) {
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

  const normalizeTaskDraft = useCallback((task: ContactTaskDraft): ContactTaskDraft => ({
    ...task,
    icon: task.icon.trim() || defaultTaskIcon,
    taskType: normaliseContactTaskType(task.taskType),
    recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
    recurrence: cloneRecurrenceRule(task.recurrence),
    inputFields: buildTaskInputFields(
      task.taskType ?? 'CHECK',
      task.name.trim(),
      task.inputFields,
    ),
  }), [defaultTaskIcon]);

  const mergeExpandedTaskIntoTaskDrafts = useCallback((sourceTaskDrafts: ContactTaskDraft[]): ContactTaskDraft[] => {
    if (!expandedTaskId || !expandedTaskDraft || expandedTaskDraft.id !== expandedTaskId) {
      return sourceTaskDrafts;
    }

    const normalizedTask = normalizeTaskDraft(expandedTaskDraft);
    if (expandedTaskIsNew) {
      return normalizedTask.name.trim() ? [...sourceTaskDrafts, normalizedTask] : sourceTaskDrafts;
    }

    return sourceTaskDrafts.map((task) => (task.id === normalizedTask.id ? normalizedTask : task));
  }, [expandedTaskDraft, expandedTaskId, expandedTaskIsNew, normalizeTaskDraft]);

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
      ...makeBlankTaskDraft(),
      icon: defaultTaskIcon,
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
      title: task.name.trim() || 'Untitled contact task',
      taskType: normaliseContactTaskType(task.taskType),
      completionState: 'complete',
      completedAt: now,
      resultFields: {
        ...(result ?? {}),
        resourceTaskId: existing ? `resource-task:${existing.id}:contact-task:${task.id}` : undefined,
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
      statGroup: 'charisma',
      source: 'contact-task.execute.quickActions',
    });
    awardStat(userId, 'charisma', 5, 'contact-task.execute.quickActions');
    setTaskExecutionDrafts((prev) => ({ ...prev, [taskId]: { ...result } }));
    setExecuteCompletionSummary({
      taskId,
      taskName: task.name.trim() || 'Untitled contact task',
      note: extractExecutionNote(result),
    });
    setExecutingTaskIds((prev) => ({ ...prev, [taskId]: false }));
  }, [existing, expandedTaskDraft, iconKey, setActiveEvent, setScheduleTask, taskDrafts, user]);

  const pushTaskToGtd = useCallback((task: ContactTaskDraft) => {
    const latestUser = useUserStore.getState().user ?? user;
    if (!existing || !latestUser || gtdPushFeedbackTaskId === task.id) return;

    const dueDate = getAppDate();
    const resourceTaskId = `resource-task:${existing.id}:contact-task:${task.id}`;
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

    const taskType = normaliseContactTaskType(task.taskType);
    const nextTask: Task = {
      id: uuidv4(),
      templateRef: resourceTaskId,
      isUnique: true,
      title: task.name.trim() || 'Untitled contact task',
      taskType,
      completionState: 'pending',
      completedAt: null,
      resultFields: ({
        ...buildTaskInputFields(taskType, task.name.trim(), task.inputFields),
        resourceTaskId,
        dueDate,
        label: task.name.trim() || 'Untitled contact task',
      } as unknown) as Task['resultFields'],
      attachmentRef: null,
      resourceRef: existing.id,
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
  }, [existing, gtdPushFeedbackTaskId, setScheduleTask, setUser, user]);

  const handleSave = useCallback((options?: { closeAfterSave?: boolean }) => {
    if (!canSave) return false;

    const taskDraftsForSave = mergeExpandedTaskIntoTaskDrafts(taskDrafts);
    if (taskDraftsForSave !== taskDrafts) {
      setTaskDrafts(taskDraftsForSave);
    }

    const now = new Date().toISOString();
    const finalTasks = taskDraftsForSave
      .filter((task) => task.name.trim().length > 0)
      .map((task) => ({
        id: task.id,
        icon: task.icon.trim() || defaultTaskIcon,
        name: task.name.trim(),
        taskType: normaliseContactTaskType(task.taskType),
        recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
        recurrence: cloneRecurrenceRule(task.recurrence),
        reminderLeadDays: task.reminderLeadDays,
        inputFields: buildTaskInputFields(task.taskType ?? 'CHECK', task.name.trim(), task.inputFields),
      }));

    const resource: ContactResource = {
      id: existing?.id ?? uuidv4(),
      type: 'contact',
      icon: iconKey,
      name: displayName.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      displayName: displayName.trim(),
      groups,
      customGroups: customGroups.length > 0 ? customGroups : undefined,
      phone: phone || undefined,
      email: email || undefined,
      birthday: birthday || undefined,
      birthdayLeadDays: birthday ? birthdayLeadDays : undefined,
      tasks: finalTasks.length > 0 ? (finalTasks as ContactResource['tasks']) : undefined,
      address: address || undefined,
      linkedContacts: currentExisting?.linkedContacts ?? existing?.linkedContacts,
      notes,
      links: currentExisting?.links ?? existing?.links,
      album: album.length > 0 ? album : undefined,
      linkedHomeId: currentExisting?.linkedHomeId ?? existing?.linkedHomeId,
      linkedAccountIds: currentExisting?.linkedAccountIds ?? existing?.linkedAccountIds,
      sharedProfile: currentExisting?.sharedProfile ?? existing?.sharedProfile ?? null,
    };

    setResource(resource);

    if (!existing && user) {
      setUser({
        ...user,
        resources: {
          ...user.resources,
          contacts: user.resources.contacts.includes(resource.id)
            ? user.resources.contacts
            : [...user.resources.contacts, resource.id],
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
    address,
    album,
    birthday,
    birthdayLeadDays,
    canSave,
    currentExisting,
    customGroups,
    defaultTaskIcon,
    displayName,
    email,
    existing,
    groups,
    iconKey,
    notes,
    onSaved,
    phone,
    setResource,
    setUser,
    taskDrafts,
    user,
    mergeExpandedTaskIntoTaskDrafts,
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

  function renderIdentityRow() {
    return (
      <div className="flex items-end gap-3">
        <IconPicker
          value={iconKey}
          onChange={setIconKey}
          allowedKeys={contactIconKeys}
          align="left"
        />
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Name *</label>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Full name"
            maxLength={100}
            className={SELECT_CLS}
          />
        </div>
      </div>
    );
  }

  function renderDetailsTab() {
    return (
      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Groups</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setGroupsMenuOpen((prev) => !prev);
                setIsAddingCustomGroup(false);
                if (isEditingCustomGroups) cancelCustomGroupEditing();
              }}
              className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <span className="truncate text-left">{selectedGroupSummary}</span>
              <span className="text-xs text-gray-400">{groupsMenuOpen ? '▲' : '▼'}</span>
            </button>
            {groupsMenuOpen ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <div className="max-h-72 overflow-y-auto p-2">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Default groups</div>
                  <div className="space-y-1">
                    {CONTACT_GROUPS.map((group) => {
                      const selected = groups.includes(group);
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => toggleGroup(group)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm capitalize transition-colors ${
                            selected
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span>{group}</span>
                          <span className="text-xs">{selected ? '✓' : ''}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Custom groups</div>
                  {customGroupOptions.length === 0 ? (
                    <p className="rounded-lg px-2.5 py-2 text-sm text-gray-400">No custom groups yet.</p>
                  ) : isEditingCustomGroups ? (
                    <div className="space-y-2">
                      {customGroups.map((tag) => (
                        <div key={tag} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingCustomGroupValues[tag] ?? tag}
                            onChange={(event) => setEditingCustomGroupValues((prev) => ({ ...prev, [tag]: event.target.value }))}
                            className={SELECT_CLS}
                          />
                          <button
                            type="button"
                            onClick={() => saveEditedCustomGroup(tag)}
                            className="rounded-md border border-blue-300 px-2.5 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEditedCustomGroup(tag)}
                            className="rounded-md border border-red-300 px-2.5 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {customGroupOptions.map((tag) => {
                        const selected = customGroups.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleCustomGroup(tag)}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors ${
                              selected
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
                            }`}
                          >
                            <span>{tag}</span>
                            <span className="text-xs">{selected ? '✓' : ''}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {isAddingCustomGroup ? (
                    <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                      <input
                        type="text"
                        value={customGroupInput}
                        onChange={(event) => setCustomGroupInput(event.target.value)}
                        placeholder="New custom group"
                        maxLength={40}
                        className={SELECT_CLS}
                      />
                      <button
                        type="button"
                        onClick={addCustomGroup}
                        className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40"
                      >
                        Save
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCustomGroup((prev) => !prev);
                      setCustomGroupInput('');
                      if (isEditingCustomGroups) cancelCustomGroupEditing();
                    }}
                    className="text-sm font-medium text-blue-500 hover:text-blue-600"
                  >
                    {isAddingCustomGroup ? 'Cancel add' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditingCustomGroups) {
                        cancelCustomGroupEditing();
                        return;
                      }
                      setIsAddingCustomGroup(false);
                      beginCustomGroupEditing();
                    }}
                    disabled={customGroups.length === 0}
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:text-gray-300 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    {isEditingCustomGroups ? 'Done editing' : 'Edit'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Birthday</label>
            <input
              type="date"
              value={birthday}
              onChange={(event) => setBirthday(event.target.value)}
              className={SELECT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Reminder</label>
            <select
              value={birthday ? birthdayLeadDays : ''}
              disabled={!birthday}
              onChange={(event) => setBirthdayLeadDays(Number(event.target.value))}
              className={SELECT_CLS}
            >
              <option value={-1}>Never</option>
              <option value={0}>Day of</option>
              <option value={3}>3 days before</option>
              <option value={7}>7 days before</option>
              <option value={14}>14 days before</option>
              <option value={30}>30 days before</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Phone</label>
          <input
            type="text"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+1 555 000 0000"
            maxLength={40}
            className={SELECT_CLS}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@example.com"
            maxLength={120}
            className={SELECT_CLS}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Address</label>
          <input
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="123 Main St"
            maxLength={200}
            className={SELECT_CLS}
          />
        </div>
      </div>
    );
  }

  function renderTaskRow(task: ContactTaskDraft) {
    return (
      <button
        key={task.id}
        type="button"
        onClick={() => openExistingTaskEditor(task)}
        className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-purple-300 dark:border-gray-700 dark:bg-gray-900/60"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
          <IconDisplay iconKey={task.icon || defaultTaskIcon} size={20} className="h-5 w-5 object-contain" alt="" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {task.name.trim() || 'Untitled contact task'}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate">{describeCollapsedTaskRecurrence(task)}</span>
            {task.reminderLeadDays > -1 ? <span className="shrink-0 text-sm leading-none">{'\u{1F514}'}</span> : null}
          </div>
        </div>
      </button>
    );
  }

  function renderExpandedTask(task: ContactTaskDraft) {
    const activeEditorTab = taskEditorTabs[task.id] ?? 'schedule';
    const selectedTaskType = normaliseContactTaskType(task.taskType);
    const taskInputFields = buildTaskInputFields(selectedTaskType, task.name.trim(), task.inputFields);
    const isPeriodic = normalizeRecurrenceMode(task.recurrenceMode) === 'recurring';
    const sendToGtd = task.reminderLeadDays >= 0;
    const isExecutingTask = executingTaskIds[task.id] === true;
    const summary = executeCompletionSummary?.taskId === task.id ? executeCompletionSummary : null;
    const isShowingGtdPushFeedback = gtdPushFeedbackTaskId === task.id;

    const executionTemplate: TaskTemplate = {
      name: task.name.trim() || 'Untitled contact task',
      description: '',
      icon: task.icon?.trim() || iconKey,
      taskType: selectedTaskType,
      inputFields: taskInputFields as TaskTemplate['inputFields'],
      xpAward: { health: 0, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 0 },
      cooldown: null,
      media: null,
      items: [],
      secondaryTag: null,
    };
    const executionTask: Task = {
      id: `contact-task-preview:${task.id}`,
      templateRef: null,
      isUnique: true,
      title: task.name.trim() || 'Untitled contact task',
      taskType: selectedTaskType,
      completionState: 'pending',
      completedAt: null,
      resultFields: taskExecutionDrafts[task.id] ?? {},
      attachmentRef: null,
      resourceRef: existing?.id ?? null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    };

    return (
      <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-800">
        <div className="shrink-0 space-y-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <IconPicker
                value={task.icon?.trim() || defaultTaskIcon}
                onChange={(value) => updateTaskDraft(task.id, { icon: value })}
              />
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
            </div>
            <button
              type="button"
              onClick={() => {
                commitExpandedTaskAndClose();
              }}
              className="rounded-md px-2 py-1 text-sm font-semibold text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              aria-label="Close task editor"
            >
              ×
            </button>
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
                XP awarded: +5 Charisma
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
                            ? (task.recurrence.monthlyDay ?? 1)
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

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start Date</label>
                      <input
                        type="date"
                        value={task.recurrence.seedDate}
                        onChange={(event) => updateTaskRecurrence(task.id, { seedDate: event.target.value })}
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
                    <select
                      value={selectedTaskType}
                      onChange={(event) => {
                        const nextType = normaliseContactTaskType(event.target.value);
                        updateTaskDraft(task.id, {
                          taskType: nextType,
                          inputFields: buildTaskInputFields(nextType, task.name.trim(), task.inputFields),
                        });
                      }}
                      className={SELECT_CLS}
                    >
                      {CONTACT_TASK_TYPE_OPTIONS.map((taskType) => (
                        <option key={taskType.value} value={taskType.value}>{taskType.label}</option>
                      ))}
                    </select>
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
                disabled={!existing || !task.name.trim() || isShowingGtdPushFeedback}
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
        {birthday && nextBirthdayDate ? (
          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Birthday Task</div>
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-900/60">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-xl dark:bg-amber-950/40">
                {'\u{1F382}'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Birthday</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formatNextOccurrenceLabel(nextBirthdayDate)}
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Reminder: {birthdayLeadDays === -1 ? 'Never' : `${birthdayLeadDays} day${birthdayLeadDays === 1 ? '' : 's'} before`}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contact Tasks</div>
          <div className="space-y-2">
            {taskDrafts.length > 0 ? taskDrafts.map((task) => renderTaskRow(task)) : (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No contact tasks yet.
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
    return (
      <div className="space-y-4 px-4 py-4">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
          Relationships stub.
        </div>
        {existing ? (
          <ResourceLinksTabNew resource={existing} />
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
          title="Album"
        />
      </div>
    );
  }

  return (
    <>
      <ResourceFormShell
        title={existing ? 'Edit Contact' : 'New Contact'}
        onSave={() => {
          handleSave();
        }}
        identityRow={renderIdentityRow()}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hideChrome={hasExpandedTask}
      >
        {activeTab === 'details' ? renderDetailsTab() : null}
        {activeTab === 'tasks' ? renderTasksTab() : null}
        {activeTab === 'links' ? renderLinksTab() : null}
        {activeTab === 'album' ? renderAlbumTab() : null}
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
