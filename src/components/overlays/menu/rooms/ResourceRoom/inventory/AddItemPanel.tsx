import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  CUSTOM_ITEM_TEMPLATE_PREFIX,
  getItemTemplateByRef,
  itemLibrary,
  makeCustomItemTemplateRef,
  type ItemCategory,
  type ItemKind,
  type ItemTemplate,
} from '../../../../../../coach/ItemLibrary';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import type { InventoryItemTemplate, InventoryResource, ItemInstance, ItemRecurringTask } from '../../../../../../types/resource';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { IconPicker } from '../../../../../shared/IconPicker';
import { PopupShell } from '../../../../../shared/popups/PopupShell';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../../../../../utils/inventoryItems';

type AddItemTab = 'library' | 'mine' | 'new';

const CATEGORY_ORDER: ItemCategory[] = [
  'kitchen',
  'bedroom',
  'cleaning',
  'garden',
  'vehicle',
  'bathroom',
  'workspace',
];

const TAB_LABELS: Array<{ id: AddItemTab; label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'mine', label: 'My Items' },
  { id: 'new', label: 'New Item' },
];

interface AddItemPanelProps {
  resource: InventoryResource;
  containerId?: string;
  onClose: () => void;
  onItemAdded?: (itemTemplateRef: string) => void;
  onItemInstanceAdded?: (item: ItemInstance) => void;
}

function buildTaskTemplates(itemTemplateRef: string): ItemRecurringTask[] {
  const template = getItemTemplateByRef(itemTemplateRef);
  if (!template) return [];

  const taskRefs = new Set<string>();
  for (const task of template.builtInTasks ?? []) {
    if (task.taskTemplateRef) {
      taskRefs.add(task.taskTemplateRef);
    }
  }

  return [...taskRefs].map((taskTemplateRef) => ({
    id: uuidv4(),
    taskTemplateRef,
    recurrenceMode: 'never' as const,
    recurrence: {
      frequency: 'weekly',
      interval: 1,
      days: [],
      monthlyDay: null,
      seedDate: new Date().toISOString().slice(0, 10),
      endsOn: null,
    },
    reminderLeadDays: 7,
  }));
}

function buildLooseItemInstance(templateRef: string, kind: ItemKind): ItemInstance {
  return {
    id: uuidv4(),
    itemTemplateRef: templateRef,
    quantity: kind === 'consumable' ? 1 : undefined,
    recurringTasks: kind === 'facility' ? buildTaskTemplates(templateRef) : undefined,
  };
}

function normalizeCustomTemplate(template: InventoryItemTemplate): InventoryItemTemplate {
  return {
    ...template,
    isCustom: template.isCustom ?? template.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX),
  };
}

