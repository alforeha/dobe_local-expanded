// HomeMetaView - read-only display of HomeResource.

import { normalizeRecurrenceMode, type HomeChore, type HomeResource } from '../../../../../../types/resource';
import { getItemTemplateByRef } from '../../../../../../coach/ItemLibrary';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceMetaTabs } from '../shared/ResourceMetaTabs';

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

export function HomeMetaView({ resource }: HomeMetaViewProps) {
  const allResources = useResourceStore((s) => s.resources);

  const memberIds = new Set<string>([
    ...(resource.members ?? []),
    ...Object.values(allResources)
      .filter((entry) => entry.type === 'contact' && entry.linkedHomeId === resource.id)
      .map((entry) => entry.id),
  ]);

  const memberContacts = [...memberIds]
    .map((id) => allResources[id])
    .filter(Boolean);

  const linkedResources = [
    ...(resource.linkedAccountIds ?? []),
    ...(resource.linkedDocIds ?? []),
  ]
    .map((id) => allResources[id])
    .filter(Boolean);

  const hasAny =
    !!resource.address ||
    memberContacts.length > 0 ||
    linkedResources.length > 0 ||
    (resource.rooms?.length ?? 0) > 0 ||
    (resource.chores?.length ?? 0) > 0 ||
    (resource.notes?.length ?? 0) > 0;

  const details = (
    <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 mb-1">
      <div className="flex items-center gap-2 mb-2">
        <IconDisplay iconKey={resource.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
          {resource.name}
        </span>
      </div>

      {!hasAny ? (
        <p className="text-xs text-gray-400 italic">No details on file.</p>
      ) : null}

      {resource.address && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Address</span>
          <span>{resource.address}</span>
        </div>
      )}

      {memberContacts.length > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Members</span>
          <div className="flex flex-wrap gap-1">
            {memberContacts.map((contact) => (
              <span
                key={contact!.id}
                className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded text-xs"
              >
                <IconDisplay iconKey={contact!.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                <span>{contact!.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {linkedResources.length > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Linked</span>
          <div className="flex flex-wrap gap-1">
            {linkedResources.map((linked) => (
              <span
                key={linked!.id}
                className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-xs"
              >
                <IconDisplay iconKey={linked!.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                <span>{linked!.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {resource.rooms && resource.rooms.length > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Rooms</span>
          <div className="flex flex-col gap-1">
            {resource.rooms.map((room) => (
              <div key={room.id} className="flex flex-col gap-1 rounded bg-green-50 px-1.5 py-1 dark:bg-green-900/20">
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
                  {room.icon ? <IconDisplay iconKey={room.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" /> : null}
                  <span>{room.name}</span>
                </span>
                {room.containers.length > 0 && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {room.containers.map((container) => `${container.name} (${container.items.map((item) => getItemTemplateByRef(item.itemTemplateRef)?.name ?? item.itemTemplateRef).join(', ') || 'empty'})`).join(' · ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {resource.chores && resource.chores.length > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Chores</span>
          <div className="flex flex-col gap-0.5">
            {resource.chores.map((chore) => (
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

  return <ResourceMetaTabs resource={resource} details={details} noteLabelWidth="w-16" />;
}
