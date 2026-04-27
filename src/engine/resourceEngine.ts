// ─────────────────────────────────────────
// RESOURCE ENGINE — Resource-generates-task pattern (D42)
//
// Each resource type (except Doc) generates tasks via two paths:
//   1. generateScheduledTasks() — PlannedEvents written to scheduleStore + storage
//   2. generateGTDItems()       — Tasks written directly to gtdList
//
// computeGTDList() — scans all active resources, merges deduped GTD items
// completeGTDItem() — marks item done, writes to QuickActionsEvent, fires coach
//
// Doc generates tasks via course progression — stub only (deferred BUILD-time task).
//
// Resource context tasks award +2 defense bonus per D39 (Task.resourceRef set).
// ─────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import type {
  AccountResource,
  ContactResource,
  DocResource,
  InventoryContainerLink,
  HomeResource,
  ItemInstance,
  InventoryResource,
  Resource,
  VehicleLayout,
  VehicleMaintenanceTask,
  ResourceRecurrenceRule,
  VehicleResource,
} from '../types/resource';
import { normalizeRecurrenceMode } from '../types/resource';
import type { PlannedEvent } from '../types/plannedEvent';
import type { Task } from '../types/task';
import type { CircuitInputFields } from '../types/taskTemplate';
import type { XpAward } from '../types/taskTemplate';
import type { StatGroupKey, User } from '../types/user';
import { getAppDate, getAppNowISO, localISODate } from '../utils/dateUtils';
import type { QuickActionsEvent } from '../types/event';
import { useScheduleStore } from '../stores/useScheduleStore';
import { useUserStore } from '../stores/useUserStore';
import { useResourceStore } from '../stores/useResourceStore';
import { useProgressionStore } from '../stores/useProgressionStore';

import { awardXP, awardStat } from './awardPipeline';
import { completeMilestone, decodeQuestRef, encodeQuestRef } from './markerEngine';
import { checkAchievements } from '../coach/checkAchievements';
import { awardBadge } from '../coach/rewardPipeline';
import { pushRibbet } from '../coach/ribbet';
import { starterTaskTemplates, STARTER_ACT_IDS, STARTER_TEMPLATE_IDS } from '../coach/StarterQuestLibrary';
import { taskTemplateLibrary } from '../coach';
import { getItemTemplateByRef } from '../coach/ItemLibrary';
import { isWisdomTemplate } from './xpBoosts';
import { evaluateQuestSpecific, updateQuestProgress } from './questEngine';
import { getUserInventoryItemTemplates, resolveInventoryItemTemplate } from '../utils/inventoryItems';
import { resolveTaskTemplate } from '../utils/resolveTaskTemplate';

const STAT_GROUP_KEYS: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];

function getPrimaryStatGroup(statAward: XpAward): StatGroupKey | null {
  let best: StatGroupKey | null = null;
  let bestValue = 0;

  for (const stat of STAT_GROUP_KEYS) {
    const value = statAward[stat] ?? 0;
    if (value > bestValue) {
      best = stat;
      bestValue = value;
    }
  }

  return best;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  return getAppDate();
}

export function buildVehicleInspectionTask(layout: VehicleLayout): VehicleMaintenanceTask | null {
  if (layout.areas.length === 0) return null;

  const seedDate = todayISO();
  const steps: CircuitInputFields['steps'] = [
    ...layout.areas.map((area) => ({
      id: uuidv4(),
      label: `Check ${area.name}`,
      stepType: 'CHOICE' as const,
      options: ['Pass', 'Fail'],
      required: true,
    })),
    {
      id: uuidv4(),
      label: 'Capture overall condition',
      stepType: 'SCAN' as const,
      required: true,
    },
  ];

  return {
    id: uuidv4(),
    icon: 'circuit',
    name: 'Vehicle Inspection',
    kind: 'maintenance',
    taskType: 'CIRCUIT',
    inputFields: {
      label: 'Vehicle Inspection',
      steps,
      rounds: 1,
      restBetweenRounds: null,
    },
    recurrenceMode: 'never',
    recurrence: {
      frequency: 'monthly',
      interval: 1,
      days: [],
      monthlyDay: Number(seedDate.split('-')[2] ?? '1'),
      seedDate,
      endsOn: null,
    },
    reminderLeadDays: -1,
  };
}

export function ensureVehicleInspectionTask(
  maintenanceTasks: VehicleMaintenanceTask[] | undefined,
  layout: VehicleLayout | undefined,
  hadLayoutBefore: boolean,
): VehicleMaintenanceTask[] | undefined {
  const tasks = maintenanceTasks ?? [];
  if (!layout || hadLayoutBefore) return tasks.length > 0 ? tasks : undefined;
  if (tasks.some((task) => task.name === 'Vehicle Inspection')) return tasks;

  const inspectionTask = buildVehicleInspectionTask(layout);
  if (!inspectionTask) return tasks.length > 0 ? tasks : undefined;
  return [...tasks, inspectionTask];
}

export function syncVehicleLayoutContainerAssignments(
  resources: Record<string, Resource>,
  vehicleId: string,
  layout: VehicleLayout | undefined,
): InventoryResource[] {
  const now = new Date().toISOString();
  const areaAssignments = new Map<string, string>();
  for (const area of layout?.areas ?? []) {
    for (const containerId of area.containerIds) {
      areaAssignments.set(containerId, area.id);
    }
  }

  return Object.values(resources)
    .filter((resource): resource is InventoryResource => resource.type === 'inventory')
    .flatMap((inventory) => {
      let changed = false;
      const nextContainers = (inventory.containers ?? []).map((container) => {
        const locationLink = container.links?.find((link) => link.relationship === 'location' && link.targetKind === 'vehicle' && link.targetResourceId === vehicleId);
        const baseLinks = (container.links ?? []).filter((link) => !(link.relationship === 'location' && link.targetKind === 'vehicle' && link.targetResourceId === vehicleId));
        const assignedAreaId = areaAssignments.get(container.id);

        if (!assignedAreaId) {
          if (!locationLink) return container;
          changed = true;
          return {
            ...container,
            links: baseLinks.length > 0 ? baseLinks : undefined,
          };
        }

        const nextLocationLink: InventoryContainerLink = {
          id: locationLink?.id ?? uuidv4(),
          relationship: 'location',
          targetKind: 'vehicle',
          targetResourceId: vehicleId,
          targetAreaId: assignedAreaId,
          createdAt: locationLink?.createdAt ?? now,
        };

        const nextLinks = [...baseLinks, nextLocationLink];
        if (
          locationLink?.targetAreaId === assignedAreaId &&
          (container.links?.length ?? 0) === nextLinks.length
        ) {
          return container;
        }

        changed = true;
        return {
          ...container,
          links: nextLinks,
        };
      });

      return changed
        ? [{
            ...inventory,
            updatedAt: now,
            containers: nextContainers,
          }]
        : [];
    });
}

