import { useMemo, useState } from 'react';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import type { InventoryResource, Resource } from '../../../../../types';
import { isInventory } from '../../../../../types';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { getUserInventoryItemTemplates, mergeInventoryItemTemplates } from '../../../../../utils/inventoryItems';

interface InventoryListViewProps {
  className?: string;
}

function isInventoryResource(resource: Resource | undefined): resource is InventoryResource {
  return !!resource && isInventory(resource) && Array.isArray(resource.items);
}

export function InventoryListView({ className = '' }: InventoryListViewProps) {
  const user = useUserStore((state) => state.user);
  const inventoryRefs = useUserStore((state) => state.user?.resources.inventory ?? []);
  const resources = useResourceStore((state) => state.resources);
  const [search, setSearch] = useState('');

  const inventoryResources = useMemo(
    () =>
      inventoryRefs
        .map((resourceId) => resources[resourceId])
        .filter((resource): resource is InventoryResource => isInventoryResource(resource)),
    [inventoryRefs, resources],
  );

  const items = useMemo(
    () => mergeInventoryItemTemplates(
      getUserInventoryItemTemplates(user),
      ...inventoryResources.map((resource) => resource.itemTemplates),
    ),
    [inventoryResources, user],
  );

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, search]);

  return (
    <section className={`flex min-h-0 flex-col rounded-3xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/80 ${className}`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search available items..."
          className="min-h-10 w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        />
      </div>

      {visibleItems.length === 0 ? (
        <div className="flex flex-1 items-center">
          <p className="w-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-400">
            Add available inventory items to see them here.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-3">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex min-h-[124px] min-w-[140px] flex-1 basis-[calc(50%-0.375rem)] flex-col rounded-2xl border border-gray-200 bg-gray-50/90 p-2.5 text-left sm:basis-[calc(33.333%-0.5rem)] dark:border-gray-700 dark:bg-gray-800/70">
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <IconDisplay iconKey={item.icon || 'inventory'} size={32} className="h-8 w-8 object-contain" />
                  <p className="w-full text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">
                    {item.name}
                  </p>
                </div>

                <div className="mt-auto pt-1.5">
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                    <span className="truncate">Available Item</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
