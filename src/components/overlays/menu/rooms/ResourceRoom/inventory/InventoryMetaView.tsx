import type { InventoryResource } from '../../../../../../types/resource';
import type { Task } from '../../../../../../types/task';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceMetaTabs } from '../shared/ResourceMetaTabs';
import {
  getUserInventoryItemTemplates,
  mergeInventoryItemTemplates,
  resolveInventoryItemTemplate,
} from '../../../../../../utils/inventoryItems';

interface InventoryMetaViewProps {
  resource: InventoryResource;
}

export function InventoryMetaView({ resource }: InventoryMetaViewProps) {
  const scheduleTasks = useScheduleStore((s) => s.tasks) as Record<string, Task>;
  const user = useUserStore((s) => s.user);
  const gtdTaskIds = new Set(user?.lists.gtdList ?? []);
  const itemEntries = mergeInventoryItemTemplates(
    getUserInventoryItemTemplates(user),
    resource.itemTemplates,
  );
  const containerEntries = resource.containers ?? [];

  const lowStockLabels = new Set(
    Object.values(scheduleTasks)
      .filter((task) => task.resourceRef === resource.id && task.completionState === 'pending' && gtdTaskIds.has(task.id))
      .map((task) => (task.resultFields as Record<string, string> | undefined)?.itemName)
      .filter((itemName): itemName is string => Boolean(itemName)),
  );

  const hasAny =
    !!resource.category ||
    !!resource.linkedHomeId ||
    !!resource.linkedRoomId ||
    (resource.notes?.length ?? 0) > 0;

  const details = (
    <div className="mb-1 space-y-3 text-xs text-gray-600 dark:text-gray-300">
      <div className="mb-2 flex items-center gap-2">
        <IconDisplay iconKey={resource.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
        <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{resource.name}</span>
      </div>

      {!hasAny ? (
        <p className="text-xs italic text-gray-400">No details on file.</p>
      ) : null}

      {resource.category && (
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-gray-400">Category</span>
          <span>{resource.category}</span>
        </div>
      )}

      {(resource.linkedHomeId || resource.linkedRoomId) && (
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-gray-400">Linked</span>
          <span>
            {resource.linkedHomeId ? `Home: ${resource.linkedHomeId}` : ''}
            {resource.linkedHomeId && resource.linkedRoomId ? ' · ' : ''}
            {resource.linkedRoomId ? `Room: ${resource.linkedRoomId}` : ''}
          </span>
        </div>
      )}

      <div className="space-y-3">
        <section className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Available Items
            </h4>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {itemEntries.length}
            </span>
          </div>

          {itemEntries.length === 0 ? (
            <p className="text-xs italic text-gray-400">No items added yet.</p>
          ) : (
            <div className="space-y-1.5">
              {itemEntries.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 dark:bg-gray-900/40">
                  {item.icon ? <IconDisplay iconKey={item.icon} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" /> : null}
                  <span className="text-sm text-gray-800 dark:text-gray-100">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
              Containers
            </h4>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {containerEntries.length}
            </span>
          </div>

          {containerEntries.length === 0 ? (
            <p className="text-xs italic text-gray-400">No containers added yet.</p>
          ) : (
            <div className="space-y-1.5">
              {containerEntries.map((container) => {
                const lowItems = container.items.filter((item) => {
                  const itemName = resolveInventoryItemTemplate(item.itemTemplateRef, itemEntries)?.name ?? item.itemTemplateRef;
                  return lowStockLabels.has(itemName) || (item.threshold != null && item.quantity != null && item.quantity <= item.threshold);
                });
                return (
                  <div key={container.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 dark:bg-gray-900/40">
                    {lowItems.length > 0 ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Low stock" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-transparent" />}
                    {container.icon ? <IconDisplay iconKey={container.icon} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" /> : null}
                    <span className={`flex-1 text-sm ${lowItems.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>
                      {container.name}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{container.items.length} item{container.items.length === 1 ? '' : 's'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );

  return <ResourceMetaTabs resource={resource} details={details} />;
}
