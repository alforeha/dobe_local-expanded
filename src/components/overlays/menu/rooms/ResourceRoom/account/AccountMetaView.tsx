// AccountMetaView - read-only display of AccountResource. W25 / G.

import type { AccountResource, AccountTask, ContactResource, Resource } from '../../../../../../types/resource';
import { isDoc, isInventory, normalizeRecurrenceMode } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';

const CRYPTO_WHOLE_SCALE = 100_000_000;

interface AccountMetaViewProps {
  resource: AccountResource;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBalance(amount: number): string {
  return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCryptoBalance(amount: number, ticker: string | undefined, unit: AccountResource['cryptoUnit']): string {
  if (unit === 'sats') {
    return `${Math.round(amount).toLocaleString()} sats`;
  }
  const wholeValue = (amount / CRYPTO_WHOLE_SCALE).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
  return `${wholeValue} ${ticker?.trim().toUpperCase() || 'CRYPTO'}`;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const RECURRENCE_LABEL: Record<string, string> = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
};

function describeAccountTask(task: AccountTask): string {
  return normalizeRecurrenceMode(task.recurrenceMode) === 'never'
    ? 'Intermittent'
    : (RECURRENCE_LABEL[task.recurrence.frequency] ?? task.recurrence.frequency);
}

function formatPeriod(startDate?: string, endDate?: string): string {
  const start = startDate ? formatDate(startDate) : 'Open';
  const end = endDate ? formatDate(endDate) : 'Open';
  return `${start} -> ${end}`;
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

export function AccountMetaView({ resource }: AccountMetaViewProps) {
  const allResources = useResourceStore((s) => s.resources);
  const allowanceRecipient =
    resource.allowanceContactId && allResources[resource.allowanceContactId]?.type === 'contact'
      ? (allResources[resource.allowanceContactId] as ContactResource)
      : null;
  const pullFromAccountName = resource.pullFromAccountId
    ? allResources[resource.pullFromAccountId]?.name ?? 'Unknown account'
    : null;
  const isCryptoStyleAccount = (resource.kind === 'crypto' || resource.kind === 'bank') && !!resource.cryptoTicker;
  const linkedTargets = getLinkedTargets(resource, allResources);
  const childAccounts = Object.values(allResources).filter(
    (entry): entry is AccountResource =>
      entry.type === 'account' &&
      entry.id !== resource.id &&
      entry.linkedAccountId === resource.id &&
      !linkedTargets.some((target) => target.id === entry.id),
  );
  const linkedResourcePills = [...linkedTargets, ...childAccounts].map((target) => {
    const forwardRelationship =
      resource.links?.find((link) => link.targetResourceId === target.id)?.relationship ?? '';
    const reverseRelationship =
      allResources[target.id]?.links?.find((link) => link.targetResourceId === resource.id)?.relationship ?? '';
    const relationship =
      forwardRelationship ||
      reverseRelationship ||
      (target.type === 'account' && target.linkedAccountId === resource.id ? 'sub-account' : '');

    return {
      key: target.id,
      icon: target.icon,
      name: target.name,
      relationship,
    };
  });
  const hasLinkedResources = linkedResourcePills.length > 0;
  const hasAny =
    !!resource.kind ||
    !!resource.institution ||
    resource.balance != null ||
    !!resource.pullFromAccountId ||
    resource.debtRate != null ||
    resource.debtTerm != null ||
    !!resource.debtStartDate ||
    !!resource.allowanceStartDate ||
    !!resource.allowanceEndDate ||
    !!resource.dueDate ||
    (resource.pendingTransactions?.length ?? 0) > 0 ||
    (resource.accountTasks?.length ?? 0) > 0 ||
    (resource.allowanceTasks?.length ?? 0) > 0 ||
    !!resource.allowanceContactId ||
    hasLinkedResources ||
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

      <div className="flex gap-2">
        <span className="text-gray-400 w-16 shrink-0">Kind</span>
        <span>{capitalise(resource.kind)}</span>
      </div>

      {resource.institution && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Institution</span>
          <span>{resource.institution}</span>
        </div>
      )}

      {resource.balance != null && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Balance</span>
          <span>
            {isCryptoStyleAccount
              ? formatCryptoBalance(resource.balance, resource.cryptoTicker, resource.cryptoUnit)
              : formatBalance(resource.balance)}
          </span>
        </div>
      )}

      {isCryptoStyleAccount && resource.cryptoTicker ? (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Ticker</span>
          <span>{resource.cryptoTicker.trim().toUpperCase()}</span>
        </div>
      ) : null}

      {isCryptoStyleAccount ? (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Unit</span>
          <span>{resource.cryptoUnit === 'sats' ? 'Sats' : 'Whole'}</span>
        </div>
      ) : null}

      {pullFromAccountName && (resource.kind === 'bill' || resource.kind === 'subscription' || resource.kind === 'debt' || resource.kind === 'allowance') ? (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Pulls from</span>
          <span>{pullFromAccountName}</span>
        </div>
      ) : null}

      {resource.kind === 'debt' && resource.debtRate != null ? (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Interest</span>
          <span>{resource.debtRate}% annual</span>
        </div>
      ) : null}

      {resource.kind === 'debt' && resource.debtTerm != null ? (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Term</span>
          <span>{resource.debtTerm} months</span>
        </div>
      ) : null}

      {resource.kind === 'debt' && resource.debtStartDate ? (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Start Date</span>
          <span>{formatDate(resource.debtStartDate)}</span>
        </div>
      ) : null}

      {resource.dueDate && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Due</span>
          <span>{formatDate(resource.dueDate)}</span>
        </div>
      )}

