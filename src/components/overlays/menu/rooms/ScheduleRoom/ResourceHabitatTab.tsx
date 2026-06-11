// ─────────────────────────────────────────
// ResourceHabitatTab — habitat-style resource events list (Sprint 4, A3).
// Replaces the recurrence-filtered ResourceEventsTab: ALL resource tasks and
// dates are surfaced (the recurrence-only filter is lifted), rows render in
// the standard HabitatRow shell, and the expanded takeover carries the full
// HabitatRowExpanded action bar — Execute · Favorite · GTD · Configure —
// with Execute gated to task-backed rows.
//
// D97 still applies: nothing is stored — rows are derived from resource meta
// at render time. Template keys match resourceEngine's `resource-task:` key
// generation so favorites / last-completed lookups line up with GTD tasks.
// ─────────────────────────────────────────

import { useMemo, useState } from 'react';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useSystemStore } from '../../../../../stores/useSystemStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import type {
  AccountResource,
  ContactResource,
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
import type { InputFields, TaskTemplate } from '../../../../../types/taskTemplate';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../utils/inventoryItems';
import {
  buildResourceTaskTemplate,
  resolveRecurringTaskName,
} from '../../../../../utils/resourceTaskTemplates';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { HabitatRow } from '../../../../shared/habitat/HabitatRow';
import { HabitatRowExpanded } from '../../../../shared/habitat/HabitatRowExpanded';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ResourceEventRow {
  /** Row key; doubles as the `resource-task:` templateKey for actions. */
  key: string;
  resourceId: string;
  resourceType: ResourceType;
  resourceIcon: string;
  label: string;
  /** Task-backed rows get Execute; date rows (birthdays, insurance) do not. */
  taskBacked: boolean;
  template: TaskTemplate;
  reminderLeadDays?: number;
  lastCompleted?: string;
  /** Next occurrence — null when the task has no active recurrence. */
  date: string | null;
  daysAway: number | null;
}

interface EventGroup {
  header: string;
  rows: ResourceEventRow[];
}

interface LegacyRecurringContainerTask {
  id: string;
  name?: string;
  icon?: string;
  taskType?: string;
  inputFields?: Partial<InputFields>;
  recurrenceMode?: 'recurring' | 'never';
  recurrence: ResourceRecurrenceRule;
  reminderLeadDays?: number;
  lastCompleted?: string;
}

