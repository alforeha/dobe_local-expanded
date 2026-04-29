// ─────────────────────────────────────────
// EVENT EXECUTION
// Task completion and Event completion logic.
//
// completeTask()  — marks a Task complete, records result, triggers XP + stat award
// completeEvent() — marks an Event complete when all required tasks are done
//
// Evidence / attachment: records an OPFS file reference + metadata in localStorage
// per D46. Max 5 attachments per Event (EVENT_MAX_ATTACHMENTS from storageBudget).
// ─────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import type { Task } from '../types/task';
import type { Event, EventAttachment, EventAttachmentSource } from '../types/event';
import type { HomeResource, InventoryResource, Resource } from '../types/resource';
import type { ConsumeEntry, ConsumeInputFields, InputFields, LocationPointInputFields, TaskTemplate, Waypoint, XpAward } from '../types/taskTemplate';
import type { StatGroupKey } from '../types/user';
import { useScheduleStore } from '../stores/useScheduleStore';
import { useUserStore } from '../stores/useUserStore';
import { useProgressionStore } from '../stores/useProgressionStore';
import { useResourceStore } from '../stores/useResourceStore';
import { EVENT_MAX_ATTACHMENTS } from '../storage/storageBudget';

import { awardXP, awardStat, awardGold } from './awardPipeline';
import { completeMilestone, decodeQuestRef, syncDailyQuestProgressForTask } from './markerEngine';
import { starterTaskTemplates, STARTER_TEMPLATE_IDS } from '../coach/StarterQuestLibrary';
import { checkAchievements } from '../coach/checkAchievements';
import { awardBadge } from '../coach/rewardPipeline';
import { pushRibbet } from '../coach/ribbet';
import { appendFeedEntry, FEED_SOURCE } from './feedEngine';
import { getAppNowISO } from '../utils/dateUtils';
import { getTaskCooldownState } from '../utils/taskCooldown';
import { getLibraryTemplatePool, resolveTaskTemplate } from '../utils/resolveTaskTemplate';
import { isWisdomTemplate } from './xpBoosts';
import { autoCompleteSystemTask, generateReplenishGTDItem } from './resourceEngine';

const DEFAULT_TASK_XP = 5;
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

// ── TASK RESULT SHAPE ─────────────────────────────────────────────────────────

export interface TaskResult {
  /** Recorded values matching the inputFields shape of the TaskTemplate (D41) */
  resultFields: Partial<InputFields>;
  /** Optional resource context — enables +2 defense bonus routing (D40) */
  resourceRef?: string | null;
  /** Optional location recorded during completion */
  location?: Task['location'];
}

interface QuantityTarget {
  resourceId: string;
  itemTemplateRef: string;
  locationLabel: string;
  getQuantity: (resources: Record<string, Resource>) => number;
  setQuantity: (resources: Record<string, Resource>, quantity: number) => void;
}

function isConsumeEntry(value: unknown): value is ConsumeEntry {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<ConsumeEntry>;
  return typeof candidate.itemTemplateRef === 'string'
    && typeof candidate.quantity === 'number';
}

function normaliseConsumeEntries(entries: unknown): ConsumeEntry[] {
  if (!Array.isArray(entries)) return [];

  return entries
    .filter(isConsumeEntry)
    .map((entry) => ({
      itemTemplateRef: entry.itemTemplateRef.trim(),
      quantity: Math.max(1, Math.floor(entry.quantity)),
    }))
    .filter((entry) => entry.itemTemplateRef.length > 0);
}

function getConsumeEntries(
  updatedTask: Task,
  template: TaskTemplate | null,
  result: TaskResult,
): ConsumeEntry[] {
  const resultEntries = normaliseConsumeEntries((result.resultFields as Partial<ConsumeInputFields>).entries);
  if (resultEntries.length > 0) return resultEntries;

  const savedEntries = normaliseConsumeEntries((updatedTask.resultFields as Partial<ConsumeInputFields>).entries);
  if (savedEntries.length > 0) return savedEntries;

  if (template?.taskType === 'CONSUME') {
    return normaliseConsumeEntries((template.inputFields as ConsumeInputFields).entries);
  }

  return [];
}

