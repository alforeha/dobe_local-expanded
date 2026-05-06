// ─────────────────────────────────────────
// ResourceEventsTab — virtual resource events computed at render time. K.
// D97: no PlannedEvents stored — events are derived from resource meta.
// Grouped by type, sorted by date (soonest first) within each group.
// ─────────────────────────────────────────

import { useMemo, useState } from 'react';
import { taskTemplateLibrary } from '../../../../../coach';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../../../../../coach/ItemLibrary';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useSystemStore } from '../../../../../stores/useSystemStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import type {
  AccountResource,
  ContactResource,
  DocResource,
  HomeResource,
  InventoryResource,
  ItemRecurringTask,
  VehicleResource,
  ResourceRecurrenceRule,
  RecurrenceDayOfWeek,
  ResourceType,
} from '../../../../../types/resource';
import { normalizeRecurrenceMode } from '../../../../../types/resource';
import type { Task } from '../../../../../types/task';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../utils/inventoryItems';
import { IconDisplay } from '../../../../shared/IconDisplay';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ResourceEvent {
  key: string;
  resourceId: string;
  resourceType: ResourceType;
  resourceIcon: string;
  label: string;
  reminderLeadDays?: number;
  lastCompleted?: string;
  date: string;     // YYYY-MM-DD
  daysAway: number; // 0 = today
}

interface EventGroup {
  header: string;
  events: ResourceEvent[];
}

interface LegacyContactTask {
  id: string;
  name: string;
  icon?: string;
  recurrenceMode?: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  reminderLeadDays?: number;
  lastCompleted?: string;
}

interface LegacyContractTask {
  id: string;
  title?: string;
  name?: string;
  icon?: string;
  recurrenceMode?: 'recurring' | 'never';
  recurrence?: ResourceRecurrenceRule;
  reminderLeadDays?: number;
  lastCompleted?: string;
}

