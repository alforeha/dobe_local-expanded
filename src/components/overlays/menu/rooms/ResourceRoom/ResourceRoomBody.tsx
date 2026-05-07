import { useEffect, useState } from 'react';
import type { Resource } from '../../../../../types/resource';
import { isInventory } from '../../../../../types/resource';
import { ResourceBlock } from './ResourceBlock';
import { InventorySpecialView } from './inventory/InventorySpecialView';

interface ResourceRoomBodyProps {
  resources: Resource[];
  onEdit: (resource: Resource) => void;
  expandedResourceId?: string | null;
  onExpandedChange?: (expandedId: string | null) => void;
}

export function ResourceRoomBody({
  resources,
  onEdit,
  expandedResourceId = null,
  onExpandedChange,
}: ResourceRoomBodyProps) {
  const [expandedId, setExpandedId] = useState<string | null>(expandedResourceId);

  useEffect(() => {
    setExpandedId(expandedResourceId);
  }, [expandedResourceId]);

  useEffect(() => {
    onExpandedChange?.(expandedId);
  }, [expandedId, onExpandedChange]);

  useEffect(() => {
    if (!expandedId) return;
    if (resources.some((resource) => resource.id === expandedId)) return;
    setExpandedId(null);
  }, [expandedId, resources]);

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

  const expandedResource = expandedId
    ? resources.find((resource) => resource.id === expandedId) ?? null
    : null;

  if (expandedResource) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="flex min-h-0 flex-1 overflow-y-auto">
          <ResourceBlock
            key={expandedResource.id}
            resource={expandedResource}
            onEdit={onEdit}
            isExpanded={true}
            onExpand={(id) => setExpandedId(id)}
            onCollapse={() => setExpandedId(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {resources.map((r) => (
        <ResourceBlock
          key={r.id}
          resource={r}
          onEdit={onEdit}
          isExpanded={expandedId === r.id}
          onExpand={(id) => setExpandedId(id)}
          onCollapse={() => setExpandedId(null)}
        />
      ))}
    </div>
  );
}