function cloneResource<T extends Resource>(resource: T): T {
  return JSON.parse(JSON.stringify(resource)) as T;
}

function getMutableResource(
  workingResources: Record<string, Resource>,
  baseResources: Record<string, Resource>,
  resourceId: string,
): Resource | null {
  const existing = workingResources[resourceId];
  if (existing) return existing;

  const base = baseResources[resourceId];
  if (!base) return null;

  const clone = cloneResource(base);
  workingResources[resourceId] = clone;
  return clone;
}

function collectQuantityTargets(resources: Record<string, Resource>, itemTemplateRef: string): QuantityTarget[] {
  const targets: QuantityTarget[] = [];

  for (const resource of Object.values(resources)) {
    if (resource.type === 'home') {
      for (const story of resource.stories ?? []) {
        for (const placement of story.placedItems ?? []) {
          if (placement.kind !== 'item' || placement.refId !== itemTemplateRef) continue;
          const locationLabel = story.name?.trim()
            ? `${resource.name} - ${story.name}`
            : resource.name;
          targets.push({
            resourceId: resource.id,
            itemTemplateRef,
            locationLabel,
            getQuantity: (currentResources) => {
              const currentResource = currentResources[resource.id] as HomeResource | undefined;
              const currentStory = currentResource?.stories?.find((entry) => entry.id === story.id);
              const currentPlacement = currentStory?.placedItems?.find((entry) => entry.id === placement.id);
              return Math.max(0, currentPlacement?.quantity ?? 0);
            },
            setQuantity: (currentResources, quantity) => {
              const currentResource = currentResources[resource.id] as HomeResource | undefined;
              const currentStory = currentResource?.stories?.find((entry) => entry.id === story.id);
              const currentPlacement = currentStory?.placedItems?.find((entry) => entry.id === placement.id);
              if (!currentPlacement) return;
              currentPlacement.quantity = Math.max(0, quantity);
            },
          });
        }

        for (const room of story.rooms ?? []) {
          for (const placement of room.placedItems ?? []) {
            if (placement.kind !== 'item' || placement.refId !== itemTemplateRef) continue;
            targets.push({
              resourceId: resource.id,
              itemTemplateRef,
              locationLabel: `${resource.name} - ${room.name}`,
              getQuantity: (currentResources) => {
                const currentResource = currentResources[resource.id] as HomeResource | undefined;
                const currentStory = currentResource?.stories?.find((entry) => entry.id === story.id);
                const currentRoom = currentStory?.rooms?.find((entry) => entry.id === room.id);
                const currentPlacement = currentRoom?.placedItems?.find((entry) => entry.id === placement.id);
                return Math.max(0, currentPlacement?.quantity ?? 0);
              },
              setQuantity: (currentResources, quantity) => {
                const currentResource = currentResources[resource.id] as HomeResource | undefined;
                const currentStory = currentResource?.stories?.find((entry) => entry.id === story.id);
                const currentRoom = currentStory?.rooms?.find((entry) => entry.id === room.id);
                const currentPlacement = currentRoom?.placedItems?.find((entry) => entry.id === placement.id);
                if (!currentPlacement) return;
                currentPlacement.quantity = Math.max(0, quantity);
              },
            });
          }
        }
      }
      continue;
    }

    if (resource.type !== 'inventory') continue;

    for (const item of resource.items) {
      if (item.itemTemplateRef !== itemTemplateRef) continue;
      targets.push({
        resourceId: resource.id,
        itemTemplateRef,
        locationLabel: resource.name,
        getQuantity: (currentResources) => {
          const currentResource = currentResources[resource.id] as InventoryResource | undefined;
          const currentItem = currentResource?.items.find((entry) => entry.id === item.id);
          return Math.max(0, currentItem?.quantity ?? 0);
        },
        setQuantity: (currentResources, quantity) => {
          const currentResource = currentResources[resource.id] as InventoryResource | undefined;
          const currentItem = currentResource?.items.find((entry) => entry.id === item.id);
          if (!currentItem) return;
          currentItem.quantity = Math.max(0, quantity);
        },
      });
    }

    for (const container of resource.containers ?? []) {
      for (const item of container.items) {
        if (item.itemTemplateRef !== itemTemplateRef) continue;
        targets.push({
          resourceId: resource.id,
          itemTemplateRef,
          locationLabel: `${resource.name} - ${container.name}`,
          getQuantity: (currentResources) => {
            const currentResource = currentResources[resource.id] as InventoryResource | undefined;
            const currentContainer = currentResource?.containers?.find((entry) => entry.id === container.id);
            const currentItem = currentContainer?.items.find((entry) => entry.id === item.id);
            return Math.max(0, currentItem?.quantity ?? 0);
          },
          setQuantity: (currentResources, quantity) => {
            const currentResource = currentResources[resource.id] as InventoryResource | undefined;
            const currentContainer = currentResource?.containers?.find((entry) => entry.id === container.id);
            const currentItem = currentContainer?.items.find((entry) => entry.id === item.id);
            if (!currentItem) return;
            currentItem.quantity = Math.max(0, quantity);
          },
        });
      }
    }
  }

  return targets;
}

