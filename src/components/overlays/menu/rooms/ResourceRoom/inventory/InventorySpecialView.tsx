import { useMemo, useState } from 'react';
import type {
  HomeResource,
  InventoryContainer,
  InventoryContainerLink,
  InventoryCustomTaskTemplate,
  InventoryResource,
  ItemInstance,
  VehicleResource,
} from '../../../../../../types/resource';
import { isDoc } from '../../../../../../types/resource';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { Task } from '../../../../../../types/task';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { AddItemPanel } from './AddItemPanel';
import { taskTemplateLibrary } from '../../../../../../coach';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../../utils/inventoryItems';
import { findHomeRoomReference, getHomeRoomReferences } from '../../../../../../utils/homeRooms';
import {
  CUSTOM_ITEM_TEMPLATE_PREFIX,
  getItemTaskTemplateMeta,
  getItemTemplateByRef,
  makeCustomItemTemplateRef,
  type ItemCategory,
  type ItemKind,
} from '../../../../../../coach/ItemLibrary';

interface InventorySpecialViewProps {
  resource: InventoryResource;
  onAddContainer: (resource: InventoryResource) => void;
  onEditContainer: (resource: InventoryResource, containerId: string) => void;
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

export function InventorySpecialView({ resource, onAddContainer, onEditContainer }: InventorySpecialViewProps) {
  const scheduleTasks = useScheduleStore((s) => s.tasks) as Record<string, Task>;
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const gtdTaskIds = new Set(user?.lists.gtdList ?? []);

  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [expandedContainerId, setExpandedContainerId] = useState<string | null>(null);
  const [showAddItemPanel, setShowAddItemPanel] = useState(false);
  const [showItemComposer, setShowItemComposer] = useState(false);
  const [draftItemName, setDraftItemName] = useState('');
  const [draftItemIcon, setDraftItemIcon] = useState('inventory');
  const [draftItemKind, setDraftItemKind] = useState<ItemKind>('consumable');
  const [draftItemCategory, setDraftItemCategory] = useState<ItemCategory>('workspace');
  const [draftItemDescription, setDraftItemDescription] = useState('Custom inventory item');
  const [draftTaskTemplates, setDraftTaskTemplates] = useState<InventoryCustomTaskTemplate[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const itemEntries = useMemo(
    () => mergeInventoryItemTemplates(getUserInventoryItemTemplates(user), resource.itemTemplates),
    [resource.itemTemplates, user],
  );
  const containerEntries = useMemo(() => resource.containers ?? [], [resource.containers]);
  const homeResources = useMemo(
    () => Object.values(resources).filter((entry): entry is HomeResource => entry.type === 'home'),
    [resources],
  );
  const vehicleResources = useMemo(
    () => Object.values(resources).filter((entry): entry is VehicleResource => entry.type === 'vehicle'),
    [resources],
  );

  const itemIdsWithDoc = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of Object.values(resources)) {
      if (!isDoc(entry)) continue;
      if (entry.docType === 'manual' && entry.linkedResourceRef) ids.add(entry.linkedResourceRef);
      if (entry.docType === 'recipe') {
        for (const ingredient of entry.recipeIngredients ?? []) {
          if (ingredient.itemRef) ids.add(ingredient.itemRef);
        }
      }
    }
    return ids;
  }, [resources]);

  const lowStockLabels = new Set(
    Object.values(scheduleTasks)
      .filter((task) => task.resourceRef === resource.id && task.completionState === 'pending' && gtdTaskIds.has(task.id))
      .map((task) => (task.resultFields as Record<string, string> | undefined)?.itemName)
      .filter((itemName): itemName is string => Boolean(itemName)),
  );

  const itemUsage = useMemo(() => {
    const usage = new Map<
      string,
      {
        looseItems: ItemInstance[];
        containerRefs: Array<{ containerId: string; containerName: string; item: ItemInstance }>;
      }
    >();

    const ensureUsage = (itemTemplateRef: string) => {
      const current = usage.get(itemTemplateRef);
      if (current) return current;
      const created = { looseItems: [], containerRefs: [] };
      usage.set(itemTemplateRef, created);
      return created;
    };

    for (const item of resource.items) {
      ensureUsage(item.itemTemplateRef).looseItems.push(item);
    }

    for (const container of containerEntries) {
      for (const item of container.items) {
        ensureUsage(item.itemTemplateRef).containerRefs.push({
          containerId: container.id,
          containerName: container.name,
          item,
        });
      }
    }

    return usage;
  }, [containerEntries, resource.items]);

  function resetItemComposer() {
    setDraftItemName('');
    setDraftItemIcon('inventory');
    setDraftItemKind('consumable');
    setDraftItemCategory('workspace');
    setDraftItemDescription('Custom inventory item');
    setDraftTaskTemplates([]);
    setEditingItemId(null);
    setShowItemComposer(false);
  }

  function openItemComposer(itemId: string) {
    const item = itemEntries.find((entry) => entry.id === itemId);
    if (!item) return;
    const resolved = resolveInventoryItemTemplate(item.id, itemEntries);
    setDraftItemName(item.name);
    setDraftItemIcon(item.icon || 'inventory');
    setDraftItemKind(item.kind ?? 'consumable');
    setDraftItemCategory((resolved?.category ?? 'workspace') as ItemCategory);
    setDraftItemDescription(resolved?.description ?? 'Custom inventory item');
    setDraftTaskTemplates(item.customTaskTemplates ?? []);
    setEditingItemId(itemId);
    setShowItemComposer(true);
    setExpandedItemId(itemId);
  }

  function addDraftTaskTemplate() {
    setDraftTaskTemplates((prev) => [...prev, { id: crypto.randomUUID(), name: '', icon: 'task' }]);
  }

  function updateDraftTaskTemplate(id: string, patch: Partial<InventoryCustomTaskTemplate>) {
    setDraftTaskTemplates((prev) => prev.map((taskTemplate) => (taskTemplate.id === id ? { ...taskTemplate, ...patch } : taskTemplate)));
  }

  function removeDraftTaskTemplate(id: string) {
    setDraftTaskTemplates((prev) => prev.filter((taskTemplate) => taskTemplate.id !== id));
  }

  function handleSaveOrUpdateItem() {
    if (!user || !draftItemName.trim()) return;

    const nextItem = {
      id: makeCustomItemTemplateRef(draftItemName.trim(), draftItemKind, draftItemIcon || 'inventory'),
      name: draftItemName.trim(),
      icon: draftItemIcon || 'inventory',
      kind: draftItemKind,
      category: draftItemCategory,
      description: draftItemDescription.trim() || 'Custom inventory item',
      isCustom: true,
      customTaskTemplates: draftItemKind === 'facility'
        ? draftTaskTemplates.filter((taskTemplate) => taskTemplate.name.trim().length > 0)
        : [],
    };

    const nextTemplates = mergeInventoryItemTemplates(
      (user.lists.inventoryItemTemplates ?? []).filter((item) => item.id !== editingItemId),
      [nextItem],
    );

    setUser({
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: nextTemplates,
      },
    });

    if (editingItemId && nextItem.id !== editingItemId) {
      setResource({
        ...resource,
        updatedAt: new Date().toISOString(),
        items: resource.items.map((item) =>
          item.itemTemplateRef === editingItemId ? { ...item, itemTemplateRef: nextItem.id } : item,
        ),
        containers: containerEntries.map((container) => ({
          ...container,
          items: container.items.map((item) =>
            item.itemTemplateRef === editingItemId ? { ...item, itemTemplateRef: nextItem.id } : item,
          ),
        })),
      });
      setExpandedItemId(nextItem.id);
    }

    resetItemComposer();
  }

  function handleRemoveItem(itemId: string) {
    if (!user) return;
    const nextTemplates = (user.lists.inventoryItemTemplates ?? []).filter((item) => item.id !== itemId);
    setUser({
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: nextTemplates,
      },
    });
    setResource({
      ...resource,
      updatedAt: new Date().toISOString(),
      items: resource.items.filter((item) => item.itemTemplateRef !== itemId),
      containers: containerEntries.map((container) => ({
        ...container,
        items: container.items.filter((item) => item.itemTemplateRef !== itemId),
      })),
    });
    setExpandedItemId((prev) => (prev === itemId ? null : prev));
  }

  function humanizeTaskRef(taskRef: string) {
    return taskRef
      .replace(/^task-res-/, '')
      .replace(/^item-tmpl-/, '')
      .replace(/-\d+$/, '')
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function resolveTaskDisplay(taskTemplateRef: string, itemTemplateRef?: string) {
    if (itemTemplateRef) {
      const customTemplate = itemEntries.find((item) => item.id === itemTemplateRef);
      const customTask = customTemplate?.customTaskTemplates?.find((taskTemplate) => taskTemplate.name === taskTemplateRef);
      if (customTask) {
        return {
          name: customTask.name,
          icon: customTask.icon || 'task',
        };
      }
    }

    const coachTaskTemplate = taskTemplateLibrary.find((template) => template.id === taskTemplateRef);
    if (coachTaskTemplate) {
      return {
        name: coachTaskTemplate.name,
        icon: coachTaskTemplate.icon || 'task',
      };
    }

    const itemTaskTemplate = getItemTaskTemplateMeta(taskTemplateRef);
    if (itemTaskTemplate) {
      return {
        name: itemTaskTemplate.name,
        icon: itemTaskTemplate.icon || 'task',
      };
    }

    return {
      name: humanizeTaskRef(taskTemplateRef),
      icon: 'task',
    };
  }

  function getLocationLink(container: InventoryContainer) {
    return container.links?.find((link) => link.relationship === 'location');
  }

  function describeContainerLocation(link: InventoryContainerLink) {
    if (link.targetKind === 'vehicle') {
      const vehicle = resources[link.targetResourceId] as VehicleResource | undefined;
      return vehicle?.name ?? 'Vehicle';
    }

    const home = resources[link.targetResourceId] as HomeResource | undefined;
    const room = home ? findHomeRoomReference(home, link.targetRoomId) : null;
    if (home?.name && room?.name) return `${home.name} - ${room.name}`;
    return room?.name ?? home?.name ?? 'Home room';
  }

  function updateContainerLocation(containerId: string, link: InventoryContainerLink | null) {
    setResource({
      ...resource,
      updatedAt: new Date().toISOString(),
      containers: containerEntries.map((container) => {
        if (container.id !== containerId) return container;
        const baseLinks = (container.links ?? []).filter((entry) => entry.relationship !== 'location');
        return {
          ...container,
          links: link ? [...baseLinks, link] : baseLinks,
        };
      }),
    });
  }

  function setContainerHome(container: InventoryContainer, homeId: string) {
    if (!homeId) {
      updateContainerLocation(container.id, null);
      return;
    }
    const home = homeResources.find((entry) => entry.id === homeId);
    const firstRoomId = home ? getHomeRoomReferences(home)[0]?.id : undefined;
    updateContainerLocation(container.id, {
      id: getLocationLink(container)?.id ?? crypto.randomUUID(),
      relationship: 'location',
      targetKind: 'home-room',
      targetResourceId: homeId,
      targetRoomId: firstRoomId,
      createdAt: getLocationLink(container)?.createdAt ?? new Date().toISOString(),
    });
  }

  function setContainerRoom(container: InventoryContainer, roomId: string) {
    const locationLink = getLocationLink(container);
    if (!locationLink || locationLink.targetKind !== 'home-room') return;
    updateContainerLocation(container.id, {
      ...locationLink,
      targetRoomId: roomId || undefined,
    });
  }

  function setContainerVehicle(container: InventoryContainer, vehicleId: string) {
    if (!vehicleId) {
      updateContainerLocation(container.id, null);
      return;
    }
    updateContainerLocation(container.id, {
      id: getLocationLink(container)?.id ?? crypto.randomUUID(),
      relationship: 'location',
      targetKind: 'vehicle',
      targetResourceId: vehicleId,
      createdAt: getLocationLink(container)?.createdAt ?? new Date().toISOString(),
    });
  }

  const tabButtonClass = (tab: TabKey) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
      activeTab === tab
        ? 'bg-blue-500 text-white'
        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
    }`;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab('items')} className={tabButtonClass('items')}>
            Items ({itemEntries.length})
          </button>
          <button type="button" onClick={() => setActiveTab('containers')} className={tabButtonClass('containers')}>
            Containers ({containerEntries.length})
          </button>
        </div>

        {activeTab === 'items' ? (
          <button
            type="button"
            onClick={() => setShowAddItemPanel(true)}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
          >
            Add Item
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onAddContainer(resource)}
            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
          >
            Add Container
          </button>
        )}
      </div>

      {activeTab === 'items' && showItemComposer ? (
        <section className="mb-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="grid grid-cols-[auto_1fr] items-end gap-3">
            <IconPicker value={draftItemIcon} onChange={setDraftItemIcon} align="left" />
            <TextInput
              label="Item name"
              value={draftItemName}
              onChange={setDraftItemName}
              placeholder="e.g. Coffee Beans"
              maxLength={80}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(['consumable', 'facility'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setDraftItemKind(kind)}
                className={draftItemKind === kind
                  ? 'rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}
              >
                {kind === 'consumable' ? 'Consumable' : 'Facility'}
              </button>
            ))}
          </div>

          {draftItemKind === 'facility' ? (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Custom task templates</p>
                <button type="button" onClick={addDraftTaskTemplate} className="text-xs font-medium text-blue-500 hover:text-blue-600">
                  + Add task
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {draftTaskTemplates.length === 0 ? (
                  <p className="text-xs italic text-gray-400">No custom tasks added yet.</p>
                ) : draftTaskTemplates.map((taskTemplate) => (
                  <div key={taskTemplate.id} className="grid grid-cols-[auto_1fr_auto] items-end gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-900/60">
                    <IconPicker
                      value={taskTemplate.icon || 'task'}
                      onChange={(value) => updateDraftTaskTemplate(taskTemplate.id, { icon: value })}
                      align="left"
                    />
                    <TextInput
                      label="Task name"
                      value={taskTemplate.name}
                      onChange={(value) => updateDraftTaskTemplate(taskTemplate.id, { name: value })}
                      placeholder="e.g. Wipe down"
                      maxLength={80}
                    />
                    <button type="button" onClick={() => removeDraftTaskTemplate(taskTemplate.id)} className="mb-1 text-xs text-gray-400 hover:text-red-400">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetItemComposer}
              className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveOrUpdateItem}
              disabled={!draftItemName.trim() || (draftItemKind === 'facility' && draftTaskTemplates.some((taskTemplate) => !taskTemplate.name.trim()))}
              className={draftItemName.trim() && (draftItemKind === 'consumable' || !draftTaskTemplates.some((taskTemplate) => !taskTemplate.name.trim()))
                ? 'rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600'
                : 'rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-400 dark:bg-gray-700'}
            >
              {editingItemId ? 'Save Changes' : 'Save Item'}
            </button>
          </div>
        </section>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'items' ? (
          itemEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900/30">
              No items added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {itemEntries.map((item) => {
                const builtInTemplate = getItemTemplateByRef(item.id);
                const resolvedItem = resolveInventoryItemTemplate(item.id, itemEntries);
                const description = builtInTemplate?.description ?? resolvedItem?.description ?? (item.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX) ? 'Custom inventory item' : '');
                const usage = itemUsage.get(item.id) ?? { looseItems: [], containerRefs: [] };
                const totalInstances = usage.looseItems.length + usage.containerRefs.length;
                const lowCount = [...usage.looseItems, ...usage.containerRefs.map((entry) => entry.item)].filter((entry) => entry.threshold != null && entry.quantity != null && entry.quantity <= entry.threshold).length;
                const taskRefs = [
                  ...(builtInTemplate?.builtInTasks?.map((task) => task.taskTemplateRef) ?? []),
                  ...(builtInTemplate?.associatedTaskTemplateRef ? [builtInTemplate.associatedTaskTemplateRef] : []),
                  ...((item.customTaskTemplates ?? []).map((taskTemplate) => taskTemplate.name)),
                ];
                const expanded = expandedItemId === item.id;

                return (
                  <article key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                    <button
                      type="button"
                      onClick={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left"
                    >
                      <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white dark:bg-gray-800">
                        {itemIdsWithDoc.has(item.id) ? (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/60" title="Has linked doc">
                            <IconDisplay iconKey="doc" size={10} className="h-2.5 w-2.5 object-contain opacity-70" alt="doc" />
                          </span>
                        ) : null}
                        <IconDisplay iconKey={item.icon || 'inventory'} size={24} className="h-6 w-6 object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{item.name}</span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                            {item.kind ?? 'consumable'}
                          </span>
                          {lowCount > 0 ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              {lowCount} low
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {totalInstances === 0 ? 'Not currently placed in inventory' : `${totalInstances} inventory entry${totalInstances === 1 ? '' : 'ies'}`}
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-400">{expanded ? 'Hide' : 'Open'}</span>
                    </button>

                    {expanded ? (
                      <div className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                        {description ? <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p> : null}

                        {taskRefs.length > 0 ? (
                          <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Task Templates</p>
                            <div className="mt-2 space-y-1.5">
                              {taskRefs.map((taskTemplateRef) => {
                                const taskDisplay = resolveTaskDisplay(taskTemplateRef, item.id);
                                return (
                                  <div key={`${item.id}-${taskTemplateRef}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                                    <IconDisplay iconKey={taskDisplay.icon} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" />
                                    <span>{taskDisplay.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Loose Inventory</p>
                            <div className="mt-2 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                              {usage.looseItems.length === 0 ? (
                                <p className="italic">No loose entries.</p>
                              ) : usage.looseItems.map((entry) => (
                                <div key={entry.id} className="rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-900/60">
                                  <div className="font-medium text-gray-700 dark:text-gray-200">
                                    {entry.quantity ?? 0}{entry.unit?.trim() ? ` ${entry.unit.trim()}` : ''} on hand
                                  </div>
                                  {entry.threshold != null ? <div>Threshold: {entry.threshold}</div> : null}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Containers</p>
                            <div className="mt-2 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                              {usage.containerRefs.length === 0 ? (
                                <p className="italic">Not stored in any container.</p>
                              ) : usage.containerRefs.map((entry) => (
                                <div key={entry.item.id} className="rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-900/60">
                                  <div className="font-medium text-gray-700 dark:text-gray-200">{entry.containerName}</div>
                                  <div>
                                    {entry.item.quantity ?? 0}{entry.item.unit?.trim() ? ` ${entry.item.unit.trim()}` : ''} on hand
                                  </div>
                                  {entry.item.threshold != null ? <div>Threshold: {entry.item.threshold}</div> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openItemComposer(item.id)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                              item.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)
                                ? 'bg-blue-500 text-white hover:bg-blue-600'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                            disabled={!item.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)}
                          >
                            {item.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX) ? 'Edit' : 'Built-in'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )
        ) : (
          containerEntries.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-900/30">
              No containers added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {containerEntries.map((container) => {
                const locationLink = getLocationLink(container);
                const lowItems = container.items.filter((item) => {
                  const itemName = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries)?.name ?? item.itemTemplateRef;
                  return lowStockLabels.has(itemName) || (item.threshold != null && item.quantity != null && item.quantity <= item.threshold);
                });
                const expanded = expandedContainerId === container.id;
                const selectedHome = locationLink?.targetKind === 'home-room' ? homeResources.find((entry) => entry.id === locationLink.targetResourceId) : null;
                const selectedVehicleId = locationLink?.targetKind === 'vehicle' ? locationLink.targetResourceId : '';

                return (
                  <article key={container.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                    <button
                      type="button"
                      onClick={() => setExpandedContainerId((prev) => (prev === container.id ? null : container.id))}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white dark:bg-gray-800">
                        <IconDisplay iconKey={container.icon || 'inventory'} size={24} className="h-6 w-6 object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`truncate text-sm font-semibold ${lowItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>
                            {container.name}
                          </span>
                          {container.carryTask ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                              Carry task
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>{container.items.length} item{container.items.length === 1 ? '' : 's'}</span>
                          {locationLink ? <span>Placed in {describeContainerLocation(locationLink)}</span> : <span>Unplaced</span>}
                        </div>
                      </div>
                      {lowItems.length > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          {lowItems.length} low
                        </span>
                      ) : null}
                    </button>

                    {expanded ? (
                      <div className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                          <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Contents</p>
                              <span className="text-xs text-gray-400 dark:text-gray-500">{container.items.length}</span>
                            </div>
                            <div className="mt-2 space-y-2">
                              {container.items.length === 0 ? (
                                <p className="text-xs italic text-gray-400">No items in container.</p>
                              ) : container.items.map((item) => {
                                const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries);
                                const templateKind = getItemTemplateByRef(item.itemTemplateRef)?.kind ?? resolved?.kind ?? 'consumable';
                                const taskDetails = templateKind === 'facility'
                                  ? (item.recurringTasks ?? []).map((task) => {
                                      const display = resolveTaskDisplay(task.taskTemplateRef, item.itemTemplateRef);
                                      return `${display.name}: ${(task.recurrenceMode ?? 'never') === 'recurring' ? `${describeTaskRecurrence(task.recurrence)} · ${describeReminder(task.reminderLeadDays ?? 7)}` : 'Intermittent'}`;
                                    })
                                  : [];
                                return (
                                  <div key={item.id} className="rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                      {resolved?.icon ? <IconDisplay iconKey={resolved.icon} size={14} className="h-3.5 w-3.5 shrink-0 object-contain" /> : null}
                                      <span>{resolved?.name ?? item.itemTemplateRef}</span>
                                    </div>
                                    {templateKind === 'consumable' ? (
                                      <div className="mt-1">
                                        {item.quantity ?? 0}{item.unit?.trim() ? ` ${item.unit.trim()}` : ''} on hand
                                        {item.threshold != null ? ` · Threshold ${item.threshold}` : ''}
                                      </div>
                                    ) : taskDetails.length > 0 ? (
                                      <div className="mt-1 space-y-1">
                                        {taskDetails.map((detail) => <div key={`${item.id}-${detail}`}>{detail}</div>)}
                                      </div>
                                    ) : (
                                      <div className="mt-1">Facility item</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Placement</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateContainerLocation(container.id, null)}
                                  className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const firstHome = homeResources[0];
                                    if (firstHome) setContainerHome(container, firstHome.id);
                                  }}
                                  className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
                                >
                                  Choose Home + Room
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const firstVehicle = vehicleResources[0];
                                    if (firstVehicle) setContainerVehicle(container, firstVehicle.id);
                                  }}
                                  className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
                                >
                                  Choose Vehicle
                                </button>
                              </div>

                              <div className="mt-3 space-y-2 text-xs text-gray-500 dark:text-gray-400">
                                <div className="space-y-1">
                                  <label className="font-medium text-gray-600 dark:text-gray-300">Home</label>
                                  <select
                                    value={locationLink?.targetKind === 'home-room' ? locationLink.targetResourceId : ''}
                                    onChange={(event) => setContainerHome(container, event.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  >
                                    <option value="">No home placement</option>
                                    {homeResources.map((home) => (
                                      <option key={home.id} value={home.id}>{home.name}</option>
                                    ))}
                                  </select>
                                </div>

                                {selectedHome ? (
                                  <div className="space-y-1">
                                    <label className="font-medium text-gray-600 dark:text-gray-300">Room</label>
                                    <select
                                      value={locationLink?.targetKind === 'home-room' ? (locationLink.targetRoomId ?? '') : ''}
                                      onChange={(event) => setContainerRoom(container, event.target.value)}
                                      className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                    >
                                      <option value="">No specific room</option>
                                        {getHomeRoomReferences(selectedHome).map((room) => (
                                        <option key={room.id} value={room.id}>{room.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                ) : null}

                                <div className="space-y-1">
                                  <label className="font-medium text-gray-600 dark:text-gray-300">Vehicle</label>
                                  <select
                                    value={selectedVehicleId}
                                    onChange={(event) => setContainerVehicle(container, event.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                  >
                                    <option value="">No vehicle placement</option>
                                    {vehicleResources.map((vehicle) => (
                                      <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>
                                    ))}
                                  </select>
                                </div>

                                <div className="rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-900/60">
                                  {locationLink ? `Current placement: ${describeContainerLocation(locationLink)}` : 'Current placement: none'}
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Carry Task</p>
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {container.carryTask ? (
                                  <div className="space-y-1">
                                    <div className="font-medium text-gray-700 dark:text-gray-200">{container.carryTask.name}</div>
                                    <div>
                                      {(container.carryTask.recurrenceMode ?? 'never') === 'recurring'
                                        ? `${describeTaskRecurrence(container.carryTask.recurrence)} · ${describeReminder(container.carryTask.reminderLeadDays ?? 7)}`
                                        : 'Intermittent icon on seed date'}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="italic">No carry task configured.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onEditContainer(resource, container.id)}
                            className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
                          >
                            Edit Container
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )
        )}
      </div>

      {showAddItemPanel ? (
        <AddItemPanel
          resource={resource}
          onClose={() => setShowAddItemPanel(false)}
          onItemAdded={(itemTemplateRef) => {
            setActiveTab('items');
            setExpandedItemId(itemTemplateRef);
          }}
        />
      ) : null}
    </section>
  );
}