export function triggerVehicleInspectionTask(resource: VehicleResource): 'queued' | 'completed' | 'missing' {
  const inspectionTask = (resource.maintenanceTasks ?? []).find(
    (task) => task.taskType === 'CIRCUIT' && task.name === 'Vehicle Inspection',
  );
  if (!inspectionTask) return 'missing';

  const scheduleStore = useScheduleStore.getState();
  const latestUser = useUserStore.getState().user;
  if (!latestUser) return 'missing';

  const today = todayISO();
  const resourceTaskId = `resource-task:${resource.id}:maintenance:${inspectionTask.id}`;
  const existingPendingTask = latestUser.lists.gtdList
    .map((taskId) => scheduleStore.tasks[taskId])
    .find((task) => {
      if (!task || task.completionState !== 'pending') return false;
      const identity = readResourceTaskIdentity(task);
      return identity?.resourceTaskId === resourceTaskId;
    });

  if (existingPendingTask) {
    completeGTDItem(existingPendingTask.id, latestUser);
    return 'completed';
  }

  const queuedTask = buildResourceReminderTask(
    resource.id,
    resourceTaskId,
    resourceTaskId,
    today,
    inspectionTask.name,
    { label: inspectionTask.name } as Task['resultFields'],
  );

  scheduleStore.setTask(queuedTask);
  useUserStore.getState().setUser({
    ...latestUser,
    lists: {
      ...latestUser.lists,
      gtdList: [...new Set([...latestUser.lists.gtdList, queuedTask.id])],
    },
  });

  return 'queued';
}

function parseISODate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

function findItemTemplate(itemTemplateRef: string) {
  return (
    resolveInventoryItemTemplate(itemTemplateRef, getUserInventoryItemTemplates(useUserStore.getState().user)) ??
    getItemTemplateByRef(itemTemplateRef)
  );
}

function toPlannedEventRecurrence(recurrence: ResourceRecurrenceRule | string): PlannedEvent['recurrenceInterval'] {
  if (typeof recurrence === 'string') {
    switch (recurrence) {
      case 'daily':
        return { frequency: 'daily', days: [], interval: 1, endsOn: null, customCondition: null };
      case 'weekly':
        return { frequency: 'weekly', days: [], interval: 1, endsOn: null, customCondition: null };
      case 'monthly':
        return { frequency: 'monthly', days: [], interval: 1, endsOn: null, customCondition: null };
      case 'custom':
        return { frequency: 'custom', days: [], interval: 1, endsOn: null, customCondition: 'custom' };
      default:
        return { frequency: 'weekly', days: [], interval: 1, endsOn: null, customCondition: recurrence };
    }
  }

  if (recurrence.frequency === 'yearly') {
    return {
      frequency: 'custom',
      days: [],
      interval: Math.max(1, recurrence.interval || 1),
      endsOn: recurrence.endsOn ?? null,
      customCondition: 'yearly',
    };
  }

  return {
    frequency: recurrence.frequency,
    days: recurrence.days,
    interval: Math.max(1, recurrence.interval || 1),
    endsOn: recurrence.endsOn ?? null,
    customCondition: null,
  };
}

function isRecurringInventoryTask(task: { recurrenceMode?: 'recurring' | 'never' }): boolean {
  return (task.recurrenceMode ?? 'recurring') === 'recurring';
}

function resolveTaskTemplateName(taskTemplateRef: string): string {
  const scheduleStore = useScheduleStore.getState();
  return resolveTaskTemplate(
    taskTemplateRef,
    scheduleStore.taskTemplates,
    starterTaskTemplates,
    taskTemplateLibrary,
  )?.name ?? taskTemplateRef;
}

function buildPendingTask(
  templateRef: string,
  resourceRef: string,
  resultFields: Task['resultFields'] = {},
  title?: string,
): Task {
  return {
    id: uuidv4(),
    templateRef,
    title: title ?? null,
    completionState: 'pending',
    completedAt: null,
    resultFields,
    attachmentRef: null,
    resourceRef,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };
}

export function autoCompleteSystemTask(templateRef: string): void {
  autoCompleteSystemTaskInternal(templateRef, false);
}

function autoCompleteSystemTaskInternal(templateRef: string, skipOnboardingBackfill: boolean): void {
  const scheduleStore = useScheduleStore.getState();
  const existingTask = Object.values(scheduleStore.tasks).find(
    (task) => task.templateRef === templateRef && task.completionState === 'complete',
  );

  const completedTask: Task = existingTask ?? {
    id: uuidv4(),
    templateRef,
    completionState: 'complete',
    completedAt: new Date().toISOString(),
    resultFields: {},
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };

  if (!existingTask) {
    scheduleStore.setTask(completedTask);
  }

  const acts = useProgressionStore.getState().acts;
  for (const act of Object.values(acts)) {
    for (let chainIndex = 0; chainIndex < act.chains.length; chainIndex++) {
      const chain = act.chains[chainIndex];
      for (let questIndex = 0; questIndex < chain.quests.length; questIndex++) {
        const quest = chain.quests[questIndex];
        if (quest.completionState !== 'active') continue;
        if (!isQuestEligibleForSystemCompletion(act.id, chainIndex, questIndex)) continue;
        if (!(quest.measurable.taskTemplateRefs ?? []).includes(templateRef)) continue;

        updateQuestProgress(act.id, chainIndex, questIndex);

        const freshQuest = useProgressionStore.getState().acts[act.id]?.chains[chainIndex]?.quests[questIndex];
        if (!freshQuest || freshQuest.completionState !== 'active') continue;
        if (!evaluateQuestSpecific(freshQuest, completedTask)) continue;

        completeMilestone({
          ...completedTask,
          questRef: encodeQuestRef(act.id, chainIndex, questIndex),
          actRef: act.id,
        });

        const completedQuest = useProgressionStore.getState().acts[act.id]?.chains[chainIndex]?.quests[questIndex];
        if (!completedQuest || completedQuest.completionState !== 'complete') continue;
        pushRibbet('quest.completed');
      }
    }
  }

  if (!skipOnboardingBackfill) {
    syncOnboardingBackfill();
  }
}

