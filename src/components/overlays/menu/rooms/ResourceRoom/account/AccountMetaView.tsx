// AccountMetaView - read-only display of AccountResource. W25 / G.

import type { AccountResource, AccountTask } from '../../../../../../types/resource';
import { normalizeRecurrenceMode } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';
import { ResourceMetaTabs } from '../shared/ResourceMetaTabs';

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

export function AccountMetaView({ resource }: AccountMetaViewProps) {
  const allResources = useResourceStore((s) => s.resources);

  const linkedResources = [
    resource.linkedHomeId,
    resource.linkedContactId,
    resource.linkedAccountId,
  ]
    .filter((id): id is string => !!id)
    .map((id) => allResources[id])
    .filter(Boolean);

  const childAccounts = Object.values(allResources).filter(
    (entry) => entry.type === 'account' && entry.id !== resource.id && entry.linkedAccountId === resource.id,
  );

  const hasLinked = linkedResources.length > 0 || childAccounts.length > 0;
  const hasAny =
    !!resource.kind ||
    !!resource.institution ||
    resource.balance != null ||
    !!resource.dueDate ||
    (resource.pendingTransactions?.length ?? 0) > 0 ||
    (resource.accountTasks?.length ?? 0) > 0 ||
    hasLinked ||
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
          <span>{formatBalance(resource.balance)}</span>
        </div>
      )}

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
                <span className="text-gray-400">
                  - {describeAccountTask(task)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {hasLinked && (
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
            {childAccounts.map((linked) => (
              <span
                key={linked.id}
                className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-xs"
              >
                <IconDisplay iconKey={linked.icon} size={14} className="h-3.5 w-3.5 object-contain" alt="" />
                <span>{linked.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return <ResourceMetaTabs resource={resource} details={details} noteLabelWidth="w-16" />;
}
