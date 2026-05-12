import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AlbumEntry,
  ContactResource,
  FloorPlanSegmentKind,
  HomeChore,
  HomeResource,
  HomeStory,
  Resource,
  ResourceRecurrenceRule,
} from '../../../../../../types/resource';
import {
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
import { ICON_MAP } from '../../../../../../constants/iconMap';
import { getAppDate, getAppNowISO } from '../../../../../../utils/dateUtils';
import { forwardGeocode } from '../../../../../../utils/geocode';
import { IconPicker } from '../../../../../shared/IconPicker';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceFormShell, type ResourceFormTab } from '../../../../../shared/ResourceFormShell';
import { ResourceLinksTabNew } from '../../../../../shared/ResourceLinksTabNew';
import { AlbumViewer } from '../../../../../shared/AlbumViewer';
import { AlbumEntryEditor } from '../../../../../shared/AlbumEntryEditor';
import { AlbumLocationPicker } from '../../../../../shared/AlbumLocationPicker';
import { TaskTypeConfigEditor } from '../../../../../shared/TaskTypeConfigEditor';
import { TaskTypeInputRenderer } from '../../../../../overlays/event/TaskTypeInputRenderer';
import { HomeLayout } from './HomeLayout';

interface HomeFormNewProps {
  existing?: HomeResource;
  onSaved: () => void;
  registerOnAutoSave?: (callback: (() => void) | null) => void;
}

