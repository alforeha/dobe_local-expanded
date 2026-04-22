// ─────────────────────────────────────────
// LISTS ENGINE — FavouritesList + ShoppingLists + Manual GTD
//
// FavouritesList — TaskTemplate refs. completeFavourite() fires a one-shot Task
//   completion into today's QuickActionsEvent (per D10) and triggers coach.
//
// ShoppingLists — CRUD for named lists + structured items.
//   completeShoppingItem() → if item.accountRef is set, writes a PendingTransaction
//   to the linked Account Resource (D42 shopping list → transaction flow).
//
// Manual GTD — user-created GTD items (MVP11 W19).
//   addManualGTDItem() / removeManualGTDItem() / completeManualGTDItem()
// ─────────────────────────────────────────

import { v4 as uuidv4 } from 'uuid';
import type { User, ShoppingList, ShoppingItem, StatGroupKey } from '../types/user';
import type { Task } from '../types/task';
import type { GTDItem } from '../types/task';
import type { QuickActionsEvent } from '../types/event';
import type { AccountResource, PendingTransaction } from '../types/resource';
import type { InputFields, XpAward } from '../types/taskTemplate';
import { getAppDate, getAppNowISO } from '../utils/dateUtils';
import { useScheduleStore } from '../stores/useScheduleStore';
import { useUserStore } from '../stores/useUserStore';
import { useResourceStore } from '../stores/useResourceStore';
import { storageSet, storageKey } from '../storage';
import { awardXP, awardStat } from './awardPipeline';
import { checkAchievements } from '../coach/checkAchievements';
import { awardBadge } from '../coach/rewardPipeline';
import { pushRibbet } from '../coach/ribbet';
import { autoCompleteSystemTask } from './resourceEngine';
import { isWisdomTemplate } from './xpBoosts';
import { syncDailyQuestProgressForTask } from './markerEngine';
import { getCurrentAppNowMs, getTaskCooldownState } from '../utils/taskCooldown';

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

// ── HELPERS ────────────────────────────────────────────────────────────────────────────────

function todayISO(): string {
  return getAppDate();
}

/**
 * Persist the user (store + storage) and return the latest store ref.
 */
function persistUser(user: User): void {
  useUserStore.getState().setUser(user);
}

// ── FAVOURITES LIST ───────────────────────────────────────────────────────────

/**
 * Add a TaskTemplate ref to User.lists.favouritesList.
 * No-op if already present.
 */
export function addFavourite(taskTemplateRef: string, user: User): void {
  if (user.lists.favouritesList.includes(taskTemplateRef)) return;
  const updated: User = {
    ...user,
    lists: {
      ...user.lists,
      favouritesList: [...user.lists.favouritesList, taskTemplateRef],
    },
  };
  persistUser(updated);
}

/**
 * Remove a TaskTemplate ref from User.lists.favouritesList.
 */
export function removeFavourite(taskTemplateRef: string, user: User): void {
  const updated: User = {
    ...user,
    lists: {
      ...user.lists,
      favouritesList: user.lists.favouritesList.filter((ref) => ref !== taskTemplateRef),
    },
  };
  persistUser(updated);
}

/**
 * Complete a favourite — instantiate a Task from the template, mark it done,
 * write to today's QuickActionsEvent (per D10), award XP, and trigger coach.
 *
 * @param taskTemplateRef  TaskTemplate key to complete
 * @param user             Current User
 */
