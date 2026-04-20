import { useState } from 'react';
import type { Resource, ResourceType } from '../../../../../../types/resource';
import { getRelationshipOptions } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useSystemStore } from '../../../../../../stores/useSystemStore';
import { ResourceLinkRow } from './ResourceLinkRow';

interface ResourceLinksTabProps {
  resource: Resource;
  linkLabel?: string;
  allowedTargetTypes?: ResourceType[];
  fixedRelationship?: string;
}

function getInheritedIncomingLinks(resource: Resource, resources: Record<string, Resource>) {
  if (resource.type !== 'contact') return [];

  const incomingFromContacts = Object.values(resources)
    .filter((entry) => entry.type === 'contact' && entry.id !== resource.id)
    .flatMap((entry) =>
      (entry.links ?? [])
        .filter((link) => link.targetResourceId === resource.id)
        .map((link) => ({
          id: `derived:${entry.id}:${link.id}`,
          targetResourceId: entry.id,
          relationship: getInverseContactRelationship(link.relationship),
          createdAt: link.createdAt,
          sourceResourceId: entry.id,
          isMirrored: true,
          inherited: true,
        })),
    );

  const incomingFromHomes = Object.values(resources)
    .filter((entry) => entry.type === 'home')
    .flatMap((entry) =>
      (entry.links ?? [])
        .filter(
          (link) =>
            link.targetResourceId === resource.id &&
            link.relationship.trim().toLowerCase() === 'member',
        )
        .map((link) => ({
          id: `derived:${entry.id}:${link.id}`,
          targetResourceId: entry.id,
          relationship: 'member',
          createdAt: link.createdAt,
          sourceResourceId: entry.id,
          isMirrored: true,
          inherited: true,
        })),
    );

  const incomingFromVehicles = Object.values(resources)
    .filter((entry) => entry.type === 'vehicle')
    .flatMap((entry) =>
      (entry.links ?? [])
        .filter((link) => link.targetResourceId === resource.id)
        .map((link) => ({
          id: `derived:${entry.id}:${link.id}`,
          targetResourceId: entry.id,
          relationship: link.relationship,
          createdAt: link.createdAt,
          sourceResourceId: entry.id,
          isMirrored: true,
          inherited: true,
        })),
    );

  return [...incomingFromContacts, ...incomingFromHomes, ...incomingFromVehicles].filter(
    (derivedLink) =>
      !(resource.links ?? []).some((link) => link.targetResourceId === derivedLink.targetResourceId),
  );
}

function getInverseContactRelationship(relationship: string): string {
  switch (relationship.trim().toLowerCase()) {
    case 'parent':
      return 'child';
    case 'child':
      return 'parent';
    case 'sibling':
    case 'spouse':
    case 'partner':
    case 'friend':
    case 'colleague':
    case 'acquaintance':
      return relationship.trim().toLowerCase();
    default:
      return relationship;
  }
}

const TYPE_LABELS: Record<ResourceType, string> = {
  contact: 'Contact',
  home: 'Home',
  vehicle: 'Vehicle',
  account: 'Account',
  inventory: 'Inventory',
  doc: 'Doc',
};

