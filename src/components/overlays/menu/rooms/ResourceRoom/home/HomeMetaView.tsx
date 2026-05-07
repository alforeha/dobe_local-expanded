// HomeMetaView - read-only display of HomeResource.

import { useMemo } from 'react';
import { normalizeRecurrenceMode, type HomeChore, type HomeResource } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceMetaTabs } from '../shared/ResourceMetaTabs';
import { HomeLayout } from './HomeLayout';

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

  const linkedResources = [
    ...(liveHome.linkedAccountIds ?? []),
    ...(liveHome.linkedDocIds ?? []),
  ]
    .map((id) => allResources[id])
    .filter(isPresent);

  const hasAny =
    !!liveHome.address ||
    memberContacts.length > 0 ||
    linkedResources.length > 0 ||
    (liveHome.stories?.length ?? 0) > 0 ||
    (liveHome.chores?.length ?? 0) > 0 ||
    (liveHome.notes?.length ?? 0) > 0;

  const details = (
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

      {linkedResources.length > 0 && (
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-gray-400">Linked</span>
          <div className="flex flex-wrap gap-1">
            {linkedResources.map((linked) => (
              <span
                key={linked.id}
                className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300"
              >
                <IconDisplay iconKey={linked.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                <span>{linked.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

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

      {liveHome.stories && liveHome.stories.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-gray-400">Layout</span>
            <span className="text-[11px] text-gray-400">
              {liveHome.stories.length} stor{liveHome.stories.length === 1 ? 'y' : 'ies'} - {liveHome.stories.reduce((sum, story) => sum + story.rooms.length, 0)} rooms
            </span>
          </div>
          <HomeLayout stories={liveHome.stories} />
        </div>
      )}
    </div>
  );

  return <ResourceMetaTabs resource={liveHome} details={details} noteLabelWidth="w-16" />;
}
