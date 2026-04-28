import { useMemo, useState } from 'react';
import type { HomeResource, InventoryContainer, InventoryContainerLink, InventoryResource, VehicleResource } from '../../../../../../types/resource';
import type { Task } from '../../../../../../types/task';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceMetaTabs } from '../shared/ResourceMetaTabs';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../../utils/inventoryItems';
import { findHomeRoomReference } from '../../../../../../utils/homeRooms';
import { CUSTOM_ITEM_TEMPLATE_PREFIX, getItemTemplateByRef } from '../../../../../../coach/ItemLibrary';

interface InventoryMetaViewProps {
  resource: InventoryResource;
}

type TabKey = 'items' | 'containers';

const DAY_LABELS: Record<string, string> = {
  sun: 'Su',
  mon: 'Mo',
  tue: 'Tu',
  wed: 'We',
  thu: 'Th',
  fri: 'Fr',
  sat: 'Sa',
};

function describeTaskRecurrence(rule: { frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval: number; days: string[]; monthlyDay?: number | null }) {
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly': {
      const days = rule.days.length > 0 ? ` · ${rule.days.map((day) => DAY_LABELS[day] ?? day).join(' ')}` : '';
      return `${interval === 1 ? 'Weekly' : `Every ${interval} weeks`}${days}`;
    }
    case 'monthly':
      return `${interval === 1 ? 'Monthly' : `Every ${interval} months`}${rule.monthlyDay ? ` · Day ${rule.monthlyDay}` : ''}`;
    case 'yearly':
      return interval === 1 ? 'Yearly' : `Every ${interval} years`;
    default:
      return 'Recurring';
  }
}

function describeReminder(reminderLeadDays?: number) {
  if (reminderLeadDays == null || reminderLeadDays < 0) return 'No reminder';
  if (reminderLeadDays === 0) return 'Due day';
  if (reminderLeadDays === 1) return '1 day before';
  return `${reminderLeadDays} days before`;
}