interface LegacyRecurringContainer {
  recurringTasks?: LegacyRecurringContainerTask[];
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

/** Date the reminder fires — `reminderLeadDays` before the occurrence date. */
function reminderFireDate(occurrenceDate: string, reminderLeadDays: number): string {
  const d = new Date(occurrenceDate.slice(0, 10) + 'T00:00:00');
  d.setDate(d.getDate() - reminderLeadDays);
  return d.toISOString().slice(0, 10);
}

function dayBadge(daysAway: number): string {
  return daysAway === 0 ? 'today' : `in ${daysAway}d`;
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
        const DOW_ORDER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
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

/** Dated rows soonest-first, then undated rows alphabetically. */
function sortRows(a: ResourceEventRow, b: ResourceEventRow): number {
  if (a.daysAway != null && b.daysAway != null) return a.daysAway - b.daysAway;
  if (a.daysAway != null) return -1;
  if (b.daysAway != null) return 1;
  return a.label.localeCompare(b.label);
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ResourceHabitatTabProps {
  onGoToResource?: (resourceId: string, resourceType: ResourceType) => void;
  onExpandedChange?: (id: string | null) => void;
}

export function ResourceHabitatTab({ onGoToResource, onExpandedChange }: ResourceHabitatTabProps) {
  const resources = useResourceStore((s) => s.resources);
  const user = useUserStore((s) => s.user);
  const tasks = useScheduleStore((s) => s.tasks) as Record<string, Task>;
  const setMenuResourceTarget = useSystemStore((s) => s.setMenuResourceTarget);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

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

  function setExpanded(key: string | null) {
    setExpandedKey(key);
    onExpandedChange?.(key);
  }

  function handleGoToResource(resourceId: string, resourceType: ResourceType) {
    setMenuResourceTarget(resourceId, resourceType);
    onGoToResource?.(resourceId, resourceType);
    setExpanded(null);
  }

  const groups = useMemo<EventGroup[]>(() => {
    const birthdays: ResourceEventRow[] = [];
    const contactRows: ResourceEventRow[] = [];
    const vehicleRows: ResourceEventRow[] = [];
    const accountRows: ResourceEventRow[] = [];
    const choreRows: ResourceEventRow[] = [];
    const homeItemRows: ResourceEventRow[] = [];
    const inventoryRows: ResourceEventRow[] = [];
    const bagRows: ResourceEventRow[] = [];

    const occurrenceOf = (task: { recurrenceMode?: 'recurring' | 'never'; recurrence: ResourceRecurrenceRule }) =>
      isRecurringTask(task) ? computeNextOccurrence(task.recurrence) : null;

    for (const resource of Object.values(resources)) {
      const rIcon = resource.icon;

      // ── Contacts: birthdays + contact tasks ─────────────────────────────────
      if (resource.type === 'contact') {
        const contact = resource as ContactResource;
        const bd = contact.birthday;
        if (bd) {
          const next = nextAnnualDate(bd);
          // No upper-bound cap for birthdays — show the full coming year
          if (next && next.days >= 0) {
            const key = `resource-task:${resource.id}:birthday`;
            birthdays.push({
              key,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${contact.displayName || contact.name}'s Birthday`,
              taskBacked: false,
              template: buildResourceTaskTemplate({
                templateKey: key,
                name: `${contact.displayName || contact.name}'s Birthday`,
                icon: rIcon,
              }),
              reminderLeadDays: contact.birthdayLeadDays,
              date: next.date,
              daysAway: next.days,
            });
          }
        }

        for (const task of contact.tasks ?? []) {
          const next = occurrenceOf(task);
          const key = `resource-task:${resource.id}:contact-task:${task.id}`;
          const label = `${contact.displayName || contact.name}: ${task.name}`;
          contactRows.push({
            key,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceIcon: task.icon || rIcon,
            label,
            taskBacked: true,
            template: buildResourceTaskTemplate({
              templateKey: key,
              name: label,
              icon: task.icon || rIcon,
              taskType: task.taskType,
            }),
            reminderLeadDays: task.reminderLeadDays,
            lastCompleted: (task as { lastCompleted?: string }).lastCompleted,
            date: next?.date ?? null,
            daysAway: next?.days ?? null,
          });
        }
      }

      // ── Vehicles: insurance, service, maintenance tasks ─────────────────────
      if (resource.type === 'vehicle') {
        const vehicle = resource as VehicleResource;

        if (vehicle.insuranceExpiry) {
          const d = daysUntilDate(vehicle.insuranceExpiry);
          if (d >= 0) {
            const key = `resource-task:${resource.id}:insurance`;
            vehicleRows.push({
              key,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${resource.name} Insurance`,
              taskBacked: false,
              template: buildResourceTaskTemplate({
                templateKey: key,
                name: `${resource.name} Insurance`,
                icon: rIcon,
              }),
              reminderLeadDays: vehicle.insuranceLeadDays,
              date: vehicle.insuranceExpiry.slice(0, 10),
              daysAway: d,
            });
          }
        }

        if (vehicle.serviceNextDate) {
          const d = daysUntilDate(vehicle.serviceNextDate);
          if (d >= 0) {
            const key = `resource-task:${resource.id}:service`;
            vehicleRows.push({
              key,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${resource.name} Service Due`,
              taskBacked: false,
              template: buildResourceTaskTemplate({
                templateKey: key,
                name: `${resource.name} Service Due`,
                icon: rIcon,
              }),
              reminderLeadDays: vehicle.serviceLeadDays,
              date: vehicle.serviceNextDate.slice(0, 10),
              daysAway: d,
            });
          }
        }

        for (const task of vehicle.maintenanceTasks ?? []) {
          const next = occurrenceOf(task);
          const key = `resource-task:${resource.id}:maintenance:${task.id}`;
          const label = `${resource.name}: ${task.name}`;
          vehicleRows.push({
            key,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceIcon: task.icon || rIcon,
            label,
            taskBacked: true,
            template: buildResourceTaskTemplate({
              templateKey: key,
              name: label,
              icon: task.icon || rIcon,
              taskType: task.taskType,
              inputFields: task.inputFields,
            }),
            reminderLeadDays: task.reminderLeadDays,
            date: next?.date ?? null,
            daysAway: next?.days ?? null,
          });
        }
      }

      // ── Accounts: due dates + account tasks ────────────────────────────────
      if (resource.type === 'account') {
        const account = resource as AccountResource;
        if (account.dueDate) {
          const d = daysUntilDate(account.dueDate);
          if (d >= 0) {
            const key = `resource-task:${resource.id}:payment-due`;
            accountRows.push({
              key,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: rIcon,
              label: `${resource.name} Payment Due`,
              taskBacked: false,
              template: buildResourceTaskTemplate({
                templateKey: key,
                name: `${resource.name} Payment Due`,
                icon: rIcon,
              }),
              reminderLeadDays: account.dueDateLeadDays,
              date: account.dueDate.slice(0, 10),
              daysAway: d,
            });
          }
        }
        for (const task of account.accountTasks ?? []) {
          if (task.kind === 'transaction-log') continue;
          const next = occurrenceOf(task);
          const key = `resource-task:${resource.id}:account-task:${task.id}`;
          const label = `${resource.name}: ${task.name}`;
          accountRows.push({
            key,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceIcon: task.icon || rIcon,
            label,
            taskBacked: true,
            template: buildResourceTaskTemplate({
              templateKey: key,
              name: label,
              icon: task.icon || rIcon,
              taskType: task.taskType,
              inputFields: task.inputFields,
            }),
            reminderLeadDays: task.reminderLeadDays,
            date: next?.date ?? null,
            daysAway: next?.days ?? null,
          });
        }
      }

      // ── Homes: chores + placed-item recurring tasks ─────────────────────────
      if (resource.type === 'home') {
        const home = resource as HomeResource;
        for (const chore of home.chores ?? []) {
          const next = occurrenceOf(chore);
          const key = `resource-task:${resource.id}:chore:${chore.id}`;
          const label = `${resource.name}: ${chore.name}`;
          choreRows.push({
            key,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceIcon: chore.icon || rIcon,
            label,
            taskBacked: true,
            template: buildResourceTaskTemplate({
              templateKey: key,
              name: label,
              icon: chore.icon || rIcon,
              taskType: chore.taskType,
              inputFields: chore.inputFields,
            }),
            reminderLeadDays: chore.reminderLeadDays,
            date: next?.date ?? null,
            daysAway: next?.days ?? null,
          });
        }

        for (const story of home.stories ?? []) {
          for (const room of story.rooms) {
            for (const placement of room.placedItems ?? []) {
              const itemName = resolveInventoryItemTemplate(placement.refId, itemTemplates)?.name ?? placement.refId;
              for (const task of placement.recurringTasks ?? []) {
                const next = occurrenceOf(task);
                const key = `resource-task:${resource.id}:home-placement:${placement.id}:${task.id}`;
                const taskName = resolveRecurringTaskName(task.taskTemplateRef, placement.refId, itemTemplates);
                const label = `${resource.name} - ${room.name}: ${itemName} - ${taskName}`;
                homeItemRows.push({
                  key,
                  resourceId: resource.id,
                  resourceType: resource.type,
                  resourceIcon: task.icon || rIcon,
                  label,
                  taskBacked: true,
                  template: buildResourceTaskTemplate({
                    templateKey: key,
                    name: label,
                    icon: task.icon || rIcon,
                    taskType: task.taskType,
                    inputFields: task.inputFields,
                  }),
                  reminderLeadDays: task.reminderLeadDays,
                  lastCompleted: task.lastCompleted,
                  date: next?.date ?? null,
                  daysAway: next?.days ?? null,
                });
              }
            }
          }
        }
      }

      // ── Inventory: item tasks, container tasks, bag carry tasks ─────────────
      if (resource.type === 'inventory') {
        const inventory = resource as InventoryResource;

        const itemSources = [
          ...inventory.items.map((item) => ({ item })),
          ...(inventory.containers ?? [])
            .filter((container) => container.kind !== 'bag')
            .flatMap((container) => container.items.map((item) => ({ item }))),
        ];

        const pushItemTaskRow = (item: { id: string; itemTemplateRef: string }, task: ItemRecurringTask) => {
          const next = occurrenceOf(task);
          const key = `resource-task:${resource.id}:inventory:${item.id}:${task.id}`;
          const itemName = resolveInventoryItemTemplate(item.itemTemplateRef, itemTemplates)?.name ?? item.itemTemplateRef;
          const taskName = resolveRecurringTaskName(task.taskTemplateRef, item.itemTemplateRef, itemTemplates);
          const label = `${resource.name}: ${itemName} - ${taskName}`;
          inventoryRows.push({
            key,
            resourceId: resource.id,
            resourceType: resource.type,
            resourceIcon: task.icon || rIcon,
            label,
            taskBacked: true,
            template: buildResourceTaskTemplate({
              templateKey: key,
              name: label,
              icon: task.icon || rIcon,
              taskType: task.taskType,
              inputFields: task.inputFields,
            }),
            reminderLeadDays: task.reminderLeadDays,
            lastCompleted: task.lastCompleted,
            date: next?.date ?? null,
            daysAway: next?.days ?? null,
          });
        };

        for (const { item } of itemSources) {
          for (const task of item.recurringTasks ?? []) {
            pushItemTaskRow(item, task);
          }
        }

        for (const container of inventory.containers ?? []) {
          if (container.kind === 'bag') {
            const carryTask = container.carryTask;
            if (!carryTask) continue;
            const next = isRecurringTask(carryTask) ? computeNextOccurrence(carryTask.recurrence) : null;
            const key = `resource-task:${resource.id}:inventory-container:${container.id}:carry-task:${carryTask.id}`;
            const label = `${resource.name}: ${container.name} - ${carryTask.name || 'Carry Task'}`;
            bagRows.push({
              key,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: container.icon || rIcon,
              label,
              taskBacked: true,
              template: buildResourceTaskTemplate({
                templateKey: key,
                name: label,
                icon: container.icon || rIcon,
                taskType: carryTask.taskType,
              }),
              reminderLeadDays: carryTask.reminderLeadDays,
              date: next?.date ?? null,
              daysAway: next?.days ?? null,
            });
            continue;
          }

          for (const task of (container as LegacyRecurringContainer).recurringTasks ?? []) {
            const next = occurrenceOf(task);
            const key = `resource-task:${resource.id}:inventory-container:${container.id}:${task.id}`;
            const label = `${resource.name}: ${container.name} - ${task.name || 'Task'}`;
            inventoryRows.push({
              key,
              resourceId: resource.id,
              resourceType: resource.type,
              resourceIcon: task.icon || container.icon || rIcon,
              label,
              taskBacked: true,
              template: buildResourceTaskTemplate({
                templateKey: key,
                name: label,
                icon: task.icon || container.icon || rIcon,
                taskType: task.taskType,
                inputFields: task.inputFields,
              }),
              reminderLeadDays: task.reminderLeadDays,
              lastCompleted: task.lastCompleted,
              date: next?.date ?? null,
              daysAway: next?.days ?? null,
            });
          }
        }
      }
    }

    birthdays.sort(sortRows);
    contactRows.sort(sortRows);
    vehicleRows.sort(sortRows);
    accountRows.sort(sortRows);
    choreRows.sort(sortRows);
    homeItemRows.sort(sortRows);
    inventoryRows.sort(sortRows);
    bagRows.sort(sortRows);

    return [
      { header: '🎂 Birthdays', rows: birthdays },
      { header: '👥 Contacts', rows: contactRows },
      { header: '🚗 Vehicles', rows: vehicleRows },
      { header: '💳 Accounts', rows: accountRows },
      { header: '🏠 Home Chores', rows: choreRows },
      { header: '🪑 Home Items', rows: homeItemRows },
      { header: '📦 Inventory', rows: inventoryRows },
      { header: '👜 Bags', rows: bagRows },
    ].filter((g) => g.rows.length > 0);
  }, [itemTemplates, resources]);

  if (groups.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-10">
        No resource events yet.
      </p>
    );
  }

  const renderRow = (row: ResourceEventRow, soloExpanded: boolean) => {
    const hasGtd = gtdResourceIds.has(row.resourceId);
    const isExpanded = expandedKey === row.key;
    const urgency =
      row.daysAway == null ? 'text-gray-400 dark:text-gray-500' :
      row.daysAway === 0 ? 'text-red-500' :
      row.daysAway <= 7 ? 'text-amber-500' :
      'text-gray-400 dark:text-gray-500';

    const summary = row.date
      ? formatShortDate(row.date)
      : 'No recurrence';

    const fireDate =
      row.date && typeof row.reminderLeadDays === 'number' && row.reminderLeadDays >= 0
        ? reminderFireDate(row.date, row.reminderLeadDays)
        : null;

    return (
      <HabitatRow
        key={row.key}
        expanded={isExpanded}
        soloExpanded={soloExpanded}
        onToggleExpand={() => setExpanded(isExpanded ? null : row.key)}
        icon={<IconDisplay iconKey={row.resourceIcon} size={20} className="h-5 w-5 object-contain" alt="" />}
        name={row.label}
        summary={summary}
        pill={
          row.daysAway != null ? (
            <span className={`inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium dark:bg-gray-700 ${urgency}`}>
              {dayBadge(row.daysAway)}
            </span>
          ) : null
        }
      >
        {isExpanded && (
          <HabitatRowExpanded
            templateKey={row.key}
            template={row.template}
            showExecute={row.taskBacked}
            onCollapse={() => setExpanded(null)}
            onConfigure={() => handleGoToResource(row.resourceId, row.resourceType)}
          >
            <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
              {row.date ? (
                <p>
                  Next occurrence: {formatShortDate(row.date)}
                  {row.daysAway != null ? ` (${dayBadge(row.daysAway)})` : ''}
                </p>
              ) : (
                <p>No upcoming occurrence — recurrence is off.</p>
              )}
              <p>{reminderLabel(row.reminderLeadDays)}</p>
              {fireDate && (
                <p>Reminder fires: {formatShortDate(fireDate)}</p>
              )}
              <p>
                {row.lastCompleted
                  ? `Last completed: ${formatLastCompleted(row.lastCompleted)}`
                  : 'Last completed: Never completed.'}
              </p>
              {hasGtd && <p className="text-green-600 dark:text-green-400">GTD task queued.</p>}
            </div>
          </HabitatRowExpanded>
        )}
      </HabitatRow>
    );
  };

  // Solo-expand: when a row is expanded, the list filters to that row
  // (pattern owned by the list container, as in ScheduleRoomBody).
  if (expandedKey) {
    const expandedRow = groups.flatMap((g) => g.rows).find((row) => row.key === expandedKey);
    if (expandedRow) {
      return (
        <div className="flex-1 overflow-hidden px-4 py-3">
          {renderRow(expandedRow, true)}
        </div>
      );
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
      {groups.map((group) => (
        <div key={group.header}>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            {group.header}
          </h3>
          <div className="space-y-1">
            {group.rows.map((row) => renderRow(row, false))}
          </div>
        </div>
      ))}
    </div>
  );
}