export function ResourceLinksTab({
  resource,
  linkLabel = 'Links',
  allowedTargetTypes,
  fixedRelationship,
}: ResourceLinksTabProps) {
  const resources = useResourceStore((state) => state.resources);
  const addResourceLink = useResourceStore((state) => state.addResourceLink);
  const updateResourceLink = useResourceStore((state) => state.updateResourceLink);
  const removeResourceLink = useResourceStore((state) => state.removeResourceLink);
  const setMenuResourceTarget = useSystemStore((state) => state.setMenuResourceTarget);
  const currentResource = resources[resource.id] ?? resource;

  const [isAdding, setIsAdding] = useState(false);
  const [filterType, setFilterType] = useState<ResourceType | 'all'>('all');
  const allowedTypes = allowedTargetTypes?.length ? allowedTargetTypes : (Object.keys(TYPE_LABELS) as ResourceType[]);
  const singleAllowedType = allowedTypes.length === 1 ? allowedTypes[0] : null;
  const [selectedType, setSelectedType] = useState<ResourceType | ''>(singleAllowedType ?? '');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [relationship, setRelationship] = useState('');
  const directLinkedTargetIds = new Set((currentResource.links ?? []).map((link) => link.targetResourceId));

  const selectableResources = Object.values(resources).filter(
    (entry) =>
      entry.type === selectedType &&
      entry.id !== currentResource.id &&
      allowedTypes.includes(entry.type) &&
      !directLinkedTargetIds.has(entry.id),
  );
  const relationshipOptions = selectedType && selectedTargetId
    ? getRelationshipOptions(currentResource.type, selectedType)
    : [];
  const resolvedRelationship = fixedRelationship?.trim() || relationshipOptions[0] || relationship;
  const shouldHideRelationshipSelector = Boolean(fixedRelationship?.trim()) || relationshipOptions.length <= 1;
  const incomingInheritedLinks = getInheritedIncomingLinks(currentResource, resources);
  const visibleLinks = [
    ...(currentResource.links ?? []).map((link) => ({
      ...link,
      inherited: Boolean(link.isMirrored),
    })),
    ...incomingInheritedLinks,
  ]
    .filter((link) => {
      if (filterType === 'all') return true;
      return resources[link.targetResourceId]?.type === filterType;
    })
    .sort((left, right) => {
      const leftName = resources[left.targetResourceId]?.name ?? '';
      const rightName = resources[right.targetResourceId]?.name ?? '';
      return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
    });

  function resetAddForm() {
    setIsAdding(false);
    setSelectedType(singleAllowedType ?? '');
    setSelectedTargetId('');
    setRelationship('');
  }

  function handleSaveLink() {
    if (!selectedType || !selectedTargetId || !resolvedRelationship) return;
    addResourceLink(currentResource.id, selectedTargetId, resolvedRelationship);
    resetAddForm();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-3">
        {allowedTypes.length > 1 ? (
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Filter</label>
            <select
              value={filterType}
              onChange={(event) => setFilterType(event.target.value as ResourceType | 'all')}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="all">All resource types</option>
              {allowedTypes.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <button
          type="button"
          onClick={() => setIsAdding((current) => !current)}
          className="shrink-0 rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
        >
          {isAdding ? 'Close' : `+ Add ${linkLabel.slice(0, -1) || 'Link'}`}
        </button>
      </div>

      {isAdding ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/70">
          <div className={`grid gap-3 ${singleAllowedType ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {!singleAllowedType ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Resource type</label>
                <select
                  value={selectedType}
                  onChange={(event) => {
                    const nextType = event.target.value as ResourceType | '';
                    setSelectedType(nextType);
                    setSelectedTargetId('');
                    setRelationship(fixedRelationship?.trim() ?? '');
                  }}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                >
                  <option value="">Select a type</option>
                  {allowedTypes.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Resource</label>
              <select
                value={selectedTargetId}
                disabled={!selectedType || selectableResources.length === 0}
                onChange={(event) => {
                  setSelectedTargetId(event.target.value);
                  setRelationship(fixedRelationship?.trim() ?? '');
                }}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none disabled:opacity-40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">
                  {!selectedType ? 'Select a type first' : selectableResources.length === 0 ? 'No resources available' : 'Select a resource'}
                </option>
                {selectableResources.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedType && selectedTargetId && !shouldHideRelationshipSelector ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Relationship</label>
              <select
                value={relationship}
                onChange={(event) => setRelationship(event.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">Select a relationship</option>
                {relationshipOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetAddForm}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveLink}
              disabled={!selectedType || !selectedTargetId || !resolvedRelationship}
              className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
            >
              Save Link
            </button>
          </div>
        </div>
      ) : null}

      {visibleLinks.length === 0 ? (
        <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-800/60">
          <p className="text-xs italic text-gray-400">
            {linkLabel === 'Relationships'
              ? 'No relationships yet. Tap + Add Relationship to connect this contact to others.'
              : 'No linked resources yet. Tap + Add Link to connect this resource to others.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleLinks.map((link) => {
            const targetResource = resources[link.targetResourceId];
            const rowOptions = getRelationshipOptions(
              currentResource.type,
              targetResource?.type ?? 'doc',
            );

            return (
              <ResourceLinkRow
                key={link.id}
                link={link}
                targetResource={targetResource}
                relationshipOptions={rowOptions}
                inherited={link.inherited}
                onNavigate={(target) => setMenuResourceTarget(target.id, target.type)}
                onUpdate={(linkId, nextRelationship) =>
                  updateResourceLink(currentResource.id, linkId, nextRelationship)
                }
                onRemove={(linkId) => removeResourceLink(currentResource.id, linkId)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
