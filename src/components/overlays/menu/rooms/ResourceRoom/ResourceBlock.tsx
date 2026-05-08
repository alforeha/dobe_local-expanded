import type { ReactNode } from 'react';
import type { Resource } from '../../../../../types/resource';
import { isAccount, isContact, isDoc, isHome, isInventory, isVehicle } from '../../../../../types/resource';
import { useResourceStore } from '../../../../../stores/useResourceStore';
import { ResourceBlockExpanded } from './ResourceBlockExpanded';
import { IconDisplay } from '../../../../shared/IconDisplay';

interface ResourceBlockProps {
  resource: Resource;
  onEdit: (resource: Resource) => void;
  isExpanded: boolean;
  onExpand: (id: string) => void;
  onCollapse: () => void;
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

export function ResourceBlock({ resource, onEdit, isExpanded, onExpand, onCollapse }: ResourceBlockProps) {
  const resources = useResourceStore((state) => state.resources);
  const currentResource = resources[resource.id] ?? resource;
  const contactResource = isContact(currentResource) ? currentResource : null;
  const homeResource = isHome(currentResource) ? currentResource : null;
  const vehicleResource = isVehicle(currentResource) ? currentResource : null;
  const accountResource = isAccount(currentResource) ? currentResource : null;
  const contactGroups = [
    ...(contactResource?.groups ?? []),
    ...(contactResource?.customGroups ?? []),
  ];
  const getContactGroupLabel = (group: unknown) => {
    if (typeof group === 'string') return group;
    if (group && typeof group === 'object') {
      const maybeLabeledGroup = group as { name?: string; label?: string };
      return maybeLabeledGroup.name ?? maybeLabeledGroup.label ?? '';
    }
    return '';
  };
  const homeAddress = homeResource?.address ?? '';
  const vehicleMileage = vehicleResource?.mileage ?? null;
  const docResource = isDoc(currentResource) ? currentResource : null;
  const accountBalance = accountResource?.balance ?? null;
  const debtPaymentAmount =
    accountResource?.kind === 'debt'
      ? accountResource.accountTasks?.find((task) => task.kind === 'transaction-log')?.anticipatedValue ?? null
      : null;
  const allLinkedTargets = getLinkedTargets(currentResource, resources);
  const linkedIconTargets = allLinkedTargets.slice(0, 4);
  const extraLinkedCount = Math.max(0, allLinkedTargets.length - linkedIconTargets.length);

  let summaryContent: ReactNode = null;
  if (contactResource) {
    summaryContent = (
      <div className="flex items-center gap-1 max-w-full overflow-hidden">
        {contactGroups.slice(0, 3).map((g) => {
          const groupLabel = getContactGroupLabel(g);
          return (
          <span
            key={groupLabel}
            className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium whitespace-nowrap"
          >
            {groupLabel}
          </span>
          );
        })}
        {contactGroups.length > 3 ? (
          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
            +{contactGroups.length - 3}
          </span>
        ) : null}
      </div>
    );
  } else if (homeResource && homeAddress) {
    summaryContent = (
      <span className="truncate">
        {homeAddress}
      </span>
    );
  } else if (vehicleResource && vehicleMileage != null) {
    summaryContent = <span>{vehicleMileage.toLocaleString()} km</span>;
  } else if (
    accountResource &&
    (
      (accountResource.kind === 'debt' && (typeof debtPaymentAmount === 'number' || accountBalance != null))
      || (accountBalance != null && accountBalance !== 0)
    )
  ) {
    const kind = accountResource.kind;
    const amount = accountBalance ?? 0;

    let balanceDisplay = '';
    if (kind === 'debt') {
      const debtDisplayAmount = typeof debtPaymentAmount === 'number' ? debtPaymentAmount : amount;
      balanceDisplay = `- ${Math.round(debtDisplayAmount).toLocaleString()}`;
    } else if (kind === 'bill' || kind === 'subscription') {
      balanceDisplay = `- ${Math.round(amount).toLocaleString()}`;
    } else if (kind === 'income') {
      balanceDisplay = `+ ${Math.round(amount).toLocaleString()}`;
    } else {
      const ticker = accountResource.cryptoTicker?.trim() || '$';
      const unit = accountResource.cryptoUnit;
      if (unit === 'sats') {
        balanceDisplay = `${ticker} ${Math.round(amount).toLocaleString()} SAT`;
      } else {
        balanceDisplay = `${ticker} ${Math.round(amount).toLocaleString()}`;
      }
    }

    summaryContent = (
      <span>
        {balanceDisplay}
      </span>
    );
  } else if (docResource) {
    summaryContent = <span className="capitalize">{docResource.docType ?? ''}</span>;
  }

  return (
    <div
      className={`bg-white dark:bg-gray-800 border rounded-xl overflow-hidden ${
        isExpanded
          ? 'flex min-h-0 flex-1 flex-col'
          : ''
      } ${
        isExpanded
          ? 'border-purple-300 ring-2 ring-purple-100 dark:border-purple-500 dark:ring-purple-900/40'
          : 'border-gray-100 dark:border-gray-700'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (isExpanded) {
            onCollapse();
            return;
          }
          onExpand(resource.id);
        }}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        <div className="flex h-10 w-10 min-h-10 min-w-10 shrink-0 items-center justify-center self-center overflow-visible rounded-lg">
          <IconDisplay iconKey={resource.icon} size={38} className="h-10 w-10 shrink-0 object-contain" alt="" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
              {resource.name}
            </span>
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1 text-xs text-gray-400 dark:text-gray-500">
              {summaryContent}
            </div>

            {linkedIconTargets.length > 0 ? (
              <div className="flex shrink-0 items-center gap-1">
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
          </div>
        </div>
      </button>

      {isExpanded && (
        <>
          <div className="relative w-full">
            <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex -translate-y-1/2 justify-center">
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                ▼
              </span>
            </div>
          </div>

          <ResourceBlockExpanded
            key={currentResource.id}
            resource={currentResource}
            onClose={onCollapse}
            onEdit={onEdit}
          />
        </>
      )}
    </div>
  );
}
