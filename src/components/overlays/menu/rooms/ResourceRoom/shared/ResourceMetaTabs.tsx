import type { ReactNode } from 'react';
import type { InventoryResource, Resource, ResourceLink } from '../../../../../../types/resource';
import { isDoc, isInventory } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';

interface ResourceMetaTabsProps {
  resource: Resource;
  details: ReactNode;
  noteLabelWidth?: string;
}

function getVisibleInheritedLinks(resource: Resource, resources: Record<string, Resource>) {
  const directIds = new Set((resource.links ?? []).map((l) => l.targetResourceId));

  // Incoming account links — computed up-front so early-return branches can use it
  const incomingFromAccounts = Object.values(resources)
    .filter((entry) => entry.type === 'account' && entry.id !== resource.id)
    .flatMap((entry) =>
      (entry.links ?? [])
        .filter((link) => link.targetResourceId === resource.id)
        .map((link) => ({
          id: `derived:${entry.id}:${link.id}`,
          targetResourceId: entry.id,
          relationship: link.relationship,
          createdAt: link.createdAt,
          inherited: true,
        })),
    )
    .filter((dl) => !directIds.has(dl.targetResourceId));

  // Helper: incoming doc pills (reused in early-return branches below)
  function incomingDocPills() {
    return Object.values(resources)
      .filter((entry) => isDoc(entry) && entry.id !== resource.id)
      .flatMap((entry) => {
        if (!isDoc(entry)) return [];
        const matches =
          entry.linkedResourceRef === resource.id ||
          (entry.linkedResourceRefs ?? []).includes(resource.id) ||
          (entry.linkedContactIds ?? []).includes(resource.id) ||
          entry.linkedAccountId === resource.id;
        if (!matches) return [];
        return [{
          id: `derived:doc:${entry.id}`,
          targetResourceId: entry.id,
          relationship: entry.docType,
          createdAt: entry.createdAt,
          inherited: true,
        }];
      })
      .filter((dl) => !directIds.has(dl.targetResourceId));
  }

  if (isInventory(resource)) {
    const fromContainers = (resource.containers ?? []).flatMap((container) =>
      (container.links ?? [])
        .filter((link) => link.targetKind === 'vehicle' && Boolean(link.targetResourceId))
        .map((link) => ({
          id: `derived:${container.id}:${link.id}`,
          targetResourceId: link.targetResourceId!,
          relationship: 'location',
          createdAt: link.createdAt,
          inherited: true,
        })),
    ).filter((dl) => !directIds.has(dl.targetResourceId));
    return [...fromContainers, ...incomingFromAccounts, ...incomingDocPills()];
  }

  if (resource.type === 'vehicle') {
    const fromContainers = Object.values(resources)
      .filter((entry): entry is InventoryResource => isInventory(entry) && entry.id !== resource.id)
      .flatMap((inv) =>
        (inv.containers ?? []).flatMap((container) =>
          (container.links ?? [])
            .filter((link) => link.targetKind === 'vehicle' && link.targetResourceId === resource.id)
            .map((link) => ({
              id: `derived:${container.id}:${link.id}`,
              targetResourceId: inv.id,
              displayName: container.name,
              displayIcon: container.icon || undefined,
              relationship: 'location',
              createdAt: link.createdAt,
              inherited: true,
            })),
        ),
      )
      .filter((dl) => !directIds.has(dl.targetResourceId));
    return [...fromContainers, ...incomingFromAccounts, ...incomingDocPills()];
  }

  if (resource.type !== 'contact') return [...incomingFromAccounts, ...incomingDocPills()];

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
          inherited: true,
        })),
    );

  return [...incomingFromContacts, ...incomingFromHomes, ...incomingFromVehicles, ...incomingFromAccounts, ...incomingDocPills()].filter(
    (derivedLink) => !directIds.has(derivedLink.targetResourceId),
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

export function ResourceMetaTabs({ resource, details }: ResourceMetaTabsProps) {
  const resources = useResourceStore((state) => state.resources);
  const currentResource = resources[resource.id] ?? resource;
  const noteCount = currentResource.notes?.length ?? 0;
  const attachmentCount =
    'attachments' in currentResource && Array.isArray(currentResource.attachments)
      ? currentResource.attachments.length
      : 0;
  const incomingInheritedLinks: Array<ResourceLink & { inherited?: boolean; displayName?: string; displayIcon?: string }> = getVisibleInheritedLinks(currentResource, resources);
  const visibleLinks = [
    ...(currentResource.links ?? []).map((link): ResourceLink & { inherited: boolean; displayName?: string; displayIcon?: string } => ({ ...link, inherited: Boolean(link.isMirrored) })),
    ...incomingInheritedLinks,
  ]
    .map((link) => ({ link, target: link.targetResourceId ? resources[link.targetResourceId] : undefined }))
    .filter((entry) => Boolean(entry.target))
    .sort((left, right) =>
      (left.target?.name ?? '').localeCompare(right.target?.name ?? '', undefined, { sensitivity: 'base' }),
    );

  return (
    <div className="space-y-3">
      {details}

      <div className="flex items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <IconDisplay iconKey="text" size={14} className="h-3.5 w-3.5 object-contain" alt="" />
          <span>Notes</span>
          <span>{noteCount}</span>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <IconDisplay iconKey="doc" size={14} className="h-3.5 w-3.5 object-contain" alt="" />
          <span>Attachments</span>
          <span>{attachmentCount}</span>
        </div>
      </div>

      <div className="space-y-1">
        {visibleLinks.length === 0 ? (
          <p className="text-xs italic text-gray-400">No links yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleLinks.map(({ link, target }) => (
              <span
                key={link.id}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  link.inherited
                    ? 'bg-gray-50 text-gray-400 opacity-75 dark:bg-gray-800/60 dark:text-gray-500'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                <IconDisplay iconKey={link.displayIcon ?? target?.icon ?? 'doc'} size={12} className="h-3 w-3 object-contain" alt="" />
                <span>{link.displayName ?? target?.name ?? 'Missing resource'}</span>
                <span className="text-gray-400 dark:text-gray-500">{link.relationship}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