export function AddItemPanel({ resource, containerId, onClose, onItemAdded, onItemInstanceAdded }: AddItemPanelProps) {
  const [activeTab, setActiveTab] = useState<AddItemTab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [draftIcon, setDraftIcon] = useState('inventory');
  const [draftName, setDraftName] = useState('');
  const [draftKind, setDraftKind] = useState<ItemKind>('consumable');
  const [draftCategory, setDraftCategory] = useState<ItemCategory>('workspace');
  const [draftDescription, setDraftDescription] = useState('');
  const [error, setError] = useState('');

  const resources = useResourceStore((state) => state.resources);
  const setResource = useResourceStore((state) => state.setResource);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);

  const userTemplates = useMemo(
    () => getUserInventoryItemTemplates(user).map(normalizeCustomTemplate),
    [user],
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const libraryItems = useMemo(
    () => itemLibrary.filter((item) => item.name.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch],
  );
  const customItems = useMemo(
    () => userTemplates
      .filter((item) => item.isCustom === true || item.id.startsWith(CUSTOM_ITEM_TEMPLATE_PREFIX))
      .filter((item) => item.name.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch, userTemplates],
  );
  const groupedLibraryItems = useMemo(
    () => CATEGORY_ORDER.map((category) => ({
      category,
      items: libraryItems.filter((item) => item.category === category),
    })).filter((group) => group.items.length > 0),
    [libraryItems],
  );

  const ensureInventoryLinked = (inventoryId: string) => {
    if (!user) return;
    const linkedInventoryIds = user.resources.inventory.filter((id) => resources[id]?.type === 'inventory');
    return linkedInventoryIds.includes(inventoryId)
      ? linkedInventoryIds
      : [...linkedInventoryIds, inventoryId];
  };

  const addTemplateToInventory = (template: InventoryItemTemplate, kindOverride?: ItemKind) => {
    if (!user) return;

    const normalizedTemplate = normalizeCustomTemplate(template);
    const nextTemplates = mergeInventoryItemTemplates(
      userTemplates,
      [normalizedTemplate],
    );
    const itemKind = kindOverride
      ?? getItemTemplateByRef(normalizedTemplate.id)?.kind
      ?? normalizedTemplate.kind
      ?? 'consumable';
    const nextItem = buildLooseItemInstance(normalizedTemplate.id, itemKind);
    if (onItemInstanceAdded) {
      onItemInstanceAdded(nextItem);
    } else {
      const nextResource: InventoryResource = {
        ...resource,
        updatedAt: new Date().toISOString(),
        items: containerId ? resource.items : [...resource.items, nextItem],
        containers: containerId
          ? (resource.containers ?? []).map((container) => (
              container.id === containerId
                ? {
                    ...container,
                    items: [...container.items, nextItem],
                  }
                : container
            ))
          : resource.containers,
      };

      setResource(nextResource);
    }
    setUser({
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: nextTemplates,
      },
      resources: {
        ...user.resources,
        inventory: ensureInventoryLinked(resource.id) ?? user.resources.inventory,
      },
    });
    onItemAdded?.(normalizedTemplate.id);
    onClose();
  };

  const handleLibraryAdd = (item: ItemTemplate) => {
    addTemplateToInventory({
      id: item.id,
      name: item.name,
      icon: item.icon,
      kind: item.kind,
      category: item.category,
      description: item.description,
      isCustom: false,
    }, item.kind);
  };

  const handleCreateItem = () => {
    if (!draftName.trim()) {
      setError('Name is required.');
      return;
    }

    const nextTemplate: InventoryItemTemplate = {
      id: makeCustomItemTemplateRef(draftName.trim(), draftKind, draftIcon || 'inventory'),
      name: draftName.trim(),
      icon: draftIcon || 'inventory',
      kind: draftKind,
      category: draftCategory,
      description: draftDescription.trim() || 'Custom inventory item',
      isCustom: true,
      customTaskTemplates: [],
    };

    addTemplateToInventory(nextTemplate, draftKind);
  };

  const renderItemRow = (
    item: {
      id: string;
      name: string;
      icon: string;
      kind?: ItemKind;
      category?: string;
      description?: string;
    },
    options?: { added?: boolean; onClick?: () => void },
  ) => (
    <button
      key={item.id}
      type="button"
      onClick={options?.onClick}
      className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800">
          <IconDisplay iconKey={item.icon || 'inventory'} size={22} className="h-5.5 w-5.5 object-contain" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
            {item.category ? <span className="capitalize">{item.category}</span> : null}
            {item.kind ? <span className="capitalize">{item.kind}</span> : null}
          </div>
        </div>
      </div>
      {options?.added ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          <IconDisplay iconKey="check" size={12} className="h-3 w-3 object-contain" />
          Added
        </span>
      ) : (
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          Add
        </span>
      )}
    </button>
  );

  return (
    <PopupShell title="Add Item" onClose={onClose} size="large">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
          {TAB_LABELS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setError('');
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(activeTab === 'library' || activeTab === 'mine') ? (
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={activeTab === 'library' ? 'Search library items' : 'Search my items'}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        ) : null}

        {activeTab === 'library' ? (
          groupedLibraryItems.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No matching library items.</p>
          ) : (
            <div className="space-y-4">
              {groupedLibraryItems.map((group) => (
                <section key={group.category} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    {group.category}
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item) => renderItemRow(item, {
                      added: userTemplates.some((template) => template.id === item.id),
                      onClick: () => handleLibraryAdd(item),
                    }))}
                  </div>
                </section>
              ))}
            </div>
          )
        ) : null}

        {activeTab === 'mine' ? (
          customItems.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No custom items yet</p>
          ) : (
            <div className="space-y-2">
              {customItems.map((item) => renderItemRow(item, {
                added: true,
                onClick: () => addTemplateToInventory(item, item.kind ?? 'consumable'),
              }))}
            </div>
          )
        ) : null}

        {activeTab === 'new' ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <IconPicker value={draftIcon} onChange={setDraftIcon} align="left" />
              <label className="space-y-1">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Name</span>
                <input
                  type="text"
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    setError('');
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Kind</span>
                <select
                  value={draftKind}
                  onChange={(event) => setDraftKind(event.target.value as ItemKind)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="consumable">Consumable</option>
                  <option value="facility">Facility</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Category</span>
                <select
                  value={draftCategory}
                  onChange={(event) => setDraftCategory(event.target.value as ItemCategory)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {CATEGORY_ORDER.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1">
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Description</span>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </label>

            {error ? <p className="text-sm text-red-500">{error}</p> : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCreateItem}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
              >
                Add
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </PopupShell>
  );
}