function applyConsumeTaskEffects(entries: ConsumeEntry[]): void {
  if (entries.length === 0) return;

  const resourceStore = useResourceStore.getState();
  const baseResources = resourceStore.resources;
  const workingResources: Record<string, Resource> = {};
  const zeroQuantityReplenishTargets = new Map<string, { resourceId: string; locationLabel: string; itemTemplateRef: string }>();
  const touchedResourceIds = new Set<string>();
  const now = getAppNowISO();

  for (const entry of entries) {
    const targets = collectQuantityTargets(baseResources, entry.itemTemplateRef);
    if (targets.length === 0) continue;

    const getCurrentResources = () => ({ ...baseResources, ...workingResources });
    let remaining = entry.quantity;
    const sortedTargets = [...targets].sort((left, right) => left.getQuantity(getCurrentResources()) - right.getQuantity(getCurrentResources()));

    for (const target of sortedTargets) {
      if (remaining <= 0) break;
      const mutableResource = getMutableResource(workingResources, baseResources, target.resourceId);
      if (!mutableResource) continue;

      const currentQuantity = target.getQuantity(workingResources);
      if (currentQuantity <= 0) continue;

      const consumed = Math.min(currentQuantity, remaining);
      const nextQuantity = currentQuantity - consumed;
      target.setQuantity(workingResources, nextQuantity);
      touchedResourceIds.add(target.resourceId);
      remaining -= consumed;

      if (nextQuantity === 0) {
        zeroQuantityReplenishTargets.set(
          `${target.resourceId}::${target.locationLabel}::${entry.itemTemplateRef}`,
          {
            resourceId: target.resourceId,
            locationLabel: target.locationLabel,
            itemTemplateRef: entry.itemTemplateRef,
          },
        );
      }
    }
  }

  for (const resourceId of touchedResourceIds) {
    const resource = workingResources[resourceId];
    if (!resource) continue;

    resourceStore.setResource({
      ...resource,
      updatedAt: now,
    } as Resource);
  }

  for (const replenishTarget of zeroQuantityReplenishTargets.values()) {
    generateReplenishGTDItem(
      replenishTarget.itemTemplateRef,
      replenishTarget.locationLabel,
      replenishTarget.resourceId || null,
    );
  }
}

// ── ATTACHMENT RECORD (D46) ───────────────────────────────────────────────────

export interface AttachmentRecord {
  /** OPFS file reference path — e.g. the file name or handle path */
  opfsRef: string;
  /** File size in bytes — enforced ≤ 200 KB (D09) */
  sizeBytes: number;
  /** MIME type or descriptor: image, text, doc, etc. */
  mimeType: string;
  /** ISO timestamp of when the attachment was recorded */
  recordedAt: string;
  /** Optional Task ref for contract validation flow */
  taskRef: string | null;
}

export interface AddAttachmentInput {
  type: EventAttachment['type'];
  label: string;
  uri: string;
  mimeType: string;
  sizeBytes: number;
  source: EventAttachmentSource;
  createdAt?: string;
}

// ── COMPLETE TASK ─────────────────────────────────────────────────────────────