function isOnboardingQuestTemplate(templateRef: string): boolean {
  return (
    templateRef === STARTER_TEMPLATE_IDS.openWelcomeEvent ||
    templateRef === STARTER_TEMPLATE_IDS.completeOnboardingAdventure ||
    templateRef === STARTER_TEMPLATE_IDS.setupSchedule ||
    templateRef === STARTER_TEMPLATE_IDS.learnGrounds ||
    templateRef === STARTER_TEMPLATE_IDS.claimIdentity
  );
}

function hasCompletedQuickActionTask(templateRef: string): boolean {
  const scheduleStore = useScheduleStore.getState();
  for (const event of Object.values(scheduleStore.activeEvents)) {
    if (!('eventType' in event) || event.eventType !== 'quickActions') continue;
    const quickActions = event as QuickActionsEvent;
    for (const completion of quickActions.completions) {
      const task = scheduleStore.tasks[completion.taskRef];
      if (!task) continue;
      if (task.templateRef !== templateRef) continue;
      if (task.completionState !== 'complete') continue;
      return true;
    }
  }
  return false;
}

function getCurrentOnboardingQuest() {
  const onboardingAct = useProgressionStore.getState().acts[STARTER_ACT_IDS.onboarding];
  const onboardingChain = onboardingAct?.chains[0];
  if (!onboardingAct || !onboardingChain) return null;

  const questIndex = onboardingChain.quests.findIndex((quest) => quest.completionState !== 'complete');
  if (questIndex === -1) return null;

  return {
    act: onboardingAct,
    chain: onboardingChain,
    quest: onboardingChain.quests[questIndex] ?? null,
    questIndex,
  };
}

function isQuestEligibleForSystemCompletion(actId: string, chainIndex: number, questIndex: number): boolean {
  if (actId !== STARTER_ACT_IDS.onboarding || chainIndex !== 0) return true;
  const current = getCurrentOnboardingQuest();
  return current?.questIndex === questIndex;
}

function shouldBackfillOnboardingTemplate(templateRef: string): boolean {
  const user = useUserStore.getState().user;
  const scheduleStore = useScheduleStore.getState();

  if (templateRef === STARTER_TEMPLATE_IDS.addRoutine) {
    return Object.keys(scheduleStore.plannedEvents).length > 0;
  }

  if (templateRef === STARTER_TEMPLATE_IDS.completeLuckyRoll) {
    return hasCompletedQuickActionTask(STARTER_TEMPLATE_IDS.roll);
  }

  if (templateRef === STARTER_TEMPLATE_IDS.addFavourite) {
    return (user?.lists.favouritesList?.length ?? 0) > 0;
  }

  if (templateRef === STARTER_TEMPLATE_IDS.setDisplayName) {
    const displayName = user?.system.displayName?.trim() ?? '';
    return Boolean(user?.system.wrappedAnchor) || (displayName !== '' && displayName !== 'Adventurer');
  }

  return false;
}

export function syncOnboardingBackfill(): void {
  const current = getCurrentOnboardingQuest();
  if (!current?.quest) return;

  for (const templateRef of current.quest.measurable.taskTemplateRefs ?? []) {
    if (!shouldBackfillOnboardingTemplate(templateRef)) continue;
    autoCompleteSystemTaskInternal(templateRef, true);
  }
}

/**
 * Days until an upcoming date (same year or next year for annual events).
 * Returns null if date is not parseable.
 */
function resolveAnnualOccurrence(isoDate: string, referenceDate: string): { date: string; days: number } | null {
  const today = parseISODate(referenceDate);
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length < 3) return null;
  const thisYear = today.getFullYear();
  const candidate = parseISODate(`${thisYear}-${parts[1]}-${parts[2]}`);
  if (isNaN(candidate.getTime())) return null;
  if (candidate < today) {
    candidate.setFullYear(thisYear + 1);
  }
  return {
    date: localISODate(candidate),
    days: Math.round((candidate.getTime() - today.getTime()) / 86_400_000),
  };
}

/**
 * Days until an absolute future date (not annualised).
 * Returns null if date is not parseable. Negative = in the past.
 */
