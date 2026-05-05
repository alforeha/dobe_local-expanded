// HomeMetaView - read-only display of HomeResource.

import { useMemo, useState } from 'react';
import { normalizeRecurrenceMode, type AlbumEntry, type HomeChore, type HomeResource } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { AlbumViewer } from '../../../../../shared/AlbumViewer';
import { AlbumEntryEditor } from '../../../../../shared/AlbumEntryEditor';
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

const OUTSIDE_GROUP_LABEL = 'Outside / General';

function buildRoomNameLookup(home: HomeResource): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const story of home.stories ?? []) {
    for (const room of story.rooms) {
      lookup.set(room.id, room.name?.trim() || 'Unnamed room');
    }
  }
  for (const room of home.rooms ?? []) {
    lookup.set(room.id, room.name?.trim() || 'Unnamed room');
  }
  return lookup;
}

export function HomeMetaView({ resource }: HomeMetaViewProps) {
  const allResources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const liveHome = (allResources[resource.id] && allResources[resource.id].type === 'home'
    ? (allResources[resource.id] as HomeResource)
    : resource);

  const [activeTab, setActiveTab] = useState<'details' | 'album'>('details');
  const [editingEntry, setEditingEntry] = useState<AlbumEntry | null>(null);
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);

  const roomNameLookup = useMemo(() => buildRoomNameLookup(liveHome), [liveHome]);

  const memberIds = new Set<string>([
    ...(liveHome.members ?? []),
    ...Object.values(allResources)
      .filter((entry) => entry.type === 'contact' && entry.linkedHomeId === liveHome.id)
      .map((entry) => entry.id),
  ]);

  const memberContacts = [...memberIds]
    .map((id) => allResources[id])
    .filter(Boolean);

  const linkedResources = [
    ...(liveHome.linkedAccountIds ?? []),
    ...(liveHome.linkedDocIds ?? []),
  ]
    .map((id) => allResources[id])
    .filter(Boolean);

  const hasAny =
    !!liveHome.address ||
    memberContacts.length > 0 ||
    linkedResources.length > 0 ||
    (liveHome.stories?.length ?? 0) > 0 ||
    (liveHome.chores?.length ?? 0) > 0 ||
    (liveHome.notes?.length ?? 0) > 0;

  const album = liveHome.album ?? [];

  function persistAlbum(nextAlbum: AlbumEntry[]) {
    const now = new Date().toISOString();
    setResource({
      ...liveHome,
      updatedAt: now,
      album: nextAlbum.length > 0 ? nextAlbum : undefined,
    });
  }

  function handleAddEntry() {
    setIsCreatingEntry(true);
    setEditingEntry(null);
  }

  function handleEditEntry(entry: AlbumEntry) {
    setIsCreatingEntry(false);
    setEditingEntry(entry);
  }

  function handleDeleteEntry(entryId: string) {
    persistAlbum(album.filter((entry) => entry.id !== entryId));
  }

  function handleSaveEntry(next: AlbumEntry) {
    if (isCreatingEntry) {
      persistAlbum([...album, next]);
    } else if (editingEntry) {
      persistAlbum(album.map((entry) => (entry.id === next.id ? next : entry)));
    }
    setIsCreatingEntry(false);
    setEditingEntry(null);
  }

  function handleCancelEntry() {
    setIsCreatingEntry(false);
    setEditingEntry(null);
  }

  function groupAlbumEntry(entry: AlbumEntry): string {
    if (!entry.sourceRef) return OUTSIDE_GROUP_LABEL;
    return roomNameLookup.get(entry.sourceRef) ?? OUTSIDE_GROUP_LABEL;
  }

  const tabs = (
    <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => setActiveTab('details')}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
          activeTab === 'details'
            ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
      >
        Details
      </button>
      <button
        type="button"
        onClick={() => setActiveTab('album')}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
          activeTab === 'album'
            ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
      >
        Album
        {album.length > 0 ? (
          <span className="ml-1 text-[10px] font-medium text-gray-400">{album.length}</span>
        ) : null}
      </button>
    </div>
  );

  const detailsContent = (
    <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 mb-1">
      <div className="flex items-center gap-2 mb-2">
        <IconDisplay iconKey={liveHome.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
          {liveHome.name}
        </span>
      </div>

      {!hasAny ? (
        <p className="text-xs text-gray-400 italic">No details on file.</p>
      ) : null}

      {liveHome.address && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Address</span>
          <span>{liveHome.address}</span>
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
      {liveHome.chores && liveHome.chores.length > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Chores</span>
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
            <span className="text-gray-400 w-16 shrink-0">Layout</span>
            <span className="text-[11px] text-gray-400">
              {liveHome.stories.length} stor{liveHome.stories.length === 1 ? 'y' : 'ies'} · {liveHome.stories.reduce((sum, story) => sum + story.rooms.length, 0)} rooms
            </span>
          </div>
          <HomeLayout stories={liveHome.stories} />
        </div>
      )}
    </div>
  );

  const albumContent = (
    <div className="mb-1">
      <AlbumViewer
        entries={album}
        title="Photo album"
        groupBy={groupAlbumEntry}
        onAdd={handleAddEntry}
        onEdit={handleEditEntry}
        onDelete={handleDeleteEntry}
      />
    </div>
  );

  const details = (
    <div className="space-y-3">
      {tabs}
      {activeTab === 'details' ? detailsContent : albumContent}
    </div>
  );

  return (
    <>
      <ResourceMetaTabs resource={liveHome} details={details} noteLabelWidth="w-16" />

      {(isCreatingEntry || editingEntry) ? (
        <AlbumEntryEditor
          entry={editingEntry ?? undefined}
          onSave={handleSaveEntry}
          onCancel={handleCancelEntry}
        />
      ) : null}
    </>
  );
}