/**
 * Mark a Task complete, record its result, and trigger XP + stat awards.
 *
 * Reads  — useScheduleStore.tasks, useScheduleStore.taskTemplates
 * Writes — useScheduleStore.tasks, useUserStore (XP + stats), storageLayer
 *
 * @param taskId   id of the Task to complete
 * @param eventId  id of the parent Event (used to determine context bonus)
 * @param result   recorded values + optional resource/location context
 */
export function completeTask(
  taskId: string,
  eventId: string,
  result: TaskResult,
): void {
  const scheduleStore = useScheduleStore.getState();
  const userStore = useUserStore.getState();

  const task = scheduleStore.tasks[taskId];
  if (!task) {
    console.warn(`[eventExecution] completeTask: Task "${taskId}" not found`);
    return;
  }

  const libraryTemplates = getLibraryTemplatePool();

  const template = task.templateRef
    ? resolveTaskTemplate(task.templateRef, scheduleStore.taskTemplates, starterTaskTemplates, libraryTemplates) ?? null
    : null;

  if (template) {
    const cooldown = getTaskCooldownState(template, task.templateRef!, scheduleStore.tasks);
    if (cooldown.isCoolingDown) {
      console.warn(
        `[eventExecution] completeTask: Task "${taskId}" blocked by cooldown until ${new Date(cooldown.cooldownEndAt ?? 0).toISOString()}`,
      );
      return;
    }
  }

  const canRepeatAfterCooldown = Boolean(template?.cooldown && task.completionState === 'complete');
  if (task.completionState === 'complete' && !canRepeatAfterCooldown) {
    console.warn(`[eventExecution] completeTask: Task "${taskId}" already complete`);
    return;
  }

  // FIX-13 trace — confirm questRef/actRef are populated before milestone routing
  console.log(
    `[completeTask] taskId=${taskId} questRef=${task.questRef ?? 'null'} actRef=${task.actRef ?? 'null'}`,
  );

  const now = getAppNowISO();

  const updatedTask: Task = {
    ...task,
    completionState: 'complete',
    completedAt: now,
    resultFields: result.resultFields,
    resourceRef: result.resourceRef ?? task.resourceRef,
    location: result.location ?? task.location,
  };

  scheduleStore.setTask(updatedTask);
  const resolvedTaskType = updatedTask.taskType ?? template?.taskType ?? null;
  if (resolvedTaskType === 'CONSUME') {
    applyConsumeTaskEffects(getConsumeEntries(updatedTask, template, result));
  }
  if (updatedTask.templateRef === STARTER_TEMPLATE_IDS.openWelcomeEvent) {
    autoCompleteSystemTask(STARTER_TEMPLATE_IDS.openWelcomeEvent);
  }

  // Quest check-in hook: if this task was fired by a Marker, record the Milestone
  // and evaluate the Quest finish condition (D04).
  if (updatedTask.questRef) {
    completeMilestone(updatedTask);

    // Coach reactions for quest progress / completion
    const parsedRef = decodeQuestRef(updatedTask.questRef);
    if (parsedRef) {
      const { actId, chainIndex, questIndex } = parsedRef;
      const act = useProgressionStore.getState().acts[actId];
      const completedQuest = act?.chains[chainIndex]?.quests[questIndex];
      if (completedQuest?.completionState === 'complete') {
        pushRibbet('quest.completed');
      } else if (completedQuest) {
        pushRibbet('quest.progress', {
          questPercent: completedQuest.progressPercent,
          xpGained: 0,
        });
      }
    }
  }

  syncDailyQuestProgressForTask(updatedTask);

  // Determine context for bonuses
  const event = scheduleStore.activeEvents[eventId] ??
    scheduleStore.historyEvents[eventId];
  const isQuickActions =
    event && 'eventType' in event && event.eventType === 'quickActions';
  const hasResourceRef =
    Boolean(result.resourceRef) || Boolean(task.resourceRef);

  // Fetch template to get xpAward and stat group.
  // System templates are not in the store — fall back to the coach bundle.
  if (userStore.user) {
    const userId = userStore.user.system.id;

    if (template) {
      // Award XP — base from template + context multipliers
      const baseXP = Object.values(template.xpAward).reduce((s, v) => s + v, 0) + (template.xpBonus ?? 0);
      const contextBonuses: number[] = [];
      if (hasResourceRef) contextBonuses.push(2); // +2 defense bonus

      const bonusTotal = contextBonuses.reduce((s, v) => s + v, 0);
      const xpResult = awardXP(userId, baseXP + bonusTotal, {
        isWisdomTask: isWisdomTemplate(template),
        statGroup: getPrimaryStatGroup(template.xpAward),
        isEventTask: Boolean(event && !isQuickActions),
        secondaryTag: template.secondaryTag,
        source: `task-completed:${task.templateRef}`,
        suppressLog: true,
      });

      // Award stat points per xpAward distribution
      const statGroups = template.xpAward;
      const statAwards: Array<{ group: StatGroupKey; points: number }> = [];
      for (const [group, points] of Object.entries(statGroups) as [StatGroupKey, number][]) {
        if (points > 0) {
          awardStat(userId, group, points, `task.complete:${task.templateRef}`);
          statAwards.push({ group, points });
        }
      }

      // Context-specific stat bonuses
      if (isQuickActions) {
        awardXP(userId, 2, {
          statGroup: 'agility',
          source: `task.complete.quickActions:${task.templateRef}`,
        });
        awardStat(userId, 'agility', 2, `task.complete.quickActions:${task.templateRef}`);
        statAwards.push({ group: 'agility', points: 2 });
      }
      if (hasResourceRef) {
        awardStat(userId, 'defense', 2, `task.complete.resource:${task.templateRef}`);
        statAwards.push({ group: 'defense', points: 2 });
      }

      if (xpResult) {
        console.info('[task-completed]', {
          taskId: updatedTask.id,
          templateRef: task.templateRef,
          rawXP: xpResult.rawAmount,
          awardedXP: xpResult.awardedAmount,
          activeMultipliers: xpResult.activeMultipliers,
          multiplierSnapshot: xpResult.multiplierSnapshot,
          statAwards,
          contextBonuses: {
            quickActions: isQuickActions ? 2 : 0,
            resourceRef: hasResourceRef ? 2 : 0,
          },
        });
      }
    } else {
      // No template found — apply wisdom fallback (D48)
      const xpResult = awardXP(userId, 5, {
        isWisdomTask: true,
        statGroup: 'wisdom',
        isEventTask: Boolean(event && !isQuickActions),
        source: `task-completed:fallback:${task.templateRef}`,
        suppressLog: true,
      });
      awardStat(userId, 'wisdom', 25, `task.complete.fallback:${task.templateRef}`);
      if (xpResult) {
        console.info('[task-completed]', {
          taskId: updatedTask.id,
          templateRef: task.templateRef,
          rawXP: xpResult.rawAmount,
          awardedXP: xpResult.awardedAmount,
          activeMultipliers: xpResult.activeMultipliers,
          multiplierSnapshot: xpResult.multiplierSnapshot,
          statAwards: [{ group: 'wisdom', points: 25 }],
          contextBonuses: {
            quickActions: 0,
            resourceRef: 0,
          },
        });
      }
    }

    // Update task completion milestone counter
    // Re-fetch fresh state — awardXP/awardStat above may have written new XP/stat values.
    const freshUser = useUserStore.getState().user;
    if (freshUser) {
      const updatedUser = {
        ...freshUser,
        progression: {
          ...freshUser.progression,
          stats: {
            ...freshUser.progression.stats,
            milestones: {
              ...freshUser.progression.stats.milestones,
              tasksCompleted: freshUser.progression.stats.milestones.tasksCompleted + 1,
            },
          },
        },
      };
      userStore.setUser(updatedUser);
    }

    // Achievement check + badge awards after all state changes
    const latestUser = useUserStore.getState().user;
    if (latestUser) {
      const newAchs = checkAchievements(latestUser);
      let currentUser = latestUser;
      for (const ach of newAchs) {
        currentUser = awardBadge(ach, currentUser);
      }
    }
  }

  // Auto-complete: if every task in the parent event is done, complete the event.
  // Re-read schedule state AFTER setTask() so the just-committed completion is visible.
  const freshSchedule = useScheduleStore.getState();
  const parentEvent = freshSchedule.activeEvents[eventId];
  if (parentEvent && parentEvent.eventType !== 'quickActions') {
    const typedParent = parentEvent as Event;
    if (typedParent.completionState !== 'complete') {
      const allTasksDone = typedParent.tasks.every((tid) => {
        const t = freshSchedule.tasks[tid];
        return t?.completionState === 'complete' || t?.completionState === 'skipped';
      });
      if (allTasksDone) {
        completeEvent(eventId);
      }
    }
  }
}

