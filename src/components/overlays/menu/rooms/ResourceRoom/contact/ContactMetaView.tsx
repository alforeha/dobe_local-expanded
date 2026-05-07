// ContactMetaView - read-only display of ContactResource fields.

import type { ContactResource, Resource } from '../../../../../../types/resource';
import { isDoc, isInventory } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';

interface ContactMetaViewProps {
  resource: ContactResource;
}

function daysUntilAnnual(isoDate: string): number | null {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length < 3) return null;
  const thisYear = today.getFullYear();
  const candidate = new Date(`${thisYear}-${parts[1]}-${parts[2]}T00:00:00`);
  if (candidate < today) candidate.setFullYear(thisYear + 1);
  return Math.round((candidate.getTime() - today.getTime()) / 86_400_000);
}

function formatBirthday(isoDate: string): string {
  const date = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function getLinkedTargets(resource: Resource, resources: Record<string, Resource>): Resource[] {
  const targetIds = new Set<string>();

  for (const link of resource.links ?? []) {
    targetIds.add(link.targetResourceId);
  }

  if (resource.type === 'contact') {
    if (resource.linkedHomeId) targetIds.add(resource.linkedHomeId);
    for (const accountId of resource.linkedAccountIds ?? []) {
      targetIds.add(accountId);
    }

    for (const entry of Object.values(resources)) {
      if (entry.id === resource.id) continue;
      for (const link of entry.links ?? []) {
        if (link.targetResourceId === resource.id) {
          targetIds.add(entry.id);
        }
      }
      if (isDoc(entry) && (entry.linkedContactIds ?? []).includes(resource.id)) {
        targetIds.add(entry.id);
      }
    }
  }

  if (resource.type === 'home') {
    for (const accountId of resource.linkedAccountIds ?? []) {
      targetIds.add(accountId);
    }
    for (const docId of resource.linkedDocIds ?? []) {
      targetIds.add(docId);
    }

    for (const entry of Object.values(resources)) {
      if (entry.id === resource.id) continue;
      if (isDoc(entry)) {
        if (entry.linkedResourceRef === resource.id || (entry.linkedResourceRefs ?? []).includes(resource.id)) {
          targetIds.add(entry.id);
        }
      }
      for (const link of entry.links ?? []) {
        if (link.targetResourceId === resource.id) {
          targetIds.add(entry.id);
        }
      }
      if (isInventory(entry)) {
        for (const container of entry.containers ?? []) {
          for (const link of container.links ?? []) {
            if (link.targetKind === 'home-room' && link.targetResourceId === resource.id) {
              targetIds.add(entry.id);
            }
          }
        }
      }
    }
  }

  if (isInventory(resource)) {
    for (const container of resource.containers ?? []) {
      for (const link of container.links ?? []) {
        if (link.targetKind === 'vehicle' && link.targetResourceId) {
          targetIds.add(link.targetResourceId);
        }
      }
    }
  }

  if (resource.type === 'vehicle') {
    for (const entry of Object.values(resources)) {
      if (entry.id === resource.id) continue;
      for (const link of entry.links ?? []) {
        if (link.targetResourceId === resource.id) {
          targetIds.add(entry.id);
        }
      }
      if (isDoc(entry)) {
        if (entry.linkedResourceRef === resource.id || (entry.linkedResourceRefs ?? []).includes(resource.id)) {
          targetIds.add(entry.id);
        }
      }
      if (isInventory(entry)) {
        for (const container of entry.containers ?? []) {
          for (const link of container.links ?? []) {
            if (link.targetKind === 'vehicle' && link.targetResourceId === resource.id) {
              targetIds.add(entry.id);
            }
          }
        }
      }
    }
  }

  if (resource.type === 'account') {
    for (const entry of Object.values(resources)) {
      if (entry.id === resource.id) continue;
      for (const link of entry.links ?? []) {
        if (link.targetResourceId === resource.id) {
          targetIds.add(entry.id);
        }
      }
      if (isDoc(entry) && entry.linkedAccountId === resource.id) {
        targetIds.add(entry.id);
      }
    }
  }

  if (resource.type === 'doc') {
    if (resource.linkedResourceRef && resources[resource.linkedResourceRef]) {
      targetIds.add(resource.linkedResourceRef);
    }
    for (const resourceId of resource.linkedResourceRefs ?? []) {
      if (resources[resourceId]) targetIds.add(resourceId);
    }
    for (const contactId of resource.linkedContactIds ?? []) {
      if (resources[contactId]) targetIds.add(contactId);
    }
    if (resource.linkedAccountId && resources[resource.linkedAccountId]) {
      targetIds.add(resource.linkedAccountId);
    }
  }

  return [...targetIds]
    .map((id) => resources[id])
    .filter((target): target is Resource => Boolean(target));
}

export function ContactMetaView({ resource }: ContactMetaViewProps) {
  const resources = useResourceStore((s) => s.resources);
  const hasGroupBadges = resource.groups.length > 0 || (resource.customGroups?.length ?? 0) > 0;
  const linkedTargets = getLinkedTargets(resource, resources);
  const linkedResourcePills = linkedTargets.map((target) => {
    const forwardRelationship =
      resource.links?.find((l) => l.targetResourceId === target.id)?.relationship ?? '';
    const reverseRelationship =
      resources[target.id]?.links?.find((l) => l.targetResourceId === resource.id)?.relationship ?? '';
    const relationship = forwardRelationship || reverseRelationship;

    return {
      key: target.id,
      icon: target.icon,
      name: target.name,
      relationship,
    };
  });
  const hasLinkedResources = linkedResourcePills.length > 0;

  const hasAny =
    resource.phone ||
    resource.email ||
    resource.birthday ||
    resource.address ||
    linkedTargets.length > 0 ||
    (resource.notes && resource.notes.length > 0);

  const details = (
    <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 mb-1">
      {!hasAny ? (
        <p className="text-xs text-gray-400 italic">No details on file.</p>
      ) : null}
      {hasGroupBadges && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Groups</span>
          <div className="flex flex-wrap gap-1.5">
            {resource.groups.map((group) => (
              <span
                key={group}
                className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium capitalize text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
              >
                {group}
              </span>
            ))}
            {(resource.customGroups ?? []).map((group) => (
              <span
                key={group}
                className="rounded-full border border-emerald-300 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
              >
                {group}
              </span>
            ))}
          </div>
        </div>
      )}
      {resource.phone && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Phone</span>
          <span>{resource.phone}</span>
        </div>
      )}
      {resource.email && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Email</span>
          <span className="truncate">{resource.email}</span>
        </div>
      )}
      {resource.birthday && (
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-16 shrink-0">Birthday</span>
          <span className="flex items-center gap-1.5">
            {formatBirthday(resource.birthday)}
            {(() => {
              const days = daysUntilAnnual(resource.birthday);
              if (days === null) return null;
              if (days === 0) {
                return (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                    Today!
                  </span>
                );
              }
              if (days <= 14) {
                return (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                    in {days}d
                  </span>
                );
              }
              return (
                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400">
                  in {days}d
                </span>
              );
            })()}
          </span>
        </div>
      )}
      {resource.address && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Address</span>
          <span>{resource.address}</span>
        </div>
      )}
      {hasLinkedResources ? (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-2 mb-1">
            Linked Resources
          </p>
          <div className="flex flex-wrap gap-2">
            {linkedResourcePills.map((pill) => (
              <span
                key={pill.key}
                className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              >
                <IconDisplay iconKey={pill.icon} size={12} className="h-3 w-3 object-contain" alt="" />
                <span>{pill.name}</span>
                {pill.relationship ? (
                  <span className="text-gray-400 dark:text-gray-500 ml-1">· {pill.relationship}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  return details;
}
