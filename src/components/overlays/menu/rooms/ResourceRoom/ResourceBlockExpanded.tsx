import { useState, useRef } from 'react';
import type { Resource } from '../../../../../types/resource';
import { isDoc, isInventory } from '../../../../../types/resource';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../stores/useUserStore';
import { IconDisplay } from '../../../../shared/IconDisplay';

import { ContactMetaView } from './contact/ContactMetaView';
import { HomeMetaView } from './home/HomeMetaView';
import { VehicleMetaView } from './vehicle/VehicleMetaView';
import { AccountMetaView } from './account/AccountMetaView';
import { InventoryMetaView } from './inventory/InventoryMetaView';
import { DocMetaView } from './doc/DocMetaView';

interface ResourceBlockExpandedProps {
  resource: Resource;
  onClose: () => void;
  onEdit: (resource: Resource) => void;
}

function daysUntil(isoDate: string): number | null {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const target = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function ResourceBlockExpanded({ resource, onClose, onEdit }: ResourceBlockExpandedProps) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const removeResource = useResourceStore((s) => s.removeResource);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);

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
    const deletedIds = removeResource(resource.id);
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

  // Build GTD status badges
  const badges: { iconKey: string; label: string; color: string }[] = [];

  if (resource.type === 'vehicle') {
    if (resource.insuranceExpiry) {
      const d = daysUntil(resource.insuranceExpiry);
      if (d !== null && d <= 30) {
        badges.push({ iconKey: 'act-defense', label: d <= 0 ? 'Insurance expired!' : `Insurance expires in ${d}d`, color: 'red' });
      }
    }
    if (resource.serviceNextDate) {
      const d = daysUntil(resource.serviceNextDate);
      if (d !== null && d <= 14) {
        badges.push({ iconKey: 'vehicle', label: d <= 0 ? 'Service overdue!' : `Service in ${d}d`, color: 'orange' });
      }
    }
  }

  if (resource.type === 'account') {
    if (resource.dueDate) {
      const d = daysUntil(resource.dueDate);
      if (d !== null && d <= 7) {
        badges.push({ iconKey: 'resource-account', label: d <= 0 ? 'Payment overdue!' : `Payment due in ${d}d`, color: 'red' });
      }
    }
  }

  if (isInventory(resource)) {
    if (resource.items) {
      const inventoryItems = (resource.containers ?? []).flatMap((container) => container.items);
      const lowItems = (inventoryItems.length > 0 ? inventoryItems : resource.items).filter(
        (item) => item.threshold != null && item.quantity != null && item.quantity <= item.threshold,
      );
      if (lowItems.length > 0) {
        badges.push({ iconKey: 'resource-inventory', label: `${lowItems.length} item${lowItems.length > 1 ? 's' : ''} low stock`, color: 'amber' });
      }
    }
  }

  if (isDoc(resource)) {
    if (resource.expiryDate) {
      const d = daysUntil(resource.expiryDate);
      if (d !== null && d <= 30) {
        badges.push({ iconKey: 'resource-doc', label: d <= 0 ? 'Document expired!' : `Expires in ${d}d`, color: 'red' });
      }
    }
  }

  const colorMap: Record<string, string> = {
    amber: 'text-amber-700 bg-amber-50',
    red:   'text-red-700 bg-red-50',
    orange: 'text-orange-700 bg-orange-50',
  };

  let metaView: React.ReactNode = null;
  switch (resource.type) {
    case 'contact':
      metaView = <ContactMetaView resource={resource} />;
      break;
    case 'home':
      metaView = <HomeMetaView resource={resource} />;
      break;
    case 'vehicle':
      metaView = <VehicleMetaView resource={resource} />;
      break;
    case 'account':
      metaView = <AccountMetaView resource={resource} />;
      break;
    case 'inventory':
      metaView = isInventory(resource) ? <InventoryMetaView resource={resource} /> : null;
      break;
    case 'doc':
      metaView = isDoc(resource) ? <DocMetaView resource={resource} /> : null;
      break;
    default:
      metaView = (
        <p className="text-xs text-gray-400 italic mb-2">
          No details yet.
        </p>
      );
  }

  return (
    <div className="px-3 pb-3">
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
        {/* GTD status badges */}
        {badges.length > 0 && (
          <div className="flex flex-col gap-1 mb-2">
            {badges.map((b, i) => (
              <div key={i} className={`flex items-center gap-1.5 text-xs rounded px-2 py-1 ${colorMap[b.color] ?? 'text-gray-600 bg-gray-100'}`}>
                <IconDisplay iconKey={b.iconKey} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Type-specific meta view */}
        {metaView}

        {/* Actions: Edit (all types) + Delete (all types) */}
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
          <button
            type="button"
            onClick={() => onEdit(resource)}
            className="text-xs font-medium text-blue-500 hover:text-blue-600"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className={`text-xs font-medium ml-auto transition-colors ${
              deleteConfirm
                ? 'text-red-600 font-bold'
                : 'text-red-400 hover:text-red-500'
            }`}
          >
            {deleteConfirm ? 'Tap again: delete resource, linked docs, and links' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