// ── COMPLETE EVENT ────────────────────────────────────────────────────────────

/**
 * Mark an Event complete if all its required tasks are done.
 * An Event is complete when every Task in event.tasks has completionState 'complete' or 'skipped'.
 *
 * Reads  — useScheduleStore.activeEvents, useScheduleStore.tasks
 * Writes — useScheduleStore.activeEvents, storageLayer
 *
 * @param eventId  id of the Event to complete
 */
export function completeEvent(eventId: string): void {
  const scheduleStore = useScheduleStore.getState();
  const event = scheduleStore.activeEvents[eventId];

  if (!event || event.eventType === 'quickActions') {
    // QuickActionsEvent is never "completed" — it rolls over at midnight
    return;
  }

  const typedEvent = event as Event;
  if (typedEvent.completionState === 'complete') return;

  const allDone = typedEvent.tasks.every((taskId) => {
    const t = scheduleStore.tasks[taskId];
    return t?.completionState === 'complete' || t?.completionState === 'skipped';
  });

  if (!allDone) return;

  const totalXP = typedEvent.tasks.length * DEFAULT_TASK_XP;

  const updatedEvent: Event = {
    ...typedEvent,
    completionState: 'complete',
    xpAwarded: totalXP,
  };

  scheduleStore.setActiveEvent(updatedEvent);

  // Increment eventsCompleted milestone and trigger coach reactions
  const userStoreRef = useUserStore.getState();
  const eventUser = userStoreRef.user;
  if (eventUser) {
    const withEventCount = {
      ...eventUser,
      progression: {
        ...eventUser.progression,
        stats: {
          ...eventUser.progression.stats,
          milestones: {
            ...eventUser.progression.stats.milestones,
            eventsCompleted: eventUser.progression.stats.milestones.eventsCompleted + 1,
          },
        },
      },
    };
    userStoreRef.setUser(withEventCount);

    const eventXpResult = awardXP(withEventCount.system.id, totalXP, {
      source: `event.complete:${updatedEvent.name}`,
      suppressLog: true,
    });

    // +1 gold per event completion (D98)
    const userForGold = useUserStore.getState().user;
    if (userForGold) {
      userStoreRef.setUser(awardGold(1, userForGold, {
        source: `event.complete:${updatedEvent.name}`,
        suppressLog: true,
      }));
      console.info('[event-complete]', {
        eventId,
        eventName: updatedEvent.name,
        taskCount: typedEvent.tasks.length,
        baseEventXP: totalXP,
        preMultiplierXP: eventXpResult?.rawAmount ?? totalXP,
        awardedXP: eventXpResult?.awardedAmount ?? totalXP,
        goldAward: 1,
        activeMultipliers: eventXpResult?.activeMultipliers ?? [],
        multiplierSnapshot: eventXpResult?.multiplierSnapshot ?? null,
      });
    }

    pushRibbet('event.completed');

    // Achievement check + badge awards
    const latestEventUser = useUserStore.getState().user ?? withEventCount;
    const newAchs = checkAchievements(latestEventUser);
    let currentUser = latestEventUser;
    for (const ach of newAchs) {
      currentUser = awardBadge(ach, currentUser);
    }

    // Feed entry on event completion
    const eventFeedUser = useUserStore.getState().user ?? currentUser;
    appendFeedEntry({
      commentBlock: `Completed: ${updatedEvent.name}`,
      sourceType: FEED_SOURCE.EVENT_COMPLETE,
      timestamp: new Date().toISOString(),
      triggerRef: eventId,
    }, eventFeedUser);
  }
}