function daysUntilDate(isoDate: string, referenceDate: string): number | null {
  const today = parseISODate(referenceDate);
  const target = parseISODate(isoDate.slice(0, 10));
  if (isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function isRecurrenceOnDate(rule: ResourceRecurrenceRule, dateISO: string): boolean {
  if (!rule.seedDate) return false;
  if (rule.seedDate > dateISO) return false;
  if (rule.endsOn && rule.endsOn < dateISO) return false;

  const target = parseISODate(dateISO);
  const seed = parseISODate(rule.seedDate);
  const interval = Math.max(1, rule.interval || 1);
  const diffDays = Math.round((target.getTime() - seed.getTime()) / 86_400_000);

  switch (rule.frequency) {
    case 'daily':
      return diffDays >= 0 && diffDays % interval === 0;
    case 'weekly': {
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks < 0 || diffWeeks % interval !== 0) return false;
      const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      const weekdayKey = weekdayKeys[target.getDay()];
      return rule.days.length === 0 ? target.getDay() === seed.getDay() : rule.days.includes(weekdayKey);
    }
    case 'monthly': {
      const monthDiff =
        (target.getFullYear() - seed.getFullYear()) * 12 +
        (target.getMonth() - seed.getMonth());
      if (monthDiff < 0 || monthDiff % interval !== 0) return false;
      const requestedDay = rule.monthlyDay ?? seed.getDate();
      const resolvedDay = Math.min(requestedDay, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate());
      return target.getDate() === resolvedDay;
    }
    case 'yearly': {
      const yearDiff = target.getFullYear() - seed.getFullYear();
      return (
        yearDiff >= 0 &&
        yearDiff % interval === 0 &&
        target.getMonth() === seed.getMonth() &&
        target.getDate() === seed.getDate()
      );
    }
    default:
      return false;
  }
}

function computeNextOccurrence(rule: ResourceRecurrenceRule, referenceDate: string): { date: string; days: number } {
  const start = parseISODate(referenceDate);
  for (let offset = 0; offset <= 366 * 5; offset++) {
    const candidate = new Date(start);
    candidate.setDate(candidate.getDate() + offset);
    const candidateISO = localISODate(candidate);
    if (isRecurrenceOnDate(rule, candidateISO)) {
      return { date: candidateISO, days: offset };
    }
  }

  return { date: referenceDate, days: 0 };
}

function buildResourceTaskFields(
  resourceTaskId: string,
  dueDate: string,
  fields: Task['resultFields'] = {},
): Task['resultFields'] {
  return ({
    ...fields,
    resourceTaskId,
    dueDate,
  } as unknown) as Task['resultFields'];
}

function buildResourceTaskDedupKey(resourceTaskId: string, dueDate: string): string {
  return `${resourceTaskId}::${dueDate}`;
}

function readResourceTaskIdentity(task: Task): { resourceTaskId: string; dueDate: string } | null {
  const fields = task.resultFields as Record<string, unknown>;
  const resourceTaskId = typeof fields.resourceTaskId === 'string' ? fields.resourceTaskId : null;
  const dueDate = typeof fields.dueDate === 'string' ? fields.dueDate : null;
  if (!resourceTaskId || !dueDate) return null;
  return { resourceTaskId, dueDate };
}

function getExistingPendingResourceTaskKeys(user: User | null | undefined): Set<string> {
  if (!user) return new Set<string>();

  const scheduleStore = useScheduleStore.getState();
  const keys = new Set<string>();
  for (const taskId of user.lists.gtdList) {
    const task = scheduleStore.tasks[taskId];
    if (!task || task.completionState !== 'pending') continue;
    const identity = readResourceTaskIdentity(task);
    if (!identity) continue;
    keys.add(buildResourceTaskDedupKey(identity.resourceTaskId, identity.dueDate));
  }
  return keys;
}

function buildResourceReminderTask(
  resourceId: string,
  templateKey: string,
  resourceTaskId: string,
  dueDate: string,
  title?: string,
  resultFields: Task['resultFields'] = {},
): Task {
  return {
    id: uuidv4(),
    templateRef: templateKey,
    title: title ?? null,
    completionState: 'pending',
    completedAt: null,
    resultFields: buildResourceTaskFields(resourceTaskId, dueDate, resultFields),
    attachmentRef: null,
    resourceRef: resourceId,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };
}

function clearPendingResourceTasks(templateRef: string, resourceRef: string): void {
  const scheduleStore = useScheduleStore.getState();
  const userStore = useUserStore.getState();
  const latestUser = userStore.user;
  const taskIdsToRemove = Object.values(scheduleStore.tasks)
    .filter(
      (task) =>
        task.templateRef === templateRef &&
        task.resourceRef === resourceRef &&
        task.completionState === 'pending',
    )
    .map((task) => task.id);

  if (taskIdsToRemove.length === 0) return;

  for (const taskId of taskIdsToRemove) {
    scheduleStore.removeTask(taskId);
  }

  if (!latestUser) return;

  userStore.setUser({
    ...latestUser,
    lists: {
      ...latestUser.lists,
      gtdList: latestUser.lists.gtdList.filter((id) => !taskIdsToRemove.includes(id)),
    },
  });
}

// ── GENERATE SCHEDULED TASKS ──────────────────────────────────────────────────

/**
 * No-op stub — PlannedEvents are NOT created from Resource data (D97: resource
 * events are virtual).  GTD push is handled exclusively by generateGTDItems().
 * Call sites are preserved so callers need not change.
 *
 * @returns Empty array — no PlannedEvents created.
 */
// (commented out) eslint-disable-next-line @typescript-eslint/no-unused-vars
export function generateScheduledTasks(_resource: Resource): PlannedEvent[] {
  if (_resource.type === 'contact') {
    return _genContactSchedule(_resource);
  }
  if (_resource.type === 'home') {
    return _genHomeSchedule(_resource);
  }
  if (_resource.type === 'inventory') {
    return _genInventorySchedule(_resource);
  }
  return [];
}




// ── GENERATE GTD ITEMS ────────────────────────────────────────────────────────

/**
 * Compute immediate-action GTD Tasks from a Resource's current state.
 * Writes Tasks to scheduleStore + storage and appends task IDs to User.lists.gtdList.
 *
 * Contact  → CHECK task if birthday within 30 days
 * Account  → LOG task for each pending transaction in 'pending' status
 * Inventory → COUNTER task for low-stock items (quantity ≤ 0)
 * Home / Vehicle / Doc → [] (no immediate GTD items from current meta)
 *
 * @returns Array of Task objects created
 */
interface GenerateGTDOptions {
  referenceDate?: string;
  persist?: boolean;
}

export function generateGTDItems(resource: Resource, options: GenerateGTDOptions = {}): Task[] {
  const referenceDate = options.referenceDate ?? todayISO();
  const created: Task[] = [];

  switch (resource.type) {
    case 'contact':
      created.push(..._genContactGTD(resource, referenceDate));
      break;
    case 'account':
      created.push(..._genAccountGTD(resource, referenceDate));
      break;
    case 'inventory':
      created.push(..._genInventoryGTD(resource, referenceDate));
      break;
    case 'home':
      created.push(..._genHomeGTD(resource, referenceDate));
      break;
    case 'vehicle':
      created.push(..._genVehicleGTD(resource, referenceDate));
      break;
    case 'doc':
      created.push(..._genDocGTD(resource, referenceDate));
      break;
  }

  const latestUser = useUserStore.getState().user;
  const existingKeys = getExistingPendingResourceTaskKeys(latestUser);
  const createdKeys = new Set<string>();
  const deduped = created.filter((task) => {
    const identity = readResourceTaskIdentity(task);
    if (!identity) return true;
    const dedupKey = buildResourceTaskDedupKey(identity.resourceTaskId, identity.dueDate);
    if (existingKeys.has(dedupKey) || createdKeys.has(dedupKey)) {
      return false;
    }
    createdKeys.add(dedupKey);
    return true;
  });

  if (options.persist !== false && deduped.length > 0) {
    const scheduleStore = useScheduleStore.getState();
    if (latestUser) {
      for (const task of deduped) {
        scheduleStore.setTask(task);
      }
      const updatedUser: User = {
        ...latestUser,
        lists: {
          ...latestUser.lists,
          gtdList: [...new Set([...latestUser.lists.gtdList, ...deduped.map((t) => t.id)])],
        },
      };
      useUserStore.getState().setUser(updatedUser);
    }
  }

  return deduped;
}

function _genContactSchedule(_resource: ContactResource): PlannedEvent[] {
  return [];
}

function _genContactGTD(resource: ContactResource, referenceDate: string): Task[] {
  if (!resource.birthday || resource.birthdayLeadDays == null) return [];

  const lead = resource.birthdayLeadDays;
  if (lead === -1) return [];

  const nextBirthday = resolveAnnualOccurrence(resource.birthday, referenceDate);
  if (!nextBirthday || nextBirthday.days > lead) return [];

  const title = `Birthday — ${resource.displayName}`;
  const resourceTaskId = `resource-task:${resource.id}:birthday`;
  return [
    buildResourceReminderTask(
      resource.id,
      resourceTaskId,
      resourceTaskId,
      nextBirthday.date,
      title,
      { label: title } as Task['resultFields'],
    ),
  ];
}

function _genAccountGTD(resource: AccountResource, referenceDate: string): Task[] {
  const tasks: Task[] = [];

  for (const task of resource.accountTasks ?? []) {
    if (task.kind === 'transaction-log') {
      const templateKey = `resource-task:${resource.id}:account-task:${task.id}:transaction-log`;
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }

    const templateKey = `resource-task:${resource.id}:account-task:${task.id}`;

    if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') {
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }
    if (task.reminderLeadDays === -1) {
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }
    const next = computeNextOccurrence(task.recurrence, referenceDate);
    if (next.days < 0 || next.days > task.reminderLeadDays) {
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }

    tasks.push(
      buildResourceReminderTask(
        resource.id,
        templateKey,
        templateKey,
        next.date,
        task.name,
        { label: task.name } as Task['resultFields'],
      ),
    );
  }

  // Pending transactions
  const pendingOnes = (resource.pendingTransactions ?? []).filter((t) => t.status === 'pending');
  if (pendingOnes.length > 0) {
    const templateKey = 'task-res-accounts-transaction';
    for (const pendingTransaction of pendingOnes) {
      const title = pendingTransaction.description || `Pending transaction for ${resource.name}`;
      const resourceTaskId = `resource-task:${resource.id}:pending-transaction:${pendingTransaction.id}`;
      tasks.push(
        buildResourceReminderTask(
          resource.id,
          templateKey,
          resourceTaskId,
          pendingTransaction.date || referenceDate,
          title,
          { label: title } as Task['resultFields'],
        ),
      );
    }
  }

  // W25: Payment due
  if (resource.dueDate) {
    const dueLead = resource.dueDateLeadDays ?? 7;
    const d = daysUntilDate(resource.dueDate, referenceDate);
    if (dueLead !== -1 && d !== null && d >= 0 && d <= dueLead) {
      const label = resource.institution
        ? `Payment due: ${resource.institution}`
        : `Payment due: ${resource.name}`;
      const templateKey = `resource-task:${resource.id}:payment-due`;
      tasks.push(
        buildPendingTask(
          templateKey,
          resource.id,
          buildResourceTaskFields(templateKey, resource.dueDate, { label } as Task['resultFields']),
          label,
        ),
      );
    }
  }

  return tasks;
}

