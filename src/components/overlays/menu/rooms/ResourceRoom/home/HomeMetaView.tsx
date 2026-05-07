// HomeMetaView - read-only display of HomeResource.

import { useMemo } from 'react';
import { isDoc, isInventory, normalizeRecurrenceMode, type HomeChore, type HomeResource, type Resource } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';

interface HomeMetaViewProps {
  resource: HomeResource;
}

const RECURRENCE_LABEL: Record<string, string> = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
};

function getChoreSummary(chore: HomeChore) {
  if (normalizeRecurrenceMode(chore.recurrenceMode) === 'never') return 'Intermittent';
  return RECURRENCE_LABEL[chore.recurrence.frequency] ?? chore.recurrence.frequency;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return Boolean(value);
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

export function HomeMetaView({ resource }: HomeMetaViewProps) {
  const allResources = useResourceStore((s) => s.resources);
  const liveHome = (allResources[resource.id] && allResources[resource.id].type === 'home'
    ? (allResources[resource.id] as HomeResource)
    : resource);

  const memberContacts = useMemo(() => {
    const memberIds = new Set<string>([
      ...(liveHome.members ?? []),
      ...Object.values(allResources)
        .filter((entry) => entry.type === 'contact' && entry.linkedHomeId === liveHome.id)
        .map((entry) => entry.id),
    ]);

    return [...memberIds]
      .map((id) => allResources[id])
      .filter(isPresent);
  }, [allResources, liveHome]);

  const linkedTargets = getLinkedTargets(liveHome, allResources);
  const linkedResourcePills = linkedTargets.map((target) => {
    const forwardRelationship =
      liveHome.links?.find((link) => link.targetResourceId === target.id)?.relationship ?? '';
    const reverseRelationship =
      allResources[target.id]?.links?.find((link) => link.targetResourceId === liveHome.id)?.relationship ?? '';
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
    !!liveHome.address ||
    memberContacts.length > 0 ||
    hasLinkedResources ||
    (liveHome.chores?.length ?? 0) > 0 ||
    (liveHome.notes?.length ?? 0) > 0;

  return (
    <div className="mb-1 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
      <div className="mb-2 flex items-center gap-2">
        <IconDisplay iconKey={liveHome.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
        <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
          {liveHome.name}
        </span>
      </div>

      {!hasAny ? (
        <p className="text-xs italic text-gray-400">No details on file.</p>
      ) : null}

      {liveHome.address && (
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-gray-400">Address</span>
          <span>{liveHome.address}</span>
        </div>
      )}

      {memberContacts.length > 0 && (
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-gray-400">Members</span>
          <div className="flex flex-wrap gap-1">
            {memberContacts.map((contact) => (
              <span
                key={contact.id}
                className="inline-flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300"
              >
                <IconDisplay iconKey={contact.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                <span>{contact.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {hasLinkedResources ? (
        <div>
          <p className="mt-2 mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
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
                  <span className="ml-1 text-gray-400 dark:text-gray-500">· {pill.relationship}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {liveHome.chores && liveHome.chores.length > 0 && (
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-gray-400">Chores</span>
          <div className="flex flex-col gap-0.5">
            {liveHome.chores.map((chore) => (
              <span key={chore.id} className="flex items-center gap-1.5">
                {chore.icon ? <IconDisplay iconKey={chore.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" /> : null}
                <span>{chore.name}</span>
                <span className="text-gray-400">
                  - {getChoreSummary(chore)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