// ── RECORD ATTACHMENT (D46) ───────────────────────────────────────────────────

/**
 * Record an OPFS file reference as an attachment on an Event.
 * Enforces the max 5 attachment cap (EVENT_MAX_ATTACHMENTS) per D09/D46.
 *
 * The Attachment ItemTemplate record is stored under attachment:{uuid} in localStorage.
 * The Event.attachments[] array is updated with the new attachment id.
 *
 * @param eventId     id of the Event to attach to
 * @param attachment  OPFS file ref, size, type, and optional taskRef
 * @returns           The new attachment id, or null if cap exceeded
 */
export function recordAttachment(
  eventId: string,
  attachment: AttachmentRecord,
): string | null {
  return addAttachment(
    {
      type: attachment.mimeType.startsWith('image/') ? 'photo' : 'document',
      label: attachment.opfsRef,
      uri: attachment.opfsRef,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      source: 'legacy',
      createdAt: attachment.recordedAt,
    },
    eventId,
  );
}

export function addAttachment(
  attachment: AddAttachmentInput,
  eventId: string,
): string | null {
  const scheduleStore = useScheduleStore.getState();
  const event = (scheduleStore.activeEvents[eventId] ?? scheduleStore.historyEvents[eventId]) as Event | undefined;

  if (!event || event.eventType === 'quickActions') {
    console.warn(`[eventExecution] addAttachment: Event "${eventId}" not found or is QA event`);
    return null;
  }

  if (event.attachments.length >= EVENT_MAX_ATTACHMENTS) {
    console.warn(
      `[eventExecution] addAttachment: Event "${eventId}" is at attachment cap (${EVENT_MAX_ATTACHMENTS})`,
    );
    return null;
  }

  const attachmentId = uuidv4();
  const nextAttachment: EventAttachment = {
    id: attachmentId,
    type: attachment.type,
    label: attachment.label,
    uri: attachment.uri,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt ?? getAppNowISO(),
    source: attachment.source,
  };

  const updatedEvent: Event = {
    ...event,
    attachments: [...event.attachments, nextAttachment],
  };

  scheduleStore.updateEvent(eventId, { attachments: updatedEvent.attachments });

  return attachmentId;
}

