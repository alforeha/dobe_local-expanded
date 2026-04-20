import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { itemLibrary, type ItemCategory, type ItemKind, type ItemTemplate } from '../../../../coach/ItemLibrary';
import { useResourceStore } from '../../../../stores/useResourceStore';
import { useUserStore } from '../../../../stores/useUserStore';
import type { InventoryResource, ItemInstance, Resource } from '../../../../types/resource';
import { isInventory } from '../../../../types/resource';
import { IconDisplay } from '../../../shared/IconDisplay';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../../../utils/inventoryItems';

type OwnedFilter = 'all' | 'used';

const CATEGORIES: Array<ItemCategory | 'all'> = [
  'all',
  'kitchen',
  'bedroom',
  'cleaning',
  'garden',
  'vehicle',
  'bathroom',
  'workspace',
];

  const FACILITY_TASK_STUBS: Record<string, string[]> = {
    'item-bed': ['Make Bed', 'Clean Sheets'],
    'item-car': ['Weekly Car Check'],
    'item-oven': ['Clean Oven'],
    'item-garden': ['Water Plants'],
    'item-washing-machine': ['Run Wash'],
    'item-fridge': ['Clean Fridge'],
    'item-desk': ['Clear Desk'],
    'item-shower': ['Clean Shower'],
    'item-lawnmower': ['Mow Lawn'],
    'item-bicycle': ['Check Tyre Pressure'],
  };

function isInventoryResource(resource: Resource | undefined): resource is InventoryResource {
  return !!resource && isInventory(resource) && Array.isArray(resource.items);
}

