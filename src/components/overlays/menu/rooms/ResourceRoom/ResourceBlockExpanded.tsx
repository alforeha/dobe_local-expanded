import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AlbumEntry, HomeResource, Resource } from '../../../../../types/resource';
import { isDoc, isHome, isInventory } from '../../../../../types/resource';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { AlbumEntryEditor } from '../../../../shared/AlbumEntryEditor';
import { AlbumViewer } from '../../../../shared/AlbumViewer';
import { IconDisplay } from '../../../../shared/IconDisplay';

import { ContactMetaView } from './contact/ContactMetaView';
import { HomeMetaView } from './home/HomeMetaView';
import { HomeLayout } from './home/HomeLayout';
import { VehicleMetaView } from './vehicle/VehicleMetaView';
import { VehicleLayout } from './vehicle/VehicleLayout';
import { AccountMetaView } from './account/AccountMetaView';
import { InventoryMetaView } from './inventory/InventoryMetaView';
import { DocMetaView } from './doc/DocMetaView';

interface ResourceBlockExpandedProps {
  resource: Resource;
  onClose: () => void;
  onEdit: (resource: Resource) => void;
}

const OUTSIDE_GROUP_LABEL = 'Outside / General';

function daysUntil(isoDate: string): number | null {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const target = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

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

export function ResourceBlockExpanded({ resource, onClose, onEdit }: ResourceBlockExpandedProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'layout' | 'relationships' | 'album'>('details');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AlbumEntry | null>(null);
  const [isCreatingEntry, setIsCreatingEntry] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resources = useResourceStore((s) => s.resources);
  const removeResource = useResourceStore((s) => s.removeResource);
  const setResource = useResourceStore((s) => s.setResource);
  const updateContactAlbum = useResourceStore((s) => s.updateContactAlbum);
  const updateVehicleAlbum = useResourceStore((s) => s.updateVehicleAlbum);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);

  const currentResource = resources[resource.id] ?? resource;
  const homeResource = currentResource.type === 'home' ? currentResource : null;
  const contactResource = currentResource.type === 'contact' ? currentResource : null;
  const vehicleResource = currentResource.type === 'vehicle' ? currentResource : null;
  const canShowAlbum = Boolean(homeResource || contactResource || vehicleResource);
  const album = homeResource?.album ?? contactResource?.album ?? vehicleResource?.album ?? [];
  const roomNameLookup = useMemo(
    () => (homeResource ? buildRoomNameLookup(homeResource) : new Map<string, string>()),
    [homeResource],
  );

  function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      resetTimer.current = setTimeout(() => {
        setDeleteConfirm(false);
        resetTimer.current = null;
      }, 3000);
      return;
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    const deletedIds = removeResource(currentResource.id);
    if (user) {
      const updatedUser = {
        ...user,
        resources: {
          homes: user.resources.homes.filter((id) => !deletedIds.includes(id)),
          vehicles: user.resources.vehicles.filter((id) => !deletedIds.includes(id)),
          contacts: user.resources.contacts.filter((id) => !deletedIds.includes(id)),
          accounts: user.resources.accounts.filter((id) => !deletedIds.includes(id)),
          inventory: user.resources.inventory.filter((id) => !deletedIds.includes(id)),
          docs: user.resources.docs.filter((id) => !deletedIds.includes(id)),
        },
      };
      setUser(updatedUser);
    }
    onClose();
  }

  function persistAlbum(nextAlbum: AlbumEntry[]) {
    if (homeResource) {
      setResource({
        ...homeResource,
        updatedAt: new Date().toISOString(),
        album: nextAlbum.length > 0 ? nextAlbum : undefined,
      });
      return;
    }

    if (contactResource) {
      updateContactAlbum(contactResource.id, nextAlbum);
      return;
    }

    if (vehicleResource) {
      updateVehicleAlbum(vehicleResource.id, nextAlbum);
    }
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

  const badges: { iconKey: string; label: string; color: string }[] = [];

  if (vehicleResource) {
    if (vehicleResource.insuranceExpiry) {
      const d = daysUntil(vehicleResource.insuranceExpiry);
      if (d !== null && d <= 30) {
        badges.push({ iconKey: 'act-defense', label: d <= 0 ? 'Insurance expired!' : `Insurance expires in ${d}d`, color: 'red' });
      }
    }
    if (vehicleResource.serviceNextDate) {
      const d = daysUntil(vehicleResource.serviceNextDate);
      if (d !== null && d <= 14) {
        badges.push({ iconKey: 'vehicle', label: d <= 0 ? 'Service overdue!' : `Service in ${d}d`, color: 'orange' });
      }
    }
  }

  if (currentResource.type === 'account' && currentResource.dueDate) {
    const d = daysUntil(currentResource.dueDate);
    if (d !== null && d <= 7) {
      badges.push({ iconKey: 'resource-account', label: d <= 0 ? 'Payment overdue!' : `Payment due in ${d}d`, color: 'red' });
    }
  }

  if (isInventory(currentResource) && currentResource.items) {
    const inventoryItems = (currentResource.containers ?? []).flatMap((container) => container.items);
    const lowItems = (inventoryItems.length > 0 ? inventoryItems : currentResource.items).filter(
      (item) => item.threshold != null && item.quantity != null && item.quantity <= item.threshold,
    );
    if (lowItems.length > 0) {
      badges.push({ iconKey: 'resource-inventory', label: `${lowItems.length} item${lowItems.length > 1 ? 's' : ''} low stock`, color: 'amber' });
    }
  }

  if (isDoc(currentResource) && currentResource.expiryDate) {
    const d = daysUntil(currentResource.expiryDate);
    if (d !== null && d <= 30) {
      badges.push({ iconKey: 'resource-doc', label: d <= 0 ? 'Document expired!' : `Expires in ${d}d`, color: 'red' });
    }
  }

  const colorMap: Record<string, string> = {
    amber: 'text-amber-700 bg-amber-50',
    red: 'text-red-700 bg-red-50',
    orange: 'text-orange-700 bg-orange-50',
  };

  let metaView: ReactNode = null;
  switch (currentResource.type) {
    case 'contact':
      metaView = <ContactMetaView resource={currentResource} />;
      break;
    case 'home':
      metaView = <HomeMetaView resource={currentResource} />;
      break;
    case 'vehicle':
      metaView = <VehicleMetaView resource={currentResource} />;
      break;
    case 'account':
      metaView = <AccountMetaView resource={currentResource} />;
      break;
    case 'inventory':
      metaView = isInventory(currentResource) ? <InventoryMetaView resource={currentResource} /> : null;
      break;
    case 'doc':
      metaView = isDoc(currentResource) ? <DocMetaView resource={currentResource} /> : null;
      break;
    default:
      metaView = (
        <p className="mb-2 text-xs italic text-gray-400">
          No details yet.
        </p>
      );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col p-3">
        {badges.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {badges.map((badge) => (
              <div key={`${badge.iconKey}:${badge.label}`} className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${colorMap[badge.color] ?? 'text-gray-600 bg-gray-100'}`}>
                <IconDisplay iconKey={badge.iconKey} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                <span>{badge.label}</span>
              </div>
            ))}
          </div>
        )}

        {canShowAlbum ? (
          <div className="mb-3 flex items-center gap-4 border-b border-gray-200 pb-2 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`pb-1 text-xs font-semibold transition-colors ${
                activeTab === 'details'
                  ? 'border-b-2 border-blue-500 text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Details
            </button>
            {homeResource || vehicleResource ? (
              <button
                type="button"
                onClick={() => setActiveTab('layout')}
                className={`pb-1 text-xs font-semibold transition-colors ${
                  activeTab === 'layout'
                    ? 'border-b-2 border-blue-500 text-gray-900 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Layout
              </button>
            ) : null}
            {contactResource ? (
              <button
                type="button"
                onClick={() => setActiveTab('relationships')}
                className={`pb-1 text-xs font-semibold transition-colors ${
                  activeTab === 'relationships'
                    ? 'border-b-2 border-blue-500 text-gray-900 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                Relationships
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setActiveTab('album')}
              className={`pb-1 text-xs font-semibold transition-colors ${
                activeTab === 'album'
                  ? 'border-b-2 border-blue-500 text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Album
            </button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {activeTab === 'layout' && homeResource ? (
            <HomeLayout stories={homeResource.stories ?? []} homeId={homeResource.id} hideRoomList />
          ) : activeTab === 'layout' && vehicleResource ? (
            <VehicleLayout resource={vehicleResource} displayOnly />
          ) : activeTab === 'album' && canShowAlbum ? (
            <AlbumViewer
              entries={album}
              title={homeResource ? 'Home album' : contactResource ? 'Contact album' : 'Vehicle album'}
              groupBy={isHome(currentResource) ? groupAlbumEntry : undefined}
              onAdd={handleAddEntry}
              onEdit={handleEditEntry}
              onDelete={handleDeleteEntry}
            />
          ) : activeTab === 'relationships' && contactResource ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Contact relationships coming soon
            </div>
          ) : (
            metaView
          )}
        </div>

        <div className="mt-3 flex flex-none items-center gap-3 border-t border-gray-200 pt-2 dark:border-gray-600">
          <button
            type="button"
            onClick={() => onEdit(currentResource)}
            className="text-xs font-medium text-blue-500 hover:text-blue-600"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className={`ml-auto text-xs font-medium transition-colors ${
              deleteConfirm
                ? 'font-bold text-red-600'
                : 'text-red-400 hover:text-red-500'
            }`}
          >
            {deleteConfirm ? 'Tap again: delete resource, linked docs, and links' : 'Delete'}
          </button>
        </div>
      </div>

      {canShowAlbum && (isCreatingEntry || editingEntry) ? (
        <AlbumEntryEditor
          entry={editingEntry ?? undefined}
          onSave={handleSaveEntry}
          onCancel={handleCancelEntry}
        />
      ) : null}
    </div>
  );
}
