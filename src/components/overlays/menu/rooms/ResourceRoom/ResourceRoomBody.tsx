import type { Resource } from '../../../../../types/resource';
import { isInventory } from '../../../../../types/resource';
import { ResourceBlock } from './ResourceBlock';
import { InventorySpecialView } from './inventory/InventorySpecialView';

interface ResourceRoomBodyProps {
  resources: Resource[];
  onEdit: (resource: Resource) => void;
  expandedResourceId?: string | null;
}

export function ResourceRoomBody({
  resources,
  onEdit,
  expandedResourceId = null,
}: ResourceRoomBodyProps) {
  if (resources.length === 0) {
    return (
      <p className="text-center text-gray-400 text-sm py-10">No resources here yet.</p>
    );
  }

  if (resources.every(isInventory)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 space-y-3">
        {resources.map((resource) => (
          <InventorySpecialView
            key={resource.id}
            resource={resource}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {resources.map((r) => (
        <ResourceBlock key={r.id} resource={r} onEdit={onEdit} forceExpanded={expandedResourceId === r.id} />
      ))}
    </div>
  );
}
