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
  InventoryItemTemplate,
  VehicleResource,
  ResourceRecurrenceRule,
  RecurrenceDayOfWeek,
  ResourceType,
} from '../../../../../types/resource';
import { isInventory, normalizeRecurrenceMode } from '../../../../../types/resource';
import type { QuickActionsEvent, QuickActionsCompletion } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { taskTemplateLibrary } from '../../../../../coach';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTaskTemplateMeta } from '../../../../../coach/ItemLibrary';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../../../../utils/inventoryItems';
import { getAppDate, getAppNowISO } from '../../../../../utils/dateUtils';

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
  rl: string;           // recurrence label
  detail?: string;
  resourceId: string;
  resourceType: ResourceType;
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

  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];

    for (const resource of Object.values(resources)) {
      const rows: RowData[] = [];
      const rIcon = resource.icon;
      const rId = resource.id;
      const rType = resource.type as ResourceType;

      if (resource.type === 'home') {
        const home = resource as HomeResource;
        for (const [i, chore] of (home.chores ?? []).entries()) {
          const isIntermittent = normalizeRecurrenceMode(chore.recurrenceMode) === 'never';
          const rl = isIntermittent ? 'Intermittent' : recurrenceLabel(chore.recurrence);
          const detail = isIntermittent ? undefined :
            chore.assignedTo && chore.assignedTo !== 'all' ? 'assigned' :
            chore.assignedTo === 'all' ? 'all members' : undefined;
          rows.push({ rowKey: `${rId}-${i}`, iconKey: chore.icon || rIcon, name: chore.name, rl, detail, resourceId: rId, resourceType: rType });
        }
      }

      if (resource.type === 'vehicle') {
        const vehicle = resource as VehicleResource;
        for (const [i, task] of (vehicle.maintenanceTasks ?? []).entries()) {
          const isIntermittent = normalizeRecurrenceMode(task.recurrenceMode) === 'never';
          const rl = isIntermittent ? 'Intermittent' : recurrenceLabel(task.recurrence);
          const detail = isIntermittent ? undefined :
            task.reminderLeadDays === -1 ? 'no reminder' :
            task.reminderLeadDays === 0  ? 'day-of' :
            `${task.reminderLeadDays}d reminder`;
          rows.push({ rowKey: `${rId}-${i}`, iconKey: task.icon || rIcon, name: task.name, rl, detail, resourceId: rId, resourceType: rType });
        }
      }

      if (resource.type === 'account') {
        const account = resource as AccountResource;
        for (const [i, task] of (account.accountTasks ?? []).entries()) {
          const isIntermittent = normalizeRecurrenceMode(task.recurrenceMode) === 'never';
          const rl = isIntermittent ? 'Intermittent' : recurrenceLabel(task.recurrence);
          const detailParts = [
            isIntermittent ? null :
              task.reminderLeadDays === -1 ? 'no reminder' :
              task.reminderLeadDays === 0  ? 'day-of' :
              `${task.reminderLeadDays}d reminder`,
            task.anticipatedValue != null ? formatCurrency(task.anticipatedValue) : null,
          ].filter(Boolean) as string[];
          rows.push({ rowKey: `${rId}-${i}`, iconKey: task.icon || rIcon, name: task.name, rl, detail: detailParts.join(' · ') || undefined, resourceId: rId, resourceType: rType });
        }
      }

      if (isInventory(resource)) {
        const mergedTemplates = mergeInventoryItemTemplates(
          getUserInventoryItemTemplates(user),
          resource.itemTemplates,
        );
        for (const container of resource.containers ?? []) {
          const containerRows: RowData[] = [];
          let i = 0;
          for (const item of container.items ?? []) {
            const itemTemplate = mergedTemplates.find((t) => t.id === item.itemTemplateRef);
            const itemName = itemTemplate?.name ?? item.itemTemplateRef;
            for (const task of item.recurringTasks ?? []) {
              const display = resolveItemTaskDisplay(task.taskTemplateRef, item.itemTemplateRef, mergedTemplates);
              const isIntermittent = normalizeRecurrenceMode(task.recurrenceMode) === 'never';
              const rl = isIntermittent ? 'Intermittent' : recurrenceLabel(task.recurrence);
              const reminderPart = isIntermittent ? null :
                task.reminderLeadDays === -1 ? 'no reminder' :
                task.reminderLeadDays === 0  ? 'day-of' :
                task.reminderLeadDays != null ? `${task.reminderLeadDays}d reminder` : null;
              const detail = reminderPart ? `${itemName} · ${reminderPart}` : itemName;
              containerRows.push({ rowKey: `${container.id}-${i++}`, iconKey: display.icon, name: display.name, rl, detail, resourceId: rId, resourceType: rType });
            }
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
  }, [resources, user]);

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

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (sections.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-10 px-6 leading-relaxed">
        Add tasks to your resources to see them here — set up chores in Homes, maintenance in Vehicles, transaction tasks in Accounts, or item tasks in Inventory.
      </p>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

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

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter pills */}
      {presentTypes.length > 1 && (
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

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
      {visibleSections.map((section) => (
        <div key={section.resourceId}>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            <IconDisplay iconKey={section.resourceIcon} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" alt="" />
            {section.resourceName}
          </h3>
          <div className="space-y-1">
            {section.rows.map((row) => {
              const isExpanded = expandedKey === row.rowKey;
              const isExecuting = executingKey === row.rowKey;

              return (
                <div
                  key={row.rowKey}
                  className={`rounded-lg border bg-white dark:bg-gray-800 overflow-hidden transition-colors ${
                    isExpanded
                      ? 'border-purple-200 dark:border-purple-700'
                      : 'border-gray-100 dark:border-gray-700'
                  }`}
                >
                  {/* Collapsed header row — always visible */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(row.rowKey)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <IconDisplay iconKey={row.iconKey} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate min-w-0">
                      {row.name}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{row.rl}</span>
                    {row.detail && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 ml-1">· {row.detail}</span>
                    )}
                    <span className="ml-1 text-gray-300 dark:text-gray-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {/* Expanded area */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2.5 space-y-2.5">
                      {!isExecuting ? (
                        <>
                          {/* Task info */}
                          <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                            <div className="flex items-center gap-1.5">
                              <span className="w-20 shrink-0">Schedule</span>
                              <span className="text-gray-700 dark:text-gray-200">{row.rl}</span>
                            </div>
                            {row.detail && (
                              <div className="flex items-center gap-1.5">
                                <span className="w-20 shrink-0">Info</span>
                                <span className="text-gray-700 dark:text-gray-200">{row.detail}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <span className="w-20 shrink-0">Source</span>
                              <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-200">
                                <IconDisplay iconKey={section.resourceIcon} size={12} className="h-3 w-3 object-contain" alt="" />
                                {section.resourceName}
                              </span>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleGoToResource(row.resourceId, row.resourceType)}
                              className="flex-1 rounded-md border border-gray-200 dark:border-gray-600 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                              Go to resource
                            </button>
                            <button
                              type="button"
                              onClick={() => startExecute(row.rowKey)}
                              className="flex-1 rounded-md bg-purple-500 py-1.5 text-xs font-semibold text-white hover:bg-purple-600"
                            >
                              Execute
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Execute input area */}
                          <textarea
                            value={executeNote}
                            onChange={(e) => setExecuteNote(e.target.value)}
                            placeholder="Add a note (optional)…"
                            rows={2}
                            className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-purple-400 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={cancelExecute}
                              className="flex-1 rounded-md border border-gray-200 dark:border-gray-600 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveAndLog(row)}
                              className="flex-1 rounded-md bg-green-500 py-1.5 text-xs font-semibold text-white hover:bg-green-600"
                            >
                              Save &amp; Log
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