interface HomeChoreDraft extends HomeChore {
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

const HOME_TASK_TYPE_OPTIONS: Array<{ value: TaskType; label: string }> = [
  { value: 'CHECK', label: 'Check' },
  { value: 'TEXT', label: 'Text' },
  { value: 'COUNTER', label: 'Counter' },
  { value: 'RATING', label: 'Rating' },
  { value: 'DURATION', label: 'Duration' },
  { value: 'TIMER', label: 'Timer' },
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

const INPUT_CLS =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

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

function normalizeHomeTaskType(taskType?: string | null): TaskType {
  switch (taskType) {
    case 'TEXT':
    case 'COUNTER':
    case 'RATING':
    case 'DURATION':
    case 'TIMER':
      return taskType;
    case 'CHECK':
    default:
      return 'CHECK';
  }
}

function buildTaskInputFields(taskType: string, title: string, inputFields?: Partial<InputFields> | null): Partial<InputFields> {
  switch (taskType as TaskType) {
    case 'COUNTER':
      return { target: 1, unit: 'count', step: 1, ...(inputFields ?? {}) };
    case 'DURATION': {
      const durationFields = (inputFields ?? {}) as { targetDuration?: number; unit?: 'seconds' | 'minutes' | 'hours' };
      return {
        targetDuration: durationFields.targetDuration ?? 30,
        unit: durationFields.unit ?? 'minutes',
      };
    }
    case 'TIMER':
      return { countdownFrom: 300, ...(inputFields ?? {}) };
    case 'RATING':
      return { scale: 5, label: title || 'Rate this', ...(inputFields ?? {}) };
    case 'TEXT':
      return { prompt: title || 'Add details', maxLength: null, ...(inputFields ?? {}) };
    case 'CHECK':
    default:
      return { label: title || 'Done', ...(inputFields ?? {}) };
  }
}

function toChoreDraft(chore: HomeChore): HomeChoreDraft {
  const persisted = chore as HomeChoreDraft;
  return {
    id: chore.id,
    icon: chore.icon ?? 'home-icon-house',
    name: chore.name ?? '',
    taskType: normalizeHomeTaskType(chore.taskType),
    recurrenceMode: normalizeRecurrenceMode(chore.recurrenceMode),
    recurrence: toRecurrenceRule(chore.recurrence),
    reminderLeadDays: chore.reminderLeadDays ?? -1,
    assignedTo: chore.assignedTo ?? 'all',
    inputFields: buildTaskInputFields(
      chore.taskType ?? 'CHECK',
      chore.name ?? '',
      persisted.inputFields,
    ),
  };
}

function makeBlankChoreDraft(defaultIcon: string): HomeChoreDraft {
  return {
    id: uuidv4(),
    icon: defaultIcon,
    name: '',
    taskType: 'CHECK',
    recurrenceMode: 'never',
    recurrence: makeDefaultRecurrenceRule(),
    reminderLeadDays: -1,
    assignedTo: 'all',
    inputFields: buildTaskInputFields('CHECK', ''),
  };
}

function getDayOfMonth(isoDate: string): number {
  const parsed = Number(isoDate.split('-')[2] ?? 1);
  return Math.min(31, Math.max(1, parsed || 1));
}

function formatDayOfMonth(day: number): string {
  const mod10 = day % 10;
  const mod100 = day % 100;
  if (mod10 === 1 && mod100 !== 11) return `${day}st`;
  if (mod10 === 2 && mod100 !== 12) return `${day}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${day}rd`;
  return `${day}th`;
}

function describeChoreRecurrence(chore: HomeChoreDraft): string {
  if (normalizeRecurrenceMode(chore.recurrenceMode) === 'never') return 'On demand';

  const interval = Math.max(1, chore.recurrence.interval || 1);
  switch (chore.recurrence.frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly': {
      const days = chore.recurrence.days.length > 0
        ? chore.recurrence.days
          .map((day) => DOW_LABELS.find((entry) => entry.key === day)?.label ?? day)
          .join(', ')
        : 'Seed day';
      return interval === 1 ? `Weekly · ${days}` : `Every ${interval} weeks · ${days}`;
    }
    case 'monthly': {
      const day = chore.recurrence.monthlyDay ?? getDayOfMonth(chore.recurrence.seedDate);
      return interval === 1
        ? `Monthly · ${formatDayOfMonth(day)}`
        : `Every ${interval} months · ${formatDayOfMonth(day)}`;
    }
    case 'yearly':
      return interval === 1 ? 'Yearly' : `Every ${interval} years`;
    default:
      return 'Periodic';
  }
}

function extractExecutionNote(result: Partial<InputFields>): string | null {
  const fields = result as Record<string, unknown>;
  const candidates = ['value', 'note', 'text', 'description', 'comment']
    .map((key) => fields[key]);
  const match = candidates.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return match?.trim() ?? null;
}

function collectHomeMemberIds(homeId: string, resources: Record<string, Resource>, directLinks?: HomeResource['links']): string[] {
  const memberIds = new Set<string>();

  for (const link of directLinks ?? []) {
    const target = resources[link.targetResourceId];
    if (target?.type === 'contact' && link.relationship.trim().toLowerCase() === 'member') {
      memberIds.add(target.id);
    }
  }

  for (const resource of Object.values(resources)) {
    if (resource.type !== 'contact') continue;
    if (resource.linkedHomeId === homeId) {
      memberIds.add(resource.id);
    }
    for (const link of resource.links ?? []) {
      if (link.targetResourceId !== homeId) continue;
      if (link.relationship.trim().toLowerCase() === 'member') {
        memberIds.add(resource.id);
      }
    }
  }

  return [...memberIds];
}

export function HomeFormNew({ existing, onSaved, registerOnAutoSave }: HomeFormNewProps) {
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const setScheduleTask = useScheduleStore((s) => s.setTask);
  const setActiveEvent = useScheduleStore((s) => s.setActiveEvent);

  const [draftHomeId] = useState(() => existing?.id ?? uuidv4());
  const currentExisting = resources[draftHomeId]?.type === 'home'
    ? resources[draftHomeId] as HomeResource
    : undefined;
  const homeIconKeys = useMemo(
    () => Object.keys(ICON_MAP).filter((key) => key.startsWith('home-icon-')),
    [],
  );
  const defaultHomeIcon = homeIconKeys[0] ?? 'home-icon-house';

  const [activeTab, setActiveTab] = useState('details');
  const [roomSelected, setRoomSelected] = useState(false);
  const [placementExpanded, setPlacementExpanded] = useState(false);
  const [iconKey, setIconKey] = useState(existing?.icon ?? currentExisting?.icon ?? defaultHomeIcon);
  const [displayName, setDisplayName] = useState(existing?.name ?? currentExisting?.name ?? '');
  const [streetAddress, setStreetAddress] = useState(existing?.address ?? currentExisting?.address ?? '');
  const [city, setCity] = useState(existing?.city ?? currentExisting?.city ?? '');
  const [stateCode, setStateCode] = useState(existing?.state ?? currentExisting?.state ?? '');
  const [lat, setLat] = useState<number | undefined>(existing?.lat ?? currentExisting?.lat);
  const [lon, setLon] = useState<number | undefined>(existing?.lon ?? currentExisting?.lon);
  const [locationLocked, setLocationLocked] = useState(
    Boolean(existing?.lat && existing?.lon),
  );
  const [geocodeStatus, setGeocodeStatus] = useState<'idle' | 'loading' | 'found' | 'not-found'>('idle');
  const [geocodedLabel, setGeocodedLabel] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [album, setAlbum] = useState<AlbumEntry[]>(existing?.album ?? currentExisting?.album ?? []);
  const [albumRoomFilter, setAlbumRoomFilter] = useState<string>('all');
  const [stories, setStories] = useState<HomeStory[]>(
    (existing?.stories ?? currentExisting?.stories ?? []).map((story) => ({
      ...story,
      placedItems: story.placedItems ?? [],
      photos: story.photos ?? [],
      rooms: story.rooms.map((room) => ({
        ...room,
        placedItems: room.placedItems ?? [],
        photos: room.photos ?? [],
      })),
    })),
  );
  const [choreDrafts, setChoreDrafts] = useState<HomeChoreDraft[]>(
    (existing?.chores ?? currentExisting?.chores ?? []).map((chore) => toChoreDraft(chore)),
  );
  const [expandedChoreId, setExpandedChoreId] = useState<string | null>(null);
  const [expandedChoreDraft, setExpandedChoreDraft] = useState<HomeChoreDraft | null>(null);
  const [expandedChoreIsNew, setExpandedChoreIsNew] = useState(false);
  const [isCreatingChore, setIsCreatingChore] = useState(false);
  const [newChoreName, setNewChoreName] = useState('');
  const [choreEditorTabs, setChoreEditorTabs] = useState<Record<string, 'schedule' | 'action'>>({});
  const [confirmRemoveChoreId, setConfirmRemoveChoreId] = useState<string | null>(null);
  const [executingChoreIds, setExecutingChoreIds] = useState<Record<string, boolean>>({});
  const [taskExecutionDrafts, setTaskExecutionDrafts] = useState<Record<string, Partial<InputFields>>>({});
  const [executeCompletionSummary, setExecuteCompletionSummary] = useState<ExecuteCompletionSummary | null>(null);
  const [gtdPushFeedbackTaskId, setGtdPushFeedbackTaskId] = useState<string | null>(null);
  const [isAlbumEditorOpen, setIsAlbumEditorOpen] = useState(false);
  const [editingAlbumEntry, setEditingAlbumEntry] = useState<AlbumEntry | undefined>(undefined);
  const [pendingAlbumLocation, setPendingAlbumLocation] = useState<string | null>(null);
  const [pendingAlbumSourceRef, setPendingAlbumSourceRef] = useState<string | null>(null);

  const canSave = displayName.trim().length > 0;
  const addressLabel = [streetAddress.trim(), city.trim(), stateCode.trim()].filter(Boolean).join(', ');
  const liveLinks = currentExisting?.links ?? existing?.links;
  const memberIds = useMemo(
    () => collectHomeMemberIds(draftHomeId, resources, liveLinks),
    [draftHomeId, liveLinks, resources],
  );
  const allRooms = useMemo(
    () => {
      const seen = new Set<string>();
      return stories.flatMap((story) => story.rooms.flatMap((room) => {
        if (seen.has(room.id)) return [];
        seen.add(room.id);
        return [{ id: room.id, name: room.name }];
      }));
    },
    [stories],
  );
  const filteredAlbum = useMemo(
    () => (
      albumRoomFilter === 'all'
        ? album
        : albumRoomFilter === 'outside'
          ? album.filter((entry) => !entry.sourceRef || !allRooms.some((room) => room.id === entry.sourceRef))
          : album.filter((entry) => entry.sourceRef === albumRoomFilter)
    ),
    [album, albumRoomFilter, allRooms],
  );
  const memberContacts = useMemo(
    () => memberIds
      .map((memberId) => resources[memberId])
      .filter((resource): resource is ContactResource => resource?.type === 'contact')
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })),
    [memberIds, resources],
  );

  const expandedChore = expandedChoreDraft ?? (
    expandedChoreId
      ? choreDrafts.find((task) => task.id === expandedChoreId) ?? null
      : null
  );
  const hasExpandedChore = expandedChore != null;

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

  useEffect(() => {
    if (locationLocked) return undefined;

    const query = [streetAddress.trim(), city.trim(), stateCode.trim()].filter(Boolean).join(', ');
    let cancelled = false;
    if (!query) {
      const timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setGeocodeStatus('idle');
        setGeocodedLabel(null);
        setLat(undefined);
        setLon(undefined);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const result = await forwardGeocode(query);
        if (cancelled) return;
        if (result) {
          setGeocodeStatus('found');
          setGeocodedLabel(result.displayName ?? query);
          setLat(result.lat);
          setLon(result.lng);
        } else {
          setGeocodeStatus('not-found');
          setGeocodedLabel(null);
          setLat(undefined);
          setLon(undefined);
        }
      })();
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [city, locationLocked, stateCode, streetAddress]);

  function updateChoreDraft(taskId: string, patch: Partial<HomeChoreDraft>) {
    setExpandedChoreDraft((prev) => (
      prev && prev.id === taskId ? { ...prev, ...patch } : prev
    ));
  }

  function updateChoreRecurrence(taskId: string, patch: Partial<ResourceRecurrenceRule>) {
    setExpandedChoreDraft((prev) => (
      prev && prev.id === taskId
        ? { ...prev, recurrence: { ...prev.recurrence, ...patch } }
        : prev
    ));
  }

  function toggleChoreDay(taskId: string, day: RecurrenceDayOfWeek) {
    setExpandedChoreDraft((prev) => {
      if (!prev || prev.id !== taskId) return prev;
      const days = prev.recurrence.days.includes(day)
        ? prev.recurrence.days.filter((entry) => entry !== day)
        : [...prev.recurrence.days, day];
      return { ...prev, recurrence: { ...prev.recurrence, days } };
    });
  }

  function openExistingChoreEditor(task: HomeChoreDraft) {
    setIsCreatingChore(false);
    setNewChoreName('');
    setExpandedChoreId(task.id);
    setExpandedChoreDraft({
      ...task,
      recurrence: cloneRecurrenceRule(task.recurrence),
      inputFields: task.inputFields ? { ...task.inputFields } : undefined,
    });
    setExpandedChoreIsNew(false);
    setChoreEditorTabs((prev) => ({ ...prev, [task.id]: prev[task.id] ?? 'schedule' }));
    setActiveTab('tasks');
    setConfirmRemoveChoreId(null);
    setExecuteCompletionSummary(null);
  }

  const normalizeChoreDraft = useCallback((task: HomeChoreDraft): HomeChoreDraft => ({
    ...task,
    icon: task.icon.trim() || defaultHomeIcon,
    taskType: normalizeHomeTaskType(task.taskType),
    recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
    recurrence: cloneRecurrenceRule(task.recurrence),
    assignedTo: task.assignedTo || 'all',
    inputFields: buildTaskInputFields(
      task.taskType ?? 'CHECK',
      task.name.trim(),
      task.inputFields,
    ),
  }), [defaultHomeIcon]);

  const mergeExpandedChoreIntoTaskDrafts = useCallback((sourceTaskDrafts: HomeChoreDraft[]): HomeChoreDraft[] => {
    if (!expandedChoreId || !expandedChoreDraft || expandedChoreDraft.id !== expandedChoreId) {
      return sourceTaskDrafts;
    }

    const normalizedTask = normalizeChoreDraft(expandedChoreDraft);
    if (expandedChoreIsNew) {
      return normalizedTask.name.trim() ? [...sourceTaskDrafts, normalizedTask] : sourceTaskDrafts;
    }

    return sourceTaskDrafts.map((task) => (task.id === normalizedTask.id ? normalizedTask : task));
  }, [expandedChoreDraft, expandedChoreId, expandedChoreIsNew, normalizeChoreDraft]);

  function commitExpandedChoreAndClose() {
    const nextTaskDrafts = mergeExpandedChoreIntoTaskDrafts(choreDrafts);
    setChoreDrafts(nextTaskDrafts);
    setExpandedChoreDraft(null);
    setExpandedChoreId(null);
    setExpandedChoreIsNew(false);
    setConfirmRemoveChoreId(null);
  }

  function discardExpandedNewChore() {
    setExpandedChoreDraft(null);
    setExpandedChoreId(null);
    setExpandedChoreIsNew(false);
    setConfirmRemoveChoreId(null);
  }

  function beginTaskCreation() {
    setIsCreatingChore(true);
    setNewChoreName('');
    setExpandedChoreDraft(null);
    setExpandedChoreId(null);
    setExpandedChoreIsNew(false);
    setConfirmRemoveChoreId(null);
    setExecuteCompletionSummary(null);
  }

  function cancelTaskCreation() {
    setIsCreatingChore(false);
    setNewChoreName('');
  }

  function createTaskFromPrompt() {
    const trimmedName = newChoreName.trim();
    if (!trimmedName) return;
    const nextTask = {
      ...makeBlankChoreDraft(defaultHomeIcon),
      name: trimmedName,
      inputFields: buildTaskInputFields('CHECK', trimmedName),
    };
    setIsCreatingChore(false);
    setNewChoreName('');
    setExpandedChoreId(nextTask.id);
    setExpandedChoreDraft(nextTask);
    setExpandedChoreIsNew(true);
    setChoreEditorTabs((prev) => ({ ...prev, [nextTask.id]: 'schedule' }));
    setActiveTab('tasks');
    setConfirmRemoveChoreId(null);
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
    const task = expandedChoreDraft?.id === taskId
      ? expandedChoreDraft
      : choreDrafts.find((entry) => entry.id === taskId);
    const userId = user?.system.id;
    const persistedHome = (useResourceStore.getState().resources[draftHomeId] as HomeResource | undefined) ?? currentExisting ?? existing;
    if (!task || !userId || !persistedHome) return;

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
      title: task.name.trim() || 'Untitled chore',
      taskType: normalizeHomeTaskType(task.taskType),
      completionState: 'complete',
      completedAt: now,
      resultFields: {
        ...(result ?? {}),
        resourceTaskId: `resource-task:${persistedHome.id}:chore:${task.id}`,
      },
      icon: task.icon.trim() || iconKey,
      resourceRef: persistedHome.id,
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
      statGroup: 'health',
      source: 'home-chore.execute.quickActions',
    });
    awardStat(userId, 'health', 5, 'home-chore.execute.quickActions');
    setTaskExecutionDrafts((prev) => ({ ...prev, [taskId]: { ...result } }));
    setExecuteCompletionSummary({
      taskId,
      taskName: task.name.trim() || 'Untitled chore',
      note: extractExecutionNote(result),
    });
    setExecutingChoreIds((prev) => ({ ...prev, [taskId]: false }));
  }, [choreDrafts, currentExisting, draftHomeId, existing, expandedChoreDraft, iconKey, setActiveEvent, setScheduleTask, user]);

  const pushTaskToGtd = useCallback((task: HomeChoreDraft) => {
    const persistedHome = (useResourceStore.getState().resources[draftHomeId] as HomeResource | undefined) ?? currentExisting ?? existing;
    const latestUser = useUserStore.getState().user ?? user;
    if (!persistedHome || !latestUser || gtdPushFeedbackTaskId === task.id) return;

    const dueDate = getAppDate();
    const resourceTaskId = `resource-task:${persistedHome.id}:chore:${task.id}`;
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

    const taskType = normalizeHomeTaskType(task.taskType);
    const nextTask: Task = {
      id: uuidv4(),
      templateRef: resourceTaskId,
      isUnique: true,
      title: task.name.trim() || 'Untitled chore',
      taskType,
      completionState: 'pending',
      completedAt: null,
      resultFields: ({
        ...buildTaskInputFields(taskType, task.name.trim(), task.inputFields),
        resourceTaskId,
        dueDate,
        label: task.name.trim() || 'Untitled chore',
      } as unknown) as Task['resultFields'],
      attachmentRef: null,
      resourceRef: persistedHome.id,
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
  }, [currentExisting, draftHomeId, existing, gtdPushFeedbackTaskId, setScheduleTask, setUser, user]);

  const handleSave = useCallback((options?: { closeAfterSave?: boolean }) => {
    if (!canSave) return false;

    const taskDraftsForSave = mergeExpandedChoreIntoTaskDrafts(choreDrafts);
    if (taskDraftsForSave !== choreDrafts) {
      setChoreDrafts(taskDraftsForSave);
    }

    const now = new Date().toISOString();
    const finalChores: HomeChore[] = taskDraftsForSave
      .filter((task) => task.name.trim().length > 0)
      .map((task) => ({
        id: task.id,
        icon: task.icon.trim() || defaultHomeIcon,
        name: task.name.trim(),
        taskType: normalizeHomeTaskType(task.taskType),
        recurrenceMode: normalizeRecurrenceMode(task.recurrenceMode),
        recurrence: cloneRecurrenceRule(task.recurrence),
        reminderLeadDays: task.reminderLeadDays,
        assignedTo: task.assignedTo || 'all',
        inputFields: buildTaskInputFields(task.taskType ?? 'CHECK', task.name.trim(), task.inputFields),
      }));

    const finalStories: HomeStory[] = stories
      .map((story, index) => ({
        ...story,
        name: story.name.trim() || `Story ${index + 1}`,
        outlineOrigin: story.outlineOrigin ? { ...story.outlineOrigin } : undefined,
        outlineSegments: story.outlineSegments?.map((segment) => ({
          direction: segment.direction,
          distance: Math.max(1, Number(segment.distance) || 1),
          kind: (segment.kind === 'door' ? 'door' : 'wall') as FloorPlanSegmentKind,
        })),
        placedItems: story.placedItems ?? [],
        photos: (story.photos ?? []).filter(Boolean),
        rooms: story.rooms
          .filter((room) => room.name.trim() && room.segments.length > 0)
          .map((room) => ({
            ...room,
            name: room.name.trim(),
            icon: room.icon.trim(),
            color: room.color?.trim() || undefined,
            segments: room.segments.map((segment) => ({
              direction: segment.direction,
              distance: Math.max(1, Number(segment.distance) || 1),
              kind: (segment.kind === 'door' ? 'door' : 'wall') as FloorPlanSegmentKind,
            })),
            placedItems: room.placedItems ?? [],
            photos: (room.photos ?? []).filter(Boolean),
          })),
      }))
      .filter((story) => story.name.trim() || story.rooms.length > 0);

    const nextLinks = currentExisting?.links ?? existing?.links;
    const nextMemberIds = collectHomeMemberIds(draftHomeId, resources, nextLinks);
    const resource: HomeResource = {
      type: 'home',
      id: draftHomeId,
      icon: iconKey,
      name: displayName.trim(),
      createdAt: currentExisting?.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
      address: streetAddress.trim() || undefined,
      city: city.trim() || undefined,
      state: stateCode.trim() || undefined,
      lat,
      lon,
      members: nextMemberIds.length > 0 ? nextMemberIds : undefined,
      stories: finalStories.length > 0 ? finalStories : undefined,
      chores: finalChores.length > 0 ? finalChores : undefined,
      notes: currentExisting?.notes ?? existing?.notes,
      links: nextLinks,
      album: album.length > 0 ? album : undefined,
      linkedAccountIds: currentExisting?.linkedAccountIds ?? existing?.linkedAccountIds,
      linkedDocIds: currentExisting?.linkedDocIds ?? existing?.linkedDocIds,
      sharedWith: currentExisting?.sharedWith ?? existing?.sharedWith ?? null,
    };

    setResource(resource);

    const previousMembers = new Set(currentExisting?.members ?? existing?.members ?? []);
    const nextMembers = new Set(nextMemberIds);
    const allContacts = Object.values(resources).filter((entry): entry is ContactResource => entry.type === 'contact');
    for (const contact of allContacts) {
      const wasMember = previousMembers.has(contact.id);
      const isMember = nextMembers.has(contact.id);
      if (wasMember === isMember) continue;
      const updatedContact: ContactResource = {
        ...contact,
        linkedHomeId: isMember ? resource.id : contact.linkedHomeId === resource.id ? undefined : contact.linkedHomeId,
        updatedAt: now,
      };
      setResource(updatedContact);
    }

    if (!existing && user) {
      setUser({
        ...user,
        resources: {
          ...user.resources,
          homes: user.resources.homes.includes(resource.id)
            ? user.resources.homes
            : [...user.resources.homes, resource.id],
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
    canSave,
    choreDrafts,
    city,
    currentExisting,
    defaultHomeIcon,
    displayName,
    draftHomeId,
    existing,
    iconKey,
    onSaved,
    resources,
    setResource,
    setUser,
    stateCode,
    stories,
    streetAddress,
    lat,
    lon,
    user,
    mergeExpandedChoreIntoTaskDrafts,
  ]);

  useEffect(() => {
    registerOnAutoSave?.(() => {
      handleSave({ closeAfterSave: false });
    });
  }, [handleSave, registerOnAutoSave]);

  function handleAddAlbumEntry() {
    setPendingAlbumLocation(null);
    setPendingAlbumSourceRef(null);
    setEditingAlbumEntry(undefined);
    setIsAlbumEditorOpen(true);
  }

  function handleEditAlbumEntry(entry: AlbumEntry) {
    setPendingAlbumLocation(null);
    setPendingAlbumSourceRef(null);
    setEditingAlbumEntry(entry);
    setIsAlbumEditorOpen(true);
  }

  const handleOpenAlbumEditor = useCallback((location: string, sourceRef?: string) => {
    setPendingAlbumLocation(location);
    setPendingAlbumSourceRef(sourceRef ?? null);
    setEditingAlbumEntry(undefined);
    setIsAlbumEditorOpen(true);
  }, []);

  function handleDeleteAlbumEntry(entryId: string) {
    setAlbum((prev) => prev.filter((entry) => entry.id !== entryId));
  }

  function handleSaveAlbumEntry(entry: AlbumEntry) {
    const finalEntry: AlbumEntry = pendingAlbumLocation
      ? {
          ...entry,
          location: {
            ...(entry.location ?? {}),
            latitude: entry.location?.latitude ?? 0,
            longitude: entry.location?.longitude ?? 0,
            placeName: pendingAlbumLocation,
          },
          sourceRef: pendingAlbumSourceRef ?? entry.sourceRef,
        }
      : {
          ...entry,
          sourceRef: pendingAlbumSourceRef ?? entry.sourceRef,
        };

    setAlbum((prev) => {
      const existingIndex = prev.findIndex((candidate) => candidate.id === finalEntry.id);
      if (existingIndex === -1) return [...prev, finalEntry];
      const next = [...prev];
      next[existingIndex] = finalEntry;
      return next;
    });
    setIsAlbumEditorOpen(false);
    setPendingAlbumLocation(null);
    setPendingAlbumSourceRef(null);
    setEditingAlbumEntry(undefined);
  }

  function renderDetailsTab() {
    const hasPinnedLocation = typeof lat === 'number' && typeof lon === 'number';
    const handleStreetAddressChange = (value: string) => {
      setStreetAddress(value);
      setLocationLocked(false);
      setGeocodeStatus(value.trim() || city.trim() || stateCode.trim() ? 'loading' : 'idle');
    };

    const handleCityChange = (value: string) => {
      setCity(value);
      setLocationLocked(false);
      setGeocodeStatus(streetAddress.trim() || value.trim() || stateCode.trim() ? 'loading' : 'idle');
    };

    const handleStateCodeChange = (value: string) => {
      setStateCode(value);
      setLocationLocked(false);
      setGeocodeStatus(streetAddress.trim() || city.trim() || value.trim() ? 'loading' : 'idle');
    };

    return (
      <div className="px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-row items-center gap-2 sm:col-span-2">
            <div className="shrink-0">
              <IconPicker value={iconKey} onChange={setIconKey} allowedKeys={homeIconKeys} />
            </div>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. Main Home"
              maxLength={100}
              className={`${INPUT_CLS} flex-1 min-w-0`}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Street</label>
            <input
              type="text"
              value={streetAddress}
              onChange={(event) => handleStreetAddressChange(event.target.value)}
              placeholder="123 Main St"
              maxLength={200}
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">City</label>
            <input
              type="text"
              value={city}
              onChange={(event) => handleCityChange(event.target.value)}
              placeholder="Denver"
              maxLength={120}
              className={INPUT_CLS}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">State</label>
            <input
              type="text"
              value={stateCode}
              onChange={(event) => handleStateCodeChange(event.target.value)}
              placeholder="CO"
              maxLength={40}
              className={INPUT_CLS}
            />
          </div>
          <div className="sm:col-span-2">
            {locationLocked && hasPinnedLocation ? (
              <div className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <IconDisplay iconKey="home-icon-house" size={12} alt="" />
                <span>Location set</span>
                <button
                  type="button"
                  onClick={() => setShowLocationPicker(true)}
                  className="ml-1 text-blue-500 underline"
                >
                  Adjust
                </button>
              </div>
            ) : null}
            {!locationLocked && geocodeStatus === 'found' ? (
              <div className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <IconDisplay iconKey="home-icon-house" size={12} alt="" />
                <span>Address recognized</span>
                <button
                  type="button"
                  onClick={() => setShowLocationPicker(true)}
                  className="ml-1 text-blue-500 underline"
                >
                  Adjust
                </button>
              </div>
            ) : null}
            {!locationLocked && geocodeStatus === 'not-found' ? (
              <div className="mt-1 space-y-1">
                <div className="mt-1 text-xs text-red-500">Address not recognized</div>
                <button
                  type="button"
                  onClick={() => setShowLocationPicker(true)}
                  className="text-xs text-blue-500 underline"
                >
                  Set location on map
                </button>
              </div>
            ) : null}
            {!locationLocked && geocodeStatus === 'loading' ? (
              <div className="mt-1 text-xs text-gray-400">Locating address...</div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function renderTaskRow(task: HomeChoreDraft) {
    return (
      <button
        key={task.id}
        type="button"
        onClick={() => openExistingChoreEditor(task)}
        className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-purple-300 dark:border-gray-700 dark:bg-gray-900/60"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
          <IconDisplay iconKey={task.icon || defaultHomeIcon} size={20} className="h-5 w-5 object-contain" alt="" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {task.name.trim() || 'Untitled chore'}
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="truncate">{describeChoreRecurrence(task)}</span>
            {(task.reminderLeadDays ?? -1) > -1 ? <span className="shrink-0 text-sm leading-none">{'\u{1F514}'}</span> : null}
          </div>
        </div>
      </button>
    );
  }

  function renderExpandedChore(task: HomeChoreDraft) {
    const activeEditorTab = choreEditorTabs[task.id] ?? 'schedule';
    const selectedTaskType = normalizeHomeTaskType(task.taskType);
    const taskInputFields = buildTaskInputFields(selectedTaskType, task.name.trim(), task.inputFields);
    const isPeriodic = normalizeRecurrenceMode(task.recurrenceMode) === 'recurring';
    const sendToGtd = (task.reminderLeadDays ?? -1) >= 0;
    const isExecutingTask = executingChoreIds[task.id] === true;
    const summary = executeCompletionSummary?.taskId === task.id ? executeCompletionSummary : null;
    const isShowingGtdPushFeedback = gtdPushFeedbackTaskId === task.id;
    const persistedHome = (resources[draftHomeId] as HomeResource | undefined) ?? currentExisting ?? existing;
    const executionDraft = taskExecutionDrafts[task.id] ?? {};

    const executionTemplate: TaskTemplate = {
      name: task.name.trim() || 'Untitled chore',
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
      id: `home-chore-preview:${task.id}`,
      templateRef: null,
      isUnique: true,
      title: task.name.trim() || 'Untitled chore',
      taskType: selectedTaskType,
      completionState: 'pending',
      completedAt: null,
      resultFields: ({
        ...taskInputFields,
        ...executionDraft,
        label: task.name.trim() || 'Untitled chore',
      } as unknown) as Task['resultFields'],
      attachmentRef: null,
      resourceRef: persistedHome?.id ?? null,
      location: null,
      sharedWith: null,
      questRef: null,
      actRef: null,
      secondaryTag: null,
    };

    return (
      <div className="flex h-full flex-col">
        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <IconPicker value={task.icon || defaultHomeIcon} onChange={(value) => updateChoreDraft(task.id, { icon: value })} align="left" />
            <input
              type="text"
              value={task.name}
              onChange={(event) => updateChoreDraft(task.id, { name: event.target.value })}
              placeholder="Chore name"
              maxLength={100}
              className={INPUT_CLS}
              autoFocus={expandedChoreIsNew}
            />
          </div>

          <div className="inline-flex rounded-full bg-gray-100 p-1 dark:bg-gray-800">
            {(['schedule', 'action'] as const).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setChoreEditorTabs((prev) => ({ ...prev, [task.id]: tabKey }))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeEditorTab === tabKey
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tabKey === 'schedule' ? 'Schedule' : 'Action'}
              </button>
            ))}
          </div>

          {activeEditorTab === 'schedule' ? (
            <div className="space-y-4">
              <div className="inline-flex rounded-full bg-gray-100 p-1 dark:bg-gray-800">
                {(['recurring', 'never'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateChoreDraft(task.id, { recurrenceMode: mode })}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      normalizeRecurrenceMode(task.recurrenceMode) === mode
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    {mode === 'recurring' ? 'Periodic' : 'On Demand'}
                  </button>
                ))}
              </div>

              {isPeriodic ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Frequency</label>
                      <select
                        value={task.recurrence.frequency}
                        onChange={(event) => updateChoreRecurrence(task.id, {
                          frequency: event.target.value as ResourceRecurrenceRule['frequency'],
                          days: event.target.value === 'weekly' ? task.recurrence.days : [],
                          monthlyDay: event.target.value === 'monthly'
                            ? (task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate))
                            : null,
                        })}
                        className={INPUT_CLS}
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
                        onChange={(event) => updateChoreRecurrence(task.id, { interval: Math.max(1, Number(event.target.value) || 1) })}
                        className={INPUT_CLS}
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
                            onClick={() => toggleChoreDay(task.id, key)}
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
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Day of month</label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={task.recurrence.monthlyDay ?? getDayOfMonth(task.recurrence.seedDate)}
                        onChange={(event) => updateChoreRecurrence(task.id, {
                          monthlyDay: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                        })}
                        className={INPUT_CLS}
                      />
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Start Date</label>
                      <input
                        type="date"
                        value={task.recurrence.seedDate}
                        onChange={(event) => updateChoreRecurrence(task.id, {
                          seedDate: event.target.value,
                          monthlyDay: task.recurrence.frequency === 'monthly'
                            ? (task.recurrence.monthlyDay ?? getDayOfMonth(event.target.value))
                            : task.recurrence.monthlyDay,
                        })}
                        className={INPUT_CLS}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">End Date</label>
                      <input
                        type="date"
                        value={task.recurrence.endsOn ?? ''}
                        onChange={(event) => updateChoreRecurrence(task.id, { endsOn: event.target.value || null })}
                        className={INPUT_CLS}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-900/70">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={sendToGtd}
                        onChange={(event) => updateChoreDraft(task.id, { reminderLeadDays: event.target.checked ? Math.max(0, task.reminderLeadDays ?? 0) : -1 })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-gray-500"
                      />
                      <span>Push to GTD list</span>
                    </label>

                    {sendToGtd ? (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Days before (0 = on the day)</label>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={Math.max(0, task.reminderLeadDays ?? 0)}
                          onChange={(event) => updateChoreDraft(task.id, { reminderLeadDays: Math.max(0, Number(event.target.value) || 0) })}
                          className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">This chore stays available for on-demand execution.</p>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Assigned To</label>
                <select
                  value={task.assignedTo}
                  onChange={(event) => updateChoreDraft(task.id, { assignedTo: event.target.value })}
                  className={INPUT_CLS}
                >
                  <option value="all">All</option>
                  {memberContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>{contact.name}</option>
                  ))}
                </select>
              </div>
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
                      onClick={() => setExecutingChoreIds((prev) => ({ ...prev, [task.id]: false }))}
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
                        const nextType = normalizeHomeTaskType(event.target.value);
                        updateChoreDraft(task.id, {
                          taskType: nextType,
                          inputFields: buildTaskInputFields(nextType, task.name.trim(), task.inputFields),
                        });
                      }}
                      className={INPUT_CLS}
                    >
                      {HOME_TASK_TYPE_OPTIONS.map((taskType) => (
                        <option key={taskType.value} value={taskType.value}>{taskType.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-600 dark:bg-gray-800/40">
                    <TaskTypeConfigEditor
                      taskType={selectedTaskType}
                      inputFields={task.inputFields ?? {}}
                      onChange={(fields) => updateChoreDraft(task.id, {
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
          {summary ? (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Completed {summary.taskName}{summary.note ? `: ${summary.note}` : ''}. +5 Health
            </div>
          ) : null}
          {isShowingGtdPushFeedback ? (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              Added to GTD list
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {expandedChoreIsNew ? (
              <button
                type="button"
                onClick={discardExpandedNewChore}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (confirmRemoveChoreId === task.id) {
                    setChoreDrafts((prev) => prev.filter((entry) => entry.id !== task.id));
                    setExpandedChoreDraft(null);
                    setExpandedChoreId(null);
                    setExpandedChoreIsNew(false);
                    setConfirmRemoveChoreId(null);
                    return;
                  }
                  setConfirmRemoveChoreId(task.id);
                }}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  confirmRemoveChoreId === task.id
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40'
                }`}
              >
                {confirmRemoveChoreId === task.id ? 'Tap again to remove' : 'Remove'}
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={commitExpandedChoreAndClose}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => pushTaskToGtd(task)}
                disabled={!persistedHome || !task.name.trim() || isShowingGtdPushFeedback}
                className="rounded-md border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
              >
                Push to GTD
              </button>
              <button
                type="button"
                onClick={() => {
                  setChoreEditorTabs((prev) => ({ ...prev, [task.id]: 'action' }));
                  setExecutingChoreIds((prev) => ({ ...prev, [task.id]: true }));
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
    if (expandedChore) {
      return renderExpandedChore(expandedChore);
    }

    return (
      <div className="space-y-5 px-4 py-4">
        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Chores</div>
          <div className="space-y-2">
            {choreDrafts.length > 0 ? choreDrafts.map((task) => renderTaskRow(task)) : (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                No chores yet.
              </div>
            )}
          </div>
          {isCreatingChore ? (
            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-4 dark:border-blue-900 dark:bg-blue-950/20">
              <input
                type="text"
                value={newChoreName}
                onChange={(event) => setNewChoreName(event.target.value)}
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
                placeholder="Chore name..."
                maxLength={100}
                className={INPUT_CLS}
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
                  disabled={!newChoreName.trim()}
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
            Add Chore
          </button>
        </section>
      </div>
    );
  }

  function renderLinksTab() {
    const persistedHome = (resources[draftHomeId] as HomeResource | undefined) ?? currentExisting ?? existing;
    return (
      <div className="space-y-4 px-4 py-4">
        {persistedHome ? (
          <ResourceLinksTabNew resource={persistedHome} />
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
            Name this home first, then links will appear here.
          </div>
        )}
      </div>
    );
  }

  function renderAlbumTab() {
    return (
      <div className="px-4 py-4">
        <label className="mb-2 block">
          <span className="sr-only">Filter album by room</span>
          <select
            value={albumRoomFilter}
            onChange={(event) => setAlbumRoomFilter(event.target.value)}
            className="rounded border px-2 py-1 text-xs"
          >
            <option value="all">All Photos</option>
            {allRooms.map((room) => (
              <option key={room.id} value={room.id}>{room.name}</option>
            ))}
            <option value="outside">Outside Rooms</option>
          </select>
        </label>
        <AlbumViewer
          entries={filteredAlbum}
          onAdd={handleAddAlbumEntry}
          onEdit={handleEditAlbumEntry}
          onDelete={handleDeleteAlbumEntry}
          title="Album"
        />
      </div>
    );
  }

  function renderLayoutTab() {
    return (
      <div className="flex flex-col overflow-hidden" style={{ height: '100%' }}>
        <HomeLayout
          stories={stories}
          onChange={setStories}
          editable
          homeId={draftHomeId}
          homeAlbum={album}
          onRoomSelectedChange={setRoomSelected}
          onPlacementExpandedChange={setPlacementExpanded}
          onOpenAlbumEditor={handleOpenAlbumEditor}
        />
      </div>
    );
  }

  const albumEditorEntry = pendingAlbumLocation
    ? ({
        id: `album-draft:${uuidv4()}`,
        date: '',
        entryKind: 'photo',
        location: {
          latitude: 0,
          longitude: 0,
          placeName: pendingAlbumLocation,
        },
        sourceRef: pendingAlbumSourceRef ?? undefined,
      } satisfies AlbumEntry)
    : editingAlbumEntry;

  function handleTabChange(nextTab: string) {
    if (nextTab === 'links' && !currentExisting && !existing && canSave) {
      handleSave({ closeAfterSave: false });
    }
    setActiveTab(nextTab);
  }

  return (
    <>
      <ResourceFormShell
        title={existing ? 'Edit Home' : 'New Home'}
        onSave={() => {
          handleSave();
        }}
        resourceIcon={iconKey}
        resourceName={displayName}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        hideChrome={hasExpandedChore}
        hideTabs={roomSelected || placementExpanded}
        noScrollContent={activeTab === 'layout'}
      >
        {activeTab === 'details' ? renderDetailsTab() : null}
        {activeTab === 'tasks' ? renderTasksTab() : null}
        {activeTab === 'links' ? renderLinksTab() : null}
        {activeTab === 'album' ? renderAlbumTab() : null}
        {activeTab === 'layout' ? renderLayoutTab() : null}
      </ResourceFormShell>

      {isAlbumEditorOpen ? (
        <AlbumEntryEditor
          entry={albumEditorEntry}
          onSave={handleSaveAlbumEntry}
          onCancel={() => {
            setIsAlbumEditorOpen(false);
            setPendingAlbumLocation(null);
            setPendingAlbumSourceRef(null);
            setEditingAlbumEntry(undefined);
          }}
        />
      ) : null}

      {showLocationPicker ? (
        <AlbumLocationPicker
          initialLocation={typeof lat === 'number' && typeof lon === 'number'
            ? { latitude: lat, longitude: lon, placeName: addressLabel || geocodedLabel || '' }
            : undefined}
          onConfirm={(location) => {
            if (!location) {
              setShowLocationPicker(false);
              return;
            }

            setLat(location.latitude);
            setLon(location.longitude);
            setGeocodedLabel(location.placeName ?? '');
            setGeocodeStatus('found');
            setLocationLocked(true);
            setShowLocationPicker(false);
          }}
          onCancel={() => setShowLocationPicker(false)}
        />
      ) : null}
    </>
  );
}
