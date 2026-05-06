// ─────────────────────────────────────────
// ResourceTasksTab — task definitions derived from resource meta.
// Computed at render time (no scheduleStore reads for tasks). L.
// Groups: Homes (chores), Vehicles (maintenance), Accounts (account tasks), Inventory (item tasks).
// ─────────────────────────────────────────

import { useMemo, useState } from 'react';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { useScheduleStore } from '../../../../../stores/useScheduleStore';
import { useSystemStore } from '../../../../../stores/useSystemStore';
import type {
  AccountResource,
  HomeResource,
  InventoryResource,
  InventoryItemTemplate,
  VehicleResource,
  ResourceRecurrenceRule,
  RecurrenceDayOfWeek,
  ResourceType,
} from '../../../../../types/resource';
import { isInventory, normalizeRecurrenceMode } from '../../../../../types/resource';
import type { QuickActionsEvent, QuickActionsCompletion } from '../../../../../types';
import type { TaskType } from '../../../../../types/taskTemplate';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { getTaskTypeIconKey } from '../../../../../constants/iconMap';
import { taskTemplateLibrary } from '../../../../../coach';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../../../../../coach/ItemLibrary';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates, resolveInventoryItemTemplate } from '../../../../../utils/inventoryItems';
import { getAppDate, getAppNowISO, localISODate } from '../../../../../utils/dateUtils';

// ── Recurrence label helper ────────────────────────────────────────────────────

function recurrenceLabel(rule: ResourceRecurrenceRule): string {
  const freq =
    rule.frequency === 'daily'   ? 'day' :
    rule.frequency === 'weekly'  ? 'week' :
    rule.frequency === 'monthly' ? 'month' :
    'year';

  const intervalPart = rule.interval === 1 ? `Every ${freq}` : `Every ${rule.interval} ${freq}s`;

  if (rule.frequency === 'weekly' && rule.days.length > 0) {
    const DOW: Record<string, string> = {
      sun: 'Su', mon: 'Mo', tue: 'Tu', wed: 'We',
      thu: 'Th', fri: 'Fr', sat: 'Sa',
    };
    const dayStr = rule.days.map((d: RecurrenceDayOfWeek) => DOW[d] ?? d).join(' ');
    return `${intervalPart} · ${dayStr}`;
  }

  return intervalPart;
}

