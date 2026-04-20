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
  HomeResource,
  ItemInstance,
  InventoryResource,
  Resource,
  ResourceRecurrenceRule,
  VehicleResource,
} from '../types/resource';
import { normalizeRecurrenceMode } from '../types/resource';
import type { PlannedEvent } from '../types/plannedEvent';
import type { Task } from '../types/task';
import type { TaskTemplate } from '../types/taskTemplate';
import type { InputFields, XpAward } from '../types/taskTemplate';
import type { StatGroupKey, User } from '../types/user';
import { getAppDate, getAppNowISO } from '../utils/dateUtils';
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
import { getItemTemplateByRef } from '../coach/ItemLibrary';
import { isWisdomTemplate } from './xpBoosts';
import { evaluateQuestSpecific, updateQuestProgress } from './questEngine';
import { getUserInventoryItemTemplates, resolveInventoryItemTemplate } from '../utils/inventoryItems';

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
  return (
    scheduleStore.taskTemplates[taskTemplateRef]?.name ??
    starterTaskTemplates.find((template) => template.id === taskTemplateRef)?.name ??
    taskTemplateRef
  );
}

function buildPendingTask(
  templateRef: string,
  resourceRef: string,
  resultFields: Task['resultFields'] = {},
): Task {
  return {
    id: uuidv4(),
    templateRef,
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

const RESOURCE_TEMPLATE_LIBRARY: Partial<Record<Resource['type'], TaskTemplate>> = {
  contact: {
    id: 'task-res-contacts-birthday',
    isCustom: false,
    isSystem: true,
    name: 'Wish Happy Birthday',
    description: 'Wish someone a happy birthday.',
    icon: 'check',
    taskType: 'CHECK',
    inputFields: { label: 'Wish happy birthday' },
    xpAward: { health: 0, strength: 0, agility: 0, defense: 0, charisma: 5, wisdom: 0 },
    cooldown: null,
    media: null,
    items: [],
    secondaryTag: 'social',
  },
  home: {
    id: 'task-res-homes-chore',
    isCustom: false,
    isSystem: true,
    name: 'Complete Home Chore',
    description: 'Complete a home chore.',
    icon: 'check',
    taskType: 'CHECK',
    inputFields: { label: 'Complete home chore' },
    xpAward: { health: 0, strength: 0, agility: 5, defense: 0, charisma: 0, wisdom: 0 },
    cooldown: null,
    media: null,
    items: [],
    secondaryTag: 'home',
  },
  vehicle: {
    id: 'task-res-vehicles-maintenance',
    isCustom: false,
    isSystem: true,
    name: 'Vehicle Maintenance',
    description: 'Inspect, service, and log vehicle maintenance.',
    icon: 'checklist',
    taskType: 'CHECKLIST',
    inputFields: {
      items: [
        { key: 'check', label: 'Inspect item' },
        { key: 'service', label: 'Complete service' },
        { key: 'log', label: 'Log in vehicle record' },
      ],
    },
    xpAward: { health: 0, strength: 5, agility: 0, defense: 0, charisma: 0, wisdom: 0 },
    cooldown: null,
    media: null,
    items: [],
    secondaryTag: 'home',
  },
  account: {
    id: 'task-res-accounts-transaction',
    isCustom: false,
    isSystem: true,
    name: 'Account Transaction',
    description: 'Log an account transaction.',
    icon: 'log',
    taskType: 'LOG',
    inputFields: { prompt: 'Transaction details — amount, category, notes' },
    xpAward: { health: 0, strength: 0, agility: 0, defense: 5, charisma: 0, wisdom: 0 },
    cooldown: null,
    media: null,
    items: [],
    secondaryTag: 'finance',
  },
  inventory: {
    id: 'task-res-inventory-replenish',
    isCustom: false,
    isSystem: true,
    name: 'Replenish Item',
    description: 'Replenish an inventory item.',
    icon: 'check',
    taskType: 'CHECK',
    inputFields: { label: 'Replenish item' },
    xpAward: { health: 0, strength: 0, agility: 0, defense: 0, charisma: 0, wisdom: 5 },
    cooldown: null,
    media: null,
    items: [],
    secondaryTag: 'home',
  },
};

function seedResourceTemplateForType(resourceType: Resource['type']): TaskTemplate | null {
  const template = RESOURCE_TEMPLATE_LIBRARY[resourceType] ?? null;
  if (!template?.id) return null;

  const scheduleStore = useScheduleStore.getState();
  const existing = scheduleStore.taskTemplates[template.id];
  if (existing) return existing;

  scheduleStore.setTaskTemplate(template.id, template);
  return template;
}

export function seedResourceTemplateForResource(resource: Resource): void {
  if (resource.type === 'doc') return;
  seedResourceTemplateForType(resource.type);
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
function daysUntilAnnual(isoDate: string): number | null {
  const today = new Date(todayISO() + 'T00:00:00');
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length < 3) return null;
  const thisYear = today.getFullYear();
  const candidate = new Date(`${thisYear}-${parts[1]}-${parts[2]}T00:00:00`);
  if (candidate < today) {
    candidate.setFullYear(thisYear + 1);
  }
  return Math.round((candidate.getTime() - today.getTime()) / 86_400_000);
}

/**
 * Days until an absolute future date (not annualised).
 * Returns null if date is not parseable. Negative = in the past.
 */
function daysUntilDate(isoDate: string): number | null {
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function computeNextOccurrence(rule: ResourceRecurrenceRule): { date: string; days: number } {
  const today = new Date(todayISO() + 'T00:00:00');
  const seed = new Date(rule.seedDate + 'T00:00:00');

  if (seed >= today) {
    const days = Math.round((seed.getTime() - today.getTime()) / 86_400_000);
    return { date: rule.seedDate, days };
  }

  const interval = Math.max(1, rule.interval || 1);

  switch (rule.frequency) {
    case 'daily': {
      const periodMs = interval * 86_400_000;
      const elapsed = Math.floor((today.getTime() - seed.getTime()) / periodMs);
      const next = new Date(seed.getTime() + (elapsed + 1) * periodMs);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    case 'weekly': {
      const diffCandidates = (rule.days.length > 0 ? rule.days : [['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][seed.getDay()]])
        .map((day) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(day))
        .filter((day) => day >= 0)
        .map((day) => (day - today.getDay() + 7) % 7);
      if (diffCandidates.length > 0) {
        const minDiff = Math.min(...diffCandidates);
        const next = new Date(today);
        next.setDate(next.getDate() + minDiff);
        return { date: next.toISOString().slice(0, 10), days: minDiff };
      }
      break;
    }
    case 'monthly': {
      const requestedDay = rule.monthlyDay ?? seed.getDate();
      const next = new Date(today);
      const resolveDay = (date: Date) => Math.min(requestedDay, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate());
      next.setDate(resolveDay(next));
      if (next < today) next.setMonth(next.getMonth() + interval);
      next.setDate(resolveDay(next));
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    case 'yearly': {
      const next = new Date(seed);
      while (next < today) next.setFullYear(next.getFullYear() + interval);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
  }

  return { date: today.toISOString().slice(0, 10), days: 0 };
}

function buildResourceReminderTask(resourceId: string, templateKey: string): Task {
  return {
    id: uuidv4(),
    templateRef: templateKey,
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
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

/**
 * Build a minimal inline TaskTemplate for resource-generated tasks.
 * Stored under a deterministic key in useScheduleStore.taskTemplates.
 */
function ensureTemplate(
  key: string,
  name: string,
  taskType: TaskTemplate['taskType'],
  xpAward: Partial<TaskTemplate['xpAward']>,
  inputFields?: InputFields,
): TaskTemplate {
  const scheduleStore = useScheduleStore.getState();
  const existing = scheduleStore.taskTemplates[key];
  if (existing) {
    if (inputFields) {
      const updated = {
        ...existing,
        name,
        taskType,
        inputFields,
        xpAward: {
          ...existing.xpAward,
          defense: xpAward.defense ?? existing.xpAward.defense,
          charisma: xpAward.charisma ?? existing.xpAward.charisma,
          wisdom: xpAward.wisdom ?? existing.xpAward.wisdom,
        },
      };
      scheduleStore.setTaskTemplate(key, updated);
      return updated;
    }
    return existing;
  }

  const template: TaskTemplate = {
    name,
    description: '',
    icon: 'resource-task',
    isSystem: true,   // hide from Stat Tasks tab — resource templates are internal
    taskType,
    inputFields: inputFields ?? (
      taskType === 'CHECK'
        ? { label: name }
        : taskType === 'COUNTER'
          ? { target: 1, unit: 'unit', step: 1 }
          : taskType === 'LOG'
            ? { prompt: name }
            : taskType === 'CHECKLIST'
              ? { items: [] }
              : { label: name }
    ),
    xpAward: {
      health: 0,
      strength: 0,
      agility: 0,
      defense: xpAward.defense ?? 5,
      charisma: xpAward.charisma ?? 0,
      wisdom: xpAward.wisdom ?? 0,
    },
    cooldown: null,
    media: null,
    items: [],
    secondaryTag: null,
  };

  scheduleStore.setTaskTemplate(key, template);
  return template;
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
export function generateGTDItems(resource: Resource): Task[] {
  seedResourceTemplateForResource(resource);
  const created: Task[] = [];

  switch (resource.type) {
    case 'contact':
      created.push(..._genContactGTD(resource));
      break;
    case 'account':
      created.push(..._genAccountGTD(resource));
      break;
    case 'inventory':
      created.push(..._genInventoryGTD(resource));
      break;
    case 'home':
      created.push(..._genHomeGTD(resource));
      break;
    case 'vehicle':
      created.push(..._genVehicleGTD(resource));
      break;
    case 'doc':
      created.push(..._genDocGTD(resource));
      break;
  }

  if (created.length > 0) {
    const scheduleStore = useScheduleStore.getState();
    const userStore = useUserStore.getState();
    const latestUser = userStore.user;
    if (latestUser) {
      for (const task of created) {
        scheduleStore.setTask(task);
      }
      const updatedUser: User = {
        ...latestUser,
        lists: {
          ...latestUser.lists,
          gtdList: [...new Set([...latestUser.lists.gtdList, ...created.map((t) => t.id)])],
        },
      };
      userStore.setUser(updatedUser);
    }
  }

  return created;
}

function _genContactSchedule(_resource: ContactResource): PlannedEvent[] {
  return [];
}

function _genContactGTD(resource: ContactResource): Task[] {
  if (!resource.birthday) return [];

  const lead = resource.birthdayLeadDays ?? 14;
  if (lead === -1) return [];

  const days = daysUntilAnnual(resource.birthday);
  if (days === null || days > lead) return [];

  const templateKey = seedResourceTemplateForType('contact')?.id ?? 'task-res-contacts-birthday';

  const task: Task = {
    id: uuidv4(),
    templateRef: templateKey,
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: resource.id,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };
  return [task];
}

function _genAccountGTD(resource: AccountResource): Task[] {
  const tasks: Task[] = [];

  for (const task of resource.accountTasks ?? []) {
    if (task.kind === 'transaction-log') {
      const templateKey = `resource-task:${resource.id}:account-task:${task.id}:transaction-log`;
      ensureTemplate(
        templateKey,
        `${resource.name} - Transaction Log`,
        'LOG',
        { defense: 5, wisdom: 2 },
        {
          prompt: 'Log the transaction details for this account.',
          resourceRef: resource.id,
          unit: '$',
        },
      );
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
    const next = computeNextOccurrence(task.recurrence);
    if (next.days < 0 || next.days > task.reminderLeadDays) {
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }

    ensureTemplate(templateKey, `${resource.name} - ${task.name}`, 'CHECK', { defense: 5 });
    tasks.push(buildResourceReminderTask(resource.id, templateKey));
  }

  // Pending transactions
  const pendingOnes = (resource.pendingTransactions ?? []).filter((t) => t.status === 'pending');
  if (pendingOnes.length > 0) {
    const templateKey = seedResourceTemplateForType('account')?.id ?? 'task-res-accounts-transaction';
    for (const _ of pendingOnes) {
      void _;
      tasks.push({
        id: uuidv4(),
        templateRef: templateKey,
        completionState: 'pending',
        completedAt: null,
        resultFields: {},
        attachmentRef: null,
        resourceRef: resource.id,
        location: null,
        sharedWith: null,
        questRef: null,
        actRef: null,
        secondaryTag: null,
      });
    }
  }

  // W25: Payment due
  if (resource.dueDate) {
    const dueLead = resource.dueDateLeadDays ?? 7;
    const d = daysUntilDate(resource.dueDate);
    if (dueLead !== -1 && d !== null && d >= 0 && d <= dueLead) {
      const label = resource.institution
        ? `Payment due: ${resource.institution}`
        : `Payment due: ${resource.name}`;
      const templateKey = `resource-task:${resource.id}:payment-due`;
      ensureTemplate(templateKey, label, 'CHECK', { defense: 8 });
      tasks.push(buildPendingTask(templateKey, resource.id));
    }
  }

  return tasks;
}

function _genInventoryGTD(resource: InventoryResource): Task[] {
  const inventoryItems = (resource.containers ?? []).flatMap((container) => container.items);
  const lowStock = (inventoryItems.length > 0 ? inventoryItems : resource.items).filter(
    (item) =>
      item.threshold != null &&
      item.quantity != null &&
      item.quantity <= item.threshold,
  );
  const templateKey = seedResourceTemplateForType('inventory')?.id ?? 'task-res-inventory-replenish';
  const tasks: Task[] = lowStock.map((item) => ({
    ...buildPendingTask(templateKey, resource.id, {
      itemName: findItemTemplate(item.itemTemplateRef)?.name ?? item.itemTemplateRef,
      label: `Restock ${findItemTemplate(item.itemTemplateRef)?.name ?? item.itemTemplateRef} in ${resource.name}`,
    } as Task['resultFields']),
  }));

  const itemSource = inventoryItems.length > 0 ? inventoryItems : resource.items;
  for (const item of itemSource) {
    const itemTemplate = findItemTemplate(item.itemTemplateRef);
    if (!itemTemplate || itemTemplate.kind !== 'facility') continue;

    for (const recurringTask of item.recurringTasks ?? []) {
      if (!isRecurringInventoryTask(recurringTask)) continue;
      const reminderLeadDays = recurringTask.reminderLeadDays ?? 7;
      if (reminderLeadDays === -1) continue;

      const next = computeNextOccurrence(recurringTask.recurrence);
      if (next.days < 0 || next.days > reminderLeadDays) continue;

      const taskTemplateRef = recurringTask.taskTemplateRef;
      const reminderTemplateKey = `resource-task:${resource.id}:inventory:${item.id}:${recurringTask.id}`;
      ensureTemplate(
        reminderTemplateKey,
        `${itemTemplate.name} - ${resolveTaskTemplateName(taskTemplateRef)}`,
        'CHECK',
        { defense: 5, wisdom: 3 },
      );
      tasks.push(buildResourceReminderTask(resource.id, reminderTemplateKey));
    }
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
  const plannedEvents = _collectFacilityRecurringPlannedEvents(_resource, _resource.id);
  return plannedEvents;
}

function _genInventorySchedule(resource: InventoryResource): PlannedEvent[] {
  const inventoryItems = (resource.containers ?? []).flatMap((container) => container.items);
  return _collectFacilityRecurringPlannedEvents(inventoryItems.length > 0 ? inventoryItems : resource.items, resource.id);
}

function _collectFacilityRecurringPlannedEvents(
  source: HomeResource | ItemInstance[],
  resourceId: string,
): PlannedEvent[] {
  const scheduleStore = useScheduleStore.getState();
  const items = Array.isArray(source)
    ? source
    : (source.rooms ?? []).flatMap((room) =>
        room.containers.flatMap((container) => container.items),
      );
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

function _buildLowStockTasks(
  items: ItemInstance[],
  resourceId: string,
  containerName: string,
  roomName?: string,
): Task[] {
  const templateKey = seedResourceTemplateForType('inventory')?.id ?? 'task-res-inventory-replenish';
  return items
    .filter((item) => item.threshold != null && item.quantity != null && item.quantity <= item.threshold)
    .map((item) => {
      const itemName = findItemTemplate(item.itemTemplateRef)?.name ?? item.itemTemplateRef;
      const locationName = roomName ? `${containerName} (${roomName})` : containerName;
      return buildPendingTask(templateKey, resourceId, {
        itemName,
        label: `Restock ${itemName} in ${locationName}`,
      } as Task['resultFields']);
    });
}

function _genHomeContainerGTD(resource: HomeResource): Task[] {
  return (resource.rooms ?? []).flatMap((room) =>
    room.containers.flatMap((container) =>
      _buildLowStockTasks(container.items, resource.id, container.name, room.name),
    ),
  );
}

function _genHomeGTD(resource: HomeResource): Task[] {
  const tasks = _genHomeContainerGTD(resource);

  for (const chore of resource.chores ?? []) {
    if (normalizeRecurrenceMode(chore.recurrenceMode) === 'never') continue;
    const reminderLeadDays = chore.reminderLeadDays ?? 0;
    if (reminderLeadDays === -1) continue;
    const next = computeNextOccurrence(chore.recurrence);
    if (next.days < 0 || next.days > reminderLeadDays) continue;

    const templateKey = `resource-task:${resource.id}:chore:${chore.id}`;
    ensureTemplate(templateKey, `${resource.name} - ${chore.name}`, 'CHECK', { agility: 5 });
    tasks.push(buildResourceReminderTask(resource.id, templateKey));
  }

  return tasks;
}

/** W24: GTD items for vehicle — insurance expiry (≤30d) + service date (≤14d). */
function _genVehicleGTD(resource: VehicleResource): Task[] {
  const tasks: Task[] = [];

  if (resource.insuranceExpiry) {
    const insuranceLead = resource.insuranceLeadDays ?? 30;
    const d = daysUntilDate(resource.insuranceExpiry);
    if (insuranceLead !== -1 && d !== null && d >= 0 && d <= insuranceLead) {
      const templateKey = `resource-task:${resource.id}:insurance`;
      ensureTemplate(
        templateKey,
        `${resource.name} — Insurance Renewal`,
        'CHECK',
        { defense: 10 },
      );
      tasks.push({
        id: uuidv4(),
        templateRef: templateKey,
        completionState: 'pending',
        completedAt: null,
        resultFields: {},
        attachmentRef: null,
        resourceRef: resource.id,
        location: null,
        sharedWith: null,
        questRef: null,
        actRef: null,
        secondaryTag: null,
      });
    }
  }

  if (resource.serviceNextDate) {
    const serviceLead = resource.serviceLeadDays ?? 14;
    const d = daysUntilDate(resource.serviceNextDate);
    if (serviceLead !== -1 && d !== null && d >= 0 && d <= serviceLead) {
      const templateKey = `resource-task:${resource.id}:service`;
      ensureTemplate(
        templateKey,
        `${resource.name} — Service Due`,
        'CHECK',
        { defense: 8 },
      );
      tasks.push({
        ...buildResourceReminderTask(resource.id, templateKey),
      });
    }
  }

  for (const task of resource.maintenanceTasks ?? []) {
    if (task.kind === 'mileage-log') {
      const templateKey = `resource-task:${resource.id}:maintenance:${task.id}:mileage-log`;
      ensureTemplate(
        templateKey,
        `${resource.name} - Mileage Log`,
        'LOG',
        { defense: 8, wisdom: 2 },
        {
          prompt: 'Log the latest odometer reading or add the miles from your last drive.',
          logKind: 'vehicle-mileage',
          currentValue: resource.mileage ?? 0,
          resourceRef: resource.id,
          unit: 'mi',
        },
      );
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
    const next = computeNextOccurrence(task.recurrence);
    if (next.days < 0 || next.days > task.reminderLeadDays) {
      clearPendingResourceTasks(templateKey, resource.id);
      continue;
    }

    ensureTemplate(templateKey, `${resource.name} - ${task.name}`, 'CHECK', { defense: 8 });
    tasks.push(buildResourceReminderTask(resource.id, templateKey));
  }

  return tasks;
}

/** W27: GTD item for doc expiry within configurable lead days (default 30). */
function _genDocGTD(resource: DocResource): Task[] {
  if (resource.docType === 'layout') return [];
  if (!resource.expiryDate) return [];

  const lead = resource.expiryLeadDays ?? 30;
  if (lead === -1) return [];

  const d = daysUntilDate(resource.expiryDate);
  if (d === null || d < 0 || d > lead) return [];

  const templateKey = `resource-task:${resource.id}:expiry`;
  ensureTemplate(templateKey, `${resource.name} — Expiry`, 'CHECK', { defense: 8 });

  return [{
    id: uuidv4(),
    templateRef: templateKey,
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: resource.id,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  }];
}

// ── COMPUTE GTD LIST ──────────────────────────────────────────────────────────

/**
 * Scan all active Resources for a User, generate GTD items per resource, and
 * return a merged, deduplicated, ordered Task list (D05).
 *
 * Does NOT write to storage (read-only scan). Call generateGTDItems() to also
 * persist and enqueue items.
 */
export function computeGTDList(user: User): Task[] {
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

  // Scan all resource refs and generate fresh items for any resource not covered
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
    const generated = generateGTDItems(resource);
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
  resultFields: Partial<InputFields> = {},
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
  const template =
    scheduleStore.taskTemplates[task.templateRef] ??
    starterTaskTemplates.find((t) => t.id === task.templateRef) ??
    null;
  if (template) {
    const baseXP = Object.values(template.xpAward).reduce((s, v) => s + v, 0) + (template.xpBonus ?? 0);
    const onboardingQuestTask = isOnboardingQuestTemplate(task.templateRef);
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