export function completeFavourite(
  taskTemplateRef: string,
  user: User,
  resultFields: Partial<InputFields> = {},
): void {
  const scheduleStore = useScheduleStore.getState();
  const now = getAppNowISO();
  const today = todayISO();

  const template = scheduleStore.taskTemplates[taskTemplateRef];
  if (template) {
    const cooldown = getTaskCooldownState(template, taskTemplateRef, scheduleStore.tasks, getCurrentAppNowMs());
    if (cooldown.isCoolingDown) {
      return;
    }
  }

  // Create a completed Task instance
  const task: Task = {
    id: uuidv4(),
    templateRef: taskTemplateRef,
    completionState: 'complete',
    completedAt: now,
    resultFields,
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };

  scheduleStore.setTask(task);
  syncDailyQuestProgressForTask(task);

  // Write completion to today's QuickActionsEvent (D10)
  const qaId = `qa-${today}`;
  const qa = scheduleStore.activeEvents[qaId] as QuickActionsEvent | undefined;
  if (qa) {
    const updatedQa: QuickActionsEvent = {
      ...qa,
      completions: [...qa.completions, { taskRef: task.id, completedAt: now }],
    };
    scheduleStore.setActiveEvent(updatedQa);
  }

  // XP award — +2 agility for QuickActions context (D39)
  const userId = user.system.id;
  if (template) {
    const baseXP = Object.values(template.xpAward).reduce((s, v) => s + v, 0) + (template.xpBonus ?? 0);
    awardXP(userId, baseXP, {
      isWisdomTask: isWisdomTemplate(template),
      statGroup: getPrimaryStatGroup(template.xpAward),
      secondaryTag: template.secondaryTag,
      source: `favourite.complete:${taskTemplateRef}`,
    });
    awardXP(userId, 2, {
      statGroup: 'agility',
      source: `favourite.complete.quickActions:${taskTemplateRef}`,
    });
    awardStat(userId, 'agility', 2, `favourite.complete:${taskTemplateRef}`);
  } else {
    awardXP(userId, 5, {
      isWisdomTask: true,
      statGroup: 'wisdom',
      source: `favourite.complete.fallback:${taskTemplateRef}`,
    });
    awardXP(userId, 2, {
      statGroup: 'agility',
      source: `favourite.complete.quickActions:${taskTemplateRef}`,
    });
    awardStat(userId, 'agility', 2, `favourite.complete.quickActions:${taskTemplateRef}`);
    awardStat(userId, 'wisdom', 25, `favourite.complete.fallback:${taskTemplateRef}`);
  }

  // Achievement check + badge awards
  const latestStoreUser = useUserStore.getState().user;
  if (latestStoreUser) {
    const newAchs = checkAchievements(latestStoreUser);
    let currentUser = latestStoreUser;
    for (const ach of newAchs) {
      currentUser = awardBadge(ach, currentUser);
    }
  }

  pushRibbet('favourite.completed');
}

// ── SHOPPING LISTS ────────────────────────────────────────────────────────────

/**
 * Create a new ShoppingList and append it to User.lists.shoppingLists.
 *
 * @param name   Display name / tag for the list (e.g. "Groceries")
 * @param user   Current User
 * @returns The created ShoppingList
 */
export function createShoppingList(name: string, user: User): ShoppingList {
  const list: ShoppingList = {
    id: uuidv4(),
    name,
    items: [],
  };
  const updated: User = {
    ...user,
    lists: {
      ...user.lists,
      shoppingLists: [...user.lists.shoppingLists, list],
    },
  };
  persistUser(updated);
  return list;
}

/**
 * Add an item to an existing ShoppingList.
 *
 * @param listId  ShoppingList.id
 * @param item    ShoppingItem to add (id must be a uuid — caller provides or use uuidv4())
 * @param user    Current User
 */
export function addShoppingItem(listId: string, item: ShoppingItem, user: User): void {
  const updated: User = {
    ...user,
    lists: {
      ...user.lists,
      shoppingLists: user.lists.shoppingLists.map((list) =>
        list.id !== listId
          ? list
          : { ...list, items: [...list.items, item] },
      ),
    },
  };
  persistUser(updated);
}

/**
 * Remove an item from a ShoppingList.
 *
 * @param listId  ShoppingList.id
 * @param itemId  ShoppingItem.id to remove
 * @param user    Current User
 */
export function removeShoppingItem(listId: string, itemId: string, user: User): void {
  const updated: User = {
    ...user,
    lists: {
      ...user.lists,
      shoppingLists: user.lists.shoppingLists.map((list) =>
        list.id !== listId
          ? list
          : { ...list, items: list.items.filter((i) => i.id !== itemId) },
      ),
    },
  };
  persistUser(updated);
}

/**
 * Mark a shopping item complete.
 * If the item has an accountRef, push a PendingTransaction to the linked Account
 * Resource (D42 shopping list → pending transaction flow).
 *
 * @param listId  ShoppingList.id
 * @param itemId  ShoppingItem.id to complete
 * @param user    Current User
 */