export function removeAttachment(attachmentId: string, eventId: string): void {
  const scheduleStore = useScheduleStore.getState();
  const event = (scheduleStore.activeEvents[eventId] ?? scheduleStore.historyEvents[eventId]) as Event | undefined;

  if (!event || event.eventType === 'quickActions') {
    return;
  }

  scheduleStore.updateEvent(eventId, {
    attachments: event.attachments.filter((attachment) => attachment.id !== attachmentId),
  });
}

// ── UNDO / REMOVE ─────────────────────────────────────────────────────────────

/**
 * Reset a completed task back to pending (undo completion).
 * Does not reverse any XP or stat awards already granted.
 */
export function uncompleteTask(taskId: string, eventId: string): void {
  const scheduleStore = useScheduleStore.getState();
  const task = scheduleStore.tasks[taskId];
  if (!task || task.completionState !== 'complete') return;

  const updatedTask: Task = { ...task, completionState: 'pending', completedAt: null, resultFields: {} };
  scheduleStore.setTask(updatedTask);

  // Re-open the event if it was marked complete
  const event = scheduleStore.activeEvents[eventId] as Event | undefined;
  if (event && 'completionState' in event && (event as Event).completionState === 'complete') {
    scheduleStore.setActiveEvent({ ...(event as Event), completionState: 'pending' });
  }
}

/**
 * Remove a task from an event's task list.
 */
export function removeTaskFromEvent(taskId: string, eventId: string): void {
  const scheduleStore = useScheduleStore.getState();
  scheduleStore.removeTaskFromEvent(taskId, eventId);
}

/**
 * Create a new Task from a template and append it to an event's task list.
 */
export function addTaskToEvent(templateRef: string, eventId: string): void {
  const scheduleStore = useScheduleStore.getState();
  const event = (scheduleStore.activeEvents[eventId] ?? scheduleStore.historyEvents[eventId]) as Event | undefined;
  if (!event || event.eventType === 'quickActions') return;

  const libraryTemplates = getLibraryTemplatePool();

  const template =
    resolveTaskTemplate(templateRef, scheduleStore.taskTemplates, starterTaskTemplates, libraryTemplates) ?? null;
  const secondaryTag = template?.secondaryTag ?? null;

  const newTask: Task = {
    id: uuidv4(),
    templateRef,
    completionState: 'pending',
    completedAt: null,
    resultFields: {},
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag,
  };

  scheduleStore.setTask(newTask);
  scheduleStore.updateEvent(eventId, { tasks: [...event.tasks, newTask.id] });
}