function _genInventoryGTD(resource: InventoryResource, referenceDate: string): Task[] {
  const inventoryItems = (resource.containers ?? []).flatMap((container) => container.items);
  const lowStock = (inventoryItems.length > 0 ? inventoryItems : resource.items).filter(
    (item) =>
      item.threshold != null &&
      item.quantity != null &&
      item.quantity <= item.threshold,
  );
  const templateKey = 'task-res-inventory-replenish';
  const tasks: Task[] = lowStock.map((item) => ({
    ...buildPendingTask(
      templateKey,
      resource.id,
      buildResourceTaskFields(
        `resource-task:${resource.id}:inventory-low-stock:${item.id}`,
        referenceDate,
        {
          itemName: findItemTemplate(item.itemTemplateRef)?.name ?? item.itemTemplateRef,
          label: `Restock ${findItemTemplate(item.itemTemplateRef)?.name ?? item.itemTemplateRef} in ${resource.name}`,
        } as Task['resultFields'],
      ),
      `Restock ${findItemTemplate(item.itemTemplateRef)?.name ?? item.itemTemplateRef} in ${resource.name}`,
    ),
  }));

  const itemSource = inventoryItems.length > 0 ? inventoryItems : resource.items;
  for (const item of itemSource) {
    const itemTemplate = findItemTemplate(item.itemTemplateRef);
    if (!itemTemplate || itemTemplate.kind !== 'facility') continue;

    for (const recurringTask of item.recurringTasks ?? []) {
      if (!isRecurringInventoryTask(recurringTask)) continue;
      const reminderLeadDays = recurringTask.reminderLeadDays ?? 7;
      if (reminderLeadDays === -1) continue;

      const next = computeNextOccurrence(recurringTask.recurrence, referenceDate);
      if (next.days < 0 || next.days > reminderLeadDays) continue;

      const reminderTemplateKey = `resource-task:${resource.id}:inventory:${item.id}:${recurringTask.id}`;
      tasks.push(
        buildResourceReminderTask(
          resource.id,
          reminderTemplateKey,
          reminderTemplateKey,
          next.date,
          resolveTaskTemplateName(recurringTask.taskTemplateRef),
          { label: resolveTaskTemplateName(recurringTask.taskTemplateRef) } as Task['resultFields'],
        ),
      );
    }
  }

  for (const container of resource.containers ?? []) {
    const carryTask = container.carryTask;
    if (!carryTask) continue;
    if (normalizeRecurrenceMode(carryTask.recurrenceMode) === 'never') continue;

    const reminderLeadDays = carryTask.reminderLeadDays ?? 7;
    if (reminderLeadDays === -1) continue;

    const next = computeNextOccurrence(carryTask.recurrence, referenceDate);
    if (next.days < 0 || next.days > reminderLeadDays) continue;

    const reminderTemplateKey = `resource-task:${resource.id}:inventory-container:${container.id}:carry-task:${carryTask.id}`;
    const label = carryTask.name || `Carry ${container.name}`;
    tasks.push(
      buildResourceReminderTask(
        resource.id,
        reminderTemplateKey,
        reminderTemplateKey,
        next.date,
        label,
        { label } as Task['resultFields'],
      ),
    );
  }

  return tasks;
}