export function completeShoppingItem(listId: string, itemId: string, user: User): void {
  const now = getAppNowISO();

  // Find the item first so we can write the pending transaction
  let targetItem: ShoppingItem | null = null;
  for (const list of user.lists.shoppingLists) {
    if (list.id === listId) {
      targetItem = list.items.find((i) => i.id === itemId) ?? null;
      break;
    }
  }

  // Mark item complete
  const withCompleted: User = {
    ...user,
    lists: {
      ...user.lists,
      shoppingLists: user.lists.shoppingLists.map((list) =>
        list.id !== listId
          ? list
          : {
              ...list,
              items: list.items.map((i) =>
                i.id !== itemId ? i : { ...i, completed: true, completedAt: now },
              ),
            },
      ),
    },
  };

  persistUser(withCompleted);

  // Pending transaction write — only when item has accountRef
  if (targetItem?.accountRef) {
    _writePendingTransaction(targetItem, target_itemRef(targetItem));
  }
}

/** Derive a sourceRef label for the pending transaction */
function target_itemRef(item: ShoppingItem): string {
  return item.useableRef ?? item.id;
}

/**
 * Write a PendingTransaction to the linked Account Resource.
 * Status starts as 'pending' — user assigns to account, marks posted on task completion.
 */
function _writePendingTransaction(
  item: ShoppingItem,
  sourceRef: string,
): void {
  const resourceStore = useResourceStore.getState();
  if (!item.accountRef) return;

  const accountResource = resourceStore.resources[item.accountRef];
  if (!accountResource || accountResource.type !== 'account') {
    console.warn(`[listsEngine] completeShoppingItem: Account resource "${item.accountRef}" not found`);
    return;
  }

  const pendingTx: PendingTransaction = {
    id: uuidv4(),
    date: todayISO(),
    description: item.name,
    sourceRef,
    assignedAccountRef: null,
    amount: item.quantity != null && item.quantity > 0 ? (item.quantity) : null,
    status: 'pending',
  };

  const updatedResource: AccountResource = {
    ...accountResource,
    pendingTransactions: [...(accountResource.pendingTransactions ?? []), pendingTx],
  };

  resourceStore.setResource(updatedResource);
  storageSet(storageKey.resource(item.accountRef), updatedResource);
}

/**
 * Mark all items in a ShoppingList as complete.
 * Items with accountRef each get a PendingTransaction write.
 *
 * @param listId  ShoppingList.id to complete
 * @param user    Current User
 */
export function completeShoppingList(listId: string, user: User): void {
  const now = getAppNowISO();

  // Find the list
  const list = user.lists.shoppingLists.find((l) => l.id === listId);
  if (!list) {
    console.warn(`[listsEngine] completeShoppingList: List "${listId}" not found`);
    return;
  }

  // Mark all items complete
  const withAllComplete: User = {
    ...user,
    lists: {
      ...user.lists,
      shoppingLists: user.lists.shoppingLists.map((l) =>
        l.id !== listId
          ? l
          : {
              ...l,
              items: l.items.map((i) =>
                i.completed ? i : { ...i, completed: true, completedAt: now },
              ),
            },
      ),
    },
  };

  persistUser(withAllComplete);

  // Write pending transactions for all items with accountRef
  for (const item of list.items) {
    if (!item.completed && item.accountRef) {
      _writePendingTransaction(item, target_itemRef(item));
    }
  }
}

/**
 * Delete a ShoppingList and all its items.
 *
 * @param listId  ShoppingList.id to remove
 * @param user    Current User
 */
export function deleteShoppingList(listId: string, user: User): void {
  const updated: User = {
    ...user,
    lists: {
      ...user.lists,
      shoppingLists: user.lists.shoppingLists.filter((l) => l.id !== listId),
    },
  };
  persistUser(updated);
}

// ── MANUAL GTD LIST (MVP11 W19) ───────────────────────────────────────────────

/**
 * Add a manual GTD item to User.lists.manualGtdList.
 *
 * @param fields  Item fields (title required; note, resourceRef, dueDate optional)
 * @param user    Current User
 * @returns The created GTDItem
 */
export function addManualGTDItem(
  fields: {
    title: string;
    note: string | null;
    templateRef?: string | null;
    taskType?: string;
    parameters?: Record<string, unknown>;
    resourceRef: string | null;
    dueDate: string | null;
  },
  user: User,
): GTDItem {
  const item: GTDItem = {
    id: uuidv4(),
    title: fields.title,
    note: fields.note,
    templateRef: fields.templateRef ?? null,
    taskType: fields.taskType ?? 'CHECK',
    parameters: fields.parameters ?? {},
    resourceRef: fields.resourceRef,
    dueDate: fields.dueDate,
    isManual: true,
    completionState: 'pending',
    completedAt: null,
  };
  const updated: User = {
    ...user,
    lists: {
      ...user.lists,
      manualGtdList: [...user.lists.manualGtdList, item],
    },
  };
  persistUser(updated);
  return item;
}