export function addUniqueTaskToEvent(task: Omit<Task, 'id'>, eventId: string): void {
  const scheduleStore = useScheduleStore.getState();
  const event = (scheduleStore.activeEvents[eventId] ?? scheduleStore.historyEvents[eventId]) as Event | undefined;
  if (!event || event.eventType === 'quickActions') return;

  const newTask: Task = {
    ...task,
    id: uuidv4(),
  };

  scheduleStore.setTask(newTask);
  scheduleStore.updateEvent(eventId, { tasks: [...event.tasks, newTask.id] });
}

function getTrailTask(taskId: string, eventId: string): { scheduleStore: ReturnType<typeof useScheduleStore.getState>; task: Task } | null {
  const scheduleStore = useScheduleStore.getState();
  const event = (scheduleStore.activeEvents[eventId] ?? scheduleStore.historyEvents[eventId]) as Event | undefined;
  const task = scheduleStore.tasks[taskId];

  if (!event || event.eventType === 'quickActions' || !task || !event.tasks.includes(taskId)) {
    return null;
  }

  return { scheduleStore, task };
}

export function addWaypoint(taskId: string, eventId: string, waypoint: Waypoint): void {
  const context = getTrailTask(taskId, eventId);
  if (!context) return;

  const waypoints = Array.isArray((context.task.resultFields as { waypoints?: Waypoint[] }).waypoints)
    ? [...((context.task.resultFields as { waypoints?: Waypoint[] }).waypoints ?? [])]
    : [];

  context.scheduleStore.setTask({
    ...context.task,
    resultFields: {
      ...context.task.resultFields,
      waypoints: [...waypoints, waypoint],
    },
  });
}

export function insertWaypoint(taskId: string, eventId: string, index: number, waypoint: Waypoint): void {
  const context = getTrailTask(taskId, eventId);
  if (!context) return;

  const waypoints = Array.isArray((context.task.resultFields as { waypoints?: Waypoint[] }).waypoints)
    ? [...((context.task.resultFields as { waypoints?: Waypoint[] }).waypoints ?? [])]
    : [];

  const safeIndex = Math.max(0, Math.min(index, waypoints.length));

  context.scheduleStore.setTask({
    ...context.task,
    resultFields: {
      ...context.task.resultFields,
      waypoints: [...waypoints.slice(0, safeIndex), waypoint, ...waypoints.slice(safeIndex)],
    },
  });
}

export function updateWaypoint(taskId: string, eventId: string, index: number, waypoint: Waypoint): void {
  const context = getTrailTask(taskId, eventId);
  if (!context) return;

  const waypoints = Array.isArray((context.task.resultFields as { waypoints?: Waypoint[] }).waypoints)
    ? [...((context.task.resultFields as { waypoints?: Waypoint[] }).waypoints ?? [])]
    : [];
  if (index < 0 || index >= waypoints.length) return;

  waypoints[index] = waypoint;
  context.scheduleStore.setTask({
    ...context.task,
    resultFields: {
      ...context.task.resultFields,
      waypoints,
    },
  });
}

export function deleteWaypoint(taskId: string, eventId: string, index: number): void {
  const context = getTrailTask(taskId, eventId);
  if (!context) return;

  const waypoints = Array.isArray((context.task.resultFields as { waypoints?: Waypoint[] }).waypoints)
    ? [...((context.task.resultFields as { waypoints?: Waypoint[] }).waypoints ?? [])]
    : [];
  if (index < 0 || index >= waypoints.length) return;

  context.scheduleStore.setTask({
    ...context.task,
    resultFields: {
      ...context.task.resultFields,
      waypoints: waypoints.filter((_, waypointIndex) => waypointIndex !== index),
    },
  });
}

export function updateLocationPoint(taskId: string, eventId: string, resultFields: Partial<LocationPointInputFields>): void {
  const context = getTrailTask(taskId, eventId);
  if (!context) return;

  context.scheduleStore.setTask({
    ...context.task,
    resultFields: {
      ...context.task.resultFields,
      ...resultFields,
    },
  });
}