function humanizeTaskRef(taskRef: string): string {
  return taskRef
    .replace(/^item-tmpl-/, '')
    .replace(/-\d+$/, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function RecommendedItemsTab() {
  const resources = useResourceStore((state) => state.resources);
  const setResource = useResourceStore((state) => state.setResource);
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);

  const [search, setSearch] = useState('');
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('all');
  const [kindFilter, setKindFilter] = useState<ItemKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ItemCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const inventoryResources = useMemo(
    () => Object.values(resources).filter(isInventoryResource),
    [resources],
  );
  const userItemTemplates = mergeInventoryItemTemplates(
    getUserInventoryItemTemplates(user),
    ...inventoryResources.map((resource) => resource.itemTemplates),
  );

  const ownership = useMemo(() => {
    const ownershipMap: Record<string, { item: ItemInstance; resource: InventoryResource }[]> = {};

    for (const itemTemplate of userItemTemplates) {
      if (!ownershipMap[itemTemplate.id]) ownershipMap[itemTemplate.id] = [];
    }

    for (const resource of inventoryResources) {
      for (const item of resource.items) {
        if (!ownershipMap[item.itemTemplateRef]) ownershipMap[item.itemTemplateRef] = [];
        ownershipMap[item.itemTemplateRef].push({ item, resource });
      }
    }

    return ownershipMap;
  }, [inventoryResources, userItemTemplates]);

  const visible = useMemo(() => {
    return itemLibrary.filter((item) => {
      const owned = userItemTemplates.some((template) => template.id === item.id);
      if (ownedFilter === 'used' && !owned) return false;
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        if (!item.name.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [categoryFilter, kindFilter, ownedFilter, search, userItemTemplates]);

  const expandedItem = visible.find((item) => item.id === expandedId) ?? null;

  function handleAddToInventory(item: ItemTemplate) {
    if (!user) return;

    const nextItemTemplates = [...(user.lists.inventoryItemTemplates ?? [])];
    if (!nextItemTemplates.some((entry) => entry.id === item.id)) {
      nextItemTemplates.push({
        id: item.id,
        name: item.name,
        icon: item.icon,
      });
    }

    let nextInventoryResources = user.resources.inventory.filter((resourceId) => {
      const resource = resources[resourceId];
      return resource?.type === 'inventory';
    });
    if (inventoryResources.length === 0) {
      const now = new Date().toISOString();
      const starterInventory: InventoryResource = {
        id: uuidv4(),
        type: 'inventory',
        name: 'Inventory',
        icon: 'inventory',
        description: '',
        attachments: [],
        log: [],
        createdAt: now,
        updatedAt: now,
        items: [],
        itemTemplates: undefined,
        notes: [],
        links: undefined,
        sharedWith: null,
      };
      setResource(starterInventory);
      nextInventoryResources = nextInventoryResources.includes(starterInventory.id)
        ? nextInventoryResources
        : [...nextInventoryResources, starterInventory.id];
    }

    setUser({
      ...user,
      lists: {
        ...user.lists,
        inventoryItemTemplates: nextItemTemplates,
      },
      resources: {
        ...user.resources,
        inventory: nextInventoryResources,
      },
    });
    setExpandedId(null);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search items..."
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 pr-9 text-sm text-gray-800 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear item search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-lg leading-none text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                >
                  ×
                </button>
              ) : null}
            </div>
            <TogglePill label="Used" active={ownedFilter === 'used'} onClick={() => setOwnedFilter('used')} />
            <TogglePill label="All" active={ownedFilter === 'all'} onClick={() => setOwnedFilter('all')} />
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex flex-wrap gap-2">
              <TogglePill label="Consumable" active={kindFilter === 'consumable'} onClick={() => setKindFilter('consumable')} />
              <TogglePill label="Facility" active={kindFilter === 'facility'} onClick={() => setKindFilter('facility')} />
              <TogglePill label="Both" active={kindFilter === 'all'} onClick={() => setKindFilter('all')} />
            </div>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as ItemCategory | 'all')}
              className="ml-auto min-h-10 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All Tags' : category}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-4 pb-4">
        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No items match the current filters.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((item) => {
            const owned = userItemTemplates.some((template) => template.id === item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setExpandedId((current) => current === item.id ? null : item.id);
                }}
                className={`aspect-square overflow-hidden rounded-2xl border p-3 text-center shadow-sm transition-transform hover:-translate-y-0.5 dark:border-gray-700 ${
                  expandedId === item.id ? 'border-purple-500 ring-2 ring-purple-200 dark:ring-purple-900/40' : 'border-gray-200'
                } ${owned ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'}`}
              >
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <div style={owned ? undefined : { filter: 'grayscale(100%)' }}>
                    <IconDisplay iconKey={item.icon} size={48} className="h-12 w-12 object-contain" />
                  </div>
                  <p className={`text-sm font-semibold leading-tight ${owned ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                    {item.name}
                  </p>
                  {owned ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      Used
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        {expandedItem ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setExpandedId(null)}>
            <div
              className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800"
              onClick={(event) => event.stopPropagation()}
            >
              <ExpandedItemPanel
                item={expandedItem}
                ownership={ownership[expandedItem.id] ?? []}
                onClose={() => setExpandedId(null)}
                onConfirmAdd={() => handleAddToInventory(expandedItem)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TogglePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

interface ExpandedItemPanelProps {
  item: ItemTemplate;
  ownership: Array<{ item: ItemInstance; resource: InventoryResource }>;
  onClose: () => void;
  onConfirmAdd: () => void;
}

function ExpandedItemPanel({
  item,
  ownership,
  onClose,
  onConfirmAdd,
}: ExpandedItemPanelProps) {
  const user = useUserStore((state) => state.user);
  const owned = (user?.lists.inventoryItemTemplates ?? []).some((template) => template.id === item.id);
  const linkedResourceName = ownership
    .map((entry) => entry.resource.name)
    .find((name): name is string => !!name);

  const taskList = item.kind === 'facility'
      ? (FACILITY_TASK_STUBS[item.id] ??
        (item.builtInTasks?.map((task) => humanizeTaskRef(task.taskTemplateRef)) ??
          (item.associatedTaskTemplateRef ? [`${humanizeTaskRef(item.associatedTaskTemplateRef)} (stub)`] : ['No generated tasks yet'])))
    : [];

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gray-50 text-5xl dark:bg-gray-900/40">
            <IconDisplay iconKey={item.icon} size={52} className="h-[52px] w-[52px] object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{item.name}</h4>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {item.kind}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {item.category}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          Close
        </button>
      </div>

      {item.kind === 'facility' ? (
        <div className="mt-4 rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Generated Tasks</p>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{taskList.join(', ')}</p>
        </div>
      ) : null}

      {owned ? (
        <div className="mt-4 rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Used By</p>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
            {linkedResourceName ? linkedResourceName : 'In inventory'}
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        {!owned ? (
          <button
            type="button"
            onClick={onConfirmAdd}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Add to Inventory
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              In Inventory
            </span>
            <span className="inline-flex rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              Go to resource to view item
            </span>
          </div>
        )}
      </div>
    </>
  );
}