      {(resource.pendingTransactions?.length ?? 0) > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Pending</span>
          <div className="flex flex-col gap-0.5">
            {(resource.pendingTransactions ?? []).map((transaction) => (
              <span key={transaction.id} className="flex items-center gap-1.5">
                <span className="truncate">{transaction.description}</span>
                <span className="text-gray-400">- {transaction.status}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {(resource.accountTasks?.length ?? 0) > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Tasks</span>
          <div className="flex flex-col gap-0.5">
            {(resource.accountTasks ?? []).map((task) => (
              <span key={task.id} className="flex items-center gap-1.5">
                {task.icon ? <IconDisplay iconKey={task.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" /> : null}
                <span>{task.name}</span>
                {task.kind === 'transaction-log' ? (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    Log
                  </span>
                ) : null}
                <span className="text-gray-400">
                  - {describeAccountTask(task)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {resource.kind === 'allowance' && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Recipient</span>
          <div className="flex flex-col gap-0.5">
            <span>{allowanceRecipient ? allowanceRecipient.displayName || allowanceRecipient.name : 'Not selected'}</span>
            <span className="text-[11px] italic text-gray-400">Allowance push available in multi-user.</span>
          </div>
        </div>
      )}

      {resource.kind === 'allowance' && (resource.allowanceStartDate || resource.allowanceEndDate) ? (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Period</span>
          <span>{formatPeriod(resource.allowanceStartDate, resource.allowanceEndDate)}</span>
        </div>
      ) : null}

      {(resource.allowanceTasks?.length ?? 0) > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Allowance</span>
          <div className="flex flex-col gap-0.5">
            {(resource.allowanceTasks ?? []).map((task) => (
              <span key={task.id} className="flex items-center gap-1.5">
                {task.icon ? <IconDisplay iconKey={task.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" /> : null}
                <span>{task.name}</span>
                {task.evidenceRequired ? (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    📷
                  </span>
                ) : null}
                <span className="text-gray-400">
                  - {describeAccountTask(task)}
                </span>
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
                  <span className="ml-1 text-gray-400 dark:text-gray-500">&middot; {pill.relationship}</span>
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
