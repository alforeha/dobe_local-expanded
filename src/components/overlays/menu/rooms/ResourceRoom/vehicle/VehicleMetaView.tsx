// VehicleMetaView - read-only display of VehicleResource. W24.

import { isDoc, isInventory, normalizeRecurrenceMode, type Resource, type VehicleMaintenanceTask, type VehicleResource } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { IconDisplay } from '../../../../../shared/IconDisplay';

interface VehicleMetaViewProps {
  resource: VehicleResource;
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const DAY_LABELS: Record<string, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

function formatDayOfMonth(day: number | null | undefined): string {
  if (!day) return 'Day';
  const remainder10 = day % 10;
  const remainder100 = day % 100;
  if (remainder10 === 1 && remainder100 !== 11) return `${day}st`;
  if (remainder10 === 2 && remainder100 !== 12) return `${day}nd`;
  if (remainder10 === 3 && remainder100 !== 13) return `${day}rd`;
  return `${day}th`;
}

function getMaintenanceSummary(task: VehicleMaintenanceTask) {
  if (normalizeRecurrenceMode(task.recurrenceMode) === 'never') return 'On demand';

  const rule = task.recurrence;
  const interval = Math.max(1, rule.interval || 1);

  switch (rule.frequency) {
    case 'daily':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'weekly': {
      const dayLabels = (rule.days ?? []).map((day) => DAY_LABELS[day] ?? day);
      const base = interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
      return dayLabels.length > 0 ? `${base} ${dayLabels.join('/')}` : base;
    }
    case 'monthly':
      return interval === 1
        ? (rule.monthlyDay ? `Monthly ${formatDayOfMonth(rule.monthlyDay)}` : 'Monthly')
        : (rule.monthlyDay ? `Every ${interval} months ${formatDayOfMonth(rule.monthlyDay)}` : `Every ${interval} months`);
    case 'yearly':
      return interval === 1 ? 'Yearly' : `Every ${interval} years`;
    default:
      return 'Recurring';
  }
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

export function VehicleMetaView({ resource }: VehicleMetaViewProps) {
  const allResources = useResourceStore((s) => s.resources);
  const linkedTargets = getLinkedTargets(resource, allResources);
  const linkedResourcePills = linkedTargets.map((target) => {
    const forwardRelationship =
      resource.links?.find((link) => link.targetResourceId === target.id)?.relationship ?? '';
    const reverseRelationship =
      allResources[target.id]?.links?.find((link) => link.targetResourceId === resource.id)?.relationship ?? '';
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
    resource.make ||
    resource.model ||
    resource.year ||
    resource.mileage != null ||
    resource.licensePlate ||
    resource.insuranceExpiry ||
    resource.serviceNextDate ||
    (resource.maintenanceTasks?.length ?? 0) > 0 ||
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

      {resource.make && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Make</span>
          <span>{resource.make}</span>
        </div>
      )}
      {resource.model && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Model</span>
          <span>{resource.model}</span>
        </div>
      )}
      {resource.year != null && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Year</span>
          <span>{resource.year}</span>
        </div>
      )}
      {resource.licensePlate && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Plate</span>
          <span>{resource.licensePlate}</span>
        </div>
      )}
      {resource.mileage != null && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Mileage</span>
          <span>{resource.mileage.toLocaleString()} km</span>
        </div>
      )}
      {resource.insuranceExpiry && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Insurance</span>
          <span>{formatDate(resource.insuranceExpiry)}</span>
        </div>
      )}
      {resource.serviceNextDate && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Service</span>
          <span>{formatDate(resource.serviceNextDate)}</span>
        </div>
      )}

      {resource.maintenanceTasks && resource.maintenanceTasks.length > 0 && (
        <div className="flex gap-2">
          <span className="text-gray-400 w-16 shrink-0">Tasks</span>
          <div className="flex flex-1 flex-col gap-2">
            {resource.maintenanceTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                  {task.icon ? (
                    <IconDisplay iconKey={task.icon} size={20} className="h-5 w-5 object-contain" alt="" />
                  ) : (
                    <IconDisplay iconKey="resource-tab-vehicles" size={20} className="h-5 w-5 object-contain" alt="Wrench" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="truncate font-semibold text-gray-800 dark:text-gray-100">{task.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{getMaintenanceSummary(task)}</p>
                </div>
              </div>
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