const FULL_DAY_NAMES: Record<RecurrenceDayOfWeek, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function parseISODate(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00`);
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
  for (let offset = 1; offset <= 366 * 5; offset++) {
    const candidate = new Date(start);
    candidate.setDate(candidate.getDate() + offset);
    const candidateISO = localISODate(candidate);
    if (isRecurrenceOnDate(rule, candidateISO)) {
      return { date: candidateISO, days: offset };
    }
  }

  return { date: referenceDate, days: 0 };
}

function formatScheduleSummary(isIntermittent: boolean, rule: ResourceRecurrenceRule): string {
  if (isIntermittent) return 'On demand';

  switch (rule.frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    default:
      return 'Available';
  }
}

function formatDetailedRecurrence(rule: ResourceRecurrenceRule): string {
  const interval = Math.max(1, rule.interval || 1);

  switch (rule.frequency) {
    case 'daily':
      return interval === 1 ? 'Every day' : `Every ${interval} days`;
    case 'weekly': {
      const days = (rule.days.length > 0 ? rule.days : [(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[parseISODate(rule.seedDate).getDay()]])
        .map((day) => FULL_DAY_NAMES[day])
        .join(', ');
      if (interval === 1) return `Every ${days}`;
      return `Every ${interval} weeks on ${days}`;
    }
    case 'monthly': {
      const day = rule.monthlyDay ?? parseISODate(rule.seedDate).getDate();
      return interval === 1 ? `Every month on day ${day}` : `Every ${interval} months on day ${day}`;
    }
    case 'yearly': {
      const seed = parseISODate(rule.seedDate);
      const monthDay = MONTH_DAY_FORMATTER.format(seed);
      return interval === 1 ? `Every year on ${monthDay}` : `Every ${interval} years on ${monthDay}`;
    }
    default:
      return recurrenceLabel(rule);
  }
}

function formatMonthDay(isoDate: string): string {
  return MONTH_DAY_FORMATTER.format(parseISODate(isoDate));
}

function formatNextDate(nextOccurrence: { date: string; days: number } | null): string {
  if (!nextOccurrence) return 'Available';
  const unit = nextOccurrence.days === 1 ? 'day' : 'days';
  return `${formatMonthDay(nextOccurrence.date)} (${nextOccurrence.days} ${unit})`;
}

function formatLastCompleted(lastCompleted: string | null, referenceDate: string): string {
  if (!lastCompleted) return 'Never';
  const daysAgo = Math.max(0, Math.round((parseISODate(referenceDate).getTime() - parseISODate(lastCompleted).getTime()) / 86_400_000));
  const unit = daysAgo === 1 ? 'day' : 'days';
  return `${formatMonthDay(lastCompleted)} (${daysAgo} ${unit} ago)`;
}

function formatReminder(reminderLeadDays: number | null): string {
  if (reminderLeadDays == null || reminderLeadDays < 0) return 'Not set';
  if (reminderLeadDays === 0) return 'Day of';
  return `${reminderLeadDays} days before`;
}

function resolveTaskIcon(iconKey: string | null | undefined, taskType: string | null | undefined, fallbackIcon: string): string {
  if (iconKey) return iconKey;
  if (taskType) return getTaskTypeIconKey(taskType as TaskType);
  return fallbackIcon;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function resolveItemTaskDisplay(
  taskTemplateRef: string,
  itemTemplateRef: string,
  templates: InventoryItemTemplate[],
): { name: string; icon: string } {
  if (itemTemplateRef.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
    const tpl = templates.find((t) => t.id === itemTemplateRef);
    const ct = tpl?.customTaskTemplates?.find((c) => c.name.trim() === taskTemplateRef);
    if (ct) return { name: ct.name, icon: ct.icon || 'task' };
  }
  const coachTask = taskTemplateLibrary.find((t) => t.id === taskTemplateRef);
  if (coachTask) return { name: coachTask.name, icon: coachTask.icon || 'task' };
  const itemTaskMeta = getItemTaskTemplateMeta(taskTemplateRef);
  if (itemTaskMeta) return { name: itemTaskMeta.name, icon: itemTaskMeta.icon || 'task' };
  return { name: taskTemplateRef, icon: 'task' };
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface RowData {
  rowKey: string;
  iconKey: string;
  name: string;
  scheduleSummary: string;
  scheduleDetail: string;
  detail?: string;
  reminderLeadDays: number | null;
  lastCompleted: string | null;
  nextOccurrence: { date: string; days: number } | null;
  resourceId: string;
  resourceType: ResourceType;
  homeGrouping?:
    | { kind: 'chore' }
    | {
        kind: 'placed-item';
        roomId: string;
        roomName: string;
        roomIcon: string;
        itemId: string;
        itemName: string;
        itemIcon: string;
      };
}

type FilterType = 'all' | 'home' | 'vehicle' | 'account' | 'inventory';

interface Section {
  resourceId: string;
  resourceIcon: string;
  resourceName: string;
  filterType: FilterType;
  rows: RowData[];
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface ResourceTasksTabProps {
  onGoToResource?: (resourceId: string, resourceType: ResourceType) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ResourceTasksTab({ onGoToResource }: ResourceTasksTabProps) {
  const resources = useResourceStore((s) => s.resources);
  const user = useUserStore((s) => s.user);
  const activeEvents = useScheduleStore((s) => s.activeEvents);
  const setActiveEvent = useScheduleStore((s) => s.setActiveEvent);
  const setMenuResourceTarget = useSystemStore((s) => s.setMenuResourceTarget);

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [executingKey, setExecutingKey] = useState<string | null>(null);
  const [executeNote, setExecuteNote] = useState('');
  const referenceDate = getAppDate();

  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];
    const userInventoryTemplates = getUserInventoryItemTemplates(user);

    for (const resource of Object.values(resources)) {
      const rows: RowData[] = [];
      const rIcon = resource.icon;
      const rId = resource.id;
      const rType = resource.type as ResourceType;

      if (resource.type === 'home') {
        const home = resource as HomeResource;
        for (const [i, chore] of (home.chores ?? []).entries()) {
          const isIntermittent = normalizeRecurrenceMode(chore.recurrenceMode) === 'never';
          const nextOccurrence = isIntermittent ? null : computeNextOccurrence(chore.recurrence, referenceDate);
          const detail = isIntermittent ? undefined :
            chore.assignedTo && chore.assignedTo !== 'all' ? 'assigned' :
            chore.assignedTo === 'all' ? 'all members' : undefined;
          rows.push({
            rowKey: `${rId}-chore-${i}`,
            iconKey: resolveTaskIcon(chore.icon, chore.taskType, rIcon),
            name: chore.name,
            scheduleSummary: formatScheduleSummary(isIntermittent, chore.recurrence),
            scheduleDetail: isIntermittent ? 'On demand' : formatDetailedRecurrence(chore.recurrence),
            detail,
            reminderLeadDays: chore.reminderLeadDays ?? null,
            lastCompleted: null,
            nextOccurrence,
            resourceId: rId,
            resourceType: rType,
            homeGrouping: { kind: 'chore' },
          });
        }

        for (const story of home.stories ?? []) {
          for (const room of story.rooms ?? []) {
            for (const placement of room.placedItems ?? []) {
              if (placement.kind !== 'item') continue;
              const itemTemplate =
                room.dedicatedItems?.find((item) => item.id === placement.refId) ??
                resolveInventoryItemTemplate(placement.refId, userInventoryTemplates);
              const itemName = itemTemplate?.name ?? placement.refId;

              for (const task of placement.recurringTasks ?? []) {
                const display = resolveItemTaskDisplay(task.taskTemplateRef, placement.refId, userInventoryTemplates);
                const isIntermittent = normalizeRecurrenceMode(task.recurrenceMode) === 'never';
                rows.push({
                  rowKey: `${rId}-placed-${room.id}-${placement.id}-${task.id}`,
                  iconKey: resolveTaskIcon(display.icon, task.taskType, itemTemplate?.icon || rIcon),
                  name: display.name,
                  scheduleSummary: formatScheduleSummary(isIntermittent, task.recurrence),
                  scheduleDetail: isIntermittent ? 'On demand' : formatDetailedRecurrence(task.recurrence),
                  detail: `${story.name} · ${room.name}`,
                  reminderLeadDays: task.reminderLeadDays ?? null,
                  lastCompleted: task.lastCompleted ?? null,
                  nextOccurrence: isIntermittent ? null : computeNextOccurrence(task.recurrence, referenceDate),
                  resourceId: rId,
                  resourceType: rType,
                  homeGrouping: {
                    kind: 'placed-item',
                    roomId: room.id,
                    roomName: room.name,
                    roomIcon: room.icon || '🚪',
                    itemId: placement.id,
                    itemName,
                    itemIcon: itemTemplate?.icon || '📦',
                  },
                });
              }
            }
          }
        }
      }

      if (resource.type === 'vehicle') {
        const vehicle = resource as VehicleResource;
        for (const [i, task] of (vehicle.maintenanceTasks ?? []).entries()) {
          const isIntermittent = normalizeRecurrenceMode(task.recurrenceMode) === 'never';
          const nextOccurrence = isIntermittent ? null : computeNextOccurrence(task.recurrence, referenceDate);
          const detail = isIntermittent ? undefined :
            task.reminderLeadDays === -1 ? 'no reminder' :
            task.reminderLeadDays === 0  ? 'day-of' :
            `${task.reminderLeadDays}d reminder`;
          rows.push({
            rowKey: `${rId}-vehicle-${i}`,
            iconKey: resolveTaskIcon(task.icon, task.taskType, rIcon),
            name: task.name,
            scheduleSummary: formatScheduleSummary(isIntermittent, task.recurrence),
            scheduleDetail: isIntermittent ? 'On demand' : formatDetailedRecurrence(task.recurrence),
            detail,
            reminderLeadDays: task.reminderLeadDays ?? null,
            lastCompleted: null,
            nextOccurrence,
            resourceId: rId,
            resourceType: rType,
          });
        }
      }

      if (resource.type === 'account') {
        const account = resource as AccountResource;
        for (const [i, task] of (account.accountTasks ?? []).entries()) {
          const isIntermittent = normalizeRecurrenceMode(task.recurrenceMode) === 'never';
          const nextOccurrence = isIntermittent ? null : computeNextOccurrence(task.recurrence, referenceDate);
          const detailParts = [
            isIntermittent ? null :
              task.reminderLeadDays === -1 ? 'no reminder' :
              task.reminderLeadDays === 0  ? 'day-of' :
              `${task.reminderLeadDays}d reminder`,
            task.anticipatedValue != null ? formatCurrency(task.anticipatedValue) : null,
          ].filter(Boolean) as string[];
          rows.push({
            rowKey: `${rId}-account-${i}`,
            iconKey: resolveTaskIcon(task.icon, task.taskType, rIcon),
            name: task.name,
            scheduleSummary: formatScheduleSummary(isIntermittent, task.recurrence),
            scheduleDetail: isIntermittent ? 'On demand' : formatDetailedRecurrence(task.recurrence),
            detail: detailParts.join(' · ') || undefined,
            reminderLeadDays: task.reminderLeadDays ?? null,
            lastCompleted: null,
            nextOccurrence,
            resourceId: rId,
            resourceType: rType,
          });
        }
      }

      if (isInventory(resource)) {
        const inventory = resource as InventoryResource;
        const mergedTemplates = mergeInventoryItemTemplates(
          userInventoryTemplates,
          inventory.itemTemplates,
        );
        for (const container of inventory.containers ?? []) {
          const containerRows: RowData[] = [];
          let i = 0;
          for (const item of container.items ?? []) {
            const itemTemplate = mergedTemplates.find((t) => t.id === item.itemTemplateRef);
            const itemName = itemTemplate?.name ?? item.itemTemplateRef;
            for (const task of item.recurringTasks ?? []) {
              const display = resolveItemTaskDisplay(task.taskTemplateRef, item.itemTemplateRef, mergedTemplates);
              const isIntermittent = normalizeRecurrenceMode(task.recurrenceMode) === 'never';
              const nextOccurrence = isIntermittent ? null : computeNextOccurrence(task.recurrence, referenceDate);
              const reminderPart = isIntermittent ? null :
                task.reminderLeadDays === -1 ? 'no reminder' :
                task.reminderLeadDays === 0  ? 'day-of' :
                task.reminderLeadDays != null ? `${task.reminderLeadDays}d reminder` : null;
              const detail = reminderPart ? `${itemName} · ${reminderPart}` : itemName;
              containerRows.push({
                rowKey: `${container.id}-item-${i++}`,
                iconKey: resolveTaskIcon(display.icon, task.taskType, itemTemplate?.icon || container.icon || rIcon),
                name: display.name,
                scheduleSummary: formatScheduleSummary(isIntermittent, task.recurrence),
                scheduleDetail: isIntermittent ? 'On demand' : formatDetailedRecurrence(task.recurrence),
                detail,
                reminderLeadDays: task.reminderLeadDays ?? null,
                lastCompleted: task.lastCompleted ?? null,
                nextOccurrence,
                resourceId: rId,
                resourceType: rType,
              });
            }
          }

          if (container.kind === 'bag' && container.carryTask) {
            const carryTask = container.carryTask;
            const isIntermittent = normalizeRecurrenceMode(carryTask.recurrenceMode) === 'never';
            containerRows.push({
              rowKey: `${container.id}-carry-${carryTask.id}`,
              iconKey: resolveTaskIcon(null, carryTask.taskType, container.icon || rIcon),
              name: `${inventory.name}: ${container.name} — ${carryTask.name}`,
              scheduleSummary: formatScheduleSummary(isIntermittent, carryTask.recurrence),
              scheduleDetail: isIntermittent ? 'On demand' : formatDetailedRecurrence(carryTask.recurrence),
              detail: `Carry task · ${container.name}`,
              reminderLeadDays: carryTask.reminderLeadDays ?? null,
              lastCompleted: null,
              nextOccurrence: isIntermittent ? null : computeNextOccurrence(carryTask.recurrence, referenceDate),
              resourceId: rId,
              resourceType: rType,
            });
          }

          if (containerRows.length > 0) {
            result.push({
              resourceId: container.id,
              resourceIcon: container.icon || rIcon,
              resourceName: container.name,
              filterType: 'inventory',
              rows: containerRows,
            });
          }
        }
        continue;
      }

      if (rows.length > 0) {
        result.push({ resourceId: rId, resourceIcon: rIcon, resourceName: resource.name, filterType: resource.type as FilterType, rows });
      }
    }

    return result;
  }, [referenceDate, resources, user]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function toggleExpand(key: string) {
    if (expandedKey === key) {
      setExpandedKey(null);
      setExecutingKey(null);
      setExecuteNote('');
    } else {
      setExpandedKey(key);
      setExecutingKey(null);
      setExecuteNote('');
    }
  }

  function handleGoToResource(resourceId: string, resourceType: ResourceType) {
    setMenuResourceTarget(resourceId, resourceType);
    onGoToResource?.(resourceId, resourceType);
  }

  function startExecute(key: string) {
    setExecutingKey(key);
    setExecuteNote('');
  }

  function cancelExecute() {
    setExecutingKey(null);
    setExecuteNote('');
  }

  function saveAndLog(row: RowData) {
    const today = getAppDate();
    const qaId = `qa-${today}`;
    const now = getAppNowISO();
    const taskRef = executeNote.trim() ? `${row.name}: ${executeNote.trim()}` : row.name;
    const completion: QuickActionsCompletion = { taskRef, completedAt: now };
    const existing = activeEvents[qaId] as QuickActionsEvent | undefined;
    const updated: QuickActionsEvent = existing
      ? { ...existing, completions: [...existing.completions, completion] }
      : { id: qaId, eventType: 'quickActions', date: today, completions: [completion], xpAwarded: 0, sharedCompletions: null };
    setActiveEvent(updated);
    setExecutingKey(null);
    setExecuteNote('');
    setExpandedKey(null);
  }

  const presentTypes = useMemo<FilterType[]>(() => {
    const seen = new Set(sections.map((s) => s.filterType));
    return (['home', 'vehicle', 'account', 'inventory'] as FilterType[]).filter((t) => seen.has(t));
  }, [sections]);

  const FILTER_ICONS: Record<string, string> = {
    home: 'resource-home',
    vehicle: 'resource-vehicle',
    account: 'resource-account',
    inventory: 'resource-inventory',
  };

  const visibleSections = activeFilter === 'all'
    ? sections
    : sections.filter((s) => s.filterType === activeFilter);

  function renderTaskRow(row: RowData, extraClassName = '') {
    return (
      <button
        key={row.rowKey}
        type="button"
        onClick={() => toggleExpand(row.rowKey)}
        className={`w-full rounded-lg border border-gray-100 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/50 ${extraClassName}`}
      >
        <div className="flex items-center gap-2">
          <IconDisplay iconKey={row.iconKey} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-200">
            {row.name}
          </span>
        </div>
        <div className="mt-1 pl-6 text-xs text-gray-400 dark:text-gray-500">
          {row.scheduleSummary}
        </div>
      </button>
    );
  }

  function renderHomeSection(section: Section) {
    const choreRows = section.rows.filter((row) => row.homeGrouping?.kind === 'chore');
    const placedRows = section.rows.filter(
      (row): row is RowData & { homeGrouping: Exclude<RowData['homeGrouping'], { kind: 'chore' } | undefined> } =>
        row.homeGrouping?.kind === 'placed-item',
    );

    const roomGroups = placedRows.reduce<
      Array<{
        roomId: string;
        roomName: string;
        roomIcon: string;
        items: Array<{ itemId: string; itemName: string; itemIcon: string; rows: RowData[] }>;
      }>
    >((groups, row) => {
      const grouping = row.homeGrouping;
      const existingRoom = groups.find((group) => group.roomId === grouping.roomId);
      const roomGroup = existingRoom ?? {
        roomId: grouping.roomId,
        roomName: grouping.roomName,
        roomIcon: grouping.roomIcon,
        items: [],
      };
      if (!existingRoom) groups.push(roomGroup);

      const existingItem = roomGroup.items.find((item) => item.itemId === grouping.itemId);
      const itemGroup = existingItem ?? {
        itemId: grouping.itemId,
        itemName: grouping.itemName,
        itemIcon: grouping.itemIcon,
        rows: [],
      };
      if (!existingItem) roomGroup.items.push(itemGroup);

      itemGroup.rows.push(row);
      return groups;
    }, []);

    return (
      <div key={section.resourceId}>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <IconDisplay iconKey={section.resourceIcon} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" alt="" />
          {section.resourceName}
        </h3>

        <div className="space-y-2">
          {choreRows.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                <IconDisplay iconKey="chore" size={12} className="h-3 w-3 shrink-0 object-contain" alt="" />
                Chores
              </div>
              <div className="space-y-1">
                {choreRows.map((row) => renderTaskRow(row))}
              </div>
            </div>
          )}

          {roomGroups.map((roomGroup) => (
            <div key={roomGroup.roomId}>
              <div className="mb-1 ml-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                <IconDisplay iconKey={roomGroup.roomIcon} size={12} className="h-3 w-3 shrink-0 object-contain" alt="" />
                {roomGroup.roomName}
              </div>

              <div className="space-y-2">
                {roomGroup.items.map((itemGroup) => (
                  <div key={itemGroup.itemId}>
                    <div className="mb-1 ml-6 flex items-center gap-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                      <IconDisplay iconKey={itemGroup.itemIcon || '📦'} size={12} className="h-3 w-3 shrink-0 object-contain" alt="" />
                      {itemGroup.itemName}
                    </div>
                    <div className="space-y-1">
                      {itemGroup.rows.map((row) => renderTaskRow(row, 'ml-6'))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const expandedSection = expandedKey
    ? visibleSections.find((section) => section.rows.some((row) => row.rowKey === expandedKey)) ?? null
    : null;
  const expandedRow = expandedKey && expandedSection
    ? expandedSection.rows.find((row) => row.rowKey === expandedKey) ?? null
    : null;

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (sections.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-10 px-6 leading-relaxed">
        Add tasks to your resources to see them here — set up chores in Homes, maintenance in Vehicles, transaction tasks in Accounts, or item tasks in Inventory.
      </p>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {!expandedRow && presentTypes.length > 1 && (
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              activeFilter === 'all'
                ? 'bg-purple-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
            }`}
          >
            All
          </button>
          {presentTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setActiveFilter(activeFilter === type ? 'all' : type)}
              title={type.charAt(0).toUpperCase() + type.slice(1)}
              className={`flex items-center justify-center h-7 w-7 rounded-full transition-colors ${
                activeFilter === type
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
              }`}
            >
              <IconDisplay iconKey={FILTER_ICONS[type]} size={14} className="h-3.5 w-3.5 object-contain" alt={type} />
            </button>
          ))}
        </div>
      )}

      <div className={`min-h-0 flex-1 ${expandedRow ? 'px-4 py-3' : 'overflow-y-auto px-4 py-2 space-y-4'}`}>
        {expandedRow && expandedSection ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-purple-200 bg-white dark:border-purple-700 dark:bg-gray-800">
            <div className="border-b border-gray-100 px-4 py-4 dark:border-gray-700">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                  <IconDisplay iconKey={expandedRow.iconKey} size={20} className="h-5 w-5 object-contain" alt="" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{expandedRow.name}</h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {expandedRow.detail ?? expandedSection.resourceName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(expandedRow.rowKey)}
                      aria-label="Collapse resource task details"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <IconDisplay iconKey={expandedSection.resourceIcon} size={12} className="h-3 w-3 object-contain" alt="" />
                    <span>{expandedSection.resourceName}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {!executingKey || executingKey !== expandedRow.rowKey ? (
                <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                  <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Schedule</span>
                    <span>{expandedRow.scheduleDetail}</span>

                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Next date</span>
                    <span>{formatNextDate(expandedRow.nextOccurrence)}</span>

                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Last executed</span>
                    <span>{formatLastCompleted(expandedRow.lastCompleted, referenceDate)}</span>

                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Reminder</span>
                    <span>{formatReminder(expandedRow.reminderLeadDays)}</span>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleGoToResource(expandedRow.resourceId, expandedRow.resourceType)}
                      className="flex-1 rounded-md border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Go to Resource
                    </button>
                    <button
                      type="button"
                      onClick={() => startExecute(expandedRow.rowKey)}
                      className="flex-1 rounded-md bg-purple-500 py-2 text-sm font-semibold text-white hover:bg-purple-600"
                    >
                      Execute
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={executeNote}
                    onChange={(e) => setExecuteNote(e.target.value)}
                    placeholder="Add a note (optional)…"
                    rows={4}
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-purple-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelExecute}
                      className="flex-1 rounded-md border border-gray-200 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveAndLog(expandedRow)}
                      className="flex-1 rounded-md bg-green-500 py-2 text-sm font-semibold text-white hover:bg-green-600"
                    >
                      Save &amp; Log
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          visibleSections.map((section) => (
            section.filterType === 'home'
              ? renderHomeSection(section)
              : (
                <div key={section.resourceId}>
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <IconDisplay iconKey={section.resourceIcon} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" alt="" />
                    {section.resourceName}
                  </h3>
                  <div className="space-y-1">
                    {section.rows.map((row) => renderTaskRow(row))}
                  </div>
                </div>
              )
          ))
        )}
      </div>
    </div>
  );
}