/**
 * Doc generates tasks via course progression.
 * STUB — deferred until Course Doc progression shape is decided (BUILD-time task).
 */
export function generateDocTasks_stub(): void {
  // Deferred: Course Doc progression shape not yet decided.
  // Implementation pending BUILD-time task.
}

// ── HOME / VEHICLE / DOC GTD + SCHEDULE HANDLERS — W23–W27 ——————————————

/** W23: Monthly home maintenance check PlannedEvent. */
function _genHomeSchedule(_resource: HomeResource): PlannedEvent[] {
  return [];
}

function _genInventorySchedule(resource: InventoryResource): PlannedEvent[] {
  const inventoryItems = (resource.containers ?? []).flatMap((container) => container.items);
  return _collectFacilityRecurringPlannedEvents(inventoryItems.length > 0 ? inventoryItems : resource.items, resource.id);
}

function _collectFacilityRecurringPlannedEvents(
  source: ItemInstance[],
  resourceId: string,
): PlannedEvent[] {
  const scheduleStore = useScheduleStore.getState();
  const items = source;
  const created: PlannedEvent[] = [];

  for (const item of items) {
    const itemTemplate = findItemTemplate(item.itemTemplateRef);
    if (!itemTemplate || itemTemplate.kind !== 'facility') continue;

    for (const recurringTask of item.recurringTasks ?? []) {
      if (!isRecurringInventoryTask(recurringTask)) continue;
      if (scheduleStore.plannedEvents[recurringTask.id]) continue;

      const taskTemplateRef = recurringTask.taskTemplateRef;
        const plannedEvent: PlannedEvent = {
          id: recurringTask.id,
          name: resolveTaskTemplateName(taskTemplateRef),
          description: `Recurring task for ${itemTemplate.name}`,
          icon: itemTemplate.icon,
          color: '#10b981',
          seedDate: recurringTask.recurrence.seedDate,
          dieDate: null,
          recurrenceInterval: toPlannedEventRecurrence(recurringTask.recurrence),
          activeState: 'active',
        taskPool: [taskTemplateRef],
        taskPoolCursor: 0,
        taskList: [taskTemplateRef],
        conflictMode: 'concurrent',
        startTime: '09:00',
        endTime: '09:30',
        location: null,
        sharedWith: null,
          pushReminder: null,
        };
      scheduleStore.setPlannedEvent(plannedEvent);
      created.push(plannedEvent);
    }
  }

  if (created.length > 0) {
    void resourceId;
  }

  return created;
}

function _genHomeContainerGTD(resource: HomeResource, referenceDate: string): Task[] {
  void resource;
  void referenceDate;
  return [];
}

function _genHomeGTD(resource: HomeResource, referenceDate: string): Task[] {
  const tasks = _genHomeContainerGTD(resource, referenceDate);

  for (const chore of resource.chores ?? []) {
    if (normalizeRecurrenceMode(chore.recurrenceMode) === 'never') continue;
    const reminderLeadDays = chore.reminderLeadDays ?? 0;
    if (reminderLeadDays === -1) continue;
    const next = computeNextOccurrence(chore.recurrence, referenceDate);
    if (next.days < 0 || next.days > reminderLeadDays) continue;

    const templateKey = `resource-task:${resource.id}:chore:${chore.id}`;
    tasks.push(
      buildResourceReminderTask(
        resource.id,
        templateKey,
        templateKey,
        next.date,
        chore.name,
        { label: chore.name } as Task['resultFields'],
      ),
    );
  }

  return tasks;
}

/** W24: GTD items for vehicle — insurance expiry (≤30d) + service date (≤14d). */
function _genVehicleGTD(resource: VehicleResource, referenceDate: string): Task[] {
  const tasks: Task[] = [];

  if (resource.insuranceExpiry) {
    const insuranceLead = resource.insuranceLeadDays ?? 30;
    const d = daysUntilDate(resource.insuranceExpiry, referenceDate);
    if (insuranceLead !== -1 && d !== null && d >= 0 && d <= insuranceLead) {
      const templateKey = `resource-task:${resource.id}:insurance`;
      tasks.push(
        buildPendingTask(
          templateKey,
          resource.id,
          buildResourceTaskFields(templateKey, resource.insuranceExpiry, { label: 'Insurance expiry' } as Task['resultFields']),
          `Insurance expiry — ${resource.name}`,
        ),
      );
    }
  }

  if (resource.serviceNextDate) {
    const serviceLead = resource.serviceLeadDays ?? 14;
    const d = daysUntilDate(resource.serviceNextDate, referenceDate);
    if (serviceLead !== -1 && d !== null && d >= 0 && d <= serviceLead) {
      const templateKey = `resource-task:${resource.id}:service`;
      tasks.push(
        buildResourceReminderTask(
          resource.id,
          templateKey,
          templateKey,
          resource.serviceNextDate,
          `Service — ${resource.name}`,
          { label: 'Service due' } as Task['resultFields'],
        ),
      );
    }
  }

  for (const task of resource.maintenanceTasks ?? []) {
    if (task.kind === 'mileage-log') {
      const templateKey = `resource-task:${resource.id}:maintenance:${task.id}:mileage-log`;
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }

    const templateKey = `resource-task:${resource.id}:maintenance:${task.id}`;

    if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') {
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }
    if (task.reminderLeadDays === -1) {
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }
    const next = computeNextOccurrence(task.recurrence, referenceDate);
    if (next.days < 0 || next.days > task.reminderLeadDays) {
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }

    tasks.push(
      buildResourceReminderTask(
        resource.id,
        templateKey,
        templateKey,
        next.date,
        task.name,
        { label: task.name } as Task['resultFields'],
      ),
    );
  }

  return tasks;
}

/** W27: GTD item for doc expiry within configurable lead days (default 30). */
function _genDocGTD(resource: DocResource, referenceDate: string): Task[] {
  if (resource.docType === 'layout') return [];
  if (!resource.expiryDate) return [];

  const lead = resource.expiryLeadDays ?? 30;
  if (lead === -1) return [];

  const d = daysUntilDate(resource.expiryDate, referenceDate);
  if (d === null || d < 0 || d > lead) return [];

  const templateKey = `resource-task:${resource.id}:expiry`;

  return [
    buildPendingTask(
      templateKey,
      resource.id,
      buildResourceTaskFields(templateKey, resource.expiryDate, { label: 'Expiry date' } as Task['resultFields']),
      `Expiry — ${resource.name}`,
    ),
  ];
}

