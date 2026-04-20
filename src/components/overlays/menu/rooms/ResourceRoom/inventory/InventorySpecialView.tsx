import { useMemo, useState } from 'react';
import type { HomeResource, InventoryContainerLink, InventoryCustomTaskTemplate, InventoryResource, VehicleResource } from '../../../../../../types/resource';
import { isDoc } from '../../../../../../types/resource';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { Task } from '../../../../../../types/task';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { taskTemplateLibrary } from '../../../../../../coach';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../../utils/inventoryItems';
import {
  CUSTOM_ITEM_TEMPLATE_PREFIX,
  getItemTaskTemplateMeta,
  getItemTemplateByRef,
  makeCustomItemTemplateRef,
  type ItemKind,
} from '../../../../../../coach/ItemLibrary';

interface InventorySpecialViewProps {
  resource: InventoryResource;
  onAddContainer: (resource: InventoryResource) => void;
  onEditContainer: (resource: InventoryResource, containerId: string) => void;
}

export function InventorySpecialView({ resource, onAddContainer, onEditContainer }: InventorySpecialViewProps) {
  const scheduleTasks = useScheduleStore((s) => s.tasks) as Record<string, Task>;
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const gtdTaskIds = new Set(user?.lists.gtdList ?? []);
  const [showAddItemPopup, setShowAddItemPopup] = useState(false);
  const [draftItemName, setDraftItemName] = useState('');
  const [draftItemIcon, setDraftItemIcon] = useState('inventory');
  const [draftItemKind, setDraftItemKind] = useState<ItemKind>('consumable');
  const [draftTaskTemplates, setDraftTaskTemplates] = useState<InventoryCustomTaskTemplate[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const itemEntries = useMemo(
    () => mergeInventoryItemTemplates(getUserInventoryItemTemplates(user), resource.itemTemplates),
    [resource.itemTemplates, user],
  );
  const containerEntries = resource.containers ?? [];

  // Set of item template IDs that have at least one doc linked
  const itemIdsWithDoc = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of Object.values(resources)) {
      if (!isDoc(entry)) continue;
      // Manual: linkedResourceRef may point to an item template ID
      if (entry.docType === 'manual' && entry.linkedResourceRef) {
        ids.add(entry.linkedResourceRef);
      }
      // Recipe: ingredients reference item template IDs
      if (entry.docType === 'recipe') {
        for (const ing of entry.recipeIngredients ?? []) {
          if (ing.itemRef) ids.add(ing.itemRef);
        }
      }
    }
    return ids;
  }, [resources]);
  const selectedItem = selectedItemId ? resolveInventoryItemTemplate(selectedItemId, itemEntries) : null;
  const editingItem = editingItemId ? itemEntries.find((item) => item.id === editingItemId) ?? null : null;
  const selectedContainer = selectedContainerId
    ? containerEntries.find((container) => container.id === selectedContainerId) ?? null
    : null;

  const lowStockLabels = new Set(
    Object.values(scheduleTasks)
      .filter((task) => task.resourceRef === resource.id && task.completionState === 'pending' && gtdTaskIds.has(task.id))
      .map((task) => (task.resultFields as Record<string, string> | undefined)?.itemName)
      .filter((itemName): itemName is string => Boolean(itemName)),
  );

  function handleSaveItem() {
    if (!user || !draftItemName.trim()) return;

    const nextItem = {
      id: makeCustomItemTemplateRef(draftItemName.trim(), draftItemKind, draftItemIcon || 'inventory'),
      name: draftItemName.trim(),
      icon: draftItemIcon || 'inventory',
      kind: draftItemKind,
      customTaskTemplates: draftItemKind === 'facility'
        ? draftTaskTemplates.filter((taskTemplate) => taskTemplate.name.trim().length > 0)
        : [],
    };

    const nextTemplates = mergeInventoryItemTemplates(
      user.lists.inventoryItemTemplates,
      [nextItem],
    );

    setUser({
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: nextTemplates,
      },
    });

    setDraftItemName('');
    setDraftItemIcon('inventory');
    setDraftItemKind('consumable');
    setDraftTaskTemplates([]);
    setShowAddItemPopup(false);
  }

  function addDraftTaskTemplate() {
    setDraftTaskTemplates((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', icon: 'task' },
    ]);
  }

  function updateDraftTaskTemplate(id: string, patch: Partial<InventoryCustomTaskTemplate>) {
    setDraftTaskTemplates((prev) =>
      prev.map((taskTemplate) => (taskTemplate.id === id ? { ...taskTemplate, ...patch } : taskTemplate)),
    );
  }

  function removeDraftTaskTemplate(id: string) {
    setDraftTaskTemplates((prev) => prev.filter((taskTemplate) => taskTemplate.id !== id));
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

  function resolveSelectedItemTaskDisplay(taskTemplateRef: string) {
    const customTask = itemEntries
      .find((item) => item.id === selectedItem?.id)
      ?.customTaskTemplates?.find((taskTemplate) => taskTemplate.name === taskTemplateRef);
    if (customTask) {
      return {
        name: customTask.name,
        icon: customTask.icon || 'task',
      };
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

  function resolveContainerTaskDisplay(taskTemplateRef: string, itemTemplateRef: string) {
    const customTemplate = itemEntries.find((item) => item.id === itemTemplateRef);
    const customTask = customTemplate?.customTaskTemplates?.find((taskTemplate) => taskTemplate.name === taskTemplateRef);
    if (customTask) {
      return {
        name: customTask.name,
        icon: customTask.icon || 'task',
      };
    }

    return resolveSelectedItemTaskDisplay(taskTemplateRef);
  }

  function describeTaskRecurrence(rule: { frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval: number; days: string[]; monthlyDay?: number | null }) {
    const interval = Math.max(1, rule.interval || 1);
    switch (rule.frequency) {
      case 'daily':
        return interval === 1 ? 'Daily' : `Every ${interval} days`;
      case 'weekly': {
        const dayLabels: Record<string, string> = {
          sun: 'Su',
          mon: 'Mo',
          tue: 'Tu',
          wed: 'We',
          thu: 'Th',
          fri: 'Fr',
          sat: 'Sa',
        };
        const days = rule.days.length > 0
          ? ` · ${rule.days.map((day) => dayLabels[day] ?? day).join(' ')}`
          : '';
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

  function beginEditItem(itemId: string) {
    const item = itemEntries.find((entry) => entry.id === itemId);
    if (!item) return;
    setDraftItemName(item.name);
    setDraftItemIcon(item.icon || 'inventory');
    setDraftItemKind(item.kind ?? 'consumable');
    setDraftTaskTemplates(item.customTaskTemplates ?? []);
    setEditingItemId(itemId);
    setSelectedItemId(null);
    setShowAddItemPopup(true);
  }

  function handleSaveOrUpdateItem() {
    if (!user || !draftItemName.trim()) return;

    if (!editingItemId) {
      handleSaveItem();
      return;
    }

    const nextTemplates = mergeInventoryItemTemplates(
      (user.lists.inventoryItemTemplates ?? [])
        .filter((item) => item.id !== editingItemId),
      [{
        id: makeCustomItemTemplateRef(draftItemName.trim(), draftItemKind, draftItemIcon || 'inventory'),
        name: draftItemName.trim(),
        icon: draftItemIcon || 'inventory',
        kind: draftItemKind,
        customTaskTemplates: draftItemKind === 'facility'
          ? draftTaskTemplates.filter((taskTemplate) => taskTemplate.name.trim().length > 0)
          : [],
      }],
    );
    const nextTemplate = nextTemplates.find((item) => item.name === draftItemName.trim() && item.icon === (draftItemIcon || 'inventory'));

    setUser({
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: nextTemplates,
      },
    });

    if (nextTemplate) {
      setResource({
        ...resource,
        updatedAt: new Date().toISOString(),
        items: resource.items.map((item) =>
          item.itemTemplateRef === editingItemId ? { ...item, itemTemplateRef: nextTemplate.id } : item,
        ),
        containers: (resource.containers ?? []).map((container) => ({
          ...container,
          items: container.items.map((item) =>
            item.itemTemplateRef === editingItemId ? { ...item, itemTemplateRef: nextTemplate.id } : item,
          ),
        })),
      });
    }

    setDraftItemName('');
    setDraftItemIcon('inventory');
    setDraftItemKind('consumable');
    setDraftTaskTemplates([]);
    setEditingItemId(null);
    setShowAddItemPopup(false);
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
      containers: (resource.containers ?? []).map((container) => ({
        ...container,
        items: container.items.filter((item) => item.itemTemplateRef !== itemId),
      })),
    });
    setSelectedItemId(null);
  }

  function closeContainerPopup() {
    setSelectedContainerId(null);
  }

  function describeContainerLocation(link: InventoryContainerLink) {
    if (link.targetKind === 'vehicle') {
      const vehicle = resources[link.targetResourceId] as VehicleResource | undefined;
      return vehicle?.name ?? 'Vehicle';
    }

    const home = resources[link.targetResourceId] as HomeResource | undefined;
    const room = home?.rooms?.find((entry) => entry.id === link.targetRoomId);
    if (home?.name && room?.name) return `${home.name} - ${room.name}`;
    return room?.name ?? home?.name ?? 'Home room';
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="grid min-h-0 flex-1 grid-rows-2 gap-3">
        <section className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Available Items</h3>
            <button
              type="button"
              onClick={() => setShowAddItemPopup(true)}
              className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
            >
              Add Item
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {itemEntries.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800/50">
                No items added yet.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {itemEntries.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    className="relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 py-2 text-center transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    {itemIdsWithDoc.has(item.id) && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/60" title="Has linked doc">
                        <IconDisplay iconKey="doc" size={10} className="h-2.5 w-2.5 object-contain opacity-70" alt="doc" />
                      </span>
                    )}
                    <IconDisplay iconKey={item.icon || 'inventory'} size={28} className="h-7 w-7 object-contain" />
                    <span className="text-xs font-medium leading-tight text-gray-800 dark:text-gray-100">
                      {item.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Open Containers</h3>
            <button
              type="button"
              onClick={() => onAddContainer(resource)}
              className="rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600"
            >
              Add Container
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {containerEntries.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800/50">
                No containers added yet.
              </div>
            ) : (
              <div className="space-y-2">
                {containerEntries.map((container) => {
                  const locationLink = container.links?.find((link) => link.relationship === 'location');
                  const lowItems = container.items.filter((item) => {
                    const itemName = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries)?.name ?? item.itemTemplateRef;
                    return lowStockLabels.has(itemName) || (item.threshold != null && item.quantity != null && item.quantity <= item.threshold);
                  });
                  const itemSummary = container.items
                    .slice(0, 3)
                    .map((item) => resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries)?.name ?? item.itemTemplateRef)
                    .join(', ');

                  return (
                    <button
                      key={container.id}
                      type="button"
                      onClick={() => setSelectedContainerId(container.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                    >
                      <IconDisplay iconKey={container.icon || 'inventory'} size={18} className="h-[18px] w-[18px] shrink-0 object-contain" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className={`text-sm font-medium ${lowItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>
                            {container.name}
                          </div>
                          {locationLink ? (
                            <span
                              title={describeContainerLocation(locationLink)}
                              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
                            >
                              <IconDisplay iconKey="location_point" size={11} className="h-[11px] w-[11px] shrink-0 object-contain" />
                              <IconDisplay
                                iconKey={locationLink.targetKind === 'vehicle' ? 'vehicle' : 'home'}
                                size={11}
                                className="h-[11px] w-[11px] shrink-0 object-contain"
                              />
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {container.items.length === 0 ? 'No items in container' : itemSummary}
                          {container.items.length > 3 ? ` +${container.items.length - 3} more` : ''}
                        </div>
                      </div>
                      {lowItems.length > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          {lowItems.length} Low
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {showAddItemPopup ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAddItemPopup(false)}>
          <div
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{editingItem ? 'Edit Item' : 'Add Item'}</h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddItemPopup(false);
                  setEditingItemId(null);
                  setDraftItemName('');
                  setDraftItemIcon('inventory');
                  setDraftItemKind('consumable');
                  setDraftTaskTemplates([]);
                }}
                className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                Close
              </button>
            </div>

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

            <div className="mt-4 flex flex-wrap gap-2">
              {(['consumable', 'facility'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setDraftItemKind(kind)}
                  className={draftItemKind === kind
                    ? 'rounded-full bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'}
                >
                  {kind === 'consumable' ? 'Consumable' : 'Facility'}
                </button>
              ))}
            </div>

            {draftItemKind === 'facility' ? (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Custom task templates</p>
                  <button
                    type="button"
                    onClick={addDraftTaskTemplate}
                    className="text-xs font-medium text-blue-500 hover:text-blue-600"
                  >
                    + Add task
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  {draftTaskTemplates.length === 0 ? (
                    <p className="text-xs italic text-gray-400">No custom tasks added yet.</p>
                  ) : draftTaskTemplates.map((taskTemplate) => (
                    <div key={taskTemplate.id} className="grid grid-cols-[auto_1fr_auto] items-end gap-2 rounded-lg bg-gray-50 px-3 py-3 dark:bg-gray-700">
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
                      <button
                        type="button"
                        onClick={() => removeDraftTaskTemplate(taskTemplate.id)}
                        className="mb-1 text-xs text-gray-400 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  These create simple check-style task templates for the item.
                </p>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSaveOrUpdateItem}
                disabled={!draftItemName.trim() || (draftItemKind === 'facility' && draftTaskTemplates.some((taskTemplate) => !taskTemplate.name.trim()))}
                className={draftItemName.trim() && (draftItemKind === 'consumable' || !draftTaskTemplates.some((taskTemplate) => !taskTemplate.name.trim()))
                  ? 'rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600'
                  : 'rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-400 dark:bg-gray-700'}
              >
                {editingItem ? 'Save Changes' : 'Save Item'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedItem ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedItemId(null)}>
          <div
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-900/40">
                  <IconDisplay iconKey={selectedItem.icon || 'inventory'} size={30} className="h-[30px] w-[30px] object-contain" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{selectedItem.name}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedItem.description}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemId(null)}
                className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                Close
              </button>
            </div>

            {(selectedItem?.builtInTasks?.length || selectedItem?.associatedTaskTemplateRef) ? (
              <div className="mt-4 rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Task Templates</p>
                <div className="mt-2 space-y-1">
                  {selectedItem?.builtInTasks?.map((task) => {
                    const taskDisplay = resolveSelectedItemTaskDisplay(task.taskTemplateRef);
                    return (
                      <div key={`${selectedItem.id}-${task.taskTemplateRef}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <IconDisplay iconKey={taskDisplay.icon} size={14} className="h-[14px] w-[14px] shrink-0 object-contain" />
                        <span>{taskDisplay.name}</span>
                      </div>
                    );
                  })}
                  {selectedItem?.associatedTaskTemplateRef ? (() => {
                    const taskDisplay = resolveSelectedItemTaskDisplay(selectedItem.associatedTaskTemplateRef);
                    return (
                      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <IconDisplay iconKey={taskDisplay.icon} size={14} className="h-[14px] w-[14px] shrink-0 object-contain" />
                        <span>{taskDisplay.name}</span>
                      </div>
                    );
                  })() : null}
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (selectedItem.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)) {
                    beginEditItem(selectedItem.id);
                  }
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  selectedItem.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX)
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {selectedItem.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX) ? 'Edit' : 'Required Attributes'}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveItem(selectedItem.id)}
                className="rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedContainer ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={closeContainerPopup}>
          <div
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800"
            onClick={(event) => event.stopPropagation()}
          >
            {(() => {
              const locationLink = selectedContainer.links?.find((link) => link.relationship === 'location');
              return (
                <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-900/40">
                  <IconDisplay iconKey={selectedContainer.icon || 'inventory'} size={30} className="h-[30px] w-[30px] object-contain" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{selectedContainer.name}</h3>
                  {locationLink ? (
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                      <IconDisplay iconKey="location_point" size={12} className="h-3 w-3 shrink-0 object-contain" />
                      <IconDisplay
                        iconKey={locationLink.targetKind === 'vehicle' ? 'vehicle' : 'home'}
                        size={12}
                        className="h-3 w-3 shrink-0 object-contain"
                      />
                      <span>{describeContainerLocation(locationLink)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={closeContainerPopup}
                className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                Close
              </button>
            </div>
                </>
              );
            })()}

            <div className="mt-4 rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Contents</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedContainer.items.length} item{selectedContainer.items.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="mt-2 space-y-2">
                {selectedContainer.items.length === 0 ? (
                  <p className="text-sm text-gray-400">No items in container.</p>
                ) : selectedContainer.items.map((item) => {
                  const resolved = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries);
                  const templateKind = getItemTemplateByRef(item.itemTemplateRef)?.kind ?? resolved?.kind ?? 'consumable';
                  const isLow = item.threshold != null && item.quantity != null && item.quantity <= item.threshold;
                  const detailLines: Array<{ text: string; icon?: string }> = templateKind === 'consumable'
                    ? [
                        { text: `On hand: ${item.quantity}${item.unit?.trim() ? ` ${item.unit.trim()}` : ''}` },
                        ...(item.threshold != null ? [{ text: `Min on hand: ${item.threshold}` }] : []),
                      ]
                    : (item.recurringTasks ?? []).length > 0
                      ? (item.recurringTasks ?? []).map((task) => {
                          const taskDisplay = resolveContainerTaskDisplay(task.taskTemplateRef, item.itemTemplateRef);
                          return {
                            text: `${taskDisplay.name}: ${
                              (task.recurrenceMode ?? 'never') === 'recurring'
                                ? `${describeTaskRecurrence(task.recurrence)} · ${describeReminder(task.reminderLeadDays ?? 7)}`
                                : 'Intermittent'
                            }`,
                            icon: taskDisplay.icon,
                          };
                        })
                      : [{ text: 'Facility item' }];
                  return (
                    <div key={item.id} className="flex items-start gap-2 rounded-xl bg-white px-3 py-3 dark:bg-gray-800">
                      {resolved?.icon ? <IconDisplay iconKey={resolved.icon} size={16} className="h-4 w-4 shrink-0 object-contain" /> : null}
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${isLow ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>
                          {resolved?.name ?? item.itemTemplateRef}
                        </div>
                        <div className="mt-1 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                          {detailLines.map((line, index) => (
                            <div key={`${item.id}-detail-${index}`} className="flex items-start gap-1.5 leading-relaxed">
                              {line.icon ? <IconDisplay iconKey={line.icon} size={12} className="mt-0.5 h-3 w-3 shrink-0 object-contain" /> : null}
                              <span>{line.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onEditContainer(resource, selectedContainer.id)}
                className="rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={closeContainerPopup}
                className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}




