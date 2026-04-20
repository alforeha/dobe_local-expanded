import { useEffect, useRef, useState } from 'react';
import type { Resource } from '../../../../../types/resource';
import { isAccount, isContact, isDoc, isHome, isInventory, isVehicle } from '../../../../../types/resource';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { ResourceBlockExpanded } from './ResourceBlockExpanded';
import { IconDisplay } from '../../../../shared/IconDisplay';

interface ResourceBlockProps {
  resource: Resource;
  onEdit: (resource: Resource) => void;
  forceExpanded?: boolean;
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
        if (link.targetKind === 'vehicle') {
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
    // layout / manual: single resource ref (home, vehicle)
    if (resource.linkedResourceRef && resources[resource.linkedResourceRef]) {
      targetIds.add(resource.linkedResourceRef);
    }
    for (const resourceId of resource.linkedResourceRefs ?? []) {
      if (resources[resourceId]) targetIds.add(resourceId);
    }
    // contract: contacts + account
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

export function ResourceBlock({ resource, onEdit, forceExpanded = false }: ResourceBlockProps) {
  const [expanded, setExpanded] = useState(forceExpanded);
  const containerRef = useRef<HTMLDivElement>(null);
  const resources = useResourceStore((state) => state.resources);
  const currentResource = resources[resource.id] ?? resource;
  const contactResource = isContact(currentResource) ? currentResource : null;
  const homeResource = isHome(currentResource) ? currentResource : null;
  const vehicleResource = isVehicle(currentResource) ? currentResource : null;
  const accountResource = isAccount(currentResource) ? currentResource : null;
  const contactGroups = contactResource?.groups ?? [];
  const homeAddress = homeResource?.address ?? '';
  const vehicleMileage = vehicleResource?.mileage ?? null;
  const inventoryResource = isInventory(currentResource) ? currentResource : null;
  const docResource = isDoc(currentResource) ? currentResource : null;
  const accountBalance = accountResource?.balance ?? null;
  const allLinkedTargets = getLinkedTargets(currentResource, resources);
  const linkedIconTargets = allLinkedTargets.slice(0, 4);
  const extraLinkedCount = Math.max(0, allLinkedTargets.length - linkedIconTargets.length);

  useEffect(() => {
    if (!forceExpanded) return;
    const timer = window.setTimeout(() => {
      setExpanded(true);
      containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [forceExpanded]);

  return (
    <div
      ref={containerRef}
      className={`bg-white dark:bg-gray-800 border rounded-xl overflow-hidden ${
        forceExpanded
          ? 'border-purple-300 ring-2 ring-purple-100 dark:border-purple-500 dark:ring-purple-900/40'
          : 'border-gray-100 dark:border-gray-700'
      }`}
    >
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
      >
        {/* Icon */}
        <IconDisplay iconKey={resource.icon} size={20} className="h-5 w-5 shrink-0 object-contain" alt="" />

        {/* Name */}
        <span className="flex-1 text-sm text-gray-800 dark:text-gray-100 truncate min-w-0">
          {resource.name}
        </span>

        {/* Right side: linked resource icons + summary */}
        {linkedIconTargets.length > 0 ? (
          <div className="flex items-center gap-1 shrink-0">
            {linkedIconTargets.map((linked) => (
              <span
                key={linked.id}
                title={linked.name}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 p-1 dark:bg-gray-700"
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center overflow-hidden">
                  <IconDisplay iconKey={linked.icon} size={12} className="block max-h-full max-w-full object-contain leading-none" alt="" />
                </span>
              </span>
            ))}
            {extraLinkedCount > 0 ? (
              <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                +{extraLinkedCount}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Right side: group pills for contacts, address for homes, type badge for others */}
        {contactResource ? (
          <div className="flex items-center gap-1 shrink-0 max-w-[45%] overflow-hidden">
            {contactGroups.slice(0, 3).map((g) => (
              <span
                key={g}
                className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium whitespace-nowrap"
              >
                {g}
              </span>
            ))}
          </div>
        ) : homeResource && homeAddress ? (
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[40%] shrink-0">
            {homeAddress}
          </span>
        ) : vehicleResource && vehicleMileage != null ? (
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
            {vehicleMileage.toLocaleString()} km
          </span>
        ) : accountResource && accountBalance != null && accountBalance !== 0 ? (
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
            ${accountBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : inventoryResource ? null : docResource ? (
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 capitalize">
            {docResource.docType ?? ''}
          </span>
        ) : null}

        {/* Chevron */}
        <span className="text-gray-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <ResourceBlockExpanded
          resource={resource}
          onClose={() => setExpanded(false)}
          onEdit={onEdit}
        />
      )}
    </div>
  );
}