// ── COMPUTE GTD LIST ──────────────────────────────────────────────────────────

/**
 * Scan all active Resources for a User, generate GTD items per resource, and
 * return the merged pending GTD Task list after scanning every resource.
 *
 * This is the primary resource GTD scan entry point used by rollover. It will
 * generate and persist any newly due resource GTD items before returning the
 * combined pending list.
 */
export function computeGTDList(user: User, referenceDate: string = todayISO()): Task[] {
  const scheduleStore = useScheduleStore.getState();
  const resourceStore = useResourceStore.getState();

  // Resolve existing gtdList Task refs → Tasks
  const existing = new Map<string, Task>();
  for (const taskId of user.lists.gtdList) {
    const task = scheduleStore.tasks[taskId];
    if (task && task.completionState === 'pending') {
      existing.set(taskId, task);
    }
  }

  // Scan all resource refs and generate fresh items for any resource not covered.
  const allResourceIds = [
    ...user.resources.contacts,
    ...user.resources.homes,
    ...user.resources.vehicles,
    ...user.resources.accounts,
    ...user.resources.inventory,
    ...user.resources.docs,
  ];

  const generatedIds = new Set<string>(existing.keys());
  const fresh: Task[] = [];

  for (const resourceId of allResourceIds) {
    const resource = resourceStore.resources[resourceId];
    if (!resource) continue;
    const generated = generateGTDItems(resource, { referenceDate });
    for (const task of generated) {
      if (!generatedIds.has(task.id)) {
        generatedIds.add(task.id);
        fresh.push(task);
      }
    }
  }

  // Merge: existing pending tasks + freshly generated, ordered by creation (fresh last)
  return [...Array.from(existing.values()), ...fresh];
}

// ── COMPLETE GTD ITEM ─────────────────────────────────────────────────────────

/**
 * Mark a GTD Task complete, write the completion to today's QuickActionsEvent,
 * award XP, call checkAchievements(), and fire a ribbet.
 *
 * Reads  — useScheduleStore.tasks, useScheduleStore.activeEvents
 * Writes — useScheduleStore.tasks, useUserStore (XP + stats + feed), storageLayer
 *
 * @param itemId  Task id to complete
 * @param user    Current User — for QuickActionsEvent routing
 */
export function dismissGTDItem(itemId: string, user: User): void {
  const latestUser = useUserStore.getState().user ?? user;
  useUserStore.getState().setUser({
    ...latestUser,
    lists: {
      ...latestUser.lists,
      gtdList: latestUser.lists.gtdList.filter((id) => id !== itemId),
    },
  });
}

export function completeGTDItem(
  itemId: string,
  user: User,
  resultFields: Task['resultFields'] = {},
): void {
  const scheduleStore = useScheduleStore.getState();
  const userStore = useUserStore.getState();

  const task = scheduleStore.tasks[itemId];
  if (!task) {
    console.warn(`[resourceEngine] completeGTDItem: Task "${itemId}" not found`);
    return;
  }
  if (task.completionState !== 'pending') return;

  const now = getAppNowISO();
  const updatedTask: Task = {
    ...task,
    completionState: 'complete',
    completedAt: now,
    resultFields,
  };

  scheduleStore.setTask(updatedTask);

  if (task.resourceRef && 'logKind' in resultFields && resultFields.logKind === 'vehicle-mileage') {
    const resourceStore = useResourceStore.getState();
    const resource = resourceStore.resources[task.resourceRef];
    const nextMileage =
      'newValue' in resultFields && typeof resultFields.newValue === 'number'
        ? resultFields.newValue
        : null;

    if (resource?.type === 'vehicle' && nextMileage != null && Number.isFinite(nextMileage)) {
      const updatedVehicle: VehicleResource = {
        ...resource,
        mileage: nextMileage,
        updatedAt: now,
      };
      resourceStore.setResource(updatedVehicle);
      generateGTDItems(updatedVehicle);
    }
  }

  // Route quest milestone through the quest engine (was bypassed before — FIX)
  if (updatedTask.questRef) {
    completeMilestone(updatedTask);
  }

  // Write to today's QuickActionsEvent (date-keyed singleton per D12)
  const today = todayISO();
  const qaId = `qa-${today}`;
  const qa = scheduleStore.activeEvents[qaId] as QuickActionsEvent | undefined;
  if (qa) {
    const updatedQa: QuickActionsEvent = {
      ...qa,
      completions: [...qa.completions, { taskRef: itemId, completedAt: now }],
    };
    scheduleStore.setActiveEvent(updatedQa);
  }

  // Remove from gtdList now that it's complete
  const freshUser = useUserStore.getState().user ?? user;
  const withoutItem: User = {
    ...freshUser,
    lists: {
      ...freshUser.lists,
      gtdList: freshUser.lists.gtdList.filter((id) => id !== itemId),
    },
  };
  userStore.setUser(withoutItem);

  // XP award — +2 agility (QuickActions context) + +2 defense (resource context)
  const userId = withoutItem.system.id;
  const template = task.templateRef
    ? scheduleStore.taskTemplates[task.templateRef] ??
      starterTaskTemplates.find((t) => t.id === task.templateRef) ??
      null
    : null;
  if (template) {
    const baseXP = Object.values(template.xpAward).reduce((s, v) => s + v, 0) + (template.xpBonus ?? 0);
    const onboardingQuestTask = task.templateRef ? isOnboardingQuestTemplate(task.templateRef) : false;
    awardXP(userId, onboardingQuestTask ? baseXP : baseXP + 2, {
      isWisdomTask: isWisdomTemplate(template),
      statGroup: getPrimaryStatGroup(template.xpAward),
      secondaryTag: template.secondaryTag,
      source: `gtd.complete:${task.templateRef}`,
    });
    if (!onboardingQuestTask) {
      awardXP(userId, 2, {
        statGroup: 'agility',
        source: `gtd.complete.quickActions:${task.templateRef}`,
      });
      awardStat(userId, 'agility', 2, `gtd.complete.quickActions:${task.templateRef}`);
      awardStat(userId, 'defense', 2, `gtd.complete.resource:${task.templateRef}`);
    }
  } else {
    awardXP(userId, 7, {
      isWisdomTask: true,
      statGroup: 'wisdom',
      source: `gtd.complete.fallback:${task.templateRef}`,
    });
    awardXP(userId, 2, {
      statGroup: 'agility',
      source: `gtd.complete.quickActions:${task.templateRef}`,
    });
    awardStat(userId, 'agility', 2, `gtd.complete.quickActions:${task.templateRef}`);
    awardStat(userId, 'wisdom', 25, `gtd.complete.fallback:${task.templateRef}`);
  }

  if (task.templateRef === STARTER_TEMPLATE_IDS.completeOnboardingAdventure) {
    console.info('[act-complete.claim]', {
      templateRef: task.templateRef,
      rewardRef: null,
      userId: useUserStore.getState().user?.system.id ?? null,
    });
  }

  // Achievement check + badge awards
  const latestUser = useUserStore.getState().user;
  if (latestUser) {
    const newAchs = checkAchievements(latestUser);
    let currentUser = latestUser;
    for (const ach of newAchs) {
      currentUser = awardBadge(ach, currentUser);
    }
  }

  pushRibbet('gtd.completed');
}