/**
 * Remove a manual GTD item from User.lists.manualGtdList.
 * Single-tap delete — no confirm needed (lightweight items).
 *
 * @param itemId  GTDItem.id to remove
 * @param user    Current User
 */
export function removeManualGTDItem(itemId: string, user: User): void {
  const updated: User = {
    ...user,
    lists: {
      ...user.lists,
      manualGtdList: user.lists.manualGtdList.filter((i) => i.id !== itemId),
    },
  };
  persistUser(updated);
}

/**
 * Complete a manual GTD item:
 *   - Removes it from manualGtdList
 *   - Creates a stub Task and writes it to today's QuickActionsEvent
 *   - Awards XP (+5 wisdom) and fires a ribbet
 *
 * @param itemId  GTDItem.id to complete
 * @param user    Current User
 */
export function completeManualGTDItem(
  itemId: string,
  user: User,
  resultFields: Partial<InputFields> = {},
): void {
  const latestUser = useUserStore.getState().user ?? user;
  const item = latestUser.lists.manualGtdList.find((i) => i.id === itemId);
  if (!item || item.completionState !== 'pending') return;

  const now = getAppNowISO();
  const today = todayISO();
  const qaId = `qa-${today}`;
  const scheduleStore = useScheduleStore.getState();

  // Ensure a QA event exists so manual GTD completions can use the same
  // execution path and context bonuses as Quick Actions tasks.
  const existingQa = scheduleStore.activeEvents[qaId] as QuickActionsEvent | undefined;
  if (!existingQa) {
    scheduleStore.setActiveEvent({
      id: qaId,
      eventType: 'quickActions',
      date: today,
      completions: [],
      xpAwarded: 0,
      sharedCompletions: null,
    });
  }

  const initialResultFields = {
    ...(item.parameters ?? {}),
    ...resultFields,
  } as Partial<InputFields>;

  const task: Task = {
    id: uuidv4(),
    templateRef: null,
    isUnique: true,
    title: item.title,
    taskType: item.taskType ?? 'CHECK',
    completionState: 'complete',
    completedAt: now,
    resultFields: initialResultFields,
    attachmentRef: null,
    resourceRef: item.resourceRef,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };

  scheduleStore.setTask(task);

  // Remove from manualGtdList
  const updated: User = {
    ...latestUser,
    lists: {
      ...latestUser.lists,
      manualGtdList: latestUser.lists.manualGtdList.filter((i) => i.id !== itemId),
    },
  };
  persistUser(updated);

  const completedTask = useScheduleStore.getState().tasks[task.id] ?? task;
  autoCompleteSystemTask('task-sys-complete-gtd');

  // Write to today's QuickActionsEvent — skip for system-seeded GTD items (D99)
  if (!item.skipQAWrite) {
    const qa = useScheduleStore.getState().activeEvents[qaId] as QuickActionsEvent | undefined;
    if (qa) {
      const updatedQa: QuickActionsEvent = {
        ...qa,
        completions: [
          ...qa.completions,
          { taskRef: completedTask.id, completedAt: completedTask.completedAt ?? now },
        ],
      };
      scheduleStore.setActiveEvent(updatedQa);
    }
  }

  // XP award — base + Quick Actions agility bonus for manual GTD completion
  awardXP(latestUser.system.id, 5, {
    isWisdomTask: true,
    statGroup: 'wisdom',
    source: `manual-gtd.complete:${itemId}`,
  });
  awardXP(latestUser.system.id, 2, {
    statGroup: 'agility',
    source: `manual-gtd.complete.quickActions:${itemId}`,
  });
  awardStat(latestUser.system.id, 'agility', 2, `manual-gtd.complete.quickActions:${itemId}`);
  awardStat(latestUser.system.id, 'wisdom', 5, `manual-gtd.complete:${itemId}`);

  // Achievement check
  const latestStoreUser = useUserStore.getState().user;
  if (latestStoreUser) {
    const newAchs = checkAchievements(latestStoreUser);
    let currentUser = latestStoreUser;
    for (const ach of newAchs) {
      currentUser = awardBadge(ach, currentUser);
    }
  }

  pushRibbet('gtd.complete');
}