export function InventoryMetaView({ resource }: InventoryMetaViewProps) {
  const scheduleTasks = useScheduleStore((s) => s.tasks) as Record<string, Task>;
  const resources = useResourceStore((s) => s.resources);
  const user = useUserStore((s) => s.user);
  const gtdTaskIds = new Set(user?.lists.gtdList ?? []);
  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [expandedContainerId, setExpandedContainerId] = useState<string | null>(null);

  const itemEntries = mergeInventoryItemTemplates(
    getUserInventoryItemTemplates(user),
    resource.itemTemplates,
  );
  const containerEntries = useMemo(() => resource.containers ?? [], [resource.containers]);

  const itemUsage = useMemo(() => {
    const usage = new Map<string, { looseCount: number; containerCount: number }>();

    const addUsage = (itemTemplateRef: string, key: 'looseCount' | 'containerCount') => {
      const current = usage.get(itemTemplateRef) ?? { looseCount: 0, containerCount: 0 };
      current[key] += 1;
      usage.set(itemTemplateRef, current);
    };

    for (const item of resource.items) addUsage(item.itemTemplateRef, 'looseCount');
    for (const container of containerEntries) {
      for (const item of container.items) addUsage(item.itemTemplateRef, 'containerCount');
    }

    return usage;
  }, [containerEntries, resource.items]);

  const lowStockLabels = new Set(
    Object.values(scheduleTasks)
      .filter((task) => task.resourceRef === resource.id && task.completionState === 'pending' && gtdTaskIds.has(task.id))
      .map((task) => (task.resultFields as Record<string, string> | undefined)?.itemName)
      .filter((itemName): itemName is string => Boolean(itemName)),
  );

  function getLocationLink(container: InventoryContainer) {
    return container.links?.find((link) => link.relationship === 'location' && Boolean(link.targetResourceId));
  }

  function describeContainerLocation(link: InventoryContainerLink) {
    if (!link.targetResourceId) return 'Unplaced';
    if (link.targetKind === 'vehicle') {
      const vehicle = resources[link.targetResourceId] as VehicleResource | undefined;
      return vehicle?.name ?? 'Vehicle';
    }

    const home = resources[link.targetResourceId] as HomeResource | undefined;
    const room = home ? findHomeRoomReference(home, link.targetRoomId) : null;
    if (home?.name && room?.name) return `${home.name} - ${room.name}`;
    return room?.name ?? home?.name ?? 'Home room';
  }

  const details = (
    <div className="mb-1 space-y-3 text-xs text-gray-600 dark:text-gray-300">
      <div className="mb-2 flex items-center gap-2">
        <IconDisplay iconKey={resource.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
        <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{resource.name}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('items')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'items'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Items ({itemEntries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('containers')}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            activeTab === 'containers'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Containers ({containerEntries.length})
        </button>
      </div>

      {activeTab === 'items' ? (
        <section className="space-y-2">
          {itemEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-3 py-4 text-center text-xs italic text-gray-400 dark:border-gray-700 dark:bg-gray-800/60">
              No items added yet.
            </div>
          ) : itemEntries.map((item) => {
            const builtInTemplate = getItemTemplateByRef(item.id);
            const description = builtInTemplate?.description ?? (item.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX) ? 'Custom inventory item' : '');
            const usage = itemUsage.get(item.id) ?? { looseCount: 0, containerCount: 0 };
            const expanded = expandedItemId === item.id;
            return (
              <article key={item.id} className="rounded-xl border border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-800/60">
                <button
                  type="button"
                  onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-gray-900/40">
                    {item.icon ? <IconDisplay iconKey={item.icon} size={18} className="h-4.5 w-4.5 shrink-0 object-contain" alt="" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.name}</div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {usage.looseCount + usage.containerCount} entries · {usage.containerCount} in containers
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{expanded ? 'Hide' : 'Open'}</span>
                </button>

                {expanded ? (
                  <div className="space-y-2 border-t border-gray-200 px-3 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {description ? <p>{description}</p> : null}
                    <div className="rounded-lg bg-white px-2.5 py-2 dark:bg-gray-900/40">
                      Loose entries: {usage.looseCount}
                    </div>
                    <div className="rounded-lg bg-white px-2.5 py-2 dark:bg-gray-900/40">
                      Container entries: {usage.containerCount}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : (
        <section className="space-y-2">
          {containerEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-3 py-4 text-center text-xs italic text-gray-400 dark:border-gray-700 dark:bg-gray-800/60">
              No containers added yet.
            </div>
          ) : containerEntries.map((container) => {
            const expanded = expandedContainerId === container.id;
            const locationLink = getLocationLink(container);
            const lowItems = container.items.filter((item) => {
              const itemName = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries)?.name ?? item.itemTemplateRef;
              return lowStockLabels.has(itemName) || (item.threshold != null && item.quantity != null && item.quantity <= item.threshold);
            });

            return (
              <article key={container.id} className="rounded-xl border border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-800/60">
                <button
                  type="button"
                  onClick={() => setExpandedContainerId((prev) => (prev === container.id ? null : container.id))}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-gray-900/40">
                    {container.icon ? <IconDisplay iconKey={container.icon} size={18} className="h-4.5 w-4.5 shrink-0 object-contain" alt="" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${lowItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>
                      {container.name}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {container.items.length} item{container.items.length === 1 ? '' : 's'}
                      {locationLink ? ` · ${describeContainerLocation(locationLink)}` : ' · Unplaced'}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{expanded ? 'Hide' : 'Open'}</span>
                </button>

                {expanded ? (
                  <div className="space-y-2 border-t border-gray-200 px-3 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    <div className="rounded-lg bg-white px-2.5 py-2 dark:bg-gray-900/40">
                      {locationLink ? `Placement: ${describeContainerLocation(locationLink)}` : 'Placement: none'}
                    </div>
                    <div className="rounded-lg bg-white px-2.5 py-2 dark:bg-gray-900/40">
                      {container.carryTask
                        ? `${container.carryTask.name} · ${(container.carryTask.recurrenceMode ?? 'never') === 'recurring'
                          ? `${describeTaskRecurrence(container.carryTask.recurrence)} · ${describeReminder(container.carryTask.reminderLeadDays ?? 7)}`
                          : 'Intermittent icon on seed date'}`
                        : 'No carry task configured.'}
                    </div>
                    <div className="space-y-1">
                      {container.items.length === 0 ? (
                        <div className="rounded-lg bg-white px-2.5 py-2 italic dark:bg-gray-900/40">No items in container.</div>
                      ) : container.items.map((item) => {
                        const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries);
                        const templateKind = getItemTemplateByRef(item.itemTemplateRef)?.kind ?? resolved?.kind ?? 'consumable';
                        return (
                          <div key={item.id} className="rounded-lg bg-white px-2.5 py-2 dark:bg-gray-900/40">
                            <div className="font-medium text-gray-700 dark:text-gray-200">{resolved?.name ?? item.itemTemplateRef}</div>
                            <div className="mt-0.5">
                              {templateKind === 'consumable'
                                ? `${item.quantity ?? 0}${item.unit?.trim() ? ` ${item.unit.trim()}` : ''} on hand${item.threshold != null ? ` · Threshold ${item.threshold}` : ''}`
                                : `${(item.recurringTasks ?? []).length} recurring task${(item.recurringTasks ?? []).length === 1 ? '' : 's'}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );

  return <ResourceMetaTabs resource={resource} details={details} />;
}