// ── AUTO-CHECK QUEST CHECKLIST ITEM (D88-auto) ───────────────────────────────

/**
 * Auto-check a single CHECKLIST item on a pending quest task in the GTD list.
 * Called when the user performs the corresponding system action (nav, routine add, etc.).
 * When all checklist items are checked, the task is routed through the normal
 * GTD completion pipeline (XP, milestone, quest progress).
 *
 * Idempotent — calling with an already-checked key is a no-op.
 *
 * @param templateRef  TaskTemplate ID — identifies which quest task to update
 * @param itemKey      Checklist item key to mark as checked
 */
export function autoCheckQuestItem(templateRef: string, itemKey: string): void {
  const scheduleStore = useScheduleStore.getState();
  const user = useUserStore.getState().user;
  if (!user) return;
  const acts = useProgressionStore.getState().acts;

  let activeQuestRef: string | null = null;
  outer:
  for (const act of Object.values(acts)) {
    for (let chainIndex = 0; chainIndex < act.chains.length; chainIndex++) {
      const chain = act.chains[chainIndex];
      for (let questIndex = 0; questIndex < chain.quests.length; questIndex++) {
        const quest = chain.quests[questIndex];
        if (quest.completionState !== 'active') continue;
        const hasMatchingMarker = quest.timely.markers.some(
          (marker) => marker.activeState && marker.taskTemplateRef === templateRef,
        );
        if (!hasMatchingMarker) continue;
        activeQuestRef = `${act.id}|${chainIndex}|${questIndex}`;
        break outer;
      }
    }
  }

  if (!activeQuestRef) return;

  const taskId =
    user.lists.gtdList.find((id) => {
      const t = scheduleStore.tasks[id];
      return (
        t?.completionState === 'pending' &&
        t.templateRef === templateRef &&
        t.questRef === activeQuestRef
      );
    }) ??
    Object.values(scheduleStore.tasks).find(
      (t) =>
        t.completionState === 'pending' &&
        t.templateRef === templateRef &&
        t.questRef === activeQuestRef,
    )?.id;

  if (!taskId) return;

  const task = scheduleStore.tasks[taskId];
  if (!task) return;

  // Resolve current items from resultFields or initialise from template shape
  const template =
    scheduleStore.taskTemplates[templateRef] ??
    starterTaskTemplates.find((t) => t.id === templateRef) ??
    null;
  const templateItems =
    (template?.inputFields as { items?: Array<{ key: string; label: string }> } | undefined)?.items ?? [];
  const rawItems = (task.resultFields as Record<string, unknown>).items;
  const rawCheckedByKey = new Map<string, boolean>(
    Array.isArray(rawItems)
      ? (rawItems as Array<{ key: string; checked?: boolean }>).map((item) => [
          item.key,
          item.checked === true,
        ])
      : [],
  );
  if (
    templateRef === STARTER_TEMPLATE_IDS.learnGrounds &&
    hasCompletedQuickActionTask(STARTER_TEMPLATE_IDS.roll)
  ) {
    rawCheckedByKey.set('complete_roll', true);
  }
  const existingItems: Array<{ key: string; label: string; checked: boolean }> = templateItems.map((item) => ({
    ...item,
    checked: rawCheckedByKey.get(item.key) === true,
  }));

  if (existingItems.length === 0) return;
  if (!existingItems.some((item) => item.key === itemKey)) return;

  // Idempotent — already checked
  if (existingItems.find((i) => i.key === itemKey)?.checked === true) return;

  const updatedItems = existingItems.map((item) =>
    item.key === itemKey ? { ...item, checked: true } : item,
  );

  // Persist partial progress — task stays 'pending' until all items are done
  scheduleStore.setTask({ ...task, resultFields: { ...task.resultFields, items: updatedItems } });

  const allDone = updatedItems.every((i) => i.checked);

  // Write incremental progressPercent so the UI reflects each step before the task completes
  if (!allDone && task.questRef) {
    const parsed = decodeQuestRef(task.questRef);
    if (parsed) {
      const { actId, chainIndex, questIndex } = parsed;
      const progressionStore = useProgressionStore.getState();
      const act = progressionStore.acts[actId];
      if (act) {
        const quest = act.chains[chainIndex]?.quests[questIndex];
        if (quest && quest.specific.targetValue > 0) {
          const checkedCount = updatedItems.filter((i) => i.checked).length;
          const progressPercent = Math.min(
            99, // cap at 99 — 100 is reserved for official completion via completeMilestone
            Math.round((checkedCount / quest.specific.targetValue) * 100),
          );
          const updatedAct = {
            ...act,
            chains: act.chains.map((c, ci: number) =>
              ci !== chainIndex
                ? c
                : {
                    ...c,
                    quests: c.quests.map((q, qi: number) =>
                      qi !== questIndex ? q : { ...q, progressPercent },
                    ),
                  },
            ),
          };
          progressionStore.setAct(updatedAct);
        }
      }
    }
  }

  // All items checked → route through normal GTD completion (XP, quest, gtdList cleanup)
  if (allDone) {
    completeGTDItem(taskId, user);
  }
}