interface LegacyRecurringContainer {
  recurringTasks?: Array<ItemRecurringTask & { name?: string; icon?: string }>;
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function todayMidnight(): Date {
  return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
}

function daysUntilDate(isoDate: string): number {
  const today = todayMidnight();
  const target = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatLastCompleted(isoDate: string): string {
  const completedDate = isoDate.slice(0, 10);
  const daysAgo = Math.max(0, -daysUntilDate(completedDate));
  return `${formatShortDate(completedDate)} (${daysAgo} day${daysAgo === 1 ? '' : 's'} ago)`;
}

function reminderLabel(reminderLeadDays?: number): string {
  if (typeof reminderLeadDays !== 'number' || reminderLeadDays < 0) {
    return 'No reminder set.';
  }
  if (reminderLeadDays === 0) {
    return 'Reminder: Day of';
  }
  return `Reminder: ${reminderLeadDays} day${reminderLeadDays === 1 ? '' : 's'} before`;
}

function dayBadge(daysAway: number): string {
  return daysAway === 0 ? 'today' : `${daysAway}d`;
}

function resolveRecurringTaskName(taskTemplateRef: string, itemTemplateRef: string, itemTemplates: ReturnType<typeof mergeInventoryItemTemplates>): string {
  if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
    const itemTemplate = itemTemplates.find((entry) => entry.id === itemTemplateRef);
    const customTask = itemTemplate?.customTaskTemplates?.find((entry) => entry.name.trim() === taskTemplateRef);
    if (customTask) {
      return customTask.name;
    }
  }

  const coachTask = taskTemplateLibrary.find((entry) => entry.id === taskTemplateRef);
  if (coachTask) {
    return coachTask.name;
  }

  const itemTaskMeta = getItemTaskTemplateMeta(taskTemplateRef);
  if (itemTaskMeta) {
    return itemTaskMeta.name;
  }

  return taskTemplateRef;
}

function isRecurringTask(task: { recurrenceMode?: 'recurring' | 'never' }): boolean {
  return normalizeRecurrenceMode(task.recurrenceMode) !== 'never';
}

/** Next annual occurrence of a birthday stored as YYYY-MM-DD.
 *  Uses strictly-past comparison so a birthday TODAY shows as daysAway=0.
 *  No upper-bound cap — show all upcoming birthdays within the next year. */
function nextAnnualDate(birthday: string): { date: string; days: number } | null {
  const parts = birthday.slice(0, 10).split('-');
  if (parts.length < 3) return null;
  const today = todayMidnight();
  const yr = today.getFullYear();
  let next = new Date(`${yr}-${parts[1]}-${parts[2]}T00:00:00`);
  // Advance to next year only if the date has already *passed* (strictly < today)
  if (next < today) next = new Date(`${yr + 1}-${parts[1]}-${parts[2]}T00:00:00`);
  const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
  return { date: next.toISOString().slice(0, 10), days };
}

/** Next occurrence of a RecurrenceRule. */
function computeNextOccurrence(rule: ResourceRecurrenceRule): { date: string; days: number } {
  const today = todayMidnight();
  const seed = new Date(rule.seedDate + 'T00:00:00');

  if (seed >= today) {
    const days = Math.round((seed.getTime() - today.getTime()) / 86_400_000);
    return { date: rule.seedDate, days };
  }

  const interval = Math.max(1, rule.interval);

  switch (rule.frequency) {
    case 'daily': {
      const periodMs = interval * 86_400_000;
      const elapsed = Math.floor((today.getTime() - seed.getTime()) / periodMs);
      const next = new Date(seed.getTime() + (elapsed + 1) * periodMs);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    case 'weekly': {
      if (rule.days.length > 0) {
        const DOW_ORDER = ['sun','mon','tue','wed','thu','fri','sat'];
        const todayDow = today.getDay();
        const diffs = rule.days
          .map((d: RecurrenceDayOfWeek) => DOW_ORDER.indexOf(d))
          .filter((i: number) => i >= 0)
          .map((dow: number) => (dow - todayDow + 7) % 7);
        if (diffs.length > 0) {
          const minDiff = Math.min(...diffs);
          const next = new Date(today);
          next.setDate(next.getDate() + minDiff);
          return { date: next.toISOString().slice(0, 10), days: minDiff };
        }
      }
      const periodMs = interval * 7 * 86_400_000;
      const elapsed = Math.floor((today.getTime() - seed.getTime()) / periodMs);
      const next = new Date(seed.getTime() + (elapsed + 1) * periodMs);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    case 'monthly': {
      const seedDay = seed.getDate();
      const next = new Date(today);
      next.setDate(seedDay);
      if (next < today) next.setMonth(next.getMonth() + interval);
      next.setDate(seedDay);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    case 'yearly': {
      const next = new Date(seed);
      while (next < today) next.setFullYear(next.getFullYear() + interval);
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      return { date: next.toISOString().slice(0, 10), days };
    }
    default:
      return { date: today.toISOString().slice(0, 10), days: 0 };
  }
}

const sortByDays = (a: ResourceEvent, b: ResourceEvent) => a.daysAway - b.daysAway;

// ── Component ──────────────────────────────────────────────────────────────────

interface ResourceEventsTabProps {
  onGoToResource?: (resourceId: string, resourceType: ResourceType) => void;
}

export function ResourceEventsTab({ onGoToResource }: ResourceEventsTabProps) {
  const resources = useResourceStore((s) => s.resources);
  const user      = useUserStore((s) => s.user);
  const tasks     = useScheduleStore((s) => s.tasks) as Record<string, Task>;
  const setMenuResourceTarget = useSystemStore((s) => s.setMenuResourceTarget);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const itemTemplates = useMemo(() => {
    const resourceTemplates = Object.values(resources)
      .filter((resource): resource is InventoryResource => resource.type === 'inventory')
      .map((resource) => resource.itemTemplates);

    return mergeInventoryItemTemplates(getUserInventoryItemTemplates(user), ...resourceTemplates);
  }, [resources, user]);

  // Resource IDs that have any pending GTD task queued
  const gtdResourceIds = useMemo(() => {
    const gtdTaskIds = new Set(user?.lists.gtdList ?? []);
    const ids = new Set<string>();
    for (const t of Object.values(tasks)) {
      if (t.completionState === 'pending' && t.resourceRef && gtdTaskIds.has(t.id)) {
        ids.add(t.resourceRef);
      }
    }
    return ids;
  }, [user, tasks]);

  function handleGoToResource(resourceId: string, resourceType: ResourceType) {
    setMenuResourceTarget(resourceId, resourceType);
    onGoToResource?.(resourceId, resourceType);
    setExpandedId(null);
  }

  const groups = useMemo<EventGroup[]>(() => {
    const birthdays:     ResourceEvent[] = [];
    const contactEvents: ResourceEvent[] = [];
    const vehicleEvents: ResourceEvent[] = [];
    const accountEvents: ResourceEvent[] = [];
    const docEvents:     ResourceEvent[] = [];
    const choreEvents:   ResourceEvent[] = [];
    const homeItemEvents: ResourceEvent[] = [];
    const inventoryEvents: ResourceEvent[] = [];
    const bagEvents: ResourceEvent[] = [];
    const contractEvents: ResourceEvent[] = [];

    for (const resource of Object.values(resources)) {
      const rIcon = resource.icon;

      // ── Contacts: birthdays ─────────────────────────────────────────────────
      if (resource.type === 'contact') {
        const contact = resource as ContactResource;
        const bd = contact.birthday;
        if (bd) {
          const next = nextAnnualDate(bd);
          // No upper-bound cap for birthdays — show the full coming year
          if (next && next.days >= 0) {
            birthdays.push({
              key: `birthday-${resource.id}`,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${resource.name}'s Birthday`,
              reminderLeadDays: contact.birthdayLeadDays,
              date: next.date,
              daysAway: next.days,
            });
          }
        }

        const contactTasks = (contact as ContactResource & { tasks?: LegacyContactTask[] }).tasks ?? [];
        for (const task of contactTasks) {
          if (!isRecurringTask(task)) continue;
          const next = computeNextOccurrence(task.recurrence);
          contactEvents.push({
            key: `contact-task-${resource.id}-${task.id}`,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceIcon: task.icon || rIcon,
            label: `${contact.displayName || contact.name}: ${task.name}`,
            reminderLeadDays: task.reminderLeadDays,
            lastCompleted: task.lastCompleted,
            date: next.date,
            daysAway: next.days,
          });
        }
      }

      // ── Vehicles: insurance, service, maintenance tasks ─────────────────────
      if (resource.type === 'vehicle') {
        const vehicle = resource as VehicleResource;

        if (vehicle.insuranceExpiry) {
          const d = daysUntilDate(vehicle.insuranceExpiry);
          if (d >= 0) {
            vehicleEvents.push({
              key: `veh-ins-${resource.id}`,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${resource.name} Insurance`,
              reminderLeadDays: vehicle.insuranceLeadDays,
              date: vehicle.insuranceExpiry.slice(0, 10),
              daysAway: d,
            });
          }
        }

        if (vehicle.serviceNextDate) {
          const d = daysUntilDate(vehicle.serviceNextDate);
          if (d >= 0) {
            vehicleEvents.push({
              key: `veh-svc-${resource.id}`,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${resource.name} Service Due`,
              reminderLeadDays: vehicle.serviceLeadDays,
              date: vehicle.serviceNextDate.slice(0, 10),
              daysAway: d,
            });
          }
        }

        for (const task of vehicle.maintenanceTasks ?? []) {
          if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') continue;
          const next = computeNextOccurrence(task.recurrence);
          vehicleEvents.push({
            key: `veh-task-${resource.id}-${task.id}`,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceIcon: task.icon || rIcon,
            label: `${resource.name}: ${task.name}`,
            reminderLeadDays: task.reminderLeadDays,
            date: next.date,
            daysAway: next.days,
          });
        }
      }

      // ── Accounts: due dates + account tasks ────────────────────────────────
      if (resource.type === 'account') {
        const account = resource as AccountResource;
        if (account.dueDate) {
          const d = daysUntilDate(account.dueDate);
          if (d >= 0) {
            accountEvents.push({
              key: `acct-due-${resource.id}`,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${resource.name} Payment Due`,
              reminderLeadDays: account.dueDateLeadDays,
              date: account.dueDate.slice(0, 10),
              daysAway: d,
            });
          }
        }
        for (const task of account.accountTasks ?? []) {
          if (task.kind === 'transaction-log') continue;
          if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') continue;
          const next = computeNextOccurrence(task.recurrence);
          accountEvents.push({
            key: `acct-task-${resource.id}-${task.id}`,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceIcon: task.icon || rIcon,
            label: `${resource.name}: ${task.name}`,
            reminderLeadDays: task.reminderLeadDays,
            date: next.date,
            daysAway: next.days,
          });
        }
      }

      // ── Docs: expiry dates ──────────────────────────────────────────────────
      if (resource.type === 'doc') {
        const doc = resource as DocResource;
        if (doc.expiryDate) {
          const d = daysUntilDate(doc.expiryDate);
          if (d >= 0) {
            docEvents.push({
              key: `doc-exp-${resource.id}`,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${resource.name} Expires`,
              reminderLeadDays: doc.expiryLeadDays,
              date: doc.expiryDate.slice(0, 10),
              daysAway: d,
            });
          }
        }

        if (doc.docType === 'contract') {
          const contractTasks = (doc.contractTasks ?? []) as LegacyContractTask[];
          for (const task of contractTasks) {
            if (!task.recurrence || !isRecurringTask(task)) continue;
            const next = computeNextOccurrence(task.recurrence);
            const taskName = task.title || task.name || 'Contract task';
            contractEvents.push({
              key: `doc-contract-${resource.id}-${task.id}`,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: task.icon || rIcon,
              label: `${resource.name}: ${taskName}`,
              reminderLeadDays: task.reminderLeadDays,
              lastCompleted: task.lastCompleted,
              date: next.date,
              daysAway: next.days,
            });
          }
        }
      }

      // ── Homes: chores ───────────────────────────────────────────────────────
      if (resource.type === 'home') {
        const home = resource as HomeResource;
        for (const chore of home.chores ?? []) {
          if (normalizeRecurrenceMode(chore.recurrenceMode) === 'never') continue;
          const next = computeNextOccurrence(chore.recurrence);
          choreEvents.push({
            key: `chore-${resource.id}-${chore.id}`,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceIcon: chore.icon || rIcon,
            label: `${resource.name}: ${chore.name}`,
            reminderLeadDays: chore.reminderLeadDays,
            date: next.date,
            daysAway: next.days,
          });
        }

        for (const story of home.stories ?? []) {
          for (const room of story.rooms) {
            for (const placement of room.placedItems ?? []) {
              const itemName = resolveInventoryItemTemplate(placement.refId, itemTemplates)?.name ?? placement.refId;
              for (const task of placement.recurringTasks ?? []) {
                if (!isRecurringTask(task)) continue;
                const next = computeNextOccurrence(task.recurrence);
                const taskName = resolveRecurringTaskName(task.taskTemplateRef, placement.refId, itemTemplates);
                homeItemEvents.push({
                  key: `home-placement-${resource.id}-${room.id}-${placement.id}-${task.id}`,
                  resourceId: resource.id,
                  resourceType: resource.type,
                  resourceIcon: rIcon,
                  label: `${resource.name} - ${room.name}: ${itemName} - ${taskName}`,
                  reminderLeadDays: task.reminderLeadDays,
                  lastCompleted: task.lastCompleted,
                  date: next.date,
                  daysAway: next.days,
                });
              }
            }
          }
        }
      }

      if (resource.type === 'inventory') {
        const inventory = resource as InventoryResource;

        const itemSources = [
          ...inventory.items.map((item) => ({ item, containerName: null as string | null })),
          ...(inventory.containers ?? [])
            .filter((container) => container.kind !== 'bag')
            .flatMap((container) => container.items.map((item) => ({ item, containerName: container.name }))),
        ];

        for (const { item } of itemSources) {
          const itemName = resolveInventoryItemTemplate(item.itemTemplateRef, itemTemplates)?.name ?? item.itemTemplateRef;
          for (const task of item.recurringTasks ?? []) {
            if (!isRecurringTask(task)) continue;
            const next = computeNextOccurrence(task.recurrence);
            const taskName = resolveRecurringTaskName(task.taskTemplateRef, item.itemTemplateRef, itemTemplates);
            inventoryEvents.push({
              key: `inventory-item-${resource.id}-${item.id}-${task.id}`,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${resource.name}: ${itemName} - ${taskName}`,
              reminderLeadDays: task.reminderLeadDays,
              lastCompleted: task.lastCompleted,
              date: next.date,
              daysAway: next.days,
            });
          }
        }

        for (const container of inventory.containers ?? []) {
          if (container.kind === 'bag') {
            if (!container.carryTask || !isRecurringTask(container.carryTask)) continue;
            const next = computeNextOccurrence(container.carryTask.recurrence);
            bagEvents.push({
              key: `inventory-bag-${resource.id}-${container.id}-${container.carryTask.id}`,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: container.icon || rIcon,
              label: `${resource.name}: ${container.name} - Carry Task`,
              reminderLeadDays: container.carryTask.reminderLeadDays,
              date: next.date,
              daysAway: next.days,
            });
            continue;
          }

          for (const task of (container as LegacyRecurringContainer).recurringTasks ?? []) {
            if (!isRecurringTask(task)) continue;
            const next = computeNextOccurrence(task.recurrence);
            inventoryEvents.push({
              key: `inventory-container-${resource.id}-${container.id}-${task.id}`,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: task.icon || container.icon || rIcon,
              label: `${resource.name}: ${container.name} - ${task.name || 'Task'}`,
              reminderLeadDays: task.reminderLeadDays,
              lastCompleted: task.lastCompleted,
              date: next.date,
              daysAway: next.days,
            });
          }
        }
      }
    }

    birthdays.sort(sortByDays);
    contactEvents.sort(sortByDays);
    vehicleEvents.sort(sortByDays);
    accountEvents.sort(sortByDays);
    docEvents.sort(sortByDays);
    choreEvents.sort(sortByDays);
    homeItemEvents.sort(sortByDays);
    inventoryEvents.sort(sortByDays);
    bagEvents.sort(sortByDays);
    contractEvents.sort(sortByDays);

    return [
      { header: '🎂 Birthdays',   events: birthdays     },
      { header: '👥 Contacts',    events: contactEvents },
      { header: '🚗 Vehicles',    events: vehicleEvents  },
      { header: '💳 Accounts',    events: accountEvents  },
      { header: '📄 Docs',        events: docEvents      },
      { header: '🏠 Home Chores', events: choreEvents    },
      { header: '🪑 Home Items',  events: homeItemEvents },
      { header: '📦 Inventory',   events: inventoryEvents },
      { header: '👜 Bags',        events: bagEvents },
      { header: '📑 Contracts',   events: contractEvents },
    ].filter((g) => g.events.length > 0);
  }, [itemTemplates, resources]);

  if (groups.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-10">
        No upcoming resource events.
      </p>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {groups.map((group) => (
        <div key={group.header}>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            {group.header}
          </h3>
          <div className="space-y-1">
            {group.events.map((ev) => {
              const hasGtd = gtdResourceIds.has(ev.resourceId);
              const isExpanded = expandedId === ev.key;
              const urgency =
                ev.daysAway === 0 ? 'text-red-500' :
                ev.daysAway <= 7  ? 'text-amber-500' :
                'text-gray-400 dark:text-gray-500';

              return (
                <div
                  key={ev.key}
                  className="overflow-hidden rounded-lg border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : ev.key)}
                    className="w-full px-3 py-2 text-left"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <IconDisplay iconKey={ev.resourceIcon} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
                        {ev.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-6">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatShortDate(ev.date)}
                      </span>
                      <span className={`inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium dark:bg-gray-700 ${urgency}`}>
                        {dayBadge(ev.daysAway)}
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
                      <p>{reminderLabel(ev.reminderLeadDays)}</p>
                      <p className="mt-1">
                        {ev.lastCompleted ? `Last completed: ${formatLastCompleted(ev.lastCompleted)}` : 'Last completed: Never completed.'}
                      </p>
                      {hasGtd && <p className="mt-1 text-green-600 dark:text-green-400">GTD task queued.</p>}
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => handleGoToResource(ev.resourceId, ev.resourceType)}
                          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Jump to Resource
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
